/**
 * The twelve fault-acceptance scenarios (docs/05 §3) in plugin shape.
 *
 * Each scenario drives the ProjectController / tool surface end to end and
 * asserts the frozen baseline's guarantee in the plugin form. Scenarios 10/11
 * (Promotion Crash A/B) are machine-verified at the action and manager
 * levels in test/effects.crash.test.ts and test/promotion.test.ts; here they
 * are exercised through the controller's promote() happy path.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { snapshotDigest, PROJECTION_TABLES } from "../src/state/index.js";
import { DomainValidationError } from "../src/domain/index.js";
import { FakeGitPort, createPalimpsestEffects, PromotionManager } from "../src/effects/index.js";
import { Scheduler } from "../src/scheduler/index.js";

import {
  FakeClock,
  makeProject,
  makeReport,
  setupScheduler,
  taskSpec,
  tempStatePath,
  trustedDefaultPolicy,
} from "./helpers.js";

const HEAD = "c".repeat(40);

interface Rig {
  store: EventStore;
  controller: ProjectController;
  git: FakeGitPort;
  cleanup(): Promise<void>;
}

/** One project wired like installPalimpsest but with full control over store/effects. */
async function rig(
  projectId = "scheduler-project",
  paths: { statePath?: string; ordariumPath?: string } = {},
): Promise<Rig> {
  const store = new EventStore(paths.statePath ?? tempStatePath(), {
    clock: new FakeClock().next,
  });
  const git = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({
    databasePath: paths.ordariumPath ?? join(mkdtempSync(join(tmpdir(), "palimpsest-acc-")), "ops.sqlite"),
    git,
  });
  const policy = trustedDefaultPolicy();
  const controller = new ProjectController({
    store,
    effects,
    projectId,
    policy,
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

/** start + step to ATTEMPT_CREATED, returning the attempt id. */
async function driveToAttempt(controller: ProjectController): Promise<string> {
  controller.start({
    projectId: controller.projectId,
    goal: "g",
    tasks: [taskSpec("task-1")],
  });
  controller.step(); // TASK_STARTED
  const created = controller.step()!; // ATTEMPT_CREATED
  return created.entity_id;
}

describe("the twelve fault-acceptance scenarios in plugin shape", () => {
  it("1. pause/resume: no dispatch while paused, resume continues without duplicate work", async () => {
    const { controller, cleanup } = await rig();
    try {
      const attemptId = await driveToAttempt(controller);
      controller.pause("human break");
      expect(controller.step()).toBeNull(); // paused: no decisions
      controller.resume("back to work");
      expect(controller.status().schedulerState).toBe("RUNNING");
      // The paused window appended nothing new; the batch resumes intact.
      await controller.claim(attemptId);
      controller.report(attemptId, { workerStatus: "failed", summary: "resumed" });
      const settle = controller.step()!;
      expect(settle.event_type).toBe("TASK_READY");
      const started = controller.store.connection
        .prepare("SELECT COUNT(*) AS total FROM events WHERE event_type='TASK_STARTED'")
        .get() as { total: number };
      expect(started.total).toBe(1); // no duplicate activation
    } finally {
      await cleanup();
    }
  });

  it("2. crash recovery: reopening the ledger restores state and resumes", async () => {
    const path = tempStatePath();
    const ordariumPath = join(mkdtempSync(join(tmpdir(), "palimpsest-acc-")), "ops.sqlite");
    let attemptId: string;
    {
      const { controller, cleanup } = await rig("scheduler-project", {
        statePath: path,
        ordariumPath,
      });
      try {
        attemptId = await driveToAttempt(controller);
        await controller.claim(attemptId);
        controller.report(attemptId, { workerStatus: "failed", summary: "crash after report" });
      } finally {
        await cleanup();
      }
    }
    // "Restart": a fresh controller over the same ledgers.
    const { controller, cleanup } = await rig("scheduler-project", {
      statePath: path,
      ordariumPath,
    });
    try {
      const status = controller.status();
      expect(status.tasks[0]).toMatchObject({ state: "ACTIVE" });
      expect(status.attempts[0]).toMatchObject({ state: "FAILED" });
      const next = controller.step(); // settle the failed batch -> READY
      expect(next?.event_type).toBe("TASK_READY");
    } finally {
      await cleanup();
    }
  });

  it("3. snapshot rebuild: projections can be rebuilt from the Event Log identically", async () => {
    const { controller, cleanup } = await rig();
    try {
      const attemptId = await driveToAttempt(controller);
      await controller.claim(attemptId);
      controller.report(attemptId, { workerStatus: "failed", summary: "boom" });
      controller.step(); // settle -> TASK_READY
      const before = snapshotDigest(controller.store.connection);
      for (const table of PROJECTION_TABLES) {
        controller.store.connection.exec(`DELETE FROM ${table}`);
      }
      controller.store.rebuildProjections();
      expect(snapshotDigest(controller.store.connection)).toBe(before);
    } finally {
      await cleanup();
    }
  });

  it("4. local retry: a failed batch retries the task without rerunning anything else", async () => {
    const { controller, cleanup } = await rig();
    try {
      const attemptId = await driveToAttempt(controller);
      await controller.claim(attemptId);
      controller.report(attemptId, { workerStatus: "failed", summary: "shape mismatch" });
      const settle = controller.step()!;
      expect(settle.event_type).toBe("TASK_READY");
      const activation = controller.step()!;
      expect(activation.event_type).toBe("TASK_STARTED");
      const second = controller.step()!;
      expect(second.event_type).toBe("ATTEMPT_CREATED");
      expect(second.entity_id).not.toBe(attemptId);
      // Only the retried task exists; nothing else was rerun.
      const attempts = controller.store.connection
        .prepare("SELECT COUNT(*) AS total FROM attempts")
        .get() as { total: number };
      expect(attempts.total).toBe(2);
    } finally {
      await cleanup();
    }
  });

  it("5. lease expiry: an expired attempt frees the batch for retry", async () => {
    const { controller, cleanup } = await rig();
    try {
      const attemptId = await driveToAttempt(controller);
      await controller.claim(attemptId);
      controller.report(attemptId, { workerStatus: "expired", summary: "lease ran out" });
      const settle = controller.step()!;
      expect(settle.event_type).toBe("TASK_READY");
      const activation = controller.step()!;
      expect(activation.event_type).toBe("TASK_STARTED");
      expect(controller.step()?.event_type).toBe("ATTEMPT_CREATED");
    } finally {
      await cleanup();
    }
  });

  it("6. late result: a returned worker after expiry is recorded STALE and never accepted", async () => {
    const { controller, cleanup } = await rig();
    try {
      const attemptId = await driveToAttempt(controller);
      await controller.claim(attemptId);
      controller.report(attemptId, { workerStatus: "expired", summary: "lease expired" });
      controller.step(); // TASK_READY
      controller.step(); // TASK_STARTED
      const second = controller.step()!; // ATTEMPT_CREATED #2
      // The old worker finally returns, claiming success.
      const late = controller.reportLate(attemptId, {
        workerStatus: "completed",
        summary: "actually I finished",
      });
      expect(late.event_type).toBe("ATTEMPT_LATE_RESULT");
      const status = controller.status();
      const old = status.attempts.find((a) => a.attempt_id === attemptId)!;
      expect(old.state).toBe("STALE");
      // The new batch is untouched and can still proceed.
      expect(status.attempts.find((a) => a.attempt_id === second.entity_id)?.state).toBe(
        "CREATED",
      );
    } finally {
      await cleanup();
    }
  });

  it("7. revision change: planning invalidates the running task (STALE) and halts scheduling", async () => {
    const { controller, cleanup } = await rig();
    try {
      const attemptId = await driveToAttempt(controller);
      await controller.claim(attemptId);
      controller.plan({ tasks: [taskSpec("task-1"), taskSpec("task-2", ["task-1"])] });
      const stale = controller.invalidateTask("task-1", "architecture contract changed");
      expect(stale.event_type).toBe("TASK_STALE");
      const status = controller.status();
      expect(status.tasks[0]).toMatchObject({ task_id: "task-1", state: "STALE" });
      expect(controller.step()).toBeNull(); // no scheduling from a stale task
      void attemptId;
    } finally {
      await cleanup();
    }
  });

  it("8. evidence invalidation: superseded evidence is marked stale, history preserved", async () => {
    const { controller, cleanup } = await rig();
    try {
      const attemptId = await driveToAttempt(controller);
      const gate = await controller.gate({
        attemptId,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      const evidenceId = gate.entity_id;
      expect(
        (controller.status().evidence.find((e) => e.evidence_id === evidenceId))?.status,
      ).toBe("active");
      controller.invalidateEvidence(evidenceId, "commit superseded by revision change");
      expect(
        (controller.status().evidence.find((e) => e.evidence_id === evidenceId))?.status,
      ).toBe("stale");
    } finally {
      await cleanup();
    }
  });

  it("9. write escape: a failing write-scope gate produces evidence, never promotion", async () => {
    const { controller, cleanup } = await rig();
    try {
      const attemptId = await driveToAttempt(controller);
      const gate = await controller.gate({
        attemptId,
        predicate: "write_scope_valid",
        command: ["check-write-scope"],
        exitCode: 1, // the gate detected an out-of-scope write
      });
      expect(gate.event_type).toBe("EVIDENCE_ADDED");
      const status = controller.status();
      expect(status.evidence[0]).toMatchObject({ status: "active" });
      // A failing scope gate must not make the batch eligible for promotion.
      expect(status.attempts[0]?.state).not.toBe("COMPLETED");
    } finally {
      await cleanup();
    }
  });

  it("10/11. promotion happy path through the controller (crash windows verified in P1 suites)", async () => {
    const { controller, git, cleanup } = await rig();
    try {
      const attemptId = await driveToAttempt(controller);
      await controller.claim(attemptId);
      // Commit real work through the effects layer so promotion has a source.
      const committed = await controller.effects.invoke(
        controller.effects.actions.gitCommit,
        { worktreeId: attemptId, message: "work" },
        { scope: controller.projectId, revision: controller.promotions.projectRevision(), callId: `commit:${attemptId}` },
      );
      controller.report(attemptId, {
        workerStatus: "completed",
        summary: "done",
        resultCommit: committed.commit,
      });
      await controller.gate({
        attemptId,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      const verifying = controller.step()!;
      expect(verifying.event_type).toBe("TASK_VERIFYING");
      const result = await controller.promote(
        attemptId,
        committed.commit,
        HEAD,
      );
      expect(result.committed.event_type).toBe("PROMOTION_COMMITTED");
      const satisfied = controller.step()!;
      expect(satisfied.event_type).toBe("TASK_SATISFIED");
      expect(await git.head()).toBe(result.resultingHeadCommit);
    } finally {
      await cleanup();
    }
  });

  it("12. event idempotency: duplicate submissions append nothing and return the stored event", async () => {
    const { controller, cleanup } = await rig();
    try {
      const first = controller.start({
        projectId: controller.projectId,
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      const again = controller.start({
        projectId: controller.projectId,
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      expect(again.event_id).toBe(first.event_id);
      const count = controller.store.connection
        .prepare("SELECT COUNT(*) AS total FROM events WHERE event_type='PROJECT_CREATED'")
        .get() as { total: number };
      expect(count.total).toBe(1);
      // A reused key with a different request is rejected.
      const { actionKey } = await import("../src/domain/index.js");
      const conflict = {
        schema_version: 1,
        project_id: controller.projectId,
        event_type: "SCHEDULER_PAUSED",
        payload_version: 1,
        entity_type: "scheduler_control",
        entity_id: controller.projectId,
        payload: { reason: "x" },
        causation_id: null,
        correlation_id: "conflict",
        idempotency_key: actionKey("scheduler-project-create", {
          project: controller.projectId,
        }),
        expected_project_revision: null,
      };
      const { IdempotencyConflict } = await import("../src/state/index.js");
      expect(() =>
        controller.store.append(conflict as never, {
          committedAt: "2026-08-13T00:00:01Z",
        }),
      ).toThrow(IdempotencyConflict);
    } finally {
      await cleanup();
    }
  });
});

void makeProject;
void makeReport;
void setupScheduler;
void Scheduler;
void PromotionManager;
