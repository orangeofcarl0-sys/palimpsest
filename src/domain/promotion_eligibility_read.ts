/**
 * G10-Z — the ONE reader that assembles a promotion-eligibility read model from
 * canonical state.
 *
 * `promotion_eligibility.ts` is the pure calculus; this module is the single
 * place that translates persisted Work state into its input. Both promotion
 * effect admission (before the external effect) and `PROMOTION_PREPARED`
 * aggregate validation (defence in depth on the log) use it, so the two can
 * never disagree about what "current authority" means.
 *
 * It performs READS ONLY. It never touches git and never writes.
 */

import type { DatabaseSync } from "node:sqlite";

import { parseAttemptReport, parseTaskEnvelope } from "../schema/index.js";
import { deriveProjectHeadStatus, type PromotionFact } from "./project_head.js";
import type {
  PromotionEligibilityInput,
  PromotionFenceRow,
} from "./promotion_eligibility.js";

/** The canonical current-batch derivation, injected to avoid a layering cycle. */
export interface CurrentBatchResolver {
  (taskRow: Record<string, unknown>): {
    readonly activationEventId: number;
    readonly attemptIds: readonly string[];
  } | null;
}

export interface PromotionEligibilityReadOptions {
  readonly connection: DatabaseSync;
  readonly projectId: string;
  readonly attemptId: string;
  readonly currentBatch: CurrentBatchResolver;
  /** A required gate, already evaluated against the live Evidence projection. */
  readonly gate?: { readonly gateId: string; readonly verdict: string } | null | undefined;
  /**
   * The promotion identity this read is a retry of. A retry of an outstanding
   * intent is not a new promotion, so the pending intent is not a blocker.
   */
  readonly retryOfPromotionId?: string | null | undefined;
  /**
   * Include the pending-intent blocker at all. `PROMOTION_PREPARED` validation
   * runs at the instant no intent exists yet, so it passes `false`.
   */
  readonly considerPendingPromotion?: boolean | undefined;
}

function decodeJson(value: unknown): unknown {
  return JSON.parse(new TextDecoder().decode(value as Uint8Array));
}

