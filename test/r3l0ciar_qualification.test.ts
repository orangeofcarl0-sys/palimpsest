/**
 * R3-L0C-I-A-R §9 — THE PLAN SUPERSESSION, THE EVIDENCE CORRECTIONS AND THE REGRESSION RECORD.
 *
 * These are the stage's closing gates. Each asserts a property that keeps the stage honest rather than a
 * measurement of the runtime:
 *
 *   · the plan SUPERSEDES the R3-L0C-I-A plan and does not amend it, and the prior plan's file is byte-identical;
 *   · the evidence corrections withdraw the prior stage's unconditional readiness conclusion and classify each
 *     published claim separately;
 *   · the regression record keeps the live gates in their own section;
 *   · the immutability guard reports no mutation of the protected namespaces.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PLAN_ID, PLAN_SUPERSESSION, buildProspectivePlan, checkPlanClosure } from "../scripts/r3l0ciar/prospective-plan.mjs";
import { INTERPRETATION_CORRECTION, PRIOR_VERDICTS, evidenceCorrections, measurePriorResult } from "../scripts/r3l0ciar/evidence-corrections.mjs";
import { DETERMINISTIC_SUITES, LIVE_GATES, regressionRecord, suiteResult, immutabilityRecord } from "../scripts/r3l0ciar/regression.mjs";
import { computeExecutionClosure } from "../scripts/r3l0ciar/closure.mjs";
import { CORRECTION_DEFECTS, REPO_ROOT, STAGE_EVIDENCE_PATH, SUPERSEDED_STAGE } from "../scripts/r3l0ciar/contract.mjs";

describe("R3-L0C-I-A-R §9 — the plan supersedes rather than amends", () => {
  it("names the plan it supersedes and records the prior artifacts as untouched", async () => {
    expect(PLAN_ID).toBe("r3-l0c-iar-primary-plan");
    expect(PLAN_SUPERSESSION.supersedes.planId).toBe("r3-l0c-ia-primary-plan");
    expect(PLAN_SUPERSESSION.amendedPriorPlan).toBe(false);
    expect(PLAN_SUPERSESSION.priorPlanEdited).toBe(false);
    expect(PLAN_SUPERSESSION.supersedes.disposition).toMatch(/SUPERSEDED/u);
    const plan = await buildProspectivePlan({ verifyCompiled: false });
    expect(plan.planId).toBe(PLAN_ID);
  }, 600_000);

  it("the R3-L0C-I-A plan's file is byte-identical: it still names itself", () => {
    const priorPath = join(REPO_ROOT, SUPERSEDED_STAGE.planPath);
    expect(existsSync(priorPath)).toBe(true);
    const prior = JSON.parse(readFileSync(priorPath, "utf8"));
    expect(prior.planId).toBe("r3-l0c-ia-primary-plan");
    expect(prior.planId).not.toBe(PLAN_ID);
    expect(prior.stage).toBe("R3-L0C-I-A");
  });

  it("binds the freshly computed closure, the schedule and every defect's property", async () => {
    const closure = await computeExecutionClosure({ verifyCompiled: false });
    const plan = await buildProspectivePlan({ closure, verifyCompiled: false });
    expect(plan.executionClosure.executionClosureDigest).toBe(closure.executionClosureDigest);
    expect(plan.executionClosure.closureComplete).toBe(true);
    expect(plan.preservedDesign.sessionCount).toBe(16);
    expect(plan.schedule.length).toBe(16);
    expect(plan.executionPathDeviations.length).toBe(CORRECTION_DEFECTS.length);
    for (const deviation of plan.executionPathDeviations) expect(deviation.closedIn, deviation.defectId).toMatch(/^scripts\/r3l0ciar\//u);
    /** §9: the preserved design is the frozen one. */
    expect(plan.preservedDesign.primaryEndpointsChanged).toBe(false);
    expect(plan.preservedDesign.verdictThresholdsChanged).toBe(false);
    expect(plan.preservedDesign.seedRechosen).toBe(false);
    /** §8: the plan requires an authorization it does not provide. */
    expect(plan.authorizationRequired.required).toBe(true);
    expect(plan.authorizationRequired.thisStageProvidesIt).toBe(false);
    expect(plan.authorizationRequired.booleanIsAConfigurationSignalNotADecision).toBe(true);
    expect((plan.authorizationRequired.decisions as readonly unknown[]).length).toBe(5);
    expect(plan.stageStop.modelCallsMade).toBe(0);
    /** §3: the plan binds the actual route identities, so a drift is detectable. */
    expect(plan.executionRoute.routeId).toBeTruthy();
    expect(plan.executionRoute.providerId).toBeTruthy();
    expect(plan.executionRoute.modelId).toBeTruthy();
    expect(plan.executionRoute.settingsDigest).toBeTruthy();
  }, 600_000);

  it("the quarantine is described honestly: a guard, not an impossibility", async () => {
    const plan = await buildProspectivePlan({ verifyCompiled: false });
    expect(plan.executionRoute.priorMatricesQuarantined).toBe(true);
    expect(plan.executionRoute.priorMatricesStillExecutable).toBe(true);
    expect(PLAN_SUPERSESSION.quarantine.forbiddenClaim).toMatch(/do not claim the prior matrices have become physically unexecutable/u);
    /** The prior pipelines really are still there, byte-identical. */
    expect(existsSync(join(REPO_ROOT, "scripts", "r3l0cia", "primary-driver.mjs"))).toBe(true);
    expect(existsSync(join(REPO_ROOT, "scripts", "r3l0cia", "activation.mjs"))).toBe(true);
  }, 600_000);

  it("checkPlanClosure reports NO_FROZEN_PLAN when nothing is written yet", async () => {
    const result = await checkPlanClosure({ planPath: join(REPO_ROOT, STAGE_EVIDENCE_PATH, "does-not-exist.json"), verifyCompiled: false });
    expect(result.EXECUTION_CLOSURE).toBe("NO_FROZEN_PLAN");
  }, 600_000);
});

