/**
 * R3-L0C-I-A-R §2-§9 — THE PRODUCTION-PATH CONTROLS.
 *
 * Every test here drives the REAL repaired entry — the pipeline, the confinement probe inside the shipped ACL
 * runner, the admission gate, the validity reducer, the attribution chain — and asserts the value that came back.
 * The mutants are §1's falsifiers, measured against `dbe6beb` in `r3l0ciar_falsifiers.test.ts`; each control names
 * its falsifier rather than re-running it.
 *
 * THE PREHISTORY IS BUILT ONCE and the containment gate is run once, because both are expensive and deterministic.
 * The matrix cases each get their own run root, because a fail-stop run claims and preserves its root.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildPrehistory } from "../scripts/r3l0c/build-prehistory.mjs";
import { admitCapital, selectionRefs } from "../scripts/r3l0c/prehistory.mjs";
import { buildExpectationManifest } from "../scripts/r3l0cr/contract.mjs";
import { GENERATION_EXPOSURES } from "../scripts/r3l0c/capital.mjs";
import { installHostBundle, dshHome } from "../scripts/gates/env.mjs";
import { computeExecutionClosure, proveClosureMutations } from "../scripts/r3l0ciar/closure.mjs";
import { measureWalkerBlindSpot, RUNTIME_MANIFEST } from "../scripts/r3l0ciar/runtime-manifest.mjs";
import { runPerTrajectoryConfinement, perTrajectoryProtectedRoots } from "../scripts/r3l0ciar/confinement.mjs";
import { frozenPrimarySchedule, PRIMARY_FAULTS, timeoutHierarchy, parseWorkerResult } from "../scripts/r3l0ciar/primary-adapter.mjs";
import { runPrimaryMatrix } from "../scripts/r3l0ciar/pipeline.mjs";
import { claimActivationRoot, verifyTrustedClaim, prepareLayoutSafely, inspectActivationRoot } from "../scripts/r3l0ciar/activation.mjs";
import { assertAuthoritativePath } from "../scripts/r3l0ciar/modes.mjs";
import { admissionFault, ADMISSION_CONTROL_OUTCOMES, ADMISSION_POSITIVE_OUTCOME } from "../scripts/r3l0ciar/admission.mjs";
import { buildProspectivePlan } from "../scripts/r3l0ciar/prospective-plan.mjs";
import { effectiveRouteConfiguration, realizationPreflight } from "../scripts/r3l0ciar/preflight.mjs";
import { digestRoot, controlPreTrialReducer, controlRouteIdentity, controlAdmission, controlUptakeProvenance, controlCostAttribution, controlPostMatrixGate, controlTimeoutAndAuthorization } from "../scripts/r3l0ciar/acceptance.mjs";
import { digestRunRootState } from "../scripts/r3l0ciar/falsifiers.mjs";
import { CORRECTION_DEFECTS, POST_MATRIX_CONDITIONS, PRE_TRIAL_REQUIREMENTS, UPTAKE_PROVENANCE } from "../scripts/r3l0ciar/contract.mjs";

const BASE = join(tmpdir(), `palimpsest-r3l0ciar-gates-${String(process.pid)}`);
let prehistory: { world: string; state: string };
let refs: readonly unknown[];
let closure: { executionClosureDigest: string; CLOSURE_COMPLETE: boolean };
let containment: Awaited<ReturnType<typeof runPerTrajectoryConfinement>>;
let schedule: Awaited<ReturnType<typeof frozenPrimarySchedule>>;
let expectationC2: unknown;
let plan: Record<string, unknown>;
let healthyPreTrial: Record<string, unknown>;

beforeAll(async () => {
  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  mkdirSync(BASE, { recursive: true });
  const built = await buildPrehistory(join(BASE, "prehistory"));
  const admitted = await admitCapital(join(BASE, "prehistory"), built.paths, "cutover-entitlements", built.world);
  prehistory = { world: built.world, state: built.paths.state };
  refs = selectionRefs(admitted);
  expectationC2 = buildExpectationManifest({ generationId: "G2", arm: "C", admittedRefs: refs, generationExposures: GENERATION_EXPOSURES });
  schedule = await frozenPrimarySchedule();
  closure = await computeExecutionClosure({ verifyCompiled: false }) as typeof closure;
  const trajectoryIds = [...new Set(schedule.map((session: { trajectoryId: string }) => session.trajectoryId))].sort();
  containment = await runPerTrajectoryConfinement({ runRoot: join(BASE, "containment"), trajectoryIds });
  plan = (await buildProspectivePlan({ closure, verifyCompiled: false })) as unknown as Record<string, unknown>;
  healthyPreTrial = {
    plan: { ...plan, schedule },
    closure,
    containment,
    schedule,
    mode: { resolved: true, mode: "DETERMINISTIC", workerExecutable: "x" },
    realizationPreflight: await realizationPreflight({ admittedRefs: refs, generationExposures: GENERATION_EXPOSURES }),
    routeConfiguration: await effectiveRouteConfiguration(),
    systemValid: true,
  };
}, 1_800_000);

afterAll(() => {
  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds SQLite handles briefly */ }
});

