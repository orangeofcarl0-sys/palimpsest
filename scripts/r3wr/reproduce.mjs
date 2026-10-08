/**
 * R3-WR GATE 1 — THE DETERMINISTIC REPRODUCTION.
 *
 * The ruling requires the defect to be reproduced through the SAME SHIPPED PREPARATION PATH the runtime uses, on
 * temporary roots, with no LLM. The path is `git clone --shared --no-checkout`, which is what
 * `src/effects/git_port.ts createWorld` runs and what produces the `objects/info/alternates` entry.
 *
 * WHAT THIS MODULE MEASURES, and why each measurement is a separate question:
 *
 *   the clone succeeds                     the shipped call itself works
 *   HEAD resolves                          the world can name its basis
 *   the basis object is reachable          the world can read what it was cloned at
 *   a commit succeeds                      THE QUESTION THE STAGE EXISTS FOR
 *   the commit is readable afterwards      the export path can carry it back
 *
 * A reproduction is only meaningful if it exercises the SHIPPED call. A hand-built clone would prove that
 * hand-built clones work, which is not in question.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NL = String.fromCharCode(10);

/** Run git, capturing the verdict rather than throwing. */
function git(cwd, args, options = {}) {
  try {
    return Object.freeze({ ok: true, exit: 0, stdout: execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...options }).trim(), stderr: '' });
  } catch (error) {
    /**
     * The EXIT CODE is carried because git uses it as a verdict: `commit --dry-run` exits 1 for "nothing to
     * commit", which is a legitimate clean world rather than a failure. Callers that decide capability by
     * exit code need it, and callers that decide by message text ignore it.
     */
    return Object.freeze({ ok: false, exit: typeof error?.status === 'number' ? error.status : -1, stdout: String(error?.stdout ?? '').trim(), stderr: String(error?.stderr ?? error?.message ?? error).trim() });
  }
}

/**
 * GATE 1: BUILD A BASIS REPOSITORY.
 *
 * It mirrors the experimental world: a small project with a committed source file, so a worker has something
 * real to modify and commit. It is built in a temporary root and never touches the checkout.
 */
export function makeBasisRepository(root) {
  const repo = join(root, 'canonical');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'README.md'), `# basis${NL}`, 'utf8');
  writeFileSync(join(repo, 'src', 'ledger.mjs'), ['export const answer = 0;', ''].join(NL), 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=b@b.b', '-c', 'user.name=b', 'commit', '-qm', 'basis']);
  return Object.freeze({ repo, basisCommit: git(repo, ['rev-parse', 'HEAD']).stdout });
}

/**
 * GATE 1: THE SHIPPED WORLD PREPARATION, COPIED VERBATIM IN ORDER AND ARGUMENTS.
 *
 * `clone --shared --no-checkout`, then `checkout --detach`, then `remote remove origin`, then the operational
 * identity. Every argument matches `createWorld`, so a failure here is a failure of the shipped call.
 */
export function createWorldLikeShipped(input) {
  const { repository, worldPath, baseCommit } = input;
  const steps = [];
  const record = (name, result) => steps.push(Object.freeze({ name, ok: result.ok, stdout: result.stdout.slice(0, 200), stderr: result.stderr.slice(0, 200) }));

  const clone = git(repository, ['clone', '--shared', '--no-checkout', repository, worldPath], { cwd: repository });
  record('clone --shared --no-checkout', clone);
  if (!clone.ok) return Object.freeze({ worldPath, steps: Object.freeze(steps), created: false });

  record('checkout --detach', git(worldPath, ['checkout', '--detach', baseCommit]));
  record('remote remove origin', git(worldPath, ['remote', 'remove', 'origin']));
  record('config user.name', git(worldPath, ['config', 'user.name', 'Palimpsest Worker']));
  record('config user.email', git(worldPath, ['config', 'user.email', 'worker@palimpsest.invalid']));
  return Object.freeze({ worldPath, steps: Object.freeze(steps), created: true });
}

/**
 * GATE 1: THE WORKER'S SUPPORTED COMMIT PATH.
 *
 * It is `git add -A` then `git commit -m`, which is exactly what `git_port.commit` runs. A probe that committed
 * some other way would not be testing the path a worker uses.
 */
export function workerCommit(input) {
  const { worldPath, message = 'worker change' } = input;
  const add = git(worldPath, ['add', '-A']);
  const commit = git(worldPath, ['commit', '-m', message]);
  const combined = `${commit.stdout}${NL}${commit.stderr}`;
  return Object.freeze({
    addOk: add.ok,
    commitOk: commit.ok,
    couldNotParseHead: /could not parse HEAD/iu.test(combined),
    unableToNormalizeAlternate: /unable to normalize alternate object path/iu.test(combined),
    output: combined.trim().slice(0, 300),
  });
}

/**
 * GATE 1: THE READINESS FACTS after preparation.
 *
 * The three the ruling names — HEAD resolvable, required objects resolvable, commit capable — plus the basis
 * object specifically, because a world that can name its HEAD but cannot read its BASIS is exactly the state
 * that produced the original failure.
 */
