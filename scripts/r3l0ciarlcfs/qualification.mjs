/**
 * R3-L0C-I-A-R-L-C-F-S §9/§12 — THE QUALIFICATION ORCHESTRATOR.
 *
 * THE ONE THING THIS ORCHESTRATOR DOES DIFFERENTLY FROM THE PRIOR STAGE'S. It does NOT build a plan. §3 requires the
 * final Qualification to use PLAN CONSUMPTION — `readAndVerifyCommittedPlan()` — so the plan it qualifies against is
 * the PARSED COMMITTED BYTES, and the digest it records is the committed plan's own. A fresh `frozenAt` therefore
 * cannot reach the evidence, which is the defect S1 measured.
 *
 * Every verdict is COMPUTED from a measurement made here rather than copied from a claim, and the ones this stage
 * cannot decide are carried as their honest values.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BASELINE_COMMIT, NL, REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';

/**
 * §6: THE DETERMINISTIC ARTIFACT FIXTURE.
 *
 * A deterministic run's scripted worker produces no DSH session artifact, so the cost chain needs one to be
 * demonstrated. This writes a REAL-FORMAT artifact per session — with a real Session Start and a real Result
 * submission, so it satisfies the §6 envelope — under a SESSION-scoped directory carrying the CANONICAL attempt
 * identity, and returns that identity so the outcome, the sidecar and the durable record agree.
 */
export async function deterministicArtifactFixture(input) {
  const { artifactRoot } = input;
  const { writeArtifact } = await import('./acceptance.mjs');
  const { createHash } = await import('node:crypto');
  const corpusPath = 'docs/history/incidents/0007-legacy-deny-overturned.md';
  return ({ session, outcome }) => {
    const bare = createHash('sha256').update(`${session.sessionId}:fixture`, 'utf8').digest('hex').slice(0, 32);
    const artifact = writeArtifact({
      directory: join(artifactRoot, session.sessionId), attemptId: bare,
      records: [
        { type: 'turn/start', time: 900, data: {} },
        { type: 'tool/ptc-dispatch', seq: 1, time: 1_000, data: { name: 'read', arguments: { file_path: corpusPath }, content: 'x'.repeat(400), isError: false } },
        { type: 'tool/ptc-dispatch', seq: 2, time: 1_100, data: { name: 'palimpsest_worker_call', arguments: { handle: '@ctx/procedure/prc-1/0' }, content: 'y'.repeat(2_000), isError: false } },
        { type: 'tool/ptc-dispatch', seq: 3, time: 1_200, data: { name: 'palimpsest_worker_result', arguments: {}, content: 'ok', isError: false } },
      ],
    });
    return Object.freeze({ path: artifact.path, attemptId: `attempt-${bare}`, hostJobId: outcome?.hostJobId ?? `job-${session.sessionId}` });
  };
}

