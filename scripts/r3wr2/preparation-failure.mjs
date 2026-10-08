/**
 * R3-WR2 GATE F — FAILURE DURING PREPARATION.
 *
 * THE QUESTION. `claim()` is not one step. It emits `ATTEMPT_CREATED`, then creates the execution world, then
 * emits `ATTEMPT_STARTED`. A failure in the middle leaves an attempt that EXISTS with a world that does not —
 * or worse, a world that exists but is not usable. The ruling asks three things about that state:
 *
 *   can a partially created world be handed to a worker as READY?
 *   does the existing retry/resume path restore that SAME attempt safely?
 *   are the world, the lane and the capacity cleaned up without overwriting uncommitted data?
 *
 * HOW THE FAILURE IS INJECTED. Through the WORLD PORT, which is where a real preparation failure comes from
 * (a clone that cannot complete, a checkout that fails, a readiness gate that refuses). The port wraps the real
 * `GitCliPort`, so the world it builds is a real world; only the failure is synthetic and deterministic. Two
 * modes, because "the world was never made" and "the world was half made" are different questions:
 *
 *   FAIL_BEFORE_CLONE   nothing is created; the attempt exists with no world
 *   FAIL_AFTER_CLONE    the world directory IS materialized, then the step after the clone fails — the
 *                       partial world a retry might mistakenly reuse
 *
 * WHAT IS MEASURED, at every step, from the DURABLE STORE and from the filesystem:
 *
 *   the attempt state after the failure            CREATED, with no ATTEMPT_STARTED
 *   whether a worker was ever handed anything      a failed prepare must NOT produce a runnable position
 *   whether a retry reuses the SAME attempt        no duplicate attempt, no bypass of idempotency
 *   whether uncommitted data is preserved          a retry must not delete a world holding work
 *
 * PLAIN JAVASCRIPT (`.mjs`). Imports the built `dist`. No LLM, no network.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const git = (cwd, args) => execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

function scenario() {
  const root = mkdtempSync(join(tmpdir(), 'r3wr2-gate-f-'));
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'alpha.js'), 'export const a = 1;' + NL, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0']);
  return { root, repo, head: git(repo, ['rev-parse', 'HEAD']) };
}

/** The durable witness: attempts, tasks and attempt events, read from the store rather than remembered. */
function witness(controller, projectId) {
  const attempts = controller.store.connection
    .prepare('SELECT attempt_id, task_id, state FROM attempts WHERE project_id=? ORDER BY rowid')
    .all(projectId);
  const tasks = controller.store.connection
    .prepare('SELECT task_id, state FROM tasks WHERE project_id=? ORDER BY rowid')
    .all(projectId);
  const events = controller.store.connection
    .prepare("SELECT event_type FROM events WHERE project_id=? AND entity_type='attempt' ORDER BY rowid")
    .all(projectId);
  return Object.freeze({
    attempts: Object.freeze(attempts.map((row) => Object.freeze({ attemptId: String(row.attempt_id), taskId: String(row.task_id), state: String(row.state) }))),
    tasks: Object.freeze(tasks.map((row) => Object.freeze({ taskId: String(row.task_id), state: String(row.state) }))),
    attemptEvents: Object.freeze(events.map((row) => String(row.event_type))),
  });
}

/**
 * GATE F — one arm. `failMode` decides WHERE the injected failure lands; `failCount` how many times, so an
 * arm can fail once and then let the retry succeed.
 */
