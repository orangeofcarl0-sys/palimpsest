/**
 * G10-I Organization Dynamics — advanced-only, read-only observation/diagnosis
 * and non-canonical structural proposals. Zero canonical mutation authority.
 *
 *   Observation ≠ Diagnosis ≠ Proposal ≠ Transformation ≠ Governance ≠ Activation
 */

export {
  DYNAMICS_DIAGNOSIS_DOMAIN,
  DYNAMICS_PROPOSAL_DOMAIN,
  DYNAMICS_PROPOSAL_KINDS,
  DYNAMICS_SNAPSHOT_DOMAIN,
  OrganizationDynamicsError,
  basisDigestOf,
  dynExactKeys,
  dynObject,
  parseAdvisorProposal,
  parseDynamicsPolicy,
  parseDynamicsSubject,
  parseOrganizationDynamicsProposal,
  proposalDigestOf,
  snapshotDigestOf,
  subjectKey,
} from "./dynamics.js";
export type {
  AdvisorProposalFields,
  CampaignActivityObservation,
  CampaignActivityPort,
  CollaborationMetrics,
  DynamicsBasis,
  DynamicsCollaborationObservation,
  DynamicsCollaborationPort,
  DynamicsKnowledge,
  DynamicsPolicy,
  DynamicsPolicyRef,
  DynamicsPressureKind,
  DynamicsProposalKind,
  DynamicsSubject,
  ExistingTransformationMapping,
  InterfaceCompressibilityAssessment,
  DynamicsKnowledgeState,
  OrganizationDynamicsAdvisorPort,
  OrganizationDynamicsProposal,
  OrganizationStructureMetrics,
  PersistenceEntry,
  PersistenceReport,
  PressureStanding,
  ProposalImpactReport,
  ProposalIndependenceLoss,
  RuntimeStructuralSnapshot,
  ScopeBasisRef,
  StructuralDiagnosis,
  StructuralPressure,
} from "./dynamics.js";

export { makeOrganizationDynamicsService } from "./service.js";
export type {
  DiagnosisResult,
  ObservationResult,
  OrganizationDynamicsDeps,
  OrganizationDynamicsOrganizationPort,
  OrganizationDynamicsService,
  ProposalResult,
} from "./service.js";
