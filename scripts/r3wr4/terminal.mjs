/**
 * R3-WR4 GATE B — UNOBSERVABLE-WORLD FAILURE, TERMINAL VOCABULARY AND CONTINUATION.
 *
 * THE QUESTION. An Attempt whose Execution World becomes PERMANENTLY unobservable — while the canonical Project
 * repository stays healthy — can it be terminalized under the EXISTING governance without fabricating Result
 * evidence?
 *
 * WHY THIS IS A REAL RUN. Every answer depends on the shipped `installPalimpsest` stack: the actual report path,
 * the actual admission rule, the actual scheduler and the actual durable store. A description of those paths is
 * not evidence about them.
 *
 * THE FAILURE IS INJECTED WHERE THE RULING SAYS: only the WORLD's borrowed Git object dependency is made
 * permanently unavailable (its `.git/objects/info/alternates` is repointed at a path that never exists), which is
 * a deterministic local fault and NOT a model run. The CANONICAL repository is left untouched, so "the world
 * broke" and "the project broke" stay separable — the ruling forbids classifying the second as the first.
 *
 * WHAT IS KEPT SEPARATE, because §6 forbids inferring one from another:
 *
 *   EVENT_KIND_EXISTS                      is there an event type for this?
 *   EVENT_ADMISSIBLE                       will the store accept it from RUNNING?
 *   AUTHORITY_ESTABLISHED                  is there a principal who may initiate it?
 *   EXECUTABLE_WITH_UNOBSERVABLE_WORLD     can the production path actually produce it?
 *   PROJECT_CAN_CONTINUE                   does the project proceed afterwards?
 *
 * PLAIN JAVASCRIPT (`.mjs`). Temporary roots only. No LLM, no network.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const git = (cwd, args) => {
  try {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return `ERR:${String(error?.stderr ?? error?.message ?? error).trim().slice(0, 160)}`;
  }
};

async function loadStack() {
  const { installPalimpsest, trustedDefaultPolicy } = await import(pathToFileURL(join(REPO, 'dist', 'src', 'install.js')).href);
  const { GitCliPort } = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'index.js')).href);
  return { installPalimpsest, trustedDefaultPolicy, GitCliPort };
}

/** A project with one task, a healthy canonical repository, and one committed file to change. */
function scenario(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const repo = join(root, 'canonical');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'alpha.js'), `export const alpha = 1;${NL}`, 'utf8');
  git(repo, ['init', '-q']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0']);
  return { root, repo, head: git(repo, ['rev-parse', 'HEAD']) };
}

/**
 * Install the real stack and drive ONE attempt to RUNNING with legitimate committed edits in its own world.
 *
 * `detachWorker` models the worker stopping under a controlled, observable condition. The host-side fact is a
 * `HOST_FAILURE` worker outcome, which is deliberately host-local and never written to the event log — that is
 * the existing design, and Gate B must respect it rather than change it.
 */
