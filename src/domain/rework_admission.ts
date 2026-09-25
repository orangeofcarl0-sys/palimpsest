/**
 * PLMP-LEAN-1 §D5-b2 — governed rework admission (live-only).
 *
 *     VERIFYING@E_0 → READY@E_1   requires a governed ReworkAdmission
 *
 * D5-b1 fixed the READ path, so a task's current authorization can now evolve while its attempts' provenances
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
 * This module is the governed half, modelled exactly on `PromotionIntentPermit`, which solved the same shape
 * for promotion: a capability records WHERE A REQUEST CAME FROM, not that it is justified. It is ephemeral,
 * request-bound, one-shot and never persisted — the HISTORY is still written by the two ordinary events.
 *
 * WHY A PERMIT AND NOT A NEW EVENT TYPE. The Event Log already expresses the fact:
 *
 *   `TASK_REAUTHORIZED`   this Work is now bound to a new current authorization
 *   `TASK_READY`          this Work may enter execution again
 *
 * together meaning *same Work, current authorization, new execution opportunity*. What was missing is a
 * LIVE authority over that transition, not a new historical word. Adding `WORK_REWORK_AUTHORIZED` would
 * enlarge the canonical vocabulary to say something the log already says.
 *
 * ## Architectural trust boundary (the same one the promotion permits declare)
 *
 * This defends against: a generic `EventStore.append` caller, a plugin/module writer, an accidental
 * alternate ingestion path, a direct-append bypass. It does NOT defend against arbitrary malicious code
 * already running in this process.
 */

import { canonicalDigest } from "../schema/canonical.js";

const REWORK_PERMIT_BRAND: unique symbol = Symbol("palimpsest.rework-admission-permit");
const REWORK_PASS_BRAND: unique symbol = Symbol("palimpsest.rework-closure-pass");

/** Issued-and-unconsumed permits. Module-private: nothing else can read it. */
const livePermits = new WeakSet<object>();
/** Live closure passes. Module-private, same discipline. */
const livePasses = new WeakSet<object>();

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
  | "capability_binding_mismatch"
  | "rework_closure_slot_unavailable";

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
  /** The CURRENT envelope the task will be rebound to. */
  readonly freshEnvelopeId: string;
  readonly freshEnvelopeDigest: string;
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
  readonly freshEnvelopeId: string;
  readonly freshEnvelopeDigest: string;
  readonly reason: ReworkReason;
  readonly permitDigest: string;

  private constructor(input: ReworkAdmissionPermitInput) {
    this.projectId = input.projectId;
    this.taskId = input.taskId;
    this.originResultSubjectKind = input.originResultSubjectKind;
    this.originResultSubjectRef = input.originResultSubjectRef;
    this.originBasisDigest = input.originBasisDigest;
    this.targetObservationDigest = input.targetObservationDigest;
    this.freshEnvelopeId = input.freshEnvelopeId;
    this.freshEnvelopeDigest = input.freshEnvelopeDigest;
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
      freshEnvelopeId: input.freshEnvelopeId,
      freshEnvelopeDigest: input.freshEnvelopeDigest,
      reason: input.reason,
    });
  }

  /**
   * Mint a fresh permit. Called by the governed rework closure immediately after a continuation assessment
   * has said rework is a safe path, and only there.
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
 * Validate and CONSUME a permit for one rework closure. Throws a typed `ReworkAdmissionError`; on success
 * the permit is dead, so one admission authorizes exactly one reopening.
 *
 * WHICH BINDINGS ARE CHECKED HERE, AND WHY NOT ALL OF THEM. The three below are facts the EVENT LOG can see,
 * so an admission that cannot confirm them must refuse:
 *
 *   projectId · taskId · freshEnvelopeId
 *
 * `targetObservationDigest` is DELIBERATELY ABSENT from the required set. The admission runs inside a
 * transaction over the log and cannot observe the world, so a "check" against it here could only compare the
 * permit with itself — a comparison that always passes is worse than none, because it would read as a
 * binding. That binding belongs where the world IS visible: the governed closure re-observes the target
 * immediately before minting, exactly as D3-d re-checks the target immediately before creating a world. The
 * permit still CARRIES the digest, so the admission record stays auditable.
 */
