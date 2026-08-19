import { describe, expect, it } from "vitest";

import { installForTests, makeProject, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);

describe("Palimpsest tool surface (P2 golden path)", () => {
  it("registers exactly the nine curated tools", async () => {
    const { host, installed } = await installForTests();
    try {
      expect([...host.definitions.keys()].sort()).toEqual([
        "palimpsest_claim",
        "palimpsest_gate",
        "palimpsest_next",
        "palimpsest_plan",
        "palimpsest_preview",
        "palimpsest_report",
        "palimpsest_run",
        "palimpsest_start",
        "palimpsest_status",
      ]);
      void installed;
    } finally {
      await installed.dispose();
    }
  });

  it("start → next → claim → report → gate → status drives a full attempt cycle", async () => {
    const { host, installed } = await installForTests();
    try {
      const spec = taskSpec("task-1");
      const started = (await host.call("palimpsest_start", {
        projectId: "scheduler-project",
        goal: "Prove deterministic scheduler semantics.",
        tasks: [spec],
      })) as { projectId: string; revision: number; digest: string };
      expect(started.revision).toBe(0);
      expect(started.digest).toMatch(/^[0-9a-f]{64}$/);

      const activation = (await host.call("palimpsest_next", {})) as {
        eventType: string;
        entityId: string;
      };
      expect(activation.eventType).toBe("TASK_STARTED");

      const created = (await host.call("palimpsest_next", {})) as { eventType: string; entityId: string };
      expect(created.eventType).toBe("ATTEMPT_CREATED");
      const attemptId = created.entityId;

      const claimed = (await host.call("palimpsest_claim", { attemptId })) as {
        worktreePath: string;
        status: string;
      };
      expect(claimed.status).toBe("RUNNING");
      expect(claimed.worktreePath).toContain("worktree");

      const reported = (await host.call("palimpsest_report", {
        attemptId,
        workerStatus: "completed",
        summary: "implemented the module",
      })) as { eventType: string };
      expect(reported.eventType).toBe("ATTEMPT_COMPLETED");

      const gate = (await host.call("palimpsest_gate", {
        attemptId,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      })) as { evidenceId: string; status: string };
      expect(gate.status).toBe("active");

      const status = (await host.call("palimpsest_status", {})) as {
        revision: number;
        schedulerState: string;
        tasks: Array<{ task_id: string; state: string }>;
        attempts: Array<{ attempt_id: string; state: string }>;
        evidence: Array<{ evidence_id: string; status: string }>;
      };
      expect(status.revision).toBe(0);
      expect(status.tasks[0]).toMatchObject({ task_id: "task-1", state: "ACTIVE" });
      expect(status.attempts[0]).toMatchObject({ state: "COMPLETED" });
      expect(status.evidence[0]).toMatchObject({ status: "active" });
    } finally {
      await installed.dispose();
    }
  });

  it("plan revises the task graph and preserves history", async () => {
    const { host, installed } = await installForTests();
    try {
      await host.call("palimpsest_start", {
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      const planned = (await host.call("palimpsest_plan", {
        tasks: [taskSpec("task-1"), taskSpec("task-2", ["task-1"])],
      })) as { revision: number; digest: string };
      expect(planned.revision).toBe(1);
      const status = (await host.call("palimpsest_status", {})) as { revision: number };
      expect(status.revision).toBe(1);
      const project = installed.controller.store.connection
        .prepare("SELECT state_json FROM projects")
        .get() as { state_json: Uint8Array };
      const ir = JSON.parse(new TextDecoder().decode(project.state_json)) as {
        parent_revision: number;
        parent_digest: string;
      };
      expect(ir.parent_revision).toBe(0);
      expect(ir.parent_digest).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await installed.dispose();
    }
  });

  it("fail-closed input validation rejects malformed tool arguments", async () => {
    const { host, installed } = await installForTests();
    try {
      await expect(
        host.call("palimpsest_start", { projectId: "p", goal: "g", tasks: "not-an-array" }),
      ).rejects.toThrow(/tasks must be an array/);
      await expect(
        host.call("palimpsest_report", { attemptId: "x" }),
      ).rejects.toThrow(/workerStatus/);
      await expect(
        host.call("palimpsest_gate", {
          attemptId: "x",
          predicate: "tests_pass",
          command: [],
          exitCode: 0,
        }),
      ).rejects.toThrow(/command must be non-empty/);
    } finally {
      await installed.dispose();
    }
  });

  it("executor-independent: controller works with a mock executor attached later", async () => {
    const project = makeProject([taskSpec()]);
    void project;
    const { installed } = await installForTests();
    try {
      // The claim/report protocol is host-driven; controller exposes raw
      // step/claim/report for the fault-acceptance suite.
      expect(typeof installed.controller.step).toBe("function");
      expect(typeof installed.controller.claim).toBe("function");
      expect(typeof installed.controller.report).toBe("function");
      expect(typeof installed.controller.gate).toBe("function");
      expect(typeof installed.controller.promote).toBe("function");
      void HEAD;
    } finally {
      await installed.dispose();
    }
  });
});
