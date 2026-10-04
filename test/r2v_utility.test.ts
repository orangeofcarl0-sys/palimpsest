/**
 * R2-V §8/§9/§10/§11/§12/§13/§14/§15/§16 — DETERMINISTIC HARNESS TESTS.
 *
 * These test the EXPERIMENT, not the product, and NO stochastic success threshold is encoded: nothing here
 * asserts that any bundle will show a particular utility signal, because that is the measurement rather than
 * a precondition of it.
 *
 * The load-bearing tests are the ones that would silently invalidate the stage if they regressed:
 *
 *   · §10 the schedule is 4 arms × 5 repetitions = 20, and every block contains ALL FOUR arms;
 *   · §8 the four consumed bundle sets are distinct and every arm includes the task's own bundle;
 *   · §9 the arms add WHOLE bundles, never individual kinds;
 *   · §11 the isolation check flags a block whose invariants differ or whose bundle sets collapse;
 *   · §12 a trial whose consumption was not proven is excluded from the analysis;
 *   · §14 the marginal comparisons are raw counts and direction, with no p-value anywhere;
 *   · §15 "identical on both" is NO_CLEAR_SIGNAL, never POSITIVE;
 *   · §16 the R2-S calibration reads the two axes and states its scope restriction;
 *   · §13 no model self-report is used as utility ground truth.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ADDED_BUNDLES, analyseUtility, ARMS, armUtility, blockOrder, BUNDLE_IDS, CONDITIONS, CONSUMPTION_MECHANISM, EXPECTED_TRIALS, marginalSignal, PROTOCOL_SEED, REPETITIONS, SCENARIO_IDS, trialPlan, UTILITY_CLASSIFICATIONS } from "../scripts/r2v/design.mjs";
import { calibrateAgainstR2S, isolationCheck, normalizeTrial } from "../scripts/r2v/analyse.mjs";
import { BUNDLE_DOMAIN, bundleCapital } from "../scripts/r2s/candidates.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The arms indexed by id, so a lookup is typed rather than relying on an index signature. */
const ARM_BY_ID: Record<string, { readonly bundles: readonly string[] }> = { V0: ARMS.V0, V1: ARMS.V1, V2: ARMS.V2, V3: ARMS.V3 };

/* ================================================================ §10 the frozen schedule */

describe("R2-V §10 — the schedule is frozen before any trial", () => {
  it("is exactly 4 arms × 5 repetitions = 20 Scenario-D trials", () => {
    expect(trialPlan().length).toBe(EXPECTED_TRIALS);
    expect(EXPECTED_TRIALS).toBe(20);
    expect(SCENARIO_IDS).toEqual(["D"]);
  });

  it("every randomized block contains ALL FOUR arms exactly once", () => {
    for (const block of blockOrder(REPETITIONS, "D")) {
      expect([...block.order].sort().join(",")).toBe([...CONDITIONS].sort().join(","));
      expect(block.order.length).toBe(4);
    }
  });

  it("the order derives from ONE frozen seed and is not the same permutation every block", () => {
    expect(PROTOCOL_SEED).toBe(0x52_56_03_01);
    expect(new Set(blockOrder(REPETITIONS, "D").map((block) => block.order.join(","))).size).toBeGreaterThan(1);
  });

  it("the plan carries each trial's consumed bundle set, so a trial cannot choose its own", () => {
    for (const trial of trialPlan()) {
      expect(trial.bundles).toBeDefined();
      const arm = ARM_BY_ID[trial.condition]!;
      expect([...trial.bundles].sort().join("+")).toBe([...arm.bundles].sort().join("+"));
    }
  });
});

/* ================================================================ §8/§9 the arms */

