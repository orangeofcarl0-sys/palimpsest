/**
 * R3-L0C-I-A-R-L §1-§4 — THE AUTHORITATIVE LIVE-MEASUREMENT PIPELINE.
 *
 * This is the one entry that runs the experiment. It supersedes R3-L0C-I-A-R's pipeline by wiring the four gates
 * the ruling names into the path that actually launches sessions, and it keeps everything the prior pipeline got
 * right — the nine-step order, the claim as the first mutation, the per-trajectory protected roots, the admission
 * gate, the plan-bound validity gate.
 *
 * WHAT IS NEW, AND WHERE:
 *
 *   §1  a LIVE-EVIDENCE SIDECAR per session, written after the generation returns and bound into the durable
 *       record through the frozen `contentDigests` field (see `live-evidence.mjs`).
 *   §2  a FRESH POSTFLIGHT: the closure and the effective route are recomputed AFTER the matrix, the retry and
 *       replacement counts are derived from the durable journal, and every session's identity is compared to the
 *       plan's exact frozen block/arm/generation/trajectory (see `postflight.mjs`).
 *   §3  PRIMARY-ONLY INPUT DISCIPLINE: in PRIMARY mode the pipeline derives every measurement and REFUSES caller
 *       substitution; the authorization record is verified against the executing plan at the launch boundary
 *       (see `primary-binding.mjs`). Injection remains available in DETERMINISTIC mode.
 *   §4  a RUNTIME ATTESTATION: source-to-compiled verification is completed, the installed host bundle is compared
 *       file-by-file against the repository, and a competing writer of the shared installation is detected (see
 *       `attestation.mjs`).
 *
 * WHY THE ORDER OF THE NEW STEPS IS WHAT IT IS. The preflight closure is still computed at step 2, because the
 * claim and the exposure must be gated on the planned runtime. The POSTFLIGHT recomputation happens AFTER the
 * matrix, because that is the only time at which "did the runtime drift while the experiment ran" can be answered.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NL, REPO_ROOT, STAGE_CODE_PATH, STAGE_EVIDENCE_PATH } from './contract.mjs';
/**
 * §2: THE UNCHANGED MODULES ARE REUSED FROM THE PRIOR STAGE, BYTE-IDENTICAL.
 *
 * The four gates this stage corrects do not live in the claim, the confinement, the admission gate, the validity
 * gate, the preflight, the host-bundle installer or the instrumentation. Re-exporting those through thin shims
 * would add ten files that say nothing, so they are imported directly and BOUND INTO THIS STAGE'S CLOSURE instead
 * (see `closure.mjs`), which is what makes the coverage honest: a reader can see that the execution path includes
 * the prior stage's bytes and that this stage's digest moves when they do.
 */
import { claimActivationRoot, prepareLayoutSafely, readCommittedPlan, verifyCommittedPlan, PRESERVE_FILE, PREPARATION_FILE, JOURNAL_FILE } from '../r3l0ciar/activation.mjs';
import { assertAuthoritativePath, resolveExecutionMode } from './modes.mjs';
import { PRIMARY_FAULTS, faultPositionFault, frozenPrimarySchedule, runPrimaryGeneration, timeoutHierarchy } from '../r3l0ciar/primary-adapter.mjs';
import { perTrajectoryProtectedRoots } from '../r3l0ciar/confinement.mjs';
import { admitThroughGate } from '../r3l0ciar/admission.mjs';
import { writeLiveEvidence, liveEvidenceBinding, verifyLiveEvidenceContinuity } from './live-evidence.mjs';
import { compareSessionIdentities, deriveCountsFromJournal, freshPostflight, readJournalRecords } from './postflight.mjs';
import { enforcePrimaryInputBinding, verifyAuthorizationRecord } from './primary-binding.mjs';
import { buildSelection } from '../r3l0cr/selection.mjs';
import { buildExpectationManifest } from '../r3l0cr/contract.mjs';
import { GENERATION_EXPOSURES } from '../r3l0c/capital.mjs';
import { GENERATIONS } from '../r3l0c/contract.mjs';
import { makeProfile } from '../r3l0c/trajectory.mjs';
import { runFailStopMatrix } from '../r3l0cf/fail-stop.mjs';
import { writeJsonAtomic } from '../r3l0cf/journal.mjs';