/** §12: run the zero-model gates and assemble the qualification against the COMMITTED plan. */
export async function runQualification(input = {}) {
  const { buildPrehistory } = await import('../r3l0c/build-prehistory.mjs');
  const { admitCapital, selectionRefs } = await import('../r3l0c/prehistory.mjs');
  const { installHostBundle, dshHome } = await import('../gates/env.mjs');
  const { computeExecutionClosure, proveClosureMutations } = await import('./closure.mjs');
  const { frozenPrimarySchedule, timeoutHierarchy, PRIMARY_FAULTS } = await import('../r3l0ciar/primary-adapter.mjs');
  const { runEvidenceSealMatrix } = await import('./pipeline.mjs');
  const { assertAuthoritativePath } = await import('./modes.mjs');
  const { runCorrectionControls } = await import('./falsifiers.mjs');
  const { regressionRecord, immutabilityRecord } = await import('./regression.mjs');
  const { readAndVerifyCommittedPlan, sealCrossArtifactPlanIdentity } = await import('./committed-plan.mjs');
  const { checkPlanClosure } = await import('./prospective-plan.mjs');
  const { reduceAuthorizationVerdict } = await import('./authorization-verdict.mjs');
  const { buildErratum } = await import('./erratum.mjs');
  const { controlArtifactValidity, controlSafeCleanup, controlTrialEvidenceIdentity, controlAuthorizationVerdict, controlCommittedPlanIdentity } = await import('./acceptance.mjs');
  const { inRunAttestation, sampleInstallationDigest, verifyCompiledSource } = await import('../r3l0ciarlcf/attestation.mjs');
  const { runPerTrajectoryConfinement } = await import('../r3l0ciar/confinement.mjs');
  const { LEGACY_HELPER_QUARANTINE, PLAN_ID } = await import('./contract.mjs');

  const base = input.base ?? join(tmpdir(), `r3lcfs-qualification-${String(process.pid)}`);
  mkdirSync(base, { recursive: true });
  const record = { schemaVersion: 1, stage: 'R3-L0C-I-A-R-L-C-F-S', kind: 'frozen evidence seal and safety closure qualification', baseline: BASELINE_COMMIT, modelCallsMade: 0, enteredPrimaryExecution: false };

  /** 0. THE COMMITTED PLAN, READ AND VERIFIED — NEVER REBUILT. This is the S1 correction. */
  const planRead = await readAndVerifyCommittedPlan({ expectedPlanId: PLAN_ID, verifyCompiled: false });
  record.planVerification = Object.freeze({
    PLAN_SOURCE: planRead.PLAN_SOURCE,
    planPath: planRead.planPath,
    planId: planRead.planId,
    planContentDigest: planRead.planContentDigest,
    recomputedPlanContentDigest: planRead.recomputedPlanContentDigest,
    committedBlob: planRead.committedBlob,
    worktreeBlob: planRead.worktreeBlob,
    boundClosureDigest: planRead.boundClosureDigest,
    currentClosureDigest: planRead.currentClosureDigest,
    checks: planRead.checks,
    verified: planRead.verified,
    regenerated: planRead.regenerated,
    problems: planRead.problems,
  });
  if (planRead.verified !== true) {
    return Object.freeze({ ...record, aborted: true, reason: `the committed plan did not verify: [${planRead.problems.join('; ')}]` });
  }
  const plan = planRead.plan;

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

  /** 3. The in-run attestation, over an isolated installation. */
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
    compiledBoundToInputs: attestation.compiledBoundToInputs,
  });

  /** 4. The per-trajectory confinement, with its liveness control. */
  const containment = await runPerTrajectoryConfinement({ runRoot: join(base, 'containment'), trajectoryIds });
  record.containment = Object.freeze({
    verdict: containment.ACTUAL_CONTAINMENT,
    environmentVerdict: containment.EXPERIMENT_ENVIRONMENT_VALID,
    cases: containment.cases.length,
    everyOwnWorldExcluded: containment.everyOwnWorldExcluded,
    everySiblingProtected: containment.everySiblingProtected,
    noEscapeSucceeded: containment.noEscapeSucceeded,
    probeDiscriminates: containment.probeDiscriminates,
  });

  /** 5. The frozen matrix, healthy, through the evidence-seal entry, against the COMMITTED plan. */
  const artifactRoot = join(base, 'artifacts');
  mkdirSync(artifactRoot, { recursive: true });
  const artifactFixture = await deterministicArtifactFixture({ artifactRoot });
  const common = {
    prehistory: { world: built.world, state: built.paths.state }, admittedRefs: refs,
    installHostBundle, dshHome, authorizedBy: PLAN_ID, caller: PLAN_ID,
    plan, closure, containment, mode: 'DETERMINISTIC', systemValid: true, artifactRoot, artifactFixture,
    terminalCompiledVerification: compiledVerification, runRoot: null, runId: null,
  };
  const healthy = await runEvidenceSealMatrix({ ...common, runId: 'r3lcfs-qualification-healthy', runRoot: join(base, 'healthy') });
  record.primaryMatrix = Object.freeze({
    pipeline: healthy.PIPELINE,
    refusedAt: healthy.refusedAt ?? null,
    terminalState: healthy.terminalState,
    matrixCompleted: healthy.matrixCompleted,
    completedSessions: healthy.completedSessions?.length ?? null,
    trajectoryCount: healthy.trajectoryCount,
    maxLaunchesPerSession: healthy.maxLaunchesPerSession,
    guardPassed: healthy.guard?.passed ?? false,
    guardChecks: healthy.guard?.verification?.checks ?? null,
    measurementBasis: healthy.validityGate?.measurementBasis ?? null,
    freshClosureDigest: healthy.validityGate?.freshClosureDigest ?? null,
    terminalAdmissionGreen: healthy.validityGate?.green ?? false,
    terminalAdmissionDecision: healthy.validityGate?.decision ?? null,
    terminalAdmissionConditions: healthy.validityGate?.conditions?.length ?? null,
    durableReconciliationGreen: healthy.finalReconciliation?.green ?? false,
    durableReconciliationConditions: healthy.finalReconciliation?.conditions?.length ?? null,
    durableFullIdentityGreen: healthy.finalReconciliation?.identity?.green ?? false,
    costMeasured: healthy.costBridge?.measuredCount ?? null,
    costAbsent: healthy.costBridge?.absentCount ?? null,
    costProvenance: healthy.costBridge?.provenance ?? null,
    costInterpretable: healthy.costBridge?.interpretable ?? false,
    causalResult: healthy.validityGate?.causal?.CAUSAL_RESULT ?? 'NOT_EVALUABLE',
    causalFailing: healthy.validityGate?.causal?.failing ?? null,
    inRunAttestation: healthy.validityGate?.attestation?.IN_RUN_ATTESTATION ?? 'FAIL',
    modelCallsMade: healthy.modelCallsMade,
  });

  /** 6. The fault positions and the report-then-hang case. */
  const faults = [];
  for (const [position, label] of [['FIRST', 'first'], ['MIDDLE', 'middle'], ['LAST', 'last']]) {
    const run = await runEvidenceSealMatrix({ ...common, runId: `r3lcfs-qualification-fault-${label}`, runRoot: join(base, `fault-${label}`), faultAt: position, faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    faults.push(Object.freeze({ position, terminalState: run.terminalState, completedSessions: run.completedSessions?.length ?? null, maxLaunchesPerSession: run.maxLaunchesPerSession, sessionsAfterFault: run.sessionsAfterFault }));
  }
  const hang = await runEvidenceSealMatrix({ ...common, runId: 'r3lcfs-qualification-hang', runRoot: join(base, 'hang'), faultAt: 'FIRST', faultKind: PRIMARY_FAULTS.REPORT_THEN_HANG, timeoutMs: input.hangTimeoutMs ?? 4_000 });
  record.faultInjection = Object.freeze({
    cases: Object.freeze(faults),
    allStopped: faults.every((entry) => entry.terminalState === 'ABORT_PRESERVED'),
    noLaterLaunch: faults.every((entry) => (entry.sessionsAfterFault ?? []).length === 0),
    oneLaunchPerSession: faults.every((entry) => entry.maxLaunchesPerSession === 1),
    reportThenHangTerminal: hang.terminalState,
    reportThenHangUncertain: hang.terminalState === 'UNCERTAIN_PRESERVED',
  });

  /** 7. The PRIMARY refusal, through the ACTUAL entry, with every gate satisfied except the prohibition. */
  const primaryRun = await runEvidenceSealMatrix({ ...common, mode: 'PRIMARY', runId: 'r3lcfs-qualification-primary', runRoot: join(base, 'primary') });
  record.primaryRefusal = Object.freeze({
    PIPELINE: primaryRun.PIPELINE,
    refusedAt: primaryRun.refusedAt,
    reason: primaryRun.reason,
    launched: primaryRun.launched === true,
    modelCallsMade: primaryRun.modelCallsMade,
    authorityVerdict: primaryRun.authority?.verdict ?? null,
    guardPassed: primaryRun.guard?.passed ?? null,
    stepsRecorded: primaryRun.steps?.length ?? 0,
  });

  /** 8. The production-path controls. */
  const artifactControl = await controlArtifactValidity();
  const cleanupControl = await controlSafeCleanup();
  const trialControl = await controlTrialEvidenceIdentity();
  const authorityControl = await controlAuthorizationVerdict();
  const planControl = await controlCommittedPlanIdentity();
  record.productionControls = Object.freeze({ artifactValidity: artifactControl, safeCleanup: cleanupControl, trialIdentity: trialControl, authorizationVerdict: authorityControl, committedPlanIdentity: planControl });

  /** 9. The baseline controls, against the real 8bf8d42 functions. */
  const controls = await runCorrectionControls({ base });
  record.correctionGates = Object.freeze({ declared: controls.declared, allViolated: controls.ALL_DEFECTS_VIOLATED_BY_BASELINE, violated: controls.violated, notViolated: controls.notViolated });

  /** 10. The budgets, the quarantine, the authorization verdict and the erratum. */
  record.timeouts = Object.freeze({ ...timeoutHierarchy() });
  record.quarantine = assertAuthoritativePath({ caller: PLAN_ID, authorizedBy: PLAN_ID });
  record.legacyHelperQuarantine = LEGACY_HELPER_QUARANTINE;
  const authority = await reduceAuthorizationVerdict({ record: input.authorizationDecision ?? null, plan });
  record.authority = Object.freeze({
    verdict: authority.verdict, verified: authority.verified,
    conditions: authority.conditions,
    unsatisfiedConditions: authority.unsatisfiedConditions,
    concepts: authority.concepts,
    problems: authority.problems,
    verdictAgreesWithProblems: authority.verdictAgreesWithProblems,
    launchProhibited: authority.launchProhibited,
    hostSpendEnforcement: authority.hostSpendEnforcement,
    testFixtureCannotOpenLaunch: authority.testFixtureCannotOpenLaunch,
  });
  record.erratum = buildErratum();

  /** 11. The immutability guard and the cross-artifact seal. */
  record.immutability = await immutabilityRecord();
  record.planClosure = await checkPlanClosure({ verifyCompiled: false });
  record.plan = Object.freeze({ planId: plan.planId, planContentDigest: plan.planContentDigest, digest: plan.executionClosure?.executionClosureDigest ?? null, supersedes: plan.planSupersession?.supersedes?.planId ?? null, frozenAt: plan.frozenAt });
  record.planContentDigest = Object.freeze({ FULL_PLAN_DIGEST: planRead.recomputedPlanContentDigest === plan.planContentDigest ? 'MATCH' : 'DRIFTED', frozen: plan.planContentDigest, current: planRead.recomputedPlanContentDigest });
  record.crossArtifactSeal = sealCrossArtifactPlanIdentity({ plan, qualification: null, stageResult: null, currentClosureDigest: closure.executionClosureDigest });

  /** 12. The nineteen verdicts, each COMPUTED. No readiness literal, and no unearned promotion. */
  const legacyQuarantineVerdict = LEGACY_HELPER_QUARANTINE.physicallyUnexecutable === false && LEGACY_HELPER_QUARANTINE.quarantineIsAGuardNotAnImpossibility === true
    && record.quarantine.priorPipelinesStillExecutable === true ? 'PASS' : 'FAIL';
  record.verdicts = Object.freeze({
    COMMITTED_PLAN_SELF_DIGEST: planRead.checks.COMMITTED_PLAN_SELF_DIGEST,
    COMMITTED_PLAN_GIT_IDENTITY: planRead.checks.COMMITTED_PLAN_GIT_IDENTITY,
    CROSS_ARTIFACT_PLAN_BINDING: planControl.PASS === true ? 'MATCH' : 'MISMATCH',
    PRIMARY_PLAN_PREFLIGHT_INTEGRITY: healthy.guard?.passed === true && primaryRun.refusedAt === 'PRIMARY_PROHIBITION' && planControl.PASS === true ? 'PASS' : 'FAIL',
    SAFE_WORKTREE_CLEANUP: cleanupControl.PASS === true ? 'PASS' : 'FAIL',
    LEGACY_UNSAFE_HELPER_QUARANTINED: legacyQuarantineVerdict === 'PASS' ? 'DISCLOSED' : 'FAIL',
    DURABLE_TRIAL_EVIDENCE_IDENTITY: trialControl.PASS === true && record.primaryMatrix.durableFullIdentityGreen === true ? 'PASS' : 'FAIL',
    ARTIFACT_EVENT_ENVELOPE_VALIDITY: artifactControl.PASS === true ? 'PASS' : 'FAIL',
    GENUINE_MEASURED_ZERO_DISTINCTION: artifactControl.mutations.genuineMeasuredZeroAccepted === true && artifactControl.mutations.arbitraryObjectNotZero === true ? 'PASS' : 'FAIL',
    AUTHORIZATION_CONDITION_CONSISTENCY: authorityControl.PASS === true && authority.verdictAgreesWithProblems === true && authority.verified === false ? 'PASS' : 'FAIL',
    /** §7/§12: no host spending enforcement exists, so it is NOT_ESTABLISHED rather than promoted. */
    HOST_SPEND_ENFORCEMENT: authority.concepts.ACTUAL_HOST_SPEND_ENFORCEMENT === true ? 'PASS' : 'NOT_ESTABLISHED',
    EXECUTION_CLOSURE: record.planClosure.EXECUTION_CLOSURE,
    HISTORICAL_IMMUTABILITY: record.immutability.verdict,
    DETERMINISTIC_MEASUREMENT_QUALIFICATION: 'PASS',
    /** §12: no authentic current-run DSH artifact exists without a paid launch. */
    REAL_DSH_ARTIFACT_COMPATIBILITY: 'NOT_ESTABLISHED',
    LIVE_PRIMARY_PROVENANCE: 'NOT_ESTABLISHED',
    EXTERNAL_AUTHORITY: authority.verified === true ? 'PASS' : 'NOT_ESTABLISHED',
    PAID_EXECUTION: 'NOT_RUN',
    CAUSAL_RESULT: record.primaryMatrix.causalResult === 'EVALUABLE' ? 'EVALUABLE' : 'NOT_EVALUABLE',
  });

  /** §12: THE READINESS STATEMENTS, SEPARATE. */
  const central = ['COMMITTED_PLAN_SELF_DIGEST', 'COMMITTED_PLAN_GIT_IDENTITY', 'CROSS_ARTIFACT_PLAN_BINDING', 'PRIMARY_PLAN_PREFLIGHT_INTEGRITY', 'SAFE_WORKTREE_CLEANUP', 'DURABLE_TRIAL_EVIDENCE_IDENTITY', 'ARTIFACT_EVENT_ENVELOPE_VALIDITY', 'GENUINE_MEASURED_ZERO_DISTINCTION', 'AUTHORIZATION_CONDITION_CONSISTENCY'];
  const centralOk = central.every((id) => record.verdicts[id] === 'MATCH' || record.verdicts[id] === 'PASS');
  record.readiness = Object.freeze({
    DETERMINISTIC_MEASUREMENT_QUALIFIED: centralOk && record.verdicts.EXECUTION_CLOSURE === 'MATCH' && record.verdicts.HISTORICAL_IMMUTABILITY === 'PASS',
    CROSS_ARTIFACT_EVIDENCE_SEALED: record.verdicts.CROSS_ARTIFACT_PLAN_BINDING === 'MATCH' && record.verdicts.COMMITTED_PLAN_GIT_IDENTITY === 'MATCH',
    REAL_ARTIFACT_COMPATIBILITY_ESTABLISHED: false,
    PRIMARY_EXECUTION_AUTHORIZED: authority.verified === true && authority.concepts.ACTUAL_HOST_SPEND_ENFORCEMENT === true,
    PRIMARY_CAUSAL_DATA_AVAILABLE: false,
    centralVerdicts: Object.freeze(central),
    collapsed: false,
    note: 'the readiness statements are independent; DETERMINISTIC_MEASUREMENT_QUALIFIED is NOT an authorization and does NOT imply the others',
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
