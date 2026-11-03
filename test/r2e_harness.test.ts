/**
 * R2-E §24 — DETERMINISTIC HARNESS TESTS.
 *
 * These test the EXPERIMENT, not the product, and NO stochastic success threshold is encoded: nothing here
 * asserts that capital will help, because that is the measurement rather than a precondition of it.
 *
 * The load-bearing tests are the ones that would silently invalidate the stage if they regressed:
 *
 *   · the default production path is byte-identical, and an unrecognized mode cannot enable an arm;
 *   · the E0 control carries NO capital while sharing the section boundary;
 *   · the treatment preserves the three kinds and frames each as non-authority;
 *   · an E1 trial is only analysable when EVERY selected handle was consumed;
 *   · the pairing check flags a block whose invariant components differ or whose arms did not differ;
 *   · the Procedure marker is BEHAVIOURAL — it discriminates across the generation ladder rather than
 *     reporting "delivered" as "effective".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { armSummary, analyseEfficacy, blockOrder, CONDITIONS, EFFICACY_VERDICTS, EXPECTED_TRIALS, procedureMarkerFor, PROTOCOL_SEED, trialPlan } from "../scripts/r2e/design.mjs";
import { normalizeTrial, pairingCheck } from "../scripts/r2e/analyse.mjs";
import { SCENARIO_C_GENERATIONS } from "../scripts/r1r/teacher-exploration.mjs";
import { SCENARIO_D_GENERATIONS } from "../scripts/r2u/teacher-exploration.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The host bundle's efficacy seam: JavaScript outside the TS program, so loaded through a URL. */
const efficacyPath = pathToFileURL(join(REPO_ROOT, "host", "dsh", "lib", "efficacy.js")).href;
const { EFFICACY_MODES, EFFICACY_SECTION_HEADING, KIND_FRAMING, PREWORK_MECHANISM, applyEfficacyReview, bodyDigest, bodyTextOf, renderEfficacyReview, resolveEfficacyMode } = (await import(efficacyPath)) as {
  readonly EFFICACY_MODES: Readonly<{ OFF: string; E0: string; E1: string }>;
  readonly EFFICACY_SECTION_HEADING: string;
  readonly KIND_FRAMING: Readonly<Record<string, string>>;
  readonly PREWORK_MECHANISM: string;
  readonly applyEfficacyReview: (text: string, input: { mode: string; resolved?: readonly unknown[]; failures?: readonly unknown[] }) => string;
  readonly bodyDigest: (body: unknown) => string;
  readonly bodyTextOf: (result: unknown) => string;
  readonly renderEfficacyReview: (input: { mode: string; resolved?: readonly { handle: string; kind: string; body: unknown }[]; failures?: readonly { handle: string; detail: string }[] }) => string;
  readonly resolveEfficacyMode: (value: string | undefined) => string;
};

const golden = readFileSync(join(REPO_ROOT, "scripts", "r2u", "fixtures", "production-prompt.golden.txt"), "utf8");

/* ================================================================ §24 the default path */

describe("R2-E §24 — the experimental mode is absent by default", () => {
  it("the DEFAULT mode returns the prompt UNCHANGED (byte-identical to production)", () => {
    expect(applyEfficacyReview(golden, { mode: EFFICACY_MODES.OFF })).toBe(golden);
  });

  it("an UNSET or unrecognized mode resolves to OFF, so a typo cannot enable an arm", () => {
    for (const value of [undefined, "", "E1 ", "e1x", "E0x", "on", "true", "1", "E"]) {
      expect(resolveEfficacyMode(value)).toBe(EFFICACY_MODES.OFF);
    }
    expect(resolveEfficacyMode("e0")).toBe(EFFICACY_MODES.E0);
    expect(resolveEfficacyMode("e1")).toBe(EFFICACY_MODES.E1);
  });

  it("both arms are ADDITIVE: each carries the production prompt as a prefix", () => {
    expect(applyEfficacyReview(golden, { mode: EFFICACY_MODES.E0 }).startsWith(golden)).toBe(true);
    expect(applyEfficacyReview(golden, { mode: EFFICACY_MODES.E1, resolved: [{ handle: "@ctx/proof/p", kind: "proof", body: "S" }] }).startsWith(golden)).toBe(true);
  });
});

/* ================================================================ §11/§12 the two arms */

