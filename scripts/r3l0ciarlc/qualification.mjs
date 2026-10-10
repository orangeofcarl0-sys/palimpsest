/**
 * R3-L0C-I-A-R-L-C §10 — THE QUALIFICATION ORCHESTRATOR.
 *
 * It runs the stage's deterministic gates and assembles the record the final report quotes. Every verdict is
 * COMPUTED from a measurement made here rather than copied from a claim, and the ones this stage cannot decide are
 * carried as their honest values.
 *
 * THE THREE THE STAGE CANNOT SET ARE THE IMPORTANT ONES, and they are named: `PAID_AUTHORIZATION` stays PENDING
 * because no separately controlled trusted authority source exists, `PAID_EXECUTION` stays NOT_RUN because §0
 * forbids a paid launch, and `CAUSAL_RESULT` stays NOT_EVALUABLE because a deterministic matrix produces no live
 * primary observation.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BASELINE_COMMIT, NL, REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';

/**
 * §3: THE DETERMINISTIC ARTIFACT FIXTURE.
 *
 * A deterministic run's scripted worker produces no DSH session artifact, so Gate A's chain needs one to be
 * demonstrated. This writes a REAL-FORMAT artifact per session and returns the identity the record must carry, so
 * the outcome, the sidecar and the durable record agree and the bridge attributes a real cost. It is DETERMINISTIC
 * ONLY: the binding check refuses the `artifactFixture` seam in PRIMARY, so no injected object can be promoted
 * into an authoritative measurement.
 */
export async function deterministicArtifactFixture(input) {
  const { artifactRoot } = input;
  const { writeRealFormatArtifact } = await import('./baseline/legacy-controls.mjs');
  return ({ session, outcome }) => {
    const attemptId = createHash('sha256').update(`${session.sessionId}:fixture`, 'utf8').digest('hex').slice(0, 12);
    const artifact = writeRealFormatArtifact({ directory: join(artifactRoot, session.sessionId), attemptId });
    return Object.freeze({ path: artifact.path, attemptId, hostJobId: outcome?.hostJobId ?? `job-${session.sessionId}` });
  };
}

