/**
 * R3-WR3 GATE 8 — MUTATION RESISTANCE.
 *
 * Each witness is a pair: a MUTANT that must FAIL against the pre-repair baseline and PASS after the repair, and
 * a healthy POSITIVE CONTROL that must pass in both. A witness that asserted a research constant, or an
 * explanatory comment, would prove nothing about the runtime — so every assertion here runs the real compiled
 * `GitCliPort` against a real repository and compares OBSERVED state.
 *
 * The baseline is the frozen R3-WR2 snapshot, so "fails before the repair" is a measurement against shipped code
 * rather than against a description of it.
 *
 * THE SEVEN WITNESSES:
 *
 *   PARENT_REPOSITORY_ADOPTION_DETECTED    a directory with no own `.git` must not be adopted as a world, and
 *                                          the canonical repository must be byte-identical afterwards
 *   CANDIDATE_HEAD_REWIND_DETECTED         a committed candidate must not be moved back to its basis
 *   WORLD_PATH_ESCAPE_DETECTED             a world id must not name anything outside the world root
 *   WRONG_BASIS_REUSE_DETECTED             a world cut from another basis must be refused, not rewound
 *   PARTIAL_WORLD_MISCLASSIFICATION_DETECTED  a half-made world must not be treated as a usable one
 *   UNKNOWN_READINESS_FAILURE_DETECTED     a failure outside the known set must not become READY
 *   EFFECT_REPLAY_CONFLICT_DETECTED        a second physical world must not appear for one identity
 *
 * PLAIN JAVASCRIPT (`.mjs`). Temporary roots only. No LLM.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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

async function loadPorts() {
  const baseline = await import(pathToFileURL(join(REPO, 'scripts', 'r3wr3', 'baseline', 'git_port.r3wr2.mjs')).href);
  const current = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'git_port.js')).href);
  return Object.freeze({ BASELINE: baseline.GitCliPort, CURRENT: current.GitCliPort });
}

/**
 * THE R3-WR BASELINE, for the one witness whose defect was repaired by R3-WR2 rather than by this stage.
 *
 * The readiness criterion was fixed in R3-WR2, so the R3-WR2 snapshot already REFUSES a corrupt index. To show
 * that this witness discriminates, the comparison has to be against the implementation that actually had the
 * defect — the R3-WR text-matching denylist, compiled from `src/effects/git_port.ts` at commit `792d109`. Using
 * the R3-WR2 snapshot here would have produced a witness that could never fail, which is the definition of a
 * non-load-bearing test.
 */
