/**
 * R3-L0C-I-A-R §1 — THE FALSIFIERS AGAINST `dbe6beb`.
 *
 * §1's bar is that each corrected defect is MEASURED against the baseline and the property FAILS there. These
 * tests run the measurements and assert the violation, so the repairs are checked against the same properties the
 * baseline violated rather than against properties invented after the fact.
 *
 * THE FALSIFIERS ARE COMMITTED BEFORE THE REPAIRS, which is the discipline this stage inherits: the commit order
 * is the evidence that the negative tests were not adapted to the repaired implementation.
 */
import { describe, expect, it } from "vitest";

import { CORRECTION_DEFECTS, FINAL_VERDICTS, POST_MATRIX_CONDITIONS, PRE_TRIAL_REQUIREMENTS, CONDITION_SUCCESS, ADMISSION_NEGATIVE_CONTROLS, AUTHORIZATION_REQUIREMENTS, BASELINE_COMMIT, contractSummary } from "../scripts/r3l0ciar/contract.mjs";
import { runCorrectionFalsifiers } from "../scripts/r3l0ciar/falsifiers.mjs";
import { frozenPrimarySchedule } from "../scripts/r3l0cia/primary-adapter.mjs";

const CLOSURE = { executionClosureDigest: "a".repeat(64) };
const CONTAINMENT = { EXPERIMENT_CONTAINMENT: "PASS", ACTUAL_CONTAINMENT: "PASS", cases: [1], probeDiscriminates: true };

async function run() {
  const schedule = await frozenPrimarySchedule();
  const trajectoryIds = [...new Set(schedule.map((session: { trajectoryId: string }) => session.trajectoryId))].sort();
  return await runCorrectionFalsifiers({ schedule, closure: CLOSURE, containment: CONTAINMENT, trajectoryIds: trajectoryIds.slice(0, 2) });
}

describe("R3-L0C-I-A-R §1 — the contract declares the correction set", () => {
  it("declares the eight defects, the eight pre-trial conditions and the nine post-matrix conditions", () => {
    expect(BASELINE_COMMIT).toBe("dbe6beb92c33e78b1f2e75604f5da2babaf50df2");
    expect(CORRECTION_DEFECTS.length).toBe(8);
    expect(PRE_TRIAL_REQUIREMENTS.length).toBe(8);
    expect(POST_MATRIX_CONDITIONS.length).toBe(9);
    expect(ADMISSION_NEGATIVE_CONTROLS.length).toBe(6);
    expect(AUTHORIZATION_REQUIREMENTS.length).toBe(5);
    expect(FINAL_VERDICTS.PAID_REPLICATION).toEqual(["READY_FOR_AUTHORIZATION", "BLOCKED"]);
    const summary = contractSummary();
    expect(summary.stage).toBe("R3-L0C-I-A-R");
    expect(summary.modelCallsMade).toBe(0);
    /** §3: every pre-trial condition has an explicit success mapping, and PASS is in every pass list. */
    for (const id of PRE_TRIAL_REQUIREMENTS) {
      expect(CONDITION_SUCCESS[id], id).toBeDefined();
      expect(CONDITION_SUCCESS[id]!.pass.length, id).toBeGreaterThan(0);
    }
    /** The three conditions the baseline reducer could never satisfy report non-YES verdicts. */
    expect(CONDITION_SUCCESS.CONTAINMENT!.pass).toContain("PASS");
    expect(CONDITION_SUCCESS.EXECUTION_CLOSURE!.pass).toContain("MATCH");
    expect(CONDITION_SUCCESS.SELECTION_REALIZATION_PREFLIGHT!.pass).toContain("PASS");
  });
});

