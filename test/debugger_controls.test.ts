import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { serveOrchestration, type ServeHandle } from "../src/serve.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { actionKey, parseGateDefinition, TaskPolicy, type StageGraphDefinition } from "../src/domain/index.js";
import { parseNewEvent } from "../src/schema/index.js";
import { MIGRATION_8_SQL } from "../src/state/migrations.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-hold-")), "ops.sqlite"),
    git: new FakeGitPort(HEAD),
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: "scheduler-project",
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => "2026-09-07T00:00:00Z",
  });
  return { store, controller, cleanup: () => Promise.all([effects.close(), store.close()]) };
}

/** The G6 concurrent graph so holds can be observed against free capacity. */
const CONCURRENT_GRAPH: StageGraphDefinition = {
  stages: [
    { id: "active", state: "ACTIVE", concurrency: 2 },
    { id: "verifying", state: "VERIFYING", concurrency: 2 },
    { id: "blocked", state: "BLOCKED" },
    { id: "ready", state: "READY" },
  ],
  transitions: [
    { from: "active", event: "TASK_VERIFYING", to: "VERIFYING", when: "batch-completed-candidate" },
    { from: "active", event: "TASK_READY", to: "READY", when: "batch-failed-budget-remaining" },
    { from: "active", event: "TASK_FAILED", to: "FAILED", when: "attempt-limit-exhausted" },
    { from: "verifying", event: "TASK_SATISFIED", to: "SATISFIED", when: "promotion-committed" },
    { from: "blocked", event: "TASK_READY", to: "READY", when: "dependencies-satisfied" },
    { from: "ready", event: "TASK_STARTED", to: "ACTIVE", when: "always" },
  ],
  guards: {},
  declared_by: "debug-spec",
  reason: "hold observation",
};

const GATE_RELEASE = parseGateDefinition({
  gate_id: "gate-release",
  version: 1,
  subject_type: "attempt",
  require: { all: [{ exists: { predicate: "tests_pass" } }] },
});

function heldTasks(controller: ProjectController): string[] {
  return controller.orchestrationGraph().tasks.filter((task) => task.held === "active").map((task) => task.taskId);
}

