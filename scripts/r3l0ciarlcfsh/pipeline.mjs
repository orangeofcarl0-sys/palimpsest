/**
 * R3-L0C-I-A-R-L-C-F-S-H §3/§6/§8 — THE TERMINAL-ENFORCEMENT ENTRY.
 *
 * THE EXACT COUPLING, stated plainly because §8 requires it rather than a silent duplication. The prior stage's
 * `runEvidenceSealMatrix` owns its `validityGate` INTERNALLY and offers no seam through which a caller may
 * substitute a different cost consumer. §3 requires the VALIDATED cost bridge to be the authority-bearing consumer
 * INSIDE the actual `validityGate` — "This property must hold at the actual terminal-admission point used by the
 * frozen Runner" — and §6 requires a Runner-level identity mutation to reach the actual frozen Runner's terminal
 * decision. Neither can be done by wrapping a finished run: §8 forbids "validat[ing] the artifact only after the
 * previous Runner has completed."
 *
 * So this module drives the FROZEN `runFailStopMatrix` directly with a stage-owned `validityGate`, and it REUSES
 * every load-bearing piece rather than copying the experiment:
 *
 *   runFailStopMatrix                 the frozen runner — the state machine, the single launch, the terminal decision
 *   preparePrimaryCase                the F pipeline's EXPORTED, non-destructive run-root preparation
 *   runPrimaryGeneration              the frozen adapter that launches one generation
 *   admitThroughGate                  the frozen admission gate
 *   writeLiveEvidence                 the frozen live-evidence sidecar writer
 *   authoritativeTerminalAdmission    the prior chain's ONE authoritative reducer
 *   admissionTimeMeasurement          the admission-time freshness measurement
 *   reconcileTrialEvidence            the prior stage's extended durable reconciliation
 *   postMatrixValidityGate            the frozen nine-condition post-matrix gate
 *
 * WHAT IS GENUINELY NEW, and it is only this: the gate's cost consumer is `validatedCostBridge`, so an artifact
 * that fails the event envelope cannot be admitted as a measured endpoint; and the gate carries a
 * DETERMINISTIC-ONLY identity-mutation seam, so a full Trial Evidence identity conflict can be driven through the
 * actual Runner's terminal decision.
 *
 * So there is still exactly ONE terminal reducer, ONE runner, ONE cost-counting algorithm, ONE reconciliation and
 * ONE freshness measurement. §8 forbids creating a new state machine or a second final reducer; none exists here.
 *
 * PRIMARY REMAINS PROHIBITED. The entry refuses a PRIMARY mode before it claims anything, and the committed-plan
 * guard runs before THAT, so the guard dominates the reachable execution path it claims to protect.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { NL, PLAN_ID, REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';

/** §8: the ordered steps, recorded as data so a test can assert the guard dominates. */
export const PIPELINE_ORDER = Object.freeze([
  'COMMITTED_PLAN_PREFLIGHT_GUARD',
  'PRIMARY_INPUT_BINDING',
  'PRIMARY_PROHIBITION',
  'VERIFY_COMMITTED_PLAN',
  'VERIFY_RUNTIME_AND_CLOSURE',
  'CHECK_RUN_IDENTITY_AND_SCHEDULE',
  'ACQUIRE_EXCLUSIVE_RUN_ROOT',
  'PERSIST_PRESERVATION_MARKER',
  'PREPARE_WORLDS_STORES_PROFILES',
  'EXPOSURE_INTENT_AND_SINGLE_LAUNCH',
  'TRIAL_ADMISSION',
  'LIVE_EVIDENCE_SIDECAR',
  'TERMINAL_ADMISSION (validated cost bridge, extended durable reconciliation, admission-time recomputation, attestation, frozen validity)',
  'DETERMINISTIC_IDENTITY_MUTATION_SEAM (only when a mutation is requested, and only in a deterministic run)',
  'POST_RUN_READBACK (the same validated cost semantics as terminal admission)',
]);

/**
 * §3: NORMALIZE A BOOLEAN OR STRING VALIDITY SIGNAL INTO THE FROZEN GATE'S PASS/FAIL VOCABULARY.
 *
 * The frozen `postMatrixValidityGate` compares `systemValid === 'PASS' && environmentValid === 'PASS'`, so passing
 * a boolean there yields a RED gate for the wrong reason. This normalizes at the boundary rather than editing the
 * frozen gate.
 */
