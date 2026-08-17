/**
 * Append-only Event Store, replay, integrity, and maintenance operations.
 *
 * Ported from palimpsest-repo palimpsest/state/event_store.py (phase0-2
 * unified baseline). Payload blobs are stored as canonical JSON bytes with
 * embedded datetimes in their canonical micro form, matching the Python
 * storage byte-for-byte (guarded by the fixture snapshot-digest parity test).
 */

import { existsSync } from "node:fs";

import { DatabaseSync } from "node:sqlite";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

import { resolve } from "node:path";

import {
  canonicalDatetime,
  canonicalJsonBytes,
  canonicalizeEventPayload,
  computeEventDigest,
  computeRequestDigest,
  parseNewEvent,
  parseSchedulerEvent,
  type NewEvent,
  type SchedulerEvent,
} from "../schema/index.js";
import { AggregateValidator } from "../domain/aggregate.js";
import type { TaskPolicy } from "../domain/policy.js";
import { openDatabase } from "./database.js";
import {
  EventChainError,
  IdempotencyConflict,
  ProjectionError,
  RevisionConflict,
  StateStoreError,
} from "./errors.js";
import { APPLICATION_ID, getApplicationId, validateMigrationHistory } from "./migrations.js";
import { CoreProjector, PROJECTION_NAME, PROJECTION_SCHEMA_VERSION } from "./projector.js";
import { clearProjections, normalizedSnapshot, snapshotDigest } from "./snapshot.js";

export const EMPTY_PREVIOUS_EVENT_DIGEST = "0".repeat(64);

type Row = Record<string, any>;

function rowStr(row: Row, key: string): string {
  return String(row[key]);
}

function rowInt(row: Row, key: string): number {
  return Number(row[key]);
}

function payloadFromRow(row: Row): Record<string, unknown> {
  const raw = row.payload_json;
  if (!(raw instanceof Uint8Array)) {
    throw new EventChainError("payload_json is not stored as canonical BLOB bytes");
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(raw));
  } catch (error) {
    throw new EventChainError(withCause("payload_json is not valid UTF-8 JSON", error));
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EventChainError("Event payload must be a JSON object");
  }
  if (!bytesEqual(canonicalJsonBytes(value), raw)) {
    throw new EventChainError("payload_json is not canonical JSON");
  }
  return value as Record<string, unknown>;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function rowToEvent(row: Row): SchedulerEvent {
  try {
    return parseSchedulerEvent({
      schema_version: row.schema_version,
      event_id: row.event_id,
      project_id: row.project_id,
      project_sequence: row.project_sequence,
      event_type: row.event_type,
      payload_version: row.payload_version,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      payload: payloadFromRow(row),
      causation_id: row.causation_id,
      correlation_id: row.correlation_id,
      idempotency_key: row.idempotency_key,
      request_digest: row.request_digest,
      expected_project_revision: row.expected_project_revision,
      previous_event_digest: row.previous_event_digest,
      event_digest: row.event_digest,
      committed_at: row.committed_at,
    });
  } catch (error) {
    throw new EventChainError(
      withCause(`stored Event ${String(row.event_id)} is invalid`, error),
    );
  }
}

export function verifyEventChain(connection: DatabaseSync): SchedulerEvent[] {
  const events: SchedulerEvent[] = [];
  const projectTails = new Map<string, [number, string]>();
  const eventProjects = new Map<number, string>();
  let previousGlobalId = 0;

  for (const raw of connection.prepare("SELECT * FROM events ORDER BY event_id").all() as Row[]) {
    const event = rowToEvent(raw);
    if (event.event_id <= previousGlobalId) {
      throw new EventChainError("global event_id order is not strictly increasing");
    }
    previousGlobalId = event.event_id;

    const [previousSequence, previousDigest] = projectTails.get(event.project_id) ?? [
      0,
      EMPTY_PREVIOUS_EVENT_DIGEST,
    ];
    if (event.project_sequence !== previousSequence + 1) {
      throw new EventChainError(
        `project ${event.project_id} sequence is not continuous`,
      );
    }
    if (event.previous_event_digest !== previousDigest) {
      throw new EventChainError(`project ${event.project_id} previous digest does not match`);
    }
    if (event.causation_id !== null) {
      const causeProject = eventProjects.get(event.causation_id);
      if (causeProject === undefined || causeProject !== event.project_id) {
        throw new EventChainError(
          "causation_id must reference an earlier Event in the same project",
        );
      }
    }

    projectTails.set(event.project_id, [event.project_sequence, event.event_digest]);
    eventProjects.set(event.event_id, event.project_id);
    events.push(event);
  }
  return events;
}

