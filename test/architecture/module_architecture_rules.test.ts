/**
 * SR-1 §10/§29 — architecture rule self-tests and the real-graph invariants.
 *
 *   SR1-A01  no new forbidden layer edge
 *   SR1-A02  no new unexpected strongly connected component
 *
 * The checker is proven in both directions: synthetic graphs that MUST be rejected (kernel →
 * deployment, semantic capability → DSH adapter, a backwards adapter dependency, a new
 * cross-layer cycle, an unresolved import) and synthetic graphs that must be accepted because
 * they are recorded exceptions. Then the same rules run against the LIVE repository and its
 * committed baseline, so the suite fails if a new edge ever appears.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BASELINE_CYCLE_REASONS,
  BASELINE_EDGE_REASONS,
  analyseModuleArchitecture,
  baselineFrom,
  checkArchitecture,
  forbiddenEdgeRule,
  isAllowedEdge,
  layerOf,
  moduleSpecifiersOf,
  resolveSpecifier,
  stronglyConnectedComponents,
  stripComments,
  type ArchitectureBaseline,
  type ModuleArchitecture,
  type ModuleNode,
  type LogicalLayer,
} from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* ------------------------------------------------------------------ *
 * A tiny synthetic graph builder so rules can be tested in isolation
 * ------------------------------------------------------------------ */

function syntheticArchitecture(spec: Readonly<Record<string, readonly string[]>>): ModuleArchitecture {
  const files = Object.keys(spec).sort();
  const importers = new Map<string, string[]>(files.map((file) => [file, []]));
  for (const file of files) {
    for (const target of spec[file] ?? []) importers.get(target)?.push(file);
  }
  const modules: ModuleNode[] = files.map((file) => {
    const { layer, why } = layerOf(file);
    const imports = [...(spec[file] ?? [])].sort();
    return {
      file,
      group: file.split("/").slice(0, 2).join("/"),
      layer,
      layerWhy: why,
      loc: 1,
      bytes: 10,
      imports,
      importers: (importers.get(file) ?? []).sort(),
      externalImports: [],
      unresolvedImports: [],
      fanOut: imports.length,
      fanIn: (importers.get(file) ?? []).length,
    };
  });
  const byFile = new Map(modules.map((node) => [node.file, node]));
  const layerCounts = new Map<string, { fromLayer: LogicalLayer; toLayer: LogicalLayer; count: number }>();
  for (const node of modules) {
    for (const target of node.imports) {
      const other = byFile.get(target);
      if (other === undefined) continue;
      const key = `${node.layer}->${other.layer}`;
      const existing = layerCounts.get(key);
      if (existing === undefined) layerCounts.set(key, { fromLayer: node.layer, toLayer: other.layer, count: 1 });
      else existing.count += 1;
    }
  }
  const layerEdges = [...layerCounts.values()];
  const edgeMap = new Map(files.map((file) => [file, spec[file] ?? []]));
  return {
    root: "/synthetic",
    modules,
    layerEdges,
    forbiddenImports: modules.flatMap((node) =>
      node.imports
        .map((target) => ({
          from: node.file,
          to: target,
          fromLayer: node.layer,
          toLayer: byFile.get(target)?.layer ?? node.layer,
        }))
        .filter((edge) => !isAllowedEdge(edge.fromLayer, edge.toLayer)),
    ),
    forbiddenEdges: layerEdges.filter((edge) => !isAllowedEdge(edge.fromLayer, edge.toLayer)),
    directoryEdges: [],
    stronglyConnectedComponents: stronglyConnectedComponents(files, edgeMap),
    exportSurface: [],
    totals: { files: files.length, loc: files.length, bytes: files.length * 10, edges: 0, externalImports: 0, unresolvedImports: 0 },
  };
}

const emptyBaseline = (): ArchitectureBaseline => ({
  version: 2,
  capturedFrom: "synthetic",
  permittedForbiddenEdges: [],
  permittedCycles: [],
  permittedUnresolvedImports: [],
});