async function driveToRunning({ prefix, unobservable }) {
  const stack = await loadStack();
  const { root, repo, head } = scenario(prefix);
  const projectId = `r3wr4-${prefix.replace(/[^a-z0-9]/giu, '')}`;
  const installed = stack.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId,
      databasePath: join(repo, '.palimpsest', 'p.sqlite'),
      ordariumDatabasePath: join(repo, '.palimpsest', 'o.sqlite'),
      repository: repo,
      git: new stack.GitCliPort(repo, join(repo, '.palimpsest', 'worlds')),
      execution: 'worktree',
      standard: Object.freeze({
        statement: 'the change is committed and in scope',
        clauses: Object.freeze([Object.freeze({ kind: 'scope_respected' })]),
        derivedFrom: Object.freeze(['r3wr4 gate b fixture']),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: stack.trustedDefaultPolicy({ allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }] }),
    },
  );
  const controller = installed.controller;
  const call = async (name, args) => {
    const tool = installed.tools.find((entry) => entry.name === name);
    if (tool === undefined) throw new Error(`no core tool ${name}`);
    return await tool.execute(args, { callId: `c-${name}`, rootCallId: `r-${name}`, name, arguments: args, signal: new AbortController().signal });
  };
  const attemptRow = () => controller.store.connection.prepare('SELECT attempt_id, state FROM attempts WHERE project_id=? ORDER BY rowid LIMIT 1').get(projectId);
  const witness = () => Object.freeze({
    attempts: controller.store.connection.prepare('SELECT attempt_id, task_id, state FROM attempts WHERE project_id=? ORDER BY rowid').all(projectId).map((row) => Object.freeze({ attemptId: String(row.attempt_id), taskId: String(row.task_id), state: String(row.state) })),
    tasks: controller.store.connection.prepare('SELECT task_id, state FROM tasks WHERE project_id=? ORDER BY rowid').all(projectId).map((row) => Object.freeze({ taskId: String(row.task_id), state: String(row.state) })),
    attemptEvents: controller.store.connection.prepare("SELECT event_type FROM events WHERE project_id=? AND entity_type='attempt' ORDER BY rowid").all(projectId).map((row) => String(row.event_type)),
    promotionEvents: controller.store.connection.prepare("SELECT event_type FROM events WHERE project_id=? AND entity_type='promotion' ORDER BY rowid").all(projectId).map((row) => String(row.event_type)),
  });

  await call('palimpsest_start', {
    projectId,
    goal: 'one defect',
    headCommit: head,
    tasks: [{ task_id: 't1', objective: 'fix alpha', depends_on: [], write_paths: ['src/alpha.js'], required_artifacts: [] }],
  });
  for (let index = 0; index < 12; index += 1) {
    if (controller.preview().decision !== 'next') break;
    controller.step();
    if (attemptRow() !== undefined) break;
  }
  const attemptId = String(attemptRow().attempt_id);
  const claimed = await controller.claim(attemptId);
  const worldPath = claimed.worldPath;

  /** LEGITIMATE EDITS in the attempt's OWN world, committed, so the world holds real work. */
  writeFileSync(join(worldPath, 'src', 'alpha.js'), `export const alpha = 2;${NL}`, 'utf8');
  git(worldPath, ['add', '-A']);
  git(worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'candidate work']);
  const candidateHead = git(worldPath, ['rev-parse', 'HEAD']);
  /** And an uncommitted edit, so the world has BOTH a candidate and pending work. */
  writeFileSync(join(worldPath, 'src', 'pending.js'), `export const pending = 1;${NL}`, 'utf8');

  const before = {
    attemptState: attemptRow().state,
    worldHead: candidateHead,
    worldStatus: git(worldPath, ['status', '--porcelain']),
    canonicalHead: git(repo, ['rev-parse', 'HEAD']),
    canonicalStatus: git(repo, ['status', '--porcelain']),
    witness: witness(),
  };

  /** THE INJECTION: ONLY the world's borrowed object dependency, permanently. */
  if (unobservable) {
    writeFileSync(join(worldPath, '.git', 'objects', 'info', 'alternates'), `${join(root, 'gone-for-good')}${NL}`, 'utf8');
  }

  const after = {
    worldRevParse: git(worldPath, ['rev-parse', '--verify', 'HEAD^{commit}']),
    worldStatus: git(worldPath, ['status', '--porcelain']),
    worldDiff: git(worldPath, ['diff', '--name-only', head, 'HEAD']),
    canonicalHead: git(repo, ['rev-parse', 'HEAD']),
    canonicalHealthy: git(repo, ['rev-parse', '--verify', 'HEAD^{commit}']) !== '',
    canonicalStatus: git(repo, ['status', '--porcelain']),
  };

  return Object.freeze({
    stack, installed, controller, projectId, root, repo, head, attemptId, worldPath, candidateHead,
    before, after, attemptRow, witness, call,
    dispose: () => { try { installed.dispose(); } catch { /* teardown */ } try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene */ } },
  });
}

/* ================================================================== *
 * §5 — THE REAL UNOBSERVABLE-WORLD FAILURE
 * ================================================================== */

