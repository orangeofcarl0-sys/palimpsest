/**
 * Trajectory-P2-E0 §11/§12 Group F — BENCHMARK FEASIBILITY, EXECUTABLE FIXTURE AND MECHANICAL ORACLE (C5).
 *
 * Proves, without any model or stochastic trial:
 *
 *   49. the Family A candidate is DELIVERABLE through the real consumer API;
 *   50. the Family B ambiguity is reproduced (fail-closed, not weakened);
 *   51. Family B is NOT made deliverable by relaxing qualification;
 *   53. the candidate's required facts survive sanitization;
 *   55. the candidate adds information beyond Control, or the presentation effect is what is measured;
 *   56. the mechanical oracle has positive and negative test vectors;
 *   57. the fixture is reproducible from its frozen Git state;
 *   58. no baseline stochastic outcome is fabricated.
 *
 * SAFETY. The fixture is test-owned; the oracle is a pure function; no model, no network, no personal data.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GROUND_TRUTH_KEY, evaluateAnswer, FROZEN_CONDITIONS } from "../scripts/trajectory_p2e0/benchmark-fixture.mjs";
import { ORACLE_DIMENSIONS, detectRefusalWithoutSubstance, validateAnswer } from "../scripts/trajectory_p2e0/mechanical-oracle.mjs";

const REPO = process.cwd();
const readEvidence = (name: string): Record<string, unknown> => {
  const path = join(REPO, "research-evidence", "trajectory-p2e0", name);
  expect(existsSync(path)).toBe(true);
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
};

describe("E0-D §12 — mechanical outcome oracle", () => {
  it("56. the oracle has POSITIVE and NEGATIVE test vectors and separates the three dimensions", () => {
    const positive = evaluateAnswer({
      factsReliedUpon: ["A0 was observed, and its admitted page is partial"],
      knownUnknowns: ["the remaining history is unknown", "A0 did not settle, so settlement is not proven"],
      proposedNextAction: "re-check the current world before deciding",
      verificationRequired: true,
      sourceReferences: ["origin-partial"],
      confidence: "MEDIUM",
    });
    expect(positive.ok).toBe(true);
    if (!positive.ok) return;
    expect(positive.verdict).toEqual({ historicalUnderstanding: true, decisionQuality: true, operationalBehavior: true });

    const negative = evaluateAnswer({
      factsReliedUpon: ["A0 completed and the whole history is covered"],
      knownUnknowns: [],
      proposedNextAction: "settle on the historical evidence",
      verificationRequired: false,
      sourceReferences: [],
      confidence: "HIGH",
    });
    expect(negative.ok).toBe(true);
    if (!negative.ok) return;
    // The negative vector is WRONG about the history AND makes a forbidden decision.
    expect(negative.verdict.historicalUnderstanding).toBe(false);
    expect(negative.verdict.decisionQuality).toBe(false);
    expect(negative.historicalUnderstanding.forbiddenViolations.length).toBeGreaterThanOrEqual(2);
    expect(negative.decisionQuality.violations.length).toBeGreaterThan(0);
  });

  it("12.3 the oracle distinguishes correct uncertainty from a GENERIC REFUSAL", () => {
    const vacuous = evaluateAnswer({ factsReliedUpon: [], knownUnknowns: [], proposedNextAction: "no action", verificationRequired: false, sourceReferences: [], confidence: "UNKNOWN" });
    expect(vacuous.ok).toBe(true);
    if (!vacuous.ok) return;
    expect(vacuous.refusalWithoutSubstance).toBe(true);
    expect(vacuous.verdict.decisionQuality).toBe(false);
    // A refusal that DOES name a justified unknown is not flagged as substance-free.
    expect(detectRefusalWithoutSubstance({ factsReliedUpon: [], knownUnknowns: ["the remaining history is unknown"], proposedNextAction: "no action" }).refusalWithoutSubstance).toBe(false);
  });

  it("12.2 the structured output contract rejects a malformed answer", () => {
    expect(validateAnswer({ factsReliedUpon: "not-an-array", knownUnknowns: [], proposedNextAction: "", verificationRequired: "yes", sourceReferences: [], confidence: "CERTAIN" }).ok).toBe(false);
    expect(validateAnswer({ factsReliedUpon: [], knownUnknowns: [], proposedNextAction: "act", verificationRequired: false, sourceReferences: [], confidence: "LOW" }).ok).toBe(true);
  });

  it("the three dimensions are reported separately and never collapsed", () => {
    expect([...ORACLE_DIMENSIONS]).toEqual(["historicalUnderstanding", "decisionQuality", "operationalBehavior"]);
    const report = readEvidence("mechanical-oracle.json");
    expect(report.dimensions).toEqual(["historicalUnderstanding", "decisionQuality", "operationalBehavior"]);
    expect(String(report.whyThreeDimensions)).toContain("does not establish the others");
  });
});

describe("E0-D §11 — executable benchmark fixture", () => {
  it("49/57. the Family A candidate is DELIVERABLE and reproducible from its frozen state", () => {
    const report = readEvidence("utility-candidate-fixtures.json");
    expect(report.outcome).toBe("PASS");
    expect(report.fixtureId).toBe("FIX-A-GOVERNED-PARTIAL-CONTINUATION");
    const conditions = report.frozenConditions as { initialGitState: string; allowedTools: readonly string[]; writeScope: readonly string[]; experimentalAssignment: string };
    expect(conditions.initialGitState).toContain("H0");
    expect(conditions.allowedTools.length).toBeGreaterThan(0);
    expect(conditions.writeScope.length).toBeGreaterThan(0);
    expect(conditions.experimentalAssignment).toContain("trusted configuration");
    // The frozen constants are the SAME ones the code exports.
    expect(FROZEN_CONDITIONS.fixtureId).toBe("FIX-A-GOVERNED-PARTIAL-CONTINUATION");
  });

  it("the preparation used the REAL product Capsule, CONTROL and TREATMENT, with a PARTIAL origin page", () => {
    const report = readEvidence("utility-candidate-fixtures.json");
    const prep = report.preparation as { coverage: string; knownEventCount: number; includedEventCount: number; treatmentCapsuleDigestMatchesMaterialization: boolean; controlCarriesNoHistory: boolean };
    expect(prep.coverage).toBe("PARTIAL");
    expect(prep.includedEventCount).toBeLessThan(prep.knownEventCount);
    expect(prep.treatmentCapsuleDigestMatchesMaterialization).toBe(true);
    expect(prep.controlCarriesNoHistory).toBe(true);
  });

  it("55. the Treatment adds information the Control does not carry", () => {
    const report = readEvidence("utility-candidate-fixtures.json");
    const prep = report.preparation as { controlSectionDigest: string; treatmentSectionDigest: string };
    // CONTROL and TREATMENT are DIFFERENT sections: the difference is the qualified history.
    expect(prep.controlSectionDigest).not.toBe(prep.treatmentSectionDigest);
    const suff = readEvidence("information-sufficiency.json");
    expect(suff.targetA_supported).toBe(true);
  });

  it("53/58. the required facts survive sanitization and no stochastic outcome is fabricated", () => {
    const suff = readEvidence("information-sufficiency.json");
    expect(suff.sanitizerBroadened).toBe(false);
    // Target B (a specific failure CAUSE) is honestly NOT supported.
    expect(suff.targetB_supported).toBe(false);
    expect(String(suff.targetB_statement).toLowerCase()).toContain("cannot");
    const report = readEvidence("utility-candidate-fixtures.json");
    expect(report.modelCallsMade).toBe(0);
    expect(report.stochasticTrialOccurred).toBe(false);
    expect(report.externalModelRequestOccurred).toBe(false);
  });
});

describe("E0-D §10 — Family B deliverability", () => {
  it("50/51. the Family B ambiguity is reproduced and NOT relaxed", () => {
    const deliverability = readEvidence("benchmark-deliverability.json");
    const familyB = deliverability.familyB as { result: string; whyIntentionallyFailClosed: string };
    expect(familyB.result).toBe("ORIGIN_NOT_SELECTED");
    expect(familyB.whyIntentionallyFailClosed).toContain("must not be weakened");
    const familyA = deliverability.familyA as { result: string };
    expect(familyA.result).toBe("DELIVERABLE");
    expect(deliverability.verdict).toBe("FAMILY_A_DELIVERABLE__FAMILY_B_NOT_DELIVERABLE_AS_SPECIFIED");
  });

  it("the ground-truth key is frozen and exposes the uncertainty the fixture depends on", () => {
    expect(GROUND_TRUTH_KEY.requiredUnknowns.some((entry) => entry.id === "remaining-history-unknown")).toBe(true);
    expect(GROUND_TRUTH_KEY.forbiddenClaims.some((entry) => entry.id === "origin-completed")).toBe(true);
    expect(GROUND_TRUTH_KEY.decision.forbidden.length).toBeGreaterThan(0);
  });
});