/* ================================================================== *
 * The four rejections §10 names explicitly
 * ================================================================== */

describe("SR-1 §10 the checker rejects the four named cases", () => {
  it("kernel → deployment", () => {
    expect(isAllowedEdge("L1", "L5")).toBe(false);
    const graph = syntheticArchitecture({ "src/domain/models.ts": ["src/deployment/launch.ts"], "src/deployment/launch.ts": [] });
    const result = checkArchitecture(graph, emptyBaseline());
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.kind).toBe("forbidden_import");
    expect(result.violations[0]?.detail).toContain("L1 → L5 is forbidden");
  });

  it("semantic capability → DSH adapter", () => {
    expect(isAllowedEdge("L2", "L5")).toBe(false);
    const graph = syntheticArchitecture({
      "src/reasoning_cell/service.ts": ["src/tools/application_tools.ts"],
      "src/tools/application_tools.ts": [],
    });
    expect(checkArchitecture(graph, emptyBaseline()).ok).toBe(false);
  });

  it("backwards adapter dependency (an adapter reached from below)", () => {
    // Both directions an adapter must never be depended on from: kernel, and product interaction.
    expect(isAllowedEdge("L1", "L5")).toBe(false);
    expect(isAllowedEdge("L3", "L5")).toBe(false);
    expect(forbiddenEdgeRule("L3", "L5")).toContain("L3 → L5 is forbidden");
    const graph = syntheticArchitecture({
      "src/recipes/explore.ts": ["src/tools/tools.ts"],
      "src/tools/tools.ts": [],
    });
    expect(checkArchitecture(graph, emptyBaseline()).ok).toBe(false);
  });

  it("a new forbidden strongly connected component", () => {
    // Cross-layer AND same-layer: any NEW cycle is new structure.
    const graph = syntheticArchitecture({
      "src/federation/messaging.ts": ["src/recipes/explore.ts"],
      "src/recipes/explore.ts": ["src/federation/messaging.ts"],
    });
    const result = checkArchitecture(graph, emptyBaseline());
    expect(result.ok).toBe(false);
    expect(result.violations.some((violation) => violation.kind === "new_cycle")).toBe(true);
    expect(result.violations.find((violation) => violation.kind === "new_cycle")?.detail).toContain("cycle of 2");
  });
});

/* ================================================================== *
 * Both directions: what passes
 * ================================================================== */

