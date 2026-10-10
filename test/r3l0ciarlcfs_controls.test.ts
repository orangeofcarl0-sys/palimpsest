/**
 * R3-L0C-I-A-R-L-C-F-S §2 — THE FAILING CONTROLS.
 *
 * §2 requires the failing controls to be committed BEFORE the correction. These tests CALL the real `8bf8d42`
 * functions and assert that each defect is PRESENT, so the corrections are checked against the same properties the
 * baseline violates rather than against properties invented afterwards.
 *
 * After the correction the same properties are asserted to HOLD on the corrected path, in
 * `test/r3l0ciarlcfs_gates.test.ts`.
 *
 * §10: every test here is T1 or T2 — a bounded call to a real function or a real durable journal. There is no
 * sixteen-session matrix in this file, because §10 forbids adding one for every helper test.
 */
import { describe, expect, it } from "vitest";

import {
  controlAuthorizationVerdictInconsistency,
  controlCrossArtifactPlanMismatch,
  controlFalseArtifactInterpretability,
  controlPartialTrialIdentity,
  controlUnsafeCleanupFallback,
  runBaselineControls,
  BASELINE_SOURCE,
} from "../scripts/r3l0ciarlcfs/baseline/legacy-controls.mjs";
import {
  AUTHORIZATION_CONDITIONS,
  CLEANUP_SAFETY_STEPS,
  EVIDENCE_GAP_IDS,
  EVIDENCE_GAPS,
  ARTIFACT_VALIDITY_STATES,
  IDENTITY_STATES,
  LEGACY_HELPER_QUARANTINE,
  PLAN_ID,
  PLAN_IDENTITY_CHECKS,
  PRESERVED_DESIGN,
  REQUIRED_RECONCILIATIONS,
  STAGE_STOP,
  TRIAL_IDENTITY_FIELDS,
  UNEARNED_VERDICTS,
  BASELINE_COMMIT,
  contractSummary,
} from "../scripts/r3l0ciarlcfs/contract.mjs";

