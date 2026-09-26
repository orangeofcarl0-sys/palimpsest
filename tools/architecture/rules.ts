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
/**
 * SR-2 §七: v3 adds the TREE identity beside the commit.
 *
 * A PR squash rewrites the commit SHA but not the source tree, so the commit alone cannot
 * answer "was this baseline captured from the code I am looking at?". The tree CAN, which is
 * what makes it the checkable half of the pair. `capturedFrom` also stops being `unknown`:
 * it was read from `.git/HEAD`, which is a FILE in a linked worktree (not a directory), so
 * every worktree-based capture silently recorded `unknown`.
 */
/**
 * SR-2e (§21/§22/§23) — v4 adds three constraints the layer model is too coarse to express, each
 * as DATA so a reviewer reads the rule rather than inferring it from code:
 *
 *   §21  CONCRETE dependency firewalls — "src/continuation/** must not import src/state/**". The
 *        layer map cannot say this: `state` and `continuation` are both legal targets of each
 *        other's layers in general, and only the CONCRETE pair is wrong.
 *   §22  HOTSPOT ratchets — a known hotspot may not silently grow again. Recorded as a measured
 *        ceiling per file, not as a global "every file < N lines" rule.
 *   §23  CONCRETE importer allowlists — which modules may name a given concrete module at all.
 *        This is the one that keeps a future E plane from reaching into the kernel: it must fail
 *        on the IMPORT, not on a downstream symptom.
 *
 * All three are DENY-BY-DEFAULT with EXPLICIT exceptions, matching the established idiom: a
 * firewall names paths, and every allowance is a concrete edge with a written reason.
 */
export const ARCHITECTURE_BASELINE_VERSION = 4;

/**
 * §21 — a concrete dependency firewall: no module matching `from` may import one matching `to`.
 *
 * Prefixes, because a firewall is about a BOUNDARY rather than a file. The exclusions are
 * concrete paths with written reasons, never a blanket "this layer may".
 */
export interface DependencyFirewall {
  readonly id: string;
  readonly from: readonly string[];
  readonly to: readonly string[];
  readonly reason: string;
  /** Concrete exceptions, each with its own reason. Empty for a rule that must hold absolutely. */
  readonly exclusions: readonly { readonly from: string; readonly to: string; readonly reason: string }[];
}

/**
 * §22 — a hotspot ratchet: the file may not exceed the recorded size/dependency counts.
 *
 * `null` means "not ratcheted on this dimension" — deliberately explicit rather than 0, which
 * would read as a real ceiling.
 */
export interface HotspotRatchet {
  readonly file: string;
  readonly maxLoc: number | null;
  readonly maxFanOut: number | null;
  readonly maxFanIn: number | null;
  readonly reason: string;
}

/**
 * §23 — a concrete importer allowlist: the named module may be imported ONLY by these prefixes.
 *
 * The strongest of the three, and the one the ruling singled out for the E plane: a new semantic
 * module must fail on the import itself.
 */
export interface ImporterAllowlist {
  readonly module: string;
  readonly allowedImporters: readonly string[];
  readonly reason: string;
}

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
  /**
   * The commit the exceptions were captured from. Informational only — a squash changes it
   * without changing the code.
   */
  readonly capturedFrom: string;
  /**
   * SR-2 §七: the SOURCE TREE the exceptions were captured from. This is the checkable
   * identity: it survives a squash, so "is this baseline still about this code?" is a real
   * question with a real answer. Absent on v2 baselines (which recorded neither).
   */
  readonly capturedTree?: string;
  /** Enumerated permitted-for-now forbidden import edges. No wildcards of any kind. */
  readonly permittedForbiddenEdges: readonly PermittedForbiddenEdge[];
  /** Enumerated permitted-for-now strongly connected components (exact file sets). */
  readonly permittedCycles: readonly { readonly files: readonly string[]; readonly reason: string }[];
  /** Modules that are allowed to have an unresolved relative import (should normally be empty). */
  readonly permittedUnresolvedImports: readonly string[];
  /** §21: concrete firewalls. DATA, so the rule is reviewable rather than inferred. */
  readonly dependencyFirewalls?: readonly DependencyFirewall[] | undefined;
  /** §22: hotspot ratchets, measured after SR-2. */
  readonly hotspotRatchets?: readonly HotspotRatchet[] | undefined;
  /** §23: concrete importer allowlists. */
  readonly importerAllowlists?: readonly ImporterAllowlist[] | undefined;
}

export interface ArchitectureViolation {
  readonly kind:
    | "forbidden_import"
    | "new_cycle"
    | "unresolved_import"
    | "unclassified_module"
    | "firewall_breach"
    | "hotspot_growth"
    | "importer_not_allowed";
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

  /**
   * SR-2 §五: an unclassified module fails FIRST and is NOT whitelistable.
   *
   * This is deliberately not an entry in the baseline schema: the baseline records which
   * KNOWN violations are tolerated for now, and "nobody classified this directory" is not a
   * tolerated violation — it is a missing decision. Adding a `permittedUnclassified` list
   * would rebuild the very escape hatch this rule removes.
   */
  for (const node of architecture.modules) {
    if (node.layer !== "UNCLASSIFIED") continue;
    violations.push({
      kind: "unclassified_module",
      detail: `${node.file} is not classified in the architecture map — add it to DIRECTORY_LAYERS (or a FILE_LAYER_OVERRIDES entry) with a written reason; an unclassified module is refused rather than granted the widest dependency set`,
      files: [node.file],
    });
  }

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

