/**
 * R2-VR §1/§3/§4/§5/§6/§7/§8 — DETERMINISTIC REANALYSIS TESTS.
 *
 * These test the CORRECTED ESTIMAND and the audit, not the product, and NO stochastic threshold is encoded:
 * nothing here asserts what the utility signal must be, because the corrected analysis is the measurement.
 *
 * The load-bearing tests are the ones that would silently re-introduce the estimand error:
 *
 *   · §3 the four conditional contrasts, the two main effects and the interaction are computed from the
 *     factorial layout, and `V3 - V0` is NEVER used as a marginal effect;
 *   · §4 a factor whose two conditional contrasts disagree is reported with its context-dependence, not
 *     collapsed to a single label;
 *   · §5 a non-zero interaction at n = 5 is labelled DESCRIPTIVE_INTERACTION_PATTERN and nothing stronger;
 *   · §6 the outcome audit re-judges stored candidates per case and reports which cases vary;
 *   · §7 INCONCLUSIVE is reachable and is the honest reading under saturation;
 *   · §8 the renamed calibration field exists and the old name is gone.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CALIBRATION_STATUSES, correctedCalibrationStatus, describeFactor, FACTORIAL_CELLS, factorialContrasts, INTERACTION_LABEL, OUTCOME_DIMENSIONS } from "../scripts/r2vr/factorial.mjs";
import { correctedAnalysis, correctedCalibration, loadR2VRaw } from "../scripts/r2vr/reanalyse.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** §3: a hand-built factorial fixture, so the estimator is tested independently of the real data. */
const trial = (solved: boolean, recurred = false) => ({ finalAcceptanceSolved: solved, firstCandidateSolved: solved, knownFailureRecurred: recurred });
const armOf = (n: number, solved: number, recurred = 0) => [
  ...Array.from({ length: solved }, () => trial(true)),
  ...Array.from({ length: n - solved }, () => trial(false)),
  ...Array.from({ length: recurred }, () => trial(false, true)),
];

/* ================================================================ §1 the factorial layout */

describe("R2-VR §1 — the R2-V arms are a 2×2 factorial", () => {
  it("maps V0/V1/V2/V3 onto the B×C cells", () => {
    expect(FACTORIAL_CELLS.V0).toEqual({ B: false, C: false });
    expect(FACTORIAL_CELLS.V1).toEqual({ B: true, C: false });
    expect(FACTORIAL_CELLS.V2).toEqual({ B: false, C: true });
    expect(FACTORIAL_CELLS.V3).toEqual({ B: true, C: true });
  });
});

/* ================================================================ §3 the contrasts */

