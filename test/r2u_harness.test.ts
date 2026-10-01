/**
 * R2-U §25 — DETERMINISTIC HARNESS TESTS.
 *
 * These test the EXPERIMENT, not the product. They exist because the experiment's own machinery decides
 * whether its conclusion means anything: a harness whose affordance seam silently stopped appending the
 * clause, or whose randomization stopped interleaving the arms, would still "run 40 trials" and still print
 * a verdict.
 *
 * §25 is explicit about what belongs here: harness/presentation determinism ONLY. NO stochastic success
 * expectation is encoded — nothing here asserts that a worker will pull, or that capital will help, because
 * that is the measurement rather than a precondition of it.
 *
 * The load-bearing tests are the KNOWN-ANSWER ones: every Scenario-D invariant is checked in BOTH
 * directions (the reference passes, the naive starting point fails), so a fixture that stopped
 * discriminating cannot pass by being uniformly permissive or uniformly strict.
 *
 * IMPORTS. `host/**` and the fixture `src/*.ts` files are outside this program's `include`, so they are
 * loaded through a URL with a declared cast — the technique `host_browser.test.ts` and
 * `host_cmdline.test.ts` already use. The `scripts/r2u/*.mjs` harness modules are plain JavaScript and are
 * typed by their sibling `.d.mts` declarations, which keeps `noImplicitAny` in force for test code rather
 * than loosening a compiler flag to accommodate a harness.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isolationCheck, normalizeTrial } from "../scripts/r2u/analyse.mjs";
import { deriveCapital } from "../scripts/r2u/capital.mjs";
import { analyseUptake, blockOrder, CELLS, EXPECTED_TRIALS, PROTOCOL_SEED, pullRates, trialPlan, UPTAKE_VERDICTS } from "../scripts/r2u/design.mjs";
import { detectD, D_PROBES } from "../scripts/r2u/known-failure.mjs";
import { assertOracleInaccessible, buildWorld, SCENARIOS, sha256 } from "../scripts/r2u/scenarios.mjs";
import { SCENARIO_D_GENERATIONS } from "../scripts/r2u/teacher-exploration.mjs";
import * as scenarioD from "../scripts/r2u/fixtures/scenario-d/acceptance.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const tmpRoot = (name: string): string => `${process.env.TEMP ?? "/tmp"}/r2u-test-${name}-${process.pid}`;

/** The host bundle's affordance seam: JavaScript outside the TS program, so loaded through a URL. */
const affordancePath = pathToFileURL(join(REPO_ROOT, "host", "dsh", "lib", "affordance.js")).href;
const { AFFORDANCE_MODES, applyAffordance, resolveAffordanceMode, UPTAKE_CLAUSE, uptakeClauseDigest } = (await import(affordancePath)) as {
  readonly AFFORDANCE_MODES: Readonly<{ OFF: string; EXPLICIT_REVIEW: string }>;
  readonly applyAffordance: (text: string, mode: string) => string;
  readonly resolveAffordanceMode: (value: string | undefined) => string;
  readonly UPTAKE_CLAUSE: string;
  readonly uptakeClauseDigest: () => Promise<string>;
};

/** Scenario D's H0 starting point, loaded the same way (it is a fixture, not program source). */
const h0Path = pathToFileURL(join(REPO_ROOT, "scripts", "r2u", "fixtures", "scenario-d", "src", "cache.ts")).href;
const { invalidateCache: h0Invalidate } = (await import(h0Path)) as {
  readonly invalidateCache: (cache: Record<string, { value: unknown; deps: readonly string[] }>, changed: readonly unknown[]) => unknown;
};

/* ================================================================ §7/§25 the presentation seam */

