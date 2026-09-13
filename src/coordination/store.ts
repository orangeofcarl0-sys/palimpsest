/**
 * G10-E1/F0 CoordinationStore — the ONE canonical Palimpsest-owned append-only
 * coordination/federation history store (E0 §19/§20 decision: dedicated
 * SQLite at `$DSH_HOME/palimpsest/coordination.sqlite`; never the Work
 * EventStore, never Ordarium state — effect authority ≠ coordination
 * semantic ownership).
 *
 * Requirements (§31, hardened by F0 §12–§27):
 *   - append-only semantic history; monotonic per-store `seq`; stable eventId
 *     (caller-supplied; the service derives it deterministically from content,
 *     so replays are natural);
 *   - strict typed payload parser per event type — every persisted artifact is
 *     FULLY validated (exact fields, nested artifacts, stable ids, enum
 *     literals) before any write, never a generic bag (§22–§24); the store
 *     owns persistence/envelope/ordering/idempotency, artifact modules own the
 *     semantic shape (§23);
 *   - duplicate eventId byte-identical → idempotent no-op; different content
 *     → fail closed (no last-write-wins identity drift);
 *   - restart-safe; cross-process concurrency safe (PRIMARY KEY + one writer at
 *     a time via `BEGIN IMMEDIATE` + a bounded busy timeout);
 *   - `appendAtomic` (§13): ONE crash-atomic conditional batch — validate all
 *     events, verify the expected canonical head, allocate one contiguous
 *     sequence range, insert all, commit; any error rolls back the whole
 *     transition. A historical PARTIAL set of a declared-atomic transition is
 *     never silently completed (§18) — it fails closed as recovery-required;
 *   - malformed stored record → fail closed on read; no implicit delete.
 *
 * Concern ≠ store (§32): this ONE physical store holds Participation,
 * Collaboration, and Commitment history as DISTINCT typed event streams — a
 * shared store never merges the concern domains.
 */

import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

import { canonicalJsonBytes } from "../schema/canonical.js";
import type { Invocation, Participation, ParticipationEndReason } from "./participation.js";
import { PARTICIPATION_EVENT_PARSERS } from "./participation.js";
import { CoordinationStoreError, CoordinationConflictError } from "./errors.js";
import { FEDERATION_EVENT_PARSERS } from "../federation/messages.js";
import { COMMITMENT_EVENT_PARSERS } from "../federation/commitment.js";

const decoder = new TextDecoder();

/** Canonical key-sorted serialization — the byte-identical comparison basis. */
function canonicalJson(value: unknown): string {
  return decoder.decode(canonicalJsonBytes(value));
}

export const COORDINATION_STORE_DOMAIN = "palimpsest.coordination-event.v1";

/**
 * The known coordination event types. ONE physical store, DISTINCT concern
 * streams (§32): participation (E1) and collaboration (E3) event types share
 * the store while remaining separate semantics with separate typed payload
 * parsers. Per-type payload shapes are narrowed by each concern's service;
 * the store validates through the registered parsers.
 */
export type CoordinationEventType =
  | "INVOCATION_RECORDED"
  | "PARTICIPATION_STARTED"
  | "PARTICIPATION_ENDED"
  | "CONTACT_REQUESTED"
  | "MESSAGE_PREPARED"
  | "MESSAGE_DELIVERED"
  | "MESSAGE_RECEIVED"
  | "WAKE_SENT"
  | "ACK_RECORDED"
  | "COMMITMENT_OFFERED"
  | "COMMITMENT_ACCEPTED"
  | "COMMITMENT_REJECTED"
  | "COMMITMENT_RELEASED"
  | "COMMITMENT_SUPERSEDED"
  | "HANDOFF_OFFERED"
  | "HANDOFF_ACCEPTED"
  | "HANDOFF_REJECTED";

export interface InvocationRecordedPayload {
  readonly invocation: Invocation;
}

export interface ParticipationStartedPayload {
  readonly participation: Participation;
}

export interface ParticipationEndedPayload {
  readonly participationId: string;
  readonly endReason: ParticipationEndReason;
}

export type CoordinationEventPayload =
  | InvocationRecordedPayload
  | ParticipationStartedPayload
  | ParticipationEndedPayload;

