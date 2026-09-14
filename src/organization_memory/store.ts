/**
 * G10-R SqliteOrganizationMemoryStore — the ONE canonical Palimpsest-owned
 * append-only EMPIRICAL observation history, chained PER SCOPE.
 *
 *   Telemetry ≠ SemanticTruth          ExperimentResult ≠ OrganizationTruth
 *   ObservedAssociation ≠ Causation    HistoricalWinner ≠ FutureAuthority
 *   OrganizationMemory ≠ PolicyAuthority   Evaluation ≠ Governance
 *
 * A scope is either an experiment (its `experimentId`) or the reserved
 * `"interventions"` scope. Each scope owns ONE chained event stream: the first
 * event of an experiment scope is its EXPERIMENT_RECORDED definition; the first
 * event of the interventions scope is an INTERVENTION_RECORDED record, and the
 * scope accumulates further intervention observations thereafter.
 *
 * The store owns persistence, envelope/ordering, idempotency, and the chain —
 * never the empirical artifact shapes (artifacts.ts owns those). It owns NO
 * OrganizationDefinition, RuntimeScope, Commitment, BoundaryState, Evidence
 * truth or Authority, and exposes no mutator for them.
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { canonicalDigest } from "../schema/canonical.js";
import type { ExperimentDefinition } from "./artifacts.js";
import {
  omObject,
  parseCorrection,
  parseEvaluation,
  parseExperiment,
  parseIntervention,
  parseRunResult,
  parseScenario,
  parseScenarioFeatureAnnotation,
  parseVariant,
} from "./artifacts.js";

export type OrganizationMemoryStoreErrorKind =
  | "unknown_experiment"
  | "event_conflict"
  | "recovery_required"
  | "basis_mismatch"
  | "malformed_record"
  | "invalid_registration"
  | "database_busy";

export class OrganizationMemoryStoreError extends Error {
  constructor(
    readonly kind: OrganizationMemoryStoreErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "OrganizationMemoryStoreError";
  }
}

/** The reserved scope that owns structural-intervention observations. */
export const INTERVENTIONS_SCOPE_ID = "interventions";

export const ORGANIZATION_MEMORY_CHAIN_DOMAIN = "palimpsest.org-memory.event.v1";
export const ORGANIZATION_MEMORY_EVENT_ID_DOMAIN = "palimpsest.org-memory-event.v1";

export type OrganizationMemoryEventType =
  | "EXPERIMENT_RECORDED"
  | "SCENARIO_RECORDED"
  | "VARIANT_RECORDED"
  | "RUN_RECORDED"
  | "EVALUATION_RECORDED"
  | "CORRECTION_RECORDED"
  | "INTERVENTION_RECORDED"
  | "SCENARIO_ANNOTATED";

export interface OrganizationMemoryEventDraft {
  readonly eventId: string;
  readonly type: OrganizationMemoryEventType;
  readonly payload: unknown;
}

export interface OrganizationMemoryEvent<T extends OrganizationMemoryEventType = OrganizationMemoryEventType> {
  readonly eventId: string;
  readonly seq: number;
  readonly scopeId: string;
  readonly type: T;
  readonly payload: unknown;
  readonly chainDigest: string;
}

