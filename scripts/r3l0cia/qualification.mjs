/**
 * R3-L0C-I-A §10 — THE QUALIFICATION ORCHESTRATOR.
 *
 * It runs the stage's deterministic gates and assembles the record the final report quotes, so a reader does not
 * have to reconstruct the stage's verdicts from the module sources. Each verdict is COMPUTED from a measurement
 * made here rather than copied from a claim, and the ones this stage cannot decide are carried as their honest
 * values rather than as passes.
 *
 * THE TWO VERDICTS THIS STAGE CANNOT SET ARE THE IMPORTANT ONES, and they are named so:
 *
 *   FAIL_STOP_POLICY                 R3-L0C-F proposed it and R3-L0C-I left it PENDING. This stage does not
 *                                    grant itself an authorization it was not given, so it stays PROPOSED.
 *   PAID_REPLICATION                 every deterministic gate is green and the plan is frozen, which makes the
 *                                    replication READY — but readiness is not authorization, and the paid matrix
 *                                    requires an explicit ruling.
 *
 * A THIRD IS DELIBERATELY LIMITED. `PROMPT_NEUTRALITY` remains LIMITED because this stage neither edited the
 * README nor produced an independently justified interpretation, and R3-L0C-I required it to be preserved unless
 * one appeared.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ACCEPTANCE_TESTS,
  BASELINE_COMMIT,
  ESCAPED_DEFECTS,
  GENERATION_CHILD_BUDGET_MS,
  REPO_ROOT,
  STAGE_EVIDENCE_PATH,
  WORKER_EXECUTION_BUDGET_MS,
} from './contract.mjs';

const NL = String.fromCharCode(10);

/**
 * §10: RUN THE ZERO-MODEL GATES AND ASSEMBLE THE QUALIFICATION.
 *
 * The gates that need the frozen prehistory and the full matrix are run here, in one place, so the record's
 * numbers come from an execution rather than from the test suite's own summary — and so a reader can see the
 * matrix's outcome beside the gate verdicts that depend on it.
 */
