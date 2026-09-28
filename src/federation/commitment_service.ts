/**
 * G10-E4/F0 commitment/handoff service — append-only events, derived state,
 * explicit acceptance only.
 *
 * Acceptance rules (§91/§71):
 *   - COMMITMENT_ACCEPTED is valid only from the PROPOSED HOLDER, and for a
 *     remote holder only when the inbound identity is AUTHENTICATED. An
 *     unauthenticated peer can never activate a commitment (E4-M06).
 *   - Self-commitment (proposer === holder === local peer) accepts locally —
 *     still an explicit acceptance record, never unilateral over another peer.
 * Handoff (§98–§101):
 *   - only the CURRENT HOLDER of an ACTIVE commitment may offer;
 *   - only the target may accept, and only when authenticated;
 *   - acceptance produces SUPERSEDED (old, immutable history) plus an
 *     explicit successor responsibility ACTIVE for the target — no hidden
 *     in-place owner mutation.
 * No Work/scheduler interaction exists here (§87/§96).
 *
 * F0 §13–§21 harden this from read-then-append into head-conditional atomic
 * transitions: every state-dependent transition captures the canonical head
 * it read (`expectedHeadSeq`), derives its preconditions from history up to
 * that head, and commits as ONE `appendAtomic` batch. The four-event handoff
 * transition (SUPERSEDED + HANDOFF_ACCEPTED + successor OFFERED + successor
 * ACCEPTED) therefore commits together or not at all — a crash can never
 * leave "old responsibility superseded, successor absent".
 */

import type { CoordinationAppendRequest, CoordinationEvent, CoordinationStore } from "../coordination/store.js";
import { canonicalDigest } from "../schema/canonical.js";
import type { AcceptedBoundaryRevisionRef } from "../boundary_memory/ref.js";
import type { PeerRef } from "./peer.js";
import type {
  CommitmentAcceptedPayload,
  CommitmentFulfilledPayload,
  CommitmentFulfillmentOutput,
  CommitmentFulfillmentSubmission,
  CommitmentId,
  CommitmentOffer,
  CommitmentOfferedPayload,
  CommitmentReleasedPayload,
  CommitmentScope,
  CommitmentState,
  CommitmentSupersededPayload,
  CommitmentTerms,
  FulfillmentAdmissionDecision,
  FulfillmentDecidedPayload,
  FulfillmentSubmittedPayload,
  HandoffAcceptedPayload,
  HandoffId,
  HandoffOffer,
  HandoffOfferedPayload,
  HandoffRejectedPayload,
} from "./commitment.js";
import {
  CommitmentError,
  commitmentTermsOf,
  materializeFulfillmentSubmission,
  successorCommitmentIdOf,
} from "./commitment.js";

export const FEDERATION_SCOPE = "federation";

/**
 * G10-K §27: fail-closed verification of a `boundary_revision` commitment scope.
 * Only boundary memory can answer whether a ref is an exact ACCEPTED revision, so
 * the host injects this read-only guard. Absent ⇒ boundary scopes are refused.
 */
export interface CommitmentScopeGuard {
  /** Throws to reject the scope (never silently downgrades to a weaker check). */
  admitScope(scope: CommitmentScope): Promise<void>;
}

/**
 * E3-C §18: fail-closed verification of a `contact_need` commitment scope.
 *
 * A caller-supplied `contactNeedId` must not be able to manufacture a valid commitment scope. Only the
 * Federation history knows whether a need was durably declared, so the host injects this read-only
 * guard. Absent ⇒ `contact_need` scopes are refused rather than accepted unverified.
 */
export interface ContactNeedScopeGuard {
  /** Throws to reject the scope (never silently downgrades to a weaker check). */
  admitScope(scope: CommitmentScope): Promise<void>;
}

/**
 * E3-C §25: the independent fulfillment authority seam. It decides whether a SUBMISSION discharges the
 * promise the commitment named — never whether the delivered content is true.
 *
 * There is deliberately no default that admits: a deployment that composes no fulfillment authority
 * leaves the commitment ACTIVE and records the submission as history. A holder can never self-certify,
 * and neither ManagementMode nor a message acknowledgement is authority here.
 */
export interface CommitmentFulfillmentAdmissionPort {
  readonly policyRef: { readonly policyId: string; readonly version: string };
  decide(input: {
    readonly commitmentId: CommitmentId;
    readonly terms: CommitmentTerms;
    readonly scope: CommitmentScope;
    readonly submission: CommitmentFulfillmentSubmission;
    readonly validatedOutputs: readonly CommitmentFulfillmentOutput[];
  }): Promise<{
    readonly decision: FulfillmentAdmissionDecision;
    readonly submissionDigest: string;
    readonly policyRef: { readonly policyId: string; readonly version: string };
    readonly provenanceDigest: string;
    readonly detail?: string | undefined;
  }>;
}

