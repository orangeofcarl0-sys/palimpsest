/**
 * G10-N SqliteReasoningCellStore — the ONE canonical Palimpsest-owned reasoning-cell
 * semantic history, chained PER CELL (no global reasoning chain).
 *
 * It owns ONLY: cell definitions, branch metadata, candidate history, verification
 * results, admission decisions, admitted claims, invalidation history, and cell
 * lifecycle. It NEVER owns Evidence bodies, Campaign belief, BoundaryMemory, Work,
 * RuntimeScope, Organization, or effects.
 */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { canonicalDigest } from "../schema/canonical.js";
import type { ReasoningEventParsers, ReasoningEventType } from "./artifacts.js";
import { REASONING_EVENT_PARSERS, parseReasoningCellDefinition, reasoningChainDigest } from "./artifacts.js";

export type ReasoningStoreErrorKind =
  | "invalid_registration"
  | "already_exists"
  | "unknown_cell"
  | "basis_mismatch"
  | "frontier_stale"
  | "event_conflict"
  | "recovery_required"
  | "malformed_record"
  | "cell_closed"
  | "unknown_branch"
  | "branch_closed"
  | "unknown_candidate"
  | "unknown_claim"
  | "unknown_type"
  | "invalid_content"
  | "invalid_dependency"
  | "verification_error"
  | "invalid_policy_result"
  | "not_admitted";

export class ReasoningStoreError extends Error {
  constructor(
    readonly kind: ReasoningStoreErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ReasoningStoreError";
  }
}

function payloadKey(type: string, payload: unknown): string {
  return canonicalDigest({ domain: "palimpsest.reasoning-cell-event.v1", type, payload });
}

export interface ReasoningEvent<T extends ReasoningEventType = ReasoningEventType> {
  readonly cellId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: T;
  readonly payload: unknown;
  readonly chainDigest: string;
}

export interface ReasoningAppendRequest {
  readonly eventId: string;
  readonly type: ReasoningEventType;
  readonly payload: unknown;
}

/** The FULL append-only cell history basis — distinct from a FrontierBasis. */
export interface ReasoningStoreBasis {
  readonly cellId: string;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

export interface ReasoningCellStore {
  openCell(definition: unknown): Promise<ReasoningEvent>;
  appendAtomic(input: { readonly cellId: string; readonly expectedBasis: ReasoningStoreBasis; readonly events: readonly ReasoningAppendRequest[] }): Promise<readonly ReasoningEvent[]>;
  definition(cellId: string): Promise<import("./artifacts.js").ReasoningCellDefinition | undefined>;
  basis(cellId: string): Promise<ReasoningStoreBasis | undefined>;
  exists(cellId: string): Promise<boolean>;
  replay(cellId: string): Promise<readonly ReasoningEvent[]>;
  cells(): Promise<readonly import("./artifacts.js").ReasoningCellDefinition[]>;
  close(): void;
}

type Statement = ReturnType<DatabaseSync["prepare"]>;

interface EventRow {
  cell_id: string;
  seq: number;
  event_id: string;
  type: string;
  payload_json: string;
  chain_digest: string;
}

export class SqliteReasoningCellStore implements ReasoningCellStore {
  readonly #database: DatabaseSync;
  readonly #selectDefinition: Statement;
  readonly #selectDefinitions: Statement;
  readonly #insertDefinition: Statement;
  readonly #selectEvents: Statement;
  readonly #insertEvent: Statement;
  readonly #parsers: ReasoningEventParsers;

