/**
 * Authoritative aggregate validation shared by append and replay.
 *
 * Ported from palimpsest-repo palimpsest/domain/aggregate.py (phase0-2
 * unified baseline). Queries run against the projection tables inside the
 * caller's transaction; validation is fail-closed and identical on live
 * append and replay.
 */

import type { DatabaseSync } from "node:sqlite";

import {
  attemptReportDigestOf,
  canonicalDigest,
  parseProjectIr,
  parseTaskEnvelope,
  type AttemptReport,
  type NewEvent,
  type ProjectIr,
  type SchedulerEvent,
  type TaskEnvelope,
} from "../schema/index.js";
import { actionKey, stableEntityId } from "./idempotency.js";
import { TaskPolicy } from "./policy.js";
import {
  ATTEMPT_ALLOWED_SOURCES,
  ATTEMPT_EVENT_TARGET,
  ATTEMPT_OPEN_STATES,
  TASK_ACTIVE_STATES,
  TASK_ALLOWED_SOURCES,
  TASK_EVENT_TARGET,
  validateTaskGraph,
} from "./state_machine.js";
import {
  DomainValidationError,
  PolicyError,
  SchedulerInvariantError,
} from "./errors.js";

type Row = Record<string, any>;

function rowStr(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new SchedulerInvariantError(`${key} is not TEXT`);
  return value;
}

function rowNullableStr(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new SchedulerInvariantError(`${key} is not TEXT`);
  return value;
}

function rowInt(row: Row, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new SchedulerInvariantError(`${key} is not an INTEGER`);
  }
  return value;
}

function rowNullableInt(row: Row, key: string): number | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new SchedulerInvariantError(`${key} is not an INTEGER`);
  }
  return value;
}

function decodeJsonBlob(raw: unknown): Row {
  if (!(raw instanceof Uint8Array)) {
    throw new SchedulerInvariantError("projection JSON must be stored as BLOB bytes");
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(raw));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SchedulerInvariantError("projection JSON must be an object");
  }
  return value as Row;
}

function decodeNullableJsonBlob(raw: unknown): Row | null {
  return raw === null ? null : decodeJsonBlob(raw);
}

function envelopesEqual(left: TaskEnvelope, right: TaskEnvelope): boolean {
  return canonicalDigest(left) === canonicalDigest(right);
}

function listsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export class AggregateValidator {
  readonly #policies = new Map<string, TaskPolicy>();

  registerPolicy(policy: TaskPolicy): void {
    this.#policies.set(policyKey(policy.policy_id, policy.digest), policy);
  }

  requireRegisteredPolicy(policyId: string, policyDigest: string): void {
    if (!this.#policies.has(policyKey(policyId, policyDigest))) {
      throw new PolicyError("TaskEnvelope policy is not registered as trusted");
    }
  }

  /** Validate local trust required for a new Event, never for replay. */
  validateAdmission(connection: DatabaseSync, event: NewEvent): void {
    if (event.event_type !== "TASK_CREATED") return;
    const [, project] = this.#project(connection, event.project_id);
    const policyId = String(event.payload.policy_id);
    const policyDigest = String(event.payload.policy_digest);
    const policy = this.#policies.get(policyKey(policyId, policyDigest));
    if (policy === undefined) {
      throw new PolicyError("TaskEnvelope policy is not registered as trusted");
    }
    const authorized = policy.authorize(project, event.entity_id);
    const envelope = parseTaskEnvelope(event.payload.task_envelope);
    if (!envelopesEqual(authorized.envelope, envelope)) {
      throw new PolicyError("TaskEnvelope differs from the trusted policy output");
    }
  }

  validate(connection: DatabaseSync, event: NewEvent | SchedulerEvent): void {
    if (event.event_type in TASK_EVENT_TARGET) {
      this.#validateTaskTransition(connection, event);
    } else if (event.event_type in ATTEMPT_EVENT_TARGET) {
      this.#validateAttemptTransition(connection, event);
    } else {
      switch (event.event_type) {
        case "PROJECT_CREATED":
        case "PROJECT_REVISED":
          this.#validateProjectState(connection, event);
          return;
        case "TASK_CREATED":
          this.#validateTaskCreated(connection, event);
          return;
        case "ATTEMPT_CREATED":
          this.#validateAttemptCreated(connection, event);
          return;
        default:
          return;
      }
    }
  }

  #project(connection: DatabaseSync, projectId: string): [Row, ProjectIr] {
    const row = connection.prepare("SELECT * FROM projects WHERE project_id=?").get(projectId);
    if (row === undefined) {
      throw new DomainValidationError("project does not exist");
    }
    const record = row as Row;
    const state = decodeJsonBlob(record.state_json);
    try {
      const project = parseProjectIr(state);
      validateTaskGraph(project.tasks);
      return [record, project];
    } catch (error) {
      throw new DomainValidationError(
        withCause("ProjectIR task graph is invalid", error),
      );
    }
  }

  #validateProjectState(connection: DatabaseSync, event: NewEvent): void {
    void connection;
    try {
      const project = parseProjectIr(event.payload.project_ir);
      validateTaskGraph(project.tasks);
    } catch (error) {
      throw new DomainValidationError(
        withCause("ProjectIR task graph is invalid", error),
      );
    }
  }

  #validateTaskCreated(connection: DatabaseSync, event: NewEvent): void {
    const [, project] = this.#project(connection, event.project_id);
    const envelope = parseTaskEnvelope(event.payload.task_envelope);
    const task = project.tasks.find((item) => item.task_id === event.entity_id);
    if (task === undefined) {
      throw new DomainValidationError("Task is not declared by the current ProjectIR");
    }
    const matches =
      envelope.project_id === project.project_id &&
      envelope.task_id === task.task_id &&
      envelope.project_revision === project.revision &&
      envelope.project_digest === project.digest &&
      envelope.base_commit === project.head_commit &&
      envelope.objective === task.objective &&
      listsEqual(envelope.write_paths, task.write_paths) &&
      listsEqual(envelope.required_artifacts, task.required_artifacts);
    if (!matches) {
      throw new DomainValidationError("TaskEnvelope does not match ProjectIR.TaskSpec");
    }

    const policyId = String(event.payload.policy_id);
    const policyDigest = String(event.payload.policy_digest);
    void policyId;
    void policyDigest;
    if (event.idempotency_key !== envelope.idempotency_key) {
      throw new DomainValidationError("Task registration key is not deterministic");
    }

    const dependencies = task.depends_on;
    const states = new Map<string, string>();
    for (const row of connection
      .prepare("SELECT task_id, state FROM tasks WHERE project_id=?")
      .all(event.project_id) as Row[]) {
      states.set(rowStr(row, "task_id"), rowStr(row, "state"));
    }
    const ready = dependencies.every((dependency) => states.get(dependency) === "SATISFIED");
    const expectedState = ready ? "READY" : "BLOCKED";
    if (event.payload.initial_state !== expectedState) {
      throw new DomainValidationError("Task initial state does not match dependencies");
    }
  }

  #taskRow(connection: DatabaseSync, event: NewEvent): Row {
    const row = connection
      .prepare("SELECT * FROM tasks WHERE project_id=? AND task_id=?")
      .get(event.project_id, event.entity_id);
    if (row === undefined) {
      throw new DomainValidationError("task does not exist");
    }
    return row as Row;
  }

  #validateTaskTransition(connection: DatabaseSync, event: NewEvent): void {
    const row = this.#taskRow(connection, event);
    if (event.event_type !== "TASK_STALE") {
      const envelope = parseTaskEnvelope(decodeNullableJsonBlob(row.envelope_json));
      const [projectRow] = this.#project(connection, event.project_id);
      if (
        envelope.project_revision !== rowInt(projectRow, "revision") ||
        envelope.project_digest !== rowStr(projectRow, "digest") ||
        envelope.base_commit !== rowStr(projectRow, "head_commit")
      ) {
        throw new DomainValidationError("TaskEnvelope no longer matches Project head");
      }
    }
    const current = rowStr(row, "state");
    const previous = event.payload.previous_state as string | null;
    if (previous !== current) {
      throw new DomainValidationError("Task previous_state does not match projection");
    }
    if (!TASK_ALLOWED_SOURCES[event.event_type]?.has(current)) {
      throw new DomainValidationError(
        `illegal Task transition ${current} -> ${event.payload.new_state}`,
      );
    }
    if (event.payload.new_state !== TASK_EVENT_TARGET[event.event_type]) {
      throw new DomainValidationError("Task Event target state is inconsistent");
    }
    if (
      event.event_type !== "TASK_SATISFIED" &&
      event.event_type !== "TASK_STALE" &&
      event.causation_id !== rowInt(row, "last_event_id")
    ) {
      throw new DomainValidationError("Task transition must be caused by its current state Event");
    }

    switch (event.event_type) {
      case "TASK_STARTED":
        this.#validateTaskStarted(connection, event, row);
        return;
      case "TASK_READY":
        this.#validateTaskReady(connection, event, row);
        return;
      case "TASK_VERIFYING":
      case "TASK_FAILED":
        this.#validateBatchSettlement(connection, event, row);
        return;
      case "TASK_SATISFIED":
        this.#validateTaskSatisfied(connection, event, row);
        return;
      case "TASK_STALE":
        this.#validateTaskStale(connection, event, row);
        return;
      default:
        return;
    }
  }

  #validateTaskStarted(connection: DatabaseSync, event: NewEvent, row: Row): void {
    const active = connection
      .prepare(
        "SELECT task_id FROM tasks WHERE project_id=? AND state IN ('ACTIVE','VERIFYING')",
      )
      .all(event.project_id) as Row[];
    if (active.length > 0) {
      throw new SchedulerInvariantError("a project may have only one active logical Task");
    }
    const envelope = parseTaskEnvelope(decodeNullableJsonBlob(row.envelope_json));
    const count = rowInt(
      connection
        .prepare("SELECT COUNT(*) AS total FROM attempts WHERE project_id=? AND task_id=?")
        .get(event.project_id, event.entity_id) as Row,
      "total",
    );
    const remaining = envelope.attempt_limit - count;
    const expected = Math.min(envelope.candidate_limit, remaining);
    if (remaining <= 0 || event.payload.first_attempt_no !== count + 1) {
      throw new DomainValidationError("Task has no valid next attempt number");
    }
    if (event.payload.planned_candidate_count !== expected) {
      throw new DomainValidationError("planned candidate count is not deterministic");
    }
    const expectedKey = actionKey("task-activate-v1", {
      project_id: event.project_id,
      task_id: event.entity_id,
      envelope_id: envelope.envelope_id,
      project_revision: envelope.project_revision,
      project_digest: envelope.project_digest,
      first_attempt_no: count + 1,
      planned_candidate_count: expected,
    });
    if (event.idempotency_key !== expectedKey) {
      throw new DomainValidationError("Task activation key is not deterministic");
    }
  }

  #activation(connection: DatabaseSync, eventId: number): Row {
    const row = connection.prepare("SELECT * FROM events WHERE event_id=?").get(eventId);
    if (row === undefined || rowStr(row as Row, "event_type") !== "TASK_STARTED") {
      throw new DomainValidationError("batch anchor is not TASK_STARTED");
    }
    return row as Row;
  }

  /** Batch anchor + attempts by causation; public for the Scheduler (Python _current_batch). */
  currentBatch(
    connection: DatabaseSync,
    row: Row,
  ): [number, Row, Row[]] {
    const state = decodeNullableJsonBlob(row.state_json);
    if (state === null) {
      throw new DomainValidationError("Task has no batch anchor");
    }
    let activationId: number;
    if ("planned_candidate_count" in state) {
      activationId = rowInt(row, "last_event_id");
    } else if (state.batch_activation_event_id != null) {
      activationId = Number(state.batch_activation_event_id);
    } else {
      throw new DomainValidationError("Task has no batch anchor");
    }
    const activation = this.#activation(connection, activationId);
    // Query creation Events directly to avoid trusting mutable projection JSON for causation.
    const batchAttempts = connection
      .prepare(
        `
        SELECT a.*, e.causation_id, e.event_id AS created_event_id
        FROM attempts a
        JOIN events e ON e.project_id=a.project_id
                     AND e.entity_type='attempt'
                     AND e.entity_id=a.attempt_id
                     AND e.event_type='ATTEMPT_CREATED'
        WHERE a.project_id=? AND a.task_id=? AND e.causation_id=?
        ORDER BY json_extract(a.state_json, '$.attempt_no')
        `,
      )
      .all(rowStr(row, "project_id"), rowStr(row, "task_id"), activationId) as Row[];
    return [activationId, activation, batchAttempts];
  }

  #validateTaskReady(connection: DatabaseSync, event: NewEvent, row: Row): void {
    if (rowStr(row, "state") === "BLOCKED") {
      if (event.payload.batch_activation_event_id !== null) {
        throw new DomainValidationError("unblock Event must not reference a batch");
      }
      const [, project] = this.#project(connection, event.project_id);
      const task = project.tasks.find((item) => item.task_id === event.entity_id);
      if (task === undefined) {
        throw new DomainValidationError("Task is not declared by the current ProjectIR");
      }
      const states = new Map<string, string>();
      for (const item of connection
        .prepare("SELECT task_id, state FROM tasks WHERE project_id=?")
        .all(event.project_id) as Row[]) {
        states.set(rowStr(item, "task_id"), rowStr(item, "state"));
      }
      if (!task.depends_on.every((dep) => states.get(dep) === "SATISFIED")) {
        throw new DomainValidationError("Task dependencies are not satisfied");
      }
      const expectedKey = actionKey("task-unblock-v1", {
        project_id: event.project_id,
        task_id: event.entity_id,
        project_revision: project.revision,
        project_digest: project.digest,
      });
      if (event.idempotency_key !== expectedKey) {
        throw new DomainValidationError("Task unblock key is not deterministic");
      }
      return;
    }
    this.#validateBatchSettlement(connection, event, row);
  }

  #validateBatchSettlement(connection: DatabaseSync, event: NewEvent, row: Row): void {
    const [activationId, activation, attempts] = this.currentBatch(connection, row);
    const activationPayload = decodeJsonBlob(activation.payload_json);
    if (event.payload.batch_activation_event_id !== activationId) {
      throw new DomainValidationError("settlement references a stale batch");
    }
    const planned = Number(activationPayload.planned_candidate_count);
    if (attempts.length !== planned) {
      throw new DomainValidationError("batch cannot settle before all candidates exist");
    }
    if (attempts.some((attempt) => ATTEMPT_OPEN_STATES.has(rowStr(attempt, "state")))) {
      throw new DomainValidationError("batch cannot settle while an Attempt is open");
    }
    const completed = attempts.some((attempt) => rowStr(attempt, "state") === "COMPLETED");
    const total = rowInt(
      connection
        .prepare("SELECT COUNT(*) AS total FROM attempts WHERE project_id=? AND task_id=?")
        .get(event.project_id, event.entity_id) as Row,
      "total",
    );
    const envelope = parseTaskEnvelope(decodeNullableJsonBlob(row.envelope_json));
    if (rowStr(row, "state") === "ACTIVE") {
      if (event.event_type === "TASK_VERIFYING" && !completed) {
        throw new DomainValidationError("VERIFYING requires a completed candidate");
      }
      if (
        (event.event_type === "TASK_READY" || event.event_type === "TASK_FAILED") &&
        completed
      ) {
        throw new DomainValidationError("completed candidates must enter VERIFYING");
      }
    } else if (rowStr(row, "state") === "VERIFYING" && !completed) {
      throw new DomainValidationError("VERIFYING Task has no completed candidate");
    }
    if (event.event_type === "TASK_READY" && total >= envelope.attempt_limit) {
      throw new DomainValidationError("attempt limit is exhausted");
    }
    if (event.event_type === "TASK_FAILED" && total !== envelope.attempt_limit) {
      throw new DomainValidationError("Task may fail only when attempt limit is exhausted");
    }
    const expectedKey = actionKey("task-batch-settle-v1", {
      project_id: event.project_id,
      task_id: event.entity_id,
      batch_activation_event_id: activationId,
      target_state: event.payload.new_state,
    });
    if (event.idempotency_key !== expectedKey) {
      throw new DomainValidationError("batch settlement key is not deterministic");
    }
  }

  #validateTaskSatisfied(connection: DatabaseSync, event: NewEvent, row: Row): void {
    if (event.causation_id === null) {
      throw new DomainValidationError("TASK_SATISFIED requires promotion causation");
    }
    const promotion = connection
      .prepare("SELECT * FROM events WHERE event_id=?")
      .get(event.causation_id);
    if (promotion === undefined || rowStr(promotion as Row, "event_type") !== "PROMOTION_COMMITTED") {
      throw new DomainValidationError("TASK_SATISFIED cause must be PROMOTION_COMMITTED");
    }
    const payload = decodeJsonBlob((promotion as Row).payload_json);
    const attempt = connection
      .prepare("SELECT * FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(event.project_id, payload.attempt_id);
    if (
      attempt === undefined ||
      rowStr(attempt as Row, "task_id") !== event.entity_id ||
      rowStr(attempt as Row, "state") !== "COMPLETED"
    ) {
      throw new DomainValidationError("promotion does not identify a completed Task candidate");
    }
    const [activationId, , attempts] = this.currentBatch(connection, row);
    if (!attempts.some((item) => rowStr(item, "attempt_id") === payload.attempt_id)) {
      throw new DomainValidationError("promotion Attempt is not in the current batch");
    }
    if (event.payload.batch_activation_event_id !== activationId) {
      throw new DomainValidationError("TASK_SATISFIED references a stale batch");
    }
    const envelope = parseTaskEnvelope(decodeNullableJsonBlob(row.envelope_json));
    const [projectRow] = this.#project(connection, event.project_id);
    if (
      envelope.project_revision !== rowInt(projectRow, "revision") ||
      envelope.project_digest !== rowStr(projectRow, "digest") ||
      envelope.base_commit !== rowStr(projectRow, "head_commit")
    ) {
      throw new DomainValidationError("TaskEnvelope no longer matches Project head");
    }
    const report = decodeNullableJsonBlob((attempt as Row).report_json);
    if (
      report === null ||
      report.envelope_id !== envelope.envelope_id ||
      Number(report.input_project_revision) !== envelope.project_revision ||
      report.input_project_digest !== envelope.project_digest ||
      report.base_commit !== envelope.base_commit
    ) {
      throw new DomainValidationError("promotion Attempt input world is stale");
    }
    if (
      payload.source_commit !== (report.result_commit ?? null) ||
      payload.expected_head_commit !== envelope.base_commit
    ) {
      throw new DomainValidationError("promotion does not match candidate commits");
    }
    const used = connection
      .prepare(
        "SELECT entity_id FROM events WHERE event_type='TASK_SATISFIED' AND causation_id=?",
      )
      .get(event.causation_id);
    if (used !== undefined) {
      throw new DomainValidationError("promotion already satisfied another Task");
    }
    const expectedKey = actionKey("task-satisfy-v1", {
      project_id: event.project_id,
      task_id: event.entity_id,
      batch_activation_event_id: activationId,
      promotion_event_id: event.causation_id,
    });
    if (event.idempotency_key !== expectedKey) {
      throw new DomainValidationError("Task satisfy key is not deterministic");
    }
  }

  #validateTaskStale(connection: DatabaseSync, event: NewEvent, row: Row): void {
    if (event.causation_id !== rowInt(row, "last_event_id")) {
      throw new DomainValidationError(
        "Task stale Event must be caused by its current state Event",
      );
    }
    const batchId = event.payload.batch_activation_event_id as number | null;
    if (TASK_ACTIVE_STATES.has(rowStr(row, "state"))) {
      const [currentId] = this.currentBatch(connection, row);
      if (batchId !== currentId) {
        throw new DomainValidationError("active Task stale Event references wrong batch");
      }
    } else if (batchId !== null) {
      throw new DomainValidationError("non-active Task stale Event must not reference batch");
    }
    const expectedKey = actionKey("task-stale-v1", {
      project_id: event.project_id,
      task_id: event.entity_id,
      previous_state: rowStr(row, "state"),
      batch_activation_event_id: batchId,
    });
    if (event.idempotency_key !== expectedKey) {
      throw new DomainValidationError("Task stale key is not deterministic");
    }
  }

  #validateAttemptCreated(connection: DatabaseSync, event: NewEvent): void {
    const task = connection
      .prepare("SELECT * FROM tasks WHERE project_id=? AND task_id=?")
      .get(event.project_id, String(event.payload.task_id));
    if (task === undefined || rowStr(task as Row, "state") !== "ACTIVE") {
      throw new DomainValidationError("Attempt creation requires an ACTIVE Task");
    }
    const envelope = parseTaskEnvelope(decodeNullableJsonBlob((task as Row).envelope_json));
    if (event.payload.envelope_id !== envelope.envelope_id) {
      throw new DomainValidationError("Attempt envelope does not match Task");
    }
    const [activationId, activation, attempts] = this.currentBatch(connection, task as Row);
    if (event.causation_id !== activationId) {
      throw new DomainValidationError("Attempt must be caused by current TASK_STARTED");
    }
    const activationPayload = decodeJsonBlob(activation.payload_json);
    const expectedNo = Number(activationPayload.first_attempt_no) + attempts.length;
    if (attempts.length >= Number(activationPayload.planned_candidate_count)) {
      throw new DomainValidationError("current batch already has all candidates");
    }
    if (event.payload.attempt_no !== expectedNo) {
      throw new DomainValidationError("Attempt numbers must be continuous");
    }
    const digest = actionKey("attempt-create-v1", {
      project_id: event.project_id,
      task_id: event.payload.task_id,
      envelope_id: envelope.envelope_id,
      project_revision: envelope.project_revision,
      project_digest: envelope.project_digest,
      batch_activation_event_id: activationId,
      attempt_no: expectedNo,
    });
    if (
      event.idempotency_key !== digest ||
      event.entity_id !== stableEntityId("attempt", digest)
    ) {
      throw new DomainValidationError("Attempt identity is not deterministic");
    }
  }

  #validateAttemptTransition(connection: DatabaseSync, event: NewEvent): void {
    const row = connection
      .prepare("SELECT * FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(event.project_id, event.entity_id);
    if (row === undefined) {
      throw new DomainValidationError("attempt does not exist");
    }
    const attempt = row as Row;
    const current = rowStr(attempt, "state");
    if (event.payload.previous_state !== current) {
      throw new DomainValidationError("Attempt previous_state does not match projection");
    }
    if (!ATTEMPT_ALLOWED_SOURCES[event.event_type]?.has(current)) {
      throw new DomainValidationError(
        `illegal Attempt transition ${current} -> ${event.payload.new_state}`,
      );
    }
    if (event.causation_id !== rowInt(attempt, "last_event_id")) {
      throw new DomainValidationError(
        "Attempt transition must be caused by its current state Event",
      );
    }
    const report = event.payload.attempt_report as AttemptReport | null | undefined;
    if (event.event_type === "ATTEMPT_LATE_RESULT" && (report === null || report === undefined)) {
      throw new DomainValidationError("late result requires an AttemptReport");
    }
    if (report !== null && report !== undefined) {
      const task = connection
        .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
        .get(event.project_id, rowNullableStr(attempt, "task_id"));
      if (task === undefined) {
        throw new DomainValidationError("attempt does not exist");
      }
      const envelope = parseTaskEnvelope(decodeNullableJsonBlob((task as Row).envelope_json));
      if (
        report.project_id !== event.project_id ||
        report.attempt_id !== event.entity_id ||
        report.task_id !== attempt.task_id ||
        report.envelope_id !== envelope.envelope_id ||
        report.input_project_revision !== envelope.project_revision ||
        report.input_project_digest !== envelope.project_digest ||
        report.base_commit !== envelope.base_commit
      ) {
        throw new DomainValidationError("AttemptReport input identity does not match");
      }
    }
    if (
      event.event_type === "ATTEMPT_COMPLETED" ||
      event.event_type === "ATTEMPT_FAILED" ||
      event.event_type === "ATTEMPT_EXPIRED" ||
      event.event_type === "ATTEMPT_CANCELLED" ||
      event.event_type === "ATTEMPT_LATE_RESULT"
    ) {
      const expected = actionKey("attempt-callback-v1", {
        attempt_id: event.entity_id,
        terminal_event_type: event.event_type,
        attempt_report_digest:
          report === null || report === undefined ? null : attemptReportDigestOf(report),
      });
      if (event.idempotency_key !== expected) {
        throw new DomainValidationError("callback idempotency key is not deterministic");
      }
    }
  }

  validateGlobalInvariants(connection: DatabaseSync, projectId: string): void {
    const active = connection
      .prepare(
        "SELECT * FROM tasks WHERE project_id=? AND state IN ('ACTIVE','VERIFYING')",
      )
      .all(projectId) as Row[];
    if (active.length > 1) {
      throw new SchedulerInvariantError("multiple ACTIVE/VERIFYING Tasks detected");
    }
    for (const task of active) {
      const envelope = parseTaskEnvelope(decodeNullableJsonBlob(task.envelope_json));
      const [project] = this.#project(connection, projectId);
      if (
        envelope.project_revision !== rowInt(project, "revision") ||
        envelope.project_digest !== rowStr(project, "digest") ||
        envelope.base_commit !== rowStr(project, "head_commit")
      ) {
        throw new SchedulerInvariantError("active Task input world is stale");
      }
      const numbers: number[] = [];
      for (const row of connection
        .prepare(
          `
          SELECT payload_json FROM events
          WHERE project_id=? AND event_type='ATTEMPT_CREATED'
            AND json_extract(payload_json, '$.task_id')=?
          ORDER BY event_id
          `,
        )
        .all(projectId, rowStr(task, "task_id")) as Row[]) {
        numbers.push(Number(decodeJsonBlob(row.payload_json).attempt_no));
      }
      const sorted = [...numbers].sort((a, b) => a - b);
      const expected = Array.from({ length: numbers.length }, (_, index) => index + 1);
      if (sorted.length !== expected.length || sorted.some((value, index) => value !== expected[index])) {
        throw new SchedulerInvariantError("Attempt numbers are not continuous");
      }
    }
  }
}

function policyKey(policyId: string, digest: string): string {
  return `${policyId}\u0000${digest}`;
}

function withCause(message: unknown, cause: unknown): string {
  const text = typeof message === "string" ? message : String(message);
  const detail = cause instanceof Error ? cause.message : String(cause);
  return detail.length > 0 ? `${text} (${detail})` : text;
}
