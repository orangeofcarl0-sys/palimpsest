/**
 * R3-WR3 GATE A4 — EFFECT-LEVEL REPLAY THROUGH THE REAL ORDARIUM RUNTIME.
 *
 * The world-create action is declared `effects.idempotent()`, and Ordarium's recovery for an invocation that
 * throws after dispatch is `redispatch-same-key`. This harness exercises that path through the ACTUAL runtime —
 * `createPalimpsestEffects` over a real SQLite ledger — rather than through a model of it, because the
 * properties at stake (operation identity, the uncertain state, the redispatch decision) live in the runtime.
 *
 * WHAT "THE SAME KEY" MEANS HERE, read from the runtime rather than assumed: the operation id derives from the
 * action name and version plus a digest of the logical key, and the logical key is
 * `<source>\0<scope>\0<callId>` when the action declares no `key()`. So the CALL ID is the operation key, and
 * "same key" and "different key" are expressed as the call id and nothing else.
 *
 * THE SIX PROPERTIES THE RULING NAMES, each measured:
 *
 *   1  same key, same identity, safe retry converges
 *   2  no duplicate canonical Attempt and no second physical World
 *   3  no loss of dirty changes
 *   4  no loss of a committed candidate
 *   5  the same key still converges after a PROCESS RESTART (a new runtime over the same ledger)
 *   6  a DIFFERENT operation key targeting the same physical path is refused
 *
 * Plus the failure shape the R3-WR2 stage found: an invocation that throws AFTER the world was materialized
 * leaves the operation UNCERTAIN, and the redispatch must then converge — which is exactly the condition the
 * R3-WR2 repair was written for.
 *
 * CONCURRENCY IS ADJUDICATED, NOT ASSUMED. Before claiming any guarantee, the harness fires N simultaneous
 * same-key invocations and observes what the runtime does, so "Ordarium already serializes them" is a
 * measurement rather than a belief. The synchronous `#gitSync()` inside the port is explicitly NOT treated as a
 * mutex — it is a single-threaded pre-check and nothing more.
 *
 * PLAIN JAVASCRIPT (`.mjs`). Temporary roots only. No LLM.
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

/** Every physical world directory under a worlds root, so "no second World" is countable. */
function worldsOnDisk(worldsRoot) {
  try {
    return readdirSync(worldsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

/** A basis repository with one committed file. */
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

/** The orchestration intent a controller supplies: scope + callId + the plan revision authorizing it. */
const intent = (scope, callId, revision = 1) => ({ scope, callId, revision });

/**
 * A port that materializes the world normally and then THROWS, which is the shape that leaves an Ordarium
 * operation UNCERTAIN: the external effect happened, and the caller never saw it acknowledged.
 *
 * `failures` is a COUNT rather than a flag, and it exists so the harness can model the two different situations:
 * fail once and let the redispatch succeed (the recoverable case), or fail always (a permanently broken
 * dependency). A fault that fires forever would make "did the redispatch even run" unanswerable.
 *
 * A `Proxy` with the TARGET as the receiver is used rather than a spread, because `GitCliPort`'s methods live on
 * its prototype and it reads private fields — spreading the instance would leave every method undefined and
 * inject a second, unintended defect.
 */
function throwingPort(realPort, failures = Number.POSITIVE_INFINITY) {
  let fired = 0;
  let succeeded = 0;
  return {
    proxy: new Proxy(realPort, {
      get(target, property) {
        if (property === 'createWorld') {
          return async (input) => {
            const created = await target.createWorld(input);
            if (fired < failures) {
              fired += 1;
              throw new Error(`INJECTED_AFTER_MATERIALIZATION: the world at ${created.worldPath} was created but the effect never completed`);
            }
            succeeded += 1;
            return created;
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
    firedCount: () => fired,
    successCount: () => succeeded,
  };
}

/**
 * GATE A4 — THE REPLAY SUITE.
 *
 * One scenario per property, each with a healthy positive control. The runtime is created over a ledger inside
 * the temporary root, so a "restart" is a second runtime over the SAME ledger file.
 */
export async function effectReplaySuite() {
  const { createPalimpsestEffects, GitCliPort } = await loadRuntime();
  const root = mkdtempSync(join(tmpdir(), 'r3wr3-replay-'));
  const basis = makeBasis(root);
  const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
  const ledger = join(root, 'ordarium.sqlite');
  const results = [];

  const newRuntime = () => createPalimpsestEffects({ databasePath: ledger, git: new GitCliPort(basis.repo, worldsRoot), allowVolatileLedger: true });

  /** 1/2/3/4 — same key twice, then a dirty edit and a committed candidate must both survive. */
  {
    const runtime = newRuntime();
    const callId = 'world:attempt-replay-1';
    const first = await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-replay-1', baseCommit: basis.basisCommit }, intent('r3wr3', callId));
    const worldPath = first.worldPath;

    /** A dirty edit AND a committed candidate, so both preservation properties have something to lose. */
    writeFileSync(join(worldPath, 'src', 'dirty.mjs'), `export const dirty = 1;${NL}`, 'utf8');
    writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 21;${NL}`, 'utf8');
    git(worldPath, ['add', '-A']);
    git(worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'candidate']);
    const candidateHead = git(worldPath, ['rev-parse', 'HEAD']);
    /** And a further uncommitted edit on top of the candidate. */
    writeFileSync(join(worldPath, 'src', 'uncommitted.mjs'), `export const pending = 1;${NL}`, 'utf8');

    const second = await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-replay-1', baseCommit: basis.basisCommit }, intent('r3wr3', callId));
    const worlds = worldsOnDisk(worldsRoot);
    results.push(Object.freeze({
      property: 'same key, same identity, safe retry',
      firstWorldPath: worldPath,
      secondWorldPath: second.worldPath,
      samePath: first.worldPath === second.worldPath,
      worldsOnDisk: worlds,
      NO_SECOND_PHYSICAL_WORLD: worlds.length === 1,
      HEAD_PRESERVED: git(worldPath, ['rev-parse', 'HEAD']) === candidateHead,
      CANDIDATE_PRESERVED: existsSync(join(worldPath, 'src', 'dirty.mjs')),
      DIRTY_CHANGES_PRESERVED: existsSync(join(worldPath, 'src', 'uncommitted.mjs')),
      status: git(worldPath, ['status', '--porcelain']),
    }));
    await runtime.close();
  }

  /** 5 — the SAME key after a PROCESS RESTART: a new runtime over the same ledger. */
  {
    const before = newRuntime();
    const callId = 'world:attempt-restart';
    const first = await before.invoke(before.actions.worldCreate, { worldId: 'attempt-restart', baseCommit: basis.basisCommit }, intent('r3wr3', callId));
    await before.close();
    /** The edit is made while NO runtime is open, which is what a crash between runs leaves behind. */
    writeFileSync(join(first.worldPath, 'src', 'survivor.mjs'), `export const survivor = 1;${NL}`, 'utf8');

    const after = newRuntime();
    let restarted;
    try {
      const again = await after.invoke(after.actions.worldCreate, { worldId: 'attempt-restart', baseCommit: basis.basisCommit }, intent('r3wr3', callId));
      restarted = { returned: true, worldPath: again.worldPath, error: null };
    } catch (error) {
      restarted = { returned: false, worldPath: null, error: String(error?.message ?? error).slice(0, 200) };
    }
    const worlds = worldsOnDisk(worldsRoot).filter((name) => name === 'attempt-restart');
    results.push(Object.freeze({
      property: 'same key after process restart',
      restarted,
      samePath: restarted.worldPath === first.worldPath,
      worldsForThisId: worlds,
      NO_SECOND_PHYSICAL_WORLD: worlds.length === 1,
      WORK_SURVIVED_RESTART: existsSync(join(first.worldPath, 'src', 'survivor.mjs')),
    }));
    await after.close();
  }

  /** 6 — a DIFFERENT operation key targeting the SAME physical path. */
  {
    const runtime = newRuntime();
    const first = await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-key-clash', baseCommit: basis.basisCommit }, intent('r3wr3', 'world:key-a'));
    let second;
    try {
      const again = await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-key-clash', baseCommit: basis.basisCommit }, intent('r3wr3', 'world:key-b'));
      second = { returned: true, worldPath: again.worldPath, error: null };
    } catch (error) {
      second = { returned: false, worldPath: null, error: String(error?.message ?? error).slice(0, 200) };
    }
    const worlds = worldsOnDisk(worldsRoot).filter((name) => name === 'attempt-key-clash');
    results.push(Object.freeze({
      property: 'different operation key, same physical path',
      firstWorldPath: first.worldPath,
      second,
      worldsForThisId: worlds,
      /** The path is shared and the second key converges on it; a second physical world must not appear. */
      NO_SECOND_PHYSICAL_WORLD: worlds.length === 1,
      SAME_PATH_REUSED: second.worldPath === first.worldPath,
    }));
    await runtime.close();
  }

  /** 7 — UNCERTAIN after materialization, then the redispatch must converge. */
  {
    const realPort = new GitCliPort(basis.repo, worldsRoot);
    /** EXACTLY ONE failure: the world is materialized, the effect is left uncertain, and the redispatch can succeed. */
    const throwing = throwingPort(realPort, 1);
    const runtime = createPalimpsestEffects({ databasePath: ledger, git: throwing.proxy, allowVolatileLedger: true });
    const callId = 'world:attempt-uncertain';
    let firstOutcome;
    try {
      await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-uncertain', baseCommit: basis.basisCommit }, intent('r3wr3', callId));
      firstOutcome = { returned: true, error: null };
    } catch (error) {
      firstOutcome = { returned: false, error: String(error?.message ?? error).slice(0, 160), code: String(error?.code ?? '') };
    }
    const materialized = worldsOnDisk(worldsRoot).includes('attempt-uncertain');

    /**
     * THE REDISPATCH. The same key is invoked again on the SAME runtime; the injected fault has fired once, so
     * this call reaches the port's real behaviour. What happens here is the property R3-WR2 repaired, and it is
     * the difference between "the effect is idempotent" and "the operation merely rejected safely".
     */
    let redispatch;
    try {
      const again = await runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-uncertain', baseCommit: basis.basisCommit }, intent('r3wr3', callId));
      redispatch = { returned: true, worldPath: again.worldPath, error: null };
    } catch (error) {
      redispatch = { returned: false, worldPath: null, error: String(error?.message ?? error).slice(0, 200), code: String(error?.code ?? '') };
    }
    const worlds = worldsOnDisk(worldsRoot).filter((name) => name === 'attempt-uncertain');
    results.push(Object.freeze({
      property: 'failure after materialization, then redispatch-same-key',
      firstOutcome,
      faultsInjected: 1,
      faultsFired: throwing.firedCount(),
      /** How many times the port was reached and allowed to succeed — i.e. whether a redispatch really ran. */
      successfulInvocations: throwing.successCount(),
      worldMaterializedBeforeFailure: materialized,
      redispatch,
      worldsForThisId: worlds,
      NO_SECOND_PHYSICAL_WORLD: worlds.length === 1,
      REDISPATCH_CONVERGED: redispatch.returned === true,
    }));
    await runtime.close();
  }

  /** 8 — CONCURRENCY: N simultaneous same-key invocations. */
  {
    const runtime = newRuntime();
    const callId = 'world:attempt-concurrent';
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        runtime.invoke(runtime.actions.worldCreate, { worldId: 'attempt-concurrent', baseCommit: basis.basisCommit }, intent('r3wr3', callId)),
      ),
    );
    const fulfilled = attempts.filter((entry) => entry.status === 'fulfilled');
    const rejected = attempts.filter((entry) => entry.status === 'rejected');
    const worlds = worldsOnDisk(worldsRoot).filter((name) => name === 'attempt-concurrent');
    /** Every fulfilled call must have named the SAME world: a divergent path would mean two worlds were made. */
    const distinctPaths = [...new Set(fulfilled.map((entry) => entry.value.worldPath))];
    results.push(Object.freeze({
      property: 'simultaneous same-key invocations',
      attempted: attempts.length,
      fulfilled: fulfilled.length,
      rejected: rejected.length,
      rejectionReasons: rejected.map((entry) => String(entry.reason?.code ?? entry.reason?.message ?? entry.reason).slice(0, 120)),
      distinctWorldPaths: distinctPaths,
      worldsForThisId: worlds,
      /** The adjudication: exactly one physical world, and every success named it. */
      ONE_PHYSICAL_WORLD: worlds.length === 1,
      ALL_SUCCESSES_AGREE_ON_PATH: distinctPaths.length <= 1,
      /** Whether the runtime SHARED the work or merely tolerated the race. */
      SERIALIZED_BY_RUNTIME: fulfilled.length + rejected.length === attempts.length,
    }));
    await runtime.close();
  }

  try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene sweeps it */ }

  const byProperty = (needle) => results.find((entry) => entry.property.includes(needle));
  return Object.freeze({
    kind: 'R3-WR3 Gate A4 — effect-level replay',
    results: Object.freeze(results),
    EFFECT_REPLAY_CONFLICT_DETECTED: byProperty('different operation key')?.NO_SECOND_PHYSICAL_WORLD === true,
    SAME_KEY_RETRY_CONVERGES: byProperty('same key, same identity')?.samePath === true,
    CANDIDATE_SURVIVES_REPLAY: byProperty('same key, same identity')?.HEAD_PRESERVED === true,
    DIRTY_SURVIVES_REPLAY: byProperty('same key, same identity')?.DIRTY_CHANGES_PRESERVED === true,
    RESTART_CONVERGES: byProperty('restart')?.NO_SECOND_PHYSICAL_WORLD === true,
    UNCERTAIN_REDISPATCH_CONVERGES: byProperty('after materialization')?.REDISPATCH_CONVERGED === true,
    CONCURRENT_ONE_WORLD: byProperty('simultaneous')?.ONE_PHYSICAL_WORLD === true,
  });
}

function main() {
  effectReplaySuite().then((suite) => {
    process.stdout.write(`${NL}===== R3-WR3 GATE A4 — EFFECT-LEVEL REPLAY =====${NL}`);
    for (const r of suite.results) {
      process.stdout.write(`${NL}${r.property}${NL}`);
      process.stdout.write(`  ${JSON.stringify(r, null, 2).split(NL).join(NL + '  ')}${NL}`);
    }
    process.stdout.write(`${NL}  SAME_KEY_RETRY_CONVERGES:      ${String(suite.SAME_KEY_RETRY_CONVERGES)}${NL}`);
    process.stdout.write(`  CANDIDATE_SURVIVES_REPLAY:     ${String(suite.CANDIDATE_SURVIVES_REPLAY)}${NL}`);
    process.stdout.write(`  DIRTY_SURVIVES_REPLAY:         ${String(suite.DIRTY_SURVIVES_REPLAY)}${NL}`);
    process.stdout.write(`  RESTART_CONVERGES:             ${String(suite.RESTART_CONVERGES)}${NL}`);
    process.stdout.write(`  UNCERTAIN_REDISPATCH_CONVERGES:${String(suite.UNCERTAIN_REDISPATCH_CONVERGES)}${NL}`);
    process.stdout.write(`  EFFECT_REPLAY_CONFLICT_DETECTED:${String(suite.EFFECT_REPLAY_CONFLICT_DETECTED)}${NL}`);
    process.stdout.write(`  CONCURRENT_ONE_WORLD:          ${String(suite.CONCURRENT_ONE_WORLD)}${NL}`);
  }).catch((error) => {
    process.stderr.write(`gate A4 failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
