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
  OrganizationEvolutionDeps,
  OrganizationEvolutionInstitutionWiring,
  OrganizationEvolutionService,
} from "./service.js";