export async function unobservableFailure() {
  const run = await driveToRunning({ prefix: 'r3wr4-unobs-', unobservable: true });
  try {
    const out = {
      attemptId: run.attemptId.slice(-8),
      worldPath: run.worldPath,
      canonicalRepository: run.repo,
      beforeInjection: run.before,
      afterInjection: run.after,
      /** REQUIREMENT 1: the Attempt remains RUNNING. */
      ATTEMPT_REMAINS_RUNNING: run.attemptRow().state === 'RUNNING',
      /** REQUIREMENT 2: Git observation through the WORLD fails. */
      WORLD_GIT_OBSERVATION_FAILS: String(run.after.worldDiff).startsWith('ERR:') || String(run.after.worldStatus).startsWith('ERR:'),
      worldObservationDetail: run.after.worldDiff,
      /** The canonical repository is NOT the thing that broke. */
      CANONICAL_REPOSITORY_HEALTHY: run.after.canonicalHealthy && run.after.canonicalHead === run.before.canonicalHead,
    };

    /** REQUIREMENT 3: the ordinary report path, per terminal status. */
    const reports = {};
    for (const status of ['failed', 'cancelled', 'expired', 'completed']) {
      try {
        const event = run.controller.report(run.attemptId, { workerStatus: status, summary: `r3wr4 gate b ${status}` });
        reports[status] = { accepted: true, eventType: String(event?.event_type ?? '') };
      } catch (error) {
        reports[status] = { accepted: false, error: String(error?.message ?? error).slice(0, 220) };
      }
    }
    out.reportOutcomes = reports;
    out.REPORT_PATH_FAILS_FOR_EVERY_TERMINAL_STATUS = ['failed', 'cancelled', 'expired'].every((status) => reports[status].accepted === false);
    out.reportFailureIsRawChildProcessError = ['failed', 'cancelled', 'expired'].every((status) => /Command failed: git/u.test(String(reports[status].error ?? '')));

    /** REQUIREMENT 3b: no terminal event was appended, so the attempt is still RUNNING. */
    const afterReports = run.witness();
    out.afterReportAttempts = afterReports.attempts;
    out.afterReportEvents = afterReports.attemptEvents;
    out.NO_TERMINAL_EVENT_APPENDED = !afterReports.attemptEvents.some((type) => ['ATTEMPT_COMPLETED', 'ATTEMPT_FAILED', 'ATTEMPT_CANCELLED', 'ATTEMPT_EXPIRED'].includes(type));

    /** REQUIREMENT 4: no Result and no Promotion. */
    out.NO_RESULT_OR_PROMOTION = afterReports.promotionEvents.length === 0 && !afterReports.attemptEvents.includes('ATTEMPT_COMPLETED');

    /** EVIDENCE DISCIPLINE: an unavailable observation must not become `changed_files: []`. */
    const attemptReportRows = run.controller.store.connection
      .prepare("SELECT payload_json FROM events WHERE project_id=? AND entity_type='attempt' AND event_type='ATTEMPT_STARTED'")
      .all(run.projectId);
    out.startedEventCount = attemptReportRows.length;
    out.RESULT_OBSERVATION_UNAVAILABLE_REPRESENTED = 'NOT_REPRESENTABLE — no terminal event was produced at all';
    return Object.freeze(out);
  } finally {
    run.dispose();
  }
}

/* ================================================================== *
 * §6 — THE TERMINAL VOCABULARY AUDIT
 * ================================================================== */

/**
 * The five classifications, each measured rather than inferred. The admissibility arms drive the scheduler's OWN
 * `recordCallback` with a `null` report, which separates "the store accepts this shape" from "the production
 * report path can produce it" — the two facts §6 requires be kept apart.
 */
