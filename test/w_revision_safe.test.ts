/**
 * G10-W — Revision-safe Work evolution (behavioural suite).
 *
 * These tests assert REAL behaviour of the revision contract, not source shape:
 *
 *   - `plan()`/`planReconciled()` commit the COMPLETE structural closure as ONE
 *     `appendAtomic` batch, or write ZERO events and throw a typed
 *     `PlanReconciliationError`;
 *   - a revision while work is in flight requires an explicit typed
 *     invalidation that stales the affected tasks inside the same batch;
 *   - the CF-V-05 repro (`start → plan → step`) now activates the task on the
 *     NEW head instead of failing the activation's revision guard;
 *   - retention/added/removed semantics are dependency-derived and honest;
 *   - the batch is atomic under an injected crash, idempotent on retry, and
 *     conflict/fail-closed on identity reuse and partial presence;
 *   - canonical invariants (envelope == ProjectIR head, terminal history and
 *     evidence untouched, holds revision-anchored, full verify/rebuild green)
 *     hold after every revision.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import { EventStore, IdempotencyConflict } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort, type PromoteResult } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import type {
  Decision,
  NewEvent,
  ProjectIr,
  SchedulerEvent,
  TaskEnvelope,
} from "../src/schema/index.js";
import { parseProjectIr } from "../src/schema/index.js";
import { AtomicAppendError, PlanReconciliationError } from "../src/advanced.js";

import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const CLOCK = "2026-09-15T00:00:00Z";
const PROJECT = "scheduler-project";

const DECISION: Decision = {
  decision_id: "dec-genesis",
  statement: "Adopt the append-only ledger as the single project truth.",
  rationale: "Replayability and auditability.",
  evidence_ids: [],
  supersedes: null,
};

interface Rig {
  readonly dir: string;
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly git: FakeGitPort;
  cleanup(): Promise<void>;
}

async function rig(): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-wrev-"));
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({ databasePath: join(dir, "o.sqlite"), git });
  const controller = new ProjectController({
    store,
    effects,
    projectId: PROJECT,
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => CLOCK,
  });
  return {
    dir,
    store,
    controller,
    git,
    cleanup: async () => {
      await effects.close();
      try {
        store.close();
      } catch {
        // already closed by a fault-injection test that reopened the file
      }
    },
  };
}

function eventCount(store: EventStore): number {
  return store.listEvents(PROJECT).length;
}

function eventsOfType(store: EventStore, eventType: string): SchedulerEvent[] {
  return store.listEvents(PROJECT).filter((event) => event.event_type === eventType);
}

function taskState(store: EventStore, taskId: string): string | undefined {
  const row = store.connection
    .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
    .get(PROJECT, taskId) as { state: string } | undefined;
  return row === undefined ? undefined : String(row.state);
}

function envelopeOf(store: EventStore, taskId: string): TaskEnvelope | undefined {
  const row = store.connection
    .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
    .get(PROJECT, taskId) as { envelope_json: Uint8Array | null } | undefined;
  if (row === undefined || row.envelope_json === null) return undefined;
  return JSON.parse(new TextDecoder().decode(row.envelope_json)) as TaskEnvelope;
}

/** The canonical ProjectIR head as stored on the log (digest, head_commit, …). */
function readIr(store: EventStore): ProjectIr {
  const row = store.connection
    .prepare("SELECT state_json FROM projects WHERE project_id=?")
    .get(PROJECT) as { state_json: Uint8Array | null } | undefined;
  if (row === undefined || row.state_json === null) throw new Error("project is not initialized");
  return parseProjectIr(JSON.parse(new TextDecoder().decode(row.state_json)));
}

function planError(run: () => unknown): PlanReconciliationError {
  try {
    run();
  } catch (error) {
    if (error instanceof PlanReconciliationError) return error;
    throw error;
  }
  throw new Error("expected PlanReconciliationError, but the call returned normally");
}

