/**
 * PLMP-LEAN-1 §D5-b2 — governed rework admission (live-only).
 *
 *     VERIFYING@E_0  →  READY@E_0     requires a governed ReworkAdmissionPermit
 *
 * D5-b1 fixed the READ path, so a task's current authorization can evolve while its attempts' provenances
 * cannot. That makes reopening a VERIFYING task *safe* — but safe is not the same as *permitted*, and the
 * audit measured exactly why a bare transition is not enough:
 *
 *   the aggregate ALREADY accepts `TASK_READY` on a VERIFYING task (measured: the task became READY through a
 *   generic append), because the state machine's table lists VERIFYING among TASK_READY's allowed sources
 *
 * So merely declaring the stage-graph edge would let ANY internal caller reopen verified work with no
 * continuation assessment at all. That is the review's §12 concern, and it is real rather than hypothetical.
 *
 *     ordinary append  ≠  governed rework append
 *
 * This module is the governed half, modelled on `PromotionIntentPermit`: a capability records WHERE A REQUEST
 * CAME FROM, not that it is justified. It is ephemeral, request-bound, one-shot and never persisted — the
 * HISTORY is still written by the ordinary `TASK_READY` event.
 *
 * ## THE PERMIT AUTHORIZES EXACTLY ONE TRANSITION, AND DELIBERATELY NOTHING MORE
 *
 * What is being authorized: setting aside a completed candidate that sits in VERIFYING. What is NOT being
 * authorized: anything that happens afterwards.
 *
 *     rework admission  ≠  basis advance
 *
 * An earlier draft bound the permit to a FRESH envelope E_1 and gated a two-event closure
 * `TASK_REAUTHORIZED(E_1)` + `TASK_READY` behind one shared pass. Measured against the shipped system, that
 * draft was unbuildable: no fresh envelope can exist for a VERIFYING task, because envelope identity is a
 * digest over state only `PROJECT_REVISED` can advance, and plan reconciliation's quiescence is broken by the
 * very task being reopened. The measurement is a REFUTATION, not an obstacle — E_1 is not rework's to
 * promise. So the draft's second slot, its pass and its future-world fields were deleted rather than kept
 * "until D5-c makes them reachable", and the permit is bound instead to what EXISTS at admission time:
 *
 *     currentEnvelopeId        the verifying authority being set aside (E_0)
 *     batchActivationEventId   the batch whose completed candidate is being set aside
 *     targetObservationDigest  the observed world the rework is authorized against
 *
 * Everything that follows belongs to the authorities that already own it:
 *
 *     D5 rework authority    "may this completed candidate's claim be set aside?"   VERIFYING → READY
 *     G10-X head authority   "is the promoted head the new ProjectIR basis?"      PROJECT_REVISED + TASK_REAUTHORIZED(E_1)
 *
 * `READY@E_0` is a safe intermediate state, not a limbo: G10-X already blocks NEW work activation while the
 * promoted effect head is ahead of the ProjectIR (SYNC_REQUIRED), and `runTurn()` settles existing work and
 * reconciles the head before resuming activation. The reopened task is REOPENABLE but NOT EXECUTABLE until
 * the existing head reconciliation rebinds it to E_1. The reopened task also un-blocks quiescence by
 * leaving VERIFYING, which is precisely what lets the EXISTING reconciliation run — the state precondition
 * is repaired, not bypassed, and no second head authority (`advanceBasisForRework`,
 * `reconcileHeadIgnoringVerifying`) is created.
 *
 * WHY A PERMIT AND NOT A NEW EVENT TYPE. The Event Log already expresses the fact — `TASK_READY` on a
 * VERIFYING task means *same Work, completed candidate set aside, new execution opportunity* — so adding
 * `WORK_REWORK_AUTHORIZED` would enlarge the canonical vocabulary to say something the log already says.
 *
 * ## Architectural trust boundary (the same one the promotion permits declare)
 *
 * This defends against: a generic `EventStore.append` caller, a plugin/module writer, an accidental
 * alternate ingestion path, a direct-append bypass. It does NOT defend against arbitrary malicious code
 * already running in this process.
 */

import { canonicalDigest } from "../schema/canonical.js";

const REWORK_PERMIT_BRAND: unique symbol = Symbol("palimpsest.rework-admission-permit");

/** Issued-and-unconsumed permits. Module-private: nothing else can read it. */
const livePermits = new WeakSet<object>();

export const REWORK_ADMISSION_DIGEST_DOMAIN = "palimpsest.rework-admission.v1";

