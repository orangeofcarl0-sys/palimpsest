/**
 * Trajectory-P2-B §9 — ASSOCIATION QUALIFICATION (THE READ SIDE).
 *
 * This is where a durable observation either becomes a qualified association or is refused, and it is
 * the module §5 B0-C3's "a caller-supplied label must never authorize a binding" is actually enforced.
 *
 * WHAT PRODUCES QUALIFICATION. Nothing on a stored record can qualify itself. Qualification requires
 * ALL of:
 *
 *   1. a committed durable observation for the exact (projectId, attemptId, invocationId);
 *   2. a RE-READ of canonical Work confirming the Attempt exists under this project;
 *   3. a READ of the real DSH Session header confirming the session exists and its SessionId matches;
 *   4. the record's `sourceBasis` matching the VERIFIER's own trusted basis — so a record written with
 *      a different executable basis, or a self-declared `FIRST_PARTY_DSH_QUALIFIED` label, is refused
 *      even though it is stored;
 *   5. the Invocation's observation window being CLOSED (a window still OPEN is INCOMPLETE);
 *   6. exactly ONE distinct SessionId among the candidates (two or more is a CONFLICT — never
 *      first-wins or last-wins, and never a silent choice).
 *
 * WHAT CANNOT PRODUCE QUALIFICATION. A record whose `sourceQualificationDeclared` says
 * `FIRST_PARTY_DSH_QUALIFIED` (the field is never read here); a record with no matching Work Attempt;
 * a record whose basis does not match the deployment; a Session that cannot be read; an open or
 * missing window; two candidate identities.
 *
 * §9.3 MIXED STATES. All candidates for the invocation are considered, INCLUDING ones that are not yet
 * "verified" (there is no such stored state). A genuinely observed second identity makes the invocation
 * CONFLICT even if the first was recorded earlier, so a later credible observation cannot be silently
 * excluded.
 *
 * §9.4 CARDINALITY. One Attempt may have SEVERAL invocations (retries). Each invocation is qualified
 * independently; an Attempt-wide query returns every qualified association or an explicit ambiguity.
 * The latest Session is never auto-selected.
 *
 * Layer: L2 (`src/execution_association/`). Read-only over its own store; it reads Work and DSH through
 * injected ports and owns no authority over either.
 */
import type { DshSessionReadPort } from "../trajectory/execution.js";
import type { AttemptSessionAssociation } from "../trajectory/binding.js";
import {
  type ExecutionAssociationEvent,
  type InvocationObservationFinalizedPayload,
  type SessionIdentityObservedPayload,
  type TrustedSourceBasis,
} from "./contract.js";
import type { ExecutionAssociationStore } from "./store.js";

/**
 * §9.2: the qualification outcome vocabulary. Deliberately small; each state has a distinct epistemic
 * meaning and they are never collapsed (§10.4).
 */
export const ASSOCIATION_QUALIFICATION_STATES = [
  /** No durable observation exists for this attempt/invocation. */
  "NO_DURABLE_OBSERVATION",
  /** Observations exist but the invocation's window never closed, so the candidate set may be incomplete. */
  "OBSERVATION_INCOMPLETE",
  /** The DSH Session source could not be read (missing, unreadable, unsupported format). */
  "SOURCE_UNAVAILABLE",
  /** The source refused: the record's basis does not match this deployment, or Work refused the attempt. */
  "SOURCE_REFUSED",
  /** The invocation has two or more distinct observed Session identities. */
  "CONFLICT",
  /** A unique, source-qualified association was established. */
  "ASSOCIATION_QUALIFIED",
] as const;
export type AssociationQualificationState = (typeof ASSOCIATION_QUALIFICATION_STATES)[number];

/** §9.1: the Work revalidation port. The verifier re-reads canonical Work; it does not trust the record. */
export interface WorkRevalidationPort {
  /** Re-read the canonical Attempt. `null` means the Attempt is not in this project's history. */
  readAttempt(input: { readonly projectId: string; readonly attemptId: string }): {
    readonly taskId: string | null;
    readonly state: string | null;
  } | null;
}

/** §9.1: the DSH source revalidation port, backed by the official reader. */
export interface DshSourceRevalidationPort {
  /** Read the immutable header of one session, or report why it is unavailable. */
  readHeaderIdentity(sessionId: string): ReturnType<DshSessionReadPort["readHeaderIdentity"]>;
}

export interface QualifiedAssociation {
  readonly state: "ASSOCIATION_QUALIFIED";
  readonly projectId: string;
  readonly attemptId: string;
  readonly invocationId: string;
  readonly dshSessionId: string;
  /** The committed durable observation's event id — a REAL reference, never fabricated (§9.5). */
  readonly durableBindingRef: string;
  readonly hostLocalJobId: string | null;
  /** The verification basis actually used, so a reviewer re-checks the equality rather than trusting it. */
  readonly basis: {
    readonly sourceBasisMatched: boolean;
    readonly workAttemptConfirmed: boolean;
    readonly dshHeaderConfirmed: boolean;
    readonly windowClosed: boolean;
    readonly candidateCount: number;
  };
  /** §9.5: the H1-compatible association, assembled from the REAL evidence — no dummy fields. */
  readonly h1Association: AttemptSessionAssociation;
}