let caseCounter = 0;
let healthyRun: Awaited<ReturnType<typeof runPrimaryMatrix>> | null = null;
async function runCase(name: string, options: { faultAt?: string; faultKind?: string | undefined; timeoutMs?: number } = {}) {
  const isHealthyBaseline = name === "healthy" && options.faultAt === undefined && options.faultKind === undefined;
  if (isHealthyBaseline && healthyRun !== null) return healthyRun;
  const unique = isHealthyBaseline ? name : `${name}-${String((caseCounter += 1))}`;
  const result = await runPrimaryMatrix({
    runId: `r3l0ciar-${unique}`,
    runRoot: join(BASE, unique),
    prehistory: { world: prehistory.world, state: prehistory.state },
    admittedRefs: refs,
    installHostBundle,
    dshHome,
    authorizedBy: "r3-l0c-iar-primary-plan",
    caller: "r3-l0c-iar-primary-plan",
    plan,
    closure,
    containment,
    mode: "DETERMINISTIC",
    systemValid: true,
    ...options,
  });
  if (isHealthyBaseline) healthyRun = result;
  return result;
}

describe("R3-L0C-I-A-R §1 — the contract declares the correction set", () => {
  it("declares the eight defects, eight pre-trial and nine post-matrix conditions", () => {
    expect(CORRECTION_DEFECTS.length).toBe(8);
    expect(PRE_TRIAL_REQUIREMENTS.length).toBe(8);
    expect(POST_MATRIX_CONDITIONS.length).toBe(9);
  });
});