async function loadR3WRPort() {
  const module = await import(pathToFileURL(join(REPO, 'scripts', 'r3wr3', 'baseline', 'git_port.r3wr.mjs')).href);
  return module.GitCliPort;
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

/** A digest of everything the ruling calls load-bearing on the canonical side. */
function canonicalDigest(repo) {
  const parts = [
    git(repo, ['rev-parse', 'HEAD']),
    git(repo, ['symbolic-ref', '-q', 'HEAD']),
    (() => { try { return execFileSync('git', ['show-ref'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return ''; } })(),
    git(repo, ['remote', '-v']),
    git(repo, ['config', 'user.name']),
    git(repo, ['config', 'user.email']),
    git(repo, ['status', '--porcelain']),
    (() => { try { return createHash('sha256').update(readFileSync(join(repo, '.git', 'index'))).digest('hex'); } catch { return 'NO_INDEX'; } })(),
  ];
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

/** A digest of a world's HEAD plus its whole work tree content. */
function worldDigest(worldPath) {
  const files = [];
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((left, right) => (left.name < right.name ? -1 : 1))) {
      if (entry.name === '.git') continue;
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else files.push(`${rel}:${createHash('sha256').update(readFileSync(join(dir, entry.name))).digest('hex')}`);
    }
  };
  try { walk(worldPath); } catch { return 'ABSENT'; }
  return createHash('sha256').update(`${git(worldPath, ['rev-parse', 'HEAD'])}\u0000${files.join(',')}`).digest('hex');
}

/**
 * GATE 8 — ONE WITNESS.
 *
 * `mutant` sets up the state and returns the call to make; the harness runs it against BOTH ports and records
 * whether each one VIOLATED the invariant. A witness is satisfied when the baseline violates it and the current
 * port does not.
 */
async function witness(input) {
  const { id, description, invariant, arrange, baselinePort } = input;
  const results = {};
  /**
   * A witness may name the BASELINE it compares against, because two different repairs are under test: most
   * witnesses measure this stage's repair against the R3-WR2 snapshot, while the readiness witness measures
   * R3-WR2's own repair against the R3-WR implementation that had the defect. Naming it explicitly keeps each
   * witness honest about what it is comparing.
   */
  const ports = baselinePort === undefined
    ? await loadPorts()
    : Object.freeze({ BASELINE: await baselinePort(), CURRENT: (await loadPorts()).CURRENT });
  for (const [label, Port] of Object.entries(ports)) {
    const root = mkdtempSync(join(tmpdir(), `r3wr3-mut-${id}-${label}-`));
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
    const port = new Port(basis.repo, worldsRoot);
    const setup = await arrange({ root, basis, worldsRoot, port });

    const beforeCanonical = canonicalDigest(basis.repo);
    const beforeWorld = setup?.worldPath === undefined ? null : worldDigest(setup.worldPath);

    /** `calls` lets a witness that needs MORE than one invocation express that, e.g. replay. */
    const calls = setup.calls ?? 1;
    const outcomes = [];
    for (let index = 0; index < calls; index += 1) {
      try {
        const created = await port.createWorld({ worktreeId: setup.worldId, baseCommit: setup.baseCommit ?? basis.basisCommit });
        outcomes.push({ returned: true, worldPath: created.worldPath, error: null });
      } catch (error) {
        outcomes.push({ returned: false, worldPath: null, error: String(error?.message ?? error).slice(0, 160) });
      }
    }
    const outcome = outcomes[outcomes.length - 1];

    const afterCanonical = canonicalDigest(basis.repo);
    const afterWorld = setup?.worldPath === undefined ? null : worldDigest(setup.worldPath);
    const observed = Object.freeze({
      outcome,
      outcomes: Object.freeze(outcomes),
      canonicalUnchanged: beforeCanonical === afterCanonical,
      worldUnchanged: beforeWorld === null ? null : beforeWorld === afterWorld,
      /** Extra observations a specific witness may need. */
      extra: setup?.observe === undefined ? null : setup.observe({ root, basis, worldsRoot, outcomes, outcome, worldPath: setup.worldPath }),
    });
    results[label] = Object.freeze({ ...observed, VIOLATED: invariant(observed, setup) });
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene sweeps it */ }
  }

  return Object.freeze({
    id,
    description,
    baselineViolated: results.BASELINE.VIOLATED,
    currentViolated: results.CURRENT.VIOLATED,
    /** The witness: the baseline MUST violate it and the repaired port must not. */
    satisfied: results.BASELINE.VIOLATED === true && results.CURRENT.VIOLATED === false,
    detail: Object.freeze({ baseline: results.BASELINE, current: results.CURRENT }),
  });
}

/**
 * GATE 8 — THE SEVEN WITNESSES, plus a healthy control for each.
 */
export async function mutationResistance() {
  const witnesses = [];

  witnesses.push(await witness({
    id: 'PARENT_REPOSITORY_ADOPTION_DETECTED',
    description: 'a directory with no Git repository of its own must not be adopted as a world',
    /** The invariant: the call must not mutate the canonical repository. */
    invariant: (observed) => observed.canonicalUnchanged === false,
    arrange: async ({ worldsRoot }) => {
      const worldId = 'attempt-orphan';
      mkdirSync(join(worldsRoot, worldId), { recursive: true });
      writeFileSync(join(worldsRoot, worldId, 'README.md'), 'orphan\n', 'utf8');
      return { worldId };
    },
  }));

  witnesses.push(await witness({
    id: 'CANDIDATE_HEAD_REWIND_DETECTED',
    description: 'a world holding a committed candidate must not be moved back to its basis',
    invariant: (observed, setup) => observed.worldUnchanged === false,
    arrange: async ({ basis, worldsRoot, port }) => {
      const worldId = 'attempt-candidate';
      await port.createWorld({ worktreeId: worldId, baseCommit: basis.basisCommit });
      const worldPath = join(worldsRoot, worldId);
      writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 42;${NL}`, 'utf8');
      writeFileSync(join(worldPath, 'src', 'candidate-only.mjs'), `export const extra = 1;${NL}`, 'utf8');
      git(worldPath, ['add', '-A']);
      git(worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'candidate']);
      return { worldId, worldPath };
    },
  }));

  witnesses.push(await witness({
    id: 'WORLD_PATH_ESCAPE_DETECTED',
    description: 'a world id must not name a path outside the world root',
    /**
     * THE INVARIANT: the returned world path must be a DIRECT CHILD of the declared world root.
     *
     * The baseline returns `.../worlds/../escaped-target`, which is not textually under the root and, once
     * resolved, names a directory the root does not contain. Testing the RESOLVED path is what makes this
     * witness meaningful: a textual prefix test would be satisfied by the `worlds/../` spelling, and the
     * baseline would look compliant while having written outside the root.
     */
    invariant: (observed, setup) => {
      if (observed.outcome.returned !== true) return false;
      const resolved = resolve(observed.outcome.worldPath);
      const root = resolve(setup.worldsRoot);
      return dirname(resolved) !== root;
    },
    arrange: async ({ root, worldsRoot }) => ({
      worldId: '../escaped-target',
      worldsRoot,
      /** The escape target, so the row also records whether anything was created outside the root. */
      observe: () => ({ escapedTargetCreated: existsSync(join(root, 'escaped-target')) }),
    }),
  }));

  witnesses.push(await witness({
    id: 'WRONG_BASIS_REUSE_DETECTED',
    description: 'a world cut from one basis must be refused when asked for a different, unrelated basis',
    /**
     * THE INVARIANT: the world must be left exactly as it was. The scenario is a world holding a committed
     * candidate X on top of basis B, asked for a SIBLING commit S. S is reachable in the shared object store, so
     * the baseline's unconditional `checkout --detach S` SUCCEEDS and moves the world off X — the same class of
     * data loss as a rewind, reached by a different route.
     */
    invariant: (observed) => observed.worldUnchanged === false,
    arrange: async ({ root, basis, worldsRoot, port }) => {
      const worldId = 'attempt-wrong-basis';
      await port.createWorld({ worktreeId: worldId, baseCommit: basis.basisCommit });
      const worldPath = join(worldsRoot, worldId);
      writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 43;${NL}`, 'utf8');
      git(worldPath, ['add', '-A']);
      git(worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'candidate on B']);

      /**
       * A SIBLING commit of B, made in the canonical repository so it is present in the shared object store.
       * It is not an ancestor of the world's HEAD, which is what makes asking for it a basis disagreement rather
       * than a rewind.
       */
      git(basis.repo, ['checkout', '-q', '-b', 'sibling', basis.basisCommit]);
      writeFileSync(join(basis.repo, 'src', 'sibling.mjs'), `export const sibling = 1;${NL}`, 'utf8');
      git(basis.repo, ['add', '-A']);
      git(basis.repo, ['-c', 'user.email=s@s.s', '-c', 'user.name=s', 'commit', '-qm', 'sibling of B']);
      const siblingCommit = git(basis.repo, ['rev-parse', 'HEAD']);
      /** The canonical repository is returned to B so its HEAD is not part of what this witness measures. */
      git(basis.repo, ['checkout', '-q', basis.basisCommit]);
      return { worldId, worldPath, baseCommit: siblingCommit, worldsRoot };
    },
  }));

  witnesses.push(await witness({
    id: 'PARTIAL_WORLD_MISCLASSIFICATION_DETECTED',
    description: 'a directory whose Git administrative identity lies outside it must not be adopted as a world',
    /**
     * THE SHAPE THAT MEASURABLY DIFFERS, and the one §2 names: a LINKED WORKTREE placed at the world path. Its
     * `.git` is a FILE pointing at `<canonical>/.git/worktrees/<id>`, so its mutable Git metadata belongs to the
     * canonical repository. The baseline's `rev-parse --git-dir` resolves that pointer, `#worldExists` answers
     * "yes", and the worktree is ADOPTED as a world — handing a worker mutable state the canonical repository
     * owns, which §D2-cR exists to prevent. This is the same misclassification class as a half-made world: the
     * directory is not an independently owned repository, and adopting it is the error.
     */
    invariant: (observed) => observed.outcome.returned === true,
    arrange: async ({ basis, worldsRoot }) => {
      const worldId = 'attempt-linked';
      const worldPath = join(worldsRoot, worldId);
      mkdirSync(worldsRoot, { recursive: true });
      git(basis.repo, ['worktree', 'add', '-q', '--detach', worldPath, basis.basisCommit]);
      return { worldId, worldPath, worldsRoot };
    },
  }));

  witnesses.push(await witness({
    id: 'UNKNOWN_READINESS_FAILURE_DETECTED',
    description: 'a commit failure outside the known set must not be reported as a usable world',
    /**
     * THE INVARIANT: the call must not RETURN a world that cannot commit.
     *
     * The fault has to land in the window the readiness gate actually covers — AFTER the clone and the checkout
     * have succeeded and BEFORE the gate runs — or it would be caught by the checkout instead and the witness
     * would be measuring the wrong thing. `GIT_TEMPLATE_DIR` with a `post-checkout` hook puts it exactly there:
     * git installs the hook during the clone and runs it at the end of the checkout.
     *
     * The fault is a CORRUPT INDEX, which is the case R3-WR2's text-matching denylist missed: git reports
     * `fatal: .git/index: index file smaller than expected`, which matches no pattern in that list, so the
     * baseline declares the world READY.
     */
    invariant: (observed) => observed.outcome.returned === true,
    /** The R3-WR implementation, which is where the text-matching readiness defect actually lives. */
    baselinePort: loadR3WRPort,
    arrange: async ({ root }) => {
      const worldId = 'attempt-unknown-fault';
      const template = join(root, 'template');
      mkdirSync(join(template, 'hooks'), { recursive: true });
      writeFileSync(join(template, 'hooks', 'post-checkout'), `#!/bin/sh${NL}printf "GARBAGE-INDEX" > "$(git rev-parse --git-dir)/index"${NL}exit 0${NL}`, 'utf8');
      const previous = process.env.GIT_TEMPLATE_DIR;
      process.env.GIT_TEMPLATE_DIR = template;
      return {
        worldId,
        /** The template is removed after the call so the harness's own cleanup is unaffected. */
        observe: () => {
          if (previous === undefined) delete process.env.GIT_TEMPLATE_DIR;
          else process.env.GIT_TEMPLATE_DIR = previous;
          return null;
        },
      };
    },
  }));

  witnesses.push(await witness({
    id: 'EFFECT_REPLAY_CONFLICT_DETECTED',
    description: 'a replay must converge on ONE physical world and must not mint a second for the same identity',
    /**
     * THE INVARIANT: after two calls for one world identity, exactly one physical world must exist AND the second
     * call must have named the SAME path as the first.
     *
     * Two calls alone do not discriminate, because both ports reuse. The discriminating scenario is the one
     * R3-WR2 actually repaired: the second call arrives when the world ALREADY holds a committed candidate, so a
     * port that re-creates rather than converges produces either a second directory or a destroyed candidate.
     * This witness therefore measures the CONVERGENCE property directly — same path, one directory, candidate
     * intact — rather than only counting directories.
     */
    invariant: (observed, setup) => observed.extra?.distinctPaths > 1
      || observed.extra?.worldCount > 1
      || observed.extra?.candidateLost === true,
    arrange: async ({ basis, worldsRoot, port }) => {
      const worldId = 'attempt-replay';
      await port.createWorld({ worktreeId: worldId, baseCommit: basis.basisCommit });
      const worldPath = join(worldsRoot, worldId);
      /** A committed candidate, so a port that re-creates has something to destroy. */
      writeFileSync(join(worldPath, 'src', 'candidate.mjs'), `export const candidate = 1;${NL}`, 'utf8');
      git(worldPath, ['add', '-A']);
      git(worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'candidate']);
      return {
        worldId,
        calls: 2,
        worldPath,
        worldsRoot,
        observe: ({ outcomes, worldsRoot: root }) => {
          const paths = outcomes.filter((entry) => entry.returned).map((entry) => resolve(entry.worldPath));
          return {
            distinctPaths: new Set(paths).size,
            worldCount: (() => { try { return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length; } catch { return 0; } })(),
            candidateLost: !existsSync(join(worldPath, 'src', 'candidate.mjs')),
          };
        },
      };
    },
  }));

  /** A healthy control: an ordinary create must SUCCEED on both ports, so the witnesses are not just refusals. */
  const control = await witness({
    id: 'HEALTHY_CONTROL_ORDINARY_CREATE',
    description: 'an ordinary create must succeed on both ports — the control that keeps the witnesses honest',
    invariant: (observed) => observed.outcome.returned === false || observed.worldUnchanged === false,
    arrange: async () => ({ worldId: 'attempt-healthy' }),
  });

  return Object.freeze({
    kind: 'R3-WR3 Gate 8 — mutation resistance',
    witnesses: Object.freeze(witnesses),
    healthyControl: control,
    /** The control must NOT be violated by either port: an ordinary create works everywhere. */
    HEALTHY_CONTROL_PASSES_BOTH: control.baselineViolated === false && control.currentViolated === false,
    witnessesSatisfied: witnesses.filter((entry) => entry.satisfied === true).length,
    witnessesTotal: witnesses.length,
    allSatisfied: witnesses.every((entry) => entry.satisfied === true),
  });
}

function main() {
  mutationResistance().then((suite) => {
    process.stdout.write(`${NL}===== R3-WR3 GATE 8 — MUTATION RESISTANCE =====${NL}`);
    for (const entry of suite.witnesses) {
      process.stdout.write(`${(entry.satisfied === true ? 'OK  ' : 'FAIL')} ${entry.id}${NL}`);
      process.stdout.write(`     baseline violated: ${String(entry.baselineViolated)}  current violated: ${String(entry.currentViolated)}${NL}`);
    }
    process.stdout.write(`${NL}${(suite.HEALTHY_CONTROL_PASSES_BOTH ? 'OK  ' : 'FAIL')} HEALTHY_CONTROL_ORDINARY_CREATE (baseline violated: ${String(suite.healthyControl.baselineViolated)}, current violated: ${String(suite.healthyControl.currentViolated)})${NL}`);
    process.stdout.write(`${NL}witnesses satisfied: ${String(suite.witnessesSatisfied)}/${String(suite.witnessesTotal)}  all satisfied: ${String(suite.allSatisfied)}${NL}`);
  }).catch((error) => {
    process.stderr.write(`gate 8 failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
