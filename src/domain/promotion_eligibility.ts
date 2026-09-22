/**
 * G10-Z — Promotion eligibility: the CURRENT authority to cause an external
 * promotion effect.
 *
 * An `AttemptReport` is a HISTORICAL result record. It stays canonical and
 * readable forever. It is NOT, by itself, permission to move a repository: a
 * result may cause an external effect only while the exact task/batch/input
 * world that authorized it still holds current promotion authority.
 *
 *   AttemptHistory              ≠  CurrentEffectAuthority
 *   CanonicalAttemptResult      ≠  CurrentPromotionAuthority
 *   CompletedAttempt            ≠  PromotableAttempt
 *   GatePass                    ≠  PermanentPromotionAuthority
 *
 *   PromotionEligibility        ≠  GateVerdict
 *   PromotionEligibility        ≠  Truth
 *   PromotionEligibility        ≠  ManagementMode
 *
 *   TaskStale                   ≠  DeleteAttempt
 *   TaskStale                   ≠  DeletePromotionHistory
 *   CrossRevisionAttempt        ≠  AutomaticallyCompatibleAttempt
 *   OldBaseResult               ≠  AutomaticallyPromotableResult
 *
 * This module is PURE: it computes an assessment from a read model supplied by
 * the caller. It performs no I/O, writes nothing, and produces no score - only
 * typed blockers. ONE assessor serves every promotion entry point (product,
 * expert, tournament/selection, recovery, preview).
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { AttemptReport, TaskEnvelope } from "../schema/index.js";

export const PROMOTION_ELIGIBILITY_DIGEST_DOMAIN = "palimpsest.promotion-eligibility.v1";

/** Every reason a promotion may be refused, as a typed, checkable kind. */
export type PromotionBlockerKind =
  | "attempt_unknown"
  | "attempt_not_completed"
  | "task_unknown"
  | "task_not_verifying"
  | "task_retired"
  | "not_current_batch"
  | "input_world_stale"
  | "result_commit_missing"
  | "head_conflict"
  | "cross_revision_promotion_not_supported"
  | "gate_not_pass"
  | "promotion_effect_in_flight"
  | "promotion_settlement_required"
  | "promotion_semantic_settlement_required"
  /**
   * PLMP-LEAN-1 §B.14: the task's derived completion contract REQUIRES independent verification and
   * no run satisfies it — `_missing` when there is no run at all, `_unsatisfied` when there is one
   * that does not qualify. Never a substitute for the gate: a separate admission requirement.
   */
  | "required_verification_missing"
  | "required_verification_unsatisfied";

/**
 * PLMP-LEAN-1 §B.14: what the verification owner says about one attempt's required independent
 * verification, as a PLAIN fact.
 *
 * Deliberately not `ProjectVerificationRun`: this domain must not import the verification plane, and
 * it does not need to. It asks one question — is a required admission satisfied — and the verification
 * owner answers it.
 *
 *   PromotionEligibility  !=  Verification
 */
export interface PromotionVerificationAdmission {
  readonly required: boolean;
  readonly satisfied: boolean;
  /** The exact subject digest the qualifying run covered, when there is one. */
  readonly subjectDigest: string | null;
  readonly runRef: string | null;
  /** Why it is unsatisfied, in plain language, so a refusal can name what is missing. */
  readonly detail: string | null;
}

/** Which half of the input world a staleness blocker is about. */
export type InputWorldFacet = "envelope" | "report";

export interface PromotionBlocker {
  readonly kind: PromotionBlockerKind;
  readonly detail: string;
  readonly refs: readonly string[];
  /** Present only on `input_world_stale`: envelope-vs-ProjectIR or report-vs-envelope. */
  readonly facet?: InputWorldFacet;
}

/**
 * The CURRENT ProjectIR basis an assessment was made against. An assessment is
 * only meaningful for the exact revision/digest/head it observed.
 */
export interface PromotionProjectBasis {
  readonly revision: number;
  readonly digest: string;
  readonly headCommit: string;
}

