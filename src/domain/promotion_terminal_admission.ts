/**
 * G10-AA — Trusted promotion admission capabilities (live-only).
 *
 * Two opaque, one-shot capabilities gate the two halves of the governed
 * promotion protocol:
 *
 *   PromotionIntentPermit     authorizes appending a NEW PREPARED intent
 *   PromotionOutcomeWitness   authorizes appending a NEW terminal fact
 *
 *   EffectOutcomeWitness ≠ CanonicalEvent
 *   EffectOutcomeWitness ≠ WorkAuthority
 *   EffectOutcomeWitness ≠ Truth
 *
 * A capability records WHERE AN OUTCOME CAME FROM, not that the outcome is true.
 * The Event becomes canonical only after admission; the capability itself is
 * ephemeral, request-bound, one-shot, and never persisted.
 *
 * ## Architectural trust boundary (read this before trusting the guarantee)
 *
 * AA defends against: a generic `EventStore.append` caller, a plugin/module
 * writer, an accidental alternate ingestion path, a direct-append bypass.
 *
 * AA does NOT defend against: arbitrary malicious code already running in this
 * process that imports these modules, or anyone who can rewrite the SQLite file,
 * the hash chain, or process memory. The guarantee is integrity **through the
 * supported EventStore/package trust boundary**, not a sandbox and not remote
 * attestation.
 *
 * ## What is mechanically enforced
 *
 *   - a capability is a class instance with a module-private brand, so a PLAIN
 *     OBJECT cannot be substituted, and `Object.create(prototype)` cannot either
 *     (the instance is not in the issued set);
 *   - only this module can mint, and a minted capability is registered here;
 *   - consuming is one-shot: the second use of the same capability is refused;
 *   - every bound field must match the request being admitted, so a capability
 *     cannot cross projects, promotions, attempts, commits, heads, or outcome
 *     kinds.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { PromotionOutcomeBasis, PromotionOutcomeKind } from "./promotion_terminal.js";

const INTENT_PERMIT_BRAND: unique symbol = Symbol("palimpsest.promotion-intent-permit");
const OUTCOME_WITNESS_BRAND: unique symbol = Symbol("palimpsest.promotion-outcome-witness");

/** Issued-and-unconsumed capabilities. Module-private: nothing else can read it. */
const livePermits = new WeakSet<object>();
const liveWitnesses = new WeakSet<object>();

export const PROMOTION_ADMISSION_DIGEST_DOMAIN = "palimpsest.promotion-admission.v1";

export type PromotionAdmissionErrorKind =
  | "intent_admission_required"
  | "terminal_admission_required"
  | "capability_not_issued"
  | "capability_already_consumed"
  | "capability_binding_mismatch";

export class PromotionAdmissionError extends Error {
  readonly kind: PromotionAdmissionErrorKind;
  readonly refs: readonly string[];

  constructor(kind: PromotionAdmissionErrorKind, message: string, refs: readonly string[] = []) {
    super(message);
    this.name = "PromotionAdmissionError";
    this.kind = kind;
    this.refs = refs;
  }
}

/* -------------------------------------------------------------------------- *
 * Intent permit
 * -------------------------------------------------------------------------- */

export interface PromotionIntentPermitInput {
  readonly projectId: string;
  readonly promotionId: string;
  readonly attemptId: string;
  readonly sourceCommit: string;
  readonly expectedHeadCommit: string;
  readonly basis: string;
}

/**
 * A prototype property on the instance, not a caller-settable flag: `new` is
 * unavailable outside this module and a plain object never carries the brand.
 */
export class PromotionIntentPermit {
  readonly [INTENT_PERMIT_BRAND] = true as const;
  readonly projectId: string;
  readonly promotionId: string;
  readonly attemptId: string;
  readonly sourceCommit: string;
  readonly expectedHeadCommit: string;
  readonly basis: string;
  readonly permitDigest: string;

  private constructor(input: PromotionIntentPermitInput) {
    this.projectId = input.projectId;
    this.promotionId = input.promotionId;
    this.attemptId = input.attemptId;
    this.sourceCommit = input.sourceCommit;
    this.expectedHeadCommit = input.expectedHeadCommit;
    this.basis = input.basis;
    this.permitDigest = canonicalDigest({
      domain: PROMOTION_ADMISSION_DIGEST_DOMAIN,
      kind: "intent_permit",
      projectId: input.projectId,
      promotionId: input.promotionId,
      attemptId: input.attemptId,
      sourceCommit: input.sourceCommit,
      expectedHeadCommit: input.expectedHeadCommit,
      basis: input.basis,
    });
  }

