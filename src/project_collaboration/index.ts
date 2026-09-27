/**
 * E3-C — GOVERNED SOVEREIGN COLLABORATION. Public barrel.
 *
 *     NeedCandidate ≠ ContactNeed          ContactNeed ≠ Assignment
 *     ContactCandidate ≠ SelectedWorker    ContactRequest ≠ Commitment
 *     Message ≠ Agreement ≠ Evidence       Commitment ≠ Work ownership ≠ Work authority
 *     Remote Project Work ≠ Local Project Work
 *     Fulfillment ≠ Remote Work assignment ≠ Truth ≠ Evidence
 *
 * This module owns the LOCAL half of the inter-project loop: project reality → grounded need candidate →
 * currentness → independent admission → the EXISTING Federation declaration. It owns NO store, NO peer
 * identity, NO Work, NO commitment history and NO authority.
 *
 * The candidate is NON-CANONICAL, content-addressed and basis-bound. Only an ACCEPTED declaration becomes
 * a durable `ContactNeed`, and it durably preserves why it occurred.
 */

export {
  COLLABORATION_NEED_CANDIDATE_DOMAIN,
  COLLABORATION_NEED_CANDIDATE_ID_DOMAIN,
  CollaborationNeedRefusal,
  NEED_GROUND_KINDS,
  NEED_REFUSAL_REASONS,
  collaborationNeedCandidateDigestOf,
  collaborationNeedCandidateIdOf,
  contactNeedOriginOfCandidate,
  contactNeedReasonOfCandidate,
  materializeCollaborationNeedCandidate,
  needRefuse,
  parseCollaborationNeedCandidate,
  parseCollaborationProjectBasis,
  parseNeedGround,
} from "./need.js";
export type {
  BlockedTaskGround,
  CollaborationNeedCandidate,
  CollaborationProjectBasis,
  FailedAttemptGround,
  NeedGround,
  NeedGroundKind,
  NeedRefusalReason,
} from "./need.js";

export {
  ACCEPTED_NEED_DECLARATION_DOMAIN,
  NEED_ADMISSION_DECISIONS,
  NEED_CURRENTNESS_STATUSES,
  acceptedNeedDeclarationDigestOf,
  assertNeedAdmissionOutcomeShape,
  materializeAcceptedNeedDeclaration,
} from "./receipt.js";
export type {
  AcceptedNeedDeclaration,
  ContactNeedAdmissionPort,
  NeedAdmissionDecision,
  NeedAdmissionInput,
  NeedAdmissionOutcome,
  NeedCurrentnessAssessment,
  NeedCurrentnessStatus,
} from "./receipt.js";

export type {
  BlockedTaskObservation,
  CollaborationNeedAuthoringPort,
  FailedAttemptObservation,
  NeedAuthoringResult,
  NeedDeclarationPort,
  ProjectCollaborationPorts,
  ProjectRealityFacts,
} from "./ports.js";

export { makeProjectCollaborationService } from "./service.js";
export type {
  AdmitNeedOutcome,
  NeedGroundRequest,
  NoNeedOutcome,
  PrepareNeedInput,
  PrepareNeedOutcome,
  PreparedNeedCandidate,
  ProjectCollaborationService,
  ProjectCollaborationServiceDeps,
} from "./service.js";
