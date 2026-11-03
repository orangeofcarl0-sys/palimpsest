/**
 * R3-L0C-I-A-R-L-C §3-§6 — THE AUTHORITATIVE ADMISSION-CLOSURE PIPELINE.
 *
 * This is the one entry that runs the experiment. It supersedes the R3-L0C-I-A-R-L pipeline by wiring the four
 * gates the ruling names into the path that actually launches sessions, and it keeps everything the prior pipeline
 * got right — the ordered steps, the claim as the first mutation, the per-trajectory protected roots, the admission
 * gate, the live-evidence sidecar and the plan-bound pre-trial validity.
 *
 * WHAT IS NEW, AND WHERE:
 *
 *   §3 Gate A  the DURABLE COST BRIDGE: after the matrix, the cost is measured from the DURABLE journal by
 *              resolving the sidecar binding each record carries (see `cost-bridge.mjs`).
 *   §4 Gate B  the AUTHORITATIVE TERMINAL ADMISSION: the runner's own `validityGate` callback is the SINGLE
 *              reducer, and it reads the journal, recomputes the closure and route, samples S2, verifies the
 *              in-run attestation and evaluates the frozen post-matrix gate BEFORE the runner writes its
 *              completion decision (see `postmatrix-admission.mjs`).
 *   §5 Gate C  the TRUST BOUNDARY: PRIMARY derives every measurement and reads every trusted host input from a
 *              trusted boundary; the authority is verified against a separately controlled source, and with none
 *              the verdict is AUTHORITY_NOT_ESTABLISHED (see `trust-boundary.mjs`).
 *   §6 Gate D  the IN-RUN ATTESTATION: S0 before the run's own install, S1 after it and before the matrix, S2
 *              after the matrix and before admission; S1 must match the expected bundle and S2 must match S1 (see
 *              `attestation.mjs`).
 *
 * WHY THE ORDER OF THE NEW STEPS IS WHAT IT IS. The preflight closure is still computed before the claim is
 * consumed, because the exposure must be gated on the planned runtime. The S2 sample and the closure
 * recomputation happen INSIDE the validity gate, because that is the last instant before the runner decides — and
 * that is exactly the instant at which §4's mutation becomes visible.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NL, REPO_ROOT, STAGE_CODE_PATH, STAGE_EVIDENCE_PATH } from './contract.mjs';
/**
 * §7: THE UNCHANGED MODULES ARE REUSED FROM THE PRIOR CHAIN, BYTE-IDENTICAL.
 *
 * The four gates this stage corrects do not live in the claim, the confinement, the admission gate, the validity
 * gate, the preflight, the host-bundle installer, the instrumentation or the sidecar writer. Re-exporting those
 * through thin shims would add files that say nothing, so they are imported directly and BOUND INTO THIS STAGE'S
 * CLOSURE instead (see `closure.mjs`), which is what makes the coverage honest.
 */
import { claimActivationRoot, prepareLayoutSafely, readCommittedPlan, verifyCommittedPlan, PRESERVE_FILE, PREPARATION_FILE, JOURNAL_FILE } from '../r3l0ciar/activation.mjs';
import { assertAuthoritativePath, resolveExecutionMode } from './modes.mjs';
import { PRIMARY_FAULTS, faultPositionFault, frozenPrimarySchedule, runPrimaryGeneration, timeoutHierarchy } from '../r3l0ciar/primary-adapter.mjs';
import { perTrajectoryProtectedRoots } from '../r3l0ciar/confinement.mjs';
import { admitThroughGate } from '../r3l0ciar/admission.mjs';
import { writeLiveEvidence, liveEvidenceBinding, verifyLiveEvidenceContinuity } from '../r3l0ciarl/live-evidence.mjs';
import { compareSessionIdentities, deriveCountsFromJournal, readJournalRecords } from '../r3l0ciarl/postflight.mjs';
import { enforcePrimaryInputBinding, verifyExternalAuthority, trustedHostConfiguration } from './trust-boundary.mjs';
import { bridgeMatrixCost } from './cost-bridge.mjs';
import { inRunAttestation, sampleInstallationDigest } from './attestation.mjs';
import { authoritativeTerminalAdmission } from './postmatrix-admission.mjs';
import { buildSelection } from '../r3l0cr/selection.mjs';
import { buildExpectationManifest } from '../r3l0cr/contract.mjs';
import { GENERATION_EXPOSURES } from '../r3l0c/capital.mjs';
import { GENERATIONS } from '../r3l0c/contract.mjs';
import { makeProfile } from '../r3l0c/trajectory.mjs';
import { runFailStopMatrix } from '../r3l0cf/fail-stop.mjs';
import { readJournal, writeJsonAtomic } from '../r3l0cf/journal.mjs';

