/**
 * G10-J OrganizationEvolutionStore — append-only evolution governance/execution history.
 *
 * It owns ONLY evolution case history (prepared/compiled/assessed/authorized/activated/
 * observed). It NEVER owns Organization, Institution, RuntimeScope, or Dynamics truth.
 * Case identity is DERIVED (`evolutionCaseRefOf`); no random durable id.
 */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { canonicalDigest } from "../schema/canonical.js";
import type { EvolutionEventParsers, EvolutionEventType, EvolutionCaseRef } from "./artifacts.js";
import { EVOLUTION_EVENT_PARSERS, evolutionChainDigest } from "./artifacts.js";

export type EvolutionStoreErrorKind =
  | "invalid_registration"
  | "already_exists"
  | "unknown_case"
  | "basis_mismatch"
  | "event_conflict"
  | "recovery_required"
  | "candidate_conflict"
  | "malformed_record";

export class EvolutionStoreError extends Error {
  constructor(readonly kind: EvolutionStoreErrorKind, message: string) {
    super(message);
    this.name = "EvolutionStoreError";
  }
}

function payloadKey(type: string, payload: unknown): string {
  return canonicalDigest({ domain: "palimpsest.organization-evolution-event.v1", type, payload });
}

export interface EvolutionEvent<T extends EvolutionEventType = EvolutionEventType> {
  readonly caseRef: EvolutionCaseRef;
  readonly seq: number;
  readonly eventId: string;
  readonly type: T;
  readonly payload: unknown;
  readonly chainDigest: string;
}

export interface EvolutionAppendRequest {
  readonly eventId: string;
  readonly type: EvolutionEventType;
  readonly payload: unknown;
}

export interface EvolutionBasis {
  readonly caseRef: EvolutionCaseRef;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

export interface EvolutionCaseRecord {
  readonly caseRef: EvolutionCaseRef;
  readonly proposalDigest: string;
  readonly candidateDigest: string;
  readonly subjectKey: string;
}

export interface OrganizationEvolutionStore {
  openCase(input: { readonly caseRef: EvolutionCaseRef; readonly proposalDigest: string; readonly candidateDigest: string; readonly subjectKey: string }): Promise<EvolutionEvent>;
  appendAtomic(input: { readonly caseRef: EvolutionCaseRef; readonly expectedBasis: EvolutionBasis; readonly events: readonly EvolutionAppendRequest[] }): Promise<readonly EvolutionEvent[]>;
  case(caseRef: EvolutionCaseRef): Promise<EvolutionCaseRecord | undefined>;
  caseByProposal(proposalDigest: string): Promise<EvolutionCaseRecord | undefined>;
  basis(caseRef: EvolutionCaseRef): Promise<EvolutionBasis | undefined>;
  replay(caseRef: EvolutionCaseRef): Promise<readonly EvolutionEvent[]>;
  cases(): Promise<readonly EvolutionCaseRecord[]>;
  close(): void;
}

type Statement = ReturnType<DatabaseSync["prepare"]>;

interface EventRow {
  case_ref: string;
  seq: number;
  event_id: string;
  type: string;
  payload_json: string;
  chain_digest: string;
}

export class SqliteOrganizationEvolutionStore implements OrganizationEvolutionStore {
  readonly #database: DatabaseSync;
  readonly #selectCase: Statement;
  readonly #selectByProposal: Statement;
  readonly #selectCases: Statement;
  readonly #insertCase: Statement;
  readonly #selectEvents: Statement;
  readonly #insertEvent: Statement;
  readonly #parsers: EvolutionEventParsers;

  constructor(databasePath: string, options?: { readonly busyTimeoutMs?: number; readonly eventParsers?: EvolutionEventParsers }) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(`PRAGMA busy_timeout = ${options?.busyTimeoutMs ?? 5000}`);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS evolution_cases (" +
        "case_ref TEXT PRIMARY KEY, proposal_digest TEXT NOT NULL, candidate_digest TEXT NOT NULL, subject_key TEXT NOT NULL, artifact_json TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS evolution_events (" +
        "case_ref TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, payload_json TEXT NOT NULL, chain_digest TEXT NOT NULL, PRIMARY KEY (case_ref, seq))",
    );
    this.#selectCase = this.#database.prepare("SELECT artifact_json FROM evolution_cases WHERE case_ref = ?");
    this.#selectByProposal = this.#database.prepare("SELECT artifact_json FROM evolution_cases WHERE proposal_digest = ? ORDER BY case_ref LIMIT 1");
    this.#selectCases = this.#database.prepare("SELECT artifact_json FROM evolution_cases ORDER BY case_ref");
    this.#insertCase = this.#database.prepare("INSERT INTO evolution_cases (case_ref, proposal_digest, candidate_digest, subject_key, artifact_json) VALUES (?, ?, ?, ?, ?)");
    this.#selectEvents = this.#database.prepare("SELECT case_ref, seq, event_id, type, payload_json, chain_digest FROM evolution_events WHERE case_ref = ? ORDER BY seq");
    this.#insertEvent = this.#database.prepare("INSERT INTO evolution_events (case_ref, seq, event_id, type, payload_json, chain_digest) VALUES (?, ?, ?, ?, ?, ?)");
    this.#parsers = { ...EVOLUTION_EVENT_PARSERS, ...(options?.eventParsers ?? {}) };
  }

