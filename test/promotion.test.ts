import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SimulatedProcessCrash, UncertainOperationError } from "@ordarium/core";
import { FaultInjector, ManualClock } from "@ordarium/testing";

/** project.head_commit used by the helpers. */
const HEAD = "c".repeat(40);

/** GitPort wrapper that dies right after a successful merge (Crash B). */
class PromoCrashGit implements GitPort {
  readonly git: GitPort;
  readonly afterPromote: (input: Parameters<GitPort["promote"]>[0]) => Promise<never>;

  constructor(
    git: GitPort,
    afterPromote: (input: Parameters<GitPort["promote"]>[0]) => Promise<never>,
  ) {
    this.git = git;
    this.afterPromote = afterPromote;
  }

  createWorktree(input: Parameters<GitPort["createWorktree"]>[0]) {
    return this.git.createWorktree(input);
  }
  commit(input: Parameters<GitPort["commit"]>[0]) {
    return this.git.commit(input);
  }
  promote(input: Parameters<GitPort["promote"]>[0]) {
    return this.afterPromote(input);
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
}

import {
  createPalimpsestEffects,
  FakeGitPort,
  PromotionManager,
  promotionIdFor,
  ClaimReportExecutor,
  CommandExecutor,
  MockExecutor,
  type AttemptContext,
  type GitPort,
} from "../src/effects/index.js";
import { EventStore } from "../src/index.js";

import {
  FakeClock,
  makeProject,
  makeReport,
  setupScheduler,
  taskSpec,
  tempStatePath,
  trustedDefaultPolicy,
} from "./helpers.js";

function tempOrdariumPath(): string {
  return join(mkdtempSync(join(tmpdir(), "palimpsest-promo-")), "operations.sqlite");
}

/**
 * Drive one task to VERIFYING with a completed attempt whose result commit is
 * a real commit produced through the Palimpsest effects (worktree.create +
 * git.commit). Returns everything the promotion tests need.
 */
async function prepareVerifying(
  store: EventStore,
  git: GitPort,
  clock = new ManualClock().now,
) {
  const ledgerPath = tempOrdariumPath();
  const effects = createPalimpsestEffects({
    databasePath: ledgerPath,
    git,
    clock,
  });
  const project = makeProject([taskSpec()]);
  const trusted = trustedDefaultPolicy();
  const scheduler = setupScheduler(store, project, trusted);
  scheduler.registerTask(trusted.authorize(project, "task-1"));
  scheduler.runOnce();
  const created = scheduler.runOnce()!;
  scheduler.startAttempt(created.entity_id);
  // The attempt commits real work through the effects layer.
  const revision = store.connection.prepare(
    "SELECT revision FROM projects WHERE project_id=?",
  ).get(project.project_id) as { revision: number };
  await effects.invoke(
    effects.actions.worktreeCreate,
    { worktreeId: created.entity_id, baseCommit: project.head_commit },
    { scope: project.project_id, callId: `worktree:${created.entity_id}`, revision: revision.revision },
  );
  const committed = await effects.invoke(
    effects.actions.gitCommit,
    { worktreeId: created.entity_id, message: `attempt ${created.entity_id}` },
    { scope: project.project_id, callId: `commit:${created.entity_id}`, revision: revision.revision },
  );
  const report = makeReport(store, created.entity_id, "completed");
  scheduler.recordCallback(
    created.entity_id,
    "ATTEMPT_COMPLETED",
    { ...report, result_commit: committed.commit },
  );
  scheduler.runOnce(); // TASK_VERIFYING
  return {
    scheduler,
    attemptId: created.entity_id,
    project,
    resultCommit: committed.commit,
    ledgerPath,
    effects,
  };
}

describe("PromotionManager drives real promotions through Ordarium", () => {
  it("promote() lands PROMOTION_COMMITTED and the Scheduler satisfies the Task", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    try {
      const git = new FakeGitPort(HEAD);
      const { scheduler, attemptId, project, resultCommit, effects } = await prepareVerifying(
        store,
        git,
      );
      try {
        const manager = new PromotionManager(store, effects, project.project_id);
        const result = await manager.promote({
          attemptId,
          sourceCommit: resultCommit,
          expectedHeadCommit: project.head_commit,
        });
        expect(result.committed.event_type).toBe("PROMOTION_COMMITTED");
        expect(result.resultingHeadCommit).toMatch(/^[0-9a-f]{40}$/);

        const satisfied = scheduler.runOnce();
        expect(satisfied?.event_type).toBe("TASK_SATISFIED");
        expect(satisfied?.causation_id).toBe(result.committed.event_id);
        expect(store.connection.prepare("SELECT state FROM tasks").get()).toMatchObject({
          state: "SATISFIED",
        });
      } finally {
        await effects.close();
      }
    } finally {
      store.close();
    }
  });

  it("a crash before the merge (Crash A) recovers and still commits exactly once", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    try {
      const git = new FakeGitPort(HEAD);
      const clock = new ManualClock();
      const { scheduler, attemptId, project, resultCommit, ledgerPath, effects } =
        await prepareVerifying(store, git, clock.now);
      await effects.close();
      // Promote phase runs on a runtime that crashes right after claim.
      const crashing = createPalimpsestEffects({
        databasePath: ledgerPath,
        leaseMs: 50,
        git,
        clock: clock.now,
        hooks: new FaultInjector().crashAt("after-claim", 1),
      });
      try {
        const manager = new PromotionManager(store, crashing, project.project_id);
        await expect(
          manager.promote({
            attemptId,
            sourceCommit: resultCommit,
            expectedHeadCommit: project.head_commit,
          }),
        ).rejects.toBeInstanceOf(SimulatedProcessCrash);
      } finally {
        await crashing.close();
      }
      // Restart on the same ordarium ledger; the promotion resumes and commits once.
      clock.advance(1000);
      const restarted = createPalimpsestEffects({
        databasePath: ledgerPath,
        leaseMs: 50,
        git,
        clock: clock.now,
      });
      try {
        const manager = new PromotionManager(store, restarted, project.project_id);
        const result = await manager.promote({
          attemptId,
          sourceCommit: resultCommit,
          expectedHeadCommit: project.head_commit,
        });
        expect(result.committed.event_type).toBe("PROMOTION_COMMITTED");
        await expect(git.head()).resolves.toBe(result.resultingHeadCommit);
        expect(scheduler.runOnce()?.event_type).toBe("TASK_SATISFIED");
      } finally {
        await restarted.close();
      }
    } finally {
      store.close();
    }
  });

