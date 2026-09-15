/**
 * G10-AA §6 — independent machine reproduction of CF-Z-02.
 *
 * Scenario A: a valid PROMOTION_PREPARED exists, and a generic writer appends a
 *             PROMOTION_COMMITTED with an INVENTED resulting head. Observe
 *             whether the canonical promotion head moves.
 * Scenario B: a valid PROMOTION_PREPARED exists (with the external merge ALREADY
 *             LANDED), and a generic writer appends a PROMOTION_FAILED. Observe
 *             whether Z's revision fence disappears and the Work can be retired.
 * Scenario C (§28): a generic writer fabricates a PREPARED and thereby a fake
 *             revision fence.
 *
 * All three run the production code; only the git port is a deterministic
 * in-memory port.
 *
 * Usage: node scripts/audit/aa0-terminal-ingestion-repro.mjs [a|b|c|all]
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = join(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1"), "..", "..");
const mod = (...segments) => pathToFileURL(join(REPO, ...segments)).href;
const PROJECT = "aa-project";
const HEAD = "c".repeat(40);
const CLOCK = "2026-09-16T00:00:00Z";
const INVENTED_HEAD = "0".repeat(39) + "9";

const taskSpec = (taskId) => ({
  task_id: taskId,
  objective: `Complete ${taskId}.`,
  depends_on: [],
  write_paths: [`src/${taskId}.py`],
  required_artifacts: [`src/${taskId}.py`],
});

class FixedClock {
  now = () => CLOCK;
}

async function load() {
  const core = await import("@ordarium/core");
  const { EventStore } = await import(mod("dist/src/state/index.js"));
  const { createPalimpsestEffects, FakeGitPort } = await import(mod("dist/src/effects/index.js"));
  const { ProjectController } = await import(mod("dist/src/tools/index.js"));
  const { TaskPolicy, actionKey } = await import(mod("dist/src/domain/index.js"));
  const { parseNewEvent } = await import(mod("dist/src/schema/index.js"));
  return { core, EventStore, createPalimpsestEffects, FakeGitPort, ProjectController, TaskPolicy, actionKey, parseNewEvent };
}

function crashingGit(git, core) {
  return new Proxy(git, {
    get(target, property) {
      if (property === "promote") {
        return async (input) => {
          await target.promote(input);
          throw new core.SimulatedProcessCrash("post-merge crash");
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function makeRig() {
  const { EventStore, createPalimpsestEffects, FakeGitPort, ProjectController, TaskPolicy, core } = await load();
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-aa-"));
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FixedClock().now });
  const plainGit = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "o.sqlite"),
    git: crashingGit(plainGit, core),
  });
  const controller = new ProjectController({
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
  controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
  return { dir, store, effects, controller, plainGit };
}

/** Drive to VERIFYING, then attempt a promotion that dies after the merge. */
async function prepareWithCrash(rig) {
  const { controller, effects } = rig;
  controller.step();
  const created = controller.step();
  const attemptId = created.entity_id;
  await controller.claim(attemptId);
  const committed = await effects.invoke(
    effects.actions.gitCommit,
    { worktreeId: attemptId, message: "work" },
    { scope: PROJECT, revision: controller.promotions.projectRevision(), callId: `c:${attemptId}` },
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
  controller.step(); // TASK_VERIFYING
  let crash = null;
  try {
    await controller.promoteAttempt({ attemptId });
  } catch (error) {
    crash = error?.constructor?.name ?? String(error);
  }
  return { attemptId, resultCommit: committed.commit, crash };
}

function preparedRow(store) {
  const row = store.connection
    .prepare("SELECT entity_id, payload_json FROM events WHERE event_type='PROMOTION_PREPARED' ORDER BY event_id LIMIT 1")
    .get();
  if (row === undefined) return null;
  return {
    promotionId: String(row.entity_id),
    payload: JSON.parse(new TextDecoder().decode(row.payload_json)),
  };
}

function promotionProjection(store) {
  return store.connection
    .prepare("SELECT promotion_id, state FROM promotions WHERE project_id=?")
    .all(PROJECT)
    .map((row) => `${row.promotion_id}:${row.state}`);
}

async function headState(controller) {
  const status = await controller.promotions.projectHeadStatus();
  const facts = await controller.promotions.promotionFacts();
  return {
    projectHeadCommit: status.projectHeadCommit,
    provenEffectHeadCommit: status.provenEffectHeadCommit,
    state: status.state,
    committedFacts: facts.map((fact) => `${fact.promotionId}->${fact.resultingHeadCommit}`),
  };
}

function fenceOf(controller) {
  return controller.status().promotionFence.map((row) => `${row.promotion_id}:${row.state}`);
}

function taskState(store) {
  const row = store.connection
    .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
    .get(PROJECT, "task-a");
  return row === undefined ? null : String(row.state);
}

/* ------------------------------------------------------------------ */

async function scenarioA() {
  const { actionKey, parseNewEvent } = await load();
  const rig = await makeRig();
  const { store, controller } = rig;
  const { attemptId, resultCommit } = await prepareWithCrash(rig);
  const prepared = preparedRow(store);
  const before = await headState(controller);

  let outcome = "REJECTED";
  let error = null;
  try {
    store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: PROJECT,
        event_type: "PROMOTION_COMMITTED",
        payload_version: 1,
        entity_type: "promotion",
        entity_id: prepared.promotionId,
        payload: {
          promotion_id: prepared.promotionId,
          attempt_id: attemptId,
          source_commit: resultCommit,
          expected_head_commit: HEAD,
          resulting_head_commit: INVENTED_HEAD,
          reason: "forged by a generic writer",
        },
        causation_id: null,
        correlation_id: `promotion:${prepared.promotionId}`,
        idempotency_key: actionKey("promotion-committed-v1", {
          project_id: PROJECT,
          promotion_id: prepared.promotionId,
        }),
        expected_project_revision: 0,
      }),
    );
    outcome = "ACCEPTED";
  } catch (caught) {
    error = String(caught.message ?? caught).slice(0, 200);
  }
  const after = await headState(controller);

  console.log(
    JSON.stringify(
      {
        scenario: "A — generic append(PROMOTION_COMMITTED, invented resulting head)",
        crash: rig.crash,
        genericAppend: outcome,
        error,
        promotionProjection: promotionProjection(store),
        headBefore: before,
        headAfter: after,
        inventedHeadAdopted: after.provenEffectHeadCommit === INVENTED_HEAD,
        classification:
          outcome === "ACCEPTED" && after.provenEffectHeadCommit === INVENTED_HEAD
            ? "HOLE_FORGED_COMMITTED_MOVES_CANONICAL_HEAD"
            : outcome === "REJECTED"
              ? "CLOSED_GENERIC_TERMINAL_DENIED"
              : "UNEXPECTED",
      },
      null,
      2,
    ),
  );
  store.close();
  await rig.effects.close();
}