/** One pending promotion intent that still owns an external effect. */
export interface PromotionFenceRow {
  readonly promotionId: string;
  readonly attemptId: string;
  readonly taskId: string;
  /**
   * `PREPARED` - intent recorded, external effect unresolved.
   * `COMMITTED_UNSETTLED` - effect recorded, the owning Work is not yet admitted.
   */
  readonly state: "PREPARED" | "COMMITTED_UNSETTLED";
}

export interface PromotionEligibilityTask {
  readonly taskId: string;
  readonly state: string;
  readonly envelope: TaskEnvelope | null;
}

export interface PromotionEligibilityAttempt {
  readonly attemptId: string;
  readonly taskId: string;
  readonly state: string;
  readonly report: AttemptReport | null;
}

export interface PromotionEligibilityGate {
  readonly gateId: string;
  readonly verdict: string;
}

export interface PromotionEligibilityInput {
  readonly project: PromotionProjectBasis;
  readonly attempt: PromotionEligibilityAttempt | null;
  readonly task: PromotionEligibilityTask | null;
  /** Attempt ids of the task's CURRENT batch, from the canonical batch anchor. */
  readonly currentBatchAttemptIds: readonly string[];
  /** The batch activation event id, or null when the task has no batch anchor. */
  readonly batchActivationEventId: number | null;
  /** The proven effect head of the promotion chain, or null when unknown. */
  readonly canonicalExpectedHead: string | null;
  /** Set when the promotion chain is broken and no expected head can be derived. */
  readonly headConflict: string | null;
  /**
   * §B.14: the verification admission projection. ABSENT means no verification is required, which is
   * what keeps every existing call site's behaviour exactly as it was — the requirement only appears
   * once a completion contract asks for one.
   */
  readonly verification?: PromotionVerificationAdmission | null | undefined;
  /** An unresolved promotion intent owned by this attempt, if any. */
  readonly pendingPromotion: PromotionFenceRow | null;
  /**
   * The promotion identity this call is RETRYING, if any. A retry of an
   * outstanding intent is not a new promotion: it re-enters the same Ordarium
   * operation identity and must not be refused as fresh authority. Absent/null
   * means "this call would start a new promotion", and then an outstanding
   * intent for the same attempt IS a blocker.
   */
  readonly retryOfPromotionId?: string | null;
  /** The caller-required gate, already evaluated against current Evidence. */
  readonly gate: PromotionEligibilityGate | null;
}

export interface PromotionEligibilityAssessment {
  readonly schemaVersion: 1;
  readonly attemptId: string;
  readonly taskId: string | null;
  readonly eligible: boolean;
  readonly projectBasis: PromotionProjectBasis;
  readonly taskState: string | null;
  readonly batchActivationRef: number | null;
  readonly attemptState: string | null;
  readonly sourceCommit: string | null;
  readonly canonicalExpectedHead: string | null;
  readonly taskEnvelopeBaseCommit: string | null;
  readonly pendingPromotionId: string | null;
  readonly blockers: readonly PromotionBlocker[];
  /** Stable digest of the assessment without its own digest (audit/explain). */
  readonly assessmentDigest: string;
}

function blocker(
  kind: PromotionBlockerKind,
  detail: string,
  refs: readonly string[] = [],
  facet?: InputWorldFacet,
): PromotionBlocker {
  return facet === undefined ? Object.freeze({ kind, detail, refs }) : Object.freeze({ kind, detail, refs, facet });
}

/**
 * The SINGLE definition of "the attempt's recorded input world still matches the
 * current Work world". Used both by promotion effect admission (before Git) and
 * by `TASK_SATISFIED` semantic admission (after Git), so the two can never drift:
 * the effect-first/TASK_SATISFIED-later-fail window is closed by construction.
 */