  /**
   * Mint a fresh intent permit. Called by the governed promotion manager
   * immediately after Z's eligibility assessment passes, and only there.
   */
  static issue(input: PromotionIntentPermitInput): PromotionIntentPermit {
    const permit = new PromotionIntentPermit(input);
    livePermits.add(permit);
    return permit;
  }

  /** Diagnostic: whether this capability is still live. Never authoritative. */
  static isLive(permit: unknown): boolean {
    return typeof permit === "object" && permit !== null && livePermits.has(permit);
  }
}

/* -------------------------------------------------------------------------- *
 * Outcome witness
 * -------------------------------------------------------------------------- */

export interface PromotionOutcomeWitnessInput {
  readonly projectId: string;
  readonly promotionId: string;
  readonly attemptId: string;
  /** The deterministic Ordarium operation identity this outcome belongs to. */
  readonly operationId: string;
  /** Digest over the operation input {promotionId, sourceCommit, expectedHeadCommit}. */
  readonly inputDigest: string;
  readonly outcomeKind: PromotionOutcomeKind;
  readonly basis: PromotionOutcomeBasis;
  readonly sourceCommit: string;
  readonly expectedHeadCommit: string;
  /** The resulting head, for a success outcome. `null` for every non-success. */
  readonly resultingHeadCommit: string | null;
  /** Digest over the minimal receipt this outcome was read from, when there was one. */
  readonly outcomeDigest: string | null;
  /** The PREPARED event this outcome closes, when known. */
  readonly preparedEventRef: string | null;
}

/** A prototype property on the instance: never present on a plain object. */
export class PromotionOutcomeWitness {
  readonly [OUTCOME_WITNESS_BRAND] = true as const;
  readonly projectId: string;
  readonly promotionId: string;
  readonly attemptId: string;
  readonly operationId: string;
  readonly inputDigest: string;
  readonly outcomeKind: PromotionOutcomeKind;
  readonly basis: PromotionOutcomeBasis;
  readonly sourceCommit: string;
  readonly expectedHeadCommit: string;
  readonly resultingHeadCommit: string | null;
  readonly outcomeDigest: string | null;
  readonly preparedEventRef: string | null;
  readonly witnessDigest: string;

  private constructor(input: PromotionOutcomeWitnessInput) {
    this.projectId = input.projectId;
    this.promotionId = input.promotionId;
    this.attemptId = input.attemptId;
    this.operationId = input.operationId;
    this.inputDigest = input.inputDigest;
    this.outcomeKind = input.outcomeKind;
    this.basis = input.basis;
    this.sourceCommit = input.sourceCommit;
    this.expectedHeadCommit = input.expectedHeadCommit;
    this.resultingHeadCommit = input.resultingHeadCommit;
    this.outcomeDigest = input.outcomeDigest;
    this.preparedEventRef = input.preparedEventRef;
    this.witnessDigest = canonicalDigest({
      domain: PROMOTION_ADMISSION_DIGEST_DOMAIN,
      kind: "outcome_witness",
      projectId: input.projectId,
      promotionId: input.promotionId,
      attemptId: input.attemptId,
      operationId: input.operationId,
      inputDigest: input.inputDigest,
      outcomeKind: input.outcomeKind,
      basis: input.basis,
      sourceCommit: input.sourceCommit,
      expectedHeadCommit: input.expectedHeadCommit,
      resultingHeadCommit: input.resultingHeadCommit,
      outcomeDigest: input.outcomeDigest,
    });
  }

  /**
   * Mint a fresh outcome witness. Called only from a real outcome basis: a
   * normal invocation result, a ledger receipt/reconciliation, a deterministic
   * failure/denial/cancellation, or a proven never-started invocation under
   * revoked authority. An uncertain or in-flight operation mints NOTHING.
   */
  static issue(input: PromotionOutcomeWitnessInput): PromotionOutcomeWitness {
    const witness = new PromotionOutcomeWitness(input);
    liveWitnesses.add(witness);
    return witness;
  }