describe("R3-L0C-I-A-R §2 — one authoritative pipeline", () => {
  it("runs the pipeline in order and claims the run root before preparing anything", async () => {
    const result = await runCase("healthy");
    expect(result.PIPELINE).toBe("COMPLETED");
    const ids = result.steps!.map((step: { id: string }) => step.id);
    /** §2: the order, asserted positionally. */
    expect(ids.indexOf("ACQUIRE_EXCLUSIVE_RUN_ROOT")).toBeLessThan(ids.indexOf("PREPARE_WORLDS_STORES_PROFILES"));
    expect(ids.indexOf("VERIFY_COMMITTED_PLAN")).toBeLessThan(ids.indexOf("ACQUIRE_EXCLUSIVE_RUN_ROOT"));
    expect(ids.indexOf("PRE_EXPOSURE_CHECKS")).toBeLessThan(ids.indexOf("PERSIST_SESSION_EXPOSURE_INTENT") === -1 ? ids.length : ids.indexOf("PERSIST_SESSION_EXPOSURE_INTENT"));
    /** §2: steps 1-3 are read-only, step 4 is the first mutation. */
    const mutating = result.steps!.filter((step: { mutated: boolean }) => step.mutated).map((step: { id: string }) => step.id);
    expect(mutating[0]).toBe("ACQUIRE_EXCLUSIVE_RUN_ROOT");
    expect(result.terminalState).toBe("MATRIX_COMPLETE");
    expect(result.completedSessions!.length).toBe(16);
    expect(result.maxLaunchesPerSession).toBe(1);
    expect(result.trajectoryCount).toBe(8);
  }, 1_800_000);

  it("A-replay: a replayed run is refused at the claim with zero bytes changed", async () => {
    const runRoot = join(BASE, "replay");
    const first = await runPrimaryMatrix({
      runId: "r3l0ciar-replay", runRoot,
      prehistory: { world: prehistory.world, state: prehistory.state }, admittedRefs: refs,
      installHostBundle, dshHome, authorizedBy: "r3-l0c-iar-primary-plan", caller: "r3-l0c-iar-primary-plan",
      plan, closure, containment, mode: "DETERMINISTIC", systemValid: true,
    });
    expect(first.PIPELINE).toBe("COMPLETED");
    const trajectoryIds = [...new Set(schedule.map((session: { trajectoryId: string }) => session.trajectoryId))].sort();
    const before = digestRunRootState(runRoot, trajectoryIds);
    const second = await runPrimaryMatrix({
      runId: "r3l0ciar-replay", runRoot,
      prehistory: { world: prehistory.world, state: prehistory.state }, admittedRefs: refs,
      installHostBundle, dshHome, authorizedBy: "r3-l0c-iar-primary-plan", caller: "r3-l0c-iar-primary-plan",
      plan, closure, containment, mode: "DETERMINISTIC", systemValid: true,
    });
    const after = digestRunRootState(runRoot, trajectoryIds);
    expect(second.PIPELINE).toBe("REFUSED");
    expect(second.refusedAt).toBe("ACQUIRE_EXCLUSIVE_RUN_ROOT");
    expect(second.reason).toBe("REFUSED_REPLAY");
    expect(second.run).toBeNull();
    /** §2: the property. The refusal must not have changed a byte. */
    expect(after.digest).toBe(before.digest);
    expect(digestRoot(runRoot)).toBe(digestRoot(runRoot));
  }, 1_800_000);

  it("§2: the claim is verified against disk and a caller flag cannot bypass it", async () => {
    const root = mkdtempSync(join(tmpdir(), "r3l0ciar-claim-"));
    try {
      const claim = claimActivationRoot({ runRoot: root, runId: "trusted" });
      const nonce = claim.claimNonce ?? "";
      expect(claim.claimed).toBe(true);
      expect(verifyTrustedClaim({ runRoot: root, runId: "trusted", claimNonce: nonce }).trusted).toBe(true);
      expect(verifyTrustedClaim({ runRoot: root, runId: "trusted", claimNonce: "forged" }).verdict).toBe("REFUSED_UNTRUSTED_CLAIM");
      expect(verifyTrustedClaim({ runRoot: root, runId: "trusted", claimNonce: null }).verdict).toBe("REFUSED_UNTRUSTED_CLAIM");
      expect(verifyTrustedClaim({ runRoot: root, runId: "other", claimNonce: nonce }).verdict).toBe("REFUSED_ALREADY_CLAIMED");
      const { readFileSync } = await import("node:fs");
      const onDisk = JSON.parse(readFileSync(join(root, "run-claim.json"), "utf8"));
      expect(onDisk.claimNonce).toBe(nonce);
    } finally {
      try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  });

  it("§2: the safe preparation creates and removes nothing", async () => {
    const root = mkdtempSync(join(tmpdir(), "r3l0ciar-layout-"));
    try {
      mkdirSync(join(root, "keep-me"), { recursive: true });
      writeFileSync(join(root, "keep-me", "evidence.txt"), "preserved", "utf8");
      const layout = prepareLayoutSafely(root, ["t0", "t1"]);
      expect(layout.removedAnything).toBe(false);
      const { existsSync, readFileSync } = await import("node:fs");
      expect(existsSync(join(root, "keep-me", "evidence.txt"))).toBe(true);
      expect(readFileSync(join(root, "keep-me", "evidence.txt"), "utf8")).toBe("preserved");
    } finally {
      try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  });

  it("§2: the authoritative-path guard refuses the prior matrices and states they remain executable", () => {
    expect(() => assertAuthoritativePath({ caller: "scripts/r3l0cia/primary-driver.mjs" })).toThrow(/not the authoritative execution path/u);
    const authorized = assertAuthoritativePath({ caller: "r3-l0c-iar-primary-plan", authorizedBy: "r3-l0c-iar-primary-plan" });
    expect(authorized.priorMatricesQuarantined).toBe(true);
    expect(authorized.priorMatricesStillExecutable).toBe(true);
  });
});

describe("R3-L0C-I-A-R §3 — the pre-trial reducer and route identity", () => {
  it("all eight healthy conditions are satisfied and ALL_SATISFIED is true", async () => {
    const control = await controlPreTrialReducer({ healthy: healthyPreTrial });
    expect(control.PASS).toBe(true);
    expect(control.positiveControl.ALL_SATISFIED).toBe(true);
    expect(control.positiveControl.satisfiedCount).toBe(8);
    expect(control.positiveControl.unsatisfied).toEqual([]);
    /** §3: the three conditions the baseline could never satisfy now report their own verdicts. */
    expect(control.positiveControl.containmentPass).toBe("PASS");
    expect(control.positiveControl.closureMatch).toBe("PASS");
    expect(control.positiveControl.preflightPass).toBe("PASS");
    expect(control.allNegativesRefused).toBe(true);
    for (const negative of control.negatives as readonly { id: string; refused: boolean }[]) expect(negative.refused, negative.id).toBe(true);
  }, 900_000);

  it("§3: a drifted effective route is DRIFTED and a missing one is UNKNOWN", async () => {
    const control = await controlRouteIdentity({ healthy: healthyPreTrial });
    expect(control.PASS).toBe(true);
    expect(control.positiveControl.healthyIdentity).toBe("MATCH");
    expect(control.positiveControl.driftedIdentity).toBe("DRIFTED");
    expect(control.positiveControl.unknownIdentity).toBe("UNKNOWN");
    const comparison = control.positiveControl.driftedComparison as readonly { field: string; matches: boolean }[];
    expect(comparison.some((entry) => entry.field === "providerId" && entry.matches === false)).toBe(true);
  }, 300_000);

  it("§3: the pipeline refuses before exposure when the pre-trial conditions are not satisfied", async () => {
    const result = await runPrimaryMatrix({
      runId: "r3l0ciar-unsatisfied", runRoot: join(BASE, "unsatisfied"),
      prehistory: { world: prehistory.world, state: prehistory.state }, admittedRefs: refs,
      installHostBundle, dshHome, authorizedBy: "r3-l0c-iar-primary-plan", caller: "r3-l0c-iar-primary-plan",
      plan, closure, containment, mode: "DETERMINISTIC", systemValid: false,
    });
    expect(result.PIPELINE).toBe("REFUSED");
    expect(result.refusedAt).toBe("PRE_EXPOSURE_CHECKS");
    expect(result.reason).toBe("PRE_EXPOSURE_CHECKS_NOT_SATISFIED");
    expect(result.run).toBeNull();
  }, 900_000);
});

describe("R3-L0C-I-A-R §4 — admission", () => {
  it("all six negative controls refuse and a valid result is admitted", async () => {
    const control = await controlAdmission();
    expect(control.PASS).toBe(true);
    expect(control.allSixRefused).toBe(true);
    expect(control.allSixStopTheMatrix).toBe(true);
    /** §4: five are refused by the gate this stage adds; the sixth by the frozen schema's evidence guard. */
    expect(control.fiveRefusedByTheGate).toBe(true);
    expect(control.positiveControl.validDisposition).toBe("ADMITTED");
    /** §4: behavioural incorrectness remains admissible. */
    expect(control.behaviouralStillAdmitted).toBe(true);
  }, 300_000);

  it("§4: a malformed result line and an invalid vocabulary are refused with their own causes", () => {
    const malformed = admissionFault({ ...ADMISSION_CONTROL_OUTCOMES.WORKER_RESULT_LINE_MALFORMED });
    const invalidVocab = admissionFault({ ...ADMISSION_CONTROL_OUTCOMES.WORKER_RESULT_VOCABULARY_INVALID });
    expect(malformed?.cause).toBe("MALFORMED_WORKER_RESULT");
    expect(invalidVocab?.cause).toBe("INVALID_WORKER_RESULT_VOCABULARY");
    expect(admissionFault({ ...ADMISSION_POSITIVE_OUTCOME })).toBeNull();
    /** A non-terminal attempt state is NOT a machinery fault: it is the Work-blockage case the schema censors. */
    expect(admissionFault({ ...ADMISSION_POSITIVE_OUTCOME, attemptState: "RUNNING" })).toBeNull();
    /** The shipped parser's own vocabulary, unchanged. */
    expect(parseWorkerResult(`PALIMPSEST_WORK_RESULT ${JSON.stringify({ kind: "READY_FOR_SETTLEMENT", summary: "x" })}`).admissible).toBe(true);
    expect(parseWorkerResult(`PALIMPSEST_WORK_RESULT {not json`).admissible).toBe(false);
  });
});

describe("R3-L0C-I-A-R §5 — uptake provenance", () => {
  it("a missing line is not a zero, a malformed line is not a zero, and a declined pull is kept", async () => {
    const control = await controlUptakeProvenance({ expectation: expectationC2 });
    expect(control.PASS).toBe(true);
    const measured = control.positiveControl.measured as Readonly<Record<string, { provenance: string; count: number | null }>>;
    expect(measured.NO_LINE!.provenance).toBe(UPTAKE_PROVENANCE.TELEMETRY_MISSING);
    expect(measured.NO_LINE!.count).toBeNull();
    expect(measured.MALFORMED!.provenance).toBe(UPTAKE_PROVENANCE.TELEMETRY_MALFORMED);
    expect(measured.MALFORMED!.count).toBeNull();
    expect(measured.EXPLICIT_ZERO!.provenance).toBe(UPTAKE_PROVENANCE.OBSERVED_ZERO);
    expect(measured.EXPLICIT_ZERO!.count).toBe(0);
    /** §5: the C/G2 control: visible four, pulled zero, host resolved four, applied, uptake zero. */
    expect(control.positiveControl.visibleFour).toBe(4);
    expect(control.positiveControl.treatmentRealization).toBe("APPLIED");
    expect(control.positiveControl.workerUptake).toBe("ZERO");
    expect(control.positiveControl.hostResolveCount).toBe(4);
    expect(control.positiveControl.declinedPullStopsTheMatrix).toBe(false);
  }, 300_000);

  it("§5: a real declined-pull session completes the matrix with the observation recorded", async () => {
    const result = await runCase("fault-decline", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.DECLINE_PULL });
    expect(result.terminalState).toBe("MATRIX_COMPLETE");
    expect(result.completedSessions!.length).toBe(16);
    const declined = (result.run!.records as readonly { workerUptakeCount: number | null; hostResolveAuditCount: number; observations: readonly { id: string }[] }[]).filter((record) => record.workerUptakeCount === 0 && record.hostResolveAuditCount > 0);
    expect(declined.length).toBeGreaterThan(0);
    expect(declined[0]!.observations.map((entry) => entry.id)).toContain("MODEL_DECLINED_VISIBLE_CAPITAL");
  }, 1_800_000);
});

describe("R3-L0C-I-A-R §6 — cost attribution", () => {
  it("a full identity is measured; a filename-only, conflicting or absent artifact is refused", async () => {
    const control = await controlCostAttribution({});
    expect(control.PASS).toBe(true);
    expect(control.positiveControl.measured).toBe(true);
    expect(control.positiveControl.provenance).toBe("FIXTURE");
    expect(control.positiveControl.fieldsPresent).toEqual([]);
    expect(control.positiveControl.attemptIdentityMatches).toBe(true);
    expect(control.positiveControl.conflictingAttemptRefused).toBe(true);
    expect(control.positiveControl.absentArtifactRefused).toBe(true);
    expect(control.positiveControl.filenameOnlyRefused).toBe(true);
    expect(control.positiveControl.capitalBodyNotCountedAsHistory).toBe(true);
    expect(control.positiveControl.resolvedByRecency).toBe(false);
  }, 300_000);
});

describe("R3-L0C-I-A-R §7 — the post-matrix causal gate", () => {
  it("nine conditions are required, every failing input is NOT_EVALUABLE, and a fixture gate is not causal", async () => {
    const healthy = await runCase("healthy");
    const control = await controlPostMatrixGate({
      schedule, plan: { ...plan, schedule }, closure, containment,
      goodRecords: healthy.run!.records,
      costAttribution: { interpretable: true, measuredCount: 16, rejectedCount: 0, livePrimaryCount: 0, fixtureCount: 16, allSixteenLivePrimary: false },
    });
    expect(control.PASS).toBe(true);
    expect(control.positiveControl.checkedOnlyTheSessionCount).toBe(false);
    expect((control.positiveControl.requiredConditions as readonly string[]).length).toBe(9);
    expect(control.allNegativesFailClosed).toBe(true);
    const negatives = control.negatives as readonly { id: string; green: boolean; causalExperimentValid: string }[];
    expect(negatives.length).toBe(9);
    for (const negative of negatives) {
      expect(negative.green, negative.id).toBe(false);
      expect(negative.causalExperimentValid, negative.id).toBe("NO");
    }
    /** §6/§7: a mechanically green gate over fixture cost data is still not a causal admission. */
    const fixture = control.positiveControl.fixtureGreenButNotCausal as { gateGreen: boolean; causal: { CAUSAL_EXPERIMENT_VALID: string } };
    expect(fixture.gateGreen).toBe(true);
    expect(fixture.causal.CAUSAL_EXPERIMENT_VALID).toBe("NO");
  }, 1_800_000);

  it("§7: the healthy deterministic matrix completes with a green gate and a NOT_EVALUABLE causal verdict", async () => {
    const healthy = await runCase("healthy");
    expect(healthy.terminalState).toBe("MATRIX_COMPLETE");
    expect(healthy.run!.causalVerdictIssued).toBe(false);
    const gate = healthy.run!.validityGate as { green: boolean; costProvenance: string; causalAdmission: { CAUSAL_EXPERIMENT_VALID: string } };
    expect(gate.green).toBe(true);
    expect(gate.costProvenance).toBe("ABSENT");
    expect(gate.causalAdmission.CAUSAL_EXPERIMENT_VALID).toBe("NO");
  }, 1_800_000);
});

describe("R3-L0C-I-A-R §8 — timeout and authorization", () => {
  it("§8: a worker that reports then hangs is UNCERTAIN, not an established exit", async () => {
    process.env.R3L0CIA_HANG_MS = "20000";
    const result = await runCase("fault-hang", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.REPORT_THEN_HANG, timeoutMs: 4_000 });
    expect(result.terminalState).toBe("UNCERTAIN_PRESERVED");
    expect((result.run!.uncertainSessions as readonly string[]).length).toBeGreaterThan(0);
    const { inspectPreservedRun } = await import("../scripts/r3l0cf/fail-stop.mjs");
    const inspection = inspectPreservedRun(result.runRoot!);
    expect(inspection.mayResumeAutomatically).toBe(false);
    expect(inspection.mayReplaceAutomatically).toBe(false);
    expect(inspection.verdict).toBe("UNCERTAIN");
  }, 1_800_000);

  it("§8: a boolean is a signal, not an authorization decision", async () => {
    const control = await controlTimeoutAndAuthorization({ slowWorkerObservation: null });
    expect(control.PASS).toBe(true);
    expect(control.positiveControl.killIsNotProofOfExit).toBe(true);
    expect(control.positiveControl.workerResultLineIsNotProofOfExit).toBe(true);
    expect(control.positiveControl.timedOutIsAlwaysUncertain).toBe(true);
    expect(control.positiveControl.booleanSignalPresent).toBe(true);
    expect(control.positiveControl.booleanDecisionPresent).toBe(false);
    expect(control.positiveControl.fullDecisionPresent).toBe(true);
    expect(control.positiveControl.partialDecisionPresent).toBe(false);
    expect(control.positiveControl.thisStageEntersPrimary).toBe(false);
  }, 300_000);

  it("§8: the budgets nest and the outer exceeds the inner plus settlement", () => {
    const budgets = timeoutHierarchy();
    expect(budgets.outerExceedsInnerPlusSettlement).toBe(true);
    expect(budgets.marginMs).toBeGreaterThan(0);
    expect(budgets.innerWorkerMs).toBe(1_800_000);
  });
});

