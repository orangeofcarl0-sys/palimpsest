/**
 * R3-WR2 GATE C — WORKER-TOKEN PARITY ON A BORROWED WORLD.
 *
 * THE QUESTION. A world created with `git clone --shared` reads its immutable objects through
 * `.git/objects/info/alternates`, which points OUTSIDE the world — at the source repository's object store.
 * The host runs git as a Medium-integrity process. The actual Work worker runs as a LOW-integrity,
 * write-restricted process under the shipped `AclSandbox`. If the borrowed store is unreadable to the worker
 * while being readable to the host, then the world is commit-capable only in the host's hands, and every
 * readiness measurement taken by the host would be measuring the wrong principal.
 *
 * So this harness prepares ONE legitimate world through the shipped preparation path and then asks the SAME
 * questions of TWO principals:
 *
 *     HOST_GIT_OBJECT_ACCESS      this process, Medium integrity, no restriction
 *     WORKER_GIT_OBJECT_ACCESS    a child under the shipped AclSandbox: restricted token, Low integrity
 *
 * and compares them. `HOST_WORKER_ACCESS_PARITY` is the verdict, and it is only meaningful if the
 * confinement was actually IN EFFECT — so a POSITIVE CONTROL is included: a canary directory outside the
 * world is labelled Medium + NO_READ_UP, and the worker MUST be denied it. A parity PASS obtained from a
 * sandbox that confined nothing would be a measurement of nothing, and the control is what rules that out.
 *
 * THE CONFIDENTIALITY RULE IS NOT WEAKENED. Nothing here removes a label, grants a read, or relaxes the
 * profile. If the worker cannot read what it needs, that is reported as a runtime capability conflict for
 * architectural adjudication rather than fixed by weakening the boundary.
 *
 * No LLM. Temporary rig under `~/.palimpsest-*` (the WRITE_DAC constraint). Nothing in the checkout.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createWorldLikeShipped, git, makeBasisRepository, workerCommit } from '../r3wr/reproduce.mjs';

const NL = String.fromCharCode(10);

/** Resolve the DSH installation, so the shipped sandbox is imported rather than reimplemented. */
function dshRoot() {
  const explicit = process.env.PALIMPSEST_DSH_ROOT?.trim();
  if (explicit !== undefined && explicit !== '') return explicit;
  const bin = process.env.PALIMPSEST_DSH_BIN?.trim()
    || join(spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: true }).stdout.trim(), '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  return join(bin, '..', '..');
}

/**
 * The directory the shipped read fence resolves its binding seam from. The fence looks for
 * `<root>/node_modules/@deepseek-ai/dsh-win32-process/lib/index.js`, and that path exists under the `dsh`
 * package directory — so the root it wants IS `dshRoot()`. Pointing the fence at the shipped seam is what
 * lets the SHIPPED fence install here rather than a reimplementation of it.
 */
function dshSeamRoot() {
  return dshRoot();
}

/** The operations BOTH principals run, so the comparison is of identical work. */
function gitOperations(worldPath, basisCommit) {
  const dryRun = git(worldPath, ['commit', '--dry-run', '-m', 'parity-probe']);
  /**
   * `--untracked-files=no` because the comparison is about the WORLD's tracked state, not about scratch
   * files a probe wrote into it. A capture file the probe itself created would otherwise make every world
   * look dirty and turn the cleanliness test into a test of the harness.
   */
  const status = git(worldPath, ['status', '--porcelain', '--untracked-files=no']);
  /**
   * Commit capability is decided the SAME way the corrected gate decides it, so the two principals are
   * compared on one criterion rather than on two spellings of "it worked": exit 0 means git would commit;
   * exit 1 with a clean tracked tree means nothing to commit, which is a legitimate clean world. Any other
   * exit is a refusal.
   */
  return Object.freeze({
    headCommitResolvable: git(worldPath, ['rev-parse', '--verify', 'HEAD^{commit}']).ok,
    basisReadable: git(worldPath, ['cat-file', '-e', `${basisCommit}^{commit}`]).ok,
    statusReadable: status.ok,
    dryRunExit: dryRun.exit ?? (dryRun.ok ? 0 : -1),
    commitCapable: dryRun.ok || (status.ok && status.stdout === '' && (dryRun.exit ?? -1) === 1),
  });
}