describe("R2-V §8/§9 — the four arms and their bundle sets", () => {
  it("the arms are exactly V0=D, V1=D+B, V2=D+C, V3=D+B+C", () => {
    expect(ARMS.V0.bundles.join("+")).toBe("D");
    expect(ARMS.V1.bundles.join("+")).toBe("D+B");
    expect(ARMS.V2.bundles.join("+")).toBe("D+C");
    expect(ARMS.V3.bundles.join("+")).toBe("D+B+C");
  });

  it("the four consumed bundle sets are ALL DISTINCT", () => {
    const sets = CONDITIONS.map((id) => [...ARM_BY_ID[id]!.bundles].sort().join("+"));
    expect(new Set(sets).size).toBe(4);
  });

  it("every arm includes the task's OWN bundle, so the comparison isolates what is added", () => {
    for (const id of CONDITIONS) expect(ARM_BY_ID[id]!.bundles).toContain("D");
  });

  it("§9 the arms add WHOLE bundles, never individual kinds", () => {
    for (const [id, bundles] of Object.entries(ADDED_BUNDLES)) {
      expect(bundles.length).toBeGreaterThan(0);
      for (const bundleId of bundles) expect(BUNDLE_IDS).toContain(bundleId);
      expect(CONDITIONS).toContain(id);
    }
    expect(ADDED_BUNDLES.V3.join("+")).toBe("B+C");
  });

  it("§8 the mechanism is the R2-E HOST_MEDIATED_PREWORK seam", () => {
    expect(CONSUMPTION_MECHANISM).toBe("HOST_MEDIATED_PREWORK");
  });

  it("§7 every bundle is REAL capital from a DISTINCT domain", () => {
    const domains = new Set<string>();
    for (const bundleId of BUNDLE_IDS) {
      const bundle = bundleCapital(bundleId);
      expect([...bundle.proof.statement].length).toBeGreaterThan(80);
      expect(bundle.procedureClauses.length).toBeGreaterThan(0);
      domains.add(bundle.domain);
    }
    expect(domains.size).toBe(3);
    expect(BUNDLE_DOMAIN.B).not.toBe(BUNDLE_DOMAIN.D);
    expect(bundleCapital("B").proof.statement).not.toBe(bundleCapital("D").proof.statement);
  });
});

/* ================================================================ §15 the classifier */

describe("R2-V §15 — the descriptive classification", () => {
  const arm = (solved: number, recurred: number, n = 5) => ({ analysed: n, fullSolved: `${String(solved)}/${String(n)}`, mistakeRecurred: `${String(recurred)}/${String(n)}`, preconditionNotMet: 0 });
  const classify = (v0: any, vx: any) => marginalSignal(ARMS.V1, v0, vx).classification;

  it("POSITIVE_SIGNAL when fewer mistakes with no solve loss", () => {
    expect(classify(arm(3, 3), arm(3, 0))).toBe(UTILITY_CLASSIFICATIONS.POSITIVE_SIGNAL);
  });

  it("POSITIVE_SIGNAL when more solves with no recurrence loss", () => {
    expect(classify(arm(3, 3), arm(5, 3))).toBe(UTILITY_CLASSIFICATIONS.POSITIVE_SIGNAL);
  });

  it("ADVERSE_SIGNAL when more mistakes", () => {
    expect(classify(arm(3, 1), arm(3, 4))).toBe(UTILITY_CLASSIFICATIONS.ADVERSE_SIGNAL);
  });

  it("ADVERSE_SIGNAL when fewer solves", () => {
    expect(classify(arm(4, 1), arm(1, 1))).toBe(UTILITY_CLASSIFICATIONS.ADVERSE_SIGNAL);
  });

  it("NO_CLEAR_SIGNAL when identical on both — never POSITIVE", () => {
    expect(classify(arm(3, 2), arm(3, 2))).toBe(UTILITY_CLASSIFICATIONS.NO_CLEAR_SIGNAL);
  });

  it("§15 there is no binary useful/useless — exactly three descriptive classes", () => {
    expect(Object.values(UTILITY_CLASSIFICATIONS)).toEqual(["POSITIVE_SIGNAL", "NO_CLEAR_SIGNAL", "ADVERSE_SIGNAL"]);
  });

  it("§14 a comparison carries raw deltas and direction, and NO p-value field", () => {
    const signal = marginalSignal(ARMS.V1, arm(3, 3), arm(4, 1));
    expect(signal.solveDelta).toBe(1);
    expect(signal.recurrenceDelta).toBe(-2);
    expect(signal.solveDirection).toBe("MORE_SOLVED");
    expect(signal.recurrenceDirection).toBe("FEWER_MISTAKES");
    /** §14: no statistical-test field of any kind. The note may SAY there is no significance test. */
    for (const key of Object.keys(signal)) expect(key).not.toMatch(/^(p|pValue|p_value|ci|confidence|tStat|zScore)$/iu);
    expect(signal.note).toMatch(/not a significance test/u);
    expect(signal.testedScope).toContain("Scenario D");
  });

  it("§9 the comparison records which bundles were ADDED", () => {
    expect(marginalSignal(ARMS.V1, arm(3, 3), arm(3, 3)).addedBundles).toEqual(["B"]);
    expect(marginalSignal(ARMS.V3, arm(3, 3), arm(3, 3)).addedBundles).toEqual(["B", "C"]);
  });

  it("§16 the per-bundle consensus is POSITIVE only when EVERY arm that added it agreed", () => {
    const utility = analyseUtility({ V0: arm(3, 3), V1: arm(3, 0), V2: arm(3, 0), V3: arm(3, 0) });
    expect(utility.byBundle.B.consensus).toBe(UTILITY_CLASSIFICATIONS.POSITIVE_SIGNAL);
    expect(utility.byBundle.C.consensus).toBe(UTILITY_CLASSIFICATIONS.POSITIVE_SIGNAL);
    const mixed = analyseUtility({ V0: arm(3, 3), V1: arm(3, 0), V2: arm(1, 3), V3: arm(3, 3) });
    expect(mixed.byBundle.B.consensus).toBe(UTILITY_CLASSIFICATIONS.NO_CLEAR_SIGNAL);
  });
});