describe("R2-VR §3 — the factorial contrasts", () => {
  it("computes the four CONDITIONAL contrasts and never uses V3-V0 as a marginal effect", () => {
    const contrast = factorialContrasts({ V0: armOf(5, 1), V1: armOf(5, 3), V2: armOf(5, 2), V3: armOf(5, 5) }, "finalAcceptanceSolved");
    expect(contrast.conditional.bGivenCAbsent.value).toBeCloseTo(2 / 5, 6);
    expect(contrast.conditional.bGivenCPresent.value).toBeCloseTo(3 / 5, 6);
    expect(contrast.conditional.cGivenBAbsent.value).toBeCloseTo(1 / 5, 6);
    expect(contrast.conditional.cGivenBPresent.value).toBeCloseTo(2 / 5, 6);
    /** §3: the main effects are the MEAN of the conditional contrasts. */
    expect(contrast.bMainEffect).toBeCloseTo(2.5 / 5, 6);
    expect(contrast.cMainEffect).toBeCloseTo(1.5 / 5, 6);
    /** §3: the interaction is the difference-of-differences. */
    expect(contrast.interaction).toBeCloseTo(5 / 5 - 2 / 5 - 3 / 5 + 1 / 5, 6);
  });

  it("the main effect is NOT the V3-V0 contrast when the conditional contrasts differ", () => {
    const contrast = factorialContrasts({ V0: armOf(5, 1), V1: armOf(5, 3), V2: armOf(5, 2), V3: armOf(5, 5) }, "finalAcceptanceSolved");
    const v3minusV0 = 5 / 5 - 1 / 5;
    expect(contrast.bMainEffect).not.toBeCloseTo(v3minusV0, 6);
    expect(contrast.cMainEffect).not.toBeCloseTo(v3minusV0, 6);
  });

  it("a pure additive world has ZERO interaction", () => {
    const contrast = factorialContrasts({ V0: armOf(5, 1), V1: armOf(5, 2), V2: armOf(5, 2), V3: armOf(5, 3) }, "finalAcceptanceSolved");
    expect(contrast.interaction).toBeCloseTo(0, 6);
    expect(contrast.interactionLabel).toBeNull();
  });

  it("§5 a non-zero interaction is labelled DESCRIPTIVE_INTERACTION_PATTERN only", () => {
    const contrast = factorialContrasts({ V0: armOf(5, 3), V1: armOf(5, 4), V2: armOf(5, 4), V3: armOf(5, 3) }, "finalAcceptanceSolved");
    expect(contrast.interaction).toBeCloseTo(-0.4, 6);
    expect(contrast.interactionLabel).toBe(INTERACTION_LABEL);
    expect(INTERACTION_LABEL).toBe("DESCRIPTIVE_INTERACTION_PATTERN");
  });

  it("§14 reports raw counts beside every rate", () => {
    const contrast = factorialContrasts({ V0: armOf(5, 3), V1: armOf(5, 4), V2: armOf(5, 4), V3: armOf(5, 3) }, "finalAcceptanceSolved");
    expect(contrast.cells.V0.raw).toBe("3/5");
    expect(contrast.cells.V1.raw).toBe("4/5");
    expect(contrast.conditional.bGivenCAbsent.raw).toBe("4/5 - 3/5");
    expect(JSON.stringify(contrast)).not.toMatch(/pValue|significan/iu);
  });
});

/* ================================================================ §4 context-dependence */

describe("R2-VR §4 — a factor's context-dependence is preserved", () => {
  it("reports OPPOSITE_SIGNS_ACROSS_CONTEXTS rather than a single collapsed label", () => {
    const contrast = factorialContrasts({ V0: armOf(5, 3), V1: armOf(5, 4), V2: armOf(5, 4), V3: armOf(5, 3) }, "finalAcceptanceSolved");
    const b = describeFactor(contrast, "B");
    expect(b.shape).toBe("OPPOSITE_SIGNS_ACROSS_CONTEXTS");
    expect(b.stableMarginalSignal).toBe(false);
    expect(b.contrasts["B|CAbsent"].value).toBeCloseTo(0.2, 6);
    expect(b.contrasts["B|CPresent"].value).toBeCloseTo(-0.2, 6);
  });

  it("reports POSITIVE_IN_BOTH_CONTEXTS as a stable marginal signal", () => {
    const contrast = factorialContrasts({ V0: armOf(5, 1), V1: armOf(5, 3), V2: armOf(5, 2), V3: armOf(5, 4) }, "finalAcceptanceSolved");
    const b = describeFactor(contrast, "B");
    expect(b.shape).toBe("POSITIVE_IN_BOTH_CONTEXTS");
    expect(b.stableMarginalSignal).toBe(true);
  });

  it("reports NO_MOVEMENT_IN_EITHER_CONTEXT when both conditional contrasts are zero", () => {
    const contrast = factorialContrasts({ V0: armOf(5, 3), V1: armOf(5, 3), V2: armOf(5, 3), V3: armOf(5, 3) }, "finalAcceptanceSolved");
    expect(describeFactor(contrast, "C").shape).toBe("NO_MOVEMENT_IN_EITHER_CONTEXT");
  });

  it("reports MOVEMENT_IN_ONE_CONTEXT_ONLY when only one contrast moves", () => {
    /** C|B absent = V2-V0 = 0, while C|B present = V3-V1 = +1/5. */
    const contrast = factorialContrasts({ V0: armOf(5, 3), V1: armOf(5, 4), V2: armOf(5, 3), V3: armOf(5, 5) }, "finalAcceptanceSolved");
    expect(contrast.conditional.cGivenBAbsent.value).toBeCloseTo(0, 6);
    expect(contrast.conditional.cGivenBPresent.value).toBeCloseTo(0.2, 6);
    expect(describeFactor(contrast, "C").shape).toBe("MOVEMENT_IN_ONE_CONTEXT_ONLY");
  });
});

