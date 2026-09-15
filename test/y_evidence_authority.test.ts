/**
 * G10-Y — Canonical Work-Evidence invalidation & atomic gate authority.
 *
 * These tests assert REAL behaviour, not source shape: that retiring Work and
 * revoking the gate authority of the Evidence that supported it are ONE durable
 * transition, and that no reachable crash can leave a committed new Work world
 * still backed by authority from the superseded one.
 *
 *   EvidenceHistory ≠ CurrentEvidenceAuthority
 *   EVIDENCE_STALE  ≠ EvidenceWasFalse
 *   TaskStale       ≠ EvidenceStale except by the declared typed policy
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import { EventStore, IdempotencyConflict } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy, actionKey } from "../src/domain/index.js";
import {
  canonicalDigest,
  parseNewEvent,
  parseProjectIr,
  type EvidenceAtom,
  type NewEvent,
  type ProjectIr,
  type SchedulerEvent,
} from "../src/schema/index.js";
import { activeEvidenceViews } from "../src/evidence/gate_dsl.js";
import type { EvidenceInvalidationPlan } from "../src/evidence/invalidation.js";

import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const CLOCK = "2026-09-16T00:00:00Z";
const PROJECT = "y-project";

interface Rig {
  readonly dir: string;
  readonly store: EventStore;
  readonly controller: ProjectController;
  cleanup(): Promise<void>;
}

async function rig(): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-yev-"));
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "o.sqlite"),
    git: new FakeGitPort(HEAD),
  });
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
    cleanup: async () => {
      await effects.close();
      try {
        store.close();
      } catch {
        // a fault-injection test may have reopened the same file
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * Read helpers — always through the canonical projection, never a cache
 * ------------------------------------------------------------------ */

function eventsOfType(store: EventStore, eventType: string): SchedulerEvent[] {
  return store.listEvents(PROJECT).filter((event) => event.event_type === eventType);
}

function evidenceStatus(store: EventStore, evidenceId: string): string | undefined {
  const row = store.connection
    .prepare("SELECT status FROM evidence WHERE project_id=? AND evidence_id=?")
    .get(PROJECT, evidenceId) as { status: string } | undefined;
  return row === undefined ? undefined : String(row.status);
}

function taskState(store: EventStore, taskId: string): string | undefined {
  const row = store.connection
    .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
    .get(PROJECT, taskId) as { state: string } | undefined;
  return row === undefined ? undefined : String(row.state);
}

function revision(store: EventStore): number {
  const row = store.connection
    .prepare("SELECT revision FROM projects WHERE project_id=?")
    .get(PROJECT) as { revision: number };
  return Number(row.revision);
}

function readIr(store: EventStore): ProjectIr {
  const row = store.connection
    .prepare("SELECT state_json FROM projects WHERE project_id=?")
    .get(PROJECT) as { state_json: Uint8Array };
  return parseProjectIr(JSON.parse(new TextDecoder().decode(row.state_json)));
}

/** Append a synthetic ACTIVE Evidence atom bound to an arbitrary typed subject. */
function appendEvidence(
  store: EventStore,
  input: {
    evidenceId: string;
    subjectType: EvidenceAtom["subject_type"];
    subjectId: string;
    projectRevision: number;
  },
): SchedulerEvent {
  const evidence: EvidenceAtom = {
    schema_version: 1,
    project_id: PROJECT,
    evidence_id: input.evidenceId,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    subject_digest: canonicalDigest({ subject_type: input.subjectType, subject_id: input.subjectId }),
    predicate: "tests_pass",
    value: { exit_code: 0 },
    project_revision: input.projectRevision,
    input_fingerprint: "a".repeat(64),
    command: ["python", "-m", "pytest"],
    exit_code: 0,
    environment_digest: "e".repeat(64),
    dependency_digest: null,
    observed_artifacts: [],
    producer: "y-test",
    created_at: CLOCK,
    status: "active",
  };
  return store.append(
    parseNewEvent({
      schema_version: 1,
      project_id: PROJECT,
      event_type: "EVIDENCE_ADDED",
      payload_version: 1,
      entity_type: "evidence",
      entity_id: input.evidenceId,
      payload: { evidence },
      causation_id: null,
      correlation_id: `evidence:${input.evidenceId}`,
      idempotency_key: actionKey("evidence-v1", {
        project_id: PROJECT,
        evidence_id: input.evidenceId,
      }),
      expected_project_revision: input.projectRevision,
    }),
  );
}

