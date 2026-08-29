import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createStateStore, StateRevisionConflictError } from "@ordarium/core";
import { SqliteLedger } from "@ordarium/ledger-sqlite";
import { describe, expect, it } from "vitest";

import {
  isStateRevisionConflict,
  isTransientOperationError,
} from "../src/effects/errors.js";
import {
  ModelPerformanceTable,
  TELEMETRY_NAMESPACE,
  TelemetryStateSync,
} from "../src/telemetry/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore, snapshotDigest } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function newOperationsPath(): string {
  return join(mkdtempSync(join(tmpdir(), "palimpsest-tlm-")), "ops.sqlite");
}

async function makeController(operationsPath: string) {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: operationsPath,
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

/** Raw state store over a bare ledger (TLM-A02/A03/A06: no controller). */
function makeRawStore() {
  const ledger = new SqliteLedger(newOperationsPath());
  return {
    store: createStateStore({ ledger }),
    cleanup: () => ledger.close(),
  };
}

describe("telemetry externalization onto the Ordarium state kind (PLMP-TLM-1)", () => {
  it("TLM-A01: telemetry survives a controller restart through the shared ledger", async () => {
    const operationsPath = newOperationsPath();
    // Phase 1: record and flush to the state kind.
    {
      const { controller, cleanup } = await makeController(operationsPath);
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
        await controller.persistTelemetry();
      } finally {
        await cleanup();
      }
    }
    // Phase 2: a fresh controller over the SAME operations ledger rebuilds.
    {
      const { controller, cleanup } = await makeController(operationsPath);
      try {
        expect(controller.telemetry.stat("torch_shape_debug", "flash")).toBeUndefined();
        await controller.loadTelemetryInto(controller.telemetry);
        const stat = controller.telemetry.stat("torch_shape_debug", "flash")!;
        expect(stat.attempts).toBe(2);
        expect(stat.successes).toBe(1);
        expect(stat.costPerSuccess).toBeDefined();
      } finally {
        await cleanup();
      }
    }
  });

  it("TLM-A02: each flush appends exactly one delta subject, and loading aggregates", async () => {
    const { store, cleanup } = makeRawStore();
    try {
      const sync = await TelemetryStateSync.load(store);
      const table = new ModelPerformanceTable();
      table.record({ task_type: "imp", model: "worker", outcome: "success", cost: 4 });
      table.record({ task_type: "imp", model: "worker", outcome: "success", cost: 4 });
      await sync.flush(table);

      let page = await store.list({ namespace: TELEMETRY_NAMESPACE }, undefined);
      expect(page.records).toHaveLength(1);
      expect(page.records[0]!.value).toMatchObject({
        task_type: "imp",
        model: "worker",
        attempts: 2,
        successes: 2,
      });
      expect(page.records[0]!.revision).toBe(1);

      table.record({ task_type: "imp", model: "worker", outcome: "failure", cost: 4 });
      await sync.flush(table);
      page = await store.list({ namespace: TELEMETRY_NAMESPACE }, undefined);
      expect(page.records).toHaveLength(2);

      const fresh = await TelemetryStateSync.load(store);
      const row = fresh.durableSnapshot().rows[0]!;
      expect(row.attempts).toBe(3);
      expect(row.successes).toBe(2);
      expect(row.cost).toBeCloseTo(12);
    } finally {
      cleanup();
    }
  });

  it("TLM-A03: an idempotent flush with no new records writes nothing", async () => {
    const { store, cleanup } = makeRawStore();
    try {
      const sync = await TelemetryStateSync.load(store);
      const table = new ModelPerformanceTable();
      table.record({ task_type: "t", model: "m", outcome: "success", cost: 1 });
      await sync.flush(table);
      await sync.flush(table);
      const page = await store.list({ namespace: TELEMETRY_NAMESPACE }, undefined);
      expect(page.records).toHaveLength(1);
      expect((await TelemetryStateSync.load(store)).durableSnapshot().totalAttempts).toBe(1);
    } finally {
      cleanup();
    }
  });

  it("TLM-A04: the orchestration DB projection digest is untouched by telemetry", async () => {
    const { controller, store, cleanup } = await makeController(newOperationsPath());
    try {
      const before = snapshotDigest(store.connection);
      controller.telemetry.record({
        task_type: "x",
        model: "m",
        outcome: "success",
        cost: 1,
      });
      await controller.persistTelemetry();
      expect(snapshotDigest(store.connection)).toBe(before);
    } finally {
      await cleanup();
    }
  });

  it("TLM-A05: a state revision conflict classifies as busy-family, not transient", () => {
    const conflict = new StateRevisionConflictError("test");
    expect(isStateRevisionConflict(conflict)).toBe(true);
    expect(isTransientOperationError(conflict)).toBe(false);
  });

  it("TLM-A06: the raw flush/load round trip reproduces the memory face", async () => {
    const { store, cleanup } = makeRawStore();
    try {
      const source = new ModelPerformanceTable();
      for (const outcome of ["success", "success", "failure"] as const) {
        source.record({ task_type: "round", model: "trip", outcome, cost: 2 });
      }
      await (await TelemetryStateSync.load(store)).flush(source);

      const rebuilt = new ModelPerformanceTable();
      for (const row of (await TelemetryStateSync.load(store)).durableSnapshot().rows) {
        rebuilt.addAggregated(row);
      }
      const expected = source.stat("round", "trip")!;
      const actual = rebuilt.stat("round", "trip")!;
      expect(actual.attempts).toBe(expected.attempts);
      expect(actual.successes).toBe(expected.successes);
      expect(actual.cost).toBeCloseTo(expected.cost);
      expect(actual.costPerSuccess).toBeCloseTo(expected.costPerSuccess!);
    } finally {
      cleanup();
    }
  });
});
