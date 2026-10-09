/**
 * R3-L0C-F §7/§8/§10/§11/§12 — THE DETERMINISTIC ABORT, PRESERVATION, BOUNDARY AND CONTAINMENT GATES.
 *
 * This is the heavier half of the stage's tests: it runs the §8 crash matrix through the REAL packaged runtime,
 * the §10 four-way treatment-boundary witnesses against the REAL prehistory, the §11 containment gate over the
 * ACTUAL matrix topology, and the §12 substitutability audit. No model is called anywhere.
 *
 * WHY THESE TESTS SHARE ONE PREHISTORY. Building the frozen prehistory takes about twenty seconds, and it is
 * deterministic, so it is built ONCE in `beforeAll` and every case copies from it. The copy is not an
 * optimisation: §8's crash cases mutate their world, so a case run against a shared world would have its fault
 * made unmeasurable by a previous case — measured, a second case against an already-progressed world failed with
 * `TASK_NOT_NEXT_SCHEDULABLE`, a harness artifact rather than the fault under test.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildPrehistory } from "../scripts/r3l0c/build-prehistory.mjs";
import { admitCapital, selectionRefs } from "../scripts/r3l0c/prehistory.mjs";
import { runCrashMatrix, provePreservation } from "../scripts/r3l0cf/crash-matrix.mjs";
import { runMatrixContainmentGate, scheduleUnitIds } from "../scripts/r3l0cf/containment.mjs";
import { runSubstitutabilityAudit } from "../scripts/r3l0cf/substitutability.mjs";
import { runTreatmentBoundaryWitnesses } from "../scripts/r3l0cf/qualification.mjs";
import { CRASH_MATRIX_CASES, CRASH_MATRIX_REQUIREMENTS, CONTAINMENT_REQUIREMENTS } from "../scripts/r3l0cf/contract.mjs";

const BASE = join(tmpdir(), `palimpsest-r3l0cf-gates-${String(process.pid)}`);
let prehistory: { world: string; paths: Record<string, string>; state: string };
let refs: readonly unknown[];
let crashMatrix: Awaited<ReturnType<typeof runCrashMatrix>>;

beforeAll(async () => {
  rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  mkdirSync(BASE, { recursive: true });
  const built = await buildPrehistory(join(BASE, "prehistory"));
  const admitted = await admitCapital(join(BASE, "prehistory"), built.paths, "cutover-entitlements", built.world);
  prehistory = { world: built.world, paths: built.paths, state: built.paths.state };
  refs = selectionRefs(admitted);
  const caseRoot = join(BASE, "cases");
  mkdirSync(caseRoot, { recursive: true });
  crashMatrix = await runCrashMatrix({ caseRoot, prehistory: { world: built.world, state: built.paths.state }, admittedRefs: refs });
}, 900_000);

afterAll(() => {
  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
});

describe("R3-L0C-F §8 — the deterministic crash matrix", () => {
  it("runs all ten required cases", () => {
    expect(crashMatrix.allCasesRun).toBe(true);
    expect(crashMatrix.cases.length).toBe(10);
    for (const required of CRASH_MATRIX_CASES) expect(crashMatrix.cases.some((entry: { id: string }) => entry.id === required.id)).toBe(true);
  });

  it("every failure case exhibits all five §8 properties", () => {
    for (const entry of crashMatrix.cases) {
      const properties = entry.properties;
      for (const required of CRASH_MATRIX_REQUIREMENTS) {
        const found = properties.properties.find((item: { id: string }) => item.id === required);
        expect(found?.holds, `${entry.id} must satisfy ${required}`).toBe(true);
      }
      expect(entry.PASSES_CRASH_MATRIX_REQUIREMENTS, `${entry.id}`).toBe(true);
    }
    expect(crashMatrix.CRASH_MATRIX).toBe("PASS");
  });

  it("no case launched a session more than once, and none synthesized a terminal or a verdict", () => {
    for (const entry of crashMatrix.cases) {
      expect(entry.maxLaunchesPerSession ?? 0).toBeLessThanOrEqual(1);
      /** §5/§15: the runner writes no product terminal and issues no causal verdict. */
      expect(entry.properties.properties.find((item: { id: string }) => item.id === "NO_FAKE_ATTEMPT_TERMINAL")?.holds).toBe(true);
      expect(entry.properties.properties.find((item: { id: string }) => item.id === "NO_CAUSAL_VERDICT")?.holds).toBe(true);
    }
  });

  it("the failure cases stop the matrix rather than continuing to later sessions", () => {
    const stopped = crashMatrix.cases.filter((entry: { id: string }) => entry.id !== "C10_HEALTHY_TWO_GENERATION_TRAJECTORY");
    for (const entry of stopped) {
      expect(entry.properties.properties.find((item: { id: string }) => item.id === "NEXT_SESSION_NOT_STARTED")?.holds, `${entry.id}`).toBe(true);
    }
  });

  it("§4 does not infer uncertainty where no launch was possible", () => {
    /**
     * The distinction §4 turns on, asserted directly. A failure BEFORE the launch seam was entered is
     * ABORT_PRESERVED with zero launches — NOT UNCERTAIN, because inferring that a model call might have occurred
     * when none could have is the same class of error as inferring that none occurred when one might have.
     */
    const beforeLaunch = crashMatrix.cases.find((entry: { id: string }) => entry.id === "C1_FAILURE_BEFORE_LAUNCH");
    expect(beforeLaunch?.launches.length).toBe(0);
    expect(beforeLaunch?.terminalState).toBe("ABORT_PRESERVED");
    /** The genuinely uncertain case DID enter the seam, and is reported as uncertain. */
    const uncertain = crashMatrix.cases.find((entry: { id: string }) => entry.id === "C8_HOST_TERMINATES_BETWEEN_JOURNAL_WRITES");
    expect(uncertain?.launches.length).toBe(1);
    expect(uncertain?.terminalState).toBe("UNCERTAIN_PRESERVED");
  });

  it("the healthy control still advances through legitimate Work, Result and verification", () => {
    const healthy = crashMatrix.cases.find((entry: { id: string }) => entry.id === "C10_HEALTHY_TWO_GENERATION_TRAJECTORY");
    expect(healthy).toBeDefined();
    /** §8: a POSITIVE assertion — both generations promoted and both moved the head. */
    expect(healthy?.ADVANCED_THROUGH_GOVERNED_PATH).toBe(true);
    expect(healthy?.terminalState).toBe("MATRIX_COMPLETE");
    expect(healthy?.promoted).toEqual(["PROMOTED", "PROMOTED"]);
    expect(crashMatrix.healthyControlAdvanced).toBe(true);
  });

  it("§8 case C9 refuses to resume or replace an unfinished run", () => {
    const restart = crashMatrix.cases.find((entry: { id: string }) => entry.id === "C9_RESTART_AGAINST_UNFINISHED_RUN");
    expect(restart?.NO_RESTART_RESUME).toBe(true);
    expect(restart?.inspection.mayResumeAutomatically).toBe(false);
    expect(restart?.inspection.mayReplaceAutomatically).toBe(false);
  });
});