/**
 * The child program. It runs INSIDE the confinement, so every fact it reports is a fact about the worker
 * principal. It never reports file CONTENT — only readability and git verdicts.
 *
 * HOW IT RUNS GIT. The shipped sandbox restricts WRITES, and a write-restricted token cannot create an
 * anonymous pipe, so `execFileSync`'s default `pipe` stdio fails with EPERM for reasons that have nothing to
 * do with git or with borrowed objects. The shipped DSH runner spawns with `stdio: 'inherit'` for exactly
 * this reason. This child does the equivalent that still lets it CAPTURE the verdict: it redirects git's
 * stdout/stderr to files it OWNS inside its own world, which its workspace-write grant permits. Measuring
 * git any other way would have measured the sandbox's pipe policy instead of object access.
 */
function childSource(input) {
  return `
import { readFileSync, writeFileSync, openSync, closeSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const out = {};
const world = ${JSON.stringify(input.worldPath)};
const capture = join(world, "parity-git-out.txt");

/** Run git with file-descriptor stdio inside the world, and return its exit code plus captured text. */
const gitRun = (args) => {
  let fd = -1;
  try {
    fd = openSync(capture, "w");
    const result = spawnSync("git", args, { cwd: world, stdio: ["ignore", fd, fd], encoding: "utf8" });
    closeSync(fd); fd = -1;
    let text = "";
    try { text = readFileSync(capture, "utf8").trim().slice(0, 200); } catch { /* nothing captured */ }
    return { status: result.status, spawned: result.error === undefined || result.error === null, error: result.error === undefined ? null : String(result.error.code ?? result.error.message).slice(0, 120), text };
  } catch (error) {
    if (fd >= 0) { try { closeSync(fd); } catch { /* already closed */ } }
    return { status: null, spawned: false, error: String(error?.code ?? error?.message ?? error).slice(0, 120), text: "" };
  }
};

/** THE POSITIVE CONTROL: a Medium + NO_READ_UP root outside the world. A Low worker must be DENIED. */
try { const content = readFileSync(${JSON.stringify(input.controlCanary)}, "utf8"); out.controlReadable = true; out.controlBytes = content.length; }
catch (error) { out.controlReadable = false; out.controlError = error?.code ?? String(error); }

/** The world's own content: the worker MUST be able to read it, or nothing works at all. */
try { readFileSync(join(world, "src", "ledger.mjs"), "utf8"); out.worldReadable = true; }
catch (error) { out.worldReadable = false; out.worldError = error?.code ?? String(error); }

/** THE BORROWED OBJECT STORE: the file the world reads its immutable objects through. */
try { const text = readFileSync(join(world, ".git", "objects", "info", "alternates"), "utf8"); out.alternatesReadable = true; out.alternatesEntries = text.trim().split(/\\r?\\n/u).length; }
catch (error) { out.alternatesReadable = false; out.alternatesError = error?.code ?? String(error); }

const head = gitRun(["rev-parse", "--verify", "HEAD^{commit}"]);
out.headCommitResolvable = head.status === 0;
out.headDetail = head.status === 0 ? head.text : (head.error ?? head.text);
const basis = gitRun(["cat-file", "-e", ${JSON.stringify(`${input.basisCommit}^{commit}`)}]);
out.basisReadable = basis.status === 0;
out.basisDetail = basis.status === 0 ? "readable" : (basis.error ?? basis.text);
const status = gitRun(["status", "--porcelain", "--untracked-files=no"]);
out.statusReadable = status.status === 0;
const dry = gitRun(["commit", "--dry-run", "-m", "parity-probe"]);
out.dryRunExit = dry.status;
out.commitCapable = dry.status === 0 || (status.status === 0 && status.text === "" && dry.status === 1);

/** A real, deterministic commit through the worker's own supported path. */
writeFileSync(join(world, "src", "worker-parity.txt"), "worker parity" + String.fromCharCode(10));
out.addOk = gitRun(["add", "-A"]).status === 0;
const commit = gitRun(["commit", "-m", "worker parity commit"]);
out.commitOk = commit.status === 0;
out.commitDetail = commit.status === 0 ? commit.text : (commit.error ?? commit.text);
const after = gitRun(["rev-parse", "HEAD"]);
out.headAfter = after.status === 0 ? after.text : null;
out.headChanged = after.status === 0 && after.text !== ${JSON.stringify(input.basisCommit)};
try { rmSync(capture, { force: true }); } catch { /* the world keeps it if not */ }

writeFileSync(${JSON.stringify(input.reportPath)}, JSON.stringify(out));
process.stderr.write("PARITY_RESULT " + JSON.stringify({ wrote: true }) + String.fromCharCode(10));
`;
}