describe("R2-E §11/§12 — the arms differ in content, not in shape", () => {
  it("the E0 control carries the SAME section boundary and states no capital was selected", () => {
    const e0 = applyEfficacyReview(golden, { mode: EFFICACY_MODES.E0 });
    expect(e0).toContain(EFFICACY_SECTION_HEADING);
    expect(e0).toContain("No inherited project capital was selected");
    expect(e0).toContain("Proceed using the project and task normally.");
  });

  it("the E0 control contains NO capital of any kind (no sham capital)", () => {
    const e0 = renderEfficacyReview({ mode: EFFICACY_MODES.E0, resolved: [{ handle: "@ctx/proof/p", kind: "proof", body: "SHOULD NOT APPEAR" }] });
    expect(e0).not.toContain("SHOULD NOT APPEAR");
    expect(e0).toBe(renderEfficacyReview({ mode: EFFICACY_MODES.E0 }));
  });

  it("the E1 section carries the SAME boundary as E0", () => {
    expect(renderEfficacyReview({ mode: EFFICACY_MODES.E1, resolved: [] })).toContain(EFFICACY_SECTION_HEADING);
  });

  it("§11: the treatment preserves the three kinds, each framed as NON-authority", () => {
    const e1 = renderEfficacyReview({
      mode: EFFICACY_MODES.E1,
      resolved: [
        { handle: "@ctx/proof/p", kind: "proof", body: { statement: "P" } },
        { handle: "@ctx/reasoning/r", kind: "reasoning", body: { statement: "R" } },
        { handle: "@ctx/procedure/pr", kind: "procedure", body: { title: "M" } },
      ],
    });
    expect(e1).toContain("PROOF");
    expect(e1).toContain("REASONING");
    expect(e1).toContain("PROCEDURE");
    expect(e1).toContain(KIND_FRAMING.proof);
    expect(e1).toContain(KIND_FRAMING.reasoning);
    expect(e1).toContain(KIND_FRAMING.procedure);
    expect(KIND_FRAMING.proof).toContain("not authority");
    expect(KIND_FRAMING.procedure).toContain("cannot widen WHAT");
  });

  it("§9: a handle that did NOT resolve is stated rather than hidden", () => {
    const e1 = renderEfficacyReview({ mode: EFFICACY_MODES.E1, resolved: [], failures: [{ handle: "@ctx/proof/p", detail: "refused" }] });
    expect(e1).toContain("CAPITAL THAT COULD NOT BE DELIVERED");
    expect(e1).toContain("@ctx/proof/p");
  });

  it("the kinds render in a deterministic order regardless of pull order", () => {
    const first = renderEfficacyReview({ mode: EFFICACY_MODES.E1, resolved: [{ handle: "@ctx/procedure/x", kind: "procedure", body: "c" }, { handle: "@ctx/proof/x", kind: "proof", body: "a" }] });
    const second = renderEfficacyReview({ mode: EFFICACY_MODES.E1, resolved: [{ handle: "@ctx/proof/x", kind: "proof", body: "a" }, { handle: "@ctx/procedure/x", kind: "procedure", body: "c" }] });
    expect(first).toBe(second);
  });

  it("bodyDigest is stable and order-insensitive over object keys", () => {
    expect(bodyDigest({ a: 1, b: 2 })).toBe(bodyDigest({ b: 2, a: 1 }));
    expect(bodyDigest({ a: 1 })).not.toBe(bodyDigest({ a: 2 }));
  });

  it("bodyTextOf reads the parent resolver's normalized `body` first", () => {
    expect(bodyTextOf({ body: "direct" })).toBe("direct");
    expect(bodyTextOf({ claim: { statement: "S" } })).toContain("S");
  });
});

/* ================================================================ §14 the randomized design */

describe("R2-E §14 — the randomized schedule is the frozen one", () => {
  it("is 2 scenarios × 2 conditions × 5 repetitions = 20 trials", () => {
    expect(trialPlan().length).toBe(EXPECTED_TRIALS);
    expect(EXPECTED_TRIALS).toBe(20);
  });

  it("every block contains exactly E0 and E1", () => {
    for (const scenarioId of ["C", "D"]) {
      for (const block of blockOrder(5, scenarioId)) {
        expect([...block.order].sort()).toEqual([...CONDITIONS].sort());
      }
    }
  });

  it("derives its order from ONE frozen seed", () => {
    expect(PROTOCOL_SEED).toBe(0x52_45_02_01);
  });
});

/* ================================================================ §18 the verdict, pre-declared */

