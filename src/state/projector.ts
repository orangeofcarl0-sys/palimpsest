/** Deterministic materialized projections for the unified baseline. */

import type { DatabaseSync } from "node:sqlite";

import { canonicalJsonBytes, isoformatDatetime } from "../schema/index.js";
import type { SchedulerEvent } from "../schema/index.js";
import { ControlGenerationConflict, ProjectionError } from "./errors.js";

export const PROJECTION_NAME = "core";
export const PROJECTION_SCHEMA_VERSION = 1;

type Row = Record<string, any>;

function jsonBytes(value: unknown): Uint8Array {
  return canonicalJsonBytes(value);
}

function requireUpdated(changes: number | bigint, message: string): void {
  if (Number(changes) !== 1) throw new ProjectionError(message);
}

export class CoreProjector {
  readonly name = PROJECTION_NAME;
  readonly schemaVersion = PROJECTION_SCHEMA_VERSION;

  apply(connection: DatabaseSync, event: SchedulerEvent): void {
    this.#verifyCursor(connection, event);
    switch (event.event_type) {
      case "PROJECT_CREATED":
        this.#applyProjectCreated(connection, event);
        break;
      case "PROJECT_REVISED":
        this.#applyProjectRevised(connection, event);
        break;
      case "TASK_CREATED":
        this.#applyTaskCreated(connection, event);
        break;
      case "ATTEMPT_CREATED":
        this.#applyAttemptCreated(connection, event);
        break;
      case "EVIDENCE_ADDED":
        this.#applyEvidenceAdded(connection, event);
        break;
      case "EVIDENCE_STALE":
        this.#applyEvidenceStale(connection, event);
        break;
      case "SCHEDULER_PAUSED":
        this.#applySchedulerPaused(connection, event);
        break;
      case "SCHEDULER_RESUMED":
        this.#applySchedulerResumed(connection, event);
        break;
      case "TASK_BLOCKED":
      case "TASK_READY":
      case "TASK_STARTED":
      case "TASK_VERIFYING":
      case "TASK_SATISFIED":
      case "TASK_FAILED":
      case "TASK_STALE":
        this.#applyTaskTransition(connection, event);
        break;
      case "ATTEMPT_LEASED":
      case "ATTEMPT_STARTED":
      case "ATTEMPT_COMPLETED":
      case "ATTEMPT_FAILED":
      case "ATTEMPT_EXPIRED":
      case "ATTEMPT_CANCELLED":
      case "ATTEMPT_LATE_RESULT":
        this.#applyAttemptTransition(connection, event);
        break;
      case "PROMOTION_PREPARED":
      case "PROMOTION_GIT_STARTED":
      case "PROMOTION_GIT_COMPLETED":
      case "PROMOTION_COMMITTED":
      case "PROMOTION_FAILED":
        this.#applyPromotion(connection, event);
        break;
      case "JUDGE_DECLARED":
        this.#applyJudgeDeclared(connection, event);
        break;
      case "CANDIDATE_SELECTED":
        this.#applyCandidateSelected(connection, event);
        break;
      case "MANUAL_APPROVAL_RECORDED":
        break;
    }
    this.#advanceCursor(connection, event);
  }