  it("a crash after the merge (Crash B) recovers without a second merge", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    try {
      const git = new FakeGitPort(HEAD);
      const clock = new ManualClock();
      let mergeCount = 0;
      // The provider performs the merge, then the process dies before the
      // ledger can record the outcome: the genuine Crash B window.
      const crashingGit = new PromoCrashGit(git, async (input) => {
        mergeCount += 1;
        const outcome = await git.promote(input);
        throw new SimulatedProcessCrash(`post-merge crash for ${input.promotionId}`);
      });
      const { scheduler, attemptId, project, resultCommit, ledgerPath, effects } =
        await prepareVerifying(store, crashingGit, clock.now);
      await effects.close();
      // Promote phase runs on a runtime without crash hooks; the provider
      // itself dies after the merge (the genuine Crash B window).
      const promoteRuntime = createPalimpsestEffects({
        databasePath: ledgerPath,
        leaseMs: 50,
        git: crashingGit,
        clock: clock.now,
      });
      try {
        const manager = new PromotionManager(store, promoteRuntime, project.project_id);
        // The provider died inside execute: SimulatedProcessCrash propagates
        // (the ledger stays at dispatched), and the manager must NOT
        // terminalize the promotion — a restart reconciles it.
        await expect(
          manager.promote({
            attemptId,
            sourceCommit: resultCommit,
            expectedHeadCommit: project.head_commit,
          }),
        ).rejects.toBeInstanceOf(SimulatedProcessCrash);
        expect(mergeCount).toBe(1); // the merge itself landed
      } finally {
        await promoteRuntime.close();
      }
      clock.advance(1000);
      const restarted = createPalimpsestEffects({
        databasePath: ledgerPath,
        leaseMs: 50,
        git,
        clock: clock.now,
      });
      try {
        const manager = new PromotionManager(store, restarted, project.project_id);
        const result = await manager.promote({
          attemptId,
          sourceCommit: resultCommit,
          expectedHeadCommit: project.head_commit,
        });
        expect(result.committed.event_type).toBe("PROMOTION_COMMITTED");
        expect(mergeCount).toBe(1); // reconciled, never re-merged
        expect(scheduler.runOnce()?.event_type).toBe("TASK_SATISFIED");
      } finally {
        await restarted.close();
      }
    } finally {
      store.close();
    }
  });

  it("promotionIdFor is stable and unique per attempt", () => {
    const projectId = "scheduler-project";
    expect(promotionIdFor(projectId, "attempt-a")).toBe(promotionIdFor(projectId, "attempt-a"));
    expect(promotionIdFor(projectId, "attempt-a")).not.toBe(
      promotionIdFor(projectId, "attempt-b"),
    );
    expect(promotionIdFor(projectId, "attempt-a")).toMatch(/^promotion-[0-9a-f]{32}$/);
  });
});