export function inputWorldBlockers(input: {
  readonly project: PromotionProjectBasis;
  readonly envelope: TaskEnvelope | null;
  readonly report: AttemptReport | null;
}): readonly PromotionBlocker[] {
  const blockers: PromotionBlocker[] = [];
  const { project, envelope, report } = input;
  if (envelope === null) {
    blockers.push(
      blocker("input_world_stale", "the task has no authorized envelope", [], "envelope"),
    );
  } else if (
    envelope.project_revision !== project.revision ||
    envelope.project_digest !== project.digest ||
    envelope.base_commit !== project.headCommit
  ) {
    blockers.push(
      blocker(
        "input_world_stale",
        `the task envelope belongs to revision ${envelope.project_revision} at base ${envelope.base_commit}, not revision ${project.revision} at base ${project.headCommit}`,
        [String(envelope.project_revision), String(project.revision), envelope.base_commit, project.headCommit],
        "envelope",
      ),
    );
  }
  if (report === null) {
    blockers.push(
      blocker("input_world_stale", "the attempt has no completed report", [], "report"),
    );
  } else if (envelope !== null) {
    if (
      report.envelope_id !== envelope.envelope_id ||
      Number(report.input_project_revision) !== envelope.project_revision ||
      report.input_project_digest !== envelope.project_digest ||
      report.base_commit !== envelope.base_commit
    ) {
      blockers.push(
        blocker(
          "input_world_stale",
          "the attempt report was produced against a different input world than the current task envelope",
          [report.envelope_id, envelope.envelope_id],
          "report",
        ),
      );
    }
  }
  return Object.freeze(blockers);
}

/**
 * Assess whether one attempt may START a new external promotion effect right
 * now. Pure: no I/O, no writes, no score.
 *
 * `eligible` is true iff there are no blockers. An ineligible assessment is
 * what a caller must refuse on - and refusing writes nothing.
 */