  #verifyCursor(connection: DatabaseSync, event: SchedulerEvent): void {
    const row = connection
      .prepare(
        "SELECT last_project_sequence FROM projection_cursors WHERE projection_name=? AND project_id=?",
      )
      .get(this.name, event.project_id) as { last_project_sequence: number } | undefined;
    if (row === undefined) {
      if (event.project_sequence !== 1) {
        throw new ProjectionError("first projected Event must have project_sequence 1");
      }
      return;
    }
    if (row.last_project_sequence + 1 !== event.project_sequence) {
      throw new ProjectionError("projection cursor is not contiguous");
    }
  }

  #advanceCursor(connection: DatabaseSync, event: SchedulerEvent): void {
    connection
      .prepare(
        `
        INSERT INTO projection_cursors(
            projection_name, project_id, projection_schema_version,
            last_applied_event_id, last_project_sequence,
            last_event_digest, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(projection_name, project_id) DO UPDATE SET
            projection_schema_version=excluded.projection_schema_version,
            last_applied_event_id=excluded.last_applied_event_id,
            last_project_sequence=excluded.last_project_sequence,
            last_event_digest=excluded.last_event_digest,
            updated_at=excluded.updated_at
        `,
      )
      .run(
        this.name,
        event.project_id,
        this.schemaVersion,
        event.event_id,
        event.project_sequence,
        event.event_digest,
        isoformatDatetime(event.committed_at),
      );
  }

  #applyProjectCreated(connection: DatabaseSync, event: SchedulerEvent): void {
    const project = event.payload.project_ir as Row;
    try {
      connection
        .prepare(
          `
          INSERT INTO projects(
              project_id, revision, digest, head_commit, state_json,
              last_event_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          event.project_id,
          project.revision,
          project.digest,
          project.head_commit,
          jsonBytes(project),
          event.event_id,
          isoformatDatetime(event.committed_at),
        );
      connection
        .prepare(
          `
          INSERT INTO scheduler_control(
              project_id, state, generation, last_event_id, updated_at
          ) VALUES (?, 'RUNNING', 0, ?, ?)
          `,
        )
        .run(event.project_id, event.event_id, isoformatDatetime(event.committed_at));
    } catch (error) {
      throw new ProjectionError(withCause("project already exists", error));
    }
  }

  #applyProjectRevised(connection: DatabaseSync, event: SchedulerEvent): void {
    const project = event.payload.project_ir as Row;
    const changes = connection
      .prepare(
        `
        UPDATE projects
        SET revision=?, digest=?, head_commit=?, state_json=?,
            last_event_id=?, updated_at=?
        WHERE project_id=? AND revision=? AND digest=?
        `,
      )
      .run(
        project.revision,
        project.digest,
        project.head_commit,
        jsonBytes(project),
        event.event_id,
        isoformatDatetime(event.committed_at),
        event.project_id,
        project.parent_revision,
        project.parent_digest,
      ).changes;
    requireUpdated(changes, "ProjectIR parent does not match current projection");
  }

  #applyTaskCreated(connection: DatabaseSync, event: SchedulerEvent): void {
    const envelope = event.payload.task_envelope;
    const state = event.payload.initial_state;
    try {
      connection
        .prepare(
          `
          INSERT INTO tasks(
              project_id, task_id, state, envelope_json, state_json,
              last_event_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          event.project_id,
          event.entity_id,
          String(state),
          jsonBytes(envelope),
          jsonBytes({ state: String(state), reason: null }),
          event.event_id,
          isoformatDatetime(event.committed_at),
        );
    } catch (error) {
      throw new ProjectionError(withCause("task already exists", error));
    }
  }

  #applyTaskTransition(connection: DatabaseSync, event: SchedulerEvent): void {
    const changes = connection
      .prepare(
        `
        UPDATE tasks
        SET state=?, state_json=?, last_event_id=?, updated_at=?
        WHERE project_id=? AND task_id=?
        `,
      )
      .run(
        String(event.payload.new_state),
        jsonBytes(event.payload),
        event.event_id,
        isoformatDatetime(event.committed_at),
        event.project_id,
        event.entity_id,
      ).changes;
    requireUpdated(changes, "task transition refers to an unknown task");
  }

  #applyAttemptCreated(connection: DatabaseSync, event: SchedulerEvent): void {
    const task = connection
      .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(event.project_id, String(event.payload.task_id));
    if (task === undefined) {
      throw new ProjectionError("attempt refers to an unknown task");
    }
    const stateValue = {
      state: "CREATED",
      task_id: event.payload.task_id,
      envelope_id: event.payload.envelope_id,
      attempt_no: event.payload.attempt_no,
      batch_activation_event_id: event.causation_id,
    };
    try {
      connection
        .prepare(
          `
          INSERT INTO attempts(
              project_id, attempt_id, task_id, state, report_json,
              state_json, last_event_id, updated_at
          ) VALUES (?, ?, ?, 'CREATED', NULL, ?, ?, ?)
          `,
        )
        .run(
          event.project_id,
          event.entity_id,
          String(event.payload.task_id),
          jsonBytes(stateValue),
          event.event_id,
          isoformatDatetime(event.committed_at),
        );
    } catch (error) {
      throw new ProjectionError(withCause("attempt already exists", error));
    }
  }

  #applyAttemptTransition(connection: DatabaseSync, event: SchedulerEvent): void {
    const report = event.payload.attempt_report as Row | null | undefined;
    const current = connection
      .prepare("SELECT state_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(event.project_id, event.entity_id) as { state_json: Uint8Array } | undefined;
    let stateValue: Record<string, unknown> = { ...event.payload };
    if (current !== undefined) {
      const prior = JSON.parse(new TextDecoder().decode(current.state_json)) as Row;
      stateValue = { ...prior, ...event.payload };
    }
    const changes = connection
      .prepare(
        `
        UPDATE attempts
        SET state=?, report_json=COALESCE(?, report_json), state_json=?,
            last_event_id=?, updated_at=?
        WHERE project_id=? AND attempt_id=?
        `,
      )
      .run(
        String(event.payload.new_state),
        report === null || report === undefined ? null : jsonBytes(report),
        jsonBytes(stateValue),
        event.event_id,
        isoformatDatetime(event.committed_at),
        event.project_id,
        event.entity_id,
      ).changes;
    requireUpdated(changes, "attempt transition refers to an unknown attempt");
  }

  #applyEvidenceAdded(connection: DatabaseSync, event: SchedulerEvent): void {
    const evidence = event.payload.evidence as Row;
    try {
      connection
        .prepare(
          `
          INSERT INTO evidence(
              project_id, evidence_id, status, evidence_json,
              last_event_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          event.project_id,
          event.entity_id,
          evidence.status,
          jsonBytes(evidence),
          event.event_id,
          isoformatDatetime(event.committed_at),
        );
    } catch (error) {
      throw new ProjectionError(withCause("evidence already exists", error));
    }
  }

  #applyEvidenceStale(connection: DatabaseSync, event: SchedulerEvent): void {
    const changes = connection
      .prepare(
        `
        UPDATE evidence
        SET status='stale', last_event_id=?, updated_at=?
        WHERE project_id=? AND evidence_id=?
        `,
      )
      .run(event.event_id, isoformatDatetime(event.committed_at), event.project_id, event.entity_id)
      .changes;
    requireUpdated(changes, "stale Event refers to unknown Evidence");
  }

  #applySchedulerPaused(connection: DatabaseSync, event: SchedulerEvent): void {
    const changes = connection
      .prepare(
        `
        UPDATE scheduler_control
        SET state='PAUSED', generation=generation+1,
            last_event_id=?, updated_at=?
        WHERE project_id=?
        `,
      )
      .run(event.event_id, isoformatDatetime(event.committed_at), event.project_id).changes;
    requireUpdated(changes, "pause refers to an unknown project");
  }

  #applySchedulerResumed(connection: DatabaseSync, event: SchedulerEvent): void {
    const row = connection
      .prepare("SELECT state, generation FROM scheduler_control WHERE project_id=?")
      .get(event.project_id) as { state: string; generation: number } | undefined;
    if (row === undefined) {
      throw new ProjectionError("resume refers to an unknown project");
    }
    const expected = event.payload.expected_control_generation as number;
    if (row.state !== "PAUSED" || row.generation !== expected) {
      throw new ControlGenerationConflict(
        "resume requires PAUSED state and the current control generation",
      );
    }
    connection
      .prepare(
        `
        UPDATE scheduler_control
        SET state='RUNNING', generation=generation+1,
            last_event_id=?, updated_at=?
        WHERE project_id=?
        `,
      )
      .run(event.event_id, isoformatDatetime(event.committed_at), event.project_id);
  }

  #applyJudgeDeclared(connection: DatabaseSync, event: SchedulerEvent): void {
    connection
      .prepare(
        `
        INSERT INTO judge_declarations(
            project_id, judge_id, kind, version, declared_by, state_json,
            last_event_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, judge_id) DO UPDATE SET
            kind=excluded.kind,
            version=excluded.version,
            declared_by=excluded.declared_by,
            state_json=excluded.state_json,
            last_event_id=excluded.last_event_id,
            updated_at=excluded.updated_at
        `,
      )
      .run(
        event.project_id,
        String(event.payload.judge_id),
        String(event.payload.kind),
        Number(event.payload.version),
        String(event.payload.declared_by ?? ""),
        JSON.stringify(event.payload).length > 0
          ? new TextEncoder().encode(JSON.stringify(event.payload))
          : new TextEncoder().encode("{}"),
        event.event_id,
        event.committed_at,
      );
  }

  #applyCandidateSelected(connection: DatabaseSync, event: SchedulerEvent): void {
    const payload = event.payload as {
      task_id: string | null;
      winner: string;
      judge: { id: string; replayable: boolean };
    };
    connection
      .prepare(
        `
        INSERT INTO selections(
            project_id, task_id, attempt_id, judge_id, replayable,
            last_event_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        event.project_id,
        payload.task_id === null ? null : String(payload.task_id),
        String(payload.winner),
        String(payload.judge.id),
        payload.judge.replayable === true ? 1 : 0,
        event.event_id,
        event.committed_at,
      );
  }

  #applyPromotion(connection: DatabaseSync, event: SchedulerEvent): void {
    const promotionId = event.payload.promotion_id as string;
    const state = event.event_type.replace("PROMOTION_", "");
    connection
      .prepare(
        `
        INSERT INTO promotions(
            project_id, promotion_id, state, state_json,
            last_event_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, promotion_id) DO UPDATE SET
            state=excluded.state,
            state_json=excluded.state_json,
            last_event_id=excluded.last_event_id,
            updated_at=excluded.updated_at
        `,
      )
      .run(
        event.project_id,
        promotionId,
        state,
        jsonBytes(event.payload),
        event.event_id,
        isoformatDatetime(event.committed_at),
      );
  }
}

function withCause(message: string, cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return detail.length > 0 ? `${message} (${detail})` : message;
}
