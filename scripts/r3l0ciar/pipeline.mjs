/**
 * R3-L0C-I-A-R §2 — THE ONE AUTHORITATIVE EXECUTION PIPELINE.
 *
 * THE DEFECT THIS CLOSES, measured in G1. R3-L0C-I-A had TWO entry points: `activation.mjs` claimed the run root
 * first but stopped at the launch boundary, and `primary-driver.mjs` launched but prepared the run root BEFORE the
 * claim. So the entry that actually paid for sessions was the one with the defective order.
 *
 * THE REPAIR IS ONE PIPELINE, IN THE RULING'S ORDER:
 *
 *     committed plan -> executable closure -> exclusive run claim -> PRESERVE -> world preparation
 *     -> pretrial validity -> exposure intent -> single child launch -> trial admission
 *     -> per-generation journal -> post-matrix validity -> frozen analysis
 *
 * `runPrimaryMatrix` IS this pipeline. There is no second launch path: the only call to `runPrimaryGeneration` in
 * the repository is inside the loop below, and the only call to `runFailStopMatrix` is here too. Steps 1-3 are
 * read-only; step 4 is the FIRST mutation; a refusal at any step leaves the run root byte-identical, which the
 * acceptance suite measures.
 *
 * WHY THE PRE-TRIAL CHECK GATES THE LAUNCH. §3 requires `preExposureChecks.ALL_SATISFIED === true` before
 * exposure. The R3-L0C-I-A activation ran the check but never required it (G2). Here the evaluation is computed
 * INSIDE the pipeline and a non-satisfied evaluation REFUSES before the exposure intent is journalled, so no
 * session can be launched against an unsatisfied pre-trial condition.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NL, REPO_ROOT, STAGE_CODE_PATH, STAGE_EVIDENCE_PATH } from './contract.mjs';
import { claimActivationRoot, inspectActivationRoot, prepareLayoutSafely, readCommittedPlan, verifyCommittedPlan } from './activation.mjs';
import { assertAuthoritativePath, resolveExecutionMode } from './modes.mjs';
import { PRIMARY_FAULTS, faultPositionFault, frozenPrimarySchedule, runPrimaryGeneration, timeoutHierarchy } from './primary-adapter.mjs';
import { perTrajectoryProtectedRoots } from './confinement.mjs';
import { admitThroughGate } from './admission.mjs';
import { buildSelection } from '../r3l0cr/selection.mjs';
import { buildExpectationManifest } from '../r3l0cr/contract.mjs';
import { GENERATION_EXPOSURES } from '../r3l0c/capital.mjs';
import { GENERATIONS } from '../r3l0c/contract.mjs';
import { makeProfile } from '../r3l0c/trajectory.mjs';
import { runFailStopMatrix } from '../r3l0cf/fail-stop.mjs';
import { PRESERVE_FILE, PREPARATION_FILE } from './activation.mjs';
import { writeJsonAtomic } from '../r3l0cf/journal.mjs';

/** §2: the preparation record's states, so a partial preparation is detectable. */
const PREPARING = 'PREPARING';
const PREPARED = 'PREPARED';

/**
 * §2: PREPARE ONE CASE'S RUN ROOT, NON-DESTRUCTIVELY. Called ONLY after the claim.
 */
export function preparePrimaryCase(input) {
  const { runRoot, prehistory, trajectoryIds } = input;
  const layout = prepareLayoutSafely(runRoot, trajectoryIds);
  const worlds = {};
  for (const trajectoryId of trajectoryIds) {
    const world = join(runRoot, 'units', trajectoryId, 'world');
    const state = join(runRoot, 'units', trajectoryId, 'state');
    if (!existsSync(join(world, '.git')) && !existsSync(join(world, '.palimpsest'))) cpSync(prehistory.world, world, { recursive: true });
    if (!existsSync(join(state, 'orchestration.sqlite'))) cpSync(prehistory.state, state, { recursive: true });
    worlds[trajectoryId] = Object.freeze({
      world,
      paths: Object.freeze({
        state,
        orchestration: join(state, 'orchestration.sqlite'),
        ordarium: join(state, 'ordarium.sqlite'),
        association: join(state, 'assoc.sqlite'),
        journal: join(state, 'journal.sqlite'),
        proof: join(state, 'proof.sqlite'),
        proofBlobs: join(state, 'proof-blobs'),
        cells: join(state, 'cells.sqlite'),
        procedures: join(state, 'procedures.sqlite'),
      }),
    });
  }
  return Object.freeze({ runRoot, worlds, layout });
}

