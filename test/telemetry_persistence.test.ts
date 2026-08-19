import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ModelPerformanceTable, writeTelemetry, rebuildTelemetry } from "../src/telemetry/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeStorePath() {
  return tempStatePath();
}

async function makeController(statePath: string) {
  const store = new EventStore(statePath, { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-t11-")), "ops.sqlite"),
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
  return {
    store,
    controller,
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

describe("telemetry persistence (R11)", () => {
  it("telemetry survives a controller restart", async () => {
    const statePath = makeStorePath();
    // Phase 1: record and persist.
    {
      const { controller, cleanup } = await makeController(statePath);
      try {
        controller.telemetry.record({
          task_type: "torch_shape_debug",
          model: "flash",
          outcome: "success",
          cost: 0.002,
        });
        controller.telemetry.record({
          task_type: "torch_shape_debug",
          model: "flash",
          outcome: "failure",
          cost: 0.002,
        });
        controller.persistTelemetry();
      } finally {
        await cleanup();
      }
    }
    // Phase 2: reopen the same orchestration DB and rebuild.
    {
      const { controller, cleanup } = await makeController(statePath);
      try {
        expect(controller.telemetry.stat("torch_shape_debug", "flash")).toBeUndefined();
        controller.loadTelemetryInto(controller.telemetry);
        const stat = controller.telemetry.stat("torch_shape_debug", "flash")!;
        expect(stat.attempts).toBe(2);
        expect(stat.successes).toBe(1);
        expect(stat.costPerSuccess).toBeDefined();
      } finally {
        await cleanup();
      }
    }
  });

  it("writeTelemetry/rebuildTelemetry round-trip through the raw connection", async () => {
    const statePath = makeStorePath();
    const { store, cleanup } = await (async () => {
      const s = new EventStore(statePath, { clock: new FakeClock().next });
      return { store: s, cleanup: () => s.close() };
    })();
    try {
      const table = new ModelPerformanceTable();
      table.record({ task_type: "imp", model: "worker", outcome: "success", cost: 4 });
      table.record({ task_type: "imp", model: "worker", outcome: "success", cost: 4 });
      table.record({ task_type: "imp", model: "worker", outcome: "failure", cost: 4 });
      writeTelemetry(store.connection, table);
      const rebuilt = rebuildTelemetry(store.connection);
      expect(rebuilt.stat("imp", "worker")).toMatchObject({ attempts: 3, successes: 2 });
    } finally {
      await cleanup();
    }
  });

  it("the telemetry extension table does not disturb the projection snapshot", async () => {
    const statePath = makeStorePath();
    const { store, controller, cleanup } = await makeController(statePath);
    try {
      const { snapshotDigest } = await import("../src/state/index.js");
      const before = snapshotDigest(store.connection);
      controller.telemetry.record({
        task_type: "x",
        model: "m",
        outcome: "success",
        cost: 1,
      });
      controller.persistTelemetry();
      const after = snapshotDigest(store.connection);
      expect(after).toBe(before); // extension table is not part of the projection
    } finally {
      await cleanup();
    }
  });
});