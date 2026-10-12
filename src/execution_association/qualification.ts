/**
 * Trajectory-P2-C §6 — ASSOCIATION QUALIFICATION (THE READ SIDE), hardened.
 *
 * P2-B qualified an association from: a durable record, a Work RECORD existence check, a basis VALUE
 * match, a CLOSED window and a single candidate. P2-C strengthens each of those, because each had a
 * falsifier against it:
 *
 *   §6.1  the source is qualified against the VERIFIER'S OWN trusted epochs (F1/F2/F3), not the record's
 *         basis compared to a caller-supplied value, and the record's KIND must agree with the matching
 *         epoch. A CONTROLLED_STUB cannot ride a matching basis into first-party verification.
 *   §6.4  the durable records were already validated at the store boundary (F8/F9); the qualifier refuses
 *         a corrupted history rather than reading it as empty.
 *   §6.5  canonical Work is revalidated through the EXISTING V0S/H0 admission logic (F10), which verifies
 *         the exact historical ATTEMPT_CREATED event, rather than a non-null record.
 *   §6.6  the window is validated structurally (F4/F5/F6) from the durable record order.
 *   §6.7  a bounded CURRENTNESS protocol (F7): capture the store head before the async DSH read, and
 *         re-check it after; a relevant change yields RACED rather than a stale ASSOCIATION_QUALIFIED.
 *
 * WHAT IT STILL DOES NOT CLAIM. The source basis is a PATH-based digest, so this is a local
 * trusted-composition boundary, not content attestation. That limitation travels on the result.
 *
 * Layer: L2 (`src/execution_association/`). Read-only over its own store; Work and DSH are injected ports.
 */
import type { DshSessionReadPort } from "../trajectory/execution.js";
import type { AttemptSessionAssociation } from "../trajectory/binding.js";
import { type ExecutionAssociationEvent, type SessionIdentityObservedPayload, type TrustedSourceBasis } from "./contract.js";
import { qualifyRecordSource, type TrustedSourceRegistry } from "./source.js";
import { validateObservationWindow } from "./window_integrity.js";
import type { ExecutionAssociationStore } from "./store.js";

/**
 * §9.2: the qualification outcome vocabulary.
 *
 * `RACED` is the P2-C addition: the durable history changed while the asynchronous source read was in
 * flight, so the result is not bound to a single basis and must be re-evaluated.
 */
export const ASSOCIATION_QUALIFICATION_STATES = [
  "NO_DURABLE_OBSERVATION",
  "OBSERVATION_INCOMPLETE",
  "SOURCE_UNAVAILABLE",
  "SOURCE_REFUSED",
  "CONFLICT",
  "RACED",
  "ASSOCIATION_QUALIFIED",
] as const;
export type AssociationQualificationState = (typeof ASSOCIATION_QUALIFICATION_STATES)[number];

/**
 * §6.5: the Work revalidation port. The verifier re-reads canonical Work through the EXISTING admission
 * logic; it does not trust the record.
 */
export interface WorkRevalidationPort {
  /**
   * Re-read the canonical Attempt. Returns the exact historical identity, or a refusal explaining why the
   * Attempt is not admissible. Implementations should REUSE the V0S/H0 `admitAttempt` logic.
   */
  readAttempt(input: { readonly projectId: string; readonly attemptId: string }):
    | { readonly ok: true; readonly taskId: string | null; readonly state: string | null; readonly creationEventId: string | null }
    | { readonly ok: false; readonly reason: string };
}

/** §6.1: the DSH source revalidation port, backed by the official reader. */
export interface DshSourceRevalidationPort {
  readHeaderIdentity(sessionId: string): ReturnType<DshSessionReadPort["readHeaderIdentity"]>;
}

/** §6.7: the currentness basis captured before the async read. */
export interface QualificationBasis {
  /** The store head at capture time. */
  readonly storeHead: number;
  /** The durable events the qualification was derived from, so a recheck compares like with like. */
  readonly attemptEventCount: number;
}

