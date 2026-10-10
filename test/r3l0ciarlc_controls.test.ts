/**
 * R3-L0C-I-A-R-L-C §2 — THE FAILING CONTROLS.
 *
 * §2 requires the failing controls to be committed BEFORE the correction. These tests run each control against
 * the R3-L0C-I-A-R-L code at `6089947` and assert that the defect is PRESENT — so the corrections are checked
 * against the same properties the baseline violates rather than against properties invented afterwards.
 *
 * After the correction the same properties are asserted to hold on the corrected path, in
 * `test/r3l0ciarlc_gates.test.ts`.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ATTESTATION_POINTS,
  ATTESTATION_RULES,
  AUTHORITY_TRUST,
  AUTHORIZATION_RECORD_FIELDS,
  AUTHORIZATION_REQUIREMENTS,
  BASELINE_COMMIT,
  CONTROL_GATE_IDS,
  CORRECTION_GATES,
  COST_BRIDGE_OUTCOMES,
  EXPERIMENTAL_INPUTS,
  FROZEN_SESSION_SCOPE,
  LIVE_PRIMARY_EVIDENCE,
  PRESERVED_DESIGN,
  PRIMARY_DERIVED_INPUTS,
  PRIMARY_REFUSED_INPUTS,
  TERMINAL_ADMISSION_CONDITIONS,
  UNEARNED_VERDICTS,
  contractSummary,
} from "../scripts/r3l0ciarlc/contract.mjs";
import {
  controlAttestationOutsideGate,
  controlDurableCostDisconnection,
  controlPostflightOutsideAdmission,
  controlWeakAuthorizationTrust,
} from "../scripts/r3l0ciarlc/baseline/legacy-controls.mjs";
import { runCorrectionControls } from "../scripts/r3l0ciarlc/falsifiers.mjs";

const PIPELINE = join(process.cwd(), "scripts", "r3l0ciarl", "pipeline.mjs");

describe("R3-L0C-I-A-R-L-C — the contract declares the four gates and the eleven verdicts", () => {
  it("names the baseline, the gates and the verdicts", () => {
    expect(BASELINE_COMMIT).toBe("6089947c40dab2c8c67106f1f7ee1fb1c41ac1ad");
    expect(CORRECTION_GATES.length).toBe(4);
    expect(CONTROL_GATE_IDS).toEqual([
      "LC_A_DURABLE_COST_BRIDGE", "LC_B_POSTMATRIX_ADMISSION", "LC_C_PRIMARY_TRUST_BOUNDARY", "LC_D_INRUN_ATTESTATION",
    ]);
    expect(CORRECTION_GATES.map((gate) => gate.id)).toEqual([...CONTROL_GATE_IDS]);
    expect(COST_BRIDGE_OUTCOMES.length).toBe(9);
    expect(TERMINAL_ADMISSION_CONDITIONS.length).toBe(9);
    expect(ATTESTATION_POINTS.map((point) => point.id)).toEqual(["S0", "S1", "S2"]);
    expect(AUTHORIZATION_REQUIREMENTS.length).toBe(5);
    expect(AUTHORIZATION_RECORD_FIELDS).toContain("paidRunBudget");
    expect(FROZEN_SESSION_SCOPE).toBe(16);
    expect(PRIMARY_DERIVED_INPUTS).toContain("plan");
    expect(PRIMARY_DERIVED_INPUTS).toContain("closure");
    expect(PRIMARY_DERIVED_INPUTS).toContain("validityGate");
    expect(PRIMARY_DERIVED_INPUTS).toContain("costAttribution");
    expect(PRIMARY_DERIVED_INPUTS).toContain("retries");
    /** §5: the trusted host inputs and the execution-configuration seams are refused too. */
    expect(PRIMARY_REFUSED_INPUTS).toContain("dshHome");
    expect(PRIMARY_REFUSED_INPUTS).toContain("installHostBundle");
    expect(PRIMARY_REFUSED_INPUTS).toContain("verifyCompiled");
    expect(PRIMARY_REFUSED_INPUTS).toContain("timeoutMs");
    /** §5: the frozen experimental inputs are NOT refused, or a legitimate PRIMARY run could not supply them. */
    for (const name of EXPERIMENTAL_INPUTS) expect(PRIMARY_REFUSED_INPUTS).not.toContain(name);
    expect(LIVE_PRIMARY_EVIDENCE.modeLabelAloneIsInsufficient).toBe(true);
    expect(ATTESTATION_RULES.installedDuringRunDoesNotSuppressDetection).toBe(true);
    expect(AUTHORITY_TRUST.thisStageProvidesAuthorization).toBe(false);
    /** §8: the frozen design is carried and unchanged. */
    expect(PRESERVED_DESIGN.sessions).toBe(16);
    expect(PRESERVED_DESIGN.treatment).toBe("SELECTION_ONLY");
    expect(PRESERVED_DESIGN.corpusCapitalExposuresOracleEndpointsThresholdsChanged).toBe(false);
    /** §10: the verdicts this stage cannot promote are carried as their honest values. */
    expect(UNEARNED_VERDICTS.PAID_EXECUTION).toBe("NOT_RUN");
    expect(UNEARNED_VERDICTS.CAUSAL_RESULT).toBe("NOT_EVALUABLE");
    const summary = contractSummary();
    expect(summary.stage).toBe("R3-L0C-I-A-R-L-C");
    expect(summary.verdicts).toBe(11);
    expect(summary.modelCallsMade).toBe(0);
  });
});