describe("R2-E §18 — the efficacy verdict follows the pre-declared criteria", () => {
  const arm = (solved: number, recurred: number, marker = 0, notMet = 0) => ({
    analysed: 5, fullSolveRate: solved / 5, firstCandidateSolveRate: solved / 5,
    mistakeRecurrenceRate: recurred / 5, procedureMarkerRate: marker / 5,
    fullSolved: `${solved}/5`, firstCandidateSolved: `${solved}/5`, mistakeRecurred: `${recurred}/5`,
    procedureMarkerReflected: `${marker}/5`, preconditionNotMet: notMet,
  });

  it("REPLICATED when both scenarios cut mistakes without losing solves, with the precondition met", () => {
    expect(analyseEfficacy({ C: { e0: arm(2, 4), e1: arm(3, 1) }, D: { e0: arm(0, 5), e1: arm(2, 2) } }).verdict).toBe(EFFICACY_VERDICTS.REPLICATED);
  });

  it("PARTIAL when exactly one scenario benefits", () => {
    expect(analyseEfficacy({ C: { e0: arm(2, 4), e1: arm(3, 1) }, D: { e0: arm(0, 5), e1: arm(0, 5) } }).verdict).toBe(EFFICACY_VERDICTS.PARTIAL);
  });

  it("NOT_OBSERVED when neither scenario shows benefit despite guaranteed consumption", () => {
    expect(analyseEfficacy({ C: { e0: arm(2, 4), e1: arm(2, 4) }, D: { e0: arm(0, 5), e1: arm(0, 5) } }).verdict).toBe(EFFICACY_VERDICTS.NOT_OBSERVED);
  });

  it("fewer mistakes but a WORSE mechanical outcome does not count as directional benefit", () => {
    expect(analyseEfficacy({ C: { e0: arm(4, 4), e1: arm(1, 1) }, D: { e0: arm(4, 4), e1: arm(1, 1) } }).verdict).toBe(EFFICACY_VERDICTS.NOT_OBSERVED);
  });

  it("§9: a scenario whose E1 precondition was not met cannot be a REPLICATED half", () => {
    const result = analyseEfficacy({ C: { e0: arm(2, 4), e1: arm(3, 1, 0, 1) }, D: { e0: arm(2, 4), e1: arm(3, 1, 0, 1) } });
    expect(result.verdict).not.toBe(EFFICACY_VERDICTS.REPLICATED);
    expect(result.scenarios.C?.preconditionMet).toBe(false);
  });

  it("armSummary computes the rates the verdict consumes", () => {
    const summary = armSummary([
      { finalAcceptanceSolved: true, firstCandidateSolved: true, knownFailureRecurred: false, procedureMarkerReflected: true, preconditionMet: true },
      { finalAcceptanceSolved: false, firstCandidateSolved: false, knownFailureRecurred: true, procedureMarkerReflected: false, preconditionMet: true },
    ] as never);
    expect(summary.fullSolved).toBe("1/2");
    expect(summary.mistakeRecurred).toBe("1/2");
    expect(summary.fullSolveRate).toBe(0.5);
  });
});

/* ================================================================ §13 pairing */

