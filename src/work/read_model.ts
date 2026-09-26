/**
 * PLMP-LEAN-1 §D5-b1 / SR-2 §九 — the WORK READ MODEL: the ONE owner of the Work projection reads.
 *
 *     same semantic question  ⇒  one reader
 *
 * SR-2 measured the alternative. The Work projections (`projects`, `tasks`, `attempts`) were being
 * read by the controller, by the continuation composition, by the scheduler, by the promotion
 * eligibility reader and by the graph projector — each with its own SQL, each with its own
 * decoding, and each free to drift on questions like "what is this attempt's authorization?" or
 * "which batch is this task in?". D5-b1 exists because one of those readings DID drift: the
 * attempt's authorization was read from the task's CURRENT envelope, which is a different fact
 * from the envelope that authorized the attempt when it ran.
 *
 * This module answers the Work questions. It produces NO transitions and writes nothing: the
 * aggregate, the scheduler and the event store still own every state change, and the read model
 * never becomes a second place where a state machine lives.
 *
 *     same semantic question ⇒ one reader        (not: all SQL ⇒ one repository class)
 *
 * So this is deliberately NOT a repository for every query in the codebase. It owns the reads SR-2
 * §九 names — project, task, attempt, current batch, envelope, attempt authorization, open attempt —
 * and nothing else. A reader whose SEMANTICS differ (the promotion-eligibility replay reader, which
 * must observe the log at a point in time) stays where it is: folding it in would trade a real
 * replay guarantee for a tidier import graph.
 *
 * Layer: L2 (`src/work/`). Consumed by the controller, the composition, and anything else that
 * needs a Work fact.
 */
import type { DatabaseSync } from "node:sqlite";

import { DomainValidationError } from "../domain/errors.js";
import { parseProjectIr, parseTaskEnvelope, type ProjectIr, type TaskEnvelope } from "../schema/index.js";
import {
  authorizationEventsFrom,
  resolveAttemptAuthorization,
  type AttemptAuthorization,
} from "../state/attempt_authorization.js";
import { ATTEMPT_OPEN_STATES } from "../domain/state_machine.js";
import type { EventStore } from "../state/index.js";

/** One task row, as the projection stores it. */
export interface WorkTaskRow {
  readonly taskId: string;
  readonly state: string;
  readonly lastEventId: number;
  /** The batch the task currently belongs to, from its own projected state. */
  readonly batchActivationEventId: number | null;
  /** The envelope the task CURRENTLY carries. Null when it carries none. */
  readonly envelopeId: string | null;
}

/** One attempt row, as the projection stores it. */
export interface WorkAttemptRow {
  readonly attemptId: string;
  readonly taskId: string;
  readonly state: string;
  readonly batchActivationEventId: number | null;
}

/** One attempt holding the mutating lane. */
export interface WorkOpenAttempt {
  readonly attemptId: string;
  readonly taskId: string;
  readonly state: string;
}

export interface WorkReadModel {
  /** The canonical ProjectIR. Throws when the project does not exist — a caller asked for it. */
  project(): ProjectIr;
  /** The canonical ProjectIR, or null when there is no such project. */
  projectOrNull(): ProjectIr | null;
  /** One task row, or null when this project has no such task. */
  task(taskId: string): WorkTaskRow | null;
  /** One attempt row, or null. */
  attempt(attemptId: string): WorkAttemptRow | null;
  /**
   * The envelope the task CURRENTLY carries, or null.
   *
   * `CurrentTaskEnvelope` — explicitly NOT the attempt's authorization. The two agree until a
   * rework rebinds the task, and then they are different facts (§D5-b1).
   */
  taskEnvelope(taskId: string): TaskEnvelope | null;
  /**
   * The envelope that authorized an ATTEMPT when it ran — resolved from the Event Log.
   *
   * `AttemptAuthorization(A0)` stays `E0` forever, however many times the task is reauthorized.
   * Fails closed rather than substituting today's authority.
   */
  attemptAuthorization(attemptId: string): AttemptAuthorization;
  /** Every attempt still holding the mutating lane (CREATED/LEASED/RUNNING). */
  openAttempts(): readonly WorkOpenAttempt[];
  /**
   * Every task's state, in the projection's own order — the quiescence input.
   *
   * A READ the head service and the record-set projections both need; it was being re-derived by
   * each consumer, which is the duplication §九 exists to remove.
   */
  taskStates(): readonly { readonly taskId: string; readonly state: string }[];
  /** Every attempt row, for the projections that report history rather than occupancy. */
  allAttempts(): readonly WorkAttemptRow[];
  /** The nonterminal attempt for one task, when exactly one exists. */
  openAttemptFor(taskId: string): WorkOpenAttempt | null;
}

/** The `envelope_json` column is read HERE and nowhere else in this layer (G10-W firewall). */
function envelopeIdOf(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  try {
    return parseTaskEnvelope(decodeJsonBlob(raw)).envelope_id;
  } catch {
    return null;
  }
}

function batchAnchorOf(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed = decodeJsonBlob(raw) as { batch_activation_event_id?: unknown };
    const value = parsed.batch_activation_event_id;
    return value === null || value === undefined ? null : Number(value);
  } catch {
    return null;
  }
}

