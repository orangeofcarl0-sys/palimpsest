/**
 * G10-E4 commitment/handoff service — append-only events, derived state,
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
 */

import type { CoordinationStore } from "../coordination/store.js";
import { canonicalDigest } from "../schema/canonical.js";
import type { PeerRef } from "./peer.js";
import type {
  CommitmentAcceptedPayload,
  CommitmentId,
  CommitmentOffer,
  CommitmentOfferedPayload,
  CommitmentScope,
  CommitmentState,
  HandoffAcceptedPayload,
  HandoffId,
  HandoffOffer,
  HandoffOfferedPayload,
  HandoffRejectedPayload,
} from "./commitment.js";
import {
  COMMITMENT_EVENT_PARSERS,
  CommitmentError,
  commitmentTermsOf,
  successorCommitmentIdOf,
} from "./commitment.js";

export const FEDERATION_SCOPE = "federation";

export interface CommitmentDeps {
  readonly store: CoordinationStore;
  readonly localPeer: PeerRef;
  readonly allocateCommitmentId: () => CommitmentId;
  readonly allocateHandoffId: () => HandoffId;
}

interface HistoryEntry {
  readonly state: CommitmentState;
  readonly offer: CommitmentOffer;
  readonly holder: PeerRef;
  readonly active: boolean;
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
  releaseCommitment(input: { readonly commitmentId: CommitmentId }): Promise<void>;
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
  /** Derived state for one commitment (§93/§160) — always from history. */
  commitmentState(commitmentId: CommitmentId): Promise<HistoryEntry | undefined>;
  /** Active commitments held by a peer (derived). */
  activeCommitmentsOf(peer: PeerRef): Promise<readonly CommitmentOffer[]>;
}