/* ================================================================ §7 the calibration status */

describe("R2-VR §7 — the corrected calibration status", () => {
  it("INCONCLUSIVE under an outcome mismatch", () => {
    expect(correctedCalibrationStatus({ interactions: 0, saturatedDimensions: [], factorsWithStableSignal: ["B"], outcomeMismatch: true })).toBe(CALIBRATION_STATUSES.INCONCLUSIVE);
  });

  it("INCONCLUSIVE when two or more outcome dimensions are saturated", () => {
    expect(correctedCalibrationStatus({ interactions: 0, saturatedDimensions: ["a", "b"], factorsWithStableSignal: [], outcomeMismatch: false })).toBe(CALIBRATION_STATUSES.INCONCLUSIVE);
  });

  it("SUPPORTED only for a stable signal with no interaction and no mismatch", () => {
    expect(correctedCalibrationStatus({ interactions: 0, saturatedDimensions: [], factorsWithStableSignal: ["B"], outcomeMismatch: false })).toBe(CALIBRATION_STATUSES.SUPPORTED);
  });

  it("MIXED when an interaction is present", () => {
    expect(correctedCalibrationStatus({ interactions: 1, saturatedDimensions: [], factorsWithStableSignal: ["B"], outcomeMismatch: false })).toBe(CALIBRATION_STATUSES.MIXED);
  });

  it("§7 INCONCLUSIVE remains a fully valid allowed status", () => {
    expect(Object.values(CALIBRATION_STATUSES)).toContain("UTILITY_CALIBRATION_INCONCLUSIVE");
    expect(Object.values(CALIBRATION_STATUSES)).toEqual(["UTILITY_CALIBRATION_SUPPORTED", "UTILITY_CALIBRATION_MIXED", "UTILITY_CALIBRATION_INCONCLUSIVE"]);
  });
});

/* ================================================================ §2/§3 the real preserved data */

describe("R2-VR §2/§3 — the corrected analysis of the preserved R2-V trials", () => {
  const raw = loadR2VRaw();
  const analysis = correctedAnalysis(raw);

  it("§2 reads the PRESERVED R2-V trials without modifying them", () => {
    expect(analysis.sourceTrials).toBe(20);
    const onDisk = JSON.parse(readFileSync(join(REPO_ROOT, "research-evidence", "r2-v", "normalized-results.json"), "utf8"));
    expect(onDisk.trials.length).toBe(20);
  });

  it("§3 produces contrasts for all three outcome dimensions", () => {
    for (const dimension of OUTCOME_DIMENSIONS) expect(analysis.contrasts[dimension]).toBeDefined();
    expect(analysis.contrasts.finalAcceptanceSolved.cells.V0.raw).toBe("3/5");
    expect(analysis.contrasts.finalAcceptanceSolved.cells.V1.raw).toBe("4/5");
    expect(analysis.contrasts.finalAcceptanceSolved.cells.V2.raw).toBe("4/5");
    expect(analysis.contrasts.finalAcceptanceSolved.cells.V3.raw).toBe("3/5");
  });

  it("§3 the B and C main effects are ZERO on the real data, which the collapsed V3-V0 read hid", () => {
    const contrast = analysis.contrasts.finalAcceptanceSolved;
    expect(contrast.bMainEffect).toBeCloseTo(0, 6);
    expect(contrast.cMainEffect).toBeCloseTo(0, 6);
    /** The conditional contrasts are +0.2 and -0.2 — one trial each way. */
    expect(contrast.conditional.bGivenCAbsent.value).toBeCloseTo(0.2, 6);
    expect(contrast.conditional.bGivenCPresent.value).toBeCloseTo(-0.2, 6);
  });

  it("§4 both factors are reported as context-dependent, not as a single label", () => {
    expect(analysis.factors.B.shape).toBe("OPPOSITE_SIGNS_ACROSS_CONTEXTS");
    expect(analysis.factors.C.shape).toBe("OPPOSITE_SIGNS_ACROSS_CONTEXTS");
    expect(analysis.factors.B.stableMarginalSignal).toBe(false);
    expect(analysis.factors.C.stableMarginalSignal).toBe(false);
  });

  it("§5 the real data carries a descriptive interaction pattern", () => {
    expect(analysis.contrasts.finalAcceptanceSolved.interaction).toBeCloseTo(-0.4, 6);
    expect(analysis.interactions.map((entry: any) => entry.dimension)).toContain("finalAcceptanceSolved");
    for (const entry of analysis.interactions as readonly { label: string }[]) expect(entry.label).toBe(INTERACTION_LABEL);
  });

  it("§7 the corrected calibration is INCONCLUSIVE and says why", () => {
    const auditPath = join(REPO_ROOT, "research-evidence", "r2-vr", "outcome-audit.json");
    const audit = existsSync(auditPath) ? JSON.parse(readFileSync(auditPath, "utf8")) : null;
    const calibration = correctedCalibration(analysis, audit);
    expect(calibration.status).toBe(CALIBRATION_STATUSES.INCONCLUSIVE);
    expect(calibration.reasons.join(" ")).toMatch(/OUTCOME_MISMATCH|saturated/u);
    expect(calibration.retiredInference).toMatch(/CONSISTENT/u);
  });
});