describe("debugger holds (PLMP-DEBUG-1)", () => {
  it("DBG-A01: holds ride the ledger and survive restart; re-set overwrites, events keep history", async () => {
    const rig = makeRig();
    const { store, controller } = rig;
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1"), taskSpec("task-2")],
      });
      controller.setHold("task-1", { reason: "断点一", declaredBy: "debugger" });
      controller.setHold("task-1", { reason: "断点二", declaredBy: "debugger" });
      expect(heldTasks(controller)).toEqual(["task-1"]);
      const holds = store.connection
        .prepare("SELECT COUNT(*) AS c FROM task_holds WHERE project_id=?")
        .get("scheduler-project") as { c: number };
      expect(holds.c).toBe(1);
      const events = store.connection
        .prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type='HOLD_SET'")
        .get("scheduler-project") as { c: number };
      expect(events.c).toBe(2);
      // Crash-safe: a fresh store over the same database rebuilds the hold.
      const reopened = new EventStore(store.path, { clock: new FakeClock().next });
      const row = reopened.connection
        .prepare("SELECT reason FROM task_holds WHERE project_id=? AND task_id=?")
        .get("scheduler-project", "task-1") as { reason: string } | undefined;
      expect(row?.reason).toBe("断点二");
      reopened.close();
      controller.clearHold("task-1", { reason: "调试放行" });
      expect(heldTasks(controller)).toEqual([]);
    } finally {
      await rig.cleanup();
    }
  });

  it("DBG-A02: a held task neither activates nor unblocks; everything else proceeds", async () => {
    const rig = makeRig();
    const { controller } = rig;
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        stageGraph: CONCURRENT_GRAPH,
        tasks: [taskSpec("task-1"), taskSpec("task-2"), { ...taskSpec("task-3"), depends_on: ["task-2"] }],
      });
      // Hold the READY task: capacity is free yet it must not activate.
      controller.setHold("task-1", { reason: "断点", declaredBy: "debugger" });
      for (let i = 0; i < 4; i += 1) controller.step();
      let states = Object.fromEntries(
        controller.orchestrationGraph().tasks.map((task) => [task.taskId, task.state]),
      );
      expect(states).toEqual({ "task-1": "READY", "task-2": "ACTIVE", "task-3": "BLOCKED" });
      // Hold the BLOCKED task, then drive task-2's in-flight batch to
      // SATISFIED: with its dependencies satisfied a held task still does
      // not unblock (and the held READY task still does not activate).
      controller.setHold("task-3", { reason: "断点", declaredBy: "debugger" });
      controller.declareGate(GATE_RELEASE, "debug-spec");
      const attemptId = controller
        .orchestrationGraph()
        .tasks.find((task) => task.taskId === "task-2")!.attempts[0]!.attemptId;
      await controller.claim(attemptId);
      const committed = await controller.effects.invoke(
        controller.effects.actions.gitCommit,
        { worktreeId: attemptId, message: "work" },
        { scope: controller.projectId, revision: controller.promotions.projectRevision(), callId: `commit:${attemptId}` },
      );
      controller.report(attemptId, {
        workerStatus: "completed",
        summary: "done",
        resultCommit: committed.commit,
      });
      controller.step(); // TASK_VERIFYING
      await controller.gate({
        attemptId,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      await controller.promoteWhenGatePasses(attemptId, committed.commit, HEAD, "gate-release");
      expect(controller.step()?.event_type).toBe("TASK_SATISFIED");
      // Both gates: held-BLOCKED (deps now satisfied) and held-READY.
      expect(controller.step()).toBeNull();
      states = Object.fromEntries(
        controller.orchestrationGraph().tasks.map((task) => [task.taskId, task.state]),
      );
      expect(states).toEqual({ "task-1": "READY", "task-2": "SATISFIED", "task-3": "BLOCKED" });
      // Release task-3: the BLOCKED gate opens.
      controller.clearHold("task-3", { reason: "调试放行" });
      expect(controller.step()?.event_type).toBe("TASK_READY");
      expect(controller.orchestrationGraph().tasks.find((task) => task.taskId === "task-3")!.state).toBe("READY");
      // Release task-1: the READY gate opens.
      controller.clearHold("task-1", { reason: "调试放行" });
      expect(controller.step()?.event_type).toBe("TASK_STARTED");
      expect(controller.orchestrationGraph().tasks.find((task) => task.taskId === "task-1")!.state).toBe("ACTIVE");
    } finally {
      await rig.cleanup();
    }
  });

  it("DBG-A03: set/clear are fail-closed", async () => {
    const rig = makeRig();
    const { controller } = rig;
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      expect(() => controller.setHold("ghost", { reason: "x", declaredBy: "debugger" })).toThrow(
        /not declared by ProjectIR/,
      );
      expect(() => controller.clearHold("task-1", { reason: "x" })).toThrow(/not held/);
    } finally {
      await rig.cleanup();
    }
  });

  it("DBG-A04/A05: the graph projects held; serve control delegates 1:1 with zero external effects", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1"), taskSpec("task-2")],
      });
      const post = async (op: string, body: unknown): Promise<{ status: number; json: any }> => {
        const response = await fetch(`${handle.url}/api/control/${op}`, {
          method: "POST",
          headers: { authorization: `Bearer ${handle.token}`, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: response.status, json: (await response.json()) as any };
      };
      const before = rig.store.connection
        .prepare("SELECT COUNT(*) AS c FROM events")
        .get() as { c: number };
      const held = await post("holdSet", { taskId: "task-2", reason: "断点" });
      expect(held.status).toBe(200);
      let graph = (await (await api(handle)).json).graph;
      expect(graph.tasks.find((t: any) => t.taskId === "task-2").held).toBe("active");
      expect(graph.tasks.find((t: any) => t.taskId === "task-1").held).toBeUndefined();
      const cleared = await post("holdClear", { taskId: "task-2", reason: "放行" });
      expect(cleared.status).toBe(200);
      graph = (await (await api(handle)).json).graph;
      expect(graph.tasks.find((t: any) => t.taskId === "task-2").held).toBeUndefined();
      const missing = await post("holdClear", { taskId: "task-2", reason: "again" });
      expect(missing.status).toBe(400);
      // The hold controls only touch the orchestration ledger.
      const after = rig.store.connection.prepare("SELECT COUNT(*) AS c FROM events").get() as { c: number };
      expect(after.c).toBe(before.c + 2);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  async function api(handle: ServeHandle): Promise<any> {
    const response = await fetch(`${handle.url}/api/graph`, {
      headers: { authorization: `Bearer ${handle.token}` },
    });
    return { json: (await response.json()) as any };
  }
});