/** A durable coordination history record. `seq` is assigned by the store on append. */
export interface CoordinationEvent<T extends CoordinationEventType = CoordinationEventType> {
  readonly eventId: string;
  readonly seq: number;
  readonly projectId: string;
  readonly type: T;
  /**
   * The persisted payload, validated by the registered per-type parser at the
   * store boundary and narrowed to the concern's payload type by its service.
   * Deliberately `unknown` at the shared-store level: the store's type union
   * spans concern domains and never imports their vocabularies (§32).
   */
  readonly payload: unknown;
}

export { CoordinationStoreError };
export { CoordinationConflictError };

/** Strict per-type payload parser (§33): parse + validate, never a generic bag. */
export type CoordinationEventPayloadParser = (payload: unknown) => unknown;
export type CoordinationEventParsers = Readonly<Record<string, CoordinationEventPayloadParser>>;

export type CoordinationAppendRequest = Omit<CoordinationEvent, "seq">;

/**
 * A single crash-atomic conditional batch (§13): all events commit together or
 * none do, and the batch is only admitted when the canonical head still equals
 * `expectedHeadSeq` (the head the caller derived its semantic preconditions
 * from — §14).
 */
export interface CoordinationAtomicAppend {
  readonly expectedHeadSeq: number;
  readonly events: readonly CoordinationAppendRequest[];
}

export interface CoordinationStore {
  /**
   * Append one event. Byte-identical duplicate eventId → idempotent no-op
   * (returns the stored events); same eventId with different content → fail
   * closed. `seq` is assigned by the store.
   */
  append(event: CoordinationAppendRequest): Promise<readonly CoordinationEvent[]>;
  /**
   * Append a conditional batch atomically (F0 §13). All events must already be
   * strict-parseable; the batch commits iff the canonical head equals
   * `expectedHeadSeq`, otherwise `CoordinationConflictError{head_mismatch}`
   * (or `{recovery_required}` for a partial historical set — §18).
   */
  appendAtomic(transition: CoordinationAtomicAppend): Promise<readonly CoordinationEvent[]>;
  /** The canonical head sequence (0 when empty) — the `expectedHeadSeq` basis. */
  head(): Promise<number>;
  /** Replay all events in seq order (restart-safe; malformed rows fail closed). */
  replay(): Promise<readonly CoordinationEvent[]>;
}

interface StoredRow {
  event_id: string;
  seq: number;
  project_id: string;
  type: string;
  payload_json: string;
}

interface PreparedAppend {
  readonly eventId: string;
  readonly projectId: string;
  readonly type: string;
  readonly payloadJson: string;
}

/** A bounded SQLite busy/locked failure (§17) — never confused with a semantic conflict. */
function isBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked/i.test(message);
}