describe("R3-L0C-I-A-R-L-C-F-S §0 contract", () => {
  it("binds the exact baseline and the superseded stage", () => {
    expect(BASELINE_COMMIT).toBe("8bf8d42298aee3b8b267b3793e015900ca7cc2a7");
    expect(PLAN_ID).toBe("r3-l0c-iar-lcfs-primary-plan");
    expect(contractSummary().gaps).toBe(5);
    expect(contractSummary().verdicts).toBe(19);
  });

  it("declares the five gaps with a measured observation each", () => {
    expect(EVIDENCE_GAPS).toHaveLength(5);
    for (const gap of EVIDENCE_GAPS) {
      expect(gap.measured.length).toBeGreaterThan(20);
      expect(gap.baselineLocation.length).toBeGreaterThan(10);
      expect(gap.authoritativePath.length).toBeGreaterThan(10);
    }
    expect(EVIDENCE_GAP_IDS).toEqual([
      "S1_CROSS_ARTIFACT_PLAN_MISMATCH",
      "S2_UNSAFE_CLEANUP_FALLBACK",
      "S3_PARTIAL_TRIAL_IDENTITY",
      "S4_FALSE_ARTIFACT_INTERPRETABILITY",
      "S5_AUTHORIZATION_VERDICT_INCONSISTENCY",
    ]);
  });

  it("keeps the frozen scientific design unchanged", () => {
    expect(PRESERVED_DESIGN.sessions).toBe(16);
    expect(PRESERVED_DESIGN.pairedBlocks).toBe(4);
    expect(PRESERVED_DESIGN.treatment).toBe("SELECTION_ONLY");
    expect(PRESERVED_DESIGN.randomizationSeed).toBe("1380724738");
    expect(PRESERVED_DESIGN.corpusCapitalExposuresOracleEndpointsThresholdsChanged).toBe(false);
    expect(PRESERVED_DESIGN.sampleSizeIncreased).toBe(false);
    expect(PRESERVED_DESIGN.newRandomization).toBe(false);
  });

  it("carries the six plan-identity checks and the ten cleanup steps as data", () => {
    expect(PLAN_IDENTITY_CHECKS.map((entry) => entry.id)).toEqual([
      "COMMITTED_PLAN_SELF_DIGEST", "COMMITTED_PLAN_GIT_IDENTITY", "QUALIFICATION_PLAN_REFERENCE",
      "STAGE_RESULT_PLAN_REFERENCE", "PLAN_ID_AGREEMENT", "PLAN_CLOSURE_AGREEMENT",
    ]);
    expect(CLEANUP_SAFETY_STEPS).toHaveLength(10);
  });

  it("requires a rationale for every included and excluded trial-identity field", () => {
    for (const entry of TRIAL_IDENTITY_FIELDS) {
      expect(entry.rationale.length).toBeGreaterThan(20);
      expect(typeof entry.included).toBe("boolean");
      expect(typeof entry.loadBearing).toBe("boolean");
    }
    expect(TRIAL_IDENTITY_FIELDS.some((entry) => entry.included === false)).toBe(true);
    expect(TRIAL_IDENTITY_FIELDS.filter((entry) => entry.included).map((entry) => entry.field)).toContain("attemptId");
  });

  it("keeps the identity states separate and the authorization conditions mandatory", () => {
    expect(Object.keys(IDENTITY_STATES)).toHaveLength(4);
    expect(AUTHORIZATION_CONDITIONS).toHaveLength(8);
    expect(AUTHORIZATION_CONDITIONS.every((entry) => entry.mandatory === true)).toBe(true);
    expect(ARTIFACT_VALIDITY_STATES.filter((entry) => entry.interpretable === false).length).toBeGreaterThanOrEqual(4);
    expect(REQUIRED_RECONCILIATIONS).toHaveLength(7);
  });

  it("discloses the legacy helper quarantine honestly", () => {
    expect(LEGACY_HELPER_QUARANTINE.physicallyUnexecutable).toBe(false);
    expect(LEGACY_HELPER_QUARANTINE.quarantineIsAGuardNotAnImpossibility).toBe(true);
  });

  it("carries the six unearned verdicts and the stop", () => {
    expect(Object.keys(UNEARNED_VERDICTS).length).toBeGreaterThanOrEqual(6);
    expect(STAGE_STOP.paidExecution).toBe("NOT_RUN");
    expect(STAGE_STOP.realPrimaryCausalResult).toBe("NOT_EVALUABLE");
    expect(STAGE_STOP.modelCallsMade).toBe(0);
  });
});

describe("R3-L0C-I-A-R-L-C-F-S §2 S1 — the committed plan and the Qualification disagree", () => {
  it("measures the mismatch between the committed plan and the persisted references", async () => {
    const control = await controlCrossArtifactPlanMismatch();
    expect(control.defectPresent).toBe(true);
    const observed = control.observed as Record<string, unknown>;
    expect(observed.selfCheckVerdict).toBe("MATCH");
    expect(observed.qualificationMatchesCommitted).toBe(false);
    expect(observed.stageResultMatchesCommitted).toBe(false);
    expect(observed.qualificationPlanReference).not.toBe(observed.committedDigest);
  });

  it("measures the root cause: a rebuild regenerates frozenAt and moves the digest", async () => {
    const control = await controlCrossArtifactPlanMismatch();
    const observed = control.observed as Record<string, unknown>;
    expect(observed.rebuildFrozenAtDiffers).toBe(true);
    expect(observed.rebuildMovesDigest).toBe(true);
    expect(observed.firstBuildDigest).not.toBe(observed.secondBuildDigest);
  });

  it("confirms the committed plan is internally self-consistent", async () => {
    const control = await controlCrossArtifactPlanMismatch();
    const observed = control.observed as Record<string, unknown>;
    expect(observed.committedRecomputedDigest).toBe(observed.committedDigest);
  });
});

