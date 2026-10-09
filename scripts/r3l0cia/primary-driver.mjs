/**
 * R3-L0C-I-A §5/§8 — THE REPAIRED PRIMARY MATRIX DRIVER.
 *
 * Runs the FROZEN 16-session schedule through the fail-stop runner, with each session executed by the REAL
 * generation child through `primary-adapter.mjs`. Zero LLM calls in DETERMINISTIC mode: the child's `realDshBin`
 * points at the stage-owned scripted worker, which speaks the SHIPPED port's protocol and the SHIPPED telemetry
 * schema.
 *
 * THE FIVE THINGS THIS DRIVER EXISTS TO PROVE, each a ruling requirement:
 *
 *   1. THE MODE IS EXPLICIT AND RECORDED. §5 requires the two modes to be separated with no silent fallback, so
 *      the driver resolves the mode, records the worker executable it produced, and refuses an undeclared one.
 *   2. THE PROTECTED ROOTS ARE PER-TRAJECTORY. §3 requires each trajectory's own world to be absent from its own
 *      protected set, so the driver derives the set for the session's own trajectory.
 *   3. THE TREATMENT IS MEASURED FROM CONSUMER EVIDENCE. §4 requires the realization verdict to come from what
 *      the consumer boundary carried, not from a field.
 *   4. THE UPTAKE IS THE WORKER'S. §4 requires the worker's own telemetry, through the shipped parser.
 *   5. THE VALIDITY GATE IS PLAN-BOUND. §6 forbids a count-only gate, so the driver supplies the post-matrix gate
 *      that re-measures the plan's conditions.
 *
 * WHY THE RUN ROOT IS PER-CASE. A fail-stop run claims its run root and preserves it, so a second case cannot
 * reuse the same root — the guard refuses it, correctly. Each case therefore gets its own root and its own copy
 * of the frozen prehistory, which is also what keeps one case's world mutation out of another's.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './contract.mjs';
import { runFailStopMatrix } from '../r3l0cf/fail-stop.mjs';
import { prepareLayoutSafely } from './activation.mjs';
import {
  PRIMARY_FAULTS,
  assertAuthoritativePath,
  faultPositionFault,
  frozenPrimarySchedule,
  runPrimaryGeneration,
} from './primary-adapter.mjs';
import { perTrajectoryProtectedRoots } from './confinement.mjs';
import { buildSelection } from '../r3l0cr/selection.mjs';
import { buildExpectationManifest } from '../r3l0cr/contract.mjs';
import { GENERATION_EXPOSURES } from '../r3l0c/capital.mjs';
import { GENERATIONS } from '../r3l0c/contract.mjs';
import { makeProfile } from '../r3l0c/trajectory.mjs';

const NL = String.fromCharCode(10);

/**
 * §5: PREPARE ONE CASE'S RUN ROOT, NON-DESTRUCTIVELY.
 *
 * The layout is the R3-L0B isolated shape, reused rather than re-derived: a unit's world and state are siblings,
 * and the host-private roots are separated from every world. The preparation does NOT remove the root, because a
 * destructive preparation cannot sit after a claim and still mean what §2 requires.
 */
