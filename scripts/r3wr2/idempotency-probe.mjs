/**
 * R3-WR2 GATE F — THE DECLARED-IDEMPOTENCY PROBE.
 *
 * `palimpsest.world.create` is declared `effects.idempotent()`, and its own comment states the contract:
 * "idempotent: the same world id reuses the path". Ordarium RELIES on that declaration — when an invocation
 * throws after dispatch, the operation is left UNCERTAIN and its recovery path for an idempotent action is
 * `redispatch-same-key`, which re-runs the action with the same operation key.
 *
 * So the declaration is load-bearing: a redispatch only converges if re-running the action with the same world
 * id actually SUCCEEDS. This probe calls the REAL compiled `GitCliPort.createWorld` twice with the same
 * `worktreeId` and reports whether the second call honours the declared contract.
 *
 * It measures; it does not assume. The world is built through the shipped call, in a temporary root, with no
 * LLM.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * GATE F — call `createWorld` twice with one world id, and record both outcomes.
 *
 * A third call is made after an edit is left uncommitted in the world, because the interesting question is not
 * only "does it succeed" but "does it DESTROY work" — the R3-WR comment forbids re-creating a world that may
 * have held uncommitted work, so a fix that converges by deleting the directory would be worse than the defect.
 */
export async function declaredIdempotencyProbe() {
  const { GitCliPort } = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'index.js')).href);
  const { execFileSync } = await import('node:child_process');
  const git = (cwd, args) => execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

  const root = mkdtempSync(join(tmpdir(), 'r3wr2-idem-'));
  const repo = join(root, 'canonical');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'ledger.mjs'), `export const answer = 0;${NL}`, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=b@b.b', '-c', 'user.name=b', 'commit', '-qm', 'basis']);
  const basisCommit = git(repo, ['rev-parse', 'HEAD']);

  const port = new GitCliPort(repo, join(repo, '.palimpsest', 'worlds'));
  const worldId = 'attempt-idempotency-probe';
  const call = async (label) => {
    try {
      const result = await port.createWorld({ worktreeId: worldId, baseCommit: basisCommit });
      return Object.freeze({ label, ok: true, worldPath: result.worldPath, error: null });
    } catch (error) {
      return Object.freeze({ label, ok: false, worldPath: null, error: String(error?.stderr ?? error?.message ?? error).trim().slice(0, 200) });
    }
  };

  const first = await call('first createWorld (world absent)');
  const worldPath = port.worldPath(worldId);

  /** An uncommitted edit, so a re-creating "fix" would be caught destroying work. */
  writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 7;${NL}`, 'utf8');
  const editedBytes = statSync(join(worldPath, 'src', 'ledger.mjs')).size;

  const second = await call('second createWorld (world present, uncommitted work)');
  const stillThere = existsSync(worldPath);
  const workSurvived = stillThere && statSync(join(worldPath, 'src', 'ledger.mjs')).size === editedBytes;
  const headAfter = stillThere ? (() => { try { return git(worldPath, ['rev-parse', 'HEAD']); } catch { return null; } })() : null;

  try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene sweeps it */ }

  return Object.freeze({
    kind: 'R3-WR2 Gate F — declared idempotency of palimpsest.world.create',
    declaredProfile: 'idempotent (durable window)',
    declaredContract: 'the same world id reuses the path',
    worldPath,
    first,
    second,
    /** The finding, derived rather than asserted. */
    SECOND_CALL_HONOURS_CONTRACT: second.ok === true,
    WORLD_AND_WORK_PRESERVED: stillThere && workSurvived,
    headAfter,
    basisCommit,
    /** What a redispatch of an uncertain world.create would therefore do. */
    redispatchConverges: second.ok === true,
  });
}

function main() {
  declaredIdempotencyProbe().then((result) => {
    process.stdout.write(`${NL}===== R3-WR2 GATE F — DECLARED IDEMPOTENCY OF palimpsest.world.create =====${NL}`);
    process.stdout.write(`declared profile:  ${result.declaredProfile}${NL}`);
    process.stdout.write(`declared contract: ${result.declaredContract}${NL}`);
    process.stdout.write(`${NL}first  call: ok=${String(result.first.ok)}${NL}`);
    process.stdout.write(`second call: ok=${String(result.second.ok)}${NL}`);
    if (result.second.ok === false) process.stdout.write(`  error: ${result.second.error}${NL}`);
    process.stdout.write(`${NL}SECOND_CALL_HONOURS_CONTRACT: ${String(result.SECOND_CALL_HONOURS_CONTRACT)}${NL}`);
    process.stdout.write(`WORLD_AND_WORK_PRESERVED:     ${String(result.WORLD_AND_WORK_PRESERVED)}${NL}`);
    process.stdout.write(`redispatchConverges:          ${String(result.redispatchConverges)}${NL}`);
  }).catch((error) => {
    process.stderr.write(`probe failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