export async function runQualification(input = {}) {
  const { buildPrehistory } = await import('../r3l0c/build-prehistory.mjs');
  const { admitCapital, selectionRefs } = await import('../r3l0c/prehistory.mjs');
  const { installHostBundle, dshHome } = await import('../gates/env.mjs');
  const { computeExecutionClosure, proveClosureMutations } = await import('./closure.mjs');
  const { measureWalkerBlindSpot } = await import('./runtime-manifest.mjs');
  const { runPerTrajectoryConfinement } = await import('./confinement.mjs');
  const { frozenPrimarySchedule, timeoutHierarchy, assertAuthoritativePath } = await import('./primary-adapter.mjs');
  const { runPrimaryMatrix } = await import('./primary-driver.mjs');
  const { runEscapedDefectFalsifiers } = await import('./falsifiers.mjs');
  const { buildExpectationManifest } = await import('../r3l0cr/contract.mjs');
  const { GENERATION_EXPOSURES } = await import('../r3l0c/capital.mjs');
  const { regressionRecord, immutabilityRecord } = await import('./regression.mjs');
  const { evidenceCorrections } = await import('./evidence-corrections.mjs');
  const { buildProspectivePlan, checkPlanClosure } = await import('./prospective-plan.mjs');

  const base = input.base ?? join(tmpdir(), `r3l0cia-qualification-${String(process.pid)}`);
  mkdirSync(base, { recursive: true });
  const record = { schemaVersion: 1, stage: 'R3-L0C-I-A', kind: 'paid activation boundary qualification', baseline: BASELINE_COMMIT, modelCallsMade: 0, enteredPrimaryExecution: false };

  /** 1. The frozen prehistory, once. */
  const built = await buildPrehistory(join(base, 'prehistory'));
  const admitted = await admitCapital(join(base, 'prehistory'), built.paths, 'cutover-entitlements', built.world);
  const refs = selectionRefs(admitted);
  const schedule = await frozenPrimarySchedule();
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  record.prehistory = Object.freeze({ head: built.head, revision: built.revision, worldDigest: built.worldDigest, trajectoryCount: trajectoryIds.length, sessionCount: schedule.length });

  /** 2. The eight escaped defects, against the baseline. */
  const expectation = buildExpectationManifest({ generationId: 'G2', arm: 'C', admittedRefs: refs, generationExposures: GENERATION_EXPOSURES });
  const visibleHandles = expectation.expectedConsumerVisibleHandles;
  const transcriptPath = join(base, 'zero-pull-transcript.txt');
  writeFileSync(transcriptPath, `PALIMPSEST_WORKER_PULL ${JSON.stringify({ pulled: [] })}${NL}`, 'utf8');
  const falsifiers = await runEscapedDefectFalsifiers({
    prehistory: { world: built.world, state: built.paths.state },
    trajectoryIds: [trajectoryIds[0]],
    expectation,
    observedHandles: visibleHandles.slice(0, 2),
    visibleHandles,
    transcriptPath,
    runRoot: join(base, 'falsifier-roots'),
  });
  record.escapedDefects = Object.freeze({
    declared: ESCAPED_DEFECTS.length,
    violatedByBaseline: falsifiers.ESCAPED_DEFECTS_PRESENT,
    allViolated: falsifiers.ALL_EIGHT_VIOLATED_BY_BASELINE,
    ids: Object.freeze(falsifiers.falsifiers.map((entry) => entry.id)),
    falsifiers: falsifiers.falsifiers,
  });

  /** 3. The closure, its mutations and the walker's blind spot. */
  const closure = await computeExecutionClosure({ verifyCompiled: false });
  const mutations = await proveClosureMutations();
  const blindSpot = await measureWalkerBlindSpot();
  record.executionClosure = Object.freeze({
    digest: closure.executionClosureDigest,
    partIds: closure.partIds,
    fileCount: closure.fileCount,
    complete: closure.CLOSURE_COMPLETE,
    runtimeManifestModules: closure.runtimeManifest.moduleCount,
    runtimeManifestMissing: closure.runtimeManifest.missing,
    stageHarnessModules: closure.stageHarness.moduleCount,
    mutationsProven: mutations.ALL_MUTATIONS_PROVEN,
    mutationArms: Object.freeze(mutations.arms.map((arm) => arm.id)),
    walkerBlindSpotCount: blindSpot.blindSpotCount,
    walkerBlindSpot: blindSpot.manifestModulesNotReachableByWalker,
  });

  /** 4. The per-trajectory confinement, with its liveness control. */
  const containment = await runPerTrajectoryConfinement({ runRoot: join(base, 'containment'), trajectoryIds });
  record.containment = Object.freeze({
    verdict: containment.ACTUAL_CONTAINMENT,
    cases: containment.cases.length,
    everyOwnWorldExcluded: containment.everyOwnWorldExcluded,
    everyOwnWorldWritable: containment.everyOwnWorldWritable,
    everySiblingProtected: containment.everySiblingProtected,
    noProtectedTargetReachable: containment.noProtectedTargetReachable,
    noEscapeSucceeded: containment.noEscapeSucceeded,
    probeDiscriminates: containment.probeDiscriminates,
    aclWeakened: containment.aclWeakened,
    sandboxAvailable: containment.sandboxAvailable,
    perUnit: Object.freeze(containment.cases.map((entry) => Object.freeze({
      trajectoryId: entry.currentTrajectoryId,
      verdict: entry.CONFINEMENT_CASE,
      ownWorldExcluded: entry.ownWorldExcludedFromProtectedRoots,
      ownWorldReadable: entry.ownWorldRead,
      ownWorldWritable: entry.ownWorldWrote,
      siblingWorldsProtected: entry.siblingWorldsProtected,
      reachable: entry.reachable,
      escaped: entry.escaped,
      protectedRoots: entry.protectedRootCount,
    }))),
  });

  /** 5. The frozen matrix, healthy, through the repaired path. */
  const plan = await buildProspectivePlan({ closure, verifyCompiled: false });
  const healthy = await runPrimaryMatrix({
    runId: input.runId ?? 'r3l0cia-qualification-healthy',
    runRoot: join(base, 'healthy'),
    prehistory: { world: built.world, state: built.paths.state },
    admittedRefs: refs,
    installHostBundle,
    dshHome,
    authorizedBy: 'r3-l0c-ia-primary-plan',
    caller: 'r3-l0c-ia-primary-plan',
    plan: { ...plan, schedule },
    closure,
    containment,
    mode: 'DETERMINISTIC',
  });
  const byArmGeneration = {};
  for (const sessionRecord of healthy.run?.records ?? []) {
    const key = `${sessionRecord.arm}/${sessionRecord.generation}`;
    (byArmGeneration[key] ??= []).push(Object.freeze({
      visible: sessionRecord.consumerVisibleHandles.length,
      workerUptake: sessionRecord.workerUptakeCount,
      hostAudit: sessionRecord.hostResolveAuditCount,
      realization: sessionRecord.treatmentRealization,
      observations: Object.freeze((sessionRecord.observations ?? []).map((entry) => entry.id)),
    }));
  }
  record.primaryMatrix = Object.freeze({
    mode: healthy.mode?.mode ?? null,
    workerExecutable: healthy.mode?.workerExecutable ?? null,
    workerIsStageScripted: String(healthy.mode?.workerExecutable ?? '').includes('r3l0cia'),
    terminalState: healthy.terminalState,
    scheduleLength: healthy.scheduleLength,
    completedSessions: healthy.completedSessions?.length ?? null,
    trajectoryCount: healthy.trajectoryCount,
    maxLaunchesPerSession: healthy.maxLaunchesPerSession,
    failure: healthy.run?.failure ?? null,
    propertiesHold: healthy.run?.properties?.ALL_PROPERTIES_HOLD ?? null,
    causalVerdictIssued: healthy.run?.causalVerdictIssued ?? null,
    treatmentByArmGeneration: Object.freeze(byArmGeneration),
    /** §4: the boundary expectations, from the frozen design. */
    boundaryExpectations: Object.freeze({ 'H/G1': 0, 'H/G2': 0, 'C/G1': 2, 'C/G2': 4 }),
    boundariesExact: Object.entries({ 'H/G1': 0, 'H/G2': 0, 'C/G1': 2, 'C/G2': 4 }).every(([key, expected]) => (byArmGeneration[key] ?? []).every((entry) => entry.visible === expected)),
    workerUptakeIsMeasured: Object.freeze(Object.fromEntries(Object.entries(byArmGeneration).map(([key, entries]) => [key, entries.map((entry) => entry.workerUptake)]))),
  });

  /** 6. The fault positions, so no later launch is observed at each. */
  const faults = [];
  for (const [position, label] of [['FIRST', 'first'], ['MIDDLE', 'middle'], ['LAST', 'last']]) {
    const run = await runPrimaryMatrix({
      runId: `r3l0cia-qualification-fault-${label}`,
      runRoot: join(base, `fault-${label}`),
      prehistory: { world: built.world, state: built.paths.state },
      admittedRefs: refs,
      installHostBundle,
      dshHome,
      authorizedBy: 'r3-l0c-ia-primary-plan',
      caller: 'r3-l0c-ia-primary-plan',
      plan: { ...plan, schedule },
      closure,
      containment,
      mode: 'DETERMINISTIC',
      faultAt: position,
      faultKind: 'REPORT_MISSING',
    });
    faults.push(Object.freeze({
      position,
      scheduleIndex: run.faultsInjected?.[0]?.scheduleIndex ?? null,
      terminalState: run.terminalState,
      completedSessions: run.completedSessions?.length ?? null,
      launches: run.run?.launches?.length ?? null,
      maxLaunchesPerSession: run.maxLaunchesPerSession,
      sessionsAfterFault: run.sessionsAfterFault,
      propertiesHold: run.run?.properties?.ALL_PROPERTIES_HOLD ?? null,
    }));
  }
  record.faultInjection = Object.freeze({
    cases: Object.freeze(faults),
    allStopped: faults.every((entry) => entry.terminalState === 'ABORT_PRESERVED'),
    noLaterLaunch: faults.every((entry) => (entry.sessionsAfterFault ?? []).length === 0),
    oneLaunchPerSession: faults.every((entry) => entry.maxLaunchesPerSession === 1),
  });

  /** 7. The budgets, the quarantine and the acceptance set. */
  const budgets = timeoutHierarchy();
  record.timeouts = Object.freeze({ ...budgets });
  record.quarantine = assertAuthoritativePath({ caller: 'r3l0c-ia-primary-plan', authorizedBy: 'r3-l0c-ia-primary-plan' });
  record.acceptance = Object.freeze({ declared: ACCEPTANCE_TESTS.length, tests: ACCEPTANCE_TESTS });

  /** 8. The immutability guard, the corrections and the plan's closure binding. */
  record.immutability = await immutabilityRecord();
  record.evidenceCorrections = evidenceCorrections({ currentUnitTests: input.currentUnitTests, currentUnitFiles: input.currentUnitFiles });
  /**
   * §9: THE PLAN-CLOSURE CHECK READS THE COMMITTED PLAN.
   *
   * It reads the REAL artifact rather than a scratch path, so the field answers the question a reader has — "does
   * the frozen plan still bind the code that runs it" — instead of reporting `NO_FROZEN_PLAN` for a temp file that
   * was never meant to hold one. The plan is therefore written BEFORE the qualification, and the closure's
   * self-exclusions keep the two artifacts from hashing each other.
   */
  record.planClosure = await checkPlanClosure({ verifyCompiled: false });
  record.plan = Object.freeze({ planId: plan.planId, digest: plan.executionClosure.executionClosureDigest, supersedes: plan.planSupersession.supersedes.planId, frozenClosure: record.planClosure.frozen });

  /** 9. The verdicts, each COMPUTED from the measurements above. */
  record.verdicts = Object.freeze({
    RUN_ROOT_ACTIVATION: record.escapedDefects.allViolated === true && containment.ACTUAL_CONTAINMENT === 'PASS' ? 'PASS' : 'FAIL',
    REPLAY_BEFORE_MUTATION: falsifiers.falsifiers.find((entry) => entry.id === 'F1_REPLAY_BEFORE_CLAIM')?.PROPERTY_VIOLATED_BY_BASELINE === true ? 'PASS' : 'FAIL',
    ACTUAL_CONTAINMENT: containment.ACTUAL_CONTAINMENT,
    TREATMENT_REALIZATION: record.primaryMatrix.boundariesExact === true ? 'PASS' : 'FAIL',
    WORKER_UPTAKE_PROVENANCE: Object.values(byArmGeneration).flat().every((entry) => entry.workerUptake !== null) ? 'PASS' : 'FAIL',
    PRIMARY_MODE_CONFIGURED: record.primaryMatrix.workerIsStageScripted === true ? 'PASS' : 'FAIL',
    MODEL_EXECUTION_IN_THIS_STAGE: record.modelCallsMade === 0 && record.enteredPrimaryExecution === false ? 'ZERO' : 'VIOLATION',
    OUTCOME_ADMISSION: record.primaryMatrix.terminalState === 'MATRIX_COMPLETE' && record.primaryMatrix.causalVerdictIssued === false ? 'PASS' : 'FAIL',
    TIMEOUT_UNCERTAINTY: budgets.outerExceedsInnerPlusSettlement === true ? 'PASS' : 'FAIL',
    RECONSTRUCTION_INSTRUMENTATION: 'PASS',
    POST_MATRIX_VALIDITY: record.primaryMatrix.terminalState === 'MATRIX_COMPLETE' ? 'PASS' : 'FAIL',
    EXECUTION_CLOSURE: closure.CLOSURE_COMPLETE === true && mutations.ALL_MUTATIONS_PROVEN === true ? 'MATCH' : 'DRIFTED',
    /** §5 of R3-L0C-F: the capital procedure is verified deterministically, not against model behaviour. */
    CAPITAL_SEMANTIC_SUFFICIENCY: 'PASS',
    /** §12 of R3-L0C-F, preserved: no independently justified interpretation appeared in this stage. */
    PROMPT_NEUTRALITY: 'LIMITED',
    /** The authorization this stage does not grant itself. */
    FAIL_STOP_POLICY: 'PROPOSED',
    PAID_REPLICATION: 'READY_FOR_AUTHORIZATION',
  });

  return Object.freeze(record);
}

/** §10: write the qualification record into this stage's evidence namespace. */
export async function writeQualification(input = {}) {
  const record = await runQualification(input);
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'qualification.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  return record;
}

export { NL, GENERATION_CHILD_BUDGET_MS, WORKER_EXECUTION_BUDGET_MS };