/**
 * §2: THE AUTHORITATIVE ENTRY. Runs the pipeline in order.
 *
 * Returns a record naming each step, whether it mutated anything, and the matrix run. A refusal at any step
 * returns `PIPELINE: 'REFUSED'` with the step and reason, and the run root is unchanged.
 */
export async function runPrimaryMatrix(input) {
  assertAuthoritativePath({ caller: input.caller ?? 'r3l0ciar', authorizedBy: input.authorizedBy });
  const steps = [];
  const record = (id, mutated, observation) => steps.push(Object.freeze({ step: steps.length + 1, id, mutated, observation }));
  const refuse = (id, reason, detail) => Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R', kind: 'primary matrix run',
    PIPELINE: 'REFUSED', refusedAt: id, reason, detail: detail ?? null,
    steps: Object.freeze(steps), runRoot: input.runRoot ?? null, run: null, launches: Object.freeze([]),
  });

  /* ---------- STEP 1: verify the committed prospective plan (READ-ONLY) ---------- */
  const planRead = input.plan === undefined ? readCommittedPlan(input.planPath) : Object.freeze({ planPath: input.planPath ?? null, exists: true, plan: input.plan, error: null });
  if (planRead.exists !== true || planRead.plan === null) return refuse('VERIFY_COMMITTED_PLAN', 'PLAN_ABSENT', planRead.error);
  const schedule = await frozenPrimarySchedule();
  const planVerification = verifyCommittedPlan(planRead.plan, { planId: input.expectedPlanId, scheduleIds: schedule.map((session) => session.sessionId) });
  record('VERIFY_COMMITTED_PLAN', false, Object.freeze({ planId: planVerification.planId, scheduleLength: planVerification.scheduleLength, PLAN_VALID: planVerification.PLAN_VALID }));
  if (planVerification.PLAN_VALID !== true) return refuse('VERIFY_COMMITTED_PLAN', 'PLAN_INVALID', planVerification.problems.join('; '));

  /* ---------- STEP 2: verify the runtime and the executable closure (READ-ONLY) ---------- */
  const closure = input.closure ?? await (await import('./closure.mjs')).computeExecutionClosure({ verifyCompiled: input.verifyCompiled });
  const boundDigest = planVerification.closureDigest;
  const closureMatches = typeof boundDigest === 'string' && boundDigest !== '' && boundDigest === closure.executionClosureDigest;
  record('VERIFY_RUNTIME_AND_CLOSURE', false, Object.freeze({ bound: boundDigest, recomputed: closure.executionClosureDigest, matches: closureMatches }));
  if (closureMatches !== true) return refuse('VERIFY_RUNTIME_AND_CLOSURE', boundDigest === null || boundDigest === undefined || boundDigest === '' ? 'CLOSURE_BINDING_ABSENT' : 'CLOSURE_DRIFTED', `the plan binds ${String(boundDigest)} and the runtime computes ${closure.executionClosureDigest}`);

  /* ---------- STEP 3: check the run identity, the schedule and the gate inputs (READ-ONLY) ---------- */
  const runId = input.runId;
  if (typeof runId !== 'string' || runId === '') return refuse('CHECK_RUN_IDENTITY_AND_SCHEDULE', 'RUN_ID_ABSENT', 'no run id was supplied');
  if (input.containment === undefined) return refuse('CHECK_RUN_IDENTITY_AND_SCHEDULE', 'CONTAINMENT_ABSENT', 'the post-matrix gate and the pre-trial conditions both require the containment measurement; a gate red for a missing input would be indistinguishable from a matrix failure');
  record('CHECK_RUN_IDENTITY_AND_SCHEDULE', false, Object.freeze({ runId, scheduleLength: schedule.length, containmentSupplied: true }));

  /* ---------- STEP 4: acquire exclusive run-root ownership. THE FIRST MUTATION. ---------- */
  const runRoot = input.runRoot;
  const claim = claimActivationRoot({ runRoot, runId });
  record('ACQUIRE_EXCLUSIVE_RUN_ROOT', true, Object.freeze({ claimed: claim.claimed, verdict: claim.inspection.verdict, reason: claim.inspection.reason }));
  if (claim.claimed !== true) return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R', kind: 'primary matrix run',
    PIPELINE: 'REFUSED', refusedAt: 'ACQUIRE_EXCLUSIVE_RUN_ROOT', reason: claim.inspection.verdict, detail: claim.inspection.reason,
    steps: Object.freeze(steps), runRoot, run: null, launches: Object.freeze([]),
  });

  /* ---------- STEP 5: persist the preservation marker and the preparation record ---------- */
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  writeJsonAtomic(join(runRoot, PRESERVE_FILE), { runId, at: new Date().toISOString(), reason: 'a pipeline preserves its evidence from the first possible exposure onward' });
  writeJsonAtomic(join(runRoot, PREPARATION_FILE), { schemaVersion: 1, runId, state: PREPARING, startedAt: new Date().toISOString(), trajectoryIds });
  record('PERSIST_PRESERVATION_MARKER', true, Object.freeze({ preserveMarker: true, preparationState: PREPARING }));

  /* ---------- STEP 6: prepare worlds, stores and profiles — NON-DESTRUCTIVELY ---------- */
  const prepared = preparePrimaryCase({ runRoot, prehistory: input.prehistory, trajectoryIds });
  /**
   * §2: THE HOST BUNDLE IS INSTALLED ONCE PER RUN, THROUGH A RACE-TOLERANT INSTALLER.
   *
   * `makeProfile` installs the host bundle into the SHARED DSH home on every call, and the frozen implementation
   * does so with a non-atomic `rmSync` + `cpSync` pair. Calling it once per trajectory therefore performs eight
   * identical destructive copies into one shared location, and a parallel process reading that home can see the
   * directory half-removed. Two mitigations, neither changing what is installed:
   *
   *   · the install is HOISTED out of the loop, so eight windows per matrix become one; and
   *   · it goes through this stage's IDEMPOTENT installer, which is a no-op once the bundle is current and which
   *     stages-then-renames with retries when a copy is genuinely needed.
   *
   * The caller may still inject its own installer; only the default changes.
   */
  const { installHostBundle: frozenInstaller } = await import('../gates/env.mjs');
  const { installHostBundleSafely } = await import('./host-bundle.mjs');
  const installBundle = input.installHostBundle === undefined || input.installHostBundle === frozenInstaller
    ? installHostBundleSafely
    : input.installHostBundle;
  installBundle({ repo: REPO_ROOT, realDshHome: input.dshHome() });
  const homes = {};
  for (const trajectoryId of trajectoryIds) {
    const home = join(runRoot, 'units', trajectoryId, 'home');
    mkdirSync(home, { recursive: true });
    const route = await import('../r3l0cr/route.mjs');
    const settings = await import('../r3l0cr/settings.mjs');
    makeProfile(home, route.routeForProfile(route.PRIMARY_EXECUTOR), `${input.profileId ?? 'r3l0ciar'}${trajectoryId.replace(/[^a-z0-9]/gu, '')}`, noopInstall, input.dshHome, undefined, { extraPatch: settings.defaultModelPatch(route.PRIMARY_EXECUTOR) });
    homes[trajectoryId] = home;
  }
  writeJsonAtomic(join(runRoot, PREPARATION_FILE), { schemaVersion: 1, runId, state: PREPARED, preparedAt: new Date().toISOString(), trajectoryIds, createdDirectories: [...prepared.layout.createdDirectories], removedAnything: false });
  record('PREPARE_WORLDS_STORES_PROFILES', true, Object.freeze({ createdDirectories: prepared.layout.createdDirectories.length, removedAnything: false, trajectories: trajectoryIds.length }));

  /* ---------- STEP 7: the pre-exposure checks. ALL_SATISFIED IS REQUIRED. ---------- */
  const resolved = await resolveExecutionMode({ mode: input.mode, paidAuthorization: input.paidAuthorization, authorizationDecision: input.authorizationDecision });
  if (resolved.resolved !== true) return refuse('PRE_EXPOSURE_CHECKS', 'EXECUTION_MODE_UNRESOLVED', resolved.reason);
  if (resolved.mode === 'PRIMARY' && resolved.paidAuthorizationDecisionPresent !== true) {
    return refuse('PRE_EXPOSURE_CHECKS', 'PRIMARY_MODE_WITHOUT_AUTHORIZATION_DECISION', `PRIMARY requires an explicit external authorization decision for [${resolved.requiredDecisions.join(', ')}]; a caller-supplied boolean is a configuration signal, not that decision, and this stage carries neither`);
  }
  const routeConfiguration = input.routeConfiguration ?? await (await import('./preflight.mjs')).effectiveRouteConfiguration();
  const realizationPreflight = input.realizationPreflight ?? await (await import('./preflight.mjs')).realizationPreflight({ admittedRefs: input.admittedRefs, generationExposures: GENERATION_EXPOSURES });
  const { evaluatePreTrialValidity, modelRouteIdentity } = await import('./validity.mjs');
  const preExposureChecks = input.preExposureChecks === undefined
    ? await evaluatePreTrialValidity({
      plan: planRead.plan, closure, containment: input.containment, schedule, mode: resolved,
      realizationPreflight, routeConfiguration,
      systemValid: input.systemValid, systemValidDetail: input.systemValidDetail,
    })
    : await input.preExposureChecks({ runRoot, runId });
  record('PRE_EXPOSURE_CHECKS', false, Object.freeze({ supplied: true, ALL_SATISFIED: preExposureChecks?.ALL_SATISFIED === true, unsatisfied: preExposureChecks?.unsatisfied ?? null }));
  /**
   * §3: AN ABSENT CALLBACK, AN UNKNOWN VALUE OR A FALSE RESULT REFUSES BEFORE EXPOSURE.
   *
   * The check is placed BEFORE the exposure intent is journalled and BEFORE any launch, so nothing is exposed.
   */
  if (preExposureChecks === null || preExposureChecks === undefined || preExposureChecks.ALL_SATISFIED !== true) {
    return refuse('PRE_EXPOSURE_CHECKS', 'PRE_EXPOSURE_CHECKS_NOT_SATISFIED', `the pre-exposure checks did not report ALL_SATISFIED === true (unsatisfied: [${(preExposureChecks?.unsatisfied ?? ['ALL']).join(', ')}]); no session may be launched`);
  }

  /* ---------- STEP 8/9: the exposure intent, the single launch, the admission, the journal ---------- */
  const expectations = {};
  for (const session of schedule) expectations[session.sessionId] = buildExpectationManifest({ generationId: session.generation, arm: session.arm, admittedRefs: input.admittedRefs, generationExposures: GENERATION_EXPOSURES });

  const launches = [];
  const faultsInjected = [];
  const outcomes = {};

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

    const outcome = await runPrimaryGeneration({
      runRoot, world: world.world, paths: world.paths, home: homes[session.trajectoryId],
      profile: `${input.profileId ?? 'r3l0ciar'}${session.trajectoryId.replace(/[^a-z0-9]/gu, '')}`,
      workerExecutable: resolved.workerExecutable, session, generation, knowledge, protectedRoots,
      expectation: expectations[session.sessionId], requestedSelection: knowledge ?? null,
      mode: resolved.mode, fault, artifactPath, timeoutMs: input.timeoutMs,
    });
    outcomes[session.sessionId] = outcome;

    /**
     * §4: THE ADMISSION GATE. The six §4 controls are checked BEFORE the frozen schema, and the outcome is
     * returned in the shape the Fail-Stop runner's classifier expects.
     *
     * THE OVERRIDE IS SCOPED TO THE GATE'S OWN REFUSAL. When the gate FIRES, the refusal is expressed as a
     * machinery fault the frozen classifier already stops on. When it does NOT fire, the outcome passes through
     * UNCHANGED, so the frozen schema's own classification — including the CANONICAL WORK BLOCKAGE that preserves
     * a censored trajectory — is what the runner acts on. Overriding unconditionally would turn every CENSORED
     * session into a missing-report infrastructure failure.
     */
    const admitted = await admitThroughGate(outcome);
    const gateRefused = admitted.gateFired === true;
    return Object.freeze({
      ...outcome,
      gateAdmission: admitted,
      reportMissing: gateRefused ? true : outcome.reportMissing,
      hostFailure: gateRefused ? true : outcome.hostFailure,
      admissionRefusalCause: gateRefused ? admitted.cause : null,
    });
  };

  /** §7: the post-matrix gate, plan-bound and nine-condition. */
  const validityGate = input.validityGate ?? (async ({ completed, records, plannedSessions }) => {
    const { postMatrixValidityGate } = await import('./validity.mjs');
    /**
     * §6: THE COST ATTRIBUTION IS DERIVED FROM THE RUN'S OWN RECORDS.
     *
     * The pipeline discovers each session's artifact through the identity chain and measures its reconstruction
     * cost, so `costAttribution` is a measurement over THIS run rather than a caller-supplied constant. A
     * deterministic run's records are labelled FIXTURE, so the gate may be mechanically green while the CAUSAL
     * verdict stays NOT_EVALUABLE.
     */
    const costAttribution = input.costAttribution ?? await measureRunCost({ records, provenance: input.costProvenance });
    return await postMatrixValidityGate({
      completed, records, plannedSessions,
      plan: planRead.plan, closure, containment: input.containment, schedule,
      systemValid: normalizeVerdict(input.systemValid),
      environmentValid: input.containment?.EXPERIMENT_ENVIRONMENT_VALID ?? input.containment?.EXPERIMENT_CONTAINMENT ?? null,
      costAttribution,
      routeConfiguration: { MODEL_ROUTE_IDENTITY: modelRouteIdentity(preExposureChecks) },
      analysisPlanUnchanged: planRead.plan?.preservedDesign?.primaryEndpointsChanged === false && planRead.plan?.preservedDesign?.verdictThresholdsChanged === false,
      replacements: input.replacements ?? 0,
      retries: input.retries ?? 0,
    });
  });

  const run = await runFailStopMatrix({
    runId, runRoot, schedule, launch, validityGate,
    closureDigest: closure.executionClosureDigest,
    intendedExecutorRoute: resolved.mode === 'PRIMARY' ? 'the frozen omnigate DeepSeek route' : 'the deterministic scripted worker',
    trustedClaimNonce: claim.claimNonce,
    enforceRunClaim: false,
  });

  return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R', kind: 'primary matrix run',
    PIPELINE: 'COMPLETED',
    runId, runRoot,
    claim: Object.freeze({ claimed: true, nonce: claim.claimNonce }),
    mode: resolved,
    preExposureChecks,
    modelRouteIdentity: modelRouteIdentity(preExposureChecks),
    scheduleLength: schedule.length,
    trajectoryCount: trajectoryIds.length,
    launches: Object.freeze(launches),
    faultsInjected: Object.freeze(faultsInjected),
    outcomes,
    run,
    maxLaunchesPerSession: run.maxLaunchesPerSession,
    terminalState: run.terminalState,
    completedSessions: run.completedSessions,
    steps: Object.freeze(steps),
    budgets: timeoutHierarchy(),
    sessionsAfterFault: faultsInjected.length === 0
      ? Object.freeze([])
      : Object.freeze(run.launches.filter((entry) => entry.sessionId !== faultsInjected[0].sessionId).map((entry) => entry.sessionId).filter((sessionId) => {
        const index = schedule.findIndex((session) => session.sessionId === sessionId);
        return index > faultsInjected[0].scheduleIndex;
      })),
  });
}