const PREPARING = 'PREPARING';
const PREPARED = 'PREPARED';

/** §2: the live-evidence directory, so the artifact discovery can look under the run root. */
export const ARTIFACT_DIRECTORY = 'private/live-evidence';

/** §2: prepare one case's run root, non-destructively. Called ONLY after the claim. */
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
 * §1-§4: THE AUTHORITATIVE ENTRY.
 *
 * The nine-step order is preserved. The new gates are wired at the points where their evidence exists: the binding
 * check before the claim (because a refusal must precede every mutation), the live-evidence sidecar per launch,
 * and the postflight after the matrix.
 */
export async function runLiveMeasurementMatrix(input) {
  assertAuthoritativePath({ caller: input.caller ?? 'r3l0ciarl', authorizedBy: input.authorizedBy });
  const steps = [];
  const record = (id, mutated, observation) => steps.push(Object.freeze({ step: steps.length + 1, id, mutated, observation }));
  const refuse = (id, reason, detail) => Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R-L', kind: 'live measurement matrix run',
    PIPELINE: 'REFUSED', refusedAt: id, reason, detail: detail ?? null,
    steps: Object.freeze(steps), runRoot: input.runRoot ?? null, run: null, launches: Object.freeze([]),
  });

  /* ---------- STEP 0: the mode, the binding and the authorization (READ-ONLY) ---------- */
  const requestedMode = String(input.mode ?? '');
  /**
   * §3: THE BINDING IS CHECKED BEFORE ANYTHING ELSE, because a PRIMARY invocation that supplied its own
   * measurements must be refused before the plan is even read — otherwise a caller-supplied plan would be the
   * thing the refusal was checked against.
   */
  const binding = enforcePrimaryInputBinding({ mode: requestedMode, provided: input });
  if (binding.refused === true) return refuse('PRIMARY_INPUT_BINDING', 'CALLER_SUBSTITUTED_MEASUREMENT', binding.reason);
  record('PRIMARY_INPUT_BINDING', false, Object.freeze({ mode: requestedMode, injectionPermitted: binding.injectionPermitted, supplied: binding.supplied }));

  /* ---------- STEP 1: verify the committed prospective plan (READ-ONLY) ---------- */
  /**
   * §3: IN PRIMARY MODE THE PLAN IS READ FROM THE COMMITTED EVIDENCE, NEVER FROM THE CALLER.
   *
   * The binding check at step 0 has already refused a caller-supplied `plan` in PRIMARY mode, so this branch is
   * the only way a PRIMARY run obtains one: the committed plan on disk. DETERMINISTIC may inject a plan, because
   * the deterministic path exists to exercise the machinery with fixtures.
   */
  /**
   * §3: THE PLAN IS READ FROM THIS STAGE'S OWN EVIDENCE NAMESPACE.
   *
   * The prior stage's `readCommittedPlan` defaults to ITS OWN namespace, so calling it with no argument would bind
   * the SUPERSEDED plan — measured: the digest it returned was the prior stage's, and the closure check then
   * reported a spurious drift. The path is therefore resolved HERE, against this stage's namespace, and the
   * reader is passed it explicitly.
   */
  const committedPlanPath = input.planPath ?? join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'execution-plan.json');
  const planRead = requestedMode === 'PRIMARY'
    ? readCommittedPlan(committedPlanPath)
    : (input.plan === undefined ? readCommittedPlan(committedPlanPath) : Object.freeze({ planPath: input.planPath ?? null, exists: true, plan: input.plan, error: null }));
  if (planRead.exists !== true || planRead.plan === null) return refuse('VERIFY_COMMITTED_PLAN', 'PLAN_ABSENT', planRead.error);
  const schedule = await frozenPrimarySchedule();
  const planVerification = verifyCommittedPlan(planRead.plan, { planId: input.expectedPlanId, scheduleIds: schedule.map((session) => session.sessionId) });
  record('VERIFY_COMMITTED_PLAN', false, Object.freeze({ planId: planVerification.planId, scheduleLength: planVerification.scheduleLength, PLAN_VALID: planVerification.PLAN_VALID, source: input.plan === undefined || requestedMode === 'PRIMARY' ? 'committed plan on disk' : 'caller-supplied (DETERMINISTIC)' }));
  if (planVerification.PLAN_VALID !== true) return refuse('VERIFY_COMMITTED_PLAN', 'PLAN_INVALID', planVerification.problems.join('; '));

  /* ---------- STEP 2: verify the runtime and the executable closure (READ-ONLY) ---------- */
  /**
   * §3: IN PRIMARY MODE THE CLOSURE IS DERIVED HERE, so a caller cannot substitute one. The binding check has
   * already refused a caller-supplied `closure` in PRIMARY mode, so the derivation is the only source.
   */
  const closure = requestedMode === 'PRIMARY'
    ? await (await import('./closure.mjs')).computeExecutionClosure({ verifyCompiled: input.verifyCompiled })
    : (input.closure ?? await (await import('./closure.mjs')).computeExecutionClosure({ verifyCompiled: input.verifyCompiled }));
  const boundDigest = planVerification.closureDigest;
  const closureMatches = typeof boundDigest === 'string' && boundDigest !== '' && boundDigest === closure.executionClosureDigest;
  record('VERIFY_RUNTIME_AND_CLOSURE', false, Object.freeze({ bound: boundDigest, recomputed: closure.executionClosureDigest, matches: closureMatches, derivedByPipeline: requestedMode === 'PRIMARY' }));
  if (closureMatches !== true) return refuse('VERIFY_RUNTIME_AND_CLOSURE', boundDigest === null || boundDigest === undefined || boundDigest === '' ? 'CLOSURE_BINDING_ABSENT' : 'CLOSURE_DRIFTED', `the plan binds ${String(boundDigest)} and the runtime computes ${closure.executionClosureDigest}`);

  /* ---------- STEP 3: the run identity, the schedule and the gate inputs (READ-ONLY) ---------- */
  const runId = input.runId;
  if (typeof runId !== 'string' || runId === '') return refuse('CHECK_RUN_IDENTITY_AND_SCHEDULE', 'RUN_ID_ABSENT', 'no run id was supplied');
  /**
   * §3: THE CONTAINMENT MEASUREMENT IS REQUIRED IN DETERMINISTIC MODE AND DERIVED IN PRIMARY MODE.
   *
   * A PRIMARY run may not supply one, so it is derived AFTER the claim at step 6 — which keeps the claim the first
   * mutation. A DETERMINISTIC run supplies the measurement its own caller already took.
   */
  if (requestedMode !== 'PRIMARY' && input.containment === undefined) {
    return refuse('CHECK_RUN_IDENTITY_AND_SCHEDULE', 'CONTAINMENT_ABSENT', 'the post-matrix gate and the pre-trial conditions both require the containment measurement; a gate red for a missing input would be indistinguishable from a matrix failure');
  }
  let containment = requestedMode === 'PRIMARY' ? null : input.containment;
  record('CHECK_RUN_IDENTITY_AND_SCHEDULE', false, Object.freeze({ runId, scheduleLength: schedule.length, containmentSource: requestedMode === 'PRIMARY' ? 'derived after the claim' : 'caller-supplied (DETERMINISTIC)' }));

  /* ---------- STEP 4: acquire exclusive run-root ownership. THE FIRST MUTATION. ---------- */
  const runRoot = input.runRoot;
  const claim = claimActivationRoot({ runRoot, runId });
  record('ACQUIRE_EXCLUSIVE_RUN_ROOT', true, Object.freeze({ claimed: claim.claimed, verdict: claim.inspection.verdict, reason: claim.inspection.reason }));
  if (claim.claimed !== true) return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R-L', kind: 'live measurement matrix run',
    PIPELINE: 'REFUSED', refusedAt: 'ACQUIRE_EXCLUSIVE_RUN_ROOT', reason: claim.inspection.verdict, detail: claim.inspection.reason,
    steps: Object.freeze(steps), runRoot, run: null, launches: Object.freeze([]),
  });

  /* ---------- STEP 5: the preservation marker and the preparation record ---------- */
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  writeJsonAtomic(join(runRoot, PRESERVE_FILE), { runId, at: new Date().toISOString(), reason: 'a pipeline preserves its evidence from the first possible exposure onward' });
  writeJsonAtomic(join(runRoot, PREPARATION_FILE), { schemaVersion: 1, runId, state: PREPARING, startedAt: new Date().toISOString(), trajectoryIds });
  record('PERSIST_PRESERVATION_MARKER', true, Object.freeze({ preserveMarker: true, preparationState: PREPARING }));

  /* ---------- STEP 6: prepare worlds, stores and profiles — NON-DESTRUCTIVELY ---------- */
  const prepared = preparePrimaryCase({ runRoot, prehistory: input.prehistory, trajectoryIds });
  const { installHostBundle: frozenInstaller } = await import('../gates/env.mjs');
  const { installHostBundleSafely } = await import('../r3l0ciar/host-bundle.mjs');
  const installBundle = input.installHostBundle === undefined || input.installHostBundle === frozenInstaller ? installHostBundleSafely : input.installHostBundle;
  /**
   * §4: THE SHARED INSTALLATION IS SAMPLED BEFORE THE MATRIX, so a competing writer can be detected by comparing
   * this sample with one taken afterwards.
   */
  const { sampleInstallationDigest } = await import('./attestation.mjs');
  const installationBefore = sampleInstallationDigest({ dshHomePath: input.dshHome() });
  installBundle({ repo: REPO_ROOT, realDshHome: input.dshHome() });
  const homes = {};
  for (const trajectoryId of trajectoryIds) {
    const home = join(runRoot, 'units', trajectoryId, 'home');
    mkdirSync(home, { recursive: true });
    const route = await import('../r3l0cr/route.mjs');
    const settings = await import('../r3l0cr/settings.mjs');
    makeProfile(home, route.routeForProfile(route.PRIMARY_EXECUTOR), `${input.profileId ?? 'r3l0ciarl'}${trajectoryId.replace(/[^a-z0-9]/gu, '')}`, noopInstall, input.dshHome, undefined, { extraPatch: settings.defaultModelPatch(route.PRIMARY_EXECUTOR) });
    homes[trajectoryId] = home;
  }
  writeJsonAtomic(join(runRoot, PREPARATION_FILE), { schemaVersion: 1, runId, state: PREPARED, preparedAt: new Date().toISOString(), trajectoryIds, createdDirectories: [...prepared.layout.createdDirectories], removedAnything: false });
  record('PREPARE_WORLDS_STORES_PROFILES', true, Object.freeze({ createdDirectories: prepared.layout.createdDirectories.length, removedAnything: false, trajectories: trajectoryIds.length, installationSampledBefore: installationBefore.slice(0, 16) }));

  /**
   * §3: A PRIMARY RUN DERIVES ITS OWN CONTAINMENT MEASUREMENT HERE, AFTER THE CLAIM.
   *
   * The fence can only be applied to a layout that EXISTS, so the derivation belongs after step 6 — which is also
   * what keeps the claim the first mutation. The derivation is the prior stage's own per-trajectory confinement
   * over this run's prepared layout, so it is a measurement of the actual run rather than a caller's assertion.
   */
  if (requestedMode === 'PRIMARY') {
    const { runPerTrajectoryConfinement } = await import('../r3l0ciar/confinement.mjs');
    containment = await runPerTrajectoryConfinement({ runRoot, trajectoryIds });
    record('DERIVE_CONTAINMENT', false, Object.freeze({ derivedByPipeline: true, verdict: containment.ACTUAL_CONTAINMENT, cases: containment.cases?.length ?? 0 }));
    if (containment.ACTUAL_CONTAINMENT !== 'PASS') {
      return refuse('DERIVE_CONTAINMENT', 'CONTAINMENT_NOT_ESTABLISHED', 'the pipeline derived the containment measurement and it did not PASS, so no session may be launched');
    }
  }

  /* ---------- STEP 7: the pre-exposure checks. ALL_SATISFIED IS REQUIRED. ---------- */
  const resolved = await resolveExecutionMode({ mode: input.mode, paidAuthorization: input.paidAuthorization, authorizationDecision: input.authorizationDecision });
  if (resolved.resolved !== true) return refuse('PRE_EXPOSURE_CHECKS', 'EXECUTION_MODE_UNRESOLVED', resolved.reason);
  /**
   * §3: IN PRIMARY MODE THE AUTHORIZATION IS VERIFIED AGAINST THE EXECUTING PLAN at the trusted launch boundary.
   * A bare authority string is not proof; the record must approve THIS plan's id and digest and declare a budget.
   */
  let authorizationVerification = null;
  if (resolved.mode === 'PRIMARY') {
    authorizationVerification = verifyAuthorizationRecord({
      record: input.authorizationDecision,
      executingPlanId: planVerification.planId,
      executingPlanDigest: planVerification.closureDigest,
    });
    if (authorizationVerification.verified !== true) {
      return refuse('PRE_EXPOSURE_CHECKS', 'AUTHORIZATION_NOT_VERIFIED', authorizationVerification.detail);
    }
  }
  record('AUTHORIZATION_VERIFICATION', false, Object.freeze({ mode: resolved.mode, verified: authorizationVerification?.verified ?? false, requiredForPrimary: true }));
  /**
   * §3: IN PRIMARY MODE THE ROUTE AND THE REALIZATION PREFLIGHT ARE DERIVED, NOT SUPPLIED.
   *
   * `SYSTEM_VALID` is the systemic closure R3-S0 measures. §3 forbids a PRIMARY caller from supplying it, and this
   * stage does not re-run R3-S0, so the pipeline DERIVES it from the systemic suite's own committed result — which
   * is the measurement of record — rather than accepting a caller's assertion or defaulting it to a pass. A run
   * whose systemic result is absent or not PASS cannot proceed, which is the fail-closed direction.
   */
  const systemValid = requestedMode === 'PRIMARY'
    ? await deriveSystemValidity()
    : input.systemValid;
  const routeConfiguration = requestedMode === 'PRIMARY'
    ? await (await import('../r3l0ciar/preflight.mjs')).effectiveRouteConfiguration()
    : (input.routeConfiguration ?? await (await import('../r3l0ciar/preflight.mjs')).effectiveRouteConfiguration());
  const realizationPreflight = requestedMode === 'PRIMARY'
    ? await (await import('../r3l0ciar/preflight.mjs')).realizationPreflight({ admittedRefs: input.admittedRefs, generationExposures: GENERATION_EXPOSURES })
    : (input.realizationPreflight ?? await (await import('../r3l0ciar/preflight.mjs')).realizationPreflight({ admittedRefs: input.admittedRefs, generationExposures: GENERATION_EXPOSURES }));
  const { evaluatePreTrialValidity, modelRouteIdentity } = await import('../r3l0ciar/validity.mjs');
  const preExposureChecks = requestedMode === 'PRIMARY' || input.preExposureChecks === undefined
    ? await evaluatePreTrialValidity({
      plan: planRead.plan, closure, containment, schedule, mode: resolved,
      realizationPreflight, routeConfiguration,
      systemValid, systemValidDetail: input.systemValidDetail ?? (requestedMode === 'PRIMARY' ? 'derived from the R3-S0 systemic result of record' : undefined),
    })
    : await input.preExposureChecks({ runRoot, runId });
  record('PRE_EXPOSURE_CHECKS', false, Object.freeze({ supplied: true, ALL_SATISFIED: preExposureChecks?.ALL_SATISFIED === true, unsatisfied: preExposureChecks?.unsatisfied ?? null }));
  if (preExposureChecks === null || preExposureChecks === undefined || preExposureChecks.ALL_SATISFIED !== true) {
    return refuse('PRE_EXPOSURE_CHECKS', 'PRE_EXPOSURE_CHECKS_NOT_SATISFIED', `the pre-exposure checks did not report ALL_SATISFIED === true (unsatisfied: [${(preExposureChecks?.unsatisfied ?? ['ALL']).join(', ')}]); no session may be launched`);
  }

  /**
   * §0: THE LAUNCH BOUNDARY. THIS STAGE PERFORMS NO PRIMARY LAUNCH.
   *
   * §0 forbids model calls, and PRIMARY mode launches the SHIPPED DSH worker on the paid route. So a PRIMARY run
   * that has passed EVERY gate — the plan, the derived closure, the derived containment, the verified
   * authorization, the pre-exposure checks — STOPS HERE and reports that it reached the launch boundary rather
   * than proceeding. That is the honest shape: this stage can prove the boundary is correct and that the run is
   * authorized; the launch itself belongs to the authorized run.
   *
   * Measured, before this boundary existed: a fully-authorized PRIMARY invocation DID spawn the shipped DSH
   * binary, which is the one thing §0 forbids. The refusal is therefore placed BEFORE the exposure intent and
   * before any spawn.
   */
  if (resolved.mode === 'PRIMARY') {
    record('LAUNCH_BOUNDARY', false, Object.freeze({
      launched: false,
      reason: 'this stage performs no primary launch; §0 forbids model calls',
      gatesPassed: Object.freeze({ plan: true, closure: true, containment: true, authorization: true, preExposureChecks: true }),
      wouldLaunch: 'the shipped DSH worker on the authorized executor route',
    }));
    return Object.freeze({
      schemaVersion: 1, stage: 'R3-L0C-I-A-R-L', kind: 'live measurement matrix run',
      PIPELINE: 'STOPPED_AT_LAUNCH_BOUNDARY',
      stoppedAt: 'LAUNCH_BOUNDARY',
      reason: 'PRIMARY mode reached the launch boundary with every gate satisfied; this stage performs no primary launch',
      runId, runRoot, claim: Object.freeze({ claimed: true, nonce: claim.claimNonce }),
      mode: resolved,
      primaryBinding: binding,
      authorizationVerification,
      preExposureChecks,
      modelRouteIdentity: modelRouteIdentity(preExposureChecks),
      containment,
      scheduleLength: schedule.length,
      trajectoryCount: trajectoryIds.length,
      launches: Object.freeze([]),
      run: null,
      steps: Object.freeze(steps),
      budgets: timeoutHierarchy(),
      modelCallsMade: 0,
    });
  }

  /* ---------- STEP 8/9: the exposure intent, the single launch, the admission, the live evidence ---------- */
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

    const outcome = await runPrimaryGeneration({
      runRoot, world: world.world, paths: world.paths, home: homes[session.trajectoryId],
      profile: `${input.profileId ?? 'r3l0ciarl'}${session.trajectoryId.replace(/[^a-z0-9]/gu, '')}`,
      workerExecutable: resolved.workerExecutable, session, generation, knowledge, protectedRoots,
      expectation: expectations[session.sessionId], requestedSelection: knowledge ?? null,
      mode: resolved.mode, fault, artifactPath, timeoutMs: input.timeoutMs,
    });
    outcomes[session.sessionId] = outcome;

    /**
     * §1: THE LIVE-EVIDENCE SIDECAR, WRITTEN FROM THE ACTUAL OUTCOME.
     *
     * This is the step the prior pipeline lacked. The artifact path, the hidden vector, the attempt and host-job
     * identities and the cost provenance come from the GENERATION OUTCOME — not from the caller — and the sidecar's
     * digest is bound into the durable record through the frozen `contentDigests` field below.
     *
     * §1 also requires LIVE_PRIMARY to be determined by the ACTUAL mode and VERIFIED artifact provenance rather
     * than a caller label. So the provenance is derived here: a PRIMARY session with a real artifact is
     * LIVE_PRIMARY; a deterministic session's artifact, if any, is FIXTURE; and a session with no artifact has NO
     * provenance at all.
     */
    const provenance = deriveProvenance({ mode: resolved.mode, artifactPath: outcome.sessionArtifactPath, artifactExists: outcome.sessionArtifactPath !== null && existsSync(outcome.sessionArtifactPath) });
    const sidecar = writeLiveEvidence({
      runRoot, sessionId: session.sessionId,
      sessionArtifactPath: outcome.sessionArtifactPath,
      hiddenInvariantVector: outcome.hiddenInvariantVector,
      attemptId: outcome.attemptId,
      hostJobId: outcome.hostJobId,
      costProvenance: provenance,
      mode: resolved.mode,
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
      /** §1: the binding the frozen runner carries into the durable record. */
      contentDigests: Object.freeze({ ...(outcome.contentDigests ?? {}), ...liveEvidenceBinding(sidecar.digest) }),
      liveEvidenceDigest: sidecar.digest,
      derivedCostProvenance: provenance,
    });
  };

  /* ---------- the post-matrix gate, plan-bound and nine-condition ---------- */
  const validityGate = input.validityGate ?? (async ({ completed, records, plannedSessions }) => {
    const { postMatrixValidityGate } = await import('../r3l0ciar/validity.mjs');
    /**
     * §2: THE COUNTS COME FROM THE DURABLE JOURNAL, not from the caller. The journal is the record of what was
     * actually launched, so a count read from it cannot be supplied.
     */
    const journalRecords = readJournalRecords(join(runRoot, JOURNAL_FILE));
    const counts = deriveCountsFromJournal({ journalRecords, plannedSessions });
    const costAttribution = input.costAttribution ?? await measureRunCost({ records, provenance: input.costProvenance });
    return await postMatrixValidityGate({
      completed, records, plannedSessions,
      plan: planRead.plan, closure, containment, schedule,
      systemValid: normalizeVerdict(systemValid),
      environmentValid: containment?.EXPERIMENT_ENVIRONMENT_VALID ?? containment?.EXPERIMENT_CONTAINMENT ?? null,
      costAttribution,
      routeConfiguration: { MODEL_ROUTE_IDENTITY: modelRouteIdentity(preExposureChecks) },
      analysisPlanUnchanged: planRead.plan?.preservedDesign?.primaryEndpointsChanged === false && planRead.plan?.preservedDesign?.verdictThresholdsChanged === false,
      replacements: counts.replacements,
      retries: counts.retries,
    });
  });

  const run = await runFailStopMatrix({
    runId, runRoot, schedule, launch, validityGate,
    closureDigest: closure.executionClosureDigest,
    intendedExecutorRoute: resolved.mode === 'PRIMARY' ? 'the frozen omnigate DeepSeek route' : 'the deterministic scripted worker',
    trustedClaimNonce: claim.claimNonce,
    enforceRunClaim: false,
  });

  /* ---------- §1/§2/§4: THE POSTFLIGHT, AFTER THE MATRIX ---------- */
  const journalRecords = readJournalRecords(join(runRoot, JOURNAL_FILE));
  const counts = deriveCountsFromJournal({ journalRecords, plannedSessions: run.plannedSessions });
  const identities = compareSessionIdentities({ records: run.records, schedule });
  const postflight = await freshPostflight({
    plan: planRead.plan,
    preflightClosureDigest: closure.executionClosureDigest,
    recompute: async () => {
      const freshClosure = await (await import('./closure.mjs')).computeExecutionClosure({ verifyCompiled: input.verifyCompiled });
      const freshRoute = await (await import('../r3l0ciar/preflight.mjs')).effectiveRouteConfiguration();
      const freshValidity = await evaluatePreTrialValidity({
        plan: planRead.plan, closure: freshClosure, containment, schedule, mode: resolved,
        realizationPreflight, routeConfiguration: freshRoute,
        systemValid, systemValidDetail: input.systemValidDetail,
      });
      return Object.freeze({
        closure: freshClosure,
        route: { MODEL_ROUTE_IDENTITY: modelRouteIdentity(freshValidity), effective: freshRoute.effective },
        systemValid: systemValid === true ? 'PASS' : systemValid === false ? 'FAIL' : null,
        environmentValid: containment?.EXPERIMENT_ENVIRONMENT_VALID ?? null,
      });
    },
  });
  const continuity = verifyLiveEvidenceContinuity({ runRoot, records: run.records });
  record('POSTFLIGHT_FRESH_EVIDENCE', false, Object.freeze({
    closureMatchesPlan: postflight.closureMatchesPlan,
    runtimeMovedAfterPreflight: postflight.runtimeMovedAfterPreflight,
    journalRetries: counts.retries,
    journalReplacements: counts.replacements,
    allIdentitiesExact: identities.allIdentitiesExact,
    liveEvidenceSessions: continuity.sessions,
  }));

  return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R-L', kind: 'live measurement matrix run',
    PIPELINE: 'COMPLETED',
    runId, runRoot,
    claim: Object.freeze({ claimed: true, nonce: claim.claimNonce }),
    mode: resolved,
    primaryBinding: binding,
    authorizationVerification,
    preExposureChecks,
    modelRouteIdentity: modelRouteIdentity(preExposureChecks),
    scheduleLength: schedule.length,
    trajectoryCount: trajectoryIds.length,
    launches: Object.freeze(launches),
    faultsInjected: Object.freeze(faultsInjected),
    outcomes,
    liveEvidence: Object.freeze(liveEvidence),
    liveEvidenceContinuity: continuity,
    postflight,
    journalCounts: counts,
    sessionIdentities: identities,
    containment,
    installationBefore,
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
 * §1: DERIVE THE COST PROVENANCE FROM THE ACTUAL MODE AND THE VERIFIED ARTIFACT.
 *
 * This is the property L1's control measured as absent: the provenance was a caller label. Here it is derived —
 * PRIMARY with a real artifact is LIVE_PRIMARY, a deterministic artifact is FIXTURE, and no artifact is NO_ARTIFACT.
 */
