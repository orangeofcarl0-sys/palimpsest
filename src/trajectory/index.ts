/**
 * Trajectory-T0 — the read-only, reconstructible Trajectory Projection.
 *
 *     Trajectory = Owner History + Provenance Relations + Temporal Currentness
 *
 * This capability explains how a project evolved through governed intent, Work attempts, world
 * changes, reasoning, proof, decisions and continuation. It preserves source identity, temporal
 * basis, provenance and unresolved relationships.
 *
 * It is NEVER a new authority. It decides no Work state, verifies no Proof, accepts no Reasoning
 * Claim, changes no ProjectIR and promotes no result. Every node refers to a fact an existing owner
 * recorded; Trajectory owns only the interpretation and presentation of those references.
 *
 * The package deliberately has no store, no scheduler, no writer and no model seam. `readOnly: true`
 * in every projection is a description of the code, not a promise about discipline.
 */

export {
  COMPLETENESS_STATES,
  CURRENTNESS_STATES,
  EDGE_DOES_NOT_AUTHORIZE,
  EDGE_EVIDENCE_STATES,
  EPISTEMIC_STATUS_STATES,
  makeOwnerReference,
  makeTrajectoryNode,
  OWNER_PLANES,
  REFERENCE_VERIFICATION_STATES,
  SOURCE_AUTHENTICITY_STATES,
  TRAJECTORY_PROJECTION_SCHEMA_VERSION,
  TRAJECTORY_RELATIONS,
  trajectoryEdgeIdOf,
  trajectoryNodeIdOf,
} from "./refs.js";
export type {
  Currentness,
  EdgeEvidenceState,
  EpistemicStatus,
  OwnerPlane,
  ProjectionCompleteness,
  ReferenceVerificationState,
  SourceAuthenticity,
  TrajectoryEdge,
  TrajectoryEdgeEvidence,
  TrajectoryNode,
  TrajectoryOwnerReference,
  TrajectoryRelation,
} from "./refs.js";

export {
  BASIS_VECTOR_COMPLETENESS,
  OWNER_BASIS_AVAILABILITY,
  readObservationWindow,
  trajectorySemanticDigestOf,
  workBasisComponent,
} from "./contract.js";
export type {
  BasisVectorCompleteness,
  JournalBasisComponent,
  ObservationWindowReading,
  OwnerBasisAvailability,
  OwnerBasisCursor,
  ProofBasisComponent,
  ReasoningBasisComponent,
  TrajectoryBasisVector,
  WorkBasisComponent,
  WorldBasisComponent,
} from "./contract.js";

export { HOST_OBSERVATION_ADMISSION } from "./ports.js";
export type {
  HostObservationAdmission,
  TrajectoryAssociation,
  TrajectoryCurrentnessAssessment,
  TrajectoryHostObservationPort,
  TrajectoryIntentReceipt,
  TrajectoryJournalEvent,
  TrajectoryProjectionInputs,
  TrajectoryProofClaimView,
  TrajectoryProofEvent,
  TrajectoryProofPort,
  TrajectoryPromotionFact,
  TrajectoryReasoningEvent,
  TrajectoryReasoningFrontier,
  TrajectoryReasoningPort,
  TrajectoryWorkPort,
  TrajectoryWorkspacePort,
  TrajectoryWorldBasis,
} from "./ports.js";

export {
  buildProjectTrajectory,
  traceAttempt,
  traceIntentRevision,
  trajectoryAsOf,
  trajectoryRootIdOf,
  TrajectoryRefusal,
  validateWorkHistory,
} from "./projection.js";
export type {
  AsOfCut,
  BuildTrajectoryOptions,
  CurrentnessClassification,
  SourceCoverageEntry,
  TrajectoryConflict,
  TrajectoryProjection,
  UnresolvedReference,
} from "./projection.js";

export { buildTrajectoryReadModel, classifyCurrentness } from "./currentness.js";
export type { CurrentnessVerdict, OwnerCurrentnessInput, TrajectoryReadModel } from "./currentness.js";
