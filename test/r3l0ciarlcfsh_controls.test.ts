/**
 * R3-L0C-I-A-R-L-C-F-S-H §2 — THE MEASURED BASELINE CONTROLS.
 *
 * §2 requires the failing controls to be committed BEFORE the correction, and requires each suspected defect to be
 * REPRODUCED against the actual committed implementation rather than marked confirmed by assertion. Every test
 * here calls the real `80823c4` function and asserts that the defect is PRESENT.
 *
 * After the correction the same properties are asserted to HOLD on the corrected path, in
 * `test/r3l0ciarlcfsh_gates.test.ts`.
 *
 * §10: every test here is T1 or T2. There is no sixteen-session matrix in this file, because §10 forbids adding one
 * for every helper test. The dangerous filesystem branches are measured on disposable directories under the system
 * temp root, never against shared dependencies or user data.
 */
import { describe, expect, it } from "vitest";

import {
  BASELINE_SOURCE,
  controlCleanupDefects,
  controlContradictoryPersistedSeal,
  controlIdentityEvidenceLevel,
  controlUnconditionalQualification,
  controlValidatorNotConsumed,
  runBaselineControls,
} from "../scripts/r3l0ciarlcfsh/baseline/legacy-controls.mjs";
import {
  BASELINE_COMMIT,
  BASELINE_DEFECTS,
  BASELINE_DEFECT_IDS,
  CLEANUP_SAFETY_STEPS,
  COMPLETION_CLASSIFICATIONS,
  COST_COMPLETENESS_LEVELS,
  FINAL_VERDICTS,
  LEGACY_HELPER_QUARANTINE,
  OWNERSHIP_WITNESSES,
  PLAN_ID,
  PRESERVED_DESIGN,
  QUALIFICATION_CONDITIONS,
  RUNNER_MUTATION_FIELDS,
  SEAL_PHASES,
  STAGE_BRANCH,
  STAGE_STOP,
  UNEARNED_VERDICTS,
  VALIDATED_COST_CHAIN,
  contractSummary,
} from "../scripts/r3l0ciarlcfsh/contract.mjs";

