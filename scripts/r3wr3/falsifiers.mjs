/**
 * R3-WR3 GATE A1/A2 — THE TWO ESCAPED DEFECTS, FROZEN AS FALSIFIERS.
 *
 * These are NEGATIVE CONTROLS: each one asserts that the R3-WR2 implementation FAILS a property it must hold,
 * and that the R3-WR3 implementation HOLDS it. The R3-WR2 port is a frozen snapshot of the compiled
 * `dist/src/effects/git_port.js` taken at the stage baseline `f2b6b12`, so the "before" side is real shipped
 * code rather than a reconstruction of it.
 *
 * A1 — PARENT GIT DISCOVERY.
 *   A directory inside the canonical repository that has no `.git` of its own is not a World, but
 *   `git rev-parse --git-dir` resolves the PARENT repository for it and exits 0. The R3-WR2 `#worldExists()`
 *   accepted that as proof a world exists, and the operations that follow — `checkout --detach`,
 *   `remote remove origin`, `config user.name/user.email` — then ran against the CANONICAL repository. The
 *   measurement below records the canonical repository's HEAD, symbolic ref, refs, remotes, index digest and
 *   config before and after, and the assertion is that the CANONICAL side is byte-identical after the R3-WR3
 *   call and demonstrably mutated by the R3-WR2 call.
 *
 * A2 — CANDIDATE HEAD REWIND.
 *   A World that holds a committed candidate X must never be moved back to its base B. The R3-WR2 `createWorld`
 *   re-ran `checkout --detach baseCommit` on every call, including a reuse, so a second call with the same world
 *   id rewound the candidate: HEAD returned to B and the candidate left the working tree. The measurement
 *   records HEAD and the file tree before and after, and asserts the R3-WR3 call preserves them.
 *
 * PLAIN JAVASCRIPT (`.mjs`). Temporary roots only. No LLM.
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
    return `ERR:${String(error?.stderr ?? error?.message ?? error).trim().slice(0, 120)}`;
  }
};

/**
 * THE CANONICAL REPOSITORY'S LOAD-BEARING STATE, as a comparable value.
 *
 * Every field the ruling names is here, and the digest is over the CONTENT of the refs and the index rather
 * than over timestamps, so a rewrite that changed nothing observable does not register as a mutation.
 */
export function canonicalState(repo) {
  const refs = (() => {
    try {
      return execFileSync('git', ['show-ref'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch {
      return '';
    }
  })();
  const indexDigest = (() => {
    try {
      const bytes = readFileSync(join(repo, '.git', 'index'));
      return `${String(bytes.length)}:${bytes.toString('base64').slice(0, 40)}`;
    } catch {
      return 'NO_INDEX';
    }
  })();
  const head = git(repo, ['rev-parse', 'HEAD']);
  const symbolic = git(repo, ['symbolic-ref', '-q', 'HEAD']);
  return Object.freeze({
    head,
    symbolicRef: symbolic.startsWith('ERR:') ? 'DETACHED' : symbolic,
    detached: symbolic.startsWith('ERR:'),
    refsDigest: refs,
    remoteCount: git(repo, ['remote']).split(NL).filter((line) => line.trim() !== '').length,
    remotes: git(repo, ['remote', '-v']),
    userName: git(repo, ['config', 'user.name']),
    userEmail: git(repo, ['config', 'user.email']),
    indexDigest,
    status: git(repo, ['status', '--porcelain']),
  });
}

/** A comparable summary of a world's work tree and HEAD. */
export function worldState(worldPath) {
  const files = (() => {
    const out = [];
    const walk = (dir, prefix = '') => {
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort((left, right) => (left.name < right.name ? -1 : 1))) {
        if (entry.name === '.git') continue;
        const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) walk(join(dir, entry.name), rel);
        /**
         * A CONTENT digest, not a size. Two revisions of the same file are routinely the same length — the
         * candidate and the basis here both write a 26-byte line — so a size-based witness would report "the
         * tree is unchanged" across a rewind that actually replaced the file's content.
         */
        else out.push(`${rel}:${createHash('sha256').update(readFileSync(join(dir, entry.name))).digest('hex').slice(0, 16)}`);
      }
    };
    try { walk(worldPath); } catch { /* a missing world has no tree */ }
    return out.join(',');
  })();
  return Object.freeze({
    head: git(worldPath, ['rev-parse', 'HEAD']),
    tree: files,
    status: git(worldPath, ['status', '--porcelain']),
    /** The candidate file's content, so a rewind that changed the tree is visible rather than inferred. */
    candidate: (() => {
      try { return readFileSync(join(worldPath, 'src', 'ledger.mjs'), 'utf8').trim(); } catch { return null; }
    })(),
  });
}

/** A basis repository with one committed file, so a world has something real to change. */
export function makeBasis(root) {
  const repo = join(root, 'canonical');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'ledger.mjs'), `export const answer = 0;${NL}`, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=b@b.b', '-c', 'user.name=b', 'commit', '-qm', 'basis']);
  return Object.freeze({ repo, basisCommit: git(repo, ['rev-parse', 'HEAD']) });
}

