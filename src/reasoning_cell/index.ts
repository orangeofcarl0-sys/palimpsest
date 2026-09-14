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
export * from "./branch_execution.js";
