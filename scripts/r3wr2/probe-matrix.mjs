/**
 * R3-WR2 GATE B — THE READINESS-CRITERION MATRIX (exploration).
 *
 * Gate B asks whether an UNRECOGNIZED `git commit --dry-run` failure can silently become READY. The shipped
 * gate decides capability by a DENYLIST of error strings, so any failure outside that list falls through to
 * READY. This matrix enumerates healthy and faulty worlds and measures, for each, the candidate signals a
 * corrected gate could use — so the correction is chosen from measured behaviour rather than guessed.
 *
 * PLAIN JAVASCRIPT (`.mjs`). Temporary roots only. No LLM.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NL = String.fromCharCode(10);

function git(cwd, args) {
  try {
    return Object.freeze({ exit: 0, ok: true, out: execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim(), err: '' });
  } catch (error) {
    const status = typeof error?.status === 'number' ? error.status : -1;
    return Object.freeze({ exit: status, ok: false, out: String(error?.stdout ?? '').trim(), err: String(error?.stderr ?? error?.message ?? error).trim() });
  }
}

function makeBasis(root) {
  const repo = join(root, 'canonical');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'ledger.mjs'), `export const answer = 0;${NL}`, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=b@b.b', '-c', 'user.name=b', 'commit', '-qm', 'basis']);
  return Object.freeze({ repo, basisCommit: git(repo, ['rev-parse', 'HEAD']).out });
}

function world(root, label, basis) {
  const worldPath = join(root, `world-${label}`);
  git(basis.repo, ['clone', '--shared', '--no-checkout', basis.repo, worldPath]);
  git(worldPath, ['checkout', '--detach', basis.basisCommit]);
  return worldPath;
}

/** The candidate signals, measured for every world. */
function signals(worldPath, basisCommit) {
  const head = git(worldPath, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const basis = git(worldPath, ['cat-file', '-e', `${basisCommit}^{commit}`]);
  const status = git(worldPath, ['status', '--porcelain']);
  const dry = git(worldPath, ['commit', '--dry-run', '-m', 'readiness-probe']);
  const writeTree = git(worldPath, ['write-tree']);
  const dryText = `${dry.out}${NL}${dry.err}`;
  /**
   * THE CANDIDATE CORRECTED CRITERION — POSITIVE and EXIT-CODE-ONLY, so no message text is matched and the
   * decision cannot be defeated by a locale, a wording change, or an error git has not emitted before.
   *
   *   HEAD^{commit} resolves        the world can name a commit, not merely a ref
   *   base commit readable          the borrowed store can deliver the basis
   *   status --porcelain exits 0    the index is READABLE (this is what a corrupt index breaks)
   *   dry-run exits 0 or 1          git's own convention: 0 = would commit, 1 = nothing to commit. Every
   *                                 other exit is a fatal error and is refused. Exit 1 is NOT read as
   *                                 "nothing to commit" by inspecting text; it is read as git's success
   *                                 convention for a no-op, which is what keeps the criterion locale-free.
   */
  const headCommit = git(worldPath, ['rev-parse', '--verify', 'HEAD^{commit}']);
  /**
   * Exit 1 is honoured ONLY with an empty porcelain status, i.e. as git's own "nothing to commit". Accepting a
   * bare exit 1 would also accept a pre-commit refusal on a world that DOES hold staged work — a world that
   * cannot commit while claiming to be ready, which is the exact failure class this gate exists to catch.
   */
  const cleanNoOp = status.ok && status.out === '' && dry.exit === 1;
  const corrected = headCommit.ok && basis.ok && status.ok && (dry.exit === 0 || cleanNoOp);
  return Object.freeze({
    headExit: head.exit,
    headCommitExit: headCommit.exit,
    basisExit: basis.exit,
    statusExit: status.exit,
    statusNonEmpty: status.out !== '',
    dryExit: dry.exit,
    writeTreeExit: writeTree.exit,
    correctedReady: corrected,
    dryText: dryText.trim().slice(0, 120),
    denylistWouldPass: !/could not parse HEAD|bad object|unable to normalize alternate|not a git repository|object directory|does not exist/iu.test(dryText),
  });
}

function scenarioMatrix() {
  const root = mkdtempSync(join(tmpdir(), 'r3wr2-matrix-'));
  const rows = [];
  let moveSeq = 0;
  const add = (label, mutate) => {
    const caseRoot = join(root, label);
    mkdirSync(caseRoot, { recursive: true });
    const basis = makeBasis(caseRoot);
    const w = world(caseRoot, label, basis);
    /** A move destination OUTSIDE the case root, so a rename can never collide with an existing directory. */
    const moveAside = (from, tag) => { moveSeq += 1; renameSync(from, join(root, `aside-${String(moveSeq)}-${tag}`)); };
    const injected = mutate ? mutate({ worldPath: w, basis, root: caseRoot, moveAside }) : null;
    rows.push(Object.freeze({ label, injected, ...signals(w, basis.basisCommit) }));
  };

  add('healthy-clean', null);
  add('healthy-staged', ({ worldPath }) => { writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 1;${NL}`, 'utf8'); git(worldPath, ['add', '-A']); return 'staged change'; });
  add('healthy-unstaged', ({ worldPath }) => { writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 2;${NL}`, 'utf8'); return 'unstaged edit, the resumed-worker state'; });
  add('corrupt-index', ({ worldPath }) => { writeFileSync(join(worldPath, '.git', 'index'), 'GARBAGE'); return 'index overwritten with garbage'; });
  add('missing-alternate-target', ({ basis, moveAside }) => { moveAside(join(basis.repo, '.git', 'objects'), 'alt-objects'); return 'alternate target moved aside'; });
  add('world-objects-moved', ({ worldPath, moveAside }) => { moveAside(join(worldPath, '.git', 'objects'), 'world-objects'); return 'the world own objects dir moved aside'; });
  add('index-lock-held', ({ worldPath }) => { writeFileSync(join(worldPath, '.git', 'index.lock'), ''); return 'index.lock present'; });
  add('head-garbled', ({ worldPath }) => { writeFileSync(join(worldPath, '.git', 'HEAD'), `ref: refs/heads/nonexistent${NL}`); return 'HEAD points at a missing ref'; });
  /**
   * THE ADVERSARIAL CASE for the criterion itself: a pre-commit hook that refuses while the world HOLDS staged
   * work. The tree is not clean, so exit 1 must NOT be read as "nothing to commit" — this is a world that
   * cannot commit and must be refused.
   */
  add('hook-refuses-with-staged-work', ({ worldPath }) => {
    writeFileSync(join(worldPath, '.git', 'hooks', 'pre-commit'), `#!/bin/sh${NL}echo "refused by policy" 1>&2${NL}exit 1${NL}`, 'utf8');
    writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 3;${NL}`, 'utf8');
    git(worldPath, ['add', '-A']);
    return 'pre-commit hook refuses with staged work';
  });

  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  return Object.freeze(rows);
}

const rows = scenarioMatrix();
process.stdout.write(`scenario                          head hCommit basis status dry  writeTree denylist    corrected  dryText${NL}`);
for (const row of rows) {
  process.stdout.write(
    `${row.label.padEnd(32)} ${String(row.headExit).padStart(4)} ${String(row.headCommitExit).padStart(7)} ${String(row.basisExit).padStart(5)} ${String(row.statusExit).padStart(6)} ${String(row.dryExit).padStart(4)} ${String(row.writeTreeExit).padStart(9)} ${(row.denylistWouldPass ? 'PASS(fail-open)' : 'refused       ').padEnd(13)} ${(row.correctedReady ? 'READY' : 'refused').padEnd(9)} ${row.dryText}${NL}`,
  );
}