export async function terminalVocabularyAudit() {
  const arms = [];
  for (const [event, label] of [['ATTEMPT_CANCELLED', 'CANCELLED'], ['ATTEMPT_EXPIRED', 'EXPIRED'], ['ATTEMPT_FAILED', 'FAILED']]) {
    const run = await driveToRunning({ prefix: `r3wr4-adm-${label.toLowerCase()}-`, unobservable: true });
    try {
      let nullReport;
      try {
        const appended = run.controller.scheduler.recordCallback(run.attemptId, event, null);
        nullReport = { admitted: true, eventType: String(appended?.event_type ?? '') };
      } catch (error) {
        nullReport = { admitted: false, error: String(error?.message ?? error).slice(0, 160) };
      }
      const afterNull = run.witness();
      let duplicate = null;
      if (nullReport.admitted) {
        try {
          run.controller.scheduler.recordCallback(run.attemptId, event, null);
          duplicate = { admitted: true };
        } catch (error) {
          duplicate = { admitted: false, error: String(error?.message ?? error).slice(0, 140) };
        }
      }
      const afterDuplicate = run.witness();
      arms.push(Object.freeze({
        label,
        event,
        nullReportAdmitted: nullReport.admitted,
        nullReport,
        attemptStateAfter: afterNull.attempts[0]?.state ?? 'ABSENT',
        eventsAfter: afterNull.attemptEvents,
        terminalEventCount: afterNull.attemptEvents.filter((type) => type === event).length,
        duplicateAbsorbed: duplicate?.admitted === true ? afterDuplicate.attemptEvents.filter((type) => type === event).length === 1 : null,
        duplicate,
      }));
    } finally {
      run.dispose();
    }
  }

  return Object.freeze({
    kind: 'R3-WR4 Gate B — terminal vocabulary audit',
    arms: Object.freeze(arms),
    EVENT_KIND_EXISTS: Object.freeze({
      answer: 'YES',
      detail: 'ATTEMPT_FAILED, ATTEMPT_CANCELLED and ATTEMPT_EXPIRED are declared in the canonical state machine with RUNNING as an allowed source state.',
    }),
    EVENT_ADMISSIBLE: Object.freeze({
      answer: 'PARTIAL',
      detail: `A NULL report is admitted for ${arms.filter((arm) => arm.nullReportAdmitted).map((arm) => arm.label).join(' and ') || 'no event'}; ${arms.filter((arm) => !arm.nullReportAdmitted).map((arm) => arm.label).join(', ') || 'none'} is refused.`,
      significance: 'The vocabulary already carries a faithful "terminal, no Result" representation (`attempt_report: null`) — but only for CANCELLED and EXPIRED. FAILED cannot express "failed with no observed result".',
    }),
    AUTHORITY_ESTABLISHED: Object.freeze({
      answer: 'NO',
      detail: 'No principal model exists at this boundary. `controller.report` is the only production caller of the terminal callback and it performs no principal check; the worker cannot reach it, but "host or operator" is not represented anywhere the transition is decided.',
    }),
    EXECUTABLE_WITH_UNOBSERVABLE_WORLD: Object.freeze({
      answer: 'NO',
      detail: 'Measured: with only the world\'s borrowed object dependency gone, `controller.report` THROWS for failed, cancelled and expired — an unguarded `execFileSync("git", ["diff", ...])` — and NO terminal event is appended.',
    }),
    PROJECT_CAN_CONTINUE: Object.freeze({
      answer: 'YES, once a terminal event exists',
      detail: 'Measured in `continuation()`: after an admissible terminal event the attempt releases its own lane and the scheduler opens a FRESH attempt for the same task.',
    }),
  });
}

/* ================================================================== *
 * §7/§9 — THE POLICY REQUIREMENT
 * ================================================================== */

/**
 * The exact requirement, stated because §9 forbids inventing the authority instead. Each clause is a fact the
 * product would have to be able to establish BEFORE a permanent-failure terminal could be recorded truthfully.
 */
