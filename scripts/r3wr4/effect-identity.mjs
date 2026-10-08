/**
 * R3-WR4 GATE A4/A5 — EFFECT IDENTITY AND DISPATCH, MEASURED THROUGH THE REAL ORDARIUM RUNTIME.
 *
 * The R3-WR3 stage measured this area with two criteria that the R3-WR4 erratum withdraws:
 *
 *   `worlds.length === 1`                        proves physical NON-DUPLICATION, not that a distinct operation
 *                                                had AUTHORITY to reuse the world
 *   `fulfilled + rejected === attempted`         is a TAUTOLOGY for `Promise.allSettled` and can never fail
 *
 * So this harness measures the things those criteria could not:
 *
 *   A4  a COUNTED, CONTROLLABLY BLOCKED production-port wrapper, so the number of effect invocations, the number
 *       of actual `createWorld` dispatches, the maximum simultaneous active dispatches, the operation/ledger
 *       identities and the number of physical worlds are all OBSERVED rather than inferred. A dispatch that
 *       entered the port and had not returned is ACTIVE; that is what makes "one world" and "one active
 *       dispatch" separable facts.
 *
 *   A5  six simultaneous same-key invocations, with the same counting, so the ruling's question — is there
 *       single-flight dispatch, or merely convergence? — is answered by a number rather than by a settled-promise
 *       identity.
 *
 * PLAIN JAVASCRIPT (`.mjs`). Temporary roots only. No LLM, no network.
 */
import { execFileSync } from 'node:child_process';
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

function worldsOnDisk(worldsRoot) {
  try {
    return readdirSync(worldsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
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

async function loadRuntime() {
  const { createPalimpsestEffects } = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'runtime.js')).href);
  const { GitCliPort } = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'git_port.js')).href);
  return { createPalimpsestEffects, GitCliPort };
}

const intent = (scope, callId, revision = 1) => ({ scope, callId, revision });

/**
 * A COUNTING, CONTROLLABLY BLOCKED wrapper around the production port.
 *
 * `dispatch` counts every call that REACHED the port; `active`/`maxActive` measure how many had entered and not
 * returned, which is the only way to tell "six calls, one world" (convergence) from "six calls, one at a time"
 * (single-flight). `gate` lets a caller hold dispatches open deliberately, so the concurrency question is
 * answered under a condition the harness controls rather than under whatever timing the machine happened to give.
 *
 * The Proxy uses the TARGET as receiver because `GitCliPort`'s methods live on its prototype and read private
 * fields; spreading the instance would leave every method undefined and inject a second, unintended defect.
 */
