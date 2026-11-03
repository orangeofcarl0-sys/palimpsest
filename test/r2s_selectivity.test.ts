/**
 * R2-S §5/§6/§11/§14/§15/§17/§20 — DETERMINISTIC HARNESS TESTS.
 *
 * These test the EXPERIMENT, not the product, and NO stochastic success threshold is encoded: nothing here
 * asserts that metadata will improve selectivity, because that is the measurement rather than a
 * precondition of it.
 *
 * The load-bearing tests are the ones that would silently invalidate the stage if they regressed:
 *
 *   · §5 the renderer emits each handle EXACTLY ONCE, so the S0/S1 arms differ in metadata bytes and NOT in
 *     handle occurrence count — the duplicate-handle confound R2-S exists to remove;
 *   · S0 is the IDENTITY on the production index, so the control is the real control;
 *   · §6/§7 every candidate set is 3 TARGET + 3 DISTRACTOR, one per kind, with independent distractors;
 *   · §11 the five distractor sets per scenario are pairwise distinct, and the compiled order is identical
 *     across the S0/S1 pair within a block;
 *   · §15 the verdict does NOT call reduced retrieval an improvement when target recall falls;
 *   · §17 pull-all is recorded as a valid result, never as a failure;
 *   · §21 the verdict never reads task success.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { analyseSelectivity, armSelectivity, blockOrder, CANDIDATE_SET_SIZE, CONDITIONS, DISTRACTOR_COUNT, DISTRACTOR_POOL, EXPECTED_TRIALS, KINDS, MODE_OF, PROTOCOL_SEED, SELECTIVITY_VERDICTS, TARGET_COUNT, distractorSchedule, trialPlan } from "../scripts/r2s/design.mjs";
import { BUNDLE_DOMAIN, assertDistractorIndependent, bundleCapital, candidateSetFor } from "../scripts/r2s/candidates.mjs";
import { isolationCheck, normalizeTrial } from "../scripts/r2s/analyse.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

const metadataPath = pathToFileURL(join(REPO_ROOT, "host", "dsh", "lib", "index-metadata.js")).href;
const { PREVIEW_BUDGET, PROCEDURE_RULING, deriveIndexEntry, renderIndexMetadata } = (await import(metadataPath)) as {
  readonly PREVIEW_BUDGET: Readonly<{ proof: number; reasoning: number; procedureApplicability: number; procedureLimitations: number }>;
  readonly PROCEDURE_RULING: string;
  readonly deriveIndexEntry: (selected: { handle: string; kind: string }, value: unknown) => any;
  readonly renderIndexMetadata: (production: string, entries: readonly any[]) => string;
};

/** A production index with SIX entry lines, matching the broad candidate set. */
const SIX_PRODUCTION_INDEX = [
  "",
  "Project context available to this attempt (READ-ONLY; never authority):",
  "  [proof] @ctx/proof/pc-1",
  "  [proof] @ctx/proof/pc-2",
  "  [reasoning] @ctx/reasoning/cell-1/cl-1",
  "  [reasoning] @ctx/reasoning/cell-2/cl-2",
  "  [procedure] @ctx/procedure/prc-1/0",
  "  [procedure] @ctx/procedure/prc-2/0",
  "",
  "Use `palimpsest_worker_context_pull` with exactly one listed handle when the body would help.",
  "Do not invent handles: a handle that is not listed above will be refused.",
].join("\n");

const SIX_HANDLES = ["@ctx/proof/pc-1", "@ctx/proof/pc-2", "@ctx/reasoning/cell-1/cl-1", "@ctx/reasoning/cell-2/cl-2", "@ctx/procedure/prc-1/0", "@ctx/procedure/prc-2/0"];

