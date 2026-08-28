import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseGateDefinition } from "../src/evidence/index.js";
import { ProjectController } from "../src/tools/index.js";
import { DomainValidationError } from "../src/domain/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

const GATE = parseGateDefinition({
  gate_id: "gate-release",
  version: 1,
  subject_type: "attempt",
  require: { all: [{ exists: { predicate: "tests_pass" } }] },
});

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-g8-")), "ops.sqlite"),
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
      candidate_limit: 1,
    }),
    clock: () => "2026-08-13T00:00:00Z",
    gates: [GATE],
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

/** Drive one completed attempt with committed work, returning its commit + id. */
async function driveCompleted(controller: ProjectController) {
  controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
  controller.step();
  const created = controller.step()!;
  await controller.claim(created.entity_id);
  const committed = await controller.effects.invoke(
    controller.effects.actions.gitCommit,
    { worktreeId: created.entity_id, message: "work" },
    { scope: controller.projectId, revision: controller.promotions.projectRevision(), callId: `commit:${created.entity_id}` },
  );
  controller.report(created.entity_id, {
    workerStatus: "completed",
    summary: "done",
    resultCommit: committed.commit,
  });
  return { attemptId: created.entity_id, commit: committed.commit };
}

describe("gate-gated promotion (R8)", () => {
  it("promotes only when the gate verdict is PASS", async () => {
    const { controller, cleanup } = makeRig();
    try {
      const { attemptId, commit } = await driveCompleted(controller);
      controller.step(); // TASK_VERIFYING
      // No tests_pass evidence yet -> INCOMPLETE -> promotion refused.
      const blocked = await controller.promoteWhenGatePasses(
        attemptId,
        commit,
        HEAD,
        "gate-release",
      );
      expect(blocked.promoted).toBe(false);
      if (!blocked.promoted) {
        expect(blocked.verdict).toBe("INCOMPLETE");
        expect(blocked.nextEvidenceNeeded).toContain("exists(tests_pass)");
      }
      // Inject the passing evidence, then promotion is allowed.
      await controller.gate({
        attemptId,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      const allowed = await controller.promoteWhenGatePasses(
        attemptId,
        commit,
        HEAD,
        "gate-release",
      );
      expect(allowed.promoted).toBe(true);
      if (allowed.promoted) {
        expect(allowed.result.committed.event_type).toBe("PROMOTION_COMMITTED");
        expect(controller.step()?.event_type).toBe("TASK_SATISFIED");
      }
    } finally {
      await cleanup();
    }
  });

  it("refuses promotion on FAIL (contradicted evidence) with the fact surfaced", async () => {
    const { controller, cleanup } = makeRig();
    try {
      const { attemptId, commit } = await driveCompleted(controller);
      controller.step(); // VERIFYING
      await controller.gate({
        attemptId,
        predicate: "tests_fail",
        command: ["pytest"],
        exitCode: 1,
      });
      // A release gate that insists on tests_pass now sees a contradiction.
      controller.gates.register(
        parseGateDefinition({
          gate_id: "gate-no-fail",
          version: 1,
          subject_type: "attempt",
          require: {
            all: [
              { exists: { predicate: "tests_pass" } },
              { not: { exists: { predicate: "tests_fail" } } },
            ],
          },
        }),
      );
      const result = await controller.promoteWhenGatePasses(
        attemptId,
        commit,
        HEAD,
        "gate-no-fail",
      );
      expect(result.promoted).toBe(false);
      if (!result.promoted) {
        expect(result.verdict).toBe("FAIL");
        expect(result.nextEvidenceNeeded).toContain("exists(tests_pass)");
      }
      // No promotion event was recorded.
      const committed = controller.store.connection
        .prepare("SELECT COUNT(*) AS total FROM events WHERE event_type='PROMOTION_COMMITTED'")
        .get() as { total: number };
      expect(committed.total).toBe(0);
    } finally {
      await cleanup();
    }
  });

  it("an unregistered gate fails closed before promotion", async () => {
    const { controller, cleanup } = makeRig();
    try {
      const { attemptId, commit } = await driveCompleted(controller);
      controller.step();
      await expect(
        controller.promoteWhenGatePasses(attemptId, commit, HEAD, "missing-gate"),
      ).rejects.toThrow(/not registered/);
    } finally {
      await cleanup();
    }
  });
});