/**
 * R3-L0C §9/§10/§11 — THE TRAJECTORY RUNNER, THE ISOLATED LAYOUT, AND THE CHILD PROGRAM.
 *
 * §10 requires the REPAIRED R3-L0B CONTAINMENT LAYOUT, so this module reuses that layout rather than inventing a
 * new one. The structure is:
 *
 *   <run>/units/<trajectoryId>/world/    the worker's world and its repository
 *   <run>/units/<trajectoryId>/state/    that trajectory's durable stores
 *   <run>/units/<trajectoryId>/home/     that trajectory's DSH home and session space
 *   <run>/private/oracle/                the diagnostic oracle
 *   <run>/private/reference/             a reference solution
 *   <run>/private/control/               specs, payloads, transcripts
 *   <run>/private/evidence/              the schedule and primary records
 *   <run>/private/units/<trajectoryId>/  sibling worlds and sibling promoted source
 *
 * NO host-private artifact is an ANCESTOR or a SIBLING of any world, and the sibling-unit root is additionally
 * DECLARED to the shipped fence. That is the R3-L0B repair, reused rather than re-derived.
 *
 * §11: TWO generations per trajectory, each in a FRESH OS PROCESS, with G2 continuing from whatever G1 promoted.
 * There is no reference reset: the current world flows naturally into the next generation, which is what makes
 * path dependence part of the treatment.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT } from './contract.mjs';
import { ISOLATED_LAYOUT, buildIsolatedLayout, declaredProtectedRoots } from '../r3l0b/containment.mjs';

const NL = String.fromCharCode(10);

/** §10: the tee path the child passes to the shipped worker port. */
export const TEE_PATH = new URL('../gates/d2-live-tee-worker.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/** §10: the child program, a committed path so its digest can be recorded. */
export const CHILD_PROGRAM = new URL('./generation-child.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/** §10: the trajectory root, inside a run-owned temp root so no global sweep can delete it. */
export function trajectoryRoot(runRoot) {
  const root = join(runRoot, 'matrix');
  mkdirSync(root, { recursive: true });
  return root;
}

/**
 * §10: THE DURABLE PATHS for one trajectory, inside the isolated layout.
 *
 * The state directory is `units/<trajectoryId>/state`, which is a SIBLING of the world and not its ancestor, so
 * the fence can protect it.
 */
export function trajectoryPaths(runRoot, trajectoryId) {
  const state = ISOLATED_LAYOUT.unitState(runRoot, trajectoryId);
  mkdirSync(state, { recursive: true });
  return Object.freeze({
    state,
    orchestration: join(state, 'orchestration.sqlite'),
    ordarium: join(state, 'ordarium.sqlite'),
    association: join(state, 'assoc.sqlite'),
    journal: join(state, 'journal.sqlite'),
    proof: join(state, 'proof.sqlite'),
    proofBlobs: join(state, 'proof-blobs'),
    cells: join(state, 'cells.sqlite'),
    procedures: join(state, 'procedures.sqlite'),
  });
}

/** §10: the world and home for a trajectory. */
export function trajectoryWorld(runRoot, trajectoryId) {
  return ISOLATED_LAYOUT.unitWorld(runRoot, trajectoryId);
}

export function trajectoryHome(runRoot, trajectoryId) {
  const home = ISOLATED_LAYOUT.unitHome(runRoot, trajectoryId);
  mkdirSync(home, { recursive: true });
  return home;
}

/* ================================================================ §10 the profile */

/**
 * §10: THE PROFILE a trajectory's generations run under.
 *
 * The profile lives in the trajectory's own home, so each trajectory has its own session space and the fence
 * derives its host home from `DSH_HOME` rather than from the real user profile.
 */
export function makeProfile(home, route, profileId, installHostBundle, dshHome, repoRoot = REPO_ROOT, options = {}) {
  const profileDir = join(home, 'profiles', profileId);
  mkdirSync(profileDir, { recursive: true });
  const REAL_DSH = dshHome();
  installHostBundle({ repo: repoRoot, realDshHome: REAL_DSH });
  execFileSyncCmd('cmd', ['/c', 'mklink', '/J', `${join(home, 'profiles', 'node_modules').replace(/\//gu, '\\')}`, `${join(REAL_DSH, 'profiles', 'node_modules').replace(/\//gu, '\\')}`]);
  writeFileSync(join(home, 'settings.yaml'), ['agent-default-model:', `  provider: ${route.providerId}`, `  model: ${route.modelId}`, 'locale:', '  preference: en', ''].join(NL), 'utf8');
  copyFileSyncSafe(join(REAL_DSH, '.credentials.yaml'), join(home, '.credentials.yaml'));
  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify({ name: `dsh-profile-${profileId}`, private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'palimpsest-dsh-host'], patchReload: 'startup' } } }, null, 2)}${NL}`, 'utf8');
  writeFileSync(join(profileDir, 'cordis.patch.yml'), [
    '- id: llm-pi-ai',
    '  name: "@deepseek-ai/dsh-llm-pi-ai"',
    '  config:',
    '    providers:',
    `      ${route.providerId}:`,
    `        displayName: ${route.displayName}`,
    `        apiKeyEnv: ${route.apiKeyEnv}`,
    `        api: ${route.api}`,
    `        baseURL: ${route.baseURL}`,
    '        models:',
    `          - id: ${route.modelId}`,
    `            name: ${route.displayName}`,
    `            contextWindow: ${String(route.contextWindow)}`,
    `            maxTokens: ${String(route.maxTokens)}`,
    '',
    '- id: palimpsest-tools',
    '  config:',
    `    palimpsestEntry: '${join(repoRoot, 'dist', 'src', 'advanced.js')}'`,
    `    deploymentProfile: '${join(profileDir, 'deployment.json')}'`,
    '    serve: false',
    '    openDashboard: false',
    '',
    /**
     * An optional extra patch layer, supplied by a stage that needs to override a COMPOSITION entry.
     *
     * It is written as part of the SAME document rather than appended afterwards, because a later
     * `makeProfile` call would overwrite an appended line. The shipped host runner pins the model from
     * `agent-default-model.currentSelection()`, which reads this composition config, so a stage that changes
     * the executor route must override that entry here.
     */
    ...(typeof options.extraPatch === 'string' && options.extraPatch !== '' ? [options.extraPatch] : []),
  ].join(NL), 'utf8');
  /**
   * The deployment profile. The repository is the trajectory's WORLD, so the durable stores sit beside it in the
   * isolated layout rather than inside it.
   */
  const state = join(home, '..', 'state');
  writeFileSync(join(profileDir, 'deployment.json'), `${JSON.stringify({
    schemaVersion: 1,
    profileId,
    projectId: profileId,
    localPeer: `${profileId}-peer`,
    persistentPoint: `pp-${profileId}`,
    repository: join(home, '..', 'world'),
    transport: { namespace: profileId, databasePath: join(state, 'transport.sqlite') },
    databases: { orchestration: join(state, 'orchestration.sqlite'), ordarium: join(state, 'ordarium.sqlite'), coordination: join(state, 'coordination.sqlite'), transportCursors: join(state, 'cursors.sqlite') },
    reasoning: {},
    execution: 'worktree',
    concurrency: 1,
    policy: { allowed_commands: [{ executable: 'node', argv_prefix: ['test/check.js'] }] },
    standard: { statement: 'the visible oracle passes' },
  }, null, 2)}${NL}`, 'utf8');
  return profileId;
}

/** The profile's `node_modules` junction may already exist, and mklink then fails harmlessly. */
function execFileSyncCmd(command, args) {
  try { execFileSync(command, args, { stdio: 'ignore' }); } catch { /* the junction may already exist */ }
}

function copyFileSyncSafe(from, to) {
  if (!existsSync(from)) return;
  cpSync(from, to);
}

/**
 * §10: THE ROOTS DECLARED TO THE SHIPPED FENCE FOR A RUN.
 *
 * R3-L0B's `declaredProtectedRoots` names the sibling-unit root, which is the one it must protect. This stage
 * additionally declares:
 *
 *   · every trajectory's STATE directory, because the isolated layout puts it BESIDE the world rather than
 *     inside it — so the shipped derivation (which protects `<repository>/.palimpsest`) does not cover it, and a
 *     worker could otherwise walk up one level and read the durable stores;
 *   · the host-private experiment roots, so a layout mistake fails closed rather than silently opening them.
 *
 * The trajectory's HOME is deliberately NOT listed: the shipped fence already derives it from `DSH_HOME`, and
 * naming it twice would make it ambiguous which mechanism is doing the work.
 */
export function runProtectedRoots(runRoot, trajectoryIds, currentTrajectoryId = null) {
  const roots = [
    ...declaredProtectedRoots(runRoot),
    ...trajectoryIds.map((trajectoryId) => ISOLATED_LAYOUT.unitState(runRoot, trajectoryId)),
    ISOLATED_LAYOUT.oracleRoot(runRoot),
    ISOLATED_LAYOUT.referenceRoot(runRoot),
    ISOLATED_LAYOUT.controlRoot(runRoot),
    ISOLATED_LAYOUT.evidenceRoot(runRoot),
  ];
  /**
   * EVERY SIBLING WORLD, declared individually.
   *
   * This is the one root the shipped derivation cannot supply. The fence derives `<repository>/.palimpsest` from
   * the worker's own position, and the worker's repository IS its own world — so it labels its OWN state and
   * knows nothing about the other units. In this layout a sibling world sits at `units/<other>/world`, a SIBLING
   * of the worker's world, and it is reachable by a single `..`.
   *
   * The unit root cannot be declared instead, because `units/` is an ANCESTOR of the worker's own world and
   * labelling an ancestor kills the worker. So each sibling is named, which is exactly what §10 preference 2 is
   * for: a root that position cannot hide is DECLARED.
   */
  for (const trajectoryId of trajectoryIds) {
    if (trajectoryId === currentTrajectoryId) continue;
    roots.push(ISOLATED_LAYOUT.unitWorld(runRoot, trajectoryId));
  }
  return Object.freeze([...new Set(roots)]);
}

/** §10: the containment environment a generation runs under, so the fence protects the declared roots. */
export function containmentEnvironment(runRoot, base = process.env, trajectoryIds = []) {
  const separator = process.platform === 'win32' ? ';' : ':';
  return Object.freeze({ ...base, PALIMPSEST_WORKER_PROTECTED_ROOTS: runProtectedRoots(runRoot, trajectoryIds).join(separator) });
}

/** §10: prepare the isolated layout for a run's trajectories. */
export function prepareRunLayout(runRoot, trajectoryIds) {
  buildIsolatedLayout(runRoot, trajectoryIds);
  return Object.freeze({ runRoot, trajectoryIds: Object.freeze([...trajectoryIds]), layout: ISOLATED_LAYOUT });
}

/** §11: copy the prehistory into a trajectory's world and state, so both arms inherit the SAME paid-for history. */
export function prepareTrajectory(runRoot, trajectoryId, prehistory) {
  const world = trajectoryWorld(runRoot, trajectoryId);
  cpSync(prehistory.world, world, { recursive: true });
  const paths = trajectoryPaths(runRoot, trajectoryId);
  cpSync(prehistory.state, paths.state, { recursive: true });
  return Object.freeze({ world, paths });
}

export { ISOLATED_LAYOUT, NL, readFileSync, rmSync, writeFileSync, mkdirSync, pathToFileURL };