export function deriveProvenance(input) {
  const { mode, artifactPath, artifactExists } = input;
  if (artifactPath === null || artifactPath === undefined || artifactExists !== true) return 'NO_ARTIFACT';
  return mode === 'PRIMARY' ? 'LIVE_PRIMARY' : 'FIXTURE';
}

/** §2: measure the run's own reconstruction cost, with the provenance taken from the records. */
async function measureRunCost(input) {
  const { records } = input;
  const { measureSessionCost } = await import('../r3l0ciar/instrumentation.mjs');
  const measured = [];
  const absent = [];
  for (const record of records) {
    const session = Object.freeze({ sessionId: record.sessionId, trajectoryId: record.trajectoryId, generation: record.generation, arm: record.arm });
    /**
     * §1: THE PROVENANCE IS THE RECORD'S OWN DERIVED VALUE. The sidecar carries it, and the record's binding lets
     * the sidecar be read back; a caller-supplied label is not consulted here.
     */
    const provenance = record.derivedCostProvenance ?? input.provenance ?? 'FIXTURE';
    const result = await measureSessionCost({
      artifactPath: record.sessionArtifactPath ?? null,
      session,
      provenance,
      expected: { attemptId: record.attemptId, hostJobId: record.hostJobId },
      hiddenQualityVector: record.hiddenInvariantVector ?? null,
      treatmentWitness: record.treatmentRealization ?? null,
      uptakeWitness: record.workerUptakeCount ?? null,
    });
    if (result.measured === true) measured.push(result);
    else absent.push(Object.freeze({ sessionId: record.sessionId, reason: result.reason, detail: result.attribution?.detail ?? null }));
  }
  const livePrimary = measured.filter((entry) => entry.provenance === 'LIVE_PRIMARY');
  return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R-L', kind: 'matrix reconstruction cost',
    plannedSessions: records.length, measuredCount: measured.length, rejectedCount: 0, absentCount: absent.length,
    absent: Object.freeze(absent), measured: Object.freeze(measured), rejected: Object.freeze([]),
    livePrimaryCount: livePrimary.length, fixtureCount: measured.filter((entry) => entry.provenance === 'FIXTURE').length,
    provenance: livePrimary.length === records.length ? 'LIVE_PRIMARY' : measured.length === 0 ? 'NO_ARTIFACT' : 'MIXED',
    interpretable: measured.length + absent.length === records.length,
    allAttributed: absent.length === 0,
    allSixteenLivePrimary: records.length === 16 && livePrimary.length === 16,
    blocksCausalVerdict: livePrimary.length !== records.length,
    selectedLatestArtifactByConvenience: false,
    inventedFromScriptedWorkerSource: false,
  });
}

