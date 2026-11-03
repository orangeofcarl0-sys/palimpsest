/**
 * R3-WR2 GATE E — FAILED-ATTEMPT CONTINUATION, DRIVEN THROUGH THE REAL CONTROLLER.
 *
 * THE QUESTION. A worker that dies without a Result leaves its attempt RUNNING. Does the SHIPPED runtime give
 * that attempt a legitimate continuation — resume the SAME attempt, keep the work it already did, and still
 * reach settlement, verification and quiescence — or is the attempt permanently stuck?
 *
 * WHY THIS IS A REAL RUN AND NOT A MODEL OF ONE. The answer depends on the actual `prepare()`/`settle()`
 * ladders, the actual admission rule, the actual scheduler and the actual durable store. A description of those
 * paths is not evidence about them, so this drives the shipped stack: `installPalimpsest` → a plan → a real
 * `makeWorkDelegationService` → scripted workers whose failures are deterministic. No LLM, no network.
 *
 * THREE ARMS, because "a failed worker" is not one case:
 *
 *   A  RETURNED_FAILURE      the worker returns HOST_FAILURE with its changes retained, then the SAME attempt
 *                            is resumed through `start()` and commits them
 *   B  TERMINATED_WORKER     the worker THROWS, so the host loses it entirely and no outcome is ever returned
 *   C  STORE_PERMANENTLY_GONE the borrowed object store is destroyed for good, so a resumed worker still
 *                            cannot commit — the case that asks whether an AUTHORIZED TERMINAL PATH exists
 *
 * Every step records what the DURABLE STORE says, because the store is the authority and a harness's own print
 * is not.
 *
 * PLAIN JAVASCRIPT (`.mjs`). It imports the built `dist` — the same code the runtime runs.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const git = (cwd, args) => execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

/** A minimal project with ONE task, so the lifecycle is reachable without a long plan. */
function scenario() {
  const root = mkdtempSync(join(tmpdir(), 'r3wr2-gate-e-'));
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'alpha.js'), 'export const a = 1;' + NL, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0']);
  return { root, repo, head: git(repo, ['rev-parse', 'HEAD']) };
}

/** The durable witness: what the store says about attempts, tasks and attempt events, read directly. */
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

async function loadStack() {
  const { installPalimpsest, trustedDefaultPolicy } = await import(pathToFileURL(join(REPO, 'dist', 'src', 'install.js')).href);
  const { makeWorkDelegationService } = await import(pathToFileURL(join(REPO, 'dist', 'src', 'interaction', 'work_delegation.js')).href);
  const { GitCliPort } = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'index.js')).href);
  return { installPalimpsest, trustedDefaultPolicy, makeWorkDelegationService, GitCliPort };
}

/**
 * GATE E — ONE ARM.
 *
 * `arm` selects the failure shape. The sequence is otherwise identical, so the arms are comparable: the ONLY
 * difference between A and B is whether the worker RETURNED an outcome, and between A and C is whether the
 * borrowed store came back.
 */
