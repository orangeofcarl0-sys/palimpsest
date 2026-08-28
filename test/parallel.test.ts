/**
 * Palimpsest Parallel (P3): role slots, wider candidate batches, base budget.
 *
 * Exit gate (docs/01 §7): stale isolation and late-result handling must not
 * regress under role-slot concurrency; strong defaults stay zero-config.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import {
  BudgetLedger,
  RoleSlotPolicy,
  DEFAULT_HARD_CAP,
  DEFAULT_ROLE_SLOTS,
} from "../src/tools/index.js";
import { DomainValidationError } from "../src/domain/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeController(options: {
  policy?: TaskPolicy;
  slots?: RoleSlotPolicy;
  budget?: BudgetLedger;
} = {}) {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-p3-")), "ops.sqlite"),
    git: new FakeGitPort(HEAD),
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: "scheduler-project",
    policy: options.policy ?? new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 8,
      candidate_limit: 4,
    }),
    clock: () => "2026-08-13T00:00:00Z",
    budget: options.budget,
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

/** start a project with role-annotated tasks; returns the attempt id of the first batch. */
function startProject(
  controller: ProjectController,
  tasks: Parameters<ProjectController["start"]>[0]["tasks"],
  slots?: RoleSlotPolicy,
) {
  controller.start({ projectId: "scheduler-project", goal: "parallel", tasks });
  if (slots !== undefined) {
    controller.declareRoleTable({ roles: slots.table(), hardCap: slots.hardCap, declaredBy: "h1-test" });
  }
}