describe("R3-L0C-I-A-R §3/§8 — the matrix fault positions", () => {
  it("a fault at FIRST, MIDDLE and LAST stops with no later launch", async () => {
    const first = await runCase("fault-first", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    const middle = await runCase("fault-middle", { faultAt: "MIDDLE", faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    const last = await runCase("fault-last", { faultAt: "LAST", faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    for (const result of [first, middle, last]) {
      expect(result.terminalState).toBe("ABORT_PRESERVED");
      expect(result.sessionsAfterFault).toEqual([]);
      expect(result.maxLaunchesPerSession).toBe(1);
    }
    expect(first.completedSessions!.length).toBe(0);
    expect(middle.completedSessions!.length).toBe(7);
    expect(last.completedSessions!.length).toBe(15);
  }, 1_800_000);

  it("§5: a Work blockage is CENSORED and preserves the trajectory", async () => {
    const result = await runCase("fault-nocommit", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.NO_COMMIT });
    expect(result.terminalState).toBe("ABORT_PRESERVED");
    expect((result.run!.failure as { failureClass: string }).failureClass).toBe("CANONICAL_WORK_BLOCKAGE");
    expect((result.run!.failure as { cause: string }).cause).toBe("CANONICAL_WORK_CANNOT_ADVANCE");
  }, 1_800_000);
});

describe("R3-L0C-I-A-R §2/§3 — confinement and the closure", () => {
  it("all eight units pass with own-world liveness and sibling isolation simultaneously", () => {
    expect(containment.ACTUAL_CONTAINMENT).toBe("PASS");
    expect(containment.EXPERIMENT_ENVIRONMENT_VALID).toBe("PASS");
    expect(containment.cases.length).toBe(8);
    expect(containment.everyOwnWorldExcluded).toBe(true);
    expect(containment.everyOwnWorldWritable).toBe(true);
    expect(containment.noProtectedTargetReachable).toBe(true);
    expect(containment.noEscapeSucceeded).toBe(true);
    expect(containment.probeDiscriminates).toBe(true);
    expect(containment.aclWeakened).toBe(false);
  }, 1_800_000);

  it("§7: the manifest covers modules the static walker cannot see, and the mutations move the digest", async () => {
    const blind = await measureWalkerBlindSpot();
    expect(blind.manifestCoversModulesTheWalkerMisses).toBe(true);
    expect(blind.blindSpotCount).toBeGreaterThanOrEqual(7);
    expect(RUNTIME_MANIFEST.length).toBe(blind.manifestModuleCount);
    const mutations = await proveClosureMutations();
    expect(mutations.ALL_MUTATIONS_PROVEN).toBe(true);
    expect(mutations.failing).toEqual([]);
  }, 900_000);

  it("§7: the closure is complete over the stage harness and the runtime manifest", async () => {
    const computed = await computeExecutionClosure({ verifyCompiled: false });
    expect(computed.CLOSURE_COMPLETE).toBe(true);
    expect(computed.runtimeManifest.missing).toEqual([]);
    expect(computed.stageHarness.missing).toEqual([]);
    expect(computed.partIds).toContain("RUNTIME_MANIFEST_CLOSURE");
    expect(computed.partIds).toContain("STAGE_HARNESS_CLOSURE");
  }, 300_000);
});

describe("R3-L0C-I-A-R §2 — the activation inspection refuses unspendable roots", () => {
  it("a malformed, foreign, preserved or partial root is refused with its own verdict", () => {
    const roots: string[] = [];
    const make = (name: string, write: (root: string) => void) => {
      const root = mkdtempSync(join(tmpdir(), `r3l0ciar-${name}-`));
      roots.push(root);
      write(root);
      return root;
    };
    try {
      const corrupt = make("corrupt", (root) => writeFileSync(join(root, "run-claim.json"), "{ not json", "utf8"));
      const foreign = make("foreign", (root) => writeFileSync(join(root, "run-claim.json"), JSON.stringify({ runId: "someone-else", claimNonce: "x" }), "utf8"));
      const preserve = make("preserve", (root) => writeFileSync(join(root, "PRESERVE"), "{}", "utf8"));
      const partial = make("partial", (root) => writeFileSync(join(root, "preparation.json"), JSON.stringify({ state: "PREPARING" }), "utf8"));
      expect(inspectActivationRoot({ runRoot: corrupt, runId: "x" }).verdict).toBe("REFUSED_MALFORMED_CLAIM");
      expect(inspectActivationRoot({ runRoot: foreign, runId: "x" }).verdict).toBe("REFUSED_ALREADY_CLAIMED");
      expect(inspectActivationRoot({ runRoot: preserve, runId: "x" }).verdict).toBe("REFUSED_REPLAY");
      expect(inspectActivationRoot({ runRoot: partial, runId: "x" }).verdict).toBe("REFUSED_PARTIAL_PREPARATION");
    } finally {
      for (const root of roots) { try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ } }
    }
  });
});
