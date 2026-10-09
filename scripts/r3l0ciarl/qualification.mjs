/**
 * R3-L0C-I-A-R-L §Final — THE QUALIFICATION ORCHESTRATOR.
 *
 * It runs the stage's deterministic gates and assembles the record the final report quotes. Every verdict is
 * COMPUTED from a measurement made here rather than copied from a claim, and the ones this stage cannot decide are
 * carried as their honest values.
 *
 * THE TWO THE STAGE CANNOT SET ARE THE IMPORTANT ONES, and they are named: `PAID_AUTHORIZATION` stays PENDING
 * because no external authorization decision record exists, and `PAID_REPLICATION` reports READINESS — which is not
 * authorization.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BASELINE_COMMIT, NL, REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';

/** §Final: run the zero-model gates and assemble the qualification. */
export async function runQualification(input = {}) {
  const { buildPrehistory } = await import('../r3l0c/build-prehistory.mjs');
  const { admitCapital, selectionRefs } = await import('../r3l0c/prehistory.mjs');
  const { installHostBundle, dshHome } = await import('../gates/env.mjs');
  const { computeExecutionClosure, proveClosureMutations } = await import('./closure.mjs');
  const { frozenPrimarySchedule, timeoutHierarchy, PRIMARY_FAULTS } = await import('../r3l0ciar/primary-adapter.mjs');
  const { runLiveMeasurementMatrix } = await import('./pipeline.mjs');
  const { assertAuthoritativePath } = await import('./modes.mjs');
  const { runCorrectionControls } = await import('./falsifiers.mjs');
  const { regressionRecord, immutabilityRecord } = await import('./regression.mjs');
  const { buildProspectivePlan, checkPlanClosure } = await import('./prospective-plan.mjs');
  const { realizationPreflight, effectiveRouteConfiguration } = await import('../r3l0ciar/preflight.mjs');
  const { controlLiveEvidence, controlPostflightFreshness, controlPrimaryBinding, controlAttestation } = await import('./acceptance.mjs');
  const { runtimeAttestation, sampleInstallationDigest } = await import('./attestation.mjs');
  const { runPerTrajectoryConfinement } = await import('../r3l0ciar/confinement.mjs');

  const base = input.base ?? join(tmpdir(), `r3l0ciarl-qualification-${String(process.pid)}`);
  mkdirSync(base, { recursive: true });
  const record = { schemaVersion: 1, stage: 'R3-L0C-I-A-R-L', kind: 'live measurement closure qualification', baseline: BASELINE_COMMIT, modelCallsMade: 0, enteredPrimaryExecution: false };

  /** 1. The frozen prehistory, once. */
  const built = await buildPrehistory(join(base, 'prehistory'));
  const admitted = await admitCapital(join(base, 'prehistory'), built.paths, 'cutover-entitlements', built.world);
  const refs = selectionRefs(admitted);
  const schedule = await frozenPrimarySchedule();
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  record.prehistory = Object.freeze({ head: built.head, revision: built.revision, worldDigest: built.worldDigest, trajectoryCount: trajectoryIds.length, sessionCount: schedule.length });

  /** 2. The five baseline controls, against 36ada58. */
  const controls = await runCorrectionControls({ schedule, dshHomePath: dshHome() });
  record.correctionGates = Object.freeze({
    declared: controls.declared,
    allViolated: controls.ALL_DEFECTS_VIOLATED_BY_BASELINE,
    violated: controls.violated,
    notViolated: controls.notViolated,
    controls: controls.controls,
  });

  /** 3. The closure, its mutations and the walker's blind spot. */
  const closure = await computeExecutionClosure({ verifyCompiled: false });
  const mutations = await proveClosureMutations();
  record.executionClosure = Object.freeze({
    digest: closure.executionClosureDigest,
    partIds: closure.partIds,
    fileCount: closure.fileCount,
    complete: closure.CLOSURE_COMPLETE,
    stageHarnessModules: closure.stageHarness.moduleCount,
    reusedModules: closure.reusedModules.moduleCount,
    reusedMissing: closure.reusedModules.missing,
    mutationsProven: mutations.ALL_MUTATIONS_PROVEN,
    mutationArms: mutations.arms.map((arm) => arm.id),
    treeMutated: mutations.treeMutated,
    walkerBlindSpotCount: mutations.blindSpot.blindSpotCount,
  });

  /** 4. The runtime attestation, WITH verification enabled. */
  const installationBefore = sampleInstallationDigest({ dshHomePath: dshHome() });
  const attestation = await runtimeAttestation({ dshHomePath: dshHome(), beforeDigest: installationBefore, installedDuringRun: true, computeClosure: () => computeExecutionClosure({ verifyCompiled: true }) });
  record.attestation = Object.freeze({
    verdict: attestation.EXECUTABLE_RUNTIME_ATTESTATION,
    compiledMatchesSource: attestation.compiledSource.COMPILED_MATCHES_SOURCE,
    compiledDeterministic: attestation.compiledSource.DETERMINISTIC,
    installedBundleIdentical: attestation.installedBundle.allIdentical,
    competingWriterDetected: attestation.competingWriter.competingWriterDetected,
    verifiedClosureCompiledMatchesSource: attestation.verifiedClosureCompiledMatchesSource,
    installerIsMitigationNotProof: attestation.installerIsMitigationNotProof,
  });

  /** 5. The per-trajectory confinement, with its liveness control. */
  const containment = await runPerTrajectoryConfinement({ runRoot: join(base, 'containment'), trajectoryIds });
  record.containment = Object.freeze({
    verdict: containment.ACTUAL_CONTAINMENT,
    environmentVerdict: containment.EXPERIMENT_ENVIRONMENT_VALID,
    cases: containment.cases.length,
    everyOwnWorldExcluded: containment.everyOwnWorldExcluded,
    everyOwnWorldWritable: containment.everyOwnWorldWritable,
    everySiblingProtected: containment.everySiblingProtected,
    noProtectedTargetReachable: containment.noProtectedTargetReachable,
    noEscapeSucceeded: containment.noEscapeSucceeded,
    probeDiscriminates: containment.probeDiscriminates,
    aclWeakened: containment.aclWeakened,
  });

  /** 6. The frozen matrix, healthy, through the live-measurement pipeline. */
  const plan = await buildProspectivePlan({ closure, verifyCompiled: false });
  const common = {
    prehistory: { world: built.world, state: built.paths.state }, admittedRefs: refs,
    installHostBundle, dshHome, authorizedBy: 'r3-l0c-iar-l-primary-plan', caller: 'r3-l0c-iar-l-primary-plan',
    plan, closure, containment, mode: 'DETERMINISTIC', systemValid: true,
  };
  const healthy = await runLiveMeasurementMatrix({ ...common, runId: 'r3l0ciarl-qualification-healthy', runRoot: join(base, 'healthy') });
  const byArmGeneration = {};
  for (const sessionRecord of healthy.run?.records ?? []) {
    const key = `${sessionRecord.arm}/${sessionRecord.generation}`;
    (byArmGeneration[key] ??= []).push(Object.freeze({
      visible: sessionRecord.consumerVisibleHandles.length,
      workerUptake: sessionRecord.workerUptakeCount,
      realization: sessionRecord.treatmentRealization,
    }));
  }
  const expectedByArmGeneration = { 'H/G1': 0, 'H/G2': 0, 'C/G1': 2, 'C/G2': 4 };
  record.primaryMatrix = Object.freeze({
    mode: healthy.mode?.mode ?? null,
    workerIsStageScripted: String(healthy.mode?.workerExecutable ?? '').includes('r3l0cia'),
    pipeline: healthy.PIPELINE,
    terminalState: healthy.terminalState,
    completedSessions: healthy.completedSessions?.length ?? null,
    trajectoryCount: healthy.trajectoryCount,
    maxLaunchesPerSession: healthy.maxLaunchesPerSession,
    boundariesExact: Object.entries(expectedByArmGeneration).every(([key, expected]) => (byArmGeneration[key] ?? []).every((entry) => entry.visible === expected)),
    causalVerdictIssued: healthy.run?.causalVerdictIssued ?? false,
    /** §1: the live-evidence continuity over the real run. */
    liveEvidenceSessions: healthy.liveEvidenceContinuity?.sessions ?? null,
    liveEvidencePropagation: healthy.liveEvidenceContinuity?.LIVE_ARTIFACT_PROPAGATION ?? 'FAIL',
    /** §2: the fresh postflight over the real run. */
    postflightClosureMatchesPlan: healthy.postflight?.closureMatchesPlan ?? false,
    postflightRuntimeMoved: healthy.postflight?.runtimeMovedAfterPreflight ?? null,
    journalRetries: healthy.journalCounts?.retries ?? null,
    journalReplacements: healthy.journalCounts?.replacements ?? null,
    allIdentitiesExact: healthy.sessionIdentities?.allIdentitiesExact ?? false,
    /** §4: the installation sample taken before the matrix. */
    installationSampledBefore: String(healthy.installationBefore ?? '').slice(0, 16),
  });

  /** 7. The fault positions and the report-then-hang case. */
  const faults = [];
  for (const [position, label] of [['FIRST', 'first'], ['MIDDLE', 'middle'], ['LAST', 'last']]) {
    const run = await runLiveMeasurementMatrix({ ...common, runId: `r3l0ciarl-qualification-fault-${label}`, runRoot: join(base, `fault-${label}`), faultAt: position, faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    faults.push(Object.freeze({
      position, scheduleIndex: run.faultsInjected?.[0]?.scheduleIndex ?? null,
      terminalState: run.terminalState, completedSessions: run.completedSessions?.length ?? null,
      maxLaunchesPerSession: run.maxLaunchesPerSession, sessionsAfterFault: run.sessionsAfterFault,
    }));
  }
  const hang = await runLiveMeasurementMatrix({ ...common, runId: 'r3l0ciarl-qualification-hang', runRoot: join(base, 'hang'), faultAt: 'FIRST', faultKind: PRIMARY_FAULTS.REPORT_THEN_HANG, timeoutMs: input.hangTimeoutMs ?? 4_000 });
  record.faultInjection = Object.freeze({
    cases: Object.freeze(faults),
    allStopped: faults.every((entry) => entry.terminalState === 'ABORT_PRESERVED'),
    noLaterLaunch: faults.every((entry) => (entry.sessionsAfterFault ?? []).length === 0),
    oneLaunchPerSession: faults.every((entry) => entry.maxLaunchesPerSession === 1),
    reportThenHangTerminal: hang.terminalState,
    reportThenHangUncertain: hang.terminalState === 'UNCERTAIN_PRESERVED',
  });

  /** 8. The production-path controls. */
  const liveEvidenceControl = await controlLiveEvidence({});
  const postflightControl = await controlPostflightFreshness({});
  const bindingControl = await controlPrimaryBinding();
  const attestationControl = await controlAttestation({ dshHomePath: dshHome() });
  record.productionControls = Object.freeze({
    liveEvidence: liveEvidenceControl,
    postflight: postflightControl,
    primaryBinding: bindingControl,
    attestation: attestationControl,
  });

  /** 9. The budgets, the quarantine and the plan's closure binding. */
  record.timeouts = Object.freeze({ ...timeoutHierarchy() });
  record.quarantine = assertAuthoritativePath({ caller: 'r3-l0c-iar-l-primary-plan', authorizedBy: 'r3-l0c-iar-l-primary-plan' });

  /** 10. The immutability guard and the plan's closure binding. */
  record.immutability = await immutabilityRecord();
  record.planClosure = await checkPlanClosure({ verifyCompiled: false });
  record.plan = Object.freeze({ planId: plan.planId, digest: plan.executionClosure.executionClosureDigest, supersedes: plan.planSupersession.supersedes.planId, frozenClosure: record.planClosure.frozen });

  /** 11. The verdicts, each COMPUTED. No readiness literal. */
  const authorizationDecisionPresent = false;
  record.verdicts = Object.freeze({
    LIVE_ARTIFACT_PROPAGATION: healthy.liveEvidenceContinuity?.LIVE_ARTIFACT_PROPAGATION === 'PASS' && liveEvidenceControl.PASS === true ? 'PASS' : 'FAIL',
    DURABLE_COST_ADMISSION: healthy.liveEvidenceContinuity?.allMatched === true && healthy.liveEvidenceContinuity?.allComplete === true ? 'PASS' : 'FAIL',
    POSTFLIGHT_FRESHNESS: healthy.postflight?.POSTFLIGHT_FRESHNESS === 'PASS' && healthy.sessionIdentities?.allIdentitiesExact === true && postflightControl.PASS === true ? 'PASS' : 'FAIL',
    PRIMARY_INPUT_BINDING: bindingControl.PASS === true ? 'PASS' : 'FAIL',
    EXECUTABLE_RUNTIME_ATTESTATION: attestation.EXECUTABLE_RUNTIME_ATTESTATION === 'PASS' && attestationControl.PASS === true ? 'PASS' : 'FAIL',
    FAIL_STOP_VALIDITY: record.faultInjection.allStopped === true && record.faultInjection.noLaterLaunch === true && record.faultInjection.oneLaunchPerSession === true && record.faultInjection.reportThenHangUncertain === true && healthy.terminalState === 'MATRIX_COMPLETE' ? 'PASS' : 'FAIL',
    PAID_AUTHORIZATION: authorizationDecisionPresent ? 'GRANTED' : 'PENDING',
    /** §Final: computed from the gates, and still only READINESS. */
    PAID_REPLICATION: (controls.ALL_DEFECTS_VIOLATED_BY_BASELINE === true
      && closure.CLOSURE_COMPLETE === true
      && mutations.ALL_MUTATIONS_PROVEN === true
      && record.planClosure.EXECUTION_CLOSURE === 'MATCH'
      && record.immutability.verdict === 'PASS'
      && healthy.terminalState === 'MATRIX_COMPLETE'
      && healthy.liveEvidenceContinuity?.LIVE_ARTIFACT_PROPAGATION === 'PASS'
      && healthy.postflight?.POSTFLIGHT_FRESHNESS === 'PASS'
      && healthy.sessionIdentities?.allIdentitiesExact === true
      && bindingControl.PASS === true
      && attestation.EXECUTABLE_RUNTIME_ATTESTATION === 'PASS'
      && attestationControl.PASS === true) ? 'READY_FOR_AUTHORIZATION' : 'BLOCKED',
  });

  return Object.freeze(record);
}

/** §Final: write the qualification record into this stage's evidence namespace. */
export async function writeQualification(input = {}) {
  const record = await runQualification(input);
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'qualification.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  return record;
}

export { NL };
