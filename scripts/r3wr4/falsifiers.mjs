/**
 * R3-WR4 GATE A — FALSIFIERS FOR WORLD IDENTITY, BASIS IDENTITY AND EFFECT AUTHORITY.
 *
 * Every claim here is a MEASUREMENT against the FROZEN R3-WR3 compiled port
 * (`baseline/git_port.r3wr3.mjs`, a byte copy of `dist/src/effects/git_port.js` at `8c39c21`) compared with the
 * compiled port under test. The baseline is what makes "the old implementation violated this" a fact about
 * shipped code rather than a claim about it, and the ruling requires it: a defect that escaped must be
 * demonstrated against the code that let it escape.
 *
 * THE ARMS:
 *
 *   A2  the frozen basis counterexample   B0 -> B1 -> X, then createWorld(W, B1)
 *   A3  Git administrative audit          --show-toplevel, --absolute-git-dir, --git-common-dir, and the
 *                                         borrowed-object shape that must NOT be rejected
 *   A4  conflicting operation             a distinct operation identity reaching for a world it does not own
 *   A5  concurrency                       counted dispatches, not settled-Promise arithmetic
 *
 * PLAIN JAVASCRIPT (`.mjs`). Temporary roots only. No LLM, no network.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const git = (cwd, args) => {
  try {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return `ERR:${String(error?.stderr ?? error?.message ?? error).trim().slice(0, 160)}`;
  }
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/** The canonical repository's load-bearing state, so "nothing was mutated" is a measurement. */
export function canonicalState(repo) {
  return Object.freeze({
    head: git(repo, ['rev-parse', 'HEAD']),
    symbolicRef: git(repo, ['symbolic-ref', '-q', 'HEAD']),
    showRef: git(repo, ['show-ref']),
    remotes: git(repo, ['remote', '-v']),
    userName: git(repo, ['config', '--get', 'user.name']),
    userEmail: git(repo, ['config', '--get', 'user.email']),
    status: git(repo, ['status', '--porcelain']),
    configDigest: sha256(git(repo, ['config', '--list', '--local'])),
  });
}

/** A world's HEAD, index, work tree and Git config — everything a reuse must not disturb. */
export function worldState(worldPath) {
  const files = {};
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name === '.git') continue;
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else files[rel] = sha256(readFileSync(join(dir, entry.name)));
    }
  };
  try { walk(worldPath); } catch { return Object.freeze({ absent: true }); }
  return Object.freeze({
    absent: false,
    head: git(worldPath, ['rev-parse', 'HEAD']),
    status: git(worldPath, ['status', '--porcelain']),
    files: Object.freeze(files),
    configDigest: sha256(git(worldPath, ['config', '--list', '--local'])),
    binding: (() => {
      const file = join(worldPath, '.git', 'palimpsest-world-binding.json');
      return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
    })(),
  });
}

/** A basis repository with one commit. */
export function makeBasis(root) {
  const repo = join(root, 'canonical');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'ledger.mjs'), `export const answer = 0;${NL}`, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=b@b.b', '-c', 'user.name=b', 'commit', '-qm', 'basis']);
  return Object.freeze({ repo, basisCommit: git(repo, ['rev-parse', 'HEAD']) });
}

/** The frozen baseline and the port under test, loaded by PATH so the build is not an input. */
export async function loadPorts() {
  const baseline = await import(pathToFileURL(join(REPO, 'scripts', 'r3wr4', 'baseline', 'git_port.r3wr3.mjs')).href);
  const current = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'git_port.js')).href);
  return Object.freeze({ R3WR3: baseline.GitCliPort, CURRENT: current.GitCliPort });
}

/* ================================================================== *
 * A2 — THE FROZEN BASIS COUNTEREXAMPLE
 * ================================================================== */

/**
 * `B0 -> B1 -> X`, then `createWorld(W, B1)`.
 *
 * The world was created at B0. B1 is a commit the world's worker made ON TOP of B0, and X is the candidate on
 * top of B1. So B1 IS an ancestor of X, and an ancestry test accepts the request — even though the world's
 * ORIGINAL basis is B0 and the request names a base the attempt never started from.
 *
 * Four things are recorded for each port, because "refused" is only half the property: the refusal must not
 * have moved anything, and a legitimate replay on B0 must still work.
 */
