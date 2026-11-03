/**
 * R3-L0C-I Gate 1/2 — THE FROZEN NEGATIVE CONTROLS AND THE CORRECTED OUTCOME POLICY.
 *
 * Gate 1 requires three negative controls to be FROZEN against the R3-L0C-F implementation and then fixed through
 * the real execution entry. Each control here asserts the CORRECTED behaviour, and each carries the measurement of
 * what the defect was — so a reader can see both what was wrong and that it is now closed.
 *
 * Gate 2 requires the three-way disposition to be separated and the empty-object success to be refused. The tests
 * assert the separation directly, because it is the stage's central semantic correction: an incorrect hidden
 * vector and a declined capital pull are OBSERVATIONS, while a machinery fault and a Canonical Work blockage are
 * STOPS.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { CLAIM_FILE, classifyOutcome, inspectPreservedRun, inspectRunClaim, runFailStopMatrix } from "../scripts/r3l0cf/fail-stop.mjs";
import { twoGenerationSchedule } from "../scripts/r3l0cf/crash-matrix.mjs";
import { BEHAVIORAL_OUTCOME_POLICY, OUTCOME_DISPOSITIONS, REQUIRED_ADMISSION_SIGNALS, admitOutcome } from "../scripts/r3l0cf/outcome-admission.mjs";

const ROOTS: string[] = [];
const freshRoot = (name: string): string => {
  const root = mkdtempSync(join(tmpdir(), `r3l0ci-${name}-`));
  ROOTS.push(root);
  return root;
};
afterAll(() => {
  for (const root of ROOTS) {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds SQLite handles briefly */ }
  }
});

/** Gate 2: an outcome carrying every required admission signal, healthy. */
const ADMITTED_BASE = Object.freeze({
  jobPhase: "FINISHED",
  reportPresent: true,
  attemptState: "COMPLETED",
  consumerVisibleHandleCount: 0,
  governedPullCount: 0,
  completionCause: "RESULT_SUBMITTED",
});