function verifyProjectionTails(connection: DatabaseSync): void {
  const tails = connection
    .prepare(
      `
      SELECT e.project_id, e.event_id, e.project_sequence
      FROM events e
      JOIN (
          SELECT project_id, MAX(project_sequence) AS maximum
          FROM events GROUP BY project_id
      ) latest
        ON latest.project_id=e.project_id
       AND latest.maximum=e.project_sequence
      ORDER BY e.project_id
      `,
    )
    .all() as Row[];
  const seen = new Set<string>();
  for (const tail of tails) {
    const projectId = rowStr(tail, "project_id");
    seen.add(projectId);
    const cursor = connection
      .prepare(
        `
        SELECT projection_schema_version, last_applied_event_id,
               last_project_sequence, last_event_digest
        FROM projection_cursors
        WHERE projection_name=? AND project_id=?
        `,
      )
      .get(PROJECTION_NAME, projectId) as Row | undefined;
    if (cursor === undefined) {
      throw new ProjectionError(`missing projection cursor for project ${projectId}`);
    }
    if (rowInt(cursor, "projection_schema_version") !== PROJECTION_SCHEMA_VERSION) {
      throw new ProjectionError("projection schema version is incompatible");
    }
    const tailDigest = rowStr(
      connection
        .prepare("SELECT event_digest FROM events WHERE event_id=?")
        .get(rowInt(tail, "event_id")) as Row,
      "event_digest",
    );
    if (
      rowInt(cursor, "last_applied_event_id") !== rowInt(tail, "event_id") ||
      rowInt(cursor, "last_project_sequence") !== rowInt(tail, "project_sequence") ||
      rowStr(cursor, "last_event_digest") !== tailDigest
    ) {
      throw new ProjectionError("projection cursor does not match Event chain tail");
    }
  }

  const extras = connection
    .prepare("SELECT project_id FROM projection_cursors WHERE projection_name=?")
    .all(PROJECTION_NAME) as Row[];
  if (extras.some((row) => !seen.has(rowStr(row, "project_id")))) {
    throw new ProjectionError("projection cursor exists without an Event chain");
  }
}

export type FaultHook = (checkpoint: "after_event_insert", event: SchedulerEvent) => void;

export interface CheckpointResult {
  busy: number;
  logPages: number;
  checkpointedPages: number;
  readonly completed: boolean;
}

/**
 * Single-writer durable authority. The clock returns wire-format datetime
 * strings (any accepted form); storage canonicalizes to the micro form.
 */
export class EventStore {
  readonly path: string;
  readonly clock: () => string;
  readonly connection: DatabaseSync;
  readonly projector = new CoreProjector();
  readonly #aggregateValidator = new AggregateValidator();

  constructor(
    path: string,
    options: { clock?: () => string; verifyOnOpen?: boolean } = {},
  ) {
    this.path = resolve(path);
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.connection = openDatabase(this.path, { clock: this.clock });
    try {
      if (options.verifyOnOpen !== false) {
        this.quickCheck();
      }
    } catch (error) {
      this.connection.close();
      throw error;
    }
  }

  close(): void {
    this.connection.close();
  }

  registerPolicy(policy: TaskPolicy): void {
    this.#aggregateValidator.registerPolicy(policy);
  }