export interface QualifiedAssociation {
  readonly state: "ASSOCIATION_QUALIFIED";
  readonly projectId: string;
  readonly attemptId: string;
  readonly invocationId: string;
  readonly dshSessionId: string;
  readonly durableBindingRef: string;
  readonly hostLocalJobId: string | null;
  readonly sourceEpochId: string;
  readonly basis: {
    readonly sourceEpochMatched: boolean;
    readonly sourceKindAgreed: boolean;
    readonly workAttemptConfirmed: boolean;
    readonly dshHeaderConfirmed: boolean;
    readonly windowClosedConsistently: boolean;
    readonly candidateCount: number;
    readonly currentness: QualificationBasis;
  };
  /** §6.8: the H1-compatible association, assembled from REAL evidence — no fabricated fields. */
  readonly h1Association: AttemptSessionAssociation;
  /** §6.1: the honest limit of the local source boundary. */
  readonly sourceLimit: string;
}

export interface UnqualifiedAssociation {
  readonly state: Exclude<AssociationQualificationState, "ASSOCIATION_QUALIFIED">;
  readonly projectId: string;
  readonly attemptId: string;
  readonly invocationId: string;
  readonly detail: string;
  readonly candidates: readonly { readonly dshSessionId: string; readonly eventId: string; readonly hostLocalJobId: string | null }[];
}

export type AssociationQualification = QualifiedAssociation | UnqualifiedAssociation;

export interface AssociationQualifier {
  qualifyAttempt(input: { readonly projectId: string; readonly attemptId: string }): Promise<{
    readonly attemptId: string;
    readonly qualifications: readonly AssociationQualification[];
    readonly summary: {
      readonly invocationCount: number;
      readonly qualifiedCount: number;
      readonly conflictCount: number;
      readonly incompleteCount: number;
      readonly unavailableCount: number;
      readonly refusedCount: number;
      readonly racedCount: number;
    };
  }>;
}

const SOURCE_LIMIT =
  "the source basis is a digest of the configured executable PATHS, so this is a local trusted-composition boundary: it establishes that the deployment was configured with this executable, not that the bytes on disk were the expected ones, and it is not remote attestation";

function observedEvents(events: readonly ExecutionAssociationEvent[]): readonly (ExecutionAssociationEvent & { readonly payload: SessionIdentityObservedPayload })[] {
  return events.filter((event): event is ExecutionAssociationEvent & { readonly payload: SessionIdentityObservedPayload } => event.type === "SESSION_IDENTITY_OBSERVED");
}

/**
 * §6.8: assemble the H1 association from REAL evidence. `durableBindingRef` is the committed event id and
 * `verification: "VERIFIED"` is set ONLY after the checks passed.
 */