export async function basisIdentityArm(Port, label) {
  const root = mkdtempSync(join(tmpdir(), `r3wr4-a2-${label}-`));
  try {
    const basis = makeBasis(root);
    const port = new Port(basis.repo, join(basis.repo, '.palimpsest', 'worlds'));
    const created = await port.createWorld({ worktreeId: 'attempt-a2', baseCommit: basis.basisCommit });
    const worldPath = created.worldPath;

    /** The world's own history, built INSIDE it: B0 -> B1 -> X. */
    writeFileSync(join(worldPath, 'src', 'step1.mjs'), `export const step = 1;${NL}`, 'utf8');
    git(worldPath, ['add', '-A']);
    git(worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'B1']);
    const innerB1 = git(worldPath, ['rev-parse', 'HEAD']);
    writeFileSync(join(worldPath, 'src', 'candidate-only.mjs'), `export const candidate = 1;${NL}`, 'utf8');
    writeFileSync(join(worldPath, 'src', 'uncommitted.mjs'), `export const pending = 1;${NL}`, 'utf8');
    git(worldPath, ['add', 'src/candidate-only.mjs']);
    git(worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'X']);
    const candidateHead = git(worldPath, ['rev-parse', 'HEAD']);

    const canonicalBefore = canonicalState(basis.repo);
    const worldBefore = worldState(worldPath);

    /** THE COUNTEREXAMPLE: ask for B1, which the world never started from. */
    let wrong;
    try {
      const again = await port.createWorld({ worktreeId: 'attempt-a2', baseCommit: innerB1 });
      wrong = { returned: true, worldPath: again.worldPath };
    } catch (error) {
      wrong = { returned: false, error: String(error?.message ?? error).slice(0, 200) };
    }
    const afterWrong = worldState(worldPath);
    const canonicalAfterWrong = canonicalState(basis.repo);

    /** THE LEGITIMATE REPLAY: the world's ACTUAL basis. */
    let right;
    try {
      const again = await port.createWorld({ worktreeId: 'attempt-a2', baseCommit: basis.basisCommit });
      right = { returned: true, worldPath: again.worldPath };
    } catch (error) {
      right = { returned: false, error: String(error?.message ?? error).slice(0, 200) };
    }
    const afterRight = worldState(worldPath);

    return Object.freeze({
      label,
      basis: basis.basisCommit,
      innerB1,
      candidateHead,
      wrongBasisRequest: wrong,
      legitBasisRequest: right,
      /** The escaped defect: a request for an ancestor that is NOT the world's basis was ACCEPTED. */
      WRONG_ANCESTOR_BASIS_ACCEPTED: wrong.returned === true,
      /** A refusal must not have moved the world. */
      refusalLeftWorldInPlace: wrong.returned === true
        ? true
        : afterWrong.head === worldBefore.head && JSON.stringify(afterWrong.files) === JSON.stringify(worldBefore.files),
      refusalLeftCanonicalIdentical: JSON.stringify(canonicalBefore) === JSON.stringify(canonicalAfterWrong),
      /** The positive control: the world's real basis is still usable, and nothing was lost. */
      legitBasisAccepted: right.returned === true,
      HEAD_PRESERVED: afterRight.head === candidateHead,
      CANDIDATE_PRESERVED: afterRight.files['src/candidate-only.mjs'] === worldBefore.files['src/candidate-only.mjs'],
      COMMITTED_STEP_PRESERVED: afterRight.files['src/step1.mjs'] === worldBefore.files['src/step1.mjs'],
      UNCOMMITTED_PRESERVED: afterRight.files['src/uncommitted.mjs'] === worldBefore.files['src/uncommitted.mjs'],
      candidateStillReachable: git(worldPath, ['merge-base', '--is-ancestor', candidateHead, 'HEAD']) === '',
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene */ }
  }
}

/* ================================================================== *
 * A3 — THE GIT ADMINISTRATIVE / COMMON-DIRECTORY AUDIT
 * ================================================================== */

/**
 * Three questions per shape, because "isolated" is a conjunction:
 *
 *   --show-toplevel     names the expected physical world root
 *   --absolute-git-dir  names an administrative directory OWNED BY the world
 *   --git-common-dir    does not place writable common metadata outside the declared ownership boundary
 *
 * And the distinction the ruling requires: the NORMAL borrowed-object directory named by
 * `objects/info/alternates` is supported and must NOT be refused, while a linked/foreign administrative state
 * must be. The two are told apart by WHICH mechanism carries the borrowing: alternates carries immutable
 * objects; a common directory carries refs, config and remotes.
 */
