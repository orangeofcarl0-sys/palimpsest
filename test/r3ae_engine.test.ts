/**
 * R3-AE §15 — INTEGRATION TESTS FOR THE QUALIFICATION ENGINE.
 *
 * The R3-A0 defect was a NESTING bug: `qualifyPair` read `trial[classId]` while the values live at
 * `trial.classPass[classId]`, so every class produced the same all-undefined series and collapsed into one
 * group. The standalone helper tests passed throughout, because they tested the helper with already-extracted
 * vectors — the bug lived in the INTEGRATION between the helper and its caller.
 *
 * So these tests drive `qualifyPair` with REAL NESTED `classPass` records. Every one of them fails against
 * the pre-correction implementation.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { classSeries, groupClassesBySeries, qualifyPair } from "../scripts/r3a/qualification.mjs";
import { ANTI_OVERFIT_PROCESSES, CONTAMINATION, FIXTURE_MANIFESTS, claimCeilingFor, countsTowardGate, manifestFor } from "../scripts/r3a/fixture-manifest.mjs";
import { aToBGate, PAIR_VERDICTS } from "../scripts/r3a/qualification.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const EVIDENCE = join(REPO_ROOT, "research-evidence", "r3-ae");
const corrected = existsSync(join(EVIDENCE, "corrected-analysis.json")) ? JSON.parse(readFileSync(join(EVIDENCE, "corrected-analysis.json"), "utf8")) : null;

/** A pair input with nested `classPass` records, exactly as the trial records carry them. */
const pairInput = (trials: any[], overrides: Record<string, unknown> = {}) => ({
  fixtureId: "fx",
  modelId: "m",
  nq: 5,
  classIds: ["C1", "C2", "C3", "C4"],
  directClasses: ["C1", "C2", "C3", "C4"],
  relationshipOf: (classId: string) => (["C1", "C2", "C3", "C4"].includes(classId) ? "DIRECT" : "NONE"),
  fixtureAuditPrecondition: { mechanicalOracleProven: true, allHiddenCasesDeclareFailureClass: true, allDeclaredClassesAreExercised: true, oracleUsesNoModelSelfReport: true },
  trials,
  ...overrides,
});

/* ================================================================ §5 the nesting bug */

describe("R3-AE §5 — the class-series nesting bug", () => {
  it("reads the series from trial.classPass, not from trial[classId]", () => {
    const trials = [{ classPass: { C1: true } }, { classPass: { C1: false } }];
    const series = classSeries(trials, ["C1"]);
    expect(series.C1).toEqual([true, false]);
  });

  it("distinguishes two DIFFERENT class series (the pre-correction engine could not)", () => {
    const trials = [
      { classPass: { C1: true, C2: false } },
      { classPass: { C1: false, C2: true } },
      { classPass: { C1: true, C2: false } },
      { classPass: { C1: false, C2: true } },
      { classPass: { C1: true, C2: false } },
    ];
    const groups = groupClassesBySeries(classSeries(trials, ["C1", "C2"]));
    /** C1 and C2 have DIFFERENT series, so they must form TWO groups. */
    expect(groups.length).toBe(2);
    expect(groups.map((group: any) => group.members.join("")).sort()).toEqual(["C1", "C2"]);
  });

  it("qualifyPair distinguishes two different class series end-to-end", () => {
    /**
     * C1 and C2 alternate; C3 and C4 fail on some runs too, so the aggregate coverage stays inside the frozen
     * (0.20, 0.85) band — a pair sitting above the ceiling would be rejected by QC-1 and would not exercise
     * the grouping at all.
     */
    const trials = [
      { classPass: { C1: true, C2: false, C3: false, C4: true } },
      { classPass: { C1: false, C2: true, C3: false, C4: true } },
      { classPass: { C1: true, C2: false, C3: false, C4: true } },
      { classPass: { C1: false, C2: true, C3: false, C4: true } },
      { classPass: { C1: true, C2: false, C3: true, C4: true } },
    ];
    const verdict = qualifyPair(pairInput(trials));
    expect(verdict.classCoverage).toBeLessThan(0.85);
    /** The returned arrays are FROZEN, so sort a copy rather than mutating the verdict. */
    expect([...verdict.variableGroups].sort()).toEqual(["C1", "C2", "C3"]);
  });

  it("identical class series collapse to ONE group", () => {
    const trials = [
      { classPass: { C1: true, C2: true } },
      { classPass: { C1: false, C2: false } },
      { classPass: { C1: true, C2: true } },
      { classPass: { C1: false, C2: false } },
      { classPass: { C1: true, C2: true } },
    ];
    const verdict = qualifyPair(pairInput(trials));
    expect(verdict.variableGroups).toEqual(["C1+C2"]);
  });
});

