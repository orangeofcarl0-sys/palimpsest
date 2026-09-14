/**
 * G10-M SqliteRuntimeEvolutionStore — append-only RUNTIME evolution process history.
 *
 * It owns ONLY runtime evolution cases (compiled/assessed/authorized/activated/observed).
 * It NEVER owns RuntimeScope structure (the RuntimeScopeStore owns that), Organization,
 * Institution, BoundaryMemory, Campaign, or Dynamics truth. Case identity is DERIVED
 * (`runtimeEvolutionCaseRefOf`); no random durable id.
 */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { canonicalDigest } from "../schema/canonical.js";
import type { RuntimeEvolutionCaseRef, RuntimeEvolutionEventParsers, RuntimeEvolutionEventType } from "./artifacts.js";
import { RUNTIME_EVOLUTION_EVENT_PARSERS, runtimeEvolutionChainDigest } from "./artifacts.js";

export type RuntimeEvolutionStoreErrorKind =
  | "invalid_registration"
  | "already_exists"
  | "unknown_case"
  | "basis_mismatch"
  | "event_conflict"
  | "recovery_required"
  | "candidate_conflict"
  | "malformed_record";

export class RuntimeEvolutionStoreError extends Error {
  constructor(
    readonly kind: RuntimeEvolutionStoreErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "RuntimeEvolutionStoreError";
  }
}

function payloadKey(type: string, payload: unknown): string {
  return canonicalDigest({ domain: "palimpsest.runtime-evolution-event.v1", type, payload });
}

export interface RuntimeEvolutionEvent<T extends RuntimeEvolutionEventType = RuntimeEvolutionEventType> {
  readonly caseRef: RuntimeEvolutionCaseRef;
  readonly seq: number;
  readonly eventId: string;
  readonly type: T;
  readonly payload: unknown;
  readonly chainDigest: string;
}

export interface RuntimeEvolutionAppendRequest {
  readonly eventId: string;
  readonly type: RuntimeEvolutionEventType;
  readonly payload: unknown;
}

export interface RuntimeEvolutionBasis {
  readonly caseRef: RuntimeEvolutionCaseRef;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

export interface RuntimeEvolutionCaseRecord {
  readonly caseRef: RuntimeEvolutionCaseRef;
  readonly proposalDigest: string;
  readonly candidateDigest: string;
  readonly subjectKey: string;
}

export interface RuntimeEvolutionStore {
  openCase(input: { readonly caseRef: RuntimeEvolutionCaseRef; readonly proposalDigest: string; readonly candidateDigest: string; readonly subjectKey: string }): Promise<RuntimeEvolutionEvent>;
  appendAtomic(input: { readonly caseRef: RuntimeEvolutionCaseRef; readonly expectedBasis: RuntimeEvolutionBasis; readonly events: readonly RuntimeEvolutionAppendRequest[] }): Promise<readonly RuntimeEvolutionEvent[]>;
  case(caseRef: RuntimeEvolutionCaseRef): Promise<RuntimeEvolutionCaseRecord | undefined>;
  caseByProposal(proposalDigest: string): Promise<RuntimeEvolutionCaseRecord | undefined>;
  basis(caseRef: RuntimeEvolutionCaseRef): Promise<RuntimeEvolutionBasis | undefined>;
  replay(caseRef: RuntimeEvolutionCaseRef): Promise<readonly RuntimeEvolutionEvent[]>;
  cases(): Promise<readonly RuntimeEvolutionCaseRecord[]>;
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

export class SqliteRuntimeEvolutionStore implements RuntimeEvolutionStore {
  readonly #database: DatabaseSync;
  readonly #selectCase: Statement;
  readonly #selectByProposal: Statement;
  readonly #selectCases: Statement;
  readonly #insertCase: Statement;
  readonly #selectEvents: Statement;
  readonly #insertEvent: Statement;
  readonly #parsers: RuntimeEvolutionEventParsers;

  constructor(databasePath: string, options?: { readonly busyTimeoutMs?: number; readonly eventParsers?: RuntimeEvolutionEventParsers }) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(`PRAGMA busy_timeout = ${options?.busyTimeoutMs ?? 5000}`);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS runtime_evolution_cases (" +
        "case_ref TEXT PRIMARY KEY, proposal_digest TEXT NOT NULL, candidate_digest TEXT NOT NULL, subject_key TEXT NOT NULL, artifact_json TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS runtime_evolution_events (" +
        "case_ref TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, payload_json TEXT NOT NULL, chain_digest TEXT NOT NULL, PRIMARY KEY (case_ref, seq))",
    );
    this.#selectCase = this.#database.prepare("SELECT artifact_json FROM runtime_evolution_cases WHERE case_ref = ?");
    this.#selectByProposal = this.#database.prepare("SELECT artifact_json FROM runtime_evolution_cases WHERE proposal_digest = ? ORDER BY case_ref LIMIT 1");
    this.#selectCases = this.#database.prepare("SELECT artifact_json FROM runtime_evolution_cases ORDER BY case_ref");
    this.#insertCase = this.#database.prepare("INSERT INTO runtime_evolution_cases (case_ref, proposal_digest, candidate_digest, subject_key, artifact_json) VALUES (?, ?, ?, ?, ?)");
    this.#selectEvents = this.#database.prepare("SELECT case_ref, seq, event_id, type, payload_json, chain_digest FROM runtime_evolution_events WHERE case_ref = ? ORDER BY seq");
    this.#insertEvent = this.#database.prepare("INSERT INTO runtime_evolution_events (case_ref, seq, event_id, type, payload_json, chain_digest) VALUES (?, ?, ?, ?, ?, ?)");
    this.#parsers = { ...RUNTIME_EVOLUTION_EVENT_PARSERS, ...(options?.eventParsers ?? {}) };
  }