export interface UnqualifiedAssociation {
  readonly state: Exclude<AssociationQualificationState, "ASSOCIATION_QUALIFIED">;
  readonly projectId: string;
  readonly attemptId: string;
  readonly invocationId: string;
  readonly detail: string;
  /** Every candidate the verifier considered, so a reviewer sees the evidence rather than the verdict. */
  readonly candidates: readonly { readonly dshSessionId: string; readonly eventId: string; readonly hostLocalJobId: string | null }[];
}

export type AssociationQualification = QualifiedAssociation | UnqualifiedAssociation;

export interface AssociationQualifier {
  /**
   * §9.1/§9.4: qualify EVERY invocation of one attempt, independently. The result is either the set of
   * qualified associations or an explicit refusal for the whole attempt.
   */
  qualifyAttempt(input: { readonly projectId: string; readonly attemptId: string }): Promise<{
    readonly attemptId: string;
    readonly qualifications: readonly AssociationQualification[];
    /** §9.4: the attempt-wide summary, so an ambiguous multi-invocation case is visible, not hidden. */
    readonly summary: {
      readonly invocationCount: number;
      readonly qualifiedCount: number;
      readonly conflictCount: number;
      readonly incompleteCount: number;
      readonly unavailableCount: number;
      readonly refusedCount: number;
    };
  }>;
}

function observedEvents(events: readonly ExecutionAssociationEvent[]): readonly (ExecutionAssociationEvent & { readonly payload: SessionIdentityObservedPayload })[] {
  return events.filter((event): event is ExecutionAssociationEvent & { readonly payload: SessionIdentityObservedPayload } => event.type === "SESSION_IDENTITY_OBSERVED");
}

function finalizationsOf(events: readonly ExecutionAssociationEvent[]): readonly InvocationObservationFinalizedPayload[] {
  return events
    .filter((event): event is ExecutionAssociationEvent & { readonly payload: InvocationObservationFinalizedPayload } => event.type === "INVOCATION_OBSERVATION_FINALIZED")
    .map((event) => event.payload);
}

/**
 * §9.5: assemble the H1 association from REAL evidence.
 *
 * Every field is taken from an actual stored fact or an actual read. `durableBindingRef` is the
 * committed event id (a real reference, not a fabricated one) and `verification: "VERIFIED"` is set
 * ONLY here, after the checks above passed — never from a caller's input.
 */
function toH1Association(input: {
  readonly payload: SessionIdentityObservedPayload;
  readonly durableBindingRef: string;
}): AttemptSessionAssociation {
  return Object.freeze({
    schemaVersion: 1,
    projectId: input.payload.projectId,
    attemptId: input.payload.attemptId,
    invocationId: input.payload.invocationId,
    dshSessionId: input.payload.dshSessionId,
    producerEvidence: Object.freeze({ source: "CANONICAL_ATTEMPT_BINDING" as const, reference: input.durableBindingRef }),
    observationState: "PRODUCER_OBSERVED" as const,
    durableBindingRef: input.durableBindingRef,
    verification: "VERIFIED" as const,
    conflictDetail: null,
  });
}