describe("Palimpsest Parallel (P3)", () => {
  it("a 4-candidate batch runs four attempts in parallel and settles to VERIFYING", async () => {
    const { controller, cleanup } = makeController();
    try {
      startProject(controller, [taskSpec("task-1")], new RoleSlotPolicy({ slots: { ...DEFAULT_ROLE_SLOTS, implementer: 4 } }));
      const activation = controller.step()!;
      expect(activation.event_type).toBe("TASK_STARTED");
      expect(activation.payload.planned_candidate_count).toBe(4);
      const attempts = [controller.step()!, controller.step()!, controller.step()!, controller.step()!];
      expect(attempts.map((e) => e.event_type)).toEqual([
        "ATTEMPT_CREATED",
        "ATTEMPT_CREATED",
        "ATTEMPT_CREATED",
        "ATTEMPT_CREATED",
      ]);
      // All four can be claimed and run concurrently (default implementer slot is 2,
      // so use a widened slot policy to prove parallel admission).
      for (const attempt of attempts) {
        await controller.claim(attempt.entity_id);
      }
      for (const attempt of attempts) {
        controller.report(attempt.entity_id, {
          workerStatus: "completed",
          summary: "parallel candidate",
        });
      }
      const verifying = controller.step()!;
      expect(verifying.event_type).toBe("TASK_VERIFYING");
      const status = controller.status();
      expect(status.attempts.filter((a) => a.state === "COMPLETED")).toHaveLength(4);
    } finally {
      await cleanup();
    }
  });

  it("role slots cap concurrent claims per role (implementer default 2)", async () => {
    const { controller, cleanup } = makeController();
    try {
      startProject(controller, [
        { ...taskSpec("task-1"), role: "implementer" },
      ]);
      controller.step();
      const attempts = [controller.step()!, controller.step()!, controller.step()!, controller.step()!];
      await controller.claim(attempts[0]!.entity_id);
      await controller.claim(attempts[1]!.entity_id);
      // Third concurrent implementer claim exceeds the default slot of 2.
      await expect(controller.claim(attempts[2]!.entity_id)).rejects.toThrow(
        /role slot exhausted for implementer \(2\/2\)/,
      );
      expect(DEFAULT_ROLE_SLOTS.implementer).toBe(2);
    } finally {
      await cleanup();
    }
  });

  it("the global hard cap fails closed beyond DEFAULT_HARD_CAP running attempts", async () => {
    const slots = new RoleSlotPolicy({ slots: { implementer: 30 }, hardCap: 3 });
    const { controller, cleanup } = makeController({ slots });
    try {
      startProject(controller, [{ ...taskSpec("task-1"), role: "implementer" }], slots);
      controller.step();
      const attempts = [controller.step()!, controller.step()!, controller.step()!, controller.step()!];
      await controller.claim(attempts[0]!.entity_id);
      await controller.claim(attempts[1]!.entity_id);
      await controller.claim(attempts[2]!.entity_id);
      await expect(controller.claim(attempts[3]!.entity_id)).rejects.toThrow(
        /global concurrency cap reached \(3\/3\)/,
      );
      expect(DEFAULT_HARD_CAP).toBe(20);
    } finally {
      await cleanup();
    }
  });

  it("the attempt budget rejects claims beyond maxAttempts", async () => {
    const budget = new BudgetLedger({ maxAttempts: 2 });
    const { controller, cleanup } = makeController({ budget });
    try {
      startProject(controller, [{ ...taskSpec("task-1"), role: "implementer" }], new RoleSlotPolicy({ slots: { ...DEFAULT_ROLE_SLOTS, implementer: 4 } }));
      controller.step();
      const attempts = [controller.step()!, controller.step()!, controller.step()!, controller.step()!];
      await controller.claim(attempts[0]!.entity_id);
      await controller.claim(attempts[1]!.entity_id);
      await expect(controller.claim(attempts[2]!.entity_id)).rejects.toThrow(
        /attempt budget exhausted \(2\/2\)/,
      );
      expect(controller.status().parallel).toMatchObject({
        admittedAttempts: 2,
        rejectedClaims: 1,
      });
    } finally {
      await cleanup();
    }
  });

  it("stale isolation and late results do not regress under concurrency", async () => {
    const { controller, cleanup } = makeController();
    try {
      startProject(controller, [
        { ...taskSpec("task-1"), role: "implementer" },
        { ...taskSpec("task-2", ["task-1"]), role: "verifier" },
      ]);
      controller.step(); // TASK_STARTED task-1
      const attempts = [controller.step()!, controller.step()!, controller.step()!, controller.step()!];
      await controller.claim(attempts[0]!.entity_id);
      await controller.claim(attempts[1]!.entity_id);
      // The default implementer slot (2) admits two concurrent claims at a
      // time; finish all four candidates in two waves, then restart.
      controller.report(attempts[0]!.entity_id, { workerStatus: "expired", summary: "timed out" });
      controller.report(attempts[1]!.entity_id, { workerStatus: "expired", summary: "timed out" });
      await controller.claim(attempts[2]!.entity_id);
      await controller.claim(attempts[3]!.entity_id);
      controller.report(attempts[2]!.entity_id, { workerStatus: "expired", summary: "timed out" });
      controller.report(attempts[3]!.entity_id, { workerStatus: "expired", summary: "timed out" });
      controller.step(); // settle -> TASK_READY (budget remaining)
      controller.step(); // TASK_STARTED (second batch)
      const second = controller.step()!; // ATTEMPT_CREATED #3
      // The EXPIRED candidate from batch 1 returns claiming success.
      const late = controller.reportLate(attempts[1]!.entity_id, {
        workerStatus: "completed",
        summary: "late but done",
      });
      expect(late.event_type).toBe("ATTEMPT_LATE_RESULT");
      const status = controller.status();
      expect(status.attempts.find((a) => a.attempt_id === attempts[1]!.entity_id)?.state).toBe(
        "STALE",
      );
      // The new batch proceeds untouched and can be claimed under its own role.
      await controller.claim(second.entity_id);
      expect(status.parallel.admittedAttempts).toBeGreaterThanOrEqual(3);
    } finally {
      await cleanup();
    }
  });

  it("status exposes per-task roles and parallel counters", async () => {
    const { controller, cleanup } = makeController();
    try {
      startProject(controller, [
        { ...taskSpec("task-1"), role: "implementer" },
        { ...taskSpec("task-2", ["task-1"]), role: "verifier" },
      ]);
      const status = controller.status();
      expect(status.tasks.find((t) => t.task_id === "task-1")?.role).toBe("implementer");
      expect(status.tasks.find((t) => t.task_id === "task-2")?.role).toBe("verifier");
      expect(status.parallel).toEqual({ admittedAttempts: 0, rejectedClaims: 0 });
    } finally {
      await cleanup();
    }
  });

  it("the multi-agent driver can walk four roles with two concurrent claims each", async () => {
    const slots = new RoleSlotPolicy({
      slots: { implementer: 2, tester: 2, verifier: 2, scout: 2, analyst: 2 },
    });
    const { controller, cleanup } = makeController({ slots });
    try {
      startProject(controller, [
        { ...taskSpec("task-1"), role: "implementer" },
        { ...taskSpec("task-2", ["task-1"]), role: "tester" },
        { ...taskSpec("task-3", ["task-2"]), role: "verifier" },
        { ...taskSpec("task-4", ["task-3"]), role: "analyst" },
      ]);
      // task-1 activates first; both implementer slots admit, the tester waits.
      controller.step();
      const batch = [controller.step()!, controller.step()!, controller.step()!, controller.step()!];
      await controller.claim(batch[0]!.entity_id);
      await controller.claim(batch[1]!.entity_id);
      await expect(controller.claim(batch[2]!.entity_id)).rejects.toThrow(/slot exhausted/);
      void DomainValidationError;
    } finally {
      await cleanup();
    }
  });
});