describe("R3-L0C-I-A-R-L-C-F-S-H §0 contract", () => {
  it("binds the exact baseline, the branch and the superseding plan identity", () => {
    expect(BASELINE_COMMIT).toBe("80823c4e5b0015b265ae71df8d6468c0bfe9c865");
    expect(STAGE_BRANCH).toBe("r3-l0c-iar-lcfsh-terminal-hotfix");
    expect(PLAN_ID).toBe("r3-l0c-iar-lcfsh-primary-plan");
  });

  it("declares the five baseline defects, each with a measured observation", () => {
    expect(BASELINE_DEFECTS).toHaveLength(5);
    expect(BASELINE_DEFECT_IDS).toEqual([
      "B1_VALIDATOR_NOT_CONSUMED",
      "B2_CLEANUP_REACHES_DESTRUCTIVE_OPERATIONS",
      "B3_CONTRADICTORY_PERSISTED_SEAL",
      "B4_IDENTITY_EVIDENCE_LEVEL",
      "B5_UNCONDITIONAL_QUALIFICATION_PASS",
    ]);
    for (const defect of BASELINE_DEFECTS) {
      expect(defect.measured.length).toBeGreaterThan(0);
      expect(defect.baselineLocation.length).toBeGreaterThan(0);
      expect(defect.authoritativePath.length).toBeGreaterThan(0);
    }
  });

  it("declares the twenty-four verdicts §12 requires", () => {
    expect(Object.keys(FINAL_VERDICTS)).toHaveLength(24);
    for (const vocabulary of Object.values(FINAL_VERDICTS)) {
      expect(Array.isArray(vocabulary)).toBe(true);
      expect(vocabulary.length).toBeGreaterThan(0);
    }
  });

  it("keeps the unearned verdicts as their honest values", () => {
    expect(UNEARNED_VERDICTS.LIVE_PRIMARY_PROVENANCE).toBe("NOT_ESTABLISHED");
    expect(UNEARNED_VERDICTS.EXTERNAL_AUTHORITY).toBe("NOT_ESTABLISHED");
    expect(UNEARNED_VERDICTS.HOST_SPEND_ENFORCEMENT).toBe("NOT_ESTABLISHED");
    expect(UNEARNED_VERDICTS.PAID_EXECUTION).toBe("NOT_RUN");
    expect(UNEARNED_VERDICTS.CAUSAL_RESULT).toBe("NOT_EVALUABLE");
    expect(UNEARNED_VERDICTS.neverPromotedToPass).toBe(true);
  });

  it("preserves the frozen scientific design", () => {
    expect(PRESERVED_DESIGN.sessions).toBe(16);
    expect(PRESERVED_DESIGN.pairedBlocks).toBe(4);
    expect(PRESERVED_DESIGN.treatment).toBe("SELECTION_ONLY");
    expect(PRESERVED_DESIGN.randomizationSeed).toBe("1380724738");
    expect(PRESERVED_DESIGN.corpusCapitalExposuresOracleEndpointsThresholdsChanged).toBe(false);
    expect(PRESERVED_DESIGN.sampleSizeIncreased).toBe(false);
  });

  it("declares the ordered cost chain, the cleanup steps and the seal phases", () => {
    expect(VALIDATED_COST_CHAIN).toHaveLength(10);
    expect(VALIDATED_COST_CHAIN[0]).toBe("READ_DURABLE_JOURNAL");
    expect(VALIDATED_COST_CHAIN.at(-1)).toBe("BUILD_MATRIX_COST_FROM_VALIDATED_STATES");
    expect(CLEANUP_SAFETY_STEPS).toHaveLength(11);
    expect(OWNERSHIP_WITNESSES).toHaveLength(6);
    expect(SEAL_PHASES.PHASE_A.isFinalVerdict).toBe(false);
    expect(SEAL_PHASES.PHASE_B.isFinalVerdict).toBe(true);
  });

  it("declares the twelve qualification conditions and the three cost levels", () => {
    expect(QUALIFICATION_CONDITIONS).toHaveLength(12);
    expect(COST_COMPLETENESS_LEVELS.map((level: { id: string }) => level.id)).toEqual([
      "CostAccountingComplete",
      "CostMeasuredComplete",
      "LivePrimaryCostComplete",
    ]);
    expect(COMPLETION_CLASSIFICATIONS).toHaveLength(3);
  });

  it("summarises the contract without computing a combined readiness flag", () => {
    const summary = contractSummary();
    expect(summary.stage).toBe("R3-L0C-I-A-R-L-C-F-S-H");
    expect(summary.defects).toBe(5);
    expect(summary.verdicts).toBe(24);
    expect(summary.modelCallsMade).toBe(0);
    expect("readiness" in summary).toBe(false);
  });

  it("carries the mandatory stop as values", () => {
    expect(STAGE_STOP.paidExecution).toBe("NOT_RUN");
    expect(STAGE_STOP.causalResult).toBe("NOT_EVALUABLE");
    expect(STAGE_STOP.ranPaidMatrix).toBe(false);
    expect(STAGE_STOP.beganR3L1).toBe(false);
    expect(STAGE_STOP.beganFusion).toBe(false);
    expect(STAGE_STOP.modelCallsMade).toBe(0);
  });
});

describe("R3-L0C-I-A-R-L-C-F-S-H §2 B1 — the artifact validator is not consumed", () => {
  it("measures the real authoritative cost bridge admitting an ENVELOPE_INVALID artifact", async () => {
    const control = await controlValidatorNotConsumed();
    expect(control.id).toBe("B1_VALIDATOR_NOT_CONSUMED");
    expect(control.observed.newValidatorState).toBe("ENVELOPE_INVALID");
    expect(control.observed.newValidatorInterpretable).toBe(false);
    expect(control.observed.oldBridgeOutcome).toBe("MEASURED_FIXTURE");
    expect(control.observed.oldBridgeMeasured).toBe(true);
    expect(control.observed.oldBridgeRawHistoryArtifactsRead).toBe(0);
    expect(control.defectPresent).toBe(true);
  });

  it("distinguishes the old bridge's response from the standalone validator's response", async () => {
    const control = await controlValidatorNotConsumed();
    expect(control.observed.oldBridgeMeasured).toBe(true);
    expect(control.observed.newValidatorInterpretable).toBe(false);
    expect(control.validatorIsAbsentFromTheChain).toBe(true);
  });
});