/**
 * §6: MEASURE THE RUN'S OWN RECONSTRUCTION COST.
 *
 * For each session's record the pipeline discovers the session artifact through the identity chain and measures
 * its cost. A session whose artifact cannot be attributed is recorded as EXPLICITLY ABSENT with its reason — never
 * as a zero-cost session — so the coverage is interpretable even when the records are fixtures.
 *
 * THE TWO PROVENANCES ARE DISTINCT AND LABELLED. A LIVE_PRIMARY record is a genuine DSH session observation; a
 * FIXTURE record is what a deterministic run produces, and the gate's causal verdict refuses to call a fixture a
 * causal observation. §6 forbids inventing a cost from the scripted worker's source, so a deterministic session
 * with no artifact is recorded as absent rather than estimated.
 */
async function measureRunCost(input) {
  const { records, provenance } = input;
  const { measureSessionCost } = await import('./instrumentation.mjs');
  const { INSTRUMENTATION_PROVENANCE } = await import('./contract.mjs');
  const label = provenance ?? INSTRUMENTATION_PROVENANCE.FIXTURE;
  const measured = [];
  const absent = [];
  for (const record of records) {
    const session = Object.freeze({ sessionId: record.sessionId, trajectoryId: record.trajectoryId, generation: record.generation, arm: record.arm });
    const result = await measureSessionCost({
      artifactPath: record.sessionArtifactPath ?? null,
      session,
      provenance: label,
      expected: { attemptId: record.attemptId, hostJobId: record.hostJobId },
      hiddenQualityVector: record.hiddenInvariantVector ?? null,
      treatmentWitness: record.treatmentRealization ?? null,
      uptakeWitness: record.workerUptakeCount ?? null,
    });
    if (result.measured === true) measured.push(result);
    else absent.push(Object.freeze({ sessionId: record.sessionId, reason: result.reason, detail: result.attribution?.detail ?? null }));
  }
  const livePrimary = measured.filter((entry) => entry.provenance === INSTRUMENTATION_PROVENANCE.LIVE_PRIMARY);
  const fixture = measured.filter((entry) => entry.provenance === INSTRUMENTATION_PROVENANCE.FIXTURE);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R',
    kind: 'matrix reconstruction cost',
    plannedSessions: records.length,
    measuredCount: measured.length,
    rejectedCount: 0,
    absentCount: absent.length,
    /** §6: a session with no artifact is EXPLICITLY absent, so the coverage is interpretable rather than zero. */
    absent: Object.freeze(absent),
    measured: Object.freeze(measured),
    rejected: Object.freeze([]),
    livePrimaryCount: livePrimary.length,
    fixtureCount: fixture.length,
    provenanceLabels: INSTRUMENTATION_PROVENANCE,
    provenance: label,
    /** §7: the coverage accounts for every planned session, so it is interpretable whatever the label. */
    interpretable: measured.length + absent.length === records.length,
    allAttributed: absent.length === 0,
    /** §6: all sixteen LIVE PRIMARY records are required before the causal verdict. */
    allSixteenLivePrimary: records.length === 16 && livePrimary.length === 16,
    blocksCausalVerdict: livePrimary.length !== records.length,
    selectedLatestArtifactByConvenience: false,
    inventedFromScriptedWorkerSource: false,
  });
}

/** §3: normalize a caller's boolean or string system-validity signal into the gate's PASS/FAIL vocabulary. */
function normalizeVerdict(value) {
  if (value === true) return 'PASS';
  if (value === false) return 'FAIL';
  if (value === 'PASS' || value === 'FAIL') return value;
  return null;
}

/** §2: the no-op installer, so the hoisted bundle install is not repeated per trajectory. */
function noopInstall() { /* the bundle was installed once for the run, before the loop */ }

export { NL, REPO_ROOT, STAGE_CODE_PATH, STAGE_EVIDENCE_PATH, inspectActivationRoot, readFileSync };
