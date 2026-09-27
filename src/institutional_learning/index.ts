/**
 * E4-L — GOVERNED INSTITUTIONAL LEARNING. Public barrel.
 *
 *     OrganizationMemory ≠ OrganizationTruth        InterventionRecord ≠ EvolutionAuthority
 *     Intervention ≠ Causation                      Observed improvement ≠ universal superiority
 *     Evaluation ≠ Governance                       Historical winner ≠ Future authority
 *     Experiment result ≠ automatic Dynamics proposal
 *     Architecture recommendation ≠ OrganizationDynamicsProposal
 *     Memory ≠ Structure mutation
 *
 * The previously rejected edge STAYS rejected:
 *
 *     ArchitectureRecommendation → OrganizationDynamicsProposal
 *
 * This module connects existing evolution truth to existing empirical memory. It owns NO store, NO
 * Organization, NO RuntimeScope, NO DynamicsProposal and NO authority.
 */

export {
  INTERVENTION_PROJECTION_DOMAIN,
  INTERVENTION_PROJECTION_REFUSALS,
  STRUCTURAL_LANES,
  interventionContentDigest,
  interventionContentDigestOfRecord,
  parseStructuralSourceKey,
  projectActivatedCase,
  structuralSourceKey,
  structuralSourceRefOf,
  subjectRefOf,
} from "./projection.js";
export type {
  InterventionProjectionOutcome,
  InterventionProjectionRefusal,
  StructuralInterventionProjection,
  StructuralLane,
  StructuralSourceRef,
} from "./projection.js";

export type { InterventionMemoryPort, StructuralCaseView, StructuralHistoryPort } from "./ports.js";

export { makeInstitutionalLearningService } from "./service.js";
export type {
  EvaluationQueryPort,
  InstitutionalLearningService,
  InstitutionalLearningServiceDeps,
  InterventionEvaluationView,
  ReconciliationAction,
  ReconciliationEntry,
  ReconciliationReport,
} from "./service.js";