describe("R3-L0C-I-A-R-L-C-F-S §2 S2 — the unsafe cleanup fallback", () => {
  it("measures the destructive fallback executing after a failed unlink", () => {
    const control = controlUnsafeCleanupFallback();
    expect(control.defectPresent).toBe(true);
    const observed = control.observed as Record<string, unknown>;
    expect(observed.fallbackExecutedAfterFailedUnlink).toBe(true);
    expect(observed.destructiveCallsAfterFailedUnlink).toContain("git-worktree-remove-force");
    expect(observed.destructiveCallsAfterFailedUnlink).toContain("rmSync-recursive-force");
  });

  it("measures the real junction behaviour in a disposable directory only", () => {
    const control = controlUnsafeCleanupFallback();
    const observed = control.observed as Record<string, unknown>;
    expect(observed.platform).toBe(process.platform);
    expect(observed.rmdirPreservesTarget).toBe(true);
    expect(typeof observed.recursiveDeleteFollowsJunction).toBe("boolean");
  });

  it("records the baseline's own reported link removals as empty on failure", () => {
    const control = controlUnsafeCleanupFallback();
    const observed = control.observed as Record<string, unknown>;
    expect(observed.removedLinksReportedByBaseline).toEqual([]);
  });
});

describe("R3-L0C-I-A-R-L-C-F-S §2 S3 — the partial trial identity reconciliation", () => {
  it("measures a GREEN reconciliation despite conflicting attempt and host-job identities", async () => {
    const control = await controlPartialTrialIdentity();
    expect(control.defectPresent).toBe(true);
    const observed = control.observed as Record<string, unknown>;
    expect(observed.reconciliationGreen).toBe(true);
    expect(observed.durableIdentityExactHolds).toBe(true);
    expect(observed.durableMatchesInMemoryHolds).toBe(true);
    expect(observed.attemptIdDiffers).toBe(true);
    expect(observed.hostJobIdDiffers).toBe(true);
    expect(observed.executionClosureDiffers).toBe(true);
    expect(observed.contentDigestsDiffer).toBe(true);
    expect(observed.identityMismatchesReported).toEqual([]);
  });
});

describe("R3-L0C-I-A-R-L-C-F-S §2 S4 — the false artifact interpretability", () => {
  it("measures an arbitrary JSON object as INTERPRETABLE with apparently measured zeros", async () => {
    const control = await controlFalseArtifactInterpretability();
    expect(control.defectPresent).toBe(true);
    const observed = control.observed as Record<string, unknown>;
    expect(observed.arbitraryArtifactInterpretable).toBe(true);
    expect(observed.arbitraryArtifactState).toBe("INTERPRETABLE");
    expect(observed.arbitraryHasTurnStart).toBe(false);
    expect(observed.arbitraryRawHistoryArtifactsRead).toBe(0);
    expect(observed.zerosIndistinguishableFromMeasuredZero).toBe(true);
  });
});

describe("R3-L0C-I-A-R-L-C-F-S §2 S5 — the authorization verdict inconsistency", () => {
  it("measures VERIFIED while host spending enforcement is absent", async () => {
    const control = await controlAuthorizationVerdictInconsistency();
    expect(control.defectPresent).toBe(true);
    expect(control.testFixture).toBe(true);
    const observed = control.observed as Record<string, unknown>;
    expect(observed.verified).toBe(true);
    expect(observed.actualHostEnforcedBudget).toBe(false);
    expect(observed.enforcementProblemStatedInProblems).toBe(true);
  });

  it("keeps the launch prohibited even under a synthetically verified source", async () => {
    const control = await controlAuthorizationVerdictInconsistency();
    const observed = control.observed as Record<string, unknown>;
    expect(observed.launchProhibited).toBe(true);
    expect(observed.currentLaunchPermission).toBe(false);
  });
});

describe("R3-L0C-I-A-R-L-C-F-S §2 all five controls", () => {
  it("confirms every declared defect against the real baseline functions", async () => {
    const run = await runBaselineControls();
    expect(run.baseline).toBe(BASELINE_SOURCE.revision);
    expect(run.ALL_DEFECTS_CONFIRMED).toBe(true);
    expect(run.notViolated).toEqual([]);
    expect(run.modelCallsMade).toBe(0);
    expect(run.controls).toHaveLength(5);
  });
});
