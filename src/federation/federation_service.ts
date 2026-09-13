/**
 * G10-E5 federated workforce service — the high-level bottom-up collaboration
 * surface (§106–§110). It COORDINATES local semantic steps:
 *
 *   declareContactNeed / findCandidates
 *   openThread (implicit) / sendMessage / wakePeer / acknowledge
 *   offerCommitment / acceptCommitment / rejectCommitment / releaseCommitment
 *   offerHandoff / acceptHandoff / rejectHandoff
 *   beginParticipation / endParticipation
 *   views: manpowerPoint / coalition / inbox / thread
 *
 * It is NOT a global planner or authority root (§5/§98): it derives contact
 * needs, discovers candidates, sends messages, records commitments, and
 * derives views — it never commands arbitrary peers, forces remote
 * commitment, changes peer authority, or schedules Work. There is NO
 * `assignPeerToTask` / `forcePeerParticipation` / `setWorker` API (§108).
 */

import type { Activation } from "../runtime/index.js";
import type { CoordinationStore } from "../coordination/store.js";
import type { AttemptCatalogPort, ParticipationService } from "../coordination/index.js";
import type { PeerDirectoryPort } from "./directory.js";
import { discoverContactCandidates } from "./directory.js";
import type { ContactNeed, PeerAdvertisement, PeerRef } from "./peer.js";
import { materializeContactNeed, matchContactCandidates } from "./peer.js";
import type { CommitmentId, CommitmentScope } from "./commitment.js";
import type { FederationMessagingService, InboxView, ThreadView } from "./messaging.js";
import type { CoalitionView, ManpowerPointView } from "./workforce.js";
import { coalitionView, manpowerPointView } from "./workforce.js";
import type { CoalitionScope, CoalitionSnapshot } from "./coalition.js";
import { deriveCoalitionSnapshot } from "./coalition.js";
import type { AttemptRef } from "../coordination/index.js";

export interface FederationServiceDeps {
  readonly store: CoordinationStore;
  readonly localPeer: PeerRef;
  readonly messaging: FederationMessagingService;
  readonly commitments: import("./commitment_service.js").CommitmentService;
  readonly participation: ParticipationService;
  readonly directory: PeerDirectoryPort;
  readonly allocateContactNeedId: () => string;
}

export interface FederationService {
  declareContactNeed(input: {
    readonly origin: ContactNeed["origin"];
    readonly competenceTags: readonly string[];
    readonly reason: string;
  }): Promise<ContactNeed>;
  findCandidates(need: ContactNeed): Promise<
    | { readonly status: "discovered"; readonly candidates: ReturnType<typeof matchContactCandidates> }
    | { readonly status: "directory_unknown"; readonly detail: string }
    | { readonly status: "directory_error"; readonly detail: string }
  >;
  requestContact(input: { readonly need: ContactNeed; readonly to: PeerRef }): Promise<void>;
  sendMessage: FederationMessagingService["sendMessage"];
  wakePeer: FederationMessagingService["wakePeer"];
  acknowledge: FederationMessagingService["acknowledge"];
  recordInboundMessage: FederationMessagingService["recordInboundMessage"];
  offerCommitment(input: {
    readonly proposedHolder: PeerRef;
    readonly scope: CommitmentScope;
    readonly statement: string;
  }): ReturnType<import("./commitment_service.js").CommitmentService["offerCommitment"]>;
  acceptCommitment: import("./commitment_service.js").CommitmentService["acceptCommitment"];
  rejectCommitment: import("./commitment_service.js").CommitmentService["rejectCommitment"];
  releaseCommitment: import("./commitment_service.js").CommitmentService["releaseCommitment"];
  offerHandoff: import("./commitment_service.js").CommitmentService["offerHandoff"];
  acceptHandoff: import("./commitment_service.js").CommitmentService["acceptHandoff"];
  beginParticipation(input: {
    readonly activation: Activation;
    readonly attempt: AttemptRef;
    readonly invocationId?: string;
  }): Promise<unknown>;
  endParticipation(input: {
    readonly participationId: string;
    readonly endReason: "completed" | "withdrawn" | "cancelled" | "runtime_lost";
  }): Promise<unknown>;
  thread(threadId: string): Promise<ThreadView>;
  inbox(peer: PeerRef): Promise<InboxView>;
  manpowerPoint(peer: PeerRef): Promise<ManpowerPointView>;
  /** Legacy string-scoped derived coalition projection (E5). */
  coalition(scope: string): Promise<CoalitionView>;
  /** G10-F1 formal coalition snapshot: derived, basis-recorded, read-only (§37/§41). */
  coalitionSnapshot(scope: CoalitionScope): Promise<CoalitionSnapshot>;
}

export function makeFederationService(deps: FederationServiceDeps): FederationService {
  async function declareContactNeed(input: {
    readonly origin: ContactNeed["origin"];
    readonly competenceTags: readonly string[];
    readonly reason: string;
  }): Promise<ContactNeed> {
    // §50: explicit creation only — never auto-derived from blocked tasks,
    // dependencies, or worker failures.
    return materializeContactNeed({
      contactNeedId: deps.allocateContactNeedId(),
      origin: input.origin,
      competenceTags: input.competenceTags,
      reason: input.reason,
    });
  }

  async function findCandidates(need: ContactNeed) {
    return discoverContactCandidates(deps.directory, need);
  }

  async function requestContact(input: { readonly need: ContactNeed; readonly to: PeerRef }): Promise<void> {
    await deps.messaging.requestContact({ contactNeedId: input.need.contactNeedId, to: input.to });
  }

  return {
    declareContactNeed,
    findCandidates,
    requestContact,
    sendMessage: deps.messaging.sendMessage,
    wakePeer: deps.messaging.wakePeer,
    acknowledge: deps.messaging.acknowledge,
    recordInboundMessage: deps.messaging.recordInboundMessage,
    offerCommitment: deps.commitments.offerCommitment,
    acceptCommitment: deps.commitments.acceptCommitment,
    rejectCommitment: deps.commitments.rejectCommitment,
    releaseCommitment: deps.commitments.releaseCommitment,
    offerHandoff: deps.commitments.offerHandoff,
    acceptHandoff: deps.commitments.acceptHandoff,
    beginParticipation: (input) =>
      deps.participation.beginParticipation({
        activation: input.activation,
        attempt: input.attempt,
        ...(input.invocationId === undefined ? {} : { invocation: { invocationId: input.invocationId } }),
      }),
    endParticipation: (input) => deps.participation.endParticipation(input),
    thread: (threadId) => deps.messaging.threadView(threadId),
    inbox: (peer) => deps.messaging.inboxView(peer),
    manpowerPoint: (peer) =>
      manpowerPointView(
        {
          store: deps.store,
          localPeer: deps.localPeer,
          inboxOf: (target) => deps.messaging.inboxView(target),
        },
        peer,
      ),
    coalition: (scope) =>
      coalitionView({ store: deps.store, localPeer: deps.localPeer, inboxOf: (peer) => deps.messaging.inboxView(peer) }, scope),
    coalitionSnapshot: (scope) => deriveCoalitionSnapshot(deps.store, scope),
  };
}

export type { AttemptCatalogPort, PeerAdvertisement, PeerRef, Activation };
