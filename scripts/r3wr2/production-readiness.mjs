/**
 * R3-WR2 — THE PRODUCTION READINESS GATE, MEASURED THROUGH THE COMPILED PORT.
 *
 * The research matrix (`probe-matrix.mjs`) measures the CRITERION. This measures the PRODUCTION CODE: it calls
 * the real compiled `GitCliPort.createWorld` against each faulty world and records whether the port REFUSED.
 * A criterion that is right in a script and not enforced in the port would be no fix at all, so the two are
 * checked separately.
 *
 * HOW THE FAULT IS INJECTED AT THE RIGHT MOMENT. The ruling is explicit: the fault must land AFTER clone and
 * checkout succeed but BEFORE the readiness gate runs, otherwise the clone itself fails and the test proves
 * nothing about the gate. `GIT_TEMPLATE_DIR` with a `post-checkout` hook does exactly that — git installs the
 * hook into the new world during the clone and RUNS it at the end of the checkout, so the corruption is in
 * place when the gate executes and the clone/checkout have already succeeded.
 *
 * PLAIN JAVASCRIPT (`.mjs`). Temporary roots. No LLM.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const git = (cwd, args) => execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

function makeBasis(root) {
  const repo = join(root, 'canonical');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'ledger.mjs'), `export const answer = 0;${NL}`, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=b@b.b', '-c', 'user.name=b', 'commit', '-qm', 'basis']);
  return Object.freeze({ repo, basisCommit: git(repo, ['rev-parse', 'HEAD']) });
}

/**
 * A template directory whose `post-checkout` hook injects the named fault INTO the new world. This runs in
 * exactly the window the ruling names: clone done, checkout done, gate not yet run.
 */
function templateFor(root, fault) {
  const dir = join(root, `template-${fault}`);
  mkdirSync(join(dir, 'hooks'), { recursive: true });
  const body = {
    'corrupt-index': 'printf "GARBAGE-INDEX" > "$(git rev-parse --git-dir)/index"',
    'held-index-lock': 'touch "$(git rev-parse --git-dir)/index.lock"',
    'garbled-head': 'printf "ref: refs/heads/nonexistent\\n" > "$(git rev-parse --git-dir)/HEAD"',
    'none': 'exit 0',
  }[fault];
  writeFileSync(join(dir, 'hooks', 'post-checkout'), `#!/bin/sh${NL}${body}${NL}exit 0${NL}`, 'utf8');
  return dir;
}

/**
 * GATE B — the production mutation proof.
 *
 * For each fault: build a basis, run the REAL port's `createWorld` with the injecting template, and record
 * whether the port refused. `none` is the healthy positive control — it must be ACCEPTED, or the gate is
 * simply refusing everything.
 */