describe("R3-L0C-I-A-R §1 — the published interpretation is corrected forward", () => {
  it("withdraws the unconditional readiness conclusion and classifies each claim separately", () => {
    expect(PRIOR_VERDICTS.PAID_REPLICATION).toBe("READY_FOR_AUTHORIZATION");
    expect(INTERPRETATION_CORRECTION.withdrawnConclusion.status).toBe("WITHDRAWN_AS_AN_UNCONDITIONAL_CLAIM");
    expect(INTERPRETATION_CORRECTION.withdrawnConclusion.reason).toMatch(/permanently unsatisfied|unmeasured|did not exist/u);
    const classes = INTERPRETATION_CORRECTION.classes;
    expect(classes.length).toBe(8);
    /** §1: the claims that survive are named, and the ones that do not are named. */
    const notProven = classes.filter((entry) => entry.status === "NOT_PROVEN_AS_PUBLISHED").map((entry) => entry.id);
    expect(notProven).toContain("ACTUAL_MATRIX_ENTRY_AUTHORIZATION");
    expect(notProven).toContain("PRE_POST_VALIDITY_EXECUTABLE");
    expect(notProven).toContain("RECONSTRUCTION_INSTRUMENTATION_WIRED");
    expect(notProven).toContain("PAID_EXECUTION_AUTHORIZED");
    const proven = classes.filter((entry) => entry.priorClaimRetained === true).map((entry) => entry.id);
    expect(proven).toContain("ACTIVATION_COMPONENT_PROVEN");
    expect(proven).toContain("DETERMINISTIC_CONFINEMENT_PROVEN");
  });

  it("reads the prior result without modifying it", () => {
    const prior = measurePriorResult();
    expect(prior.modified).toBe(false);
    if (prior.present === true && prior.publishedVerdicts !== null) {
      expect(prior.publishedVerdicts.PAID_REPLICATION).toBe("READY_FOR_AUTHORIZATION");
    }
  });

  it("the corrections record forbids the rewrite it replaces", () => {
    const corrections = evidenceCorrections();
    expect(corrections.priorEvidenceEdited).toBe(false);
    expect(corrections.oldCommitsRewritten).toBe(false);
    expect(corrections.forcePush).toBe(false);
    expect(corrections.priorEvidence.thisStageWritesOnlyTo).toBe(STAGE_EVIDENCE_PATH);
  });
});

describe("R3-L0C-I-A-R §9 — the regression record keeps the live gates separate", () => {
  it("declares the deterministic suites and the live gates in two sections", () => {
    expect(DETERMINISTIC_SUITES.length).toBeGreaterThan(10);
    expect(DETERMINISTIC_SUITES.every((suite) => suite.deterministic === true)).toBe(true);
    expect(LIVE_GATES.length).toBe(3);
    expect(LIVE_GATES.every((gate) => gate.thisStageRanIt === false)).toBe(true);
  });

  it("computes no combined verdict, so a green deterministic section says nothing about the live gates", () => {
    const record = regressionRecord({
      baseline: "dbe6beb92c33e78b1f2e75604f5da2babaf50df2",
      deterministic: DETERMINISTIC_SUITES.map((suite) => suiteResult({ id: suite.id, verdict: "PASS", tests: 1, files: 1 })),
      live: LIVE_GATES.map((gate) => suiteResult({ id: gate.id, verdict: "NOT_RUN", detail: "requires a model route" })),
    });
    expect(record.sectionsMerged).toBe(false);
    expect(record.combinedVerdictComputed).toBe(false);
    expect(record.deterministic.ALL_DETERMINISTIC_GREEN).toBe(true);
    expect(record.live.status).toBe("DISCLOSED_NOT_ALL_PASSED");
  });

  it("the immutability guard reports the protected namespaces and no restore path", async () => {
    const record = await immutabilityRecord();
    expect(record.verdict).toBe("PASS");
    expect(record.protectedNamespaces.length).toBeGreaterThan(0);
    expect(record.restoreAvailable).toBe(false);
  }, 300_000);
});
