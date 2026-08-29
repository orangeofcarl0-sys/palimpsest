import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseGateDefinition } from "../src/evidence/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

// Requires the absence of failing evidence: unresolved with no evidence,
// and a definite FAIL once a tests_fail atom exists - both verdict shapes
// ALC-A02 needs from one registered gate.
const GATE = parseGateDefinition({
  gate_id: "gate-release",
  version: 1,
  subject_type: "attempt",
  require: { all: [{ not: { exists: { predicate: "tests_fail" } } }] },
});

function makeRig(attemptLimit = 4, candidateLimit: 1 | 2 | 4 = 1) {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-alc-")), "ops.sqlite"),
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