/** §10: run the zero-model gates and assemble the qualification. */
export async function runQualification(input = {}) {
  const { buildPrehistory } = await import('../r3l0c/build-prehistory.mjs');
  const { admitCapital, selectionRefs } = await import('../r3l0c/prehistory.mjs');
  const { installHostBundle, dshHome } = await import('../gates/env.mjs');
  const { computeExecutionClosure, proveClosureMutations } = await import('./closure.mjs');
  const { frozenPrimarySchedule, timeoutHierarchy, PRIMARY_FAULTS } = await import('../r3l0ciar/primary-adapter.mjs');
  const { runAdmissionClosureMatrix } = await import('./pipeline.mjs');
  const { assertAuthoritativePath } = await import('./modes.mjs');
  const { runCorrectionControls } = await import('./falsifiers.mjs');
  const { regressionRecord, immutabilityRecord } = await import('./regression.mjs');
  const { buildProspectivePlan, checkPlanClosure } = await import('./prospective-plan.mjs');
  const { verifyExternalAuthority } = await import('./trust-boundary.mjs');
  const { controlDurableCostBridge, controlTerminalAdmission, controlTrustBoundary, controlInRunAttestation } = await import('./acceptance.mjs');
  const { inRunAttestation, sampleInstallationDigest } = await import('./attestation.mjs');
  const { runPerTrajectoryConfinement } = await import('../r3l0ciar/confinement.mjs');
  const { verifyCompiledSource } = await import('./attestation.mjs');

  const base = input.base ?? join(tmpdir(), `r3l0ciarlc-qualification-${String(process.pid)}`);
  mkdirSync(base, { recursive: true });
  const record = { schemaVersion: 1, stage: 'R3-L0C-I-A-R-L-C', kind: 'authoritative causal admission closure qualification', baseline: BASELINE_COMMIT, modelCallsMade: 0, enteredPrimaryExecution: false };

  /** 1. The frozen prehistory, once. */
  const built = await buildPrehistory(join(base, 'prehistory'));
  const admitted = await admitCapital(join(base, 'prehistory'), built.paths, 'cutover-entitlements', built.world);
  const refs = selectionRefs(admitted);
  const schedule = await frozenPrimarySchedule();
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  record.prehistory = Object.freeze({ head: built.head, revision: built.revision, worldDigest: built.worldDigest, trajectoryCount: trajectoryIds.length, sessionCount: schedule.length });

  /** 2. The four baseline controls, against 6089947. */
  const controls = await runCorrectionControls();
  record.correctionGates = Object.freeze({
    declared: controls.declared,
    allViolated: controls.ALL_DEFECTS_VIOLATED_BY_BASELINE,
    violated: controls.violated,
    notViolated: controls.notViolated,
    controls: controls.controls,
  });

  /** 3. The closure, its four mutation arms and the walker's blind spot. */
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

  /** 4. The in-run attestation, over an isolated installation. */
  const installationHome = join(base, 'attest-home', '.dsh');
  mkdirSync(join(installationHome, 'profiles', 'node_modules'), { recursive: true });
  const s0 = sampleInstallationDigest({ dshHomePath: installationHome });
  installHostBundle({ repo: REPO_ROOT, realDshHome: installationHome });
  const s1 = sampleInstallationDigest({ dshHomePath: installationHome });
  const compiledVerification = await verifyCompiledSource();
  const attestation = await inRunAttestation({ dshHomePath: installationHome, s0Digest: s0, s1Digest: s1, s2Digest: s1, installedDuringRun: true, compiledVerification });
  record.attestation = Object.freeze({
    verdict: attestation.IN_RUN_ATTESTATION,
    s1MatchesExpectedBundle: attestation.s1MatchesExpectedBundle,
    s2MatchesS1: attestation.s2MatchesS1,
    competingWriterDetected: attestation.competingWriterDetected,
    compiledMatchesSource: compiledVerification.COMPILED_MATCHES_SOURCE,
    compiledDeterministic: compiledVerification.DETERMINISTIC,
    installerIsMitigationNotProof: attestation.installerIsMitigationNotProof,
    coverageLimitations: attestation.coverageLimitations,
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
  });

  /** 6. The frozen matrix, healthy, through the admission-closure pipeline. */
  const plan = await buildProspectivePlan({ closure, verifyCompiled: false });
  const artifactRoot = join(base, 'artifacts');
  mkdirSync(artifactRoot, { recursive: true });
  const artifactFixture = await deterministicArtifactFixture({ artifactRoot });
  const common = {
    prehistory: { world: built.world, state: built.paths.state }, admittedRefs: refs,
    installHostBundle, dshHome, authorizedBy: 'r3-l0c-iar-lc-primary-plan', caller: 'r3-l0c-iar-lc-primary-plan',
    plan, closure, containment, mode: 'DETERMINISTIC', systemValid: true, artifactRoot, artifactFixture,
  };
  const healthy = await runAdmissionClosureMatrix({ ...common, runId: 'r3l0ciarlc-qualification-healthy', runRoot: join(base, 'healthy') });
  record.primaryMatrix = Object.freeze({
    mode: healthy.mode?.mode ?? null,
    workerIsStageScripted: String(healthy.mode?.workerExecutable ?? '').includes('r3l0cia'),
    pipeline: healthy.PIPELINE,
    terminalState: healthy.terminalState,
    matrixCompleted: healthy.matrixCompleted,
    completedSessions: healthy.completedSessions?.length ?? null,
    trajectoryCount: healthy.trajectoryCount,
    maxLaunchesPerSession: healthy.maxLaunchesPerSession,
    /** §3 Gate A: the cost is attributed from a genuine journal readback. */
    costMeasured: healthy.costBridge?.measuredCount ?? null,
    costAbsent: healthy.costBridge?.absentCount ?? null,
    costProvenance: healthy.costBridge?.provenance ?? null,
    costInterpretable: healthy.costBridge?.interpretable ?? false,
    costAllSixteenLivePrimary: healthy.costBridge?.allSixteenLivePrimary ?? false,
    /** §4 Gate B: the terminal admission decided before the runner completed. */
    terminalAdmissionGreen: healthy.validityGate?.green ?? false,
    terminalAdmissionDecision: healthy.validityGate?.decision ?? null,
    /** §1: the live-evidence continuity over the real run. */
    liveEvidenceSessions: healthy.liveEvidenceContinuity?.sessions ?? null,
    liveEvidencePropagation: healthy.liveEvidenceContinuity?.LIVE_ARTIFACT_PROPAGATION ?? 'FAIL',
    /** §6 Gate D: the in-run attestation over the real run. */
    inRunAttestation: healthy.finalAttestation?.IN_RUN_ATTESTATION ?? 'FAIL',
    s2MatchesS1: healthy.finalAttestation?.s2MatchesS1 ?? false,
    competingWriterDetected: healthy.finalAttestation?.competingWriterDetected ?? null,
    journalRetries: healthy.journalCounts?.retries ?? null,
    journalReplacements: healthy.journalCounts?.replacements ?? null,
    allIdentitiesExact: healthy.sessionIdentities?.allIdentitiesExact ?? false,
    causalVerdictIssued: healthy.run?.causalVerdictIssued ?? false,
  });

  /** 7. The fault positions and the report-then-hang case. */
  const faults = [];
  for (const [position, label] of [['FIRST', 'first'], ['MIDDLE', 'middle'], ['LAST', 'last']]) {
    const run = await runAdmissionClosureMatrix({ ...common, runId: `r3l0ciarlc-qualification-fault-${label}`, runRoot: join(base, `fault-${label}`), faultAt: position, faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    faults.push(Object.freeze({
      position, scheduleIndex: run.faultsInjected?.[0]?.scheduleIndex ?? null,
      terminalState: run.terminalState, completedSessions: run.completedSessions?.length ?? null,
      maxLaunchesPerSession: run.maxLaunchesPerSession, sessionsAfterFault: run.sessionsAfterFault,
    }));
  }
  const hang = await runAdmissionClosureMatrix({ ...common, runId: 'r3l0ciarlc-qualification-hang', runRoot: join(base, 'hang'), faultAt: 'FIRST', faultKind: PRIMARY_FAULTS.REPORT_THEN_HANG, timeoutMs: input.hangTimeoutMs ?? 4_000 });
  record.faultInjection = Object.freeze({
    cases: Object.freeze(faults),
    allStopped: faults.every((entry) => entry.terminalState === 'ABORT_PRESERVED'),
    noLaterLaunch: faults.every((entry) => (entry.sessionsAfterFault ?? []).length === 0),
    oneLaunchPerSession: faults.every((entry) => entry.maxLaunchesPerSession === 1),
    reportThenHangTerminal: hang.terminalState,
    reportThenHangUncertain: hang.terminalState === 'UNCERTAIN_PRESERVED',
  });

  /** 8. The production-path controls. */
  const costControl = await controlDurableCostBridge();
  const admissionControl = await controlTerminalAdmission();
  const trustControl = await controlTrustBoundary({ dshHomePath: dshHome() });
  const attestationControl = await controlInRunAttestation({ repo: REPO_ROOT, compiledVerification });
  record.productionControls = Object.freeze({ durableCostBridge: costControl, terminalAdmission: admissionControl, trustBoundary: trustControl, inRunAttestation: attestationControl });

  /** 9. The budgets, the quarantine and the authorization verdict. */
  record.timeouts = Object.freeze({ ...timeoutHierarchy() });
  record.quarantine = assertAuthoritativePath({ caller: 'r3-l0c-iar-lc-primary-plan', authorizedBy: 'r3-l0c-iar-lc-primary-plan' });
  const authority = verifyExternalAuthority({ record: input.authorizationDecision ?? null, plan });
  record.authority = Object.freeze({
    verdict: authority.verdict,
    verified: authority.verified,
    trustedSourceAvailable: authority.trustedSource.available,
    concepts: authority.concepts,
    launchProhibited: authority.launchProhibited,
  });

  /** 10. The immutability guard and the plan's closure binding. */
  record.immutability = await immutabilityRecord();
  record.planClosure = await checkPlanClosure({ verifyCompiled: false });
  record.plan = Object.freeze({ planId: plan.planId, digest: plan.executionClosure.executionClosureDigest, planContentDigest: plan.planContentDigest, supersedes: plan.planSupersession.supersedes.planId, frozenClosure: record.planClosure.frozen });

  /** 11. The verdicts, each COMPUTED. No readiness literal, and no unearned promotion. */
  record.verdicts = Object.freeze({
    DURABLE_COST_BRIDGE: costControl.PASS === true && (healthy.costBridge?.measuredCount ?? 0) === 16 && healthy.costBridge?.interpretable === true ? 'PASS' : 'FAIL',
    POSTMATRIX_ADMISSION: admissionControl.PASS === true && healthy.validityGate?.green === true ? 'PASS' : 'FAIL',
    PRIMARY_INPUT_INTEGRITY: trustControl.PASS === true ? 'PASS' : 'FAIL',
    AUTHORITY_TRUST_BOUNDARY: trustControl.PASS === true && authority.verified === false && authority.trustedSource.available === false ? 'PASS' : 'FAIL',
    IN_RUN_ATTESTATION: attestation.IN_RUN_ATTESTATION === 'PASS' && attestationControl.PASS === true ? 'PASS' : 'FAIL',
    FAIL_STOP_VALIDITY: record.faultInjection.allStopped === true && record.faultInjection.noLaterLaunch === true && record.faultInjection.oneLaunchPerSession === true && record.faultInjection.reportThenHangUncertain === true && healthy.terminalState === 'MATRIX_COMPLETE' ? 'PASS' : 'FAIL',
    EXECUTION_CLOSURE: record.planClosure.EXECUTION_CLOSURE,
    HISTORICAL_EVIDENCE_IMMUTABILITY: record.immutability.verdict,
    /** §10: the three verdicts this stage cannot earn. */
    PAID_AUTHORIZATION: authority.verified === true ? 'GRANTED' : authority.trustedSource.available === false ? 'AUTHORITY_NOT_ESTABLISHED' : 'PENDING',
    PAID_EXECUTION: 'NOT_RUN',
    CAUSAL_RESULT: healthy.costBridge?.allSixteenLivePrimary === true ? 'EVALUABLE' : 'NOT_EVALUABLE',
  });

  /**
   * §10: THE OVERALL CONCLUSION. If any central authoritative-path property is not demonstrated, the measurement
   * readiness is BLOCKED — and PAID_AUTHORIZATION being PENDING/NOT_ESTABLISHED, PAID_EXECUTION NOT_RUN and
   * CAUSAL_RESULT NOT_EVALUABLE are the EXPECTED honest values, not blockers.
   */
  const central = ['DURABLE_COST_BRIDGE', 'POSTMATRIX_ADMISSION', 'PRIMARY_INPUT_INTEGRITY', 'AUTHORITY_TRUST_BOUNDARY', 'IN_RUN_ATTESTATION', 'FAIL_STOP_VALIDITY'];
  const centralFailing = central.filter((id) => record.verdicts[id] !== 'PASS');
  record.measurementReadiness = Object.freeze({
    verdict: centralFailing.length === 0 && record.verdicts.EXECUTION_CLOSURE === 'MATCH' && record.verdicts.HISTORICAL_EVIDENCE_IMMUTABILITY === 'PASS' ? 'READY_FOR_AUTHORIZATION' : 'BLOCKED',
    centralVerdicts: Object.freeze(central),
    centralFailing: Object.freeze(centralFailing),
    note: 'READY_FOR_AUTHORIZATION is a readiness claim about the deterministic machinery; it is NOT an authorization, and PAID_EXECUTION remains NOT_RUN',
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

export { NL };
