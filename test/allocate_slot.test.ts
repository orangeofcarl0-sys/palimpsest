import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectController, RoleSlotPolicy } from "../src/tools/index.js";
import { DomainValidationError } from "../src/domain/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

const BASE = {
  uncertainty: "high",
  verifiability: "deterministic",
  impact: "low",
  evidenceDeficit: 0,
  critical: false,
  expensiveExecution: false,
} as const;

function makeController(slots: RoleSlotPolicy) {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-r10-")), "ops.sqlite"),
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
      attempt_limit: 8,
      candidate_limit: 4,
    }),
    clock: () => "2026-08-13T00:00:00Z",
    parallel: { slots },
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

describe("allocator-slot interplay (R10)", () => {
  it("a wide candidate suggestion is capped by the role slot (implementer 2)", async () => {
    const { controller, cleanup } = makeController(new RoleSlotPolicy());
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [{ ...taskSpec("task-1"), role: "implementer" }],
      });
      const result = controller.allocateFor("task-1", BASE);
      // The pure allocator suggests 8 candidates (high uncertainty, easy
      // verification), but the P3 slot policy admits only 2 concurrently.
      expect(result.allocation.candidates).toBe(8);
      expect(result.concurrency).toMatchObject({
        role: "implementer",
        slotOfRole: 2,
        occupied: 0,
        totalRunning: 0,
        concurrentLimit: 2,
      });
    } finally {
      await cleanup();
    }
  });

  it("a single-slot role (verifier 1) yields a concurrent limit of 1", async () => {
    const { controller, cleanup } = makeController(new RoleSlotPolicy());
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [
          { ...taskSpec("task-1"), role: "implementer" },
          { ...taskSpec("task-2", ["task-1"]), role: "verifier" },
        ],
      });
      const result = controller.allocateFor("task-2", BASE);
      expect(result.concurrency).toMatchObject({ role: "verifier", slotOfRole: 1 });
      expect(result.concurrency.concurrentLimit).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it("the concurrent limit shrinks as the role's occupancy grows", async () => {
    const { controller, cleanup } = makeController(new RoleSlotPolicy());
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [{ ...taskSpec("task-1"), role: "implementer" }],
      });
      controller.step();
      const first = controller.step()!;
      await controller.claim(first.entity_id); // impl running: 1
      const afterOne = controller.allocateFor("task-1", BASE);
      expect(afterOne.concurrency).toMatchObject({ occupied: 1, concurrentLimit: 1 });
      const second = controller.step()!;
      await controller.claim(second.entity_id); // impl running: 2 (slot full)
      const afterTwo = controller.allocateFor("task-1", BASE);
      expect(afterTwo.concurrency).toMatchObject({ occupied: 2, concurrentLimit: 0 });
    } finally {
      await cleanup();
    }
  });

  it("the hard cap bleeds into the concurrent limit", async () => {
    const slots = new RoleSlotPolicy({ slots: { implementer: 8 }, hardCap: 2 });
    const { controller, cleanup } = makeController(slots);
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [{ ...taskSpec("task-1"), role: "implementer" }],
      });
      controller.step();
      const first = controller.step()!;
      await controller.claim(first.entity_id); // running: 1 / hardCap 2
      const result = controller.allocateFor("task-1", BASE);
      expect(result.concurrency).toMatchObject({ hardCap: 2, totalRunning: 1 });
      expect(result.concurrency.concurrentLimit).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it("the pure allocator is unchanged when called standalone", async () => {
    const { allocate } = await import("../src/allocate/index.js");
    expect(allocate(BASE).candidates).toBe(8);
    void DomainValidationError;
  });
});