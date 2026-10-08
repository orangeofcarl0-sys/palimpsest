/**
 * R3-WR4 GATE A — MUTATION RESISTANCE, SIX NAMED WITNESSES.
 *
 * Each witness is a scenario that the FROZEN R3-WR3 baseline must FAIL (so the witness can actually fail) and the
 * repaired port must PASS. A witness that compared only against already-fixed code would be a witness that could
 * never fail, which the ruling forbids.
 *
 *   WRONG_ANCESTOR_BASIS_ACCEPTANCE   a request for an ancestor that is not the world's basis
 *   CROSS_OPERATION_WORLD_ADOPTION    a foreign attempt id reaching for a world it does not own
 *   FOREIGN_COMMON_GIT_DIRECTORY      a common directory outside the world
 *   CANDIDATE_HEAD_REWIND             a committed candidate moved back to a base
 *   CANONICAL_REPOSITORY_MUTATION     any canonical HEAD/ref/config change caused through a world
 *   FALSE_SINGLE_FLIGHT_EVIDENCE      the withdrawn tautology, kept as a witness that it cannot fail
 *
 * The R3-WR3 regressions are re-run alongside so this stage cannot have weakened them: parent-Git adoption, path
 * traversal, the partial world and the failed remote removal.
 *
 * PLAIN JAVASCRIPT (`.mjs`). Temporary roots only. No LLM, no network.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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

/** The canonical repository's whole load-bearing surface, so "not mutated" is measurable. */
function canonicalDigest(repo) {
  const configPath = join(repo, '.git', 'config');
  return sha256([
    git(repo, ['rev-parse', 'HEAD']),
    git(repo, ['symbolic-ref', '-q', 'HEAD']),
    git(repo, ['show-ref']),
    git(repo, ['remote', '-v']),
    git(repo, ['status', '--porcelain']),
    existsSync(configPath) ? readFileSync(configPath, 'utf8') : '',
  ].join('\u0000'));
}

/** A world's whole surface: HEAD, index, work tree and Git config. */
function worldDigest(worldPath) {
  const files = [];
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name === '.git') continue;
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else files.push(`${rel}:${sha256(readFileSync(join(dir, entry.name)))}`);
    }
  };
  try { walk(worldPath); } catch { return 'ABSENT'; }
  return sha256([git(worldPath, ['rev-parse', 'HEAD']), git(worldPath, ['status', '--porcelain']), files.join(',')].join('\u0000'));
}

function makeBasis(root) {
  const repo = join(root, 'canonical');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'ledger.mjs'), `export const answer = 0;${NL}`, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=b@b.b', '-c', 'user.name=b', 'commit', '-qm', 'basis']);
  return Object.freeze({ repo, basisCommit: git(repo, ['rev-parse', 'HEAD']) });
}

async function loadPorts() {
  const baseline = await import(pathToFileURL(join(REPO, 'scripts', 'r3wr4', 'baseline', 'git_port.r3wr3.mjs')).href);
  const current = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'git_port.js')).href);
  return { BASELINE: baseline.GitCliPort, CURRENT: current.GitCliPort };
}

/**
 * The R3-WR2 port, for the ONE witness whose defect predates R3-WR3.
 *
 * The candidate-HEAD-rewind defect was FIXED by R3-WR3's conditional checkout, so a witness that compared
 * against the R3-WR3 baseline could never fail. Comparing it against R3-WR2 is what makes it a witness at all,
 * and saying so here rather than hiding it is the same discipline R3-WR3 used for its readiness witness.
 */
async function loadR3WR2Port() {
  const module = await import(pathToFileURL(join(REPO, 'scripts', 'r3wr3', 'baseline', 'git_port.r3wr2.mjs')).href);
  return module.GitCliPort;
}

/**
 * One witness: `scenario(Port)` returns `{ violated, detail }`, where `violated === true` means the port LET THE
 * DEFECT THROUGH. A witness is satisfied only when the baseline violated it and the repaired port did not.
 *
 * `baselinePort` overrides the "before" implementation for the one witness whose defect lives further back.
 */
async function witness({ id, description, scenario, Baseline, Current, baselinePort }) {
  const before = baselinePort ?? Baseline;
  const baseline = await scenario(before);
  const current = await scenario(Current);
  return Object.freeze({
    id,
    description,
    baselinePortLabel: baselinePort === undefined ? 'r3-wr3 (stage baseline 8c39c21)' : 'r3-wr2 (f2b6b12)',
    baselineViolated: baseline.violated === true,
    currentViolated: current.violated === true,
    satisfied: baseline.violated === true && current.violated !== true,
    detail: Object.freeze({ baseline, current }),
  });
}