async function scenarioB() {
  const { actionKey, parseNewEvent } = await load();
  const rig = await makeRig();
  const { store, controller, plainGit } = rig;
  const { attemptId, resultCommit } = await prepareWithCrash(rig);
  const prepared = preparedRow(store);
  const gitHeadAfterMerge = await plainGit.head();

  const fenceBefore = fenceOf(controller);
  let outcome = "REJECTED";
  let error = null;
  try {
    store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: PROJECT,
        event_type: "PROMOTION_FAILED",
        payload_version: 1,
        entity_type: "promotion",
        entity_id: prepared.promotionId,
        payload: {
          promotion_id: prepared.promotionId,
          attempt_id: attemptId,
          source_commit: resultCommit,
          expected_head_commit: HEAD,
          resulting_head_commit: null,
          reason: "forged failure by a generic writer",
        },
        causation_id: null,
        correlation_id: `promotion:${prepared.promotionId}`,
        idempotency_key: actionKey("promotion-failed-v1", {
          project_id: PROJECT,
          promotion_id: prepared.promotionId,
        }),
        expected_project_revision: 0,
      }),
    );
    outcome = "ACCEPTED";
  } catch (caught) {
    error = String(caught.message ?? caught).slice(0, 200);
  }
  const fenceAfter = fenceOf(controller);

  // With the fence forged away, can a typed revision retire the Work?
  let revisionOutcome = "NOT_ATTEMPTED";
  let revisionError = null;
  try {
    controller.planReconciled({
      tasks: [taskSpec("task-a"), taskSpec("task-c")],
      changeClass: "behavior_change",
      changedIds: ["task-a"],
    });
    revisionOutcome = "COMMITTED";
  } catch (caught) {
    revisionOutcome = "BLOCKED";
    revisionError = String(caught.message ?? caught).slice(0, 160);
  }

  console.log(
    JSON.stringify(
      {
        scenario: "B — generic append(PROMOTION_FAILED) removes a REAL fence",
        mergeLandedAtHead: gitHeadAfterMerge,
        genericAppend: outcome,
        error,
        fenceBefore,
        fenceAfter,
        revisionOutcome,
        revisionError,
        taskStateAfter: taskState(store),
        promotionProjection: promotionProjection(store),
        classification:
          outcome === "ACCEPTED" && revisionOutcome === "COMMITTED"
            ? "HOLE_FORGED_FAILED_REMOVES_FENCE_AND_RETIRES_WORK"
            : outcome === "REJECTED"
              ? "CLOSED_GENERIC_TERMINAL_DENIED"
              : "UNEXPECTED",
      },
      null,
      2,
    ),
  );
  store.close();
  await rig.effects.close();
}