/**
 * Why a rework is being admitted.
 *
 * The reason is part of the permit because a refusal must be explainable later, and because the three cases
 * are genuinely different: a proven conflict says reuse is IMPOSSIBLE, an unproven compatibility says it was
 * never established, and a failed effect says the carry was attempted and did not apply. All three permit
 * rework; none of them is the same statement.
 */
export const REWORK_REASONS = ["INCOMPATIBLE", "UNKNOWN", "REMATERIALIZATION_FAILED"] as const;
export type ReworkReason = (typeof REWORK_REASONS)[number];

export type ReworkAdmissionErrorKind =
  | "rework_admission_required"
  | "capability_not_issued"
  | "capability_already_consumed"
  | "capability_binding_mismatch";

export class ReworkAdmissionError extends Error {
  readonly kind: ReworkAdmissionErrorKind;
  readonly refs: readonly string[];

  constructor(kind: ReworkAdmissionErrorKind, message: string, refs: readonly string[] = []) {
    super(message);
    this.name = "ReworkAdmissionError";
    this.kind = kind;
    this.refs = refs;
  }
}

export interface ReworkAdmissionPermitInput {
  readonly projectId: string;
  readonly taskId: string;
  /** WHICH result's continuation this is — the result whose reuse could not be established. */
  readonly originResultSubjectKind: string;
  readonly originResultSubjectRef: string;
  readonly originBasisDigest: string;
  /** The observed world the rework is authorized against. A permit for B1 does not authorize work at B2. */
  readonly targetObservationDigest: string;
  /** The verifying authority being SET ASIDE — the envelope the task still carries, E_0. Never a future E_1. */
  readonly currentEnvelopeId: string;
  /** The batch whose completed candidate is being set aside. */
  readonly batchActivationEventId: number;
  readonly reason: ReworkReason;
}

/**
 * A prototype property on the instance, not a caller-settable flag: `new` is unavailable outside this module
 * and a plain object never carries the brand, so a structural copy cannot be substituted.
 */
export class ReworkAdmissionPermit {
  readonly [REWORK_PERMIT_BRAND] = true as const;
  readonly projectId: string;
  readonly taskId: string;
  readonly originResultSubjectKind: string;
  readonly originResultSubjectRef: string;
  readonly originBasisDigest: string;
  readonly targetObservationDigest: string;
  readonly currentEnvelopeId: string;
  readonly batchActivationEventId: number;
  readonly reason: ReworkReason;
  readonly permitDigest: string;

  private constructor(input: ReworkAdmissionPermitInput) {
    this.projectId = input.projectId;
    this.taskId = input.taskId;
    this.originResultSubjectKind = input.originResultSubjectKind;
    this.originResultSubjectRef = input.originResultSubjectRef;
    this.originBasisDigest = input.originBasisDigest;
    this.targetObservationDigest = input.targetObservationDigest;
    this.currentEnvelopeId = input.currentEnvelopeId;
    this.batchActivationEventId = input.batchActivationEventId;
    this.reason = input.reason;
    this.permitDigest = canonicalDigest({
      domain: REWORK_ADMISSION_DIGEST_DOMAIN,
      kind: "rework_admission_permit",
      projectId: input.projectId,
      taskId: input.taskId,
      originResultSubjectKind: input.originResultSubjectKind,
      originResultSubjectRef: input.originResultSubjectRef,
      originBasisDigest: input.originBasisDigest,
      targetObservationDigest: input.targetObservationDigest,
      currentEnvelopeId: input.currentEnvelopeId,
      batchActivationEventId: input.batchActivationEventId,
      reason: input.reason,
    });
  }

  /**
   * Mint a fresh permit. Called by the governed rework entry point immediately after a continuation
   * assessment has said rework is a safe path and the target world has been re-observed, and only there.
   */
  static issue(input: ReworkAdmissionPermitInput): ReworkAdmissionPermit {
    const permit = new ReworkAdmissionPermit(input);
    livePermits.add(permit);
    return permit;
  }

  /** Diagnostic: whether this capability is still live. Never authoritative. */
  static isLive(permit: unknown): boolean {
    return typeof permit === "object" && permit !== null && livePermits.has(permit);
  }
}

