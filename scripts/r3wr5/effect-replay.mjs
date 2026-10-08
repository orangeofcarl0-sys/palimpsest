/**
 * R3-WR5 GATE A §5 — EFFECT REPLAY AND COUNTED CONCURRENCY.
 *
 * §5 forbids reusing the withdrawn tautology (`fulfilled + rejected === attempted`) and requires ACTUAL port
 * dispatch counts and maximum simultaneous active dispatches for any single-flight claim. It also retains the
 * R3-WR4 limitation explicitly: one runtime process over one durable ledger, no multi-process claim.
 *
 * The properties measured, each with a healthy control:
 *
 *   authorized replay converges          the same key reaches the same world
 *   a different Attempt cannot adopt     the world refuses a foreign owner
 *   candidate HEAD remains stable        the candidate commit is untouched
 *   dirty/untracked edits remain         work in the tree survives
 *   the original basis stays frozen      the recorded basis is unchanged
 *   canonical Git state unchanged        HEAD, refs, remotes, config, status
 *   no duplicate canonical Attempt       one attempt row, not two
 *   no duplicate effect ownership        one operation, one world
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
    return `ERR:${String(error?.stderr ?? error?.message).trim().slice(0, 160)}`;
  }
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function makeBasis(root, seed = 0) {
  const repo = join(root, 'canonical');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'ledger.mjs'), `export const answer = ${String(seed)};${NL}`, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=b@b.b', '-c', 'user.name=b', 'commit', '-qm', 'basis']);
  return Object.freeze({ repo, basisCommit: git(repo, ['rev-parse', 'HEAD']) });
}

function worldsOnDisk(worldsRoot) {
  try {
    return readdirSync(worldsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

const canonicalState = (repo) => sha256([
  git(repo, ['rev-parse', 'HEAD']),
  git(repo, ['symbolic-ref', '-q', 'HEAD']),
  git(repo, ['show-ref']),
  git(repo, ['remote', '-v']),
  git(repo, ['config', '--list', '--local']),
  git(repo, ['status', '--porcelain']).split(NL).filter((line) => !line.includes('.palimpsest/')).join(NL),
].join('\u0000'));

const worldState = (worldPath) => sha256([
  git(worldPath, ['rev-parse', 'HEAD']),
  git(worldPath, ['status', '--porcelain']),
  git(worldPath, ['config', '--list', '--local']),
  (() => { try { return readFileSync(join(worldPath, '.git', 'palimpsest-world-binding.json'), 'utf8'); } catch { return ''; } })(),
].join('\u0000'));

/**
 * A COUNTING, CONTROLLABLY BLOCKED wrapper around the production port.
 *
 * `dispatch` counts every call that REACHED the port; `active`/`maxActive` measure how many had entered and not
 * returned. That is the only way to separate "six calls, one world" (convergence) from "six calls, one at a
 * time" (single-flight), and it is what replaces the withdrawn tautology.
 */
function countingPort(realPort) {
  const counters = { invocations: 0, dispatch: 0, succeeded: 0, threw: 0, active: 0, maxActive: 0 };
  let release = null;
  const gate = { wait: null };
  const proxy = new Proxy(realPort, {
    get(target, property) {
      if (property === 'createWorld') {
        return async (input) => {
          counters.invocations += 1;
          counters.dispatch += 1;
          counters.active += 1;
          counters.maxActive = Math.max(counters.maxActive, counters.active);
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
    block: () => { gate.wait = new Promise((resolve) => { release = resolve; }); },
    releaseAll: () => { const r = release; gate.wait = null; release = null; if (r !== null) r(); },
  };
}

async function loadRuntime() {
  const { createPalimpsestEffects } = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'runtime.js')).href);
  const { GitCliPort } = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'git_port.js')).href);
  return { createPalimpsestEffects, GitCliPort };
}

const intent = (scope, callId, revision = 1) => ({ scope, callId, revision });

async function operationRows(ledgerPath) {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(ledgerPath);
    const rows = db.prepare('SELECT operation_id, state, record_json FROM ordarium_operations ORDER BY operation_id').all();
    db.close();
    return rows.map((row) => {
      try {
        const record = JSON.parse(String(row.record_json));
        return { operationId: String(row.operation_id), state: String(row.state), callId: record?.identity?.callId ?? null, scope: record?.identity?.scope ?? null, inputDigest: record?.inputDigest ?? null };
      } catch {
        return { operationId: String(row.operation_id), state: String(row.state) };
      }
    });
  } catch (error) {
    return { error: String(error?.message ?? error).slice(0, 160) };
  }
}