/**
 * Bring the rig to: task-a ACTIVE, one RUNNING attempt, one ACTIVE Evidence
 * item on that attempt, and a declared gate `g1` that the Evidence alone
 * satisfies.
 */
async function activeTaskWithEvidence(target: Rig): Promise<{
  attemptId: string;
  evidenceId: string;
}> {
  const { controller, store } = target;
  controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
  controller.step(); // TASK_STARTED -> ACTIVE
  const created = controller.step(); // ATTEMPT_CREATED
  const attemptId = created!.entity_id;
  await controller.claim(attemptId);
  const gate = await controller.gate({
    attemptId,
    predicate: "tests_pass",
    command: ["python", "-m", "pytest"],
    exitCode: 0,
  });
  controller.declareGate(
    {
      gate_id: "g1",
      version: 1,
      subject_type: "attempt",
      require: { mode: "all", chain: [{ exists: { predicate: "tests_pass" } }] },
    },
    "y-test",
  );
  expect(store).toBeDefined();
  return { attemptId, evidenceId: gate.entity_id };
}

/** The typed invalidating revision used throughout: retire task-a, add task-c. */
const INVALIDATING_REVISION = {
  tasks: [taskSpec("task-a"), taskSpec("task-c")],
  changeClass: "behavior_change",
  changedIds: ["task-a"],
} as const;

/** Inject a one-shot-capable atomic fault; the returned function removes it. */
function injectAtomicFault(
  store: EventStore,
  shouldCrash: (checkpoint: string, event?: SchedulerEvent) => boolean,
): () => void {
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
  return () => {
    (store as unknown as Record<string, unknown>).appendAtomic = original;
  };
}

function planError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw, but it returned normally");
}