describe("debugger holds x plan revision (PLMP-GRAPH-4, 30 号规格)", () => {
  it("DBG-REV-A01: a hold does not rebind to whatever task reuses the task_id after a revision", async () => {
    const rig = makeRig();
    const { store, controller } = rig;
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1"), taskSpec("task-2", ["task-1"])],
      });
      controller.setHold("task-1", { reason: "A 的断点", declaredBy: "panel" });
      expect(heldTasks(controller)).toEqual(["task-1"]);
      expect(controller.scheduler.runOnce()).toBeNull();

      // r2: task-1 is now a semantically different node (X); A moved to
      // task-2 and B to task-3. The r1 hold must NOT gate any of them.
      controller.plan({
        tasks: [
          { ...taskSpec("task-1"), objective: "X" },
          { ...taskSpec("task-2"), objective: "A" },
          { ...taskSpec("task-3", ["task-2"]), objective: "B" },
        ],
      });
      const graph = controller.orchestrationGraph();
      expect(graph.tasks.map((task) => task.objective)).toEqual(["X", "A", "B"]);
      const stale = graph.tasks.filter((task) => task.held === "stale");
      expect(stale.map((task) => task.taskId)).toEqual(["task-1"]);
      expect(stale[0]!.objective).toBe("X");
      expect(graph.tasks.filter((task) => task.held === "active")).toEqual([]);

      // The stale hold stays auditable and explicit: re-anchor it at the
      // current revision (new HOLD_SET carries the live revision), or release it.
      controller.setHold("task-1", { reason: "X 也要停", declaredBy: "panel" });
      expect(heldTasks(controller)).toEqual(["task-1"]);
      const revision = store.connection
        .prepare("SELECT project_revision AS r FROM task_holds WHERE project_id=? AND task_id=?")
        .get("scheduler-project", "task-1") as { r: number };
      expect(revision.r).toBe(controller.orchestrationGraph().project.revision);
      controller.clearHold("task-1", { reason: "放行" });
      expect(
        controller.orchestrationGraph().tasks.every((task) => task.held === undefined),
      ).toBe(true);
    } finally {
      await rig.cleanup();
    }
  });

  it("DBG-REV-A02: the gate consumes the revision - stale inert, current active, legacy NULL active", async () => {
    // An active hold (revision matches) gates the READY task.
    const activeRig = makeRig();
    try {
      activeRig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      activeRig.controller.setHold("task-1", { reason: "停", declaredBy: "panel" });
      expect(activeRig.controller.scheduler.runOnce()).toBeNull();
    } finally {
      await activeRig.cleanup();
    }

    // A revision-mismatched hold is stale: the task activates.
    const staleRig = makeRig();
    try {
      staleRig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      staleRig.controller.setHold("task-1", { reason: "旧修订的断点", declaredBy: "panel" });
      staleRig.store.connection
        .prepare("UPDATE task_holds SET project_revision=? WHERE project_id=? AND task_id=?")
        .run(999, "scheduler-project", "task-1");
      const event = staleRig.controller.scheduler.runOnce();
      expect(event?.event_type).toBe("TASK_STARTED");
      expect(event?.entity_id).toBe("task-1");
      expect(staleRig.controller.orchestrationGraph().tasks[0]!.held).toBe("stale");
    } finally {
      await staleRig.cleanup();
    }

    // Unprovable rows (NULL revision - only possible for hand-seeded or
    // corrupted data after M8) are STALE too: fail-closed, never gate.
    const legacyRig = makeRig();
    try {
      legacyRig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      legacyRig.store.connection
        .prepare(
          "INSERT INTO task_holds(project_id, task_id, reason, declared_by, last_event_id, updated_at, project_revision) VALUES (?,?,?,?,?,?,NULL)",
        )
        .run("scheduler-project", "task-1", "无法证明的旧行", "legacy", 0, "2026-01-01T00:00:00Z");
      const event = legacyRig.controller.scheduler.runOnce();
      expect(event?.event_type).toBe("TASK_STARTED");
      expect(legacyRig.controller.orchestrationGraph().tasks[0]!.held).toBe("stale");
      expect(
        legacyRig.controller.orchestrationGraph().runtime?.controls?.holds[0]!.status,
      ).toBe("stale");
    } finally {
      await legacyRig.cleanup();
    }
  });
});

