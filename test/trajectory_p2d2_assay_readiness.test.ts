/**
 * Trajectory-P2-D2 §12/§13 Group H — UTILITY ASSAY READINESS (C8).
 *
 * Proves the assay-entry package is complete and honest, WITHOUT running any stochastic trial:
 *
 *   59. the Control arm is the EXISTING context (not "no context");
 *   60. the Treatment differs from the Control ONLY through qualified Trajectory delivery;
 *   61. at least two candidate task families are specified;
 *   62. independent outcome measures are defined for each;
 *   63. the R2-VR Benchmark Qualification Law is applied (as a requirement, not a result);
 *   64. a baseline-only calibration protocol EXISTS but has NOT been run;
 *   65. NO utility benefit is claimed without data.
 *
 * SAFETY. Pure artifact/source assertions; no DSH, no model, no network, no personal data.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const readEvidence = (name: string): Record<string, unknown> => {
  const path = join(REPO, "research-evidence", "trajectory-p2d2", name);
  expect(existsSync(path)).toBe(true);
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
};

describe("P2D2 §12 — utility assay entry is prepared and NOT executed", () => {
  it("59/60. the estimand is incremental, not 'no context vs full context'", () => {
    const protocol = readEvidence("utility-assay-protocol.json");
    const estimand = protocol.estimand as { control: string; treatment: string; explicitlyNotTheComparison: string };
    expect(estimand.control).toContain("Existing Context");
    expect(estimand.control).toContain("PriorResultContext");
    expect(estimand.treatment).toContain("Trajectory Section");
    expect(estimand.explicitlyNotTheComparison).toContain("no context versus full context");
  });

  it("61. at least two candidate task families are specified", () => {
    const fixtures = readEvidence("benchmark-fixtures.json");
    const list = fixtures.fixtures as readonly { id: string; family: string }[];
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.map((entry) => entry.family)).toEqual(expect.arrayContaining(["Governed Rework Continuation", "Multi-Invocation Reconstruction"]));
  });

  it("62. independent outcome measures are defined for each family", () => {
    const fixtures = readEvidence("benchmark-fixtures.json");
    const list = fixtures.fixtures as readonly { candidateOutcomeDimensions: readonly string[]; mechanicalFailureDetector: string }[];
    for (const fixture of list) {
      expect(fixture.candidateOutcomeDimensions.length).toBeGreaterThan(0);
      expect(fixture.mechanicalFailureDetector.length).toBeGreaterThan(0);
    }
  });

  it("63. the R2-VR Benchmark Qualification Law is applied as a REQUIREMENT", () => {
    const fixtures = readEvidence("benchmark-fixtures.json");
    const law = fixtures.qualificationLaw as Record<string, string>;
    for (const id of ["UQ-1", "UQ-2", "UQ-3", "UQ-4", "UQ-5"]) expect(law[id]).toBeTruthy();
    // The law is prepared, NOT yet applied (a baseline calibration is required first).
    expect(law.applied).toContain("NOT yet applied");
  });

  it("64. a baseline-only calibration protocol exists but has NOT been run", () => {
    const protocol = readEvidence("utility-assay-protocol.json");
    const calibration = protocol.baselineOnlyCalibration as { required: string; runInD2: boolean; ifSaturated: string };
    expect(calibration.required).toBeTruthy();
    expect(calibration.runInD2).toBe(false);
    expect(calibration.ifSaturated).toContain("BENCHMARK_NOT_QUALIFIED");
  });

  it("65. NO utility benefit is claimed, and the forbidden statements are recorded as forbidden", () => {
    const protocol = readEvidence("utility-assay-protocol.json");
    expect(protocol.evidenceClass).toBe("NOT_ESTABLISHED");
    const forbidden = protocol.forbiddenFinalStatements as readonly string[];
    expect(forbidden).toEqual(expect.arrayContaining(["Trajectory improved task success"]));
    const permitted = protocol.permittedFinalStatements as readonly string[];
    expect(permitted).toEqual(expect.arrayContaining(["utility has NOT been measured"]));
    // The trial classification forbids counting a failed-delivery Treatment as a Control.
    const precondition = protocol.deliveryPrecondition as { trialClassification: string; currentStatus: string };
    expect(precondition.trialClassification).toContain("DELIVERY_PRECONDITION_NOT_MET");
    expect(precondition.currentStatus).toContain("NOT run in this stage");
  });

  it("the frozen trial identity includes every digest needed to prove the delivered bytes", () => {
    const protocol = readEvidence("utility-assay-protocol.json");
    const identity = (protocol.frozenTrialIdentity as readonly string[]).join(" | ");
    for (const token of ["Capsule Digest", "Section Digest", "Full UserMessage Digest", "Selected experimental arm", "Delivery-precondition state"]) {
      expect(identity).toContain(token);
    }
  });
});