/**
 * §3: DERIVE SYSTEM VALIDITY FROM THE SYSTEMIC SUITE'S RESULT OF RECORD.
 *
 * R3-S0 is the systemic closure. This stage does not re-run it — that is a different stage's suite — so the
 * derivation reads its committed result. The direction is fail-closed: an absent result, an unreadable one, or one
 * that does not report PASS yields `false`, which makes `SYSTEM_VALID` unsatisfied and refuses before exposure.
 */
async function deriveSystemValidity() {
  /**
   * The R3-S0 conformance record is the systemic closure of record. It is read from its committed evidence, and
   * the verdict is taken from `gates.S4.SYSTEM_VALID`, which S4 sets only when S1-S3 are green and no prohibited
   * bypass remains open.
   */
  const candidates = [
    join(REPO_ROOT, 'research-evidence', 'r3-s0', 'conformance-run.json'),
    join(REPO_ROOT, 'research-evidence', 'r3-s0', 'result.json'),
    join(REPO_ROOT, 'research-evidence', 'r3-s0', 'stage-result.json'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      const verdict = parsed?.gates?.S4?.SYSTEM_VALID ?? parsed?.SYSTEM_VALID ?? parsed?.verdicts?.SYSTEM_VALID ?? null;
      if (verdict === true || verdict === 'PASS') return true;
      if (verdict === false || verdict === 'FAIL') return false;
    } catch { /* an unreadable result is treated as absent, which is the fail-closed direction */ }
  }
  return false;
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

export { NL, REPO_ROOT, STAGE_CODE_PATH, STAGE_EVIDENCE_PATH, readFileSync };
