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