/**
 * Drive the only READY task through claim → report → gate → promote →
 * SATISFIED. `alreadyStarted` skips the TASK_STARTED step when the caller has
 * already consumed it.
 */
async function driveToSatisfied(
  target: Rig,
  options: { alreadyStarted?: boolean } = {},
): Promise<PromoteResult> {
  const { controller } = target;
  if (options.alreadyStarted !== true) {
    expect(controller.step()!.event_type).toBe("TASK_STARTED");
  }
  const created = controller.step()!;
  expect(created.event_type).toBe("ATTEMPT_CREATED");
  const attemptId = created.entity_id;
  await controller.claim(attemptId);
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
  await controller.gate({
    attemptId,
    predicate: "tests_pass",
    command: ["python", "-m", "pytest"],
  });
  expect(controller.step()!.event_type).toBe("TASK_VERIFYING");
  const result = await controller.promote(attemptId, committed.commit, HEAD);
  expect(controller.step()!.event_type).toBe("TASK_SATISFIED");
  return result;
}

describe("G10-W revision-safe Work evolution", () => {
  it("CF-V-05 repro: start(rev0, A READY) → plan(rev1) → step() activates A on the NEW head", async () => {
    const r = await rig();
    try {
      r.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
      const rev0 = readIr(r.store);

      const outcome = r.controller.planReconciled({ tasks: [taskSpec("task-a")] });
      expect(outcome.result.revision).toBe(1);
      expect(outcome.result.retainedReauthorized).toEqual(["task-a"]);

      // The retained envelope is rebound against the new head - the defect was
      // that the scheduler's stored envelope stayed at the OLD revision.
      const reauthorized = eventsOfType(r.store, "TASK_REAUTHORIZED");
      expect(reauthorized).toHaveLength(1);
      expect(reauthorized[0]!.entity_id).toBe("task-a");
      const head = readIr(r.store);
      expect(head.revision).toBe(1);
      const envelope = envelopeOf(r.store, "task-a")!;
      expect(envelope.project_revision).toBe(head.revision);
      expect(envelope.project_digest).toBe(head.digest);
      expect(envelope.project_digest).not.toBe(rev0.digest);
      expect(envelope.base_commit).toBe(head.head_commit);

      // The next activation is bound to rev1 and does NOT fail a revision guard.
      const started = r.controller.step()!;
      expect(started.event_type).toBe("TASK_STARTED");
      expect(started.entity_id).toBe("task-a");
      expect(started.expected_project_revision).toBe(1);
    } finally {
      await r.cleanup();
    }
  });

  it("retained E2E: rev1 keeps a READY + BLOCKED pair, rebinds both envelopes, scheduler continues", async () => {
    const r = await rig();
    try {
      r.controller.start({
        projectId: PROJECT,
        goal: "g",
        decisions: [{ ...DECISION }],
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      expect(taskState(r.store, "task-a")).toBe("READY");
      expect(taskState(r.store, "task-b")).toBe("BLOCKED");

      const outcome = r.controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
        decisions: [
          { ...DECISION },
          {
            decision_id: "dec-2",
            statement: "Supersede the genesis decision.",
            rationale: "Narrower than needed.",
            evidence_ids: [],
            supersedes: DECISION.decision_id,
          },
        ],
      });
      expect(outcome.result.retainedReauthorized).toEqual(["task-a", "task-b"]);
      expect(outcome.result.added).toEqual([]);
      expect(outcome.result.removedStaled).toEqual([]);

      // States are PRESERVED by the revision (only envelopes move).
      expect(taskState(r.store, "task-a")).toBe("READY");
      expect(taskState(r.store, "task-b")).toBe("BLOCKED");
      const head = readIr(r.store);
      for (const taskId of ["task-a", "task-b"]) {
        const envelope = envelopeOf(r.store, taskId)!;
        expect(envelope.project_revision).toBe(1);
        expect(envelope.project_digest).toBe(head.digest);
      }
      expect(readIr(r.store).decisions).toHaveLength(2);
      // The scheduler continues on the new head.
      expect(r.controller.step()!.event_type).toBe("TASK_STARTED");
    } finally {
      await r.cleanup();
    }
  });

  it("added E2E: rev1 adds B(depends_on A) with a dependency-derived state and a real tasks row", async () => {
    const r = await rig();
    try {
      r.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
      const outcome = r.controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      expect(outcome.result.added).toEqual(["task-b"]);
      // A is unsatisfied → the added task is BLOCKED, derived from dependencies.
      expect(taskState(r.store, "task-b")).toBe("BLOCKED");
      expect(envelopeOf(r.store, "task-b")!.project_revision).toBe(1);
      expect(
        eventsOfType(r.store, "TASK_CREATED").some((event) => event.entity_id === "task-b"),
      ).toBe(true);
      // A is the only runnable task; B waits on the dependency.
      expect(r.controller.step()!.event_type).toBe("TASK_STARTED");

      await driveToSatisfied(r, { alreadyStarted: true });
      expect(taskState(r.store, "task-a")).toBe("SATISFIED");
      // Now the dependency is satisfied and the scheduler derives B READY.
      const ready = r.controller.step()!;
      expect(ready.event_type).toBe("TASK_READY");
      expect(ready.entity_id).toBe("task-b");
      expect(taskState(r.store, "task-b")).toBe("READY");
    } finally {
      await r.cleanup();
    }
  });

  it("removed E2E: rev1 drops a runnable task → TASK_STALE, history retained, never scheduled again", async () => {
    const r = await rig();
    try {
      r.controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      const createdBefore = eventsOfType(r.store, "TASK_CREATED").length;
      const outcome = r.controller.planReconciled({ tasks: [taskSpec("task-a")] });
      expect(outcome.result.removedStaled).toEqual(["task-b"]);
      expect(taskState(r.store, "task-b")).toBe("STALE");
      const staleEvents = eventsOfType(r.store, "TASK_STALE");
      expect(staleEvents).toHaveLength(1);
      expect(staleEvents[0]!.entity_id).toBe("task-b");
      // History is retained: the creation event is still on the log.
      expect(eventsOfType(r.store, "TASK_CREATED")).toHaveLength(createdBefore);
      expect(
        r.store
          .listEvents(PROJECT)
          .some((event) => event.entity_id === "task-b" && event.event_type === "TASK_CREATED"),
      ).toBe(true);

      await driveToSatisfied(r);
      // B can never be activated again: it is STALE, not a runnable state.
      expect(r.controller.step()).toBeNull();
      expect(taskState(r.store, "task-b")).toBe("STALE");
    } finally {
      await r.cleanup();
    }
  });

  it("modified-same-id negative: a changed objective under the same id is blocked with ZERO events and no inheritance", async () => {
    const r = await rig();
    try {
      r.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
      const before = eventCount(r.store);
      const originalEnvelope = envelopeOf(r.store, "task-a")!;

      const blocked = planError(() =>
        r.controller.plan({
          tasks: [{ ...taskSpec("task-a"), objective: "a different meaning" }],
        }),
      );
      expect(blocked.kind).toBe("replacement_task_id_required");
      expect(blocked.refs).toEqual(["task-a"]);
      // No partial or legacy closure: not a single event.
      expect(eventCount(r.store)).toBe(before);
      expect(readIr(r.store).revision).toBe(0);
      // No state or evidence inheritance: the old envelope is unchanged.
      expect(envelopeOf(r.store, "task-a")).toEqual(originalEnvelope);
      expect(eventsOfType(r.store, "TASK_REAUTHORIZED")).toHaveLength(0);
      expect(eventsOfType(r.store, "PROJECT_REVISED")).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });

  it("in-flight negative: an ACTIVE task or an open attempt blocks with quiescence_required and ZERO revision events", async () => {
    const r = await rig();
    try {
      r.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
      r.controller.step(); // TASK_STARTED → task-a ACTIVE
      const created = r.controller.step()!; // ATTEMPT_CREATED → open attempt
      const attemptId = created.entity_id;
      await r.controller.claim(attemptId); // RUNNING

      const before = eventCount(r.store);
      const blocked = planError(() => r.controller.plan({ tasks: [taskSpec("task-a")] }));
      expect(blocked.kind).toBe("quiescence_required");
      expect(blocked.refs).toContain("task-a");
      expect(blocked.refs).toContain(attemptId);
      expect(eventCount(r.store)).toBe(before);
      expect(eventsOfType(r.store, "PROJECT_REVISED")).toHaveLength(0);
      expect(readIr(r.store).revision).toBe(0);

      // The live worker stays valid: still RUNNING and still able to gate.
      expect(r.controller.status().attempts.find((a) => a.attempt_id === attemptId)?.state).toBe(
        "RUNNING",
      );
      const gate = await r.controller.gate({
        attemptId,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
      });
      expect(gate.event_type).toBe("EVIDENCE_ADDED");
    } finally {
      await r.cleanup();
    }
  });

  it("in-flight negative: an unclaimed (CREATED) attempt also blocks quiescence", async () => {
    const r = await rig();
    try {
      r.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
      r.controller.step();
      const created = r.controller.step()!; // CREATED, never claimed
      const blocked = planError(() => r.controller.plan({ tasks: [taskSpec("task-a")] }));
      expect(blocked.kind).toBe("quiescence_required");
      expect(blocked.refs).toContain(created.entity_id);
      expect(eventsOfType(r.store, "PROJECT_REVISED")).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });

  it("atomicity: a crash after the PROJECT_REVISED insert leaves the state entirely OLD after reopen", async () => {
    const r = await rig();
    let reopened: EventStore | undefined;
    try {
      r.controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      const before = eventCount(r.store);
      injectAtomicFault(
        r.store,
        (checkpoint, event) =>
          checkpoint === "after_event_insert" && event?.event_type === "PROJECT_REVISED",
      );
      expect(() =>
        r.controller.planReconciled({
          tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"]), taskSpec("task-c")],
        }),
      ).toThrow(/injected crash/);

      r.store.close();
      reopened = new EventStore(join(r.dir, "p.sqlite"), { clock: new FakeClock().next });
      expect(reopened.listEvents(PROJECT)).toHaveLength(before);
      expect(
        reopened.connection.prepare("SELECT revision FROM projects WHERE project_id=?").get(PROJECT),
      ).toMatchObject({ revision: 0 });
      expect(taskState(reopened, "task-c")).toBeUndefined();
      expect(envelopeOf(reopened, "task-a")!.project_revision).toBe(0);
      expect(
        reopened.listEvents(PROJECT).filter((e) => e.event_type === "PROJECT_REVISED"),
      ).toHaveLength(0);
    } finally {
      reopened?.close();
      await r.cleanup();
    }
  });

  it("atomicity: a crash after one reauthorization leaves no half-reconciled graph", async () => {
    const r = await rig();
    let reopened: EventStore | undefined;
    try {
      r.controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      const before = eventCount(r.store);
      injectAtomicFault(
        r.store,
        (checkpoint, event) =>
          checkpoint === "after_event_insert" && event?.event_type === "TASK_REAUTHORIZED",
      );
      expect(() =>
        r.controller.planReconciled({
          tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"]), taskSpec("task-c")],
        }),
      ).toThrow(/injected crash/);

      r.store.close();
      reopened = new EventStore(join(r.dir, "p.sqlite"), { clock: new FakeClock().next });
      expect(reopened.listEvents(PROJECT)).toHaveLength(before);
      expect(envelopeOf(reopened, "task-a")!.project_revision).toBe(0);
      expect(envelopeOf(reopened, "task-b")!.project_revision).toBe(0);
      expect(taskState(reopened, "task-c")).toBeUndefined();
      expect(
        reopened.listEvents(PROJECT).filter((e) => e.event_type === "TASK_REAUTHORIZED"),
      ).toHaveLength(0);
    } finally {
      reopened?.close();
      await r.cleanup();
    }
  });

  it("idempotency: identical retry is a no-op and same identity with different content conflicts", async () => {
    const r = await rig();
    try {
      r.controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      const batches = captureBatches(r.store);
      r.controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      expect(batches).toHaveLength(1);
      const batch = batches[0]!;
      expect(batch.map((request) => request.event_type)).toEqual([
        "PROJECT_REVISED",
        "TASK_REAUTHORIZED",
        "TASK_REAUTHORIZED",
      ]);
      const afterFirst = eventCount(r.store);

      // Identical full-batch retry: resolves to the stored events, writes nothing.
      const retried = r.store.appendAtomic(batch);
      expect(retried.map((event) => event.event_type)).toEqual(
        batch.map((request) => request.event_type),
      );
      expect(eventCount(r.store)).toBe(afterFirst);

      // Same identity, different content: an IdempotencyConflict, never a silent
      // overwrite and never a duplicate update.
      const tampered = batch.map((request, index) =>
        index === 1 ? { ...request, correlation_id: `${request.correlation_id}:tampered` } : request,
      ) as NewEvent[];
      expect(() => r.store.appendAtomic(tampered)).toThrow(IdempotencyConflict);
      expect(eventCount(r.store)).toBe(afterFirst);
      expect(eventsOfType(r.store, "TASK_REAUTHORIZED")).toHaveLength(2);
    } finally {
      await r.cleanup();
    }
  });

  it("idempotency: a partially-present batch fails closed (recovery_required)", async () => {
    const r = await rig();
    try {
      r.controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      const batches = captureBatches(r.store);
      r.controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      const full = batches[0]!;

      const r2 = await rig();
      try {
        r2.controller.start({
          projectId: PROJECT,
          goal: "g",
          tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
        });
        // Pre-insert exactly ONE event of the batch under its own idempotency key.
        r2.store.append(full[0]!);
        let atomicError: unknown;
        try {
          r2.store.appendAtomic(full);
        } catch (error) {
          atomicError = error;
        }
        expect(atomicError).toBeInstanceOf(AtomicAppendError);
        expect((atomicError as AtomicAppendError).recoveryRequired).toBe(true);
      } finally {
        await r2.cleanup();
      }
    } finally {
      await r.cleanup();
    }
  });

  it("invariants: envelopes equal the ProjectIR head, terminal history/evidence stay untouched, verify/rebuild are green", async () => {
    const r = await rig();
    try {
      r.controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      // Put task-a into terminal (SATISFIED) history and produce real evidence.
      await driveToSatisfied(r);
      // G10-Z §26: the committed promotion effect must be reconciled into the
      // ProjectIR head BEFORE a meaning-changing revision (the supported order is
      // effect -> Work settlement -> head sync -> meaning change). Without the
      // sync, new Work would be authorized on a base the canonical promotion
      // chain has already superseded.
      expect((await r.controller.reconcileProjectHead()).status).toBe("reconciled");
      const evidenceBefore = r.controller.status().evidence.map((e) => `${e.evidence_id}:${e.status}`);
      const satisfiedEvents = eventsOfType(r.store, "TASK_SATISFIED").length;

      // A revision that retains history + adds a task.
      r.controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"]), taskSpec("task-c")],
      });
      const head = readIr(r.store);

      // Every current runnable envelope is bound to the head.
      for (const taskId of ["task-b", "task-c"]) {
        expect(["READY", "BLOCKED"]).toContain(taskState(r.store, taskId));
        const envelope = envelopeOf(r.store, taskId)!;
        expect(envelope.project_revision).toBe(head.revision);
        expect(envelope.project_digest).toBe(head.digest);
      }
      // Terminal history: task-a is not reauthorized, still SATISFIED, event intact.
      expect(taskState(r.store, "task-a")).toBe("SATISFIED");
      expect(eventsOfType(r.store, "TASK_SATISFIED")).toHaveLength(satisfiedEvents);
      expect(
        eventsOfType(r.store, "TASK_REAUTHORIZED").some((event) => event.entity_id === "task-a"),
      ).toBe(false);
      // Old evidence is untouched by a revision with no typed invalidation.
      expect(r.controller.status().evidence.map((e) => `${e.evidence_id}:${e.status}`)).toEqual(
        evidenceBefore,
      );

      // A revision-anchored hold reads correctly: stale once the head moves on.
      r.controller.setHold("task-b", { reason: "operator pause", declaredBy: "test" });
      expect(r.controller.orchestrationGraph().runtime?.controls?.holds[0]).toMatchObject({
        taskId: "task-b",
        status: "active",
        setAtRevision: head.revision,
      });
      r.controller.planReconciled({
        tasks: [
          taskSpec("task-a"),
          taskSpec("task-b", ["task-a"]),
          taskSpec("task-c"),
          taskSpec("task-d"),
        ],
      });
      expect(r.controller.orchestrationGraph().runtime?.controls?.holds[0]).toMatchObject({
        taskId: "task-b",
        status: "stale",
        setAtRevision: head.revision,
        currentRevision: head.revision + 1,
      });

      // Canonical integrity after the revisions.
      expect(() => r.store.quickCheck()).not.toThrow();
      expect(() => r.store.verifyFull()).not.toThrow();
      const snapshot = r.store.rebuildProjections();
      expect(snapshot["projects"]).toBeDefined();
      expect(() => r.store.quickCheck()).not.toThrow();
    } finally {
      await r.cleanup();
    }
  });

  it("typed invalidation still stales evidence: the affected evidence loses authority in the same act", async () => {
    const r = await rig();
    try {
      r.controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      r.controller.step(); // TASK_STARTED task-a
      const created = r.controller.step()!;
      await r.controller.claim(created.entity_id);
      const gate = await r.controller.gate({
        attemptId: created.entity_id,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
      });
      expect(
        r.controller.status().evidence.find((e) => e.evidence_id === gate.entity_id)?.status,
      ).toBe("active");

      r.controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
        changeClass: "contract_breaking",
        changedIds: ["task-a"],
      });
      expect(taskState(r.store, "task-a")).toBe("STALE");
      expect(taskState(r.store, "task-b")).toBe("STALE");
      expect(
        r.controller.status().evidence.find((e) => e.evidence_id === gate.entity_id)?.status,
      ).toBe("stale");
    } finally {
      await r.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * Fault-injection and batch-capture helpers
 * ------------------------------------------------------------------ */

/** Replace `store.appendAtomic` with one that merges an injected fault hook. */
function injectAtomicFault(
  store: EventStore,
  shouldCrash: (checkpoint: string, event?: SchedulerEvent) => boolean,
): void {
  const original = store.appendAtomic.bind(store);
  (store as unknown as Record<string, unknown>).appendAtomic = (
    requests: readonly NewEvent[],
    options: { committedAt?: string } = {},
  ) =>
    original(requests, {
      ...options,
      faultHook: (checkpoint: string, event?: SchedulerEvent) => {
        if (shouldCrash(checkpoint, event)) throw new Error(`injected crash at ${checkpoint}`);
      },
    });
}

/** Replace `store.appendAtomic` with one that records the exact batch it receives. */
function captureBatches(store: EventStore): NewEvent[][] {
  const captured: NewEvent[][] = [];
  const original = store.appendAtomic.bind(store);
  (store as unknown as Record<string, unknown>).appendAtomic = (
    requests: readonly NewEvent[],
    options: { committedAt?: string } = {},
  ) => {
    captured.push([...requests]);
    return original(requests, options);
  };
  return captured;
}
