/**
 * G10-J Governed Dynamic Evolution — advanced-only.
 *
 *   Proposal ≠ Candidate ≠ Assessment ≠ Authority ≠ Governance ≠ Activation ≠ Success
 */

export {
  EVOLUTION_CANDIDATE_DOMAIN,
  EVOLUTION_CASE_DOMAIN,
  EVOLUTION_CHAIN_DOMAIN,
  EVOLUTION_EVENT_PARSERS,
  EVOLUTION_KIND_DISPOSITION,
  EVOLUTION_KIND_TO_TRANSFORMATION,
  EvolutionArtifactError,
  evExactKeys,
  evObject,
  evolutionCandidateDigestOf,
  evolutionCaseRefOf,
  evolutionChainDigest,
  parseCompleteEvolutionCandidate,
  parseEvolutionTransformation,
} from "./artifacts.js";
export type {
  CompleteEvolutionCandidate,
  EvolutionCaseRef,
  EvolutionCaseState,
  EvolutionEventParsers,
  EvolutionEventType,
  EvolutionGovernance,
  EvolutionKindDisposition,
  EvolutionTargetKind,
  OrganizationEvolutionAdmissionInput,
  OrganizationEvolutionAdmissionPort,
  OrganizationEvolutionAuthorityOutcome,
  OrganizationEvolutionCompilerInput,
  OrganizationEvolutionCompilerPort,
} from "./artifacts.js";

export { EvolutionStoreError, SqliteOrganizationEvolutionStore, defaultOrganizationEvolutionPath } from "./store.js";
export type { EvolutionAppendRequest, EvolutionBasis, EvolutionCaseRecord, EvolutionEvent, EvolutionStoreErrorKind, OrganizationEvolutionStore } from "./store.js";

export { EVOLUTION_ASSESSMENT_DOMAIN, makeOrganizationEvolutionService } from "./service.js";
export type {
  EvolutionInspection,
  EvolutionOutcome,
  EvolutionRequest,
  OrganizationEvolutionDeps,
  OrganizationEvolutionInstitutionWiring,
  OrganizationEvolutionService,
} from "./service.js";

/** G10-K CF-J-02: governed FORMALIZE_ORGANIZATION (blueprint → genesis definition). */
export { FORMALIZATION_CANDIDATE_DOMAIN, formalizationAssessmentDigestOf, formalizationCandidateDigestOf, parseCompleteFormalizationCandidate } from "./formalization.js";
export type {
  CompleteFormalizationCandidate,
  OrganizationFormalizationBoundaryPort,
  OrganizationFormalizationCompilerInput,
  OrganizationFormalizationCompilerPort,
  OrganizationFormalizationWiring,
} from "./formalization.js";

/** G10-M: organization retirement (append-only lifecycle truth). */
export {
  ORGANIZATION_RETIREMENT_CANDIDATE_DOMAIN,
  ORGANIZATION_RETIREMENT_ASSESSMENT_DOMAIN,
  assessOrganizationRetirement,
  materializeOrganizationRetirementCandidate,
  organizationRetirementCandidateDigestOf,
  parseOrganizationRetirementCandidate,
} from "./retirement.js";
export type {
  OrganizationRetirementAssessment,
  OrganizationRetirementCandidate,
  OrganizationRetirementInstitutionPort,
  OrganizationRetirementObligation,
  OrganizationRetirementObligationKind,
  OrganizationRetirementRuntimePort,
  OrganizationRetirementWiring,
} from "./retirement.js";
