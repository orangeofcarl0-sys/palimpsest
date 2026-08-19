import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath, installForTests } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeController(attemptLimit = 2, candidateLimit: 1 | 2 | 4 = 1) {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-e1-")), "ops.sqlite"),
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
      candidate_limit: candidateLimit,
    }),
    clock: () => "2026-08-13T00:00:00Z",
  });
  return {
    store,
    controller,
    git,
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

function countEvents(controller: ProjectController): number {
  const row = controller.store.connection
    .prepare("SELECT COUNT(*) AS total FROM events")
    .get() as { total: number };
  return Number(row.total);
}

describe("E1 entry loop: preview and turn", () => {
  it("preview never writes a single event and matches the next committed step", async () => {
    const { controller, cleanup } = makeController();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      const before = countEvents(controller);

      // Repeated previews are pure: same answer, zero appends.
      const first = controller.preview();
      expect(first).toEqual({
        decision: "next",
        eventType: "TASK_STARTED",
        entityId: "task-1",
        projectRevision: 0,
      });
      expect(controller.preview()).toEqual(first);
      expect(controller.preview()).toEqual(first);
      expect(countEvents(controller)).toBe(before);

      // The next committed decision is byte-for-byte the previewed one.
      const applied = controller.step();
      expect(applied?.event_type).toBe(first.eventType);
      expect(applied?.entity_id).toBe(first.entityId);
      expect(countEvents(controller)).toBe(before + 1);
    } finally {
      await cleanup();
    }
  });

  it("preview stays read-only while the scheduler is paused", async () => {
    const { controller, cleanup } = makeController();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      controller.pause("audit");
      const before = countEvents(controller);
      expect(controller.preview()).toEqual({ decision: "paused" });
      expect(controller.preview()).toEqual({ decision: "paused" });
      expect(countEvents(controller)).toBe(before);
    } finally {
      await cleanup();
    }
  });

  it("palimpsest_preview through the tool surface writes nothing", async () => {
    const { host, installed } = await installForTests();
    try {
      await host.call("palimpsest_start", {
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      const before = countEvents(installed.controller);
      const previewed = (await host.call("palimpsest_preview", {})) as { decision: string };
      expect(previewed.decision).toBe("next");
      expect(countEvents(installed.controller)).toBe(before);
    } finally {
      await installed.dispose();
    }
  });

  it("runTurn advances mechanically to needs_promotion at a verified batch", async () => {
    const { controller, git, cleanup } = makeController(3, 1);
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      git.queueGateOutcome("python", ["-m", "pytest"], null);
      git.queueGateOutcome("python", ["-m", "pytest"], 0);
      const turn = await controller.runTurn();
      expect(turn.phase).toBe("needs_promotion");
      expect(turn.mechanical.attemptsRun).toBe(2);
      expect(turn.mechanical.exits).toEqual([null, 0]);
      expect(controller.status().tasks[0]).toMatchObject({ state: "VERIFYING" });

      // Nothing more to pump: the same phase, no new mechanical work.
      const again = await controller.runTurn();
      expect(again.phase).toBe("needs_promotion");
      expect(again.mechanical.attemptsRun).toBe(0);
    } finally {
      await cleanup();
    }
  });

  it("runTurn reports terminal once the attempt budget is exhausted", async () => {
    const { controller, cleanup } = makeController(2, 1);
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      // No gate outcomes queued: every run fails, budget is consumed.
      const turn = await controller.runTurn();
      expect(turn.phase).toBe("terminal");
      expect(turn.mechanical.attemptsRun).toBe(2);
      expect(controller.status().tasks[0]).toMatchObject({ state: "FAILED" });
    } finally {
      await cleanup();
    }
  });

  it("runTurn stops at a bounded number, surfacing the next worker decision", async () => {
    const { controller, cleanup } = makeController();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      // One mechanical step (TASK_STARTED) is not an attempt yet; runTurn must
      // report that the next decision is to create an attempt for a worker.
      const turn = await controller.runTurn({ maxSteps: 1 });
      expect(turn.mechanical.attemptsRun).toBe(0);
      expect(turn.phase).toBe("needs_worker");
      expect(turn.next?.eventType).toBe("ATTEMPT_CREATED");
    } finally {
      await cleanup();
    }
  });
});
