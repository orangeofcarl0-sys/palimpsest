import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { type AllocationEstimates } from "../src/allocate/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import { MODEL_MIN_ATTEMPTS, ModelPerformanceTable } from "../src/telemetry/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

const WEAK_ESTIMATES: AllocationEstimates = {
  uncertainty: "medium",
  verifiability: "weak",
  impact: "low",
  evidenceDeficit: 0,
  critical: false,
  expensiveExecution: false,
};

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-adv-")), "ops.sqlite"),
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

function seeded(
  candidates: Array<{ model: string; attempts: number; successes: number; cost: number }>,
): ModelPerformanceTable {
  const table = new ModelPerformanceTable();
  for (const candidate of candidates) {
    table.addAggregated({
      task_type: "t",
      model: candidate.model,
      attempts: candidate.attempts,
      successes: candidate.successes,
      cost: candidate.cost,
    });
  }
  return table;
}

describe("model advisory organ (PLMP-ALC-2 P1)", () => {
  it("ADV-A01: recommends the lower cost-per-success data-backed model", () => {
    // cheap: avg 0.004, smoothed (12+2)/24 = 0.583 -> cps 0.0069
    // pricey: avg 0.010, smoothed (18+2)/24 = 0.833 -> cps 0.0120
    // The pricey model succeeds more often; unit success cost still picks cheap.
    const table = seeded([
      { model: "cheap", attempts: 20, successes: 12, cost: 0.08 },
      { model: "pricey", attempts: 20, successes: 18, cost: 0.2 },
    ]);
    const advice = table.suggestModel("t", [
      { model: "cheap", cost: 0.004 },
      { model: "pricey", cost: 0.01 },
    ])!;
    expect(advice.model).toBe("cheap");
    expect(advice.reason).toContain("data-backed");
    expect(advice.reason).toContain("0.58");
    expect(advice.reason).toContain("cost/success 0.0069");
  });

  it("ADV-A02: below per-model eligibility there is no advice", () => {
    const table = seeded([
      { model: "m", attempts: MODEL_MIN_ATTEMPTS - 1, successes: 5, cost: 0.1 },
    ]);
    expect(table.suggestModel("t", [{ model: "m", cost: 0.01 }])).toBeUndefined();
  });

  it("ADV-A03: zero-priced candidates abstain; an all-zero set stays silent", () => {
    const allZero = seeded([{ model: "a", attempts: 20, successes: 10, cost: 0 }]);
    expect(allZero.suggestModel("t", [{ model: "a", cost: 0 }])).toBeUndefined();

    const mixed = seeded([
      { model: "free", attempts: 20, successes: 19, cost: 0 },
      { model: "paid", attempts: 20, successes: 10, cost: 0.1 },
    ]);
    const advice = mixed.suggestModel("t", [
      { model: "free", cost: 0 },
      { model: "paid", cost: 0.005 },
    ])!;
    expect(advice.model).toBe("paid"); // "free" abstains despite the better success rate
    expect(advice.reason).toContain("data-backed");
  });

  it("ADV-A04: zero-config and cold tables stay silent", () => {
    const cold = new ModelPerformanceTable();
    expect(cold.suggestModel("t", [{ model: "m", cost: 0.01 }])).toBeUndefined();
    expect(cold.suggestModel("t", [])).toBeUndefined();
  });

  it("ADV-A05: a paper-cheaper cold candidate can win once data exists, marked prior-based", () => {
    const table = seeded([{ model: "known", attempts: 20, successes: 12, cost: 0.08 }]);
    const advice = table.suggestModel("t", [
      { model: "known", cost: 0.004 },
      { model: "untried", cost: 0.001, priorSuccessRate: 0.5 }, // cps 0.0020 < 0.0069
    ])!;
    expect(advice.model).toBe("untried");
    expect(advice.reason).toContain("prior-based");
    expect(advice.reason).toContain("cold candidate");
  });

  it("ADV-A06: the organ advice is a pure function of its inputs", () => {
    const table = seeded([{ model: "m", attempts: 20, successes: 12, cost: 0.08 }]);
    const candidates = [{ model: "m", cost: 0.004 }];
    expect(JSON.stringify(table.suggestModel("t", candidates))).toBe(
      JSON.stringify(table.suggestModel("t", candidates)),
    );
  });
});

describe("allocateFor advisory arm (PLMP-ALC-2 P2)", () => {
  it("ADV-A01 (wiring): allocateFor surfaces the data-backed suggestion", async () => {
    const { controller, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      controller.telemetry.addAggregated({
        task_type: "implementer",
        model: "cheap",
        attempts: 20,
        successes: 12,
        cost: 0.08,
      });
      controller.telemetry.addAggregated({
        task_type: "implementer",
        model: "pricey",
        attempts: 20,
        successes: 18,
        cost: 0.2,
      });
      const result = controller.allocateFor("task-1", WEAK_ESTIMATES, {
        modelCandidates: [
          { model: "cheap", cost: 0.004 },
          { model: "pricey", cost: 0.01 },
        ],
      });
      expect(result.suggestedModel).toBe("cheap");
      expect(result.suggestedModelReason).toContain("data-backed");
    } finally {
      await cleanup();
    }
  });

  it("ADV-A04 (wiring): without candidates or data the return is byte-identical to before", async () => {
    const { controller, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      const plain = controller.allocateFor("task-1", WEAK_ESTIMATES);
      expect("suggestedModel" in plain).toBe(false);
      expect("suggestedModelReason" in plain).toBe(false);

      // Cold table with candidates: the gate keeps the advice silent.
      const cold = controller.allocateFor("task-1", WEAK_ESTIMATES, {
        modelCandidates: [{ model: "m", cost: 0.01 }],
      });
      expect("suggestedModel" in cold).toBe(false);
    } finally {
      await cleanup();
    }
  });
});