describe("attempt executors", () => {
  const context = (overrides: Partial<AttemptContext> = {}): AttemptContext => {
    const project = makeProject([taskSpec()]);
    return {
      attemptId: "attempt-1",
      project,
      envelope: trustedDefaultPolicy().authorize(project, "task-1").envelope,
      worktreePath: "worktree:attempt-1",
      ...overrides,
    };
  };

  it("MockExecutor returns its scripted outcome", async () => {
    const executor = new MockExecutor({
      workerStatus: "failed",
      summary: "scripted failure",
      changedFiles: ["src/x.py"],
    });
    expect(await executor.execute(context())).toMatchObject({
      workerStatus: "failed",
      summary: "scripted failure",
      changedFiles: ["src/x.py"],
    });
  });

  it("CommandExecutor maps exit 0 to completed and nonzero to failed", async () => {
    const git = new FakeGitPort();
    git.setGateOutcome("attempt-1", "python", ["-m", "pytest"], 0);
    const passing = new CommandExecutor(git);
    expect(await passing.execute(context())).toMatchObject({ workerStatus: "completed" });

    git.setGateOutcome("attempt-1", "python", ["-m", "pytest"], 1);
    const failing = new CommandExecutor(git);
    expect(await failing.execute(context())).toMatchObject({ workerStatus: "failed" });
  });

  it("ClaimReportExecutor forwards the host agent's report and claims first", async () => {
    const claims: string[] = [];
    const executor = new ClaimReportExecutor({
      onClaim: (ctx) => claims.push(ctx.attemptId),
      onReport: async (ctx) => ({
        schema_version: 1,
        project_id: ctx.project.project_id,
        attempt_id: ctx.attemptId,
        task_id: ctx.envelope.task_id,
        envelope_id: ctx.envelope.envelope_id,
        input_project_revision: ctx.envelope.project_revision,
        input_project_digest: ctx.envelope.project_digest,
        base_commit: ctx.envelope.base_commit,
        worktree_id: `worktree-${ctx.attemptId.slice(-8)}`,
        result_commit: null,
        worker_status: "completed",
        summary: "agent-reported",
        changed_files: ["src/task-1.py"],
        produced_artifacts: [],
        started_at: "2026-08-13T00:00:00Z",
        finished_at: "2026-08-13T00:00:01Z",
        runtime_metadata: {
          runner: "dsh-agent",
          runner_version: "1",
          argv: [],
          exit_code: 0,
          duration_ms: 1,
          environment_digest: "e".repeat(64),
          stdout_artifact: null,
          stderr_artifact: null,
        },
      }),
    });
    const result = await executor.execute(context());
    expect(claims).toEqual(["attempt-1"]);
    expect(result.workerStatus).toBe("completed");
    expect(result.summary).toBe("agent-reported");
  });

  it("executor kinds are distinguishable for host binding", () => {
    const git = new FakeGitPort();
    expect(new MockExecutor({ workerStatus: "completed" }).kind).toBe("mock");
    expect(new CommandExecutor(git).kind).toBe("command");
    expect(
      new ClaimReportExecutor({ onReport: async () => undefined as never }).kind,
    ).toBe("claim-report");
  });
});