/* ================================================================== *
 * §5 — THE PROPERTY SUITE
 * ================================================================== */

export async function effectReplaySuite() {
  const { createPalimpsestEffects, GitCliPort } = await loadRuntime();
  const root = mkdtempSync(join(tmpdir(), 'r3wr5-replay-'));
  try {
    const basis = makeBasis(root, 0);
    const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
    const ledger = join(root, 'ordarium.sqlite');
    const newRuntime = () => createPalimpsestEffects({ databasePath: ledger, git: new GitCliPort(basis.repo, worldsRoot), allowVolatileLedger: true });
    const properties = [];

    /** 1-6: authorized replay converges and loses nothing. */
    {
      const runtime = newRuntime();
      const callId = 'world:attempt-replay';
      const first = await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-replay', baseCommit: basis.basisCommit }, intent('r3wr5', callId));
      const worldPath = first.worldPath;
      /** A committed candidate AND a dirty edit AND an untracked file, so each preservation property has something to lose. */
      writeFileSync(join(worldPath, 'src', 'candidate.mjs'), `export const candidate = 1;${NL}`, 'utf8');
      git(worldPath, ['add', '-A']);
      git(worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'candidate']);
      const candidateHead = git(worldPath, ['rev-parse', 'HEAD']);
      writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 7;${NL}`, 'utf8');
      writeFileSync(join(worldPath, 'untracked.txt'), `untracked${NL}`, 'utf8');

      const canonicalBefore = canonicalState(basis.repo);
      const worldBefore = worldState(worldPath);
      const bindingBefore = JSON.parse(readFileSync(join(worldPath, '.git', 'palimpsest-world-binding.json'), 'utf8'));

      const second = await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-replay', baseCommit: basis.basisCommit }, intent('r3wr5', callId));
      const rows = await operationRows(ledger);
      const worlds = worldsOnDisk(worldsRoot);

      properties.push(Object.freeze({
        property: 'authorized replay converges and preserves everything',
        sameWorldPath: first.worldPath === second.worldPath,
        ONE_PHYSICAL_WORLD: worlds.filter((name) => name === 'attempt-replay').length === 1,
        CANDIDATE_HEAD_STABLE: git(worldPath, ['rev-parse', 'HEAD']) === candidateHead,
        CANDIDATE_PRESERVED: existsSync(join(worldPath, 'src', 'candidate.mjs')),
        DIRTY_EDIT_PRESERVED: git(worldPath, ['status', '--porcelain']).includes('src/ledger.mjs'),
        UNTRACKED_PRESERVED: existsSync(join(worldPath, 'untracked.txt')),
        BASIS_FROZEN: JSON.parse(readFileSync(join(worldPath, '.git', 'palimpsest-world-binding.json'), 'utf8')).basisCommit === bindingBefore.basisCommit,
        CANONICAL_UNCHANGED: canonicalState(basis.repo) === canonicalBefore,
        worldStateChangedByReuse: worldState(worldPath) !== worldBefore,
        operationCount: Array.isArray(rows) ? rows.length : null,
        operationCallIds: Array.isArray(rows) ? rows.map((row) => row.callId) : null,
        NO_DUPLICATE_OPERATION: Array.isArray(rows) && rows.length === 1,
      }));
      await runtime.close();
    }

    /** 7: a DIFFERENT Attempt cannot adopt the world. */
    {
      const runtime = newRuntime();
      const created = await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-owner', baseCommit: basis.basisCommit }, intent('r3wr5', 'world:attempt-owner'));
      writeFileSync(join(created.worldPath, 'src', 'owned.mjs'), `export const owned = 1;${NL}`, 'utf8');
      git(created.worldPath, ['add', '-A']);
      git(created.worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'owned work']);
      const ownerHead = git(created.worldPath, ['rev-parse', 'HEAD']);
      /** The world's record is rewritten to name the requester, which is the adoption shape. */
      writeFileSync(
        join(created.worldPath, '.git', 'palimpsest-world-binding.json'),
        `${JSON.stringify({ schemaVersion: 1, attemptId: 'attempt-intruder', basisCommit: basis.basisCommit, repository: basis.repo })}${NL}`,
        'utf8',
      );
      let intruder;
      try {
        await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-intruder', baseCommit: basis.basisCommit }, intent('r3wr5', 'world:attempt-intruder'));
        intruder = { returned: true };
      } catch (error) {
        intruder = { returned: false, error: String(error?.message ?? error).slice(0, 180) };
      }
      /** NOTE: a DIFFERENT world id names a DIFFERENT directory, so the intruder gets its OWN world. */
      properties.push(Object.freeze({
        property: 'a different Attempt gets its own world and cannot take another\'s',
        intruderOutcome: intruder,
        ownerWorldUnchanged: git(created.worldPath, ['rev-parse', 'HEAD']) === ownerHead,
        ownerWorkIntact: existsSync(join(created.worldPath, 'src', 'owned.mjs')),
        separateDirectories: worldsOnDisk(worldsRoot).length === 2,
        worldNames: worldsOnDisk(worldsRoot),
      }));
      await runtime.close();
    }

    /** 8: the SAME world id with a foreign owner in the record is refused. */
    {
      const runtime = newRuntime();
      const created = await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-same-id', baseCommit: basis.basisCommit }, intent('r3wr5', 'world:attempt-same-id'));
      writeFileSync(
        join(created.worldPath, '.git', 'palimpsest-world-binding.json'),
        `${JSON.stringify({ schemaVersion: 1, attemptId: 'attempt-other', basisCommit: basis.basisCommit, repository: basis.repo })}${NL}`,
        'utf8',
      );
      const before = worldState(created.worldPath);
      /**
       * A DISTINCT callId on purpose. With the SAME callId, Ordarium returns the MEMOIZED success and the port
       * is never reached at all — measured, and it is why a same-key replay cannot be used to probe the port's
       * own checks. The distinct key forces a real dispatch, which is the only way this witness can fail.
       */
      let refused;
      try {
        await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-same-id', baseCommit: basis.basisCommit }, intent('r3wr5', 'world:attempt-same-id-second'));
        refused = { refused: false };
      } catch (error) {
        refused = { refused: true, error: String(error?.message ?? error).slice(0, 160) };
      }
      properties.push(Object.freeze({
        property: 'the same world id with a foreign owner record is refused',
        outcome: refused,
        FOREIGN_OWNER_REFUSED: refused.refused === true,
        worldUnchanged: worldState(created.worldPath) === before,
        note: 'the distinct callId makes this a C3-shaped dispatch, which is the only shape that reaches the port',
      }));
      await runtime.close();
    }

    /** 9: the SAME callId does not even reach the port — the memoized-success property. */
    {
      const realPort = new GitCliPort(basis.repo, worldsRoot);
      const counting = countingPort(realPort);
      const runtime = createPalimpsestEffects({ databasePath: join(root, 'memo.sqlite'), git: counting.proxy, allowVolatileLedger: true });
      const callId = 'world:attempt-memo';
      await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-memo', baseCommit: basis.basisCommit }, intent('r3wr5', callId));
      const afterFirst = counting.counters.dispatch;
      await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-memo', baseCommit: basis.basisCommit }, intent('r3wr5', callId));
      const afterSecond = counting.counters.dispatch;
      properties.push(Object.freeze({
        property: 'a same-key replay is answered from the ledger and does NOT re-enter the port',
        dispatchesAfterFirstCall: afterFirst,
        dispatchesAfterSameKeyReplay: afterSecond,
        MEMOIZED_SUCCESS: afterSecond === afterFirst,
      }));
      await runtime.close();
    }

    return Object.freeze({
      kind: 'R3-WR5 Gate A §5 — effect replay',
      properties: Object.freeze(properties),
      AUTHORIZED_REPLAY_CONVERGES: properties[0]?.sameWorldPath === true && properties[0]?.ONE_PHYSICAL_WORLD === true,
      CANDIDATE_PROGRESS_PRESERVED: properties[0]?.CANDIDATE_HEAD_STABLE === true && properties[0]?.CANDIDATE_PRESERVED === true && properties[0]?.DIRTY_EDIT_PRESERVED === true && properties[0]?.UNTRACKED_PRESERVED === true,
      BASIS_FROZEN: properties[0]?.BASIS_FROZEN === true,
      CANONICAL_GIT_UNCHANGED: properties[0]?.CANONICAL_UNCHANGED === true,
      NO_DUPLICATE_OPERATION: properties[0]?.NO_DUPLICATE_OPERATION === true,
      FOREIGN_OWNER_REFUSED: properties[2]?.FOREIGN_OWNER_REFUSED === true,
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene */ }
  }
}

/* ================================================================== *
 * §5 — COUNTED CONCURRENCY
 * ================================================================== */

export async function concurrencySuite() {
  const { createPalimpsestEffects, GitCliPort } = await loadRuntime();
  const root = mkdtempSync(join(tmpdir(), 'r3wr5-conc-'));
  try {
    const basis = makeBasis(root, 0);
    const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
    const ledger = join(root, 'ordarium.sqlite');

    const run = async (label, blocked) => {
      const realPort = new GitCliPort(basis.repo, worldsRoot);
      const counting = countingPort(realPort);
      const runtime = createPalimpsestEffects({ databasePath: ledger, git: counting.proxy, allowVolatileLedger: true });
      const worldId = `attempt-conc-${label}`;
      const callId = `world:${worldId}`;
      if (blocked) counting.block();
      const calls = Array.from({ length: 6 }, () =>
        runtime.invoke(runtime.actions.worldCreate, { worldId, baseCommit: basis.basisCommit }, intent('r3wr5', callId)),
      );
      /**
       * THE BLOCKED ARM RELEASES ON A TIMER, never after awaiting the calls — releasing after the await would
       * deadlock, because the calls cannot settle until the gate opens. Holding for a fixed window makes the
       * OVERLAP WINDOW a property of the harness rather than of the machine's timing.
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
        ONE_WORLD_CREATED: worlds.length === 1,
        ONE_ACTIVE_DISPATCH: counting.counters.maxActive === 1,
        maxSimultaneousActiveDispatches: counting.counters.maxActive,
        portInvocations: counting.counters.invocations,
        portDispatches: counting.counters.dispatch,
        portSucceeded: counting.counters.succeeded,
        portThrew: counting.counters.threw,
        distinctOperationIdsInLedger: Array.isArray(rows) ? rows.length : null,
        ALL_SUCCESSES_AGREE_ON_PATH: distinctPaths.length <= 1,
      });
    };

    const unblocked = await run('unblocked', false);
    const blocked = await run('blocked', true);

    return Object.freeze({
      kind: 'R3-WR5 Gate A §5 — counted concurrency',
      unblocked,
      blocked,
      CONVERGENCE_MEASURED: unblocked.ONE_WORLD_CREATED === true && blocked.ONE_WORLD_CREATED === true,
      SINGLE_FLIGHT_WITHIN_PROCESS: blocked.ONE_ACTIVE_DISPATCH === true && blocked.portDispatches <= 1,
      /** The retained limitation, stated rather than silently omitted. */
      MULTI_PROCESS_CLAIMED: false,
      MULTI_PROCESS_NOTE: 'One runtime process over one durable ledger. The supported experimental profile serializes active workers (proven by R1-HC), and §5 explicitly retains this limitation rather than expanding the stage into distributed locking research.',
      withdrawnCriterion: Object.freeze({
        expression: 'fulfilled + rejected === attempted',
        tautologyForAllSettled: unblocked.fulfilled + unblocked.rejected === unblocked.attempted,
        note: 'true for ANY outcome; it is NOT used as evidence here',
      }),
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene */ }
  }
}

function main() {
  const run = async () => {
    const replay = await effectReplaySuite();
    process.stdout.write(`${NL}===== R3-WR5 GATE A §5 — EFFECT REPLAY =====${NL}${JSON.stringify(replay, null, 2)}${NL}`);
    const conc = await concurrencySuite();
    process.stdout.write(`${NL}===== R3-WR5 GATE A §5 — COUNTED CONCURRENCY =====${NL}${JSON.stringify(conc, null, 2)}${NL}`);
  };
  run().catch((error) => {
    process.stderr.write(`gate A §5 failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
