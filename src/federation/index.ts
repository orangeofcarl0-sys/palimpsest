/**
 * G10-E2 federation package: peer identity, contact needs, discovery —
 * bottom-up collaboration grounding (no global planner, no manager
 * hierarchy, no authority inference).
 */

export {
  PeerIdentityError,
  materializeContactNeed,
  materializePeerAdvertisement,
  materializePeerRef,
  matchContactCandidates,
  parsePeerRef,
} from "./peer.js";
export type {
  ContactCandidate,
  ContactNeed,
  ContactNeedOrigin,
  PeerAdvertisement,
  PeerContinuityAssociation,
  PeerId,
  PeerRef,
} from "./peer.js";
export { discoverContactCandidates } from "./directory.js";
export type { PeerDirectoryPort } from "./directory.js";

/** G10-E3: collaboration message substrate, transport port, messaging service. */
export {
  FEDERATION_EVENT_PARSERS,
  materializePeerMessage,
  materializeThreadRef,
  parsePeerMessage,
  parseThreadRef,
} from "./messages.js";
export type {
  AckRecordedPayload,
  ContactRequestedPayload,
  MessageDeliveredPayload,
  MessagePreparedPayload,
  MessageReceivedPayload,
  PeerMessage,
  ThreadRef,
  WakeSentPayload,
} from "./messages.js";
export { callbackPeerTransportPort, PeerTransportError } from "./transport.js";
export type {
  CallbackPeerTransportPortCallbacks,
  InboundPeerEnvelope,
  PeerSendRequest,
  PeerSendResult,
  PeerTransportPort,
  PeerWakeRequest,
  PeerWakeResult,
} from "./transport.js";
export { FEDERATION_SCOPE, makeFederationMessagingService } from "./messaging.js";
export {
  COMMITMENT_EVENT_PARSERS,
  CommitmentError,
  commitmentTermsOf,
  parseCommitmentOffer,
  parseCommitmentScope,
  parseHandoffOffer,
  successorCommitmentIdOf,
} from "./commitment.js";
export type {
  CommitmentAcceptedPayload,
  CommitmentId,
  CommitmentOffer,
  CommitmentOfferedPayload,
  CommitmentRejectedPayload,
  CommitmentReleasedPayload,
  CommitmentScope,
  CommitmentState,
  CommitmentSupersededPayload,
  CommitmentTerms,
  HandoffAcceptedPayload,
  HandoffId,
  HandoffOffer,
  HandoffOfferedPayload,
  HandoffRejectedPayload,
} from "./commitment.js";
export { makeCommitmentService } from "./commitment_service.js";
export type { CommitmentDeps, CommitmentService } from "./commitment_service.js";
export type {
  FederationMessagingDeps,
  FederationMessagingService,
  InboxView,
  ThreadView,
} from "./messaging.js";

/** G10-E5: federated workforce views + the high-level federation service. */
export { coalitionView, manpowerPointView } from "./workforce.js";
export type { CoalitionView, ManpowerPointView, WorkforceViewDeps } from "./workforce.js";
export { makeFederationService } from "./federation_service.js";
export type { FederationService, FederationServiceDeps } from "./federation_service.js";

/** G10-F1: formal Coalition grounding — derived snapshots + provenance only. */
export {
  COALITION_BASIS_DIGEST_DOMAIN,
  COALITION_SNAPSHOT_DIGEST_DOMAIN,
  activeCommitmentRecords,
  activeParticipationIdsInScope,
  coalitionProvenanceOf,
  coalitionScopeKey,
  coalitionScopeOfCommitmentScope,
  commitmentScopeKey,
  coordinationBasisOf,
  deriveCoalitionSnapshot,
  isCoalitionSnapshotCurrent,
  materializeCoalitionSnapshot,
  parseCoalitionProvenanceRef,
  parseCoalitionScope,
  parseCoalitionSnapshot,
} from "./coalition.js";
export type {
  ActiveCommitmentRecord,
  CoalitionProvenanceRef,
  CoalitionScope,
  CoalitionSnapshot,
  CoordinationBasisRef,
} from "./coalition.js";