/** Load the frozen R3-WR2 port, and the current port under test. */
export async function loadPorts() {
  const previous = await import(pathToFileURL(join(REPO, 'scripts', 'r3wr3', 'baseline', 'git_port.r3wr2.mjs')).href);
  const current = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'git_port.js')).href);
  return Object.freeze({ R3WR2: previous.GitCliPort, R3WR3: current.GitCliPort });
}

/**
 * GATE A1 — the parent-Git adoption control.
 *
 * `Port` is the class under test. The world directory is created WITHOUT its own `.git`, inside the canonical
 * repository's own worlds root, which is exactly the shape a half-finished preparation leaves behind.
 */
export async function parentAdoptionArm(Port, label) {
  const root = mkdtempSync(join(tmpdir(), `r3wr3-a1-${label}-`));
  const basis = makeBasis(root);
  const worldPath = join(basis.repo, '.palimpsest', 'worlds', 'attempt-orphan');
  mkdirSync(worldPath, { recursive: true });
  /** A file, so the directory is plainly non-empty and a clone could not silently succeed into it. */
  writeFileSync(join(worldPath, 'README.md'), `orphan world directory${NL}`, 'utf8');

  const before = canonicalState(basis.repo);
  const port = new Port(basis.repo, join(basis.repo, '.palimpsest', 'worlds'));
  let outcome;
  try {
    const created = await port.createWorld({ worktreeId: 'attempt-orphan', baseCommit: basis.basisCommit });
    outcome = Object.freeze({ returned: true, worldPath: created.worldPath, error: null });
  } catch (error) {
    outcome = Object.freeze({ returned: false, worldPath: null, error: String(error?.message ?? error).slice(0, 240) });
  }
  const after = canonicalState(basis.repo);

  const canonicalMutated = JSON.stringify(before) !== JSON.stringify(after);
  const worldHasOwnGit = existsSync(join(worldPath, '.git'));
  const result = Object.freeze({
    label,
    port: Port.name,
    outcome,
    before,
    after,
    /** THE DEFECT: the canonical repository changed because the operations ran against IT. */
    CANONICAL_MUTATED: canonicalMutated,
    canonicalDiff: canonicalMutated
      ? Object.freeze(Object.keys(before).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map((key) => `${key}: ${JSON.stringify(before[key])} -> ${JSON.stringify(after[key])}`))
      : Object.freeze([]),
    /** A world with no `.git` of its own must never be adopted as an existing world. */
    ADOPTED_PARENT_REPOSITORY: outcome.returned === true && worldHasOwnGit === false,
    worldHasOwnGit,
  });
  try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene sweeps it */ }
  return result;
}

/**
 * GATE A2 — the candidate-rewind control.
 *
 * A world is created at B, a candidate X is committed in it, and `createWorld` is called AGAIN with the same
 * world id. The property: HEAD must still be X and the candidate tree must be unchanged.
 */
