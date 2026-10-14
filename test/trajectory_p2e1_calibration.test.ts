/**
 * Trajectory-P2-E1 §15 Group G — CALIBRATION FIXTURE AND DRY-RUN (C7).
 *
 * Proves, without running any trial:
 *
 *   66. the actual Git HEAD matches the Work base;
 *   67. the frozen context is reproducible;
 *   68. CONTROL and TREATMENT share task and tool authority;
 *   69. historical evidence is correctly source-classified;
 *   70. Ground Truth and Oracle are independent of the agent's answer;
 *   71. partial history remains partial;
 *   72. control-available and treatment-available evidence are distinguished;
 *   73. the dry-run does not contact external models;
 *   74. the dry-run produces a clear GO/NO-GO verdict;
 *   75. the R2-VR Qualification Law is included but not falsely marked completed.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FROZEN_CONDITIONS } from "../scripts/trajectory_p2e0/benchmark-fixture.mjs";
import { FUTURE_CALIBRATION_PARAMETERS, R2_VR_QUALIFICATION_REQUIREMENTS } from "../scripts/trajectory_p2e1/calibrate.mjs";
import { GROUNDED_TRUTH_SNAPSHOT, groundTruthDigest } from "../scripts/trajectory_p2e1/experimental-truth.mjs";
import { ORACLE_VERSION } from "../scripts/trajectory_p2e1/source-aware-oracle.mjs";

const REPO = process.cwd();
const readEvidence = (name: string): Record<string, unknown> => {
  const path = join(REPO, "research-evidence", "trajectory-p2e1", name);
  expect(existsSync(path)).toBe(true);
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
};

describe("E1-C §15 Group G — calibration fixture and dry-run", () => {
  it("66/67/68. the fixture world, frozen context and shared authority are consistent", () => {
    const fixture = readEvidence("calibration-fixture.json");
    expect(fixture.realGitBasisUsed).toBe(true);
    expect(fixture.syntheticGitBasisRemoved).toBe(true);
    // The frozen conditions the code exports are the ones the fixture declares.
    expect(FROZEN_CONDITIONS.fixtureId).toBe(fixture.fixtureId);
    expect(FROZEN_CONDITIONS.allowedTools.length).toBeGreaterThan(0);
    expect(FROZEN_CONDITIONS.writeScope.length).toBeGreaterThan(0);
    // CONTROL and TREATMENT differ ONLY by the Trajectory Section.
    expect(String(fixture.controlInput)).toContain("canonical Work Context");
    expect(String(fixture.treatmentInput)).toContain("SAME context");
    expect(fixture.controlGivenIncorrectHistory).toBe(false);
    expect(fixture.treatmentCommandPermissionsExpanded).toBe(false);
  });

  it("69/71. historical evidence is source-classified and partial history remains partial", () => {
    const dry = readEvidence("calibration-dry-run.json");
    const partial = (dry.checks as { id: string; ok: boolean; detail: string }[]).find((entry) => entry.id === "fixture-partial-page");
    expect(partial?.ok).toBe(true);
    expect(String(partial?.detail)).toMatch(/^\d+ of \d+$/u);
    // Every proposition names an authoritative owner.
    for (const proposition of GROUNDED_TRUTH_SNAPSHOT.propositions) {
      expect(typeof proposition.authoritativeSource).toBe("string");
      expect(proposition.authoritativeSource.length).toBeGreaterThan(0);
    }
  });

  it("70. the Ground Truth and Oracle are independent of the agent's answer", () => {
    // The digest is stable and the oracle names a version — neither depends on any answer.
    expect(groundTruthDigest()).toBe(groundTruthDigest());
    expect(ORACLE_VERSION).toBe("p2e1-source-aware-1");
    const dry = readEvidence("calibration-dry-run.json");
    expect(dry.oracleVersion).toBe(ORACLE_VERSION);
    expect(dry.groundTruthDigest).toBe(groundTruthDigest());
  });

  it("72. control-available and treatment-available evidence are distinguished", () => {
    const fixture = readEvidence("calibration-fixture.json");
    expect(fixture.evidenceAvailabilityRecordedPerArm).toBe(true);
    // Page coverage is available to TREATMENT but not to CONTROL.
    expect(GROUNDED_TRUTH_SNAPSHOT.availability.ORIGIN_DSH_PAGE_PARTIAL?.control).toBe("UNKNOWN");
    expect(GROUNDED_TRUTH_SNAPSHOT.availability.ORIGIN_DSH_PAGE_PARTIAL?.treatment).toBe("AVAILABLE");
    // Unobserved events remain unknown in BOTH arms.
    expect(GROUNDED_TRUTH_SNAPSHOT.availability.ORIGIN_ALL_DSH_EVENTS_OBSERVED?.control).toBe("UNKNOWN");
    expect(GROUNDED_TRUTH_SNAPSHOT.availability.ORIGIN_ALL_DSH_EVENTS_OBSERVED?.treatment).toBe("UNKNOWN");
  });

  it("73/74. the dry-run contacts no external model and reports a clear GO/NO-GO", () => {
    const dry = readEvidence("calibration-dry-run.json");
    expect(dry.verdict).toBe("GO");
    expect(dry.failedChecks).toEqual([]);
    expect(dry.externalModelRequestOccurred).toBe(false);
    expect(dry.paidModelRequestOccurred).toBe(false);
    expect(dry.modelCallsMade).toBe(0);
    expect(dry.stochasticCalibrationExecuted).toBe(false);
    expect(dry.treatmentTrialsExecuted).toBe(false);
    const ids = (dry.checks as { id: string }[]).map((entry) => entry.id);
    expect(ids).toContain("no-external-provider");
    expect(ids).toContain("no-stochastic-execution");
    expect(ids).toContain("no-credential-in-source");
  });

  it("75. the R2-VR law is included but NOT marked completed", () => {
    expect(R2_VR_QUALIFICATION_REQUIREMENTS.length).toBe(5);
    for (const requirement of R2_VR_QUALIFICATION_REQUIREMENTS) {
      expect(requirement.statusInE1).toBe("REQUIREMENT_ONLY");
    }
    const dry = readEvidence("calibration-dry-run.json");
    const carried = dry.r2vrQualificationRequirements as { statusInE1: string }[];
    expect(carried.length).toBe(5);
    expect(carried.every((entry) => entry.statusInE1 === "REQUIREMENT_ONLY")).toBe(true);
    // The five requirement ids are the R2-VR law's.
    const ids = R2_VR_QUALIFICATION_REQUIREMENTS.map((entry) => entry.id);
    expect(ids).toContain("baseline-neither-floor-nor-ceiling");
    expect(ids).toContain("two-dimensions-vary");
    expect(ids).toContain("treatment-relevant-failure-varies");
    expect(ids).toContain("trajectory-content-addresses-variation");
    expect(ids).toContain("not-residual-case-determined");
  });

  it("the future calibration parameters are declared and no credential is hard-coded", () => {
    expect(FUTURE_CALIBRATION_PARAMETERS).toContain("provider");
    expect(FUTURE_CALIBRATION_PARAMETERS).toContain("modelVersion");
    expect(FUTURE_CALIBRATION_PARAMETERS).toContain("stopRules");
    const source = readFileSync(join(REPO, "scripts", "trajectory_p2e1", "calibrate.mjs"), "utf8");
    // No API key / token literal is present.
    expect(/sk-[A-Za-z0-9]/u.test(source)).toBe(false);
    expect(source).not.toMatch(/api[_-]?key\s*[:=]\s*["'][^"']+["']/iu);
  });
});