const PREPARING = 'PREPARING';
const PREPARED = 'PREPARED';

/** §3: the live-evidence directory, so the cost bridge can resolve the binding under the run root. */
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
 * §3-§6: THE AUTHORITATIVE ENTRY.
 *
 * The ordered steps are preserved. The four gates are wired at the points where their evidence exists: the binding
 * check before anything, the claim as the first mutation, S0/S1 around the run's own install, and the S2 sample
 * plus the closure recomputation inside the terminal-admission callback.
 */
export async function runAdmissionClosureMatrix(input) {
  assertAuthoritativePath({ caller: input.caller ?? 'r3l0ciarlc', authorizedBy: input.authorizedBy });
  const steps = [];
  const record = (id, mutated, observation) => steps.push(Object.freeze({ step: steps.length + 1, id, mutated, observation }));
  const refuse = (id, reason, detail) => Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R-L-C', kind: 'admission closure matrix run',
    PIPELINE: 'REFUSED', refusedAt: id, reason, detail: detail ?? null,
    steps: Object.freeze(steps), runRoot: input.runRoot ?? null, run: null, launches: Object.freeze([]),
  });

  /* ---------- STEP 0: the binding (READ-ONLY, BEFORE ANYTHING ELSE) ---------- */
  const requestedMode = String(input.mode ?? '');
  const binding = enforcePrimaryInputBinding({ mode: requestedMode, provided: input });
  if (binding.refused === true) return refuse('PRIMARY_INPUT_BINDING', 'CALLER_SUBSTITUTED_MEASUREMENT', binding.reason);
  record('PRIMARY_INPUT_BINDING', false, Object.freeze({ mode: requestedMode, injectionPermitted: binding.injectionPermitted, supplied: binding.supplied }));

  /* ---------- STEP 1: the committed prospective plan (READ-ONLY) ---------- */
  const committedPlanPath = input.planPath ?? join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'execution-plan.json');
  const planRead = requestedMode === 'PRIMARY'
    ? readCommittedPlan(committedPlanPath)
    : (input.plan === undefined ? readCommittedPlan(committedPlanPath) : Object.freeze({ planPath: input.planPath ?? null, exists: true, plan: input.plan, error: null }));
  if (planRead.exists !== true || planRead.plan === null) return refuse('VERIFY_COMMITTED_PLAN', 'PLAN_ABSENT', planRead.error);
  const schedule = await frozenPrimarySchedule();
  const planVerification = verifyCommittedPlan(planRead.plan, { planId: input.expectedPlanId, scheduleIds: schedule.map((session) => session.sessionId) });
  record('VERIFY_COMMITTED_PLAN', false, Object.freeze({ planId: planVerification.planId, scheduleLength: planVerification.scheduleLength, PLAN_VALID: planVerification.PLAN_VALID, source: requestedMode === 'PRIMARY' || input.plan === undefined ? 'committed plan on disk' : 'caller-supplied (DETERMINISTIC)' }));
  if (planVerification.PLAN_VALID !== true) return refuse('VERIFY_COMMITTED_PLAN', 'PLAN_INVALID', planVerification.problems.join('; '));

  /* ---------- STEP 2: the runtime and the executable closure (READ-ONLY) ---------- */
  /**
   * §5: IN PRIMARY MODE THE SOURCE-TO-COMPILED VERIFICATION IS ENABLED BY THE PIPELINE, not taken from a caller. A
   * skipped verification is never a PRIMARY attestation pass, so the pipeline does not permit the caller to turn
   * it off.
   */
  const verifyCompiled = requestedMode === 'PRIMARY' ? true : input.verifyCompiled;
  const closure = requestedMode === 'PRIMARY'
    ? await (await import('./closure.mjs')).computeExecutionClosure({ verifyCompiled })
    : (input.closure ?? await (await import('./closure.mjs')).computeExecutionClosure({ verifyCompiled }));
  const boundDigest = planVerification.closureDigest;
  const closureMatches = typeof boundDigest === 'string' && boundDigest !== '' && boundDigest === closure.executionClosureDigest;
  record('VERIFY_RUNTIME_AND_CLOSURE', false, Object.freeze({ bound: boundDigest, recomputed: closure.executionClosureDigest, matches: closureMatches, derivedByPipeline: requestedMode === 'PRIMARY' }));
  if (closureMatches !== true) return refuse('VERIFY_RUNTIME_AND_CLOSURE', boundDigest === null || boundDigest === undefined || boundDigest === '' ? 'CLOSURE_BINDING_ABSENT' : 'CLOSURE_DRIFTED', `the plan binds ${String(boundDigest)} and the runtime computes ${closure.executionClosureDigest}`);

  /* ---------- STEP 3: the run identity and the gate inputs (READ-ONLY) ---------- */
  const runId = input.runId;
  if (typeof runId !== 'string' || runId === '') return refuse('CHECK_RUN_IDENTITY_AND_SCHEDULE', 'RUN_ID_ABSENT', 'no run id was supplied');
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
    schemaVersion: 1, stage: 'R3-L0C-I-A-R-L-C', kind: 'admission closure matrix run',
    PIPELINE: 'REFUSED', refusedAt: 'ACQUIRE_EXCLUSIVE_RUN_ROOT', reason: claim.inspection.verdict, detail: claim.inspection.reason,
    steps: Object.freeze(steps), runRoot, run: null, launches: Object.freeze([]),
  });

  /* ---------- STEP 5: the preservation marker and the preparation record ---------- */
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  writeJsonAtomic(join(runRoot, PRESERVE_FILE), { runId, at: new Date().toISOString(), reason: 'a pipeline preserves its evidence from the first possible exposure onward' });
  writeJsonAtomic(join(runRoot, PREPARATION_FILE), { schemaVersion: 1, runId, state: PREPARING, startedAt: new Date().toISOString(), trajectoryIds });
  record('PERSIST_PRESERVATION_MARKER', true, Object.freeze({ preserveMarker: true, preparationState: PREPARING }));

  /* ---------- STEP 6: prepare worlds, stores and profiles — NON-DESTRUCTIVELY, around S0 and S1 ---------- */
  const prepared = preparePrimaryCase({ runRoot, prehistory: input.prehistory, trajectoryIds });
  const { installHostBundle: frozenInstaller, dshHome: frozenDshHome } = await import('../gates/env.mjs');
  const { installHostBundleSafely } = await import('../r3l0ciar/host-bundle.mjs');
  /**
   * §5: IN PRIMARY MODE THE EXECUTION-ENVIRONMENT VALUES COME FROM THE TRUSTED BOUNDARY.
   *
   * The binding check has already refused a caller-supplied `dshHome` and `installHostBundle` in PRIMARY, so this
   * branch is the only way a PRIMARY run obtains them: the host's own environment and this stage's installer. In
   * DETERMINISTIC the caller may supply them, because the deterministic path exists to exercise the machinery with
   * an isolated home.
   */
  /**
   * §5: THE TRUSTED EXECUTION-ENVIRONMENT RESOLVER.
   *
   * `input.dshHome` may be a resolver (as the frozen `gates/env.mjs` exports) or a path. In PRIMARY the binding
   * check has already refused a caller-supplied one, so `frozenDshHome` — the host's own environment — is used.
   */
  const callerDshHome = () => { const raw = input.dshHome; return typeof raw === 'function' ? raw() : raw; };
  const resolveDshHome = requestedMode === 'PRIMARY' ? frozenDshHome : callerDshHome;
  const installBundle = requestedMode === 'PRIMARY' || input.installHostBundle === undefined || input.installHostBundle === frozenInstaller ? installHostBundleSafely : input.installHostBundle;
  /**
   * §6: S0 IS SAMPLED BEFORE THE RUN'S OWN INSTALLATION. It is recorded so the sequence is auditable, and it is
   * deliberately NOT the competing-writer baseline: this run's own legitimate install happens between S0 and S2.
   */
  const s0Digest = sampleInstallationDigest({ dshHomePath: resolveDshHome() });
  installBundle({ repo: REPO_ROOT, realDshHome: resolveDshHome() });
  /** §6: S1 IS THE POST-INSTALLATION BASELINE. It must match the expected installed repository bundle. */
  const s1Digest = sampleInstallationDigest({ dshHomePath: resolveDshHome() });
  const homes = {};
  for (const trajectoryId of trajectoryIds) {
    const home = join(runRoot, 'units', trajectoryId, 'home');
    mkdirSync(home, { recursive: true });
    const route = await import('../r3l0cr/route.mjs');
    const settings = await import('../r3l0cr/settings.mjs');
    makeProfile(home, route.routeForProfile(route.PRIMARY_EXECUTOR), `${input.profileId ?? 'r3l0ciarlc'}${trajectoryId.replace(/[^a-z0-9]/gu, '')}`, noopInstall, resolveDshHome, undefined, { extraPatch: settings.defaultModelPatch(route.PRIMARY_EXECUTOR) });
    homes[trajectoryId] = home;
  }
  writeJsonAtomic(join(runRoot, PREPARATION_FILE), { schemaVersion: 1, runId, state: PREPARED, preparedAt: new Date().toISOString(), trajectoryIds, createdDirectories: [...prepared.layout.createdDirectories], removedAnything: false });
  record('PREPARE_WORLDS_STORES_PROFILES', true, Object.freeze({ createdDirectories: prepared.layout.createdDirectories.length, removedAnything: false, trajectories: trajectoryIds.length, s0: s0Digest.slice(0, 16), s1: s1Digest.slice(0, 16) }));

  /** §5: A PRIMARY RUN DERIVES ITS OWN CONTAINMENT MEASUREMENT HERE, AFTER THE CLAIM. */
  if (requestedMode === 'PRIMARY') {
    const { runPerTrajectoryConfinement } = await import('../r3l0ciar/confinement.mjs');
    containment = await runPerTrajectoryConfinement({ runRoot, trajectoryIds });
    record('DERIVE_CONTAINMENT', false, Object.freeze({ derivedByPipeline: true, verdict: containment.ACTUAL_CONTAINMENT, cases: containment.cases?.length ?? 0 }));
    if (containment.ACTUAL_CONTAINMENT !== 'PASS') {
      return refuse('DERIVE_CONTAINMENT', 'CONTAINMENT_NOT_ESTABLISHED', 'the pipeline derived the containment measurement and it did not PASS, so no session may be launched');
    }
  }

  /* ---------- STEP 7: the mode, the trust boundary and the pre-exposure checks ---------- */
  const resolved = await resolveExecutionMode({ mode: input.mode, paidAuthorization: input.paidAuthorization });
  if (resolved.resolved !== true) return refuse('PRE_EXPOSURE_CHECKS', 'EXECUTION_MODE_UNRESOLVED', resolved.reason);
  /**
   * §5: IN PRIMARY MODE THE AUTHORITY IS VERIFIED AGAINST A SEPARATELY CONTROLLED SOURCE, at the trusted launch
   * boundary. A syntactically valid `decision:` string is not an authority, and with no trusted source the verdict
   * is AUTHORITY_NOT_ESTABLISHED and the launch stays prohibited.
   */
  let authorityVerification = null;
  if (resolved.mode === 'PRIMARY') {
    authorityVerification = verifyExternalAuthority({ record: input.authorizationDecision, plan: planRead.plan });
    if (authorityVerification.verified !== true) {
      return refuse('PRE_EXPOSURE_CHECKS', 'AUTHORIZATION_NOT_VERIFIED', authorityVerification.detail);
    }
  }
  record('AUTHORITY_VERIFICATION', false, Object.freeze({ mode: resolved.mode, verdict: authorityVerification?.verdict ?? 'NOT_APPLICABLE', verified: authorityVerification?.verified ?? false, requiredForPrimary: true }));
  /** §5: the trusted host configuration, so a PRIMARY run's environment values come from the boundary. */
  const trustedHost = trustedHostConfiguration({ dshHome: resolveDshHome, installHostBundle: installBundle });
  const systemValid = requestedMode === 'PRIMARY' ? await deriveSystemValidity() : input.systemValid;
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
  record('PRE_EXPOSURE_CHECKS', false, Object.freeze({ ALL_SATISFIED: preExposureChecks?.ALL_SATISFIED === true, unsatisfied: preExposureChecks?.unsatisfied ?? null }));
  if (preExposureChecks === null || preExposureChecks === undefined || preExposureChecks.ALL_SATISFIED !== true) {
    return refuse('PRE_EXPOSURE_CHECKS', 'PRE_EXPOSURE_CHECKS_NOT_SATISFIED', `the pre-exposure checks did not report ALL_SATISFIED === true (unsatisfied: [${(preExposureChecks?.unsatisfied ?? ['ALL']).join(', ')}]); no session may be launched`);
  }

  /**
   * §0: THE LAUNCH BOUNDARY. THIS STAGE PERFORMS NO PRIMARY LAUNCH.
   *
   * §0 forbids model calls, and PRIMARY mode launches the SHIPPED DSH worker on the paid route. So a PRIMARY run
   * that has passed EVERY gate — the plan, the derived closure, the derived containment, the verified
   * authorization, the trusted host boundary, the pre-exposure checks — STOPS HERE and reports that it reached the
   * launch boundary rather than proceeding. This stage can prove the boundary is correct and that the run is
   * authorized; the launch itself belongs to the authorized run.
   */
  if (resolved.mode === 'PRIMARY') {
    record('LAUNCH_BOUNDARY', false, Object.freeze({
      launched: false,
      reason: 'this stage performs no primary launch; §0 forbids model calls',
      gatesPassed: Object.freeze({ plan: true, closure: true, containment: true, authority: true, trustedHost: true, preExposureChecks: true }),
      wouldLaunch: 'the shipped DSH worker on the authorized executor route',
    }));
    return Object.freeze({
      schemaVersion: 1, stage: 'R3-L0C-I-A-R-L-C', kind: 'admission closure matrix run',
      PIPELINE: 'STOPPED_AT_LAUNCH_BOUNDARY',
      stoppedAt: 'LAUNCH_BOUNDARY',
      reason: 'PRIMARY mode reached the launch boundary with every gate satisfied; this stage performs no primary launch',
      runId, runRoot, claim: Object.freeze({ claimed: true, nonce: claim.claimNonce }),
      mode: resolved, primaryBinding: binding, authorityVerification, trustedHost, preExposureChecks,
      modelRouteIdentity: modelRouteIdentity(preExposureChecks),
      containment, s0Digest, s1Digest, scheduleLength: schedule.length, trajectoryCount: trajectoryIds.length,
      launches: Object.freeze([]), run: null, steps: Object.freeze(steps), budgets: timeoutHierarchy(),
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

    const raw = await runPrimaryGeneration({
      runRoot, world: world.world, paths: world.paths, home: homes[session.trajectoryId],
      profile: `${input.profileId ?? 'r3l0ciarlc'}${session.trajectoryId.replace(/[^a-z0-9]/gu, '')}`,
      workerExecutable: resolved.workerExecutable, session, generation, knowledge, protectedRoots,
      expectation: expectations[session.sessionId], requestedSelection: knowledge ?? null,
      mode: resolved.mode, fault, artifactPath, timeoutMs: input.timeoutMs,
    });

    /**
     * §3: THE DETERMINISTIC ARTIFACT FIXTURE.
     *
     * A deterministic run's scripted worker produces no DSH session artifact, so Gate A's chain cannot be
     * demonstrated without one. The `artifactFixture` seam is DETERMINISTIC-ONLY and test-supplied: it writes a
     * real-format artifact and returns the identity the record will carry, so the outcome, the sidecar and the
     * durable record agree and the bridge can attribute the cost. In PRIMARY the binding check has already refused
     * this seam, so no injected object can be promoted into an authoritative measurement.
     */
    let outcome = raw;
    if (typeof input.artifactFixture === 'function') {
      const fixture = input.artifactFixture({ session, outcome: raw });
      if (fixture !== null && fixture !== undefined && typeof fixture.path === 'string') {
        outcome = Object.freeze({ ...raw, sessionArtifactPath: fixture.path, attemptId: fixture.attemptId ?? raw.attemptId, hostJobId: fixture.hostJobId ?? raw.hostJobId });
      }
    }
    outcomes[session.sessionId] = outcome;

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
      contentDigests: Object.freeze({ ...(outcome.contentDigests ?? {}), ...liveEvidenceBinding(sidecar.digest) }),
      liveEvidenceDigest: sidecar.digest,
      derivedCostProvenance: provenance,
    });
  };

  /* ---------- §4/§6: THE SINGLE AUTHORITATIVE TERMINAL-ADMISSION REDUCER, INSIDE THE RUNNER'S GATE ---------- */
  const journalPath = join(runRoot, JOURNAL_FILE);
  /**
   * The closure and route recomputation AT THE ADMISSION INSTANT. In PRIMARY it is derived; in DETERMINISTIC a test
   * may inject `terminalRecompute`, which is how §4's mutation — a change after the last admitted trial and before
   * the gate returns — is made deterministic. The binding check refuses that seam in PRIMARY.
   */
  const recomputeAtAdmission = requestedMode === 'PRIMARY'
    ? async () => {
      const freshClosure = await (await import('./closure.mjs')).computeExecutionClosure({ verifyCompiled: input.verifyCompiled });
      const freshRoute = await (await import('../r3l0ciar/preflight.mjs')).effectiveRouteConfiguration();
      const freshValidity = await evaluatePreTrialValidity({ plan: planRead.plan, closure: freshClosure, containment, schedule, mode: resolved, realizationPreflight, routeConfiguration: freshRoute, systemValid, systemValidDetail: input.systemValidDetail });
      return Object.freeze({ closure: freshClosure, route: Object.freeze({ MODEL_ROUTE_IDENTITY: modelRouteIdentity(freshValidity), effective: freshRoute.effective }) });
    }
    : (input.terminalRecompute ?? (async () => Object.freeze({ closure, route: Object.freeze({ MODEL_ROUTE_IDENTITY: modelRouteIdentity(preExposureChecks) }) })));

  /**
   * §6: THE COMPILED VERIFICATION, MEASURED ONCE PER RUN.
   *
   * It emits `src/**` with the project's compiler and compares against `dist/**`, which costs a full compiler
   * invocation. It is a property of the REPOSITORY rather than of a matrix, so measuring it once per run is the
   * right granularity — and it is measured lazily, so a run that refuses before the terminal gate never pays for it.
   * A caller may inject it in DETERMINISTIC mode; the binding check refuses that seam in PRIMARY.
   */
  let compiledVerificationPromise = null;
  const compiledVerificationOnce = async () => {
    if (input.terminalCompiledVerification !== undefined) return input.terminalCompiledVerification;
    compiledVerificationPromise ??= (async () => (await import('./attestation.mjs')).verifyCompiledSource())();
    return await compiledVerificationPromise;
  };

  const validityGate = async ({ completed, records, plannedSessions }) => {
    const continuity = verifyLiveEvidenceContinuity({ runRoot, records });
    const costAttribution = await bridgeMatrixCost({ journalPath, runRoot, plannedSessions, artifactRoot: input.artifactRoot ?? null });
    /**
     * §6: THE DETERMINISTIC-ONLY IN-RUN MUTATION SEAM.
     *
     * It fires BETWEEN S1 and the S2 sample, which is exactly the window §6 names, so a test can drive the
     * authoritative path with a competing write and assert that completion is REFUSED. It is refused in PRIMARY by
     * the binding check, so it can never mutate a real run's installation.
     */
    if (typeof input.terminalMutation === 'function') input.terminalMutation({ dshHomePath: resolveDshHome() });
    /** §6: S2 IS SAMPLED HERE — after the matrix and before final validity admission. */
    const s2Digest = sampleInstallationDigest({ dshHomePath: resolveDshHome() });
    const attestation = await inRunAttestation({
      dshHomePath: resolveDshHome(), s0Digest, s1Digest, s2Digest, installedDuringRun: true,
      compiledVerification: await compiledVerificationOnce(),
    });
    const { postMatrixValidityGate } = await import('../r3l0ciar/validity.mjs');
    const journalRecords = readJournalRecords(journalPath);
    const counts = deriveCountsFromJournal({ journalRecords, plannedSessions });
    const frozenValidity = await postMatrixValidityGate({
      completed, records, plannedSessions,
      plan: planRead.plan, closure, containment, schedule,
      systemValid: normalizeVerdict(systemValid),
      environmentValid: containment?.EXPERIMENT_ENVIRONMENT_VALID ?? containment?.EXPERIMENT_CONTAINMENT ?? null,
      costAttribution: Object.freeze({ interpretable: costAttribution.interpretable, rejectedCount: 0, measuredCount: costAttribution.measuredCount, absentCount: costAttribution.absentCount, plannedSessions: costAttribution.plannedSessions, livePrimaryCount: costAttribution.livePrimaryCount, fixtureCount: costAttribution.fixtureCount, allSixteenLivePrimary: costAttribution.allSixteenLivePrimary }),
      routeConfiguration: { MODEL_ROUTE_IDENTITY: modelRouteIdentity(preExposureChecks) },
      analysisPlanUnchanged: planRead.plan?.preservedDesign?.primaryEndpointsChanged === false && planRead.plan?.preservedDesign?.verdictThresholdsChanged === false,
      replacements: counts.replacements, retries: counts.retries,
    });
    const admission = await authoritativeTerminalAdmission({
      completed, records, plannedSessions, schedule, plan: planRead.plan, journalPath,
      journalReader: readJournal, liveEvidenceContinuity: continuity, costAttribution,
      recompute: recomputeAtAdmission, attestation, postMatrixValidity: frozenValidity,
    });
    return Object.freeze({ ...admission, attestation, continuity, costAttribution, frozenValidity });
  };

  const run = await runFailStopMatrix({
    runId, runRoot, schedule, launch, validityGate,
    closureDigest: closure.executionClosureDigest,
    intendedExecutorRoute: resolved.mode === 'PRIMARY' ? 'the frozen omnigate DeepSeek route' : 'the deterministic scripted worker',
    trustedClaimNonce: claim.claimNonce,
    enforceRunClaim: false,
  });

  /* ---------- §3/§4: THE POST-RUN READBACK AND THE DIAGNOSTIC POSTFLIGHT ---------- */
  const journalRecords = readJournalRecords(journalPath);
  const counts = deriveCountsFromJournal({ journalRecords, plannedSessions: run.plannedSessions });
  const identities = compareSessionIdentities({ records: run.records, schedule });
  const costBridge = await bridgeMatrixCost({ journalPath, runRoot, plannedSessions: run.plannedSessions, artifactRoot: input.artifactRoot ?? null });
  const continuity = verifyLiveEvidenceContinuity({ runRoot, records: run.records });
  const s2Final = sampleInstallationDigest({ dshHomePath: resolveDshHome() });
  const finalAttestation = await inRunAttestation({ dshHomePath: resolveDshHome(), s0Digest, s1Digest, s2Digest: s2Final, installedDuringRun: true, compiledVerification: await compiledVerificationOnce() });
  record('POST_RUN_READBACK', false, Object.freeze({
    journalRetries: counts.retries, journalReplacements: counts.replacements,
    costMeasured: costBridge.measuredCount, costAbsent: costBridge.absentCount, costProvenance: costBridge.provenance,
    liveEvidenceSessions: continuity.sessions, s2MatchesS1: finalAttestation.s2MatchesS1,
    terminalState: run.terminalState,
  }));

  return Object.freeze({
    schemaVersion: 1, stage: 'R3-L0C-I-A-R-L-C', kind: 'admission closure matrix run',
    PIPELINE: 'COMPLETED',
    runId, runRoot,
    claim: Object.freeze({ claimed: true, nonce: claim.claimNonce }),
    mode: resolved, primaryBinding: binding, authorityVerification, trustedHost,
    preExposureChecks, modelRouteIdentity: modelRouteIdentity(preExposureChecks),
    scheduleLength: schedule.length, trajectoryCount: trajectoryIds.length,
    s0Digest, s1Digest, s2Digest: s2Final,
    launches: Object.freeze(launches), faultsInjected: Object.freeze(faultsInjected),
    outcomes, liveEvidence: Object.freeze(liveEvidence), liveEvidenceContinuity: continuity,
    journalPath, journalCounts: counts, sessionIdentities: identities,
    costBridge, finalAttestation, containment,
    run, terminalState: run.terminalState, matrixCompleted: run.matrixCompleted,
    completedSessions: run.completedSessions, maxLaunchesPerSession: run.maxLaunchesPerSession,
    validityGate: run.validityGate,
    steps: Object.freeze(steps), budgets: timeoutHierarchy(),
    sessionsAfterFault: faultsInjected.length === 0
      ? Object.freeze([])
      : Object.freeze(run.launches.filter((entry) => entry.sessionId !== faultsInjected[0].sessionId).map((entry) => entry.sessionId).filter((sessionId) => {
        const index = schedule.findIndex((session) => session.sessionId === sessionId);
        return index > faultsInjected[0].scheduleIndex;
      })),
  });
}