function countingPort(realPort) {
  const counters = { invocations: 0, dispatch: 0, succeeded: 0, threw: 0, active: 0, maxActive: 0 };
  const listeners = [];
  let release = null;
  const gate = { open: true, wait: null };
  const proxy = new Proxy(realPort, {
    get(target, property) {
      if (property === 'createWorld') {
        return async (input) => {
          counters.invocations += 1;
          counters.dispatch += 1;
          counters.active += 1;
          counters.maxActive = Math.max(counters.maxActive, counters.active);
          for (const listener of listeners) listener(counters);
          try {
            if (gate.wait !== null) await gate.wait;
            const created = await target.createWorld(input);
            counters.succeeded += 1;
            return created;
          } catch (error) {
            counters.threw += 1;
            throw error;
          } finally {
            counters.active -= 1;
            for (const listener of listeners) listener(counters);
          }
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return {
    proxy,
    counters,
    onDispatch: (listener) => { listeners.push(listener); },
    /** Hold every subsequent dispatch open until `releaseAll()`; the caller controls the overlap window. */
    block: () => { gate.wait = new Promise((resolve) => { release = resolve; }); },
    releaseAll: () => { const r = release; gate.wait = null; release = null; if (r !== null) r(); },
  };
}

/** The Ordarium ledger rows for one operation, so authority is read from the DURABLE record. */
async function operationRows(ledgerPath) {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(ledgerPath);
    const rows = db.prepare('SELECT operation_id, state, record_json FROM ordarium_operations ORDER BY operation_id').all();
    const events = db.prepare('SELECT operation_id, state, semantic_revision FROM ordarium_operation_events ORDER BY operation_id, semantic_revision').all();
    db.close();
    /** The logical key is not persisted; the identity is recovered from the record's `identity` field. */
    const identities = rows.map((row) => {
      try {
        const record = JSON.parse(String(row.record_json));
        return { operationId: String(row.operation_id), state: String(row.state), source: record?.identity?.source ?? null, scope: record?.identity?.scope ?? null, callId: record?.identity?.callId ?? null, inputDigest: record?.inputDigest ?? null };
      } catch {
        return { operationId: String(row.operation_id), state: String(row.state), identity: null };
      }
    });
    return { rows: identities, events: events.map((row) => `${String(row.operation_id)}:${String(row.state)}@${String(row.semantic_revision)}`) };
  } catch (error) {
    return { error: String(error?.message ?? error).slice(0, 160) };
  }
}

/* ================================================================== *
 * A4 — A CONFLICTING OPERATION
 * ================================================================== */

/**
 * Drive a real invocation A with world W, then invoke B with a DIFFERENT durable operation identity but the
 * SAME world W.
 *
 * The R3-WR3 verdict for this case was `EFFECT_REPLAY_CONFLICT_DETECTED`, derived from `worlds.length === 1`.
 * The erratum withdraws that: one directory can remain because B was refused OR because B silently adopted A's
 * world. So what is recorded here is the OPERATION-LEVEL outcome and the DISPATCH COUNT, not the directory count.
 */
export async function crossOperationArm() {
  const { createPalimpsestEffects, GitCliPort } = await loadRuntime();
  const root = mkdtempSync(join(tmpdir(), 'r3wr4-a4-'));
  try {
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
    const ledger = join(root, 'ordarium.sqlite');
    const runtime = createPalimpsestEffects({ databasePath: ledger, git: new GitCliPort(basis.repo, worldsRoot), allowVolatileLedger: true });

    /** A — the first operation, which legitimately creates the world. */
    const a = await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-a4', baseCommit: basis.basisCommit }, intent('r3wr4', 'world:attempt-a4'));

    /** The world's own work, so a silent re-creation or adoption would have something to destroy. */
    writeFileSync(join(a.worldPath, 'src', 'candidate.mjs'), `export const candidate = 1;${NL}`, 'utf8');
    git(a.worldPath, ['add', '-A']);
    git(a.worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'candidate']);
    const candidateHead = git(a.worldPath, ['rev-parse', 'HEAD']);
    const bindingAfterA = readFileSync(join(a.worldPath, '.git', 'palimpsest-world-binding.json'), 'utf8').trim();

    /** B — a DISTINCT operation identity, same world id, same input. */
    let b;
    try {
      const created = await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-a4', baseCommit: basis.basisCommit }, intent('r3wr4', 'world:attempt-a4-other'));
      b = { returned: true, worldPath: created.worldPath };
    } catch (error) {
      b = { returned: false, code: String(error?.code ?? ''), error: String(error?.message ?? error).slice(0, 200) };
    }

    const bindingAfterB = existsSync(join(a.worldPath, '.git', 'palimpsest-world-binding.json'))
      ? readFileSync(join(a.worldPath, '.git', 'palimpsest-world-binding.json'), 'utf8').trim()
      : null;
    const rows = await operationRows(ledger);
    const worlds = worldsOnDisk(worldsRoot);

    return Object.freeze({
      kind: 'R3-WR4 Gate A4 — a distinct operation identity reaching for the same world',
      firstWorldPath: a.worldPath,
      candidateHead,
      secondOperation: b,
      worldsForThisId: worlds,
      ONE_PHYSICAL_WORLD: worlds.length === 1,
      /** The facts the withdrawn criterion could not distinguish. */
      secondOperationReturned: b.returned === true,
      secondOperationNamedSamePath: b.returned === true && b.worldPath === a.worldPath,
      CANDIDATE_PRESERVED: git(a.worldPath, ['rev-parse', 'HEAD']) === candidateHead,
      BINDING_UNCHANGED_BY_SECOND_OPERATION: bindingAfterA === bindingAfterB,
      distinctOperationIds: rows.rows === undefined ? null : rows.rows.length,
      ledger: rows,
      /** The corrected classification: convergence is measured, authority is NOT claimed. */
      CROSS_OPERATION_WORLD_AUTHORITY: 'NOT_PROVEN',
      physicalConvergence: worlds.length === 1 && (b.returned === false || b.worldPath === a.worldPath),
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene */ }
  }
}

/* ================================================================== *
 * A5 — CONCURRENCY, WITH COUNTED AND BLOCKED DISPATCHES
 * ================================================================== */

/**
 * Six simultaneous same-key invocations, with the port counting entries and exits.
 *
 * The measured separation the ruling asks for:
 *
 *   ONE_WORLD_CREATED   exactly one physical world exists afterwards
 *   ONE_ACTIVE_DISPATCH the maximum number of dispatches that were simultaneously inside the port was 1
 *
 * The second is what "single-flight" means, and the R3-WR3 criterion could not see it. The `blocked` variant
 * holds every dispatch open deliberately, so the overlap window is the harness's choice rather than the
 * machine's timing: if the runtime serializes, the maximum active count stays at 1 even while six calls are
 * outstanding; if it does not, the count rises and that is reported honestly.
 */
export async function concurrencyArm() {
  const { createPalimpsestEffects, GitCliPort } = await loadRuntime();
  const root = mkdtempSync(join(tmpdir(), 'r3wr4-a5-'));
  try {
    const basis = makeBasis(root);
    const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
    const ledger = join(root, 'ordarium.sqlite');

    const run = async (label, blocked) => {
      const realPort = new GitCliPort(basis.repo, worldsRoot);
      const counting = countingPort(realPort);
      const runtime = createPalimpsestEffects({ databasePath: ledger, git: counting.proxy, allowVolatileLedger: true });
      const worldId = `attempt-a5-${label}`;
      const callId = `world:${worldId}`;
      if (blocked) counting.block();
      const calls = Array.from({ length: 6 }, () =>
        runtime.invoke(runtime.actions.worldCreate, { worldId, baseCommit: basis.basisCommit }, intent('r3wr4', callId)),
      );
      /**
       * THE BLOCKED ARM RELEASES ON A TIMER, never after awaiting the calls — releasing after the await would
       * deadlock, because the calls cannot settle until the gate opens. Holding for a fixed window instead makes
       * the OVERLAP WINDOW a property of the harness rather than of the machine's timing: whatever the runtime
       * does about serialization has to happen inside this window, and `maxActive` records it.
       */
      if (blocked) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        counting.releaseAll();
      }
      const settled = await Promise.allSettled(calls);
      const fulfilled = settled.filter((entry) => entry.status === 'fulfilled');
      const rejected = settled.filter((entry) => entry.status === 'rejected');
      const distinctPaths = [...new Set(fulfilled.map((entry) => entry.value.worldPath))];
      const worlds = worldsOnDisk(worldsRoot).filter((name) => name === worldId);
      const rows = await operationRows(ledger);
      await runtime.close();
      return Object.freeze({
        label,
        blocked,
        attempted: settled.length,
        fulfilled: fulfilled.length,
        rejected: rejected.length,
        rejectionReasons: rejected.map((entry) => String(entry.reason?.code ?? entry.reason?.message ?? entry.reason).slice(0, 120)),
        distinctWorldPaths: distinctPaths,
        worldsForThisId: worlds,
        /** The two facts the ruling requires be kept apart. */
        ONE_WORLD_CREATED: worlds.length === 1,
        ONE_ACTIVE_DISPATCH: counting.counters.maxActive === 1,
        maxSimultaneousActiveDispatches: counting.counters.maxActive,
        portInvocations: counting.counters.invocations,
        portDispatches: counting.counters.dispatch,
        portSucceeded: counting.counters.succeeded,
        portThrew: counting.counters.threw,
        distinctOperationIdsInLedger: rows.rows === undefined ? null : rows.rows.length,
        ALL_SUCCESSES_AGREE_ON_PATH: distinctPaths.length <= 1,
      });
    };

    const unblocked = await run('unblocked', false);
    const blocked = await run('blocked', true);

    return Object.freeze({
      kind: 'R3-WR4 Gate A5 — counted concurrent dispatch',
      unblocked,
      blocked,
      /** Derived, not asserted. */
      CONVERGENCE_MEASURED: unblocked.ONE_WORLD_CREATED === true && blocked.ONE_WORLD_CREATED === true,
      SINGLE_FLIGHT_DISPATCH_PROVEN: blocked.ONE_ACTIVE_DISPATCH === true && blocked.portDispatches <= 1,
      SINGLE_FLIGHT_DISPATCH: blocked.ONE_ACTIVE_DISPATCH === true && blocked.portDispatches <= 1 ? 'PROVEN' : 'LIMITED',
      /** The R3-WR3 criterion, retained only to show it cannot fail. */
      withdrawnCriterion: Object.freeze({
        expression: 'fulfilled + rejected === attempted',
        tautologyForAllSettled: unblocked.fulfilled + unblocked.rejected === unblocked.attempted,
        note: 'true for ANY outcome, which is why it was not evidence of serialization',
      }),
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene */ }
  }
}

function main() {
  const run = async () => {
    const a4 = await crossOperationArm();
    process.stdout.write(`${NL}===== R3-WR4 GATE A4 — CROSS-OPERATION IDENTITY =====${NL}${JSON.stringify(a4, null, 2)}${NL}`);
    const a5 = await concurrencyArm();
    process.stdout.write(`${NL}===== R3-WR4 GATE A5 — COUNTED CONCURRENT DISPATCH =====${NL}${JSON.stringify(a5, null, 2)}${NL}`);
  };
  run().catch((error) => {
    process.stderr.write(`gate A4/A5 failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
