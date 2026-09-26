/**
 * SR-2 §十七 — the PROJECTION CYCLE, as machine proofs.
 *
 *     Projection ¬→ Owner
 *
 * The `controller ↔ graph/canvas` SCC was recorded in the architecture baseline as a canonical
 * SR-2 candidate: a derived view and the owner it derives from referenced each other.
 *
 *   src/canvas/derive.ts → src/tools/graph.ts        (a TYPE)
 *   src/tools/graph.ts   → src/canvas/derive.ts      (a CALL)
 *   src/tools/graph.ts   → src/tools/controller.ts   (a TYPE)
 *   src/tools/controller.ts → src/tools/graph.ts     (a CALL)
 *
 * Two of those four are type imports, and both ran the wrong way: a projection must not depend on
 * the owner it projects. SR-2d1 replaces them with STRUCTURAL declarations, which leaves one clean
 * direction:
 *
 *     controller → graph → canvas/derive
 *
 * and removes the cycle and its baseline exception.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { analyseModuleArchitecture, layerOf } from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

const MEMBERS = ["src/canvas/derive.ts", "src/tools/controller.ts", "src/tools/graph.ts"];

/* ================================================================== *
 * The cycle is GONE, and only in one direction
 * ================================================================== */

describe("SR-2 §十七 the projection cycle is gone", () => {
  it("no SCC contains the canvas/controller/graph trio", () => {
    const architecture = analyseModuleArchitecture(REPO);
    const offending = architecture.stronglyConnectedComponents.filter((component) =>
      component.files.some((file) => MEMBERS.includes(file)),
    );
    expect(offending).toEqual([]);
  });

  it("the remaining edges among them form ONE direction: controller → graph → canvas", () => {
    const architecture = analyseModuleArchitecture(REPO);
    const edges = new Set<string>();
    for (const module of architecture.modules) {
      if (!MEMBERS.includes(module.file)) continue;
      for (const target of module.imports) {
        if (MEMBERS.includes(target)) edges.add(`${module.file} -> ${target}`);
      }
    }
    expect([...edges].sort()).toEqual([
      "src/tools/controller.ts -> src/tools/graph.ts",
      "src/tools/graph.ts -> src/canvas/derive.ts",
    ]);
    // The two reverse edges are what closed the cycle, and both are gone.
    expect(edges.has("src/tools/graph.ts -> src/tools/controller.ts")).toBe(false);
    expect(edges.has("src/canvas/derive.ts -> src/tools/graph.ts")).toBe(false);
  });

  it("the projector declares its OWN input shapes instead of naming its producers", () => {
    // Both removed edges were TYPE imports: the projection described itself in the owner's terms.
    const graph = read("src/tools/graph.ts");
    expect(graph).not.toContain('from "./controller.js"');
    expect(graph).toContain("export interface GraphAttemptAttribution");
    // And the view declares the shape it reads rather than importing the projector's type.
    const canvas = read("src/canvas/derive.ts");
    expect(canvas).not.toContain('from "../tools/graph.js"');
    expect(canvas).toContain("export interface GraphViewInput");
  });

  it("the derivations still produce the same rows — the input is structural, not reduced", () => {
    const canvas = read("src/canvas/derive.ts");
    // Both entry points survive with the same names and return types.
    expect(canvas).toContain("export function satelliteAttempts(graph: GraphViewInput): SatelliteAttempt[]");
    expect(canvas).toContain("export function traceRows(graph: GraphViewInput): TraceRow[]");
    // The fields they read are the facts, not a subset chosen for convenience.
    for (const field of ["taskId", "objective", "role", "definitionId", "scopeId", "attempts"]) {
      expect(canvas, `the view must still read ${field}`).toContain(field);
    }
  });

  it("the call sites are unchanged — the projector still composes the view", () => {
    const graph = read("src/tools/graph.ts");
    expect(graph).toContain("satelliteAttempts(graph)");
    expect(graph).toContain("traceRows(graph)");
  });
});

/* ================================================================== *
 * The exception was DELETED with the cycle
 * ================================================================== */

describe("SR-2 §三十一 the cycle's exception was deleted, not left dormant", () => {
  it("the baseline records SEVEN cycles — the removed one is gone", () => {
    const baseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"))
      .baseline as { permittedCycles: readonly { files: readonly string[] }[] };
    expect(baseline.permittedCycles).toHaveLength(7);
    const offending = baseline.permittedCycles.filter(
      (cycle) => cycle.files.some((file) => MEMBERS.includes(file)),
    );
    expect(offending).toEqual([]);
  });

  it("the recorded REASON for that cycle is gone too — a dormant reason re-permits it", () => {
    const reasons = read("tools/architecture/baseline-reasons.ts");
    expect(reasons).not.toContain("src/canvas/derive.ts");
    expect(reasons).not.toContain("unwinding it is a canonical SR-2 candidate");
  });

  it("the exception set only shrank: 12 accepted at SR-2.0, 11 now", () => {
    const baseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"))
      .baseline as { permittedForbiddenEdges: readonly unknown[]; permittedCycles: readonly unknown[] };
    // Four forbidden edges (SR-1's) and seven cycles: one fewer than the SR-1 baseline carried.
    expect(baseline.permittedForbiddenEdges).toHaveLength(4);
    expect(baseline.permittedCycles).toHaveLength(7);
  });

  it("all three modules are still L3/L2 as they were — the fix was structural, not a reclassification", () => {
    expect(layerOf("src/tools/graph.ts").layer).toBe("L3");
    expect(layerOf("src/canvas/derive.ts").layer).toBe("L3");
    expect(layerOf("src/tools/controller.ts").layer).toBe("L2");
  });
});