export async function productionReadinessProof() {
  const { GitCliPort } = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'index.js')).href);
  const root = mkdtempSync(join(tmpdir(), 'r3wr2-prod-'));
  const arms = [];
  const previousTemplate = process.env.GIT_TEMPLATE_DIR;

  const runArm = async (fault, extra) => {
    const caseRoot = join(root, `case-${fault}`);
    mkdirSync(caseRoot, { recursive: true });
    const basis = makeBasis(caseRoot);
    const worldId = `attempt-${fault}`;
    const port = new GitCliPort(basis.repo, join(basis.repo, '.palimpsest', 'worlds'));

    process.env.GIT_TEMPLATE_DIR = templateFor(caseRoot, fault);
    let first = null;
    try {
      first = await port.createWorld({ worktreeId: worldId, baseCommit: basis.basisCommit });
    } catch (error) {
      first = { error: String(error?.message ?? error) };
    }
    delete process.env.GIT_TEMPLATE_DIR;

    /** For the post-clone fault: the world now exists; run the gate again through the port's reuse path. */
    let second = null;
    if (extra?.rerun === true) {
      try {
        second = await port.createWorld({ worktreeId: worldId, baseCommit: basis.basisCommit });
      } catch (error) {
        second = { error: String(error?.message ?? error) };
      }
    }

    /** For a borrowed-store fault, move the target aside AFTER the world is prepared. */
    if (extra?.removeBorrowed === true) {
      try { renameSync(join(basis.repo, '.git', 'objects'), join(root, `moved-${fault}`)); } catch { /* already gone */ }
      const third = await port.createWorld({ worktreeId: worldId, baseCommit: basis.basisCommit }).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error: String(error?.message ?? error) }),
      );
      arms.push(Object.freeze({ fault, injectedBy: 'borrowed target moved aside after preparation', refused: third.ok === false, message: third.ok ? 'ACCEPTED' : third.error.slice(0, 200) }));
    }

    arms.push(Object.freeze({
      fault,
      injectedBy: 'GIT_TEMPLATE_DIR post-checkout hook (clone and checkout succeeded first)',
      firstRefused: first?.error !== undefined,
      firstMessage: first?.error === undefined ? 'ACCEPTED' : first.error.slice(0, 200),
      secondRefused: second === null ? null : second?.error !== undefined,
      secondMessage: second === null ? null : (second?.error === undefined ? 'ACCEPTED' : second.error.slice(0, 200)),
    }));
  };

  try {
    /** The healthy control, and the faults the old denylist missed. */
    await runArm('none', { rerun: true });
    await runArm('corrupt-index', { rerun: true });
    await runArm('held-index-lock', { rerun: true });
    await runArm('garbled-head', { rerun: true });
    /** The fault the R3-WR gate was built for, applied after preparation. */
    await runArm('none', { removeBorrowed: true });
  } finally {
    if (previousTemplate === undefined) delete process.env.GIT_TEMPLATE_DIR;
    else process.env.GIT_TEMPLATE_DIR = previousTemplate;
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene sweeps it */ }
  }

  const control = arms.find((arm) => arm.fault === 'none' && arm.firstRefused === false);
  const corrupt = arms.find((arm) => arm.fault === 'corrupt-index');
  const lock = arms.find((arm) => arm.fault === 'held-index-lock');
  const head = arms.find((arm) => arm.fault === 'garbled-head');
  const borrowed = arms.find((arm) => arm.injectedBy?.startsWith('borrowed'));

  return Object.freeze({
    kind: 'R3-WR2 Gate B — production readiness proof',
    arms: Object.freeze(arms),
    HEALTHY_ACCEPTED: control !== undefined,
    CORRUPT_INDEX_REFUSED: corrupt?.firstRefused === true,
    HELD_INDEX_LOCK_REFUSED: lock?.firstRefused === true,
    GARBLED_HEAD_REFUSED: head?.firstRefused === true,
    DEAD_BORROWED_STORE_REFUSED: borrowed?.refused === true,
    /** The reuse path must ALSO refuse a world that is faulty, not wave it through. */
    REUSE_PATH_ALSO_REFUSES: corrupt?.secondRefused === true && lock?.secondRefused === true,
  });
}

function main() {
  productionReadinessProof().then((result) => {
    process.stdout.write(`${NL}===== R3-WR2 GATE B — PRODUCTION READINESS PROOF =====${NL}`);
    for (const arm of result.arms) {
      process.stdout.write(`${NL}${arm.fault}${NL}`);
      process.stdout.write(`  injected by: ${arm.injectedBy}${NL}`);
      if (arm.refused !== undefined) process.stdout.write(`  refused=${String(arm.refused)}  ${arm.message}${NL}`);
      else {
        process.stdout.write(`  first call refused=${String(arm.firstRefused)}  ${arm.firstMessage}${NL}`);
        process.stdout.write(`  reuse call refused=${String(arm.secondRefused)}  ${String(arm.secondMessage)}${NL}`);
      }
    }
    process.stdout.write(`${NL}  HEALTHY_ACCEPTED:            ${String(result.HEALTHY_ACCEPTED)}${NL}`);
    process.stdout.write(`  CORRUPT_INDEX_REFUSED:       ${String(result.CORRUPT_INDEX_REFUSED)}${NL}`);
    process.stdout.write(`  HELD_INDEX_LOCK_REFUSED:     ${String(result.HELD_INDEX_LOCK_REFUSED)}${NL}`);
    process.stdout.write(`  GARBLED_HEAD_REFUSED:        ${String(result.GARBLED_HEAD_REFUSED)}${NL}`);
    process.stdout.write(`  DEAD_BORROWED_STORE_REFUSED: ${String(result.DEAD_BORROWED_STORE_REFUSED)}${NL}`);
    process.stdout.write(`  REUSE_PATH_ALSO_REFUSES:     ${String(result.REUSE_PATH_ALSO_REFUSES)}${NL}`);
  }).catch((error) => {
    process.stderr.write(`proof failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
