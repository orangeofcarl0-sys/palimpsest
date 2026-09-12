/**
 * G10-E1 participation service — the explicit Activation ↔ Attempt relation,
 * recorded (never inferred) on the coordination store (§18/§22).
 *
 * Validation (§34/§35):
 *   - Attempt: must exist, belong to the project, and not be an invented id —
 *     validated against canonical Work state through the injected
 *     `AttemptCatalogPort`. Starting NEW participation against a terminal
 *     Attempt fails closed (`attempt_terminal`); historical records remain
 *     creatable against non-terminal states only.
 *   - Activation: the high-level API accepts an ACTUAL `Activation` (derived
 *     via `activationRefOf`) or a trusted derived ActivationRef — never an
 *     arbitrary `activationId` string alone.
 *
 * Event discipline (§30/§33): explicit immutable events —
 * INVOCATION_RECORDED / PARTICIPATION_STARTED / PARTICIPATION_ENDED — with
 * strict typed payloads. Participation end reasons are participation
 * outcomes; they never mutate Attempt outcome.
 *
 * Idempotency (§39/§156-style): the service derives eventIds
 * deterministically from content, so byte-identical re-recording is
 * idempotent; conflicting duplicates fail closed (`coordination_conflict`).
 */

import type { Activation } from "../runtime/index.js";
import { canonicalDigest } from "../schema/canonical.js";
import type {
  AttemptRef,
  Invocation,
  InvocationId,
  InvocationRef,
  Participation,
  ParticipationEndReason,
  ParticipationId,
} from "./participation.js";
import {
  activationRefOf,
  materializeInvocation,
  materializeParticipation,
  ParticipationError,
} from "./participation.js";
import type {
  CoordinationEvent,
  CoordinationStore,
  ParticipationStartedPayload,
} from "./store.js";

/** Read-only canonical Attempt-state validation (§34). */
export interface AttemptCatalogPort {
  /**
   * Assert the Attempt exists under the project and is not terminal. Throws
   * `ParticipationError{attempt_unknown|attempt_terminal}` fail-closed.
   */
  assertAdmissibleAttempt(attempt: AttemptRef): Promise<void>;
}

export interface ParticipationDeps {
  readonly store: CoordinationStore;
  readonly attempts: AttemptCatalogPort;
  readonly allocateInvocationId: () => InvocationId;
  readonly allocateParticipationId: () => ParticipationId;
}

function eventIdFor(type: string, projectId: string, content: unknown): string {
  return canonicalDigest({ domain: "palimpsest.coordination-event.v1", type, projectId, content });
}

export interface ParticipationService {
  recordInvocation(input: {
    readonly activation: Activation;
    readonly attempt: AttemptRef;
  }): Promise<Invocation>;
  beginParticipation(input: {
    readonly activation: Activation;
    readonly attempt: AttemptRef;
    readonly invocation?: InvocationRef;
  }): Promise<Participation>;
  endParticipation(input: {
    readonly participationId: ParticipationId;
    readonly endReason: ParticipationEndReason;
  }): Promise<CoordinationEvent<"PARTICIPATION_ENDED">>;
  /** Derived participation history for one Attempt (seq order). */
  participationsFor(attempt: AttemptRef): Promise<readonly CoordinationEvent[]>;
}

export function makeParticipationService(deps: ParticipationDeps): ParticipationService {
  async function recordInvocation(input: {
    readonly activation: Activation;
    readonly attempt: AttemptRef;
  }): Promise<Invocation> {
    // §34: the Attempt must canonically exist (history recording does not
    // require it to still be running).
    await deps.attempts.assertAdmissibleAttempt(input.attempt).catch((error) => {
      if (error instanceof ParticipationError && error.kind === "attempt_terminal") {
        // Historical record against a now-terminal Attempt is allowed; only
        // NEW PARTICIPATION STARTS fail closed on terminal state (§34).
        return;
      }
      throw error;
    });
    const invocation = materializeInvocation({
      invocationId: deps.allocateInvocationId(),
      activation: activationRefOf(input.activation),
      attempt: input.attempt,
    });
    const eventId = eventIdFor("INVOCATION_RECORDED", input.attempt.projectId, invocation);
    await deps.store.append({
      eventId,
      projectId: input.attempt.projectId,
      type: "INVOCATION_RECORDED",
      payload: { invocation },
    });
    return invocation;
  }

  async function beginParticipation(input: {
    readonly activation: Activation;
    readonly attempt: AttemptRef;
    readonly invocation?: InvocationRef;
  }): Promise<Participation> {
    // §34: starting NEW participation against a terminal Attempt fails closed.
    await deps.attempts.assertAdmissibleAttempt(input.attempt);
    const participation = materializeParticipation({
      participationId: deps.allocateParticipationId(),
      activation: activationRefOf(input.activation),
      attempt: input.attempt,
      ...(input.invocation === undefined ? {} : { invocation: input.invocation }),
    });
    const eventId = eventIdFor("PARTICIPATION_STARTED", input.attempt.projectId, participation);
    await deps.store.append({
      eventId,
      projectId: input.attempt.projectId,
      type: "PARTICIPATION_STARTED",
      payload: { participation },
    });
    return participation;
  }

  async function endParticipation(input: {
    readonly participationId: ParticipationId;
    readonly endReason: ParticipationEndReason;
  }): Promise<CoordinationEvent<"PARTICIPATION_ENDED">> {
    // The ended participation must exist in history (§156: end twice →
    // idempotent by derived eventId; end of an unknown id → fail closed).
    const history = await deps.store.replay();
    const started = history.find(
      (event): event is CoordinationEvent<"PARTICIPATION_STARTED"> =>
        event.type === "PARTICIPATION_STARTED" &&
        (event.payload as ParticipationStartedPayload).participation.participationId ===
          input.participationId,
    );
    if (started === undefined) {
      throw new ParticipationError(
        "participation_invalid",
        `participation "${input.participationId}" was never started on this coordination store`,
      );
    }
    const payload = { participationId: input.participationId, endReason: input.endReason };
    const eventId = eventIdFor(
      "PARTICIPATION_ENDED",
      started.projectId,
      payload,
    );
    const appended = await deps.store.append({
      eventId,
      projectId: started.projectId,
      type: "PARTICIPATION_ENDED",
      payload,
    });
    return appended[0] as CoordinationEvent<"PARTICIPATION_ENDED">;
  }

  async function participationsFor(attempt: AttemptRef): Promise<readonly CoordinationEvent[]> {
    const history = await deps.store.replay();
    return Object.freeze(
      history.filter(
        (event): event is CoordinationEvent<"PARTICIPATION_STARTED"> =>
          event.type === "PARTICIPATION_STARTED" &&
          event.projectId === attempt.projectId &&
          (event.payload as ParticipationStartedPayload).participation.attempt.attemptId ===
            attempt.attemptId,
      ),
    );
  }

  return { recordInvocation, beginParticipation, endParticipation, participationsFor };
}
