/** PLMP-ARCH (18 号规格): the three architecture modes' shared proposal face. */

export {
  parseProjectProposal,
  pipelinePreset,
  proposalTaskSpecs,
  validateProjectProposal,
} from "./proposal.js";
export type {
  PipelineStageInput,
  ProjectProposal,
  ProposalDiagnostic,
  ProposalDiagnosticType,
  TaskProposal,
} from "./proposal.js";

/** PLMP-ARCH-3 (20 号规格): the preset library - researched systems as topology prototypes. */

export { PRESETS, presetDraft, presetMeta } from "./presets.js";
export type { PresetEntry, PresetMeta, PresetParamField } from "./presets.js";

/**
 * G10-C0: minimal Architecture identity (PLMP-UAS-1 implementation
 * realization — identity only, no agent-side semantics, no Work relation,
 * no persistence). Independent of Binding and of Work compilation.
 */

export {
  ARCHITECTURE_DIGEST_DOMAIN,
  architectureDefinitionDigestContent,
  computeArchitectureDefinitionDigest,
  materializeArchitectureDefinition,
  parseArchitectureDefinition,
  ArchitectureDefinitionParseError,
} from "./definition.js";
export type {
  AgentDefinition,
  AgentDefinitionId,
  ArchitectureDefinition,
  ArchitectureDefinitionId,
  ArchitectureDigest,
  ArchitectureRevision,
} from "./definition.js";