describe("R3-L0C-F §7 — the preservation proof", () => {
  it("the preserved evidence survives a sweep and a restart refuses to resume", async () => {
    const proof = await provePreservation({ runRoot: join(BASE, "cases", "C2_FAILURE_AFTER_EXPOSURE_INTENT") });
    expect(proof.CRASH_PRESERVATION).toBe("CLOSED");
    for (const check of proof.checks) expect(check.holds, `${check.id}`).toBe(true);
    expect(proof.inspection.mayResumeAutomatically).toBe(false);
  });
});

describe("R3-L0C-F §10 — the zero-model treatment boundary", () => {
  let boundary: Awaited<ReturnType<typeof runTreatmentBoundaryWitnesses>>;

  beforeAll(async () => {
    const caseRoot = join(BASE, "boundary-cases");
    mkdirSync(caseRoot, { recursive: true });
    boundary = await runTreatmentBoundaryWitnesses({ caseRoot, prehistory: { world: prehistory.world, state: prehistory.state }, admittedRefs: refs });
  }, 600_000);

  it("H/G1 and H/G2 carry an empty boundary; C/G1 carries 2 and C/G2 carries 4", () => {
    expect(boundary.TREATMENT_BOUNDARY).toBe("PASS");
    const byKey = Object.fromEntries(boundary.controls.map((control: { arm: string; generationId: string }) => [`${control.arm}/${control.generationId}`, control])) as Record<string, any>;
    expect(byKey["H/G1"].expectedCount).toBe(0);
    expect(byKey["H/G2"].expectedCount).toBe(0);
    expect(byKey["C/G1"].expectedCount).toBe(2);
    expect(byKey["C/G2"].expectedCount).toBe(4);
    for (const control of boundary.controls) {
      expect(control.consumerVisibleHandles.length, `${control.arm}/${control.generationId}`).toBe(control.expectedCount);
      /** §10: exact identity AND kind, not cardinality. */
      expect(control.identityMatches).toBe(true);
      expect(control.kindMatches).toBe(true);
      /** §10: the frozen expectation manifest agrees with the frozen design's counts. */
      expect(control.expectedCountMatchesFrozenDesign).toBe(true);
    }
  });

  it("every C pull resolves a canonical body digest, and no hidden read channel is exposed", () => {
    for (const control of boundary.controls.filter((entry: { arm: string }) => entry.arm === "C")) {
      expect(control.pulls.length).toBe(control.expectedCount);
      expect(control.pullsResolveCanonicalBody).toBe(true);
      for (const pull of control.pulls) {
        expect(pull.resolved).toBe(true);
        expect(typeof pull.bodyDigest).toBe("string");
      }
    }
    for (const control of boundary.controls) {
      expect(control.allowedEqualsVisible).toBe(true);
      expect(control.hiddenReadChannelExposed).toBe(false);
    }
  });

  it("§10 never calls the old real-model plumbing check", () => {
    for (const control of boundary.controls) {
      expect(control.calledOldPlumbingCheck).toBe(false);
      expect(control.noLlmInvoked).toBe(true);
      expect(control.usedScriptedWorker).toBe(true);
      expect(control.usedCanonicalBuilder).toBe(true);
    }
    expect(boundary.modelCallsMade).toBe(0);
  });
});