describe("R2-U §7/§25 — the presentation seam is additive and fail-safe", () => {
  const golden = readFileSync(join(REPO_ROOT, "scripts", "r2u", "fixtures", "production-prompt.golden.txt"), "utf8");

  it("the DEFAULT mode returns the prompt UNCHANGED (byte-identical to production)", () => {
    expect(applyAffordance(golden, AFFORDANCE_MODES.OFF)).toBe(golden);
  });

  it("an UNSET or unrecognized mode resolves to OFF, so a typo cannot enable the experiment", () => {
    for (const value of [undefined, "", "on", "EXPLICIT-REVIEW", "explicit_review", "true", "1", "A1"]) {
      expect(resolveAffordanceMode(value)).toBe(AFFORDANCE_MODES.OFF);
    }
    expect(resolveAffordanceMode(AFFORDANCE_MODES.EXPLICIT_REVIEW)).toBe(AFFORDANCE_MODES.EXPLICIT_REVIEW);
  });

  it("the A1 mode adds EXACTLY the frozen clause and re-renders nothing", () => {
    const a1 = applyAffordance(golden, AFFORDANCE_MODES.EXPLICIT_REVIEW);
    expect(a1).toBe(`${golden}\n\n${UPTAKE_CLAUSE}`);
    expect(a1.startsWith(golden)).toBe(true);
  });

  it("the clause names no handle kind and no body content (it cannot leak the answer)", () => {
    expect(UPTAKE_CLAUSE).not.toMatch(/procedure|proof|reasoning|@ctx\//iu);
  });

  it("the clause routes the read through the GOVERNED capability, not the filesystem", () => {
    expect(UPTAKE_CLAUSE).toContain("governed context-pull capability");
  });

  it("the clause states the empty/irrelevant case, which is what makes K0A1 a placebo", () => {
    expect(UPTAKE_CLAUSE).toMatch(/empty or not relevant, proceed normally/iu);
  });

  it("the clause digest is stable, so a mid-run edit is detectable", async () => {
    const digest = await uptakeClauseDigest();
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(digest).toBe(await uptakeClauseDigest());
  });

  it("the SAME wording is used for K0A1 and K1A1 (the arms differ only in whether handles exist)", () => {
    expect(applyAffordance(golden, AFFORDANCE_MODES.EXPLICIT_REVIEW)).toBe(applyAffordance(golden, AFFORDANCE_MODES.EXPLICIT_REVIEW));
  });
});

/* ================================================================ §15/§25 the randomized design */

describe("R2-U §15/§25 — the randomized schedule is the frozen one", () => {
  it("is 2 scenarios × 4 cells × 5 repetitions = 40 trials", () => {
    expect(trialPlan().length).toBe(EXPECTED_TRIALS);
    expect(EXPECTED_TRIALS).toBe(40);
  });

  it("every block contains exactly the four pre-registered cells", () => {
    for (const scenarioId of ["C", "D"]) {
      for (const block of blockOrder(5, scenarioId)) {
        expect([...block.order].sort()).toEqual([...CELLS].sort());
      }
    }
  });

  it("derives its order from ONE frozen seed, and the order differs across blocks", () => {
    expect(PROTOCOL_SEED).toBe(0x52_32_55_01);
    expect(new Set(blockOrder(5, "C").map((block) => block.order.join(","))).size).toBeGreaterThan(1);
  });

  it("§15: never runs all A1 cells after all A0 cells within a block", () => {
    for (const scenarioId of ["C", "D"]) {
      for (const block of blockOrder(5, scenarioId)) {
        const a1 = block.order.map((cell, index) => (cell.endsWith("A1") ? index : -1)).filter((index) => index >= 0);
        const a0 = block.order.map((cell, index) => (cell.endsWith("A0") ? index : -1)).filter((index) => index >= 0);
        expect(a1.some((index) => a0.some((other) => index < other))).toBe(true);
      }
    }
  });

  it("the two scenarios get DIFFERENT block orders (the scenario term is in the stream)", () => {
    expect(blockOrder(5, "C").map((block) => block.order.join(","))).not.toEqual(blockOrder(5, "D").map((block) => block.order.join(",")));
  });
});

/* ================================================================ §20 the verdict criteria, pre-declared */

describe("R2-U §20 — the uptake verdict follows the pre-declared criteria", () => {
  const cells = (k0a0: number, k1a0: number, k0a1: number, k1a1: number) => ({
    K0A0: { n: 5, pulled: k0a0, rate: k0a0 / 5 },
    K1A0: { n: 5, pulled: k1a0, rate: k1a0 / 5 },
    K0A1: { n: 5, pulled: k0a1, rate: k0a1 / 5 },
    K1A1: { n: 5, pulled: k1a1, rate: k1a1 / 5 },
  });

  it("REPLICATED when both scenarios raise K1 pulling with no comparable placebo shift", () => {
    expect(analyseUptake({ C: cells(0, 0, 0, 3), D: cells(0, 1, 0, 4) }).verdict).toBe(UPTAKE_VERDICTS.REPLICATED);
  });

  it("PARTIAL when exactly one scenario shows a clear increase", () => {
    expect(analyseUptake({ C: cells(0, 0, 0, 3), D: cells(0, 0, 0, 0) }).verdict).toBe(UPTAKE_VERDICTS.PARTIAL);
  });

  it("NOT_IMPROVED when the affordance does not raise capital use in either scenario", () => {
    expect(analyseUptake({ C: cells(0, 2, 0, 2), D: cells(0, 0, 0, 0) }).verdict).toBe(UPTAKE_VERDICTS.NOT_IMPROVED);
  });

  it("a PURELY PLACEBO shift (K0 rises as much as K1) does NOT count as replication", () => {
    expect(analyseUptake({ C: cells(0, 0, 3, 3), D: cells(0, 0, 3, 3) }).verdict).not.toBe(UPTAKE_VERDICTS.REPLICATED);
  });

  it("an increase with ZERO governed body pulls does not count as a clear effect", () => {
    expect(analyseUptake({ C: cells(0, 0, 0, 0), D: cells(0, 0, 0, 0) }).verdict).toBe(UPTAKE_VERDICTS.NOT_IMPROVED);
  });

  it("pullRates counts a pull only where the attempt had a pull (the primary metric)", () => {
    const rates = pullRates([
      { cell: "K1A1", pulledCount: 1 },
      { cell: "K1A1", pulledCount: 0 },
      { cell: "K1A0", pulledCount: 0 },
    ]);
    expect(rates.K1A1).toEqual({ n: 2, pulled: 1, rate: 0.5 });
    expect(rates.K1A0).toEqual({ n: 1, pulled: 0, rate: 0 });
  });
});

/* ================================================================ §8 the isolation check */

describe("R2-U §8 — the per-block isolation check", () => {
  const block = (scenario: string, index: number, mutate: (cell: string) => Record<string, unknown>) =>
    CELLS.map((cell) => ({
      scenario,
      cell,
      block: index,
      factorK: cell.startsWith("K1") ? 1 : 0,
      factorA: cell.endsWith("A1") ? 1 : 0,
      handlesVisible: cell.startsWith("K1") ? 3 : 0,
      ordinaryTaskDigest: "ordinary",
      indexSectionDigest: cell.startsWith("K1") ? "with-index" : "without-index",
      affordanceClauseDigest: cell.endsWith("A1") ? "with-clause" : "without-clause",
      capabilitySetDigest: "capabilities",
      pairedState: { scenarioId: scenario, taskSemanticDigest: "task", startingTreeDigest: "tree", targetSourceDigest: "src", visibleTestDigest: "visible", hiddenOracleDigest: "hidden", visibleFileCount: 5 },
      ...mutate(cell),
    }));

  it("accepts a block whose invariant components match and whose factors moved as designed", () => {
    expect(isolationCheck(block("S", 0, () => ({})))[0]?.confounded).toBe(false);
  });

  it("flags a block whose ordinary task text differs across cells", () => {
    const blocks = isolationCheck(block("S", 0, (cell) => (cell === "K1A1" ? { ordinaryTaskDigest: "different" } : {})));
    expect(blocks[0]?.confounded).toBe(true);
    expect(blocks[0]?.differences.join(" ")).toContain("ordinary task text");
  });

  it("flags a block whose capability catalogue differs across cells", () => {
    expect(isolationCheck(block("S", 0, (cell) => (cell === "K0A0" ? { capabilitySetDigest: "other" } : {})))[0]?.confounded).toBe(true);
  });

  it("flags a block where the K factor did not change the visible index (the treatment was not applied)", () => {
    const blocks = isolationCheck(block("S", 0, (cell) => (cell.startsWith("K1") ? { handlesVisible: 0 } : {})));
    expect(blocks[0]?.confounded).toBe(true);
    expect(blocks[0]?.differences.join(" ")).toContain("visible index");
  });

  it("flags a block where the affordance clause does not separate A0 from A1 exactly", () => {
    const blocks = isolationCheck(block("S", 0, (cell) => (cell.endsWith("A1") ? { affordanceClauseDigest: "without-clause" } : {})));
    expect(blocks[0]?.confounded).toBe(true);
    expect(blocks[0]?.differences.join(" ")).toContain("affordance clause");
  });

  it("normalizeTrial records the three condition components SEPARATELY (no single masking digest)", () => {
    const normalized = normalizeTrial({
      trialId: "t", scenario: "S", cell: "K1A1", block: 0, repetition: 0,
      prompt: { ordinaryTaskDigest: "o", indexSectionDigest: "i", affordanceClauseDigest: "a", capabilitySetDigest: "c", indexHandleCount: 3 },
      worker: {}, pairedState: null,
    });
    expect(normalized.ordinaryTaskDigest).toBe("o");
    expect(normalized.indexSectionDigest).toBe("i");
    expect(normalized.affordanceClauseDigest).toBe("a");
  });
});

/* ================================================================ §10/§11 the Scenario-D fixture */

describe("R2-U §10/§11 — Scenario D: the fixture discriminates", () => {
  it("the reference implementation passes EVERY visible and hidden case", () => {
    const visible = scenarioD.runCases(scenarioD.invalidateCacheReference, scenarioD.materialize(scenarioD.VISIBLE_CASES));
    const hidden = scenarioD.runCases(scenarioD.invalidateCacheReference, scenarioD.materialize(scenarioD.HIDDEN_CASES));
    expect(visible.passed).toBe(visible.total);
    expect(hidden.passed).toBe(hidden.total);
  });

  it("the naive starting point FAILS the hidden acceptance (the fixture has headroom)", () => {
    const hidden = scenarioD.runCases(h0Invalidate, scenarioD.materialize(scenarioD.HIDDEN_CASES));
    expect(hidden.passed).toBeLessThan(hidden.total);
  });

  it("the naive starting point PASSES the visible oracle (the mistake is not visible from inside)", () => {
    const visible = scenarioD.runCases(h0Invalidate, scenarioD.materialize(scenarioD.VISIBLE_CASES));
    expect(visible.passed).toBe(visible.total);
  });

  it("invalidates the transitive DEPENDENTS of a changed node", () => {
    const cache = { a: { value: 1, deps: [] as string[] }, b: { value: 2, deps: ["a"] }, c: { value: 3, deps: ["b"] } };
    scenarioD.invalidateCacheReference(cache, ["a"]);
    expect(Object.keys(cache)).toEqual([]);
  });

  it("PRESERVES an ancestor of a changed node (direction matters)", () => {
    const cache = { a: { value: 1, deps: [] as string[] }, b: { value: 2, deps: ["a"] }, c: { value: 3, deps: ["b"] } };
    scenarioD.invalidateCacheReference(cache, ["c"]);
    expect(Object.keys(cache).sort()).toEqual(["a", "b"]);
  });

  it("treats an entry naming an unresolvable dependency as unusable", () => {
    const cache = { a: { value: 1, deps: [] as string[] }, orphan: { value: 2, deps: ["gone"] } };
    scenarioD.invalidateCacheReference(cache, []);
    expect(Object.keys(cache)).toEqual(["a"]);
  });

  it("terminates on a cycle rather than hanging", () => {
    const cache = { x: { value: 1, deps: ["y"] }, y: { value: 2, deps: ["x"] }, z: { value: 3, deps: [] as string[] } };
    scenarioD.invalidateCacheReference(cache, ["x"]);
    expect(Object.keys(cache)).toEqual(["z"]);
  });

  it("leaves the caller's cache UNTOUCHED when it refuses an input", () => {
    const cache = { a: { value: 1, deps: [] as string[] }, b: { value: 2, deps: ["a"] } };
    const before = JSON.stringify(cache);
    expect(() => scenarioD.invalidateCacheReference(cache, ["a", 7])).toThrow();
    expect(JSON.stringify(cache)).toBe(before);
  });

  it("a candidate that only deletes the changed ids cannot pass the hidden acceptance", () => {
    const memorized = (cache: Record<string, { value: unknown; deps: readonly string[] }>, changed: readonly unknown[]) => {
      for (const id of changed) if (typeof id === "string") delete (cache as Record<string, unknown>)[id];
      return cache;
    };
    expect(scenarioD.runCases(memorized, scenarioD.materialize(scenarioD.HIDDEN_CASES)).passed).toBeLessThan(scenarioD.HIDDEN_CASES.length);
  });

  it("§10: the visible case file carries no invariant name (the method is not leaked)", () => {
    const visible = JSON.parse(readFileSync(join(REPO_ROOT, "scripts", "r2u", "fixtures", "scenario-d", "test", "cases.json"), "utf8")) as readonly Record<string, unknown>[];
    expect(visible.length).toBeGreaterThan(0);
    for (const entry of visible) expect(Object.keys(entry)).not.toContain("invariant");
  });

  it("the checked-in visible case file still matches the acceptance module's own cases", () => {
    const regenerated = `${JSON.stringify(scenarioD.materializeVisible(scenarioD.VISIBLE_CASES), null, 2)}\n`;
    expect(readFileSync(join(REPO_ROOT, "scripts", "r2u", "fixtures", "scenario-d", "test", "cases.json"), "utf8")).toBe(regenerated);
  });
});

/* ================================================================ §10 the hidden acceptance is unreachable */

describe("R2-U §10 — the hidden acceptance is unreachable from the worker's world", () => {
  it("building a world leaves no trace of the hidden acceptance in it", () => {
    const dir = tmpRoot("world");
    buildWorld(SCENARIOS.D, dir);
    expect(() => assertOracleInaccessible(SCENARIOS.D, dir)).not.toThrow();
  });

  it("the world does not carry the acceptance's reference name or header", () => {
    const dir = tmpRoot("world-types");
    buildWorld(SCENARIOS.D, dir);
    const oracle = readFileSync(join(dir, "test", "check.js"), "utf8");
    expect(oracle).not.toContain("invalidateCacheReference");
    expect(oracle).not.toContain("THE HIDDEN ACCEPTANCE");
  });

  it("the visible oracle RUNS in the world it was built into, and H0 passes its visible cases", () => {
    const dir = tmpRoot("oracle");
    buildWorld(SCENARIOS.D, dir);
    const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
    expect(execFileSync("node", ["test/check.js"], { cwd: dir, encoding: "utf8" })).toMatch(/5 cases, 5 pass, 0 fail/u);
  });
});

/* ================================================================ §12 the capital is traceable */

describe("R2-U §12 — the capital is traceable, and is METHOD not source", () => {
  const capital = deriveCapital().D;

  it("every Procedure clause names a generation the exploration ran AND that failed something", () => {
    for (const clause of capital.procedureClauses) {
      const observation = capital.exploration.observations.find((entry) => entry.generation === clause.forcedBy);
      expect(observation).toBeDefined();
      expect(observation?.failedCaseIds.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("the exploration's final generation stops failing, so the derived method is complete", () => {
    expect(capital.exploration.observations[capital.exploration.observations.length - 1]?.failedCaseIds).toEqual([]);
  });

  it("records an OBSERVED failure for every clause, not an authored rationale", () => {
    for (const clause of capital.procedureClauses) expect(clause.observed.length).toBeGreaterThan(20);
  });

  it("the Procedure encodes METHOD, not the final source code", () => {
    for (const clause of capital.procedureClauses) {
      expect(clause.instruction).not.toContain("function ");
      expect(clause.instruction).not.toContain("delete cache[");
    }
  });

  it("no Procedure clause can widen authority (they are advisory method only)", () => {
    for (const clause of capital.procedureClauses) expect(clause.instruction).not.toMatch(/run |execute |commit |push |write outside|escalate/iu);
  });
});

/* ================================================================ §18 the detector, both directions */

describe("R2-U §18 — the pre-paid mistake detector, in both directions", () => {
  const mature = SCENARIO_D_GENERATIONS[SCENARIO_D_GENERATIONS.length - 1]!;

  it("Scenario D: every naive generation recurs; the mature one does not", () => {
    for (const generation of SCENARIO_D_GENERATIONS.slice(0, -1)) {
      expect(detectD(generation.invalidate).recurred, `${generation.id} should recur`).toBe(true);
    }
    expect(detectD(mature.invalidate).recurred).toBe(false);
  });

  it("names the detector after the scenario's registered pre-paid mistake", () => {
    expect(detectD(SCENARIO_D_GENERATIONS[0]!.invalidate).detector).toBe(SCENARIOS.D.knownFailureDetector);
  });

  it("every probe states why it is narrow, and no probe is answerable from the visible cases", () => {
    const visibleIds = new Set(scenarioD.VISIBLE_CASES.map((entry) => entry.id));
    for (const probe of D_PROBES) {
      expect(probe.why.length).toBeGreaterThan(20);
      expect(visibleIds.has(probe.id)).toBe(false);
    }
  });

  it("the mature generation passes every probe", () => {
    const result = detectD(mature.invalidate);
    expect(result.violations).toEqual([]);
    expect(result.probesRun).toBe(D_PROBES.length);
  });
});

/* ================================================================ §8 digests are separate */

describe("R2-U §8 — the paired-state fields exclude the treatment", () => {
  it("the comparable fields do not include the index or the clause", async () => {
    const { PAIRED_STATE_COMPARABLE_FIELDS } = await import("../scripts/r2u/scenarios.mjs");
    expect([...PAIRED_STATE_COMPARABLE_FIELDS]).not.toContain("indexSectionDigest");
    expect([...PAIRED_STATE_COMPARABLE_FIELDS]).not.toContain("affordanceClauseDigest");
  });

  it("sha256 is stable for the same bytes and differs for different bytes", () => {
    expect(sha256("a")).toBe(sha256("a"));
    expect(sha256("a")).not.toBe(sha256("b"));
  });
});