/* ================================================================ §13 the arm summary */

describe("R2-V §13 — the per-arm summary reads the hidden outcomes", () => {
  const trial = (overrides: Record<string, unknown> = {}) => normalizeTrial({
    trialId: "D-V0-b0r0",
    scenario: "D_INCREMENTAL_CACHE_INVALIDATION",
    condition: "V0",
    block: 0,
    repetition: 0,
    consumedBundles: ["D"],
    finalAcceptance: { passed: 14, total: 14 },
    firstCandidateAcceptance: { passed: 14, total: 14 },
    knownFailureFinal: { recurred: false },
    visibleOracleInvocations: 3,
    implementationRevisions: 0,
    elapsedMs: 1000,
    consumptionProven: true,
    worker: { outcomeKind: "COMPLETED" },
    prompt: {},
    pairedState: {},
    ...overrides,
  });

  it("computes solve, first-candidate and recurrence counts", () => {
    const summary = armUtility([trial(), trial({ finalAcceptance: { passed: 10, total: 14 }, knownFailureFinal: { recurred: true } })]);
    expect(summary.fullSolved).toBe("1/2");
    expect(summary.mistakeRecurred).toBe("1/2");
    expect(summary.analysed).toBe(2);
  });

  it("§13 records no model self-report as ground truth", () => {
    const summary = armUtility([trial()]);
    expect(JSON.stringify(summary)).not.toMatch(/summary|selfReport|self-report/iu);
  });

  it("§12 counts a trial whose consumption was not proven", () => {
    expect(armUtility([trial({ consumptionProven: false })]).preconditionNotMet).toBe(1);
  });
});

/* ================================================================ §11/§12 the isolation check */

describe("R2-V §11/§12 — the isolation check protects the treatment", () => {
  const base = (condition: string, overrides: Record<string, unknown> = {}) => normalizeTrial({
    trialId: `D-${condition}-b0r0`,
    scenario: "D_INCREMENTAL_CACHE_INVALIDATION",
    condition,
    block: 0,
    repetition: 0,
    consumedBundles: [...ARM_BY_ID[condition]!.bundles],
    finalAcceptance: { passed: 14, total: 14 },
    knownFailureFinal: { recurred: false },
    consumptionProven: true,
    worker: { outcomeKind: "COMPLETED" },
    prompt: { ordinaryTaskDigest: "T", toolCatalogDigest: "C", capabilitySetDigest: "S", handlesInPayload: [], compiledHandleOrder: [] },
    session: { found: true, indexSectionFound: true, handlesInPrompt: [] },
    pairedState: {},
    ...overrides,
  });

  it("a clean four-arm block is not confounded", () => {
    const blocks = isolationCheck([base("V0"), base("V1"), base("V2"), base("V3")]);
    expect(blocks[0]!.confounded).toBe(false);
  });

  it("§11 flags a block whose consumed bundle sets are not all distinct", () => {
    const blocks = isolationCheck([base("V0"), base("V1"), base("V1"), base("V3")]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/bundle sets are not all distinct/u);
  });

  it("§11 flags a block whose ordinary task text differs across arms", () => {
    const blocks = isolationCheck([base("V0"), base("V1", { prompt: { ordinaryTaskDigest: "OTHER", toolCatalogDigest: "C", capabilitySetDigest: "S", handlesInPayload: [], compiledHandleOrder: [] } }), base("V2"), base("V3")]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/ordinary task text/u);
  });

  it("§12 flags a block where consumption was not proven in one arm", () => {
    const blocks = isolationCheck([base("V0"), base("V1", { consumptionProven: false }), base("V2"), base("V3")]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/consumption was not proven/u);
  });

  it("§12 flags a block where no session artifact was found", () => {
    const blocks = isolationCheck([base("V0"), base("V1", { session: { found: false, indexSectionFound: false, handlesInPrompt: [] } }), base("V2"), base("V3")]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/no durable session artifact/u);
  });

  it("flags a block with fewer than four arms", () => {
    const blocks = isolationCheck([base("V0"), base("V1")]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/expected 4 arms/u);
  });
});

