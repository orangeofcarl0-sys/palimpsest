/**
 * R2-U §9/§10 — THE SCENARIO DEFINITIONS THE R2-U TRIAL HARNESS DRIVES.
 *
 * TWO scenarios:
 *
 *   C  REUSED, NOT REDESIGNED (§9). Scenario C's contract, fixture and hidden acceptance are R1-R's own
 *      files, imported rather than copied, so a later edit to the R1-R fixture would be a visible change
 *      here rather than a silent divergence between two fixtures that claim to be the same one.
 *
 *   D  THE TRUE HOLDOUT (§10). An independent engineering scenario that was NOT used to develop R1-R:
 *      incremental dependency/cache invalidation, a domain structurally different from config migration
 *      and event replay.
 *
 * THE TWO ORACLES, AND WHY BOTH EXIST:
 *
 *   visible oracle    `node test/check.js` inside the world — the worker may run it and iterate on it
 *   hidden acceptance outside the world, authoritative
 *
 * The hidden acceptance module is never copied into a trial world. `assertOracleInaccessible` proves that
 * mechanically — it checks the module's distinctive bytes are absent from the world tree — so a later edit
 * that accidentally inlined it fails a test instead of quietly weakening the contract.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const REPO = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const R1R_FIXTURES = join(REPO, 'scripts', 'r1r', 'fixtures');
const R2U_FIXTURES = join(REPO, 'scripts', 'r2u', 'fixtures');

const git = (cwd, args) => execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/* ---------------------------------------------------------------- scenario table */

/**
 * §9/§10: the two scenarios, frozen here.
 *
 * `sourceFile` is the file the worker is expected to change; `acceptanceModule` is the hidden acceptance,
 * which lives under `fixtures/` and is NEVER copied into a world.
 */
export const SCENARIOS = Object.freeze({
  C: Object.freeze({
    id: 'C',
    name: 'C_REPLAY_SAFE_REDUCER',
    projectId: 'r1r-event-reducer',
    /** §21 of R1-R: the pre-paid cognitive mistake this scenario measures for recurrence. */
    knownFailure: 'mutate/reduce before replay/sequence validity is established',
    knownFailureDetector: 'reducedBeforeWholeHistoryValidation',
    sourceFile: 'src/reducer.ts',
    exportName: 'applyEventStream',
    acceptanceModule: join(R1R_FIXTURES, 'scenario-c', 'acceptance.mjs'),
    fixtureDir: join(R1R_FIXTURES, 'scenario-c'),
    oracleCommand: Object.freeze(['node', 'test/check.js']),
    taskObjective: 'finish applyEventStream so it applies an event log to the store\'s current state',
    projectGoal: 'make replay produce the same state on every replica',
    requirements: Object.freeze([
      'applyEventStream must apply a log to the caller\'s state deterministically',
      'the result must be correct for every log the store admits',
    ]),
    /** The needles that prove the hidden acceptance is not reachable from a world (§5). */
    hiddenNeedles: Object.freeze(['THE HIDDEN ACCEPTANCE', 'reduceEventStreamReference', 'migrateConfigReference']),
  }),
  D: Object.freeze({
    id: 'D',
    name: 'D_INCREMENTAL_CACHE_INVALIDATION',
    projectId: 'r2u-incremental-cache',
    /** §10: the pre-paid cognitive mistake this scenario measures for recurrence. */
    knownFailure: 'invalidate the changed nodes before the affected closure is computed',
    knownFailureDetector: 'invalidateBeforeClosureFrozen',
    sourceFile: 'src/cache.ts',
    exportName: 'invalidateCache',
    acceptanceModule: join(R2U_FIXTURES, 'scenario-d', 'acceptance.mjs'),
    fixtureDir: join(R2U_FIXTURES, 'scenario-d'),
    oracleCommand: Object.freeze(['node', 'test/check.js']),
    taskObjective: 'finish invalidateCache so it updates the cache after a set of source nodes changed',
    projectGoal: 'keep an incremental build cache correct as its inputs change',
    /**
     * §10: the requirements state the BROAD goal and must NOT enumerate the closure rule. Saying "a node
     * computed from a changed node must also be invalidated" would be the method stated outright, and C0
     * would then have the pre-paid mistake already avoided on its first candidate — the primary measure
     * would have no headroom. These requirements are deliberately satisfiable-looking without the rule.
     */
    requirements: Object.freeze([
      'invalidateCache must update the cache for the nodes whose source changed',
      'the cache must be correct for every change set the build admits',
    ]),
    hiddenNeedles: Object.freeze(['THE HIDDEN ACCEPTANCE', 'invalidateCacheReference']),
  }),
});

/* ---------------------------------------------------------------- world construction */

/** Recursively list files under a directory, relative to it, POSIX-style. */
export function listFiles(root) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(root, '');
  return out.sort();
}

/**
 * Files that must NOT be copied into a worker's world.
 *
 * `acceptance.mjs` is the hidden acceptance itself. `acceptance.d.mts` is its TYPE DECLARATION — harness
 * scaffolding added so the TypeScript tests can import the `.mjs` under `noImplicitAny`. It names the
 * reference implementation's export, so copying it would leak that identity into the world; the
 * accessibility check caught exactly that for R1-R, which is why the exclusion is a list of names.
 */
