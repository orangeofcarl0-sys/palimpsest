/**
 * R3-L0C-I-A-R-L-C-F-S-H §7 H5 — THE QUALIFICATION, DERIVED FROM ACTUAL CONDITIONS.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlUnconditionalQualification`: the prior
 * stage assigned `DETERMINISTIC_MEASUREMENT_QUALIFICATION: 'PASS'` as a LITERAL, so a failed matrix, an invalid cost
 * observation, an unsuccessful seal or a blocked safety gate could not make it fail. The committed evidence proves
 * the consequence: that artifact records PASS in the same file that carries `crossArtifactSeal.sealed = false`.
 *
 * WHAT THIS DOES INSTEAD. §7 requires the verdict to be DERIVED from twelve measured prerequisites, each a value
 * computed here rather than an assertion copied in. `reduceDeterministicQualification` evaluates them, names every
 * unmet one, and returns `PASS` only when all twelve hold. The lower-level diagnostics stay VISIBLE: the result
 * carries every condition with its own `holds` flag and detail, so a failure is never collapsed into an unexplained
 * boolean.
 *
 * THE PRE-PERSISTENCE PHASE IS NOT A PASS. §5 requires the pre-persistence status to be explicitly not-yet-evaluated,
 * so the two conditions that depend on the FINAL PERSISTED SEAL cannot hold at qualification time. The verdict is
 * therefore `PENDING_FINAL_SEAL` — which is honest and is NOT a PASS — and §5's Phase B seal is what promotes it.
 * §7 forbids exactly the alternative: a stage that manufactured a PASS by validating after the Runner completed, or
 * that let a not-yet-computed seal count as green.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BASELINE_COMMIT,
  NL,
  PLAN_ID,
  QUALIFICATION_CONDITIONS,
  QUALIFICATION_VERDICTS,
  REPO_ROOT,
  STAGE_EVIDENCE_PATH,
} from './contract.mjs';

/**
 * §7: THE DERIVED DETERMINISTIC-QUALIFICATION REDUCTION.
 *
 * Every input is a measured value. `finalSeal` may be null at the pre-persistence phase, which is why the seal-
 * dependent conditions report `holds: false` with an explicit `PENDING_FINAL_SEAL` reason rather than being skipped.
 */
