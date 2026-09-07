import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseStageGraphDefinition,
  DEFAULT_STAGE_GRAPH,
  type StageGraphDefinition,
} from "../src/domain/index.js";
import { serveOrchestration, type ServeHandle } from "../src/serve.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import type { TaskSpec } from "../src/schema/index.js";

import { FakeClock, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeRig(options?: { attemptLimit?: number }) {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-ready-")), "ops.sqlite"),
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
      attempt_limit: options?.attemptLimit ?? 3,
      candidate_limit: 1,
    }),
    clock: () => "2026-09-07T00:00:00Z",
  });
  return {
    store,
    controller,
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

function roleTask(taskId: string, role: string): TaskSpec {
  return {
    task_id: taskId,
    objective: `Complete ${taskId}.`,
    depends_on: [],
    write_paths: [`src/${taskId}.py`],
    required_artifacts: [`src/${taskId}.py`],
    role,
  };
}

/** The genesis pipeline with both latch stages opened to two tasks. */
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
  declared_by: "ready-set-spec",
  reason: "two-task latch concurrency",
};

describe("ready-set scheduler (PLMP-SCHED-1)", () => {
  it("SCHED-A01: concurrency parses only on latch stages as a positive integer; genesis unchanged", () => {
    expect(parseStageGraphDefinition(DEFAULT_STAGE_GRAPH)).toEqual(DEFAULT_STAGE_GRAPH);
    expect(parseStageGraphDefinition(CONCURRENT_GRAPH).stages[0]).toEqual({
      id: "active",
      state: "ACTIVE",
      concurrency: 2,
    });
    expect(() =>
      parseStageGraphDefinition({
        ...CONCURRENT_GRAPH,
        stages: [
          { id: "active", state: "ACTIVE", concurrency: 0 },
          ...CONCURRENT_GRAPH.stages.slice(1),
        ],
      }),
    ).toThrow(/concurrency must be a positive integer/);
    expect(() =>
      parseStageGraphDefinition({
        ...CONCURRENT_GRAPH,
        stages: [
          { id: "ready", state: "READY", concurrency: 2 },
          ...CONCURRENT_GRAPH.stages.slice(0, 3),
          CONCURRENT_GRAPH.stages[3]!,
        ],
      }),
    ).toThrow(/latch stage/);
  });

  it("SCHED-A02: the default declaration keeps the single-task latch byte-identical", () => {
    const rig = makeRig();
    try {
      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [{ ...roleTask("task-1", "implementer"), objective: "一" }, { ...roleTask("task-2", "implementer"), objective: "二" }],
      });
      expect(rig.controller.step()?.event_type).toBe("TASK_STARTED");
      expect(rig.controller.step()?.event_type).toBe("ATTEMPT_CREATED");
      // The in-flight latch: the second task does NOT activate.
      expect(rig.controller.step()).toBeNull();
      const states = rig.controller
        .orchestrationGraph()
        .tasks.map((task) => [task.taskId, task.state]);
      expect(states).toEqual([
        ["task-1", "ACTIVE"],
        ["task-2", "READY"],
      ]);
    } finally {
      void rig.cleanup();
    }
  });

  it("SCHED-A03: concurrency=2 activates a second task while the first is in flight; decide is pure", () => {
    const rig = makeRig();
    try {
      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        stageGraph: CONCURRENT_GRAPH,
        tasks: [roleTask("task-1", "implementer"), roleTask("task-2", "implementer")],
      });
      expect(rig.controller.step()?.event_type).toBe("TASK_STARTED");
      expect(rig.controller.step()?.event_type).toBe("ATTEMPT_CREATED");
      // Fall-through: the second READY task activates although task-1 is in flight.
      expect(rig.controller.step()?.event_type).toBe("TASK_STARTED");
      expect(rig.controller.step()?.event_type).toBe("ATTEMPT_CREATED");
      expect(rig.controller.step()).toBeNull();
      const states = Object.fromEntries(
        rig.controller.orchestrationGraph().tasks.map((task) => [task.taskId, task.state]),
      );
      expect(states).toEqual({ "task-1": "ACTIVE", "task-2": "ACTIVE" });
      // Purity: decide() twice yields the identical prepared event.
      const first = rig.controller.scheduler.decide();
      const second = rig.controller.scheduler.decide();
      expect(first).toEqual(second);
    } finally {
      void rig.cleanup();
    }
  });

  it("SCHED-A04: activation is bounded by the declared concurrency until a batch settles", async () => {
    // attempt_limit=1: one failed batch retires the task (budget exhausted),
    // deterministically freeing its slot for the third task.
    const rig = makeRig({ attemptLimit: 1 });
    try {
      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        stageGraph: CONCURRENT_GRAPH,
        tasks: [
          roleTask("task-1", "implementer"),
          roleTask("task-2", "implementer"),
          roleTask("task-3", "implementer"),
        ],
      });
      for (let i = 0; i < 4; i += 1) rig.controller.step();
      let states = Object.fromEntries(
        rig.controller.orchestrationGraph().tasks.map((task) => [task.taskId, task.state]),
      );
      expect(states).toEqual({ "task-1": "ACTIVE", "task-2": "ACTIVE", "task-3": "READY" });
      // task-1's attempt fails: the batch closes, the task falls back to READY.
      const attempt = rig.controller
        .orchestrationGraph()
        .tasks.find((task) => task.taskId === "task-1")!.attempts[0]!;
      await rig.controller.claim(attempt.attemptId);
      rig.controller.report(attempt.attemptId, { workerStatus: "failed", summary: "boom" });
      expect(rig.controller.step()?.event_type).toBe("TASK_FAILED");
      // Freed capacity: task-3 activates on the next tick.
      expect(rig.controller.step()?.event_type).toBe("TASK_STARTED");
      states = Object.fromEntries(
        rig.controller.orchestrationGraph().tasks.map((task) => [task.taskId, task.state]),
      );
      expect(states).toEqual({
        "task-1": "FAILED",
        "task-2": "ACTIVE",
        "task-3": "ACTIVE",
      });
    } finally {
      await rig.cleanup();
    }
  });

  it("SCHED-A05: the declared role table gates activation per role", () => {
    const rig = makeRig();
    try {
      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        stageGraph: CONCURRENT_GRAPH,
        tasks: [
          roleTask("tester-1", "tester"),
          roleTask("tester-2", "tester"),
          roleTask("scout-1", "scout"),
        ],
      });
      // tester slot = 1: tester-2 must wait; scout has capacity.
      for (let i = 0; i < 6; i += 1) rig.controller.step();
      const states = Object.fromEntries(
        rig.controller.orchestrationGraph().tasks.map((task) => [task.taskId, task.state]),
      );
      expect(states).toEqual({
        "tester-1": "ACTIVE",
        "tester-2": "READY",
        "scout-1": "ACTIVE",
      });
    } finally {
      void rig.cleanup();
    }
  });

  it("SCHED-A06: serve declare takes an optional declared stage graph; bad graphs fail closed", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      const post = async (body: unknown): Promise<{ status: number; json: any }> => {
        const response = await fetch(`${handle.url}/api/proposal/declare`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${handle.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
        return { status: response.status, json: (await response.json()) as any };
      };
      const bad = await post({
        proposal: {
          goal: "g",
          changeClass: "behavior_change",
          tasks: [{ title: "一", dependsOn: [] }],
        },
        stageGraph: {
          ...CONCURRENT_GRAPH,
          stages: [{ id: "active", state: "ACTIVE", concurrency: 0 }, ...CONCURRENT_GRAPH.stages.slice(1)],
        },
      });
      expect(bad.status).toBe(400);
      const declared = await post({
        proposal: {
          goal: "g",
          changeClass: "behavior_change",
          tasks: [
            { title: "一", dependsOn: [], role: "implementer" },
            { title: "二", dependsOn: [], role: "implementer" },
          ],
        },
        stageGraph: CONCURRENT_GRAPH,
      });
      expect(declared.json).toMatchObject({ declared: true, eventType: "PROJECT_CREATED" });
      // Two implementer tasks under concurrency=2: both activate (via run loop).
      for (let i = 0; i < 4; i += 1) rig.controller.step();
      const states = rig.controller
        .orchestrationGraph()
        .tasks.map((task) => [task.objective, task.state]);
      expect(states).toEqual([
        ["一", "ACTIVE"],
        ["二", "ACTIVE"],
      ]);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });
});
