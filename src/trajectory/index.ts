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

/**
 * Trajectory-V0 §3/§4 (V0-A/V0-B) — execution identity, the Attempt→Session binding contract, and
 * the narrow read-only DSH session port. Distinct from T0's Project Evolution projection: this is
 * the EXECUTION view, and it never mints a Work, host or DSH identity.
 *
 * Trajectory-V0S §5/§9 — the binding contract now separates THREE facts V0 conflated: host
 * observation provenance, session binding and session read admission. A read is admitted to an
 * attempt only under a verified binding, and every returned event carries its durability class.
 */
export {
  ATTEMPT_ADMISSION_REFUSAL_CODES,
  AttemptAdmissionRefusal,
  BINDING_SOURCES,
  classifyHostObservation,
  classifySessionBinding,
  DSH_EVENT_DURABILITY_STATES,
  DSH_PAGE_DOES_NOT_PROVE,
  DSH_PAGE_PROVES,
  DSH_READ_DEFAULT_PAGE,
  DSH_READ_MAX_PAGE,
  HOST_OBSERVATION_PROVENANCE_STATES,
  RECOGNIZED_DSH_EVENT_TYPES,
  sanitizeDshEvent,
  SESSION_BINDING_STATES,
  SESSION_READ_ADMISSION_STATES,
  SESSION_READ_STATES,
  trajectoryViewIdOf,
  validateReadRequest,
} from "./execution.js";
export type {
  AttemptAdmissionRefusalCode,
  AttemptExecutionBinding,
  BindingEvidenceRef,
  BindingSource,
  DshEventDurability,
  DshEventReference,
  DshEventView,
  DshSessionEventPage,
  DshSessionHeaderIdentity,
  DshSessionReadPort,
  DshSessionReadRequest,
  HostObservationProvenance,
  RecognizedDshEventType,
  SessionBindingState,
  SessionReadAdmission,
  SessionReadState,
} from "./execution.js";

/**
 * Trajectory-V0 §6/§10 (V0-D/V0-H) — the read-only Handoff Preview over both views.
 */
export {
  buildHandoffPreview,
  EVENT_PAGE_COVERAGE_STATES,
  HOST_LIFECYCLE_COVERAGE_STATES,
  PREVIEW_DOES_NOT_AUTHORIZE,
  PREVIEW_COMPLETENESS_STATES,
  previewCompletenessOf,
  PROCESS_LIFECYCLE_STATES,
  readOnlyViolations,
  SESSION_LIFECYCLE_STATES,
  sessionLifecycleOf,
} from "./handoff_preview.js";
export type {
  EventPageCoverage,
  HandoffPreview,
  HandoffPreviewInput,
  HostLifecycleCoverage,
  PreviewAttemptIdentity,
  PreviewAttribution,
  PreviewCanonicalFacts,
  PreviewCanonicalOutcome,
  PreviewCaveats,
  PreviewCompleteness,
  PreviewExecutionEvidence,
  PreviewHostObservationSummary,
  PreviewProjectContext,
  PreviewProjectEvolutionSummary,
  ProcessLifecycle,
  ReadOnlySnapshot,
  SessionLifecycle,
} from "./handoff_preview.js";

/**
 * Trajectory-H1 §8 (C4) — THE BINDING AUTHORITY CONTRACT. A caller's Session claim can never become a
 * verified binding: the claim classifier cannot return `BOUND_VERIFIED`, and the ONLY function that can
 * name a verified session takes its identity from producer-side association evidence.
 */
export {
  ASSOCIATION_OBSERVATION_STATES,
  ASSOCIATION_VERIFICATION_STATES,
  BINDING_RESOLUTION_REFUSAL_CODES,
  resolveVerifiedSessionBinding,
} from "./binding.js";
export type {
  AssociationObservationState,
  AssociationVerificationState,
  AttemptSessionAssociation,
  BindingResolutionRefusalCode,
  VerifiedSessionBindingResolution,
} from "./binding.js";

/**
 * Trajectory-H1 §7 (C3) — SESSION PAGE INTEGRITY. A structural validator over a returned DSH page:
 * coverage is a conclusion drawn only after the page's identity, counts, sequence positions and
 * watermark agree with one another. An INVALID page claims no coverage and admits no events.
 */
export {
  eventPageCoverageOfPage,
  PAGE_INTEGRITY_REASONS,
  PAGE_INTEGRITY_STATES,
  validateSessionEventPage,
} from "./page_integrity.js";
export type {
  PageIntegrityCheck,
  PageIntegrityReason,
  PageIntegrityState,
  PageIntegrityVerdict,
} from "./page_integrity.js";

/**
 * Trajectory-V0S §7 (S1-D) — the Attempt-scoped Work relation admission policy. A read-side selection
 * over a T0 projection: it can only remove relations, never add one, and it requires exact canonical
 * identity plus explicit owner evidence rather than a display label.
 */
export {
  QUARANTINED_T0_RELATIONS,
  SELECTED_T0_RELATIONS,
  selectAttemptWorkRelations,
} from "./relation_admission.js";
export type { AdmittedRelation, AttemptRelationContext, QuarantinedRelation } from "./relation_admission.js";