describe("R3-L0C-F §11 — the topology-derived containment", () => {
  it("derives the unit set from the frozen schedule and passes over the ACTUAL matrix topology", async () => {
    const unitIds = await scheduleUnitIds();
    /** The frozen design has 4 blocks x 2 arms = 8 trajectories. */
    expect(unitIds.length).toBe(8);
    const gate = await runMatrixContainmentGate({ runRoot: join(BASE, "containment"), unitIds });
    expect(gate.EXPERIMENT_CONTAINMENT).toBe("PASS");
    expect(gate.unitCount).toBe(8);
    expect(gate.derivedFromSchedule).toBe(true);
    expect(gate.manuallyEnumerated).toBe(false);
    /** §11: the protected roots exist, so a canary cannot pass by absence. */
    expect(gate.protectedRootsExist).toBe(true);
    expect(gate.reachable).toEqual([]);
    /** §11: the liveness canaries succeed, so an UNREACHABLE result is a measurement. */
    expect(gate.livenessLive).toBe(true);
    expect(CONTAINMENT_REQUIREMENTS.length).toBe(7);
  }, 600_000);

  it("§11 makes no distributed-security claim and leaves the confidential profile unchanged", async () => {
    const gate = await runMatrixContainmentGate({ runRoot: join(BASE, "containment-2") });
    expect(gate.distributedSecurityClaim).toBe(false);
    expect(gate.confidentialProfileUnchanged).toBe(true);
    expect(gate.confidentialMaxActiveWorkers).toBe(1);
  }, 600_000);
});

describe("R3-L0C-F §12 — the reconstruction substitutability audit", () => {
  it("records all six determinations and adjudicates the README instruction", async () => {
    const audit = await runSubstitutabilityAudit();
    expect(audit.recordNames.length).toBe(6);
    for (const name of audit.recordNames) expect(audit.records[name]).toBeDefined();
    /** §12: the instruction is present and is NOT pretended absent. */
    expect(audit.readmeAdjudication.instructionPresentInFrozenReadme).toBe(true);
    expect(audit.readmeAdjudication.instructionPretendedAbsent).toBe(false);
    /** §12: the distinction the adjudication turns on. */
    expect(audit.records.HISTORY_READING_REQUIRED_BY_PROMPT).toBe("YES");
    expect(audit.records.EXHAUSTIVE_HISTORY_READING_REQUIRED).toBe("NO");
    expect(audit.qualificationStopRequired).toBe(false);
  });

  it("§12 keeps the three history distinctions separate and labels the byte ratio descriptive", async () => {
    const audit = await runSubstitutabilityAudit();
    expect(audit.distinctions.historyAvailable).toBe(true);
    expect(audit.distinctions.relevantHistoryRequired).toBe(true);
    expect(audit.distinctions.exhaustiveHistoryRequired).toBe(false);
    /** §12: a descriptive ratio is not measured cognitive savings. */
    expect(audit.byteComparison.descriptiveOnly).toBe(true);
    expect(audit.byteComparison.isMeasuredCognitiveSavings).toBe(false);
    expect(audit.byteComparison.caveat).not.toBeNull();
  });

  it("§12 does not edit the frozen README or the prompt", async () => {
    const audit = await runSubstitutabilityAudit();
    expect(audit.readmeAdjudication.readmeEditedInThisStage).toBe(false);
    expect(audit.readmeAdjudication.futureWordingRevisionRequires).toMatch(/prospective design version/);
    /** No generation requirement names the capital, so the prompt does not instruct its use. */
    expect(audit.requirementsMentionCapital).toBe(false);
    expect(audit.readmeIdenticalAcrossArms).toBe(true);
  });
});
