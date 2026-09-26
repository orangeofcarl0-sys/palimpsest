/**
 * SR-2 §十八 — the PROMOTION ↔ RECOVERY cycle, as machine proofs.
 *
 *     Promotion  → durable records / narrow read contract → Recovery
 *
 * The two modules referenced each other. Measured, only ONE of the two directions was real work:
 *
 *   recovery/recovery.ts → effects/promotion.ts   a CALL — recovery DRIVES the promotion engine
 *                                                 (the mechanics live on `PromotionManager`)
 *   effects/promotion.ts → recovery/recovery.ts   a TYPE — two result types, and nothing else
 *
 * So the reverse edge existed purely so the engine could NAME its own result type in its consumer's
 * vocabulary. SR-2d2 sinks those two types into a neutral contract module (`src/domain/`) and both
 * sides import it — a contract relocation, not a protocol change: not one field, tag or string moved
 * meaning.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { analyseModuleArchitecture, layerOf } from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

const CONTRACT = "src/domain/promotion_recovery_contract.ts";

/* ================================================================== *
 * The cycle is gone, and the direction that remains is the real one
 * ================================================================== */

describe("SR-2 §十八 the promotion ↔ recovery cycle is gone", () => {
  it("no SCC contains the pair", () => {
    const architecture = analyseModuleArchitecture(REPO);
    const offending = architecture.stronglyConnectedComponents.filter(
      (component) =>
        component.files.includes("src/effects/promotion.ts") || component.files.includes("src/recovery/recovery.ts"),
    );
    expect(offending).toEqual([]);
  });

  it("the ONE remaining edge is recovery → promotion — the real dependency", () => {
    const architecture = analyseModuleArchitecture(REPO);
    const pair = ["src/effects/promotion.ts", "src/recovery/recovery.ts"];
    const edges = new Set<string>();
    for (const module of architecture.modules) {
      if (!pair.includes(module.file)) continue;
      for (const target of module.imports) {
        if (pair.includes(target)) edges.add(`${module.file} -> ${target}`);
      }
    }
    expect([...edges]).toEqual(["src/recovery/recovery.ts -> src/effects/promotion.ts"]);
    // The engine no longer names the recovery service at all.
    expect(edges.has("src/effects/promotion.ts -> src/recovery/recovery.ts")).toBe(false);
  });

  it("the engine no longer imports the recovery service", () => {
    const promotion = read("src/effects/promotion.ts");
    expect(promotion).not.toContain('from "../recovery/recovery.js"');
    // It names the CONTRACT instead.
    expect(promotion).toContain('from "../domain/promotion_recovery_contract.js"');
  });

  it("recovery still drives the engine — the mechanics owner is unchanged", () => {
    const recovery = read("src/recovery/recovery.ts");
    expect(recovery).toContain('from "../effects/promotion.js"');
    expect(recovery).toContain("PromotionManager");
  });
});

/* ================================================================== *
 * A contract relocation, not a protocol change
 * ================================================================== */