  #parse(row: EventRow, previous: EvolutionEvent | undefined): EvolutionEvent {
    const parser = this.#parsers[row.type];
    if (parser === undefined) throw new EvolutionStoreError("malformed_record", `evolution event "${row.event_id}" has unknown type "${row.type}"`);
    let payload: unknown;
    try {
      payload = parser(JSON.parse(row.payload_json));
    } catch (error) {
      throw new EvolutionStoreError("malformed_record", `evolution event "${row.event_id}" payload is malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const expected = evolutionChainDigest({ caseRef: row.case_ref, seq: row.seq, eventId: row.event_id, type: row.type, payload, previousChainDigest: previous?.chainDigest ?? null });
    if (expected !== row.chain_digest) throw new EvolutionStoreError("malformed_record", `evolution chain is corrupt at "${row.case_ref}" seq ${row.seq}`);
    return Object.freeze({ caseRef: row.case_ref, seq: row.seq, eventId: row.event_id, type: row.type as EvolutionEventType, payload, chainDigest: row.chain_digest });
  }

  #readAll(caseRef: string): EvolutionEvent[] {
    const rows = this.#selectEvents.all(caseRef) as unknown as EventRow[];
    const events: EvolutionEvent[] = [];
    let previous: EvolutionEvent | undefined;
    let expectedSeq = 1;
    for (const row of rows) {
      if (row.seq !== expectedSeq) throw new EvolutionStoreError("malformed_record", `case "${caseRef}" event sequence has a gap at ${row.seq}`);
      const event = this.#parse(row, previous);
      events.push(event);
      previous = event;
      expectedSeq += 1;
    }
    return events;
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
      if (error instanceof EvolutionStoreError) throw error;
      throw new EvolutionStoreError("invalid_registration", `evolution store write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async openCase(input: { readonly caseRef: string; readonly proposalDigest: string; readonly candidateDigest: string; readonly subjectKey: string }): Promise<EvolutionEvent> {
    const record: EvolutionCaseRecord = Object.freeze({ caseRef: input.caseRef, proposalDigest: input.proposalDigest, candidateDigest: input.candidateDigest, subjectKey: input.subjectKey });
    const opened = { proposalDigest: input.proposalDigest, subjectKey: input.subjectKey };
    const eventId = `evt-${evolutionChainDigest({ caseRef: input.caseRef, seq: 1, eventId: "open", type: "EVOLUTION_CASE_OPENED", payload: opened, previousChainDigest: null }).slice(0, 24)}`;
    return this.#transactional(() => {
      if (this.#selectCase.get(input.caseRef) !== undefined) throw new EvolutionStoreError("already_exists", `evolution case "${input.caseRef}" already exists`);
      const sameProposal = this.#selectByProposal.get(input.proposalDigest) as { artifact_json: string } | undefined;
      if (sameProposal !== undefined) throw new EvolutionStoreError("candidate_conflict", "this proposal is already bound to a different candidate");
      this.#insertCase.run(input.caseRef, input.proposalDigest, input.candidateDigest, input.subjectKey, JSON.stringify(record));
      const chainDigest = evolutionChainDigest({ caseRef: input.caseRef, seq: 1, eventId, type: "EVOLUTION_CASE_OPENED", payload: opened, previousChainDigest: null });
      this.#insertEvent.run(input.caseRef, 1, eventId, "EVOLUTION_CASE_OPENED", JSON.stringify(opened), chainDigest);
      return Object.freeze({ caseRef: input.caseRef, seq: 1, eventId, type: "EVOLUTION_CASE_OPENED" as const, payload: opened, chainDigest });
    });
  }

  async appendAtomic(input: { readonly caseRef: string; readonly expectedBasis: EvolutionBasis; readonly events: readonly EvolutionAppendRequest[] }): Promise<readonly EvolutionEvent[]> {
    if (input.expectedBasis.caseRef !== input.caseRef) throw new EvolutionStoreError("invalid_registration", "expected basis case ref mismatch");
    if (input.events.length === 0) throw new EvolutionStoreError("invalid_registration", "appendAtomic requires at least one event");
    const prepared = input.events.map((event) => {
      const parser = this.#parsers[event.type];
      if (parser === undefined) throw new EvolutionStoreError("invalid_registration", `unknown evolution event type "${event.type}"`);
      return { eventId: event.eventId, type: event.type, payload: parser(event.payload) };
    });
    const seen = new Set<string>();
    for (const entry of prepared) {
      if (seen.has(entry.eventId)) throw new EvolutionStoreError("event_conflict", `duplicate eventId "${entry.eventId}"`);
      seen.add(entry.eventId);
    }
    return this.#transactional(() => {
      if (this.#selectCase.get(input.caseRef) === undefined) throw new EvolutionStoreError("unknown_case", `evolution case "${input.caseRef}" does not exist`);
      const stored = this.#readAll(input.caseRef);
      const byId = new Map(stored.map((event) => [event.eventId, event]));
      let present = 0;
      let conflicting = false;
      for (const entry of prepared) {
        const row = byId.get(entry.eventId);
        if (row === undefined) continue;
        present += 1;
        if (row.type !== entry.type || payloadKey(row.type, row.payload) !== payloadKey(entry.type, entry.payload)) conflicting = true;
      }
      if (conflicting) throw new EvolutionStoreError("event_conflict", "a requested eventId already exists with different content");
      if (present === prepared.length) return Object.freeze(prepared.map((entry) => byId.get(entry.eventId)!));
      if (present > 0) throw new EvolutionStoreError("recovery_required", "evolution atomic batch is partially present");
      const tail = stored.length === 0 ? undefined : stored[stored.length - 1];
      if ((tail?.seq ?? 0) !== input.expectedBasis.throughSeq || (tail?.chainDigest ?? "") !== input.expectedBasis.chainDigest) {
        throw new EvolutionStoreError("basis_mismatch", `case "${input.caseRef}" basis is seq ${tail?.seq ?? 0}, expected ${input.expectedBasis.throughSeq}`);
      }
      const appended: EvolutionEvent[] = [];
      let seq = input.expectedBasis.throughSeq;
      let previous = tail?.chainDigest ?? null;
      for (const entry of prepared) {
        seq += 1;
        const chainDigest = evolutionChainDigest({ caseRef: input.caseRef, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, previousChainDigest: previous });
        this.#insertEvent.run(input.caseRef, seq, entry.eventId, entry.type, JSON.stringify(entry.payload), chainDigest);
        previous = chainDigest;
        appended.push(Object.freeze({ caseRef: input.caseRef, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, chainDigest }));
      }
      return Object.freeze(appended);
    });
  }