export function preparePrimaryCase(input) {
  const { runRoot, prehistory, trajectoryIds } = input;
  const layout = prepareLayoutSafely(runRoot, trajectoryIds);
  const worlds = {};
  for (const trajectoryId of trajectoryIds) {
    const world = join(runRoot, 'units', trajectoryId, 'world');
    const state = join(runRoot, 'units', trajectoryId, 'state');
    /** The prehistory is copied only when absent, so a case that re-enters does not silently re-copy. */
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
 * §5: RUN THE FROZEN MATRIX UNDER AN EXPLICIT MODE.
 *
 * `faultAt` names a position — FIRST, MIDDLE or LAST — and the fault kind is applied to that session only, so the
 * three injections are comparable: the matrix is identical apart from one position.
 */
export async function runPrimaryMatrix(input) {
  assertAuthoritativePath({ caller: input.caller ?? 'r3l0cia', authorizedBy: input.authorizedBy });
  const {
    runRoot, prehistory, admittedRefs, installedHome, dshHome, installHostBundle, profileId = 'r3l0cia',
    mode = 'DETERMINISTIC', paidAuthorization = false, artifactRoot = null,
  } = input;

  /**
   * §6: THE GATE'S INPUTS ARE REQUIRED, NOT DEFAULTED — AND THE REFUSAL PRECEDES EVERY MUTATION.
   *
   * The post-matrix gate evaluates the PLAN's conditions, so a caller that supplies none of the plan, the closure
   * or the containment result would get a gate that is red for a reason unrelated to the matrix. §6 forbids a
   * default-green gate, and the symmetric error — a gate red because its evidence was never gathered — is refused
   * here rather than reported as a matrix failure.
   *
   * The check is placed BEFORE the world copies for the same reason §2's claim precedes them: a refusal that has
   * already mutated the run root is not a refusal. It is also before the mode resolution, so a refusal that names
   * the missing inputs does not first pay for resolving a worker it will not use.
   */
  if (input.validityGate === undefined && (input.plan === undefined || input.closure === undefined || input.containment === undefined)) {
    return Object.freeze({
      schemaVersion: 1,
      stage: 'R3-L0C-I-A',
      kind: 'primary matrix run',
      MODE_RESOLUTION: 'NOT_ATTEMPTED',
      GATE_INPUTS: 'INCOMPLETE',
      reason: 'the plan-bound post-matrix gate requires the plan, the recomputed closure and the containment result; §6 forbids a default gate, and a gate red for a missing input would be indistinguishable from a matrix failure',
      missing: Object.freeze(['plan', 'closure', 'containment'].filter((name) => input[name] === undefined)),
      mode: null,
      launches: Object.freeze([]),
      run: null,
    });
  }

  const schedule = await frozenPrimarySchedule();
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  const prepared = preparePrimaryCase({ runRoot, prehistory, trajectoryIds });

  /** §5: the mode, resolved before the profiles are written, so an unresolvable mode costs nothing. */
  const { resolveExecutionMode } = await import('./activation.mjs');
  const resolved = await resolveExecutionMode({ mode, paidAuthorization });
  if (resolved.resolved !== true) {
    return Object.freeze({ schemaVersion: 1, stage: 'R3-L0C-I-A', kind: 'primary matrix run', MODE_RESOLUTION: 'FAILED', reason: resolved.reason, mode: null, launches: Object.freeze([]), run: null });
  }
  if (resolved.mode === 'PRIMARY' && resolved.paidAuthorizationPresent !== true) {
    return Object.freeze({
      schemaVersion: 1,
      stage: 'R3-L0C-I-A',
      kind: 'primary matrix run',
      MODE_RESOLUTION: 'REFUSED_PRIMARY_WITHOUT_AUTHORIZATION',
      reason: 'PRIMARY mode requires an explicit paid authorization; this stage does not carry one and will not enter primary execution',
      mode: resolved,
      launches: Object.freeze([]),
      run: null,
    });
  }

  /** One profile per trajectory, so each has its own session space. */
  const homes = {};
  for (const trajectoryId of trajectoryIds) {
    const home = join(runRoot, 'units', trajectoryId, 'home');
    mkdirSync(home, { recursive: true });
    const route = await import('../r3l0cr/route.mjs');
    const settings = await import('../r3l0cr/settings.mjs');
    makeProfile(home, route.routeForProfile(route.PRIMARY_EXECUTOR), `${profileId}${trajectoryId.replace(/[^a-z0-9]/gu, '')}`, installHostBundle, dshHome, undefined, { extraPatch: settings.defaultModelPatch(route.PRIMARY_EXECUTOR) });
    homes[trajectoryId] = home;
  }

  /** §3: the frozen expectations, built BEFORE any session runs. */
  const expectations = {};
  for (const session of schedule) {
    expectations[session.sessionId] = buildExpectationManifest({ generationId: session.generation, arm: session.arm, admittedRefs, generationExposures: GENERATION_EXPOSURES });
  }

  const launches = [];
  const faultsInjected = [];

  const launch = async ({ session }) => {
    const position = faultPositionFault(session.scheduleIndex, schedule.length);
    const inject = typeof input.faultAt === 'string' && input.faultAt !== '' && position[input.faultAt] === true;
    const fault = inject ? (input.faultKind ?? PRIMARY_FAULTS.REPORT_MISSING) : PRIMARY_FAULTS.NONE;
    if (inject) faultsInjected.push(Object.freeze({ sessionId: session.sessionId, position: input.faultAt, fault, scheduleIndex: session.scheduleIndex }));
    launches.push(Object.freeze({ sessionId: session.sessionId, attempt: 1, fault }));

    const generation = GENERATIONS.find((entry) => entry.id === session.generation);
    const knowledge = session.arm === 'C'
      ? buildSelection({ arm: 'C', generationId: session.generation, admittedRefs, generationExposures: GENERATION_EXPOSURES })
      : undefined;
    const world = prepared.worlds[session.trajectoryId];

    /**
     * §3: THE PER-TRAJECTORY PROTECTED ROOTS. The session's OWN trajectory is passed as `currentTrajectoryId`,
     * so its world is excluded — which is the whole repair. The baseline passed two arguments and protected
     * every world including the caller's own.
     */
    const protectedRoots = perTrajectoryProtectedRoots(runRoot, trajectoryIds, session.trajectoryId).roots.join(process.platform === 'win32' ? ';' : ':');

    /** §6: the session's artifact, when the caller supplies an artifact root. */
    const artifactPath = artifactRoot === null ? null : join(artifactRoot, `${session.sessionId}.zstd`);

    return await runPrimaryGeneration({
      runRoot,
      world: world.world,
      paths: world.paths,
      home: homes[session.trajectoryId],
      profile: `${profileId}${session.trajectoryId.replace(/[^a-z0-9]/gu, '')}`,
      workerExecutable: resolved.workerExecutable,
      session,
      generation,
      knowledge,
      protectedRoots,
      expectation: expectations[session.sessionId],
      requestedSelection: knowledge ?? null,
      mode: resolved.mode,
      fault,
      artifactPath,
      timeoutMs: input.timeoutMs,
    });
  };

  /** §6: the plan-bound validity gate. A count-only gate is what §6 forbids, so it is not the default here. */
  const validityGate = input.validityGate ?? (async ({ completed, records, plannedSessions }) => {
    const { postMatrixValidityGate } = await import('./validity.mjs');
    return await postMatrixValidityGate({
      completed,
      records,
      plannedSessions,
      plan: input.plan ?? null,
      closure: input.closure ?? null,
      containment: input.containment ?? null,
      schedule,
    });
  });

  const run = await runFailStopMatrix({
    runId: input.runId,
    runRoot,
    schedule,
    launch,
    validityGate,
    closureDigest: input.closure?.executionClosureDigest ?? null,
    intendedExecutorRoute: resolved.mode === 'PRIMARY' ? 'the frozen omnigate DeepSeek route' : 'the deterministic scripted worker',
    trustedClaimNonce: input.trustedClaimNonce ?? null,
    enforceRunClaim: input.trustedClaimNonce === null || input.trustedClaimNonce === undefined,
  });

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A',
    kind: 'primary matrix run',
    MODE_RESOLUTION: 'RESOLVED',
    runId: input.runId,
    runRoot,
    mode: resolved,
    scheduleLength: schedule.length,
    trajectoryCount: trajectoryIds.length,
    launches: Object.freeze(launches),
    faultsInjected: Object.freeze(faultsInjected),
    run,
    maxLaunchesPerSession: run.maxLaunchesPerSession,
    terminalState: run.terminalState,
    completedSessions: run.completedSessions,
    /** §8: whether anything started after the injected fault. */
    sessionsAfterFault: faultsInjected.length === 0
      ? Object.freeze([])
      : Object.freeze(run.launches.filter((entry) => entry.sessionId !== faultsInjected[0].sessionId).map((entry) => entry.sessionId).filter((sessionId) => {
        const index = schedule.findIndex((session) => session.sessionId === sessionId);
        return index > faultsInjected[0].scheduleIndex;
      })),
  });
}

/** §5: the fault environment, so the scripted worker learns the fault without the child or the port knowing. */
export function faultEnvironment(fault) {
  return Object.freeze({ R3L0CIA_FAULT: fault ?? PRIMARY_FAULTS.NONE });
}

export { NL, REPO_ROOT, readFileSync, PRIMARY_FAULTS, frozenPrimarySchedule, perTrajectoryProtectedRoots };