/** The harness that builds the sandbox. Written to disk so the sandbox import happens in a clean process. */
function harnessSource(input) {
  return `
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = {};
const indexModule = await import(${JSON.stringify(input.aclUrl)});
const { AclSandbox, tempWriteSid, workspaceWriteSid } = indexModule;
const workspaceRoot = ${JSON.stringify(input.worldPath)};
const tempDir = mkdtempSync(join(tmpdir(), "r3wr2-parity-"));
let sandbox;
try {
  sandbox = new AclSandbox({ writableDirs: [workspaceRoot], tempDir, writeSid: workspaceWriteSid(workspaceRoot), tempWriteSid: tempWriteSid(tempDir), mode: "workspace-write" });
  await sandbox.init();
  const child = sandbox.spawn({ command: process.execPath, args: [${JSON.stringify(input.childPath)}], cwd: workspaceRoot, stdio: "inherit" });
  out.exitCode = (await child.wait()).exitCode;
  out.spawned = true;
} catch (error) { out.spawned = false; out.error = String(error?.message ?? error).slice(0, 400); }
finally { try { sandbox?.dispose(); } catch {} try { rmSync(tempDir, { recursive: true, force: true }); } catch {} }
process.stderr.write("SANDBOX_RESULT " + JSON.stringify(out) + String.fromCharCode(10));
`;
}

/**
 * GATE C — run the whole measurement. Returns the recorded facts; it never asserts a verdict by fiat.
 */