describe("hold governance projection (PLMP-GRAPH-5 §B2-D)", () => {
  it("HOLD-GOV-A01: a stale hold is attributed to the revision it was set at, not the current task", async () => {
    const rig = makeRig();
    const { store, controller } = rig;
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1"), taskSpec("task-2", ["task-1"])],
      });
      controller.setHold("task-1", { reason: "A 的断点", declaredBy: "panel" });
      // Active at the set revision: the projection carries provenance.
      const active = controller.orchestrationGraph().runtime?.controls?.holds[0]!;
      expect(active).toMatchObject({
        taskId: "task-1",
        setAtRevision: 0,
        currentRevision: 0,
        status: "active",
        reason: "A 的断点",
        declaredBy: "panel",
      });
      controller.plan({
        tasks: [
          { ...taskSpec("task-1"), objective: "X" },
          { ...taskSpec("task-2"), objective: "A" },
          { ...taskSpec("task-3", ["task-2"]), objective: "B" },
        ],
      });
      const stale = controller.orchestrationGraph().runtime?.controls?.holds[0]!;
      // The hold belongs to revision 0 (the old semantic task) - it must NOT
      // read as if the current task-1 (X) was historically held.
      expect(stale).toMatchObject({
        taskId: "task-1",
        setAtRevision: 0,
        currentRevision: 1,
        status: "stale",
      });
      void store;
    } finally {
      await rig.cleanup();
    }
  });

  it("HOLD-GOV-A02: a hold whose task disappears stays observable as orphan governance state", async () => {
    const rig = makeRig();
    const { controller } = rig;
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1"), taskSpec("task-2")],
      });
      controller.setHold("task-2", { reason: "即将消失的任务", declaredBy: "panel" });
      // r2 removes task-2 entirely.
      controller.plan({ tasks: [{ ...taskSpec("task-1"), objective: "X" }] });
      const graph = controller.orchestrationGraph();
      expect(graph.tasks.some((task) => task.taskId === "task-2")).toBe(false);
      const orphan = graph.runtime?.controls?.holds[0]!;
      expect(orphan).toMatchObject({
        taskId: "task-2",
        status: "orphan",
        setAtRevision: 0,
        currentRevision: 1,
        reason: "即将消失的任务",
      });
      expect(orphan.definitionId).toBeUndefined();
      // No GraphTask face exists for it - the controls projection is the
      // only place this state is observable.
      expect(graph.tasks.every((task) => task.held === undefined)).toBe(true);
    } finally {
      await rig.cleanup();
    }
  });

  it("HOLD-LEGACY-A01: legacy holds recover their revision provably - from replay and from the M8 backfill", async () => {
    // (1) Replay path: a pre-anchor HOLD_SET event (payload without
    // project_revision) derives its revision from the event's own
    // expected_project_revision - provable, never guessed.
    const replayRig = makeRig();
    const { store, controller } = replayRig;
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      store.append(
        parseNewEvent({
          schema_version: 1,
          project_id: "scheduler-project",
          event_type: "HOLD_SET",
          payload_version: 1,
          entity_type: "task",
          entity_id: "task-1",
          payload: { task_id: "task-1", reason: "旧事件", declared_by: "legacy" },
          causation_id: null,
          correlation_id: "task:task-1",
          idempotency_key: actionKey("task-hold-v1", {
            project_id: "scheduler-project",
            task_id: "task-1",
            reason: "旧事件",
          }),
          expected_project_revision: 0,
        }),
      );
      const derived = store.connection
        .prepare("SELECT project_revision AS r FROM task_holds WHERE task_id='task-1'")
        .get() as { r: number | null };
      expect(derived.r).toBe(0); // derived from the event, not the payload
      expect(controller.orchestrationGraph().runtime?.controls?.holds[0]!.status).toBe("active");
    } finally {
      await replayRig.cleanup();
    }

    // (2) Existing-DB path: M8 restores the revision from the ledger for
    // rows persisted before the anchor existed.
    const dbPath = tempStatePath();
    const upgradeEffects = createPalimpsestEffects({
      databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-hold-")), "ops.sqlite"),
      git: new FakeGitPort(HEAD),
    });
    const upgradeStore = new EventStore(dbPath, { clock: new FakeClock().next });
    const upgradeController = new ProjectController({
      store: upgradeStore,
      effects: upgradeEffects,
      projectId: "scheduler-project",
      policy: new TaskPolicy({
        policy_id: "trusted-default",
        read_paths: ["src"],
        allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
        network_policy: "deny",
        network_allowlist: [],
        timeout_s: 60,
        lease_s: 10,
        attempt_limit: 3,
        candidate_limit: 1,
      }),
      clock: () => "2026-09-07T00:00:00Z",
    });
    try {
      upgradeController.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      upgradeController.setHold("task-1", { reason: "升级前断点", declaredBy: "panel" });
      // Simulate a pre-M8 projection row (NULL column, event row intact).
      upgradeStore.connection
        .prepare("UPDATE task_holds SET project_revision=NULL WHERE task_id='task-1'")
        .run();
      upgradeStore.close();
      const reopened = new EventStore(dbPath, {});
      try {
        // The DB is already at v8 (migrations are append-only), so simulate
        // the upgrade by executing the shipped M8 statement itself - the
        // exact SQL a v7 database receives on open.
        reopened.connection.exec(MIGRATION_8_SQL);
        const restored = reopened.connection
          .prepare("SELECT project_revision AS r FROM task_holds WHERE task_id='task-1'")
          .get() as { r: number | null };
        expect(restored.r).toBe(0); // M8 backfilled from the HOLD_SET event
      } finally {
        reopened.close();
      }
    } finally {
      await upgradeEffects.close();
    }
  });
});
