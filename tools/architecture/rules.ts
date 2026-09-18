/**
 * SR-1 §10, repaired by SR-1C §4-§6 — dependency-rule enforcement.
 *
 * The rule is **explicit concrete exceptions + no-new-violations**. An exception names ONE
 * import edge `(fromFile → toFile)`; it is never a layer-pair class. Recording `L2->L3` would
 * let the four historical upward imports become five or twenty while the check still passed,
 * which is precisely what "explicit exceptions" forbids. Layer-pair aggregation survives for
 * REPORTING only.
 */

import type { ModuleArchitecture, StronglyConnectedComponent } from "./graph.js";
import { forbiddenEdgeRule } from "./layers.js";

/** Bumped by SR-1C §6: the exception unit changed from a layer pair to a concrete edge. */
export const ARCHITECTURE_BASELINE_VERSION = 2;

/** ONE permitted forbidden IMPORT EDGE — a concrete file pair with a written reason. */
export interface PermittedForbiddenEdge {
  readonly from: string;
  readonly to: string;
  readonly fromLayer: string;
  readonly toLayer: string;
  readonly reason: string;
}

export interface ArchitectureBaseline {
  readonly version: number;
  /** The commit/tree the exceptions were captured from. Informational only. */
  readonly capturedFrom: string;
  /** Enumerated permitted-for-now forbidden import edges. No wildcards of any kind. */
  readonly permittedForbiddenEdges: readonly PermittedForbiddenEdge[];
  /** Enumerated permitted-for-now strongly connected components (exact file sets). */
  readonly permittedCycles: readonly { readonly files: readonly string[]; readonly reason: string }[];
  /** Modules that are allowed to have an unresolved relative import (should normally be empty). */
  readonly permittedUnresolvedImports: readonly string[];
}

export interface ArchitectureViolation {
  readonly kind: "forbidden_import" | "new_cycle" | "unresolved_import";
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
  /** Layer-pair summary of the forbidden edges seen, for REPORTING only (SR-1C §5). */
  readonly forbiddenLayerClasses: readonly { readonly layerPair: string; readonly count: number; readonly permitted: number }[];
}

const importKeyOf = (edge: { readonly from: string; readonly to: string }): string => `${edge.from}\u0000${edge.to}`;
const cycleKeyOf = (files: readonly string[]): string => [...files].sort().join("|");

/** The layer pairs of a cycle, used to report WHY a cycle is interesting. */
export function cycleLayers(architecture: ModuleArchitecture, cycle: StronglyConnectedComponent): readonly string[] {
  const byFile = new Map(architecture.modules.map((node) => [node.file, node]));
  return [...new Set(cycle.files.map((file) => byFile.get(file)?.layer ?? "?"))].sort();
}

/**
 * Compare the current graph against the recorded baseline.
 *
 * A forbidden import is accepted only when the EXACT `(from, to)` pair is recorded. Any cycle
 * whose exact file set is not recorded fails — including a recorded cycle that merely gained a
 * file, because then its file set is different.
 */
export function checkArchitecture(
  architecture: ModuleArchitecture,
  baseline: ArchitectureBaseline,
): ArchitectureCheckResult {
  const violations: ArchitectureViolation[] = [];
  const accepted: ArchitectureViolation[] = [];

  const permittedImports = new Map(baseline.permittedForbiddenEdges.map((entry) => [importKeyOf(entry), entry.reason]));
  const permittedCycles = new Map(baseline.permittedCycles.map((entry) => [cycleKeyOf(entry.files), entry.reason]));

  for (const edge of architecture.forbiddenImports) {
    const key = importKeyOf(edge);
    const detail = `${forbiddenEdgeRule(edge.fromLayer as never, edge.toLayer as never)} — ${edge.from} → ${edge.to}`;
    const entry = { kind: "forbidden_import" as const, detail, files: [edge.from, edge.to] };
    if (permittedImports.has(key)) accepted.push(entry);
    else violations.push(entry);
  }

  for (const cycle of architecture.stronglyConnectedComponents) {
    const key = cycleKeyOf(cycle.files);
    const layers = cycleLayers(architecture, cycle);
    const detail = `cycle of ${cycle.size} (${layers.join("/")}): ${cycle.files.slice(0, 4).join(", ")}${cycle.size > 4 ? ", …" : ""}`;
    const entry = { kind: "new_cycle" as const, detail, files: cycle.files };
    if (permittedCycles.has(key)) accepted.push(entry);
    else violations.push(entry);
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
    ...baseline.permittedForbiddenEdges
      .filter((entry) => entry.reason.startsWith("historical edge"))
      .map((entry) => `edge ${entry.from} → ${entry.to}`),
    ...baseline.permittedCycles
      .filter((entry) => entry.reason.startsWith("cycle accepted"))
      .map((entry) => `cycle ${cycleKeyOf(entry.files)}`),
  ];

  const classCounts = new Map<string, { count: number; permitted: number }>();
  for (const edge of architecture.forbiddenImports) {
    const pair = `${edge.fromLayer}->${edge.toLayer}`;
    const bucket = classCounts.get(pair) ?? { count: 0, permitted: 0 };
    bucket.count += 1;
    if (permittedImports.has(importKeyOf(edge))) bucket.permitted += 1;
    classCounts.set(pair, bucket);
  }

  return {
    ok: violations.length === 0,
    violations,
    accepted,
    unreasonedExceptions,
    forbiddenLayerClasses: [...classCounts.entries()]
      .map(([layerPair, value]) => ({ layerPair, ...value }))
      .sort((a, b) => a.layerPair.localeCompare(b.layerPair)),
  };
}

/** Build a baseline from an observed graph, recording every current forbidden edge explicitly. */
export function baselineFrom(
  architecture: ModuleArchitecture,
  options: {
    readonly capturedFrom: string;
    /** Reasons keyed by `fromFile -> toFile`. */
    readonly edgeReasons?: ReadonlyMap<string, string>;
    readonly cycleReasons?: ReadonlyMap<string, string>;
  },
): ArchitectureBaseline {
  const seen = new Set<string>();
  const permittedForbiddenEdges: PermittedForbiddenEdge[] = [];
  for (const edge of architecture.forbiddenImports) {
    const key = `${edge.from} -> ${edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    permittedForbiddenEdges.push({
      from: edge.from,
      to: edge.to,
      fromLayer: edge.fromLayer,
      toLayer: edge.toLayer,
      reason:
        options.edgeReasons?.get(key) ??
        "historical edge accepted at the SR-1 baseline; see MODULE-ARCHITECTURE-BASELINE.md",
    });
  }
  return {
    version: ARCHITECTURE_BASELINE_VERSION,
    capturedFrom: options.capturedFrom,
    permittedForbiddenEdges,
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