function normalizeVerdict(value) {
  if (value === true) return 'PASS';
  if (value === false) return 'FAIL';
  if (value === 'PASS' || value === 'FAIL') return value;
  return null;
}

/**
 * §6: APPLY ONE CONTROLLED IDENTITY MUTATION TO THE IN-MEMORY OBSERVATION.
 *
 * §6 requires a deterministic-only fault seam "at the boundary between the last durable `TRIAL_RECORDED` and the
 * authoritative terminal reconciliation", injecting "one controlled AttemptId, HostJobId or Sidecar Binding
 * disagreement". §6 also requires that the test "may alter only its isolated test evidence or the test-visible
 * in-memory observation" and "must never affect historical evidence or real PRIMARY inputs".
 *
 * So the mutation is applied to a COPY of the in-memory records the runner handed the gate. The durable journal is
 * never touched, so the durable readback stays available and the finding is precisely the durable-versus-in-memory
 * disagreement the extended reconciliation exists to detect.
 */
export function applyIdentityMutation(input) {
  const { records, mutation } = input;
  if (mutation === null || mutation === undefined) return Object.freeze({ applied: false, records, detail: 'no mutation was requested' });
  const { sessionId, field, value } = mutation;
  if (typeof sessionId !== 'string' || typeof field !== 'string') {
    return Object.freeze({ applied: false, records, detail: 'the mutation did not name a session and a field, so nothing was altered' });
  }
  let touched = false;
  const mutated = records.map((record) => {
    if (record?.sessionId !== sessionId) return record;
    touched = true;
    return Object.freeze({ ...record, [field]: value });
  });
  return Object.freeze({
    applied: touched,
    records: Object.freeze(mutated),
    sessionId,
    field,
    value,
    detail: touched
      ? `the in-memory observation for ${sessionId} was altered on ${field}; the durable journal was NOT touched, so the disagreement is the finding`
      : `no in-memory observation matched ${sessionId}, so no mutation was applied`,
    durableJournalTouched: false,
    historicalEvidenceTouched: false,
  });
}

/**
 * §8: THE AUTHORITATIVE ENTRY.
 *
 * `input.plan` and `input.closure` are DETERMINISTIC test seams. In PRIMARY they are refused by the input binding,
 * so a PRIMARY invocation derives its own. The committed-plan guard runs FIRST, unconditionally, and a guard failure
 * returns a structured refusal before the run root is touched.
 */