/* ================================================================ §6 the outcome audit */

describe("R2-VR §6 — the outcome-sensitivity audit", () => {
  const auditPath = join(REPO_ROOT, "research-evidence", "r2-vr", "outcome-audit.json");
  const audit = existsSync(auditPath) ? JSON.parse(readFileSync(auditPath, "utf8")) : null;

  it("re-judged all 20 stored candidates against every hidden case", () => {
    expect(audit).not.toBeNull();
    expect(audit.trialsJudged).toBe(20);
    expect(audit.casesAudited).toBe(14);
  });

  it("identifies exactly one varying case and 13 invariant ones", () => {
    expect(audit.varyingCases).toEqual(["h14"]);
    expect(audit.invariantCaseCount).toBe(13);
  });

  it("§6 the varying case is addressed by D (constant across arms) and only GENERICALLY by B/C", () => {
    const h14 = audit.caseAudit.find((entry: any) => entry.caseId === "h14");
    expect(h14.addressedBy).toEqual(["D"]);
    expect(h14.addressedGenericallyBy).toEqual(["B", "C"]);
    expect(audit.mechanism.varyingAddressedByAdded).toEqual([]);
  });

  it("§6 records the OUTCOME_MISMATCH ruling", () => {
    expect(audit.outcomeMismatch).toBe(true);
    expect(audit.ruling).toBe("UTILITY_ASSAY_OUTCOME_MISMATCH");
  });

  it("§6 uses the existing bundle contents, not domain names alone", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r2vr", "outcome-audit.mjs"), "utf8");
    expect(source).toContain("bundleCapital");
    expect(source).toMatch(/direct:|generic:/u);
  });
});

/* ================================================================ §8 the schema rename */

describe("R2-VR §8 — the analysis-schema naming correction", () => {
  it("the misnamed field is renamed and the old name is gone", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r2v", "analyse.mjs"), "utf8");
    expect(source).toContain("skippedBundlesWithNoClearSignal");
    /** The old name may appear only inside the explanatory comment that records the rename. */
    const codeLines = source.split("\n").filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("/*") && !line.trim().startsWith("//"));
    expect(codeLines.join("\n")).not.toContain("didItRetrieveBundlesWithNoClearSignal");
  });

  it("§9 the superseded estimator is marked as such", () => {
    const source = readFileSync(join(REPO_ROOT, "scripts", "r2v", "analyse.mjs"), "utf8");
    expect(source).toContain("SUPERSEDED_BY_R2VR_FACTORIAL_CONTRASTS");
  });
});