export function consumeReworkAdmissionPermit(
  permit: ReworkAdmissionPermit,
  expected: {
    readonly projectId: string;
    readonly taskId: string;
    readonly freshEnvelopeId: string;
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
  const compare = (label: string, actual: string, expectedValue: string): void => {
    if (actual !== expectedValue) refs.push(`expected ${label} ${expectedValue}, got ${actual}`);
  };
  compare("projectId", permit.projectId, expected.projectId);
  compare("taskId", permit.taskId, expected.taskId);
  compare("freshEnvelopeId", permit.freshEnvelopeId, expected.freshEnvelopeId);
  if (refs.length > 0) {
    throw new ReworkAdmissionError(
      "capability_binding_mismatch",
      `rework admission permit does not authorize this closure: ${refs.join("; ")}`,
      refs,
    );
  }
  // One-shot: consume only after every binding matched.
  livePermits.delete(permit);
}

/** The live-only rework admission an EventStore passes to `validateAdmission`. */
export interface ReworkGovernedAdmission {
  readonly reworkPermit?: ReworkAdmissionPermit | undefined;
  readonly reworkPass?: ReworkClosurePass | undefined;
}

/* -------------------------------------------------------------------------- *
 * Closure pass
 * -------------------------------------------------------------------------- */

/**
 * The two events a rework closure consists of, and the ONE pass that authorizes both.
 *
 * WHY A PASS AND NOT TWO PERMITS, OR A GATE ON EITHER EVENT ALONE. The closure is
 *
 *     TASK_REAUTHORIZED(E_1)  →  TASK_READY          i.e.  VERIFYING@E_0 → READY@E_1
 *
 * and gating only one of them leaves a two-step bypass:
 *
 *   · gate only TASK_REAUTHORIZED → a caller emits TASK_READY first (VERIFYING → READY, which the aggregate
 *     accepts today) and THEN reauthorizes a now-READY task, which is ordinary plan reconciliation;
 *   · gate only TASK_READY        → a caller rebinds the VERIFYING task's envelope directly and never asks
 *     for READY at all.
 *
 * Both halves are individually legitimate transitions, so neither is suspicious on its own. Only the
 * COMBINATION is the reopening, which is why the authority has to be over the closure:
 *
 *     a structurally available transition  ≠  an authorized one
 *
 * The pass is bound to one task, one target world and one fresh envelope, and each of its two slots is
 * consumed by exactly the event it expects — so a pass cannot authorize a third event, a different task, or
 * an event that does not belong to this closure.
 */
export class ReworkClosurePass {
  readonly [REWORK_PASS_BRAND] = true as const;
  readonly projectId: string;
  readonly taskId: string;
  readonly permitDigest: string;
  readonly targetObservationDigest: string;
  readonly freshEnvelopeId: string;
  /** Which slots remain. Module-private state, reachable only through `consumeReworkClosureSlot`. */
  readonly #remaining: Set<"TASK_REAUTHORIZED" | "TASK_READY">;
  readonly passDigest: string;

  private constructor(input: {
    readonly projectId: string;
    readonly taskId: string;
    readonly permitDigest: string;
    readonly targetObservationDigest: string;
    readonly freshEnvelopeId: string;
  }) {
    this.projectId = input.projectId;
    this.taskId = input.taskId;
    this.permitDigest = input.permitDigest;
    this.targetObservationDigest = input.targetObservationDigest;
    this.freshEnvelopeId = input.freshEnvelopeId;
    this.#remaining = new Set(["TASK_REAUTHORIZED", "TASK_READY"]);
    this.passDigest = canonicalDigest({
      domain: REWORK_ADMISSION_DIGEST_DOMAIN,
      kind: "rework_closure_pass",
      projectId: input.projectId,
      taskId: input.taskId,
      permitDigest: input.permitDigest,
      targetObservationDigest: input.targetObservationDigest,
      freshEnvelopeId: input.freshEnvelopeId,
    });
  }

  /**
   * Mint a closure pass. Called ONLY by the governed closure entry point, immediately after it has
   * re-observed the target world — which is where the world binding is actually established, because this
   * module (and the admission that consumes the pass) cannot see the world.
   */
  static issue(input: {
    readonly permit: ReworkAdmissionPermit;
    readonly targetObservationDigest: string;
  }): ReworkClosurePass {
    const pass = new ReworkClosurePass({
      projectId: input.permit.projectId,
      taskId: input.permit.taskId,
      permitDigest: input.permit.permitDigest,
      targetObservationDigest: input.targetObservationDigest,
      freshEnvelopeId: input.permit.freshEnvelopeId,
    });
    livePasses.add(pass);
    return pass;
  }

  static isLive(pass: unknown): boolean {
    return typeof pass === "object" && pass !== null && livePasses.has(pass);
  }

  /** Diagnostic: the slots this pass still authorizes. Never authoritative. */
  remainingSlots(): readonly string[] {
    return Object.freeze([...this.#remaining]);
  }

  /** Module-private: the aggregate consumes through `consumeReworkClosureSlot`, never directly. */
  consumeSlot(eventType: "TASK_REAUTHORIZED" | "TASK_READY", expectedEnvelopeId: string | null): void {
    if (!this.#remaining.has(eventType)) {
      throw new ReworkAdmissionError(
        "rework_closure_slot_unavailable",
        `this rework closure pass does not authorize another ${eventType}: each slot is consumed once, so one admission reopens one Work exactly once`,
      );
    }
    if (eventType === "TASK_REAUTHORIZED" && expectedEnvelopeId !== this.freshEnvelopeId) {
      throw new ReworkAdmissionError(
        "capability_binding_mismatch",
        `this rework closure pass authorizes rebinding to envelope ${this.freshEnvelopeId}, not to ${String(expectedEnvelopeId)}`,
        [this.freshEnvelopeId, String(expectedEnvelopeId)],
      );
    }
    this.#remaining.delete(eventType);
    if (this.#remaining.size === 0) livePasses.delete(this);
  }
}

/**
 * Consume one slot of a closure pass for one event.
 *
 * `expectedEnvelopeId` is `null` for `TASK_READY`, which carries no envelope of its own — the rebinding is
 * the other half of the same pass, and the task's envelope is verified against the trusted policy by the
 * ordinary admission path regardless.
 */
export function consumeReworkClosureSlot(
  pass: ReworkClosurePass,
  expected: {
    readonly projectId: string;
    readonly taskId: string;
    readonly eventType: "TASK_REAUTHORIZED" | "TASK_READY";
    readonly freshEnvelopeId: string | null;
  },
): void {
  if (!livePasses.has(pass)) {
    throw new ReworkAdmissionError(
      "capability_not_issued",
      "rework closure pass was not issued by the trusted rework admission module, or its slots are exhausted",
    );
  }
  const refs: string[] = [];
  if (pass.projectId !== expected.projectId) refs.push(`expected projectId ${pass.projectId}, got ${expected.projectId}`);
  if (pass.taskId !== expected.taskId) refs.push(`expected taskId ${pass.taskId}, got ${expected.taskId}`);
  if (refs.length > 0) {
    throw new ReworkAdmissionError(
      "capability_binding_mismatch",
      `rework closure pass does not authorize this event: ${refs.join("; ")}`,
      refs,
    );
  }
  pass.consumeSlot(expected.eventType, expected.freshEnvelopeId);
}