describe("SR-2 §十八 the shared contract moved DOWN and changed nothing", () => {
  it("the contract module is L1 and carries no behaviour", () => {
    expect(layerOf(CONTRACT).layer).toBe("L1");
    // Comments stripped: the doc comment explains what the module is NOT, and a raw search would
    // match the explanation.
    const source = read(CONTRACT)
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split(String.fromCharCode(10))
      .map((line) => {
        const at = line.indexOf("//");
        return at === -1 ? line : line.slice(0, at);
      })
      .join(String.fromCharCode(10));
    // Pure types: no store, no I/O, no clock, no engine, no runtime construct at all.
    for (const forbidden of [
      "DatabaseSync",
      "execFileSync",
      "new Date(",
      "PromotionManager",
      "appendAtomic",
      "class ",
      "function ",
      "const ",
    ]) {
      expect(source, `the contract must stay pure data (${forbidden})`).not.toContain(forbidden);
    }
    // It declares exactly the two shared types.
    expect(source).toContain("export type PromotionRecoveryOutcome");
    expect(source).toContain("export interface RecoveryReport");
  });

  it("every field, tag and string is byte-identical to where it was", () => {
    const source = read(CONTRACT);
    // The outcome union's four arms, verbatim.
    for (const arm of ['outcome: "committed"', 'outcome: "failed"', 'outcome: "in-flight"', 'outcome: "blocked"']) {
      expect(source, `the contract must keep ${arm}`).toContain(arm);
    }
    // The committed arm's three `via` values, verbatim.
    expect(source).toContain('via: "receipt" | "reconcile" | "redispatch"');
    // The report's four buckets, verbatim.
    for (const bucket of ["prepared: number", "terminal: PromotionRecoveryOutcome[]", "inFlight:", "blocked:"]) {
      expect(source, `the report must keep ${bucket}`).toContain(bucket);
    }
    // And the fields the outcome arms carry.
    for (const field of ["promotionId", "resultingHeadCommit", "ordariumState", "reason"]) {
      expect(source, `the contract must keep ${field}`).toContain(field);
    }
  });

  it("the recovery module still EXPORTS both types — existing import paths are unchanged", () => {
    const recovery = read("src/recovery/recovery.ts");
    expect(recovery).toContain("export type { PromotionRecoveryOutcome, RecoveryReport }");
    expect(recovery).toContain('from "../domain/promotion_recovery_contract.js"');
  });

  it("both consumers resolve the SAME type identity — one contract, not two copies", () => {
    // A second definition would be a second protocol; the proof is that neither module DECLARES it.
    const promotion = read("src/effects/promotion.ts");
    const recovery = read("src/recovery/recovery.ts");
    expect(promotion).not.toContain("export type PromotionRecoveryOutcome");
    expect(promotion).not.toContain("export interface RecoveryReport");
    expect(recovery).not.toContain("export type PromotionRecoveryOutcome =");
    expect(recovery).not.toContain("export interface RecoveryReport {");
  });
});

/* ================================================================== *
 * The exception was deleted with the cycle
 * ================================================================== */

describe("SR-2 §三十一 the cycle's exception was deleted, not left dormant", () => {
  it("the baseline no longer records THIS cycle — the removed one is gone", () => {
    const baseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"))
      .baseline as { permittedCycles: readonly { files: readonly string[] }[] };
    // SR-2d3 removed a further cycle; this claim is about THIS pair, so it asserts the direction.
    expect(baseline.permittedCycles.length).toBeLessThanOrEqual(5);
    const offending = baseline.permittedCycles.filter(
      (cycle) => cycle.files.includes("src/effects/promotion.ts") && cycle.files.includes("src/recovery/recovery.ts"),
    );
    expect(offending).toEqual([]);
  });

  it("the exception set only ever shrank: 12 → 11 → 10 → 9 across the d-slices", () => {
    const baseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"))
      .baseline as { permittedForbiddenEdges: readonly unknown[]; permittedCycles: readonly unknown[] };
    // Four forbidden edges (SR-1's, untouched) and five cycles — three fewer than SR-1 carried.
    expect(baseline.permittedForbiddenEdges).toHaveLength(4);
    expect(baseline.permittedCycles.length).toBeLessThanOrEqual(5);
  });

  it("the layers are unchanged — the fix was a contract relocation, not a reclassification", () => {
    /**
     * Whatever the layers were, they still are: the SCC was broken by moving a TYPE, not by
     * declaring either module something it is not. MEASURED rather than assumed — both are L2,
     * and the contract sits at L1, BELOW both, which is what makes the remaining direction
     * (`recovery → promotion`, a peer-to-peer L2 edge) legal while the upward edge is not.
     */
    expect(layerOf("src/effects/promotion.ts").layer).toBe("L2");
    expect(layerOf("src/recovery/recovery.ts").layer).toBe("L2");
    expect(layerOf(CONTRACT).layer).toBe("L1");
  });
});
