/**
 * G10-AA — Promotion terminal lifecycle (PURE).
 *
 * A promotion has exactly one legal lifecycle:
 *
 *   (no promotion) → PREPARED → exactly one terminal { COMMITTED | FAILED }
 *
 * Illegal and refused:
 *
 *   COMMITTED without PREPARED
 *   FAILED without PREPARED
 *   PREPARED → COMMITTED → FAILED
 *   PREPARED → FAILED → COMMITTED
 *
 * A repeat of the IDENTICAL terminal is EventStore idempotency (the request
 * resolves to the stored event), not a second transition.
 *
 *   PROMOTION_PREPARED  ≠ EffectOccurred
 *   PROMOTION_COMMITTED =  recorded effect-success fact
 *   PROMOTION_FAILED    =  recorded terminal non-success fact
 *   PROMOTION_COMMITTED ≠ TASK_SATISFIED
 *
 * This module is pure: it compares payloads and reports problems. It performs no
 * I/O and consults no external effect system, so it is safe to run during replay.
 */

export const PROMOTION_TERMINAL_TYPES = ["PROMOTION_COMMITTED", "PROMOTION_FAILED"] as const;

export type PromotionTerminalType = (typeof PROMOTION_TERMINAL_TYPES)[number];

export const PROMOTION_OUTCOME_KINDS = ["COMMITTED", "FAILED"] as const;

export type PromotionOutcomeKind = (typeof PROMOTION_OUTCOME_KINDS)[number];

/** The terminal's outcome kind, from its event type. */
export function outcomeKindOf(eventType: PromotionTerminalType): PromotionOutcomeKind {
  return eventType === "PROMOTION_COMMITTED" ? "COMMITTED" : "FAILED";
}

export function isPromotionTerminalType(eventType: string): eventType is PromotionTerminalType {
  return (PROMOTION_TERMINAL_TYPES as readonly string[]).includes(eventType);
}

/**
 * Why a PREPARED intent was admitted. `eligibility_passed` is the only basis the
 * governed protocol produces: Z's `assessPromotionEligibility` proved the Work
 * basis before the intent was written.
 */
export const PROMOTION_INTENT_BASES = ["eligibility_passed"] as const;

export type PromotionIntentBasis = (typeof PROMOTION_INTENT_BASES)[number];

/**
 * Where a terminal outcome came from, in Ordarium's own vocabulary. A witness
 * records the BASIS, never the whole receipt.
 */
export const PROMOTION_OUTCOME_BASES = [
  /** A normal `effects.invoke(git.promote)` returned its resulting head. */
  "invoke_result",
  /** Recovery: the ledger already held a succeeded/reconciled record. */
  "ledger_receipt",
  /** Recovery: the engine reconciled an interrupted operation to success. */
  "reconciled_result",
  /** The operation failed (or was denied) deterministically. */
  "deterministic_failure",
  /** Ordarium recorded the operation as denied. */
  "denied",
  /** Ordarium recorded the operation as cancelled. */
  "cancelled",
  /**
   * The invocation provably never started AND the Work authority that admitted
   * the intent was revoked, so the promotion can never happen. The only honest
   * terminal is a no-effect FAILED (G10-Z §29).
   */
  "authority_revoked_before_dispatch",
] as const;

export type PromotionOutcomeBasis = (typeof PROMOTION_OUTCOME_BASES)[number];

/** The intent fields a terminal must be anchored to, field for field. */
export interface PromotionPreparedBasis {
  readonly promotionId: string;
  readonly attemptId: string;
  readonly sourceCommit: string;
  readonly expectedHeadCommit: string;
  readonly resultingHeadCommit: null;
}

/** Read the anchoring basis out of a PREPARED payload. */
export function preparedBasisOf(payload: Record<string, unknown>): PromotionPreparedBasis {
  return {
    promotionId: String(payload.promotion_id),
    attemptId: String(payload.attempt_id),
    sourceCommit: String(payload.source_commit),
    expectedHeadCommit: String(payload.expected_head_commit),
    resultingHeadCommit: null,
  };
}

export interface PromotionTerminalShape {
  readonly kind: PromotionOutcomeKind;
  readonly promotionId: string;
  readonly attemptId: string;
  readonly sourceCommit: string;
  readonly expectedHeadCommit: string;
  readonly resultingHeadCommit: string | null;
}

/**
 * The PURE structural rules for a terminal fact against its admitted intent.
 * Returns one message per violated rule; an empty array means structurally
 * valid. These are exactly the rules that must hold during an offline replay.
 *
 *   - an entity must be its own promotion;
 *   - a COMMITTED must record a resulting head; a FAILED must record none;
 *   - every anchoring field must equal the admitted PREPARED intent's field.
 *
 * Nothing here proves the effect happened. Matching the intent is structural
 * integrity, not effect proof - that is what live admission is for.
 */
export function promotionTerminalProblems(input: {
  readonly shape: PromotionTerminalShape;
  /** The admitted intent this terminal claims to close, or null if none exists. */
  readonly prepared: PromotionPreparedBasis | null;
  /** The promotion's current projected state, or null when unknown. */
  readonly currentState: string | null;
  readonly entityId: string;
}): readonly string[] {
  const problems: string[] = [];
  const { shape, prepared, currentState } = input;

  if (shape.promotionId !== input.entityId) {
    problems.push(
      `promotion_id ${shape.promotionId} must equal the event entity id ${input.entityId}`,
    );
  }
  if (shape.kind === "COMMITTED" && shape.resultingHeadCommit === null) {
    problems.push("PROMOTION_COMMITTED must record a resulting_head_commit");
  }
  if (shape.kind === "FAILED" && shape.resultingHeadCommit !== null) {
    problems.push("PROMOTION_FAILED must record resulting_head_commit = null");
  }
  if (prepared === null) {
    // A terminal without an admitted intent is exactly the ingestion hole AA
    // closes: no effect protocol was ever entered for this promotion.
    problems.push(
      `${shape.kind} has no PREPARED intent; a terminal fact requires an admitted promotion intent`,
    );
    return problems;
  }
  // Exactly one terminal per promotion: the intent row must still be PREPARED.
  if (currentState !== "PREPARED") {
    problems.push(
      `promotion ${shape.promotionId} is already ${currentState ?? "unknown"}; exactly one terminal transition is allowed`,
    );
  }
  if (shape.promotionId !== prepared.promotionId) {
    problems.push(
      `promotion_id ${shape.promotionId} does not match the admitted intent ${prepared.promotionId}`,
    );
  }
  if (shape.attemptId !== prepared.attemptId) {
    problems.push(
      `attempt_id ${shape.attemptId} does not match the admitted intent ${prepared.attemptId}`,
    );
  }
  if (shape.sourceCommit !== prepared.sourceCommit) {
    problems.push(
      `source_commit ${shape.sourceCommit} does not match the admitted intent ${prepared.sourceCommit}`,
    );
  }
  if (shape.expectedHeadCommit !== prepared.expectedHeadCommit) {
    problems.push(
      `expected_head_commit ${shape.expectedHeadCommit} does not match the admitted intent ${prepared.expectedHeadCommit}`,
    );
  }
  return problems;
}

/** The deterministic idempotency key for a terminal fact. */
export const PROMOTION_TERMINAL_KEY_PURPOSES: Readonly<Record<PromotionOutcomeKind, string>> = {
  COMMITTED: "promotion-committed-v1",
  FAILED: "promotion-failed-v1",
};