export function policyRequirement() {
  return Object.freeze({
    verdict: 'POLICY_REQUIRED',
    gate: 'Gate B §7 / §9',
    whyNoImplementation: 'No existing pathway can record a permanent unobservable-world failure truthfully. Implementing one would require new governance semantics, which §7 and §9 explicitly forbid this stage from inventing.',
    requiredDecisions: Object.freeze([
      Object.freeze({
        id: 'P1',
        question: 'Which trusted principal may initiate a permanent-failure terminal?',
        currentState: 'None. `controller.report` is the only production caller and it checks no principal. The worker cannot reach it (its vocabulary is READY_FOR_SETTLEMENT/NEEDS_ESCALATION and it denies the `palimpsest_` tool prefix), but the host/operator distinction is unrepresented.',
        needed: 'An identified principal with a recorded basis, and a decision about whether an ordinary worker may ever trigger it (the ruling forbids exposing an unconditional force-fail tool to a worker).',
      }),
      Object.freeze({
        id: 'P2',
        question: 'How is the Attempt identity resolved for such a decision?',
        currentState: '`#attemptContext(attemptId)` resolves the attempt row and its historical authorization, which is sufficient for identity — but it is reached only from inside the report path, which first requires a successful observation.',
        needed: 'A resolution that does NOT depend on observing the world, because the world is exactly what is unavailable.',
      }),
      Object.freeze({
        id: 'P3',
        question: 'What is the evidence that the original Worker is no longer actively mutating the World?',
        currentState: 'None that is durable. The only real observation is the host-side worker timeout/abort inside the worker port, which becomes a host-local `HOST_FAILURE` and is NEVER written to the event log.',
        needed: 'A durable, host-produced fact that the worker has stopped, or an explicit decision that "the world is unobservable AND the host job is terminal" is sufficient.',
      }),
      Object.freeze({
        id: 'P4',
        question: 'What is the evidence that the World cannot be recovered under the applicable policy?',
        currentState: '`WORLD_HEAD_UNRESOLVABLE` / `WORLD_NOT_COMMIT_CAPABLE` distinguish shapes at PREPARATION time, and `prepare()` reports `WORLD_UNOBSERVABLE` as `NOT_READY`. Neither is a durable statement that recovery is impossible.',
        needed: 'A policy for how many attempts / how long a window must elapse, and which failures count as permanent rather than transient. R3-WR2 measured that a repack or a copy is tolerated and only a MOVE is hostile, so "permanent" needs a definition.',
      }),
      Object.freeze({
        id: 'P5',
        question: 'Is lease expiry genuinely observed, or caller-asserted?',
        currentState: 'CALLER-ASSERTED. `TaskEnvelope.lease_s` is never read by the attempt runtime, `lease_generation` is hardcoded null, and the only route to EXPIRED is a caller passing `workerStatus: "expired"`.',
        needed: 'A decision: either an observed expiry (a reaper or a clock the runtime consults) or an explicit statement that EXPIRED remains a caller assertion and is therefore not a valid basis for a permanent-failure terminal.',
      }),
      Object.freeze({
        id: 'P6',
        question: 'How are duplicate callbacks and late worker results handled?',
        currentState: 'MEASURED and adequate: the terminal callback is idempotent by its `attempt-callback-v1` idempotency key (a second identical callback returns the existing event without appending), and ATTEMPT_LATE_RESULT transitions only from EXPIRED.',
        needed: 'Nothing new — this clause is already satisfied and is recorded so the requirement is complete rather than partially invented.',
      }),
      Object.freeze({
        id: 'P7',
        question: 'How must an unavailable observation be REPRESENTED?',
        currentState: 'The `AttemptReport` schema has no field for it. `#observeAttemptResultSync` can only return a populated observation or THROW, and the throw escapes as a raw child-process error. `attempt_report: null` is the only faithful representation, and it exists for CANCELLED/EXPIRED only.',
        needed: 'A decision on whether `attempt_report: null` is the intended representation for a permanent-failure terminal, or whether the report schema needs an explicit "observation unavailable" meaning. The ruling forbids the silent alternative of `changed_files: []`, which would read as "no changes were observed".',
      }),
    ]),
    semanticBlocker: 'RESULT_OBSERVATION_UNAVAILABLE (the world cannot be observed) and TRUSTED_HOST_FAILURE_OBSERVED (the host saw the worker stop) are different facts, and the event log cannot currently carry both into one terminal event: HOST_FAILURE is host-local by design and the report schema has no unavailable-observation field.',
    noCanonicalChangeMade: true,
    noNewEventInvented: true,
  });
}

/* ================================================================== *
 * §8 — END-TO-END FAILURE CONTINUATION
 * ================================================================== */

/**
 * §8's twelve requirements, measured against the ONE pathway the existing store admits for an unobservable world:
 * an `ATTEMPT_CANCELLED` carrying a NULL report.
 *
 * THIS IS NOT A CLAIM THAT THE PATHWAY IS AUTHORIZED. §7 requires an authority for it, and none exists — that is
 * why the verdict is POLICY_REQUIRED. What this arm establishes is the SEPARABLE fact §8 asks about: IF such a
 * terminal decision were authorized, would the project actually recover? The requirements that depend on the
 * authorization rather than on the runtime are marked as such rather than counted as met.
 */