export function assessPromotionEligibility(
  input: PromotionEligibilityInput,
): PromotionEligibilityAssessment {
  const blockers: PromotionBlocker[] = [];
  const { attempt, task, project } = input;

  if (attempt === null) {
    blockers.push(
      blocker("attempt_unknown", "the attempt does not exist in this project", []),
    );
  } else if (attempt.state !== "COMPLETED") {
    blockers.push(
      blocker(
        "attempt_not_completed",
        `attempt state is ${attempt.state}; only a COMPLETED attempt can be promoted`,
        [attempt.attemptId, attempt.state],
      ),
    );
  }

  const taskId = attempt?.taskId ?? task?.taskId ?? null;

  if (task === null) {
    blockers.push(
      blocker("task_unknown", "the attempt's task does not exist in this project", []),
    );
  } else if (task.state === "STALE") {
    // Retired Work: the history stays readable, the authority does not.
    blockers.push(
      blocker(
        "task_retired",
        `task ${task.taskId} was retired (STALE); its historical results remain inspectable but hold no promotion authority`,
        [task.taskId],
      ),
    );
  } else if (task.state !== "VERIFYING") {
    blockers.push(
      blocker(
        "task_not_verifying",
        `task state is ${task.state}; a new promotion may only start from VERIFYING Work`,
        [task.taskId, task.state],
      ),
    );
  }

  if (attempt !== null && task !== null) {
    if (input.batchActivationEventId === null || input.currentBatchAttemptIds.length === 0) {
      blockers.push(
        blocker(
          "not_current_batch",
          `task ${task.taskId} has no current batch anchor; the attempt's batch cannot be proven`,
          [task.taskId],
        ),
      );
    } else if (!input.currentBatchAttemptIds.includes(attempt.attemptId)) {
      blockers.push(
        blocker(
          "not_current_batch",
          `attempt ${attempt.attemptId} is not a candidate of the task's current batch; an older batch is historical only`,
          [attempt.attemptId],
        ),
      );
    }
  }

  const envelope = task?.envelope ?? null;
  blockers.push(
    ...inputWorldBlockers({ project, envelope, report: attempt?.report ?? null }),
  );

  const resultCommit = attempt?.report?.result_commit ?? null;
  if (attempt !== null && attempt.state === "COMPLETED" && resultCommit === null) {
    blockers.push(
      blocker(
        "result_commit_missing",
        `attempt ${attempt.attemptId} has no result_commit; there is nothing to promote`,
        [attempt.attemptId],
      ),
    );
  }

  if (input.headConflict !== null) {
    blockers.push(blocker("head_conflict", input.headConflict, []));
  } else if (input.canonicalExpectedHead === null) {
    blockers.push(
      blocker(
        "head_conflict",
        "the canonical expected promotion head cannot be derived",
        [],
      ),
    );
  } else if (envelope !== null && input.canonicalExpectedHead !== envelope.base_commit) {
    // Current topology: a result authorized at an older base cannot be promoted
    // onto an advanced head. There is no compatibility protocol, so this fails
    // closed BEFORE the external effect - never after it.
    blockers.push(
      blocker(
        "cross_revision_promotion_not_supported",
        `the task was authorized at base ${envelope.base_commit} but the canonical expected head is ${input.canonicalExpectedHead}; this topology supports only same-base promotion`,
        [envelope.base_commit, input.canonicalExpectedHead],
      ),
    );
  }

  const isRetry =
    input.pendingPromotion !== null &&
    input.pendingPromotion.promotionId === (input.retryOfPromotionId ?? null);
  if (input.pendingPromotion !== null && !isRetry) {
    blockers.push(
      blocker(
        input.pendingPromotion.state === "PREPARED"
          ? "promotion_effect_in_flight"
          : "promotion_settlement_required",
        `promotion ${input.pendingPromotion.promotionId} is ${input.pendingPromotion.state}; the outstanding external effect must resolve first`,
        [input.pendingPromotion.promotionId, input.pendingPromotion.state],
      ),
    );
  }

  if (input.gate !== null && input.gate.verdict !== "PASS") {
    blockers.push(
      blocker(
        "gate_not_pass",
        `gate ${input.gate.gateId} verdict ${input.gate.verdict} does not authorize a promotion`,
        [input.gate.gateId, input.gate.verdict],
      ),
    );
  }

  // §B.14: a required independent verification is its own admission requirement, checked HERE in the
  // single assessor so no promotion entry point can bypass it.
  const verification = input.verification;
  if (verification !== null && verification !== undefined && verification.required && !verification.satisfied) {
    blockers.push(
      blocker(
        verification.runRef === null ? "required_verification_missing" : "required_verification_unsatisfied",
        verification.detail ??
          "this attempt's completion contract requires independent verification and no qualifying run exists",
        [verification.subjectDigest ?? "", verification.runRef ?? ""].filter((ref) => ref !== ""),
      ),
    );
  }

  const frozen = Object.freeze(blockers);
  const assessment = {
    schemaVersion: 1 as const,
    attemptId: attempt?.attemptId ?? input.pendingPromotion?.attemptId ?? "",
    taskId,
    eligible: frozen.length === 0,
    projectBasis: Object.freeze({ ...project }),
    taskState: task?.state ?? null,
    batchActivationRef: input.batchActivationEventId,
    attemptState: attempt?.state ?? null,
    sourceCommit: resultCommit,
    canonicalExpectedHead: input.canonicalExpectedHead,
    taskEnvelopeBaseCommit: envelope?.base_commit ?? null,
    pendingPromotionId: input.pendingPromotion?.promotionId ?? null,
    blockers: frozen,
  };
  return Object.freeze({
    ...assessment,
    assessmentDigest: canonicalDigest({
      domain: PROMOTION_ELIGIBILITY_DIGEST_DOMAIN,
      attemptId: assessment.attemptId,
      taskId: assessment.taskId,
      eligible: assessment.eligible,
      projectBasis: assessment.projectBasis,
      taskState: assessment.taskState,
      attemptState: assessment.attemptState,
      sourceCommit: assessment.sourceCommit,
      canonicalExpectedHead: assessment.canonicalExpectedHead,
      taskEnvelopeBaseCommit: assessment.taskEnvelopeBaseCommit,
      blockers: assessment.blockers,
    }),
  });
}

