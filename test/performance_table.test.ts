import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ModelPerformanceTable } from "../src/telemetry/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

describe("model performance table (R6)", () => {
  it("accumulates attempts, successes and cost per (task_type, model)", () => {
    const table = new ModelPerformanceTable();
    table.record({ task_type: "torch_shape_debug", model: "flash", outcome: "success", cost: 0.002 });
    table.record({ task_type: "torch_shape_debug", model: "flash", outcome: "failure", cost: 0.002 });
    table.record({ task_type: "torch_shape_debug", model: "strong", outcome: "success", cost: 0.009 });

    const flash = table.stat("torch_shape_debug", "flash")!;
    expect(flash.attempts).toBe(2);
    expect(flash.successes).toBe(1);
    expect(flash.avgAttemptCost).toBeCloseTo(0.002);
    expect(flash.costPerSuccess).toBeDefined();

    const snapshot = table.snapshot();
    expect(snapshot.rows).toHaveLength(2);
    expect(snapshot.totalAttempts).toBe(3);
  });

  it("cost per success is smoothed so a cold row cannot be zero-cost", () => {
    const table = new ModelPerformanceTable();
    table.record({ task_type: "t", model: "m", outcome: "success", cost: 0 });
    const stat = table.stat("t", "m")!;
    expect(stat.attempts).toBe(1);
    expect(stat.successRate).toBeGreaterThan(0);
    expect(stat.costPerSuccess).toBeDefined();
  });

  it("expectedCostPerSuccess favors a strong model whose success rate beats a cheap one", () => {
    const table = new ModelPerformanceTable();
    // Cheap model: never succeeds (0/9 attempt cost 1). Strong: 9/9 cost 4.
    for (let index = 0; index < 9; index += 1) {
      table.record({ task_type: "task_x", model: "cheap", outcome: "failure", cost: 1 });
    }
    for (let index = 0; index < 9; index += 1) {
      table.record({ task_type: "task_x", model: "strong", outcome: "success", cost: 4 });
    }
    const cheapStat = table.stat("task_x", "cheap")!;
    const strongStat = table.stat("task_x", "strong")!;
    // The strong model costs 4x per attempt but nearly always succeeds, so
    // its expected cost per success is lower (§43).
    expect(cheapStat.costPerSuccess! > strongStat.costPerSuccess!).toBe(true);
    const best = table.bestModel("task_x", [
      { model: "cheap", cost: 1 },
      { model: "strong", cost: 4 },
    ]);
    expect(best).toBe("strong");
  });

  it("cold models fall back to the caller prior when estimating", () => {
    const table = new ModelPerformanceTable();
    const ranked = table.expectedCostPerSuccess("cold", [
      { model: "cheap", cost: 1 },
      { model: "strong", cost: 10, priorSuccessRate: 0.9 },
    ]);
    const cheap = ranked.find((row) => row.model === "cheap")!;
    const strong = ranked.find((row) => row.model === "strong")!;
    expect(cheap.costPerSuccess).toBeCloseTo(2);
    expect(strong.costPerSuccess).toBeCloseTo(10 / 0.9);
  });

  it("rejects negative costs", () => {
    const table = new ModelPerformanceTable();
    expect(() =>
      table.record({ task_type: "t", model: "m", outcome: "success", cost: -1 }),
    ).toThrow(/cost/);
  });

  it("controller telemetry is available for the host to record into", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    const effects = createPalimpsestEffects({
      databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-t6-")), "ops.sqlite"),
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
    });
    try {
      controller.telemetry.record({
        task_type: "implementation",
        model: "worker",
        outcome: "success",
        cost: 0.05,
      });
      const stat = controller.telemetry.stat("implementation", "worker")!;
      expect(stat.successes).toBe(1);
      expect(controller.telemetry.snapshot().totalCost).toBeCloseTo(0.05);
    } finally {
      await effects.close();
      store.close();
    }
  });
});