export async function workerTokenParity(input = {}) {
  const rig = input.rig ?? join(homedir(), '.palimpsest-r3wr2', 'gate-c');
  if (existsSync(rig)) rmSync(rig, { recursive: true, force: true });
  mkdirSync(rig, { recursive: true });

  const basis = makeBasisRepository(rig);
  const worldPath = join(rig, 'world');
  const prepared = createWorldLikeShipped({ repository: basis.repo, worldPath, baseCommit: basis.basisCommit });

  /** THE CONTROL ROOT: outside the world, so it is not skipped by the "ancestor of the world" rule. */
  const controlRoot = join(rig, 'control-secret');
  mkdirSync(controlRoot, { recursive: true });
  const controlCanary = join(controlRoot, 'canary.txt');
  writeFileSync(controlCanary, `CONTROL-CANARY-${String(basis.basisCommit).slice(0, 8)}${NL}`, 'utf8');

  /** Apply the SHIPPED fence to the control root, and verify it reached the content. */
  let fence = { supported: false, unavailable: 'not attempted' };
  try {
    /**
     * The fence resolves its binding seam from `PALIMPSEST_DSH_ROOT` (or from `process.argv[1]`). Neither is
     * set in a bare script run, so it is set here to the dsh package directory the fence documents — the one
     * that actually contains `node_modules/@deepseek-ai/dsh-win32-process`.
     */
    process.env.PALIMPSEST_DSH_ROOT = dshSeamRoot();
    const fenceModule = await import(pathToFileURL(join(import.meta.dirname, '..', '..', 'host', 'deployment', 'runtime', 'read_fence.js')).href);
    fence = fenceModule.applyReadFence({ roots: [controlRoot], world: worldPath });
  } catch (error) {
    fence = { supported: false, unavailable: String(error?.message ?? error).slice(0, 200) };
  }

  /** THE HOST PRINCIPAL: this process. */
  const host = gitOperations(worldPath, basis.basisCommit);

  /** THE WORKER PRINCIPAL: a child under the shipped sandbox. */
  /**
   * The report is written INSIDE the world, because the worker's token is write-restricted to its workspace
   * by the shipped sandbox — which is itself the confinement working. A report written outside the world
   * would be denied, and the denial would look like a harness failure rather than a boundary.
   */
  const reportPath = join(worldPath, 'worker-report.json');
  const childPath = join(rig, 'worker-child.mjs');
  const harnessPath = join(rig, 'worker-harness.mjs');
  writeFileSync(childPath, childSource({ worldPath, basisCommit: basis.basisCommit, controlCanary, reportPath }), 'utf8');

  const aclUrl = pathToFileURL(join(dshRoot(), 'node_modules', '@deepseek-ai', 'dsh-sandbox-windows-acl', 'lib', 'index.js')).href;
  writeFileSync(harnessPath, harnessSource({ worldPath, childPath, aclUrl }), 'utf8');

  const run = spawnSync(process.execPath, [harnessPath], { encoding: 'utf8', timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] });
  const sandboxLine = (run.stderr ?? '').split(NL).map((entry) => entry.trim()).find((entry) => entry.startsWith('SANDBOX_RESULT'));
  const sandbox = sandboxLine === undefined ? { spawned: false, error: (run.stderr ?? '').slice(0, 400) } : JSON.parse(sandboxLine.slice('SANDBOX_RESULT '.length));
  const worker = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;

  /**
   * THE CONFINEMENT CHECK. Parity is only evidence if the confinement was real, and the control is what
   * establishes that. A worker that could read the labelled control root was not confined.
   */
  const confinementInEffect = worker !== null && worker.controlReadable === false && worker.worldReadable === true;

  const parity = worker === null
    ? 'NOT_EXERCISED'
    : !confinementInEffect
      ? 'NOT_EXERCISED'
      : host.headCommitResolvable === worker.headCommitResolvable
        && host.basisReadable === worker.basisReadable
        && host.commitCapable === worker.commitCapable
        && worker.commitOk === true
        ? 'PASS'
        : 'FAIL';

  return Object.freeze({
    rig,
    worldPath,
    basisCommit: basis.basisCommit,
    prepared,
    alternates: readFileSync(join(worldPath, '.git', 'objects', 'info', 'alternates'), 'utf8').trim(),
    fence,
    control: Object.freeze({ root: controlRoot, canary: controlCanary }),
    confinementInEffect,
    HOST_GIT_OBJECT_ACCESS: Object.freeze(host),
    WORKER_GIT_OBJECT_ACCESS: worker === null ? null : Object.freeze(worker),
    sandbox,
    HOST_WORKER_ACCESS_PARITY: parity,
    /** The shipped commit path, run AFTER the worker, as an independent second witness. */
    hostCommitAfterWorker: workerCommit({ worldPath, message: 'host parity commit' }),
  });
}

function main() {
  workerTokenParity().then((result) => {
    process.stdout.write(`${NL}===== R3-WR2 GATE C — WORKER-TOKEN PARITY =====${NL}`);
    process.stdout.write(`world      ${result.worldPath}${NL}`);
    process.stdout.write(`alternates ${result.alternates}${NL}`);
    process.stdout.write(`fence      supported=${String(result.fence.supported)} ${String(result.fence.unavailable ?? '')}${NL}`);
    process.stdout.write(`confinement in effect: ${String(result.confinementInEffect)}${NL}`);
    process.stdout.write(`HOST   ${JSON.stringify(result.HOST_GIT_OBJECT_ACCESS)}${NL}`);
    process.stdout.write(`WORKER ${JSON.stringify(result.WORKER_GIT_OBJECT_ACCESS)}${NL}`);
    process.stdout.write(`HOST_WORKER_ACCESS_PARITY: ${result.HOST_WORKER_ACCESS_PARITY}${NL}`);
  }).catch((error) => {
    process.stderr.write(`gate C failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
