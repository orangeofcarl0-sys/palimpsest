/**
 * Trajectory-P2-B §6/§7 — THE DURABLE EXECUTION-ASSOCIATION STORE.
 *
 * A dedicated, typed, APPEND-ONLY store for observed execution-identity facts. It is the P2-B answer
 * to §6: the physical substrate is a small dedicated file rather than the Work EventStore or the
 * CoordinationStore, for reasons recorded in `research-evidence/trajectory-p2b/durable-owner-decision.json`
 * and summarized here:
 *
 *   NOT the Work EventStore (§6.1). A Host observation is not a Work lifecycle transition. Writing it
 *   as a Work event would give an observation a place in the canonical lifecycle and risk a new
 *   authority relationship (`session created ⇒ attempt progressed`), which is exactly what must not
 *   happen. `settleMutatingWork` remains the only thing that completes an attempt.
 *
 *   NOT the CoordinationStore (§6.2). Its semantic ownership is peer coordination/federation
 *   (participation, collaboration, commitment, handoff), and it is composed only when a deployment
 *   wires the full federation surface. Reusing it would either merge concern domains under one
 *   authority or silently require a peer stack to record a purely local Host fact. It is retained as
 *   the IDEMPOTENCY/ATOMICITY REFERENCE this store's contract is modelled on.
 *
 *   NOT the G1-B recorder (§6.3). That is a research script; its principles (controlled ingestion,
 *   content digest, conflict refusal, rejection of caller-declared origin markers) are reused, but it
 *   is not promoted into production architecture.
 *
 *   THIS (Candidate D, §6.4) is a minimal dedicated store. It stores NO DSH event bodies and NO copy
 *   of canonical Work state — only the minimal identities and the trusted source basis needed to
 *   rebuild the relationship. It is deliberately NOT event-sourced and adds no runtime or scheduler.
 *
 * THE IDEMPOTENCY MODEL (§7.3/§7.4). The event id is STABLE and derived from immutable facts only. The
 * payload contains NO ingestion timestamp, so a retry produces a byte-identical payload and is an
 * idempotent no-op. Same id with DIFFERENT content fails closed — there is no last-write-wins.
 *
 * THE FAILURE MODEL (§7.7). This store is OPTIONAL. When it is absent, ordinary Work execution is
 * unaffected. When a write fails, the failure is REPORTED and never converted into a Work success or
 * failure: the store is not a second settlement authority.
 *
 * Layer: L2 (`src/execution_association/`), beside `project_world/basis_store.ts`, whose dedicated
 * append-only design this follows.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { canonicalJsonBytes } from "../schema/canonical.js";
import {
  EXECUTION_ASSOCIATION_EVENT_PARSERS,
  associationEventId,
  type ExecutionAssociationAppendRequest,
  type ExecutionAssociationEvent,
  type ExecutionAssociationEventType,
  type ExecutionAssociationPayload,
} from "./contract.js";

const decoder = new TextDecoder();

/** Canonical key-sorted serialization — the byte-identical comparison basis (§7.4). */
function canonicalJson(value: unknown): string {
  return decoder.decode(canonicalJsonBytes(value));
}

/** §7.7: the store's own error vocabulary. A malformed history fails closed; it never reads as empty. */
export class ExecutionAssociationStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionAssociationStoreError";
  }
}

/** §7.3: same event id with different content — refused, never overwritten. */
export class ExecutionAssociationConflictError extends Error {
  readonly kind = "execution_association_conflict" as const;
  constructor(
    readonly category: "event_conflict",
    message: string,
  ) {
    super(message);
    this.name = "ExecutionAssociationConflictError";
  }
}

/** §7.7: what a write attempt produced, so a caller can distinguish committed from failed evidence. */
export type AssociationAppendOutcome =
  | { readonly state: "APPENDED"; readonly event: ExecutionAssociationEvent }
  /** The identical logical observation was already committed; nothing changed. */
  | { readonly state: "IDEMPOTENT"; readonly event: ExecutionAssociationEvent };

export interface ExecutionAssociationStore {
  /** Append ONE immutable observation. Idempotent for an identical re-delivery; conflict otherwise. */
  append(event: ExecutionAssociationAppendRequest): AssociationAppendOutcome;
  /** Replay every stored event in seq order. Malformed rows fail closed (§7.7). */
  replay(): readonly ExecutionAssociationEvent[];
  /** Every event for ONE attempt, in seq order. */
  replayForAttempt(input: { readonly projectId: string; readonly attemptId: string }): readonly ExecutionAssociationEvent[];
  /**
   * P2-D0 §6.5: every SESSION_IDENTITY_OBSERVED record that names ONE SessionId, across ALL attempts of
   * this project. This is the read side's cross-Attempt creator-conflict probe: it answers "does another
   * Attempt claim this same session" without scanning the whole history in the caller.
   */
  replayForSession(input: { readonly projectId: string; readonly dshSessionId: string }): readonly ExecutionAssociationEvent[];
  head(): number;
  close(): void;
}

interface StoredRow {
  event_id: string;
  seq: number;
  project_id: string;
  attempt_id: string;
  type: string;
  payload_json: string;
}