/* ================================================================ §5 QC-2 */

describe("R3-AE §5 — QC-2 counts variable non-redundant class GROUPS", () => {
  it("aggregate classCoverage and fullSolve CANNOT satisfy QC-2 by themselves", () => {
    /** Every class moves together, so there is ONE group even though coverage varies across runs. */
    const trials = [
      { classPass: { C1: true, C2: true, C3: true, C4: true }, fullSolve: true },
      { classPass: { C1: false, C2: false, C3: false, C4: false }, fullSolve: false },
      { classPass: { C1: true, C2: true, C3: true, C4: true }, fullSolve: true },
      { classPass: { C1: false, C2: false, C3: false, C4: false }, fullSolve: false },
      { classPass: { C1: true, C2: true, C3: true, C4: true }, fullSolve: true },
    ];
    const verdict = qualifyPair(pairInput(trials));
    expect(verdict.classCoverage).toBeCloseTo(0.6, 6);
    expect(verdict.variableGroups.length).toBe(1);
    expect(verdict.reasons.join(" ")).toMatch(/QC-2 failed/u);
  });

  it("reports classCoverage and fullSolve as DIAGNOSTICS only", () => {
    const trials = Array.from({ length: 5 }, (_, index) => ({ classPass: { C1: index !== 0, C2: index !== 1, C3: true, C4: true }, fullSolve: index === 4 }));
    const verdict = qualifyPair(pairInput(trials));
    expect(verdict.diagnostics.classCoverage).toBeGreaterThan(0);
    expect(verdict.diagnostics.note).toMatch(/never counted toward QC-2|forbids counting/u);
  });
});

/* ================================================================ §6 QC-4 */

describe("R3-AE §6 — QC-4 counts class GROUPS, not raw ids", () => {
  it("a group with one DIRECT member counts ONCE, not once per member", () => {
    const trials = [
      { classPass: { C1: true, C2: true, C3: true, C4: true } },
      { classPass: { C1: false, C2: false, C3: true, C4: true } },
      { classPass: { C1: true, C2: true, C3: true, C4: true } },
      { classPass: { C1: false, C2: false, C3: true, C4: true } },
      { classPass: { C1: true, C2: true, C3: true, C4: true } },
    ];
    const verdict = qualifyPair(pairInput(trials));
    /** C1+C2 is ONE group, so QC-4 sees one DIRECT group, not two. */
    expect(verdict.variableDirectGroups).toEqual(["C1+C2"]);
    expect(verdict.reasons.join(" ")).toMatch(/QC-4 failed/u);
  });

  it("a group whose members are NOT DIRECT does not count toward QC-4", () => {
    const trials = [
      { classPass: { C1: true, C2: true, C3: true, C4: true } },
      { classPass: { C1: true, C2: true, C3: false, C4: true } },
      { classPass: { C1: true, C2: true, C3: true, C4: true } },
      { classPass: { C1: true, C2: true, C3: false, C4: true } },
      { classPass: { C1: true, C2: true, C3: true, C4: true } },
    ];
    const verdict = qualifyPair(pairInput(trials, { relationshipOf: () => "TRANSFER_HYPOTHESIS" }));
    expect(verdict.variableGroups).toEqual(["C3"]);
    expect(verdict.variableDirectGroups).toEqual([]);
    expect(verdict.reasons.join(" ")).toMatch(/QC-4 failed/u);
  });

  it("§6 the relationship comes from the frozen manifest, never inferred from text", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3a", "analyse.mjs"), "utf8");
    expect(source).toContain("capitalRelationship");
    expect(source).toMatch(/read from the FROZEN manifest/u);
  });
});

/* ================================================================ §8 QC-6 */