describe("R2-E §13 — the pairing check", () => {
  const pair = (mutate: (condition: string) => Record<string, unknown>) =>
    CONDITIONS.map((condition) => ({
      scenario: "S",
      condition,
      block: 0,
      ordinaryTaskDigest: "ordinary",
      indexSectionDigest: condition === "E1" ? "index-1" : "index-0",
      efficacySectionDigest: condition === "E1" ? "section-1" : "section-0",
      capabilitySetDigest: "capabilities",
      indexHandleCount: condition === "E1" ? 3 : 0,
      selectedCount: condition === "E1" ? 3 : 0,
      consumedHandles: condition === "E1" ? ["a", "b", "c"] : [],
      resolvedCount: condition === "E1" ? 3 : 0,
      preconditionMet: true,
      pairedState: { scenarioId: "S", taskSemanticDigest: "task", startingTreeDigest: "tree", targetSourceDigest: "src", visibleTestDigest: "visible", hiddenOracleDigest: "hidden", visibleFileCount: 5 },
      ...mutate(condition),
    }));

  it("accepts a pair whose invariant components match and whose sections differ", () => {
    expect(pairingCheck(pair(() => ({})) as never)[0]?.confounded).toBe(false);
  });

  it("§13: records the index moving with the arm as an OBSERVATION, not a confound", () => {
    const blocks = pairingCheck(pair(() => ({})) as never);
    expect(blocks[0]?.indexMovedWithArm).toBe(true);
    expect(blocks[0]?.indexHandleCounts).toEqual([0, 3]);
    expect(blocks[0]?.confounded).toBe(false);
  });

  it("flags a pair whose ordinary task text differs across arms", () => {
    const blocks = pairingCheck(pair((condition) => (condition === "E1" ? { ordinaryTaskDigest: "different" } : {})) as never);
    expect(blocks[0]?.confounded).toBe(true);
    expect(blocks[0]?.differences.join(" ")).toContain("ordinary task text");
  });

  it("flags a pair whose efficacy section is IDENTICAL (the treatment was not applied)", () => {
    const blocks = pairingCheck(pair((condition) => (condition === "E1" ? { efficacySectionDigest: "section-0" } : {})) as never);
    expect(blocks[0]?.confounded).toBe(true);
    expect(blocks[0]?.differences.join(" ")).toContain("efficacy section is identical");
  });

  it("§12: flags a control that carries capital", () => {
    const blocks = pairingCheck(pair((condition) => (condition === "E0" ? { selectedCount: 1, consumedHandles: ["x"] } : {})) as never);
    expect(blocks[0]?.confounded).toBe(true);
    expect(blocks[0]?.differences.join(" ")).toContain("E0 control carries capital");
  });

  it("§16: flags an E1 arm that did not consume all selected handles", () => {
    const blocks = pairingCheck(pair((condition) => (condition === "E1" ? { preconditionMet: false, resolvedCount: 1 } : {})) as never);
    expect(blocks[0]?.confounded).toBe(true);
    expect(blocks[0]?.differences.join(" ")).toContain("did not consume all selected handles");
  });

  it("normalizeTrial records the three condition components separately", () => {
    const normalized = normalizeTrial({
      trialId: "t", scenario: "S", condition: "E1", block: 0, repetition: 0,
      prompt: { ordinaryTaskDigest: "o", indexSectionDigest: "i", efficacySectionDigest: "e", capabilitySetDigest: "c" },
      prework: { mechanism: PREWORK_MECHANISM, selectedCount: 3, resolvedCount: 3, handles: ["a"], digests: ["proof:a:deadbeef"], failures: [], allConsumed: true },
      preconditionMet: true, efficacyPrecondition: "MET", consumedBeforeFirstEdit: true,
      worker: {}, pairedState: null,
    } as never);
    expect(normalized.ordinaryTaskDigest).toBe("o");
    expect(normalized.indexSectionDigest).toBe("i");
    expect(normalized.efficacySectionDigest).toBe("e");
    expect(normalized.preconditionMet).toBe(true);
    expect(normalized.consumedBeforeFirstEdit).toBe(true);
  });

  it("§9: a trial whose prework did not consume everything normalizes to an UNMET precondition", () => {
    const normalized = normalizeTrial({
      trialId: "t", scenario: "S", condition: "E1", block: 0, repetition: 0,
      prework: { mechanism: PREWORK_MECHANISM, selectedCount: 3, resolvedCount: 1, handles: ["a"], digests: [], failures: [{ handle: "b", detail: "refused" }], allConsumed: false },
      preconditionMet: false, efficacyPrecondition: "EFFICACY_PRECONDITION_NOT_MET",
      worker: {}, pairedState: null,
    } as never);
    expect(normalized.preconditionMet).toBe(false);
    expect(normalized.efficacyPrecondition).toBe("EFFICACY_PRECONDITION_NOT_MET");
  });
});

/* ================================================================ §17 the behavioural marker */

describe("R2-E §17 — the Procedure marker is BEHAVIOURAL, not a delivery claim", () => {
  it("Scenario D: only the MATURE generation reflects the method; every naive one does not", () => {
    const reflected = SCENARIO_D_GENERATIONS.map((generation) => ({ id: generation.id, reflected: procedureMarkerFor("D", generation.invalidate).reflected }));
    expect(reflected[reflected.length - 1]?.reflected).toBe(true);
    for (const entry of reflected.slice(0, -1)) expect(entry.reflected, `${entry.id} must not reflect the method`).toBe(false);
  });

  it("Scenario C: only the MATURE generation reflects the method; every naive one does not", () => {
    const reflected = SCENARIO_C_GENERATIONS.map((generation) => ({ id: generation.id, reflected: procedureMarkerFor("C", generation.reduce).reflected }));
    expect(reflected[reflected.length - 1]?.reflected).toBe(true);
    for (const entry of reflected.slice(0, -1)) expect(entry.reflected, `${entry.id} must not reflect the method`).toBe(false);
  });

  it("Scenario D's marker covers the unresolvable-dependency clause the D3 observation forced", () => {
    const withOrphan = (cache: Record<string, { value: unknown; deps: readonly string[] }>, changed: readonly unknown[]) => {
      for (const id of changed) if (typeof id === "string") delete (cache as Record<string, unknown>)[id];
      // Invalidates descendants but IGNORES an entry whose dependency is absent.
      return cache;
    };
    const result = procedureMarkerFor("D", withOrphan as never);
    expect(result.reflected).toBe(false);
    expect(result.violations.map((entry) => entry.probe)).toContain("m03");
  });

  it("names the marker after the scenario's own method", () => {
    expect(procedureMarkerFor("C", SCENARIO_C_GENERATIONS[0]!.reduce).marker).toBe("validatesWholeHistoryBeforeMutating");
    expect(procedureMarkerFor("D", SCENARIO_D_GENERATIONS[0]!.invalidate).marker).toBe("freezesAffectedClosureBeforeMutating");
  });
});