describe("R3-L0C-I Gate 1 — the three frozen negative controls", () => {
  it("CONTROL 1: a second run with the same exposed runRoot launches NOTHING", async () => {
    /**
     * THE DEFECT, MEASURED: R3-L0C-F re-ran the whole schedule and launched every session again, ignoring the
     * journal sitting on disk. That is a replay of possibly-exposed sessions — the one thing fail-stop exists to
     * prevent, reachable by running the same command twice.
     */
    const runRoot = freshRoot("g1-replay");
    let launches = 0;
    const launch = async () => { launches += 1; return ADMITTED_BASE; };
    const first = await runFailStopMatrix({ runId: "replay", runRoot, schedule: twoGenerationSchedule(0, "C"), launch, validityGate: async () => ({ green: true }) });
    expect(first.terminalState).toBe("MATRIX_COMPLETE");
    const afterFirst = launches;
    expect(afterFirst).toBe(2);

    await expect(runFailStopMatrix({ runId: "replay", runRoot, schedule: twoGenerationSchedule(0, "C"), launch, validityGate: async () => ({ green: true }) }))
      .rejects.toThrow(/REFUSED_REPLAY/);
    /** THE PROPERTY: no further launch happened. */
    expect(launches).toBe(afterFirst);
  });

  it("CONTROL 1b: a DIFFERENT runId cannot take a claimed root either", async () => {
    const runRoot = freshRoot("g1-claim");
    const launch = async () => ADMITTED_BASE;
    await runFailStopMatrix({ runId: "owner", runRoot, schedule: twoGenerationSchedule(0, "C"), launch, validityGate: async () => ({ green: true }) });
    await expect(runFailStopMatrix({ runId: "intruder", runRoot, schedule: twoGenerationSchedule(0, "C"), launch, validityGate: async () => ({ green: true }) }))
      .rejects.toThrow(/REFUSED_ALREADY_CLAIMED/);
  });

  it("CONTROL 2: classifyOutcome({}) is NOT OK — an empty object carries no admission evidence", () => {
    /**
     * THE DEFECT, MEASURED: `classifyOutcome({})` returned `"OK"`, a default-to-success path that would let a
     * broken adapter produce sixteen "successful" sessions.
     */
    const empty = classifyOutcome({});
    expect(empty.classification).not.toBe("OK");
    expect(empty.classification).toBe("UNCLASSIFIABLE");
    expect(empty.disposition).toBe("UNCLASSIFIABLE");
    expect(empty.isAStop).toBe(true);
    /** And it names WHAT was missing, so the failure is diagnosable rather than merely refused. */
    expect(empty.missingSignals.length).toBe(REQUIRED_ADMISSION_SIGNALS.length);
    expect(classifyOutcome(null).disposition).toBe("UNCLASSIFIABLE");
  });

  it("CONTROL 3: omitting validityGate can never allow MATRIX_COMPLETE", async () => {
    /**
     * THE DEFECT, MEASURED: R3-L0C-F defaulted the gate to green, so forgetting it silently produced
     * MATRIX_COMPLETE. A gate that defaults to green is not a gate.
     */
    const runRoot = freshRoot("g1-gate");
    await expect(runFailStopMatrix({ runId: "no-gate", runRoot, schedule: twoGenerationSchedule(0, "C"), launch: async () => ADMITTED_BASE }))
      .rejects.toThrow(/requires an explicit validityGate/);
    /** The refusal is BEFORE any work: nothing was claimed and nothing was written. */
    expect(inspectRunClaim({ runRoot, runId: "no-gate" }).verdict).toBe("NEW");
  });

  it("the claim file is created exclusively and names its owner", async () => {
    const runRoot = freshRoot("g1-exclusive");
    await runFailStopMatrix({ runId: "owner", runRoot, schedule: twoGenerationSchedule(0, "C"), launch: async () => ADMITTED_BASE, validityGate: async () => ({ green: true }) });
    const claim = JSON.parse(readFileSync(join(runRoot, CLAIM_FILE), "utf8"));
    expect(claim.runId).toBe("owner");
    expect(claim.exclusive).toBe(true);
    expect(typeof claim.pid).toBe("number");
  });

  it("a restart against a preserved run refuses automatic resume", async () => {
    const runRoot = freshRoot("g1-restart");
    await runFailStopMatrix({ runId: "unc", runRoot, schedule: twoGenerationSchedule(0, "C"), launch: async () => ({ ...ADMITTED_BASE, outcomeUnknown: true }), validityGate: async () => ({ green: true }) });
    const inspection = inspectPreservedRun(runRoot);
    expect(inspection.mayResumeAutomatically).toBe(false);
    expect(inspection.mayReplaceAutomatically).toBe(false);
    expect(inspection.exposureIntents).toBeGreaterThan(0);
  });
});