/** The FULL append-only scope history basis — the CAS guard for `appendAtomic`. */
export interface OrganizationMemoryBasis {
  readonly scopeId: string;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

export type OrganizationMemoryEventPayloadParser = (payload: unknown) => unknown;
export type OrganizationMemoryEventParsers = Readonly<Record<string, OrganizationMemoryEventPayloadParser>>;

function fail(kind: OrganizationMemoryStoreErrorKind, message: string): never {
  throw new OrganizationMemoryStoreError(kind, message);
}

function payloadKey(type: string, payload: unknown): string {
  return canonicalDigest({ domain: ORGANIZATION_MEMORY_EVENT_ID_DOMAIN, type, payload });
}

/**
 * Wrap an artifact parser in the event-payload envelope: EXACTLY one top-level
 * key is allowed (the artifact name), and it is required. Unknown or missing
 * keys fail closed before anything is written.
 */
function singleKeyParser(key: string, parse: (raw: unknown, what?: string) => unknown): OrganizationMemoryEventPayloadParser {
  return (payload: unknown): unknown => {
    const object = omObject(payload, key);
    const keys = Object.keys(object);
    for (const candidate of keys) {
      if (candidate !== key) fail("invalid_registration", `${key} event payload has unknown field "${candidate}"`);
    }
    if (keys.length !== 1 || !Object.hasOwn(object, key) || object[key] === undefined) {
      fail("invalid_registration", `${key} event payload must carry exactly the "${key}" field`);
    }
    return Object.freeze({ [key]: parse(object[key], key) });
  };
}

/** Strict per-type payload parsers — every persisted artifact is fully validated. */
export const ORGANIZATION_MEMORY_EVENT_PARSERS: OrganizationMemoryEventParsers = Object.freeze({
  EXPERIMENT_RECORDED: singleKeyParser("experiment", parseExperiment),
  SCENARIO_RECORDED: singleKeyParser("scenario", parseScenario),
  VARIANT_RECORDED: singleKeyParser("variant", parseVariant),
  RUN_RECORDED: singleKeyParser("run", parseRunResult),
  EVALUATION_RECORDED: singleKeyParser("evaluation", parseEvaluation),
  CORRECTION_RECORDED: singleKeyParser("correction", parseCorrection),
  INTERVENTION_RECORDED: singleKeyParser("intervention", parseIntervention),
  SCENARIO_ANNOTATED: singleKeyParser("annotation", parseScenarioFeatureAnnotation),
});

export function organizationMemoryChainDigest(input: {
  readonly scopeId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly previousChainDigest: string | null;
}): string {
  return canonicalDigest({
    domain: ORGANIZATION_MEMORY_CHAIN_DOMAIN,
    scopeId: input.scopeId,
    seq: input.seq,
    eventId: input.eventId,
    type: input.type,
    payload: input.payload,
    previous: input.previousChainDigest,
  });
}

/** Deterministic content-addressed event id — replays are naturally idempotent. */
export function organizationMemoryEventIdOf(type: OrganizationMemoryEventType, scopeId: string, payload: unknown): string {
  return `ome-${canonicalDigest({ domain: ORGANIZATION_MEMORY_EVENT_ID_DOMAIN, type, scopeId, payload }).slice(0, 32)}`;
}

export interface OrganizationMemoryStore {
  appendAtomic(input: {
    readonly expectedBasis: OrganizationMemoryBasis;
    readonly events: readonly OrganizationMemoryEventDraft[];
  }): Promise<readonly OrganizationMemoryEvent[]>;
  basis(scopeId: string): Promise<OrganizationMemoryBasis | undefined>;
  replay(scopeId: string): Promise<readonly OrganizationMemoryEvent[]>;
  /** Distinct experiment scope ids (the reserved interventions scope is excluded). */
  experiments(): Promise<readonly string[]>;
  close(): void;
}

type Statement = ReturnType<DatabaseSync["prepare"]>;

interface EventRow {
  scope_id: string;
  seq: number;
  event_id: string;
  type: string;
  payload_json: string;
  chain_digest: string;
}

interface PreparedEntry {
  readonly eventId: string;
  readonly type: OrganizationMemoryEventType;
  readonly payload: unknown;
}

/** A bounded SQLite busy/locked failure — never confused with a semantic conflict. */
function isBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked/i.test(message);
}

export class SqliteOrganizationMemoryStore implements OrganizationMemoryStore {
  readonly #database: DatabaseSync;
  readonly #selectEvents: Statement;
  readonly #selectScopes: Statement;
  readonly #insertEvent: Statement;
  readonly #parsers: OrganizationMemoryEventParsers;

