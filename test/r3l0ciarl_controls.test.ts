/**
 * R3-L0C-I-A-R-L §1-§4 — THE FAILING CONTROLS.
 *
 * §Final requires the failing controls to be committed BEFORE the implementation. These tests run each control
 * against the R3-L0C-I-A-R code at `36ada58` and assert that the defect is PRESENT — so the repairs are checked
 * against the same properties the baseline violates rather than against properties invented afterwards.
 *
 * After the repair the same properties are asserted to hold on the repaired path, in `r3l0ciarl_gates.test.ts`.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BASELINE_COMMIT, CORRECTION_GATES, PRIMARY_DERIVED_INPUTS, AUTHORIZATION_REQUIREMENTS, LIVE_EVIDENCE, ATTESTATION, FINAL_VERDICTS, contractSummary } from "../scripts/r3l0ciarl/contract.mjs";
import { controlLiveEvidenceContinuity, controlPostflightFreshness, controlPrimaryInputBinding, controlAuthorityVerification, controlRuntimeAttestation } from "../scripts/r3l0ciarl/baseline/legacy-controls.mjs";
import { dshHome } from "../scripts/gates/env.mjs";

describe("R3-L0C-I-A-R-L — the contract declares the four gates", () => {
  it("names the baseline, the gates and the verdicts", () => {
    expect(BASELINE_COMMIT).toBe("36ada589f62bad2cbfc5bdf1dad7b8201876640e");
    expect(CORRECTION_GATES.length).toBe(4);
    expect(CORRECTION_GATES.map((gate) => gate.id)).toEqual([
      "L1_LIVE_ARTIFACT_CONTINUITY", "L2_POSTFLIGHT_FRESHNESS", "L3_PRIMARY_INPUT_BINDING", "L4_RUNTIME_ATTESTATION",
    ]);
    expect(PRIMARY_DERIVED_INPUTS.length).toBeGreaterThanOrEqual(12);
    expect(AUTHORIZATION_REQUIREMENTS.length).toBe(5);
    expect(LIVE_EVIDENCE.requiredFields).toContain("sessionArtifactPath");
    expect(LIVE_EVIDENCE.requiredFields).toContain("hiddenInvariantVector");
    expect(LIVE_EVIDENCE.bindingField).toBe("contentDigests");
    expect(ATTESTATION.installerIsMitigationNotProof).toBe(true);
    expect(Object.keys(FINAL_VERDICTS).length).toBe(8);
    const summary = contractSummary();
    expect(summary.stage).toBe("R3-L0C-I-A-R-L");
    expect(summary.modelCallsMade).toBe(0);
  });
});

describe("R3-L0C-I-A-R-L — every corrected property is violated at the baseline", () => {
  it("L1: the live artifact identity and hidden vector do not survive into the durable record", async () => {
    const directory = mkdtempSync(join(tmpdir(), "r3l0ciarl-l1-"));
    try {
      const control = await controlLiveEvidenceContinuity({ directory });
      expect(control.defectPresent).toBe(true);
      expect(control.journalCarriesSessionArtifactPath).toBe(false);
      expect(control.journalCarriesHiddenInvariantVector).toBe(false);
      expect(control.recordCarriesSessionArtifactPath).toBe(false);
      expect(control.recordCarriesHiddenInvariantVector).toBe(false);
      expect(control.carriedFields).toEqual([]);
      /** The artifact itself exists and is real-format, so the loss is in the RECORD, not the artifact. */
      expect(control.artifactExists).toBe(true);
    } finally {
      try { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  }, 300_000);

  it("L2: a mutation after preflight is invisible and the counts are the caller's", () => {
    const control = controlPostflightFreshness({ preflightClosureDigest: "a".repeat(64), postflightClosureDigest: "b".repeat(64), callerReplacements: 0, callerRetries: 0, journalLaunches: 16 });
    expect(control.defectPresent).toBe(true);
    expect(control.runtimeChangedAfterPreflight).toBe(true);
    expect(control.baselineDetectsTheChange).toBe(false);
    expect(control.baselineUsesAFreshDigest).toBe(false);
    expect(control.retriesDerivedFromJournal).toBe(false);
  });

  it("L3: a PRIMARY run can substitute every derived measurement", () => {
    const source = readFileSync(join(process.cwd(), "scripts", "r3l0ciar", "pipeline.mjs"), "utf8");
    const control = controlPrimaryInputBinding({ source, PRIMARY_DERIVED_INPUTS });
    expect(control.defectPresent).toBe(true);
    expect(control.substitutableInputs).toContain("plan");
    expect(control.substitutableInputs).toContain("closure");
    expect(control.substitutableInputs).toContain("preExposureChecks");
    expect(control.substitutableInputs).toContain("validityGate");
    expect(control.substitutableInputs).toContain("costAttribution");
    expect(control.substitutableInputs).toContain("costProvenance");
    expect(control.substitutableInputs).toContain("replacements");
    expect(control.substitutableInputs).toContain("retries");
    expect(control.modeConditionOnSubstitution).toBe(false);
  });

  it("L3b: an arbitrary authority string satisfies the authorization check", async () => {
    const control = await controlAuthorityVerification();
    expect(control.defectPresent).toBe(true);
    expect(control.arbitraryAuthorityAccepted).toBe(true);
    expect(control.approvedPlanRequired).toBe(false);
    expect(control.paidRunBudgetRequired).toBe(false);
    expect(control.authorityVerifiedAtLaunchBoundary).toBe(false);
  }, 300_000);

  it("L4: source-to-compiled verification is skipped and the installed bundle is unchecked", () => {
    const control = controlRuntimeAttestation({ dshHomePath: dshHome() });
    expect(control.defectPresent).toBe(true);
    expect(control.verifyCompiledRequested).toBe(false);
    expect(control.compiledMatchesSourceEvaluated).toBe(false);
    expect(control.installedBundleChecked).toBe(false);
    expect(control.installerPresentedAsAtomicReplacement).toBe(true);
  });
});