describe("R3-L0C-I Gate 2 — the three-way outcome disposition", () => {
  it("separates admissible observation, trial-invalid, and censored", () => {
    expect(OUTCOME_DISPOSITIONS.map((entry: { id: string }) => entry.id)).toEqual(["ADMITTED", "TRIAL_INVALID", "CENSORED", "UNCLASSIFIABLE"]);
    expect(BEHAVIORAL_OUTCOME_POLICY.separates.admissibleObservation.length).toBeGreaterThan(0);
    expect(BEHAVIORAL_OUTCOME_POLICY.separates.infrastructureOrTreatmentFailure.length).toBeGreaterThan(0);
    expect(BEHAVIORAL_OUTCOME_POLICY.separates.canonicalWorkBlockage).toBe("CANONICAL_WORK_CANNOT_ADVANCE");
  });

  it("an INCORRECT hidden-oracle vector is ADMITTED, not a stop", () => {
    /** Gate 2's central correction: this is the study's dependent variable. */
    const incorrect = admitOutcome({ ...ADMITTED_BASE, hiddenInvariantVector: { failedPrepaidClasses: ["P1", "P3"], prepaidCoverage: 0.5 } });
    expect(incorrect.disposition).toBe("ADMITTED");
    expect(incorrect.trialRecorded).toBe(true);
    expect(incorrect.matrixResponse).toBe("CONTINUE");
    expect(incorrect.observations.map((entry: { id: string }) => entry.id)).toContain("INCORRECT_IMPLEMENTATION");
    expect(BEHAVIORAL_OUTCOME_POLICY.incorrectOracleVectorIsAStop).toBe(false);
  });

  it("a DECLINED capital pull is ADMITTED, not a stop", () => {
    const declined = admitOutcome({ ...ADMITTED_BASE, consumerVisibleHandleCount: 2, governedPullCount: 0 });
    expect(declined.disposition).toBe("ADMITTED");
    expect(declined.observations.map((entry: { id: string }) => entry.id)).toContain("MODEL_DECLINED_VISIBLE_CAPITAL");
    expect(BEHAVIORAL_OUTCOME_POLICY.declinedCapitalPullIsAStop).toBe(false);
  });

  it("low coverage and budget exhaustion are ADMITTED observations", () => {
    expect(admitOutcome({ ...ADMITTED_BASE, hiddenInvariantVector: { failedPrepaidClasses: [], prepaidCoverage: 0.1 } }).disposition).toBe("ADMITTED");
    expect(admitOutcome({ ...ADMITTED_BASE, completionCause: "MAX_TOKENS" }).disposition).toBe("ADMITTED");
  });

  it("a machinery fault is TRIAL_INVALID and stops the matrix", () => {
    for (const fault of [
      { reportPresent: false },
      { jobPhase: "HOST_ERROR" },
      { treatmentMismatch: true },
      { gitObjectResolutionFailed: true },
      { containmentFailed: true },
      { closureMismatch: true },
      { threw: true },
    ]) {
      const admitted = admitOutcome({ ...ADMITTED_BASE, ...fault });
      expect(admitted.disposition, JSON.stringify(fault)).toBe("TRIAL_INVALID");
      expect(admitted.matrixResponse).toBe("STOP_MATRIX");
      expect(admitted.trialRecorded).toBe(false);
    }
  });

  it("a Canonical Work blockage is CENSORED and forbids the forced repair", () => {
    const censored = admitOutcome({ ...ADMITTED_BASE, workCannotAdvance: true });
    expect(censored.disposition).toBe("CENSORED");
    expect(censored.matrixResponse).toBe("STOP_MATRIX_PRESERVE_CENSORED");
    expect(censored.forbiddenRepair).toMatch(/never force Result, Verification or Promotion/);
    expect(BEHAVIORAL_OUTCOME_POLICY.forcesResultVerificationOrPromotion).toBe(false);
  });

  it("a machinery fault dominates a behavioural observation when both are present", () => {
    const both = admitOutcome({ ...ADMITTED_BASE, jobPhase: "HOST_ERROR", hiddenInvariantVector: { failedPrepaidClasses: ["P1"], prepaidCoverage: 0.3 } });
    expect(both.disposition).toBe("TRIAL_INVALID");
    expect(both.cause).toBe("HOST_FAILURE");
  });

  it("the policy does not change the frozen endpoints or thresholds", () => {
    expect(BEHAVIORAL_OUTCOME_POLICY.frozenEndpointsChanged).toBe(false);
    expect(BEHAVIORAL_OUTCOME_POLICY.frozenThresholdsChanged).toBe(false);
    expect(BEHAVIORAL_OUTCOME_POLICY.requiresExplicitAdmissionEvidence).toBe(true);
    expect(BEHAVIORAL_OUTCOME_POLICY.emptyObjectAdmitted).toBe(false);
  });

  it("an incorrect vector no longer stops the matrix end to end", async () => {
    const runRoot = freshRoot("g2-continue");
    const run = await runFailStopMatrix({
      runId: "behavioural",
      runRoot,
      schedule: twoGenerationSchedule(0, "C"),
      launch: async () => ({ ...ADMITTED_BASE, hiddenInvariantVector: { failedPrepaidClasses: ["P1"], prepaidCoverage: 0.4 } }),
      validityGate: async () => ({ green: true }),
    });
    /** THE CORRECTION: both sessions complete, and the observations are recorded on the records. */
    expect(run.terminalState).toBe("MATRIX_COMPLETE");
    expect(run.completedSessions.length).toBe(2);
    expect(run.records.every((record: { observations: readonly unknown[] }) => record.observations.length > 0)).toBe(true);
    expect(run.causalVerdictIssued).toBe(false);
  });
});
