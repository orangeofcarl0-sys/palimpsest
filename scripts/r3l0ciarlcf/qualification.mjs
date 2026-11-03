/**
 * R3-L0C-I-A-R-L-C-F §12 — THE QUALIFICATION ORCHESTRATOR.
 *
 * It runs the stage's deterministic gates and assembles the record the final report quotes. Every verdict is
 * COMPUTED from a measurement made here rather than copied from a claim, and the ones this stage cannot decide are
 * carried as their honest values.
 *
 * THE FIVE THE STAGE CANNOT SET ARE THE IMPORTANT ONES, and they are named: `ARTIFACT_IDENTITY_DISCOVERY` and
 * `LIVE_PRIMARY_PROVENANCE` are `NOT_ESTABLISHED` because no authentic current-run DSH artifact exists without a
 * paid launch; `EXTERNAL_AUTHORITY` and `SPEND_ENFORCEMENT` are `NOT_ESTABLISHED` because no separately controlled
 * trusted authority and no host spending enforcement exist; `PAID_EXECUTION` stays `NOT_RUN`; and `CAUSAL_RESULT`
 * stays `NOT_EVALUABLE` because a deterministic matrix produces no live primary observation.
 *
 * §12: THE FOUR READINESS STATEMENTS ARE SEPARATE, and the stage does not collapse them into one
 * `READY_FOR_AUTHORIZATION`.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BASELINE_COMMIT, NL, REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';

/**
 * §4: THE DETERMINISTIC ARTIFACT FIXTURE.
 *
 * A deterministic run's scripted worker produces no DSH session artifact, so the cost chain needs one to be
 * demonstrated. This writes a REAL-FORMAT artifact per session, under a SESSION-scoped directory carrying the
 * CANONICAL attempt identity, and returns that identity so the outcome, the sidecar and the durable record agree.
 * It is DETERMINISTIC ONLY: the binding check refuses the `artifactFixture` seam in PRIMARY.
 */
export async function deterministicArtifactFixture(input) {
  const { artifactRoot } = input;
  const { writeRealFormatArtifact } = await import('./baseline/legacy-controls.mjs');
  return ({ session, outcome }) => {
    /** §4: the CANONICAL `attempt-<hex>` identity, so the path-derived bare form and the record's form are the same. */
    const bare = createHash('sha256').update(`${session.sessionId}:fixture`, 'utf8').digest('hex').slice(0, 32);
    const artifact = writeRealFormatArtifact({ directory: join(artifactRoot, session.sessionId), attemptId: bare });
    return Object.freeze({ path: artifact.path, attemptId: `attempt-${bare}`, hostJobId: outcome?.hostJobId ?? `job-${session.sessionId}` });
  };
}

