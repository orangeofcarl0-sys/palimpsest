/**
 * R3-L0C-I Gate 3 — THE PRIMARY MATRIX DRIVER.
 *
 * Runs the FROZEN 16-session schedule through the fail-stop runner, with each session executed by the REAL
 * generation child through `primary-matrix.mjs`. Zero LLM calls: the child's `realDshBin` points at the scripted
 * worker, which speaks the shipped port's protocol.
 *
 * THE FOUR THINGS THIS DRIVER EXISTS TO PROVE, and each is a Gate 3 requirement:
 *
 *   1. THE FULL CONTROL FLOW RUNS. All 16 sessions, in the frozen randomized arm order, across four trajectories,
 *      with G2 depending on G1 in each.
 *   2. THE FAULT POSITIONS ARE THE RULING'S. A fault is injected at the FIRST, MIDDLE and LAST scheduled session,
 *      by POSITION in the frozen schedule rather than by a fixture.
 *   3. NO LATER LAUNCH, NO REPLACEMENT, NO HIDDEN RETRY. After the injected fault, no subsequent session starts,
 *      no trajectory is replaced, and no session is launched twice.
 *   4. THE OLD MATRIX IS NOT REACHABLE. The driver asserts the authoritative path, so the quarantined R3-L0C-R
 *      matrix cannot be run as an alternative.
 *
 * WHY THE RUN ROOT IS PER-CASE. A fail-stop run claims its run root and preserves it, so a second case cannot use
 * the same root — the replay guard refuses it, correctly. Each case therefore gets its own root and its own copy of
 * the frozen prehistory, which is also what keeps one case's world mutation out of another's.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './contract.mjs';
import { runFailStopMatrix } from './fail-stop.mjs';
import { assertAuthoritativePath, frozenPrimarySchedule, runPrimaryGeneration, faultPositionFault, TEE_PATH } from './primary-matrix.mjs';
import { buildSelection } from '../r3l0cr/selection.mjs';
import { buildExpectationManifest } from '../r3l0cr/contract.mjs';
import { GENERATION_EXPOSURES } from '../r3l0c/capital.mjs';
import { GENERATIONS } from '../r3l0c/contract.mjs';
import { prepareRunLayout, makeProfile, runProtectedRoots, containmentEnvironment } from '../r3l0c/trajectory.mjs';

const NL = String.fromCharCode(10);

/** Gate 3: the scripted worker, which is what the child's `realDshBin` is pointed at. */
export const SCRIPTED_WORKER = join(REPO_ROOT, 'scripts', 'r3l0cf', 'scripted-primary-worker.mjs');

/** Gate 3: the fault kinds the scripted worker understands. */
export const PRIMARY_FAULTS = Object.freeze({
  NONE: 'NONE',
  REPORT_MISSING: 'REPORT_MISSING',
  NO_COMMIT: 'NO_COMMIT',
  DECLINE_PULL: 'DECLINE_PULL',
  NEEDS_ESCALATION: 'NEEDS_ESCALATION',
});

/**
 * Gate 3: PREPARE ONE CASE'S RUN ROOT.
 *
 * The layout is the R3-L0B isolated shape, reused rather than re-derived: a unit's world and state are siblings,
 * and the host-private roots are separated from every world. The prehistory is copied per trajectory so each
 * trajectory inherits the SAME paid-for history, which is what makes the arms comparable.
 */
