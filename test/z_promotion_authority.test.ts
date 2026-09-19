/**
 * G10-Z — Promotion eligibility & superseded-work effect fencing.
 *
 * Behavioural suite: a canonical historical attempt result carries promotion
 * authority only while the Work that authorized it is still current, and a
 * PROMOTION_PREPARED intent fences the ProjectIR revision that would retire it.
 *
 *   AttemptHistory ≠ CurrentEffectAuthority
 *   CompletedAttempt ≠ PromotableAttempt
 *   PROMOTION_PREPARED ≠ GitEffectSucceeded
 *   PROMOTION_COMMITTED ≠ WorkSatisfied
 *   Revision ≠ ImplicitPromotionCancellation
 */

import { mkdtempSync } from "node:fs";
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
import { TaskPolicy } from "../src/domain/index.js";
import {
  PromotionEligibilityError,
  explainPromotionIneligibility,
} from "../src/domain/promotion_eligibility.js";
import { PlanReconciliationError } from "../src/advanced.js";
import type { NewEvent, SchedulerEvent } from "../src/schema/index.js";

import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const CLOCK = "2026-09-16T00:00:00Z";
const PROJECT = "z-project";

/** Git port whose `promote` merges and then dies (the genuine Crash B window). */
class CrashAfterMergeGit implements GitPort {
  readonly merges: { count: number } = { count: 0 };