/* ================================================================ §16 the calibration */

describe("R2-V §16 — the R2-S calibration", () => {
  const r2s = { D: { S0: { targetRecall: "15/15", distractorRate: "15/15" }, S1: { targetRecall: "15/15", distractorRate: "6/15" } } };

  it("names B and C as the bundles R2-S skipped on D", () => {
    const calibration = calibrateAgainstR2S({ B: { consensus: "NO_CLEAR_SIGNAL" }, C: { consensus: "NO_CLEAR_SIGNAL" } }, r2s);
    expect(calibration.skippedByR2S.map((entry: any) => entry.bundleId)).toEqual(["B", "C"]);
    expect(calibration.skippedByR2S.every((entry: any) => entry.skippedByR2S === true)).toBe(true);
  });

  it("reports CONSISTENT when no skipped bundle showed a positive signal", () => {
    expect(calibrateAgainstR2S({ B: { consensus: "NO_CLEAR_SIGNAL" }, C: { consensus: "NO_CLEAR_SIGNAL" } }, r2s).answers.correlation).toMatch(/^CONSISTENT/u);
  });

  it("reports MISCALIBRATED when every skipped bundle showed a positive signal", () => {
    expect(calibrateAgainstR2S({ B: { consensus: "POSITIVE_SIGNAL" }, C: { consensus: "POSITIVE_SIGNAL" } }, r2s).answers.correlation).toMatch(/^MISCALIBRATED/u);
  });

  it("reports MIXED when only some skipped bundles showed a positive signal", () => {
    expect(calibrateAgainstR2S({ B: { consensus: "POSITIVE_SIGNAL" }, C: { consensus: "NO_CLEAR_SIGNAL" } }, r2s).answers.correlation).toMatch(/^MIXED/u);
  });

  it("§17 states that R2-S labels are provenance labels and are NOT rewritten", () => {
    const calibration = calibrateAgainstR2S({ B: { consensus: "NO_CLEAR_SIGNAL" }, C: { consensus: "NO_CLEAR_SIGNAL" } }, r2s);
    expect(calibration.note).toMatch(/PROVENANCE labels/u);
    expect(calibration.note).toMatch(/does not rewrite/u);
  });

  it("§16 states its scope restriction", () => {
    const calibration = calibrateAgainstR2S({ B: { consensus: "NO_CLEAR_SIGNAL" }, C: { consensus: "NO_CLEAR_SIGNAL" } }, r2s);
    expect(calibration.scopeRestriction).toMatch(/R2-V ran on D only/u);
  });
});

/* ================================================================ §4 no product change */

describe("R2-V §4 — the stage makes no product change", () => {
  it("the harness reads the R2-E efficacy seam and does not define a second consumption mechanism", () => {
    const trialSource = readFileSync(join(REPO_ROOT, "scripts", "r2v", "trial.mjs"), "utf8");
    expect(trialSource).toContain("EFFICACY_ENV");
    expect(trialSource).toContain("EFFICACY_MODES");
    expect(trialSource).not.toMatch(/new .*fetch|second fetch path|backing store/iu);
  });

  it("the stage does not modify the R2-S renderer or its preview budget", () => {
    const metadataSource = readFileSync(join(REPO_ROOT, "host", "dsh", "lib", "index-metadata.js"), "utf8");
    expect(metadataSource).toContain("procedureApplicability: 120");
    expect(metadataSource).toContain("proof: 160");
  });
});
