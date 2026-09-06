import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { parseGateDefinition } from "../src/evidence/index.js";
import {
  definePalimpsestControl,
  type ControllerStatusView,
  type GateInput,
  type OrchestrationControlTarget,
  type OrchestrationGraph,
  ProjectController,
} from "../src/tools/index.js";
import { EventStore, snapshotDigest } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

const GATE_RELEASE = parseGateDefinition({
  gate_id: "gate-release",
  version: 1,
  subject_type: "attempt",
  require: { all: [{ exists: { predicate: "tests_pass" } }] },
});

function makeRig(attemptLimit = 3) {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-vis-")), "ops.sqlite"),
    git,
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
      attempt_limit: attemptLimit,
      candidate_limit: 1,
    }),
    clock: () => "2026-09-07T00:00:00Z",
  });
  return {
    store,
    controller,
    git,
    surface: definePalimpsestControl(controller),
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

function eventCount(store: EventStore): number {
  return (
    store.connection.prepare("SELECT COUNT(*) AS c FROM events").get() as { c: number }
  ).c;
}

describe("orchestration graph projection (PLMP-VIS-1)", () => {
  it("VIS-A01: the graph agrees with status and is deterministic", async () => {
    const { controller, cleanup } = makeRig();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      controller.step();
      const created = controller.step()!;
      await controller.claim(created.entity_id);

      const graph = controller.orchestrationGraph();
      expect(JSON.stringify(controller.orchestrationGraph())).toBe(JSON.stringify(graph));
      expect(graph.project).toMatchObject({ projectId: "scheduler-project", revision: 0, paused: false });
      expect(graph.tasks).toHaveLength(1);
      expect(graph.tasks[0]!.state).toBe(controller.status().tasks[0]!.state);
      expect(graph.tasks[0]!.attempts[0]!.attemptId).toBe(created.entity_id);
      expect(controller.status().attempts.map((a) => a.attempt_id)).toContain(created.entity_id);
    } finally {
      await cleanup();
    }
  });

  it("VIS-A02: plan edges and per-attempt timelines (retry chain visible)", async () => {
    const { controller, cleanup } = makeRig();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1"), taskSpec("task-2", ["task-1"])],
      });
      controller.step();
      const first = controller.step()!;
      await controller.claim(first.entity_id);
      controller.report(first.entity_id, { workerStatus: "failed", summary: "broke" });

      let second = controller.step()!;
      for (let step = 0; step < 8 && second.event_type !== "ATTEMPT_CREATED"; step += 1) {
        second = controller.step()!;
      }
      expect(second.event_type).toBe("ATTEMPT_CREATED");
      await controller.claim(second.entity_id);
      await controller.gate({
        attemptId: second.entity_id,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      controller.report(second.entity_id, { workerStatus: "completed", summary: "fixed" });

      const graph = controller.orchestrationGraph();
      const task1 = graph.tasks.find((task) => task.taskId === "task-1")!;
      expect(graph.tasks.find((task) => task.taskId === "task-2")!.dependsOn).toEqual(["task-1"]);
      expect(task1.attempts).toHaveLength(2);
      expect(task1.attempts[0]!.timeline.map((entry) => entry.label)).toEqual([
        "尝试已创建",
        "已认领",
        "已报告失败",
      ]);
      expect(task1.attempts[1]!.timeline.map((entry) => entry.label)).toEqual([
        "尝试已创建",
        "已认领",
        "门禁证据已记录",
        "已报告完成",
      ]);
    } finally {
      await cleanup();
    }
  });

  it("VIS-A03: the projection carries no event ids or digests", async () => {
    const { controller, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      controller.step();
      const created = controller.step()!;
      await controller.claim(created.entity_id);
      const json = JSON.stringify(controller.orchestrationGraph()).toLowerCase();
      expect(json).not.toContain("event_id");
      expect(json).not.toContain("digest");
    } finally {
      await cleanup();
    }
  });

  it("VIS-A04: the projection is read-only", async () => {
    const { controller, store, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      const before = eventCount(store);
      const digestBefore = snapshotDigest(store.connection);
      controller.orchestrationGraph();
      controller.orchestrationGraph();
      expect(eventCount(store)).toBe(before);
      expect(snapshotDigest(store.connection)).toBe(digestBefore);
    } finally {
      await cleanup();
    }
  });

  it("VIS-A06: a plan revision is visible in the graph", async () => {
    const { controller, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      expect(controller.orchestrationGraph().project.revision).toBe(0);
      controller.plan({
        tasks: [taskSpec("task-1"), taskSpec("task-2", ["task-1"])],
        changeClass: "behavior_change",
        changedIds: ["task-1"],
      });
      const graph = controller.orchestrationGraph();
      expect(graph.project.revision).toBe(1);
      expect(graph.tasks.map((task) => task.taskId)).toEqual(["task-1", "task-2"]);
    } finally {
      await cleanup();
    }
  });

  it("VIS-A07: the badge shows until a gate verdict consumes the attribution exactly once", async () => {
    const { controller, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      controller.declareGate(GATE_RELEASE, "h1-test");
      controller.step();
      const first = controller.step()!;
      await controller.claim(first.entity_id, { model: "demo-a", cost: 0.002 });
      const attemptsOf = () => controller.orchestrationGraph().tasks[0]!.attempts[0]!;
      expect(attemptsOf().attribution).toEqual({ model: "demo-a", cost: 0.002 });

      // A worker report is a self-claim, not evidence - it does not consume
      // the attribution and does not sample telemetry (ALC-1).
      controller.report(first.entity_id, { workerStatus: "completed", summary: "self-claim" });
      expect(attemptsOf().attribution).toEqual({ model: "demo-a", cost: 0.002 });
      expect(controller.telemetry.stat("implementer", "demo-a")).toBeUndefined();

      // The gate verdict is the sample: evaluateAttemptGate consumes the
      // attribution exactly once on its way to promotion.
      await controller.gate({
        attemptId: first.entity_id,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      await controller.promoteWhenGatePasses(first.entity_id, "d".repeat(40), HEAD, "gate-release");
      expect("attribution" in attemptsOf()).toBe(false);
      expect(controller.telemetry.stat("implementer", "demo-a")).toMatchObject({
        attempts: 1,
        successes: 1,
      });
    } finally {
      await cleanup();
    }
  });
});

describe("control mapping face (PLMP-VIS-2)", () => {
  it("VIS-A05 (mapping): every control op delegates to exactly one existing method", async () => {
    const pause = vi.fn();
    const resume = vi.fn();
    const step = vi.fn(() => null);
    const runTurn = vi.fn();
    const claim = vi.fn(async () => ({ worktreePath: "wt" }));
    const selectCandidate = vi.fn(async () => ({ winner: "attempt-x" }) as never);
    const gate = vi.fn();
    const report = vi.fn();
    const plan = vi.fn();
    const promoteWhenGatePasses = vi.fn(async () => ({ promoted: true, result: {} as never }));
    const status = vi.fn(
      () =>
        ({ attempts: [{ attempt_id: "attempt-x", state: "COMPLETED" }] }) as ControllerStatusView,
    );
    const orchestrationGraph = vi.fn(() => ({}) as OrchestrationGraph);
    const get = vi.fn(() => ({
      report_json: new TextEncoder().encode(JSON.stringify({ result_commit: "abc" })),
    }));
    const prepare = vi.fn(() => ({ get }));
    const head = vi.fn(async () => "head-1");
    const target = {
      pause,
      resume,
      step,
      runTurn,
      claim,
      selectCandidate,
      gate,
      report,
      plan,
      promoteWhenGatePasses,
      status,
      orchestrationGraph,
      projectId: "p",
      store: { connection: { prepare } },
      effects: { git: { head } },
    } as unknown as OrchestrationControlTarget;

    const surface = definePalimpsestControl(target);
    surface.pause("why");
    expect(pause).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledWith("why");
    surface.resume("back");
    expect(resume).toHaveBeenCalledTimes(1);
    surface.next();
    expect(step).toHaveBeenCalledTimes(1);
    await surface.run(5);
    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(runTurn).toHaveBeenCalledWith({ maxSteps: 5 });
    await surface.claim("attempt-y");
    expect(claim).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledWith("attempt-y", undefined);
    await surface.claim();
    expect(selectCandidate).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledTimes(2);
    expect(claim).toHaveBeenLastCalledWith("attempt-x", undefined);
    const gateInput: GateInput = {
      attemptId: "attempt-y",
      predicate: "tests_pass",
      command: ["python", "-m", "pytest"],
      exitCode: 0,
    };
    await surface.gate(gateInput);
    expect(gate).toHaveBeenCalledTimes(1);
    expect(gate).toHaveBeenCalledWith(gateInput);
    surface.report("attempt-y", { workerStatus: "completed", summary: "ok" });
    expect(report).toHaveBeenCalledTimes(1);
    surface.plan({ tasks: [taskSpec("task-1")], changeClass: "metadata_only", changedIds: ["task-1"] });
    expect(plan).toHaveBeenCalledTimes(1);
    surface.graph();
    expect(orchestrationGraph).toHaveBeenCalledTimes(1);

    const outcome = await surface.promote("gate-release");
    expect(promoteWhenGatePasses).toHaveBeenCalledTimes(1);
    expect(promoteWhenGatePasses).toHaveBeenCalledWith("attempt-x", "abc", "head-1", "gate-release");
    expect(outcome).toEqual({ promoted: true, result: {} });
  });

  it("VIS-A05 (loop): the full dispatch→evidence→report→promote cycle runs over the surface", async () => {
    const { controller, surface, git, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      controller.declareGate(GATE_RELEASE, "h1-test");
      surface.next();
      const created = surface.next()!;
      expect(created.event_type).toBe("ATTEMPT_CREATED");
      const attemptId = created.entity_id;
      await surface.claim(attemptId);
      git.seedWorktreeFiles(attemptId, {
        "src/task-1.py": "task implementation\n",
      });
      await surface.gate({
        attemptId,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      surface.report(attemptId, {
        workerStatus: "completed",
        summary: "ok",
        resultCommit: "b".repeat(40),
      });
      const outcome = await surface.promote("gate-release");
      expect(outcome.promoted).toBe(true);
      const graph = surface.graph();
      expect(graph.promotions).toHaveLength(1);
      expect(graph.promotions[0]).toMatchObject({ attemptId, state: "COMMITTED" });

      surface.pause("inspecting");
      expect(surface.graph().project.paused).toBe(true);
      surface.resume("continuing");
      expect(surface.graph().project.paused).toBe(false);
    } finally {
      await cleanup();
    }
  });
});
