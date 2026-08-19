/**
 * One-Event-at-a-time deterministic Scheduler.
 *
 * Ported from palimpsest-repo palimpsest/scheduler/scheduler.py (phase0-2
 * unified baseline). A pure controller: it inspects projections and appends
 * at most one Event per decision. The promotion *execution* itself lands in
 * PromotionManager (P1) using Ordarium Safe Actions; this class consumes
 * committed PROMOTION_COMMITTED events exactly like the Python baseline.
 */

import type { DatabaseSync } from "node:sqlite";

import {
  actionKey,
  stableEntityId,
  ATTEMPT_OPEN_STATES,
  type AggregateValidator,
  type AuthorizedTaskEnvelope,
  type TaskPolicy,
} from "../domain/index.js";
import {
  attemptReportDigestOf,
  parseProjectIr,
  parseTaskEnvelope,
  parseNewEvent,
  type AttemptReport,
  type EventType,
  type NewEvent,
  type ProjectIr,
  type SchedulerEvent,
  type TaskEnvelope,
} from "../schema/index.js";
import { DomainValidationError } from "../domain/errors.js";
import type { EventStore } from "../state/index.js";

type Row = Record<string, any>;

function decodeJsonBlob(raw: unknown): Row {
  if (!(raw instanceof Uint8Array)) {
    throw new DomainValidationError("projection JSON must be stored as BLOB bytes");
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(raw));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DomainValidationError("projection JSON must be an object");
  }
  return value as Row;
}

export class Scheduler {
  readonly store: EventStore;
  readonly projectId: string;

  constructor(store: EventStore, projectId: string) {
    this.store = store;
    this.projectId = projectId;
  }

  get connection(): DatabaseSync {
    return this.store.connection;
  }

  registerPolicy(policy: TaskPolicy): void {
    this.store.registerPolicy(policy);
  }

