/**
 * PLMP-LEAN-1 §D5-c3 — REAL CURRENT-BASIS RE-EXECUTION, as machine proofs.
 *
 *     Rework history says WHY            (D5-c2a: durable rework_provenance on the governed TASK_READY)
 *     ContextManifest says WHAT A1 got   (D5-c2b: the per-attempt `continuation` block)
 *     Worker transport merely delivers it (this slice)
 *
 * The transport's compilation point moves to the only place where BOTH the
 * attempt's identity and its world exist and NEITHER has produced work yet:
 *
 *     prepare A1  →  compileTaskContext(A1)  →  compose  →  worker.run()  →  settle
 *
 * and the delivery becomes ATTEMPT-CENTRIC: `workWorkerAttemptContext(A1)` —
 * `work` (the task-level static half, unchanged) + `compiled` (M1's identity,
 * boot references, pull handles, and the read-only PriorResultContext). The
 * worker receives coordinates and concise interpretations, and NO authority.
 *
 * The end-to-end chain proven here, on a REAL git repository (the delegation
 * path observes the canonical tree, so the in-memory port is not eligible):
 *
 *     H0: A0 produces R0 (stale) → governed reopen → head sync H0→H1
 *        → A1 @ E1 with C(R0) delivered → R1 re-executed on H1
 *        → verified → promoted → H2        and Attempt(A0)@E0 never moves
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { ManualClock } from "@ordarium/testing";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, GitCliPort } from "../src/effects/index.js";
import { TaskPolicy, actionKey, type StageGraphDefinition } from "../src/domain/index.js";
import { ReworkAdmissionPermit } from "../src/domain/rework_admission.js";
import { executeMutatingWorkBlocking, makeWorkDelegationService } from "../src/interaction/work_delegation.js";
import { normalizeEventPayload, parseNewEvent, parseProjectIr, parseTaskEnvelope } from "../src/schema/index.js";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { taskSpec } from "./helpers.js";

const CLOCK = "2026-09-16T00:00:00Z";
const PROJECT = "d5c3";
const TASKS = ["task-a", "task-b", "task-c"] as const;

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

const DECLARED_CAPACITY = (): StageGraphDefinition => ({
  stages: [
    { id: "active", state: "ACTIVE", concurrency: 3 },
    { id: "verifying", state: "VERIFYING", concurrency: 3 },
    { id: "blocked", state: "BLOCKED" },
    { id: "ready", state: "READY" },
  ],
  transitions: [
    { from: "active", event: "TASK_VERIFYING", to: "VERIFYING", when: "batch-completed-candidate" },
    { from: "active", event: "TASK_READY", to: "READY", when: "batch-failed-budget-remaining" },
    { from: "active", event: "TASK_FAILED", to: "FAILED", when: "attempt-limit-exhausted" },
    { from: "verifying", event: "TASK_SATISFIED", to: "SATISFIED", when: "promotion-committed" },
    { from: "verifying", event: "TASK_READY", to: "READY", when: "rework-admitted" },
    { from: "blocked", event: "TASK_READY", to: "READY", when: "dependencies-satisfied" },
    { from: "ready", event: "TASK_STARTED", to: "ACTIVE", when: "always" },
  ],
  guards: {},
  declared_by: "d5c3-spec",
  reason: "three tasks must reach VERIFYING together for the re-execution proofs",
});

interface Rig {
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly repo: string;
  attempts: Record<string, string>;
  taskState(taskId: string): string;
  ir(): ReturnType<typeof parseProjectIr>;
  envelopeOf(taskId: string): ReturnType<typeof parseTaskEnvelope>;
  attemptEnvelope(attemptId: string): ReturnType<typeof parseTaskEnvelope> | undefined;
  events(): ReturnType<EventStore["listEvents"]>;
  resultCommitOf(attemptId: string): string;
  /** Drive one task through the REAL delegation kernel (world, file change, commit, settle). */
  drive(taskId: string): Promise<string>;
  reopen(taskId: string): void;
  close(): Promise<void>;
}

