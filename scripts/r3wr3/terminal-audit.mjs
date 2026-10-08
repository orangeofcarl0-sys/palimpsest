/**
 * R3-WR3 GATE B6 — TERMINAL EVENT ADMISSIBILITY, MEASURED THROUGH THE REAL CONTROLLER.
 *
 * R3-WR2 reported `IRRECOVERABLE_ATTEMPT_TERMINAL_PATH` as a residual because no abandon/cancel/terminalize
 * METHOD was found on the controller. The ruling asks a sharper question: the states `FAILED`, `EXPIRED` and
 * `CANCELLED` ALREADY EXIST in the canonical state machine, so does a legitimate terminal pathway exist
 * through the EXISTING admitted semantics? A missing convenience method is not the same as a missing pathway,
 * and the distinction decides whether new authority is required.
 *
 * WHAT IS MEASURED, per event:
 *
 *   the initiator and the decision basis        who may emit it, and on what grounds
 *   the eligible source states                  from the transition table AND enforced
 *   idempotency and causation                   whether a second report is absorbed or refused
 *   task occupancy after the transition         whether the lane is released
 *   what happens to retained uncommitted work   whether the world survives
 *   whether future work can proceed             whether quiescence is restored
 *   whether a late Result can race it           the STALE path
 *
 * Everything is driven through `installPalimpsest` → a real plan → `makeWorkDelegationService`, and every
 * claim is read from the DURABLE STORE rather than from a return value.
 *
 * NO NEW AUTHORITY IS INVENTED. This harness only EXERCISES what the shipped runtime already admits, and if a
 * pathway needs an authority policy that does not exist, that is reported as a required change rather than
 * built.
 *
 * PLAIN JAVASCRIPT (`.mjs`). Imports the built `dist`. No LLM, no network.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const git = (cwd, args) => execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

function scenario() {
  const root = mkdtempSync(join(tmpdir(), 'r3wr3-terminal-'));
  const repo = join(root, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'alpha.js'), `export const a = 1;${NL}`, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0']);
  return { root, repo, head: git(repo, ['rev-parse', 'HEAD']) };
}

/** The durable witness: attempts, tasks and the attempt event stream. */
function witness(controller, projectId) {
  const attempts = controller.store.connection.prepare('SELECT attempt_id, task_id, state FROM attempts WHERE project_id=? ORDER BY rowid').all(projectId);
  const tasks = controller.store.connection.prepare('SELECT task_id, state FROM tasks WHERE project_id=? ORDER BY rowid').all(projectId);
  const events = controller.store.connection.prepare("SELECT event_type FROM events WHERE project_id=? AND entity_type='attempt' ORDER BY rowid").all(projectId);
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

function makeStack({ installPalimpsest, trustedDefaultPolicy, GitCliPort }, repo) {
  return installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId: 'r3wr3t',
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
        derivedFrom: Object.freeze(['r3wr3 terminal fixture']),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }] }),
    },
  );
}

