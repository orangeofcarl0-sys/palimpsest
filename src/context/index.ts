/** Context Compiler: C2 structured compressor (PLMP-CTX-1) + requirement compiler (PLMP-CTX-2). */

export { compileContextBrief, CONTEXT_BRIEF_ORGAN } from "./compressor.js";
export type {
  ContextBrief,
  ContextBriefInput,
  ContextClaimInput,
  ContextConflict,
  ContextEvidenceFactInput,
  ContextFact,
  ContextInterpretation,
  ContextInterpretationInput,
} from "./compressor.js";
export { compileContextRequirement } from "./requirement.js";
export type { ContextRequirement, ContextRequirementInput } from "./requirement.js";
export {
  assessCoverage,
  buildContextManifest,
  CONTEXT_RETRIEVAL_METHOD,
  COVERAGE_RECOMMENDATION_THRESHOLD,
} from "./manifest.js";
export type {
  ContextManifest,
  ContextManifestInput,
  CoverageAssessment,
} from "./manifest.js";