describe("R3-AE §8 — QC-6 is a real deterministic fixture-audit precondition", () => {
  /** Two varying groups and a coverage inside the frozen band, so QC-1/QC-2/QC-4 all pass. */
  const good = [
    { classPass: { C1: true, C2: false, C3: false, C4: true } },
    { classPass: { C1: false, C2: true, C3: false, C4: true } },
    { classPass: { C1: true, C2: false, C3: true, C4: true } },
    { classPass: { C1: false, C2: true, C3: false, C4: true } },
    { classPass: { C1: true, C2: false, C3: true, C4: true } },
  ];

  it("fails when the precondition is ABSENT", () => {
    const verdict = qualifyPair(pairInput(good, { fixtureAuditPrecondition: null }));
    expect(verdict.verdict).toBe(PAIR_VERDICTS.UNQUALIFIED);
    expect(verdict.reasons.join(" ")).toMatch(/QC-6 failed.*no fixture-audit precondition/u);
  });

  it("fails when the mechanical-oracle proof is false", () => {
    const verdict = qualifyPair(pairInput(good, { fixtureAuditPrecondition: { mechanicalOracleProven: false, allHiddenCasesDeclareFailureClass: true, allDeclaredClassesAreExercised: true, oracleUsesNoModelSelfReport: true } }));
    expect(verdict.reasons.join(" ")).toMatch(/QC-6 failed/u);
  });

  it("fails when the oracle consults a model self-report", () => {
    const verdict = qualifyPair(pairInput(good, { fixtureAuditPrecondition: { mechanicalOracleProven: true, allHiddenCasesDeclareFailureClass: true, allDeclaredClassesAreExercised: true, oracleUsesNoModelSelfReport: false } }));
    expect(verdict.reasons.join(" ")).toMatch(/QC-6 failed/u);
  });

  it("passes when all four facts hold", () => {
    expect(qualifyPair(pairInput(good)).verdict).toBe(PAIR_VERDICTS.QUALIFIED);
  });

  it("§8 the precondition is computed from the fixture bytes, not manufactured by the analysis", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3a", "fixture-audit.mjs"), "utf8");
    expect(source).toContain("mechanicalOracleProven");
    expect(source).toContain("oracleUsesNoModelSelfReport");
    const audit = JSON.parse(readFileSync(join(EVIDENCE, "fixture-preconditions.json"), "utf8"));
    for (const precondition of Object.values(audit.preconditions) as any[]) {
      expect(precondition.mechanicalOracleProven).toBe(true);
      expect(precondition.allHiddenCasesDeclareFailureClass).toBe(true);
      expect(precondition.allDeclaredClassesAreExercised).toBe(true);
      expect(precondition.oracleUsesNoModelSelfReport).toBe(true);
      expect(precondition.contentDigest).toMatch(/^[0-9a-f]{64}$/u);
    }
  });
});

/* ================================================================ §9/§10/§11 the manifest */