const WORLD_EXCLUDES = Object.freeze(['acceptance.mjs', 'acceptance.d.mts']);

export function buildWorld(scenario, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(scenario.fixtureDir, dir, {
    recursive: true,
    filter: (source) => !WORLD_EXCLUDES.includes(source.split(/[\\/]/u).pop() ?? ''),
  });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0'], { cwd: dir });
  return git(dir, ['rev-parse', 'HEAD']);
}

/**
 * PROVE the hidden acceptance is not reachable from the world.
 *
 * Not a path check — a CONTENT check. The acceptance module's distinctive source bytes must appear nowhere
 * under the world. This is what makes "it may NOT read the hidden acceptance implementation" a mechanical
 * fact rather than a claim about the layout.
 */
export function assertOracleInaccessible(scenario, worldDir) {
  const acceptanceText = readFileSync(scenario.acceptanceModule, 'utf8');
  const needles = scenario.hiddenNeedles;
  const found = [];
  for (const relative of listFiles(worldDir)) {
    if (relative.startsWith('.git/')) continue;
    const text = readFileSync(join(worldDir, relative), 'utf8');
    for (const needle of needles) {
      if (acceptanceText.includes(needle) && text.includes(needle)) found.push(`${relative}:${needle}`);
    }
  }
  if (found.length > 0) {
    throw new Error(`§5 VIOLATION: the hidden acceptance is reachable from the world at ${found.join(', ')}`);
  }
  return Object.freeze({ checkedFiles: listFiles(worldDir).filter((relative) => !relative.startsWith('.git/')).length, needles: [...needles] });
}

/* ---------------------------------------------------------------- hidden acceptance */

export async function loadAcceptance(scenario) {
  return await import(`file://${scenario.acceptanceModule.replace(/\\/gu, '/')}`);
}

/**
 * Judge a candidate implementation against the HIDDEN acceptance.
 *
 * The candidate's source is read out of the world's committed tree and imported in a SCRATCH directory
 * that contains only the fixture's scaffolding — never the world itself — so a candidate cannot see or
 * influence the judging environment.
 */
export async function judgeHidden(scenario, sourceText, scratchDir) {
  const acceptance = await loadAcceptance(scenario);
  rmSync(scratchDir, { recursive: true, force: true });
  mkdirSync(join(scratchDir, 'src'), { recursive: true });
  const target = join(scratchDir, scenario.sourceFile);
  mkdirSync(join(target, '..'), { recursive: true });
  await import('node:fs').then(({ writeFileSync }) => writeFileSync(target, sourceText, 'utf8'));
  const module = await import(`file://${target.replace(/\\/gu, '/')}?v=${String(Date.now())}`);
  const fn = module[scenario.exportName];
  if (typeof fn !== 'function') throw new Error(`the candidate does not export a function named ${scenario.exportName}`);
  const hidden = acceptance.materialize(acceptance.HIDDEN_CASES);
  return acceptance.runCases(fn, hidden);
}

/* ---------------------------------------------------------------- digests */

/** The digest of a file's bytes, or "ABSENT". */
export function fileDigest(path) {
  return existsSync(path) ? sha256(readFileSync(path)) : 'ABSENT';
}

/**
 * §8: the invariant identity of one trial's WORLD AND TASK, before any capital is selected.
 *
 * These must match WITHIN a randomized block across all four cells. The two things deliberately NOT here
 * are the context index and the uptake-affordance clause — those are the treatment, and they are recorded
 * separately so a single digest cannot mask the factor.
 */
export function pairedStateDigest(scenario, worldDir, task) {
  const acceptanceBytes = readFileSync(scenario.acceptanceModule);
  const visibleFiles = listFiles(worldDir).filter((relative) => !relative.startsWith('.git/'));
  const visibleDigest = sha256(visibleFiles.map((relative) => `${relative}:${fileDigest(join(worldDir, relative))}`).join('\n'));
  return Object.freeze({
    scenarioId: scenario.name,
    taskSemanticDigest: sha256(JSON.stringify({ objective: task.objective, writePaths: [...task.write_paths], requirements: [...scenario.requirements] })),
    repositoryHead: git(worldDir, ['rev-parse', 'HEAD']),
    startingTreeDigest: visibleDigest,
    targetSourceDigest: fileDigest(join(worldDir, scenario.sourceFile)),
    visibleTestDigest: visibleDigest,
    hiddenOracleDigest: sha256(acceptanceBytes),
    visibleFileCount: visibleFiles.length,
  });
}

/**
 * §8: the fields the within-block comparison actually uses. `repositoryHead` is deliberately excluded — it
 * is a per-run SHA, and comparing it would report every block as confounded for a reason that has nothing
 * to do with the experiment.
 */
export const PAIRED_STATE_COMPARABLE_FIELDS = Object.freeze([
  'scenarioId',
  'taskSemanticDigest',
  'startingTreeDigest',
  'targetSourceDigest',
  'visibleTestDigest',
  'hiddenOracleDigest',
  'visibleFileCount',
]);