  #parse(row: EventRow, previous: RuntimeEvolutionEvent | undefined): RuntimeEvolutionEvent {
    const parser = this.#parsers[row.type];
    if (parser === undefined) throw new RuntimeEvolutionStoreError("malformed_record", `runtime evolution event "${row.event_id}" has unknown type "${row.type}"`);
    let payload: unknown;
    try {
      payload = parser(JSON.parse(row.payload_json));
    } catch (error) {
      throw new RuntimeEvolutionStoreError("malformed_record", `runtime evolution event "${row.event_id}" payload is malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const expected = runtimeEvolutionChainDigest({ caseRef: row.case_ref, seq: row.seq, eventId: row.event_id, type: row.type, payload, previousChainDigest: previous?.chainDigest ?? null });
    if (expected !== row.chain_digest) throw new RuntimeEvolutionStoreError("malformed_record", `runtime evolution chain is corrupt at "${row.case_ref}" seq ${row.seq}`);
    return Object.freeze({ caseRef: row.case_ref, seq: row.seq, eventId: row.event_id, type: row.type as RuntimeEvolutionEventType, payload, chainDigest: row.chain_digest });
  }

  #readAll(caseRef: string): RuntimeEvolutionEvent[] {
    const rows = this.#selectEvents.all(caseRef) as unknown as EventRow[];
    const events: RuntimeEvolutionEvent[] = [];
    let previous: RuntimeEvolutionEvent | undefined;
    let expectedSeq = 1;
    for (const row of rows) {
      if (row.seq !== expectedSeq) throw new RuntimeEvolutionStoreError("malformed_record", `case "${caseRef}" event sequence has a gap at ${row.seq}`);
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
      if (error instanceof RuntimeEvolutionStoreError) throw error;
      throw new RuntimeEvolutionStoreError("invalid_registration", `runtime evolution store write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async openCase(input: { readonly caseRef: string; readonly proposalDigest: string; readonly candidateDigest: string; readonly subjectKey: string }): Promise<RuntimeEvolutionEvent> {
    const record: RuntimeEvolutionCaseRecord = Object.freeze({ caseRef: input.caseRef, proposalDigest: input.proposalDigest, candidateDigest: input.candidateDigest, subjectKey: input.subjectKey });
    const opened = { proposalDigest: input.proposalDigest, subjectKey: input.subjectKey };
    const eventId = `rev-${runtimeEvolutionChainDigest({ caseRef: input.caseRef, seq: 1, eventId: "open", type: "RUNTIME_EVOLUTION_CASE_OPENED", payload: opened, previousChainDigest: null }).slice(0, 24)}`;
    return this.#transactional(() => {
      if (this.#selectCase.get(input.caseRef) !== undefined) throw new RuntimeEvolutionStoreError("already_exists", `runtime evolution case "${input.caseRef}" already exists`);
      if (this.#selectByProposal.get(input.proposalDigest) !== undefined) throw new RuntimeEvolutionStoreError("candidate_conflict", "this proposal is already bound to a different runtime candidate");
      this.#insertCase.run(input.caseRef, input.proposalDigest, input.candidateDigest, input.subjectKey, JSON.stringify(record));
      const chainDigest = runtimeEvolutionChainDigest({ caseRef: input.caseRef, seq: 1, eventId, type: "RUNTIME_EVOLUTION_CASE_OPENED", payload: opened, previousChainDigest: null });
      this.#insertEvent.run(input.caseRef, 1, eventId, "RUNTIME_EVOLUTION_CASE_OPENED", JSON.stringify(opened), chainDigest);
      return Object.freeze({ caseRef: input.caseRef, seq: 1, eventId, type: "RUNTIME_EVOLUTION_CASE_OPENED" as const, payload: opened, chainDigest });
    });
  }

  async appendAtomic(input: { readonly caseRef: string; readonly expectedBasis: RuntimeEvolutionBasis; readonly events: readonly RuntimeEvolutionAppendRequest[] }): Promise<readonly RuntimeEvolutionEvent[]> {
    if (input.expectedBasis.caseRef !== input.caseRef) throw new RuntimeEvolutionStoreError("invalid_registration", "expected basis case ref mismatch");
    if (input.events.length === 0) throw new RuntimeEvolutionStoreError("invalid_registration", "appendAtomic requires at least one event");
    const prepared = input.events.map((event) => {
      const parser = this.#parsers[event.type];
      if (parser === undefined) throw new RuntimeEvolutionStoreError("invalid_registration", `unknown runtime evolution event type "${event.type}"`);
      return { eventId: event.eventId, type: event.type, payload: parser(event.payload) };
    });
    const seen = new Set<string>();
    for (const entry of prepared) {
      if (seen.has(entry.eventId)) throw new RuntimeEvolutionStoreError("event_conflict", `duplicate eventId "${entry.eventId}"`);
      seen.add(entry.eventId);
    }
    return this.#transactional(() => {
      if (this.#selectCase.get(input.caseRef) === undefined) throw new RuntimeEvolutionStoreError("unknown_case", `runtime evolution case "${input.caseRef}" does not exist`);
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
      if (conflicting) throw new RuntimeEvolutionStoreError("event_conflict", "a requested eventId already exists with different content");
      if (present === prepared.length) return Object.freeze(prepared.map((entry) => byId.get(entry.eventId)!));
      if (present > 0) throw new RuntimeEvolutionStoreError("recovery_required", "runtime evolution atomic batch is partially present");
      const tail = stored.length === 0 ? undefined : stored[stored.length - 1];
      if ((tail?.seq ?? 0) !== input.expectedBasis.throughSeq || (tail?.chainDigest ?? "") !== input.expectedBasis.chainDigest) {
        throw new RuntimeEvolutionStoreError("basis_mismatch", `case "${input.caseRef}" basis is seq ${tail?.seq ?? 0}, expected ${input.expectedBasis.throughSeq}`);
      }
      const appended: RuntimeEvolutionEvent[] = [];
      let seq = input.expectedBasis.throughSeq;
      let previous = tail?.chainDigest ?? null;
      for (const entry of prepared) {
        seq += 1;
        const chainDigest = runtimeEvolutionChainDigest({ caseRef: input.caseRef, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, previousChainDigest: previous });
        this.#insertEvent.run(input.caseRef, seq, entry.eventId, entry.type, JSON.stringify(entry.payload), chainDigest);
        previous = chainDigest;
        appended.push(Object.freeze({ caseRef: input.caseRef, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, chainDigest }));
      }
      return Object.freeze(appended);
    });
  }

  async case(caseRef: string): Promise<RuntimeEvolutionCaseRecord | undefined> {
    const row = this.#selectCase.get(caseRef) as { artifact_json: string } | undefined;
    if (row === undefined) return undefined;
    try {
      const parsed = JSON.parse(row.artifact_json) as RuntimeEvolutionCaseRecord;
      return Object.freeze({ caseRef: parsed.caseRef, proposalDigest: parsed.proposalDigest, candidateDigest: parsed.candidateDigest, subjectKey: parsed.subjectKey });
    } catch {
      throw new RuntimeEvolutionStoreError("malformed_record", `runtime evolution case "${caseRef}" is malformed`);
    }
  }

  async caseByProposal(proposalDigest: string): Promise<RuntimeEvolutionCaseRecord | undefined> {
    const row = this.#selectByProposal.get(proposalDigest) as { artifact_json: string } | undefined;
    if (row === undefined) return undefined;
    try {
      const parsed = JSON.parse(row.artifact_json) as RuntimeEvolutionCaseRecord;
      return Object.freeze({ caseRef: parsed.caseRef, proposalDigest: parsed.proposalDigest, candidateDigest: parsed.candidateDigest, subjectKey: parsed.subjectKey });
    } catch {
      throw new RuntimeEvolutionStoreError("malformed_record", "runtime evolution case record is malformed");
    }
  }

  async basis(caseRef: string): Promise<RuntimeEvolutionBasis | undefined> {
    if ((await this.case(caseRef)) === undefined) return undefined;
    const events = this.#readAll(caseRef);
    const tail = events.length === 0 ? undefined : events[events.length - 1];
    return Object.freeze({ caseRef, throughSeq: tail?.seq ?? 0, chainDigest: tail?.chainDigest ?? "" });
  }

  async replay(caseRef: string): Promise<readonly RuntimeEvolutionEvent[]> {
    return Object.freeze(this.#readAll(caseRef));
  }

  async cases(): Promise<readonly RuntimeEvolutionCaseRecord[]> {
    const rows = this.#selectCases.all() as unknown as { artifact_json: string }[];
    return Object.freeze(
      rows.map((row) => {
        const parsed = JSON.parse(row.artifact_json) as RuntimeEvolutionCaseRecord;
        return Object.freeze({ caseRef: parsed.caseRef, proposalDigest: parsed.proposalDigest, candidateDigest: parsed.candidateDigest, subjectKey: parsed.subjectKey });
      }),
    );
  }

  close(): void {
    this.#database.close();
  }
}

export function defaultRuntimeEvolutionPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "runtime_evolution.sqlite");
}
