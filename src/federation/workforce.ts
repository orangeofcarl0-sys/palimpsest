/**
 * G10-E5 federated workforce views — DERIVED composites, never new identity
 * ontologies (§111–§118).
 *
 * `FederatedManpowerPointView` composes, for ONE `PeerRef`: the optional
 * continuity association, the observed advertisement, active commitments,
 * active participations, and the derived inbox. It creates NO
 * ManpowerPointId (PeerRef already anchors collaboration identity) and is
 * NOT defined as a PersistentPoint or RuntimeAgent (§112). The continuity
 * link appears only when an explicit `PeerContinuityAssociation` source
 * exists (§113) — never assumed.
 *
 * `CoalitionView` derives the peers with active commitments/participations
 * around one scope (§115). It is DERIVED — not an OrganizationGraph (§116),
 * and it infers NO manager/subordinate/authority chain from message
 * initiators, focal peers, proposers, or first participants (§117).
 *
 * `focusedPeerRef` is a view preference (§55/§118): `UserFocus ≠
 * AuthorityRoot` — changing focus changes no effect authority, commitment
 * authority, peer identity, or Work ownership.
 *
 * Persistence stays optional across the collaboration layer too (§114): a
 * PeerRef with no continuity association collaborates fully.
 */

import type { DurableContinuityRef } from "../binding/contract.js";
import type { CoordinationEvent, CoordinationStore } from "../coordination/store.js";
import type { PeerAdvertisement, PeerContinuityAssociation, PeerRef } from "./peer.js";
import type { InboxView } from "./messaging.js";
import type { CommitmentId, CommitmentOffer } from "./commitment.js";
import type { Participation } from "../coordination/participation.js";
import { FEDERATION_SCOPE } from "./messaging.js";

export interface ManpowerPointView {
  readonly peer: PeerRef;
  /** Present ONLY via an explicit association source (§113) — never assumed. */
  readonly continuity?: DurableContinuityRef;
  readonly advertisement?: PeerAdvertisement;
  readonly activeCommitments: readonly CommitmentOffer[];
  readonly activeParticipations: readonly Participation[];
  readonly inbox: InboxView;
}

export interface CoalitionView {
  /** The need/scope the coalition formed around. */
  readonly scope: string;
  readonly peers: readonly PeerRef[];
}

export interface WorkforceViewDeps {
  readonly store: CoordinationStore;
  readonly localPeer: PeerRef;
  /** The inbox projection for a peer (injected from the messaging service — one derivation). */
  readonly inboxOf: (peer: PeerRef) => Promise<InboxView>;
  /** Explicit continuity associations, if any exist (identity-free links). */
  readonly continuityAssociations?: readonly PeerContinuityAssociation[];
  /** Known advertisements (from the directory observation); absent = none advertised. */
  readonly advertisements?: readonly PeerAdvertisement[];
}

function eventsOf(store: CoordinationStore): Promise<readonly CoordinationEvent[]> {
  return store.replay();
}

/** Derived manpower-point view for one peer (§111/§112). */
export async function manpowerPointView(
  deps: WorkforceViewDeps,
  peer: PeerRef,
): Promise<ManpowerPointView> {
  const events = await eventsOf(deps.store);
  const activeCommitments: CommitmentOffer[] = [];
  const activeParticipations: Participation[] = [];

  const commitmentIds = new Set<CommitmentId>();
  for (const event of events) {
    if (event.type === "COMMITMENT_OFFERED") {
      commitmentIds.add((event.payload as { offer: CommitmentOffer }).offer.commitmentId);
    }
  }
  for (const commitmentId of commitmentIds) {
    const state = deriveCommitment(events, commitmentId);
    if (state?.active === true && state.holderPeerId === peer.peerId) activeCommitments.push(state.offer);
  }
  for (const event of events) {
    if (event.type === "PARTICIPATION_STARTED") {
      const payload = event.payload as { participation: Participation };
      if (payload.participation.activation.agentDefinitionId.length > 0) {
        // Participations are Activation-anchored; the view lists the peers
        // whose local instance holds them (single-instance local view).
        if (deps.localPeer.peerId === peer.peerId) activeParticipations.push(payload.participation);
      }
    }
  }

  const continuity = deps.continuityAssociations?.find(
    (association) => association.peer.peerId === peer.peerId,
  )?.point as DurableContinuityRef | undefined;
  const advertisement = deps.advertisements?.find(
    (entry) => entry.peer.peerId === peer.peerId,
  );

  return Object.freeze({
    peer,
    ...(continuity === undefined ? {} : { continuity }),
    ...(advertisement === undefined ? {} : { advertisement }),
    activeCommitments: Object.freeze(activeCommitments),
    activeParticipations: Object.freeze(activeParticipations),
    inbox: await deps.inboxOf(peer),
  });
}

function deriveCommitment(
  events: readonly CoordinationEvent[],
  commitmentId: CommitmentId,
): { active: boolean; offer: CommitmentOffer; holderPeerId: string } | undefined {
  let offer: CommitmentOffer | undefined;
  let holderPeerId: string | undefined;
  let active = false;
  for (const event of events) {
    if (event.type === "COMMITMENT_OFFERED") {
      const candidate = (event.payload as { offer: CommitmentOffer }).offer;
      if (candidate.commitmentId === commitmentId) {
        offer = candidate;
        holderPeerId = candidate.proposedHolder.peerId;
      }
    } else if (event.type === "COMMITMENT_ACCEPTED") {
      const payload = event.payload as { commitmentId: CommitmentId; acceptedBy: PeerRef };
      if (payload.commitmentId === commitmentId && offer !== undefined) {
        active = true;
        holderPeerId = payload.acceptedBy.peerId;
      }
    } else if (
      event.type === "COMMITMENT_REJECTED" ||
      event.type === "COMMITMENT_RELEASED" ||
      event.type === "COMMITMENT_SUPERSEDED"
    ) {
      const payload = event.payload as { commitmentId: CommitmentId };
      if (payload.commitmentId === commitmentId) active = false;
    }
  }
  if (offer === undefined || holderPeerId === undefined) return undefined;
  return { active, offer, holderPeerId };
}

/**
 * Derived coalition view for one scope (§115/§116/§117): peers holding
 * active commitments whose scope matches. No hierarchy is inferred.
 */
export async function coalitionView(
  deps: WorkforceViewDeps,
  scope: string,
): Promise<CoalitionView> {
  const events = await eventsOf(deps.store);
  const commitmentIds = new Set<CommitmentId>();
  for (const event of events) {
    if (event.type === "COMMITMENT_OFFERED") {
      commitmentIds.add((event.payload as { offer: CommitmentOffer }).offer.commitmentId);
    }
  }
  const peers = new Map<string, PeerRef>();
  for (const commitmentId of commitmentIds) {
    const state = deriveCommitment(events, commitmentId);
    if (state === undefined || !state.active) continue;
    const scopeKey =
      state.offer.scope.kind === "attempt_participation"
        ? `${state.offer.scope.attempt.projectId}/${state.offer.scope.attempt.attemptId}`
        : state.offer.scope.contactNeedId;
    if (scopeKey !== scope) continue;
    peers.set(state.holderPeerId, { schemaVersion: 1, peerId: state.holderPeerId });
  }
  return Object.freeze({
    scope,
    peers: Object.freeze([...peers.values()].sort((a, b) => (a.peerId < b.peerId ? -1 : 1))),
  });
}

/** The federation scope constant re-exported for view callers. */
export { FEDERATION_SCOPE };