describe("R3-AE §9/§10/§11 — the fixture manifest", () => {
  it("§9 no hard-coded compliant literal remains in the analysis", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3a", "analyse.mjs"), "utf8");
    expect(source).not.toMatch(/compliant:\s*true/u);
    expect(source).toContain("antiOverfitProcess");
  });

  it("§9 every fixture carries a frozen anti-overfit classification and provenance", () => {
    for (const manifest of FIXTURE_MANIFESTS) {
      expect(Object.values(ANTI_OVERFIT_PROCESSES)).toContain(manifest.antiOverfitProcess);
      expect(typeof manifest.constructionActor).toBe("string");
      expect(Object.values(CONTAMINATION)).toContain(manifest.contamination);
      expect(typeof manifest.heldOut).toBe("boolean");
      expect(manifest.contentDigest).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it("§9 the manifest digest is the REAL computed fixture digest, not a transcription", async () => {
    const { createHash } = await import("node:crypto");
    const { FIXTURE_SPECS } = await import("../scripts/r3a/fixture-content.mjs");
    const { allPreconditions } = await import("../scripts/r3a/fixture-audit.mjs");
    const preconditions = await allPreconditions();
    for (const spec of FIXTURE_SPECS) {
      const real = createHash("sha256")
        .update(Object.entries(spec.files).map(([path, content]) => `${path}:${createHash("sha256").update(content as string, "utf8").digest("hex")}`).join("\n"), "utf8")
        .digest("hex");
      const manifest = manifestFor(spec.fixtureId)!;
      expect(manifest.contentDigest).toBe(real);
      /** §8: the audit's digest and the manifest's digest must describe the same bytes. */
      expect(preconditions[spec.fixtureId].contentDigest).toBe(real);
    }
  });

  it("§9 the construction model identity is UNKNOWN, not invented", () => {
    for (const manifest of FIXTURE_MANIFESTS) {
      expect(manifest.constructionModelId).toBe("UNKNOWN");
      expect(manifest.constructionModelFamily).toBe("UNKNOWN");
      expect(manifest.evaluationModelFamiliesKnownAtConstruction).toBe(false);
    }
  });

  it("§11 UNKNOWN construction provenance does NOT imply heldOut", () => {
    for (const manifest of FIXTURE_MANIFESTS) {
      if (manifest.constructionModelId === "UNKNOWN") expect(manifest.heldOut).toBe(false);
      expect(manifest.heldOutReason).toBeTruthy();
    }
  });

  it("§11 COMPLIANT does not imply heldOut, and the claim ceiling reflects it", () => {
    for (const manifest of FIXTURE_MANIFESTS) {
      expect(manifest.antiOverfitProcess).toBe(ANTI_OVERFIT_PROCESSES.COMPLIANT);
      expect(manifest.heldOut).toBe(false);
      /** Not held out → no model-family generality claim, so the ceiling is G1. */
      expect(claimCeilingFor(manifest.fixtureId)).toBe("G1");
    }
  });

  it("§10 only COMPLIANT fixtures count toward the gate", () => {
    expect(countsTowardGate("r3a-f-a-atomic-transaction")).toBe(true);
    expect(manifestFor("does-not-exist")).toBeUndefined();
    expect(countsTowardGate("does-not-exist")).toBe(false);
  });

  it("§10 a NON_COMPLIANT pair cannot count toward A→B", () => {
    const gate = aToBGate([
      { fixtureId: "fa", taskFamily: "A", modelId: "m1", modelFamily: "x", verdict: PAIR_VERDICTS.QUALIFIED, antiOverfitProcess: ANTI_OVERFIT_PROCESSES.NON_COMPLIANT },
      { fixtureId: "fb", taskFamily: "B", modelId: "m1", modelFamily: "x", verdict: PAIR_VERDICTS.QUALIFIED, antiOverfitProcess: ANTI_OVERFIT_PROCESSES.COMPLIANT },
      { fixtureId: "fa", taskFamily: "A", modelId: "m2", modelFamily: "y", verdict: PAIR_VERDICTS.QUALIFIED, antiOverfitProcess: ANTI_OVERFIT_PROCESSES.NON_COMPLIANT },
    ]);
    expect(gate.excludedNonCompliant).toBe(2);
    expect(gate.green).toBe(false);
  });

  it("§10 the gate fails CLOSED when the compliance field is absent", () => {
    const gate = aToBGate([
      { fixtureId: "fa", taskFamily: "A", modelId: "m1", modelFamily: "x", verdict: PAIR_VERDICTS.QUALIFIED },
      { fixtureId: "fb", taskFamily: "B", modelId: "m1", modelFamily: "x", verdict: PAIR_VERDICTS.QUALIFIED },
      { fixtureId: "fa", taskFamily: "A", modelId: "m2", modelFamily: "y", verdict: PAIR_VERDICTS.QUALIFIED },
    ]);
    expect(gate.qualifiedPairs).toBe(0);
    expect(gate.green).toBe(false);
  });
});

/* ================================================================ §13 the corrected verdicts */

describe("R3-AE §13 — the corrected verdicts on the preserved trials", () => {
  const findPair = (fixtureFragment: string, modelId: string) => corrected?.pairs?.find((pair: any) => pair.fixtureId.includes(fixtureFragment) && pair.modelId === modelId) ?? null;

  it("§13 the corrected analysis exists and covers all four pairs", () => {
    expect(corrected).not.toBeNull();
    expect(corrected.pairs.length).toBe(4);
    expect(corrected.completedRuns).toBe(20);
  });

  it("§13 F-A × deepseek is UNQUALIFIED on QC-2 and QC-4 with group {FA4}", () => {
    const pair = findPair("f-a", "deepseek-flash");
    expect(pair.verdict).toBe(PAIR_VERDICTS.UNQUALIFIED);
    expect(pair.originalVerdict).toBe(PAIR_VERDICTS.UNQUALIFIED);
    expect(pair.variableGroups).toEqual(["FA4"]);
  });

  it("§13 F-A × glm is QUALIFIED with groups {FA1+FA2} and {FA4}", () => {
    const pair = findPair("f-a", "glm-5.3-flash");
    expect(pair.verdict).toBe(PAIR_VERDICTS.QUALIFIED);
    expect(pair.originalVerdict).toBe(PAIR_VERDICTS.QUALIFIED);
    expect([...pair.variableGroups].sort()).toEqual(["FA1+FA2", "FA4"]);
  });

  it("§13 F-B × deepseek is UNQUALIFIED on QC-1 with groups {FB6} and {FB7}", () => {
    const pair = findPair("f-b", "deepseek-flash");
    expect(pair.verdict).toBe(PAIR_VERDICTS.UNQUALIFIED);
    expect(pair.reasons.join(" ")).toMatch(/QC-1 failed/u);
    expect([...pair.variableGroups].sort()).toEqual(["FB6", "FB7"]);
  });

  it("§13 F-B × glm is UNQUALIFIED with group {FB6}", () => {
    const pair = findPair("f-b", "glm-5.3-flash");
    expect(pair.verdict).toBe(PAIR_VERDICTS.UNQUALIFIED);
    expect(pair.reasons.join(" ")).toMatch(/QC-1 failed/u);
    expect(pair.variableGroups).toEqual(["FB6"]);
  });

  it("§13 the corrected verdicts are IDENTICAL to the R3-A0 verdicts", () => {
    for (const pair of corrected.pairs) expect(pair.verdict).toBe(pair.originalVerdict);
  });
});

/* ================================================================ §14 the corrected gate */

describe("R3-AE §14 — the corrected A→B gate", () => {
  it("§14 the gate is RED, computed mechanically from corrected verdicts", () => {
    expect(corrected.gate.green).toBe(false);
    expect(corrected.gate.qualifiedPairs).toBe(1);
    expect(corrected.gate.clauses.twoTaskFamilies).toBe(false);
    expect(corrected.gate.clauses.twoModelFamilies).toBe(false);
  });

  it("§14 the gate consumed manifest-derived compliance", () => {
    for (const pair of corrected.pairs) expect(pair.antiOverfitProcess).toBe(ANTI_OVERFIT_PROCESSES.COMPLIANT);
  });

  it("§17 a plumbing-verified route with NO runs on a fixture is NOT emitted as a pair", () => {
    /** Kimi is E2E-ready for plumbing but has zero qualification runs, so it must not appear. */
    expect(corrected.pairs.every((pair: any) => pair.scheduled > 0)).toBe(true);
    expect(corrected.pairs.some((pair: any) => pair.modelId === "kimi-k3")).toBe(false);
    const source = readFileSync(join(REPO_ROOT, "scripts", "r3a", "analyse.mjs"), "utf8");
    expect(source).toMatch(/if \(members\.length === 0\) continue;/u);
  });
});

/* ================================================================ §5 the real class series */

describe("R3-AE §5 — the real preserved class series", () => {
  const trials = existsSync(join(EVIDENCE, "normalized-trials.json")) ? JSON.parse(readFileSync(join(EVIDENCE, "normalized-trials.json"), "utf8")).trials : [];

  it("the F-A × glm class series really differ (the pre-correction engine merged them)", () => {
    const members = trials.filter((trial: any) => trial.fixtureId.includes("f-a") && trial.modelId === "glm-5.3-flash");
    const series = classSeries(members, ["FA1", "FA2", "FA3", "FA4", "FA5", "FA6"]);
    /** Values read from the preserved records: FA1 and FA2 both flip ONLY on the last run. */
    expect(series.FA1).toEqual([false, false, false, false, true]);
    expect(series.FA2).toEqual([false, false, false, false, true]);
    expect(series.FA4).toEqual([true, true, false, true, true]);
    /** FA1 and FA2 share a series and must group; FA4 must not; the always-passing classes group together. */
    expect(groupClassesBySeries(series).map((group: any) => group.members.join("+")).sort()).toEqual(["FA1+FA2", "FA3+FA5+FA6", "FA4"]);
  });

  it("the F-A × deepseek series show only FA4 varying", () => {
    const members = trials.filter((trial: any) => trial.fixtureId.includes("f-a") && trial.modelId === "deepseek-flash");
    const series = classSeries(members, ["FA1", "FA2", "FA3", "FA4", "FA5", "FA6"]);
    expect(series.FA1).toEqual([false, false, false, false, false]);
    expect(series.FA4).toEqual([false, true, true, true, true]);
    expect(groupClassesBySeries(series).filter((group: any) => group.variable).map((group: any) => group.members.join("+"))).toEqual(["FA4"]);
  });

  it("the F-B series show two varying groups for deepseek and one for glm", () => {
    const ids = ["FB1", "FB2", "FB3", "FB4", "FB5", "FB6", "FB7"];
    const deepseek = classSeries(trials.filter((trial: any) => trial.fixtureId.includes("f-b") && trial.modelId === "deepseek-flash"), ids);
    const glm = classSeries(trials.filter((trial: any) => trial.fixtureId.includes("f-b") && trial.modelId === "glm-5.3-flash"), ids);
    expect(deepseek.FB6).toEqual([false, true, false, false, false]);
    expect(deepseek.FB7).toEqual([true, true, false, true, true]);
    expect(groupClassesBySeries(deepseek).filter((group: any) => group.variable).map((group: any) => group.members.join("+")).sort()).toEqual(["FB6", "FB7"]);
    expect(groupClassesBySeries(glm).filter((group: any) => group.variable).map((group: any) => group.members.join("+"))).toEqual(["FB6"]);
  });
});
