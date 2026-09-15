/**
 * G10-Y adversarial suite (Y-N01…Y-N30).
 *
 * Every item below asserts a NEGATIVE or non-interference property of the
 * canonical Work-Evidence invalidation closure. Where an assertion is
 * necessarily about the ABSENCE of a write path (which no runtime observation
 * can witness without an actual crash), the test says so and pairs the
 * structural check with a behavioural one.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterAll, describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy, actionKey } from "../src/domain/index.js";
import {
  canonicalDigest,
  parseNewEvent,
  type EvidenceAtom,
  type NewEvent,
  type SchedulerEvent,
} from "../src/schema/index.js";
import { activeEvidenceViews } from "../src/evidence/gate_dsl.js";
import { compileEvidenceInvalidation } from "../src/evidence/invalidation.js";
import {
  PROOF_STATEMENT_TYPE,
  SqliteProofEvidenceStore,
  localProofBlobStore,
  makeProofEvidenceService,
  materializeProofSourceRevisionRef,
} from "../src/proof_asset/index.js";

import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const CLOCK = "2026-09-16T00:00:00Z";
const PROJECT = "y-adv-project";
const REPO = join(__dirname, "..");

const DIR = mkdtempSync(join(tmpdir(), "palimpsest-y-adv-"));
afterAll(() => {
  try {
    rmSync(DIR, { recursive: true, force: true });
  } catch {
    /* windows handle */
  }
});
let seq = 0;

interface Rig {
  readonly dir: string;
  readonly store: EventStore;
  readonly controller: ProjectController;
  cleanup(): Promise<void>;
}

