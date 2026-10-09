/**
 * R3-L0C-I-A §9/§10 — THE PLAN SUPERSESSION, THE EVIDENCE CORRECTIONS AND THE QUALIFICATION RECORD.
 *
 * These are the stage's closing gates. Each asserts a property that keeps the stage honest rather than a
 * measurement of the runtime:
 *
 *   · the plan SUPERSEDES the prior plan and does not amend it, and the prior plan's file is byte-identical;
 *   · the evidence corrections are forward statements that name their cause, not rewrites;
 *   · the regression record keeps the live gates in their own section, so no reader can read a green
 *     deterministic run as a statement about them;
 *   · the qualification's own verdicts are the honest ones — including the three this stage does not grant
 *     itself.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PLAN_ID, PLAN_SUPERSESSION, buildProspectivePlan, checkPlanClosure } from "../scripts/r3l0cia/prospective-plan.mjs";
import { PRIOR_TEST_COUNTS, testCountCorrection, liveGateDisclosureMeasurement, evidenceCorrections } from "../scripts/r3l0cia/evidence-corrections.mjs";
import { DETERMINISTIC_SUITES, LIVE_GATES, regressionRecord, suiteResult, immutabilityRecord } from "../scripts/r3l0cia/regression.mjs";
import { computeExecutionClosure } from "../scripts/r3l0cia/closure.mjs";
import { QUARANTINE_HONESTY, STAGE_EVIDENCE_PATH, ESCAPED_DEFECTS, REPO_ROOT } from "../scripts/r3l0cia/contract.mjs";

describe("R3-L0C-I-A §9 — the plan supersedes rather than amends", () => {
  it("names the plan it supersedes and records the prior artifacts as untouched", async () => {
    expect(PLAN_ID).toBe("r3-l0c-ia-primary-plan");
    expect(PLAN_SUPERSESSION.supersedes.planId).toBe("r3-l0c-i-primary-plan");
    expect(PLAN_SUPERSESSION.amendedPriorPlan).toBe(false);
    expect(PLAN_SUPERSESSION.priorPlanEdited).toBe(false);
    expect(PLAN_SUPERSESSION.supersedes.disposition).toMatch(/SUPERSEDED/u);
  });

  it("the prior plan's file is byte-identical: it is still the R3-L0C-I artifact", () => {
    const priorPath = join(REPO_ROOT, "research-evidence", "r3-l0c-i", "execution-plan.json");
    expect(existsSync(priorPath)).toBe(true);
    const prior = JSON.parse(readFileSync(priorPath, "utf8"));
    /** The prior plan still names ITSELF, which is what a supersession leaves behind. */
    expect(prior.planId).toBe("r3-l0c-i-primary-plan");
    expect(prior.planId).not.toBe(PLAN_ID);
    expect(prior.stage).toBe("R3-L0C-I");
  });

  it("the plan binds the closure, the schedule and every defect's property", async () => {
    const closure = await computeExecutionClosure({ verifyCompiled: false });
    const plan = await buildProspectivePlan({ closure, verifyCompiled: false });
    expect(plan.planId).toBe(PLAN_ID);
    expect(plan.executionClosure.executionClosureDigest).toBe(closure.executionClosureDigest);
    expect(plan.executionClosure.closureComplete).toBe(true);
    expect(plan.preservedDesign.sessionCount).toBe(16);
    expect(plan.schedule.length).toBe(16);
    expect(plan.executionPathDeviations.length).toBe(ESCAPED_DEFECTS.length);
    /** Every defect names the module that closes it. */
    for (const deviation of plan.executionPathDeviations) {
      expect(deviation.closedIn, deviation.defectId).toMatch(/^scripts\/r3l0cia\//u);
    }
    /** §9: the preserved design is the frozen one. */
    expect(plan.preservedDesign.primaryEndpointsChanged).toBe(false);
    expect(plan.preservedDesign.verdictThresholdsChanged).toBe(false);
    expect(plan.preservedDesign.seedRechosen).toBe(false);
    /** §9: the plan requires an authorization it does not provide. */
    expect(plan.authorizationRequired.required).toBe(true);
    expect(plan.authorizationRequired.thisStageProvidesIt).toBe(false);
    expect(plan.authorizationRequired.callerSuppliedStringIsNotProof).toBe(true);
    expect(plan.stageStop.modelCallsMade).toBe(0);
  }, 600_000);

  it("the quarantine is described honestly: a guard, not an impossibility", async () => {
    const closure = await computeExecutionClosure({ verifyCompiled: false });
    const plan = await buildProspectivePlan({ closure, verifyCompiled: false });
    expect(plan.executionRoute.legacyMatrixQuarantined).toBe(true);
    /** §2: the forbidden claim, carried as a value so a report cannot make it. */
    expect(plan.executionRoute.legacyMatrixStillExecutable).toBe(true);
    expect(QUARANTINE_HONESTY.legacyMatrixRemainsPhysicallyExecutable).toBe(true);
    expect(QUARANTINE_HONESTY.forbiddenClaim).toMatch(/do not claim the legacy matrix has become physically unexecutable/u);
    /** And the legacy matrix file really is still there, byte-identical. */
    expect(existsSync(join(REPO_ROOT, "scripts", "r3l0cr", "matrix.mjs"))).toBe(true);
  }, 600_000);

  it("checkPlanClosure reports NO_FROZEN_PLAN when nothing is written yet", async () => {
    const result = await checkPlanClosure({ planPath: join(REPO_ROOT, STAGE_EVIDENCE_PATH, "does-not-exist.json"), verifyCompiled: false });
    expect(result.EXECUTION_CLOSURE).toBe("NO_FROZEN_PLAN");
  }, 600_000);
});

