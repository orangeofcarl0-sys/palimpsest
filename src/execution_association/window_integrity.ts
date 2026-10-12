/**
 * Trajectory-P2-C §6.6 — OBSERVATION-WINDOW INTEGRITY.
 *
 * P2-B accepted a finalization whenever it said `windowState = CLOSED` with a non-`UNKNOWN` reason. That
 * is a self-declaration, and three falsifiers reproduce what it misses:
 *
 *   F4  a finalization recorded BEFORE the observation it claims to close
 *   F5  a finalization whose `observedCandidateCount` disagrees with the actual candidate set
 *   F6  a finalization that cannot distinguish a timeout from a real child close
 *
 * This module derives the window's integrity from the DURABLE RECORD ORDER and the actual candidate set,
 * not from the finalization's own fields. The rule the ruling states: a finalization must be supported by
 * a source-grounded terminal observation, and a window whose closure cannot be proven remains INCOMPLETE.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not claim the IPC channel is drained. A `close` event is the
 * last moment a message can arrive, so a finalization written AFTER all observations is the strongest
 * ordering a durable log can show — and that is exactly what is required, no more.
 *
 * Layer: L2 (`src/execution_association/`). Pure; it reads an event list and returns a verdict.
 */
import type { ExecutionAssociationEvent, InvocationObservationFinalizedPayload, SessionIdentityObservedPayload } from "./contract.js";

/** §6.6: the window-integrity verdict for ONE invocation. */
export const WINDOW_INTEGRITY_STATES = [
  /** No finalization exists; the candidate set may still grow. */
  "OPEN",
  /** A finalization exists and is consistent with the observation set. */
  "CLOSED_CONSISTENT",
  /** A finalization exists but contradicts the observation set (ordering, count, or duplicates). */
  "CONTRADICTORY",
  /** More than one distinct finalization exists for the invocation. */
  "MULTIPLE_FINALIZATIONS",
] as const;
export type WindowIntegrityState = (typeof WINDOW_INTEGRITY_STATES)[number];

export const WINDOW_INTEGRITY_REASONS = [
  "OBSERVATION_AFTER_FINALIZATION",
  "CANDIDATE_COUNT_MISMATCH",
  "FINALIZATION_BEFORE_FIRST_OBSERVATION",
  "MULTIPLE_FINALIZATIONS",
] as const;
export type WindowIntegrityReason = (typeof WINDOW_INTEGRITY_REASONS)[number];

export interface WindowIntegrityVerdict {
  readonly state: WindowIntegrityState;
  readonly reason: WindowIntegrityReason | null;
  /** The distinct Session identities the durable record set actually contains, in first-seen order. */
  readonly candidateSessionIds: readonly string[];
  readonly finalizationCount: number;
  readonly detail: string;
}

/**
 * §6.6: derive the window's integrity for ONE invocation from its durable events.
 *
 * `events` must be exactly this invocation's events, in seq order. The candidate set is derived from the
 * SESSION_IDENTITY_OBSERVED records themselves, so the finalization's own `observedCandidateCount` is
 * checked against reality rather than trusted.
 */
export function validateObservationWindow(events: readonly ExecutionAssociationEvent[]): WindowIntegrityVerdict {
  const observations = events.filter(
    (event): event is ExecutionAssociationEvent & { readonly payload: SessionIdentityObservedPayload } => event.type === "SESSION_IDENTITY_OBSERVED",
  );
  const finalizations = events.filter(
    (event): event is ExecutionAssociationEvent & { readonly payload: InvocationObservationFinalizedPayload } => event.type === "INVOCATION_OBSERVATION_FINALIZED",
  );

  const candidateSessionIds = [...new Set(observations.map((event) => event.payload.dshSessionId))];

  if (finalizations.length === 0) {
    return Object.freeze({
      state: "OPEN" as const,
      reason: null,
      candidateSessionIds: Object.freeze(candidateSessionIds),
      finalizationCount: 0,
      detail: "no finalization exists for this invocation, so its observation window may still grow",
    });
  }
  if (finalizations.length > 1) {
    const distinct = new Set(finalizations.map((event) => `${event.payload.windowState}:${event.payload.closeReason}:${String(event.payload.observedCandidateCount)}`));
    if (distinct.size > 1) {
      return Object.freeze({
        state: "CONTRADICTORY" as const,
        reason: "MULTIPLE_FINALIZATIONS" as const,
        candidateSessionIds: Object.freeze(candidateSessionIds),
        finalizationCount: finalizations.length,
        detail: `this invocation has ${String(finalizations.length)} conflicting finalizations, so its window closure is not established`,
      });
    }
  }

  const finalization = finalizations[finalizations.length - 1]!;
  const lastObservationSeq = observations.length === 0 ? null : Math.max(...observations.map((event) => event.seq));
  const firstObservationSeq = observations.length === 0 ? null : Math.min(...observations.map((event) => event.seq));

  /**
   * §6.6 F4: an observation recorded AFTER the finalization means the window was sealed too early. The
   * finalization's own `observedCandidateCount` cannot hide this because the ordering is a property of
   * the durable sequence, not of the payload.
   */
  if (lastObservationSeq !== null && lastObservationSeq > finalization.seq) {
    return Object.freeze({
      state: "CONTRADICTORY" as const,
      reason: "OBSERVATION_AFTER_FINALIZATION" as const,
      candidateSessionIds: Object.freeze(candidateSessionIds),
      finalizationCount: finalizations.length,
      detail: `an observation at seq ${String(lastObservationSeq)} follows the finalization at seq ${String(finalization.seq)}, so the window was sealed before its candidate set was complete`,
    });
  }
  /** A finalization with no observation at all, claiming to close an empty window, is not a closure. */
  if (firstObservationSeq === null) {
    return Object.freeze({
      state: "CONTRADICTORY" as const,
      reason: "FINALIZATION_BEFORE_FIRST_OBSERVATION" as const,
      candidateSessionIds: Object.freeze(candidateSessionIds),
      finalizationCount: finalizations.length,
      detail: "the invocation records a finalization but no observation, so there is no window to close",
    });
  }
  /**
   * §6.6 F5: the recorded candidate count must equal the ACTUAL distinct candidate set.
   */
  if (finalization.payload.observedCandidateCount !== candidateSessionIds.length) {
    return Object.freeze({
      state: "CONTRADICTORY" as const,
      reason: "CANDIDATE_COUNT_MISMATCH" as const,
      candidateSessionIds: Object.freeze(candidateSessionIds),
      finalizationCount: finalizations.length,
      detail: `the finalization reports ${String(finalization.payload.observedCandidateCount)} candidate(s) but the durable records contain ${String(candidateSessionIds.length)}`,
    });
  }
  if (finalization.payload.windowState !== "CLOSED" || finalization.payload.closeReason === "UNKNOWN") {
    return Object.freeze({
      state: "OPEN" as const,
      reason: null,
      candidateSessionIds: Object.freeze(candidateSessionIds),
      finalizationCount: finalizations.length,
      detail: `the finalization reports windowState ${finalization.payload.windowState} with reason ${finalization.payload.closeReason}, so closure is not established`,
    });
  }

  return Object.freeze({
    state: "CLOSED_CONSISTENT" as const,
    reason: null,
    candidateSessionIds: Object.freeze(candidateSessionIds),
    finalizationCount: finalizations.length,
    detail: `the window closed consistently with ${String(candidateSessionIds.length)} candidate(s), all observed before the finalization`,
  });
}
