/** PLMP-ARCH (18 号规格): the three architecture modes' shared proposal face. */

export {
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