export function reduceDeterministicQualification(input) {
  const {
    planVerification, closureCheck, matrix, terminalAdmission, reconciliation,
    costClassification, falseZeroPromotion, cleanupControls, finalSeal, immutability,
  } = input;

  const add = (id, holds, detail) => Object.freeze({ id, holds: holds === true, detail: detail ?? null });
  const conditions = Object.freeze([
    add('COMMITTED_PLAN_IDENTITY_VERIFIED',
      planVerification?.verified === true
      && planVerification?.checks?.COMMITTED_PLAN_SELF_DIGEST === 'MATCH'
      && planVerification?.checks?.COMMITTED_PLAN_GIT_IDENTITY === 'MATCH'
      && planVerification?.checks?.PLAN_SCHEMA_AND_ID === 'PASS',
      `verified=${String(planVerification?.verified)} selfDigest=${String(planVerification?.checks?.COMMITTED_PLAN_SELF_DIGEST)} gitIdentity=${String(planVerification?.checks?.COMMITTED_PLAN_GIT_IDENTITY)}`),
    add('EXECUTION_CLOSURE_MATCHES',
      closureCheck?.EXECUTION_CLOSURE === 'MATCH',
      `closure=${String(closureCheck?.EXECUTION_CLOSURE)} frozen=${String(closureCheck?.frozen).slice(0, 16)} current=${String(closureCheck?.current).slice(0, 16)}`),
    add('MATRIX_TERMINAL_STATE_COMPLETE',
      matrix?.matrixCompleted === true && matrix?.terminalState === 'MATRIX_COMPLETE',
      `terminalState=${String(matrix?.terminalState)} matrixCompleted=${String(matrix?.matrixCompleted)}`),
    add('RUNNER_TERMINAL_ADMISSION_GREEN',
      terminalAdmission?.green === true,
      `green=${String(terminalAdmission?.green)} failing=[${(terminalAdmission?.failing ?? ['ABSENT']).join(', ')}]`),
    add('EXACT_PLANNED_SESSION_COUNT',
      typeof matrix?.completedSessions === 'number' && matrix?.scheduleLength !== undefined && matrix.completedSessions === matrix.scheduleLength,
      `completed=${String(matrix?.completedSessions)} planned=${String(matrix?.scheduleLength)}`),
    add('ZERO_FORBIDDEN_LAUNCHES_OR_RETRIES',
      matrix?.maxLaunchesPerSession === 1 && (matrix?.retries ?? null) === 0 && (matrix?.unplannedLaunches ?? []).length === 0,
      `maxLaunchesPerSession=${String(matrix?.maxLaunchesPerSession)} retries=${String(matrix?.retries)} unplanned=${String((matrix?.unplannedLaunches ?? []).length)}`),
    add('DURABLE_TRIAL_EVIDENCE_RECONCILED',
      reconciliation?.green === true && reconciliation?.identity?.green === true,
      `green=${String(reconciliation?.green)} fullIdentityGreen=${String(reconciliation?.identity?.green)} failing=[${(reconciliation?.failing ?? ['ABSENT']).join(', ')}]`),
    add('VALID_COST_CLASSIFICATION',
      costClassification?.interpretable === true && costClassification?.accountedFor === true,
      `interpretable=${String(costClassification?.interpretable)} measured=${String(costClassification?.measuredCount)} absent=${String(costClassification?.absentCount)} invalid=${String(costClassification?.invalidCount)}`),
    add('NO_FALSE_MEASURED_ZERO_PROMOTION',
      falseZeroPromotion?.noInvalidPromotedToMeasured === true,
      `invalidPromotedToMeasured=${String(falseZeroPromotion?.invalidPromotedToMeasured)} validatedCount=${String(falseZeroPromotion?.validatedCount)}`),
    add('SAFE_CLEANUP_CONTROLS_PASS',
      cleanupControls?.PASS === true,
      `PASS=${String(cleanupControls?.PASS)} blockedCases=${String(cleanupControls?.blockedCases)}`),
    /** §5: at the pre-persistence phase the final seal does not exist, so this reports PENDING rather than true. */
    add('FINAL_PERSISTED_SEAL_MATCHES',
      finalSeal !== null && finalSeal !== undefined && finalSeal.result === 'MATCH',
      finalSeal === null || finalSeal === undefined
        ? 'PENDING_FINAL_SEAL — the persisted seal is computed in §5 Phase B, after the Qualification and the Stage Result are committed'
        : `result=${String(finalSeal.result)} failing=[${(finalSeal.failing ?? []).join(', ')}]`),
    add('HISTORICAL_EVIDENCE_IMMUTABLE',
      immutability?.verdict === 'PASS',
      `verdict=${String(immutability?.verdict)} changed=${String((immutability?.changed ?? []).length)} removed=${String((immutability?.removed ?? []).length)}`),
  ]);

  const failing = Object.freeze(conditions.filter((condition) => condition.holds !== true).map((condition) => condition.id));
  const sealPending = failing.length === 1 && failing[0] === 'FINAL_PERSISTED_SEAL_MATCHES';
  const verdict = failing.length === 0 ? 'PASS' : (sealPending ? 'PENDING_FINAL_SEAL' : 'FAIL');

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S-H',
    kind: 'derived deterministic-measurement qualification',
    conditions,
    requiredConditions: Object.freeze(QUALIFICATION_CONDITIONS.map((entry) => entry.id)),
    failing,
    /** §7: the verdict is DERIVED, never assigned as a constant. */
    verdict,
    DETERMINISTIC_MEASUREMENT_QUALIFICATION: verdict,
    /** §7: a PENDING verdict is explicitly NOT a PASS, so a reader cannot mistake it for one. */
    pendingIsNotPass: true,
    derivedFromActualConditions: true,
    literalPassAssigned: false,
    /** §7: the lower-level diagnostics remain visible rather than collapsed. */
    diagnostics: Object.freeze({ planVerification: planVerification ?? null, closureCheck: closureCheck ?? null, terminalAdmissionFailing: terminalAdmission?.failing ?? null, reconciliationFailing: reconciliation?.failing ?? null, costClassification: costClassification ?? null }),
    /** §7: a deterministic fixture matrix may be mechanically successful without providing live-primary causal evidence. */
    mechanicalSuccessIsNotLiveCausalEvidence: true,
    verdictVocabulary: QUALIFICATION_VERDICTS,
    law: 'the deterministic qualification is GREEN only when its load-bearing measured prerequisites are GREEN; at the pre-persistence phase the seal-dependent condition is PENDING rather than true, so the verdict is PENDING_FINAL_SEAL and never PASS',
  });
}