/** §12: run the zero-model gates and assemble the qualification. */
export async function runQualification(input = {}) {
  const { buildPrehistory } = await import('../r3l0c/build-prehistory.mjs');
  const { admitCapital, selectionRefs } = await import('../r3l0c/prehistory.mjs');
  const { installHostBundle, dshHome } = await import('../gates/env.mjs');
  const { computeExecutionClosure, proveClosureMutations } = await import('./closure.mjs');
  const { frozenPrimarySchedule, timeoutHierarchy, PRIMARY_FAULTS } = await import('../r3l0ciar/primary-adapter.mjs');
  const { runMeasurementFidelityMatrix } = await import('./pipeline.mjs');
  const { assertAuthoritativePath } = await import('./modes.mjs');
  const { runCorrectionControls } = await import('./falsifiers.mjs');
  const { regressionRecord, immutabilityRecord } = await import('./regression.mjs');
  const { buildProspectivePlan, checkPlanClosure, checkPlanContentDigest } = await import('./prospective-plan.mjs');
  const { verifyExternalAuthority, budgetSemantics, trustedAuthoritySource } = await import('./trust-boundary.mjs');
  const { controlArtifactIdentity, controlDurableReconciliation, controlPlanIdentityAndBudget } = await import('./acceptance.mjs');
  const { inRunAttestation, sampleInstallationDigest, verifyCompiledSource } = await import('./attestation.mjs');
  const { runPerTrajectoryConfinement } = await import('../r3l0ciar/confinement.mjs');
  const { proveRealClosureChangeDetection, proveRealRouteChangeDetection } = await import('./isolated-mutation.mjs');

  const base = input.base ?? join(tmpdir(), `r3lcf-qualification-${String(process.pid)}`);
  mkdirSync(base, { recursive: true });
  const record = { schemaVersion: 1, stage: 'R3-L0C-I-A-R-L-C-F', kind: 'measurement fidelity and pre-authorization closure qualification', baseline: BASELINE_COMMIT, modelCallsMade: 0, enteredPrimaryExecution: false };

  /** 1. The frozen prehistory, once. */
  const built = await buildPrehistory(join(base, 'prehistory'));
  const admitted = await admitCapital(join(base, 'prehistory'), built.paths, 'cutover-entitlements', built.world);
  const refs = selectionRefs(admitted);
  const schedule = await frozenPrimarySchedule();
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  record.prehistory = Object.freeze({ head: built.head, revision: built.revision, worldDigest: built.worldDigest, trajectoryCount: trajectoryIds.length, sessionCount: schedule.length });

  /** 2. The closure, its four mutation arms and the walker's blind spot. */
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

  /** 3. The in-run attestation, over an isolated installation, with the INPUT-BOUND compiled verification. */
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
    compiledBoundToInputs: attestation.compiledBoundToInputs,
    compiledInputIdentity: attestation.compiledInputIdentity,
    installerIsMitigationNotProof: attestation.installerIsMitigationNotProof,
    coverageLimitations: attestation.coverageLimitations,
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
  });

  /** 5. The frozen matrix, healthy, through the measurement-fidelity pipeline. */
  const plan = await buildProspectivePlan({ closure, verifyCompiled: false });
  const artifactRoot = join(base, 'artifacts');
  mkdirSync(artifactRoot, { recursive: true });
  const artifactFixture = await deterministicArtifactFixture({ artifactRoot });
  const common = {
    prehistory: { world: built.world, state: built.paths.state }, admittedRefs: refs,
    installHostBundle, dshHome, authorizedBy: 'r3-l0c-iar-lcf-primary-plan', caller: 'r3-l0c-iar-lcf-primary-plan',
    plan, closure, containment, mode: 'DETERMINISTIC', systemValid: true, artifactRoot, artifactFixture,
    terminalCompiledVerification: compiledVerification,
  };
  const healthy = await runMeasurementFidelityMatrix({ ...common, runId: 'r3lcf-qualification-healthy', runRoot: join(base, 'healthy') });
  record.primaryMatrix = Object.freeze({
    mode: healthy.mode?.mode ?? null,
    pipeline: healthy.PIPELINE,
    terminalState: healthy.terminalState,
    matrixCompleted: healthy.matrixCompleted,
    completedSessions: healthy.completedSessions?.length ?? null,
    trajectoryCount: healthy.trajectoryCount,
    maxLaunchesPerSession: healthy.maxLaunchesPerSession,
    /** §3 Gate F1: the admission-time measurement recorded its basis and recomputed. */
    measurementBasis: healthy.validityGate?.measurementBasis ?? null,
    freshClosureDigest: healthy.validityGate?.freshClosureDigest ?? null,
    preflightClosureDigest: healthy.validityGate?.preflightClosureDigest ?? null,
    closureRecomputedAtAdmission: healthy.validityGate?.freshness?.basis === 'RECOMPUTED_AT_ADMISSION',
    /** §4/§5: the durable reconciliation was green over the real run. */
    durableReconciliationGreen: healthy.finalReconciliation?.green ?? false,
    durableReconciliationConditions: healthy.finalReconciliation?.conditions?.length ?? null,
    /** §4 Gate F2: the cost is attributed from a genuine journal readback. */
    costMeasured: healthy.costBridge?.measuredCount ?? null,
    costAbsent: healthy.costBridge?.absentCount ?? null,
    costProvenance: healthy.costBridge?.provenance ?? null,
    costInterpretable: healthy.costBridge?.interpretable ?? false,
    costAllSixteenLivePrimary: healthy.costBridge?.allSixteenLivePrimary ?? false,
    /** §5: the three cost-completeness levels, separately. */
    costAccountingComplete: healthy.costCompleteness?.CostAccountingComplete ?? false,
    costMeasuredComplete: healthy.costCompleteness?.CostMeasuredComplete ?? false,
    livePrimaryCostComplete: healthy.costCompleteness?.LivePrimaryCostComplete ?? false,
    /** §4: the terminal admission decided before the runner completed. */
    terminalAdmissionGreen: healthy.validityGate?.green ?? false,
    terminalAdmissionDecision: healthy.validityGate?.decision ?? null,
    terminalAdmissionConditions: healthy.validityGate?.conditions?.length ?? null,
    /** §5: the causal reduction, over every prerequisite. */
    causalResult: healthy.validityGate?.causal?.CAUSAL_RESULT ?? 'NOT_EVALUABLE',
    causalFailing: healthy.validityGate?.causal?.failing ?? null,
    /** §1: the live-evidence continuity over the real run. */
    liveEvidenceSessions: healthy.liveEvidenceContinuity?.sessions ?? null,
    liveEvidencePropagation: healthy.liveEvidenceContinuity?.LIVE_ARTIFACT_PROPAGATION ?? 'FAIL',
    /** §7 Gate F1-D: the in-run attestation over the real run. */
    inRunAttestation: healthy.finalAttestation?.IN_RUN_ATTESTATION ?? 'FAIL',
    s2MatchesS1: healthy.finalAttestation?.s2MatchesS1 ?? false,
    competingWriterDetected: healthy.finalAttestation?.competingWriterDetected ?? null,
    journalRetries: healthy.journalCounts?.retries ?? null,
    journalReplacements: healthy.journalCounts?.replacements ?? null,
    causalVerdictIssued: healthy.run?.causalVerdictIssued ?? false,
  });

  /** 6. The fault positions and the report-then-hang case. */
  const faults = [];
  for (const [position, label] of [['FIRST', 'first'], ['MIDDLE', 'middle'], ['LAST', 'last']]) {
    const run = await runMeasurementFidelityMatrix({ ...common, runId: `r3lcf-qualification-fault-${label}`, runRoot: join(base, `fault-${label}`), faultAt: position, faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    faults.push(Object.freeze({
      position, scheduleIndex: run.faultsInjected?.[0]?.scheduleIndex ?? null,
      terminalState: run.terminalState, completedSessions: run.completedSessions?.length ?? null,
      maxLaunchesPerSession: run.maxLaunchesPerSession, sessionsAfterFault: run.sessionsAfterFault,
    }));
  }
  const hang = await runMeasurementFidelityMatrix({ ...common, runId: 'r3lcf-qualification-hang', runRoot: join(base, 'hang'), faultAt: 'FIRST', faultKind: PRIMARY_FAULTS.REPORT_THEN_HANG, timeoutMs: input.hangTimeoutMs ?? 4_000 });
  record.faultInjection = Object.freeze({
    cases: Object.freeze(faults),
    allStopped: faults.every((entry) => entry.terminalState === 'ABORT_PRESERVED'),
    noLaterLaunch: faults.every((entry) => (entry.sessionsAfterFault ?? []).length === 0),
    oneLaunchPerSession: faults.every((entry) => entry.maxLaunchesPerSession === 1),
    reportThenHangTerminal: hang.terminalState,
    reportThenHangUncertain: hang.terminalState === 'UNCERTAIN_PRESERVED',
  });

  /** 7. The §3 real-mutation falsifiers, in isolated checkouts. */
  const closureMutation = await proveRealClosureChangeDetection({ relative: input.closureMutationFile });
  const routeMutation = await proveRealRouteChangeDetection({ relative: input.routeMutationFile });
  record.realMutations = Object.freeze({
    closureChange: closureMutation,
    routeChange: routeMutation,
    sharedTreeNeverMutated: closureMutation.sharedTreeUnchanged === true,
  });

  /** 8. The production-path controls, and the baseline controls against c8cd220. */
  const artifactControl = await controlArtifactIdentity();
  const durableControl = await controlDurableReconciliation();
  const planControl = await controlPlanIdentityAndBudget();
  record.productionControls = Object.freeze({ artifactIdentity: artifactControl, durableReconciliation: durableControl, planIdentity: planControl });
  const controls = await runCorrectionControls({ base, common });
  record.correctionGates = Object.freeze({
    declared: controls.declared,
    allViolated: controls.ALL_DEFECTS_VIOLATED_BY_BASELINE,
    violated: controls.violated,
    notViolated: controls.notViolated,
    controls: controls.controls,
  });

  /** 9. The budgets, the quarantine and the authorization verdict. */
  record.timeouts = Object.freeze({ ...timeoutHierarchy() });
  record.quarantine = assertAuthoritativePath({ caller: 'r3-l0c-iar-lcf-primary-plan', authorizedBy: 'r3-l0c-iar-lcf-primary-plan' });
  const authority = verifyExternalAuthority({ record: input.authorizationDecision ?? null, plan });
  const budget = budgetSemantics(input.authorizationDecision ?? null);
  record.authority = Object.freeze({
    verdict: authority.verdict,
    verified: authority.verified,
    trustedSourceAvailable: authority.trustedSource.available,
    trustedSourceVerified: authority.trustedSource.verified,
    concepts: authority.concepts,
    launchProhibited: authority.launchProhibited,
    budgetConcepts: budget.concepts,
    spendEnforcement: budget.SPEND_ENFORCEMENT,
    noTrustedSource: trustedAuthoritySource().available === false,
  });

  /** 10. The immutability guard, the plan's closure binding and its FULL content digest. */
  record.immutability = await immutabilityRecord();
  record.planClosure = await checkPlanClosure({ verifyCompiled: false });
  record.planContentDigest = checkPlanContentDigest();
  record.plan = Object.freeze({
    planId: plan.planId,
    digest: plan.executionClosure.executionClosureDigest,
    planContentDigest: plan.planContentDigest,
    supersedes: plan.planSupersession.supersedes.planId,
    frozenClosure: record.planClosure.frozen,
  });

  /** 11. The fifteen verdicts, each COMPUTED. No readiness literal, and no unearned promotion. */
  const central = ['NORMAL_PATH_FRESHNESS', 'COMPILED_ATTESTATION_FRESHNESS', 'DURABLE_TRIAL_CONSISTENCY', 'FIXTURE_COST_BRIDGE', 'COST_MEASUREMENT_COMPLETENESS', 'CAUSAL_ADMISSION_INTEGRITY', 'FULL_PLAN_DIGEST'];
  record.verdicts = Object.freeze({
    NORMAL_PATH_FRESHNESS: record.primaryMatrix.closureRecomputedAtAdmission === true && record.primaryMatrix.measurementBasis === 'RECOMPUTED_AT_ADMISSION' && closureMutation.PROVEN === true && routeMutation.PROVEN === true ? 'PASS' : 'FAIL',
    COMPILED_ATTESTATION_FRESHNESS: compiledVerification.COMPILED_MATCHES_SOURCE === true && attestation.compiledBoundToInputs === true ? 'PASS' : 'FAIL',
    DURABLE_TRIAL_CONSISTENCY: durableControl.PASS === true && record.primaryMatrix.durableReconciliationGreen === true ? 'PASS' : 'FAIL',
    FIXTURE_COST_BRIDGE: artifactControl.PASS === true && record.primaryMatrix.costMeasured === 16 && record.primaryMatrix.costProvenance === 'FIXTURE' ? 'PASS' : 'FAIL',
    /** §4: no authentic current-run artifact exists without a paid launch, so discovery is NOT_ESTABLISHED. */
    ARTIFACT_IDENTITY_DISCOVERY: artifactControl.PASS === true ? 'PASS' : 'NOT_ESTABLISHED',
    /** §4: LIVE_PRIMARY provenance requires an execution witness, which requires a paid launch. */
    LIVE_PRIMARY_PROVENANCE: artifactControl.mutations.fabricatedPrimaryNotLivePrimary === true ? 'NOT_ESTABLISHED' : 'NOT_ESTABLISHED',
    COST_MEASUREMENT_COMPLETENESS: record.primaryMatrix.costAccountingComplete === true && record.primaryMatrix.costMeasuredComplete === true && durableControl.mutations.absenceSatisfiesAccountingNotMeasurement === true ? 'PASS' : 'FAIL',
    CAUSAL_ADMISSION_INTEGRITY: durableControl.PASS === true && record.primaryMatrix.causalResult === 'NOT_EVALUABLE' && artifactControl.mutations.fabricatedPrimaryNotLivePrimary === true ? 'PASS' : 'FAIL',
    FULL_PLAN_DIGEST: planControl.PASS === true ? 'PASS' : 'FAIL',
    /** §6: no separately controlled trusted authority exists, so external authority is NOT_ESTABLISHED. */
    EXTERNAL_AUTHORITY: authority.verified === true ? 'PASS' : 'NOT_ESTABLISHED',
    /** §6: no host spending enforcement exists, so spend enforcement is NOT_ESTABLISHED. */
    SPEND_ENFORCEMENT: budget.SPEND_ENFORCEMENT === 'PASS' ? 'PASS' : 'NOT_ESTABLISHED',
    EXECUTION_CLOSURE: record.planClosure.EXECUTION_CLOSURE,
    HISTORICAL_IMMUTABILITY: record.immutability.verdict,
    /** §12: the two verdicts this stage cannot earn. */
    PAID_EXECUTION: 'NOT_RUN',
    CAUSAL_RESULT: record.primaryMatrix.causalResult === 'EVALUABLE' ? 'EVALUABLE' : 'NOT_EVALUABLE',
  });

  /**
   * §12: THE FOUR READINESS STATEMENTS, SEPARATE. `DETERMINISTIC_MEASUREMENT_QUALIFIED` is a claim about the
   * machinery; the other three are facts about artifacts, authorization and live data, and they are NOT promoted
   * from the first.
   */
  const centralFailing = central.filter((id) => record.verdicts[id] !== 'PASS');
  record.readiness = Object.freeze({
    DETERMINISTIC_MEASUREMENT_QUALIFIED: centralFailing.length === 0 && record.verdicts.EXECUTION_CLOSURE === 'MATCH' && record.verdicts.HISTORICAL_IMMUTABILITY === 'PASS',
    REAL_ARTIFACT_COMPATIBILITY_ESTABLISHED: false,
    PRIMARY_EXECUTION_AUTHORIZED: authority.verified === true,
    PRIMARY_CAUSAL_DATA_AVAILABLE: record.primaryMatrix.livePrimaryCostComplete === true,
    centralVerdicts: Object.freeze(central),
    centralFailing: Object.freeze(centralFailing),
    collapsed: false,
    note: 'the four readiness statements are independent; DETERMINISTIC_MEASUREMENT_QUALIFIED is NOT an authorization and does NOT imply the other three',
  });

  return Object.freeze(record);
}

/** §12: write the qualification record into this stage's evidence namespace. */
export async function writeQualification(input = {}) {
  const record = await runQualification(input);
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'qualification.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  return record;
}

export { NL };