export async function failedAttemptContinuation(input = {}) {
  const arm = input.arm ?? 'RETURNED_FAILURE';
  const { installPalimpsest, trustedDefaultPolicy, makeWorkDelegationService, GitCliPort } = await loadStack();

  const { root, repo, head } = scenario();
  const steps = [];
  const record = (step, value) => { steps.push(Object.freeze({ step, ...value })); return value; };

  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId: 'r3wr2e',
      databasePath: join(repo, '.palimpsest', 'p.sqlite'),
      ordariumDatabasePath: join(repo, '.palimpsest', 'o.sqlite'),
      repository: repo,
      git: new GitCliPort(repo, join(repo, '.palimpsest', 'worlds')),
      execution: 'worktree',
      standard: Object.freeze({
        statement: 'the change is committed and scope respected',
        clauses: Object.freeze([
          Object.freeze({ kind: 'command_succeeds', command: Object.freeze(['node', '-e', 'process.exit(0)']), predicate: 'tests_pass' }),
          Object.freeze({ kind: 'scope_respected' }),
        ]),
        derivedFrom: Object.freeze(['r3wr2 gate e fixture']),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }] }),
    },
  );

  /**
   * `start` returns as soon as the job is LAUNCHED — the transport is deliberately asynchronous — so every
   * observation waits for a terminal host phase through the shipped `followup` read. Polling the real
   * observation API is what makes each step a fact about the runtime rather than about this script's timing.
   */
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
      projectId: 'r3wr2e',
      goal: 'one defect',
      headCommit: head,
      tasks: [{ task_id: 't1', objective: 'fix alpha', depends_on: [], write_paths: ['src/alpha.js'], required_artifacts: [] }],
    });

    /** STEP 1/2 — the failing worker. Its edit lands in the world and is NOT committed. */
    let firstWorld = null;
    const failingService = makeWorkDelegationService({
      controller,
      workerFor: () => ({
        adapterId: `r3wr2-failing-${arm}`,
        async run({ workDir }) {
          firstWorld = workDir;
          writeFileSync(join(workDir, 'src', 'alpha.js'), 'export const a = 2;' + NL, 'utf8');
          if (arm === 'TERMINATED_WORKER') throw new Error('the worker process terminated without returning an outcome');
          return { kind: 'HOST_FAILURE', detail: 'the worker could not commit: its borrowed object store was unreadable' };
        },
      }),
    });
    const first = await failingService.start({ expectedTaskId: 't1' });
    const firstView = await waitJob(failingService, first.jobId);
    const firstAttemptId = firstView.attemptId ?? null;
    record('1-2 worker failed, changes retained', {
      arm,
      attemptId: firstAttemptId,
      jobPhase: firstView.phase,
      hostError: firstView.hostError ?? null,
      settlement: firstView.settlement,
      worldExists: firstWorld !== null,
    });

    /** STEP 3 — the attempt is nonterminal and NO result was fabricated. */
    const afterFailure = witness(controller, 'r3wr2e');
    record('3 attempt nonterminal, no fabricated result', {
      attemptStates: afterFailure.attempts.map((row) => row.state),
      taskStates: afterFailure.tasks.map((row) => row.state),
      attemptEvents: afterFailure.attemptEvents,
      /** A terminal event here would be a fabricated outcome; its absence is the finding. */
      fabricatedTerminalEvent: afterFailure.attemptEvents.some((type) => type === 'ATTEMPT_FAILED' || type === 'ATTEMPT_COMPLETED'),
    });

    /** STEP 4 — the borrowed-object dependency, and whether the retained work survives. */
    const worldStatus = firstWorld === null ? null : git(firstWorld, ['status', '--porcelain']);
    const workRetained = String(worldStatus).includes('src/alpha.js');

    /**
     * ARM C: the store is destroyed FOR GOOD before the resume. The world's own objects directory is moved
     * aside and NOT restored, which is the permanently-unavailable case rather than the transient one.
     */
    let storeRemoved = false;
    if (arm === 'STORE_PERMANENTLY_GONE') {
      try { renameSync(join(repo, '.git', 'objects'), join(root, 'objects-gone-for-good')); storeRemoved = true; } catch { storeRemoved = false; }
    }
    record('4 borrowed dependency state at resume time', { worldStatus, workRetained, storeRemoved });

    /** STEP 5/6 — the SAME attempt resumed through the supported controller path. */
    let resumedWorld = null;
    const resumingService = makeWorkDelegationService({
      controller,
      workerFor: () => ({
        adapterId: `r3wr2-recovering-${arm}`,
        async run({ workDir }) {
          resumedWorld = workDir;
          git(workDir, ['add', '-A']);
          try {
            git(workDir, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'worker recovery']);
            return { kind: 'READY_FOR_SETTLEMENT' };
          } catch (error) {
            /** The world still cannot commit: the worker reports the failure honestly, again. */
            return { kind: 'HOST_FAILURE', detail: `the worker still cannot commit: ${String(error?.message ?? error).slice(0, 160)}` };
          }
        },
      }),
    });
    let resumeOutcome = null;
    let resumeView = null;
    let resumeError = null;
    try {
      resumeOutcome = await resumingService.start({ expectedTaskId: 't1' });
      resumeView = await waitJob(resumingService, resumeOutcome.jobId);
    } catch (error) {
      resumeError = String(error?.message ?? error).slice(0, 400);
    }
    record('5-6 same attempt resumed and committed', {
      resumeState: resumeOutcome?.state ?? null,
      resumeDetail: resumeOutcome?.detail ?? null,
      resumePhase: resumeView?.phase ?? null,
      resumeHostError: resumeView?.hostError ?? null,
      resumeError,
      resumedAttemptId: resumeView?.attemptId ?? null,
      sameAttempt: resumeView?.attemptId !== undefined && firstAttemptId !== null && resumeView.attemptId === firstAttemptId,
      sameWorld: resumedWorld !== null && resumedWorld === firstWorld,
      settlement: resumeView?.settlement ?? null,
    });

    const afterResume = witness(controller, 'r3wr2e');
    record('6b durable state after the resume', {
      attemptStates: afterResume.attempts.map((row) => row.state),
      taskStates: afterResume.tasks.map((row) => row.state),
      attemptEvents: afterResume.attemptEvents,
    });

    /** STEP 7/8/9 — verification, promotion, quiescence. */
    let preview = null;
    let promoteError = null;
    try {
      for (let index = 0; index < 12; index += 1) {
        if (controller.preview().decision !== 'next') break;
        controller.step();
      }
      preview = controller.preview();
    } catch (error) {
      promoteError = String(error?.message ?? error).slice(0, 400);
    }
    const finalWitness = witness(controller, 'r3wr2e');
    record('7-9 verification / promotion / quiescence', {
      preview,
      promoteError,
      finalAttemptStates: finalWitness.attempts.map((row) => row.state),
      finalTaskStates: finalWitness.tasks.map((row) => row.state),
    });

    /**
     * STEP 10 — THE AUTHORIZED TERMINAL PATH. The ruling asks whether one exists for an attempt that can never
     * settle. This enumerates the controller's own surfaces rather than assuming: if an abandon/terminal
     * operation were reachable it would appear here.
     */
    const terminalSurfaces = ['abandonAttempt', 'cancelAttempt', 'terminalizeAttempt', 'forceTerminal', 'expireAttempt', 'reclaimAttempt']
      .filter((name) => typeof controller[name] === 'function');
    const settlementPath = resumeView?.settlement?.state ?? null;
    const stillOpen = afterResume.attempts.some((row) => row.state === 'RUNNING');
    record('10 authorized terminal path for an unsettleable attempt', {
      controllerTerminalOperationsFound: terminalSurfaces,
      attemptStillRunningAfterResume: stillOpen,
      settlementState: settlementPath,
      /** Derived, not asserted: an open attempt with no terminal operation is the gap. */
      hasAuthorizedTerminalPath: terminalSurfaces.length > 0,
    });

    return Object.freeze({
      kind: 'R3-WR2 Gate E — failed-attempt continuation',
      arm,
      repo,
      firstAttemptId,
      steps: Object.freeze(steps),
      /** The verdicts are derived from the durable facts, not asserted. */
      SAME_ATTEMPT_RESUMED: resumeView?.attemptId !== undefined && firstAttemptId !== null && resumeView.attemptId === firstAttemptId,
      WORK_PRESERVED: workRetained,
      RESULT_SETTLED: afterResume.attempts.some((row) => row.state === 'COMPLETED'),
      ATTEMPT_LEFT_OPEN: afterResume.attempts.some((row) => row.state === 'RUNNING'),
      AUTHORIZED_TERMINAL_PATH: terminalSurfaces.length > 0,
      settledStates: Object.freeze(afterResume.attempts.map((row) => row.state)),
    });
  } finally {
    try { installed.dispose(); } catch { /* teardown is best-effort */ }
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene sweeps it */ }
  }
}

