/**
 * G10-G1 campaign package — durable long-horizon Campaign identity owned by a
 * DurableInstitution, with a canonical append-only CampaignStore.
 *
 * Campaign ≠ Project ≠ Institution ≠ RuntimeAgent.
 * CampaignCommitment ≠ federation Commitment.
 */

export {
  CAMPAIGN_CHAIN_DOMAIN,
  CampaignArtifactError,
  CAMPAIGN_COMMITMENT_EVENT_PARSERS,
  campaignBasisRefsEqual,
  campaignChainDigest,
  materializeCampaignCommitment,
  materializeCampaignDefinition,
  parseCampaignBasisRef,
  parseCampaignCommitment,
  parseCampaignDefinition,
} from "./artifacts.js";
export type {
  CampaignBasisRef,
  CampaignCommitment,
  CampaignCommitmentId,
  CampaignCommitmentState,
  CampaignDefinition,
  CampaignEventParsers,
  CampaignEventPayloadParser,
  CampaignEventType,
  CampaignId,
} from "./artifacts.js";

export {
  CampaignStoreError,
  SqliteCampaignStore,
  defaultCampaignPath,
} from "./store.js";
export type {
  CampaignAppendRequest,
  CampaignAtomicAppend,
  CampaignEvent,
  CampaignStore,
  CampaignStoreErrorKind,
} from "./store.js";

export { CAMPAIGN_EVENT_DIGEST_DOMAIN, campaignEventId, makeCampaignService } from "./service.js";
export type { CampaignCommitmentStateEntry, CampaignService, CampaignServiceDeps } from "./service.js";

/** G10-G2: hypothesis branches, EvidenceHistory observations, belief state. */
export {
  BELIEF_STATE_DIGEST_DOMAIN,
  CLAIM_STANDING_DIGEST_DOMAIN,
  CAMPAIGN_EPISTEMIC_EVENT_PARSERS,
  CampaignEpistemicError,
  beliefStandingOf,
  claimStandingDigestContent,
  currentBeliefStateOf,
  materializeBeliefRevision,
  materializeCampaignHypothesis,
  materializeClaimStandingSnapshot,
  materializeEvidenceClaimRef,
  materializeObservation,
  parseBeliefRevision,
  parseCampaignHypothesis,
  parseClaimStandingSnapshot,
  parseEvidenceClaimRef,
  parseObservation,
} from "./epistemic.js";
export type {
  BeliefRevision,
  BeliefRevisionRef,
  CampaignBeliefStanding,
  CampaignEvidenceObservation,
  CampaignEvidencePort,
  CampaignHypothesis,
  ClaimStandingSnapshot,
  CampaignClaimStatus,
  CurrentBeliefEntry,
  CurrentBeliefState,
  EvidenceClaimRef,
  EvidenceKnowledge,
  HypothesisId,
} from "./epistemic.js";

/** G10-G3: epistemic intervention (operational ≠ epistemic outcome). */
export {
  CAMPAIGN_INTERVENTION_EVENT_PARSERS,
  classifyEpistemicChange,
  makeInterventionService,
  materializeCampaignProjectRef,
  parseCampaignIntervention,
} from "./intervention.js";
export type {
  CampaignIntervention,
  CampaignInterventionState,
  CampaignProjectRef,
  CampaignWorkObservationPort,
  EpistemicClassification,
  EpistemicOutcome,
  InterventionId,
  InterventionPurpose,
  InterventionService,
  InterventionServiceDeps,
  PreBeliefStanding,
  ProjectOperationalStanding,
  WorkKnowledge,
} from "./intervention.js";
