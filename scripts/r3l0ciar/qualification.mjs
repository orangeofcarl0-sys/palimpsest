/**
 * R3-L0C-I-A-R §1-§9 — THE QUALIFICATION ORCHESTRATOR.
 *
 * It runs the stage's deterministic gates and assembles the record the final report quotes, so a reader does not
 * have to reconstruct the verdicts from the module sources. Every verdict is COMPUTED from a measurement made here
 * rather than copied from a claim, and the ones this stage cannot decide are carried as their honest values rather
 * than as passes.
 *
 * §7's rule is enforced structurally: no readiness value is a literal. `PAID_REPLICATION` is computed from the
 * measured gates AND the authorization state, and `PAID_AUTHORIZATION` is `PENDING` because no external decision
 * record exists.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BASELINE_COMMIT, NL, REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';

/**
 * §1-§9: RUN THE ZERO-MODEL GATES AND ASSEMBLE THE QUALIFICATION.
 */
export async function runQualification(input = {}) {
  const { buildPrehistory } = await import('../r3l0c/build-prehistory.mjs');
  const { admitCapital, selectionRefs } = await import('../r3l0c/prehistory.mjs');
  const { installHostBundle, dshHome } = await import('../gates/env.mjs');
  const { computeExecutionClosure, proveClosureMutations } = await import('./closure.mjs');
  const { measureWalkerBlindSpot } = await import('./runtime-manifest.mjs');
  const { runPerTrajectoryConfinement } = await import('./confinement.mjs');
  const { frozenPrimarySchedule, timeoutHierarchy, PRIMARY_FAULTS } = await import('./primary-adapter.mjs');
  const { assertAuthoritativePath } = await import('./modes.mjs');
  const { runPrimaryMatrix } = await import('./pipeline.mjs');
  const { runCorrectionFalsifiers } = await import('./falsifiers.mjs');
  const { buildExpectationManifest } = await import('../r3l0cr/contract.mjs');
  const { GENERATION_EXPOSURES } = await import('../r3l0c/capital.mjs');
  const { regressionRecord, immutabilityRecord } = await import('./regression.mjs');
  const { evidenceCorrections } = await import('./evidence-corrections.mjs');
  const { buildProspectivePlan, checkPlanClosure } = await import('./prospective-plan.mjs');
  const { realizationPreflight, effectiveRouteConfiguration } = await import('./preflight.mjs');
  const { digestRoot } = await import('./acceptance.mjs');
  const {
    controlPreTrialReducer, controlRouteIdentity, controlAdmission, controlUptakeProvenance,
    controlCostAttribution, controlPostMatrixGate, controlTimeoutAndAuthorization,
  } = await import('./acceptance.mjs');

  const base = input.base ?? join(tmpdir(), `r3l0ciar-qualification-${String(process.pid)}`);
  mkdirSync(base, { recursive: true });
  const record = { schemaVersion: 1, stage: 'R3-L0C-I-A-R', kind: 'final activation wiring qualification', baseline: BASELINE_COMMIT, modelCallsMade: 0, enteredPrimaryExecution: false };

  /** 1. The frozen prehistory, once. */
  const built = await buildPrehistory(join(base, 'prehistory'));
  const admitted = await admitCapital(join(base, 'prehistory'), built.paths, 'cutover-entitlements', built.world);
  const refs = selectionRefs(admitted);
  const schedule = await frozenPrimarySchedule();
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  record.prehistory = Object.freeze({ head: built.head, revision: built.revision, worldDigest: built.worldDigest, trajectoryCount: trajectoryIds.length, sessionCount: schedule.length });

  /** 2. The nine falsifier measurements, against dbe6beb. */
  const expectation = buildExpectationManifest({ generationId: 'G2', arm: 'C', admittedRefs: refs, generationExposures: GENERATION_EXPOSURES });
  const falsifiers = await runCorrectionFalsifiers({ schedule, closure: { executionClosureDigest: 'a'.repeat(64) }, containment: { EXPERIMENT_ENVIRONMENT_VALID: 'PASS', ACTUAL_CONTAINMENT: 'PASS', cases: [1], probeDiscriminates: true }, trajectoryIds: trajectoryIds.slice(0, 2) });
  record.correctionDefects = Object.freeze({
    declared: falsifiers.declaredDefects,
    measuredProperties: falsifiers.measuredProperties,
    allViolated: falsifiers.ALL_PROPERTIES_VIOLATED_BY_BASELINE,
    violated: falsifiers.violated,
    notViolated: falsifiers.notViolated,
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
    walkerBlindSpotCount: blindSpot.blindSpotCount,
  });

  /** 4. The per-trajectory confinement, with its liveness control. */
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
    sandboxAvailable: containment.sandboxAvailable,
  });

  /** 5. The frozen matrix, healthy, through the single authoritative pipeline. */
  const plan = await buildProspectivePlan({ closure, verifyCompiled: false });
  const common = {
    prehistory: { world: built.world, state: built.paths.state },
    admittedRefs: refs, installHostBundle, dshHome,
    authorizedBy: 'r3-l0c-iar-primary-plan', caller: 'r3-l0c-iar-primary-plan',
    plan, closure, containment, mode: 'DETERMINISTIC', systemValid: true,
  };
  const healthy = await runPrimaryMatrix({ ...common, runId: 'r3l0ciar-qualification-healthy', runRoot: join(base, 'healthy') });
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
  const expectedByArmGeneration = { 'H/G1': 0, 'H/G2': 0, 'C/G1': 2, 'C/G2': 4 };
  record.primaryMatrix = Object.freeze({
    mode: healthy.mode?.mode ?? null,
    workerExecutable: healthy.mode?.workerExecutable ?? null,
    workerIsStageScripted: String(healthy.mode?.workerExecutable ?? '').includes('r3l0ciar'),
    pipeline: healthy.PIPELINE,
    terminalState: healthy.terminalState,
    scheduleLength: healthy.scheduleLength,
    completedSessions: healthy.completedSessions?.length ?? null,
    trajectoryCount: healthy.trajectoryCount,
    maxLaunchesPerSession: healthy.maxLaunchesPerSession,
    failure: healthy.run?.failure ?? null,
    propertiesHold: healthy.run?.properties?.ALL_PROPERTIES_HOLD ?? null,
    causalVerdictIssued: healthy.run?.causalVerdictIssued ?? null,
    treatmentByArmGeneration: Object.freeze(byArmGeneration),
    boundaryExpectations: expectedByArmGeneration,
    boundariesExact: Object.entries(expectedByArmGeneration).every(([key, expected]) => (byArmGeneration[key] ?? []).every((entry) => entry.visible === expected)),
    uptakeTelemetryInterpretable: Object.values(byArmGeneration).flat().every((entry) => entry.workerUptake !== null),
    /** §6: the cost provenance for a deterministic run, so the causal verdict is NOT_EVALUABLE. */
    costProvenance: healthy.run?.validityGate?.costProvenance ?? null,
    causalAdmission: healthy.run?.validityGate?.causalAdmission ?? null,
  });

  /** 6. The replay refusal, measured as a byte digest across the refused invocation. */
  const replayRoot = join(base, 'replay');
  await runPrimaryMatrix({ ...common, runId: 'r3l0ciar-qualification-replay', runRoot: replayRoot });
  const beforeDigest = digestRoot(replayRoot);
  const replay = await runPrimaryMatrix({ ...common, runId: 'r3l0ciar-qualification-replay', runRoot: replayRoot });
  const afterDigest = digestRoot(replayRoot);
  record.replay = Object.freeze({
    firstRunTerminal: healthy.terminalState,
    secondRunPipeline: replay.PIPELINE,
    secondRunRefusedAt: replay.refusedAt ?? null,
    secondRunReason: replay.reason ?? null,
    stateUnchangedByRefusal: beforeDigest === afterDigest,
    bytesChanged: beforeDigest === afterDigest ? 0 : 1,
  });

  /** 7. The fault positions and the timeout case. */
  const faults = [];
  for (const [position, label] of [['FIRST', 'first'], ['MIDDLE', 'middle'], ['LAST', 'last']]) {
    const run = await runPrimaryMatrix({ ...common, runId: `r3l0ciar-qualification-fault-${label}`, runRoot: join(base, `fault-${label}`), faultAt: position, faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    faults.push(Object.freeze({
      position, scheduleIndex: run.faultsInjected?.[0]?.scheduleIndex ?? null,
      terminalState: run.terminalState, completedSessions: run.completedSessions?.length ?? null,
      maxLaunchesPerSession: run.maxLaunchesPerSession, sessionsAfterFault: run.sessionsAfterFault,
    }));
  }
  const hang = await runPrimaryMatrix({ ...common, runId: 'r3l0ciar-qualification-hang', runRoot: join(base, 'hang'), faultAt: 'FIRST', faultKind: PRIMARY_FAULTS.REPORT_THEN_HANG, timeoutMs: input.hangTimeoutMs ?? 4_000 });
  record.faultInjection = Object.freeze({
    cases: Object.freeze(faults),
    allStopped: faults.every((entry) => entry.terminalState === 'ABORT_PRESERVED'),
    noLaterLaunch: faults.every((entry) => (entry.sessionsAfterFault ?? []).length === 0),
    oneLaunchPerSession: faults.every((entry) => entry.maxLaunchesPerSession === 1),
    /** §8: a worker that reported then hung is UNCERTAIN, not an established exit. */
    reportThenHangTerminal: hang.terminalState,
    reportThenHangUncertain: hang.terminalState === 'UNCERTAIN_PRESERVED',
  });

  /** 8. The production-path controls. */
  const routeConfiguration = await effectiveRouteConfiguration();
  const healthyPreTrial = Object.freeze({
    plan: { ...plan, schedule, executionRoute: { ...plan.executionRoute } },
    closure, containment, schedule,
    mode: { resolved: true, mode: 'DETERMINISTIC', workerExecutable: healthy.mode?.workerExecutable ?? 'x' },
    realizationPreflight: await realizationPreflight({ admittedRefs: refs, generationExposures: GENERATION_EXPOSURES }),
    routeConfiguration, systemValid: true,
  });
  const controls = Object.freeze({
    preTrialReducer: await controlPreTrialReducer({ healthy: healthyPreTrial }),
    routeIdentity: await controlRouteIdentity({ healthy: healthyPreTrial }),
    admission: await controlAdmission(),
    uptakeProvenance: await controlUptakeProvenance({ expectation }),
    costAttribution: await controlCostAttribution({}),
    postMatrixGate: await controlPostMatrixGate({
      schedule, plan: { ...plan, schedule }, closure, containment,
      goodRecords: healthy.run?.records ?? [],
      costAttribution: healthy.run?.validityGate?.costProvenance === undefined ? null : { interpretable: true, measuredCount: 16, rejectedCount: 0, livePrimaryCount: 0, fixtureCount: 16, allSixteenLivePrimary: false },
    }),
    timeoutAndAuthorization: await controlTimeoutAndAuthorization({ slowWorkerObservation: { terminal: hang.terminalState } }),
  });
  record.controls = Object.freeze(Object.fromEntries(Object.entries(controls).map(([key, value]) => [key, value])));

  /** 9. The budgets, the quarantine and the plan's closure binding. */
  const budgets = timeoutHierarchy();
  record.timeouts = Object.freeze({ ...budgets });
  record.quarantine = assertAuthoritativePath({ caller: 'r3-l0c-iar-primary-plan', authorizedBy: 'r3-l0c-iar-primary-plan' });

  /** 10. The immutability guard and the evidence corrections. */
  record.immutability = await immutabilityRecord();
  record.evidenceCorrections = evidenceCorrections();
  record.planClosure = await checkPlanClosure({ verifyCompiled: false });
  record.plan = Object.freeze({ planId: plan.planId, digest: plan.executionClosure.executionClosureDigest, supersedes: plan.planSupersession.supersedes.planId, frozenClosure: record.planClosure.frozen });

  /** 11. The verdicts, each COMPUTED from the measurements above. No readiness literal. */
  const authorizationDecisionPresent = false;
  const pipelineStepIds = (healthy.steps ?? []).map((step) => step.id);
  record.verdicts = Object.freeze({
    /**
     * §2: the entry is authoritative when the ONE pipeline completed AND its own step record contains the ordered
     * steps 1-7 — the claim, the preparation and the pre-exposure checks among them. Steps 8-9 execute inside the
     * Fail-Stop runner, so they appear on the run rather than on the pipeline's own record.
     */
    AUTHORITATIVE_PRIMARY_ENTRY: healthy.PIPELINE === 'COMPLETED'
      && ['VERIFY_COMMITTED_PLAN', 'VERIFY_RUNTIME_AND_CLOSURE', 'CHECK_RUN_IDENTITY_AND_SCHEDULE', 'ACQUIRE_EXCLUSIVE_RUN_ROOT', 'PERSIST_PRESERVATION_MARKER', 'PREPARE_WORLDS_STORES_PROFILES', 'PRE_EXPOSURE_CHECKS'].every((id) => pipelineStepIds.includes(id))
      && healthy.run?.maxLaunchesPerSession === 1 ? 'PASS' : 'FAIL',
    RUN_CLAIM_BEFORE_MUTATION: record.replay.secondRunPipeline === 'REFUSED' && record.replay.stateUnchangedByRefusal === true && record.replay.secondRunRefusedAt === 'ACQUIRE_EXCLUSIVE_RUN_ROOT' ? 'PASS' : 'FAIL',
    PRETRIAL_VALIDITY: controls.preTrialReducer.PASS === true && controls.preTrialReducer.positiveControl.ALL_SATISFIED === true ? 'PASS' : 'FAIL',
    MODEL_ROUTE_IDENTITY: controls.routeIdentity.PASS === true ? 'MATCH' : 'DRIFTED',
    WORKER_RESULT_ADMISSION: controls.admission.PASS === true && controls.admission.allSixRefused === true && controls.admission.positiveControl.validDisposition === 'ADMITTED' ? 'PASS' : 'FAIL',
    UPTAKE_TELEMETRY_PROVENANCE: controls.uptakeProvenance.PASS === true ? 'PASS' : 'FAIL',
    COST_ARTIFACT_ATTRIBUTION: controls.costAttribution.PASS === true ? 'PASS' : 'FAIL',
    POST_MATRIX_CAUSAL_ADMISSION: controls.postMatrixGate.PASS === true
      && controls.postMatrixGate.allNegativesFailClosed === true
      && controls.postMatrixGate.positiveControl.fixtureGreenButNotCausal.causal.CAUSAL_EXPERIMENT_VALID === 'NO' ? 'PASS' : 'FAIL',
    FAIL_STOP_UNCERTAINTY: controls.timeoutAndAuthorization.PASS === true && record.faultInjection.reportThenHangUncertain === true ? 'PASS' : 'FAIL',
    EXECUTION_CLOSURE: closure.CLOSURE_COMPLETE === true && mutations.ALL_MUTATIONS_PROVEN === true && record.planClosure.EXECUTION_CLOSURE === 'MATCH' ? 'MATCH' : 'DRIFTED',
    /** §8: this stage grants no authorization. */
    PAID_AUTHORIZATION: authorizationDecisionPresent ? 'GRANTED' : 'PENDING',
    /**
     * §7: COMPUTED, not hardcoded. Readiness requires every deterministic gate green AND the closure matching AND
     * the correction defects all measured — and it is still only READINESS, because the authorization is PENDING.
     */
    PAID_REPLICATION: (falsifiers.ALL_PROPERTIES_VIOLATED_BY_BASELINE === true
      && closure.CLOSURE_COMPLETE === true
      && mutations.ALL_MUTATIONS_PROVEN === true
      && record.planClosure.EXECUTION_CLOSURE === 'MATCH'
      && record.immutability.verdict === 'PASS'
      && healthy.terminalState === 'MATRIX_COMPLETE'
      && controls.preTrialReducer.PASS === true
      && controls.admission.PASS === true
      && controls.uptakeProvenance.PASS === true
      && controls.costAttribution.PASS === true
      && controls.postMatrixGate.PASS === true
      && controls.timeoutAndAuthorization.PASS === true) ? 'READY_FOR_AUTHORIZATION' : 'BLOCKED',
  });

  return Object.freeze(record);
}

/** §9: write the qualification record into this stage's evidence namespace. */
export async function writeQualification(input = {}) {
  const record = await runQualification(input);
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'qualification.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  return record;
}

export { NL };
