/**
 * G10-V graduated project-management autonomy — barrel.
 *
 *   Mode ≠ Authority        EffectivePermission = Authority ∩ Policy ∩ Capability
 *   Candidate ≠ Command     Request ≠ Change       Adapter ≠ StoreMutator
 *
 * Involvements (DIRECT/ASSIST/MANAGE/DELEGATE) are operator preferences,
 * orthogonal to the work mode (FOCUS/EXPLORE/COORDINATE ± VERIFY/MONITOR). The
 * agent-facing path can only inspect, recommend, request, or execute bounded
 * local work through the existing governed services; it can never escalate.
 */

export {
  DEFAULT_MAX_STEPS_PER_RUN,
  MANAGEMENT_ACTION_CLASSES,
  MANAGEMENT_INVOLVEMENTS,
  MANAGEMENT_PROFILE_DOMAIN,
  MANAGEMENT_PROFILE_EPOCH,
  MANAGEMENT_PROFILE_REF_PREFIX,
  MANAGEMENT_PROFILE_SCHEMA_VERSION,
  ManagementError,
  SqliteManagementPreferenceStore,
  AUTHORITY_SHAPED_ACTIONS,
  defaultAllowedActionClasses,
  defaultConfirmationBoundaries,
  defaultManagementProfile,
  defaultManagementProfilePath,
  managementFail,
  managementProfileDigestOf,
  managementProfileRefOf,
  materializeManagementProfile,
  parseManagementAutonomyProfile,
} from "./profile.js";
export type {
  ManagementActionClass,
  ManagementAutonomyProfile,
  ManagementBudgets,
  ManagementErrorKind,
  ManagementInvolvement,
  MaterializeManagementProfileInput,
  ManagementPreferenceHistoryEntry,
  UserManagementControlPort,
} from "./profile.js";

export {
  AUTHORITY_REQUIRED_ACTIONS,
  DEFAULT_ACTION_POLICY,
  MANAGEMENT_POLICY_CELLS,
  MANAGEMENT_POLICY_NOTES,
  evaluateManagementAction,
} from "./policy.js";
export type {
  EvaluateManagementActionInput,
  ManagementActionEvaluation,
  ManagementActionPolicyTable,
  ManagementPolicyCell,
} from "./policy.js";

export {
  CAPABILITY_EXTERNAL,
  CAPABILITY_OBSERVE,
  CAPABILITY_PLAN,
  CAPABILITY_PREPARE,
  CAPABILITY_RECOMMEND,
  CAPABILITY_RECIPE_EXECUTION,
  CAPABILITY_RUN_TURN,
  CAPABILITY_VERIFY,
  MANAGEMENT_ACTION_ID_DOMAIN,
  MANAGEMENT_ACTION_ID_PREFIX,
  MANAGEMENT_RISK_CLASSES,
  deriveManagementActionCandidates,
  managementActionIdOf,
  materializeManagementActionCandidate,
  parseManagementActionCandidate,
} from "./actions.js";
export type {
  ManagementActionCandidate,
  ManagementActionSubjectRef,
  ManagementRiskClass,
  MaterializeManagementActionCandidateInput,
} from "./actions.js";

export { MANAGEMENT_RECIPE_RATIONALE_DOMAIN, makeProjectManagementService } from "./service.js";
export type {
  ManagementAssessment,
  ManagementBoundedRun,
  ManagementStepPreview,
  ManagementStepResult,
  ManagementStepStatus,
  ProjectManagementCapabilities,
  ProjectManagementRecipeDeps,
  ProjectManagementService,
  ProjectManagementServiceDeps,
} from "./service.js";

export {
  HOST_MANAGEMENT_COGNITION_NOTES,
  HOST_MANAGEMENT_PROPOSAL_DOMAIN,
  HOST_MANAGEMENT_PROPOSAL_KINDS,
  makeHostBoundedManagementCognition,
  managementActionClassForProposalKind,
} from "./host_adapter.js";
export type {
  HostBoundedManagementCognition,
  HostBoundedManagementCognitionDeps,
  HostManagementProposal,
  HostManagementProposalKind,
} from "./host_adapter.js";