async function rig(): Promise<Rig> {
  const dir = mkdtempSync(join(DIR, `rig-${++seq}-`));
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
        /* already reopened */
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * Observation helpers
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

/** A stable, content-derived digest of EVERY row of EVERY table in one database. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return `n:${value}`;
  if (typeof value === "string") return `s:${value}`;
  if (typeof value === "bigint") return `i:${value}`;
  if (value instanceof Uint8Array) return `b:${Buffer.from(value).toString("hex")}`;
  return `?:${String(value)}`;
}

function tableNames(db: DatabaseSync): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((row) => String(row.name));
}

function tableDigests(db: DatabaseSync): Record<string, string> {
  const digests: Record<string, string> = {};
  for (const table of tableNames(db)) {
    const rows = (db.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>).map(
      (row) =>
        Object.keys(row)
          .sort()
          .map((key) => `${key}=${cell(row[key])}`)
          .join("|"),
    );
    digests[table] = canonicalDigest({ table, rows: rows.sort() });
  }
  return digests;
}

function databaseDigest(path: string): { digest: string; tables: string[] } {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const tables = tableNames(db);
    return { digest: canonicalDigest(tableDigests(db)), tables };
  } finally {
    db.close();
  }
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
}

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
    subject_digest: canonicalDigest({ s: input.subjectId }),
    predicate: "tests_pass",
    value: { exit_code: 0 },
    project_revision: input.projectRevision,
    input_fingerprint: "a".repeat(64),
    command: ["python", "-m", "pytest"],
    exit_code: 0,
    environment_digest: "e".repeat(64),
    dependency_digest: null,
    observed_artifacts: [],
    producer: "y-adv",
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

async function activeTaskWithEvidence(target: Rig): Promise<{
  attemptId: string;
  evidenceId: string;
}> {
  const { controller } = target;
  controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
  controller.step();
  const created = controller.step()!;
  const attemptId = created.entity_id;
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
    "y-adv",
  );
  return { attemptId, evidenceId: gate.entity_id };
}

const INVALIDATING = {
  tasks: [taskSpec("task-a"), taskSpec("task-c")],
  changeClass: "behavior_change",
  changedIds: ["task-a"],
} as const;

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

/* ------------------------------------------------------------------ *
 * Y-N01…Y-N05 — the repair is gone and compilation precedes mutation
 * ------------------------------------------------------------------ */

describe("G10-Y adversarial: no hidden repair path", () => {
  it("Y-N01 only the canonical projector writes the evidence status column", () => {
    // Necessarily a STRUCTURAL assertion: the defect being excluded is the
    // ABSENCE of an event for a projection write, which cannot be observed at
    // runtime without actually crashing. The behavioural counterpart is asserted
    // by Y-N02 and by 'every stale row is event-backed' in the behavioural suite.
    const offenders: string[] = [];
    for (const file of sourceFiles(join(REPO, "src"))) {
      const text = readFileSync(file, "utf8");
      // Any statement that assigns the evidence status, other than the projector.
      for (const match of text.matchAll(/UPDATE\s+evidence\s+SET\s+status/giu)) {
        const relative = file.slice(REPO.length + 1).replace(/\\/gu, "/");
        if (!relative.endsWith("state/projector.ts")) offenders.push(`${relative}:${match.index}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("Y-N02 the invalidation set is compiled before any mutation, with zero writes", async () => {
    const r = await rig();
    try {
      const { attemptId, evidenceId } = await activeTaskWithEvidence(r);
      const attemptIds = (
        r.store.connection
          .prepare("SELECT attempt_id FROM attempts WHERE project_id=? AND task_id=?")
          .all(PROJECT, "task-a") as Array<{ attempt_id: string }>
      ).map((row) => String(row.attempt_id));
      expect(attemptIds).toEqual([attemptId]);

      // The pure compiler's verdict for the pre-mutation world...
      const plan = compileEvidenceInvalidation({
        projectId: PROJECT,
        basis: { revision: 0, digest: "any" },
        targetRevision: 1,
        affectedTaskIds: ["task-a"],
        affectedAttemptIds: attemptIds,
        changeClass: "behavior_change",
        activeEvidence: [{ evidenceId, subjectType: "attempt", subjectId: attemptId }],
      });
      expect(plan.evidenceIds).toEqual([evidenceId]);

      // ...is exactly what the committed batch revokes, and the compiler itself
      // wrote nothing (the event log grows only by the batch).
      const before = r.store.listEvents(PROJECT).length;
      r.controller.planReconciled({ ...INVALIDATING });
      const committed = eventsOfType(r.store, "EVIDENCE_STALE").map((event) => event.entity_id);
      expect(committed).toEqual(plan.evidenceIds);
      expect(r.store.listEvents(PROJECT).length).toBeGreaterThan(before);
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N03 a revision cannot self-mark arbitrary Evidence stale", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      // Evidence bound to a subject the revision has no declared rule over.
      appendEvidence(r.store, {
        evidenceId: "evidence-not-in-scope",
        subjectType: "attempt",
        subjectId: "attempt-not-in-scope",
        projectRevision: 0,
      });
      r.controller.planReconciled({ ...INVALIDATING });
      // Only the retired task's own Evidence was revoked.
      expect(eventsOfType(r.store, "EVIDENCE_STALE").map((event) => event.entity_id)).toEqual([
        evidenceId,
      ]);
      expect(evidenceStatus(r.store, "evidence-not-in-scope")).toBe("active");
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N04 only ACTIVE Evidence is selected: an already-revoked item is not re-staled", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      r.controller.invalidateEvidence(evidenceId, "manual first");
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(1);

      // The compiler reads only `status='active'`, so the retired task's
      // already-revoked Evidence is not selected a second time.
      r.controller.planReconciled({ ...INVALIDATING });
      const stale = eventsOfType(r.store, "EVIDENCE_STALE");
      expect(stale).toHaveLength(1);
      expect(stale[0]!.payload.reason).toBe("manual first");
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N05 subject matching is typed: a colliding subject_id of another kind is untouched", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      appendEvidence(r.store, {
        evidenceId: "evidence-commit-collision",
        subjectType: "commit",
        subjectId: "task-a",
        projectRevision: 0,
      });
      appendEvidence(r.store, {
        evidenceId: "evidence-task-collision",
        subjectType: "task",
        subjectId: "task-a",
        projectRevision: 0,
      });
      r.controller.planReconciled({ ...INVALIDATING });
      expect(evidenceStatus(r.store, evidenceId)).toBe("stale");
      expect(evidenceStatus(r.store, "evidence-task-collision")).toBe("stale");
      // Same subject_id STRING, different typed subject: a bare string match
      // would have revoked it; the typed policy does not.
      expect(evidenceStatus(r.store, "evidence-commit-collision")).toBe("active");
    } finally {
      await r.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * Y-N06…Y-N11 — exact scope of the declared policy
 * ------------------------------------------------------------------ */

describe("G10-Y adversarial: exact declared scope", () => {
  it("Y-N06 Evidence of an unaffected task remains active", async () => {
    const r = await rig();
    try {
      const { controller } = r;
      controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a"), taskSpec("task-b")],
      });
      controller.step(); // TASK_STARTED task-a
      const attemptA = controller.step()!.entity_id;
      await controller.claim(attemptA);
      const gateA = await controller.gate({
        attemptId: attemptA,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      // task-b stays declared, so it is RETAINED and never in the retired set.
      controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-b"), taskSpec("task-c")],
        changeClass: "behavior_change",
        changedIds: ["task-a"],
      });
      expect(evidenceStatus(r.store, gateA.entity_id)).toBe("stale");
      expect(eventsOfType(r.store, "EVIDENCE_STALE").map((event) => event.entity_id)).toEqual([
        gateA.entity_id,
      ]);
      expect(taskState(r.store, "task-b")).not.toBe("STALE");
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N07 metadata_only revokes nothing", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      expect(() =>
        r.controller.planReconciled({
          tasks: [taskSpec("task-a"), taskSpec("task-c")],
          changeClass: "metadata_only",
          changedIds: ["task-a"],
        }),
      ).toThrow(/quiescence_required/);
      expect(evidenceStatus(r.store, evidenceId)).toBe("active");
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N08 backward_compatible revokes nothing", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      expect(() =>
        r.controller.planReconciled({
          tasks: [taskSpec("task-a"), taskSpec("task-c")],
          changeClass: "backward_compatible",
          changedIds: ["task-a"],
        }),
      ).toThrow(/quiescence_required/);
      expect(evidenceStatus(r.store, evidenceId)).toBe("active");
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N09 behaviour_change revokes exactly the typed closure", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      r.controller.planReconciled({ ...INVALIDATING });
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(1);
      expect(evidenceStatus(r.store, evidenceId)).toBe("stale");
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N10 contract_breaking revokes the propagated closure, not the whole project", async () => {
    const r = await rig();
    try {
      const { controller } = r;
      // task-1 ACTIVE with evidence; task-2 depends on task-1; task-9 is unrelated.
      controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-1"), taskSpec("task-2", ["task-1"]), taskSpec("task-9")],
      });
      controller.step();
      const attempt = controller.step()!.entity_id;
      await controller.claim(attempt);
      const gate = await controller.gate({
        attemptId: attempt,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      appendEvidence(r.store, {
        evidenceId: "evidence-outside-chain",
        subjectType: "task",
        subjectId: "task-9",
        projectRevision: 0,
      });

      controller.planReconciled({
        tasks: [taskSpec("task-1"), taskSpec("task-2", ["task-1"]), taskSpec("task-9")],
        changeClass: "contract_breaking",
        changedIds: ["task-1"],
      });

      // The change propagates task-1 → task-2 along the declared edge, so both
      // are retired; task-9 is outside the closure and keeps its authority.
      expect(taskState(r.store, "task-1")).toBe("STALE");
      expect(taskState(r.store, "task-2")).toBe("STALE");
      expect(taskState(r.store, "task-9")).not.toBe("STALE");
      expect(evidenceStatus(r.store, gate.entity_id)).toBe("stale");
      expect(evidenceStatus(r.store, "evidence-outside-chain")).toBe("active");
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N11 a head-only revision revokes no Evidence", async () => {
    const r = await rig();
    try {
      const { controller } = r;
      const { attemptId, evidenceId } = await activeTaskWithEvidence(r);
      const committed = await controller.effects.invoke(
        controller.effects.actions.gitCommit,
        { worktreeId: attemptId, message: "work" },
        {
          scope: PROJECT,
          revision: controller.promotions.projectRevision(),
          callId: `commit:${attemptId}`,
        },
      );
      controller.report(attemptId, {
        workerStatus: "completed",
        summary: "done",
        resultCommit: committed.commit,
      });
      controller.step();
      await controller.promoteAttempt({ attemptId });
      controller.step();
      // The promotion revoked nothing: TASK_SATISFIED is terminal history.
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(0);
      expect(evidenceStatus(r.store, evidenceId)).toBe("active");

      const reconciliation = await controller.reconcileProjectHead();
      expect(reconciliation.status).toBe("reconciled");
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(0);
      expect(eventsOfType(r.store, "TASK_STALE")).toHaveLength(0);
      expect(evidenceStatus(r.store, evidenceId)).toBe("active");
    } finally {
      await r.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * Y-N12…Y-N15 — one transaction, no mixed world
 * ------------------------------------------------------------------ */

describe("G10-Y adversarial: one durable transition", () => {
  it("Y-N12 the stale events share the revision transaction (contiguous project sequence)", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      const before = r.store.listEvents(PROJECT).length;
      r.controller.planReconciled({ ...INVALIDATING });
      const batch = r.store.listEvents(PROJECT).slice(before);
      expect(batch.map((event) => event.event_type)).toEqual([
        "TASK_STALE",
        "EVIDENCE_STALE",
        "PROJECT_REVISED",
        "TASK_CREATED",
      ]);
      // Contiguous positions and one shared chain: the batch cannot have been
      // split across two commits.
      const sequences = batch.map((event) => event.project_sequence);
      expect(sequences).toEqual(
        sequences.map((_, index) => (sequences[0] as number) + index),
      );
      for (let index = 1; index < batch.length; index += 1) {
        expect(batch[index]!.previous_event_digest).toBe(batch[index - 1]!.event_digest);
      }
      expect(evidenceStatus(r.store, evidenceId)).toBe("stale");
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N13 a fault after the EVIDENCE_STALE insert rolls back the TASK_STALE too", async () => {
    const r = await rig();
    let reopened: EventStore | undefined;
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      const before = r.store.listEvents(PROJECT).length;
      const restore = injectAtomicFault(
        r.store,
        (checkpoint, event) =>
          checkpoint === "after_event_insert" && event?.event_type === "EVIDENCE_STALE",
      );
      expect(() => r.controller.planReconciled({ ...INVALIDATING })).toThrow(/injected crash/);
      restore();

      r.store.close();
      reopened = new EventStore(join(r.dir, "p.sqlite"), { clock: new FakeClock().next });
      expect(reopened.listEvents(PROJECT)).toHaveLength(before);
      expect(eventsOfType(reopened, "TASK_STALE")).toHaveLength(0);
      expect(eventsOfType(reopened, "EVIDENCE_STALE")).toHaveLength(0);
      expect(taskState(reopened, "task-a")).toBe("ACTIVE");
      expect(evidenceStatus(reopened, evidenceId)).toBe("active");
    } finally {
      reopened?.close();
      await r.cleanup();
    }
  });

  it("Y-N14 a fault after the PROJECT_REVISED insert rolls back the revocation too", async () => {
    const r = await rig();
    let reopened: EventStore | undefined;
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      const restore = injectAtomicFault(
        r.store,
        (checkpoint, event) =>
          checkpoint === "after_event_insert" && event?.event_type === "PROJECT_REVISED",
      );
      expect(() => r.controller.planReconciled({ ...INVALIDATING })).toThrow(/injected crash/);
      restore();

      r.store.close();
      reopened = new EventStore(join(r.dir, "p.sqlite"), { clock: new FakeClock().next });
      const row = reopened.connection
        .prepare("SELECT revision FROM projects WHERE project_id=?")
        .get(PROJECT) as { revision: number };
      expect(Number(row.revision)).toBe(0);
      expect(evidenceStatus(reopened, evidenceId)).toBe("active");
      expect(eventsOfType(reopened, "EVIDENCE_STALE")).toHaveLength(0);
    } finally {
      reopened?.close();
      await r.cleanup();
    }
  });

  it("Y-N15 no reachable checkpoint yields new world + old authority", async () => {
    const checkpoints = [
      (c: string, e?: SchedulerEvent) => c === "after_event_insert" && e?.event_type === "TASK_STALE",
      (c: string, e?: SchedulerEvent) => c === "after_event_insert" && e?.event_type === "EVIDENCE_STALE",
      (c: string, e?: SchedulerEvent) => c === "after_event_insert" && e?.event_type === "PROJECT_REVISED",
      (c: string, e?: SchedulerEvent) => c === "after_event_insert" && e?.event_type === "TASK_CREATED",
      (c: string) => c === "before_commit",
    ];
    for (const match of checkpoints) {
      const r = await rig();
      let reopened: EventStore | undefined;
      try {
        const { evidenceId } = await activeTaskWithEvidence(r);
        const restore = injectAtomicFault(r.store, match);
        expect(() => r.controller.planReconciled({ ...INVALIDATING })).toThrow(/injected crash/);
        restore();
        r.store.close();
        reopened = new EventStore(join(r.dir, "p.sqlite"), { clock: new FakeClock().next });
        const row = reopened.connection
          .prepare("SELECT revision FROM projects WHERE project_id=?")
          .get(PROJECT) as { revision: number };
        const rev = Number(row.revision);
        const status = evidenceStatus(reopened, evidenceId);
        expect(`${rev}/${status}`).toMatch(/^(0\/active|1\/stale)$/u);
      } finally {
        reopened?.close();
        await r.cleanup();
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * Y-N16…Y-N22 — authority, history, replay
 * ------------------------------------------------------------------ */

describe("G10-Y adversarial: authority and history", () => {
  it("Y-N16/Y-N30 the gate cannot consume invalidated Evidence after a committed revision", async () => {
    const r = await rig();
    try {
      const { attemptId } = await activeTaskWithEvidence(r);
      expect(r.controller.evaluateGate("g1", "attempt", attemptId).verdict).toBe("PASS");
      r.controller.planReconciled({ ...INVALIDATING });
      const after = r.controller.evaluateGate("g1", "attempt", attemptId);
      expect(after.verdict).not.toBe("PASS");
      expect(after.evidence_used).toEqual([]);
      expect(activeEvidenceViews(r.store, PROJECT, "attempt", attemptId)).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N17 EvidenceAtom history is retained verbatim", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      const added = eventsOfType(r.store, "EVIDENCE_ADDED").find((e) => e.entity_id === evidenceId)!;
      const before = JSON.stringify(added.payload);
      r.controller.planReconciled({ ...INVALIDATING });
      const after = eventsOfType(r.store, "EVIDENCE_ADDED").find((e) => e.entity_id === evidenceId)!;
      expect(JSON.stringify(after.payload)).toBe(before);
      // stale ≠ false: nothing recorded that the evidence was untrue.
      expect((after.payload.evidence as EvidenceAtom).status).toBe("active");
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(1);
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N18 an already-stale item is never duplicated by a later revision", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      r.controller.invalidateEvidence(evidenceId, "manual");
      r.controller.planReconciled({ ...INVALIDATING });
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(1);
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N19 the manual revocation remains canonical and idempotent", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      const first = r.controller.invalidateEvidence(evidenceId, "operator");
      const second = r.controller.invalidateEvidence(evidenceId, "operator");
      expect(second.event_id).toBe(first.event_id);
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(1);
      expect(first.event_type).toBe("EVIDENCE_STALE");
      expect(Object.keys(first.payload).sort()).toEqual(["evidence_id", "reason"]);
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N20 a retry after a rolled-back batch does not duplicate stale events", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      const restore = injectAtomicFault(r.store, (c) => c === "before_commit");
      expect(() => r.controller.planReconciled({ ...INVALIDATING })).toThrow(/injected crash/);
      restore();
      r.controller.planReconciled({ ...INVALIDATING });
      expect(eventsOfType(r.store, "EVIDENCE_STALE")).toHaveLength(1);
      expect(evidenceStatus(r.store, evidenceId)).toBe("stale");
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N21/Y-N22 replay, rebuild and quickCheck need no repair pass", async () => {
    const r = await rig();
    let reopened: EventStore | undefined;
    try {
      const { attemptId, evidenceId } = await activeTaskWithEvidence(r);
      r.controller.planReconciled({ ...INVALIDATING });
      r.store.close();
      reopened = new EventStore(join(r.dir, "p.sqlite"), { clock: new FakeClock().next });
      reopened.quickCheck();
      reopened.verifyFull();
      reopened.rebuildProjections();
      reopened.quickCheck();
      reopened.verifyFull();
      expect(evidenceStatus(reopened, evidenceId)).toBe("stale");
      expect(activeEvidenceViews(reopened, PROJECT, "attempt", attemptId)).toEqual([]);
    } finally {
      reopened?.close();
      await r.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * Y-N23…Y-N29 — cross-plane non-interference and anti-waste
 * ------------------------------------------------------------------ */

describe("G10-Y adversarial: cross-plane non-interference", () => {
  it("Y-N23 a Work revision does not touch any Proof-plane state", async () => {
    const r = await rig();
    const proofPath = join(r.dir, "proof.sqlite");
    const proofStore = new SqliteProofEvidenceStore(proofPath);
    try {
      const root = join(r.dir, "blobs");
      const service = makeProofEvidenceService({
        store: proofStore,
        blob: localProofBlobStore(root),
        clock: () => CLOCK,
      });
      const imported = await service.importSource({
        bytes: new TextEncoder().encode("synthetic source"),
        mediaType: "text/plain",
        label: "synthetic",
        provenance: "LOCAL_IMPORT",
        sourceId: "src-y",
      });
      const evidence = await service.recordEvidence({
        sourceRevision: materializeProofSourceRevisionRef({
          sourceId: "src-y",
          revision: imported.revision.revision,
          contentDigest: imported.revision.contentDigest,
        }),
        selector: { kind: "WHOLE_SOURCE" },
      });
      await service.prepareCandidate({
        claimType: PROOF_STATEMENT_TYPE,
        content: { statement: "synthetic claim" },
        supportingEvidenceIds: [evidence.evidenceId],
        origin: "MANUAL",
      });
      const workTables = databaseDigest(join(r.dir, "p.sqlite")).tables;
      const proofBefore = databaseDigest(proofPath);

      const { evidenceId } = await activeTaskWithEvidence(r);
      r.controller.planReconciled({ ...INVALIDATING });
      expect(evidenceStatus(r.store, evidenceId)).toBe("stale");

      // The Proof plane is a SEPARATE store with a disjoint schema, and a Work
      // EVIDENCE_STALE changed none of it.
      const proofAfter = databaseDigest(proofPath);
      expect(proofAfter).toEqual(proofBefore);
      expect(proofBefore.tables).not.toContain("evidence");
      expect(workTables).not.toContain("proof_assets");
      expect(await service.publishedClaims()).toHaveLength(0);
      expect(await service.evidence(evidence.evidenceId)).toBeDefined();
      // The Proof-plane evidence id namespace is distinct from Work evidence.
      expect(evidence.evidenceId).toMatch(/^pev-/u);
      expect(evidenceId).toMatch(/^evidence-/u);
    } finally {
      proofStore.close();
      await r.cleanup();
    }
  });

  it("Y-N24 a Work revision writes only Work tables (Reasoning/Proof untouched)", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      const before = tableDigests(r.store.connection);
      r.controller.planReconciled({ ...INVALIDATING });
      const after = tableDigests(r.store.connection);
      const changed = Object.keys(after).filter((table) => before[table] !== after[table]);
      // Exactly the Work world moved: the log, the ProjectIR, the task graph, the
      // Work Evidence projection, and the store's own projection tail cursors
      // (which move with ANY projection write). Nothing else in the store.
      expect(changed.sort()).toEqual([
        "events",
        "evidence",
        "projection_cursors",
        "projects",
        "tasks",
      ]);
      expect(evidenceStatus(r.store, evidenceId)).toBe("stale");
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N25 promotion semantics are unchanged: a forged source or head fails closed", async () => {
    const r = await rig();
    try {
      const { controller } = r;
      const { attemptId } = await activeTaskWithEvidence(r);
      const committed = await controller.effects.invoke(
        controller.effects.actions.gitCommit,
        { worktreeId: attemptId, message: "work" },
        {
          scope: PROJECT,
          revision: controller.promotions.projectRevision(),
          callId: `commit:${attemptId}`,
        },
      );
      controller.report(attemptId, {
        workerStatus: "completed",
        summary: "done",
        resultCommit: committed.commit,
      });
      controller.step();
      // The expert path re-validates BOTH values against the canonical
      // derivation, so a caller cannot name a source commit or a head. Y did not
      // widen this authority.
      await expect(
        controller.promote(attemptId, "f".repeat(40), "1".repeat(40)),
      ).rejects.toThrow();
      expect(eventsOfType(r.store, "PROMOTION_COMMITTED")).toHaveLength(0);

      // The canonical product path is unaffected and still succeeds.
      await controller.promoteAttempt({ attemptId });
      expect(eventsOfType(r.store, "PROMOTION_COMMITTED")).toHaveLength(1);
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N26 W delegate continuity: revise → continue on the new revision still works", async () => {
    const r = await rig();
    try {
      const { controller } = r;
      const { attemptId } = await activeTaskWithEvidence(r);
      controller.planReconciled({ ...INVALIDATING });
      // The added task is runnable on the NEW revision and its activation is
      // bound to it, i.e. the revision path still hands the delegate a live world.
      const started = controller.step();
      expect(started!.event_type).toBe("TASK_STARTED");
      expect(started!.entity_id).toBe("task-c");
      expect(started!.expected_project_revision).toBe(1);
      const created = controller.step()!;
      await controller.claim(created.entity_id);
      const gate = await controller.gate({
        attemptId: created.entity_id,
        predicate: "tests_pass",
        command: ["python", "-m", "pytest"],
        exitCode: 0,
      });
      expect(gate.event_type).toBe("EVIDENCE_ADDED");
      expect(evidenceStatus(r.store, gate.entity_id)).toBe("active");
      void attemptId;
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N27 no second Evidence store and no authority cache", async () => {
    const r = await rig();
    try {
      const tables = databaseDigest(join(r.dir, "p.sqlite")).tables;
      expect(tables.filter((table) => /evidence/iu.test(table))).toEqual(["evidence"]);
      expect(tables.filter((table) => /invalidation|authority|gate_authority/iu.test(table))).toEqual(
        [],
      );
      // The only schema object Y added is nothing at all: the shape is the one
      // the frozen baseline migrated to.
      expect(tables).toContain("events");
      expect(tables).toContain("gate_registry");
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N28 no background repair job runs after the revision returns", async () => {
    const r = await rig();
    try {
      const { evidenceId } = await activeTaskWithEvidence(r);
      r.controller.planReconciled({ ...INVALIDATING });
      const eventsAfter = r.store.listEvents(PROJECT).length;
      const statusAfter = evidenceStatus(r.store, evidenceId);
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(r.store.listEvents(PROJECT)).toHaveLength(eventsAfter);
      expect(evidenceStatus(r.store, evidenceId)).toBe(statusAfter);
      // No timer is armed by the evidence module or the controller's revision
      // path; the closure is complete when the transaction commits.
      for (const file of [
        join(REPO, "src", "evidence", "invalidation.ts"),
        join(REPO, "src", "evidence", "gate_dsl.ts"),
      ]) {
        expect(readFileSync(file, "utf8")).not.toMatch(/setInterval|setTimeout/u);
      }
    } finally {
      await r.cleanup();
    }
  });

  it("Y-N29 CF-X-01 stays out of scope: no cross-revision parallel promotion surface", async () => {
    const r = await rig();
    try {
      const surface = Object.getOwnPropertyNames(ProjectController.prototype) as string[];
      for (const name of surface) {
        expect(name).not.toMatch(/parallel|oldBase|crossRevision/iu);
      }
      // Observed and CARRIED FORWARD, not fixed by Y: a promotion of an attempt
      // whose task a revision has already retired still commits, advancing the
      // canonical head with superseded-world work. Independently reproduced on
      // the untouched canonical baseline (see G10-Y-CARRY-FORWARD.md, CF-Y-01),
      // so this is promotion-authority scope (adjacent to CF-X-01), not Evidence
      // authority: Y deliberately does NOT widen into it.
      const { controller } = r;
      const { attemptId } = await activeTaskWithEvidence(r);
      const committed = await controller.effects.invoke(
        controller.effects.actions.gitCommit,
        { worktreeId: attemptId, message: "work" },
        {
          scope: PROJECT,
          revision: controller.promotions.projectRevision(),
          callId: `commit:${attemptId}`,
        },
      );
      controller.report(attemptId, {
        workerStatus: "completed",
        summary: "done",
        resultCommit: committed.commit,
      });
      controller.planReconciled({ ...INVALIDATING });
      expect(taskState(r.store, "task-a")).toBe("STALE");
      // The retired task itself can never reach SATISFIED, so the promotion
      // cannot settle it; the head drift it creates is CF-Y-01's subject.
      await controller.promoteAttempt({ attemptId }).catch(() => undefined);
      expect(taskState(r.store, "task-a")).toBe("STALE");
      expect(eventsOfType(r.store, "TASK_SATISFIED")).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });
});