  constructor(databasePath: string, options?: { readonly busyTimeoutMs?: number; readonly eventParsers?: ReasoningEventParsers }) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(`PRAGMA busy_timeout = ${options?.busyTimeoutMs ?? 5000}`);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS reasoning_cells (cell_id TEXT PRIMARY KEY, artifact_json TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS reasoning_cell_events (" +
        "cell_id TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, payload_json TEXT NOT NULL, chain_digest TEXT NOT NULL, PRIMARY KEY (cell_id, seq))",
    );
    this.#selectDefinition = this.#database.prepare("SELECT artifact_json FROM reasoning_cells WHERE cell_id = ?");
    this.#selectDefinitions = this.#database.prepare("SELECT artifact_json FROM reasoning_cells ORDER BY cell_id");
    this.#insertDefinition = this.#database.prepare("INSERT INTO reasoning_cells (cell_id, artifact_json) VALUES (?, ?)");
    this.#selectEvents = this.#database.prepare("SELECT cell_id, seq, event_id, type, payload_json, chain_digest FROM reasoning_cell_events WHERE cell_id = ? ORDER BY seq");
    this.#insertEvent = this.#database.prepare("INSERT INTO reasoning_cell_events (cell_id, seq, event_id, type, payload_json, chain_digest) VALUES (?, ?, ?, ?, ?, ?)");
    this.#parsers = { ...REASONING_EVENT_PARSERS, ...(options?.eventParsers ?? {}) };
  }

  #parse(row: EventRow, previous: ReasoningEvent | undefined): ReasoningEvent {
    const parser = this.#parsers[row.type];
    if (parser === undefined) throw new ReasoningStoreError("malformed_record", `reasoning event "${row.event_id}" has unknown type "${row.type}"`);
    let payload: unknown;
    try {
      payload = parser(JSON.parse(row.payload_json));
    } catch (error) {
      throw new ReasoningStoreError("malformed_record", `reasoning event "${row.event_id}" payload is malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const expected = reasoningChainDigest({ cellId: row.cell_id, seq: row.seq, eventId: row.event_id, type: row.type, payload, previousChainDigest: previous?.chainDigest ?? null });
    if (expected !== row.chain_digest) throw new ReasoningStoreError("malformed_record", `reasoning chain is corrupt at "${row.cell_id}" seq ${row.seq}`);
    return Object.freeze({ cellId: row.cell_id, seq: row.seq, eventId: row.event_id, type: row.type as ReasoningEventType, payload, chainDigest: row.chain_digest });
  }

  #readAll(cellId: string): ReasoningEvent[] {
    const rows = this.#selectEvents.all(cellId) as unknown as EventRow[];
    const events: ReasoningEvent[] = [];
    let previous: ReasoningEvent | undefined;
    let expectedSeq = 1;
    for (const row of rows) {
      if (row.seq !== expectedSeq) throw new ReasoningStoreError("malformed_record", `cell "${cellId}" event sequence has a gap at ${row.seq}`);
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
      if (error instanceof ReasoningStoreError) throw error;
      throw new ReasoningStoreError("invalid_registration", `reasoning store write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async openCell(rawDefinition: unknown): Promise<ReasoningEvent> {
    const definition = parseReasoningCellDefinition(JSON.parse(JSON.stringify(rawDefinition)));
    const artifactJson = JSON.stringify(definition);
    return this.#transactional(() => {
      const existing = this.#selectDefinition.get(definition.cellId) as { artifact_json: string } | undefined;
      if (existing !== undefined) {
        if (existing.artifact_json !== artifactJson) throw new ReasoningStoreError("already_exists", `reasoning cell "${definition.cellId}" already exists with different content`);
        return this.#readAll(definition.cellId)[0]!;
      }
      this.#insertDefinition.run(definition.cellId, artifactJson);
      const payload = Object.freeze({ definition });
      const eventId = `rce-${canonicalDigest({ domain: "palimpsest.reasoning-cell-event.v1", type: "REASONING_CELL_OPENED", cellId: definition.cellId, payload }).slice(0, 32)}`;
      const chainDigest = reasoningChainDigest({ cellId: definition.cellId, seq: 1, eventId, type: "REASONING_CELL_OPENED", payload, previousChainDigest: null });
      this.#insertEvent.run(definition.cellId, 1, eventId, "REASONING_CELL_OPENED", JSON.stringify(payload), chainDigest);
      return Object.freeze({ cellId: definition.cellId, seq: 1, eventId, type: "REASONING_CELL_OPENED" as const, payload, chainDigest });
    });
  }

