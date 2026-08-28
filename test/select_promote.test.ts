import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseGateDefinition } from "../src/evidence/index.js";
import { preferredJudge as preferred } from "../src/select/index.js";
import { ProjectController, RoleSlotPolicy } from "../src/tools/index.js";
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
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-r9-")), "ops.sqlite"),
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
    parallel: { slots: new RoleSlotPolicy({ slots: { implementer: 4 } }) },
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

/** Drive `count` parallel completed candidates with the given commit tail. */
async function driveFourCompleted(controller: ProjectController) {
  controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
  controller.step();
  const created = [controller.step()!, controller.step()!, controller.step()!, controller.step()!];
  const commits: string[] = [];
  for (const attempt of created) {
    await controller.claim(attempt.entity_id);
    const committed = await controller.effects.invoke(
      controller.effects.actions.gitCommit,
      { worktreeId: attempt.entity_id, message: `work ${attempt.entity_id}` },
      { scope: controller.projectId, revision: controller.promotions.projectRevision(), callId: `commit:${attempt.entity_id}` },
    );
    commits.push(committed.commit);
    controller.report(attempt.entity_id, {
      workerStatus: "completed",
      summary: `candidate ${attempt.entity_id}`,
      resultCommit: committed.commit,
    });
  }
  controller.step(); // TASK_VERIFYING
  return { attempts: created, commits };
}

describe("verified -> selected -> gated-promoted chain (R9)", () => {
  it("promotes the tournament winner through the gate when evidence passes", async () => {
    const { controller, cleanup } = makeRig();
    try {
      const { attempts } = await driveFourCompleted(controller);
      // Give every candidate passing tests evidence.
      for (const attempt of attempts) {
        await controller.gate({
          attemptId: attempt.entity_id,
          predicate: "tests_pass",
          command: ["pytest"],
          exitCode: 0,
        });
      }
      // The judge always prefers the lexicographically last candidate.
      const winnerJudge = {
        compare(
          left: { id: string; summary: string },
          right: { id: string; summary: string },
        ) {
          return left.id > right.id ? "left" : "right";
        },
      };
      const chain = await controller.selectAndPromoteWhenGatePasses(
        winnerJudge,
        "gate-release",
        HEAD,
      );
      expect(chain.tournament.comparisons).toBe(3);
      expect(chain.outcome.promoted).toBe(true);
      if (chain.outcome.promoted) {
        expect(chain.outcome.result.committed.event_type).toBe("PROMOTION_COMMITTED");
        expect(controller.step()?.event_type).toBe("TASK_SATISFIED");
      }
    } finally {
      await cleanup();
    }
  });

  it("refuses promotion when the winner lacks the gating evidence", async () => {
    const { controller, cleanup } = makeRig();
    try {
      await driveFourCompleted(controller);
      // No evidence recorded at all -> the winner verdict is INCOMPLETE.
      const chain = await controller.selectAndPromoteWhenGatePasses(
        preferred("winner"),
        "gate-release",
        HEAD,
      );
      expect(chain.tournament.comparisons).toBe(3);
      expect(chain.outcome.promoted).toBe(false);
      if (!chain.outcome.promoted) {
        expect(chain.outcome.verdict).toBe("INCOMPLETE");
        expect(chain.outcome.nextEvidenceNeeded).toContain("exists(tests_pass)");
      }
      const committed = controller.store.connection
        .prepare("SELECT COUNT(*) AS total FROM events WHERE event_type='PROMOTION_COMMITTED'")
        .get() as { total: number };
      expect(committed.total).toBe(0);
    } finally {
      await cleanup();
    }
  });

  it("fails closed when there is no completed candidate", async () => {
    const { controller, cleanup } = makeRig();
    try {
      controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      controller.step(); // TASK_STARTED, no attempts yet
      await expect(
        controller.selectAndPromoteWhenGatePasses(preferred("x"), "gate-release", HEAD),
      ).rejects.toThrow(/no completed candidates/);
      void DomainValidationError;
    } finally {
      await cleanup();
    }
  });
});