  async case(caseRef: string): Promise<EvolutionCaseRecord | undefined> {
    const row = this.#selectCase.get(caseRef) as { artifact_json: string } | undefined;
    if (row === undefined) return undefined;
    try {
      const parsed = JSON.parse(row.artifact_json) as EvolutionCaseRecord;
      return Object.freeze({ caseRef: parsed.caseRef, proposalDigest: parsed.proposalDigest, candidateDigest: parsed.candidateDigest, subjectKey: parsed.subjectKey });
    } catch {
      throw new EvolutionStoreError("malformed_record", `evolution case "${caseRef}" is malformed`);
    }
  }

  async caseByProposal(proposalDigest: string): Promise<EvolutionCaseRecord | undefined> {
    const row = this.#selectByProposal.get(proposalDigest) as { artifact_json: string } | undefined;
    if (row === undefined) return undefined;
    try {
      const parsed = JSON.parse(row.artifact_json) as EvolutionCaseRecord;
      return Object.freeze({ caseRef: parsed.caseRef, proposalDigest: parsed.proposalDigest, candidateDigest: parsed.candidateDigest, subjectKey: parsed.subjectKey });
    } catch {
      throw new EvolutionStoreError("malformed_record", "evolution case record is malformed");
    }
  }

  async basis(caseRef: string): Promise<EvolutionBasis | undefined> {
    if ((await this.case(caseRef)) === undefined) return undefined;
    const events = this.#readAll(caseRef);
    const tail = events.length === 0 ? undefined : events[events.length - 1];
    return Object.freeze({ caseRef, throughSeq: tail?.seq ?? 0, chainDigest: tail?.chainDigest ?? "" });
  }

  async replay(caseRef: string): Promise<readonly EvolutionEvent[]> {
    return Object.freeze(this.#readAll(caseRef));
  }

  async cases(): Promise<readonly EvolutionCaseRecord[]> {
    const rows = this.#selectCases.all() as unknown as { artifact_json: string }[];
    return Object.freeze(
      rows.map((row) => {
        const parsed = JSON.parse(row.artifact_json) as EvolutionCaseRecord;
        return Object.freeze({ caseRef: parsed.caseRef, proposalDigest: parsed.proposalDigest, candidateDigest: parsed.candidateDigest, subjectKey: parsed.subjectKey });
      }),
    );
  }

  close(): void {
    this.#database.close();
  }
}

export function defaultOrganizationEvolutionPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "organization_evolution.sqlite");
}