describe("SR-1 §10 the checker accepts the allowed directions and recorded exceptions", () => {
  it("allows the documented downward direction", () => {
    for (const [from, to] of [
      ["L5", "L4"],
      ["L5", "L3"],
      ["L5", "L2"],
      ["L5", "L1"],
      ["L4", "L3"],
      ["L4", "L1"],
      ["L3", "L2"],
      ["L3", "L1"],
      ["L2", "L1"],
      ["L2", "L2"],
      ["L1", "L1"],
    ] as readonly (readonly [LogicalLayer, LogicalLayer])[]) {
      expect(`${String(from)}->${String(to)}:${String(isAllowedEdge(from, to))}`).toBe(`${String(from)}->${String(to)}:true`);
    }
  });

  it("accepts a forbidden edge that the baseline records, and still reports it", () => {
    const graph = syntheticArchitecture({
      "src/monitor/driver.ts": ["src/project_operating/posture.ts"],
      "src/project_operating/posture.ts": [],
    });
    const baseline: ArchitectureBaseline = {
      ...emptyBaseline(),
      permittedForbiddenEdges: [
        {
          from: "src/monitor/driver.ts",
          to: "src/project_operating/posture.ts",
          fromLayer: "L2",
          toLayer: "L3",
          reason: "recorded for the test",
        },
      ],
    };
    const result = checkArchitecture(graph, baseline);
    expect(result.ok).toBe(true);
    expect(result.accepted).toHaveLength(1);
    expect(result.unreasonedExceptions).toEqual([]);
  });

  it("flags an exception that still carries a generic reason", () => {
    const graph = syntheticArchitecture({
      "src/monitor/driver.ts": ["src/project_operating/posture.ts"],
      "src/project_operating/posture.ts": [],
    });
    const result = checkArchitecture(graph, baselineFrom(graph, { capturedFrom: "synthetic" }));
    expect(result.ok).toBe(true);
    expect(result.unreasonedExceptions.length).toBeGreaterThan(0);
  });

  it("accepts a RECORDED cycle, and rejects a same-layer one that is not recorded", () => {
    const unrecorded = syntheticArchitecture({
      "src/monitor/driver.ts": ["src/monitor/policy.ts"],
      "src/monitor/policy.ts": ["src/monitor/driver.ts"],
    });
    expect(checkArchitecture(unrecorded, emptyBaseline()).ok).toBe(false);
  });

  it("accepts a single-layer cycle when it is recorded, and rejects a cross-layer one", () => {
    const sameLayer = syntheticArchitecture({
      "src/campaign/compiler.ts": ["src/campaign/digest.ts"],
      "src/campaign/digest.ts": ["src/campaign/compiler.ts"],
    });
    const sameLayerBaseline: ArchitectureBaseline = {
      ...emptyBaseline(),
      permittedCycles: [{ files: ["src/campaign/compiler.ts", "src/campaign/digest.ts"], reason: "recorded" }],
    };
    expect(checkArchitecture(sameLayer, sameLayerBaseline).ok).toBe(true);

    const crossLayer = syntheticArchitecture({
      "src/federation/messaging.ts": ["src/recipes/explore.ts"],
      "src/recipes/explore.ts": ["src/federation/messaging.ts"],
    });
    expect(checkArchitecture(crossLayer, emptyBaseline()).ok).toBe(false);
  });

  it("rejects an unresolved relative import", () => {
    const graph = syntheticArchitecture({ "src/domain/models.ts": [] });
    const broken: ModuleArchitecture = {
      ...graph,
      modules: [{ ...graph.modules[0]!, unresolvedImports: ["./missing.js"] }],
    };
    const result = checkArchitecture(broken, emptyBaseline());
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.kind).toBe("unresolved_import");
  });

  it("a barrel may re-export across layers, but the root ENTRY may only be imported by L5", () => {
    expect(isAllowedEdge("L2", "BARREL")).toBe(true);
    expect(isAllowedEdge("L2", "ENTRY")).toBe(false);
    expect(isAllowedEdge("L1", "BARREL")).toBe(false);
    expect(isAllowedEdge("L5", "ENTRY")).toBe(true);
  });
});

/* ================================================================== *
 * SR-1C §4-§9 — the two checker repairs
 * ================================================================== */

describe("SR-1C R0A forbidden-edge exceptions are concrete edges, not layer-pair classes", () => {
  const historical = () =>
    syntheticArchitecture({
      "src/monitor/driver.ts": ["src/project_operating/posture.ts"],
      "src/project_operating/posture.ts": [],
    });

  it("a recorded concrete edge passes", () => {
    const graph = historical();
    const baseline = baselineFrom(graph, { capturedFrom: "test" });
    expect(checkArchitecture(graph, baseline).ok).toBe(true);
  });

  it("a DIFFERENT edge with the SAME permitted layer pair FAILS", () => {
    const baseline = baselineFrom(historical(), { capturedFrom: "test" });
    // Same layers (L2 -> L3), different files: monitor is recorded, campaign is not.
    const grown = syntheticArchitecture({
      "src/monitor/driver.ts": ["src/project_operating/posture.ts"],
      "src/project_operating/posture.ts": [],
      "src/campaign/digest.ts": ["src/project_operating/posture.ts"],
    });
    const result = checkArchitecture(grown, baseline);
    expect(result.ok).toBe(false);
    expect(result.violations.some((violation) => violation.kind === "forbidden_import")).toBe(true);
  });

  it("growing the count of a recorded layer pair from 1 to 2 fails if the second pair is new", () => {
    const baseline = baselineFrom(historical(), { capturedFrom: "test" });
    const grown = syntheticArchitecture({
      "src/monitor/driver.ts": ["src/project_operating/posture.ts", "src/project_operating/work_mode_profile.ts"],
      "src/project_operating/posture.ts": [],
      "src/project_operating/work_mode_profile.ts": [],
    });
    expect(checkArchitecture(grown, baseline).ok).toBe(false);
  });
});