export function readinessOf(input) {
  const { worldPath, basisCommit } = input;
  const head = git(worldPath, ['rev-parse', '--verify', 'HEAD']);
  const basis = git(worldPath, ['cat-file', '-e', `${basisCommit}^{commit}`]);
  return Object.freeze({
    WORKTREE_HEAD_RESOLVABLE: head.ok,
    WORKTREE_REQUIRED_OBJECTS_RESOLVABLE: basis.ok,
    head: head.ok ? head.stdout : null,
    headError: head.ok ? null : head.stderr,
    basisReadable: basis.ok,
    basisError: basis.ok ? null : basis.stderr,
  });
}

/**
 * GATE 1: ONE FULL ROUND.
 *
 * create → prepare → resolve → modify → commit → verify, which is the sequence the ruling specifies. It returns
 * the observed facts rather than a pass/fail, so a caller can see WHICH step failed.
 */
export function oneRound(input) {
  const { root, label, mutate = true } = input;
  const basis = makeBasisRepository(root);
  const worldPath = join(root, `world-${label}`);
  const prepared = createWorldLikeShipped({ repository: basis.repo, worldPath, baseCommit: basis.basisCommit });
  if (!prepared.created) return Object.freeze({ label, created: false, steps: prepared.steps, basis: basis.basisCommit });

  const before = readinessOf({ worldPath, basisCommit: basis.basisCommit });
  if (mutate) writeFileSync(join(worldPath, 'src', 'ledger.mjs'), ['export const answer = 42;', ''].join(NL), 'utf8');
  const commit = workerCommit({ worldPath, message: `round ${label}` });
  const after = readinessOf({ worldPath, basisCommit: basis.basisCommit });
  const exportable = git(basis.repo, ['fetch', '--no-tags', worldPath, 'HEAD']);

  return Object.freeze({
    label,
    created: true,
    basis: basis.basisCommit,
    steps: prepared.steps,
    before,
    commit,
    after,
    exportable: exportable.ok,
    exportError: exportable.ok ? null : exportable.stderr,
    /** The alternates the shipped clone wrote, so the reproduction records the mechanism it produced. */
    alternates: readAlternates(worldPath),
  });
}

/** The alternates file of a world, as text plus its decoded entries. */
export function readAlternates(worldPath) {
  const path = join(worldPath, '.git', 'objects', 'info', 'alternates');
  try {
    const text = readFileSync(path, 'utf8');
    const entries = text.split(/\r?\n/u).filter((line) => line.trim() !== '').map((line) => {
      const resolved = line.trim();
      let type = 'ABSENT';
      try { type = statSync(resolved).isDirectory() ? 'DIRECTORY' : 'FILE'; } catch { type = 'ABSENT'; }
      return Object.freeze({ resolved, type, mixedSeparator: /\\[^\\]*\//u.test(resolved) || /\/[^/]*\\/u.test(resolved) });
    });
    return Object.freeze({ present: true, text, entries: Object.freeze(entries) });
  } catch {
    return Object.freeze({ present: false, entries: Object.freeze([]) });
  }
}

/**
 * GATE 1: THE REPRODUCTION SUITE.
 *
 * Several rounds, because the original failure was intermittent — the same worktree later committed
 * successfully, so a single round that passes would not distinguish "repaired" from "lucky". A deterministic
 * defect must fail EVERY round; an intermittent one must fail SOME, and the rate is the finding.
 */
export function reproduce(input = {}) {
  const rounds = input.rounds ?? 5;
  const base = mkdtempSync(join(tmpdir(), 'r3wr-repro-'));
  const results = [];
  try {
    for (let index = 0; index < rounds; index += 1) {
      const root = join(base, `round-${String(index)}`);
      mkdirSync(root, { recursive: true });
      results.push(oneRound({ root, label: `r${String(index)}` }));
    }
  } finally {
    if (input.keep !== true) rmSync(base, { recursive: true, force: true });
  }
  const created = results.filter((round) => round.created);
  const committed = created.filter((round) => round.commit?.commitOk);
  return Object.freeze({
    kind: 'worktree object-store reproduction',
    rounds,
    worldsCreated: created.length,
    commitsSucceeded: committed.length,
    commitsFailed: created.length - committed.length,
    REPRODUCED: created.length > 0 && committed.length < created.length,
    failureSignatures: Object.freeze(created.filter((round) => !round.commit?.commitOk).map((round) => Object.freeze({ label: round.label, couldNotParseHead: round.commit?.couldNotParseHead, unableToNormalizeAlternate: round.commit?.unableToNormalizeAlternate, output: round.commit?.output }))),
    alternatesShape: Object.freeze(created.map((round) => Object.freeze({ label: round.label, entries: round.alternates.entries }))),
    rounds_detail: Object.freeze(results),
  });
}

export { NL, git };
