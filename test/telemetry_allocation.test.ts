import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseGateDefinition } from "../src/evidence/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import {
  adjustAllocation,
  allocate,
  type AllocationEstimates,
} from "../src/allocate/index.js";
import { ModelPerformanceTable, TELEMETRY_NAMESPACE } from "../src/telemetry/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function newOperationsPath(): string {
  return join(mkdtempSync(join(tmpdir(), "palimpsest-alc-")), "ops.sqlite");
}

// Requires the absence of failing evidence: unresolved with no evidence,
// and a definite FAIL once a tests_fail atom exists - both verdict shapes
// ALC-A02 needs from one registered gate.
const GATE = parseGateDefinition({
  gate_id: "gate-release",
  version: 1,
  subject_type: "attempt",
  require: { all: [{ not: { exists: { predicate: "tests_fail" } } }] },
});

function makeRig(attemptLimit = 4, candidateLimit: 1 | 2 | 4 = 1, operationsPath = newOperationsPath()) {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({
    databasePath: operationsPath,
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
    effects,
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

describe("telemetry attribution and evidence-faced settlement (PLMP-ALC-1 P1)", () => {
  it("ALC-A01: pump settles one sample per attempt from the mechanical gate", async () => {
    const { controller, git, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      // Scripted "fail first, then succeed": two attempts, two samples.
      git.queueGateOutcome("python", ["-m", "pytest"], 1);
      git.queueGateOutcome("python", ["-m", "pytest"], 0);

      const pump = await controller.pumpCommandAttempts({
        attribution: { model: "flash", cost: 0.002 },
      });
      expect(pump.attemptsRun).toBe(2);

      const stat = controller.telemetry.stat("implementer", "flash")!;
      expect(stat.attempts).toBe(2);
      expect(stat.successes).toBe(1);
      expect(stat.cost).toBeCloseTo(0.004);
    } finally {
      await cleanup();
    }
  });

  it("ALC-A02: a completed self-report never counts as success - only the gate verdict does", async () => {
    const { controller, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      controller.declareGate(GATE, "alc-test");
      controller.step();
      const created = controller.step()!;
      const attemptId = created.entity_id;
      await controller.claim(attemptId, { model: "flash" });
      const committed = await controller.effects.invoke(
        controller.effects.actions.gitCommit,
        { worktreeId: attemptId, message: "work" },
        {
          scope: controller.projectId,
          revision: controller.promotions.projectRevision(),
          callId: `commit:${attemptId}`,
        },
      );
      controller.report(attemptId, {
        workerStatus: "completed",
        summary: "done",
        resultCommit: committed.commit,
      });

      // No gate evidence yet -> INCOMPLETE -> no sample at all.
      const incomplete = controller.evaluateAttemptGate("gate-release", attemptId);
      expect(incomplete.verdict).toBe("INCOMPLETE");
      expect(controller.telemetry.stat("implementer", "flash")).toBeUndefined();

      // Evidence that fails the gate -> failure, despite the completed report.
      await controller.gate({
        attemptId,
        predicate: "tests_fail",
        command: ["python", "-m", "pytest"],
        exitCode: 1,
      });
      const failed = controller.evaluateAttemptGate("gate-release", attemptId);
      expect(failed.verdict).toBe("FAIL");
      const stat = controller.telemetry.stat("implementer", "flash")!;
      expect(stat.attempts).toBe(1);
      expect(stat.successes).toBe(0);
    } finally {
      await cleanup();
    }
  });

  it("ALC-A03: attempts claimed without attribution produce zero telemetry", async () => {
    const { controller, git, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      git.queueGateOutcome("python", ["-m", "pytest"], 0);

      await controller.pumpCommandAttempts();
      expect(controller.telemetry.snapshot().rows).toEqual([]);
      expect(controller.telemetry.snapshot().totalAttempts).toBe(0);
    } finally {
      await cleanup();
    }
  });
});

describe("conservative telemetry remap of the R5 rule table (PLMP-ALC-1 P2)", () => {
  const EASY: AllocationEstimates = {
    uncertainty: "medium",
    verifiability: "easy",
    impact: "low",
    evidenceDeficit: 0,
    critical: false,
    expensiveExecution: false,
  };
  const WEAK: AllocationEstimates = { ...EASY, verifiability: "weak" };
  const UV: AllocationEstimates = { ...EASY, uncertainty: "high", verifiability: "weak" };

  /** Pooled stats through the production smoothing (R6 Gamma prior). */
  function pooledStats(attempts: number, successes: number) {
    const table = new ModelPerformanceTable();
    table.addAggregated({ task_type: "t", model: "m", attempts, successes, cost: 0 });
    return table.taskTypeAggregate("t")!;
  }

  it("ALC-A04: below the eligibility threshold the rule output stands untouched", () => {
    const rule = allocate(WEAK);
    const adjusted = adjustAllocation(rule, {
      estimates: WEAK,
      candidateLimit: 4,
      // successRate 0.133 would qualify - only the attempt count gates here.
      stats: pooledStats(11, 0),
    });
    expect(adjusted).toEqual(rule);
  });

  it("ALC-A05: struggling weak-verification work escalates to strong without widening", () => {
    const rule = allocate(WEAK); // {candidates: 4, escalation: "worker"}
    const adjusted = adjustAllocation(rule, {
      estimates: WEAK,
      candidateLimit: 4,
      stats: pooledStats(20, 6), // smoothed 8/24 = 0.333
    });
    expect(adjusted.escalation).toBe("strong");
    expect(adjusted.candidates).toBe(4);
    expect(adjusted.reason).toContain("escalate to strong");
  });

  it("ALC-A06: sustained success downgrades a strong U×V rule, candidates frozen", () => {
    const rule = allocate(UV); // {candidates: 2, escalation: "strong"}
    const adjusted = adjustAllocation(rule, {
      estimates: UV,
      candidateLimit: 4,
      stats: pooledStats(20, 19), // smoothed 21/24 = 0.875
    });
    expect(adjusted.escalation).toBe("worker");
    expect(adjusted.candidates).toBe(2); // [ALC-INV-2]: the sample count never moves
    expect(adjusted.reason).toContain("downgrade to worker");
  });

  it("ALC-A07: struggling easy-verification work widens candidates within headroom", () => {
    const rule: Parameters<typeof adjustAllocation>[0] = {
      candidates: 2,
      verifiers: 1,
      escalation: "worker",
      reason: "rule",
    };
    const widened = adjustAllocation(rule, {
      estimates: EASY,
      candidateLimit: 4,
      stats: pooledStats(20, 6),
    });
    expect(widened.candidates).toBe(4);
    expect(widened.escalation).toBe("worker");

    // No headroom: the widen branch retreats to escalation (r1 rule 2).
    const blocked = adjustAllocation(rule, {
      estimates: EASY,
      candidateLimit: 2,
      stats: pooledStats(20, 6),
    });
    expect(blocked.candidates).toBe(2);
    expect(blocked.escalation).toBe("strong");
  });

  it("ALC-A08: hard invariants hold under extreme stats", () => {
    const starving = pooledStats(100, 0); // smoothed ~0.019
    const flawless = pooledStats(100, 100); // smoothed ~0.981

    // [ALC-INV-1]: the expensive-execution pre-screen is untouchable.
    const expensiveEstimates: AllocationEstimates = { ...EASY, expensiveExecution: true };
    const expensiveCriticalEstimates: AllocationEstimates = {
      ...UV,
      expensiveExecution: true,
      critical: true,
    };
    const expensive = allocate(expensiveEstimates);
    const expensiveCritical = allocate(expensiveCriticalEstimates);
    for (const [rule, estimates] of [
      [expensive, expensiveEstimates],
      [expensiveCritical, expensiveCriticalEstimates],
    ] as const) {
      for (const stats of [starving, flawless]) {
        expect(adjustAllocation(rule, { estimates, candidateLimit: 4, stats })).toEqual(rule);
      }
    }

    // [ALC-INV-3]: structural classes never remap.
    const cheap = allocate({ ...EASY, uncertainty: "low", verifiability: "deterministic" });
    expect(cheap.escalation).toBe("cheap");
    const designExperiment: Parameters<typeof adjustAllocation>[0] = {
      candidates: 1,
      verifiers: 1,
      escalation: "design-experiment",
      reason: "rule",
    };
    for (const rule of [cheap, designExperiment]) {
      for (const stats of [starving, flawless]) {
        expect(adjustAllocation(rule, { estimates: EASY, candidateLimit: 4, stats })).toEqual(rule);
      }
    }

    // [ALC-INV-2]: U×V candidates frozen below the downgrade band.
    const uvRule = allocate(UV);
    const adjusted = adjustAllocation(uvRule, {
      estimates: UV,
      candidateLimit: 4,
      stats: starving,
    });
    expect(adjusted.candidates).toBe(uvRule.candidates);
    expect(adjusted.escalation).toBe(uvRule.escalation);
  });

  it("ALC-A09: the adapter is a pure function of its inputs", () => {
    const rule = allocate(WEAK);
    const input = { estimates: WEAK, candidateLimit: 4, stats: pooledStats(20, 6) };
    expect(JSON.stringify(adjustAllocation(rule, input))).toBe(
      JSON.stringify(adjustAllocation(rule, input)),
    );
  });

  it("ALC-A05 (wiring): allocateFor feeds the pooled task_type aggregate", async () => {
    const { controller, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      const estimates: AllocationEstimates = { ...WEAK };

      // Cold table: the rule output stands.
      expect(controller.allocateFor("task-1", estimates).allocation.escalation).toBe("worker");

      // Seeded struggles: the wiring escalates through the adapter.
      controller.telemetry.addAggregated({
        task_type: "implementer",
        model: "flash",
        attempts: 20,
        successes: 6,
        cost: 0,
      });
      const { allocation } = controller.allocateFor("task-1", estimates);
      expect(allocation.escalation).toBe("strong");
      expect(allocation.reason).toContain("telemetry:");
    } finally {
      await cleanup();
    }
  });
});

describe("durable learning loop across sessions (PLMP-ALC-1 P3)", () => {
  const WEAK: AllocationEstimates = {
    uncertainty: "medium",
    verifiability: "weak",
    impact: "low",
    evidenceDeficit: 0,
    critical: false,
    expensiveExecution: false,
  };

  it("ALC-A10: durable stats drive a fresh controller's allocation", async () => {
    const opsPath = newOperationsPath();
    {
      const { controller, cleanup } = makeRig(4, 1, opsPath);
      try {
        controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
        controller.telemetry.addAggregated({
          task_type: "implementer",
          model: "flash",
          attempts: 20,
          successes: 6,
          cost: 0,
        });
        await controller.persistTelemetry();
      } finally {
        await cleanup();
      }
    }
    {
      const { controller, cleanup } = makeRig(4, 1, opsPath);
      try {
        controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
        expect(controller.telemetry.stat("implementer", "flash")).toBeUndefined();
        await controller.loadTelemetryInto(controller.telemetry);
        const { allocation } = controller.allocateFor("task-1", WEAK);
        expect(allocation.escalation).toBe("strong");
      } finally {
        await cleanup();
      }
    }
  });

  it("ALC-A11: a failed flush never breaks the pump and never loses the delta", async () => {
    const { controller, git, effects, cleanup } = makeRig();
    try {
      const realStore = effects.state;
      let failuresLeft = 1;
      (effects as { state: unknown }).state = {
        ...realStore,
        write: async (...args: Parameters<typeof realStore.write>) => {
          if (failuresLeft > 0) {
            failuresLeft -= 1;
            throw new Error("simulated flush failure");
          }
          return realStore.write(...args);
        },
      };

      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      git.queueGateOutcome("python", ["-m", "pytest"], 0);
      const pump = await controller.pumpCommandAttempts({
        attribution: { model: "flash", cost: 0.002 },
      });
      expect(pump.attemptsRun).toBe(1); // the loop itself is unbroken
      expect(controller.telemetryPendingError()).toContain("simulated flush failure");
      expect(
        (await realStore.list({ namespace: TELEMETRY_NAMESPACE }, undefined)).records,
      ).toHaveLength(0);

      // Heal: the explicit persist retries the SAME delta exactly once.
      (effects as { state: unknown }).state = realStore;
      await controller.persistTelemetry();
      expect(controller.telemetryPendingError()).toBeUndefined();
      expect(
        (await realStore.list({ namespace: TELEMETRY_NAMESPACE }, undefined)).records,
      ).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});

describe("status telemetry view (PLMP-TLM-2)", () => {
  it("STV-A01: samples surface as a human-readable telemetry section", async () => {
    const { controller, git, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      git.queueGateOutcome("python", ["-m", "pytest"], 1);
      git.queueGateOutcome("python", ["-m", "pytest"], 0);
      await controller.pumpCommandAttempts({
        attribution: { model: "flash", cost: 0.002 },
      });

      const view = controller.status();
      const row = view.telemetry!.rows[0]!;
      expect(row.task_type).toBe("implementer");
      expect(row.model).toBe("flash");
      expect(row.attempts).toBe(2);
      expect(row.successes).toBe(1);
      expect(row.successRate).toBe("50%"); // smoothed (1+2)/(2+4)
      expect(row.avgCost).toBe("0.0020");
      expect(row.costPerSuccess).toBe("0.0040");
    } finally {
      await cleanup();
    }
  });

  it("STV-A02: a cold table leaves the telemetry key absent", async () => {
    const { controller, git, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      git.queueGateOutcome("python", ["-m", "pytest"], 0);
      await controller.pumpCommandAttempts(); // no attribution -> no samples

      const view = controller.status();
      expect("telemetry" in view).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("STV-A03: the telemetry section speaks user language only", async () => {
    const { controller, git, cleanup } = makeRig();
    try {
      controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      git.queueGateOutcome("python", ["-m", "pytest"], 0);
      await controller.pumpCommandAttempts({
        attribution: { model: "flash", cost: 0.002 },
      });

      const view = controller.status();
      const row = view.telemetry!.rows[0]!;
      expect(Object.keys(row).sort()).toEqual([
        "attempts",
        "avgCost",
        "costPerSuccess",
        "model",
        "successRate",
        "successes",
        "task_type",
      ]);
      const serialized = JSON.stringify(view.telemetry).toLowerCase();
      for (const banned of ["event", "digest", "hash", "gamma", "revision", "namespace"]) {
        expect(serialized).not.toContain(banned);
      }
    } finally {
      await cleanup();
    }
  });
});