export function preparePrimaryCase(input) {
  const { runRoot, prehistory, trajectoryIds } = input;
  prepareRunLayout(runRoot, trajectoryIds);
  const worlds = {};
  for (const trajectoryId of trajectoryIds) {
    const world = join(runRoot, 'units', trajectoryId, 'world');
    const state = join(runRoot, 'units', trajectoryId, 'state');
    cpSync(prehistory.world, world, { recursive: true });
    cpSync(prehistory.state, state, { recursive: true });
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
  return Object.freeze({ runRoot, worlds });
}

/**
 * Gate 3: RUN THE FROZEN MATRIX WITH AN OPTIONAL FAULT AT A POSITION.
 *
 * `faultAt` names a position — FIRST, MIDDLE or LAST — and the fault kind is applied to that session only. Every
 * other session runs healthy. That is what makes the three injections comparable: the matrix is identical apart
 * from one position.
 */
export async function runPrimaryMatrix(input) {
  assertAuthoritativePath({ caller: input.caller ?? 'r3-l0ci', authorizedBy: input.authorizedBy });
  const { runRoot, prehistory, admittedRefs, installedHome, dshHome, installHostBundle, profileId = 'r3l0ci' } = input;

  const schedule = await frozenPrimarySchedule();
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  const prepared = preparePrimaryCase({ runRoot, prehistory, trajectoryIds });

  /** One profile per trajectory, so each has its own session space, as the frozen harness does. */
  const homes = {};
  for (const trajectoryId of trajectoryIds) {
    const home = join(runRoot, 'units', trajectoryId, 'home');
    mkdirSync(home, { recursive: true });
    const route = await import('../r3l0cr/route.mjs');
    const settings = await import('../r3l0cr/settings.mjs');
    makeProfile(home, route.routeForProfile(route.PRIMARY_EXECUTOR), `${profileId}${trajectoryId.replace(/[^a-z0-9]/gu, '')}`, installHostBundle, dshHome, undefined, { extraPatch: settings.defaultModelPatch(route.PRIMARY_EXECUTOR) });
    writeFileSync(join(home, 'settings.yaml'), settings.renderSettingsYaml(route.PRIMARY_EXECUTOR), 'utf8');
    homes[trajectoryId] = home;
  }

  const protectedRoots = runProtectedRoots(runRoot, trajectoryIds).join(process.platform === 'win32' ? ';' : ':');

  /** Gate 3: the frozen expectations, built BEFORE any session runs. */
  const expectations = {};
  for (const session of schedule) {
    expectations[session.sessionId] = buildExpectationManifest({
      generationId: session.generation,
      arm: session.arm,
      admittedRefs,
      generationExposures: GENERATION_EXPOSURES,
    });
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
    return await runPrimaryGeneration({
      runRoot,
      world: world.world,
      paths: world.paths,
      home: homes[session.trajectoryId],
      profile: `${profileId}${session.trajectoryId.replace(/[^a-z0-9]/gu, '')}`,
      realDshBin: SCRIPTED_WORKER,
      session,
      generation,
      knowledge,
      protectedRoots,
      expectation: expectations[session.sessionId],
      /** Gate 3: the fault travels through the environment, so no product file changes. */
      fault,
    });
  };

  const run = await runFailStopMatrix({
    runId: input.runId,
    runRoot,
    schedule,
    launch,
    validityGate: input.validityGate ?? (async ({ completed }) => ({ green: completed.length === schedule.length, detail: `completed ${String(completed.length)}/${String(schedule.length)}` })),
    closureDigest: input.closureDigest ?? null,
    intendedExecutorRoute: input.intendedExecutorRoute ?? null,
    /** Gate 3: the fault seam the scripted worker reads. */
    beforeSession: null,
  });

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I',
    kind: 'primary matrix run',
    runId: input.runId,
    runRoot,
    scheduleLength: schedule.length,
    trajectoryCount: trajectoryIds.length,
    launches: Object.freeze(launches),
    faultsInjected: Object.freeze(faultsInjected),
    run,
    /** Gate 3: the properties, so a caller reads them rather than re-deriving them. */
    maxLaunchesPerSession: run.maxLaunchesPerSession,
    terminalState: run.terminalState,
    completedSessions: run.completedSessions,
    /** Gate 3: whether anything started after the injected fault. */
    sessionsAfterFault: faultsInjected.length === 0
      ? Object.freeze([])
      : Object.freeze(run.launches.filter((entry) => entry.sessionId !== faultsInjected[0].sessionId).map((entry) => entry.sessionId).filter((sessionId) => {
        const index = schedule.findIndex((session) => session.sessionId === sessionId);
        return index > faultsInjected[0].scheduleIndex;
      })),
  });
}

/**
 * Gate 3: SET THE FAULT ENVIRONMENT FOR THE SCRIPTED WORKER.
 *
 * The fault travels by environment variable, so the scripted worker learns it without the child or the port knowing
 * anything about faults. The child passes its own environment through to the tee, and the tee re-execs with the
 * same environment, so the variable reaches the worker.
 */
export function faultEnvironment(fault) {
  return Object.freeze({ R3L0CI_FAULT: fault ?? PRIMARY_FAULTS.NONE });
}

export { NL, readFileSync, existsSync, TEE_PATH, containmentEnvironment };