  async appendAtomic(input: { readonly cellId: string; readonly expectedBasis: ReasoningStoreBasis; readonly events: readonly ReasoningAppendRequest[] }): Promise<readonly ReasoningEvent[]> {
    if (input.expectedBasis.cellId !== input.cellId) throw new ReasoningStoreError("invalid_registration", "expected basis cell mismatch");
    if (input.events.length === 0) throw new ReasoningStoreError("invalid_registration", "appendAtomic requires at least one event");
    const prepared = input.events.map((event) => {
      const parser = this.#parsers[event.type];
      if (parser === undefined) throw new ReasoningStoreError("invalid_registration", `unknown reasoning event type "${event.type}"`);
      return { eventId: event.eventId, type: event.type, payload: parser(event.payload) };
    });
    const seen = new Set<string>();
    for (const entry of prepared) {
      if (seen.has(entry.eventId)) throw new ReasoningStoreError("event_conflict", `duplicate eventId "${entry.eventId}"`);
      seen.add(entry.eventId);
    }
    return this.#transactional(() => {
      if (this.#selectDefinition.get(input.cellId) === undefined) throw new ReasoningStoreError("unknown_cell", `reasoning cell "${input.cellId}" does not exist`);
      const stored = this.#readAll(input.cellId);
      const byId = new Map(stored.map((event) => [event.eventId, event]));
      let present = 0;
      let conflicting = false;
      for (const entry of prepared) {
        const row = byId.get(entry.eventId);
        if (row === undefined) continue;
        present += 1;
        if (row.type !== entry.type || payloadKey(row.type, row.payload) !== payloadKey(entry.type, entry.payload)) conflicting = true;
      }
      if (conflicting) throw new ReasoningStoreError("event_conflict", "a requested eventId already exists with different content");
      if (present === prepared.length) return Object.freeze(prepared.map((entry) => byId.get(entry.eventId)!));
      if (present > 0) throw new ReasoningStoreError("recovery_required", "reasoning atomic batch is partially present");
      const tail = stored[stored.length - 1];
      if ((tail?.seq ?? 0) !== input.expectedBasis.throughSeq || (tail?.chainDigest ?? "") !== input.expectedBasis.chainDigest) {
        throw new ReasoningStoreError("basis_mismatch", `cell "${input.cellId}" basis is seq ${tail?.seq ?? 0}, expected ${input.expectedBasis.throughSeq}`);
      }
      const appended: ReasoningEvent[] = [];
      let seq = input.expectedBasis.throughSeq;
      let previous = tail?.chainDigest ?? null;
      for (const entry of prepared) {
        seq += 1;
        const chainDigest = reasoningChainDigest({ cellId: input.cellId, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, previousChainDigest: previous });
        this.#insertEvent.run(input.cellId, seq, entry.eventId, entry.type, JSON.stringify(entry.payload), chainDigest);
        previous = chainDigest;
        appended.push(Object.freeze({ cellId: input.cellId, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, chainDigest }));
      }
      return Object.freeze(appended);
    });
  }

  async definition(cellId: string) {
    const row = this.#selectDefinition.get(cellId) as { artifact_json: string } | undefined;
    if (row === undefined) return undefined;
    try {
      return parseReasoningCellDefinition(JSON.parse(row.artifact_json));
    } catch (error) {
      throw new ReasoningStoreError("malformed_record", `reasoning cell "${cellId}" is malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async basis(cellId: string): Promise<ReasoningStoreBasis | undefined> {
    if ((await this.definition(cellId)) === undefined) return undefined;
    const events = this.#readAll(cellId);
    const tail = events[events.length - 1];
    return Object.freeze({ cellId, throughSeq: tail?.seq ?? 0, chainDigest: tail?.chainDigest ?? "" });
  }

  async exists(cellId: string): Promise<boolean> {
    return this.#selectDefinition.get(cellId) !== undefined;
  }

  async replay(cellId: string): Promise<readonly ReasoningEvent[]> {
    return Object.freeze(this.#readAll(cellId));
  }

  async cells() {
    const rows = this.#selectDefinitions.all() as unknown as { artifact_json: string }[];
    return Object.freeze(
      rows.map((row) => {
        try {
          return parseReasoningCellDefinition(JSON.parse(row.artifact_json));
        } catch (error) {
          throw new ReasoningStoreError("malformed_record", `reasoning store contains a malformed cell record: ${error instanceof Error ? error.message : String(error)}`);
        }
      }),
    );
  }

  close(): void {
    this.#database.close();
  }
}

export function defaultReasoningCellPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "reasoning_cells.sqlite");
}