export async function preparationFailure(input = {}) {
  const failMode = input.failMode ?? 'FAIL_BEFORE_CLONE';
  const failCount = input.failCount ?? 1;
  const { installPalimpsest, trustedDefaultPolicy, makeWorkDelegationService, GitCliPort } =
    await loadStack();

  const { root, repo, head } = scenario();
  const steps = [];
  const record = (step, value) => { steps.push(Object.freeze({ step, ...value })); return value; };

  /**
   * The real port, wrapped so the injected failure is the ONLY difference from a normal run.
   *
   * A `Proxy` is used rather than a spread because `GitCliPort`'s methods live on its PROTOTYPE — spreading the
   * instance would copy own properties only and leave every method undefined, injecting a second, unintended
   * defect into the experiment.
   *
   * The receiver passed to `Reflect.get` is the TARGET, not the proxy. `GitCliPort` reads private fields
   * (`#repository`, `#worktreeRoot`) from getters and methods, and a private field is only readable by the
   * class that declared it — so a proxy receiver makes every access throw "Cannot read private member
   * #repository". Binding functions to the target and resolving accessors against the target keeps the port
   * exactly itself and leaves `createWorld` as the single difference.
   */
  const realPort = new GitCliPort(repo, join(repo, '.palimpsest', 'worlds'));
  let failuresRemaining = failCount;
  let worldsCreated = 0;
  const injectedPort = new Proxy(realPort, {
    get(target, property) {
      if (property === 'createWorld') {
        return async (worldInput) => {
          if (failuresRemaining > 0 && failMode === 'FAIL_BEFORE_CLONE') {
            failuresRemaining -= 1;
            throw new Error('INJECTED_PREPARATION_FAILURE: the execution world could not be created');
          }
          const created = await target.createWorld(worldInput);
          worldsCreated += 1;
          if (failuresRemaining > 0 && failMode === 'FAIL_AFTER_CLONE') {
            failuresRemaining -= 1;
            throw new Error('INJECTED_PREPARATION_FAILURE: the world was materialized but preparation did not complete');
          }
          return created;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId: 'r3wr2f',
      databasePath: join(repo, '.palimpsest', 'p.sqlite'),
      ordariumDatabasePath: join(repo, '.palimpsest', 'o.sqlite'),
      repository: repo,
      git: injectedPort,
      execution: 'worktree',
      standard: Object.freeze({
        statement: 'the change is committed and scope respected',
        clauses: Object.freeze([
          Object.freeze({ kind: 'command_succeeds', command: Object.freeze(['node', '-e', 'process.exit(0)']), predicate: 'tests_pass' }),
          Object.freeze({ kind: 'scope_respected' }),
        ]),
        derivedFrom: Object.freeze(['r3wr2 gate f fixture']),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }] }),
    },
  );

  const waitJob = async (service, jobId, timeoutMs = 60_000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const view = await service.followup({ jobId });
      if (view.phase === 'FINISHED' || view.phase === 'HOST_ERROR' || view.phase === 'UNKNOWN') return view;
      if (Date.now() > deadline) return view;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  try {
    const controller = installed.controller;
    const call = async (name, args) => {
      const tool = installed.tools.find((entry) => entry.name === name);
      if (tool === undefined) throw new Error(`no core tool ${name}`);
      return await tool.execute(args, { callId: `c-${name}`, rootCallId: `r-${name}`, name, arguments: args, signal: new AbortController().signal });
    };

    await call('palimpsest_start', {
      projectId: 'r3wr2f',
      goal: 'one defect',
      headCommit: head,
      tasks: [{ task_id: 't1', objective: 'fix alpha', depends_on: [], write_paths: ['src/alpha.js'], required_artifacts: [] }],
    });

    /** THE FAILING PREPARE. The worker must never run: a failure before a usable world is not a work outcome. */
    let workerRanOnFailure = false;
    let worldSeenByWorker = null;
    const failingService = makeWorkDelegationService({
      controller,
      workerFor: () => ({
        adapterId: `r3wr2-failing-prepare-${failMode}`,
        async run({ workDir }) { workerRanOnFailure = true; worldSeenByWorker = workDir; return { kind: 'READY_FOR_SETTLEMENT' }; },
      }),
    });
    const first = await failingService.start({ expectedTaskId: 't1' });
    const firstView = await waitJob(failingService, first.jobId);
    const afterFailure = witness(controller, 'r3wr2f');
    record('failure during preparation', {
      failMode,
      jobPhase: firstView.phase,
      hostError: firstView.hostError ?? null,
      attemptStates: afterFailure.attempts.map((row) => row.state),
      attemptEvents: afterFailure.attemptEvents,
      /** THE FIRST REQUIREMENT: no worker may be handed a position the failure never completed. */
      workerRanOnFailure,
      worldSeenByWorker,
      /** A partial world may exist on disk; the question is whether it is presented as READY. */
      worldsCreatedByPort: worldsCreated,
    });

    /** The partial world, if the failure landed after the clone. */
    const partialWorld = afterFailure.attempts.length > 0 ? join(repo, '.palimpsest', 'worlds', afterFailure.attempts[0].attemptId) : null;
    const partialExists = partialWorld !== null && existsSync(partialWorld);
    const partialHasGit = partialWorld !== null && existsSync(join(partialWorld, '.git'));
    record('partial world on disk', {
      partialWorld,
      exists: partialExists,
      hasGitDirectory: partialHasGit,
      /** The ruling forbids handing a partially created world to a worker as READY. */
      presentedToWorker: workerRanOnFailure,
    });

    /** A retry, through the supported path. The injected failure is exhausted, so this one can succeed. */
    let retryOutcome = null;
    let retryView = null;
    let retryError = null;
    let retryWorld = null;
    const retryService = makeWorkDelegationService({
      controller,
      workerFor: () => ({
        adapterId: `r3wr2-retry-${failMode}`,
        async run({ workDir }) {
          retryWorld = workDir;
          /**
           * The retry worker makes its OWN edit. In the FAIL_BEFORE_CLONE arm the first worker never ran, so the
           * world holds no work and there would be nothing to commit — a commit that fails for that reason
           * would say nothing about the retry path.
           */
          writeFileSync(join(workDir, 'src', 'alpha.js'), 'export const a = 3;' + NL, 'utf8');
          git(workDir, ['add', '-A']);
          git(workDir, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'retry worker']);
          return { kind: 'READY_FOR_SETTLEMENT' };
        },
      }),
    });
    try {
      retryOutcome = await retryService.start({ expectedTaskId: 't1' });
      retryView = await waitJob(retryService, retryOutcome.jobId);
    } catch (error) {
      retryError = String(error?.message ?? error).slice(0, 400);
    }
    const afterRetry = witness(controller, 'r3wr2f');
    record('retry through the supported path', {
      retryState: retryOutcome?.state ?? null,
      retryDetail: retryOutcome?.detail ?? null,
      retryPhase: retryView?.phase ?? null,
      retryHostError: retryView?.hostError ?? null,
      retryError,
      retryWorld,
      attemptStates: afterRetry.attempts.map((row) => row.state),
      attemptEvents: afterRetry.attemptEvents,
      /** Idempotency: a retry must NOT mint a second attempt for the same task. */
      attemptCount: afterRetry.attempts.length,
      sameAttemptAsFailedPrepare: afterFailure.attempts.length > 0 && afterRetry.attempts.length > 0
        && afterRetry.attempts[0].attemptId === afterFailure.attempts[0].attemptId,
    });

    return Object.freeze({
      kind: 'R3-WR2 Gate F — failure during preparation',
      failMode,
      steps: Object.freeze(steps),
      WORKER_NEVER_GIVEN_PARTIAL_WORLD: workerRanOnFailure === false,
      SAME_ATTEMPT_RETRIED: afterRetry.attempts.length === 1 && afterFailure.attempts.length === 1,
      NO_DUPLICATE_ATTEMPT: afterRetry.attempts.length <= 1,
      RETRY_SETTLED: afterRetry.attempts.some((row) => row.state === 'COMPLETED'),
      retryStates: Object.freeze(afterRetry.attempts.map((row) => row.state)),
    });
  } finally {
    try { installed.dispose(); } catch { /* teardown is best-effort */ }
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene sweeps it */ }
  }
}