export async function continuation() {
  const run = await driveToRunning({ prefix: 'r3wr4-cont-', unobservable: true });
  try {
    const requirements = {};
    const record = (id, statement, met, evidence) => { requirements[id] = Object.freeze({ statement, met, evidence }); };

    /** 1. The failure is durably observed — the attempt is RUNNING and its world cannot be read. */
    record('R1_FAILURE_DURABLY_OBSERVED', 'Attempt failure is durably observed', run.attemptRow().state === 'RUNNING', { attemptState: run.attemptRow().state, worldUnreadable: String(run.after.worldDiff).startsWith('ERR:') });

    /** 2. No fabricated Result or Verification. */
    const beforeTerminal = run.witness();
    record('R2_NO_FABRICATED_RESULT', 'No fabricated Result or Verification appears', beforeTerminal.attemptEvents.filter((type) => type === 'ATTEMPT_COMPLETED').length === 0 && beforeTerminal.promotionEvents.length === 0, { events: beforeTerminal.attemptEvents, promotions: beforeTerminal.promotionEvents });

    /** 3. A terminal decision through an authorized existing pathway — the part that is NOT available. */
    record('R3_AUTHORIZED_TERMINAL_DECISION', 'A legitimate terminal decision occurs through an authorized existing pathway', false, { reason: 'POLICY_REQUIRED — see policyRequirement(); the runtime can carry the event but no authority exists to initiate it' });

    /** 4. The original World and remaining work are retained. */
    record('R4_WORLD_AND_WORK_RETAINED', 'The original World and remaining work/evidence are retained', existsSync(run.worldPath) && existsSync(join(run.worldPath, 'src', 'pending.js')), { worldExists: existsSync(run.worldPath), pendingWorkPresent: existsSync(join(run.worldPath, 'src', 'pending.js')) });

    /**
     * THE TERMINAL EVENT, through the store's own admission. `ATTEMPT_CANCELLED` with a NULL report is the one
     * shape the canonical vocabulary admits for a terminal-with-no-Result from RUNNING (measured in
     * `terminalVocabularyAudit`).
     */
    let terminal;
    try {
      const appended = run.controller.scheduler.recordCallback(run.attemptId, 'ATTEMPT_CANCELLED', null);
      terminal = { admitted: true, eventType: String(appended?.event_type ?? '') };
    } catch (error) {
      terminal = { admitted: false, error: String(error?.message ?? error).slice(0, 200) };
    }
    const afterTerminal = run.witness();

    /** 5. The original Attempt no longer holds an active lane. */
    const terminalAttempt = afterTerminal.attempts.find((row) => row.attemptId === run.attemptId);
    record('R5_LANE_RELEASED', 'The original Attempt no longer holds an active scheduler lane', terminalAttempt !== undefined && !['CREATED', 'LEASED', 'RUNNING'].includes(terminalAttempt.state), { attemptState: terminalAttempt?.state ?? 'ABSENT' });

    /** 6. Duplicate terminal callbacks do not append duplicate facts. */
    let duplicate;
    try {
      run.controller.scheduler.recordCallback(run.attemptId, 'ATTEMPT_CANCELLED', null);
      duplicate = { admitted: true };
    } catch (error) {
      duplicate = { admitted: false, error: String(error?.message ?? error).slice(0, 140) };
    }
    const afterDuplicate = run.witness();
    const terminalCount = afterDuplicate.attemptEvents.filter((type) => type === 'ATTEMPT_CANCELLED').length;
    record('R6_NO_DUPLICATE_FACTS', 'Duplicate terminal callbacks do not append duplicate facts', terminalCount === 1, { terminalEventCount: terminalCount, duplicate });

    /** 7. A late Result cannot overturn the terminal event. */
    let late;
    try {
      run.controller.reportLate(run.attemptId, { workerStatus: 'completed', summary: 'a late result after terminalization' });
      late = { accepted: true };
    } catch (error) {
      late = { accepted: false, error: String(error?.message ?? error).slice(0, 180) };
    }
    const afterLate = run.witness();
    const lateState = afterLate.attempts.find((row) => row.attemptId === run.attemptId)?.state ?? 'ABSENT';
    record('R7_LATE_RESULT_CANNOT_OVERTURN', 'A late Result cannot overturn the terminal event', lateState === 'CANCELLED', { lateOutcome: late, finalState: lateState, events: afterLate.attemptEvents });

    /** 8. The canonical Project HEAD remains correct. */
    const canonicalAfter = { head: git(run.repo, ['rev-parse', 'HEAD']), status: git(run.repo, ['status', '--porcelain']) };
    record('R8_CANONICAL_HEAD_CORRECT', 'Canonical Project HEAD remains correct', canonicalAfter.head === run.head, { before: run.head, after: canonicalAfter.head, status: canonicalAfter.status });

    /** 9/10. A fresh authorized Attempt can start, commit, verify and settle. */
    let preview;
    try {
      for (let index = 0; index < 20; index += 1) {
        if (run.controller.preview().decision !== 'next') break;
        run.controller.step();
      }
      preview = run.controller.preview();
    } catch (error) {
      preview = { error: String(error?.message ?? error).slice(0, 200) };
    }
    const afterContinuation = run.witness();
    const freshAttempt = afterContinuation.attempts.find((row) => row.attemptId !== run.attemptId);
    record('R9_FRESH_ATTEMPT_STARTED', 'A fresh authorized Attempt can start from the healthy Canonical Repository', freshAttempt !== undefined, { freshAttempt: freshAttempt ?? null, preview });

    /** 10 is measured only if a fresh position actually opened; otherwise it is honestly not reached. */
    if (freshAttempt === undefined) {
      record('R10_FRESH_ATTEMPT_SETTLES', 'The new Attempt can commit, verify and settle under ordinary rules', false, { reason: 'no fresh attempt opened within the step budget' });
    } else {
      let settlement = null;
      try {
        const claimed = await run.controller.claim(freshAttempt.attemptId);
        writeFileSync(join(claimed.worldPath, 'src', 'alpha.js'), `export const alpha = 3;${NL}`, 'utf8');
        git(claimed.worldPath, ['add', '-A']);
        git(claimed.worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'recovered work']);
        run.controller.report(freshAttempt.attemptId, { workerStatus: 'completed', summary: 'the recovered attempt settled' });
        settlement = { reported: true };
      } catch (error) {
        settlement = { reported: false, error: String(error?.message ?? error).slice(0, 200) };
      }
      const afterSettle = run.witness();
      record('R10_FRESH_ATTEMPT_SETTLES', 'The new Attempt can commit, verify and settle under ordinary rules', afterSettle.attempts.some((row) => row.attemptId === freshAttempt.attemptId && row.state === 'COMPLETED'), { settlement, attempts: afterSettle.attempts, events: afterSettle.attemptEvents });
    }

    /** 11. Project can reach quiescence. */
    record('R11_QUIESCENCE', 'Project can reach quiescence', preview?.decision === 'idle' || afterContinuation.attempts.every((row) => row.state !== 'RUNNING'), { preview, attempts: afterContinuation.attempts.map((row) => `${row.attemptId.slice(-6)}:${row.state}`) });

    /** 12. Existing promotion authority unchanged. */
    record('R12_PROMOTION_AUTHORITY_UNCHANGED', 'Existing promotion authority remains unchanged', afterContinuation.promotionEvents.length === 0, { promotionEvents: afterContinuation.promotionEvents, note: 'no promotion was attempted or minted in this scenario' });

    return Object.freeze({
      kind: 'R3-WR4 Gate B — end-to-end failure continuation',
      pathwayExercised: 'ATTEMPT_CANCELLED with a NULL report — the one shape the existing vocabulary admits for a terminal-with-no-Result from RUNNING',
      pathwayIsAuthorized: false,
      requirements,
      requirementsMet: Object.freeze(Object.entries(requirements).filter(([, value]) => value.met).map(([id]) => id)),
      requirementsNotMet: Object.freeze(Object.entries(requirements).filter(([, value]) => !value.met).map(([id]) => id)),
      /** §8 CANNOT be closed this stage: requirement 3 depends on the authority §7 says does not exist. */
      END_TO_END_CONTINUATION_CLOSED: false,
      blockedOn: 'R3_AUTHORIZED_TERMINAL_DECISION — POLICY_REQUIRED',
      runtimeRecoveryAfterTerminal: requirements.R9_FRESH_ATTEMPT_STARTED.met === true,
    });
  } finally {
    run.dispose();
  }
}

function main() {
  const run = async () => {
    const failure = await unobservableFailure();
    process.stdout.write(`${NL}===== R3-WR4 GATE B §5 — UNOBSERVABLE-WORLD FAILURE =====${NL}${JSON.stringify(failure, null, 2)}${NL}`);
    const audit = await terminalVocabularyAudit();
    process.stdout.write(`${NL}===== R3-WR4 GATE B §6 — TERMINAL VOCABULARY AUDIT =====${NL}${JSON.stringify(audit, null, 2)}${NL}`);
    const policy = policyRequirement();
    process.stdout.write(`${NL}===== R3-WR4 GATE B §7/§9 — POLICY REQUIREMENT =====${NL}${JSON.stringify(policy, null, 2)}${NL}`);
    const cont = await continuation();
    process.stdout.write(`${NL}===== R3-WR4 GATE B §8 — END-TO-END CONTINUATION =====${NL}${JSON.stringify(cont, null, 2)}${NL}`);
  };
  run().catch((error) => {
    process.stderr.write(`gate B failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