/** Six real derived entries, one per production entry line. */
const sixEntries = () => [
  deriveIndexEntry({ handle: "@ctx/proof/pc-1", kind: "proof" }, { body: { statement: "a".repeat(300) }, binding: { standing_at_compile: "SUPPORTED", freshness_at_compile: "fresh" } }),
  deriveIndexEntry({ handle: "@ctx/proof/pc-2", kind: "proof" }, { body: { statement: "b".repeat(300) }, binding: { standing_at_compile: "SUPPORTED", freshness_at_compile: "fresh" } }),
  deriveIndexEntry({ handle: "@ctx/reasoning/cell-1/cl-1", kind: "reasoning" }, { body: { statement: "c".repeat(300) }, binding: { active_at_compile: true } }),
  deriveIndexEntry({ handle: "@ctx/reasoning/cell-2/cl-2", kind: "reasoning" }, { body: { statement: "d".repeat(300) }, binding: { active_at_compile: true } }),
  deriveIndexEntry({ handle: "@ctx/procedure/prc-1/0", kind: "procedure" }, { body: { applicability: ["x".repeat(200)], limitations: ["y".repeat(200)] }, binding: { standing_at_compile: "ACTIVE", procedure_revision: 0 } }),
  deriveIndexEntry({ handle: "@ctx/procedure/prc-2/0", kind: "procedure" }, { body: { applicability: ["z".repeat(200)], limitations: ["w".repeat(200)] }, binding: { standing_at_compile: "ACTIVE", procedure_revision: 0 } }),
];

/* ================================================================ §5 the duplicate-handle confound */

describe("R2-S §5 — the duplicate-handle confound is removed", () => {
  it("every handle appears EXACTLY ONCE in the rendered S1 section", () => {
    const rendered = renderIndexMetadata(SIX_PRODUCTION_INDEX, sixEntries());
    for (const handle of SIX_HANDLES) expect(rendered.split(handle).length - 1).toBe(1);
  });

  it("the S0 and S1 handle OCCURRENCE COUNTS are EQUAL across all six handles", () => {
    const rendered = renderIndexMetadata(SIX_PRODUCTION_INDEX, sixEntries());
    const s0 = SIX_HANDLES.map((handle) => SIX_PRODUCTION_INDEX.split(handle).length - 1);
    const s1 = SIX_HANDLES.map((handle) => rendered.split(handle).length - 1);
    expect(s0).toEqual(s1);
    expect(s0.every((count) => count === 1)).toBe(true);
  });

  it("the renderer emits NO trailing duplicate `Handle:` line", () => {
    expect(renderIndexMetadata(SIX_PRODUCTION_INDEX, sixEntries())).not.toContain("    Handle: ");
  });

  it("an M1 entry's handle is not repeated inside its own block", () => {
    const [first] = sixEntries();
    const block = renderIndexMetadata(SIX_PRODUCTION_INDEX, [first]);
    expect(block.split("@ctx/proof/pc-1").length - 1).toBe(1);
  });
});

/* ================================================================ §9/§25 S0 is production */