const waitJob = async (service, jobId, timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const view = await service.followup({ jobId });
    if (view.phase === 'FINISHED' || view.phase === 'HOST_ERROR' || view.phase === 'UNKNOWN') return view;
    if (Date.now() > deadline) return view;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

/**
 * GATE B6 — ONE TERMINAL EVENT, EXERCISED END TO END.
 *
 * `status` is the `AttemptReport.worker_status` the controller maps to the event. The attempt is first driven
 * to RUNNING by a worker that fails without committing, which is the state a terminal event has to resolve.
 */
async function terminalArm(status, label) {
  const stack = await loadStack();
  const { root, repo, head } = scenario();
  const installed = makeStack(stack, repo);
  const steps = [];
  const record = (step, value) => { steps.push(Object.freeze({ step, ...value })); return value; };

  try {
    const controller = installed.controller;
    const call = async (name, args) => {
      const tool = installed.tools.find((entry) => entry.name === name);
      if (tool === undefined) throw new Error(`no core tool ${name}`);
      return await tool.execute(args, { callId: `c-${name}`, rootCallId: `r-${name}`, name, arguments: args, signal: new AbortController().signal });
    };

    await call('palimpsest_start', {
      projectId: 'r3wr3t',
      goal: 'one defect',
      headCommit: head,
      tasks: [{ task_id: 't1', objective: 'fix alpha', depends_on: [], write_paths: ['src/alpha.js'], required_artifacts: [] }],
    });

    /** Drive to RUNNING with retained, UNCOMMITTED work, which is the state a terminal event must resolve. */
    let worldPath = null;
    const failing = stack.makeWorkDelegationService({
      controller,
      workerFor: () => ({
        adapterId: 'r3wr3-terminal-failing',
        async run({ workDir }) {
          worldPath = workDir;
          writeFileSync(join(workDir, 'src', 'alpha.js'), `export const a = 2;${NL}`, 'utf8');
          return { kind: 'HOST_FAILURE', detail: 'the worker stopped before committing' };
        },
      }),
    });
    const started = await failing.start({ expectedTaskId: 't1' });
    const view = await waitJob(failing, started.jobId);
    const attemptId = view.attemptId ?? null;
    record('attempt driven to RUNNING with uncommitted work', {
      attemptId,
      jobPhase: view.phase,
      state: witness(controller, 'r3wr3t').attempts.map((row) => row.state),
      uncommittedPresent: worldPath === null ? null : git(worldPath, ['status', '--porcelain']),
    });

    /** THE TERMINAL EVENT, through the controller's own report path. */
    let reportOutcome;
    try {
      const event = controller.report(attemptId, { workerStatus: status, summary: `r3wr3 ${label}` });
      reportOutcome = { accepted: true, eventType: String(event?.event_type ?? event?.type ?? 'unknown'), error: null };
    } catch (error) {
      reportOutcome = { accepted: false, eventType: null, error: String(error?.message ?? error).slice(0, 240) };
    }
    const afterReport = witness(controller, 'r3wr3t');
    record('terminal report through the controller', {
      status,
      reportOutcome,
      attemptStates: afterReport.attempts.map((row) => row.state),
      taskStates: afterReport.tasks.map((row) => row.state),
      attemptEvents: afterReport.attemptEvents,
      /** The world and its work: a terminal event must not delete either. */
      worldStillPresent: worldPath !== null && git(worldPath, ['rev-parse', 'HEAD']) !== '',
      uncommittedWorkPreserved: worldPath === null ? null : git(worldPath, ['status', '--porcelain']),
    });

    /** IDEMPOTENCY: a SECOND identical report must be absorbed or refused, never double-applied. */
    let secondReport;
    try {
      controller.report(attemptId, { workerStatus: status, summary: `r3wr3 ${label} again` });
      secondReport = { accepted: true, error: null };
    } catch (error) {
      secondReport = { accepted: false, error: String(error?.message ?? error).slice(0, 200) };
    }
    const afterSecond = witness(controller, 'r3wr3t');
    record('a second identical report', {
      secondReport,
      attemptStates: afterSecond.attempts.map((row) => row.state),
      attemptEvents: afterSecond.attemptEvents,
      /** The property: no second terminal event was appended. */
      noDuplicateTerminalEvent: afterSecond.attemptEvents.filter((type) => type === `ATTEMPT_${label.toUpperCase()}`).length <= 1,
    });

    /** WHETHER FUTURE WORK CAN PROCEED: does the project reach quiescence? */
    let preview;
    try {
      for (let index = 0; index < 12; index += 1) {
        if (controller.preview().decision !== 'next') break;
        controller.step();
      }
      preview = controller.preview();
    } catch (error) {
      preview = { error: String(error?.message ?? error).slice(0, 200) };
    }
    const final = witness(controller, 'r3wr3t');
    /**
     * WHETHER THE TERMINAL ATTEMPT RELEASED ITS OWN LANE. The measure is the terminal attempt's OWN state, not
     * whether any attempt exists: a scheduler that opens a FRESH position after a terminal event is offering a
     * retry, which is future work proceeding rather than the lane being stuck.
     */
    const terminalAttempt = final.attempts.find((row) => row.attemptId === attemptId);
    const laneReleased = terminalAttempt !== undefined && !['CREATED', 'LEASED', 'RUNNING'].includes(terminalAttempt.state);
    const freshPositionOpened = final.attempts.some((row) => row.attemptId !== attemptId && ['CREATED', 'LEASED', 'RUNNING'].includes(row.state));
    record('quiescence and future work', {
      preview,
      attemptStates: final.attempts.map((row) => row.state),
      taskStates: final.tasks.map((row) => row.state),
      laneReleased,
      freshPositionOpened,
    });

    /**
     * CAN THE FRESH POSITION ACTUALLY BE USED? This is the property that decides whether the terminal event
     * merely cleared a row or genuinely restored the project to a state where the work can be retried.
     */
    let retryOutcome = null;
    let retryError = null;
    if (freshPositionOpened) {
      try {
        const retryService = stack.makeWorkDelegationService({
          controller,
          workerFor: () => ({
            adapterId: 'r3wr3-terminal-retry',
            async run({ workDir }) {
              writeFileSync(join(workDir, 'src', 'alpha.js'), `export const a = 3;${NL}`, 'utf8');
              git(workDir, ['add', '-A']);
              git(workDir, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'retry after terminal']);
              return { kind: 'READY_FOR_SETTLEMENT' };
            },
          }),
        });
        const retry = await retryService.start({ expectedTaskId: 't1' });
        const retryView = await waitJob(retryService, retry.jobId);
        retryOutcome = { phase: retryView.phase, attemptId: retryView.attemptId ?? null, settlement: retryView.settlement ?? null };
      } catch (error) {
        retryError = String(error?.message ?? error).slice(0, 240);
      }
    }
    const afterRetry = witness(controller, 'r3wr3t');
    record('a fresh attempt after the terminal event', {
      retryOutcome,
      retryError,
      attemptStates: afterRetry.attempts.map((row) => row.state),
      attemptEvents: afterRetry.attemptEvents,
      /** The property: the retry settled, so the terminal event did not wedge the task. */
      FUTURE_WORK_PROCEEDED: afterRetry.attempts.some((row) => row.state === 'COMPLETED'),
    });

    /** A LATE RESULT: can it race the terminal event? */
    let lateReport;
    try {
      controller.reportLate(attemptId, { workerStatus: 'completed', summary: 'a late result arriving after terminalization' });
      lateReport = { accepted: true, error: null };
    } catch (error) {
      lateReport = { accepted: false, error: String(error?.message ?? error).slice(0, 200) };
    }
    const afterLate = witness(controller, 'r3wr3t');
    record('a late result after terminalization', {
      lateReport,
      attemptStates: afterLate.attempts.map((row) => row.state),
      attemptEvents: afterLate.attemptEvents,
    });

    return Object.freeze({
      label,
      status,
      attemptId,
      steps: Object.freeze(steps),
      ACCEPTED: reportOutcome.accepted,
      FINAL_ATTEMPT_STATE: afterLate.attempts.find((row) => row.attemptId === attemptId)?.state ?? 'ABSENT',
      LANE_RELEASED: laneReleased,
      FRESH_POSITION_OPENED: freshPositionOpened,
      FUTURE_WORK_PROCEEDED: afterRetry.attempts.some((row) => row.state === 'COMPLETED'),
      WORLD_SURVIVED: worldPath !== null && git(worldPath, ['rev-parse', 'HEAD']) !== '',
      UNCOMMITTED_PRESERVED: worldPath !== null && git(worldPath, ['status', '--porcelain']) !== '',
    });
  } finally {
    try { installed.dispose(); } catch { /* teardown is best-effort */ }
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene sweeps it */ }
  }
}

