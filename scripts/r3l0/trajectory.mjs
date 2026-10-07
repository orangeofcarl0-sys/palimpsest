/**
 * R3-L0 §5/§12 — THE DETERMINISTIC PREHISTORY AND THE TRAJECTORY RUNNER.
 *
 * §5 requires a FROZEN DETERMINISTIC PREHISTORY representing two already-resolved project incidents, so both
 * arms receive semantically equivalent project world/code, Work history, Attempt/Result history, verification,
 * promotions, intent and receipts. The prehistory establishes that the project has ALREADY PAID the cognitive
 * cost of discovering L1 and L2 — and §5 says the future workers must be able, in principle, to REDISCOVER the
 * lessons from ordinary project/code history. That is intentional, and it is what makes H a real control.
 *
 * §12: THE TRAJECTORY IS THE PRIMARY UNIT. Generations are NOT reset to a reference implementation. Whatever G1
 * promoted is G2's real starting world, and G2's promotion is G3's. Path dependence is part of the treatment, so
 * later-generation raw scores are NOT comparable across arms as though the worlds were still identical.
 *
 * HOW A GENERATION RUNS (§4/§9/§12/§13):
 *
 *   1. a fresh OS process is spawned for the generation;
 *   2. it re-attaches to the durable stores BY PATH and re-resolves the project's own head;
 *   3. the project's requirement for that generation is added through ORDINARY planning;
 *   4. a real DSH worker runs one attempt under the frozen model route;
 *   5. the attempt settles, is gated, promoted and reconciled through the ORDINARY governed path;
 *   6. the research diagnostic oracle judges the promoted source OUTSIDE the world;
 *   7. the next generation starts from what was actually promoted.
 *
 * The generation runs in a CHILD PROCESS so §4's requirements are structural rather than promised: a fresh
 * process cannot hold a previous model transcript, a session-local object identity or an in-memory attempt id,
 * because it never had them.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { dshBin, dshHome, installHostBundle } from '../gates/env.mjs';
import { GENERATIONS, LEDGER_ERRORS, LEDGER_PACKAGE_JSON, LEDGER_PLANS, LEDGER_README, PREHISTORY_INCIDENT_1, PREHISTORY_INCIDENT_2, PREHISTORY_PRIOR_ART, VISIBLE_ORACLE, generationOf } from './project.mjs';
import { diagnosticVector } from './diagnostic.mjs';
import { knowledgeSelectionFor } from './capital.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const NL = String.fromCharCode(10);
export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/* ================================================================ the project world */

/** §5: write the project world. Both arms receive exactly these bytes. */
export function writeProjectWorld(dir, source) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'test'), { recursive: true });
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'README.md'), LEDGER_README, 'utf8');
  writeFileSync(join(dir, 'package.json'), LEDGER_PACKAGE_JSON, 'utf8');
  writeFileSync(join(dir, 'src', 'ledger.mjs'), source, 'utf8');
  writeFileSync(join(dir, 'src', 'plans.mjs'), LEDGER_PLANS, 'utf8');
  writeFileSync(join(dir, 'src', 'errors.mjs'), LEDGER_ERRORS, 'utf8');
  writeFileSync(join(dir, 'test', 'check.js'), VISIBLE_ORACLE, 'utf8');
  /** §5: the project's own incident record — the durable trace of the two prepaid lessons. */
  writeFileSync(join(dir, 'docs', 'incident-1.md'), PREHISTORY_INCIDENT_1, 'utf8');
  writeFileSync(join(dir, 'docs', 'incident-2.md'), PREHISTORY_INCIDENT_2, 'utf8');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0'], { cwd: dir });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
}

/* ================================================================ the DSH worker driver */

/**
 * §13: THE TEE PATH the child passes to the shipped worker port.
 *
 * The child does not build the DSH port itself; it passes this path in its spec, and the shipped
 * `dshSubprocessWorkWorkerPort` re-execs the real DSH bin through it. The wrapper relays the IPC pull channel
 * and tees the transcript, so the child sees exactly what a real host would.
 */
export const TEE_PATH = new URL('../gates/d2-live-tee-worker.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/** §4: the child program the parent spawns, as a committed path so its digest can be recorded. */
export const CHILD_PROGRAM = new URL('./generation-child.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/* ================================================================ the trajectory runner */

/**
 * §4: the trajectory root.
 *
 * The rig MUST live under the user profile. The host's own WRITE_DAC constraint makes a rig inside the checkout
 * unusable: a world created under the repository cannot take its label, and the attempt fails at prepare with
 * an uncertain-outcome refusal. This is the same constraint every existing live gate honours, and it is why
 * `gateRoot()` exists at all.
 */
export function trajectoryRoot(label) {
  const root = join(homedir(), '.palimpsest-r3l0', label);
  mkdirSync(root, { recursive: true });
  return root;
}

/** §4: the durable paths for one trajectory. */
export function trajectoryPaths(root) {
  const state = join(root, 'state');
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

/** §14: the profile a trajectory's generations run under. */
export function makeProfile(home, route, profileId) {
  const profileDir = join(home, 'profiles', profileId);
  mkdirSync(profileDir, { recursive: true });
  const REAL_DSH = dshHome();
  installHostBundle({ repo: REPO_ROOT, realDshHome: REAL_DSH });
  execFileSync('cmd', ['/c', 'mklink', '/J', `${join(home, 'profiles', 'node_modules').replace(/\//gu, '\\')}`, `${join(REAL_DSH, 'profiles', 'node_modules').replace(/\//gu, '\\')}`], { stdio: 'ignore' });
  writeFileSync(join(home, 'settings.yaml'), ['agent-default-model:', `  provider: ${route.providerId}`, `  model: ${route.modelId}`, 'locale:', '  preference: en', ''].join(NL), 'utf8');
  copyFileSync(join(REAL_DSH, '.credentials.yaml'), join(home, '.credentials.yaml'));
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
    `    palimpsestEntry: '${REPO_ROOT}/dist/src/advanced.js'`,
    `    deploymentProfile: '${join(profileDir, 'deployment.json')}'`,
    '    serve: false',
    '    openDashboard: false',
    '',
  ].join(NL), 'utf8');
  writeFileSync(join(profileDir, 'deployment.json'), `${JSON.stringify({ schemaVersion: 1, profileId, projectId: profileId, localPeer: `${profileId}-peer`, persistentPoint: `pp-${profileId}`, repository: join(home, '..', 'repo'), transport: { namespace: profileId, databasePath: join(home, '..', 'state', 'transport.sqlite') }, databases: { orchestration: join(home, '..', 'state', 'orchestration.sqlite'), ordarium: join(home, '..', 'state', 'ordarium.sqlite'), coordination: join(home, '..', 'state', 'coordination.sqlite'), transportCursors: join(home, '..', 'state', 'cursors.sqlite') }, reasoning: {}, execution: 'worktree', concurrency: 1, policy: { allowed_commands: [{ executable: 'node', argv_prefix: ['test/check.js'] }] }, standard: { statement: 'the visible oracle passes' } }, null, 2)}${NL}`, 'utf8');
  return profileId;
}

/** §5/§12: run the visible oracle against a repository, outside the world. */
export function runVisibleOracle(repo) {
  try {
    const output = execFileSync('node', ['test/check.js'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
    return { ok: /ok/u.test(output), detail: output.trim().slice(0, 200) };
  } catch (error) {
    return { ok: false, detail: String(error?.stdout ?? error?.message ?? error).slice(0, 200) };
  }
}

export { GENERATIONS, generationOf, diagnosticVector, knowledgeSelectionFor, REPO_ROOT };