  get aggregateValidator(): AggregateValidator {
    return this.#aggregateValidator;
  }

  append(
    request: NewEvent,
    options: { faultHook?: FaultHook; committedAt?: string } = {},
  ): SchedulerEvent {
    const parsed = parseNewEvent(request);
    const requestDigest = computeRequestDigest(parsed);
    this.connection.exec("BEGIN IMMEDIATE");
    let inTransaction = true;
    try {
      const existing = this.connection
        .prepare("SELECT * FROM events WHERE project_id=? AND idempotency_key=?")
        .get(parsed.project_id, parsed.idempotency_key) as Row | undefined;
      if (existing !== undefined) {
        if (rowStr(existing, "request_digest") !== requestDigest) {
          throw new IdempotencyConflict(
            "idempotency key was reused for a different request",
          );
        }
        const event = rowToEvent(existing);
        this.connection.exec("COMMIT");
        inTransaction = false;
        return event;
      }

      this.#validatePreconditions(parsed);
      this.#aggregateValidator.validate(this.connection, parsed);
      this.#aggregateValidator.validateAdmission(this.connection, parsed);
      const eventId = this.#nextEventId();
      this.#validateCausation(parsed, eventId);
      const [projectSequence, previousDigest] = this.#nextProjectPosition(parsed);
      const committedAt = canonicalDatetime(options.committedAt ?? this.clock());

      const data = {
        ...parsed,
        payload: canonicalizeEventPayload(parsed.event_type, parsed.payload),
        event_id: eventId,
        project_sequence: projectSequence,
        request_digest: requestDigest,
        previous_event_digest: previousDigest,
        event_digest: EMPTY_PREVIOUS_EVENT_DIGEST,
        committed_at: committedAt,
      } as SchedulerEvent;
      data.event_digest = computeEventDigest(data);
      const event = parseSchedulerEvent(data);
      this.#insertEvent(event);
      options.faultHook?.("after_event_insert", event);
      this.projector.apply(this.connection, event);
      this.connection.exec("COMMIT");
      inTransaction = false;
      return event;
    } finally {
      if (inTransaction) {
        try {
          this.connection.exec("ROLLBACK");
        } catch {
          // SQLite may have already rolled the transaction back.
        }
      }
    }
  }

  #validatePreconditions(request: NewEvent): void {
    const project = this.connection
      .prepare("SELECT revision, digest, head_commit FROM projects WHERE project_id=?")
      .get(request.project_id) as Row | undefined;
    if (request.event_type === "PROJECT_CREATED") {
      if (project !== undefined) {
        throw new RevisionConflict("project already exists");
      }
      const projectIr = request.payload.project_ir as { revision: number };
      if (projectIr.revision !== 0) {
        throw new RevisionConflict("PROJECT_CREATED requires ProjectIR revision 0");
      }
      return;
    }
    if (project === undefined) {
      throw new RevisionConflict("project does not exist");
    }

    if (
      request.event_type !== "SCHEDULER_PAUSED" &&
      request.event_type !== "SCHEDULER_RESUMED"
    ) {
      const currentRevision = rowInt(project, "revision");
      if (request.expected_project_revision !== currentRevision) {
        throw new RevisionConflict(
          `expected revision ${request.expected_project_revision}, current revision is ${currentRevision}`,
        );
      }
    }

