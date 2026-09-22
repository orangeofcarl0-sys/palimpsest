/**
 * G10-N Collaborative Reasoning Cells & Epistemic Admission — advanced-only.
 *
 *   ReasoningCell ≠ Organization/BoundaryWorkspace/Campaign/RuntimeScope/PersistentPoint/PeerRef
 *   ReasoningBranch ≠ durable agent          CandidateClaim ≠ AcceptedClaim ≠ Truth ≠ Evidence
 *   VerificationResult ≠ AdmissionDecision   EpistemicAdmission ≠ EffectAdmission
 *   Unresolved is a legitimate epistemic outcome; no chain-of-thought is ever persisted.
 */

export * from "./ref.js";
export * from "./claims.js";
export * from "./artifacts.js";
export * from "./store.js";
export * from "./service.js";
// §C.12: EXPLICIT, not `export *`. The module also carries an INTERNAL async-lifecycle seam
// (`BranchExecutionJob` / `AsyncReasoningBranchExecutionPort`) which the package must not publish —
// an internal export is not a package export, and the wildcard is what blurred that line. Listing the
// legacy host seam by name keeps the public face byte-for-byte what the baseline recorded.
export type {
  BranchExecutionResult,
  DshBranchExecutionOutcome,
  DshSubprocessBranchExecutionPortInput,
  ReasoningBranchExecutionPort,
} from "./branch_execution.js";

export {
  DSH_BRANCH_RESULT_PREFIX,
  dshSubprocessBranchExecutionPort,
} from "./branch_execution.js";
