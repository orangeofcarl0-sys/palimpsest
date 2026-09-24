/**
 * PLMP-LEAN-1 §D3-a — the project-world capability barrel.
 *
 *     capture basis  ≺  mutation authority
 *
 * D3-0 froze the vocabulary; this plane is where it first meets a real world. It owns exactly two
 * things and refuses the third:
 *
 *   an APPEND-ONCE store of an attempt's basis   (provenance is immutable)
 *   an EXACT-CURRENTNESS runtime                 (CURRENT / STALE / UNKNOWN, and nothing more)
 *
 * and it deliberately does NOT own a compatibility solver. `COMPATIBLE` requires proving something
 * about a change, which is D3-b; a slice that inferred it here would manufacture the evidence D3-0
 * spent its whole vocabulary refusing to fake.
 *
 * Layer: L2, beside `project_verification/`.
 */
export {
  SqliteAttemptWorldBasisStore,
  type AttemptWorldBasisStore,
  type CaptureOutcome,
  type CapturedWorldBasis,
} from "./basis_store.js";
export {
  REPOSITORY_SOURCE,
  deriveWorkDependency,
  semanticProjectionDigestOf,
} from "./dependency.js";
export {
  ProjectWorldBasisError,
  basisFromKnownWorld,
  legacyD2BasisForAssessment,
  makeProjectWorldBasisRuntime,
  type BasisCaptureResult,
  type CurrentnessRuntimeAssessment,
  type ProjectWorldBasisRuntime,
  type ProjectWorldObservationPort,
} from "./runtime.js";
export {
  COVERAGE_EVIDENCE,
  covered,
  materializeWorldChangeFootprint,
  noChanges,
  provenComplete,
  resultFootprints,
  sourceChangeFootprintFromPaths,
  unproven,
  wholeRepositoryRead,
  worldChangeFootprintDigest,
  type CoveredFootprint,
  type CoverageEvidence,
  type FootprintCoverage,
  type ResultFootprints,
  type WorldChangeFootprint,
} from "./footprint.js";
export {
  COMPATIBILITY_OUTCOMES,
  DIRECT_COMPATIBILITY_POLICY_VERSION,
  assessmentStillAppliesTo,
  assessCompatibility,
  type AssessCompatibilityInput,
  type CompatibilityAssessment,
  type CompatibilityOutcome,
  type CompatibilityUnknown,
  type ConflictWitness,
  type DisjointnessProof,
} from "./compatibility.js";
export {
  OBSERVATION_DOMAINS,
  changePremises,
  dependencyPremises,
  domainsOf,
  materializePremiseSet,
  observedPremise,
  premiseObservationDigest,
  unavailablePremise,
  type ObservationDomain,
  type ObservationProvenance,
  type ObservationScope,
  type PremiseObservation,
  type PremiseSet,
} from "./observation.js";
export {
  makeCompatibilityIssuer,
  premiseSetDigestOf,
  type CompatibilityIssuer,
  type IssuedCompatibilityAssessment,
  type PremiseReferences,
} from "./issuance.js";
export {
  CROSS_BASIS_ADMISSION_STATES,
  admitCrossBasis,
  type CrossBasisAdmissionResult,
  type CrossBasisAdmissionState,
} from "./admission.js";
export {
  makeCrossBasisAdmissionRuntime,
  targetWorldObservationDigest,
  unobservedDependency,
  type CrossBasisAdmissionRuntime,
} from "./cross_basis.js";
export {
  RESULT_DERIVATION_KINDS,
  derivedResultManifestDigest,
  materializeDerivedResultCandidate,
  materializeResultDerivation,
  resultDerivationIdOf,
  type DerivedResultCandidate,
  type ResultDerivation,
  type ResultDerivationKind,
} from "./derivation.js";
export {
  REMATERIALIZATION_STATES,
  makeRematerializationRuntime,
  type RematerializationOutcome,
  type RematerializationResult,
  type RematerializationRuntime,
  type RematerializationState,
  type RematerializationDelta,
  type ResultRematerializerPort,
} from "./rematerialization.js";
export {
  SqliteDerivedResultCandidateStore,
  type DerivedResultCandidateStore,
} from "./candidate_store.js";
export {
  COMPOSITION_ORDER_AUTHORITY,
  SUCCESSION_STATES,
  assessSuccession,
  type SuccessionAssessment,
  type SuccessionState,
} from "./serialization.js";