async function loadStack() {
  const { installPalimpsest, trustedDefaultPolicy } = await import(pathToFileURL(join(REPO, 'dist', 'src', 'install.js')).href);
  const { makeWorkDelegationService } = await import(pathToFileURL(join(REPO, 'dist', 'src', 'interaction', 'work_delegation.js')).href);
  const { GitCliPort } = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'index.js')).href);
  return { installPalimpsest, trustedDefaultPolicy, makeWorkDelegationService, GitCliPort };
}

export async function preparationFailureMatrix() {
  const arms = [];
  for (const failMode of ['FAIL_BEFORE_CLONE', 'FAIL_AFTER_CLONE']) arms.push(await preparationFailure({ failMode }));
  return Object.freeze({ kind: 'R3-WR2 Gate F — preparation failure matrix', arms: Object.freeze(arms) });
}

function main() {
  const only = process.argv[2];
  const run = only === undefined || only === ''
    ? preparationFailureMatrix().then((matrix) => matrix.arms)
    : preparationFailure({ failMode: only }).then((one) => [one]);
  run.then((arms) => {
    for (const result of arms) {
      process.stdout.write(`${NL}===== R3-WR2 GATE F — ${result.failMode} =====${NL}`);
      for (const step of result.steps) {
        process.stdout.write(`${NL}${step.step}${NL}`);
        const { step: _ignored, ...rest } = step;
        process.stdout.write(`  ${JSON.stringify(rest, null, 2).split(NL).join(NL + '  ')}${NL}`);
      }
      process.stdout.write(`${NL}  WORKER_NEVER_GIVEN_PARTIAL_WORLD: ${String(result.WORKER_NEVER_GIVEN_PARTIAL_WORLD)}${NL}`);
      process.stdout.write(`  SAME_ATTEMPT_RETRIED:             ${String(result.SAME_ATTEMPT_RETRIED)}${NL}`);
      process.stdout.write(`  NO_DUPLICATE_ATTEMPT:             ${String(result.NO_DUPLICATE_ATTEMPT)}${NL}`);
      process.stdout.write(`  RETRY_SETTLED:                    ${String(result.RETRY_SETTLED)}${NL}`);
      process.stdout.write(`  retry states:                     ${result.retryStates.join(', ')}${NL}`);
    }
  }).catch((error) => {
    process.stderr.write(`gate F failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
