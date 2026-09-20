/**
 * SR-1 R0 — the architecture audit toolkit's public surface.
 *
 * Deliberately a small explicit barrel over four typed modules; there is no registry, no
 * service locator and no dynamic discovery anywhere in this tool (§12/§33).
 */

export {
  analyseModuleArchitecture,
  codeForExtraction,
  exportSurfaceOf,
  listSourceFiles,
  maskNonSpecifierLiterals,
  moduleSpecifiersOf,
  resolveSpecifier,
  stripComments,
  stronglyConnectedComponents,
} from "./graph.js";
export type { DirectoryEdge, LayerEdge, ModuleArchitecture, ModuleNode, StronglyConnectedComponent } from "./graph.js";
export { LOGICAL_LAYERS, forbiddenEdgeRule, isAllowedEdge, layerOf } from "./layers.js";
export type { LogicalLayer } from "./layers.js";
export { ARCHITECTURE_BASELINE_VERSION, baselineFrom, checkArchitecture, cycleLayers } from "./rules.js";
export { BASELINE_CYCLE_REASONS, BASELINE_EDGE_REASONS } from "./baseline-reasons.js";
export type { ArchitectureBaseline, ArchitectureCheckResult, ArchitectureViolation } from "./rules.js";
export { renderBaselineDocument, renderCheckSummary, toJson } from "./report.js";
export { checkPublicApiParity, collectPublicApi } from "./public-api.js";
export type { ExportKind, PublicApiBaseline, PublicApiParityResult, PublicApiSurface } from "./public-api.js";
export {
  REVIEWED_ROUTE_ADDITIONS,
  REVIEWED_TOOL_ADDITIONS,
  REVIEWED_TOOL_CONTRACT_CHANGES,
  canonicalJson,
  captureApplicationParity,
  compareParity,
  toolContractDigest,
} from "./application_parity.js";
export type { ParityCapture, ParityDifference, ParityInstallation, ParityRouteEntry, ParityToolEntry } from "./application_parity.js";
