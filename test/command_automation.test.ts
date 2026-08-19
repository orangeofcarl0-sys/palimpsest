import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeController(attemptLimit = 2, candidateLimit: 1 | 2 | 4 = 1) {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-a12-")), "ops.sqlite"),
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

describe("command-executor automation (R12)", () => {
  it("maps a passing gate exit code to COMPLETED after claim", async () => {
    const { controller, git, cleanup } = makeController();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      controller.step();
      const created = controller.step()!;
      const attemptId = created.entity_id;
      git.setGateOutcome(attemptId, "python", ["-m", "pytest"], 0);
      const outcome = await controller.runAttemptWithCommandExecutor(attemptId);
      expect(outcome.exitCode).toBe(0);
      expect(outcome.reportEvent).toBe("ATTEMPT_COMPLETED");
      const status = controller.status();
      expect(status.attempts[0]).toMatchObject({ attempt_id: attemptId, state: "COMPLETED" });
    } finally {
      await cleanup();
    }
  });

  it("pump retries a failing batch until the attempt budget is exhausted", async () => {
    const { controller, cleanup } = makeController(2, 1);
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      // No gate outcomes queued: every run sees exit null -> failed.
      const pump = await controller.pumpCommandAttempts();
      expect(pump.attemptsRun).toBe(2); // attempt budget exhausted
      expect(pump.exits).toEqual([null, null]);
      expect(pump.lastEvent?.event_type).toBe("TASK_FAILED");
      const status = controller.status();
      expect(status.tasks[0]).toMatchObject({ state: "FAILED" });
      expect(status.attempts.map((a) => a.state)).toEqual(["FAILED", "FAILED"]);
    } finally {
      await cleanup();
    }
  });

  it("pump stops at VERIFYING once a passing retry lands", async () => {
    const { controller, git, cleanup } = makeController(3, 1);
    try {
      // First gate run fails, the second passes: pump should end at VERIFYING
      // after exactly two attempts.
      git.queueGateOutcome("python", ["-m", "pytest"], null);
      git.queueGateOutcome("python", ["-m", "pytest"], 0);
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      const pump = await controller.pumpCommandAttempts();
      expect(pump.attemptsRun).toBe(2);
      expect(pump.exits).toEqual([null, 0]);
      expect(pump.lastEvent?.event_type).toBe("TASK_VERIFYING");
      const status = controller.status();
      expect(status.tasks[0]).toMatchObject({ state: "VERIFYING" });
      expect(status.attempts.map((a) => a.state)).toEqual(["FAILED", "COMPLETED"]);
    } finally {
      await cleanup();
    }
  });

  it("pump stops early when the project reaches a terminal task state", async () => {
    const { controller, cleanup } = makeController(2, 1);
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      const pump = await controller.pumpCommandAttempts();
      expect(pump.lastEvent?.event_type).toBe("TASK_FAILED");
      // A second pump on the now-terminal project dispatches nothing new.
      const again = await controller.pumpCommandAttempts();
      expect(again.attemptsRun).toBe(0);
      expect(again.lastEvent).toBeNull();
    } finally {
      await cleanup();
    }
  });
});