function toH1Association(input: { readonly payload: SessionIdentityObservedPayload; readonly durableBindingRef: string }): AttemptSessionAssociation {
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
  /** §6.1: the VERIFIER'S OWN trusted epochs. A record must match one, and its kind must agree. */
  readonly registry: TrustedSourceRegistry;
}): AssociationQualifier {
  async function qualifyInvocation(input2: {
    readonly projectId: string;
    readonly attemptId: string;
    readonly invocationId: string;
    readonly events: readonly ExecutionAssociationEvent[];
    readonly storeHeadAtStart: number;
    readonly attemptEventCountAtStart: number;
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

    /** §6.1: EVERY candidate's source must match a trusted epoch AND its kind must agree. */
    let epochId = "";
    for (const candidate of candidates) {
      const source = qualifyRecordSource({ registry: input.registry, recordBasis: candidate.payload.sourceBasis, recordKind: candidate.payload.sourceKind });
      if (!source.ok) {
        return unqualified("SOURCE_REFUSED", source.detail);
      }
      epochId = source.epochId;
    }

    /** §6.5: re-read canonical Work through the EXISTING admission logic, verifying the creation event. */
    const work = input.work.readAttempt({ projectId: input2.projectId, attemptId: input2.attemptId });
    if (!work.ok) {
      return unqualified("SOURCE_REFUSED", `canonical Work refused this attempt: ${work.reason}`);
    }

    /** §6.6: the window is validated from the durable record ORDER, not the finalization's own fields. */
    const window = validateObservationWindow(input2.events);
    if (window.state === "CONTRADICTORY") {
      return unqualified("OBSERVATION_INCOMPLETE", `the observation window is contradictory: ${window.detail}`);
    }
    if (window.state !== "CLOSED_CONSISTENT") {
      return unqualified("OBSERVATION_INCOMPLETE", `the observation window is not consistently closed: ${window.detail}`);
    }

    /** §9.3: cardinality over the COMPLETE candidate set. Two identities is a conflict. */
    if (window.candidateSessionIds.length > 1) {
      return unqualified(
        "CONFLICT",
        `this invocation is observed to have produced ${String(window.candidateSessionIds.length)} distinct sessions (${window.candidateSessionIds.join(", ")}), so no single identity is established`,
      );
    }

    const sessionId = window.candidateSessionIds[0]!;

    /** §6.1: read the REAL DSH Session header. */
    const header = await input.dsh.readHeaderIdentity(sessionId);
    if (header.readState !== "READ_OK" || header.header === null) {
      return unqualified("SOURCE_UNAVAILABLE", `the DSH session source could not be read (${header.readState}): ${header.detail}`);
    }
    if (header.header.sessionId !== sessionId) {
      return unqualified("SOURCE_REFUSED", `the DSH session header names "${header.header.sessionId}", which contradicts the observed identity "${sessionId}"`);
    }

    /**
     * §6.7 CURRENTNESS: the asynchronous header read may have taken time. Re-read the store and refuse a
     * result bound to a basis that no longer holds. This is a bounded optimistic read-check, not a
     * transaction, and it makes a stale qualification impossible to return silently.
     */
    const headAfter = input.store.head();
    const eventsAfter = input.store.replayForAttempt({ projectId: input2.projectId, attemptId: input2.attemptId });
    const relevantChanged =
      headAfter !== input2.storeHeadAtStart &&
      (eventsAfter.length !== input2.attemptEventCountAtStart ||
        eventsAfter.some((event, index) => event.eventId !== input2.events[index]?.eventId));
    if (relevantChanged) {
      return unqualified(
        "RACED",
        `the durable association history changed while the DSH source was being read (head ${String(input2.storeHeadAtStart)} -> ${String(headAfter)}), so the qualification is not bound to a stable basis`,
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
      sourceEpochId: epochId,
      basis: Object.freeze({
        sourceEpochMatched: true,
        sourceKindAgreed: true,
        workAttemptConfirmed: true,
        dshHeaderConfirmed: true,
        windowClosedConsistently: true,
        candidateCount: candidates.length,
        currentness: Object.freeze({ storeHead: headAfter, attemptEventCount: eventsAfter.length }),
      }),
      h1Association: toH1Association({ payload: chosen.payload, durableBindingRef: chosen.eventId }),
      sourceLimit: SOURCE_LIMIT,
    });
  }

  return Object.freeze({
    async qualifyAttempt(input2: { readonly projectId: string; readonly attemptId: string }) {
      /** §6.7: capture the basis BEFORE any asynchronous source read. */
      const storeHeadAtStart = input.store.head();
      const events = input.store.replayForAttempt({ projectId: input2.projectId, attemptId: input2.attemptId });
      const attemptEventCountAtStart = events.length;
      const invocations = [...new Set(events.map((event) => event.payload.invocationId))].sort();
      const qualifications: AssociationQualification[] = [];
      for (const invocationId of invocations) {
        qualifications.push(
          await qualifyInvocation({
            projectId: input2.projectId,
            attemptId: input2.attemptId,
            invocationId,
            events: events.filter((event) => event.payload.invocationId === invocationId),
            storeHeadAtStart,
            attemptEventCountAtStart,
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
          racedCount: count("RACED"),
        }),
      });
    },
  });
}

/** §6.1: a basis value the caller may compare against, re-exported so a caller need not reach into contract. */
export type { TrustedSourceBasis };