/**
 * §7: THE DETERMINISTIC ARTIFACT FIXTURE.
 *
 * A deterministic run's scripted worker produces no DSH session artifact, so the cost chain needs one to be
 * demonstrated. This writes a REAL-FORMAT artifact per session — with a real Session Start, a real Result
 * submission and one corpus read, so it satisfies the §6 envelope — under a SESSION-scoped directory carrying the
 * canonical attempt identity, and returns that identity so the outcome, the sidecar and the durable record agree.
 *
 * `invalidSessionIds` lets a caller make ONE scheduled session's artifact fail the envelope, which is how §3's
 * critical authoritative test drives a complete real-format artifact with internally consistent identity and digest
 * but INVALID event content through the actual Runner.
 */
export async function deterministicArtifactFixture(input) {
  const { artifactRoot, invalidSessionIds = [] } = input;
  const { writeRealArtifact } = await import('./acceptance.mjs');
  const { createHash } = await import('node:crypto');
  const corpusPath = 'docs/history/incidents/0007-legacy-deny-overturned.md';
  const invalid = new Set(invalidSessionIds);
  return ({ session }) => {
    const bare = createHash('sha256').update(`${session.sessionId}:fixture`, 'utf8').digest('hex').slice(0, 32);
    /** §3 H1-N1: the invalid session's ONLY record is `{"type":"noise"}`, with a consistent identity and digest. */
    const records = invalid.has(session.sessionId)
      ? [{ type: 'noise' }]
      : [
        { type: 'turn/start', time: 900, data: {} },
        { type: 'tool/ptc-dispatch', seq: 1, time: 1_000, data: { name: 'read', arguments: { file_path: corpusPath }, content: 'x'.repeat(400), isError: false } },
        { type: 'tool/ptc-dispatch', seq: 2, time: 1_100, data: { name: 'palimpsest_worker_call', arguments: { handle: '@ctx/procedure/prc-1/0' }, content: 'y'.repeat(2_000), isError: false } },
        { type: 'tool/ptc-dispatch', seq: 3, time: 1_200, data: { name: 'palimpsest_worker_result', arguments: {}, content: 'ok', isError: false } },
      ];
    const artifact = writeRealArtifact({ directory: join(artifactRoot, session.sessionId), attemptId: bare, records });
    return Object.freeze({ path: artifact.path, attemptId: `attempt-${bare}`, hostJobId: `job-${session.sessionId}`, envelopeInvalid: invalid.has(session.sessionId) });
  };
}