async function rig(): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-d5c3-"));
  cleanups.push(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a handle is open; the OS reaps it.
    }
  });
  const repo = join(dir, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "shared.js"), "export const base = 0;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  const head0 = git(repo, ["rev-parse", "HEAD"]);

  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: PROJECT,
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: Object.freeze({
        statement: "tests pass and scope respected",
        clauses: Object.freeze([
          Object.freeze({
            kind: "command_succeeds" as const,
            command: Object.freeze(["node", "-e", "process.exit(0)"]),
            predicate: "tests_pass" as const,
          }),
          Object.freeze({ kind: "scope_respected" as const }),
        ]),
        derivedFrom: Object.freeze(["d5c3 fixture"]),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: trustedDefaultPolicy({
        allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
      }),
    } as never,
  );
  const store = installed.controller.store;
  const controller = installed.controller;
  controller.start({
    projectId: PROJECT,
    goal: "g",
    tasks: TASKS.map((taskId) => taskSpec(taskId)),
    stageGraph: DECLARED_CAPACITY(),
    headCommit: head0,
  });
  controller.declareRoleTable({
    roles: [{ role: "implementer", slots: 3 }],
    hardCap: 3,
    declaredBy: "d5c3-spec",
  });

  const attempts: Record<string, string> = {};
  const readEnvelope = (taskId: string): ReturnType<typeof parseTaskEnvelope> => {
    const task = store.connection
      .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(PROJECT, taskId) as { envelope_json: Uint8Array };
    return parseTaskEnvelope(JSON.parse(new TextDecoder().decode(task.envelope_json)));
  };

  /** The REAL re-execution worker: it edits the task's own write scope and commits. */
  const workerForReal = (taskId: string, message: string) => (worldPath: string) => ({
    adapterId: "d5c3-real",
    run: async () => {
      // Inside the envelope's write scope (src/<taskId>.py):
      writeFileSync(join(worldPath, "src", `${taskId}.py`), `export const base = 1; // ${message}\n`);
      execFileSync("git", ["add", "-A"], { cwd: worldPath });
      execFileSync(
        "git",
        ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", message],
        { cwd: worldPath },
      );
      return { kind: "READY_FOR_SETTLEMENT" as const };
    },
  });

  const drive = async (taskId: string): Promise<string> => {
    let hostError: string | null = null;
    let lastSettlement: unknown = null;
    const service = makeWorkDelegationService({
      controller,
      workerFor: workerForReal(taskId, `work ${taskId}`),
      onTerminal: (terminal) => {
        hostError = terminal.hostError;
        lastSettlement = terminal.settlement;
      },
    });
    await service.start({ expectedTaskId: taskId });
    for (let i = 0; i < 600; i += 1) {
      const row = store.connection
        .prepare("SELECT state FROM attempts WHERE project_id=? AND task_id=? ORDER BY rowid DESC LIMIT 1")
        .get(PROJECT, taskId) as { state: string } | undefined;
      if (row !== undefined && row.state === "COMPLETED") break;
      if (hostError !== null) throw new Error(`delegation host error: ${hostError}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (i === 599) {
        throw new Error(
          `attempt for ${taskId} never completed; hostError=${String(hostError)}; settlement=${JSON.stringify(lastSettlement)}`,
        );
      }
    }
    const attemptId = (
      store.connection
        .prepare("SELECT attempt_id FROM attempts WHERE project_id=? AND task_id=? ORDER BY rowid DESC LIMIT 1")
        .get(PROJECT, taskId) as { attempt_id: string }
    ).attempt_id;
    await controller.gate({ attemptId, predicate: "tests_pass", command: ["node", "-e", "process.exit(0)"] });
    expect(controller.step()!.event_type).toBe("TASK_VERIFYING");
    return attemptId;
  };

  return {
    store,
    controller,
    repo,
    attempts,
    taskState: (taskId) =>
      String(
        (
          store.connection
            .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
            .get(PROJECT, taskId) as { state: string }
        ).state,
      ),
    ir: () => {
      const project = store.connection
        .prepare("SELECT state_json FROM projects WHERE project_id=?")
        .get(PROJECT) as { state_json: Uint8Array };
      return parseProjectIr(JSON.parse(new TextDecoder().decode(project.state_json)));
    },
    envelopeOf: readEnvelope,
    attemptEnvelope: (attemptId) => {
      const record = controller.attemptWorkRecord(attemptId);
      return record?.envelope === undefined || record?.envelope === null
        ? undefined
        : parseTaskEnvelope(record.envelope);
    },
    events: () => store.listEvents(PROJECT),
    resultCommitOf: (attemptId) => {
      const event = store
        .listEvents(PROJECT)
        .find((entry) => entry.event_type === "ATTEMPT_COMPLETED" && entry.entity_id === attemptId);
      if (event === undefined) throw new Error(`attempt ${attemptId} has no completion`);
      return (event.payload as { attempt_report: { result_commit: string } }).attempt_report.result_commit;
    },
    drive,
    reopen: (taskId) => {
      const anchor = JSON.parse(
        new TextDecoder().decode(
          (
            store.connection
              .prepare("SELECT state_json FROM tasks WHERE project_id=? AND task_id=?")
              .get(PROJECT, taskId) as { state_json: Uint8Array }
          ).state_json,
        ),
      ) as { batch_activation_event_id: number };
      const permit = ReworkAdmissionPermit.issue({
        projectId: PROJECT,
        taskId,
        originResultSubjectKind: "attempt_result",
        originResultSubjectRef: attempts[taskId] ?? "origin-" + taskId,
        originBasisDigest: "a".repeat(64),
        targetObservationDigest: "b".repeat(64),
        currentEnvelopeId: readEnvelope(taskId).envelope_id,
        batchActivationEventId: Number(anchor.batch_activation_event_id),
        reason: "INCOMPATIBLE",
      });
      store.appendReworkReopening(
        parseNewEvent({
          schema_version: 1,
          project_id: PROJECT,
          event_type: "TASK_READY",
          payload_version: 1,
          entity_type: "task",
          entity_id: taskId,
          payload: normalizeEventPayload("TASK_READY", {
            previous_state: "VERIFYING",
            new_state: "READY",
            reason: "rework-admitted",
            batch_activation_event_id: Number(anchor.batch_activation_event_id),
          }),
          causation_id: Number(
            (
              store.connection
                .prepare("SELECT last_event_id FROM tasks WHERE project_id=? AND task_id=?")
                .get(PROJECT, taskId) as { last_event_id: number }
            ).last_event_id,
          ),
          correlation_id: `task:${taskId}:rework`,
          idempotency_key: actionKey("task-batch-settle-v1", {
            project_id: PROJECT,
            task_id: taskId,
            batch_activation_event_id: Number(anchor.batch_activation_event_id),
            target_state: "READY",
          }),
          expected_project_revision: 0,
        }),
        permit,
      );
    },
    close: async () => {
      await installed.dispose();
    },
  };
}

/** The D5 chain to the re-execution start line: A1 exists (RESUMED lane) for task-b at E1. */
async function chain(): Promise<Rig> {
  const r = await rig();
  r.attempts["task-a"] = await r.drive("task-a");
  r.attempts["task-b"] = await r.drive("task-b");
  r.attempts["task-c"] = await r.drive("task-c");
  // task-a's promotion moves the canonical/effect head to H1 — the drift window this slice lives in:
  await r.controller.promote(r.attempts["task-a"]!, r.resultCommitOf(r.attempts["task-a"]!), r.ir().head_commit);
  expect(r.controller.step()!.event_type).toBe("TASK_SATISFIED");
  const h1 = git(r.repo, ["rev-parse", "HEAD"]);
  expect(h1).not.toBe(r.resultCommitOf(r.attempts["task-a"]!));
  r.reopen("task-b");
  r.reopen("task-c");
  const reconciled = await r.controller.reconcileProjectHead();
  expect(reconciled.status).toBe("reconciled");
  // A1 exists but has done nothing — exactly the lane the delegation RESUMES:
  r.controller.step();
  const created = r.controller.step()!;
  expect(created.event_type).toBe("ATTEMPT_CREATED");
  r.attempts["A1"] = created.entity_id;
  return r;
}

/* ================================================================== *
 * 1–3. The delivery: attempt-centric, ordered, authority-closed, at H1
 * ================================================================== */

describe("§D5-c3 the delivery is attempt-centric, ordered, and authority-closed", () => {
  it("the worker receives M1 + C(R0): compiled after identity/world exist, before it runs", async () => {
    const r = await chain();
    try {
      let captured: Record<string, unknown> | undefined;
      let capturedWorkDir = "";
      const outcome = await executeMutatingWorkBlocking(
        {
          controller: r.controller,
          workerFor: (worldPath) => ({
            adapterId: "d5c3-fake",
            run: async (input) => {
              captured = input.context as Record<string, unknown>;
              capturedWorkDir = worldPath;
              return { kind: "READY_FOR_SETTLEMENT" as const };
            },
          }),
        },
        { expectedTaskId: "task-b" },
      );
      expect(outcome.attemptId).toBe(r.attempts["A1"]);
      expect(capturedWorkDir).toContain("worlds");

      // The delivery is THIS attempt's own compiled manifest:
      const compiled = captured?.compiled as Record<string, unknown>;
      // The kernel compiles a manifest PER ATTEMPT, so task-b already has A0's; A1's is the latest:
      const manifestEvents = r
        .events()
        .filter(
          (event) =>
            event.event_type === "CONTEXT_MANIFEST_ADDED" &&
            (event.payload as { manifest: { task_id: string } }).manifest.task_id === "task-b",
        );
      const m1Event = manifestEvents.at(-1)!;
      expect(compiled?.manifestId).toBe(
        (m1Event.payload as { manifest: { manifest_id: string } }).manifest.manifest_id,
      );
      // ORDER: identity first, compiled context second, and only then did the worker run:
      const createdEvent = r.events().find((event) => event.entity_id === r.attempts["A1"]);
      expect(createdEvent!.event_id).toBeLessThan(m1Event.event_id);

      // The rework attempt carries its PriorResultContext — read-only presentation:
      const continuation = compiled?.continuation as Record<string, unknown>;
      expect(continuation).toBeDefined();
      expect((continuation.lineage as Record<string, unknown>).reason).toBe("INCOMPATIBLE");
      const worldTransition = continuation.world_transition as Record<string, unknown>;
      expect(worldTransition.from_head).not.toBe(worldTransition.to_head);
      expect(worldTransition.to_head).toBe(r.ir().head_commit);
    } finally {
      await r.close();
    }
  }, 240_000);

  it("AUTHORITY-CLOSED: the delivered object's shape is exactly work+compiled — no capability rides", async () => {
    const r = await chain();
    try {
      let captured: Record<string, unknown> | undefined;
      await executeMutatingWorkBlocking(
        {
          controller: r.controller,
          workerFor: () => ({
            adapterId: "d5c3-fake",
            run: async (input) => {
              captured = input.context as Record<string, unknown>;
              return { kind: "READY_FOR_SETTLEMENT" as const };
            },
          }),
        },
        { expectedTaskId: "task-b" },
      );
      expect(Object.keys(captured!).sort()).toEqual(["compiled", "work"]);
      expect(Object.keys(captured!.compiled as Record<string, unknown>).sort()).toEqual([
        "boot",
        "continuation",
        "handles",
        "manifestId",
      ]);
      expect(Object.keys(captured!.work as Record<string, unknown>).sort()).toEqual([
        "baseCommit",
        "completionChecks",
        "decisions",
        "independentVerificationRequired",
        "objective",
        "projectGoal",
        "requiredArtifacts",
        "requirements",
        "writeScope",
      ]);
      const serialized = JSON.stringify(captured);
      for (const forbidden of ["permitDigest", "reworkProvenanceFromPermit", "expected_head_commit", "promotion_token"]) {
        expect(serialized).not.toContain(forbidden);
      }
    } finally {
      await r.close();
    }
  }, 240_000);

  it("CURRENT BASIS: the re-execution runs at H1 — work.baseCommit is E1's, never E0's", async () => {
    const r = await chain();
    try {
      let captured: Record<string, unknown> | undefined;
      await executeMutatingWorkBlocking(
        {
          controller: r.controller,
          workerFor: () => ({
            adapterId: "d5c3-fake",
            run: async (input) => {
              captured = input.context as Record<string, unknown>;
              return { kind: "READY_FOR_SETTLEMENT" as const };
            },
          }),
        },
        { expectedTaskId: "task-b" },
      );
      const work = captured!.work as { baseCommit: string };
      const e1 = r.envelopeOf("task-b");
      expect(work.baseCommit).toBe(e1.base_commit);
      expect(work.baseCommit).not.toBe(r.attemptEnvelope(r.attempts["task-b"]!)?.base_commit);
      expect(r.attemptEnvelope(r.attempts["A1"]!)?.envelope_id).toBe(e1.envelope_id);
    } finally {
      await r.close();
    }
  }, 240_000);
});

/* ================================================================== *
 * 4. The real re-execution: R1 on H1 → verified → promoted → H2
 * ================================================================== */

describe("§D5-c3 the re-executed result lands through the ordinary authorities", () => {
  it("A1's worker produces R1 on H1; settlement, verification and promotion follow unchanged; head reaches H2", async () => {
    const r = await chain();
    try {
      const a0RecordBefore = JSON.stringify(r.controller.attemptWorkRecord(r.attempts["task-b"]!));
      const r0 = r.resultCommitOf(r.attempts["task-b"]!);
      const service = makeWorkDelegationService({
        controller: r.controller,
        workerFor: (worldPath) => ({
          adapterId: "d5c3-real",
          run: async () => {
            // The worker adapts the work ON THE NEW BASIS: it edits and commits in its own world.
            // The worker adapts the work ON THE NEW BASIS, inside its own write scope:
            writeFileSync(join(worldPath, "src", "task-b.py"), "export const base = 2; // re-executed\n");
            execFileSync("git", ["add", "-A"], { cwd: worldPath });
            execFileSync(
              "git",
              ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "re-executed on the current basis"],
              { cwd: worldPath },
            );
            return { kind: "READY_FOR_SETTLEMENT" as const };
          },
        }),
      });
      await service.start({ expectedTaskId: "task-b" });
      // The kernel settles the ATTEMPT; the TASK's settlement step is the scheduler's:
      for (let i = 0; i < 600; i += 1) {
        const row = r.store.connection
          .prepare("SELECT state FROM attempts WHERE project_id=? AND attempt_id=?")
          .get(PROJECT, r.attempts["A1"] as string) as { state: string } | undefined;
        if (row !== undefined && row.state === "COMPLETED") break;
        await new Promise((resolve) => setTimeout(resolve, 25));
        if (i === 599) throw new Error("A1 never completed");
      }
      expect(r.controller.step()!.event_type).toBe("TASK_VERIFYING");
      expect(r.taskState("task-b")).toBe("VERIFYING");

      // R1 is A1's own result on the new basis:
      const r1 = r.resultCommitOf(r.attempts["A1"]!);
      expect(r1).not.toBe(r0);

      // The ordinary promotion authority takes it the rest of the way:
      await r.controller.promote(r.attempts["A1"]!, r1, r.ir().head_commit);
      expect(r.controller.step()!.event_type).toBe("TASK_SATISFIED");
      const promotionFacts = r.controller.promotions.promotionFactsSync();
      expect(promotionFacts).toHaveLength(2);
      expect(promotionFacts[0]!.resultingHeadCommit).toBe(promotionFacts[1]!.expectedHeadCommit);
      const h2 = promotionFacts[1]!.resultingHeadCommit;
      expect(h2).not.toBe(promotionFacts[0]!.resultingHeadCommit);
      expect(git(r.repo, ["rev-parse", "HEAD"])).toBe(h2);

      // And the historical attempt provenance never moved:
      const a0RecordAfter = JSON.stringify(r.controller.attemptWorkRecord(r.attempts["task-b"]!));
      expect(a0RecordAfter).toBe(a0RecordBefore);
    } finally {
      await r.close();
    }
  }, 240_000);
});

/* ================================================================== *
 * 5. Ordinary attempts: the same transport, no continuation
 * ================================================================== */

describe("§D5-c3 ordinary attempts get the same transport with no continuation", () => {
  it("a non-rework attempt's delivered compiled block has no continuation, and the work half is unchanged", async () => {
    const r = await rig();
    try {
      const a0 = await r.drive("task-a");
      const delivered = await r.controller.workWorkerAttemptContext(a0);
      const viaTask = r.controller.workWorkerTaskContext("task-a");
      expect(delivered.work).toEqual(viaTask);
      expect(delivered.compiled.continuation).toBeUndefined();
      expect(delivered.compiled.manifestId).toBeDefined();
    } finally {
      await r.close();
    }
  }, 240_000);
});