  static isLive(witness: unknown): boolean {
    return typeof witness === "object" && witness !== null && liveWitnesses.has(witness);
  }
}

/* -------------------------------------------------------------------------- *
 * Consumption (live admission only)
 * -------------------------------------------------------------------------- */

function requireLive(
  capability: object,
  live: WeakSet<object>,
  label: string,
): void {
  if (!live.has(capability)) {
    // Covers both a plain object and a structural copy of a real instance: the
    // registry only ever holds capabilities this module minted and has not yet
    // consumed.
    throw new PromotionAdmissionError(
      "capability_not_issued",
      `${label} was not issued by the trusted promotion admission module, or was already consumed`,
    );
  }
}

function expectEqual(
  label: string,
  actual: string | null,
  expected: string | null,
  refs: string[],
): void {
  if (actual === expected) return;
  refs.push(`expected ${label} ${String(expected)}, got ${String(actual)}`);
}

/**
 * Validate and CONSUME an intent permit for one PREPARED append. Throws a typed
 * `PromotionAdmissionError`; on success the permit is dead.
 */
export function consumePromotionIntentPermit(
  permit: PromotionIntentPermit,
  expected: {
    readonly projectId: string;
    readonly promotionId: string;
    readonly attemptId: string;
    readonly sourceCommit: string | null;
    readonly expectedHeadCommit: string | null;
  },
): void {
  requireLive(permit, livePermits, "promotion intent permit");
  const refs: string[] = [];
  expectEqual("projectId", permit.projectId, expected.projectId, refs);
  expectEqual("promotionId", permit.promotionId, expected.promotionId, refs);
  expectEqual("attemptId", permit.attemptId, expected.attemptId, refs);
  expectEqual("sourceCommit", permit.sourceCommit, expected.sourceCommit, refs);
  expectEqual("expectedHeadCommit", permit.expectedHeadCommit, expected.expectedHeadCommit, refs);
  if (refs.length > 0) {
    throw new PromotionAdmissionError(
      "capability_binding_mismatch",
      `promotion intent permit does not authorize this request: ${refs.join("; ")}`,
      refs,
    );
  }
  // One-shot: consume only after every binding matched.
  livePermits.delete(permit);
}

/**
 * Validate and CONSUME an outcome witness for one terminal append. Throws a
 * typed `PromotionAdmissionError`; on success the witness is dead.
 *
 * The result and outcome-kind bindings are the load-bearing ones: a success
 * witness for head H1 cannot authorize a COMMITTED claiming H2, and a success
 * witness can never authorize a FAILED (or the reverse).
 */
export function consumePromotionOutcomeWitness(
  witness: PromotionOutcomeWitness,
  expected: {
    readonly projectId: string;
    readonly promotionId: string;
    readonly attemptId: string;
    readonly outcomeKind: PromotionOutcomeKind;
    readonly sourceCommit: string | null;
    readonly expectedHeadCommit: string | null;
    readonly resultingHeadCommit: string | null;
  },
): void {
  requireLive(witness, liveWitnesses, "promotion outcome witness");
  const refs: string[] = [];
  expectEqual("projectId", witness.projectId, expected.projectId, refs);
  expectEqual("promotionId", witness.promotionId, expected.promotionId, refs);
  expectEqual("attemptId", witness.attemptId, expected.attemptId, refs);
  expectEqual("outcomeKind", witness.outcomeKind, expected.outcomeKind, refs);
  expectEqual("sourceCommit", witness.sourceCommit, expected.sourceCommit, refs);
  expectEqual("expectedHeadCommit", witness.expectedHeadCommit, expected.expectedHeadCommit, refs);
  expectEqual(
    "resultingHeadCommit",
    witness.resultingHeadCommit,
    expected.resultingHeadCommit,
    refs,
  );
  if (refs.length > 0) {
    throw new PromotionAdmissionError(
      "capability_binding_mismatch",
      `promotion outcome witness does not authorize this request: ${refs.join("; ")}`,
      refs,
    );
  }
  liveWitnesses.delete(witness);
}

/** The live-only admission context an EventStore passes to `validateAdmission`. */
export interface PromotionGovernedAdmission {
  readonly intentPermit?: PromotionIntentPermit | undefined;
  readonly terminalWitness?: PromotionOutcomeWitness | undefined;
}