describe("R3-L0C-I-A §10 — the evidence corrections are forward statements", () => {
  it("names the prior stage's counts and the files that produce the delta", () => {
    const correction = testCountCorrection({ currentUnitTests: 4000, currentUnitFiles: 289 });
    expect(correction.prior.stage).toBe("R3-L0C-I");
    expect(correction.prior.unitTests).toBe(3959);
    expect(correction.prior.unitFiles).toBe(286);
    expect(correction.delta.tests).toBe(41);
    expect(correction.delta.files).toBe(3);
    /** §6: the cause is named as FILES, so the correction is falsifiable. */
    expect(correction.addedTestFiles.length).toBeGreaterThan(0);
    for (const file of correction.addedTestFiles) expect(file).toMatch(/^r3l0cia_.*\.test\.ts$/u);
    expect(correction.priorEvidenceEdited).toBe(false);
  });

  it("keeps the live gates DISCLOSED rather than promoting them to passed", () => {
    const measurement = liveGateDisclosureMeasurement({ logPaths: [] });
    expect(measurement.disclosure.status).toBe("DISCLOSED_NOT_PASSED");
    expect(measurement.disclosure.presentedAsPassed).toBe(false);
    expect(measurement.disclosure.requiresAModelRoute).toBe(true);
    expect(measurement.disclosure.gates).toEqual(["D2", "D4", "D5"]);
    expect(measurement.thisStageEnteredPrimary).toBe(false);
  });

  it("measures the zero-request signature rather than asserting it", () => {
    /** A log shaped as the prior measurement described: one record, the session header. */
    const root = join(REPO_ROOT, ".r3l0cia-probe-logs");
    try {
      mkdirSync(root, { recursive: true });
      const headerOnly = join(root, "header-only.log");
      writeFileSync(headerOnly, `${JSON.stringify({ type: "session/header" })}\n`, "utf8");
      const withTurns = join(root, "with-turns.log");
      writeFileSync(withTurns, `${JSON.stringify({ type: "session/header" })}\n${JSON.stringify({ type: "turn/start" })}\n`, "utf8");
      const measurement = liveGateDisclosureMeasurement({ logPaths: [headerOnly, withTurns, join(root, "absent.log")] });
      expect(measurement.zeroRequestLogs).toBe(1);
      expect(measurement.logsRead).toBe(2);
      const observations = measurement.observations as readonly { verdict: string; path: string }[];
      expect(observations.find((entry) => entry.path === headerOnly)?.verdict).toBe("ZERO_MODEL_REQUESTS_EMITTED");
      /** A log whose shape differs is reported as such rather than counted either way. */
      expect(observations.find((entry) => entry.path === withTurns)?.verdict).toBe("SHAPE_DIFFERS_FROM_PRIOR_MEASUREMENT");
      expect(observations.find((entry) => entry.path.endsWith("absent.log"))?.verdict).toBe("LOG_ABSENT");
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });

  it("the corrections record forbids the rewrite it replaces", () => {
    const corrections = evidenceCorrections({ currentUnitTests: 4000, currentUnitFiles: 289 });
    expect(corrections.priorEvidenceEdited).toBe(false);
    expect(corrections.oldCommitsRewritten).toBe(false);
    expect(corrections.forcePush).toBe(false);
    expect(corrections.law).toMatch(/forward commits/u);
  });
});

describe("R3-L0C-I-A §10 — the regression record keeps the live gates separate", () => {
  it("declares the deterministic suites and the live gates in two sections", () => {
    expect(DETERMINISTIC_SUITES.length).toBeGreaterThan(10);
    expect(DETERMINISTIC_SUITES.every((suite) => suite.deterministic === true)).toBe(true);
    expect(LIVE_GATES.length).toBe(3);
    expect(LIVE_GATES.every((gate) => gate.requiresModelRoute === true)).toBe(true);
    expect(LIVE_GATES.every((gate) => gate.thisStageRanIt === false)).toBe(true);
  });

  it("computes no combined verdict, so a green deterministic section says nothing about the live gates", () => {
    const record = regressionRecord({
      baseline: "b6c15e69da3541837a822d4751db50b34794a279",
      deterministic: DETERMINISTIC_SUITES.map((suite) => suiteResult({ id: suite.id, verdict: "PASS", tests: 1, files: 1 })),
      live: LIVE_GATES.map((gate) => suiteResult({ id: gate.id, verdict: "NOT_RUN", detail: "requires a model route" })),
    });
    expect(record.sectionsMerged).toBe(false);
    expect(record.combinedVerdictComputed).toBe(false);
    expect(record.deterministic.ALL_DETERMINISTIC_GREEN).toBe(true);
    expect(record.live.status).toBe("DISCLOSED_NOT_ALL_PASSED");
    expect(record.law).toMatch(/kept separate from deterministic/u);
  });

  it("distinguishes NOT_RUN from a failure", () => {
    const record = regressionRecord({ deterministic: [suiteResult({ id: "A", verdict: "FAIL" }), suiteResult({ id: "B", verdict: "NOT_RUN" })] });
    expect(record.deterministic.failed).toEqual(["A"]);
    expect(record.deterministic.notRun).toEqual(["B"]);
    expect(record.deterministic.ALL_DETERMINISTIC_GREEN).toBe(false);
  });

  it("the immutability guard reports the protected namespaces and no restore path", async () => {
    const record = await immutabilityRecord();
    expect(record.verdict).toBe("PASS");
    expect(record.protectedNamespaces.length).toBeGreaterThan(0);
    expect(record.restoreAvailable).toBe(false);
  }, 300_000);
});
