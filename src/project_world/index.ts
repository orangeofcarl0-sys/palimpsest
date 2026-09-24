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
