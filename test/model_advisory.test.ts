import { describe, expect, it } from "vitest";

import { MODEL_MIN_ATTEMPTS, ModelPerformanceTable } from "../src/telemetry/index.js";

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