export async function mutationResistance() {
  const { BASELINE, CURRENT } = await loadPorts();
  const root = mkdtempSync(join(tmpdir(), 'r3wr4-mut-'));
  const witnesses = [];

  /* ---------------- 1. WRONG ANCESTOR BASIS ---------------- */
  witnesses.push(await witness({
    id: 'WRONG_ANCESTOR_BASIS_ACCEPTANCE',
    description: 'createWorld(W, B1) where W was created at B0 and B1 is only an ancestor of the candidate X',
    Baseline: BASELINE,
    Current: CURRENT,
    scenario: async (Port) => {
      const local = mkdtempSync(join(root, 'w1-'));
      const basis = makeBasis(local);
      const port = new Port(basis.repo, join(basis.repo, '.palimpsest', 'worlds'));
      const created = await port.createWorld({ worktreeId: 'attempt-w1', baseCommit: basis.basisCommit });
      writeFileSync(join(created.worldPath, 'src', 'step.mjs'), `export const s = 1;${NL}`, 'utf8');
      git(created.worldPath, ['add', '-A']);
      git(created.worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'B1']);
      const innerB1 = git(created.worldPath, ['rev-parse', 'HEAD']);
      writeFileSync(join(created.worldPath, 'src', 'cand.mjs'), `export const c = 1;${NL}`, 'utf8');
      git(created.worldPath, ['add', '-A']);
      git(created.worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'X']);
      let accepted = false;
      let error = null;
      try {
        await port.createWorld({ worktreeId: 'attempt-w1', baseCommit: innerB1 });
        accepted = true;
      } catch (caught) {
        error = String(caught?.message ?? caught).slice(0, 120);
      }
      return { violated: accepted, acceptedWrongAncestorBasis: accepted, error };
    },
  }));

  /* ---------------- 2. CROSS-OPERATION ADOPTION ---------------- */
  witnesses.push(await witness({
    id: 'CROSS_OPERATION_WORLD_ADOPTION',
    description: 'a world directory whose recorded owner is a DIFFERENT attempt is silently adopted for this attempt',
    Baseline: BASELINE,
    Current: CURRENT,
    scenario: async (Port) => {
      const local = mkdtempSync(join(root, 'w2-'));
      const basis = makeBasis(local);
      const port = new Port(basis.repo, join(basis.repo, '.palimpsest', 'worlds'));
      /**
       * Attempt A's world is created, given committed work, and then its RECORD is changed to name attempt B.
       * This is the shape a copied, moved or mis-attributed world directory has: the path says A, the world's own
       * record says B. A request for A must not silently adopt it — A would otherwise be handed B's work and its
       * own progress would be attributed to the wrong attempt.
       */
      const created = await port.createWorld({ worktreeId: 'attempt-A', baseCommit: basis.basisCommit });
      writeFileSync(join(created.worldPath, 'src', 'belongs-to-B.mjs'), `export const b = 1;${NL}`, 'utf8');
      git(created.worldPath, ['add', '-A']);
      git(created.worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'work belonging to another attempt']);
      const headBefore = git(created.worldPath, ['rev-parse', 'HEAD']);
      const bindingPath = join(created.worldPath, '.git', 'palimpsest-world-binding.json');
      /** The baseline writes no record at all, so this is written directly: the shape under test is the FILE. */
      writeFileSync(bindingPath, `${JSON.stringify({ schemaVersion: 1, attemptId: 'attempt-B', basisCommit: basis.basisCommit, repository: basis.repo })}${NL}`, 'utf8');
      let adopted = false;
      let error = null;
      try {
        const again = await port.createWorld({ worktreeId: 'attempt-A', baseCommit: basis.basisCommit });
        adopted = again.worldPath === created.worldPath;
      } catch (caught) {
        error = String(caught?.message ?? caught).slice(0, 160);
      }
      const headAfter = git(created.worldPath, ['rev-parse', 'HEAD']);
      return {
        violated: adopted,
        adoptedForeignWorld: adopted,
        error,
        headUnmoved: headAfter === headBefore,
        foreignWorkStillPresent: existsSync(join(created.worldPath, 'src', 'belongs-to-B.mjs')),
      };
    },
  }));

  /* ---------------- 3. FOREIGN COMMON GIT DIRECTORY ---------------- */
  witnesses.push(await witness({
    id: 'FOREIGN_COMMON_GIT_DIRECTORY',
    description: 'a world whose Git COMMON directory names the CANONICAL repository, so its config and refs are the project\'s',
    Baseline: BASELINE,
    Current: CURRENT,
    scenario: async (Port) => {
      const local = mkdtempSync(join(root, 'w3-'));
      const basis = makeBasis(local);
      git(basis.repo, ['remote', 'add', 'origin', 'https://example.invalid/canonical.git']);
      const port = new Port(basis.repo, join(basis.repo, '.palimpsest', 'worlds'));
      const created = await port.createWorld({ worktreeId: 'attempt-w3', baseCommit: basis.basisCommit });
      /**
       * The canonical repository's `.git` IS a FUNCTIONAL common directory: HEAD, refs and config all resolve, so
       * the world passes the administrative-directory test and the baseline proceeds. That is what makes this a
       * witness rather than a broken-world case — the port is not stumbling over an unresolvable HEAD, it is
       * running its mutating commands against the canonical project.
       */
      const canonicalBefore = canonicalDigest(basis.repo);
      writeFileSync(join(created.worldPath, '.git', 'commondir'), `${join(basis.repo, '.git').replace(/\\/gu, '/')}${NL}`, 'utf8');
      let accepted = false;
      let error = null;
      try {
        await port.createWorld({ worktreeId: 'attempt-w3', baseCommit: basis.basisCommit });
        accepted = true;
      } catch (caught) {
        error = String(caught?.message ?? caught).slice(0, 120);
      }
      const canonicalAfter = canonicalDigest(basis.repo);
      return {
        violated: accepted,
        acceptedCanonicalCommonDir: accepted,
        canonicalMutated: canonicalBefore !== canonicalAfter,
        canonicalRemoteSurvived: git(basis.repo, ['remote', '-v']) !== '',
        error,
      };
    },
  }));

  /* ---------------- 4. CANDIDATE HEAD REWIND ---------------- */
  witnesses.push(await witness({
    id: 'CANDIDATE_HEAD_REWIND',
    description: 'a reuse of a world holding a committed candidate moves HEAD back to the basis',
    Baseline: BASELINE,
    Current: CURRENT,
    /** R3-WR3 already fixed this one, so the "before" side must be the port that still had the defect. */
    baselinePort: await loadR3WR2Port(),
    scenario: async (Port) => {
      const local = mkdtempSync(join(root, 'w4-'));
      const basis = makeBasis(local);
      const port = new Port(basis.repo, join(basis.repo, '.palimpsest', 'worlds'));
      const created = await port.createWorld({ worktreeId: 'attempt-w4', baseCommit: basis.basisCommit });
      writeFileSync(join(created.worldPath, 'src', 'candidate.mjs'), `export const candidate = 1;${NL}`, 'utf8');
      git(created.worldPath, ['add', '-A']);
      git(created.worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'candidate']);
      const candidateHead = git(created.worldPath, ['rev-parse', 'HEAD']);
      try {
        await port.createWorld({ worktreeId: 'attempt-w4', baseCommit: basis.basisCommit });
      } catch { /* a refusal is the correct outcome and is not the defect */ }
      const headAfter = git(created.worldPath, ['rev-parse', 'HEAD']);
      const candidatePresent = existsSync(join(created.worldPath, 'src', 'candidate.mjs'));
      return { violated: headAfter !== candidateHead || !candidatePresent, candidateHead, headAfter, candidatePresent };
    },
  }));

  /* ---------------- 5. CANONICAL REPOSITORY MUTATION ---------------- */
  witnesses.push(await witness({
    id: 'CANONICAL_REPOSITORY_MUTATION',
    description: 'any reuse that changes the canonical repository HEAD, refs, remotes, config or status',
    Baseline: BASELINE,
    Current: CURRENT,
    scenario: async (Port) => {
      const local = mkdtempSync(join(root, 'w5-'));
      const basis = makeBasis(local);
      git(basis.repo, ['remote', 'add', 'origin', 'https://example.invalid/canonical.git']);
      const port = new Port(basis.repo, join(basis.repo, '.palimpsest', 'worlds'));
      const created = await port.createWorld({ worktreeId: 'attempt-w5', baseCommit: basis.basisCommit });
      /** The canonical-common shape is the one measured to mutate the canonical repository. */
      writeFileSync(join(created.worldPath, '.git', 'commondir'), `${join(basis.repo, '.git').replace(/\\/gu, '/')}${NL}`, 'utf8');
      const before = canonicalDigest(basis.repo);
      try {
        await port.createWorld({ worktreeId: 'attempt-w5', baseCommit: basis.basisCommit });
      } catch { /* refusal is correct */ }
      const after = canonicalDigest(basis.repo);
      return { violated: before !== after, canonicalMutated: before !== after, remotesAfter: git(basis.repo, ['remote', '-v']) };
    },
  }));

  /* ---------------- 6. FALSE SINGLE-FLIGHT EVIDENCE ---------------- */
  witnesses.push(await witness({
    id: 'FALSE_SINGLE_FLIGHT_EVIDENCE',
    description: 'the withdrawn `fulfilled + rejected === attempted` criterion, shown unable to fail',
    Baseline: BASELINE,
    Current: CURRENT,
    scenario: async () => {
      /**
       * The witness is that the criterion CANNOT distinguish outcomes: it is true for a fully concurrent run and
       * for a serialized one alike. A "violation" would require the criterion to be false for some real outcome,
       * which it never is — so `violated` is deliberately false for BOTH ports, and the witness is reported as
       * NOT_APPLICABLE rather than counted as satisfied. It is retained because deleting it would erase the
       * evidence of the defect.
       */
      const outcomes = [
        { label: 'all fulfilled', fulfilled: 6, rejected: 0, attempted: 6 },
        { label: 'all rejected', fulfilled: 0, rejected: 6, attempted: 6 },
        { label: 'mixed', fulfilled: 3, rejected: 3, attempted: 6 },
      ];
      const alwaysTrue = outcomes.every((outcome) => outcome.fulfilled + outcome.rejected === outcome.attempted);
      return { violated: false, criterionAlwaysTrue: alwaysTrue, outcomes, classification: 'WITHDRAWN_CRITERION_NOT_APPLICABLE' };
    },
  }));

  /* ---------------- R3-WR3 REGRESSIONS, RE-RUN ---------------- */
  const regressions = [];

  /** Parent-Git adoption: a directory with no repository of its own. */
  regressions.push(await (async () => {
    const local = mkdtempSync(join(root, 'r1-'));
    const basis = makeBasis(local);
    const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
    const orphan = join(worldsRoot, 'attempt-orphan-reg');
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, 'README.md'), `orphan${NL}`, 'utf8');
    const port = new CURRENT(basis.repo, worldsRoot);
    const before = canonicalDigest(basis.repo);
    let refused = false;
    try { await port.createWorld({ worktreeId: 'attempt-orphan-reg', baseCommit: basis.basisCommit }); } catch { refused = true; }
    return { id: 'PARENT_GIT_ADOPTION', refused, canonicalUnchanged: before === canonicalDigest(basis.repo) };
  })());

  /** Path traversal: an escaping world id. */
  regressions.push(await (async () => {
    const local = mkdtempSync(join(root, 'r2-'));
    const basis = makeBasis(local);
    const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
    const port = new CURRENT(basis.repo, worldsRoot);
    const before = canonicalDigest(basis.repo);
    const forms = ['..', '../escape', 'a/b', 'C:/abs', '\\\\unc\\share'];
    const outcomes = [];
    for (const form of forms) {
      let refused = false;
      try { await port.createWorld({ worktreeId: form, baseCommit: basis.basisCommit }); } catch { refused = true; }
      outcomes.push({ form, refused });
    }
    return { id: 'PATH_TRAVERSAL', everyFormRefused: outcomes.every((o) => o.refused), outcomes, canonicalUnchanged: before === canonicalDigest(basis.repo) };
  })());

  /** Partial world: an occupied directory with no repository. */
  regressions.push(await (async () => {
    const local = mkdtempSync(join(root, 'r3-'));
    const basis = makeBasis(local);
    const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
    const partial = join(worldsRoot, 'attempt-partial-reg');
    mkdirSync(partial, { recursive: true });
    writeFileSync(join(partial, 'work-in-progress.txt'), 'partial', 'utf8');
    const port = new CURRENT(basis.repo, worldsRoot);
    let refused = false;
    try { await port.createWorld({ worktreeId: 'attempt-partial-reg', baseCommit: basis.basisCommit }); } catch { refused = true; }
    return { id: 'PARTIAL_WORLD', refused, contentPreserved: existsSync(join(partial, 'work-in-progress.txt')) };
  })());

  /** Failed remote removal. */
  regressions.push(await (async () => {
    const local = mkdtempSync(join(root, 'r4-'));
    const basis = makeBasis(local);
    const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
    const port = new CURRENT(basis.repo, worldsRoot);
    const created = await port.createWorld({ worktreeId: 'attempt-stuck-reg', baseCommit: basis.basisCommit });
    git(created.worldPath, ['remote', 'add', 'stuck', basis.repo]);
    const lock = join(created.worldPath, '.git', 'config.lock');
    mkdirSync(lock, { recursive: true });
    let refused = false;
    try { await port.createWorld({ worktreeId: 'attempt-stuck-reg', baseCommit: basis.basisCommit }); } catch { refused = true; }
    rmSync(lock, { recursive: true, force: true });
    return { id: 'FAILED_REMOTE_REMOVAL', refused, remoteStillPresent: git(created.worldPath, ['remote']) === 'stuck' };
  })());

  /** Path confinement including a live junction. */
  regressions.push(await (async () => {
    const local = mkdtempSync(join(root, 'r5-'));
    const basis = makeBasis(local);
    const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
    mkdirSync(worldsRoot, { recursive: true });
    const outside = join(local, 'outside-target');
    mkdirSync(outside, { recursive: true });
    const junction = join(worldsRoot, 'attempt-junction');
    let junctionMade = false;
    try { symlinkSync(outside, junction, 'junction'); junctionMade = true; } catch { /* needs privilege */ }
    if (!junctionMade) return { id: 'PATH_CONFINEMENT_JUNCTION', skipped: true, reason: 'junction could not be created' };
    const port = new CURRENT(basis.repo, worldsRoot);
    let refused = false;
    try { await port.createWorld({ worktreeId: 'attempt-junction', baseCommit: basis.basisCommit }); } catch { refused = true; }
    return { id: 'PATH_CONFINEMENT_JUNCTION', refused, junctionMade };
  })());

  try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene */ }

  const counted = witnesses.filter((w) => w.id !== 'FALSE_SINGLE_FLIGHT_EVIDENCE');
  return Object.freeze({
    kind: 'R3-WR4 Gate A — mutation resistance',
    witnesses: Object.freeze(witnesses),
    regressions: Object.freeze(regressions),
    witnessesSatisfied: counted.filter((w) => w.satisfied).length,
    witnessesTotal: counted.length,
    withdrawnCriterionWitness: witnesses.find((w) => w.id === 'FALSE_SINGLE_FLIGHT_EVIDENCE'),
    priorRegressionsPreserved: regressions.every((r) => r.skipped === true || r.refused === true || r.everyFormRefused === true),
    allSatisfied: counted.every((w) => w.satisfied) && regressions.every((r) => r.skipped === true || r.refused === true || r.everyFormRefused === true),
  });
}

function main() {
  mutationResistance().then((result) => {
    process.stdout.write(`${NL}===== R3-WR4 GATE A — MUTATION RESISTANCE =====${NL}`);
    for (const item of result.witnesses) {
      process.stdout.write(`${NL}  ${item.id}${NL}`);
      process.stdout.write(`    baseline violated: ${String(item.baselineViolated)}   repaired violated: ${String(item.currentViolated)}   satisfied: ${String(item.satisfied)}${NL}`);
    }
    process.stdout.write(`${NL}  witnesses: ${String(result.witnessesSatisfied)}/${String(result.witnessesTotal)} satisfied${NL}`);
    process.stdout.write(`${NL}===== PRIOR R3-WR3 REGRESSIONS =====${NL}`);
    for (const item of result.regressions) {
      process.stdout.write(`  ${item.id}: ${JSON.stringify(item)}${NL}`);
    }
    process.stdout.write(`${NL}  prior regressions preserved: ${String(result.priorRegressionsPreserved)}${NL}`);
    process.stdout.write(`  all satisfied: ${String(result.allSatisfied)}${NL}`);
  }).catch((error) => {
    process.stderr.write(`mutation resistance failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
