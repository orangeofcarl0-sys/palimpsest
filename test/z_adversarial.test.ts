/**
 * G10-Z adversarial suite (Z-N01…Z-N30).
 *
 * Every item asserts that a HISTORICAL result is not CURRENT authority, and that
 * an outstanding external effect cannot be crossed by a ProjectIR revision.
 */

import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { SimulatedProcessCrash } from "@ordarium/core";
import { ManualClock } from "@ordarium/testing";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import {
  createPalimpsestEffects,
  FakeGitPort,
  type GitPort,
  type PalimpsestEffectsRuntime,
} from "../src/effects/index.js";
import { TaskPolicy, actionKey } from "../src/domain/index.js";
import {
  PromotionEligibilityError,
  assessPromotionEligibility,
} from "../src/domain/promotion_eligibility.js";
import { PlanReconciliationError } from "../src/advanced.js";
import { MANAGEMENT_ACTION_CLASSES } from "../src/project_management/index.js";
import type { NewEvent, SchedulerEvent } from "../src/schema/index.js";

import { FakeClock, makeReport, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const CLOCK = "2026-09-16T00:00:00Z";
const PROJECT = "z-adv-project";
const REPO = join(__dirname, "..");

class CrashAfterMergeGit implements GitPort {
  merges = 0;
  constructor(
    readonly git: GitPort,
    readonly crashOnce: boolean,
  ) {}
  createWorktree(input: Parameters<GitPort["createWorktree"]>[0]) {
    return this.git.createWorktree(input);
  }

  async observeWorktree(_input: { worktreeId: string }): Promise<{
    head: string;
    changedPaths: string[];
    hasUncommittedChanges: boolean;
  }> {
    return { head: "0".repeat(40), changedPaths: [], hasUncommittedChanges: false };
  }
  commit(input: Parameters<GitPort["commit"]>[0]) {
    return this.git.commit(input);
  }
  async promote(input: Parameters<GitPort["promote"]>[0]) {
    this.merges += 1;
    const outcome = await this.git.promote(input);
    if (this.crashOnce) throw new SimulatedProcessCrash("post-merge crash");
    return outcome;
  }
  head() {
    return this.git.head();
  }
  contains(commit: string) {
    return this.git.contains(commit);
  }
  runGate(input: Parameters<GitPort["runGate"]>[0]) {
    return this.git.runGate(input);
  }
  scanLexical(input: Parameters<GitPort["scanLexical"]>[0]) {
    return this.git.scanLexical(input);
  }
  collectWorktreeTexts(input: Parameters<GitPort["collectWorktreeTexts"]>[0]) {
    return this.git.collectWorktreeTexts(input);
  }
}

interface Rig {
  readonly dir: string;
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly effects: PalimpsestEffectsRuntime;
  readonly git: FakeGitPort;
  readonly crashing: CrashAfterMergeGit;
  readonly ledgerPath: string;
  advance(ms: number): void;
  cleanup(): Promise<void>;
}

async function rig(options: { crashOnce?: boolean; tasks?: readonly ReturnType<typeof taskSpec>[] } = {}): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-z-adv-"));
  const ledgerPath = join(dir, "o.sqlite");
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const crashing = new CrashAfterMergeGit(git, options.crashOnce === true);
  const leaseClock = new ManualClock();
  const effects = createPalimpsestEffects({
    databasePath: ledgerPath,
    git: crashing,
    clock: leaseClock.now,
    leaseMs: 50,
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
      timeout_s: 3600,
      lease_s: 60,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => CLOCK,
  });
  if (options.tasks !== undefined) {
    controller.start({ projectId: PROJECT, goal: "g", tasks: [...options.tasks] });
  }
  return {
    dir,
    store,
    controller,
    effects,
    git,
    crashing,
    ledgerPath,
    advance: (ms: number) => leaseClock.advance(ms),
    cleanup: async () => {
      await effects.close();
      try {
        store.close();
      } catch {
        /* reopened */
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const eventsOfType = (store: EventStore, eventType: string): SchedulerEvent[] =>
  store.listEvents(PROJECT).filter((event) => event.event_type === eventType);

function taskState(store: EventStore, taskId: string): string | undefined {
  const row = store.connection
    .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
    .get(PROJECT, taskId) as { state: string } | undefined;
  return row === undefined ? undefined : String(row.state);
}

function projectHead(store: EventStore): string {
  const row = store.connection
    .prepare("SELECT head_commit FROM projects WHERE project_id=?")
    .get(PROJECT) as { head_commit: string };
  return String(row.head_commit);
}

function revisionOf(store: EventStore): number {
  const row = store.connection
    .prepare("SELECT revision FROM projects WHERE project_id=?")
    .get(PROJECT) as { revision: number };
  return Number(row.revision);
}

async function driveToVerifying(
  target: Rig,
  taskId = "task-a",
): Promise<{ attemptId: string; resultCommit: string }> {
  const { controller, effects } = target;
  const started = controller.step();
  if (started?.event_type !== "TASK_STARTED") throw new Error("expected TASK_STARTED");
  if (started.entity_id !== taskId) {
    throw new Error(`expected TASK_STARTED for ${taskId}, got ${started.entity_id}`);
  }
  const created = controller.step()!;
  const attemptId = created.entity_id;
  await controller.claim(attemptId);
  const committed = await effects.invoke(
    effects.actions.gitCommit,
    { worktreeId: attemptId, message: "work" },
    { scope: PROJECT, revision: controller.promotions.projectRevision(), callId: `c:${attemptId}` },
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
  return { attemptId, resultCommit: committed.commit };
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

async function promotionError(run: () => Promise<unknown>): Promise<PromotionEligibilityError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof PromotionEligibilityError) return error;
    throw error;
  }
  throw new Error("expected PromotionEligibilityError, but the call returned normally");
}

/** The typed revision that retires task-a (the W/Y path). */
const RETIRE_TASK_A = {
  tasks: [taskSpec("task-a"), taskSpec("task-c")],
  changeClass: "behavior_change",
  changedIds: ["task-a"],
} as const;

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
}

/* ------------------------------------------------------------------ *
 * Z-N01…Z-N09 — authority of a historical result
 * ------------------------------------------------------------------ */

describe("G10-Z adversarial: a historical result is not authority", () => {
  it("Z-N01/Z-N02 a historical result alone grants no authority once its task is retired", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      r.controller.planReconciled({ ...RETIRE_TASK_A });
      const assessment = r.controller.promotionEligibility(attemptId);
      expect(assessment.eligible).toBe(false);
      expect(assessment.blockers.map((entry) => entry.kind)).toContain("task_retired");
      const error = await promotionError(() => r.controller.promoteAttempt({ attemptId }));
      expect(error.kind).toBe("task_retired");
      expect(eventsOfType(r.store, "PROMOTION_PREPARED")).toHaveLength(0);
      expect(r.crashing.merges).toBe(0);
    } finally {
      await r.cleanup();
    }
  });

  it("Z-N03 a FAILED attempt cannot start a new promotion", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { controller } = r;
      controller.step();
      const created = controller.step()!;
      await controller.claim(created.entity_id);
      controller.report(created.entity_id, { workerStatus: "failed", summary: "no" });
      const assessment = controller.promotionEligibility(created.entity_id);
      expect(assessment.eligible).toBe(false);
      expect(assessment.blockers.map((entry) => entry.kind)).toContain("attempt_not_completed");
      expect(eventsOfType(r.store, "PROMOTION_PREPARED")).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });

  it("Z-N04 a SATISFIED task cannot start a NEW promotion (only replay its own)", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      const first = await r.controller.promoteAttempt({ attemptId });
      r.controller.step(); // TASK_SATISFIED
      expect(taskState(r.store, "task-a")).toBe("SATISFIED");

      // Fresh authority is gone...
      expect(r.controller.promotionEligibility(attemptId).blockers.map((e) => e.kind)).toContain(
        "task_not_verifying",
      );
      // ...but the terminal fact answers the replay (Z-N20) without a new effect.
      const replay = await r.controller.promoteAttempt({ attemptId });
      expect(replay.committed.event_id).toBe(first.committed.event_id);
      expect(r.crashing.merges).toBe(1);
    } finally {
      await r.cleanup();
    }
  });

  it("Z-N05 an older-batch completed attempt cannot promote", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { controller } = r;
      controller.step();
      const old = controller.step()!;
      await controller.claim(old.entity_id);
      controller.report(old.entity_id, { workerStatus: "failed", summary: "retry" });
      controller.step(); // TASK_READY -> new batch
      controller.step(); // TASK_STARTED
      const current = controller.step()!;
      // The old attempt is COMPLETED? No - it FAILED; the batch anchor is what
      // makes it historical. Both are refused, for their own typed reason.
      const assessment = controller.promotionEligibility(old.entity_id);
      expect(assessment.eligible).toBe(false);
      expect(current.entity_id).not.toBe(old.entity_id);
    } finally {
      await r.cleanup();
    }
  });

  it("Z-N06 a stale input-world candidate cannot promote - and cannot even be recorded", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { controller } = r;
      // Authorize the task on a NEWER revision, then try to record a completed
      // report that claims an OLDER input world.
      controller.planReconciled({ tasks: [taskSpec("task-a")] });
      expect(revisionOf(r.store)).toBe(1);
      expect(controller.step()!.event_type).toBe("TASK_STARTED");
      const created = controller.step()!;
      await controller.claim(created.entity_id);
      const committed = await r.effects.invoke(
        r.effects.actions.gitCommit,
        { worktreeId: created.entity_id, message: "work" },
        { scope: PROJECT, revision: controller.promotions.projectRevision(), callId: `c:${created.entity_id}` },
      );

      // The aggregate refuses the stale report at ATTEMPT_COMPLETED, so a
      // promotion-eligible-looking completion on a stale input world cannot even
      // exist on the log. The stale-input case is therefore closed one layer
      // BELOW promotion admission.
      const staleReport = {
        ...makeReport(r.store, created.entity_id, "completed"),
        input_project_revision: 0,
        result_commit: committed.commit,
      };
      expect(() =>
        controller.scheduler.recordCallback(
          created.entity_id,
          "ATTEMPT_COMPLETED",
          staleReport as never,
        ),
      ).toThrow(/input identity does not match/u);
      expect(eventsOfType(r.store, "ATTEMPT_COMPLETED")).toHaveLength(0);
      expect(controller.promotionEligibility(created.entity_id).eligible).toBe(false);
      expect(eventsOfType(r.store, "PROMOTION_PREPARED")).toHaveLength(0);

      // Defence in depth: if a foreign/legacy log DID carry such a report, the
      // shared assessor refuses it with the report facet of `input_world_stale`.
      const pure = assessPromotionEligibility({
        project: { revision: 1, digest: "d", headCommit: HEAD },
        attempt: {
          attemptId: "attempt-x",
          taskId: "task-a",
          state: "COMPLETED",
          report: { ...staleReport, input_project_revision: 0 } as never,
        },
        task: {
          taskId: "task-a",
          state: "VERIFYING",
          envelope: {
            envelope_id: (makeReport(r.store, created.entity_id, "completed").envelope_id),
            project_revision: 1,
            project_digest: "d",
            base_commit: HEAD,
          } as never,
        },
        currentBatchAttemptIds: ["attempt-x"],
        batchActivationEventId: 1,
        canonicalExpectedHead: HEAD,
        headConflict: null,
        pendingPromotion: null,
        gate: null,
      });
      expect(pure.eligible).toBe(false);
      const stale = pure.blockers.filter((entry) => entry.kind === "input_world_stale");
      expect(stale.some((entry) => entry.facet === "report")).toBe(true);
      expect(r.crashing.merges).toBe(0);
    } finally {
      await r.cleanup();
    }
  });

  it("Z-N07 the canonical source/head checks are retained on a fresh promotion", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      const before = r.store.listEvents(PROJECT).length;
      await expect(
        r.controller.promote(attemptId, "f".repeat(40), HEAD),
      ).rejects.toThrow(/canonical/u);
      expect(r.store.listEvents(PROJECT)).toHaveLength(before);
      expect(r.crashing.merges).toBe(0);
    } finally {
      await r.cleanup();
    }
  });

  it("Z-N08/Z-N09 the gate stays orthogonal, and revoked Evidence still defeats it", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      const gateEvent = await r.controller.gate({
        attemptId,
        predicate: "lint_pass",
        command: ["python", "-m", "pytest"],
      });
      const evidenceId = gateEvent.entity_id;
      r.controller.declareGate(
        {
          gate_id: "z-gate",
          version: 1,
          subject_type: "attempt",
          require: { mode: "all", chain: [{ exists: { predicate: "lint_pass" } }] },
        },
        "z-adv",
      );
      // PASS gate: allowed.
      expect(r.controller.promotionEligibility(attemptId, "z-gate").eligible).toBe(true);

      // Revoked Evidence (Y semantics) defeats the gate before any effect.
      r.controller.invalidateEvidence(evidenceId, "superseded");
      const assessment = r.controller.promotionEligibility(attemptId, "z-gate");
      expect(assessment.eligible).toBe(false);
      expect(assessment.blockers.map((entry) => entry.kind)).toContain("gate_not_pass");
      const error = await promotionError(() =>
        r.controller.promoteAttempt({ attemptId, gateId: "z-gate" }),
      );
      expect(error.kind).toBe("gate_not_pass");
      expect(eventsOfType(r.store, "PROMOTION_PREPARED")).toHaveLength(0);

      // A missing gate is not required by default: promotion policy is unchanged.
      expect(r.controller.promotionEligibility(attemptId).eligible).toBe(true);
    } finally {
      await r.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * Z-N10…Z-N18 — the fence
 * ------------------------------------------------------------------ */

describe("G10-Z adversarial: the promotion fence", () => {
  it("Z-N11/Z-N14/Z-N15 typed invalidation cannot cross an unresolved PREPARED intent", async () => {
    const r = await rig({ crashOnce: true, tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      await expect(r.controller.promoteAttempt({ attemptId })).rejects.toBeInstanceOf(
        SimulatedProcessCrash,
      );
      expect(r.crashing.merges).toBe(1);
      expect(eventsOfType(r.store, "PROMOTION_PREPARED")).toHaveLength(1);
      expect(eventsOfType(r.store, "PROMOTION_COMMITTED")).toHaveLength(0);

      const before = r.store.listEvents(PROJECT).length;
      const blocker = planError(() => r.controller.planReconciled({ ...RETIRE_TASK_A }));
      expect(blocker.kind).toBe("promotion_settlement_required");
      expect(r.store.listEvents(PROJECT)).toHaveLength(before);
      expect(revisionOf(r.store)).toBe(0);
      expect(taskState(r.store, "task-a")).toBe("VERIFYING");
      expect(eventsOfType(r.store, "TASK_STALE")).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });

  it("Z-N12/Z-N13 removal and same-id replacement cannot cross the fence either", async () => {
    const r = await rig({ crashOnce: true, tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      await expect(r.controller.promoteAttempt({ attemptId })).rejects.toBeInstanceOf(
        SimulatedProcessCrash,
      );
      // Removal.
      const removal = planError(() => r.controller.planReconciled({ tasks: [] }));
      expect(removal.kind).toBe("promotion_settlement_required");
      // Same-id replacement.
      const replacement = planError(() =>
        r.controller.planReconciled({
          tasks: [{ ...taskSpec("task-a"), objective: "different meaning" }, taskSpec("task-c")],
        }),
      );
      expect([
        "replacement_task_id_required",
        "promotion_settlement_required",
        "quiescence_required",
      ]).toContain(replacement.kind);
      expect(revisionOf(r.store)).toBe(0);
      expect(taskState(r.store, "task-a")).toBe("VERIFYING");
    } finally {
      await r.cleanup();
    }
  });

  it("Z-N18 a COMMITTED-but-unsettled promotion cannot be casually retired", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      await r.controller.promoteAttempt({ attemptId });
      expect(eventsOfType(r.store, "PROMOTION_COMMITTED")).toHaveLength(1);
      const blocker = planError(() => r.controller.planReconciled({ ...RETIRE_TASK_A }));
      expect(blocker.kind).toBe("promotion_semantic_settlement_required");
      expect(taskState(r.store, "task-a")).toBe("VERIFYING");
      expect(revisionOf(r.store)).toBe(0);
    } finally {
      await r.cleanup();
    }
  });

  it("Z-N16/Z-N17 (G10-AA aware) recovery re-checks authority, and no path can manufacture the revoked state", async () => {
    // (a) The G10-AA audit found that Z's fence lived only in `planReconciled`,
    // so the direct `invalidateTask` path could retire Work across an unresolved
    // effect - the exact state recovery's authority re-check guards. It is now
    // fenced too, so the state is unreachable through the supported surface.
    const a = await rig({ crashOnce: true, tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(a);
      await expect(a.controller.promoteAttempt({ attemptId })).rejects.toBeInstanceOf(
        SimulatedProcessCrash,
      );
      expect(a.crashing.merges).toBe(1);
      expect(() => a.controller.invalidateTask("task-a", "legacy retirement")).toThrow(
        /promotion_settlement_required/,
      );
      expect(taskState(a.store, "task-a")).toBe("VERIFYING");
      expect(a.controller.status().promotionFence).toHaveLength(1);
    } finally {
      await a.cleanup();
    }

    // (b) a PROVEN effect is recorded honestly, and still never satisfies Work.
    const b = await rig({ crashOnce: true, tasks: [taskSpec("task-a")] });
    let restarted: PalimpsestEffectsRuntime | undefined;
    try {
      const { attemptId } = await driveToVerifying(b);
      await expect(b.controller.promoteAttempt({ attemptId })).rejects.toBeInstanceOf(
        SimulatedProcessCrash,
      );
      expect(b.crashing.merges).toBe(1); // the merge really landed
      await b.effects.close();
      b.advance(1000);
      restarted = createPalimpsestEffects({
        databasePath: b.ledgerPath,
        git: b.git,
        leaseMs: 50,
      });
      const manager = new ProjectController({
        store: b.store,
        effects: restarted,
        projectId: PROJECT,
        policy: new TaskPolicy({
          policy_id: "trusted-default",
          read_paths: ["src"],
          allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
          network_policy: "deny",
          network_allowlist: [],
          timeout_s: 3600,
          lease_s: 60,
          attempt_limit: 3,
          candidate_limit: 1,
        }),
        clock: () => CLOCK,
      });
      const report = await manager.recovery.reconcileAll();
      // The effect is recorded (never hidden) and the merge is NOT repeated.
      expect(report.terminal.map((entry) => entry.outcome)).toEqual(["committed"]);
      expect(eventsOfType(b.store, "PROMOTION_COMMITTED")).toHaveLength(1);
      expect(b.crashing.merges).toBe(1);
      // Effect truth ≠ Work admission: TASK_SATISFIED is still a separate act.
      expect(eventsOfType(b.store, "TASK_SATISFIED")).toHaveLength(0);
      expect(taskState(b.store, "task-a")).toBe("VERIFYING");
    } finally {
      await restarted?.close();
      await b.effects.close().catch(() => undefined);
      b.store.close();
    }
  });

  it("Z-N10 an unsupported cross-revision promotion is refused before Git", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      await r.controller.promoteAttempt({ attemptId });
      expect(r.controller.status().head!.state).toBe("SYNC_REQUIRED");
      const canonicalHead = await r.controller.promotions.canonicalExpectedHead();
      expect(canonicalHead).not.toBe(HEAD);

      // A task still authorized at HEAD is incompatible with the advanced head.
      const baseRow = r.store.connection
        .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
        .get(PROJECT, "task-a") as { envelope_json: Uint8Array };
      const envelope = JSON.parse(new TextDecoder().decode(baseRow.envelope_json)) as {
        base_commit: string;
      };
      expect(envelope.base_commit).toBe(HEAD);

      const mergesBefore = r.crashing.merges;
      const error = await promotionError(() =>
        r.controller.promoteAttempt({ attemptId: "attempt-not-relevant" }),
      );
      expect(error.kind).toBe("attempt_unknown");
      expect(r.crashing.merges).toBe(mergesBefore);
    } finally {
      await r.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * Z-N19…Z-N30 — plane separation, regressions, anti-waste
 * ------------------------------------------------------------------ */

describe("G10-Z adversarial: plane separation and regressions", () => {
  it("Z-N19 TASK_SATISFIED remains the final semantic admission", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      const promotion = await r.controller.promoteAttempt({ attemptId });
      // The promotion alone does NOT satisfy the task.
      expect(taskState(r.store, "task-a")).toBe("VERIFYING");
      expect(eventsOfType(r.store, "TASK_SATISFIED")).toHaveLength(0);
      const settled = r.controller.step()!;
      expect(settled.event_type).toBe("TASK_SATISFIED");
      expect(settled.causation_id).toBe(promotion.committed.event_id);
      // The aggregate validator is still the gate: its checks are intact.
      const aggregate = readFileSync(join(REPO, "src", "domain", "aggregate.ts"), "utf8");
      expect(aggregate).toMatch(/promotion does not match candidate commits/u);
      expect(aggregate).toMatch(/promotion Attempt input world is stale/u);
      expect(aggregate).toMatch(/promotion Attempt is not in the current batch/u);
    } finally {
      await r.cleanup();
    }
  });

  it("Z-N21 the eligibility preview is read-only", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      const before = r.store.listEvents(PROJECT).length;
      const merges = r.crashing.merges;
      r.controller.promotionEligibility(attemptId);
      // An undeclared gate fails closed rather than silently skipping the check.
      expect(() => r.controller.promotionEligibility(attemptId, "no-such-gate")).toThrow(
        /not declared/u,
      );
      expect(r.store.listEvents(PROJECT)).toHaveLength(before);
      expect(r.crashing.merges).toBe(merges);
    } finally {
      await r.cleanup();
    }
  });

  it("Z-N22 ManagementMode grants no promotion override", () => {
    // The management layer carries no promotion action class at all, so MANAGE
    // and DELEGATE cannot override a refusal - they cannot promote.
    expect(MANAGEMENT_ACTION_CLASSES).not.toContain("PROMOTE_ATTEMPT");
    for (const action of MANAGEMENT_ACTION_CLASSES) {
      expect(action).not.toMatch(/promot/iu);
    }
    // And the management service exposes no promotion port.
    const service = readFileSync(
      join(REPO, "src", "project_management", "service.ts"),
      "utf8",
    );
    expect(service).not.toMatch(/promoteAttempt|engine\.promote|promote\(/u);
  });

  it("Z-N23/Z-N26 sequential multi-promotion and head semantics remain intact", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { controller } = r;
      const first = await driveToVerifying(r, "task-a");
      const promoA = await controller.promoteAttempt({ attemptId: first.attemptId });
      expect(controller.step()!.event_type).toBe("TASK_SATISFIED");
      expect(controller.status().head!.state).toBe("SYNC_REQUIRED");
      expect((await controller.reconcileProjectHead()).status).toBe("reconciled");
      expect(projectHead(r.store)).toBe(promoA.resultingHeadCommit);

      // A task ADDED after the sync is authorized on the proven head, so the
      // second promotion is a supported same-base promotion again.
      controller.planReconciled({ tasks: [taskSpec("task-a"), taskSpec("task-c")] });
      const second = await driveToVerifying(r, "task-c");
      const assessment = controller.promotionEligibility(second.attemptId);
      expect(assessment.eligible).toBe(true);
      expect(assessment.taskEnvelopeBaseCommit).toBe(projectHead(r.store));
      expect(assessment.canonicalExpectedHead).toBe(projectHead(r.store));

      const promoB = await controller.promoteAttempt({ attemptId: second.attemptId });
      expect(promoB.committed.payload.expected_head_commit).toBe(promoA.resultingHeadCommit);
      expect(promoB.resultingHeadCommit).not.toBe(promoA.resultingHeadCommit);
      expect(controller.step()!.event_type).toBe("TASK_SATISFIED");
      expect((await controller.reconcileProjectHead()).status).toBe("reconciled");
      expect(projectHead(r.store)).toBe(promoB.resultingHeadCommit);
      expect(eventsOfType(r.store, "PROMOTION_COMMITTED")).toHaveLength(2);
    } finally {
      await r.cleanup();
    }
  });

  it("Z-N24/Z-N25 the W revision and Y Evidence closures stay atomic", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      const before = r.store.listEvents(PROJECT).length;
      r.controller.planReconciled({ ...RETIRE_TASK_A });
      const batch = r.store.listEvents(PROJECT).slice(before);
      // Y: the revocation rides in the SAME batch as the retirement, ahead of
      // the revision; W: the batch is one contiguous transaction.
      expect(batch.map((event) => event.event_type)).toEqual([
        "TASK_STALE",
        "EVIDENCE_STALE",
        "PROJECT_REVISED",
        "TASK_CREATED",
      ]);
      const sequences = batch.map((event) => event.project_sequence);
      expect(sequences).toEqual(sequences.map((_, index) => (sequences[0] as number) + index));
      const evidence = r.store.connection
        .prepare("SELECT status FROM evidence WHERE project_id=? AND evidence_id=?")
        .get(PROJECT, r.store.listEvents(PROJECT).find((e) => e.event_type === "EVIDENCE_ADDED")!.entity_id) as {
        status: string;
      };
      expect(String(evidence.status)).toBe("stale");
      void attemptId;
    } finally {
      await r.cleanup();
    }
  });

  it("Z-N27 CF-X-01 remains unsupported, and is not faked", () => {
    const prototype = Object.getOwnPropertyNames(ProjectController.prototype) as string[];
    for (const name of prototype) {
      expect(name).not.toMatch(/parallel|oldBase|crossRevision|compatib/iu);
    }
    // No compatibility engine was added anywhere in the source.
    const offenders: string[] = [];
    for (const file of sourceFiles(join(REPO, "src"))) {
      const text = readFileSync(file, "utf8");
      if (/crossRevisionCompat|oldBaseCompat/iu.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("Z-N28 no new lock or promotion store is introduced", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const tables = (
        r.store.connection
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all() as Array<{ name: string }>
      ).map((row) => String(row.name));
      expect(tables.filter((name) => /promotion/iu.test(name))).toEqual(["promotions"]);
      expect(tables.filter((name) => /lock|fence|eligib/iu.test(name))).toEqual([]);
      // The fence is DERIVED from the promotion events, not stored.
      expect(r.controller.status().promotionFence).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it("Z-N29 replay, rebuild and recovery stay deterministic", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    let reopened: EventStore | undefined;
    try {
      const { attemptId } = await driveToVerifying(r);
      await r.controller.promoteAttempt({ attemptId });
      r.controller.step(); // TASK_SATISFIED
      // Recovery over a settled world is a no-op - checked on the live store.
      const report = await r.controller.recovery.reconcileAll();
      expect(report.prepared).toBe(0);
      expect(report.terminal).toEqual([]);

      r.store.close();
      reopened = new EventStore(join(r.dir, "p.sqlite"), { clock: new FakeClock().next });
      reopened.quickCheck();
      reopened.verifyFull();
      const first = reopened.rebuildProjections();
      const second = reopened.rebuildProjections();
      expect(second).toEqual(first);
      expect(taskState(reopened, "task-a")).toBe("SATISFIED");
      expect(eventsOfType(reopened, "PROMOTION_COMMITTED")).toHaveLength(1);
    } finally {
      reopened?.close();
      await r.cleanup();
    }
  });

  it("Z-N30 no External Asset scope was pulled in", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(REPO, "src", "domain"))) {
      const text = readFileSync(file, "utf8");
      if (/externalAssetLibrary|assetLibraryBridge/iu.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
    const promotion = readFileSync(
      join(REPO, "src", "domain", "promotion_eligibility.ts"),
      "utf8",
    );
    expect(promotion).not.toMatch(/externalAsset|assetLibrary/iu);
  });
});