  #project(): ProjectIr {
    const row = this.connection
      .prepare("SELECT state_json FROM projects WHERE project_id=?")
      .get(this.projectId) as Row | undefined;
    if (row === undefined) {
      throw new DomainValidationError("project does not exist");
    }
    return parseProjectIr(decodeJsonBlob(row.state_json));
  }

  registerTask(authorized: AuthorizedTaskEnvelope): SchedulerEvent {
    const envelope = authorized.envelope;
    if (envelope.project_id !== this.projectId) {
      throw new DomainValidationError("authorized Task belongs to another project");
    }
    const project = this.#project();
    const task = project.tasks.find((item) => item.task_id === envelope.task_id);
    if (task === undefined) {
      throw new DomainValidationError("Task is not declared by ProjectIR");
    }
    const states = new Map<string, string>();
    for (const row of this.connection
      .prepare("SELECT task_id, state FROM tasks WHERE project_id=?")
      .all(this.projectId) as Row[]) {
      states.set(String(row.task_id), String(row.state));
    }
    const initial = task.depends_on.every(
      (dependency) => states.get(dependency) === "SATISFIED",
    )
      ? "READY"
      : "BLOCKED";
    this.store.aggregateValidator.requireRegisteredPolicy(
      authorized.policy_id,
      authorized.policy_digest,
    );
    return this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "TASK_CREATED",
        payload_version: 1,
        entity_type: "task",
        entity_id: envelope.task_id,
        payload: {
          task_envelope: envelope,
          initial_state: initial,
          policy_id: authorized.policy_id,
          policy_digest: authorized.policy_digest,
        },
        causation_id: null,
        correlation_id: `task:${envelope.task_id}`,
        idempotency_key: envelope.idempotency_key,
        expected_project_revision: envelope.project_revision,
      }),
    );
  }

  runOnce(): SchedulerEvent | null {
    const decision = this.decide();
    return decision === null ? null : this.commit(decision);
  }

  /**
   * Pure scheduler decision (E1, docs/02 §3.1): inspects projections and
   * returns the *prepared* next event — exactly what commit() would persist —
   * or null when idle. It never writes. The plan-mode preview surface and the
   * run loop both ride on this, so a preview is byte-identical to the next
   * committed event.
   */
  decide(): NewEvent | null {
    const validator: AggregateValidator = this.store.aggregateValidator;
    validator.validateGlobalInvariants(this.connection, this.projectId);
    const control = this.connection
      .prepare("SELECT state FROM scheduler_control WHERE project_id=?")
      .get(this.projectId) as { state: string } | undefined;
    if (control === undefined) {
      throw new DomainValidationError("scheduler control projection is missing");
    }
    if (control.state === "PAUSED") return null;

    const active = this.connection
      .prepare("SELECT * FROM tasks WHERE project_id=? AND state='ACTIVE'")
      .get(this.projectId) as Row | undefined;
    if (active !== undefined) return this.#advanceActive(active);

    const verifying = this.connection
      .prepare("SELECT * FROM tasks WHERE project_id=? AND state='VERIFYING'")
      .get(this.projectId) as Row | undefined;
    if (verifying !== undefined) return this.#advanceVerifying(verifying);

    const project = this.#project();
    const taskRows = new Map<string, Row>();
    for (const row of this.connection
      .prepare("SELECT * FROM tasks WHERE project_id=?")
      .all(this.projectId) as Row[]) {
      taskRows.set(String(row.task_id), row);
    }
    for (const task of project.tasks) {
      const row = taskRows.get(task.task_id);
      if (row === undefined || String(row.state) !== "BLOCKED") continue;
      if (
        task.depends_on.every(
          (dependency) =>
            taskRows.has(dependency) &&
            String(taskRows.get(dependency)!.state) === "SATISFIED",
        )
      ) {
        return this.#taskTransition(row, {
          eventType: "TASK_READY",
          reason: "all dependencies satisfied",
          batchActivationEventId: null,
          key: actionKey("task-unblock-v1", {
            project_id: this.projectId,
            task_id: task.task_id,
            project_revision: project.revision,
            project_digest: project.digest,
          }),
        });
      }
    }

    for (const task of project.tasks) {
      const row = taskRows.get(task.task_id);
      if (row !== undefined && String(row.state) === "READY") {
        return this.#activate(row);
      }
    }
    return null;
  }

  /** Commit a prepared decision through the normal append pipeline. */
  commit(decision: NewEvent): SchedulerEvent {
    return this.store.append(decision);
  }

  #activate(task: Row): NewEvent {
    const envelope = parseTaskEnvelope(decodeJsonBlob(task.envelope_json));
    const count = Number(
      (
        this.connection
          .prepare("SELECT COUNT(*) AS total FROM attempts WHERE project_id=? AND task_id=?")
          .get(this.projectId, task.task_id) as Row
      ).total,
    );
    const remaining = envelope.attempt_limit - count;
    if (remaining <= 0) {
      throw new DomainValidationError("READY Task has exhausted its attempt limit");
    }
    const planned = Math.min(envelope.candidate_limit, remaining);
    const first = count + 1;
    const key = actionKey("task-activate-v1", {
      project_id: this.projectId,
      task_id: task.task_id,
      envelope_id: envelope.envelope_id,
      project_revision: envelope.project_revision,
      project_digest: envelope.project_digest,
      first_attempt_no: first,
      planned_candidate_count: planned,
    });
    return parseNewEvent({
      schema_version: 1,
      project_id: this.projectId,
      event_type: "TASK_STARTED",
        payload_version: 1,
        entity_type: "task",
        entity_id: task.task_id,
        payload: {
          previous_state: "READY",
          new_state: "ACTIVE",
          reason: "deterministic batch activation",
          planned_candidate_count: planned,
          first_attempt_no: first,
        },
      causation_id: task.last_event_id,
      correlation_id: `task:${task.task_id}:batch:${first}`,
      idempotency_key: key,
      expected_project_revision: envelope.project_revision,
    });
  }

  #advanceActive(task: Row): NewEvent | null {
    const [activationId, activation, attempts] = this.#currentBatch(task);
    const activationPayload = decodeJsonBlob(activation.payload_json);
    const planned = Number(activationPayload.planned_candidate_count);
    if (attempts.length < planned) {
      return this.#createAttempt(task, activationId, activationPayload, attempts.length);
    }
    if (attempts.some((attempt) => ATTEMPT_OPEN_STATES.has(String(attempt.state)))) {
      return null;
    }

    const completed = attempts.some((attempt) => String(attempt.state) === "COMPLETED");
    const envelope = parseTaskEnvelope(decodeJsonBlob(task.envelope_json));
    const total = Number(
      (
        this.connection
          .prepare("SELECT COUNT(*) AS total FROM attempts WHERE project_id=? AND task_id=?")
          .get(this.projectId, task.task_id) as Row
      ).total,
    );
    let eventType: EventType;
    let reason: string;
    if (completed) {
      eventType = "TASK_VERIFYING";
      reason = "batch has a completed candidate";
    } else if (total < envelope.attempt_limit) {
      eventType = "TASK_READY";
      reason = "batch failed with attempt budget remaining";
    } else {
      eventType = "TASK_FAILED";
      reason = "attempt limit exhausted";
    }
    const target = {
      TASK_VERIFYING: "VERIFYING",
      TASK_READY: "READY",
      TASK_FAILED: "FAILED",
    }[eventType] as string;
    return this.#taskTransition(task, {
      eventType,
      reason,
      batchActivationEventId: activationId,
      key: actionKey("task-batch-settle-v1", {
        project_id: this.projectId,
        task_id: task.task_id,
        batch_activation_event_id: activationId,
        target_state: target,
      }),
    });
  }

  #createAttempt(
    task: Row,
    activationId: number,
    activationPayload: Row,
    batchCount: number,
  ): NewEvent {
    const envelope = parseTaskEnvelope(decodeJsonBlob(task.envelope_json));
    const attemptNo = Number(activationPayload.first_attempt_no) + batchCount;
    const key = actionKey("attempt-create-v1", {
      project_id: this.projectId,
      task_id: task.task_id,
      envelope_id: envelope.envelope_id,
      project_revision: envelope.project_revision,
      project_digest: envelope.project_digest,
      batch_activation_event_id: activationId,
      attempt_no: attemptNo,
    });
    return parseNewEvent({
      schema_version: 1,
      project_id: this.projectId,
      event_type: "ATTEMPT_CREATED",
        payload_version: 1,
        entity_type: "attempt",
        entity_id: stableEntityId("attempt", key),
        payload: {
          task_id: task.task_id,
          envelope_id: envelope.envelope_id,
          attempt_no: attemptNo,
        },
      causation_id: activationId,
      correlation_id: `task:${task.task_id}:batch:${activationId}`,
      idempotency_key: key,
      expected_project_revision: envelope.project_revision,
    });
  }

  #taskTransition(
    task: Row,
    options: {
      eventType: EventType;
      reason: string;
      batchActivationEventId: number | null;
      key: string;
      causationId?: number | null;
    },
  ): NewEvent {
    const targets: Partial<Record<EventType, string>> = {
      TASK_READY: "READY",
      TASK_VERIFYING: "VERIFYING",
      TASK_SATISFIED: "SATISFIED",
      TASK_FAILED: "FAILED",
    };
    const envelope = parseTaskEnvelope(decodeJsonBlob(task.envelope_json));
    return parseNewEvent({
      schema_version: 1,
      project_id: this.projectId,
      event_type: options.eventType,
        payload_version: 1,
        entity_type: "task",
        entity_id: task.task_id,
        payload: {
          previous_state: task.state,
          new_state: targets[options.eventType],
          reason: options.reason,
          batch_activation_event_id: options.batchActivationEventId,
        },
      causation_id: options.causationId ?? task.last_event_id,
      correlation_id: `task:${task.task_id}`,
      idempotency_key: options.key,
      expected_project_revision: envelope.project_revision,
    });
  }

  #advanceVerifying(task: Row): NewEvent | null {
    const [activationId, , attempts] = this.#currentBatch(task);
    const completedIds = new Set(
      attempts
        .filter((attempt) => String(attempt.state) === "COMPLETED")
        .map((attempt) => String(attempt.attempt_id)),
    );
    const promotions = this.connection
      .prepare(
        "SELECT * FROM events WHERE project_id=? AND event_type='PROMOTION_COMMITTED' ORDER BY event_id",
      )
      .all(this.projectId) as Row[];
    for (const promotion of promotions) {
      const payload = decodeJsonBlob(promotion.payload_json);
      if (!completedIds.has(String(payload.attempt_id))) continue;
      const key = actionKey("task-satisfy-v1", {
        project_id: this.projectId,
        task_id: task.task_id,
        batch_activation_event_id: activationId,
        promotion_event_id: promotion.event_id,
      });
      return this.#taskTransition(task, {
        eventType: "TASK_SATISFIED",
        reason: "matching promotion committed",
        batchActivationEventId: activationId,
        key,
        causationId: promotion.event_id,
      });
    }
    return null;
  }

  /** The batch anchor + attempts by causation (Python _current_batch). */
  #currentBatch(task: Row): [number, Row, Row[]] {
    return this.store.aggregateValidator.currentBatch(this.connection, task);
  }

  startAttempt(attemptId: string): SchedulerEvent {
    const [row, envelope] = this.#attemptContext(attemptId);
    const key = actionKey("attempt-start-v1", {
      attempt_id: attemptId,
      previous_state: row.state,
    });
    return this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "ATTEMPT_STARTED",
        payload_version: 1,
        entity_type: "attempt",
        entity_id: attemptId,
        payload: {
          previous_state: row.state,
          new_state: "RUNNING",
          lease_generation: null,
          reason: "Phase 2 deterministic mock start",
        },
        causation_id: row.last_event_id,
        correlation_id: `attempt:${attemptId}`,
        idempotency_key: key,
        expected_project_revision: envelope.project_revision,
      }),
    );
  }

  recordCallback(
    attemptId: string,
    eventType: EventType,
    report: AttemptReport | null,
  ): SchedulerEvent {
    const allowed: Partial<Record<EventType, string>> = {
      ATTEMPT_COMPLETED: "COMPLETED",
      ATTEMPT_FAILED: "FAILED",
      ATTEMPT_EXPIRED: "EXPIRED",
      ATTEMPT_CANCELLED: "CANCELLED",
      ATTEMPT_LATE_RESULT: "STALE",
    };
    if (allowed[eventType] === undefined) {
      throw new DomainValidationError("unsupported terminal callback EventType");
    }
    const [row, envelope] = this.#attemptContext(attemptId);
    // Python canonicalizes datetime in model_dump(mode="python") before the
    // digest; the micro-form digest is what the aggregate recomputes.
    const reportDigest =
      report === null ? null : attemptReportDigestOf(report);
    const key = actionKey("attempt-callback-v1", {
      attempt_id: attemptId,
      terminal_event_type: eventType,
      attempt_report_digest: reportDigest,
    });
    const existing = this.connection
      .prepare("SELECT event_id FROM events WHERE project_id=? AND idempotency_key=?")
      .get(this.projectId, key) as { event_id: number } | undefined;
    if (existing !== undefined) {
      const committed = this.store.getEvent(existing.event_id);
      if (committed === undefined) {
        throw new DomainValidationError("committed callback Event is missing");
      }
      return committed;
    }
    const payload: Record<string, unknown> = {
      previous_state: row.state,
      new_state: allowed[eventType],
      lease_generation: null,
      reason: "deterministic callback",
    };
    if (
      eventType === "ATTEMPT_COMPLETED" ||
      eventType === "ATTEMPT_FAILED" ||
      eventType === "ATTEMPT_LATE_RESULT" ||
      eventType === "ATTEMPT_EXPIRED" ||
      eventType === "ATTEMPT_CANCELLED" ||
      report !== null
    ) {
      payload.attempt_report = report;
    }
    return this.store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: eventType,
        payload_version: 1,
        entity_type: "attempt",
        entity_id: attemptId,
        payload,
        causation_id: row.last_event_id,
        correlation_id: `attempt:${attemptId}`,
        idempotency_key: key,
        expected_project_revision: envelope.project_revision,
      }),
    );
  }

  #attemptContext(attemptId: string): [Row, TaskEnvelope] {
    const row = this.connection
      .prepare("SELECT * FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(this.projectId, attemptId) as Row | undefined;
    if (row === undefined) {
      throw new DomainValidationError("attempt does not exist");
    }
    const task = this.connection
      .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(this.projectId, row.task_id) as Row | undefined;
    if (task === undefined) {
      throw new DomainValidationError("attempt does not exist");
    }
    return [row, parseTaskEnvelope(decodeJsonBlob(task.envelope_json))];
  }
}