/**
 * The revision fence is a strictly narrower contract than promotion
 * eligibility: it can only ever report these two kinds, and both are legal
 * `PlanReconciliationBlockerKind`s, so a fence blocker composes into the
 * revision contract without a cast.
 */
export type PromotionFenceBlockerKind =
  | "promotion_settlement_required"
  | "promotion_semantic_settlement_required";

export interface PromotionFenceBlocker extends Omit<PromotionBlocker, "kind"> {
  readonly kind: PromotionFenceBlockerKind;
}

/** A refusal carrying the typed blockers that produced it. */
export class PromotionEligibilityError extends Error {
  readonly blockers: readonly PromotionBlocker[];

  constructor(attemptId: string, blockers: readonly PromotionBlocker[]) {
    const summary = blockers
      .map((entry) => `${entry.kind}: ${entry.detail}`)
      .join("; ");
    super(`attempt ${attemptId} is not promotion-eligible: ${summary}`);
    this.name = "PromotionEligibilityError";
    this.blockers = blockers;
  }

  /** The first blocker kind - the stable, checkable summary for callers. */
  get kind(): PromotionBlockerKind | undefined {
    return this.blockers[0]?.kind;
  }
}

/** The human-facing explanation of a refusal (§42). */
export function explainPromotionIneligibility(
  assessment: PromotionEligibilityAssessment,
): string {
  if (assessment.eligible) {
    return `Attempt ${assessment.attemptId} may be promoted: its Work is current and its input world matches.`;
  }
  const retired = assessment.blockers.find((entry) => entry.kind === "task_retired");
  if (retired !== undefined) {
    return "This attempt is retained as project history, but its task was retired by a Project revision. Historical results remain inspectable; promotion authority does not.";
  }
  return assessment.blockers.map((entry) => entry.detail).join(" ");
}

/** The tasks a revision would have to leave alone because of a promotion fence. */
export function promotionFenceBlockers(
  rows: readonly PromotionFenceRow[],
  retiringTaskIds: readonly string[],
): readonly PromotionFenceBlocker[] {
  const retiring = new Set(retiringTaskIds);
  const blockers: PromotionFenceBlocker[] = [];
  for (const row of rows) {
    if (!retiring.has(row.taskId)) continue;
    const kind: PromotionFenceBlockerKind =
      row.state === "PREPARED"
        ? "promotion_settlement_required"
        : "promotion_semantic_settlement_required";
    blockers.push(
      Object.freeze({
        kind,
        detail:
          row.state === "PREPARED"
            ? `task ${row.taskId} owns promotion ${row.promotionId} whose external effect is unresolved; a revision cannot retire it until the effect resolves`
            : `task ${row.taskId} owns promotion ${row.promotionId} which committed but was never admitted as Work; a revision cannot retire it before Work settlement`,
        refs: Object.freeze([row.promotionId, row.taskId, row.attemptId, row.state]),
      }),
    );
  }
  return Object.freeze(blockers);
}

/**
 * G10-Z §23/§31: the revision-facing view of the fence. Given the fence rows and
 * the exact set of tasks a revision would retire, return the FIRST blocker in a
 * deterministic order (or undefined when the revision crosses no fence).
 *
 * The order is deterministic so a refused revision always names the same task
 * for the same state - the revision contract's blockers are part of its
 * observable behaviour, not a set.
 */
export function compilePromotionFenceBlocker(
  rows: readonly PromotionFenceRow[],
  retiringTaskIds: Iterable<string>,
): PromotionFenceBlocker | undefined {
  const ordered = [...retiringTaskIds].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const blockers = [...promotionFenceBlockers(rows, ordered)].sort((left, right) => {
    const leftRef = left.refs[1] ?? "";
    const rightRef = right.refs[1] ?? "";
    return leftRef < rightRef ? -1 : leftRef > rightRef ? 1 : 0;
  });
  return blockers[0];
}
