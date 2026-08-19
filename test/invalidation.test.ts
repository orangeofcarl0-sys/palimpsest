import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyLateResult,
  computeInvalidationSet,
  type DependencyEdge,
  type RevisionDelta,
} from "../src/evidence/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

const EDGES: DependencyEdge[] = [
  { from: "ARCH", to: "task-1", sensitive_to: ["behavior_change", "contract_breaking"] },
  { from: "task-1", to: "task-2", sensitive_to: ["behavior_change", "contract_breaking"] },
  { from: "task-2", to: "task-3", sensitive_to: ["behavior_change", "contract_breaking"] },
  { from: "ARCH", to: "task-4", sensitive_to: ["metadata_only", "backward_compatible"] },
];

function delta(changeClass: RevisionDelta["change_class"], changedIds: readonly string[]): RevisionDelta {
  return { from: 0, to: 1, change_class: changeClass, changed_ids: changedIds };
}

describe("typed invalidation calculus (R2)", () => {
  it("propagates behavior_change / contract_breaking along sensitive edges", () => {
    expect([...computeInvalidationSet(delta("contract_breaking", ["ARCH"]), EDGES)].sort()).toEqual(
      ["ARCH", "task-1", "task-2", "task-3"],
    );
    expect([...computeInvalidationSet(delta("behavior_change", ["task-2"]), EDGES)].sort()).toEqual(
      ["task-2", "task-3"],
    );
  });

  it("metadata_only and backward_compatible never propagate", () => {
    expect(computeInvalidationSet(delta("metadata_only", ["ARCH"]), EDGES).size).toBe(0);
    expect(computeInvalidationSet(delta("backward_compatible", ["ARCH"]), EDGES).size).toBe(0);
  });

  it("edges insensitive to the change class stop propagation", () => {
    expect(computeInvalidationSet(delta("behavior_change", ["ARCH"]), EDGES).has("task-4")).toBe(false);
  });

  it("rejects non-forward deltas and accepts empty change sets", () => {
    expect(() =>
      computeInvalidationSet({ from: 2, to: 1, change_class: "behavior_change", changed_ids: ["a"] }, EDGES),
    ).toThrow(/must move forward/);
    expect(computeInvalidationSet(delta("contract_breaking", []), EDGES).size).toBe(0);
  });

  it("classifies late results by compatibility", () => {
    const behavior = delta("behavior_change", ["ARCH"]);
    const breaking = delta("contract_breaking", ["ARCH"]);
    const metadata = delta("metadata_only", ["ARCH"]);
    expect(classifyLateResult(1, 1, behavior)).toBe("current");
    expect(classifyLateResult(0, 1, metadata)).toBe("compatible");
    expect(classifyLateResult(0, 1, behavior)).toBe("stale_but_informative");
    expect(classifyLateResult(0, 1, breaking)).toBe("unsafe_stale");
    // An attempt predating this delta is conservative-but-safe for soft changes.
    expect(classifyLateResult(0, 1, breaking)).toBe("unsafe_stale");
  });
});

describe("typed invalidation through the controller plan", () => {
  function makeController() {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    const effects = createPalimpsestEffects({
      databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-inv-")), "ops.sqlite"),
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

  it("a contract_breaking plan invalidates the changed chain (stale tasks and evidence)", async () => {
    const { controller, cleanup } = makeController();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [
          taskSpec("task-1"),
          taskSpec("task-2", ["task-1"]),
          taskSpec("task-3", ["task-2"]),
        ],
      });
      controller.step(); // TASK_STARTED (task-1)
      const attempt = controller.step()!;
      await controller.claim(attempt.entity_id);
      await controller.gate({
        attemptId: attempt.entity_id,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      // A contract-breaking change to task-1 propagates to task-2 and task-3.
      controller.plan({
        tasks: [taskSpec("task-1"), taskSpec("task-2", ["task-1"]), taskSpec("task-3", ["task-2"])],
        changeClass: "contract_breaking",
        changedIds: ["task-1"],
      });
      const status = controller.status();
      expect(status.tasks.map((t) => `${t.task_id}:${t.state}`).sort()).toEqual([
        "task-1:STALE",
        "task-2:STALE",
        "task-3:STALE",
      ]);
      // Evidence bound to the invalidated attempt lost authority.
      expect(status.evidence[0]?.status).toBe("stale");
      // Nothing schedules from a stale chain.
      expect(controller.step()).toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("a metadata_only plan leaves the dependency chain and evidence active", async () => {
    const { controller, cleanup } = makeController();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1"), taskSpec("task-2", ["task-1"])],
      });
      controller.step();
      const attempt = controller.step()!;
      await controller.claim(attempt.entity_id);
      await controller.gate({
        attemptId: attempt.entity_id,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      controller.plan({
        tasks: [taskSpec("task-1"), taskSpec("task-2", ["task-1"])],
        changeClass: "metadata_only",
        changedIds: ["task-1"],
      });
      const status = controller.status();
      expect(status.tasks.map((t) => t.state)).toEqual(["ACTIVE", "BLOCKED"]);
      expect(status.evidence[0]?.status).toBe("active");
    } finally {
      await cleanup();
    }
  });
});