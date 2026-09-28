/**
 * E2-I — Governed Project Intent Reconciliation. Public barrel.
 *
 *   Proposal ≠ ProjectIR          Ground ≠ Truth          Ground ≠ Authority
 *   ReasoningClaim ≠ Evidence     NEGATIVE_RESULT ≠ Evidence
 *   Admission ≠ Evidence Verification                    ManagementMode ≠ SemanticAuthority
 *   Intent Proposal ≠ Work Assignment
 *   Intent revision ≠ Organization evolution ≠ Runtime evolution
 *
 * The proposal is NON-CANONICAL, content-addressed and basis-bound. Only the ACCEPTED ProjectIR
 * revision becomes canonical intent, and it durably preserves why it occurred.
 */

export {
  INTENT_CHANGE_KINDS,
  INTENT_GROUND_KINDS,
  INTENT_REFUSAL_REASONS,
  PROJECT_INTENT_PROPOSAL_DOMAIN,
  PROJECT_INTENT_PROPOSAL_ID_DOMAIN,
  ProjectIntentRefusal,
  assertIntentProposal,
  intentProposalDigestOf,
  intentRefuse,
  materializeProjectIntentProposal,
  parseIntentChange,
  parseProjectIntentBasis,
  parseProjectIntentProposal,
  validateIntentChanges,
} from "./proposal.js";
export type {
  DecisionAppendChange,
  DecisionSupersessionChange,
  GoalRevisionChange,
  IntentChangeKind,
  IntentGround,
  IntentGroundKind,
  IntentGroundRequest,
  IntentRefusalReason,
  NegativeResultIntentGround,
  ProjectIntentChange,
  ProjectIntentProposal,
  ProjectIntentProposalContent,
  ProjectIntentBasis,
  ProofBasisAtProposal,
  ProofIntentGround,
  ReasoningFrontierBasisAtProposal,
  ReasoningIntentGround,
  RequirementAdditionChange,
  RequirementRemovalChange,
  RequirementRevisionChange,
} from "./proposal.js";

export {
  ACCEPTED_INTENT_RECONCILIATION_DOMAIN,
  INTENT_ADMISSION_DECISIONS,
  INTENT_CURRENTNESS_STATUSES,
  acceptedIntentReceiptDigestOf,
  assertAuthorityOutcomeShape,
  materializeAcceptedIntentReconciliation,
  parseAcceptedIntentReconciliation,
} from "./receipt.js";
export type {
  AcceptedIntentReconciliationReceipt,
  IntentAdmissionDecision,
  IntentAdmissionInput,
  IntentAdmissionOutcome,
  IntentCurrentnessAssessment,
  IntentCurrentnessStatus,
  ProjectIntentAdmissionPort,
} from "./receipt.js";

export {
  changeClassForIntentChanges,
  changedIdsForIntentChanges,
  revisionReasonFor,
} from "./ports.js";
export type {
  IntentJournalEntryView,
  IntentProjectFacts,
  IntentProofBasis,
  IntentProofObservation,
  IntentReasoningFrontier,
  ProjectIntentPorts,
} from "./ports.js";

export { makeProjectIntentService } from "./service.js";
export type {
  ApplyIntentProposalInput,
  ApplyIntentProposalOutcome,
  PrepareIntentProposalInput,
  PreparedIntentProposal,
  ProjectIntentService,
  ProjectIntentServiceDeps,
} from "./service.js";