export async function candidateRewindArm(Port, label) {
  const root = mkdtempSync(join(tmpdir(), `r3wr3-a2-${label}-`));
  const basis = makeBasis(root);
  const port = new Port(basis.repo, join(basis.repo, '.palimpsest', 'worlds'));
  const created = await port.createWorld({ worktreeId: 'attempt-candidate', baseCommit: basis.basisCommit });

  /** The candidate commit X, on top of B. */
  writeFileSync(join(created.worldPath, 'src', 'ledger.mjs'), `export const answer = 42;${NL}`, 'utf8');
  writeFileSync(join(created.worldPath, 'src', 'candidate-only.mjs'), `export const extra = true;${NL}`, 'utf8');
  git(created.worldPath, ['add', '-A']);
  git(created.worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'candidate X']);
  const candidateHead = git(created.worldPath, ['rev-parse', 'HEAD']);

  const beforeWorld = worldState(created.worldPath);
  const beforeCanonical = canonicalState(basis.repo);

  let second;
  try {
    const again = await port.createWorld({ worktreeId: 'attempt-candidate', baseCommit: basis.basisCommit });
    second = Object.freeze({ returned: true, worldPath: again.worldPath, error: null });
  } catch (error) {
    second = Object.freeze({ returned: false, worldPath: null, error: String(error?.message ?? error).slice(0, 240) });
  }

  const afterWorld = worldState(created.worldPath);
  const afterCanonical = canonicalState(basis.repo);
  const candidateStillReachable = (() => {
    try {
      execFileSync('git', ['cat-file', '-e', `${candidateHead}^{commit}`], { cwd: created.worldPath, stdio: ['ignore', 'pipe', 'pipe'] });
      return true;
    } catch {
      return false;
    }
  })();

  const result = Object.freeze({
    label,
    port: Port.name,
    basisCommit: basis.basisCommit,
    candidateHead,
    second,
    beforeWorld,
    afterWorld,
    beforeCanonical,
    afterCanonical,
    /** THE DEFECT: HEAD moved off the candidate back to the basis. */
    CANDIDATE_HEAD_REWOUND: afterWorld.head === basis.basisCommit && candidateHead !== basis.basisCommit,
    HEAD_PRESERVED: afterWorld.head === candidateHead,
    candidateStillReachable,
    /** The candidate's file must still be in the tree, not deleted by a rewind. */
    CANDIDATE_TREE_PRESERVED: beforeWorld.tree === afterWorld.tree,
    treeDiff: beforeWorld.tree === afterWorld.tree ? null : `before=${beforeWorld.tree} after=${afterWorld.tree}`,
    CANONICAL_UNCHANGED: JSON.stringify(beforeCanonical) === JSON.stringify(afterCanonical),
  });
  try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene sweeps it */ }
  return result;
}

/**
 * THE FROZEN FALSIFIER MATRIX.
 *
 * Both arms, both ports. The assertion a caller makes is that the R3-WR2 port EXHIBITS the defect and the
 * R3-WR3 port does not — which is what makes this a mutation witness rather than a description.
 */
export async function worldIdentityFalsifiers() {
  const ports = await loadPorts();
  const a1Old = await parentAdoptionArm(ports.R3WR2, 'old');
  const a1New = await parentAdoptionArm(ports.R3WR3, 'new');
  const a2Old = await candidateRewindArm(ports.R3WR2, 'old');
  const a2New = await candidateRewindArm(ports.R3WR3, 'new');
  return Object.freeze({
    kind: 'R3-WR3 Gate A1/A2 — world identity falsifiers',
    parentAdoption: Object.freeze({ old: a1Old, new: a1New }),
    candidateRewind: Object.freeze({ old: a2Old, new: a2New }),
    /** The verdicts, derived from the measurements. */
    PARENT_REPOSITORY_ADOPTION_DETECTED: a1Old.ADOPTED_PARENT_REPOSITORY === true && a1New.ADOPTED_PARENT_REPOSITORY === false,
    PARENT_ADOPTION_MUTATES_CANONICAL: a1Old.CANONICAL_MUTATED === true && a1New.CANONICAL_MUTATED === false,
    CANDIDATE_HEAD_REWIND_DETECTED: a2Old.CANDIDATE_HEAD_REWOUND === true && a2New.CANDIDATE_HEAD_REWOUND === false,
    CANDIDATE_PRESERVED_AFTER_REPAIR: a2New.HEAD_PRESERVED === true && a2New.CANDIDATE_TREE_PRESERVED === true && a2New.candidateStillReachable === true,
  });
}

