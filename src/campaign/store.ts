/**
 * G10-G1 CampaignStore — the ONE canonical Palimpsest-owned Campaign temporal
 * store (§52–§58).
 *
 * It owns: Campaign genesis, commitments, (later) hypothesis/evidence/belief/
 * intervention/watch/lifecycle history, and compiler/admission correlation.
 * It does NOT own: Evidence bodies, Work, Institution, Organization, runtime,
 * or Ordarium effects.
 *
 * Per-Campaign append-only ordering with a chain digest (§53/§55) and an
 * atomic conditional batch (`appendAtomic(expectedBasis, events)`, §56) whose
 * conflict is PER-CAMPAIGN — unrelated Campaigns never produce semantic stale
 * conflicts (§57).
 */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import type {
  CampaignBasisRef,
  CampaignCommitment,
  CampaignDefinition,
  CampaignEventParsers,
  CampaignEventType,
} from "./artifacts.js";
import { CAMPAIGN_EPISTEMIC_EVENT_PARSERS } from "./epistemic.js";
import { CAMPAIGN_INTERVENTION_EVENT_PARSERS } from "./intervention.js";
import {
  CAMPAIGN_COMMITMENT_EVENT_PARSERS,
  campaignBasisRefsEqual,
  campaignChainDigest,
  parseCampaignBasisRef,
  parseCampaignDefinition,
} from "./artifacts.js";

export type CampaignStoreErrorKind =
  | "invalid_registration"
  | "already_exists"
  | "unknown_campaign"
  | "basis_mismatch"
  | "event_conflict"
  | "malformed_record";

export class CampaignStoreError extends Error {
  constructor(
    readonly kind: CampaignStoreErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "CampaignStoreError";
  }
}

export interface CampaignEvent<T extends CampaignEventType = CampaignEventType> {
  readonly campaignId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: T;
  readonly payload: unknown;
  readonly chainDigest: string;
}

export interface CampaignAppendRequest {
  readonly eventId: string;
  readonly type: CampaignEventType;
  readonly payload: unknown;
}

export interface CampaignAtomicAppend {
  readonly expectedBasis: CampaignBasisRef;
  readonly events: readonly CampaignAppendRequest[];
}

export interface CampaignStore {
  /** Explicit genesis: definition + initial commitment as one atomic event. */
  genesis(input: {
    readonly definition: CampaignDefinition;
    readonly initialCommitment: CampaignCommitment;
  }): Promise<CampaignEvent>;
  /** Atomic conditional batch against a per-Campaign basis (§56/§57). */
  appendAtomic(transition: CampaignAtomicAppend): Promise<readonly CampaignEvent[]>;
  definition(campaignId: string): Promise<CampaignDefinition | undefined>;
  basis(campaignId: string): Promise<CampaignBasisRef | undefined>;
  replay(campaignId: string): Promise<readonly CampaignEvent[]>;
  campaigns(): Promise<readonly CampaignDefinition[]>;
  close(): void;
}

type Statement = ReturnType<DatabaseSync["prepare"]>;

interface StoredRow {
  campaign_id: string;
  seq: number;
  event_id: string;
  type: string;
  payload_json: string;
  chain_digest: string;
}

export class SqliteCampaignStore implements CampaignStore {
  readonly #database: DatabaseSync;
  readonly #selectDefinition: Statement;
  readonly #selectDefinitions: Statement;
  readonly #insertDefinition: Statement;
  readonly #selectEvents: Statement;
  readonly #insertEvent: Statement;
  readonly #selectTail: Statement;
  readonly #parsers: CampaignEventParsers;

