import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseGateDefinition, type GateDefinition } from "../src/evidence/index.js";
import { preferredJudge as preferred } from "../src/select/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import { PlanReconciliationError } from "../src/advanced.js";

import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);

const GATE = parseGateDefinition({
  gate_id: "gate-release",
  version: 1,
  subject_type: "attempt",
  require: { all: [{ exists: { predicate: "tests_pass" } }] },
});

/**
 * Open (or reopen) a session against the same two SQLite files. The shared
 * FakeGitPort models the persistent repository; orchestration truth lives in
 * the DB files and is reopened on every session.
 */
function openSession(dbPath: string, opsPath: string, git: FakeGitPort) {
  const store = new EventStore(dbPath, { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({ databasePath: opsPath, git });
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
      attempt_limit: 2,
      candidate_limit: 1,
    }),
    clock: () => "2026-08-13T00:00:00Z",
  });
  return {
    store,
    controller,
    effects,
    close: async () => {
      await effects.close();
      store.close();
    },
  };
}

function countEvents(controller: ProjectController): number {
  const row = controller.store.connection
    .prepare("SELECT COUNT(*) AS total FROM events")
    .get() as { total: number };
  return Number(row.total);
}

function eventTypes(controller: ProjectController): string[] {
  return (
    controller.store.connection
      .prepare("SELECT event_type FROM events ORDER BY event_id")
      .all() as Array<{ event_type: string }>
  ).map((row) => row.event_type);
}