function parseStoredEvent(row: StoredRow): ExecutionAssociationEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(row.payload_json);
  } catch (error) {
    throw new ExecutionAssociationStoreError(
      `execution association event "${row.event_id}" has a malformed payload: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parser = EXECUTION_ASSOCIATION_EVENT_PARSERS[row.type];
  if (parser === undefined) {
    throw new ExecutionAssociationStoreError(`execution association event "${row.event_id}" has unknown type "${row.type}"`);
  }
  const typed = parser(payload);
  /**
   * §6.4: THE ROW AND ITS PAYLOAD MUST AGREE. A record whose indexed columns contradict its own payload
   * is a corrupted history, and a corrupted history is refused rather than presented (F9). Before P2-C
   * the replay path never read `row.attempt_id` at all, so a mutated column was invisible.
   */
  if (row.project_id !== typed.projectId) {
    throw new ExecutionAssociationStoreError(
      `execution association event "${row.event_id}" stores project_id "${row.project_id}" but its payload names project "${typed.projectId}"`,
    );
  }
  if (row.attempt_id !== typed.attemptId) {
    throw new ExecutionAssociationStoreError(
      `execution association event "${row.event_id}" stores attempt_id "${row.attempt_id}" but its payload names attempt "${typed.attemptId}"`,
    );
  }
  /**
   * §6.3: THE STORED EVENT ID MUST EQUAL THE CANONICAL IDENTITY. An eventId that does not match the
   * payload's own identity means the record's stable identity was tampered with or written by a
   * non-canonical path, so it is refused (F8).
   */
  const canonicalId = canonicalEventIdOf(typed, row.type as ExecutionAssociationEventType);
  if (row.event_id !== canonicalId) {
    throw new ExecutionAssociationStoreError(
      `execution association event "${row.event_id}" does not match its canonical identity "${canonicalId}"`,
    );
  }
  return Object.freeze({
    eventId: row.event_id,
    seq: row.seq,
    projectId: row.project_id,
    type: row.type as ExecutionAssociationEventType,
    payload: typed,
  });
}

/** §6.3: the canonical id for a validated payload of a known type. */
function canonicalEventIdOf(payload: ExecutionAssociationPayload, type: ExecutionAssociationEventType): string {
  return type === "SESSION_IDENTITY_OBSERVED"
    ? associationEventId({
        type,
        projectId: payload.projectId,
        attemptId: payload.attemptId,
        invocationId: (payload as { readonly invocationId: string }).invocationId,
        dshSessionId: (payload as { readonly dshSessionId: string }).dshSessionId,
      })
    : associationEventId({ type, projectId: payload.projectId, attemptId: payload.attemptId, invocationId: (payload as { readonly invocationId: string }).invocationId });
}
export class SqliteExecutionAssociationStore implements ExecutionAssociationStore {
  readonly #database: DatabaseSync;
  readonly #selectAll: ReturnType<DatabaseSync["prepare"]>;
  readonly #selectById: ReturnType<DatabaseSync["prepare"]>;
  readonly #selectByAttempt: ReturnType<DatabaseSync["prepare"]>;
  readonly #selectBySession: ReturnType<DatabaseSync["prepare"]>;
  readonly #selectHead: ReturnType<DatabaseSync["prepare"]>;
  readonly #insert: ReturnType<DatabaseSync["prepare"]>;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(`PRAGMA busy_timeout = 5000`);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS execution_associations (" +
        "event_id TEXT PRIMARY KEY, " +
        "seq INTEGER NOT NULL UNIQUE, " +
        "project_id TEXT NOT NULL, " +
        "attempt_id TEXT NOT NULL, " +
        "type TEXT NOT NULL, " +
        "payload_json TEXT NOT NULL)",
    );
    this.#database.exec("CREATE INDEX IF NOT EXISTS execution_associations_attempt ON execution_associations (project_id, attempt_id, seq)");
    this.#database.exec("CREATE INDEX IF NOT EXISTS execution_associations_type ON execution_associations (project_id, type, seq)");
    this.#selectAll = this.#database.prepare("SELECT event_id, seq, project_id, attempt_id, type, payload_json FROM execution_associations ORDER BY seq");
    this.#selectById = this.#database.prepare("SELECT event_id, seq, project_id, attempt_id, type, payload_json FROM execution_associations WHERE event_id = ?");
    this.#selectByAttempt = this.#database.prepare(
      "SELECT event_id, seq, project_id, attempt_id, type, payload_json FROM execution_associations WHERE project_id = ? AND attempt_id = ? ORDER BY seq",
    );
    /**
     * §6.5: a TARGETED cross-Attempt probe. `dshSessionId` lives inside the canonical payload JSON, so the
     * filter uses SQLite's own `json_extract` rather than replaying every row in the caller — the index on
     * `(project_id, type, seq)` bounds the scan to the project's observation records.
     */
    this.#selectBySession = this.#database.prepare(
      "SELECT event_id, seq, project_id, attempt_id, type, payload_json FROM execution_associations " +
        "WHERE project_id = ? AND type = 'SESSION_IDENTITY_OBSERVED' AND json_extract(payload_json, '$.dshSessionId') = ? ORDER BY seq",
    );
    this.#selectHead = this.#database.prepare("SELECT MAX(seq) AS max FROM execution_associations");
    this.#insert = this.#database.prepare(
      "INSERT INTO execution_associations (event_id, seq, project_id, attempt_id, type, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
    );
  }

  #maxSeq(): number {
    const row = this.#selectHead.get() as { max: number | null } | undefined;
    return row?.max ?? 0;
  }

  #attemptIdOf(payload: ExecutionAssociationPayload): string {
    return payload.attemptId;
  }

  head(): number {
    return this.#maxSeq();
  }

  append(event: ExecutionAssociationAppendRequest): AssociationAppendOutcome {
    if (typeof event.eventId !== "string" || event.eventId.length === 0) {
      throw new ExecutionAssociationStoreError("eventId must be a non-empty string");
    }
    if (typeof event.projectId !== "string" || event.projectId.length === 0) {
      throw new ExecutionAssociationStoreError("projectId must be a non-empty string");
    }
    const parser = EXECUTION_ASSOCIATION_EVENT_PARSERS[event.type];
    if (parser === undefined) {
      throw new ExecutionAssociationStoreError(`cannot persist unknown execution association type "${event.type}"`);
    }
    /**
     * §7.6: a malformed payload fails closed BEFORE any write, and the failure is reported through this
     * store's own error vocabulary so a caller cannot mistake a validation refusal for a transient fault.
     */
    let validated: ExecutionAssociationPayload;
    try {
      validated = parser(event.payload);
    } catch (error) {
      throw new ExecutionAssociationStoreError(
        `refusing to persist a malformed ${event.type} payload: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (validated.projectId !== event.projectId) {
      throw new ExecutionAssociationStoreError(
        `execution association payload projectId "${validated.projectId}" does not match the event projectId "${event.projectId}"`,
      );
    }
    /**
     * §6.3: the APPEND path enforces the same canonical identity the replay path enforces, so a
     * non-canonical eventId can never enter the history in the first place (F8).
     */
    const canonicalId = canonicalEventIdOf(validated, event.type);
    if (event.eventId !== canonicalId) {
      throw new ExecutionAssociationStoreError(
        `execution association eventId "${event.eventId}" does not match the canonical identity "${canonicalId}" for this payload`,
      );
    }
    const payloadJson = canonicalJson(validated);

    try {
      this.#database.exec("BEGIN IMMEDIATE");
      const existing = this.#selectById.get(event.eventId) as StoredRow | undefined;
      if (existing !== undefined) {
        if (existing.payload_json !== payloadJson || existing.type !== event.type || existing.project_id !== event.projectId) {
          throw new ExecutionAssociationConflictError(
            "event_conflict",
            `execution association event "${event.eventId}" already exists with different content`,
          );
        }
        this.#database.exec("COMMIT");
        return Object.freeze({ state: "IDEMPOTENT" as const, event: parseStoredEvent(existing) });
      }
      const seq = this.#maxSeq() + 1;
      this.#insert.run(event.eventId, seq, event.projectId, this.#attemptIdOf(validated), event.type, payloadJson);
      this.#database.exec("COMMIT");
      const stored: StoredRow = {
        event_id: event.eventId,
        seq,
        project_id: event.projectId,
        attempt_id: this.#attemptIdOf(validated),
        type: event.type,
        payload_json: payloadJson,
      };
      return Object.freeze({ state: "APPENDED" as const, event: parseStoredEvent(stored) });
    } catch (error) {
      try {
        this.#database.exec("ROLLBACK");
      } catch {
        /* no active transaction */
      }
      if (error instanceof ExecutionAssociationStoreError || error instanceof ExecutionAssociationConflictError) throw error;
      throw new ExecutionAssociationStoreError(`failed to append execution association event: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  replay(): readonly ExecutionAssociationEvent[] {
    return Object.freeze((this.#selectAll.all() as unknown as StoredRow[]).map(parseStoredEvent));
  }

  replayForAttempt(input: { readonly projectId: string; readonly attemptId: string }): readonly ExecutionAssociationEvent[] {
    return Object.freeze(
      (this.#selectByAttempt.all(input.projectId, input.attemptId) as unknown as StoredRow[]).map(parseStoredEvent),
    );
  }

  /** §6.5: every observation of ONE SessionId across the project, for the cross-Attempt conflict probe. */
  replayForSession(input: { readonly projectId: string; readonly dshSessionId: string }): readonly ExecutionAssociationEvent[] {
    return Object.freeze(
      (this.#selectBySession.all(input.projectId, input.dshSessionId) as unknown as StoredRow[]).map(parseStoredEvent),
    );
  }

  close(): void {
    this.#database.close();
  }
}

/** The canonical default path (Palimpsest-owned), following the repository's `defaultXxxPath` idiom. */
export function defaultExecutionAssociationPath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(process.env.USERPROFILE ?? "", ".dsh") : configured;
  return join(dshHome, "palimpsest", "execution-associations.sqlite");
}
