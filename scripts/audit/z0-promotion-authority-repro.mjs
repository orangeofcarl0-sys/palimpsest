/**
 * G10-Z §5/§6 — independent machine reproduction of CF-Y-01 and of the
 * PROMOTION_PREPARED / revision race.
 *
 * Scenario `cfy1` (§5):
 *   task A reaches a COMPLETED promotion-capable attempt, a typed revision
 *   retires A to STALE (Evidence correctly goes stale), and `promoteAttempt(a)`
 *   still commits a promotion - advancing the effect head with work the project
 *   has already retired, for a task that can never reach TASK_SATISFIED.
 *
 * Scenario `race` (§6):
 *   A is promotion-eligible; PROMOTION_PREPARED commits; the external git effect
 *   is interrupted after the merge (the genuine Crash B window) so
 *   PROMOTION_COMMITTED is missing; a revision then retires A anyway. On restart
 *   recovery backfills PROMOTION_COMMITTED, so the canonical head advances for a
 *   task the revision already retired.
 *
 * Both run the genuine production code; nothing is mocked except the git port
 * (a deterministic in-memory port) and the clock.
 *
 * Usage: node scripts/audit/z0-promotion-authority-repro.mjs [cfy1|race|all]
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = join(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1"), "..", "..");
const mod = (...segments) => pathToFileURL(join(REPO, ...segments)).href;
const PROJECT = "z-project";
const HEAD = "c".repeat(40);
const CLOCK = "2026-09-16T00:00:00Z";

const taskSpec = (taskId, dependsOn = []) => ({
  task_id: taskId,
  objective: `Complete ${taskId}.`,
  depends_on: [...dependsOn],
  write_paths: [`src/${taskId}.py`],
  required_artifacts: [`src/${taskId}.py`],
});

class FixedClock {
  constructor() {
    this.offset = 0;
  }
  /** ISO string: the EventStore / controller clock. */
  now = () => new Date(Date.parse(CLOCK) + this.offset).toISOString();
  /** Date object: the Ordarium effects runtime clock. */
  date = () => new Date(Date.parse(CLOCK) + this.offset);
  advance(ms) {
    this.offset += ms;
  }
}

async function loadModules() {
  const core = await import("@ordarium/core");
  const { EventStore } = await import(mod("dist/src/state/index.js"));
  const { createPalimpsestEffects, FakeGitPort } = await import(mod("dist/src/effects/index.js"));
  const { ProjectController } = await import(mod("dist/src/tools/index.js"));
  const { TaskPolicy } = await import(mod("dist/src/domain/index.js"));
  return { core, EventStore, createPalimpsestEffects, FakeGitPort, ProjectController, TaskPolicy };
}