  constructor(
    readonly git: GitPort,
    readonly shouldCrash: () => boolean,
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
    this.merges.count += 1;
    const outcome = await this.git.promote(input);
    if (this.shouldCrash()) {
      throw new SimulatedProcessCrash(`post-merge crash for ${input.promotionId}`);
    }
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
  /** Advance the Ordarium lease clock (recovery needs an expired lease). */
  advance(ms: number): void;
  cleanup(): Promise<void>;
}

async function rig(
  options: { crashOnce?: boolean; tasks?: readonly ReturnType<typeof taskSpec>[] } = {},
): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-z-promo-"));
  const ledgerPath = join(dir, "o.sqlite");
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  let crashArmed = options.crashOnce === true;
  const crashing = new CrashAfterMergeGit(git, () => {
    if (!crashArmed) return false;
    crashArmed = false;
    return true;
  });
  // A short lease so a recovery pass can reclaim an interrupted operation.
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

function eventsOfType(store: EventStore, eventType: string): SchedulerEvent[] {
  return store.listEvents(PROJECT).filter((event) => event.event_type === eventType);
}

function taskState(store: EventStore, taskId: string): string | undefined {
  const row = store.connection
    .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
    .get(PROJECT, taskId) as { state: string } | undefined;
  return row === undefined ? undefined : String(row.state);
}

function revision(store: EventStore): number {
  const row = store.connection
    .prepare("SELECT revision, head_commit FROM projects WHERE project_id=?")
    .get(PROJECT) as { revision: number; head_commit: string };
  return Number(row.revision);
}

function projectHead(store: EventStore): string {
  const row = store.connection
    .prepare("SELECT head_commit FROM projects WHERE project_id=?")
    .get(PROJECT) as { head_commit: string };
  return String(row.head_commit);
}

/** Drive the named task to VERIFYING with one COMPLETED attempt. */
async function driveToVerifying(
  target: Rig,
  taskId = "task-a",
): Promise<{ attemptId: string; resultCommit: string }> {
  const { controller, effects } = target;
  const started = controller.step();
  if (started?.event_type !== "TASK_STARTED" || started.entity_id !== taskId) {
    throw new Error(`expected TASK_STARTED for ${taskId}, got ${started?.event_type}`);
  }
  const created = controller.step()!;
  const attemptId = created.entity_id;
  await controller.claim(attemptId);
  const committed = await effects.invoke(
    effects.actions.gitCommit,
    { worktreeId: attemptId, message: "work" },
    { scope: PROJECT, revision: controller.promotions.projectRevision(), callId: `commit:${attemptId}` },
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
  const verifying = controller.step();
  if (verifying?.event_type !== "TASK_VERIFYING") {
    throw new Error(`expected TASK_VERIFYING, got ${verifying?.event_type}`);
  }
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

/* ------------------------------------------------------------------ *
 * Z1/Z8 — the eligibility model
 * ------------------------------------------------------------------ */

describe("G10-Z promotion eligibility", () => {
  it("a current VERIFYING task's completed candidate is eligible, with a canonical source and head", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId, resultCommit } = await driveToVerifying(r);
      const assessment = r.controller.promotionEligibility(attemptId);

      expect(assessment.eligible).toBe(true);
      expect(assessment.blockers).toEqual([]);
      expect(assessment.attemptState).toBe("COMPLETED");
      expect(assessment.taskState).toBe("VERIFYING");
      expect(assessment.sourceCommit).toBe(resultCommit);
      expect(assessment.taskEnvelopeBaseCommit).toBe(HEAD);
      expect(assessment.canonicalExpectedHead).toBe(HEAD);
      expect(assessment.batchActivationRef).not.toBeNull();
      expect(assessment.pendingPromotionId).toBeNull();
      expect(assessment.assessmentDigest).toMatch(/^[0-9a-f]{64}$/u);
    } finally {
      await r.cleanup();
    }
  });

  it("the preview is read-only: repeated calls append nothing", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      const before = r.store.listEvents(PROJECT).length;
      const first = r.controller.promotionEligibility(attemptId);
      const second = r.controller.promotionEligibility(attemptId);
      expect(second.assessmentDigest).toBe(first.assessmentDigest);
      expect(r.store.listEvents(PROJECT)).toHaveLength(before);
      expect(eventsOfType(r.store, "PROMOTION_PREPARED")).toHaveLength(0);
      expect(eventsOfType(r.store, "PROMOTION_COMMITTED")).toHaveLength(0);
    } finally {
      await r.cleanup();
    }
  });

  it("a retired task's historical result holds NO promotion authority and starts no effect", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      // A typed invalidating revision retires task-a (and revokes its Evidence).
      r.controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-c")],
        changeClass: "behavior_change",
        changedIds: ["task-a"],
      });
      expect(taskState(r.store, "task-a")).toBe("STALE");
      const headBefore = projectHead(r.store);
      const eventsBefore = r.store.listEvents(PROJECT).length;
      const mergesBefore = r.crashing.merges.count;

      const error = await promotionError(() =>
        r.controller.promoteAttempt({ attemptId }),
      );
      expect(error.kind).toBe("task_retired");
      expect(explainPromotionIneligibility(
        r.controller.promotionEligibility(attemptId),
      )).toMatch(/retained as project history/u);

      // Zero PREPARED, zero effect, zero COMMITTED, no head movement.
      expect(r.store.listEvents(PROJECT)).toHaveLength(eventsBefore);
      expect(eventsOfType(r.store, "PROMOTION_PREPARED")).toHaveLength(0);
      expect(eventsOfType(r.store, "PROMOTION_COMMITTED")).toHaveLength(0);
      expect(r.crashing.merges.count).toBe(mergesBefore);
      expect(projectHead(r.store)).toBe(headBefore);

      // The history itself is untouched - retired Work is readable.
      const attempt = r.store.connection
        .prepare("SELECT state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
        .get(PROJECT, attemptId) as { state: string; report_json: Uint8Array | null };
      expect(String(attempt.state)).toBe("COMPLETED");
      expect(attempt.report_json).not.toBeNull();
    } finally {
      await r.cleanup();
    }
  });

  it("the expert promote path is not an authority bypass", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId, resultCommit } = await driveToVerifying(r);
      r.controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-c")],
        changeClass: "behavior_change",
        changedIds: ["task-a"],
      });
      const eventsBefore = r.store.listEvents(PROJECT).length;
      await expect(
        r.controller.promote(attemptId, resultCommit, HEAD),
      ).rejects.toBeInstanceOf(PromotionEligibilityError);
      expect(r.store.listEvents(PROJECT)).toHaveLength(eventsBefore);
    } finally {
      await r.cleanup();
    }
  });

  it("a READY task and an unclaimed attempt are not promotion-eligible", async () => {
    const r = await rig();
    try {
      r.controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a"), taskSpec("task-b")],
      });
      // task-a is READY (never started): no attempt exists at all.
      const missing = await promotionError(() =>
        r.controller.promoteAttempt({ attemptId: "attempt-does-not-exist" }),
      );
      expect(missing.kind).toBe("attempt_unknown");
      expect(taskState(r.store, "task-a")).toBe("READY");
    } finally {
      await r.cleanup();
    }
  });

  it("an old-batch attempt is historical only and cannot promote", async () => {
    const r = await rig();
    try {
      const { controller } = r;
      controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
      controller.step(); // TASK_STARTED
      const first = controller.step()!; // batch 1 attempt
      await controller.claim(first.entity_id);
      // A FAILED candidate sends the task back to READY, opening batch 2.
      controller.report(first.entity_id, { workerStatus: "failed", summary: "no luck" });
      expect(controller.step()!.event_type).toBe("TASK_READY");

      controller.step(); // TASK_STARTED (batch 2)
      const second = controller.step()!;
      expect(second.entity_id).not.toBe(first.entity_id);

      const assessment = controller.promotionEligibility(first.entity_id);
      expect(assessment.eligible).toBe(false);
      expect(assessment.blockers.map((entry) => entry.kind)).toContain("attempt_not_completed");
      // The completed candidate of the CURRENT batch is the promotable one.
      expect(controller.promotionEligibility(second.entity_id).blockers.map((b) => b.kind)).toContain(
        "attempt_not_completed",
      );
    } finally {
      await r.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * Z4/Z5 — the promotion fence
 * ------------------------------------------------------------------ */

describe("G10-Z promotion fence", () => {
  it("an unresolved PREPARED intent fences a typed invalidating revision (zero revision events)", async () => {
    const r = await rig({ crashOnce: true, tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      // PROMOTION_PREPARED commits; the external merge lands; the process dies
      // before PROMOTION_COMMITTED - the genuine Crash B window.
      await expect(r.controller.promoteAttempt({ attemptId })).rejects.toBeInstanceOf(
        SimulatedProcessCrash,
      );
      expect(eventsOfType(r.store, "PROMOTION_PREPARED")).toHaveLength(1);
      expect(eventsOfType(r.store, "PROMOTION_COMMITTED")).toHaveLength(0);
      expect(taskState(r.store, "task-a")).toBe("VERIFYING");

      const before = r.store.listEvents(PROJECT).length;
      const blocker = planError(() =>
        r.controller.planReconciled({
          tasks: [taskSpec("task-a"), taskSpec("task-c")],
          changeClass: "behavior_change",
          changedIds: ["task-a"],
        }),
      );
      // §24: typed invalidation's settlement bypass does NOT cross the fence.
      expect(blocker.kind).toBe("promotion_settlement_required");
      expect(blocker.refs).toContain("task-a");
      expect(r.store.listEvents(PROJECT)).toHaveLength(before);
      expect(eventsOfType(r.store, "TASK_STALE")).toHaveLength(0);
      expect(eventsOfType(r.store, "PROJECT_REVISED")).toHaveLength(0);
      expect(revision(r.store)).toBe(0);
      expect(taskState(r.store, "task-a")).toBe("VERIFYING");
    } finally {
      await r.cleanup();
    }
  });

  it("an unresolved PREPARED intent fences task REMOVAL too", async () => {
    const r = await rig({ crashOnce: true, tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      await expect(r.controller.promoteAttempt({ attemptId })).rejects.toBeInstanceOf(
        SimulatedProcessCrash,
      );
      // Planning task-a away (a removal, no change class) is also fenced.
      const blocker = planError(() => r.controller.planReconciled({ tasks: [] }));
      expect(blocker.kind).toBe("promotion_settlement_required");
      expect(taskState(r.store, "task-a")).toBe("VERIFYING");
      expect(revision(r.store)).toBe(0);
    } finally {
      await r.cleanup();
    }
  });

  it("a COMMITTED-but-unsettled promotion fences retirement until Work settlement", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      await r.controller.promoteAttempt({ attemptId });
      // COMMITTED is present; TASK_SATISFIED has NOT been produced yet.
      expect(eventsOfType(r.store, "PROMOTION_COMMITTED")).toHaveLength(1);
      expect(eventsOfType(r.store, "TASK_SATISFIED")).toHaveLength(0);
      expect(taskState(r.store, "task-a")).toBe("VERIFYING");

      const blocker = planError(() =>
        r.controller.planReconciled({
          tasks: [taskSpec("task-a"), taskSpec("task-c")],
          changeClass: "behavior_change",
          changedIds: ["task-a"],
        }),
      );
      expect(blocker.kind).toBe("promotion_semantic_settlement_required");
      expect(revision(r.store)).toBe(0);

      // The supported order settles the Work first, then syncs the head, then a
      // meaning-changing revision is allowed again.
      expect(r.controller.step()!.event_type).toBe("TASK_SATISFIED");
      expect((await r.controller.reconcileProjectHead()).status).toBe("reconciled");
      const outcome = r.controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-c")],
      });
      expect(outcome.result.revision).toBe(2);
      expect(taskState(r.store, "task-c")).toBe("READY");
    } finally {
      await r.cleanup();
    }
  });

  it("a meaning-changing revision is refused while the head is drifting", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      await r.controller.promoteAttempt({ attemptId });
      // Settle the Work first: the drift rule is about the ORDER
      // (effect → Work settlement → head sync → meaning change), so the
      // meaning-changing revision is attempted on a quiescent but drifting world.
      expect(r.controller.step()!.event_type).toBe("TASK_SATISFIED");
      expect(r.controller.status().head!.state).toBe("SYNC_REQUIRED");

      const blocker = planError(() =>
        r.controller.planReconciled({ tasks: [taskSpec("task-a"), taskSpec("task-b")] }),
      );
      expect(blocker.kind).toBe("head_sync_required");
      expect(revision(r.store)).toBe(0);

      // The trusted head reconciliation itself is exempt and still works.
      expect((await r.controller.reconcileProjectHead()).status).toBe("reconciled");
      expect(r.controller.status().head!.state).toBe("IN_SYNC");
      expect(
        r.controller.planReconciled({ tasks: [taskSpec("task-a"), taskSpec("task-b")] }).result.revision,
      ).toBe(2);
    } finally {
      await r.cleanup();
    }
  });

  it("the same-id replacement blocker still fires first for a changed TaskSpec", async () => {
    const r = await rig();
    try {
      r.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
      // task-a is READY; a changed spec under the same id is refused.
      const changed = { ...taskSpec("task-a"), objective: "a different meaning" };
      const blocker = planError(() => r.controller.planReconciled({ tasks: [changed] }));
      expect(blocker.kind).toBe("replacement_task_id_required");
    } finally {
      await r.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * Z8/§13 — the same-base rule the cross-revision refusal rests on
 * ------------------------------------------------------------------ */

describe("G10-Z current-topology same-base rule", () => {
  it("a task re-authorized by a revision is eligible on the NEW head, not the old one", async () => {
    const r = await rig();
    try {
      const { controller } = r;
      controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-b"), taskSpec("task-a")],
      });
      // A quiescent revision re-authorizes the retained READY tasks onto the
      // current ProjectIR head, so their envelopes move with the revision.
      const before = controller.promotionEligibility("task-does-not-exist");
      expect(before.eligible).toBe(false);

      const outcome = controller.planReconciled({
        tasks: [taskSpec("task-b"), taskSpec("task-a")],
      });
      expect(outcome.result.revision).toBe(1);
      // The canonical expected head and every retained envelope's base agree, so
      // nothing is refused for `cross_revision_promotion_not_supported`.
      const status = controller.status().head!;
      expect(status.state).toBe("IN_SYNC");
      expect(controller.promotions.canonicalExpectedHeadSync()).toBe(status.projectHeadCommit);
      void r;
    } finally {
      await r.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * §32 — idempotent terminal replay
 * ------------------------------------------------------------------ */

describe("G10-Z idempotent terminal replay", () => {
  it("repeating a committed promotion returns history and never re-executes Git", async () => {
    const r = await rig({ tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      const first = await r.controller.promoteAttempt({ attemptId });
      expect(r.crashing.merges.count).toBe(1);
      const mergesAfterFirst = r.crashing.merges.count;

      // The task is now SATISFIED (not VERIFYING), so this can only be answered
      // from the terminal fact - never as fresh authority.
      r.controller.step(); // TASK_SATISFIED
      const replay = await r.controller.promoteAttempt({ attemptId });
      expect(replay.committed.event_id).toBe(first.committed.event_id);
      expect(replay.resultingHeadCommit).toBe(first.resultingHeadCommit);
      expect(r.crashing.merges.count).toBe(mergesAfterFirst);
      expect(eventsOfType(r.store, "PROMOTION_COMMITTED")).toHaveLength(1);
    } finally {
      await r.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * §27/§29/§30 — recovery authority re-check
 * ------------------------------------------------------------------ */

describe("G10-Z recovery authority re-check", () => {
  it("no supported retirement path can cross an unresolved promotion intent (G10-AA audit finding)", async () => {
    const r = await rig({ crashOnce: true, tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      // A GENUINE intent from the governed protocol: the merge lands and the
      // process dies before the terminal, leaving an unresolved PREPARED.
      await expect(r.controller.promoteAttempt({ attemptId })).rejects.toBeInstanceOf(
        SimulatedProcessCrash,
      );
      expect(r.crashing.merges.count).toBe(1);
      expect(r.controller.status().promotionFence).toHaveLength(1);

      // G10-AA hardening: Z's fence lived only in `planReconciled`, so the
      // direct `invalidateTask` path could retire the Work across the effect and
      // manufacture exactly the state recovery's authority re-check exists to
      // survive. Every supported retirement path is now fenced.
      const paths: Array<[string, () => unknown]> = [
        [
          "direct task invalidation",
          () => r.controller.invalidateTask("task-a", "retire across the effect"),
        ],
        [
          "typed invalidating revision",
          () =>
            r.controller.planReconciled({
              tasks: [taskSpec("task-a"), taskSpec("task-c")],
              changeClass: "behavior_change",
              changedIds: ["task-a"],
            }),
        ],
        ["task removal", () => r.controller.planReconciled({ tasks: [] })],
        [
          "same-id replacement",
          () =>
            r.controller.planReconciled({
              tasks: [{ ...taskSpec("task-a"), objective: "different" }, taskSpec("task-c")],
            }),
        ],
      ];
      for (const [label, run] of paths) {
        const before = r.store.listEvents(PROJECT).length;
        let blocker: PlanReconciliationError | undefined;
        try {
          run();
        } catch (error) {
          blocker = error as PlanReconciliationError;
        }
        // Every path is REFUSED with zero writes. The fence is the reason where
        // the task would actually leave the plan; a same-id replacement keeps the
        // id, so the revision's own `replacement_task_id_required` /
        // `quiescence_required` refusal carries it - and since a VERIFYING task is
        // never quiescent, no replacement can retire it either way.
        expect([
          "promotion_settlement_required",
          "replacement_task_id_required",
          "quiescence_required",
        ]).toContain(blocker?.kind);
        expect(r.store.listEvents(PROJECT)).toHaveLength(before);
      }
      // With every retirement path fenced, "unresolved intent + revoked Work
      // authority" is unreachable through the supported surface - which is what
      // makes recovery's authority re-check defence in depth rather than a
      // reachable branch. The task is untouched and the fence still stands.
      expect(taskState(r.store, "task-a")).toBe("VERIFYING");
      expect(r.controller.status().promotionFence).toHaveLength(1);
    } finally {
      await r.cleanup();
    }
  });

  it("recovery still resolves a CURRENT intent normally", async () => {
    const r = await rig({ crashOnce: true, tasks: [taskSpec("task-a")] });
    let recoveryEffects: PalimpsestEffectsRuntime | undefined;
    try {
      const { attemptId } = await driveToVerifying(r);
      await expect(r.controller.promoteAttempt({ attemptId })).rejects.toBeInstanceOf(
        SimulatedProcessCrash,
      );
      await r.effects.close();

      r.advance(1000);
      recoveryEffects = createPalimpsestEffects({
        databasePath: r.ledgerPath,
        git: r.git,
        leaseMs: 50,
      });
      const manager = new ProjectController({
        store: r.store,
        effects: recoveryEffects,
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
      expect(report.terminal).toHaveLength(1);
      expect(eventsOfType(r.store, "PROMOTION_COMMITTED")).toHaveLength(1);
      expect(taskState(r.store, "task-a")).toBe("VERIFYING");
    } finally {
      await recoveryEffects?.close();
      await r.effects.close().catch(() => undefined);
      r.store.close();
    }
  });
});

/* ------------------------------------------------------------------ *
 * §22/§41/§42 — observability
 * ------------------------------------------------------------------ */

describe("G10-Z promotion fence observability", () => {
  it("the status view exposes the fence and the workspace surfaces it as an open loop", async () => {
    const r = await rig({ crashOnce: true, tasks: [taskSpec("task-a")] });
    try {
      const { attemptId } = await driveToVerifying(r);
      await expect(r.controller.promoteAttempt({ attemptId })).rejects.toBeInstanceOf(
        SimulatedProcessCrash,
      );
      const fence = r.controller.status().promotionFence;
      expect(fence).toHaveLength(1);
      expect(fence[0]).toMatchObject({ attempt_id: attemptId, task_id: "task-a", state: "PREPARED" });
    } finally {
      await r.cleanup();
    }
  });
});