describe("E3 resume: status block and cross-session continue", () => {
  it("the resume block is read-only and classifies the breakpoint", async () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-e3-"));
    const s = openSession(join(dir, "p.sqlite"), join(dir, "o.sqlite"), new FakeGitPort(HEAD));
    try {
      s.controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      s.controller.declareGate(GATE, "h1-test");
      // A fresh READY task: the next decision is TASK_STARTED -> progress.
      const before = countEvents(s.controller);
      expect(s.controller.status().resume).toMatchObject({ action: "progress" });
      const afterRepeat = countEvents(s.controller);
      expect(afterRepeat).toBe(before);

      // Once the batch is launched, the breakpoint is: create an attempt for a worker.
      s.controller.step(); // TASK_STARTED
      expect(s.controller.status().resume).toMatchObject({
        action: "dispatch_worker",
        detail: expect.stringContaining("ATTEMPT_CREATED"),
      });
      expect(countEvents(s.controller)).toBe(before + 1);
    } finally {
      await s.close();
    }
  });

  it("a killed session is continued by a new one: VERIFYING -> gate -> promote -> idle", async () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-e3-"));
    const dbPath = join(dir, "p.sqlite");
    const opsPath = join(dir, "o.sqlite");
    const git = new FakeGitPort(HEAD);

    // ---- Session 1: start, complete one candidate, land at VERIFYING ----
    let run = 0;
    {
      const s = openSession(dbPath, opsPath, git);
      s.controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      s.controller.declareGate(GATE, "h1-test");
      s.controller.step(); // TASK_STARTED
      const created = s.controller.step()!; // ATTEMPT_CREATED
      await s.controller.claim(created.entity_id);
      const committed = await s.controller.effects.invoke(
        s.controller.effects.actions.gitCommit,
        { worktreeId: created.entity_id, message: "work" },
        { scope: s.controller.projectId, revision: s.controller.promotions.projectRevision(), callId: `commit:${created.entity_id}` },
      );
      s.controller.report(created.entity_id, {
        workerStatus: "completed",
        summary: "implemented",
        resultCommit: committed.commit,
      });
      s.controller.step(); // TASK_VERIFYING
      run = s.controller.status().revision;
      await s.close(); // "kill" the session: everything below lands only on disk
    }
    expect(run).toBe(0);

    // ---- Session 2: reopen the same files and continue from the resume block ----
    {
      const s = openSession(dbPath, opsPath, git);
      s.controller.declareGate(GATE, "h1-test");
      try {
        const resumed = s.controller.status();
        expect(resumed.tasks[0]).toMatchObject({ task_id: "task-1", state: "VERIFYING" });
        expect(resumed.attempts[0]).toMatchObject({ state: "COMPLETED" });
        expect(resumed.resume).toMatchObject({ action: "gate_and_promote" });
        // The orchestration truth was fully rebuilt from disk: session-1 events
        // are present before this session ever acted.
        const before = eventTypes(s.controller);
        expect(before).toContain("ATTEMPT_COMPLETED");

        // Continue: record the gating evidence, then promote through the gate.
        const winner = resumed.attempts[0]!.attempt_id;
        await s.controller.gate({
          attemptId: winner,
          predicate: "tests_pass",
          command: ["pytest"],
          exitCode: 0,
        });
        s.controller.declareJudge({ judgeId: "host-llm", kind: "llm", declaredBy: "h1-test" });
        const outcome = await s.controller.selectAndPromoteWhenGatePasses(
          preferred("winner"),
          "gate-release",
          HEAD,
        );
        expect(outcome.outcome.promoted).toBe(true);
        expect(s.controller.step()?.event_type).toBe("TASK_SATISFIED");
        const after = s.controller.status();
        expect(after.tasks[0]).toMatchObject({ state: "SATISFIED" });
        expect(after.resume.action).toBe("idle");
      } finally {
        await s.close();
      }
    }

    // ---- Session 3: a terminal project stays terminal across another reopen ----
    const t = openSession(dbPath, opsPath, git);
    try {
      const terminal = t.controller.status();
      expect(terminal.tasks[0]).toMatchObject({ state: "SATISFIED" });
      expect(terminal.resume.action).toBe("idle");
      expect(eventTypes(t.controller)).toContain("PROMOTION_COMMITTED");
    } finally {
      await t.close();
    }
  });

  it("a paused project reports its resume action as paused across sessions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-e3-"));
    const dbPath = join(dir, "p.sqlite");
    const opsPath = join(dir, "o.sqlite");
    const git = new FakeGitPort(HEAD);
    {
      const s = openSession(dbPath, opsPath, git);
      s.controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      s.controller.declareGate(GATE, "h1-test");
      s.controller.pause("audit hold");
      await s.close();
    }
    const s = openSession(dbPath, opsPath, git);
    try {
      expect(s.controller.status().resume.action).toBe("paused");
      expect(s.controller.status().schedulerState).toBe("PAUSED");
    } finally {
      await s.close();
    }
  });

  it("status stays observable when a live world refuses a revision (the CF-V-05 stale world is unreachable)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-e3-"));
    const s = openSession(join(dir, "p.sqlite"), join(dir, "o.sqlite"), new FakeGitPort(HEAD));
    try {
      s.controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      s.controller.declareGate(GATE, "h1-test");
      s.controller.step(); // TASK_STARTED
      const created = s.controller.step()!; // ATTEMPT_CREATED
      await s.controller.claim(created.entity_id); // RUNNING, in flight
      // G10-W contract change: the revision contract requires quiescence (or an
      // explicit invalidation that settles the affected work). `metadata_only`
      // settles nothing, so bumping the revision while the batch is still ACTIVE
      // is now REFUSED with zero events. That is exactly what retires the
      // CF-V-05 stale world: a live ACTIVE task can no longer be left bound to
      // an older ProjectIR revision, so the old "scheduler cannot advance a
      // stale world" block is unreachable through the public API. status() still
      // must not throw - observation reports the live state honestly.
      let blocked: unknown;
      try {
        s.controller.plan({ tasks: [taskSpec("task-1")], changeClass: "metadata_only" });
      } catch (error) {
        blocked = error;
      }
      expect(blocked).toBeInstanceOf(PlanReconciliationError);
      expect((blocked as PlanReconciliationError).kind).toBe("quiescence_required");
      const status = s.controller.status();
      expect(status.revision).toBe(0); // zero events: the revision was refused
      expect(status.resume.action).toBe("awaiting_worker");
      expect(status.resume.inFlightAttemptIds).toContain(created.entity_id);
      // Idempotent observation; the world is byte-for-byte unchanged.
      const observed = s.controller.status();
      expect(observed.resume.action).toBe("awaiting_worker");
      expect(observed.tasks.map((task) => task.state)).toEqual(["ACTIVE"]);
    } finally {
      await s.close();
    }
  });
});