    if (request.event_type === "PROJECT_REVISED") {
      const projectIr = request.payload.project_ir as {
        revision: number;
        parent_revision: number;
        parent_digest: string;
      };
      if (
        projectIr.revision !== rowInt(project, "revision") + 1 ||
        projectIr.parent_revision !== rowInt(project, "revision") ||
        projectIr.parent_digest !== rowStr(project, "digest")
      ) {
        throw new RevisionConflict(
          "new ProjectIR must be the direct child of the current projection",
        );
      }
    } else if (request.event_type === "TASK_CREATED") {
      const envelope = request.payload.task_envelope as {
        project_revision: number;
        project_digest: string;
        base_commit: string;
      };
      if (
        envelope.project_revision !== rowInt(project, "revision") ||
        envelope.project_digest !== rowStr(project, "digest") ||
        envelope.base_commit !== rowStr(project, "head_commit")
      ) {
        throw new RevisionConflict(
          "TaskEnvelope does not match the current ProjectIR projection",
        );
      }
    }
  }

  #nextEventId(): number {
    const sequence = this.connection
      .prepare("SELECT seq FROM sqlite_sequence WHERE name='events'")
      .get() as { seq: number } | undefined;
    const maximum = rowInt(
      this.connection
        .prepare("SELECT COALESCE(MAX(event_id), 0) AS maximum FROM events")
        .get() as Row,
      "maximum",
    );
    if (sequence === undefined) {
      if (maximum !== 0) {
        throw new EventChainError("sqlite_sequence is missing for non-empty events");
      }
      return 1;
    }
    const allocated = sequence.seq;
    if (allocated < maximum) {
      throw new EventChainError("sqlite_sequence is behind the Event Log");
    }
    return allocated + 1;
  }

  #validateCausation(request: NewEvent, eventId: number): void {
    if (request.causation_id === null) return;
    const row = this.connection
      .prepare("SELECT event_id, project_id FROM events WHERE event_id=?")
      .get(request.causation_id) as Row | undefined;
    if (
      row === undefined ||
      rowStr(row, "project_id") !== request.project_id ||
      rowInt(row, "event_id") >= eventId
    ) {
      throw new EventChainError(
        "causation_id must reference an earlier Event in the same project",
      );
    }
  }

  #nextProjectPosition(request: NewEvent): [number, string] {
    const tail = this.connection
      .prepare(
        `
        SELECT project_sequence, event_digest
        FROM events WHERE project_id=?
        ORDER BY project_sequence DESC LIMIT 1
        `,
      )
      .get(request.project_id) as Row | undefined;
    if (tail === undefined) {
      if (request.event_type !== "PROJECT_CREATED") {
        throw new EventChainError("only PROJECT_CREATED may start an Event chain");
      }
      return [1, EMPTY_PREVIOUS_EVENT_DIGEST];
    }
    if (request.event_type === "PROJECT_CREATED") {
      throw new EventChainError("PROJECT_CREATED cannot appear after another Event");
    }
    return [rowInt(tail, "project_sequence") + 1, rowStr(tail, "event_digest")];
  }

  #insertEvent(event: SchedulerEvent): void {
    this.connection
      .prepare(
        `
        INSERT INTO events(
            event_id, schema_version, project_id, project_sequence,
            event_type, payload_version, entity_type, entity_id,
            payload_json, causation_id, correlation_id, idempotency_key,
            request_digest, expected_project_revision,
            previous_event_digest, event_digest, committed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(...[
        event.event_id,
        event.schema_version,
        event.project_id,
        event.project_sequence,
        event.event_type,
        event.payload_version,
        event.entity_type,
        event.entity_id,
        canonicalJsonBytes(event.payload),
        event.causation_id,
        event.correlation_id,
        event.idempotency_key,
        event.request_digest,
        event.expected_project_revision,
        event.previous_event_digest,
        event.event_digest,
        canonicalDatetime(event.committed_at),
      ]);
  }

  getEvent(eventId: number): SchedulerEvent | undefined {
    const row = this.connection
      .prepare("SELECT * FROM events WHERE event_id=?")
      .get(eventId) as Row | undefined;
    return row === undefined ? undefined : rowToEvent(row);
  }

  listEvents(projectId?: string): SchedulerEvent[] {
    const rows =
      projectId === undefined
        ? (this.connection.prepare("SELECT * FROM events ORDER BY event_id").all() as Row[])
        : (this.connection
            .prepare("SELECT * FROM events WHERE project_id=? ORDER BY project_sequence")
            .all(projectId) as Row[]);
    return rows.map(rowToEvent);
  }

  quickCheck(): void {
    if (getApplicationId(this.connection) !== APPLICATION_ID) {
      throw new StateStoreError("SQLite application identity changed after open");
    }
    validateMigrationHistory(this.connection);
    const unsupported = this.connection
      .prepare(
        "SELECT event_id FROM events WHERE schema_version != 1 OR payload_version != 1 LIMIT 1",
      )
      .get() as Row | undefined;
    if (unsupported !== undefined) {
      throw new EventChainError(
        `stored Event ${String(unsupported.event_id)} uses an unsupported contract`,
      );
    }
    verifyProjectionTails(this.connection);
  }

  verifyFull(): void {
    const integrityRows = (
      this.connection.prepare("PRAGMA integrity_check").all() as {
        integrity_check: string;
      }[]
    ).map((row) => row.integrity_check);
    if (!(integrityRows.length === 1 && integrityRows[0] === "ok")) {
      throw new StateStoreError(
        `SQLite integrity_check failed: ${integrityRows.join("; ")}`,
      );
    }
    validateMigrationHistory(this.connection);
    const events = verifyEventChain(this.connection);
    verifyProjectionTails(this.connection);

    const before = snapshotDigest(this.connection);
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      clearProjections(this.connection);
      for (const event of events) {
        this.#aggregateValidator.validate(this.connection, event);
        this.projector.apply(this.connection, event);
      }
      const after = snapshotDigest(this.connection);
      if (before !== after) {
        throw new ProjectionError("projection state differs from a clean replay");
      }
    } finally {
      this.connection.exec("ROLLBACK");
    }
  }

  rebuildProjections(): Record<string, unknown> {
    const events = verifyEventChain(this.connection);
    this.connection.exec("BEGIN IMMEDIATE");
    let inTransaction = true;
    try {
      clearProjections(this.connection);
      for (const event of events) {
        this.#aggregateValidator.validate(this.connection, event);
        this.projector.apply(this.connection, event);
      }
      this.connection.exec("COMMIT");
      inTransaction = false;
    } finally {
      if (inTransaction) {
        try {
          this.connection.exec("ROLLBACK");
        } catch {
          // SQLite may have already rolled the transaction back.
        }
      }
    }
    this.quickCheck();
    return normalizedSnapshot(this.connection);
  }

  snapshot(): Record<string, unknown> {
    return normalizedSnapshot(this.connection);
  }

  checkpointTruncate(): CheckpointResult {
    const row = this.connection
      .prepare("PRAGMA wal_checkpoint(TRUNCATE)")
      .get() as { busy: number; log: number; checkpointed: number };
    const result: CheckpointResult = {
      busy: row.busy,
      logPages: row.log,
      checkpointedPages: row.checkpointed,
      get completed() {
        return this.busy === 0;
      },
    };
    return result;
  }

  backupTo(destination: string): string {
    const resolved = resolve(destination);
    if (existsSync(resolved)) {
      throw new Error(`backup destination already exists: ${resolved}`);
    }
    this.connection
      .prepare("VACUUM INTO ?")
      .run(resolved);
    this.#validateReadonlyBackup(resolved);
    return resolved;
  }

  #validateReadonlyBackup(path: string): void {
    const connection: DatabaseSyncType = new DatabaseSync(path, { readOnly: true });
    try {
      if (getApplicationId(connection) !== APPLICATION_ID) {
        throw new StateStoreError("backup application_id is invalid");
      }
      validateMigrationHistory(connection);
      verifyEventChain(connection);
      verifyProjectionTails(connection);
    } finally {
      connection.close();
    }
  }
}

function withCause(message: unknown, cause: unknown): string {
  const text = typeof message === "string" ? message : String(message);
  const detail = cause instanceof Error ? cause.message : String(cause);
  return detail.length > 0 ? `${text} (${detail})` : text;
}