function main() {
  worldIdentityFalsifiers().then((result) => {
    process.stdout.write(`${NL}===== R3-WR3 GATE A1 — PARENT GIT DISCOVERY =====${NL}`);
    for (const arm of [result.parentAdoption.old, result.parentAdoption.new]) {
      process.stdout.write(`${NL}${arm.port} (${arm.label})${NL}`);
      process.stdout.write(`  outcome: ${arm.outcome.returned ? 'RETURNED' : 'REFUSED'}${arm.outcome.error === null ? '' : ` — ${arm.outcome.error}`}${NL}`);
      process.stdout.write(`  world has own .git: ${String(arm.worldHasOwnGit)}${NL}`);
      process.stdout.write(`  ADOPTED_PARENT_REPOSITORY: ${String(arm.ADOPTED_PARENT_REPOSITORY)}${NL}`);
      process.stdout.write(`  CANONICAL_MUTATED: ${String(arm.CANONICAL_MUTATED)}${NL}`);
      for (const line of arm.canonicalDiff) process.stdout.write(`    ${line}${NL}`);
    }
    process.stdout.write(`${NL}===== R3-WR3 GATE A2 — CANDIDATE HEAD REWIND =====${NL}`);
    for (const arm of [result.candidateRewind.old, result.candidateRewind.new]) {
      process.stdout.write(`${NL}${arm.port} (${arm.label})${NL}`);
      process.stdout.write(`  candidate X: ${String(arm.candidateHead).slice(0, 12)}  basis B: ${String(arm.basisCommit).slice(0, 12)}${NL}`);
      process.stdout.write(`  second call: ${arm.second.returned ? 'RETURNED' : 'REFUSED'}${arm.second.error === null ? '' : ` — ${arm.second.error}`}${NL}`);
      process.stdout.write(`  HEAD before: ${String(arm.beforeWorld.head).slice(0, 12)}  after: ${String(arm.afterWorld.head).slice(0, 12)}${NL}`);
      process.stdout.write(`  CANDIDATE_HEAD_REWOUND: ${String(arm.CANDIDATE_HEAD_REWOUND)}${NL}`);
      process.stdout.write(`  CANDIDATE_TREE_PRESERVED: ${String(arm.CANDIDATE_TREE_PRESERVED)}${arm.treeDiff === null ? '' : ` (${arm.treeDiff})`}${NL}`);
      process.stdout.write(`  candidate reachable: ${String(arm.candidateStillReachable)}${NL}`);
      process.stdout.write(`  CANONICAL_UNCHANGED: ${String(arm.CANONICAL_UNCHANGED)}${NL}`);
    }
    process.stdout.write(`${NL}PARENT_REPOSITORY_ADOPTION_DETECTED: ${String(result.PARENT_REPOSITORY_ADOPTION_DETECTED)}${NL}`);
    process.stdout.write(`PARENT_ADOPTION_MUTATES_CANONICAL:   ${String(result.PARENT_ADOPTION_MUTATES_CANONICAL)}${NL}`);
    process.stdout.write(`CANDIDATE_HEAD_REWIND_DETECTED:      ${String(result.CANDIDATE_HEAD_REWIND_DETECTED)}${NL}`);
    process.stdout.write(`CANDIDATE_PRESERVED_AFTER_REPAIR:    ${String(result.CANDIDATE_PRESERVED_AFTER_REPAIR)}${NL}`);
  }).catch((error) => {
    process.stderr.write(`falsifiers failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