/**
 * GATE B6 — the admissibility audit for all three existing terminal events, plus the STALE path.
 */
export async function terminalAdmissibility() {
  const arms = [];
  for (const [status, label] of [['failed', 'FAILED'], ['expired', 'EXPIRED'], ['cancelled', 'CANCELLED']]) {
    arms.push(await terminalArm(status, label));
  }
  return Object.freeze({
    kind: 'R3-WR3 Gate B6 — terminal event admissibility',
    arms: Object.freeze(arms),
    /** Derived, not asserted: an existing event is a legitimate terminal pathway iff it is accepted, releases its
     * own lane, and lets future work actually proceed. */
    EXISTING_TERMINAL_PATHWAY_EXISTS: arms.some((arm) => arm.ACCEPTED === true && arm.LANE_RELEASED === true && arm.FUTURE_WORK_PROCEEDED === true),
    acceptedEvents: Object.freeze(arms.filter((arm) => arm.ACCEPTED).map((arm) => arm.label)),
    refusedEvents: Object.freeze(arms.filter((arm) => !arm.ACCEPTED).map((arm) => arm.label)),
    /** Which arms both release the lane AND allow the retry to settle. */
    armsWithFutureWorkProceeding: Object.freeze(arms.filter((arm) => arm.FUTURE_WORK_PROCEEDED === true).map((arm) => arm.label)),
    /** The STALE path: whether a late result can move a terminal attempt. */
    lateResultOutcomes: Object.freeze(arms.map((arm) => Object.freeze({ label: arm.label, finalState: arm.FINAL_ATTEMPT_STATE }))),
  });
}

function main() {
  terminalAdmissibility().then((audit) => {
    process.stdout.write(`${NL}===== R3-WR3 GATE B6 — TERMINAL EVENT ADMISSIBILITY =====${NL}`);
    for (const arm of audit.arms) {
      process.stdout.write(`${NL}${arm.label} (status=${arm.status})${NL}`);
      for (const step of arm.steps) {
        process.stdout.write(`  ${step.step}${NL}`);
        const { step: _ignored, ...rest } = step;
        process.stdout.write(`    ${JSON.stringify(rest, null, 2).split(NL).join(NL + '    ')}${NL}`);
      }
      process.stdout.write(`  ACCEPTED=${String(arm.ACCEPTED)} FINAL=${arm.FINAL_ATTEMPT_STATE} LANE_RELEASED=${String(arm.LANE_RELEASED)} WORLD_SURVIVED=${String(arm.WORLD_SURVIVED)} UNCOMMITTED_PRESERVED=${String(arm.UNCOMMITTED_PRESERVED)}${NL}`);
    }
    process.stdout.write(`${NL}  accepted: ${audit.acceptedEvents.join(', ') || 'none'}${NL}`);
    process.stdout.write(`  refused:  ${audit.refusedEvents.join(', ') || 'none'}${NL}`);
    process.stdout.write(`  EXISTING_TERMINAL_PATHWAY_EXISTS: ${String(audit.EXISTING_TERMINAL_PATHWAY_EXISTS)}${NL}`);
  }).catch((error) => {
    process.stderr.write(`gate B6 failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