export function makeCommitmentService(deps: CommitmentDeps): CommitmentService {
  async function append(type: string, payload: unknown): Promise<void> {
    const eventId = canonicalDigest({
      domain: "palimpsest.coordination-event.v1",
      type,
      scope: FEDERATION_SCOPE,
      content: payload,
    });
    await deps.store.append({ eventId, projectId: FEDERATION_SCOPE, type, payload } as never);
  }

  async function history(commitmentId: CommitmentId) {
    const events = await deps.store.replay();
    return events.filter((event) => {
      switch (event.type) {
        case "COMMITMENT_OFFERED":
          return (event.payload as CommitmentOfferedPayload).offer.commitmentId === commitmentId;
        case "COMMITMENT_ACCEPTED":
          return (event.payload as CommitmentAcceptedPayload).commitmentId === commitmentId;
        case "COMMITMENT_REJECTED":
          return (event.payload as { commitmentId: CommitmentId }).commitmentId === commitmentId;
        case "COMMITMENT_RELEASED":
          return (event.payload as { commitmentId: CommitmentId }).commitmentId === commitmentId;
        case "COMMITMENT_SUPERSEDED":
          return (event.payload as { commitmentId: CommitmentId }).commitmentId === commitmentId;
        default:
          return false;
      }
    });
  }

  async function commitmentState(commitmentId: CommitmentId): Promise<HistoryEntry | undefined> {
    const events = await history(commitmentId);
    let entry: HistoryEntry | undefined;
    for (const event of events) {
      if (event.type === "COMMITMENT_OFFERED") {
        const payload = event.payload as CommitmentOfferedPayload;
        if (payload.offer.commitmentId !== commitmentId) continue;
        entry = { state: "OFFERED", offer: payload.offer, holder: payload.offer.proposedHolder, active: false };
      } else if (event.type === "COMMITMENT_ACCEPTED" && entry !== undefined) {
        const payload = event.payload as CommitmentAcceptedPayload;
        if (payload.commitmentId !== commitmentId) continue;
        entry = { ...entry, state: "ACTIVE", holder: payload.acceptedBy, active: true };
      } else if (event.type === "COMMITMENT_REJECTED" && entry !== undefined) {
        const payload = event.payload as { commitmentId: CommitmentId };
        if (payload.commitmentId !== commitmentId) continue;
        entry = { ...entry, state: "REJECTED", active: false };
      } else if (event.type === "COMMITMENT_RELEASED" && entry !== undefined) {
        const payload = event.payload as { commitmentId: CommitmentId };
        if (payload.commitmentId !== commitmentId) continue;
        entry = { ...entry, state: "RELEASED", active: false };
      } else if (event.type === "COMMITMENT_SUPERSEDED" && entry !== undefined) {
        const payload = event.payload as { commitmentId: CommitmentId };
        if (payload.commitmentId !== commitmentId) continue;
        entry = { ...entry, state: "SUPERSEDED", active: false };
      }
    }
    return entry;
  }

  async function offerCommitment(input: {
    readonly proposedHolder: PeerRef;
    readonly scope: CommitmentScope;
    readonly statement: string;
  }): Promise<CommitmentOffer> {
    const terms = commitmentTermsOf(input.statement);
    const offer: CommitmentOffer = Object.freeze({
      commitmentId: deps.allocateCommitmentId(),
      proposer: deps.localPeer,
      proposedHolder: input.proposedHolder,
      scope: input.scope,
      termsDigest: terms.termsDigest,
    });
    await append("COMMITMENT_OFFERED", { offer });
    return offer;
  }

  async function assertCanAccept(
    commitmentId: CommitmentId,
    authenticatedPeer: PeerRef | null,
    local: boolean | undefined,
  ): Promise<HistoryEntry> {
    const entry = await commitmentState(commitmentId);
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
    const entry = await assertCanAccept(input.commitmentId, input.authenticatedPeer, input.local);
    const payload: CommitmentAcceptedPayload = {
      commitmentId: input.commitmentId,
      acceptedBy: entry.offer.proposedHolder,
      authenticated: input.local !== true,
    };
    await append("COMMITMENT_ACCEPTED", payload);
    return payload;
  }

  async function rejectCommitment(input: {
    readonly commitmentId: CommitmentId;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean;
  }): Promise<{ commitmentId: CommitmentId; rejectedBy: PeerRef }> {
    const entry = await assertCanAccept(input.commitmentId, input.authenticatedPeer, input.local);
    const payload = { commitmentId: input.commitmentId, rejectedBy: entry.offer.proposedHolder };
    await append("COMMITMENT_REJECTED", payload);
    return payload;
  }

  async function releaseCommitment(input: { readonly commitmentId: CommitmentId }): Promise<void> {
    const entry = await commitmentState(input.commitmentId);
    if (entry === undefined || entry.state !== "ACTIVE") {
      throw new CommitmentError(
        "commitment_not_active",
        `only an ACTIVE commitment can be released (current: ${entry?.state ?? "unknown"})`,
      );
    }
    if (entry.holder.peerId !== deps.localPeer.peerId) {
      throw new CommitmentError(
        "not_current_holder",
        `only the current holder "${entry.holder.peerId}" may release this commitment`,
      );
    }
    await append("COMMITMENT_RELEASED", { commitmentId: input.commitmentId, releasedBy: deps.localPeer });
  }

  async function offerHandoff(input: {
    readonly commitmentId: CommitmentId;
    readonly to: PeerRef;
  }): Promise<HandoffOffer> {
    const entry = await commitmentState(input.commitmentId);
    if (entry === undefined || entry.state !== "ACTIVE") {
      throw new CommitmentError(
        "commitment_not_active",
        "handoff requires an ACTIVE commitment (§98)",
      );
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
    await append("HANDOFF_OFFERED", { offer });
    return offer;
  }

  async function handoffOfferById(handoffId: HandoffId): Promise<HandoffOffer | undefined> {
    const events = await deps.store.replay();
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
    const offer = await handoffOfferById(input.handoffId);
    if (offer === undefined) {
      throw new CommitmentError("handoff_invalid", `handoff "${input.handoffId}" was never offered`);
    }
    const entry = await commitmentState(offer.commitmentId);
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
      throw new CommitmentError(
        "not_proposed_holder",
        `only the handoff target "${offer.to.peerId}" may accept`,
      );
    }
    const successorCommitmentId = successorCommitmentIdOf(offer.handoffId, offer.commitmentId);
    const payload: HandoffAcceptedPayload = {
      handoffId: offer.handoffId,
      commitmentId: offer.commitmentId,
      successorCommitmentId,
      to: offer.to,
    };
    // §101: explicit transition — old SUPERSEDED (history immutable), then the
    // successor responsibility OFFERED+ACCEPTED for the target. No hidden
    // in-place owner mutation.
    await append("COMMITMENT_SUPERSEDED", { commitmentId: offer.commitmentId, handoffId: offer.handoffId });
    await append("HANDOFF_ACCEPTED", payload);
    const successorOffer: CommitmentOffer = Object.freeze({
      commitmentId: successorCommitmentId,
      proposer: offer.from,
      proposedHolder: offer.to,
      scope: offer.scope,
      termsDigest: entry.offer.termsDigest,
    });
    await append("COMMITMENT_OFFERED", { offer: successorOffer });
    await append("COMMITMENT_ACCEPTED", {
      commitmentId: successorCommitmentId,
      acceptedBy: offer.to,
      authenticated: input.local !== true,
    });
    return payload;
  }

  async function rejectHandoff(input: {
    readonly handoffId: HandoffId;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean;
  }): Promise<HandoffRejectedPayload> {
    const offer = await handoffOfferById(input.handoffId);
    if (offer === undefined) {
      throw new CommitmentError("handoff_invalid", `handoff "${input.handoffId}" was never offered`);
    }
    const rejector = input.local === true ? deps.localPeer : input.authenticatedPeer;
    if (rejector === null || rejector.peerId !== offer.to.peerId) {
      throw new CommitmentError("not_proposed_holder", "only the handoff target may reject");
    }
    const payload = { handoffId: offer.handoffId, rejectedBy: rejector };
    await append("HANDOFF_REJECTED", payload);
    return payload;
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
      const entry = await commitmentState(id);
      if (entry?.active === true && entry.holder.peerId === peer.peerId) active.push(entry.offer);
    }
    return Object.freeze(active);
  }

  return {
    offerCommitment,
    acceptCommitment,
    rejectCommitment,
    releaseCommitment,
    offerHandoff,
    acceptHandoff,
    rejectHandoff,
    commitmentState,
    activeCommitmentsOf,
  };
}

export { COMMITMENT_EVENT_PARSERS };