describe("R3-L0C-I-A-R-L-C — every corrected property is violated at the baseline", () => {
  it("Gate A: the durable record carries no artifact path, so the cost readback measures nothing", async () => {
    const directory = mkdtempSync(join(tmpdir(), "r3l0ciarlc-a-"));
    try {
      const control = await controlDurableCostDisconnection({ directory });
      expect(control.defectPresent).toBe(true);
      expect(control.journalCarriesSessionArtifactPath).toBe(false);
      expect(control.journalCarriesHiddenInvariantVector).toBe(false);
      expect(control.recordCarriesSessionArtifactPath).toBe(false);
      /** The record DOES bind the sidecar, so the loss is the unresolved binding, not a missing binding. */
      expect(control.recordBindsTheSidecar).toBe(true);
      /** The artifact is real and on disk, so the loss is in the readback, not the artifact. */
      expect(control.artifactExistsOnDisk).toBe(true);
      expect(control.consumedPath).toBeNull();
      expect(control.costMeasured).toBe(false);
      expect(control.costFields).toBeNull();
    } finally {
      try { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  }, 300_000);

  it("Gate B: the postflight runs after the runner has already decided completion", () => {
    const control = controlPostflightOutsideAdmission({ source: readFileSync(PIPELINE, "utf8") });
    expect(control.defectPresent).toBe(true);
    expect(control.postflightIsAfterTheRunner).toBe(true);
    expect(control.postflightFeedsCompletion).toBe(false);
    expect(control.validityGateRecomputesClosure).toBe(false);
    expect(control.singleAuthoritativeTerminalReducer).toBe(false);
  });

  it("Gate C: a fabricated decision reference with a one-session budget verifies", async () => {
    const control = await controlWeakAuthorizationTrust();
    expect(control.defectPresent).toBe(true);
    expect(control.fabricatedAuthorityAccepted).toBe(true);
    expect(control.oneSessionBudgetAccepted).toBe(true);
    expect(control.oneSessionBudgetMaxSessions).toBe(1);
    expect(control.frozenScopeRequired).toBe(16);
    expect(control.trustedAuthoritySourceConsulted).toBe(false);
    expect(control.launchPermissionDerivedFromTrust).toBe(false);
  }, 300_000);

  it("Gate D: competing-writer detection is suppressed exactly when this stage installs", async () => {
    const control = await controlAttestationOutsideGate({ source: readFileSync(PIPELINE, "utf8") });
    expect(control.defectPresent).toBe(true);
    expect(control.changedWithOwnInstallDetected).toBe(false);
    expect(control.changedWithoutOwnInstallDetected).toBe(true);
    expect(control.installedDuringRunSuppressesDetection).toBe(true);
    expect(control.rechecksInstallationAfterTheMatrix).toBe(false);
    expect(control.establishesS1PostInstallBaseline).toBe(false);
    expect(control.attestationIsATerminalCondition).toBe(false);
  }, 300_000);
});

describe("R3-L0C-I-A-R-L-C — the control runner measures all four defects", () => {
  it("reports every declared property violated by the baseline", async () => {
    const run = await runCorrectionControls();
    expect(run.declared).toBe(4);
    expect(run.measuredProperties).toBe(4);
    expect(run.ALL_DEFECTS_VIOLATED_BY_BASELINE).toBe(true);
    expect([...run.violated].sort()).toEqual([...CONTROL_GATE_IDS].sort());
    expect(run.notViolated).toEqual([]);
    expect(run.modelCallsMade).toBe(0);
    expect(run.baseline).toBe(BASELINE_COMMIT);
  }, 600_000);
});