/**
 * Validate and CONSUME a permit for the ONE governed reopening. Throws a typed `ReworkAdmissionError`; on
 * success the permit is dead, so one admission reopens exactly one Work.
 *
 * WHICH BINDINGS ARE CHECKED HERE, AND WHY NOT ALL OF THEM. The four below are facts the EVENT LOG AND TASK
 * ROW can see, so an admission that cannot confirm them must refuse:
 *
 *   projectId · taskId · currentEnvelopeId · batchActivationEventId
 *
 * `targetObservationDigest` is DELIBERATELY ABSENT from the required set. The admission runs inside a
 * transaction over the log and cannot observe the world, so a "check" against it here could only compare the
 * permit with itself — a comparison that always passes is worse than none, because it would read as a
 * binding. That binding belongs where the world IS visible: the governed entry point re-observes the target
 * immediately before minting. The permit still CARRIES the digest, so the admission record stays auditable.
 */
export function consumeReworkAdmissionPermit(
  permit: ReworkAdmissionPermit,
  expected: {
    readonly projectId: string;
    readonly taskId: string;
    readonly currentEnvelopeId: string;
    readonly batchActivationEventId: number;
  },
): void {
  if (!livePermits.has(permit)) {
    // Covers a plain object and a structural copy alike: only capabilities this module minted and has not
    // yet consumed are ever in the registry.
    throw new ReworkAdmissionError(
      "capability_not_issued",
      "rework admission permit was not issued by the trusted rework admission module, or was already consumed",
    );
  }
  const refs: string[] = [];
  const compare = (label: string, actual: string | number, expectedValue: string | number): void => {
    if (actual !== expectedValue) refs.push(`expected ${label} ${String(expectedValue)}, got ${String(actual)}`);
  };
  compare("projectId", permit.projectId, expected.projectId);
  compare("taskId", permit.taskId, expected.taskId);
  // The CURRENT-state binding: a permit is spent on the envelope the task still carries, or not at all.
  compare("currentEnvelopeId", permit.currentEnvelopeId, expected.currentEnvelopeId);
  compare("batchActivationEventId", permit.batchActivationEventId, expected.batchActivationEventId);
  if (refs.length > 0) {
    throw new ReworkAdmissionError(
      "capability_binding_mismatch",
      `rework admission permit does not authorize this reopening: ${refs.join("; ")}`,
      refs,
    );
  }
  // One-shot: consume only after every binding matched.
  livePermits.delete(permit);
}

/** The live-only rework admission an EventStore passes to `validateAdmission`. */
export interface ReworkGovernedAdmission {
  readonly reworkPermit?: ReworkAdmissionPermit | undefined;
}

/**
 * §D5-c2 — the DURABLE lineage synthesized from a permit by the governed append
 * path (`EventStore.appendReworkReopening`). The capability is ephemeral; this
 * object is its historical shadow, written INTO the `TASK_READY` event so a
 * restart — and the D5-c2b context compiler — can still answer "why was this
 * Work reopened, for which origin result, against which observed world". The
 * caller never supplies it: the EventStore derives it from the capability at the
 * only seam that can spend the capability, which is the same direction D3-R
 * fixed for caller facts generally.
 *
 *     Capability → durable historical provenance      (never CallerFacts + Capability → history)
 */
/**
 * §D5-c2: the governed append path verifies ISSUANCE before synthesizing any
 * lineage from the capability. A forged or spent object is refused HERE —
 * before it can touch an event — rather than failing later as a malformed
 * payload.
 */
export function requireIssuedReworkPermit(permit: ReworkAdmissionPermit): void {
  if (!livePermits.has(permit)) {
    throw new ReworkAdmissionError(
      "capability_not_issued",
      "rework admission permit was not issued by the trusted rework admission module, or was already consumed",
    );
  }
}

export function reworkProvenanceFromPermit(
  permit: ReworkAdmissionPermit,
  continuationAssessmentDigest?: string,
): {
  schema_version: 1;
  origin_result_subject: { kind: string; ref: string };
  origin_basis_digest: string;
  target_observation_digest: string;
  current_envelope_id: string;
  reason: ReworkReason;
  continuation_assessment_digest?: string;
} {
  return {
    schema_version: 1,
    origin_result_subject: {
      kind: permit.originResultSubjectKind,
      ref: permit.originResultSubjectRef,
    },
    origin_basis_digest: permit.originBasisDigest,
    target_observation_digest: permit.targetObservationDigest,
    current_envelope_id: permit.currentEnvelopeId,
    reason: permit.reason,
    ...(continuationAssessmentDigest === undefined
      ? {}
      : { continuation_assessment_digest: continuationAssessmentDigest }),
  };
}