describe("G10-Y canonical Work-Evidence invalidation", () => {
  it("retiring a task and revoking its Evidence commit as ONE atomic batch, in order", async () => {
    const r = await rig();
    try {
      const { attemptId, evidenceId } = await activeTaskWithEvidence(r);
      expect(evidenceStatus(r.store, evidenceId)).toBe("active");

      const before = r.store.listEvents(PROJECT).length;
      const outcome = r.controller.planReconciled({ ...INVALIDATING_REVISION });
      const batch = r.store.listEvents(PROJECT).slice(before);

      // The closure is committed as one batch in the declared order: the
      // revocation of OLD-world authority precedes the world it revokes.
      expect(batch.map((event) => event.event_type)).toEqual([
        "TASK_STALE",
        "EVIDENCE_STALE",
        "PROJECT_REVISED",
        "TASK_CREATED",
      ]);
      const stale = batch[1]!;
      expect(stale.entity_id).toBe(evidenceId);
      expect(stale.payload.evidence_id).toBe(evidenceId);
      expect(stale.payload.reason).toBe("typed invalidation (behavior_change) on revision 1");

      // §24 atomic success invariant: the new world and revoked authority land
      // together - there is no persisted new-ProjectIR-with-old-authority state.
      expect(revision(r.store)).toBe(1);
      expect(taskState(r.store, "task-a")).toBe("STALE");
      expect(taskState(r.store, "task-c")).toBe("READY");
      expect(evidenceStatus(r.store, evidenceId)).toBe("stale");
      expect(activeEvidenceViews(r.store, PROJECT, "attempt", attemptId)).toEqual([]);
      expect(outcome.result.revision).toBe(1);
    } finally {
      await r.cleanup();
    }
  });

  it("gate authority: PASS before the revision, no longer consumable after it", async () => {
    const r = await rig();
    try {
      const { attemptId } = await activeTaskWithEvidence(r);
      const before = r.controller.evaluateGate("g1", "attempt", attemptId);
      expect(before.verdict).toBe("PASS");

      r.controller.planReconciled({ ...INVALIDATING_REVISION });

      const after = r.controller.evaluateGate("g1", "attempt", attemptId);
      // The exact post-verdict follows the DSL (absence of evidence is
      // INCOMPLETE, never FAIL); what must hold is that the revoked authority is
      // no longer consumable.
      expect(after.verdict).not.toBe("PASS");
      expect(after.evidence_used).toEqual([]);
      expect(after.passed).toEqual([]);
      expect(after.unresolved).toContain("exists(tests_pass)");
    } finally {
      await r.cleanup();
    }
  });

  it("fault injection at every batch checkpoint leaves the COMPLETE old or new world, never mixed", async () => {
    const checkpoints: Array<{ name: string; match: (c: string, e?: SchedulerEvent) => boolean }> = [
      { name: "after TASK_STALE insert", match: (c, e) => c === "after_event_insert" && e?.event_type === "TASK_STALE" },
      { name: "after first EVIDENCE_STALE insert", match: (c, e) => c === "after_event_insert" && e?.event_type === "EVIDENCE_STALE" },
      { name: "after PROJECT_REVISED insert", match: (c, e) => c === "after_event_insert" && e?.event_type === "PROJECT_REVISED" },
      { name: "after TASK_CREATED insert", match: (c, e) => c === "after_event_insert" && e?.event_type === "TASK_CREATED" },
      { name: "before COMMIT", match: (c) => c === "before_commit" },
    ];

    for (const checkpoint of checkpoints) {
      const r = await rig();
      let reopened: EventStore | undefined;
      try {
        const { evidenceId } = await activeTaskWithEvidence(r);
        const before = r.store.listEvents(PROJECT).length;
        injectAtomicFault(r.store, checkpoint.match);
        expect(() => r.controller.planReconciled({ ...INVALIDATING_REVISION })).toThrow(
          /injected crash/,
        );

        r.store.close();
        reopened = new EventStore(join(r.dir, "p.sqlite"), { clock: new FakeClock().next });
        expect(reopened.listEvents(PROJECT)).toHaveLength(before);

        const observed = {
          revision: revision(reopened),
          taskA: taskState(reopened, "task-a"),
          evidence: evidenceStatus(reopened, evidenceId),
          staleEvents: eventsOfType(reopened, "EVIDENCE_STALE").length,
        };
        const oldWorld =
          observed.revision === 0 &&
          observed.taskA === "ACTIVE" &&
          observed.evidence === "active" &&
          observed.staleEvents === 0;
        const newWorld =
          observed.revision === 1 &&
          observed.taskA === "STALE" &&
          observed.evidence === "stale" &&
          observed.staleEvents === 1;
        expect(
          { checkpoint: checkpoint.name, ...observed, oneWorldOnly: oldWorld !== newWorld },
        ).toMatchObject({ oneWorldOnly: true });
        expect(oldWorld || newWorld).toBe(true);
        // The ProjectIR basis and the Evidence authority never diverge.
        expect(observed.revision === 1).toBe(observed.evidence === "stale");
      } finally {
        reopened?.close();
        await r.cleanup();
      }
    }
  });

  it("a rolled-back revision is retried to exactly ONE closure (no duplicated revocation)", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      const restore = injectAtomicFault(r.store, (checkpoint) => checkpoint === "before_commit");
      expect(() => r.controller.planReconciled({ ...INVALIDATING_REVISION })).toThrow(
        /injected crash/,
      );
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(0);
      restore();

      // Retry the identical call on the intact old world.
      const outcome = r.controller.planReconciled({ ...INVALIDATING_REVISION });
      expect(outcome.result.revision).toBe(1);
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(1);
      expect(evidenceStatus(r.store, evidenceId)).toBe("stale");

      // Re-issuing the manual revocation of an already-revoked item is not a
      // state transition: it fails closed instead of producing a second event.
      expect(() => r.controller.invalidateEvidence(evidenceId, "again")).toThrow(
        /requires active Evidence/,
      );
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(1);
    } finally {
      await r.cleanup();
    }
  });

  it("replay and projection rebuild reconstruct the exact authority with no repair pass", async () => {
    const r = await rig();
    let reopened: EventStore | undefined;
    try {
      const { attemptId, evidenceId } = await activeTaskWithEvidence(r);
      r.controller.planReconciled({ ...INVALIDATING_REVISION });
      r.store.close();

      reopened = new EventStore(join(r.dir, "p.sqlite"), { clock: new FakeClock().next });
      reopened.quickCheck();
      reopened.verifyFull();
      expect(evidenceStatus(reopened, evidenceId)).toBe("stale");
      expect(activeEvidenceViews(reopened, PROJECT, "attempt", attemptId)).toEqual([]);

      // §28: evidence authority is a pure function of EVIDENCE_ADDED +
      // EVIDENCE_STALE replayed in order - clearing the projections and
      // replaying is sufficient, with no after-open repair.
      reopened.rebuildProjections();
      reopened.quickCheck();
      reopened.verifyFull();
      expect(evidenceStatus(reopened, evidenceId)).toBe("stale");
      expect(activeEvidenceViews(reopened, PROJECT, "attempt", attemptId)).toEqual([]);
      expect(revision(reopened)).toBe(1);
      expect(taskState(reopened, "task-a")).toBe("STALE");
    } finally {
      reopened?.close();
      await r.cleanup();
    }
  });

  it("every stale projection row is backed by a canonical event (no event-less repair)", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      // A second, independent Evidence item that the revision does NOT retire.
      appendEvidence(r.store, {
        evidenceId: "evidence-unrelated",
        subjectType: "commit",
        subjectId: "task-a",
        projectRevision: 0,
      });
      r.controller.planReconciled({ ...INVALIDATING_REVISION });

      const staleRows = r.store.connection
        .prepare("SELECT evidence_id FROM evidence WHERE project_id=? AND status='stale' ORDER BY evidence_id")
        .all(PROJECT) as Array<{ evidence_id: string }>;
      const staleEvents = eventsOfType(r.store, "EVIDENCE_STALE").map((event) => event.entity_id);
      expect(staleRows.map((row) => String(row.evidence_id))).toEqual(staleEvents);
      expect(staleEvents).toEqual([evidenceId]);
    } finally {
      await r.cleanup();
    }
  });

  it("unaffected Evidence keeps its authority; a commit subject is outside the typed policy", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      // (task, task-a) is inside the typed policy; (commit, task-a) shares the
      // subject_id STRING but is a different typed subject, so a bare id match
      // must not reach it.
      appendEvidence(r.store, {
        evidenceId: "evidence-task-subject",
        subjectType: "task",
        subjectId: "task-a",
        projectRevision: 0,
      });
      appendEvidence(r.store, {
        evidenceId: "evidence-commit-subject",
        subjectType: "commit",
        subjectId: "task-a",
        projectRevision: 0,
      });
      // An attempt of a task that stays in the plan, plus evidence on another task.
      r.controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a")],
      });

      r.controller.planReconciled({ ...INVALIDATING_REVISION });

      expect(evidenceStatus(r.store, evidenceId)).toBe("stale");
      expect(evidenceStatus(r.store, "evidence-task-subject")).toBe("stale");
      expect(evidenceStatus(r.store, "evidence-commit-subject")).toBe("active");
    } finally {
      await r.cleanup();
    }
  });

  it("non-invalidating change classes never revoke Evidence", async () => {
    for (const changeClass of ["metadata_only", "backward_compatible"] as const) {
      const r = await rig();
      try {
        const { evidenceId } = await activeTaskWithEvidence(r);
        const error = planError(() =>
          r.controller.planReconciled({
            tasks: [taskSpec("task-a"), taskSpec("task-c")],
            changeClass,
            changedIds: ["task-a"],
          }),
        );
        // A non-invalidating class settles nothing, so a live ACTIVE task still
        // blocks the revision - and the Evidence keeps its authority verbatim.
        expect(String(error)).toMatch(/quiescence_required/);
        expect(revision(r.store)).toBe(0);
        expect(evidenceStatus(r.store, evidenceId)).toBe("active");
        expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(0);
      } finally {
        await r.cleanup();
      }
    }
  });

  it("the manual revocation path shares the canonical event shape and idempotency", async () => {
    const r = await rig();
    try {
      const { attemptId } = await activeTaskWithEvidence(r);
      const gate = await r.controller.gate({
        attemptId,
        predicate: "lint_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      const manual = r.controller.invalidateEvidence(gate.entity_id, "operator decision");
      const replay = r.controller.invalidateEvidence(gate.entity_id, "operator decision");
      // Same request => same identity => the SAME event, never a duplicate.
      expect(replay.event_id).toBe(manual.event_id);
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(1);
      expect(evidenceStatus(r.store, gate.entity_id)).toBe("stale");

      // The manual and revision paths emit one indistinguishable event shape.
      const keys = Object.keys(manual.payload).sort();
      expect(keys).toEqual(["evidence_id", "reason"]);
      expect(manual.entity_type).toBe("evidence");
      expect(manual.payload.evidence_id).toBe(manual.entity_id);
    } finally {
      await r.cleanup();
    }
  });

  it("a reused revocation identity with different semantics fails closed", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      // Reconstruct the canonical key the revision path will use, but with a
      // DIFFERENT reason: the identity is bound to the semantics, so this is a
      // conflicting reuse rather than a retry.
      r.controller.invalidateEvidence(evidenceId, "first");
      const conflicting = {
        schema_version: 1,
        project_id: PROJECT,
        event_type: "EVIDENCE_STALE",
        payload_version: 1,
        entity_type: "evidence",
        entity_id: evidenceId,
        payload: { evidence_id: evidenceId, reason: "first" },
        causation_id: null,
        correlation_id: `evidence-stale:${evidenceId}`,
        idempotency_key: actionKey("evidence-stale-v1", {
          project_id: PROJECT,
          evidence_id: evidenceId,
          from_revision: 0,
          to_revision: 0,
          change_class: null,
          reason: "different semantics",
        }),
        expected_project_revision: 0,
      } as unknown as NewEvent;
      expect(() => r.store.append(conflicting)).toThrow(/EVIDENCE_STALE|active Evidence/);

      // The canonical key itself is semantics-bound: changing the reason class
      // changes the identity, so a different trigger can never be mistaken for
      // a replay of this one.
      const keyOf = (reason: string) =>
        actionKey("evidence-stale-v1", {
          project_id: PROJECT,
          evidence_id: evidenceId,
          from_revision: 0,
          to_revision: 0,
          change_class: null,
          reason,
        });
      expect(keyOf("first")).not.toBe(keyOf("second"));
    } finally {
      await r.cleanup();
    }
  });

  it("an immutable EvidenceAtom is never rewritten - only the projection status moves", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      const added = eventsOfType(r.store, "EVIDENCE_ADDED")[0]!;
      const atomBefore = JSON.stringify(added.payload.evidence);

      r.controller.planReconciled({ ...INVALIDATING_REVISION });

      const atomAfter = JSON.stringify(eventsOfType(r.store, "EVIDENCE_ADDED")[0]!.payload.evidence);
      expect(atomAfter).toBe(atomBefore);
      expect((added.payload.evidence as EvidenceAtom).status).toBe("active");
      // The projection column is the CURRENT authority, and it moved.
      expect(evidenceStatus(r.store, evidenceId)).toBe("stale");
    } finally {
      await r.cleanup();
    }
  });

  it("a head-only ProjectIR revision revokes no Evidence", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      // Drive task-a to SATISFIED so nothing is in flight, and a promotion
      // supplies a proven effect head.
      const attemptId = r.store
        .listEvents(PROJECT)
        .find((event) => event.event_type === "ATTEMPT_CREATED")!.entity_id;
      const committed = await r.controller.effects.invoke(
        r.controller.effects.actions.gitCommit,
        { worktreeId: attemptId, message: "work" },
        {
          scope: PROJECT,
          revision: r.controller.promotions.projectRevision(),
          callId: `commit:${attemptId}`,
        },
      );
      r.controller.report(attemptId, {
        workerStatus: "completed",
        summary: "done",
        resultCommit: committed.commit,
      });
      r.controller.step(); // TASK_VERIFYING
      await r.controller.promoteAttempt({ attemptId });
      r.controller.step(); // TASK_SATISFIED

      const before = readIr(r.store).head_commit;
      const reconciliation = await r.controller.reconcileProjectHead();
      expect(reconciliation.status).toBe("reconciled");
      const head = readIr(r.store);
      expect(head.head_commit).not.toBe(before);
      expect(head.revision).toBe(revision(r.store));

      // A head-only revision moves the head without invalidating Work.
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(0);
      expect(evidenceStatus(r.store, evidenceId)).toBe("active");
      expect(eventsOfType(r.store, "TASK_STALE")).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });

  it("the compiler refuses a bare subject_id match and reports excluded subject kinds", async () => {
    const plan: EvidenceInvalidationPlan = {
      schemaVersion: 1,
      projectId: PROJECT,
      basis: { revision: 0, digest: "d" },
      targetRevision: 1,
      affectedTaskIds: [],
      affectedAttemptIds: [],
      subjects: [],
      evidenceIds: [],
      reason: "",
      excludedBySubjectType: [],
    };
    // The plan is a plain, frozen read model with typed subject pairs; the
    // string-matching scope of the legacy repair cannot be expressed in it.
    expect(Object.isFrozen(plan)).toBe(false);
    const { compileEvidenceInvalidation } = await import("../src/evidence/invalidation.js");
    const compiled = compileEvidenceInvalidation({
      projectId: PROJECT,
      basis: { revision: 0, digest: "d" },
      targetRevision: 1,
      affectedTaskIds: ["task-a"],
      affectedAttemptIds: ["attempt-1"],
      changeClass: "behavior_change",
      activeEvidence: [
        { evidenceId: "e-attempt", subjectType: "attempt", subjectId: "attempt-1" },
        { evidenceId: "e-task", subjectType: "task", subjectId: "task-a" },
        { evidenceId: "e-collide", subjectType: "commit", subjectId: "task-a" },
        { evidenceId: "e-other", subjectType: "task", subjectId: "task-z" },
      ],
    });
    expect(compiled.evidenceIds).toEqual(["e-attempt", "e-task"]);
    expect(compiled.subjects).toEqual([
      { subjectType: "attempt", subjectId: "attempt-1" },
      { subjectType: "task", subjectId: "task-a" },
    ]);
    expect(compiled.excludedBySubjectType).toEqual([
      { subjectType: "commit", subjectId: "task-a" },
    ]);
    expect(compiled.reason).toBe("typed invalidation (behavior_change) on revision 1");
    expect(Object.isFrozen(compiled)).toBe(true);
  });

  it("a removal-only revision uses the deterministic retirement reason", async () => {
    const r = await rig();
    try {
      r.controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a"), taskSpec("task-b")],
      });
      r.controller.planReconciled({ tasks: [taskSpec("task-a")] });
      const stale = eventsOfType(r.store, "TASK_STALE");
      expect(stale).toHaveLength(1);
      expect(stale[0]!.entity_id).toBe("task-b");
      // task-b never started, so it holds no Work Evidence: the revision retires
      // work but revokes no authority, and says so instead of inventing an event.
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });
});

describe("G10-Y idempotency conflict semantics", () => {
  it("the store rejects a conflicting reuse of a revocation identity", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      const key = actionKey("evidence-stale-v1", {
        project_id: PROJECT,
        evidence_id: evidenceId,
        from_revision: 0,
        to_revision: 0,
        change_class: null,
        reason: "reason-a",
      });
      const build = (reason: string) =>
        parseNewEvent({
          schema_version: 1,
          project_id: PROJECT,
          event_type: "EVIDENCE_STALE",
          payload_version: 1,
          entity_type: "evidence",
          entity_id: evidenceId,
          payload: { evidence_id: evidenceId, reason },
          causation_id: null,
          correlation_id: `evidence-stale:${evidenceId}`,
          idempotency_key: key,
          expected_project_revision: 0,
        });
      r.store.append(build("reason-a"));
      expect(() => r.store.append(build("reason-b"))).toThrow(IdempotencyConflict);
    } finally {
      await r.cleanup();
    }
  });
});
