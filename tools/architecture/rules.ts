/**
 * SR-1 §10 — dependency-rule enforcement.
 *
 * The rule is **explicit baseline exceptions + no-new-violations**, never a wildcard
 * allowlist: whatever the repository does today is recorded as an enumerated exception
 * with a reason, and the check fails only when the set of violations GROWS or an
 * unrecorded strongly-connected component appears.
 */

import type { LayerEdge, ModuleArchitecture, StronglyConnectedComponent } from "./graph.js";
import { forbiddenEdgeRule } from "./layers.js";

export const ARCHITECTURE_BASELINE_VERSION = 1;

export interface ArchitectureBaseline {
  readonly version: number;
  /** The commit/tree the exceptions were captured from. Informational only. */
  readonly capturedFrom: string;
  /**
   * Enumerated permitted-for-now forbidden layer edges, keyed `Lx->Ly`. Every entry has a
   * reason; there are no wildcards and no "allow everything from X" forms.
   */
  readonly permittedForbiddenLayerEdges: readonly { readonly edge: string; readonly reason: string }[];
  /** Enumerated permitted-for-now strongly connected components (exact file sets). */
  readonly permittedCycles: readonly { readonly files: readonly string[]; readonly reason: string }[];
  /** Modules that are allowed to have an unresolved relative import (should normally be empty). */
  readonly permittedUnresolvedImports: readonly string[];
}

export interface ArchitectureViolation {
  readonly kind: "forbidden_layer_edge" | "new_cycle" | "unresolved_import";
  readonly detail: string;
  readonly files: readonly string[];
}

export interface ArchitectureCheckResult {
  readonly ok: boolean;
  readonly violations: readonly ArchitectureViolation[];
  /** Violations present in the baseline too — reported, never hidden, not fatal. */
  readonly accepted: readonly ArchitectureViolation[];
  /** Accepted exceptions whose recorded reason is still the generic placeholder. */
  readonly unreasonedExceptions: readonly string[];
}

const edgeKeyOf = (edge: { readonly fromLayer: string; readonly toLayer: string }): string => `${edge.fromLayer}->${edge.toLayer}`;

const cycleKeyOf = (files: readonly string[]): string => [...files].sort().join("|");

/** The layer pairs of a cycle, used to report WHY a cycle is interesting. */
export function cycleLayers(architecture: ModuleArchitecture, cycle: StronglyConnectedComponent): readonly string[] {
  const byFile = new Map(architecture.modules.map((node) => [node.file, node]));
  return [...new Set(cycle.files.map((file) => byFile.get(file)?.layer ?? "?"))].sort();
}

/**
 * Compare the current graph against the recorded baseline.
 *
 * A cycle is a violation when it is NEW and it either spans more than one logical layer or
 * contains a forbidden layer edge. Cycles entirely inside one layer are reported by the
 * baseline document but do not fail the check — collapsing them is a different (deferred)
 * refactor, and §10 wants NEW forbidden structure caught, not every historical tangle.
 */
export function checkArchitecture(
  architecture: ModuleArchitecture,
  baseline: ArchitectureBaseline,
): ArchitectureCheckResult {
  const violations: ArchitectureViolation[] = [];
  const accepted: ArchitectureViolation[] = [];

  const permittedEdges = new Map(baseline.permittedForbiddenLayerEdges.map((entry) => [entry.edge, entry.reason]));
  const permittedCycles = new Map(baseline.permittedCycles.map((entry) => [cycleKeyOf(entry.files), entry.reason]));

  for (const edge of architecture.forbiddenEdges) {
    const key = edgeKeyOf(edge);
    const detail = `${forbiddenEdgeRule(edge.fromLayer, edge.toLayer)} — ${edge.count} import(s), e.g. ${exampleOf(architecture, edge)}`;
    if (permittedEdges.has(key)) accepted.push({ kind: "forbidden_layer_edge", detail: `${key}: ${detail}`, files: [exampleOf(architecture, edge)] });
    else violations.push({ kind: "forbidden_layer_edge", detail, files: [exampleOf(architecture, edge)] });
  }

  for (const cycle of architecture.stronglyConnectedComponents) {
    const key = cycleKeyOf(cycle.files);
    const layers = cycleLayers(architecture, cycle);
    const detail = `cycle of ${cycle.size} (${layers.join("/")}): ${cycle.files.slice(0, 4).join(", ")}${cycle.size > 4 ? ", …" : ""}`;
    // A cycle the baseline records is accepted and reported. ANY new cycle fails: a
    // single-layer cycle is still new structure, and §38 requires "new forbidden edges = 0".
    if (permittedCycles.has(key)) accepted.push({ kind: "new_cycle", detail, files: cycle.files });
    else violations.push({ kind: "new_cycle", detail, files: cycle.files });
  }

  const permittedUnresolved = new Set(baseline.permittedUnresolvedImports);
  for (const node of architecture.modules) {
    if (node.unresolvedImports.length === 0) continue;
    if (permittedUnresolved.has(node.file)) continue;
    violations.push({
      kind: "unresolved_import",
      detail: `${node.file} imports ${node.unresolvedImports.join(", ")} which does not resolve to a source file`,
      files: [node.file],
    });
  }

  const unreasonedExceptions = [
    ...baseline.permittedForbiddenLayerEdges.filter((entry) => entry.reason.startsWith("historical edge")).map((entry) => `edge ${entry.edge}`),
    ...baseline.permittedCycles.filter((entry) => entry.reason.startsWith("cycle accepted")).map((entry) => `cycle ${cycleKeyOf(entry.files)}`),
  ];

  return { ok: violations.length === 0, violations, accepted, unreasonedExceptions };
}

function exampleOf(architecture: ModuleArchitecture, edge: LayerEdge): string {
  for (const node of architecture.modules) {
    if (node.layer !== edge.fromLayer) continue;
    for (const target of node.imports) {
      const other = architecture.modules.find((candidate) => candidate.file === target);
      if (other?.layer === edge.toLayer) return `${node.file} → ${target}`;
    }
  }
  return "unknown";
}

/** Build a baseline from an observed graph, recording every current violation explicitly. */
export function baselineFrom(
  architecture: ModuleArchitecture,
  options: {
    readonly capturedFrom: string;
    readonly edgeReasons?: ReadonlyMap<string, string>;
    readonly cycleReasons?: ReadonlyMap<string, string>;
  },
): ArchitectureBaseline {
  const seen = new Set<string>();
  const permittedForbiddenLayerEdges: { edge: string; reason: string }[] = [];
  for (const edge of architecture.forbiddenEdges) {
    const key = edgeKeyOf(edge);
    if (seen.has(key)) continue;
    seen.add(key);
    permittedForbiddenLayerEdges.push({
      edge: key,
      reason: options.edgeReasons?.get(key) ?? "historical edge accepted at the SR-1 baseline; see MODULE-ARCHITECTURE-BASELINE.md",
    });
  }
  return {
    version: ARCHITECTURE_BASELINE_VERSION,
    capturedFrom: options.capturedFrom,
    permittedForbiddenLayerEdges,
    permittedCycles: architecture.stronglyConnectedComponents.map((cycle) => ({
      files: cycle.files,
      reason:
        options.cycleReasons?.get(cycleKeyOf(cycle.files)) ??
        (cycle.files.length === 1
          ? "single-module self-import (reported for visibility)"
          : "single-layer cycle accepted at the SR-1 baseline; see MODULE-ARCHITECTURE-BASELINE.md"),
    })),
    permittedUnresolvedImports: [],
  };
}