/**
 * E3-C §24: the narrow READ-ONLY boundary-memory port the commitment domain validates outputs through.
 * A candidate revision is not enough — every V1 output must be an EXACT currently ACCEPTED revision.
 * BoundaryMemory's mutation APIs are deliberately NOT reachable from commitment semantics.
 */
export interface CommitmentFulfillmentOutputPort {
  /** Throws to refuse the output (an unknown/candidate/superseded revision must fail closed). */
  admitAcceptedRevision(revision: AcceptedBoundaryRevisionRef): Promise<void>;
}

export interface CommitmentDeps {
  readonly store: CoordinationStore;
  readonly localPeer: PeerRef;
  readonly allocateCommitmentId: () => CommitmentId;
  readonly allocateHandoffId: () => HandoffId;
  readonly scopeGuard?: CommitmentScopeGuard | undefined;
  /** E3-C §18: verifies a `contact_need` scope against the durable declaration history. */
  readonly contactNeedScopeGuard?: ContactNeedScopeGuard | undefined;
  /** E3-C §25: the independent fulfillment authority. Absent ⇒ no fulfillment can be admitted. */
  readonly fulfillmentAdmission?: CommitmentFulfillmentAdmissionPort | undefined;
  /** E3-C §24: the read-only boundary validation port for V1 outputs. */
  readonly fulfillmentOutputs?: CommitmentFulfillmentOutputPort | undefined;
}

interface HistoryEntry {
  readonly state: CommitmentState;
  readonly offer: CommitmentOffer;
  readonly holder: PeerRef;
  readonly active: boolean;
}

/**
 * G10-P read-only commitment enumeration (closes CF-O-01). Derived from the ONE
 * append-only event history — never a new store and never a mutation path.
 */
export interface CommitmentSummary {
  readonly commitmentId: CommitmentId;
  readonly state: CommitmentState;
  readonly holder: PeerRef;
  readonly proposer: PeerRef;
  readonly scope: CommitmentScope;
  readonly termsDigest: string;
}

export interface CommitmentService {
  offerCommitment(input: {
    readonly proposedHolder: PeerRef;
    readonly scope: CommitmentScope;
    readonly statement: string;
  }): Promise<CommitmentOffer>;
  acceptCommitment(input: {
    readonly commitmentId: CommitmentId;
    /** Inbound identity for remote acceptance; null means unauthenticated. */
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean;
  }): Promise<CommitmentAcceptedPayload>;
  rejectCommitment(input: {
    readonly commitmentId: CommitmentId;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean;
  }): Promise<{ commitmentId: CommitmentId; rejectedBy: PeerRef }>;
  /**
   * Release an ACTIVE commitment. `authenticatedPeer` (with `local !== true`) is the
   * inbound remote holder identity; absent means the configured local peer (host path).
   */
  releaseCommitment(input: {
    readonly commitmentId: CommitmentId;
    readonly authenticatedPeer?: PeerRef | null;
    readonly local?: boolean;
  }): Promise<void>;
  offerHandoff(input: {
    readonly commitmentId: CommitmentId;
    readonly to: PeerRef;
  }): Promise<HandoffOffer>;
  acceptHandoff(input: {
    readonly handoffId: HandoffId;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean;
  }): Promise<HandoffAcceptedPayload>;
  rejectHandoff(input: {
    readonly handoffId: HandoffId;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean;
  }): Promise<HandoffRejectedPayload>;
  /**
   * E3-C §23/§24: submit a typed fulfillment. The submitter MUST be the CURRENT authenticated holder,
   * and every V1 output must be validated against boundary memory before the submission is recorded.
   * Submission is NOT acceptance: recording it decides nothing.
   */
  submitFulfillment(input: {
    readonly commitmentId: CommitmentId;
    readonly outputs: readonly CommitmentFulfillmentOutput[];
    readonly note: string;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean;
  }): Promise<CommitmentFulfillmentSubmission>;
  /**
   * E3-C §25/§26: the independent authority decides the EXACT submission digest. On ADMIT the commitment
   * transitions `ACTIVE → FULFILLED` atomically with the decision and the terminal record. On
   * REJECT/UNRESOLVED the submission and decision remain history and the commitment stays ACTIVE.
   */
  decideFulfillment(input: {
    readonly commitmentId: CommitmentId;
    readonly submissionDigest: string;
  }): Promise<{
    readonly decision: FulfillmentAdmissionDecision;
    readonly fulfilled: boolean;
    readonly detail: string;
  }>;
  /** E3-C §28: derived read-only fulfillment state — no Work state, no truth judgement. */
  fulfillment(commitmentId: CommitmentId): Promise<CommitmentFulfillmentView | undefined>;
  /** E3-C §28: derived read-only submissions for a commitment, in history order. */
  fulfillmentSubmissions(commitmentId: CommitmentId): Promise<readonly CommitmentFulfillmentSubmission[]>;
  /** Derived state for one commitment (§93/§160) — always from history. */
  commitmentState(commitmentId: CommitmentId): Promise<HistoryEntry | undefined>;
  /** Active commitments held by a peer (derived). */
  activeCommitmentsOf(peer: PeerRef): Promise<readonly CommitmentOffer[]>;
  /** Read-only enumeration of every commitment subject with its derived state (G10-P). */
  listCommitments(): Promise<readonly CommitmentSummary[]>;
}