/** Run all three arms and report them side by side. */
export async function continuationMatrix() {
  const arms = [];
  for (const arm of ['RETURNED_FAILURE', 'TERMINATED_WORKER', 'STORE_PERMANENTLY_GONE']) {
    arms.push(await failedAttemptContinuation({ arm }));
  }
  return Object.freeze({ kind: 'R3-WR2 Gate E — continuation matrix', arms: Object.freeze(arms) });
}

function main() {
  const only = process.argv[2];
  const run = only === undefined || only === ''
    ? continuationMatrix().then((matrix) => matrix.arms)
    : failedAttemptContinuation({ arm: only }).then((one) => [one]);
  run.then((arms) => {
    for (const result of arms) {
      process.stdout.write(`${NL}===== R3-WR2 GATE E — ${result.arm} =====${NL}`);
      for (const step of result.steps) {
        process.stdout.write(`${NL}${step.step}${NL}`);
        const { step: _ignored, ...rest } = step;
        process.stdout.write(`  ${JSON.stringify(rest, null, 2).split(NL).join(NL + '  ')}${NL}`);
      }
      process.stdout.write(`${NL}  SAME_ATTEMPT_RESUMED:     ${String(result.SAME_ATTEMPT_RESUMED)}${NL}`);
      process.stdout.write(`  WORK_PRESERVED:           ${String(result.WORK_PRESERVED)}${NL}`);
      process.stdout.write(`  RESULT_SETTLED:           ${String(result.RESULT_SETTLED)}${NL}`);
      process.stdout.write(`  ATTEMPT_LEFT_OPEN:        ${String(result.ATTEMPT_LEFT_OPEN)}${NL}`);
      process.stdout.write(`  AUTHORIZED_TERMINAL_PATH: ${String(result.AUTHORIZED_TERMINAL_PATH)}${NL}`);
    }
  }).catch((error) => {
    process.stderr.write(`gate E failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