export async function gitAdministrativeAudit() {
  const root = mkdtempSync(join(tmpdir(), 'r3wr4-a3-'));
  const { R3WR3, CURRENT } = await loadPorts();
  const shapes = [];
  try {
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');

    /** Shape 1: the supported `clone --shared` world. */
    {
      const port = new CURRENT(basis.repo, worldsRoot);
      const created = await port.createWorld({ worktreeId: 'attempt-supported', baseCommit: basis.basisCommit });
      const worldPath = created.worldPath;
      const alternates = join(worldPath, '.git', 'objects', 'info', 'alternates');
      let reuse = null;
      try {
        const again = await port.createWorld({ worktreeId: 'attempt-supported', baseCommit: basis.basisCommit });
        reuse = { returned: true, samePath: again.worldPath === worldPath };
      } catch (error) {
        reuse = { returned: false, error: String(error?.message ?? error).slice(0, 160) };
      }
      shapes.push(Object.freeze({
        shape: 'SUPPORTED_BORROWED_OBJECT_WORLD',
        toplevel: git(worldPath, ['rev-parse', '--show-toplevel']),
        absoluteGitDir: git(worldPath, ['rev-parse', '--absolute-git-dir']),
        commonDir: git(worldPath, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
        toplevelIsWorldRoot: git(worldPath, ['rev-parse', '--show-toplevel']).replace(/\\/gu, '/') === worldPath.replace(/\\/gu, '/'),
        gitDirInsideWorld: git(worldPath, ['rev-parse', '--absolute-git-dir']).replace(/\\/gu, '/').startsWith(`${worldPath.replace(/\\/gu, '/')}/`),
        commonDirInsideWorld: git(worldPath, ['rev-parse', '--path-format=absolute', '--git-common-dir']).replace(/\\/gu, '/').startsWith(`${worldPath.replace(/\\/gu, '/')}/`),
        alternatesPresent: existsSync(alternates),
        alternatesTarget: existsSync(alternates) ? readFileSync(alternates, 'utf8').trim() : null,
        reuse,
        /** The requirement: legitimate borrowing must NOT be rejected. */
        LEGITIMATE_BORROW_ACCEPTED: reuse.returned === true && reuse.samePath === true,
      }));
    }

    /** Shape 2: a world whose COMMON directory is the CANONICAL repository's. */
    {
      const port = new CURRENT(basis.repo, worldsRoot);
      const created = await port.createWorld({ worktreeId: 'attempt-canonical-common', baseCommit: basis.basisCommit });
      const worldPath = created.worldPath;
      git(basis.repo, ['remote', 'add', 'origin', 'https://example.invalid/canonical.git']);
      const canonicalBefore = canonicalState(basis.repo);
      writeFileSync(join(worldPath, '.git', 'commondir'), `${join(basis.repo, '.git').replace(/\\/gu, '/')}${NL}`, 'utf8');
      let reuse;
      try {
        await port.createWorld({ worktreeId: 'attempt-canonical-common', baseCommit: basis.basisCommit });
        reuse = { returned: true };
      } catch (error) {
        reuse = { returned: false, error: String(error?.message ?? error).slice(0, 200) };
      }
      const canonicalAfter = canonicalState(basis.repo);
      shapes.push(Object.freeze({
        shape: 'COMMON_DIR_IS_CANONICAL_REPOSITORY',
        commonDir: join(basis.repo, '.git').replace(/\\/gu, '/'),
        reuse,
        CANONICAL_COMMON_DIR_REFUSED: reuse.returned === false,
        canonicalUnchanged: JSON.stringify(canonicalBefore) === JSON.stringify(canonicalAfter),
        canonicalRemoteSurvived: canonicalAfter.remotes === canonicalBefore.remotes,
      }));
    }

    /** Shape 3: a world whose COMMON directory is some OTHER external directory. */
    {
      const port = new CURRENT(basis.repo, worldsRoot);
      const created = await port.createWorld({ worktreeId: 'attempt-foreign-common', baseCommit: basis.basisCommit });
      const worldPath = created.worldPath;
      const foreign = join(root, 'foreign-common');
      mkdirSync(join(foreign, 'refs'), { recursive: true });
      mkdirSync(join(foreign, 'objects'), { recursive: true });
      writeFileSync(join(worldPath, '.git', 'commondir'), `${foreign.replace(/\\/gu, '/')}${NL}`, 'utf8');
      let reuse;
      try {
        await port.createWorld({ worktreeId: 'attempt-foreign-common', baseCommit: basis.basisCommit });
        reuse = { returned: true };
      } catch (error) {
        reuse = { returned: false, error: String(error?.message ?? error).slice(0, 200) };
      }
      shapes.push(Object.freeze({
        shape: 'COMMON_DIR_OUTSIDE_WORLD',
        commonDir: foreign.replace(/\\/gu, '/'),
        reuse,
        FOREIGN_COMMON_DIR_REFUSED: reuse.returned === false,
      }));
    }

    /** Shape 4: a linked worktree — administrative state outside, which R3-WR3 already refused. */
    {
      const linkedPath = join(worldsRoot, 'attempt-linked-audit');
      git(basis.repo, ['worktree', 'add', '--detach', linkedPath, basis.basisCommit]);
      const port = new CURRENT(basis.repo, worldsRoot);
      let reuse;
      try {
        await port.createWorld({ worktreeId: 'attempt-linked-audit', baseCommit: basis.basisCommit });
        reuse = { returned: true };
      } catch (error) {
        reuse = { returned: false, error: String(error?.message ?? error).slice(0, 200) };
      }
      shapes.push(Object.freeze({
        shape: 'LINKED_WORKTREE',
        absoluteGitDir: git(linkedPath, ['rev-parse', '--absolute-git-dir']),
        commonDir: git(linkedPath, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
        reuse,
        LINKED_WORKTREE_REFUSED: reuse.returned === false,
      }));
    }

    /** Shape 5: the frozen baseline against the canonical-common shape, so the defect is a measurement. */
    {
      const port = new R3WR3(basis.repo, worldsRoot);
      const created = await port.createWorld({ worktreeId: 'attempt-baseline-common', baseCommit: basis.basisCommit });
      const worldPath = created.worldPath;
      const canonicalBefore = canonicalState(basis.repo);
      writeFileSync(join(worldPath, '.git', 'commondir'), `${join(basis.repo, '.git').replace(/\\/gu, '/')}${NL}`, 'utf8');
      let reuse;
      try {
        await port.createWorld({ worktreeId: 'attempt-baseline-common', baseCommit: basis.basisCommit });
        reuse = { returned: true };
      } catch (error) {
        reuse = { returned: false, error: String(error?.message ?? error).slice(0, 200) };
      }
      const canonicalAfter = canonicalState(basis.repo);
      shapes.push(Object.freeze({
        shape: 'FROZEN_R3WR3_PORT_AGAINST_CANONICAL_COMMON_DIR',
        reuse,
        CANONICAL_COMMON_DIR_ACCEPTED_BY_BASELINE: reuse.returned === true,
        canonicalMutatedByBaseline: JSON.stringify(canonicalBefore) !== JSON.stringify(canonicalAfter),
        baselineRemovedCanonicalRemote: canonicalBefore.remotes !== '' && canonicalAfter.remotes === '',
      }));
    }

    return Object.freeze({
      kind: 'R3-WR4 Gate A3 — Git administrative and common-directory audit',
      shapes: Object.freeze(shapes),
      LEGITIMATE_BORROW_ACCEPTED: shapes.find((s) => s.shape === 'SUPPORTED_BORROWED_OBJECT_WORLD')?.LEGITIMATE_BORROW_ACCEPTED === true,
      CANONICAL_COMMON_DIR_REFUSED: shapes.find((s) => s.shape === 'COMMON_DIR_IS_CANONICAL_REPOSITORY')?.CANONICAL_COMMON_DIR_REFUSED === true,
      FOREIGN_COMMON_DIR_REFUSED: shapes.find((s) => s.shape === 'COMMON_DIR_OUTSIDE_WORLD')?.FOREIGN_COMMON_DIR_REFUSED === true,
      LINKED_WORKTREE_REFUSED: shapes.find((s) => s.shape === 'LINKED_WORKTREE')?.LINKED_WORKTREE_REFUSED === true,
      CANONICAL_COMMON_DIR_ACCEPTED_BY_BASELINE: shapes.find((s) => s.shape === 'FROZEN_R3WR3_PORT_AGAINST_CANONICAL_COMMON_DIR')?.CANONICAL_COMMON_DIR_ACCEPTED_BY_BASELINE === true,
      CANONICAL_MUTATED_BY_BASELINE: shapes.find((s) => s.shape === 'FROZEN_R3WR3_PORT_AGAINST_CANONICAL_COMMON_DIR')?.canonicalMutatedByBaseline === true,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene */ }
  }
}

/** Both falsifiers, run against both ports. */
export async function worldIdentityFalsifiers() {
  const { R3WR3, CURRENT } = await loadPorts();
  const before = await basisIdentityArm(R3WR3, 'frozen-r3wr3');
  const after = await basisIdentityArm(CURRENT, 'repaired');
  return Object.freeze({
    kind: 'R3-WR4 Gate A2 — frozen basis identity',
    frozenBaseline: before,
    repaired: after,
    /** The escaped defect, demonstrated on the code that let it escape. */
    WRONG_ANCESTOR_BASIS_ACCEPTED_BY_BASELINE: before.WRONG_ANCESTOR_BASIS_ACCEPTED === true,
    WRONG_ANCESTOR_BASIS_REFUSED_AFTER_REPAIR: after.WRONG_ANCESTOR_BASIS_ACCEPTED === false,
    REFUSAL_LEFT_WORLD_IN_PLACE: after.refusalLeftWorldInPlace === true,
    REFUSAL_LEFT_CANONICAL_IDENTICAL: after.refusalLeftCanonicalIdentical === true,
    LEGITIMATE_BASIS_STILL_ACCEPTED: after.legitBasisAccepted === true,
    CANDIDATE_PROGRESS_PRESERVED: after.HEAD_PRESERVED === true && after.CANDIDATE_PRESERVED === true && after.COMMITTED_STEP_PRESERVED === true && after.UNCOMMITTED_PRESERVED === true,
  });
}

function main() {
  const run = async () => {
    const falsifiers = await worldIdentityFalsifiers();
    process.stdout.write(`${NL}===== R3-WR4 GATE A2 — FROZEN BASIS IDENTITY =====${NL}`);
    process.stdout.write(`  frozen baseline accepted the wrong ancestor basis: ${String(falsifiers.WRONG_ANCESTOR_BASIS_ACCEPTED_BY_BASELINE)}${NL}`);
    process.stdout.write(`  repaired port refuses it:                          ${String(falsifiers.WRONG_ANCESTOR_BASIS_REFUSED_AFTER_REPAIR)}${NL}`);
    process.stdout.write(`  refusal left the world in place:                   ${String(falsifiers.REFUSAL_LEFT_WORLD_IN_PLACE)}${NL}`);
    process.stdout.write(`  refusal left the canonical repo identical:         ${String(falsifiers.REFUSAL_LEFT_CANONICAL_IDENTICAL)}${NL}`);
    process.stdout.write(`  legitimate basis still accepted:                   ${String(falsifiers.LEGITIMATE_BASIS_STILL_ACCEPTED)}${NL}`);
    process.stdout.write(`  candidate progress preserved:                      ${String(falsifiers.CANDIDATE_PROGRESS_PRESERVED)}${NL}`);
    const audit = await gitAdministrativeAudit();
    process.stdout.write(`${NL}===== R3-WR4 GATE A3 — GIT ADMINISTRATIVE AUDIT =====${NL}`);
    for (const shape of audit.shapes) {
      process.stdout.write(`${NL}  ${shape.shape}${NL}${JSON.stringify(shape, null, 2).split(NL).map((line) => `    ${line}`).join(NL)}${NL}`);
    }
    process.stdout.write(`${NL}  LEGITIMATE_BORROW_ACCEPTED:              ${String(audit.LEGITIMATE_BORROW_ACCEPTED)}${NL}`);
    process.stdout.write(`  CANONICAL_COMMON_DIR_REFUSED:            ${String(audit.CANONICAL_COMMON_DIR_REFUSED)}${NL}`);
    process.stdout.write(`  FOREIGN_COMMON_DIR_REFUSED:              ${String(audit.FOREIGN_COMMON_DIR_REFUSED)}${NL}`);
    process.stdout.write(`  LINKED_WORKTREE_REFUSED:                 ${String(audit.LINKED_WORKTREE_REFUSED)}${NL}`);
    process.stdout.write(`  CANONICAL_COMMON_DIR_ACCEPTED_BY_BASELINE: ${String(audit.CANONICAL_COMMON_DIR_ACCEPTED_BY_BASELINE)}${NL}`);
    process.stdout.write(`  CANONICAL_MUTATED_BY_BASELINE:          ${String(audit.CANONICAL_MUTATED_BY_BASELINE)}${NL}`);
  };
  run().catch((error) => {
    process.stderr.write(`gate A2/A3 failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