export function makeAssociationQualifier(input: {
  readonly store: ExecutionAssociationStore;
  readonly work: WorkRevalidationPort;
  readonly dsh: DshSourceRevalidationPort;
  /** §5 B0-C3: the VERIFIER's own trusted basis. A record must match THIS, not declare its own. */
  readonly trustedBasis: TrustedSourceBasis;
}): AssociationQualifier {
  const sameBasis = (a: TrustedSourceBasis, b: TrustedSourceBasis): boolean =>
    a.adapterId === b.adapterId &&
    a.workerBinBasename === b.workerBinBasename &&
    a.workerBinDigest === b.workerBinDigest &&
    a.nodeExecutableDigest === b.nodeExecutableDigest;

  async function qualifyInvocation(input2: {
    readonly projectId: string;
    readonly attemptId: string;
    readonly invocationId: string;
    readonly events: readonly ExecutionAssociationEvent[];
  }): Promise<AssociationQualification> {
    const candidates = observedEvents(input2.events);
    const unqualified = (state: UnqualifiedAssociation["state"], detail: string): UnqualifiedAssociation =>
      Object.freeze({
        state,
        projectId: input2.projectId,
        attemptId: input2.attemptId,
        invocationId: input2.invocationId,
        detail,
        candidates: Object.freeze(candidates.map((event) => ({ dshSessionId: event.payload.dshSessionId, eventId: event.eventId, hostLocalJobId: event.payload.hostLocalJobId }))),
      });

    if (candidates.length === 0) {
      return unqualified("NO_DURABLE_OBSERVATION", "no durable session-identity observation exists for this invocation");
    }

    /**
     * §5 B0-C3/§9.1: the source basis must match the VERIFIER's own. A self-declared label is not
     * consulted: the check is on the deployment basis the record was stamped with, compared to the basis
     * the verifier independently holds. A record written by a different executable basis is REFUSED.
     */
    for (const candidate of candidates) {
      if (!sameBasis(candidate.payload.sourceBasis, input.trustedBasis)) {
        return unqualified(
          "SOURCE_REFUSED",
          "the observation's source basis does not match this deployment's trusted basis, so the source is refused regardless of what the record declares about itself",
        );
      }
    }

    /** §9.1: re-read canonical Work. The Attempt must exist in THIS project's history. */
    const workRecord = input.work.readAttempt({ projectId: input2.projectId, attemptId: input2.attemptId });
    if (workRecord === null) {
      return unqualified("SOURCE_REFUSED", "canonical Work has no such attempt under this project, so the association cannot be attributed");
    }

    /**
     * §9.3/§9.4: cardinality over the COMPLETE candidate set. Two distinct SessionIds is a conflict —
     * the earlier record is not silently preferred.
     */
    const distinct = [...new Set(candidates.map((candidate) => candidate.payload.dshSessionId))];
    if (distinct.length > 1) {
      return unqualified(
        "CONFLICT",
        `this invocation is observed to have produced ${String(distinct.length)} distinct sessions (${distinct.join(", ")}), so no single identity is established`,
      );
    }

    /** §8: a window that never closed leaves the candidate set possibly incomplete — durable but not qualified. */
    const finalizations = finalizationsOf(input2.events);
    const closed = finalizations.some((entry) => entry.windowState === "CLOSED" && entry.closeReason !== "UNKNOWN");
    if (!closed) {
      return unqualified("OBSERVATION_INCOMPLETE", "the invocation's observation window never reached a known terminal boundary, so the candidate set may be incomplete");
    }

    /** §9.1: read the REAL DSH Session header. The session must exist and its identity must agree. */
    const sessionId = distinct[0]!;
    const header = await input.dsh.readHeaderIdentity(sessionId);
    if (header.readState !== "READ_OK" || header.header === null) {
      return unqualified("SOURCE_UNAVAILABLE", `the DSH session source could not be read (${header.readState}): ${header.detail}`);
    }
    if (header.header.sessionId !== sessionId) {
      return unqualified(
        "SOURCE_REFUSED",
        `the DSH session header names "${header.header.sessionId}", which contradicts the observed identity "${sessionId}"`,
      );
    }

    const chosen = candidates.find((candidate) => candidate.payload.dshSessionId === sessionId)!;
    return Object.freeze({
      state: "ASSOCIATION_QUALIFIED" as const,
      projectId: input2.projectId,
      attemptId: input2.attemptId,
      invocationId: input2.invocationId,
      dshSessionId: sessionId,
      durableBindingRef: chosen.eventId,
      hostLocalJobId: chosen.payload.hostLocalJobId,
      basis: Object.freeze({
        sourceBasisMatched: true,
        workAttemptConfirmed: true,
        dshHeaderConfirmed: true,
        windowClosed: true,
        candidateCount: candidates.length,
      }),
      h1Association: toH1Association({ payload: chosen.payload, durableBindingRef: chosen.eventId }),
    });
  }

  return Object.freeze({
    async qualifyAttempt(input2: { readonly projectId: string; readonly attemptId: string }) {
      const events = input.store.replayForAttempt({ projectId: input2.projectId, attemptId: input2.attemptId });
      const invocations = [...new Set(events.map((event) => event.payload.invocationId))].sort();
      const qualifications: AssociationQualification[] = [];
      for (const invocationId of invocations) {
        qualifications.push(
          await qualifyInvocation({
            projectId: input2.projectId,
            attemptId: input2.attemptId,
            invocationId,
            events: events.filter((event) => event.payload.invocationId === invocationId),
          }),
        );
      }
      const count = (state: AssociationQualificationState) => qualifications.filter((entry) => entry.state === state).length;
      return Object.freeze({
        attemptId: input2.attemptId,
        qualifications: Object.freeze(qualifications),
        summary: Object.freeze({
          invocationCount: invocations.length,
          qualifiedCount: count("ASSOCIATION_QUALIFIED"),
          conflictCount: count("CONFLICT"),
          incompleteCount: count("OBSERVATION_INCOMPLETE"),
          unavailableCount: count("SOURCE_UNAVAILABLE"),
          refusedCount: count("SOURCE_REFUSED"),
        }),
      });
    },
  });
}
