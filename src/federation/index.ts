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
export type {
  FederationMessagingDeps,
  FederationMessagingService,
  InboxView,
  ThreadView,
} from "./messaging.js";