/** Git port that performs the merge and then dies before the ledger records it. */
function crashingGit(git, core, counter) {
  return new Proxy(git, {
    get(target, property) {
      if (property === "promote") {
        return async (input) => {
          counter.merges += 1;
          counter.lastInput = input;
          await target.promote(input);
          throw new core.SimulatedProcessCrash(`post-merge crash for ${input.promotionId}`);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function makeStore(EventStore, dir, clock) {
  return new EventStore(join(dir, "p.sqlite"), { clock: clock.now });
}

function makeController(ProjectController, TaskPolicy, store, effects) {
  return new ProjectController({
    store,
    effects,
    projectId: PROJECT,
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 3600,
      lease_s: 60,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => CLOCK,
  });
}

/** Drive task-a to VERIFYING with one COMPLETED attempt carrying a result commit. */
async function driveToVerifying(controller, effects) {
  controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
  controller.step(); // TASK_STARTED
  const created = controller.step(); // ATTEMPT_CREATED
  const attemptId = created.entity_id;
  await controller.claim(attemptId);
  const committed = await effects.invoke(
    effects.actions.gitCommit,
    { worktreeId: attemptId, message: "work" },
    { scope: PROJECT, revision: controller.promotions.projectRevision(), callId: `commit:${attemptId}` },
  );
  controller.report(attemptId, {
    workerStatus: "completed",
    summary: "done",
    resultCommit: committed.commit,
  });
  await controller.gate({
    attemptId,
    predicate: "tests_pass",
    command: ["python", "-m", "pytest"],
    exitCode: 0,
  });
  const verifying = controller.step();
  if (verifying.event_type !== "TASK_VERIFYING") {
    throw new Error(`expected TASK_VERIFYING, got ${verifying.event_type}`);
  }
  return { attemptId, resultCommit: committed.commit };
}

function snapshot(store, attemptId) {
  const project = store.connection
    .prepare("SELECT revision, digest, head_commit FROM projects WHERE project_id=?")
    .get(PROJECT);
  const task = store.connection
    .prepare("SELECT state, envelope_json FROM tasks WHERE project_id=? AND task_id=?")
    .get(PROJECT, "task-a");
  const attempt = store.connection
    .prepare("SELECT state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
    .get(PROJECT, attemptId);
  const evidence = store.connection
    .prepare("SELECT evidence_id, status FROM evidence WHERE project_id=?")
    .all(PROJECT);
  const envelope = task?.envelope_json == null
    ? null
    : JSON.parse(new TextDecoder().decode(task.envelope_json));
  const report = attempt?.report_json == null
    ? null
    : JSON.parse(new TextDecoder().decode(attempt.report_json));
  const events = store.listEvents(PROJECT);
  return {
    projectRevision: Number(project.revision),
    projectHeadCommit: String(project.head_commit),
    taskState: String(task.state),
    taskEnvelopeBaseCommit: envelope?.base_commit ?? null,
    taskEnvelopeRevision: envelope?.project_revision ?? null,
    attemptState: String(attempt.state),
    reportResultCommit: report?.result_commit ?? null,
    reportBaseCommit: report?.base_commit ?? null,
    evidenceStatuses: evidence.map((row) => `${row.evidence_id}:${row.status}`),
    promotionPrepared: events.filter((e) => e.event_type === "PROMOTION_PREPARED").length,
    promotionCommitted: events
      .filter((e) => e.event_type === "PROMOTION_COMMITTED")
      .map((e) => ({ eventId: e.event_id, resultingHead: e.payload.resulting_head_commit })),
    promotionFailed: events.filter((e) => e.event_type === "PROMOTION_FAILED").length,
    taskStaleEvents: events.filter((e) => e.event_type === "TASK_STALE").length,
    taskSatisfiedEvents: events.filter((e) => e.event_type === "TASK_SATISFIED").length,
  };
}

/* ------------------------------------------------------------------ *
 * Scenario CF-Y-01
 * ------------------------------------------------------------------ */

async function cfy1() {
  const { EventStore, createPalimpsestEffects, FakeGitPort, ProjectController, TaskPolicy } =
    await loadModules();
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-z-cfy1-"));
  const clock = new FixedClock();
  const store = makeStore(EventStore, dir, clock);
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "o.sqlite"),
    git: new FakeGitPort(HEAD),
    clock: clock.date,
  });
  const controller = makeController(ProjectController, TaskPolicy, store, effects);

  const { attemptId, resultCommit } = await driveToVerifying(controller, effects);
  const beforeRevision = snapshot(store, attemptId);

  // A typed invalidating revision retires task-a (the exact W/Y path).
  controller.planReconciled({
    tasks: [taskSpec("task-a"), taskSpec("task-c")],
    changeClass: "behavior_change",
    changedIds: ["task-a"],
  });
  const afterRevision = snapshot(store, attemptId);

  let promotionOutcome = "REJECTED";
  let promotionError = null;
  try {
    await controller.promoteAttempt({ attemptId });
    promotionOutcome = "COMMITTED";
  } catch (error) {
    promotionError = String(error.message ?? error).slice(0, 200);
  }
  const afterPromote = snapshot(store, attemptId);

  // Can the retired task ever reach TASK_SATISFIED?
  let satisfied = "no-step";
  try {
    const decision = controller.step();
    satisfied = decision === null ? "idle" : decision.event_type;
  } catch (error) {
    satisfied = `threw: ${String(error.message ?? error).slice(0, 120)}`;
  }
  const afterSettle = snapshot(store, attemptId);

  store.close();
  await effects.close();

  // Post-Z contract: the retired Work holds no promotion authority.
  const defectPresent =
    afterRevision.taskState === "STALE" &&
    afterPromote.promotionCommitted.length === 1 &&
    afterSettle.taskSatisfiedEvents === 0;
  const closedByZ =
    afterRevision.taskState === "STALE" &&
    promotionOutcome === "REJECTED" &&
    afterSettle.promotionPrepared === 0 &&
    afterSettle.promotionCommitted.length === 0 &&
    afterSettle.projectHeadCommit === beforeRevision.projectHeadCommit &&
    afterSettle.taskSatisfiedEvents === 0;

  console.log(
    JSON.stringify(
      {
        scenario: "CF-Y-01 (retired task can still promote)",
        resultCommit,
        beforeRevision,
        afterRevision,
        promotionOutcome,
        promotionError,
        afterPromote: {
          promotionCommitted: afterPromote.promotionCommitted,
          promotionPrepared: afterPromote.promotionPrepared,
          projectHeadCommit: afterPromote.projectHeadCommit,
          promotionDivergesFromProjectHead:
            afterPromote.promotionCommitted.at(-1)?.resultingHead !== afterPromote.projectHeadCommit,
        },
        afterSettle: { stepDecision: satisfied, taskSatisfiedEvents: afterSettle.taskSatisfiedEvents },
        classification: defectPresent
          ? "DEFECT_PRESENT_RETIRED_WORK_PROMOTED"
          : closedByZ
            ? "CLOSED_RETIRED_WORK_HAS_NO_PROMOTION_AUTHORITY"
            : "UNEXPECTED",
        cfy01Reproduced: defectPresent,
        cfy01ClosedByZ: closedByZ,
        workspace: dir,
      },
      null,
      2,
    ),
  );
  return defectPresent || closedByZ ? 0 : 1;
}

/* ------------------------------------------------------------------ *
 * Scenario: PREPARED / revision race (Crash B)
 * ------------------------------------------------------------------ */

async function race() {
  const { core, EventStore, createPalimpsestEffects, FakeGitPort, ProjectController, TaskPolicy } =
    await loadModules();
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-z-race-"));
  const ledgerPath = join(dir, "o.sqlite");
  const clock = new FixedClock();
  const store = makeStore(EventStore, dir, clock);
  const counter = { merges: 0 };

  const plainGit = new FakeGitPort(HEAD);
  const git = crashingGit(plainGit, core, counter);
  const effects = createPalimpsestEffects({ databasePath: ledgerPath, git, clock: clock.date });
  const controller = makeController(ProjectController, TaskPolicy, store, effects);

  const { attemptId } = await driveToVerifying(controller, effects);
  const eligible = snapshot(store, attemptId);

  // 1. The promotion intent commits durably, then the external effect is
  //    interrupted after the merge: PREPARED present, COMMITTED missing.
  let crashObserved = null;
  try {
    await controller.promoteAttempt({ attemptId });
    crashObserved = "NO_CRASH";
  } catch (error) {
    crashObserved = error?.constructor?.name ?? String(error);
  }
  const afterCrash = snapshot(store, attemptId);

  // 2. A typed invalidating revision now tries to retire task-a.
  let revisionOutcome = "COMMITTED";
  let revisionError = null;
  try {
    controller.planReconciled({
      tasks: [taskSpec("task-a"), taskSpec("task-c")],
      changeClass: "behavior_change",
      changedIds: ["task-a"],
    });
  } catch (error) {
    revisionOutcome = "BLOCKED";
    revisionError = String(error.message ?? error).slice(0, 200);
  }
  const afterRevisionAttempt = snapshot(store, attemptId);
  await effects.close();

  // 3. Restart and recover: Ordarium owns the effect truth.
  clock.advance(120000);
  const restartedEffects = createPalimpsestEffects({
    databasePath: ledgerPath,
    git: plainGit,
    clock: clock.date,
  });
  const restartedController = makeController(ProjectController, TaskPolicy, store, restartedEffects);
  const report = await restartedController.recovery.reconcileAll();
  const afterRecovery = snapshot(store, attemptId);
  // A second pass after a much longer wait: does recovery eventually backfill
  // PROMOTION_COMMITTED for the already-retired task?
  clock.advance(3600000);
  const secondReport = await restartedController.recovery.reconcileAll();
  const afterSecondRecovery = snapshot(store, attemptId);
  const projectHeadStatus = await restartedController.promotions.projectHeadStatus();

  store.close();
  await restartedEffects.close();

  // The defect: the revision retired the very task whose external effect was
  // still UNRESOLVED. Either recovery later backfills a commitment for the
  // retired task (head advances for retired work) or it can never settle
  // (a landed external effect with no honest Work outcome) - both are failures
  // of the fence, so either branch reproduces the defect.
  const committedAfterRecovery =
    afterRecovery.promotionCommitted.length + afterSecondRecovery.promotionCommitted.length;
  const defectPresent =
    afterCrash.promotionPrepared === 1 &&
    afterCrash.promotionCommitted.length === 0 &&
    revisionOutcome === "COMMITTED" &&
    afterSecondRecovery.taskState === "STALE" &&
    (committedAfterRecovery >= 1 || report.inFlight.length + secondReport.inFlight.length > 0);
  // Post-Z contract: the PREPARED intent fences the revision, so the task stays
  // VERIFYING and the external effect keeps its own authority basis.
  const closedByZ =
    afterCrash.promotionPrepared === 1 &&
    afterCrash.promotionCommitted.length === 0 &&
    revisionOutcome === "BLOCKED" &&
    /promotion_settlement_required/.test(String(revisionError)) &&
    afterRevisionAttempt.taskState === "VERIFYING" &&
    afterRevisionAttempt.projectRevision === 0 &&
    afterRevisionAttempt.taskStaleEvents === 0 &&
    afterRevisionAttempt.evidenceStatuses.every((entry) => entry.endsWith(":active"));

  console.log(
    JSON.stringify(
      {
        scenario: "PREPARED / revision race (Crash B, effect landed before COMMITTED)",
        eligible,
        crashObserved,
        mergesPerformed: counter.merges,
        afterCrash: {
          promotionPrepared: afterCrash.promotionPrepared,
          promotionCommitted: afterCrash.promotionCommitted.length,
          taskState: afterCrash.taskState,
        },
        revisionAttempt: {
          outcome: revisionOutcome,
          error: revisionError,
          taskStateAfter: afterRevisionAttempt.taskState,
          projectRevisionAfter: afterRevisionAttempt.projectRevision,
          evidenceAfter: afterRevisionAttempt.evidenceStatuses,
        },
        recovery: {
          prepared: report.prepared,
          terminal: report.terminal.map((entry) => entry.outcome),
          blocked: report.blocked.map((entry) => entry.reason),
          inFlight: report.inFlight.map((entry) => entry.ordariumState),
        },
        secondRecovery: {
          terminal: secondReport.terminal.map((entry) => entry.outcome),
          blocked: secondReport.blocked.map((entry) => entry.reason),
          inFlight: secondReport.inFlight.map((entry) => entry.ordariumState),
          promotionCommitted: afterSecondRecovery.promotionCommitted,
          taskState: afterSecondRecovery.taskState,
        },
        afterRecovery: {
          promotionCommitted: afterRecovery.promotionCommitted,
          taskState: afterRecovery.taskState,
          projectHeadCommit: afterRecovery.projectHeadCommit,
          headStatus: projectHeadStatus.state,
          provenEffectHeadCommit: projectHeadStatus.provenEffectHeadCommit,
        },
        mergesTotal: counter.merges,
        classification: defectPresent
          ? "DEFECT_PRESENT_REVISION_CROSSED_UNRESOLVED_PROMOTION"
          : closedByZ
            ? "CLOSED_PREPARED_FENCES_REVISION"
            : "UNEXPECTED",
        mixedStateReproduced: defectPresent,
        raceClosedByZ: closedByZ,
        workspace: dir,
      },
      null,
      2,
    ),
  );
  return defectPresent || closedByZ ? 0 : 1;
}

const mode = process.argv[2] ?? "all";
let exitCode = 0;
if (mode === "cfy1" || mode === "all") exitCode = Math.max(exitCode, await cfy1());
if (mode === "race" || mode === "all") exitCode = Math.max(exitCode, await race());
process.exit(exitCode);