describe("R3-L0C-I-A-R §1 — every corrected property is violated by the baseline", () => {
  it("measures all nine properties as violated at dbe6beb", async () => {
    const result = await run();
    expect(result.baseline).toBe("dbe6beb92c33e78b1f2e75604f5da2babaf50df2");
    expect(result.declaredDefects).toBe(8);
    expect(result.measuredProperties).toBe(9);
    expect(result.ALL_PROPERTIES_VIOLATED_BY_BASELINE).toBe(true);
    expect(result.notViolated).toEqual([]);
    expect(result.PROPERTIES_VIOLATED_BY_BASELINE).toBe(9);
    expect(result.modelCallsMade).toBe(0);
  }, 300_000);

  it("G1: the authoritative driver prepares the run root before the claim", async () => {
    const g1 = (await run()).falsifiers.find((entry) => entry.id === "G1_AUTHORITATIVE_ENTRY_PREPARES_BEFORE_CLAIM")!;
    expect(g1.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(g1.mutatedBeforeClaim).toBe(true);
    expect((g1.createdBeforeAnyClaim as readonly string[]).length).toBeGreaterThan(0);
    expect(g1.claimFileExistsAfterPreparation).toBe(false);
  }, 300_000);

  it("G2: with all eight conditions healthy, the baseline reducer is still unsatisfied", async () => {
    const g2 = (await run()).falsifiers.find((entry) => entry.id === "G2_PRETRIAL_REDUCER_YES_ONLY")!;
    expect(g2.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(g2.ALL_SATISFIED_withAllEightHealthy).toBe(false);
    expect(g2.unsatisfiedDespiteHealthy).toEqual(["CONTAINMENT", "EXECUTION_CLOSURE", "SELECTION_REALIZATION_PREFLIGHT"]);
    expect(g2.reducerLiteral).toBe("verdict === 'YES'");
    expect(g2.activationRequiresAllSatisfied).toBe(false);
  }, 300_000);

  it("G3: a drifted effective route is still reported as a match", async () => {
    const g3 = (await run()).falsifiers.find((entry) => entry.id === "G3_MODEL_ROUTE_IDENTITY_UNCHECKED")!;
    expect(g3.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(g3.conditionSatisfied).toBe(true);
    expect(g3.identitiesCompared).toEqual([]);
    expect(g3.routeDriftDetected).toBe(false);
  }, 300_000);

  it("G4: five evidence-carrying admission controls are admitted", async () => {
    const g4 = (await run()).falsifiers.find((entry) => entry.id === "G4_CHILD_WORKER_ADMISSION_GAP")!;
    expect(g4.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(g4.fiveEvidenceCarryingControlsAdmitted).toBe(true);
    expect(g4.admittedDespiteDefect).toContain("WORKER_RESULT_LINE_MALFORMED");
    expect(g4.admittedDespiteDefect).toContain("WORKER_RESULT_VOCABULARY_INVALID");
    expect(g4.admittedDespiteDefect).toContain("CHILD_REPORT_ERROR_HOST_FINISHED");
    expect(g4.admittedDespiteDefect).toContain("MISSING_ATTEMPT_IDENTITY");
    expect(g4.admittedDespiteDefect).toContain("UNEXPECTED_TERMINAL_STATE");
    /** The positive control still passes: a valid result remains admissible. */
    expect(g4.positiveControlValidStillAdmitted).toBe(true);
  }, 300_000);

  it("G5: a missing telemetry line and an explicit zero are the same value", async () => {
    const g5 = (await run()).falsifiers.find((entry) => entry.id === "G5_UPTAKE_ZERO_VS_MISSING")!;
    expect(g5.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(g5.missingAndZeroIndistinguishable).toBe(true);
    expect(g5.malformedAlsoBecomesZero).toBe(true);
  }, 300_000);

  it("G6: a filename-only match is attributed with no identity corroboration", async () => {
    const g6 = (await run()).falsifiers.find((entry) => entry.id === "G6_COST_ATTRIBUTION_FILENAME_ONLY")!;
    expect(g6.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(g6.attributed).toBe(true);
    expect(g6.filenameMatchingAlone).toBe(true);
    expect(g6.identityFieldsCorroborated).toEqual([]);
    expect(g6.requiresAllSixteenRecords).toBe(false);
  }, 300_000);

  it("G7: the post-matrix gate is green over sixteen unmeasured realizations", async () => {
    const g7 = (await run()).falsifiers.find((entry) => entry.id === "G7_POST_MATRIX_CAUSAL_ADMISSION_INCOMPLETE")!;
    expect(g7.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(g7.greenWithAllRealizationsUndefined).toBe(true);
    expect(g7.realizationFailures).toEqual([]);
    expect((g7.conditionsNotChecked as readonly string[]).length).toBe(6);
  }, 300_000);

  it("G8: a result line is read as an established exit, and a boolean as authorization", async () => {
    const result = await run();
    const exit = result.falsifiers.find((entry) => entry.id === "G8_TIMEOUT_RESULT_LINE_AS_EXIT")!;
    expect(exit.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(exit.defectPresent).toBe(true);
    expect(exit.descendantExitEstablished).toBe(true);
    expect(exit.classification).toBe("COMPLETED_WITH_REPORT");
    const auth = result.falsifiers.find((entry) => entry.id === "G8_AUTHORIZATION_BOOLEAN_ACCEPTED")!;
    expect(auth.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(auth.booleanTreatedAsAuthorizationDecision).toBe(true);
    expect(auth.decisionsVerified).toEqual([]);
  }, 300_000);
});