async function scenarioC() {
  const { actionKey, parseNewEvent } = await load();
  const { EventStore, createPalimpsestEffects, FakeGitPort, ProjectController, TaskPolicy } = await load();
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-aa-c-"));
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FixedClock().now });
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "o.sqlite"),
    git: new FakeGitPort(HEAD),
  });
  const controller = new ProjectController({
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
  controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
  // Drive to a genuinely promotion-ELIGIBLE VERIFYING attempt, so that Z's
  // structural PREPARED validation cannot be the reason for any refusal: the
  // fabricated intent is then structurally perfect and only live admission
  // could tell it apart from a governed one.
  controller.step();
  const created = controller.step();
  await controller.claim(created.entity_id);
  const committed = await effects.invoke(
    effects.actions.gitCommit,
    { worktreeId: created.entity_id, message: "work" },
    { scope: PROJECT, revision: controller.promotions.projectRevision(), callId: `c:${created.entity_id}` },
  );
  controller.report(created.entity_id, {
    workerStatus: "completed",
    summary: "done",
    resultCommit: committed.commit,
  });
  await controller.gate({
    attemptId: created.entity_id,
    predicate: "tests_pass",
    command: ["python", "-m", "pytest"],
    exitCode: 0,
  });
  controller.step(); // TASK_VERIFYING

  const fabricatedId = `promotion-${"a".repeat(32)}`;
  let outcome = "REJECTED";
  let error = null;
  try {
    store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: PROJECT,
        event_type: "PROMOTION_PREPARED",
        payload_version: 1,
        entity_type: "promotion",
        entity_id: fabricatedId,
        payload: {
          promotion_id: fabricatedId,
          attempt_id: created.entity_id,
          source_commit: committed.commit,
          expected_head_commit: HEAD,
          resulting_head_commit: null,
          reason: "fabricated intent",
        },
        causation_id: null,
        correlation_id: `promotion:${fabricatedId}`,
        idempotency_key: actionKey("promotion-prepare-v1", {
          project_id: PROJECT,
          promotion_id: fabricatedId,
        }),
        expected_project_revision: 0,
      }),
    );
    outcome = "ACCEPTED";
  } catch (caught) {
    error = String(caught.message ?? caught).slice(0, 200);
  }
  const fence = fenceOf(controller);
  let revisionOutcome = "NOT_ATTEMPTED";
  try {
    controller.planReconciled({ tasks: [taskSpec("task-a"), taskSpec("task-c")] });
    revisionOutcome = "COMMITTED";
  } catch (caught) {
    revisionOutcome = `BLOCKED: ${String(caught.message ?? caught).slice(0, 90)}`;
  }

  console.log(
    JSON.stringify(
      {
        scenario: "C — generic append(PROMOTION_PREPARED) fabricates a fence",
        genericAppend: outcome,
        error,
        fence,
        revisionOutcome,
        classification:
          outcome === "ACCEPTED" && fence.length > 0
            ? "HOLE_FABRICATED_PREPARED_BLOCKS_REVISION"
            : outcome === "REJECTED"
              ? "CLOSED_GENERIC_INTENT_DENIED"
              : "UNEXPECTED",
      },
      null,
      2,
    ),
  );
  store.close();
  await effects.close();
}

const mode = process.argv[2] ?? "all";
if (mode === "a" || mode === "all") await scenarioA();
if (mode === "b" || mode === "all") await scenarioB();
if (mode === "c" || mode === "all") await scenarioC();