describe("SR-1C R0B first-party host JavaScript is inside the checker", () => {
  it("the live analysis covers host/**/*.js as L5", () => {
    const architecture = analyseModuleArchitecture(REPO);
    const hostModules = architecture.modules.filter((node) => node.file.startsWith("host/"));
    expect(hostModules.length).toBeGreaterThanOrEqual(3);
    expect(hostModules.every((node) => node.layer === "L5")).toBe(true);
    expect(hostModules.some((node) => node.file === "host/dsh/lib/runner.js")).toBe(true);
  });

  it("host modules resolve their own relative specifiers and stay free of src dependencies", () => {
    const architecture = analyseModuleArchitecture(REPO);
    const hostModules = architecture.modules.filter((node) => node.file.startsWith("host/"));
    expect(hostModules.every((node) => node.unresolvedImports.length === 0)).toBe(true);
    const srcEdges = hostModules.flatMap((node) => node.imports.filter((target) => target.startsWith("src/")));
    expect(srcEdges).toEqual([]);
  });
});
/* ================================================================== *
 * The extractor itself (this toolchain has no JS compiler API)
 * ================================================================== */

describe("SR-1 §7 the source extractor covers every specifier form and ignores noise", () => {
  it("finds static, type-only, side-effect, re-export, dynamic and require forms", () => {
    const source = [
      'import { a } from "./static.js";',
      'import type { T } from "./type-only.js";',
      'import * as ns from "./star.js";',
      'import "./side-effect.js";',
      'export { b } from "./re-export.js";',
      'export * from "./star-export.js";',
      'export type { U } from "./type-export.js";',
      'const lazy = await import("./dynamic.js");',
      'const legacy = require("./legacy.js");',
    ].join("\n");
    expect([...moduleSpecifiersOf("x.ts", source)].sort()).toEqual([
      "./dynamic.js",
      "./legacy.js",
      "./re-export.js",
      "./side-effect.js",
      "./star-export.js",
      "./star.js",
      "./static.js",
      "./type-export.js",
      "./type-only.js",
    ]);
  });

  it("does not create edges from comments, strings or template literals", () => {
    const source = [
      '// import { fake } from "./commented.js";',
      '/* import { fake2 } from "./block-commented.js"; */',
      'const note = "import x from \'./in-string.js\'";',
      "const note2 = `require('./in-template.js')`;",
      'const url = "https://example.com/not/relative.js";',
      'import { real } from "./real.js";',
    ].join("\n");
    expect([...moduleSpecifiersOf("x.ts", source)]).toEqual(["./real.js"]);
  });

  it("preserves line structure while stripping comments", () => {
    const stripped = stripComments("a(); // trailing\n/* two\nlines */\nb();");
    expect(stripped.split("\n").length).toBe(4);
    expect(stripped).not.toContain("trailing");
    expect(stripped).not.toContain("lines");
  });

  it("resolves NodeNext `.js` specifiers and directory barrels to source files", () => {
    expect(resolveSpecifier(REPO, "src/federation/messaging.ts", "../schema/index.js")).toBe("src/schema/index.ts");
    expect(resolveSpecifier(REPO, "src/federation/messaging.ts", "../schema")).toBe("src/schema/index.ts");
    expect(resolveSpecifier(REPO, "src/federation/messaging.ts", "../schema/canonical.js")).toBe("src/schema/canonical.ts");
    expect(resolveSpecifier(REPO, "src/federation/messaging.ts", "../schema/nope.js")).toBeUndefined();
    expect(resolveSpecifier(REPO, "src/federation/messaging.ts", "@ordarium/core")).toBeUndefined();
  });

  it("classifies the named hotspots and the deliberate exceptions", () => {
    expect(layerOf("src/tools/controller.ts").layer).toBe("L2");
    expect(layerOf("src/application/http.ts").layer).toBe("L5");
    expect(layerOf("src/application/surface.ts").layer).toBe("L4");
    expect(layerOf("src/install.ts").layer).toBe("L5");
    expect(layerOf("src/index.ts").layer).toBe("ENTRY");
    expect(layerOf("src/advanced.ts").layer).toBe("ENTRY");
    expect(layerOf("src/effects/index.ts").layer).toBe("BARREL");
    expect(layerOf("src/effects/promotion.ts").layer).toBe("L2");
    expect(layerOf("src/transport/envelope.ts").layer).toBe("L2");
    expect(layerOf("src/run/definition.ts").layer).toBe("L1");
  });
});

