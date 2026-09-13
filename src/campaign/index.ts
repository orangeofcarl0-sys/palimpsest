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
  campaignProjectRefsEqual,
  classifyEpistemicChange,
  compareCampaignProjectRefs,
  makeInterventionService,
  materializeCampaignProjectRef,
  parseCampaignIntervention,
  parseCampaignProjectRef,
  parseProjectOperationalStanding,
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
  parseCampaignWatchDraft,
  parseWaitAdmission,
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
  WaitAdmission,
  WaitAdmissionId,
  WatchEvaluation,
  WatchId,
  WatchStatus,
} from "./prospective.js";

/** G10-GC2: strict digest shape + exact campaign-linked Project projection. */
export { CANONICAL_DIGEST_RE, isCanonicalDigest, requireCanonicalDigest } from "./digest.js";
export { linkedProjectRefs, projectLinkedProjects } from "./project.js";
export type { CampaignLinkedProject, CampaignLinkedProjects, CampaignProjectLinkSource } from "./project.js";

/** G10-G5: lifecycle, checkpoints, wake cycles, world reconciliation. */
export {
  CAMPAIGN_LIFECYCLE_EVENT_PARSERS,
  makeLifecycleService,
  parseCampaignCheckpoint,
  parseWorldSnapshot,
} from "./lifecycle.js";
export type { CampaignInstitutionEpochSource as CampaignInstitutionPort } from "./lifecycle.js";
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
  COMPILED_CAMPAIGN_ACTION_DIGEST_DOMAIN,
  campaignProjectAdmissionKeyOf,
  compiledCampaignActionDigestOf,
  makeCompilerService,
  parseCampaignNextActionProposal,
  parseCompiledCampaignAction,
  parseValidatedCampaignAction,
} from "./compiler.js";
export type {
  CampaignActionParseOptions,
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

/** G10-GC2..GC6: the grounded, causally auditable production loop closure. */
export {
  CAMPAIGN_CHECKPOINT_DIGEST_DOMAIN,
  CAMPAIGN_PRODUCTION_EVENT_PARSERS,
  CAMPAIGN_RECONCILIATION_DIGEST_DOMAIN,
  beliefRevisionsFromEvents,
  checkpointDigestOf,
  committedReconciliationOf,
  encodeWakeCause,
  evaluateCompiledCampaignActionFreshness,
  inFlightWake,
  lifecycleStateFromEvents,
  makeCampaignProductionService,
  parseAdmittedCampaignActionRef,
  parseReconciliationReport,
  parseWakeCompletionActionRef,
  parseWakeCycleCompleted,
  reconciliationDigestOf,
} from "./production.js";
export type {
  AdmittedCampaignActionRef,
  CampaignActionFreshness,
  CampaignActionFreshnessCandidate,
  CampaignClaimReader,
  CampaignInstitutionReader,
  CampaignProductionDeps,
  CampaignProductionService,
  CampaignProjectReader,
  CampaignReconciliationReport,
  CampaignWakeCause,
  Knowledge,
  ParsedWakeCycleCompleted,
  ProjectWakeActionRef,
  WaitWakeActionRef,
  WakeCompletionActionRef,
} from "./production.js";

/** G10-GC3: the ONE unified next-action admission boundary. */
export {
  CAMPAIGN_WAIT_ADMISSION_ID_DOMAIN,
  campaignLifecycleStateOf,
  campaignWaitAdmissionIdOf,
  committedReconciliationFor,
  currentIncompleteWake,
  makeNextActionAdmissionService,
  waitCompletionActionRef,
} from "./next_action.js";
export type {
  CampaignNextActionAdmissionResult,
  CampaignNextActionProductionPort,
  CampaignProjectAdmissionPort,
  NextActionAdmissionDeps,
  NextActionAdmissionService,
} from "./next_action.js";