function decodeJsonBlob(raw: unknown): Record<string, unknown> {
  if (!(raw instanceof Uint8Array)) {
    throw new DomainValidationError("projection JSON must be stored as BLOB bytes");
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(raw));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DomainValidationError("projection JSON must be an object");
  }
  return value as Record<string, unknown>;
}

export function makeWorkReadModel(input: {
  readonly connection: DatabaseSync;
  readonly projectId: string;
  /** The log, for the ONE read that is genuinely historical: attempt authorization. */
  readonly store: Pick<EventStore, "listEvents">;
}): WorkReadModel {
  const { connection, projectId } = input;

  const projectOrNull = (): ProjectIr | null => {
    const row = connection
      .prepare("SELECT state_json FROM projects WHERE project_id=?")
      .get(projectId) as { state_json: Uint8Array } | undefined;
    return row === undefined ? null : parseProjectIr(decodeJsonBlob(row.state_json));
  };

  const task = (taskId: string): WorkTaskRow | null => {
    const row = connection
      .prepare("SELECT state, state_json, last_event_id, envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(projectId, taskId) as
      | { state: unknown; state_json: Uint8Array; last_event_id: unknown; envelope_json: unknown }
      | undefined;
    if (row === undefined) return null;
    return Object.freeze({
      taskId,
      state: String(row.state),
      lastEventId: Number(row.last_event_id),
      batchActivationEventId: batchAnchorOf(row.state_json),
      envelopeId: envelopeIdOf(row.envelope_json),
    });
  };

  const attempt = (attemptId: string): WorkAttemptRow | null => {
    const row = connection
      .prepare("SELECT task_id, state, state_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(projectId, attemptId) as
      | { task_id: unknown; state: unknown; state_json: Uint8Array }
      | undefined;
    if (row === undefined) return null;
    return Object.freeze({
      attemptId,
      taskId: String(row.task_id ?? ""),
      state: String(row.state),
      batchActivationEventId: batchAnchorOf(row.state_json),
    });
  };

  const openAttempts = (): readonly WorkOpenAttempt[] => {
    const rows = connection
      .prepare("SELECT attempt_id, task_id, state FROM attempts WHERE project_id=? ORDER BY attempt_id")
      .all(projectId) as unknown as readonly { attempt_id: unknown; task_id: unknown; state: unknown }[];
    return Object.freeze(
      rows
        .filter((row) => ATTEMPT_OPEN_STATES.has(String(row.state)))
        .map((row) =>
          Object.freeze({
            attemptId: String(row.attempt_id),
            taskId: String(row.task_id ?? ""),
            state: String(row.state),
          }),
        ),
    );
  };

  return Object.freeze({
    project(): ProjectIr {
      const value = projectOrNull();
      if (value === null) throw new DomainValidationError("project does not exist");
      return value;
    },
    projectOrNull,
    task,
    attempt,
    taskEnvelope(taskId: string): TaskEnvelope | null {
      const row = connection
        .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
        .get(projectId, taskId) as { envelope_json: unknown } | undefined;
      if (row === undefined) return null;
      const raw = row.envelope_json;
      if (raw === null || raw === undefined) return null;
      try {
        return parseTaskEnvelope(decodeJsonBlob(raw));
      } catch {
        // An unreadable envelope is the CALLER's verdict to make, and the controller turns it into
        // a typed refusal. This reader reports what it can establish rather than throwing here.
        return null;
      }
    },
    attemptAuthorization(attemptId: string): AttemptAuthorization {
      const resolution = resolveAttemptAuthorization({
        projectId,
        attemptId,
        // The store's own list, adapted field-for-field; the resolver names no store implementation.
        events: authorizationEventsFrom((id) => input.store.listEvents(id)).listProjectEvents(projectId),
      });
      if (resolution.state === "UNRESOLVED") {
        throw new DomainValidationError(`ATTEMPT_AUTHORIZATION_UNRESOLVED: ${resolution.reason}: ${resolution.detail}`);
      }
      return resolution.authorization;
    },
    openAttempts,
    taskStates(): readonly { readonly taskId: string; readonly state: string }[] {
      const rows = connection
        .prepare("SELECT task_id, state FROM tasks WHERE project_id=?")
        .all(projectId) as unknown as readonly { task_id: unknown; state: unknown }[];
      return Object.freeze(rows.map((row) => ({ taskId: String(row.task_id), state: String(row.state) })));
    },
    allAttempts(): readonly WorkAttemptRow[] {
      const rows = connection
        .prepare("SELECT attempt_id, task_id, state, state_json FROM attempts WHERE project_id=? ORDER BY last_event_id")
        .all(projectId) as unknown as readonly { attempt_id: unknown; task_id: unknown; state: unknown; state_json: Uint8Array }[];
      return Object.freeze(
        rows.map((row) =>
          Object.freeze({
            attemptId: String(row.attempt_id),
            taskId: String(row.task_id ?? ""),
            state: String(row.state),
            batchActivationEventId: batchAnchorOf(row.state_json),
          }),
        ),
      );
    },
    openAttemptFor(taskId: string): WorkOpenAttempt | null {
      const held = openAttempts().filter((candidate) => candidate.taskId === taskId);
      return held.length === 1 ? held[0]! : null;
    },
  });
}
