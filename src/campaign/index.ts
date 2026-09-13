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

/** G10-G4: prospective memory, watchers, WAIT. */
export {
  CAMPAIGN_PROSPECTIVE_EVENT_PARSERS,
  makeProspectiveService,
  parseCampaignWatch,
  parseWatchCondition,
} from "./prospective.js";
export type {
  CampaignExternalSignalPort,
  CampaignInstitutionEpochPort,
  CampaignProjectStandingPort,
  CampaignWatch,
  CampaignWatchCondition,
  CampaignWatchDraft,
  CampaignWatchState,
  ProspectiveService,
  ProspectiveServiceDeps,
  WatchEvaluation,
  WatchId,
  WatchStatus,
} from "./prospective.js";

/** G10-G5: lifecycle, checkpoints, wake cycles, world reconciliation. */
export {
  CAMPAIGN_LIFECYCLE_EVENT_PARSERS,
  makeLifecycleService,
  parseCampaignCheckpoint,
  parseWorldSnapshot,
} from "./lifecycle.js";
export type {
  CampaignCheckpoint,
  CampaignInstitutionEpochSource,
  CampaignLifecycleState,
  CampaignWakeState,
  CampaignWorldSnapshot,
  InstitutionEpochRefLike,
  LifecycleService,
  LifecycleServiceDeps,
  WakeCycleId,
  WorldObservationResult,
} from "./lifecycle.js";

/** G10-G6: CampaignCompiler candidate boundary + idempotent Work admission. */
export {
  CAMPAIGN_COMPILER_EVENT_PARSERS,
  makeCompilerService,
  parseCampaignNextActionProposal,
} from "./compiler.js";
export type {
  CampaignAdmissionState,
  CampaignCompilerPort,
  CampaignNextActionProposal,
  CampaignPlanningContext,
  CampaignProjectActionProposal,
  CampaignWaitActionProposal,
  CampaignWorkAdmissionPort,
  CompiledCampaignAction,
  CompilerService,
  CompilerServiceDeps,
  ValidatedCampaignAction,
} from "./compiler.js";
