/**
 * Trajectory-P2-E0 §13 Group F — BASELINE-ONLY CALIBRATION PROTOCOL IS PREPARED AND NOT RUN (C6).
 *
 * Proves the assay-entry package is complete and honest, WITHOUT running any stochastic trial:
 *
 *   the estimand is incremental (not "no context vs full context");
 *   the R2-VR qualification law is carried forward as a REQUIREMENT;
 *   the future parameters are declared and NO credential is hard-coded;
 *   delivery attrition stays in the assigned-arm denominator;
 *   a saturated baseline yields BENCHMARK_NOT_QUALIFIED rather than more treatment trials;
 *   no utility benefit is claimed.
 *
 * SAFETY. Pure artifact assertions; no DSH, no model, no network, no personal data.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const readEvidence = (name: string): Record<string, unknown> => {
  const path = join(REPO, "research-evidence", "trajectory-p2e0", name);
  expect(existsSync(path)).toBe(true);
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
};

describe("E0-E §13 — baseline-only calibration is prepared and NOT executed", () => {
  it("the estimand is incremental, not 'no context vs full context'", () => {
    const protocol = readEvidence("baseline-calibration-protocol.json");
    const estimand = protocol.estimand as { control: string; treatment: string; explicitlyNotTheComparison: string };
    expect(estimand.control.toLowerCase()).toContain("existing");
    expect(estimand.control.toLowerCase()).toContain("priorresultcontext");
    expect(estimand.treatment.toLowerCase()).toContain("trajectory section");
    // The "explicitly not" comparison is stated as an expression, not a phrase.
    expect(estimand.explicitlyNotTheComparison.toLowerCase()).toContain("all context");
    expect(estimand.explicitlyNotTheComparison.toLowerCase()).toContain("no context");
  });

  it("the R2-VR qualification law is carried forward as a REQUIREMENT and NOT applied", () => {
    const protocol = readEvidence("baseline-calibration-protocol.json");
    const law = protocol.r2vrQualificationLaw as { requirements: Record<string, string>; applied: boolean; mustNotBeGrantedInThisStage: string };
    for (const id of ["UQ-1", "UQ-2", "UQ-3", "UQ-4", "UQ-5"]) expect(law.requirements[id]).toBeTruthy();
    expect(law.applied).toBe(false);
    expect(law.mustNotBeGrantedInThisStage).toBe("BENCHMARK_QUALIFIED");
  });

  it("the future parameters are declared and NO credential is hard-coded", () => {
    const protocol = readEvidence("baseline-calibration-protocol.json");
    const params = protocol.futureParameters as Record<string, unknown>;
    for (const key of ["provider", "modelAndVersion", "repetitionCount", "costBudget", "timeout", "stopConditions", "independentAcceptanceOracle"]) {
      expect(params[key]).toBeTruthy();
    }
    const serialized = JSON.stringify(protocol).toLowerCase();
    for (const forbidden of ["api_key", "apikey", "sk-", "bearer ", "password", "token="]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("delivery attrition stays in the assigned-arm denominator", () => {
    const protocol = readEvidence("baseline-calibration-protocol.json");
    const attrition = protocol.attritionDiscipline as { assignedArmIsTheDenominator: string; reportThese: Record<string, boolean>; doNotPrecomputeEffectFromDeliveredSurvivors: boolean };
    expect(attrition.assignedArmIsTheDenominator).toContain("ASSIGNED-arm");
    expect(attrition.doNotPrecomputeEffectFromDeliveredSurvivors).toBe(true);
    for (const key of ["assignedTrials", "eligibleTrials", "materializedTrials", "deliveredTrials", "failedDeliveryTrials", "completedTrials", "independentlyJudgedTrials"]) {
      expect(attrition.reportThese[key]).toBe(true);
    }
  });

  it("a saturated baseline yields BENCHMARK_NOT_QUALIFIED, not more treatment trials", () => {
    const protocol = readEvidence("baseline-calibration-protocol.json");
    const refusal = protocol.refusalRule as { ifBaselineSaturatedOrVariesOnlyInIrrelevantClasses: string; doNotAutomaticallyIncreaseTreatmentCount: boolean; doNotInferStochasticUtilityFromTheDeterministicAdapter: boolean };
    expect(refusal.ifBaselineSaturatedOrVariesOnlyInIrrelevantClasses).toBe("BENCHMARK_NOT_QUALIFIED");
    expect(refusal.doNotAutomaticallyIncreaseTreatmentCount).toBe(true);
    expect(refusal.doNotInferStochasticUtilityFromTheDeterministicAdapter).toBe(true);
  });

  it("an explicit authorization is required before any model trial, and no trial ran here", () => {
    const protocol = readEvidence("baseline-calibration-protocol.json");
    const authorization = protocol.authorizationRequirement as { beforeAnyModelTrialRequire: readonly string[]; stageEndsBeforeThatExecution: boolean };
    expect(authorization.beforeAnyModelTrialRequire.length).toBeGreaterThanOrEqual(6);
    expect(authorization.stageEndsBeforeThatExecution).toBe(true);
    expect(protocol.stochasticTrialsRunInE0).toBe(0);
    expect(protocol.modelCallsMade).toBe(0);
  });

  it("NO utility benefit is claimed, and the forbidden statements are recorded as forbidden", () => {
    const protocol = readEvidence("baseline-calibration-protocol.json");
    expect(protocol.evidenceClass).toBe("NOT_ESTABLISHED");
    const forbidden = protocol.forbiddenFinalStatements as readonly string[];
    expect(forbidden).toEqual(expect.arrayContaining(["Trajectory improved task success"]));
    const permitted = protocol.permittedFinalStatements as readonly string[];
    expect(permitted).toEqual(expect.arrayContaining(["utility has NOT been measured"]));
  });
});