/**
 * §3: DERIVE THE COST PROVENANCE FROM THE ACTUAL MODE AND THE VERIFIED ARTIFACT.
 *
 * This is a LABEL the sidecar carries; the AUTHORITATIVE provenance is re-derived by the bridge from the durable
 * record's own route and the verified artifact digest (see `cost-bridge.mjs deriveBridgeProvenance`). The label
 * here exists so the sidecar states what the generation knew, not so a reader trusts it.
 */
export function deriveProvenance(input) {
  const { mode, artifactPath, artifactExists } = input;
  if (artifactPath === null || artifactPath === undefined || artifactExists !== true) return 'NO_ARTIFACT';
  return mode === 'PRIMARY' ? 'LIVE_PRIMARY' : 'FIXTURE';
}

/**
 * §5: DERIVE SYSTEM VALIDITY FROM THE SYSTEMIC SUITE'S RESULT OF RECORD.
 *
 * R3-S0 is the systemic closure. This stage does not re-run it — that is a different stage's suite — so the
 * derivation reads its committed result. The direction is fail-closed: an absent result, an unreadable one, or one
 * that does not report PASS yields `false`, which makes `SYSTEM_VALID` unsatisfied and refuses before exposure.
 */
async function deriveSystemValidity() {
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

/** §5: normalize a boolean or string system-validity signal into the gate's PASS/FAIL vocabulary. */
function normalizeVerdict(value) {
  if (value === true) return 'PASS';
  if (value === false) return 'FAIL';
  if (value === 'PASS' || value === 'FAIL') return value;
  return null;
}

/** §6: the no-op installer, so the hoisted bundle install is not repeated per trajectory. */
function noopInstall() { /* the bundle was installed once for the run, before the loop */ }

export { NL, REPO_ROOT, STAGE_CODE_PATH, STAGE_EVIDENCE_PATH, readFileSync };