/** Every pending promotion intent in the project, derived from canonical events. */
export function readPromotionFenceRows(
  connection: DatabaseSync,
  projectId: string,
): readonly PromotionFenceRow[] {
  const taskIdOf = (attemptId: string): string => {
    const row = connection
      .prepare("SELECT task_id FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(projectId, attemptId) as { task_id: string } | undefined;
    return row === undefined ? "unknown" : String(row.task_id);
  };
  const rows: PromotionFenceRow[] = [];

  // PREPARED with no terminal fact: an external effect intent still owns the
  // Work basis it was admitted against.
  const prepared = connection
    .prepare(
      `SELECT payload_json AS payload FROM events
       WHERE project_id=? AND event_type='PROMOTION_PREPARED'
         AND entity_id NOT IN (
           SELECT entity_id FROM events
           WHERE project_id=? AND event_type IN ('PROMOTION_COMMITTED','PROMOTION_FAILED')
         )
       ORDER BY event_id`,
    )
    .all(projectId, projectId) as Array<{ payload: Uint8Array }>;
  for (const row of prepared) {
    const payload = decodeJson(row.payload) as { promotion_id?: unknown; attempt_id?: unknown };
    const attemptId = String(payload.attempt_id ?? "");
    rows.push(
      Object.freeze({
        promotionId: String(payload.promotion_id ?? ""),
        attemptId,
        taskId: taskIdOf(attemptId),
        state: "PREPARED" as const,
      }),
    );
  }

  // COMMITTED whose effect never admitted the owning Work: the external effect
  // is real, the Work outcome is not.
  const unsettled = connection
    .prepare(
      `SELECT e.entity_id AS promotion_id, e.payload_json AS payload
       FROM events e
       WHERE e.project_id=? AND e.event_type='PROMOTION_COMMITTED'
         AND NOT EXISTS (
           SELECT 1 FROM events s
           WHERE s.project_id=e.project_id AND s.event_type='TASK_SATISFIED'
             AND s.causation_id=e.event_id
         )
       ORDER BY e.event_id`,
    )
    .all(projectId) as Array<{ promotion_id: string; payload: Uint8Array }>;
  for (const row of unsettled) {
    const payload = decodeJson(row.payload) as { attempt_id?: unknown };
    const attemptId = String(payload.attempt_id ?? "");
    rows.push(
      Object.freeze({
        promotionId: String(row.promotion_id),
        attemptId,
        taskId: taskIdOf(attemptId),
        state: "COMMITTED_UNSETTLED" as const,
      }),
    );
  }
  return Object.freeze(rows);
}

/**
 * The committed promotion facts, in event order.
 *
 * Read from the `promotions` PROJECTION rather than the event log, because this
 * reader backs an aggregate validator: `verifyFull()` and `rebuildProjections()`
 * re-validate every event against the projections they have rebuilt so far, so
 * a validator may only depend on state that is time-correct at that point in
 * the replay. The event log always contains the future; the projection contains
 * exactly what has been applied.
 *
 * Live, the two are identical - the projector maintains this row on every
 * append.
 */
export function readPromotionFacts(
  connection: DatabaseSync,
  projectId: string,
): readonly PromotionFact[] {
  const rows = connection
    .prepare(
      `SELECT promotion_id, state_json, last_event_id FROM promotions
       WHERE project_id=? AND state='COMMITTED' ORDER BY last_event_id`,
    )
    .all(projectId) as Array<{
    promotion_id: string;
    state_json: Uint8Array;
    last_event_id: number;
  }>;
  return rows.map((row) => {
    const payload = decodeJson(row.state_json) as Record<string, unknown>;
    return {
      eventId: String(row.last_event_id),
      promotionId: String(row.promotion_id),
      attemptId: String(payload.attempt_id),
      sourceCommit: String(payload.source_commit),
      expectedHeadCommit: String(payload.expected_head_commit),
      resultingHeadCommit: String(payload.resulting_head_commit),
    };
  });
}

/** Assemble the pure assessor's input from canonical Work state. */
export function readPromotionEligibilityInput(
  options: PromotionEligibilityReadOptions,
): PromotionEligibilityInput {
  const { connection, projectId, attemptId } = options;
  const projectRow = connection
    .prepare("SELECT revision, digest, head_commit FROM projects WHERE project_id=?")
    .get(projectId) as { revision: number; digest: string; head_commit: string } | undefined;
  if (projectRow === undefined) {
    throw new Error("project does not exist");
  }
  const project = {
    revision: Number(projectRow.revision),
    digest: String(projectRow.digest),
    headCommit: String(projectRow.head_commit),
  };

  const attemptRow = connection
    .prepare("SELECT task_id, state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
    .get(projectId, attemptId) as
    | { task_id: string; state: string; report_json: Uint8Array | null }
    | undefined;
  const attempt =
    attemptRow === undefined
      ? null
      : {
          attemptId,
          taskId: String(attemptRow.task_id),
          state: String(attemptRow.state),
          report:
            attemptRow.report_json === null ? null : parseAttemptReport(decodeJson(attemptRow.report_json)),
        };

  let task: { taskId: string; state: string; envelope: ReturnType<typeof parseTaskEnvelope> | null } | null =
    null;
  let currentBatchAttemptIds: readonly string[] = [];
  let batchActivationEventId: number | null = null;
  if (attempt !== null) {
    const taskRow = connection
      .prepare("SELECT * FROM tasks WHERE project_id=? AND task_id=?")
      .get(projectId, attempt.taskId) as Record<string, unknown> | undefined;
    if (taskRow !== undefined) {
      const envelopeJson = taskRow.envelope_json;
      task = {
        taskId: String(taskRow.task_id),
        state: String(taskRow.state),
        envelope:
          envelopeJson === null || envelopeJson === undefined
            ? null
            : parseTaskEnvelope(decodeJson(envelopeJson)),
      };
      const batch = options.currentBatch(taskRow);
      if (batch !== null) {
        batchActivationEventId = batch.activationEventId;
        currentBatchAttemptIds = batch.attemptIds;
      }
    }
  }

  let canonicalExpectedHead: string | null = null;
  let headConflict: string | null = null;
  const status = deriveProjectHeadStatus({
    project: { revision: project.revision, headCommit: project.headCommit },
    promotions: readPromotionFacts(connection, projectId),
  });
  if (status.state === "CONFLICT") {
    headConflict = "the promotion chain is broken; the canonical expected head cannot be determined";
  } else {
    canonicalExpectedHead = status.provenEffectHeadCommit;
  }

  const pendingPromotion =
    options.considerPendingPromotion === true
      ? (readPromotionFenceRows(connection, projectId).find((row) => row.attemptId === attemptId) ?? null)
      : null;

  return {
    project,
    attempt,
    task,
    currentBatchAttemptIds,
    batchActivationEventId,
    canonicalExpectedHead,
    headConflict,
    pendingPromotion,
    gate: options.gate ?? null,
    // The retry identity is the caller's own derived promotion id - this module
    // never invents one, because promotion identity belongs to the promotion
    // contract, not to the read model.
    retryOfPromotionId: options.retryOfPromotionId ?? null,
  };
}