describe("R3-L0C-I-A-R-L-C-F-S-H §2 B2 — cleanup reaches destructive operations", () => {
  it("measures a caller-supplied ownership claim deleting a directory outside the disposable root", async () => {
    const control = await controlCleanupDefects();
    expect(control.observed.callerSuppliedOwnership.outcome).toBe("CLEANED");
    expect(control.observed.callerSuppliedOwnership.destructiveFallbackExecuted).toBe(true);
    expect(control.observed.callerSuppliedOwnership.userFileSurvived).toBe(false);
  });

  it("measures a textual prefix comparison accepting a sibling directory", async () => {
    const control = await controlCleanupDefects();
    expect(control.observed.prefixSibling.outcome).toBe("CLEANED");
    expect(control.observed.prefixSibling.destructiveFallbackExecuted).toBe(true);
    expect(control.observed.prefixSibling.siblingFileSurvived).toBe(false);
  });

  it("measures a dangling link that existsSync cannot see while lstat proves it remains", async () => {
    const control = await controlCleanupDefects();
    expect(control.observed.danglingLink.linkCreated).toBe(true);
    expect(control.observed.danglingLink.existsSyncFalseWhileLinkRemains).toBe(true);
  });

  it("measures a nested link invisible to the root-only enumeration", async () => {
    const control = await controlCleanupDefects();
    expect(control.observed.nestedLink.nestedLinkCreated).toBe(true);
    expect(control.observed.nestedLink.seenByRootOnlyEnumeration).toBe(0);
  });

  it("reports the defect present from the real measurements", async () => {
    const control = await controlCleanupDefects();
    expect(control.defectPresent).toBe(true);
  });
});

describe("R3-L0C-I-A-R-L-C-F-S-H §2 B3 — the contradictory persisted seal", () => {
  it("finds the contradiction in the COMMITTED evidence, not merely in memory", () => {
    const control = controlContradictoryPersistedSeal();
    expect(control.observed.crossArtifactSealBinding).toBe("MISMATCH");
    expect(control.observed.crossArtifactSealSealed).toBe(false);
    expect(control.observed.verdictCrossArtifactPlanBinding).toBe("MATCH");
    expect(control.observed.readinessCrossArtifactEvidenceSealed).toBe(true);
    expect(control.observed.sealWasComputedWithNullInputs).toBe(true);
    expect(control.defectPresent).toBe(true);
  });

  it("records the exact calculation order and sources", () => {
    const control = controlContradictoryPersistedSeal();
    expect(control.calculationOrder.length).toBeGreaterThanOrEqual(4);
    expect(control.calculationOrder.join(" ")).toContain("qualification: null");
  });
});

describe("R3-L0C-I-A-R-L-C-F-S-H §2 B4 — the trial-identity evidence level", () => {
  it("records that the highest level demonstrated is below the authoritative level", () => {
    const control = controlIdentityEvidenceLevel();
    expect(control.evidenceLevelDemonstrated.T1_primitive).toBe(true);
    expect(control.evidenceLevelDemonstrated.T2_integration).toBe(true);
    expect(control.defectPresent).toBe(true);
    expect(["T1", "T2"]).toContain(control.highestLevelDemonstrated);
  });

  it("names the three Runner mutation fields the T3 control may move", () => {
    expect(RUNNER_MUTATION_FIELDS).toEqual(["attemptId", "hostJobId", "contentDigests"]);
  });
});

describe("R3-L0C-I-A-R-L-C-F-S-H §2 B5 — the unconditional qualification", () => {
  it("measures the literal PASS coexisting with a failed seal in committed evidence", () => {
    const control = controlUnconditionalQualification();
    expect(control.observed.literalPassAssignmentInSource).toBe(true);
    expect(control.observed.committedVerdict).toBe("PASS");
    expect(control.observed.committedCrossArtifactSealSealed).toBe(false);
    expect(control.observed.verdictCoexistsWithAFailedSeal).toBe(true);
    expect(control.defectPresent).toBe(true);
  });
});

describe("R3-L0C-I-A-R-L-C-F-S-H §2 baseline control runner", () => {
  it("reproduces every declared defect against the committed baseline", async () => {
    const record = await runBaselineControls();
    expect(record.declared).toBe(5);
    expect(record.reproduced).toBe(5);
    expect(record.ALL_DEFECTS_REPRODUCED).toBe(true);
    expect(record.notReproduced).toEqual([]);
    expect(record.modelCallsMade).toBe(0);
  }, 120_000);

  it("names the exact baseline revision the measurements were taken against", () => {
    expect(BASELINE_SOURCE.revision).toBe("80823c4e5b0015b265ae71df8d6468c0bfe9c865");
    expect(BASELINE_SOURCE.files.length).toBeGreaterThan(0);
  });

  it("discloses the legacy helper quarantine rather than claiming impossibility", () => {
    expect(LEGACY_HELPER_QUARANTINE.physicallyUnexecutable).toBe(false);
    expect(LEGACY_HELPER_QUARANTINE.quarantineIsAGuardNotAnImpossibility).toBe(true);
    expect((LEGACY_HELPER_QUARANTINE.helpers as readonly string[]).length).toBeGreaterThanOrEqual(2);
  });
});