  /**
   * §21 — CONCRETE DEPENDENCY FIREWALLS.
   *
   * The layer model cannot express "src/continuation/** must not import src/state/**": both
   * modules' LAYERS permit the edge in general, and only the concrete pair is wrong. A firewall
   * names the two path families and lists its allowances as concrete edges with reasons.
   */
  for (const firewall of baseline.dependencyFirewalls ?? []) {
    const matchedFrom = (file: string): boolean => firewall.from.some((prefix) => file.startsWith(prefix));
    const matchedTo = (file: string): boolean => firewall.to.some((prefix) => file.startsWith(prefix));
    const excluded = (from: string, to: string): boolean =>
      firewall.exclusions.some((exception) => exception.from === from && exception.to === to);
    for (const node of architecture.modules) {
      if (!matchedFrom(node.file)) continue;
      for (const target of node.imports) {
        if (!matchedTo(target)) continue;
        if (excluded(node.file, target)) continue;
        violations.push({
          kind: "firewall_breach",
          detail: `[${firewall.id}] ${node.file} imports ${target}, which this firewall forbids — ${firewall.reason}`,
          files: [node.file, target],
        });
      }
    }
  }

  /**
   * §22 — HOTSPOT RATCHETS.
   *
   * A known hotspot may not silently grow again. The rule is per-FILE and measured, never a global
   * "every file is under N lines": a mechanical size rule would be met by splitting a coherent
   * module, which is exactly the "increase packaging, decrease knowledge" degeneration SR-2
   * refuses. A `null` dimension means "not ratcheted on this axis", and it is spelled out so it
   * cannot be misread as a ceiling of zero.
   */
  for (const ratchet of baseline.hotspotRatchets ?? []) {
    const node = architecture.modules.find((module) => module.file === ratchet.file);
    if (node === undefined) {
      // A ratchet for a module that no longer exists is stale, not satisfied.
      violations.push({
        kind: "hotspot_growth",
        detail: `[ratchet] ${ratchet.file} is ratcheted but no longer exists — remove the ratchet rather than leaving a rule that checks nothing`,
        files: [ratchet.file],
      });
      continue;
    }
    const checks: readonly (readonly [string, number | null, number])[] = [
      ["LOC", ratchet.maxLoc, node.loc],
      ["fanOut", ratchet.maxFanOut, node.fanOut],
      ["fanIn", ratchet.maxFanIn, node.fanIn],
    ];
    for (const [dimension, ceiling, actual] of checks) {
      if (ceiling === null) continue;
      if (actual <= ceiling) continue;
      violations.push({
        kind: "hotspot_growth",
        detail: `[ratchet] ${ratchet.file} ${dimension} grew to ${String(actual)}, above its recorded ceiling ${String(ceiling)} — ${ratchet.reason}`,
        files: [ratchet.file],
      });
    }
  }

  /**
   * §23 — CONCRETE IMPORTER ALLOWLISTS.
   *
   * The strongest constraint, and the one the ruling named for the future E plane: a new semantic
   * module must fail on the IMPORT itself, not on a symptom three layers away. Prefixes, so an
   * allowlist covers a family (all of `src/composition/`), and every entry carries a reason at the
   * rule level.
   */
  for (const allowlist of baseline.importerAllowlists ?? []) {
    for (const node of architecture.modules) {
      if (node.file === allowlist.module) continue;
      if (!node.imports.includes(allowlist.module)) continue;
      if (allowlist.allowedImporters.some((prefix) => node.file.startsWith(prefix))) continue;
      violations.push({
        kind: "importer_not_allowed",
        detail: `${node.file} imports ${allowlist.module}, which only these importers may name: ${allowlist.allowedImporters.join(", ")} — ${allowlist.reason}`,
        files: [node.file, allowlist.module],
      });
    }
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
    readonly capturedTree?: string | undefined;
    /** §21: the declared firewalls, supplied from the code-level table. */
    readonly firewalls?: readonly DependencyFirewall[] | undefined;
    /** §22: the measured ratchets, supplied from the code-level table. */
    readonly ratchets?: readonly HotspotRatchet[] | undefined;
    /** §23: the declared importer allowlists, supplied from the code-level table. */
    readonly allowlists?: readonly ImporterAllowlist[] | undefined;
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
    ...(options.capturedTree === undefined ? {} : { capturedTree: options.capturedTree }),
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
    // §21/§22/§23: these are DECLARED rules rather than observed exceptions, so they are supplied
    // from the code-level tables (below) and never inferred from the graph — a firewall derived
    // from the current edges would permit exactly what it found.
    ...(options.firewalls === undefined ? {} : { dependencyFirewalls: options.firewalls }),
    ...(options.ratchets === undefined ? {} : { hotspotRatchets: options.ratchets }),
    ...(options.allowlists === undefined ? {} : { importerAllowlists: options.allowlists }),
  };
}