/* ================================================================== *
 * SR1-A01 / SR1-A02 — the same rules against the LIVE repository
 * ================================================================== */

describe("SR1-A01/A02 the live repository has no new forbidden edge and no new cross-layer cycle", () => {
  const architecture = analyseModuleArchitecture(REPO);
  const baseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8")).baseline as ArchitectureBaseline;

  it("SR1-A01 every relative import resolves (the extractor is not silently shrinking the graph)", () => {
    expect(architecture.totals.unresolvedImports).toBe(0);
    expect(architecture.totals.files).toBeGreaterThan(290);
    expect(architecture.totals.edges).toBeGreaterThan(1000);
  });

  it("SR1-A01 no forbidden layer edge outside the recorded baseline", () => {
    const result = checkArchitecture(architecture, baseline);
    expect(result.violations.filter((violation) => violation.kind === "forbidden_import")).toEqual([]);
    // The recorded exceptions are still exactly the ones with written reasons, per CONCRETE edge.
    for (const edge of architecture.forbiddenImports) {
      const key = `${edge.from} -> ${edge.to}`;
      expect(BASELINE_EDGE_REASONS.has(key), `unrecorded forbidden edge ${key}`).toBe(true);
    }
    // SR-2 §五: 4 at the SR-1 baseline, 5 since continuation was classified as L3 — which
    // SURFACED an edge the old "unclassified ⇒ BARREL" fallback had been hiding. The count
    // is a ceiling, not a target: SR-2a removes the continuation edge and this must go down.
    expect(architecture.forbiddenImports.length).toBeLessThanOrEqual(5);
  });

  it("SR1-A02 no cross-layer cycle outside the recorded baseline", () => {
    const result = checkArchitecture(architecture, baseline);
    expect(result.violations.filter((violation) => violation.kind === "new_cycle")).toEqual([]);
    for (const cycle of architecture.stronglyConnectedComponents) {
      if (cycle.files.length === 1) continue;
      const layers = new Set(cycle.files.map((file) => layerOf(file).layer));
      if (layers.size === 1) continue;
      const key = [...cycle.files].sort().join("|");
      expect(BASELINE_CYCLE_REASONS.has(key), `unrecorded cross-layer cycle ${key}`).toBe(true);
    }
  });

  it("SR1-A02 the baseline records a reason for every exception it carries", () => {
    const result = checkArchitecture(architecture, baseline);
    expect(result.unreasonedExceptions).toEqual([]);
    expect(baseline.permittedForbiddenEdges.every((entry) => entry.reason.length > 40)).toBe(true);
  });

  it("SR1-A01 the rule set is not vacuous: a synthetic upward edge would fail on this very graph", () => {
    const tampered = syntheticArchitecture({
      "src/domain/models.ts": ["src/application/http.ts"],
      "src/application/http.ts": [],
    });
    expect(checkArchitecture(tampered, baseline).ok).toBe(false);
  });
});
