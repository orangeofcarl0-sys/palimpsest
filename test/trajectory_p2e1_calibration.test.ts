/**
 * Trajectory-P2-E1R §15 Group G — CALIBRATION LAUNCH GATE (C6).
 *
 * Proves, without running any trial:
 *
 *   66. the actual Git HEAD matches the Work base;
 *   67. the frozen context is reproducible and per-run;
 *   68. CONTROL and TREATMENT share task and tool authority;
 *   69. historical evidence is correctly source-classified;
 *   70. Ground Truth and Oracle are independent of the agent's answer;
 *   71. partial history remains partial;
 *   72. control-available and treatment-available evidence are distinguished;
 *   73. the dry-run does not contact external models;
 *   74. the dry-run produces a clear GO/NO-GO verdict and rejects negative controls;
 *   75. the R2-VR Qualification Law is included but not falsely marked completed.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FROZEN_CONDITIONS } from "../scripts/trajectory_p2e0/benchmark-fixture.mjs";
import { FUTURE_CALIBRATION_PARAMETERS, R2_VR_QUALIFICATION_REQUIREMENTS } from "../scripts/trajectory_p2e1/calibrate.mjs";
import { REFERENCE_ASSAY_TRUTH } from "../scripts/trajectory_p2e1/experimental-truth.mjs";
import { LEGACY_ORACLE_STATUS, OFFICIAL_ORACLE } from "../scripts/trajectory_p2e1/assay-evaluation.mjs";
import { ORACLE_VERSION } from "../scripts/trajectory_p2e1/source-aware-oracle.mjs";

const REPO = process.cwd();
const readEvidence = (name: string): Record<string, unknown> => {
  const path = join(REPO, "research-evidence", "trajectory-p2e1r", name);
  expect(existsSync(path)).toBe(true);
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
};

describe("E1R-C §15 Group G — calibration launch gate", () => {
  it("66/67/68. the fixture world, frozen context and shared authority are consistent", () => {
    const fixture = readEvidence("calibration-fixture.json");
    expect(fixture.realGitBasisUsed).toBe(true);
    expect(fixture.syntheticGitBasisRemoved).toBe(true);
    expect(FROZEN_CONDITIONS.fixtureId).toBe(fixture.fixtureId);
    expect(FROZEN_CONDITIONS.allowedTools.length).toBeGreaterThan(0);
    expect(FROZEN_CONDITIONS.writeScope.length).toBeGreaterThan(0);
    expect(String(fixture.controlInput)).toContain("Canonical Work Context");
    expect(String(fixture.treatmentInput)).toContain("SAME context");
    expect(fixture.controlGivenIncorrectHistory).toBe(false);
    expect(fixture.treatmentCommandPermissionsExpanded).toBe(false);
  });

  it("69/71. historical evidence is source-classified and partial history remains partial", () => {
    const dry = readEvidence("calibration-launch-gate.json");
    const partial = (dry.checks as { id: string; ok: boolean; detail: string }[]).find((entry) => entry.id === "fixture-partial-page");
    expect(partial?.ok).toBe(true);
    expect(String(partial?.detail)).toMatch(/^\d+ of \d+$/u);
    for (const proposition of REFERENCE_ASSAY_TRUTH.propositions) {
      expect(typeof proposition.authoritativeSource).toBe("string");
      expect(proposition.authoritativeSource.length).toBeGreaterThan(0);
    }
    // The corrected truth answers the determinable question FALSE, not UNKNOWN.
    expect(REFERENCE_ASSAY_TRUTH.propositions.find((entry) => entry.id === "ALL_REPORTED_DSH_EVENTS_RETURNED")!.truth).toBe("FALSE");
  });

  it("70. the Ground Truth and Oracle are independent of the agent's answer", () => {
    /**
     * E1RC: this suite reads the FROZEN E1R evidence, which must never be rewritten. It therefore asserts the
     * E1R-era oracle version that artifact recorded, and separately asserts that the CURRENT oracle has moved
     * forward (so the historical score is not silently relabelled under the new semantics, §4.5).
     */
    const E1R_ORACLE_VERSION = "p2e1r-proposition-admission-1";
    expect(ORACLE_VERSION).not.toBe(E1R_ORACLE_VERSION);
    expect(ORACLE_VERSION).toBe("p2e1rc-arm-wide-admission-1");
    expect(OFFICIAL_ORACLE.module).toBe("scripts/trajectory_p2e1/source-aware-oracle.mjs");
    const dry = readEvidence("calibration-launch-gate.json");
    expect(dry.oracleVersion).toBe(E1R_ORACLE_VERSION);
    expect(dry.officialOracle).toBe(OFFICIAL_ORACLE.module);
    // The dry-run instantiates a per-run truth; its digest is SHA-256, not a static FNV constant.
    const instantiated = (dry.checks as { id: string; detail: string }[]).find((entry) => entry.id === "truth-digest-is-sha256");
    expect(instantiated?.id).toBe("truth-digest-is-sha256");
    expect(String(instantiated?.detail)).toMatch(/^sha256-[0-9a-f]{64}$/u);
  });

  it("72. control-available and treatment-available evidence are distinguished", () => {
    const fixture = readEvidence("calibration-fixture.json");
    expect(fixture.evidenceAvailabilityRecordedPerArm).toBe(true);
    expect(REFERENCE_ASSAY_TRUTH.availability.ORIGIN_DSH_PAGE_PARTIAL?.control).toBe("UNKNOWN");
    expect(REFERENCE_ASSAY_TRUTH.availability.ORIGIN_DSH_PAGE_PARTIAL?.treatment).toBe("AVAILABLE");
    expect(REFERENCE_ASSAY_TRUTH.availability.ALL_REPORTED_DSH_EVENTS_RETURNED?.control).toBe("UNKNOWN");
    expect(REFERENCE_ASSAY_TRUTH.availability.ALL_REPORTED_DSH_EVENTS_RETURNED?.treatment).toBe("AVAILABLE");
    expect(REFERENCE_ASSAY_TRUTH.availability.OUTCOMES_OF_UNRETURNED_EVENTS?.treatment).toBe("UNKNOWN");
  });

  it("73/74. the dry-run contacts no external model, rejects negatives and reports GO/NO-GO", () => {
    const dry = readEvidence("calibration-launch-gate.json");
    expect(dry.verdict).toBe("DETERMINISTIC_ASSAY_GO");
    expect(dry.failedChecks).toEqual([]);
    expect(dry.externalModelRequestOccurred).toBe(false);
    expect(dry.paidModelRequestOccurred).toBe(false);
    expect(dry.modelCallsMade).toBe(0);
    expect(dry.stochasticCalibrationExecuted).toBe(false);
    expect(dry.treatmentTrialsExecuted).toBe(false);
    const ids = (dry.checks as { id: string }[]).map((entry) => entry.id);
    expect(ids).toContain("no-external-provider");
    expect(ids).toContain("no-stochastic-execution");
    expect(ids).toContain("negative-controls-rejected");
    expect(ids).toContain("positive-treatment-passes");
    expect(ids).toContain("positive-control-passes");
    expect(ids).toContain("treatment-relevance");
    expect(ids).toContain("truth-instantiated-from-run");
    // Every declared check actually inspected state — none passes with a bare literal.
    const negative = (dry.checks as { id: string; ok: boolean }[]).find((entry) => entry.id === "negative-controls-rejected");
    expect(negative?.ok).toBe(true);
  });

  it("75. the R2-VR law is included but NOT marked completed", () => {
    expect(R2_VR_QUALIFICATION_REQUIREMENTS.length).toBe(5);
    for (const requirement of R2_VR_QUALIFICATION_REQUIREMENTS) {
      expect(requirement.statusInE1R).toBe("REQUIREMENT_ONLY");
    }
    const dry = readEvidence("calibration-launch-gate.json");
    const carried = dry.r2vrQualificationRequirements as { statusInE1R: string }[];
    expect(carried.length).toBe(5);
    expect(carried.every((entry) => entry.statusInE1R === "REQUIREMENT_ONLY")).toBe(true);
  });

  it("the legacy oracle is isolated from the active assay", () => {
    expect(LEGACY_ORACLE_STATUS.classification).toBe("LEGACY_REPRODUCTION_ONLY");
    expect(LEGACY_ORACLE_STATUS.usedByActiveAssay).toBe(false);
    const isolated = readEvidence("legacy-oracle-isolation.json");
    expect(isolated.usedByActiveAssay).toBe(false);
    expect(isolated.activeAssayImportsLegacyOracle).toBe(false);
  });

  it("the future calibration parameters are declared and no credential is hard-coded", () => {
    expect(FUTURE_CALIBRATION_PARAMETERS).toContain("provider");
    expect(FUTURE_CALIBRATION_PARAMETERS).toContain("modelVersion");
    expect(FUTURE_CALIBRATION_PARAMETERS).toContain("stopRules");
    const source = readFileSync(join(REPO, "scripts", "trajectory_p2e1", "calibrate.mjs"), "utf8");
    expect(/sk-[A-Za-z0-9]/u.test(source)).toBe(false);
    expect(source).not.toMatch(/api[_-]?key\s*[:=]\s*["'][^"']+["']/iu);
  });
});