  constructor(databasePath: string, options?: { readonly busyTimeoutMs?: number; readonly eventParsers?: CampaignEventParsers }) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(`PRAGMA busy_timeout = ${options?.busyTimeoutMs ?? 5000}`);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS campaign_definitions (" +
        "campaign_id TEXT PRIMARY KEY, institution_id TEXT NOT NULL, artifact_json TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS campaign_events (" +
        "campaign_id TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE, " +
        "type TEXT NOT NULL, payload_json TEXT NOT NULL, chain_digest TEXT NOT NULL, " +
        "PRIMARY KEY (campaign_id, seq))",
    );
    this.#selectDefinition = this.#database.prepare(
      "SELECT artifact_json FROM campaign_definitions WHERE campaign_id = ?",
    );
    this.#selectDefinitions = this.#database.prepare(
      "SELECT artifact_json FROM campaign_definitions ORDER BY campaign_id",
    );
    this.#insertDefinition = this.#database.prepare(
      "INSERT INTO campaign_definitions (campaign_id, institution_id, artifact_json) VALUES (?, ?, ?)",
    );
    this.#selectEvents = this.#database.prepare(
      "SELECT campaign_id, seq, event_id, type, payload_json, chain_digest FROM campaign_events WHERE campaign_id = ? ORDER BY seq",
    );
    this.#insertEvent = this.#database.prepare(
      "INSERT INTO campaign_events (campaign_id, seq, event_id, type, payload_json, chain_digest) VALUES (?, ?, ?, ?, ?, ?)",
    );
    this.#selectTail = this.#database.prepare(
      "SELECT campaign_id, seq, event_id, type, payload_json, chain_digest FROM campaign_events WHERE campaign_id = ? ORDER BY seq DESC LIMIT 1",
    );
    this.#parsers = { ...CAMPAIGN_COMMITMENT_EVENT_PARSERS, ...CAMPAIGN_EPISTEMIC_EVENT_PARSERS, ...CAMPAIGN_INTERVENTION_EVENT_PARSERS, ...(options?.eventParsers ?? {}) };
  }

  #parse(row: StoredRow, previous: CampaignEvent | undefined): CampaignEvent {
    const parser = this.#parsers[row.type];
    if (parser === undefined) {
      throw new CampaignStoreError("malformed_record", `campaign event "${row.event_id}" has unknown type "${row.type}"`);
    }
    let payload: unknown;
    try {
      payload = parser(JSON.parse(row.payload_json));
    } catch (error) {
      throw new CampaignStoreError(
        "malformed_record",
        `campaign event "${row.event_id}" payload is malformed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const expected = campaignChainDigest({
      campaignId: row.campaign_id,
      seq: row.seq,
      eventId: row.event_id,
      type: row.type,
      payload,
      previousChainDigest: previous?.chainDigest ?? null,
    });
    if (expected !== row.chain_digest) {
      throw new CampaignStoreError(
        "malformed_record",
        `campaign event chain is corrupt at "${row.campaign_id}" seq ${row.seq}`,
      );
    }
    return Object.freeze({
      campaignId: row.campaign_id,
      seq: row.seq,
      eventId: row.event_id,
      type: row.type as CampaignEventType,
      payload,
      chainDigest: row.chain_digest,
    });
  }

  #tail(campaignId: string): CampaignEvent | undefined {
    const row = this.#selectTail.get(campaignId) as StoredRow | undefined;
    if (row === undefined) return undefined;
    const previousRows = this.#selectEvents.all(campaignId) as unknown as StoredRow[];
    let previous: CampaignEvent | undefined;
    let last: CampaignEvent | undefined;
    for (const entry of previousRows) {
      last = this.#parse(entry, previous);
      previous = last;
    }
    return last;
  }

  #transactional<T>(work: () => T): T {
    try {
      this.#database.exec("BEGIN IMMEDIATE");
      const result = work();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.#database.exec("ROLLBACK");
      } catch {
        // no active transaction
      }
      if (error instanceof CampaignStoreError) throw error;
      throw new CampaignStoreError(
        "invalid_registration",
        `campaign store write failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async genesis(input: {
    readonly definition: CampaignDefinition;
    readonly initialCommitment: CampaignCommitment;
  }): Promise<CampaignEvent> {
    const definition = parseCampaignDefinition(JSON.parse(JSON.stringify(input.definition)));
    if (input.initialCommitment.campaignId !== definition.campaignId) {
      throw new CampaignStoreError("invalid_registration", "initial commitment campaign id mismatch");
    }
    if (this.#parsers.CAMPAIGN_COMMITMENT_OPENED === undefined) {
      throw new CampaignStoreError("invalid_registration", "no commitment parser registered");
    }
    const opened = this.#parsers.CAMPAIGN_COMMITMENT_OPENED({ commitment: input.initialCommitment }) as {
      commitment: CampaignCommitment;
    };
    const eventId = `evt-${campaignChainDigest({
      campaignId: definition.campaignId,
      seq: 1,
      eventId: "genesis",
      type: "CAMPAIGN_COMMITMENT_OPENED",
      payload: opened,
      previousChainDigest: null,
    }).slice(0, 24)}`;
    return this.#transactional(() => {
      const existing = this.#selectDefinition.get(definition.campaignId);
      if (existing !== undefined) {
        throw new CampaignStoreError("already_exists", `campaign "${definition.campaignId}" already exists`);
      }
      this.#insertDefinition.run(definition.campaignId, definition.institutionId, JSON.stringify(definition));
      const chainDigest = campaignChainDigest({
        campaignId: definition.campaignId,
        seq: 1,
        eventId,
        type: "CAMPAIGN_COMMITMENT_OPENED",
        payload: opened,
        previousChainDigest: null,
      });
      this.#insertEvent.run(definition.campaignId, 1, eventId, "CAMPAIGN_COMMITMENT_OPENED", JSON.stringify(opened), chainDigest);
      return Object.freeze({
        campaignId: definition.campaignId,
        seq: 1,
        eventId,
        type: "CAMPAIGN_COMMITMENT_OPENED" as const,
        payload: opened,
        chainDigest,
      });
    });
  }

  async appendAtomic(transition: CampaignAtomicAppend): Promise<readonly CampaignEvent[]> {
    const expected = parseCampaignBasisRef(transition.expectedBasis);
    if (transition.events.length === 0) {
      throw new CampaignStoreError("invalid_registration", "appendAtomic requires at least one event");
    }
    const prepared = transition.events.map((event) => {
      if (typeof event.eventId !== "string" || event.eventId.length === 0) {
        throw new CampaignStoreError("invalid_registration", "eventId must be a non-empty string");
      }
      const parser = this.#parsers[event.type];
      if (parser === undefined) {
        throw new CampaignStoreError("invalid_registration", `unknown campaign event type "${event.type}"`);
      }
      return { eventId: event.eventId, type: event.type, payload: parser(event.payload) };
    });
    const seen = new Set<string>();
    for (const entry of prepared) {
      if (seen.has(entry.eventId)) {
        throw new CampaignStoreError("event_conflict", `duplicate eventId "${entry.eventId}"`);
      }
      seen.add(entry.eventId);
    }
    return this.#transactional(() => {
      const definition = this.#selectDefinition.get(expected.campaignId);
      if (definition === undefined) {
        throw new CampaignStoreError("unknown_campaign", `campaign "${expected.campaignId}" does not exist`);
      }
      const tail = this.#tail(expected.campaignId);
      const currentBasis: CampaignBasisRef = Object.freeze({
        campaignId: expected.campaignId,
        throughSeq: tail?.seq ?? 0,
        chainDigest: tail?.chainDigest ?? "",
      });
      if (!campaignBasisRefsEqual(currentBasis, expected)) {
        throw new CampaignStoreError(
          "basis_mismatch",
          `campaign "${expected.campaignId}" basis is seq ${currentBasis.throughSeq}, expected ${expected.throughSeq}`,
        );
      }
      const appended: CampaignEvent[] = [];
      let seq = currentBasis.throughSeq;
      let previous = tail?.chainDigest ?? null;
      for (const entry of prepared) {
        seq += 1;
        const chainDigest = campaignChainDigest({
          campaignId: expected.campaignId,
          seq,
          eventId: entry.eventId,
          type: entry.type,
          payload: entry.payload,
          previousChainDigest: previous,
        });
        this.#insertEvent.run(expected.campaignId, seq, entry.eventId, entry.type, JSON.stringify(entry.payload), chainDigest);
        previous = chainDigest;
        appended.push(
          Object.freeze({ campaignId: expected.campaignId, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, chainDigest }),
        );
      }
      return Object.freeze(appended);
    });
  }

  async definition(campaignId: string): Promise<CampaignDefinition | undefined> {
    const row = this.#selectDefinition.get(campaignId) as { artifact_json: string } | undefined;
    if (row === undefined) return undefined;
    try {
      return parseCampaignDefinition(JSON.parse(row.artifact_json));
    } catch (error) {
      throw new CampaignStoreError("malformed_record", `campaign definition "${campaignId}" is malformed`);
    }
  }

  async basis(campaignId: string): Promise<CampaignBasisRef | undefined> {
    if ((await this.definition(campaignId)) === undefined) return undefined;
    const tail = this.#tail(campaignId);
    return Object.freeze({ campaignId, throughSeq: tail?.seq ?? 0, chainDigest: tail?.chainDigest ?? "" });
  }

  async replay(campaignId: string): Promise<readonly CampaignEvent[]> {
    const rows = this.#selectEvents.all(campaignId) as unknown as StoredRow[];
    const events: CampaignEvent[] = [];
    let previous: CampaignEvent | undefined;
    let expectedSeq = 1;
    for (const row of rows) {
      if (row.seq !== expectedSeq) {
        throw new CampaignStoreError("malformed_record", `campaign "${campaignId}" event sequence has a gap at ${row.seq}`);
      }
      const event = this.#parse(row, previous);
      events.push(event);
      previous = event;
      expectedSeq += 1;
    }
    return Object.freeze(events);
  }

  async campaigns(): Promise<readonly CampaignDefinition[]> {
    const rows = this.#selectDefinitions.all() as unknown as { artifact_json: string }[];
    return Object.freeze(
      rows.map((row) => {
        try {
          return parseCampaignDefinition(JSON.parse(row.artifact_json));
        } catch {
          throw new CampaignStoreError("malformed_record", "campaign store contains a malformed definition");
        }
      }),
    );
  }

  close(): void {
    this.#database.close();
  }
}

/** The canonical default campaign store path (Palimpsest-owned). */
export function defaultCampaignPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "campaign.sqlite");
}
