/**
 * Trajectory-P2-C §8.5 — CROSS-FIELD ADMISSION INVARIANTS.
 *
 * The Handoff Preview gates events on ONE flag (`sessionReadAdmission === "ADMITTED_TO_ATTEMPT"`), so a
 * binding whose fields contradict one another can still expose events. The F11 falsifier reproduces the
 * canonical case:
 *
 *     sessionBindingStatus = SESSION_CLAIMED_UNVERIFIED
 *     dshSessionId         = null
 *     sessionReadAdmission = ADMITTED_TO_ATTEMPT
 *
 * This module is the small PURE validator the ruling asks for — not a general-purpose state machine. It
 * refuses a contradictory combination outright, so a composition that always supplies self-consistent
 * fields is not the only thing standing between a contradiction and a consumer.
 *
 * WHAT IT CHECKS. Only the invariants that are true by construction of the model:
 *
 *   · ADMITTED_TO_ATTEMPT requires a non-null verified SessionId;
 *   · BOUND_VERIFIED requires a non-null SessionId;
 *   · a null SessionId cannot be ADMITTED and cannot be BOUND_VERIFIED;
 *   · a page's session identity must equal the established one;
 *   · a page may only be admitted when the binding is verified;
 *   · SESSION_UNBOUND / NO_SESSION_BOUND cannot be ADMITTED.
 *
 * Layer: L2 (`src/trajectory/`). Pure, read-only, decides no authority.
 */
import type { AttemptExecutionBinding, DshSessionEventPage, SessionBindingState, SessionReadAdmission } from "./execution.js";

/** §8.5: the bounded reasons an admission combination is refused. */
export const ADMISSION_INVARIANT_REASONS = [
  "ADMITTED_WITHOUT_SESSION_ID",
  "ADMITTED_WITHOUT_VERIFIED_BINDING",
  "BOUND_VERIFIED_WITHOUT_SESSION_ID",
  "ADMITTED_WITH_UNBOUND_SESSION",
  "PAGE_SESSION_DIFFERS_FROM_BINDING",
  "PAGE_SUPPLIED_WITHOUT_ADMISSION",
] as const;
export type AdmissionInvariantReason = (typeof ADMISSION_INVARIANT_REASONS)[number];

export interface AdmissionInvariantVerdict {
  /** True only when EVERY invariant holds. A consumer must not expose events when this is false. */
  readonly admissible: boolean;
  readonly reason: AdmissionInvariantReason | null;
  readonly detail: string;
}

/**
 * §8.5: validate the cross-field invariants of ONE binding (and its optional page).
 *
 * The order is deliberate: the binding's own consistency is checked before any page is considered, so a
 * contradictory binding is refused even when no page was read.
 */
export function validateAdmissionInvariants(input: {
  readonly binding: Pick<AttemptExecutionBinding, "sessionBindingStatus" | "dshSessionId" | "claimedSessionId" | "sessionReadAdmission">;
  readonly page?: DshSessionEventPage | undefined;
}): AdmissionInvariantVerdict {
  const { binding } = input;
  const status: SessionBindingState = binding.sessionBindingStatus;
  const admission: SessionReadAdmission = binding.sessionReadAdmission;
  const sessionId = binding.dshSessionId;

  /** §8.5: BOUND_VERIFIED with a null id is contradictory. */
  if (status === "BOUND_VERIFIED" && sessionId === null) {
    return Object.freeze({
      admissible: false,
      reason: "BOUND_VERIFIED_WITHOUT_SESSION_ID" as const,
      detail: "the binding claims BOUND_VERIFIED but establishes no SessionId, so no session can be attributed",
    });
  }
  /** §8.5: the canonical F11 case — admission with no established id. */
  if (admission === "ADMITTED_TO_ATTEMPT" && sessionId === null) {
    return Object.freeze({
      admissible: false,
      reason: "ADMITTED_WITHOUT_SESSION_ID" as const,
      detail: "the read is marked ADMITTED_TO_ATTEMPT but no verified SessionId exists, so the admission is not established",
    });
  }
  /** §8.5: admission requires the binding itself to be verified. */
  if (admission === "ADMITTED_TO_ATTEMPT" && status !== "BOUND_VERIFIED") {
    return Object.freeze({
      admissible: false,
      reason: "ADMITTED_WITHOUT_VERIFIED_BINDING" as const,
      detail: `the read is marked ADMITTED_TO_ATTEMPT while the binding is ${status}, so the session is not attributed to this attempt`,
    });
  }
  /** §8.5: an unbound attempt cannot have an admitted read. */
  if (admission === "ADMITTED_TO_ATTEMPT" && (status === "SESSION_UNBOUND" || status === "SESSION_CLAIMED_UNVERIFIED" || status === "CONFLICT" || status === "SOURCE_UNAVAILABLE" || status === "AMBIGUOUS")) {
    return Object.freeze({
      admissible: false,
      reason: "ADMITTED_WITH_UNBOUND_SESSION" as const,
      detail: `the read is marked ADMITTED_TO_ATTEMPT but the binding state ${status} does not establish an attempt-owned session`,
    });
  }
  /** §8.5: a page may only be presented under an admitted read. */
  if (input.page !== undefined && admission !== "ADMITTED_TO_ATTEMPT") {
    return Object.freeze({
      admissible: false,
      reason: "PAGE_SUPPLIED_WITHOUT_ADMISSION" as const,
      detail: `a session page was supplied while the read admission is ${admission}, so the page is not admitted to this attempt`,
    });
  }
  /** §8.5: the page's session must be the established one. */
  if (input.page !== undefined && input.page.sessionId !== null && input.page.sessionId !== sessionId) {
    return Object.freeze({
      admissible: false,
      reason: "PAGE_SESSION_DIFFERS_FROM_BINDING" as const,
      detail: `the page names session ${input.page.sessionId} but the binding establishes ${String(sessionId)}`,
    });
  }

  return Object.freeze({ admissible: true, reason: null, detail: "every cross-field admission invariant holds" });
}