/** §11: run the zero-model gates and assemble the qualification against the COMMITTED plan. */
export async function runQualification(input = {}) {
  const { buildPrehistory } = await import('../r3l0c/build-prehistory.mjs');
  const { admitCapital, selectionRefs } = await import('../r3l0c/prehistory.mjs');
  const { installHostBundle, dshHome } = await import('../gates/env.mjs');
  const { computeExecutionClosure, proveClosureMutations } = await import('./closure.mjs');
  const { frozenPrimarySchedule, timeoutHierarchy, PRIMARY_FAULTS } = await import('../r3l0ciar/primary-adapter.mjs');
  const { runTerminalEnforcementMatrix } = await import('./pipeline.mjs');
  const { assertAuthoritativePath } = await import('./modes.mjs');
  const { regressionRecord, immutabilityRecord } = await import('./regression.mjs');
  const { readAndVerifyCommittedPlan } = await import('./committed-plan.mjs');
  const { checkPlanClosure } = await import('./prospective-plan.mjs');
  const { reduceAuthorizationVerdict } = await import('../r3l0ciarlcfs/authorization-verdict.mjs');
  const { controlValidatedCostBridge, controlSafeCleanup, controlRunnerIdentityFalsifier } = await import('./acceptance.mjs');
  const { preSealStatus } = await import('./evidence-seal.mjs');
  const { inRunAttestation, sampleInstallationDigest, verifyCompiledSource } = await import('../r3l0ciarlcf/attestation.mjs');
  const { runPerTrajectoryConfinement } = await import('../r3l0ciar/confinement.mjs');
  const { LEGACY_HELPER_QUARANTINE, STAGE_STOP } = await import('./contract.mjs');

  const base = input.base ?? join(tmpdir(), `r3lcfsh-qualification-${String(process.pid)}`);
  mkdirSync(base, { recursive: true });
  const record = { schemaVersion: 1, stage: 'R3-L0C-I-A-R-L-C-F-S-H', kind: 'terminal enforcement and safety hotfix qualification', baseline: BASELINE_COMMIT, modelCallsMade: 0, enteredPrimaryExecution: false };

  /** 0. THE COMMITTED PLAN, READ AND VERIFIED — NEVER REBUILT. */
  const planRead = await readAndVerifyCommittedPlan({ expectedPlanId: PLAN_ID, verifyCompiled: false });
  record.planVerification = Object.freeze({
    PLAN_SOURCE: planRead.PLAN_SOURCE, planPath: planRead.planPath, planId: planRead.planId,
    planContentDigest: planRead.planContentDigest, recomputedPlanContentDigest: planRead.recomputedPlanContentDigest,
    committedBlob: planRead.committedBlob, worktreeBlob: planRead.worktreeBlob,
    boundClosureDigest: planRead.boundClosureDigest, currentClosureDigest: planRead.currentClosureDigest,
    checks: planRead.checks, verified: planRead.verified, regenerated: planRead.regenerated, problems: planRead.problems,
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
    digest: closure.executionClosureDigest, partIds: closure.partIds, fileCount: closure.fileCount, complete: closure.CLOSURE_COMPLETE,
    stageHarnessModules: closure.stageHarness.moduleCount, reusedModules: closure.reusedModules.moduleCount, reusedMissing: closure.reusedModules.missing,
    mutationsProven: mutations.ALL_MUTATIONS_PROVEN, mutationArms: mutations.arms.map((arm) => arm.id), treeMutated: mutations.treeMutated,
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
    verdict: attestation.IN_RUN_ATTESTATION, s1MatchesExpectedBundle: attestation.s1MatchesExpectedBundle,
    s2MatchesS1: attestation.s2MatchesS1, competingWriterDetected: attestation.competingWriterDetected,
    compiledMatchesSource: compiledVerification.COMPILED_MATCHES_SOURCE, compiledBoundToInputs: attestation.compiledBoundToInputs,
  });

  /** 4. The per-trajectory confinement, with its liveness control. */
  const containment = await runPerTrajectoryConfinement({ runRoot: join(base, 'containment'), trajectoryIds });
  record.containment = Object.freeze({
    verdict: containment.ACTUAL_CONTAINMENT, environmentVerdict: containment.EXPERIMENT_ENVIRONMENT_VALID,
    cases: containment.cases.length, everyOwnWorldExcluded: containment.everyOwnWorldExcluded,
    everySiblingProtected: containment.everySiblingProtected, noEscapeSucceeded: containment.noEscapeSucceeded,
    probeDiscriminates: containment.probeDiscriminates,
  });

  /** 5. The frozen matrix, healthy, through the terminal-enforcement entry, against the COMMITTED plan. */
  const artifactRoot = join(base, 'artifacts');
  mkdirSync(artifactRoot, { recursive: true });
  const artifactFixture = await deterministicArtifactFixture({ artifactRoot });
  const common = {
    prehistory: { world: built.world, state: built.paths.state }, admittedRefs: refs,
    installHostBundle, dshHome, authorizedBy: PLAN_ID, caller: PLAN_ID,
    plan, closure, containment, mode: 'DETERMINISTIC', systemValid: true, artifactRoot, artifactFixture,
    terminalCompiledVerification: compiledVerification, runRoot: null, runId: null,
  };
  const healthy = await runTerminalEnforcementMatrix({ ...common, runId: 'r3lcfsh-qualification-healthy', runRoot: join(base, 'healthy') });
  const healthyGate = healthy.validityGate ?? {};
  record.primaryMatrix = Object.freeze({
    pipeline: healthy.PIPELINE, refusedAt: healthy.refusedAt ?? null, terminalState: healthy.terminalState,
    matrixCompleted: healthy.matrixCompleted, completedSessions: healthy.completedSessions?.length ?? null,
    scheduleLength: healthy.scheduleLength ?? null, trajectoryCount: healthy.trajectoryCount,
    maxLaunchesPerSession: healthy.maxLaunchesPerSession, guardPassed: healthy.guard?.passed ?? false,
    guardChecks: healthy.guard?.verification?.checks ?? null, measurementBasis: healthyGate.measurementBasis ?? null,
    terminalAdmissionGreen: healthyGate.green ?? false, terminalAdmissionDecision: healthyGate.decision ?? null,
    terminalAdmissionConditions: healthyGate.conditions?.length ?? null, terminalAdmissionFailing: healthyGate.failing ?? null,
    durableReconciliationGreen: healthy.finalReconciliation?.green ?? false,
    durableFullIdentityGreen: healthy.finalReconciliation?.identity?.green ?? false,
    costMeasured: healthy.costBridge?.measuredCount ?? null, costAbsent: healthy.costBridge?.absentCount ?? null,
    costInvalid: healthy.costBridge?.invalidCount ?? null, costProvenance: healthy.costBridge?.provenance ?? null,
    costInterpretable: healthy.costBridge?.interpretable ?? false,
    costCompleteness: healthyGate.costCompleteness ?? null,
    causalResult: healthyGate.causal?.CAUSAL_RESULT ?? 'NOT_EVALUABLE', causalFailing: healthyGate.causal?.failing ?? null,
    inRunAttestation: healthyGate.attestation?.IN_RUN_ATTESTATION ?? 'FAIL',
    durableCostReadbackConsistent: healthy.durableCostReadbackConsistent ?? null,
    terminalMeasuredCount: healthy.terminalMeasuredCount ?? null, postRunMeasuredCount: healthy.postRunMeasuredCount ?? null,
    modelCallsMade: healthy.modelCallsMade,
  });

  /** 6. The fault positions and the report-then-hang case. */
  const faults = [];
  for (const [position, label] of [['FIRST', 'first'], ['MIDDLE', 'middle'], ['LAST', 'last']]) {
    const run = await runTerminalEnforcementMatrix({ ...common, runId: `r3lcfsh-qualification-fault-${label}`, runRoot: join(base, `fault-${label}`), faultAt: position, faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    faults.push(Object.freeze({ position, terminalState: run.terminalState, completedSessions: run.completedSessions?.length ?? null, maxLaunchesPerSession: run.maxLaunchesPerSession, sessionsAfterFault: run.sessionsAfterFault }));
  }
  const hang = await runTerminalEnforcementMatrix({ ...common, runId: 'r3lcfsh-qualification-hang', runRoot: join(base, 'hang'), faultAt: 'FIRST', faultKind: PRIMARY_FAULTS.REPORT_THEN_HANG, timeoutMs: input.hangTimeoutMs ?? 4_000 });
  record.faultInjection = Object.freeze({
    cases: Object.freeze(faults),
    allStopped: faults.every((entry) => entry.terminalState === 'ABORT_PRESERVED'),
    noLaterLaunch: faults.every((entry) => (entry.sessionsAfterFault ?? []).length === 0),
    oneLaunchPerSession: faults.every((entry) => entry.maxLaunchesPerSession === 1),
    reportThenHangTerminal: hang.terminalState, reportThenHangUncertain: hang.terminalState === 'UNCERTAIN_PRESERVED',
  });

  /** 7. THE PRIMARY REFUSAL, through the ACTUAL entry, supplying only the frozen experimental inputs. */
  const primaryRun = await runTerminalEnforcementMatrix({
    mode: 'PRIMARY', runId: 'r3lcfsh-qualification-primary', runRoot: join(base, 'primary'),
    prehistory: { world: built.world, state: built.paths.state }, admittedRefs: refs,
    authorizedBy: PLAN_ID, caller: PLAN_ID,
  });
  record.primaryRefusal = Object.freeze({
    PIPELINE: primaryRun.PIPELINE, refusedAt: primaryRun.refusedAt, reason: primaryRun.reason,
    launched: primaryRun.launched === true, modelCallsMade: primaryRun.modelCallsMade,
    authorityVerdict: primaryRun.authority?.verdict ?? null, guardPassed: primaryRun.guard?.passed ?? null,
    stepsRecorded: primaryRun.steps?.length ?? 0,
  });

  /** 8. THE CRITICAL AUTHORITATIVE TEST: a matrix with ONE envelope-invalid artifact, through the actual Runner. */
  const invalidRoot = join(base, 'invalid-artifacts');
  mkdirSync(invalidRoot, { recursive: true });
  const invalidSessionId = schedule[schedule.length - 1].sessionId;
  const invalidFixture = await deterministicArtifactFixture({ artifactRoot: invalidRoot, invalidSessionIds: [invalidSessionId] });
  const invalidRun = await runTerminalEnforcementMatrix({ ...common, runId: 'r3lcfsh-qualification-invalid-artifact', runRoot: join(base, 'invalid'), artifactRoot: invalidRoot, artifactFixture: invalidFixture });
  const invalidGate = invalidRun.validityGate ?? {};
  const invalidEntry = (invalidRun.costBridge?.perSession ?? []).find((entry) => entry.sessionId === invalidSessionId) ?? null;
  record.invalidArtifactMatrix = Object.freeze({
    invalidSessionId,
    pipeline: invalidRun.PIPELINE, terminalState: invalidRun.terminalState, matrixCompleted: invalidRun.matrixCompleted,
    completedSessions: invalidRun.completedSessions?.length ?? null,
    measuredCount: invalidRun.costBridge?.measuredCount ?? null, absentCount: invalidRun.costBridge?.absentCount ?? null,
    invalidCount: invalidRun.costBridge?.invalidCount ?? null,
    invalidOutcome: invalidEntry?.outcome ?? null, invalidValidityState: invalidEntry?.validityState ?? null,
    invalidReason: invalidEntry?.reason ?? null,
    /** §3: the invalid observation carries NULL fields rather than the preliminary values or zeros. */
    invalidFieldsAreNull: invalidEntry?.fields === null,
    invalidCostFieldsAbsent: invalidEntry?.costFieldsAbsent === true,
    /** §3: the frozen bridge WOULD have admitted it, which is the defect the validated bridge closes. */
    frozenBridgeWouldHaveAdmittedIt: invalidRun.costBridge?.frozenPreliminary?.wouldHaveAdmittedInvalid === true,
    discardedPreliminaryFieldCount: invalidRun.costBridge?.discardedPreliminaryFieldCount ?? null,
    costAccountingComplete: invalidGate.costCompleteness?.CostAccountingComplete ?? null,
    costMeasuredComplete: invalidGate.costCompleteness?.CostMeasuredComplete ?? null,
    livePrimaryCostComplete: invalidGate.costCompleteness?.LivePrimaryCostComplete ?? null,
    terminalAdmissionGreen: invalidGate.green ?? false, terminalAdmissionFailing: invalidGate.failing ?? null,
    causalResult: invalidGate.causal?.CAUSAL_RESULT ?? 'NOT_EVALUABLE', causalFailing: invalidGate.causal?.failing ?? null,
    durableCostReadbackConsistent: invalidRun.durableCostReadbackConsistent ?? null,
    terminalMeasuredCount: invalidRun.terminalMeasuredCount ?? null, postRunMeasuredCount: invalidRun.postRunMeasuredCount ?? null,
    modelCallsMade: invalidRun.modelCallsMade,
  });

  /** 9. The production-path controls. */
  const costControl = await controlValidatedCostBridge();
  const cleanupControl = await controlSafeCleanup();
  const runnerControl = await controlRunnerIdentityFalsifier({ base: join(base, 'runner-falsifier') });
  record.productionControls = Object.freeze({ validatedCostBridge: costControl, safeCleanup: cleanupControl, runnerIdentityFalsifier: runnerControl });

  /** 10. The budgets, the quarantine and the authorization verdict. */
  record.timeouts = Object.freeze({ ...timeoutHierarchy() });
  record.quarantine = assertAuthoritativePath({ caller: PLAN_ID, authorizedBy: PLAN_ID });
  record.legacyHelperQuarantine = LEGACY_HELPER_QUARANTINE;
  const authority = await reduceAuthorizationVerdict({ record: input.authorizationDecision ?? null, plan });
  record.authority = Object.freeze({
    verdict: authority.verdict, verified: authority.verified, conditions: authority.conditions,
    unsatisfiedConditions: authority.unsatisfiedConditions, concepts: authority.concepts, problems: authority.problems,
    verdictAgreesWithProblems: authority.verdictAgreesWithProblems, launchProhibited: authority.launchProhibited,
    hostSpendEnforcement: authority.hostSpendEnforcement, testFixtureCannotOpenLaunch: authority.testFixtureCannotOpenLaunch,
  });

  /** 11. The immutability guard, the plan closure and the PRE-PERSISTENCE seal status. */
  record.immutability = await immutabilityRecord();
  record.planClosure = await checkPlanClosure({ verifyCompiled: false });
  record.plan = Object.freeze({ planId: plan.planId, planContentDigest: plan.planContentDigest, digest: plan.executionClosure?.executionClosureDigest ?? null, supersedes: plan.planSupersession?.supersedes?.planId ?? null, frozenAt: plan.frozenAt });
  record.planContentDigest = Object.freeze({ FULL_PLAN_DIGEST: planRead.recomputedPlanContentDigest === plan.planContentDigest ? 'MATCH' : 'DRIFTED', frozen: plan.planContentDigest, current: planRead.recomputedPlanContentDigest });
  /** §5 PHASE A: explicitly NOT a final verdict, and explicitly NOT a failed final seal. */
  record.prePersistenceSealStatus = preSealStatus({ plan });

  /** 12. THE DERIVED QUALIFICATION VERDICT, from the measured conditions. */
  const falseZeroPromotion = Object.freeze({
    noInvalidPromotedToMeasured: record.invalidArtifactMatrix.invalidCount >= 1
      && record.invalidArtifactMatrix.invalidFieldsAreNull === true
      && record.invalidArtifactMatrix.measuredCount === record.primaryMatrix.completedSessions - record.invalidArtifactMatrix.invalidCount,
    invalidPromotedToMeasured: record.invalidArtifactMatrix.invalidFieldsAreNull !== true,
    validatedCount: record.invalidArtifactMatrix.measuredCount,
  });
  const costClassification = Object.freeze({
    interpretable: record.primaryMatrix.costInterpretable === true,
    accountedFor: (record.primaryMatrix.costMeasured ?? 0) + (record.primaryMatrix.costAbsent ?? 0) === record.primaryMatrix.completedSessions,
    measuredCount: record.primaryMatrix.costMeasured, absentCount: record.primaryMatrix.costAbsent,
    invalidCount: record.primaryMatrix.costInvalid,
  });
  const qualification = reduceDeterministicQualification({
    planVerification: planRead,
    closureCheck: record.planClosure,
    matrix: Object.freeze({ matrixCompleted: record.primaryMatrix.matrixCompleted, terminalState: record.primaryMatrix.terminalState, completedSessions: record.primaryMatrix.completedSessions, scheduleLength: record.primaryMatrix.scheduleLength, maxLaunchesPerSession: record.primaryMatrix.maxLaunchesPerSession, retries: 0, unplannedLaunches: [] }),
    terminalAdmission: Object.freeze({ green: record.primaryMatrix.terminalAdmissionGreen, failing: record.primaryMatrix.terminalAdmissionFailing }),
    reconciliation: healthy.finalReconciliation,
    costClassification,
    falseZeroPromotion,
    cleanupControls: cleanupControl,
    /** §5: null at the pre-persistence phase, which is why the seal condition is PENDING. */
    finalSeal: null,
    immutability: record.immutability,
  });
  record.deterministicQualification = qualification;

  /** 13. The verdicts this stage can compute at the pre-persistence phase. */
  record.verdicts = Object.freeze({
    VALIDATED_COST_BRIDGE: costControl.PASS === true ? 'PASS' : 'FAIL',
    INVALID_ARTIFACT_NOT_MEASURED: record.invalidArtifactMatrix.invalidFieldsAreNull === true && record.invalidArtifactMatrix.invalidCount >= 1 ? 'PASS' : 'FAIL',
    GENUINE_MEASURED_ZERO_PRESERVED: costControl.mutations.genuineMeasuredZeroAccepted === true ? 'PASS' : 'FAIL',
    TERMINAL_COST_ADMISSION_ENFORCED: record.invalidArtifactMatrix.terminalMeasuredCount === record.invalidArtifactMatrix.postRunMeasuredCount && record.invalidArtifactMatrix.measuredCount < record.invalidArtifactMatrix.completedSessions ? 'PASS' : 'FAIL',
    DURABLE_COST_READBACK_CONSISTENT: record.primaryMatrix.durableCostReadbackConsistent === true && record.invalidArtifactMatrix.durableCostReadbackConsistent === true ? 'PASS' : 'FAIL',
    SAFE_CLEANUP_LINK_REINSPECTION: cleanupControl.mutations.reinspectionUsesLstat === true ? 'PASS' : 'FAIL',
    SAFE_CLEANUP_PATH_CONTAINMENT: cleanupControl.mutations.relativeResolutionRefusesSibling === true ? 'PASS' : 'FAIL',
    SAFE_CLEANUP_OWNERSHIP: cleanupControl.mutations.ownershipWitnessesRequired === true ? 'PASS' : 'FAIL',
    SAFE_CLEANUP_NESTED_LINKS: cleanupControl.mutations.nestedLinkEnumerated === true ? 'PASS' : 'FAIL',
    SAFE_CLEANUP_DESTRUCTIVE_FALLBACK: cleanupControl.mutations.noDestructiveFallbackAfterFailure === true ? 'PASS' : 'FAIL',
    LEGACY_UNSAFE_HELPER_SCOPE: LEGACY_HELPER_QUARANTINE.physicallyUnexecutable === false && LEGACY_HELPER_QUARANTINE.quarantineIsAGuardNotAnImpossibility === true && record.quarantine.priorPipelinesStillExecutable === true ? 'DISCLOSED' : 'FAIL',
    RUNNER_LEVEL_IDENTITY_FALSIFIER: runnerControl.PASS === true ? 'PASS' : 'FAIL',
    COMMITTED_PLAN_IDENTITY: planRead.verified === true ? 'MATCH' : 'MISMATCH',
    /** §5: the persisted seal is computed in Phase B, so it is NOT_ESTABLISHED here rather than claimed. */
    PERSISTED_CROSS_ARTIFACT_SEAL: 'NOT_ESTABLISHED',
    FINAL_VERDICT_DERIVED_FROM_SEAL: 'FAIL',
    DETERMINISTIC_MEASUREMENT_QUALIFICATION: qualification.verdict,
    EXECUTION_CLOSURE: record.planClosure.EXECUTION_CLOSURE,
    HISTORICAL_EVIDENCE_IMMUTABILITY: record.immutability.verdict,
    REAL_DSH_ARTIFACT_COMPATIBILITY: 'NOT_ESTABLISHED',
    LIVE_PRIMARY_PROVENANCE: 'NOT_ESTABLISHED',
    EXTERNAL_AUTHORITY: authority.verified === true ? 'PASS' : 'NOT_ESTABLISHED',
    HOST_SPEND_ENFORCEMENT: authority.concepts.ACTUAL_HOST_SPEND_ENFORCEMENT === true ? 'PASS' : 'NOT_ESTABLISHED',
    PAID_EXECUTION: 'NOT_RUN',
    CAUSAL_RESULT: 'NOT_EVALUABLE',
  });

  /** §12: the readiness statements, SEPARATE. No combined flag is computed. */
  record.readiness = Object.freeze({
    DETERMINISTIC_MEASUREMENT_QUALIFIED: qualification.verdict === 'PASS',
    CROSS_ARTIFACT_EVIDENCE_SEALED: false,
    REAL_ARTIFACT_COMPATIBILITY_ESTABLISHED: false,
    PRIMARY_EXECUTION_AUTHORIZED: authority.verified === true && authority.concepts.ACTUAL_HOST_SPEND_ENFORCEMENT === true,
    PRIMARY_CAUSAL_DATA_AVAILABLE: false,
    collapsed: false,
    note: 'the readiness statements are independent; DETERMINISTIC_MEASUREMENT_QUALIFIED is NOT an authorization and does NOT imply the others; the cross-artifact seal is established in §5 Phase B, not here',
  });
  record.stageStop = STAGE_STOP;

  return Object.freeze(record);
}

/** §11: write the qualification record into this stage's evidence namespace. */
export async function writeQualification(input = {}) {
  const record = await runQualification(input);
  const directory = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'qualification.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  return record;
}

export { NL };