describe("R2-S §9/§25 — S0 is byte-identical to the production index", () => {
  it("an empty entry list leaves the section UNCHANGED (the identity case)", () => {
    expect(renderIndexMetadata(SIX_PRODUCTION_INDEX, [])).toBe(SIX_PRODUCTION_INDEX);
  });

  it("S1 preserves the heading, the order and the trailing instructions", () => {
    const rendered = renderIndexMetadata(SIX_PRODUCTION_INDEX, sixEntries());
    expect(rendered).toContain("Project context available to this attempt (READ-ONLY; never authority):");
    expect(rendered).toContain("Do not invent handles: a handle that is not listed above will be refused.");
    const positions = SIX_HANDLES.map((handle) => rendered.indexOf(handle));
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("§12 the frozen projection budget and the P-A Procedure ruling are unchanged from R2-M", () => {
    expect(PREVIEW_BUDGET.proof).toBe(160);
    expect(PREVIEW_BUDGET.reasoning).toBe(160);
    expect(PREVIEW_BUDGET.procedureApplicability).toBe(120);
    expect(PREVIEW_BUDGET.procedureLimitations).toBe(120);
    expect(PROCEDURE_RULING).toBe("P-A");
  });
});

/* ================================================================ §19 the frozen schedule */

describe("R2-S §19 — the schedule is frozen before any trial", () => {
  it("is exactly 2 scenarios × 2 conditions × 5 repetitions = 20", () => {
    expect(trialPlan().length).toBe(EXPECTED_TRIALS);
    expect(EXPECTED_TRIALS).toBe(20);
  });

  it("every randomized block contains exactly S0 and S1", () => {
    for (const scenarioId of ["C", "D"]) {
      for (const block of blockOrder(5, scenarioId)) {
        expect([...block.order].sort().join(",")).toBe([...CONDITIONS].sort().join(","));
      }
    }
  });

  it("the order derives from ONE frozen seed and is not the same permutation every block", () => {
    expect(PROTOCOL_SEED).toBe(0x52_53_02_01);
    expect(new Set(blockOrder(5, "C").map((block) => block.order.join(","))).size).toBeGreaterThan(1);
  });

  it("§9 the two conditions map onto the frozen presentation modes", () => {
    expect(MODE_OF.S0).toBe("m0");
    expect(MODE_OF.S1).toBe("m1");
  });
});

/* ================================================================ §6/§7 the candidate sets */

describe("R2-S §6/§7 — the broad candidate set is 3 targets + 3 distractors", () => {
  it("§11 the five distractor sets per scenario are PAIRWISE DISTINCT", () => {
    for (const scenarioId of ["C", "D"]) {
      const keys = distractorSchedule(scenarioId, 5).map((entry) => entry.key);
      expect(new Set(keys).size).toBe(5);
    }
  });

  it("every set is exactly 3 TARGET + 3 DISTRACTOR, one item of each kind per role", () => {
    for (const scenarioId of ["C", "D"]) {
      for (const entry of distractorSchedule(scenarioId, 5)) {
        const set = candidateSetFor(scenarioId, entry.set);
        expect(set.targetCount).toBe(TARGET_COUNT);
        expect(set.distractorCount).toBe(DISTRACTOR_COUNT);
        expect(set.items.length).toBe(CANDIDATE_SET_SIZE);
        for (const kind of KINDS) expect(set.items.filter((item: any) => item.kind === kind).length).toBe(2);
      }
    }
  });

  it("§7 the target is the scenario's OWN bundle and no distractor is the target", () => {
    for (const scenarioId of ["C", "D"]) {
      for (const entry of distractorSchedule(scenarioId, 5)) {
        const set = candidateSetFor(scenarioId, entry.set);
        expect(set.targetBundleId).toBe(scenarioId);
        expect(set.distractorBundles).not.toContain(scenarioId);
        expect(assertDistractorIndependent(scenarioId, set).ok).toBe(true);
      }
    }
  });

  it("§7 every distractor bundle is in the scenario's declared pool", () => {
    for (const scenarioId of ["C", "D"]) {
      for (const entry of distractorSchedule(scenarioId, 5)) {
        for (const kind of KINDS) expect(DISTRACTOR_POOL[scenarioId]).toContain(entry.set[kind]);
      }
    }
  });

  it("§6 every pool member is REAL capital from a DISTINCT domain, not a fake string", () => {
    const domains = new Set<string>();
    for (const bundleId of ["B", "C", "D"]) {
      const bundle = bundleCapital(bundleId);
      expect(typeof bundle.proof.statement).toBe("string");
      expect([...bundle.proof.statement].length).toBeGreaterThan(80);
      expect(bundle.procedureClauses.length).toBeGreaterThan(0);
      domains.add(bundle.domain);
    }
    expect(domains.size).toBe(3);
    expect(BUNDLE_DOMAIN.B).not.toBe(BUNDLE_DOMAIN.C);
  });

  it("§11 the frozen schedule carries the distractor set so a trial cannot choose its own", () => {
    for (const trial of trialPlan()) {
      expect(trial.distractorSet).toBeDefined();
      expect(KINDS.every((kind: string) => typeof (trial.distractorSet as any)[kind] === "string")).toBe(true);
    }
  });
});

/* ================================================================ §14/§15 the outcomes */

describe("R2-S §14/§15 — the per-arm outcomes and the frozen verdict", () => {
  const trial = (target: number, distractor: number) => normalizeTrial({
    trialId: "C-S0-b0r0",
    scenario: "C_REPLAY_SAFE_REDUCER",
    condition: "S0",
    block: 0,
    repetition: 0,
    outcome: { targetPulls: target, distractorPulls: distractor, totalPulls: target + distractor },
    worker: { pulledHandles: [] },
    prompt: {},
    pairedState: {},
  });

  it("§14 computes Target Recall = target/3 and Distractor Pull Rate = distractor/3", () => {
    const summary = armSelectivity([trial(3, 0), trial(0, 3), trial(2, 1)]);
    expect(summary.targetPulls).toBe(5);
    expect(summary.distractorPulls).toBe(4);
    expect(summary.targetRecall).toBeCloseTo(5 / 9, 6);
    expect(summary.distractorPullRate).toBeCloseTo(4 / 9, 6);
  });

  it("§14 Pull Precision is UNKNOWN when nothing was pulled", () => {
    expect(armSelectivity([trial(0, 0)]).precision).toBe("UNKNOWN");
    expect(armSelectivity([trial(3, 1)]).precision).toBeCloseTo(0.75, 6);
  });

  it("§17 pull-all is recorded as its own fact, never as a failure", () => {
    const summary = armSelectivity([trial(3, 3), trial(3, 3)]);
    expect(summary.pullAll).toBe("2/2");
    expect(summary.targetRecall).toBe(1);
    expect(summary.distractorPullRate).toBe(1);
  });

  it("§14 a recall can never exceed 1 — the primary counts DISTINCT handles, not pull events", () => {
    /** A trial that pulled one handle twice and one more: two distinct items, so recall is 2/3, not 3/3. */
    const repeated = normalizeTrial({
      trialId: "C-S0-b0r0",
      scenario: "C_REPLAY_SAFE_REDUCER",
      condition: "S0",
      block: 0,
      repetition: 0,
      outcome: { targetPulls: 2, distractorPulls: 0, totalPulls: 2, unknownRolePulls: 0, pullEventCount: 3, repeatPulls: 1 },
      worker: { pulledHandles: [] },
      prompt: {},
      pairedState: {},
    });
    const summary = armSelectivity([repeated]);
    expect(summary.targetRecall).toBeLessThanOrEqual(1);
    expect(summary.targetRecall).toBeCloseTo(2 / 3, 6);
  });

  const arm = (targetPulls: number, distractorPulls: number, n = 5) => ({
    analysed: n,
    targetPulls,
    distractorPulls,
    targetRecall: targetPulls / (n * 3),
    distractorPullRate: distractorPulls / (n * 3),
    treatmentNotApplied: 0,
  });

  it("§20 REPLICATED requires BOTH scenarios to lower the distractor rate without losing target recall", () => {
    const verdict = analyseSelectivity({
      C: { s0: arm(9, 9), s1: arm(9, 3) },
      D: { s0: arm(8, 10), s1: arm(8, 2) },
    });
    expect(verdict.verdict).toBe(SELECTIVITY_VERDICTS.REPLICATED);
  });

  it("§15 does NOT call reduced retrieval an improvement when target recall FALLS", () => {
    const verdict = analyseSelectivity({
      C: { s0: arm(15, 15), s1: arm(3, 3) },
      D: { s0: arm(15, 15), s1: arm(3, 3) },
    });
    expect(verdict.verdict).toBe(SELECTIVITY_VERDICTS.NOT_IMPROVED);
  });

  it("§15 does NOT count a lower distractor rate when no target was retrieved at all", () => {
    const verdict = analyseSelectivity({
      C: { s0: arm(10, 15), s1: arm(0, 0) },
      D: { s0: arm(10, 15), s1: arm(0, 0) },
    });
    expect(verdict.verdict).toBe(SELECTIVITY_VERDICTS.NOT_IMPROVED);
  });

  it("PARTIAL when exactly one scenario clearly improves", () => {
    const verdict = analyseSelectivity({
      C: { s0: arm(9, 12), s1: arm(9, 3) },
      D: { s0: arm(9, 3), s1: arm(9, 12) },
    });
    expect(verdict.verdict).toBe(SELECTIVITY_VERDICTS.PARTIAL);
  });

  it("NOT_IMPROVED when both arms pull all six (the R2-M-style ceiling)", () => {
    const verdict = analyseSelectivity({
      C: { s0: arm(15, 15), s1: arm(15, 15) },
      D: { s0: arm(15, 15), s1: arm(15, 15) },
    });
    expect(verdict.verdict).toBe(SELECTIVITY_VERDICTS.NOT_IMPROVED);
  });

  it("§21 the verdict never reads task success", () => {
    const verdict = analyseSelectivity({
      C: { s0: arm(9, 12), s1: arm(9, 3) },
      D: { s0: arm(9, 12), s1: arm(9, 3) },
    });
    expect(JSON.stringify(verdict)).not.toMatch(/solve|acceptance|passed/iu);
  });

  it("does not treat a rate change as replication when the treatment was not applied", () => {
    const verdict = analyseSelectivity({
      C: { s0: arm(9, 12), s1: { ...arm(9, 3), treatmentNotApplied: 1 } },
      D: { s0: arm(9, 12), s1: { ...arm(9, 3), treatmentNotApplied: 1 } },
    });
    expect(verdict.verdict).not.toBe(SELECTIVITY_VERDICTS.REPLICATED);
  });
});

/* ================================================================ §10/§11 the isolation check */

describe("R2-S §10/§11 — the isolation check protects the treatment", () => {
  const promptFor = (condition: string, overrides: Record<string, unknown> = {}) => ({
    ordinaryTaskDigest: "T",
    indexPresentationDigest: condition === "S0" ? "P" : "I",
    productionIndexDigest: "P",
    toolCatalogDigest: "C",
    pullToolDescriptionDigest: "D",
    capabilitySetDigest: "S",
    handlesInPayload: SIX_HANDLES.map((handle) => `proof:${handle}`),
    compiledHandleOrder: [...SIX_HANDLES],
    indexHandleCount: 6,
    ...overrides,
  });

  const base = (condition: string, overrides: Record<string, unknown> = {}) => normalizeTrial({
    trialId: `C-${condition}-b0r0`,
    scenario: "C_REPLAY_SAFE_REDUCER",
    condition,
    block: 0,
    repetition: 0,
    outcome: { targetPulls: 3, distractorPulls: 0, totalPulls: 3, unknownRolePulls: 0 },
    worker: { pulledHandles: [], pulledKinds: [] },
    prompt: promptFor(condition),
    pairedState: {},
    pullAccounting: { derivationPullOffset: condition === "S1" ? 6 : 0, derivedCount: condition === "S1" ? 6 : 0, consistent: true },
    session: { found: true, indexSectionFound: true, handlesInPrompt: [...SIX_HANDLES], artifactDigest: "a".repeat(64), promptDigest: "b".repeat(64) },
    handleOccurrenceExact: true,
    pairedOrderExact: true,
    treatmentApplied: true,
    ...overrides,
  });

  it("a clean pair is not confounded", () => {
    const blocks = isolationCheck([base("S0"), base("S1")]);
    expect(blocks[0]!.confounded).toBe(false);
  });

  it("flags a pair whose ARMS DID NOT DIFFER", () => {
    const blocks = isolationCheck([base("S0"), base("S1", { prompt: promptFor("S1", { indexPresentationDigest: "P" }) })]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/identical across conditions/u);
  });

  it("§10 flags a pair whose selected handle ORDER differs across conditions", () => {
    const blocks = isolationCheck([base("S0"), base("S1", { prompt: promptFor("S1", { compiledHandleOrder: [...SIX_HANDLES].reverse() }) })]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/handle ORDER differs/u);
  });

  it("§5 flags a pair where a handle does not appear exactly once", () => {
    const blocks = isolationCheck([base("S0"), base("S1", { handleOccurrenceExact: false })]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/duplicate-handle confound/u);
  });

  it("§6 flags a pair whose candidate set is not six items", () => {
    /** `selectedHandleCount` is derived from `prompt.handlesInPayload`, so the fixture varies THAT. */
    const blocks = isolationCheck([base("S0"), base("S1", { prompt: promptFor("S1", { handlesInPayload: SIX_HANDLES.slice(0, 3).map((handle) => `proof:${handle}`), compiledHandleOrder: SIX_HANDLES.slice(0, 3) }) })]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/selected handles/u);
  });

  it("flags an S1 trial whose treatment was not proven at the session boundary", () => {
    const blocks = isolationCheck([base("S0"), base("S1", { treatmentApplied: false })]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/not proven at the model-visible session boundary/u);
  });

  it("flags a pair whose S0 index is not byte-identical to production", () => {
    const blocks = isolationCheck([base("S0", { prompt: promptFor("S0", { indexPresentationDigest: "X" }) }), base("S1")]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/not byte-identical/u);
  });

  it("flags a pull whose role is unknown (the role map missed a handle)", () => {
    const blocks = isolationCheck([base("S0"), base("S1", { outcome: { targetPulls: 3, distractorPulls: 0, totalPulls: 4, unknownRolePulls: 1 } })]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/no known role/u);
  });

  it("§13 flags a pair where NO session artifact was found (delivery unprovable)", () => {
    const blocks = isolationCheck([base("S0"), base("S1", { session: { found: false, indexSectionFound: false, handlesInPrompt: [] } })]);
    expect(blocks[0]!.confounded).toBe(true);
    expect(blocks[0]!.differences.join(" ")).toMatch(/no durable session artifact/u);
  });
});

/* ================================================================ §5 the renderer source */

describe("R2-S §5 — the renderer source carries no trailing handle line", () => {
  it("the renderer's entry block does not push a `Handle:` line", () => {
    const source = readFileSync(join(REPO_ROOT, "host", "dsh", "lib", "index-metadata.js"), "utf8");
    expect(source).not.toMatch(/lines\.push\(` {4}Handle: /u);
  });
});
