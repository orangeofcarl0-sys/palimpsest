/**
 * PAL-FED-0 experimental federation leaf — public surface.
 *
 * EXPERIMENTAL / SUBJECT TO DOGFOOD / NOT UAS FROZEN. This module is not
 * exported from the package root or `advanced`; it exists so the experiment
 * can be removed without disturbing the orchestrator runtime.
 */

export { PAL_FED_PROTOCOL, PAL_FED_SCHEMA_VERSION } from "./limits.js";
export {
  FIXED_PEERS,
  isPeerRef,
  otherPeer,
  type PeerRef,
} from "./peers.js";
export { EVENT_KINDS, ARTIFACT_KINDS } from "./types.js";
export type {
  ArtifactKind,
  ArtifactRef,
  BoundaryContract,
  CollaborationEvent,
  ContractAcceptance,
  ContractTerms,
  EventKind,
  FederationFabricMarker,
  PeerInboxState,
  PendingBatch,
} from "./types.js";
export {
  FederationError,
  FederationDecodeError,
  FederationInputError,
  FederationConflictError,
  FederationAckError,
  FederationCursorError,
  FabricMissingError,
  FabricMismatchError,
  UnknownPeerError,
  FederationNotFoundError,
  StaleTermsDigestError,
  type FederationErrorCode,
} from "./errors.js";
export {
  decodeBoundaryContract,
  decodeCollaborationEvent,
  decodeFabricMarker,
  decodePeerInboxState,
  encodeBoundaryContract,
  encodeCollaborationEvent,
  encodePeerInboxState,
  termsDigestOf,
} from "./codec.js";
export { initFabric, readFabricMarker, requireFabricMarker, type InitFabricResult } from "./fabric.js";
export { openFederationStore, type FederationStore } from "./store.js";
export { newContractId, type ContractMutation, type ContractReadResult } from "./contracts.js";
export { newEventId, newThreadId, type PostedEvent, type StoredEvent } from "./events.js";
export { ack, inbox, readPeerInboxState, type AckResult, type InboxResult } from "./peer_state.js";
export {
  openFederationService,
  type FederationService,
  type FederationServiceConfig,
} from "./service.js";
export { createCollabMcp, type CollabMcp } from "./mcp.js";