function parseStoredEvent(row: StoredRow, parsers: CoordinationEventParsers): CoordinationEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(row.payload_json);
  } catch (error) {
    throw new CoordinationStoreError(
      `coordination event "${row.event_id}" has a malformed payload: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const parser = parsers[row.type];
  if (parser === undefined) {
    throw new CoordinationStoreError(`coordination event "${row.event_id}" has unknown type "${row.type}"`);
  }
  const typed = parser(payload);
  return Object.freeze({
    eventId: row.event_id,
    seq: row.seq,
    projectId: row.project_id,
    type: row.type as CoordinationEventType,
    payload: typed as never,
  });
}

/**
 * The complete built-in registry (F0 §25): participation + federation +
 * commitment/handoff parsers. A store constructed without an explicit
 * `eventParsers` option validates EVERY built-in stream, so a
 * misconfiguration can never silently persist an unvalidated artifact.
 */
export const DEFAULT_COORDINATION_EVENT_PARSERS: CoordinationEventParsers = Object.freeze({
  ...PARTICIPATION_EVENT_PARSERS,
  ...FEDERATION_EVENT_PARSERS,
  ...COMMITMENT_EVENT_PARSERS,
});

export { PARTICIPATION_EVENT_PARSERS };

export interface SqliteCoordinationStoreOptions {
  /** Additional/override per-type parsers (strict; merged over the defaults). */
  readonly eventParsers?: CoordinationEventParsers;
  /** Bounded SQLite busy wait in ms (§17). Default 5000. */
  readonly busyTimeoutMs?: number;
  /**
   * TEST-ONLY fault-injection seam (F0 §20): invoked inside the append
   * transaction immediately before COMMIT, so a crash between the conceptual
   * operations can be simulated and rollback proven. Never set in production.
   */
  readonly _failBeforeCommit?: () => void;
}

export class SqliteCoordinationStore implements CoordinationStore {
  readonly #database: DatabaseSync;
  readonly #selectAll: ReturnType<DatabaseSync["prepare"]>;
  readonly #selectById: ReturnType<DatabaseSync["prepare"]>;
  readonly #selectHead: ReturnType<DatabaseSync["prepare"]>;
  readonly #insert: ReturnType<DatabaseSync["prepare"]>;
  readonly #parsers: CoordinationEventParsers;
  readonly #failBeforeCommit: (() => void) | undefined;

  constructor(databasePath: string, options?: SqliteCoordinationStoreOptions) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    // §17: bounded busy handling; a semantic conflict is NEVER hidden as a
    // busy retry (they surface as distinct typed errors).
    this.#database.exec(`PRAGMA busy_timeout = ${options?.busyTimeoutMs ?? 5000}`);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS coordination_events (" +
        "event_id TEXT PRIMARY KEY, " +
        "seq INTEGER NOT NULL UNIQUE, " +
        "project_id TEXT NOT NULL, " +
        "type TEXT NOT NULL, " +
        "payload_json TEXT NOT NULL)",
    );
    this.#selectAll = this.#database.prepare(
      "SELECT event_id, seq, project_id, type, payload_json FROM coordination_events ORDER BY seq",
    );
    this.#selectById = this.#database.prepare(
      "SELECT event_id, seq, project_id, type, payload_json FROM coordination_events WHERE event_id = ?",
    );
    this.#selectHead = this.#database.prepare("SELECT MAX(seq) AS max FROM coordination_events");
    this.#insert = this.#database.prepare(
      "INSERT INTO coordination_events (event_id, seq, project_id, type, payload_json) VALUES (?, ?, ?, ?, ?)",
    );
    // §33: strict per-type parsers — every built-in stream is validated by
    // default; options extend/override explicitly.
    this.#parsers = { ...DEFAULT_COORDINATION_EVENT_PARSERS, ...(options?.eventParsers ?? {}) };
    this.#failBeforeCommit = options?._failBeforeCommit;
  }

  /** Validate + canonicalize one append request BEFORE any write (§22–§24). */
  #prepare(event: CoordinationAppendRequest): PreparedAppend {
    if (typeof event.eventId !== "string" || event.eventId.length === 0) {
      throw new CoordinationStoreError("eventId must be a non-empty string");
    }
    if (typeof event.projectId !== "string" || event.projectId.length === 0) {
      throw new CoordinationStoreError("projectId must be a non-empty string");
    }
    const parser = this.#parsers[event.type];
    if (parser === undefined) {
      throw new CoordinationStoreError(`cannot persist unknown coordination event type "${event.type}"`);
    }
    const validated = parser(event.payload);
    return {
      eventId: event.eventId,
      projectId: event.projectId,
      type: event.type,
      payloadJson: canonicalJson(validated),
    };
  }

  #maxSeq(): number {
    const row = this.#selectHead.get() as { max: number | null } | undefined;
    return row?.max ?? 0;
  }

  #find(eventId: string): StoredRow | undefined {
    return this.#selectById.get(eventId) as StoredRow | undefined;
  }

  async head(): Promise<number> {
    return this.#maxSeq();
  }

  async append(event: CoordinationAppendRequest): Promise<readonly CoordinationEvent[]> {
    const prepared = this.#prepare(event);
    try {
      this.#database.exec("BEGIN IMMEDIATE");
      const existing = this.#find(prepared.eventId);
      if (existing !== undefined) {
        if (
          existing.payload_json !== prepared.payloadJson ||
          existing.type !== prepared.type ||
          existing.project_id !== prepared.projectId
        ) {
          // §31/§79: same eventId with different content fails closed — no
          // last-write-wins history rewrite.
          throw new CoordinationConflictError(
            "event_conflict",
            `coordination event "${prepared.eventId}" already exists with different content`,
          );
        }
        this.#database.exec("COMMIT");
        return Object.freeze([parseStoredEvent(existing, this.#parsers)]);
      }
      const seq = this.#maxSeq() + 1;
      this.#insert.run(prepared.eventId, seq, prepared.projectId, prepared.type, prepared.payloadJson);
      this.#failBeforeCommit?.();
      this.#database.exec("COMMIT");
      const stored: StoredRow = {
        event_id: prepared.eventId,
        seq,
        project_id: prepared.projectId,
        type: prepared.type,
        payload_json: prepared.payloadJson,
      };
      return Object.freeze([parseStoredEvent(stored, this.#parsers)]);
    } catch (error) {
      this.#rollback();
      throw this.#classify(error);
    }
  }

  /**
   * F0 §13–§21: one crash-atomic, head-conditional batch append. Validation of
   * every event happens before the transaction opens, so a malformed or
   * conflicting batch can never leave a persisted prefix.
   */
  async appendAtomic(transition: CoordinationAtomicAppend): Promise<readonly CoordinationEvent[]> {
    if (
      typeof transition.expectedHeadSeq !== "number" ||
      !Number.isInteger(transition.expectedHeadSeq) ||
      transition.expectedHeadSeq < 0
    ) {
      throw new CoordinationStoreError("expectedHeadSeq must be a non-negative integer");
    }
    if (transition.events.length === 0) {
      throw new CoordinationStoreError("appendAtomic requires at least one event");
    }
    const prepared = transition.events.map((event) => this.#prepare(event));
    const seen = new Set<string>();
    for (const entry of prepared) {
      if (seen.has(entry.eventId)) {
        throw new CoordinationConflictError(
          "event_conflict",
          `atomic transition contains duplicate eventId "${entry.eventId}"`,
        );
      }
      seen.add(entry.eventId);
    }

    try {
      this.#database.exec("BEGIN IMMEDIATE");
      const existing = prepared.map((entry) => this.#find(entry.eventId));      const presentCount = existing.filter((row) => row !== undefined).length;

      if (presentCount === prepared.length) {
        // §18: a fully-present byte-identical batch is an idempotent success,
        // even though the canonical head has since advanced past the original
        // `expectedHeadSeq`.
        prepared.forEach((entry, index) => {
          const row = existing[index]!;
          if (
            row.payload_json !== entry.payloadJson ||
            row.type !== entry.type ||
            row.project_id !== entry.projectId
          ) {
            throw new CoordinationConflictError(
              "event_conflict",
              `coordination event "${entry.eventId}" already exists with different content`,
            );
          }
        });
        this.#database.exec("COMMIT");
        return Object.freeze((existing as StoredRow[]).map((row) => parseStoredEvent(row, this.#parsers)));
      }
      if (presentCount > 0) {
        // §18: a declared-atomic transition must never be partially present.
        // Do NOT silently complete it — surface a recovery-required condition.
        throw new CoordinationConflictError(
          "recovery_required",
          "atomic coordination transition is partially present in history — explicit recovery required (refusing to complete it)",
        );
      }

      const head = this.#maxSeq();
      if (head !== transition.expectedHeadSeq) {
        // §14: no stale state-machine write.
        throw new CoordinationConflictError(
          "head_mismatch",
          `coordination head is ${head}, expected ${transition.expectedHeadSeq} — re-read and re-evaluate`,
        );
      }

      const inserted: StoredRow[] = [];
      let seq = head;
      for (const entry of prepared) {
        seq += 1;
        this.#insert.run(entry.eventId, seq, entry.projectId, entry.type, entry.payloadJson);
        inserted.push({
          event_id: entry.eventId,
          seq,
          project_id: entry.projectId,
          type: entry.type,
          payload_json: entry.payloadJson,
        });
      }
      this.#failBeforeCommit?.();
      this.#database.exec("COMMIT");
      return Object.freeze(inserted.map((row) => parseStoredEvent(row, this.#parsers)));
    } catch (error) {
      this.#rollback();
      throw this.#classify(error);
    }
  }

  #rollback(): void {
    try {
      this.#database.exec("ROLLBACK");
    } catch {
      // No active transaction (e.g. BEGIN IMMEDIATE itself failed) — nothing to undo.
    }
  }

  #classify(error: unknown): unknown {
    if (error instanceof CoordinationStoreError || error instanceof CoordinationConflictError) return error;
    if (isBusyError(error)) {
      return new CoordinationConflictError(
        "database_busy",
        `coordination store write contention (bounded wait exhausted): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return new CoordinationStoreError(
      `failed to append coordination event: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  async replay(): Promise<readonly CoordinationEvent[]> {
    return Object.freeze(
      (this.#selectAll.all() as unknown as StoredRow[]).map((row) => parseStoredEvent(row, this.#parsers)),
    );
  }

  close(): void {
    this.#database.close();
  }
}

/** The canonical default coordination store path (Palimpsest-owned). */
export function defaultCoordinationPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome =
    configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "coordination.sqlite");
}