export async function runTerminalEnforcementMatrix(input) {
  const steps = [];
  const record = (id, mutated, observation) => steps.push(Object.freeze({ step: steps.length + 1, id, mutated, observation }));
  const refuse = (id, reason, detail, extra = {}) => Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R-L-C-F-S-H', kind: 'terminal enforcement matrix run',
    PIPELINE: 'REFUSED', refusedAt: id, reason, detail: detail ?? null,
    steps: Object.freeze(steps), runRoot: input.runRoot ?? null, run: null, launches: Object.freeze([]),
    modelCallsMade: 0, ...extra,
  });

  /* ---------- STEP 1: THE MANDATORY FULL-PLAN GUARD. IT DOMINATES EVERYTHING BELOW. ---------- */
  const { assertAuthoritativePath, assertCommittedPlanIdentity } = await import('./modes.mjs');
  const guard = await assertCommittedPlanIdentity({ expectedPlanId: PLAN_ID, planPath: input.planPath, verifyCompiled: false });
  record('COMMITTED_PLAN_PREFLIGHT_GUARD', false, Object.freeze({ passed: guard.passed, checks: guard.verification.checks, problems: guard.verification.problems }));
  if (guard.passed !== true) return refuse('COMMITTED_PLAN_PREFLIGHT_GUARD', 'COMMITTED_PLAN_IDENTITY_UNVERIFIED', guard.reason, { guard });

  /* ---------- STEP 2: the authoritative path and the PRIMARY input binding. ---------- */
  assertAuthoritativePath({ caller: input.caller ?? 'r3l0ciarlcfsh', authorizedBy: input.authorizedBy });
  const { enforcePrimaryInputBinding } = await import('../r3l0ciarlcf/trust-boundary.mjs');
  const requestedMode = String(input.mode ?? '');
  const binding = enforcePrimaryInputBinding({ mode: requestedMode, provided: input });
  if (binding.refused === true) return refuse('PRIMARY_INPUT_BINDING', 'CALLER_SUBSTITUTED_MEASUREMENT', binding.reason);
  record('PRIMARY_INPUT_BINDING', false, Object.freeze({ mode: requestedMode, injectionPermitted: binding.injectionPermitted, supplied: binding.supplied }));

  /* ---------- STEP 3: PRIMARY IS PROHIBITED IN THIS STAGE, THROUGH THE PRIOR UNIFIED REDUCER. ---------- */
  const { reduceAuthorizationVerdict } = await import('../r3l0ciarlcfs/authorization-verdict.mjs');
  const authority = await reduceAuthorizationVerdict({ record: input.authorizationDecision ?? null, plan: guard.verification.plan });
  record('PRIMARY_PROHIBITION', false, Object.freeze({ mode: requestedMode, authorityVerdict: authority.verdict, verified: authority.verified, launchProhibited: authority.launchProhibited, currentLaunchPermission: authority.concepts.CURRENT_LAUNCH_PERMISSION }));
  if (requestedMode === 'PRIMARY') {
    return refuse('PRIMARY_PROHIBITION', 'PRIMARY_EXECUTION_PROHIBITED',
      'this stage performs no primary launch; the authorization verdict is reported and the launch boundary is not crossed',
      { authority, guard, mode: Object.freeze({ mode: 'PRIMARY', resolved: true }), launched: false, modelCallsMade: 0 });
  }

  /* ---------- STEP 4/5: the committed plan and the closure, both verified rather than regenerated. ---------- */
  const plan = input.plan ?? guard.verification.plan;
  const schedule = await (await import('../r3l0ciar/primary-adapter.mjs')).frozenPrimarySchedule();
  const { verifyCommittedPlan } = await import('../r3l0ciar/activation.mjs');
  const planVerification = verifyCommittedPlan(plan, { planId: PLAN_ID, scheduleIds: schedule.map((session) => session.sessionId) });
  record('VERIFY_COMMITTED_PLAN', false, Object.freeze({ planId: planVerification.planId, scheduleLength: planVerification.scheduleLength, PLAN_VALID: planVerification.PLAN_VALID, source: input.plan === undefined ? 'committed plan on disk' : 'caller-supplied (DETERMINISTIC)' }));
  if (planVerification.PLAN_VALID !== true) return refuse('VERIFY_COMMITTED_PLAN', 'PLAN_INVALID', planVerification.problems.join('; '));

  const { computeExecutionClosure } = await import('./closure.mjs');
  const closure = input.closure ?? await computeExecutionClosure({ verifyCompiled: false });
  const boundDigest = planVerification.closureDigest;
  const closureMatches = typeof boundDigest === 'string' && boundDigest !== '' && boundDigest === closure.executionClosureDigest;
  record('VERIFY_RUNTIME_AND_CLOSURE', false, Object.freeze({ bound: boundDigest, recomputed: closure.executionClosureDigest, matches: closureMatches }));
  if (closureMatches !== true) return refuse('VERIFY_RUNTIME_AND_CLOSURE', 'CLOSURE_DRIFTED', `the plan binds ${String(boundDigest)} and the runtime computes ${closure.executionClosureDigest}`);

  /* ---------- STEP 6: the run identity and the gate inputs. ---------- */
  const runId = input.runId;
  if (typeof runId !== 'string' || runId === '') return refuse('CHECK_RUN_IDENTITY_AND_SCHEDULE', 'RUN_ID_ABSENT', 'no run id was supplied');
  if (input.containment === undefined) return refuse('CHECK_RUN_IDENTITY_AND_SCHEDULE', 'CONTAINMENT_ABSENT', 'the terminal gate requires the containment measurement; a gate red for a missing input would be indistinguishable from a matrix failure');
  const containment = input.containment;
  record('CHECK_RUN_IDENTITY_AND_SCHEDULE', false, Object.freeze({ runId, scheduleLength: schedule.length, containmentSource: 'caller-supplied (DETERMINISTIC)' }));

  /* ---------- STEP 7: the exclusive run-root claim. THE FIRST MUTATION. ---------- */
  const runRoot = input.runRoot;
  const { claimActivationRoot, PRESERVE_FILE, PREPARATION_FILE, JOURNAL_FILE } = await import('../r3l0ciar/activation.mjs');
  const claim = claimActivationRoot({ runRoot, runId });
  record('ACQUIRE_EXCLUSIVE_RUN_ROOT', true, Object.freeze({ claimed: claim.claimed, verdict: claim.inspection.verdict, reason: claim.inspection.reason }));
  if (claim.claimed !== true) return refuse('ACQUIRE_EXCLUSIVE_RUN_ROOT', claim.inspection.verdict, claim.inspection.reason);

  /* ---------- STEP 8/9: the preservation marker and the non-destructive preparation. ---------- */
  const { writeJsonAtomic, readJournal } = await import('../r3l0cf/journal.mjs');
  const { preparePrimaryCase } = await import('../r3l0ciarlcf/pipeline.mjs');
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  writeJsonAtomic(join(runRoot, PRESERVE_FILE), { runId, at: new Date().toISOString(), reason: 'a pipeline preserves its evidence from the first possible exposure onward' });
  writeJsonAtomic(join(runRoot, PREPARATION_FILE), { schemaVersion: 1, runId, state: 'PREPARING', startedAt: new Date().toISOString(), trajectoryIds });
  record('PERSIST_PRESERVATION_MARKER', true, Object.freeze({ preserveMarker: true, preparationState: 'PREPARING' }));
  const prepared = preparePrimaryCase({ runRoot, prehistory: input.prehistory, trajectoryIds });
  const { installHostBundle, dshHome } = await import('../gates/env.mjs');
  const resolveDshHome = () => (typeof input.dshHome === 'function' ? input.dshHome() : (input.dshHome ?? dshHome()));
  const { installHostBundleSafely } = await import('../r3l0ciar/host-bundle.mjs');
  const installBundle = input.installHostBundle ?? installHostBundleSafely;
  const { sampleInstallationDigest } = await import('../r3l0ciarlcf/attestation.mjs');
  const s0Digest = sampleInstallationDigest({ dshHomePath: resolveDshHome() });
  installBundle({ repo: REPO_ROOT, realDshHome: resolveDshHome() });
  const s1Digest = sampleInstallationDigest({ dshHomePath: resolveDshHome() });
  const homes = {};
  for (const trajectoryId of trajectoryIds) {
    const home = join(runRoot, 'units', trajectoryId, 'home');
    mkdirSync(home, { recursive: true });
    const route = await import('../r3l0cr/route.mjs');
    const settings = await import('../r3l0cr/settings.mjs');
    const { makeProfile } = await import('../r3l0c/trajectory.mjs');
    makeProfile(home, route.routeForProfile(route.PRIMARY_EXECUTOR), `${input.profileId ?? 'r3l0ciarlcfsh'}${trajectoryId.replace(/[^a-z0-9]/gu, '')}`, () => { /* the bundle was installed once, before the loop */ }, resolveDshHome, undefined, { extraPatch: settings.defaultModelPatch(route.PRIMARY_EXECUTOR) });
    homes[trajectoryId] = home;
  }
  writeJsonAtomic(join(runRoot, PREPARATION_FILE), { schemaVersion: 1, runId, state: 'PREPARED', preparedAt: new Date().toISOString(), trajectoryIds, createdDirectories: [...prepared.layout.createdDirectories], removedAnything: false });
  record('PREPARE_WORLDS_STORES_PROFILES', true, Object.freeze({ createdDirectories: prepared.layout.createdDirectories.length, removedAnything: false, trajectories: trajectoryIds.length, s0: s0Digest.slice(0, 16), s1: s1Digest.slice(0, 16) }));

  /* ---------- STEP 10: the exposure intent, the single launch, the admission and the sidecar. ---------- */
  const { PRIMARY_FAULTS, faultPositionFault, runPrimaryGeneration, timeoutHierarchy } = await import('../r3l0ciar/primary-adapter.mjs');
  const { perTrajectoryProtectedRoots } = await import('../r3l0ciar/confinement.mjs');
  const { admitThroughGate } = await import('../r3l0ciar/admission.mjs');
  const { writeLiveEvidence, liveEvidenceBinding } = await import('../r3l0ciarl/live-evidence.mjs');
  const { buildSelection } = await import('../r3l0cr/selection.mjs');
  const { buildExpectationManifest } = await import('../r3l0cr/contract.mjs');
  const { GENERATION_EXPOSURES } = await import('../r3l0c/capital.mjs');
  const { GENERATIONS } = await import('../r3l0c/contract.mjs');
  const { runFailStopMatrix } = await import('../r3l0cf/fail-stop.mjs');

  const resolved = await (await import('./modes.mjs')).resolveExecutionMode({ mode: input.mode, paidAuthorization: input.paidAuthorization });
  if (resolved.resolved !== true) return refuse('CHECK_RUN_IDENTITY_AND_SCHEDULE', 'EXECUTION_MODE_UNRESOLVED', resolved.reason);

  const expectations = {};
  for (const session of schedule) expectations[session.sessionId] = buildExpectationManifest({ generationId: session.generation, arm: session.arm, admittedRefs: input.admittedRefs, generationExposures: GENERATION_EXPOSURES });

  const launches = [];
  const faultsInjected = [];
  const outcomes = {};
  const liveEvidence = {};
  const launch = async ({ session }) => {
    const position = faultPositionFault(session.scheduleIndex, schedule.length);
    const inject = typeof input.faultAt === 'string' && input.faultAt !== '' && position[input.faultAt] === true;
    const fault = inject ? (input.faultKind ?? PRIMARY_FAULTS.REPORT_MISSING) : PRIMARY_FAULTS.NONE;
    if (inject) faultsInjected.push(Object.freeze({ sessionId: session.sessionId, position: input.faultAt, fault, scheduleIndex: session.scheduleIndex }));
    launches.push(Object.freeze({ sessionId: session.sessionId, attempt: 1, fault }));
    const generation = GENERATIONS.find((entry) => entry.id === session.generation);
    const knowledge = session.arm === 'C' ? buildSelection({ arm: 'C', generationId: session.generation, admittedRefs: input.admittedRefs, generationExposures: GENERATION_EXPOSURES }) : undefined;
    const world = prepared.worlds[session.trajectoryId];
    const protectedRoots = perTrajectoryProtectedRoots(runRoot, trajectoryIds, session.trajectoryId).roots.join(process.platform === 'win32' ? ';' : ':');
    const artifactPath = input.artifactRoot === null || input.artifactRoot === undefined ? null : join(input.artifactRoot, `${session.sessionId}.zstd`);
    const raw = await runPrimaryGeneration({
      runRoot, world: world.world, paths: world.paths, home: homes[session.trajectoryId],
      profile: `${input.profileId ?? 'r3l0ciarlcfsh'}${session.trajectoryId.replace(/[^a-z0-9]/gu, '')}`,
      workerExecutable: resolved.workerExecutable, session, generation, knowledge, protectedRoots,
      expectation: expectations[session.sessionId], requestedSelection: knowledge ?? null,
      mode: resolved.mode, fault, artifactPath, timeoutMs: input.timeoutMs,
    });
    let outcome = raw;
    if (typeof input.artifactFixture === 'function') {
      const fixture = input.artifactFixture({ session, outcome: raw });
      if (fixture !== null && fixture !== undefined && typeof fixture.path === 'string') {
        outcome = Object.freeze({ ...raw, sessionArtifactPath: fixture.path, attemptId: fixture.attemptId ?? raw.attemptId, hostJobId: fixture.hostJobId ?? raw.hostJobId });
      }
    }
    outcomes[session.sessionId] = outcome;
    const provenance = resolved.mode === 'PRIMARY' ? 'LIVE_PRIMARY' : 'FIXTURE';
    const sidecar = writeLiveEvidence({
      runRoot, sessionId: session.sessionId, sessionArtifactPath: outcome.sessionArtifactPath,
      hiddenInvariantVector: outcome.hiddenInvariantVector, attemptId: outcome.attemptId, hostJobId: outcome.hostJobId,
      costProvenance: outcome.sessionArtifactPath === null ? 'NO_ARTIFACT' : provenance, mode: resolved.mode,
    });
    liveEvidence[session.sessionId] = sidecar;
    const admitted = await admitThroughGate(outcome);
    const gateRefused = admitted.gateFired === true;
    return Object.freeze({
      ...outcome,
      gateAdmission: admitted,
      reportMissing: gateRefused ? true : outcome.reportMissing,
      hostFailure: gateRefused ? true : outcome.hostFailure,
      admissionRefusalCause: gateRefused ? admitted.cause : null,
      contentDigests: Object.freeze({ ...(outcome.contentDigests ?? {}), ...liveEvidenceBinding(sidecar.digest) }),
      liveEvidenceDigest: sidecar.digest,
      derivedCostProvenance: provenance,
    });
  };

  /* ---------- THE ONE AUTHORITATIVE GATE, WITH THE VALIDATED COST BRIDGE ---------- */
  const journalPath = join(runRoot, JOURNAL_FILE);
  const boundClosureDigest = plan?.executionClosure?.executionClosureDigest ?? null;
  const preflightClosureDigest = closure.executionClosureDigest;
  const { modelRouteIdentity, postMatrixValidityGate, evaluatePreTrialValidity } = await import('../r3l0ciar/validity.mjs');
  const routeConfiguration = input.routeConfiguration ?? await (await import('../r3l0ciar/preflight.mjs')).effectiveRouteConfiguration();
  const realizationPreflight = input.realizationPreflight ?? await (await import('../r3l0ciar/preflight.mjs')).realizationPreflight({ admittedRefs: input.admittedRefs, generationExposures: GENERATION_EXPOSURES });
  const preExposureChecks = await evaluatePreTrialValidity({ plan, closure, containment, schedule, mode: resolved, realizationPreflight, routeConfiguration, systemValid: input.systemValid });
  if (preExposureChecks === null || preExposureChecks === undefined || preExposureChecks.ALL_SATISFIED !== true) {
    return refuse('CHECK_RUN_IDENTITY_AND_SCHEDULE', 'PRE_EXPOSURE_CHECKS_NOT_SATISFIED', `the pre-exposure checks did not report ALL_SATISFIED === true (unsatisfied: [${(preExposureChecks?.unsatisfied ?? ['ALL']).join(', ')}]); no session may be launched`);
  }
  const preflightRouteIdentity = modelRouteIdentity(preExposureChecks);

  const recompute = async () => {
    const freshClosure = await (await import('./closure.mjs')).computeExecutionClosure({ verifyCompiled: false });
    const freshRoute = await (await import('../r3l0ciar/preflight.mjs')).effectiveRouteConfiguration();
    const freshValidity = await evaluatePreTrialValidity({ plan, closure: freshClosure, containment, schedule, mode: resolved, realizationPreflight, routeConfiguration: freshRoute, systemValid: input.systemValid });
    return Object.freeze({ closure: freshClosure, route: Object.freeze({ MODEL_ROUTE_IDENTITY: modelRouteIdentity(freshValidity) }) });
  };

  /** §6: the mutation is recorded on the gate result, so a reader sees exactly what was altered and what was not. */
  let identityMutationRecord = Object.freeze({ applied: false, detail: 'the gate did not run, so no mutation was applied' });

  const validityGate = async ({ completed, records, plannedSessions }) => {
    const { verifyLiveEvidenceContinuity } = await import('../r3l0ciarl/live-evidence.mjs');
    const { deriveCountsFromJournal, readJournalRecords } = await import('../r3l0ciarl/postflight.mjs');
    const { inRunAttestation } = await import('../r3l0ciarlcf/attestation.mjs');
    const { authoritativeTerminalAdmission } = await import('../r3l0ciarlcf/postmatrix-admission.mjs');
    const { admissionTimeMeasurement } = await import('../r3l0ciarlcf/freshness.mjs');
    const { causalEvaluability, costCompleteness } = await import('../r3l0ciarlcf/durable-reconciliation.mjs');
    const { reconcileTrialEvidence } = await import('../r3l0ciarlcfs/trial-identity.mjs');
    /** §3: THE VALIDATED COST BRIDGE, the only cost consumer on this path. */
    const { validatedCostBridge } = await import('./validated-cost-bridge.mjs');

    const continuity = verifyLiveEvidenceContinuity({ runRoot, records });
    /**
     * §3: THE COST ATTRIBUTION, from the VALIDATED bridge. An artifact that fails the event envelope cannot be
     * admitted as a measured endpoint here, at the actual terminal-admission point.
     */
    const costAttribution = await validatedCostBridge({ journalPath, runRoot, plannedSessions, artifactRoot: input.artifactRoot ?? null });
    const s2Digest = sampleInstallationDigest({ dshHomePath: resolveDshHome() });
    const compiledVerification = input.terminalCompiledVerification ?? await (await import('../r3l0ciarlcf/attestation.mjs')).verifyCompiledSource();
    const attestation = await inRunAttestation({ dshHomePath: resolveDshHome(), s0Digest, s1Digest, s2Digest, installedDuringRun: true, compiledVerification });
    const journal = readJournal(journalPath);
    const counts = deriveCountsFromJournal({ journalRecords: readJournalRecords(journalPath), plannedSessions });
    const freshness = await admissionTimeMeasurement({
      mode: resolved.mode, boundClosureDigest, preflightClosureDigest, preflightRouteIdentity, recompute,
      injection: resolved.mode === 'PRIMARY' ? null : (input.terminalMeasurement ?? null),
    });
    /**
     * §6: THE DETERMINISTIC-ONLY IDENTITY MUTATION SEAM, applied to the IN-MEMORY observation only. The durable
     * journal is never touched, so a disagreement here is exactly the durable-versus-in-memory conflict the
     * extended reconciliation exists to detect.
     */
    const mutation = resolved.mode === 'PRIMARY' ? Object.freeze({ applied: false, records, detail: 'a mutation is never applied in a PRIMARY run' }) : applyIdentityMutation({ records, mutation: input.identityMutation ?? null });
    identityMutationRecord = Object.freeze({ ...mutation, records: undefined, mode: resolved.mode });
    const durableReconciliation = await reconcileTrialEvidence({ journal, schedule, plannedSessions, inMemoryRecords: mutation.records, liveEvidenceContinuity: continuity, costAttribution, runRoot });
    const frozenValidity = await postMatrixValidityGate({
      completed, records: mutation.records, plannedSessions, plan, closure, containment, schedule,
      systemValid: normalizeVerdict(input.systemValid),
      environmentValid: containment?.EXPERIMENT_ENVIRONMENT_VALID ?? containment?.EXPERIMENT_CONTAINMENT ?? null,
      /**
       * §3: the frozen gate's condition 6 is `interpretable && rejectedCount === 0`. The validated bridge reports
       * `interpretable` when every planned session is either a VALIDATED measurement or an explicitly classified
       * absence — an invalid observation is such a classified absence — so the frozen mechanical rule is expressed
       * as it is rather than replaced by a stricter one invented after seeing the result.
       */
      costAttribution: Object.freeze({ interpretable: costAttribution.interpretable, rejectedCount: costAttribution.rejectedCount, measuredCount: costAttribution.measuredCount, absentCount: costAttribution.absentCount, plannedSessions: costAttribution.plannedSessions, livePrimaryCount: costAttribution.livePrimaryCount, fixtureCount: costAttribution.fixtureCount, allSixteenLivePrimary: costAttribution.allSixteenLivePrimary }),
      routeConfiguration: { MODEL_ROUTE_IDENTITY: freshness.admissionRouteIdentity },
      analysisPlanUnchanged: plan?.preservedDesign?.primaryEndpointsChanged === false && plan?.preservedDesign?.verdictThresholdsChanged === false,
      replacements: counts.replacements, retries: counts.retries,
    });
    const admission = await authoritativeTerminalAdmission({
      completed, records: mutation.records, plannedSessions, schedule, plan, journalPath, journalReader: readJournal,
      liveEvidenceContinuity: continuity, costAttribution, durableReconciliation, freshness, attestation, postMatrixValidity: frozenValidity,
    });
    const causal = causalEvaluability({
      authoritativeAdmission: admission, costAttribution, records: mutation.records, durableReconciliation, postMatrixValidity: frozenValidity,
      analysisPlanUnchanged: plan?.preservedDesign?.primaryEndpointsChanged === false && plan?.preservedDesign?.verdictThresholdsChanged === false,
      replacements: counts.replacements, retries: counts.retries, freshness, attestation,
    });
    return Object.freeze({ ...admission, attestation, continuity, costAttribution, durableReconciliation, freshness, frozenValidity, causal, costCompleteness: costCompleteness(costAttribution), identityMutation: identityMutationRecord });
  };

  const run = await runFailStopMatrix({
    runId, runRoot, schedule, launch, validityGate,
    closureDigest: closure.executionClosureDigest,
    intendedExecutorRoute: resolved.mode === 'PRIMARY' ? 'the frozen omnigate DeepSeek route' : 'the deterministic scripted worker',
    trustedClaimNonce: claim.claimNonce, enforceRunClaim: false,
  });

  /* ---------- THE POST-RUN READBACK, WITH THE SAME VALIDATED SEMANTICS AS TERMINAL ADMISSION ---------- */
  const { validatedCostBridge: postBridge } = await import('./validated-cost-bridge.mjs');
  const { reconcileTrialEvidence: postReconcile } = await import('../r3l0ciarlcfs/trial-identity.mjs');
  const { verifyLiveEvidenceContinuity: postContinuity } = await import('../r3l0ciarl/live-evidence.mjs');
  const costBridge = await postBridge({ journalPath, runRoot, plannedSessions: run.plannedSessions, artifactRoot: input.artifactRoot ?? null });
  const continuity = postContinuity({ runRoot, records: run.records });
  const finalReconciliation = await postReconcile({ journal: readJournal(journalPath), schedule, plannedSessions: run.plannedSessions, inMemoryRecords: run.records, liveEvidenceContinuity: continuity, costAttribution: costBridge, runRoot });
  record('POST_RUN_READBACK', false, Object.freeze({ costMeasured: costBridge.measuredCount, costInvalid: costBridge.invalidCount, costAbsent: costBridge.absentCount, terminalState: run.terminalState, durableReconciliationGreen: finalReconciliation.green }));

  /**
   * §3: THE READBACK CONSISTENCY, computed rather than assumed. A terminal measuredCount that disagrees with the
   * post-run measuredCount for the same journal and artifact set is a RED finding.
   */
  const terminalMeasured = run.validityGate?.costAttribution?.measuredCount ?? null;
  const readbackConsistent = terminalMeasured === null ? null : terminalMeasured === costBridge.measuredCount;

  return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R-L-C-F-S-H', kind: 'terminal enforcement matrix run',
    PIPELINE: 'COMPLETED', runId, runRoot,
    guard, authority, primaryBinding: binding,
    claim: Object.freeze({ claimed: true, nonce: claim.claimNonce }),
    mode: resolved, planId: plan?.planId ?? null,
    preExposureChecks, modelRouteIdentity: preflightRouteIdentity,
    scheduleLength: schedule.length, trajectoryCount: trajectoryIds.length,
    s0Digest, s1Digest,
    launches: Object.freeze(launches), faultsInjected: Object.freeze(faultsInjected), outcomes,
    liveEvidence: Object.freeze(liveEvidence), liveEvidenceContinuity: continuity,
    journalPath, costBridge, finalReconciliation,
    /** §3: the readback consistency, so a terminal/post-run discrepancy is a recorded finding. */
    terminalMeasuredCount: terminalMeasured,
    postRunMeasuredCount: costBridge.measuredCount,
    durableCostReadbackConsistent: readbackConsistent,
    /** §6: what the identity mutation actually altered, carried so a reader sees the seam. */
    identityMutation: identityMutationRecord,
    run, terminalState: run.terminalState, matrixCompleted: run.matrixCompleted,
    completedSessions: run.completedSessions, maxLaunchesPerSession: run.maxLaunchesPerSession,
    validityGate: run.validityGate, steps: Object.freeze(steps), budgets: timeoutHierarchy(),
    modelCallsMade: 0, enteredPrimaryExecution: false,
    sessionsAfterFault: faultsInjected.length === 0 ? Object.freeze([]) : Object.freeze(run.launches.filter((entry) => entry.sessionId !== faultsInjected[0].sessionId).map((entry) => entry.sessionId).filter((sessionId) => schedule.findIndex((session) => session.sessionId === sessionId) > faultsInjected[0].scheduleIndex)),
  });
}

export { NL, REPO_ROOT, STAGE_EVIDENCE_PATH, existsSync };