  constructor(databasePath: string, options?: { readonly busyTimeoutMs?: number }) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(`PRAGMA busy_timeout = ${options?.busyTimeoutMs ?? 5000}`);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS organization_memory_events (" +
        "scope_id TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, " +
        "payload_json TEXT NOT NULL, chain_digest TEXT NOT NULL, PRIMARY KEY (scope_id, seq))",
    );
    this.#selectEvents = this.#database.prepare(
      "SELECT scope_id, seq, event_id, type, payload_json, chain_digest FROM organization_memory_events WHERE scope_id = ? ORDER BY seq",
    );
    this.#selectScopes = this.#database.prepare("SELECT DISTINCT scope_id FROM organization_memory_events WHERE scope_id <> ? ORDER BY scope_id");
    this.#insertEvent = this.#database.prepare(
      "INSERT INTO organization_memory_events (scope_id, seq, event_id, type, payload_json, chain_digest) VALUES (?, ?, ?, ?, ?, ?)",
    );
    this.#parsers = ORGANIZATION_MEMORY_EVENT_PARSERS;
  }

  #parse(row: EventRow, previous: OrganizationMemoryEvent | undefined): OrganizationMemoryEvent {
    const parser = this.#parsers[row.type];
    if (parser === undefined) fail("malformed_record", `organization memory event "${row.event_id}" has unknown type "${row.type}"`);
    let payload: unknown;
    try {
      payload = parser(JSON.parse(row.payload_json));
    } catch (error) {
      fail("malformed_record", `organization memory event "${row.event_id}" payload is malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const expected = organizationMemoryChainDigest({
      scopeId: row.scope_id,
      seq: row.seq,
      eventId: row.event_id,
      type: row.type,
      payload,
      previousChainDigest: previous?.chainDigest ?? null,
    });
    if (expected !== row.chain_digest) {
      fail("malformed_record", `organization memory chain is corrupt at "${row.scope_id}" seq ${row.seq}`);
    }
    return Object.freeze({ eventId: row.event_id, seq: row.seq, scopeId: row.scope_id, type: row.type as OrganizationMemoryEventType, payload, chainDigest: row.chain_digest });
  }

  #readAll(scopeId: string): OrganizationMemoryEvent[] {
    const rows = this.#selectEvents.all(scopeId) as unknown as EventRow[];
    const events: OrganizationMemoryEvent[] = [];
    let previous: OrganizationMemoryEvent | undefined;
    let expectedSeq = 1;
    for (const row of rows) {
      if (row.seq !== expectedSeq) fail("malformed_record", `scope "${scopeId}" event sequence has a gap at ${row.seq}`);
      const event = this.#parse(row, previous);
      events.push(event);
      previous = event;
      expectedSeq += 1;
    }
    return events;
  }

  #classify(error: unknown): never {
    if (error instanceof OrganizationMemoryStoreError) throw error;
    if (isBusyError(error)) {
      throw new OrganizationMemoryStoreError("database_busy", `organization memory store write contention (bounded wait exhausted): ${error instanceof Error ? error.message : String(error)}`);
    }
    throw new OrganizationMemoryStoreError("invalid_registration", `organization memory store write failed: ${error instanceof Error ? error.message : String(error)}`);
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
      this.#classify(error);
    }
  }

  async appendAtomic(input: {
    readonly expectedBasis: OrganizationMemoryBasis;
    readonly events: readonly OrganizationMemoryEventDraft[];
  }): Promise<readonly OrganizationMemoryEvent[]> {
    const scopeId = input.expectedBasis.scopeId;
    if (typeof scopeId !== "string" || scopeId.length === 0) fail("invalid_registration", "expected basis scope must be a non-empty string");
    if (input.events.length === 0) fail("invalid_registration", "appendAtomic requires at least one event");
    const prepared: PreparedEntry[] = input.events.map((event) => {
      const parser = this.#parsers[event.type];
      if (parser === undefined) fail("invalid_registration", `unknown organization memory event type "${event.type}"`);
      let payload: unknown;
      try {
        payload = parser(event.payload);
      } catch (error) {
        fail("invalid_registration", `organization memory event "${event.eventId}" payload is invalid: ${error instanceof Error ? error.message : String(error)}`);
      }
      return { eventId: event.eventId, type: event.type, payload };
    });
    const seen = new Set<string>();
    for (const entry of prepared) {
      if (seen.has(entry.eventId)) fail("event_conflict", `duplicate eventId "${entry.eventId}"`);
      seen.add(entry.eventId);
    }
    return this.#transactional(() => {
      const stored = this.#readAll(scopeId);
      const byId = new Map(stored.map((event) => [event.eventId, event]));
      let present = 0;
      let conflicting = false;
      for (const entry of prepared) {
        const row = byId.get(entry.eventId);
        if (row === undefined) continue;
        present += 1;
        if (row.type !== entry.type || payloadKey(row.type, row.payload) !== payloadKey(entry.type, entry.payload)) conflicting = true;
      }
      if (conflicting) fail("event_conflict", "a requested eventId already exists with different content");
      if (present === prepared.length) return Object.freeze(prepared.map((entry) => byId.get(entry.eventId)!));
      if (present > 0) fail("recovery_required", "organization memory atomic batch is partially present");
      const tail = stored[stored.length - 1];
      if ((tail?.seq ?? 0) !== input.expectedBasis.throughSeq || (tail?.chainDigest ?? "") !== input.expectedBasis.chainDigest) {
        fail("basis_mismatch", `scope "${scopeId}" basis is seq ${tail?.seq ?? 0}, expected ${input.expectedBasis.throughSeq}`);
      }

      // Registration rules: a scope definition may ONLY be the first event of an
      // empty chain, and it must match the scope. The interventions scope is the
      // only scope that accumulates INTERVENTION_RECORDED observations.
      const definitionType: OrganizationMemoryEventType = scopeId === INTERVENTIONS_SCOPE_ID ? "INTERVENTION_RECORDED" : "EXPERIMENT_RECORDED";
      const first = prepared[0]!;
      let startIndex = 0;
      if (stored.length === 0) {
        if (first.type !== definitionType) {
          fail(
            "invalid_registration",
            scopeId === INTERVENTIONS_SCOPE_ID
              ? `scope "${scopeId}" must be defined by an INTERVENTION_RECORDED event`
              : `scope "${scopeId}" must be defined by an EXPERIMENT_RECORDED event`,
          );
        }
        if (definitionType === "EXPERIMENT_RECORDED") {
          const experiment = (first.payload as { experiment: ExperimentDefinition }).experiment;
          if (experiment.experimentId !== scopeId) fail("invalid_registration", `basis scope "${scopeId}" does not match the experiment definition "${experiment.experimentId}"`);
        }
        startIndex = 1;
      } else if (first.type === "EXPERIMENT_RECORDED") {
        fail("invalid_registration", "an experiment may only be defined by the first event of an empty scope");
      }
      for (let index = startIndex; index < prepared.length; index += 1) {
        const type = prepared[index]!.type;
        if (type === "EXPERIMENT_RECORDED") fail("invalid_registration", "an experiment may only be defined by the first event of an empty scope");
        if (type === "INTERVENTION_RECORDED" && scopeId !== INTERVENTIONS_SCOPE_ID) {
          fail("invalid_registration", "intervention records belong to the reserved interventions scope");
        }
      }

      const appended: OrganizationMemoryEvent[] = [];
      let seq = input.expectedBasis.throughSeq;
      let previous = tail?.chainDigest ?? null;
      for (const entry of prepared) {
        seq += 1;
        const chainDigest = organizationMemoryChainDigest({ scopeId, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, previousChainDigest: previous });
        this.#insertEvent.run(scopeId, seq, entry.eventId, entry.type, JSON.stringify(entry.payload), chainDigest);
        previous = chainDigest;
        appended.push(Object.freeze({ eventId: entry.eventId, seq, scopeId, type: entry.type, payload: entry.payload, chainDigest }));
      }
      return Object.freeze(appended);
    });
  }

  async basis(scopeId: string): Promise<OrganizationMemoryBasis | undefined> {
    const events = this.#readAll(scopeId);
    const tail = events[events.length - 1];
    if (tail === undefined) return undefined;
    return Object.freeze({ scopeId, throughSeq: tail.seq, chainDigest: tail.chainDigest });
  }

  async replay(scopeId: string): Promise<readonly OrganizationMemoryEvent[]> {
    return Object.freeze(this.#readAll(scopeId));
  }

  async experiments(): Promise<readonly string[]> {
    const rows = this.#selectScopes.all(INTERVENTIONS_SCOPE_ID) as unknown as { scope_id: string }[];
    return Object.freeze(rows.map((row) => row.scope_id));
  }

  close(): void {
    this.#database.close();
  }
}

/** The canonical default organization-memory store path (Palimpsest-owned). */
export function defaultOrganizationMemoryPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "organization_memory.sqlite");
}