/** E3-C §28: the derived view of a commitment's fulfillment. */
export interface CommitmentFulfillmentView {
  readonly commitmentId: CommitmentId;
  readonly state: CommitmentState;
  readonly holder: PeerRef;
  readonly scope: CommitmentScope;
  /** §19: present only when the offer carried a recoverable terms body. */
  readonly terms: CommitmentTerms | null;
  readonly acceptedSubmission: CommitmentFulfillmentSubmission | null;
  readonly outputs: readonly CommitmentFulfillmentOutput[];
  readonly admission: {
    readonly decision: "ADMIT";
    readonly policyRef: { readonly policyId: string; readonly version: string };
    readonly provenanceDigest: string;
  } | null;
}

export function makeCommitmentService(deps: CommitmentDeps): CommitmentService {
  function eventRequest(type: string, payload: unknown): CoordinationAppendRequest {
    const eventId = canonicalDigest({
      domain: "palimpsest.coordination-event.v1",
      type,
      scope: FEDERATION_SCOPE,
      content: payload,
    });
    return { eventId, projectId: FEDERATION_SCOPE, type, payload } as never;
  }

  async function append(type: string, payload: unknown): Promise<void> {
    await deps.store.append(eventRequest(type, payload));
  }

  /** Canonical history up to the CURRENT head — the precondition basis. */
  async function snapshotAtHead(): Promise<{ readonly head: number; readonly events: readonly CoordinationEvent[] }> {
    const head = await deps.store.head();
    const events = await deps.store.replay();
    return { head, events: events.filter((event) => event.seq <= head) };
  }

  function deriveState(events: readonly CoordinationEvent[], commitmentId: CommitmentId): HistoryEntry | undefined {
    let entry: HistoryEntry | undefined;
    for (const event of events) {
      switch (event.type) {
        case "COMMITMENT_OFFERED": {
          const payload = event.payload as CommitmentOfferedPayload;
          if (payload.offer.commitmentId !== commitmentId) continue;
          entry = { state: "OFFERED", offer: payload.offer, holder: payload.offer.proposedHolder, active: false };
          break;
        }
        case "COMMITMENT_ACCEPTED": {
          const payload = event.payload as CommitmentAcceptedPayload;
          if (entry === undefined || payload.commitmentId !== commitmentId) continue;
          entry = { ...entry, state: "ACTIVE", holder: payload.acceptedBy, active: true };
          break;
        }
        case "COMMITMENT_REJECTED": {
          const payload = event.payload as { commitmentId: CommitmentId };
          if (entry === undefined || payload.commitmentId !== commitmentId) continue;
          entry = { ...entry, state: "REJECTED", active: false };
          break;
        }
        case "COMMITMENT_RELEASED": {
          const payload = event.payload as CommitmentReleasedPayload;
          if (entry === undefined || payload.commitmentId !== commitmentId) continue;
          entry = { ...entry, state: "RELEASED", active: false };
          break;
        }
        case "COMMITMENT_SUPERSEDED": {
          const payload = event.payload as CommitmentSupersededPayload;
          if (entry === undefined || payload.commitmentId !== commitmentId) continue;
          entry = { ...entry, state: "SUPERSEDED", active: false };
          break;
        }
        case "COMMITMENT_FULFILLED": {
          const payload = event.payload as CommitmentFulfilledPayload;
          if (entry === undefined || payload.commitmentId !== commitmentId) continue;
          // §27: FULFILLED is terminal — the responsibility has been discharged.
          entry = { ...entry, state: "FULFILLED", active: false };
          break;
        }
        default:
          break;
      }
    }
    return entry;
  }

  async function commitmentState(commitmentId: CommitmentId): Promise<HistoryEntry | undefined> {
    return deriveState(await deps.store.replay(), commitmentId);
  }

  async function offerCommitment(input: {
    readonly proposedHolder: PeerRef;
    readonly scope: CommitmentScope;
    readonly statement: string;
  }): Promise<CommitmentOffer> {
    if (input.scope.kind === "boundary_revision") {
      if (deps.scopeGuard === undefined) {
        throw new CommitmentError("unverified_scope", "a boundary_revision commitment scope requires a boundary-memory scope guard (fail closed)");
      }
      await deps.scopeGuard.admitScope(input.scope);
    }
    if (input.scope.kind === "contact_need") {
      // §18: the generic path fails closed when the referenced need was never durably declared, so a
      // caller-supplied contactNeedId cannot manufacture a valid commitment scope.
      if (deps.contactNeedScopeGuard === undefined) {
        throw new CommitmentError("unverified_scope", "a contact_need commitment scope requires a declared-need scope guard (fail closed)");
      }
      await deps.contactNeedScopeGuard.admitScope(input.scope);
    }
    const terms = commitmentTermsOf(input.statement);
    const offer: CommitmentOffer = Object.freeze({
      commitmentId: deps.allocateCommitmentId(),
      proposer: deps.localPeer,
      proposedHolder: input.proposedHolder,
      scope: input.scope,
      termsDigest: terms.termsDigest,
      // §19: new offers carry the RECOVERABLE terms body so the promise can be evaluated later.
      terms,
    });
    await append("COMMITMENT_OFFERED", { offer });
    return offer;
  }

  function assertCanAccept(
    entry: HistoryEntry | undefined,
    commitmentId: CommitmentId,
    authenticatedPeer: PeerRef | null,
    local: boolean | undefined,
  ): HistoryEntry {
    if (entry === undefined) {
      throw new CommitmentError("commitment_invalid", `commitment "${commitmentId}" was never offered`);
    }
    if (entry.state !== "OFFERED") {
      throw new CommitmentError(
        "commitment_conflict",
        `commitment "${commitmentId}" is ${entry.state} — only an OFFERED commitment can be accepted/rejected`,
      );
    }
    const acceptor = local === true ? deps.localPeer : authenticatedPeer;
    if (acceptor === null) {
      // §71/§91: unauthenticated identities can NEVER accept a commitment.
      throw new CommitmentError(
        "unauthenticated_acceptance",
        "commitment acceptance requires an authenticated sender (unauthenticated input cannot accept)",
      );
    }
    if (acceptor.peerId !== entry.offer.proposedHolder.peerId) {
      throw new CommitmentError(
        "not_proposed_holder",
        `only the proposed holder "${entry.offer.proposedHolder.peerId}" may accept/reject this commitment`,
      );
    }
    return entry;
  }

  async function acceptCommitment(input: {
    readonly commitmentId: CommitmentId;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean;
  }): Promise<CommitmentAcceptedPayload> {
    const { head, events } = await snapshotAtHead();
    const entry = assertCanAccept(
      deriveState(events, input.commitmentId),
      input.commitmentId,
      input.authenticatedPeer,
      input.local,
    );
    const payload: CommitmentAcceptedPayload = {
      commitmentId: input.commitmentId,
      acceptedBy: entry.offer.proposedHolder,
      authenticated: input.local !== true,
    };
    await deps.store.appendAtomic({
      expectedHeadSeq: head,
      events: [eventRequest("COMMITMENT_ACCEPTED", payload)],
    });
    return payload;
  }

  async function rejectCommitment(input: {
    readonly commitmentId: CommitmentId;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean;
  }): Promise<{ commitmentId: CommitmentId; rejectedBy: PeerRef }> {
    const { head, events } = await snapshotAtHead();
    const entry = assertCanAccept(
      deriveState(events, input.commitmentId),
      input.commitmentId,
      input.authenticatedPeer,
      input.local,
    );
    const payload = { commitmentId: input.commitmentId, rejectedBy: entry.offer.proposedHolder };
    await deps.store.appendAtomic({
      expectedHeadSeq: head,
      events: [eventRequest("COMMITMENT_REJECTED", payload)],
    });
    return payload;
  }

  async function releaseCommitment(input: {
    readonly commitmentId: CommitmentId;
    readonly authenticatedPeer?: PeerRef | null;
    readonly local?: boolean;
  }): Promise<void> {
    const { head, events } = await snapshotAtHead();
    const entry = deriveState(events, input.commitmentId);
    if (entry?.state === "FULFILLED") {
      // §27: FULFILLED is TERMINAL — the responsibility was discharged by an admitted fulfillment, so it
      // can never be released (nor handed off, which has the same ACTIVE precondition).
      throw new CommitmentError("commitment_not_active", "a FULFILLED commitment is terminal and cannot be released");
    }
    if (entry === undefined || entry.state !== "ACTIVE") {
      throw new CommitmentError(
        "commitment_not_active",
        `only an ACTIVE commitment can be released (current: ${entry?.state ?? "unknown"})`,
      );
    }
    // Host-internal path (no inbound identity) releases as the configured local peer;
    // a remote release must carry an authenticated holder identity and fails closed
    // when unauthenticated (§71 — the same rule as accept/reject).
    const releaser =
      input.local === true || input.authenticatedPeer === undefined ? deps.localPeer : input.authenticatedPeer;
    if (releaser === null) {
      throw new CommitmentError(
        "unauthenticated_acceptance",
        "commitment release requires an authenticated holder (unauthenticated input cannot release)",
      );
    }
    if (entry.holder.peerId !== releaser.peerId) {
      throw new CommitmentError(
        "not_current_holder",
        `only the current holder "${entry.holder.peerId}" may release this commitment`,
      );
    }
    await deps.store.appendAtomic({
      expectedHeadSeq: head,
      events: [eventRequest("COMMITMENT_RELEASED", { commitmentId: input.commitmentId, releasedBy: entry.holder })],
    });
  }

  async function offerHandoff(input: {
    readonly commitmentId: CommitmentId;
    readonly to: PeerRef;
  }): Promise<HandoffOffer> {
    const { head, events } = await snapshotAtHead();
    const entry = deriveState(events, input.commitmentId);
    if (entry === undefined || entry.state !== "ACTIVE") {
      throw new CommitmentError("commitment_not_active", "handoff requires an ACTIVE commitment (§98)");
    }
    if (entry.holder.peerId !== deps.localPeer.peerId) {
      throw new CommitmentError(
        "not_current_holder",
        `only the current holder "${entry.holder.peerId}" may offer a handoff`,
      );
    }
    const offer: HandoffOffer = Object.freeze({
      handoffId: deps.allocateHandoffId(),
      commitmentId: input.commitmentId,
      from: entry.holder,
      to: input.to,
      scope: entry.offer.scope,
    });
    await deps.store.appendAtomic({ expectedHeadSeq: head, events: [eventRequest("HANDOFF_OFFERED", { offer })] });
    return offer;
  }

  function handoffOfferFrom(events: readonly CoordinationEvent[], handoffId: HandoffId): HandoffOffer | undefined {
    for (const event of events) {
      if (event.type === "HANDOFF_OFFERED") {
        const payload = event.payload as HandoffOfferedPayload;
        if (payload.offer.handoffId === handoffId) return payload.offer;
      }
    }
    return undefined;
  }

  async function acceptHandoff(input: {
    readonly handoffId: HandoffId;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean;
  }): Promise<HandoffAcceptedPayload> {
    // §13/§14: read the canonical head first, derive ALL preconditions from
    // history up to that head, then commit the whole transition atomically.
    const { head, events } = await snapshotAtHead();
    const offer = handoffOfferFrom(events, input.handoffId);
    if (offer === undefined) {
      throw new CommitmentError("handoff_invalid", `handoff "${input.handoffId}" was never offered`);
    }
    const entry = deriveState(events, offer.commitmentId);
    if (entry === undefined || entry.state !== "ACTIVE") {
      throw new CommitmentError("commitment_not_active", "the commitment is no longer ACTIVE");
    }
    const acceptor = input.local === true ? deps.localPeer : input.authenticatedPeer;
    if (acceptor === null) {
      throw new CommitmentError(
        "unauthenticated_acceptance",
        "handoff acceptance requires an authenticated target (unauthenticated input cannot accept)",
      );
    }
    if (acceptor.peerId !== offer.to.peerId) {
      throw new CommitmentError("not_proposed_holder", `only the handoff target "${offer.to.peerId}" may accept`);
    }
    const successorCommitmentId = successorCommitmentIdOf(offer.handoffId, offer.commitmentId);
    const payload: HandoffAcceptedPayload = {
      handoffId: offer.handoffId,
      commitmentId: offer.commitmentId,
      successorCommitmentId,
      to: offer.to,
    };
    const successorOffer: CommitmentOffer = Object.freeze({
      commitmentId: successorCommitmentId,
      proposer: offer.from,
      proposedHolder: offer.to,
      scope: offer.scope,
      termsDigest: entry.offer.termsDigest,
      // §19: a successor inherits the SAME recoverable body when the predecessor had one, so a handoff
      // does not silently strip the terms a later fulfillment would need to evaluate.
      ...(entry.offer.terms === undefined ? {} : { terms: entry.offer.terms }),
    });
    // §19/§20: ONE atomic transition — old SUPERSEDED, handoff accepted,
    // successor OFFERED + ACCEPTED. Commits together or not at all.
    await deps.store.appendAtomic({
      expectedHeadSeq: head,
      events: [
        eventRequest("COMMITMENT_SUPERSEDED", { commitmentId: offer.commitmentId, handoffId: offer.handoffId }),
        eventRequest("HANDOFF_ACCEPTED", payload),
        eventRequest("COMMITMENT_OFFERED", { offer: successorOffer }),
        eventRequest("COMMITMENT_ACCEPTED", {
          commitmentId: successorCommitmentId,
          acceptedBy: offer.to,
          authenticated: input.local !== true,
        }),
      ],
    });
    return payload;
  }

  async function rejectHandoff(input: {
    readonly handoffId: HandoffId;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean;
  }): Promise<HandoffRejectedPayload> {
    const { head, events } = await snapshotAtHead();
    const offer = handoffOfferFrom(events, input.handoffId);
    if (offer === undefined) {
      throw new CommitmentError("handoff_invalid", `handoff "${input.handoffId}" was never offered`);
    }
    const rejector = input.local === true ? deps.localPeer : input.authenticatedPeer;
    if (rejector === null || rejector.peerId !== offer.to.peerId) {
      throw new CommitmentError("not_proposed_holder", "only the handoff target may reject");
    }
    const payload: HandoffRejectedPayload = { handoffId: offer.handoffId, rejectedBy: rejector };
    await deps.store.appendAtomic({
      expectedHeadSeq: head,
      events: [eventRequest("HANDOFF_REJECTED", payload)],
    });
    return payload;
  }

  /* ------------------------------------------------------------------ *
   * E3-C §23–§28: typed fulfillment
   * ------------------------------------------------------------------ */

  /**
   * §23: record a fulfillment submission. The submitter must be the CURRENT authenticated holder, and
   * §24 validates every output against boundary memory BEFORE anything is appended — an unknown,
   * candidate or superseded revision is refused, so a submission can never carry an unaccepted artifact.
   *
   * Recording decides NOTHING: `submission ≠ acceptance`, and the commitment stays ACTIVE until an
   * authority admits this exact digest.
   */
  async function submitFulfillment(input: {
    readonly commitmentId: CommitmentId;
    readonly outputs: readonly CommitmentFulfillmentOutput[];
    readonly note: string;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean;
  }): Promise<CommitmentFulfillmentSubmission> {
    const { head, events } = await snapshotAtHead();
    const entry = deriveState(events, input.commitmentId);
    if (entry === undefined) {
      throw new CommitmentError("commitment_invalid", `commitment "${input.commitmentId}" was never offered`);
    }
    if (entry.state !== "ACTIVE") {
      throw new CommitmentError(
        "commitment_not_active",
        `only an ACTIVE commitment can be fulfilled (current: ${entry.state})`,
      );
    }
    // §23/§25: the submitter is the CURRENT holder and must be authenticated — a holder can never be
    // invented by an unauthenticated caller, and a non-holder is refused (the producer is not the judge
    // either, but being the holder is the first requirement).
    const submitter = input.local === true ? deps.localPeer : input.authenticatedPeer;
    if (submitter === null) {
      throw new CommitmentError(
        "unauthenticated_acceptance",
        "fulfillment submission requires an authenticated holder (unauthenticated input cannot submit)",
      );
    }
    if (submitter.peerId !== entry.holder.peerId) {
      throw new CommitmentError(
        "not_current_holder",
        `only the current holder "${entry.holder.peerId}" may submit a fulfillment`,
      );
    }
    if (input.outputs.length === 0) {
      throw new CommitmentError("fulfillment_invalid", "a fulfillment submission needs at least one typed output");
    }
    // §24: validate EVERY output against the read-only boundary port. Fails closed when no port is wired.
    if (deps.fulfillmentOutputs === undefined) {
      throw new CommitmentError(
        "fulfillment_invalid",
        "a boundary_revision fulfillment output requires a boundary-memory validation port (fail closed)",
      );
    }
    for (const output of input.outputs) {
      await deps.fulfillmentOutputs.admitAcceptedRevision(output.revision);
    }
    const submission = materializeFulfillmentSubmission({
      commitmentId: input.commitmentId,
      submittedBy: entry.holder,
      outputs: input.outputs,
      note: input.note,
    });
    // §26: ONE conditional append — the head read above is the basis, so a concurrent state change
    // cannot be silently overwritten.
    await deps.store.appendAtomic({
      expectedHeadSeq: head,
      events: [eventRequest("FULFILLMENT_SUBMITTED", { submission })],
    });
    return submission;
  }

  /**
   * §25/§26: the authority decides the EXACT submission digest, then the terminal transition commits
   * atomically with the decision and the fulfillment record.
   *
   * On REJECT/UNRESOLVED the decision is still recorded (history is honest about what was refused) and
   * the commitment REMAINS ACTIVE. On ADMIT the commitment becomes FULFILLED.
   */
  async function decideFulfillment(input: {
    readonly commitmentId: CommitmentId;
    readonly submissionDigest: string;
  }): Promise<{ readonly decision: FulfillmentAdmissionDecision; readonly fulfilled: boolean; readonly detail: string }> {
    const { head, events } = await snapshotAtHead();
    const entry = deriveState(events, input.commitmentId);
    if (entry === undefined) {
      throw new CommitmentError("commitment_invalid", `commitment "${input.commitmentId}" was never offered`);
    }
    const submission = submissionWithDigest(events, input.commitmentId, input.submissionDigest);
    if (submission === undefined) {
      throw new CommitmentError(
        "fulfillment_invalid",
        `no submission with digest "${input.submissionDigest}" exists for commitment "${input.commitmentId}"`,
      );
    }
    if (entry.state !== "ACTIVE") {
      throw new CommitmentError(
        "fulfillment_conflict",
        `fulfillment can only be decided while the commitment is ACTIVE (current: ${entry.state})`,
      );
    }
    // §19: a commitment without a recoverable terms body cannot be evaluated later, so E3-C V1 refuses
    // to guess the promise rather than admitting a fulfillment against an unknown obligation.
    if (entry.offer.terms === undefined) {
      throw new CommitmentError(
        "not_fulfillable",
        `commitment "${input.commitmentId}" has no recoverable terms (only a termsDigest) — it is not fulfillable through E3-C V1`,
      );
    }
    const authority = deps.fulfillmentAdmission;
    if (authority === undefined) {
      // §25: absent authority ⇒ UNRESOLVED, recorded honestly, with NO state transition.
      const payload: FulfillmentDecidedPayload = {
        commitmentId: input.commitmentId,
        submissionDigest: input.submissionDigest,
        decision: "UNRESOLVED",
        policyRef: Object.freeze({ policyId: "unconfigured", version: "v0" }),
        provenanceDigest: canonicalDigest({ domain: "palimpsest.fulfillment.unresolved.v1", submissionDigest: input.submissionDigest }),
        detail: "no fulfillment authority is configured for this deployment",
      };
      await deps.store.appendAtomic({
        expectedHeadSeq: head,
        events: [eventRequest("FULFILLMENT_DECIDED", payload)],
      });
      return Object.freeze({ decision: "UNRESOLVED" as const, fulfilled: false, detail: payload.detail! });
    }
    const outcome = await authority.decide({
      commitmentId: input.commitmentId,
      terms: entry.offer.terms,
      scope: entry.offer.scope,
      submission,
      validatedOutputs: submission.outputs,
    });
    if (outcome.submissionDigest !== input.submissionDigest) {
      // §25: the decision must name the EXACT submission digest it decided — never "something like this".
      throw new CommitmentError(
        "fulfillment_invalid",
        `the fulfillment authority decided digest "${outcome.submissionDigest}", not the submitted "${input.submissionDigest}"`,
      );
    }
    const decided: FulfillmentDecidedPayload = {
      commitmentId: input.commitmentId,
      submissionDigest: outcome.submissionDigest,
      decision: outcome.decision,
      policyRef: outcome.policyRef,
      provenanceDigest: outcome.provenanceDigest,
      ...(outcome.detail === undefined ? {} : { detail: outcome.detail }),
    };
    if (outcome.decision !== "ADMIT") {
      // §26: REJECT/UNRESOLVED keeps the commitment ACTIVE; the submission and decision stay history.
      await deps.store.appendAtomic({
        expectedHeadSeq: head,
        events: [eventRequest("FULFILLMENT_DECIDED", decided)],
      });
      return Object.freeze({
        decision: outcome.decision,
        fulfilled: false,
        detail: outcome.detail ?? `fulfillment ${outcome.decision.toLowerCase()}ed by ${outcome.policyRef.policyId}`,
      });
    }
    const fulfilled: CommitmentFulfilledPayload = {
      commitmentId: input.commitmentId,
      submissionDigest: outcome.submissionDigest,
      submissionId: submission.submissionId,
      holder: entry.holder,
      outputs: submission.outputs,
      admission: Object.freeze({
        decision: "ADMIT" as const,
        policyRef: outcome.policyRef,
        provenanceDigest: outcome.provenanceDigest,
      }),
    };
    // §26: ONE canonical-head conditional atomic transition — decision + terminal record commit together
    // or not at all, so a crash can never leave "decided ADMIT but not FULFILLED".
    await deps.store.appendAtomic({
      expectedHeadSeq: head,
      events: [
        eventRequest("FULFILLMENT_DECIDED", decided),
        eventRequest("COMMITMENT_FULFILLED", fulfilled),
      ],
    });
    return Object.freeze({ decision: "ADMIT" as const, fulfilled: true, detail: "fulfillment admitted" });
  }

  /** §28: the derived submissions for a commitment, in history order. */
  async function fulfillmentSubmissions(commitmentId: CommitmentId): Promise<readonly CommitmentFulfillmentSubmission[]> {
    const events = await deps.store.replay();
    const submissions: CommitmentFulfillmentSubmission[] = [];
    for (const event of events) {
      if (event.type !== "FULFILLMENT_SUBMITTED") continue;
      const payload = event.payload as FulfillmentSubmittedPayload;
      if (payload.submission.commitmentId === commitmentId) submissions.push(payload.submission);
    }
    return Object.freeze(submissions);
  }

  /**
   * §28: the derived fulfillment view. It exposes the commitment identity, holder, scope, recoverable
   * terms, the accepted submission, the typed outputs and the admission provenance — and NOTHING about
   * Work state, because a fulfillment is not a Work fact.
   */
  async function fulfillment(commitmentId: CommitmentId): Promise<CommitmentFulfillmentView | undefined> {
    const events = await deps.store.replay();
    const entry = deriveState(events, commitmentId);
    if (entry === undefined) return undefined;
    let accepted: CommitmentFulfilledPayload | undefined;
    for (const event of events) {
      if (event.type !== "COMMITMENT_FULFILLED") continue;
      const payload = event.payload as CommitmentFulfilledPayload;
      if (payload.commitmentId === commitmentId) accepted = payload;
    }
    const submission =
      accepted === undefined ? null : submissionWithDigest(events, commitmentId, accepted.submissionDigest) ?? null;
    return Object.freeze({
      commitmentId,
      state: entry.state,
      holder: entry.holder,
      scope: entry.offer.scope,
      terms: entry.offer.terms ?? null,
      acceptedSubmission: submission,
      outputs: accepted?.outputs ?? Object.freeze([] as readonly CommitmentFulfillmentOutput[]),
      admission: accepted?.admission ?? null,
    });
  }

  /** The ONE submission lookup by digest, shared by the decision path and the derived view. */
  function submissionWithDigest(
    events: readonly CoordinationEvent[],
    commitmentId: CommitmentId,
    submissionDigest: string,
  ): CommitmentFulfillmentSubmission | undefined {
    for (const event of events) {
      if (event.type !== "FULFILLMENT_SUBMITTED") continue;
      const payload = event.payload as FulfillmentSubmittedPayload;
      if (payload.submission.commitmentId === commitmentId && payload.submission.digest === submissionDigest) {
        return payload.submission;
      }
    }
    return undefined;
  }

  async function activeCommitmentsOf(peer: PeerRef): Promise<readonly CommitmentOffer[]> {
    const events = await deps.store.replay();
    const ids = new Set<CommitmentId>();
    for (const event of events) {
      if (event.type === "COMMITMENT_OFFERED") {
        ids.add((event.payload as CommitmentOfferedPayload).offer.commitmentId);
      }
    }
    const active: CommitmentOffer[] = [];
    for (const id of ids) {
      const entry = deriveState(events, id);
      if (entry?.active === true && entry.holder.peerId === peer.peerId) active.push(entry.offer);
    }
    return Object.freeze(active);
  }

  async function listCommitments(): Promise<readonly CommitmentSummary[]> {
    const events = await deps.store.replay();
    const ids = new Set<CommitmentId>();
    for (const event of events) {
      if (event.type === "COMMITMENT_OFFERED") {
        ids.add((event.payload as CommitmentOfferedPayload).offer.commitmentId);
      }
    }
    const summaries: CommitmentSummary[] = [];
    for (const commitmentId of [...ids].sort()) {
      const entry = deriveState(events, commitmentId);
      if (entry === undefined) continue;
      summaries.push(
        Object.freeze({
          commitmentId,
          state: entry.state,
          holder: entry.holder,
          proposer: entry.offer.proposer,
          scope: entry.offer.scope,
          termsDigest: entry.offer.termsDigest,
        }),
      );
    }
    return Object.freeze(summaries);
  }

  return {
    offerCommitment,
    acceptCommitment,
    rejectCommitment,
    releaseCommitment,
    offerHandoff,
    acceptHandoff,
    rejectHandoff,
    submitFulfillment,
    decideFulfillment,
    fulfillment,
    fulfillmentSubmissions,
    commitmentState,
    activeCommitmentsOf,
    listCommitments,
  };
}
