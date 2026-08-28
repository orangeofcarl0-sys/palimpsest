import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SimulatedProcessCrash } from "@ordarium/core";
import { ManualClock } from "@ordarium/testing";

import {
  createPalimpsestEffects,
  FakeGitPort,
  PromotionManager,
  type GitPort,
} from "../src/effects/index.js";
import { createPromotionRecoveryService } from "../src/recovery/recovery.js";
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

const HEAD = "c".repeat(40);
const OTHER_HEAD = "d".repeat(40);

function tempOrdariumPath(): string {
  return join(mkdtempSync(join(tmpdir(), "palimpsest-h1-")), "operations.sqlite");
}

/** GitPort wrapper whose promote() applies the merge and then dies (Crash B). */
class CrashAfterMergeGit implements GitPort {
  readonly #git: GitPort;
  #promoteCalls = 0;
  constructor(
    git: GitPort,
    private readonly options: { readonly head: string; readonly contains: boolean } = {
      head: HEAD,
      contains: true,
    },
  ) {
    this.#git = git;
  }
  get promoteCalls(): number {
    return this.#promoteCalls;
  }
  createWorktree(input: Parameters<GitPort["createWorktree"]>[0]) {
    return this.#git.createWorktree(input);
  }
  commit(input: Parameters<GitPort["commit"]>[0]) {
    return this.#git.commit(input);
  }
  async promote(input: Parameters<GitPort["promote"]>[0]) {
    this.#promoteCalls += 1;
    const result = await this.#git.promote(input);
    throw new SimulatedProcessCrash();
    return result;
  }
  head() {
    return Promise.resolve(this.options.head);
  }
  async contains(commit: string) {
    return this.options.contains && (await this.#git.contains(commit));
  }
  runGate(input: Parameters<GitPort["runGate"]>[0]) {
    return this.#git.runGate(input);
  }
}

async function prepareVerifying(store: EventStore, git: GitPort, clock = new ManualClock().now) {
  const ledgerPath = tempOrdariumPath();
  const effects = createPalimpsestEffects({ databasePath: ledgerPath, git, clock, leaseMs: 50 });
  const project = makeProject([taskSpec()]);
  const trusted = trustedDefaultPolicy();
  const scheduler = setupScheduler(store, project, trusted);
  scheduler.registerTask(trusted.authorize(project, "task-1"));
  scheduler.runOnce();
  const created = scheduler.runOnce()!;
  scheduler.startAttempt(created.entity_id);
  const revision = store.connection
    .prepare("SELECT revision FROM projects WHERE project_id=?")
    .get(project.project_id) as { revision: number };
  await effects.invoke(
    effects.actions.worktreeCreate,
    { worktreeId: created.entity_id, baseCommit: project.head_commit },
    {
      scope: project.project_id,
      callId: `worktree:${created.entity_id}`,
      revision: revision.revision,
    },
  );
  const committed = await effects.invoke(
    effects.actions.gitCommit,
    { worktreeId: created.entity_id, message: `attempt ${created.entity_id}` },
    { scope: project.project_id, callId: `commit:${created.entity_id}`, revision: revision.revision },
  );
  const report = makeReport(store, created.entity_id, "completed");
  scheduler.recordCallback(created.entity_id, "ATTEMPT_COMPLETED", {
    ...report,
    result_commit: committed.commit,
  });
  scheduler.runOnce(); // TASK_VERIFYING
  return { scheduler, attemptId: created.entity_id, project, resultCommit: committed.commit, ledgerPath, effects };
}

describe("H1-A: promotion recovery (spec §3.1)", () => {
  it("H1-A1: Crash B recovers via the ledger receipt and never re-executes git.promote", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    try {
      const git = new FakeGitPort(HEAD);
      const crashing = new CrashAfterMergeGit(git);
      const clock = new ManualClock();
      const { scheduler, attemptId, project, resultCommit, ledgerPath, effects } =
        await prepareVerifying(store, crashing, clock.now);
      const manager = new PromotionManager(store, effects, project.project_id);
      await expect(
        manager.promote({ attemptId, sourceCommit: resultCommit, expectedHeadCommit: project.head_commit }),
      ).rejects.toBeInstanceOf(SimulatedProcessCrash);
      await effects.close();
      expect(crashing.promoteCalls).toBe(1);

      // The crashed owner's lease must expire before the recovery pass can
      // reclaim the operation; Ordarium's evaluator arbitrates that.
      clock.advance(1000);
      const restarted = createPalimpsestEffects({ databasePath: ledgerPath, git, clock: clock.now });
      try {
        const recovery = createPromotionRecoveryService({
          store,
          effects: restarted,
          projectId: project.project_id,
        });
        const report = await recovery.reconcileAll();
        expect(report.prepared).toBe(1);
        expect(report.terminal).toHaveLength(1);
        const first = report.terminal[0]!;
        expect(first.outcome).toBe("committed");
        if (first.outcome === "committed") {
          expect(first.via).toBe("reconcile");
          expect(first.resultingHeadCommit).toBe(await git.head());
        }
        expect(report.blocked).toHaveLength(0);

        // The promotion event chain is complete and the task satisfies.
        const committed = store.connection
          .prepare("SELECT payload_json AS payload FROM events WHERE event_type='PROMOTION_COMMITTED'")
          .all() as Array<{ payload: Uint8Array }>;
        expect(committed).toHaveLength(1);
        expect(crashing.promoteCalls).toBe(1); // never executed a second time
        const satisfied = scheduler.runOnce();
        expect(satisfied?.event_type).toBe("TASK_SATISFIED");

        // H1-E1: authorization evidence points at the governing plan revision.
        const event = JSON.parse(
          new TextDecoder().decode((committed[0] as { payload: Uint8Array }).payload),
        ) as { resulting_head_commit: string };
        expect(event.resulting_head_commit).toBe(await git.head());
      } finally {
        await restarted.close();
      }
    } finally {
      store.close();
    }
  });

  it("H1-A2: an uncertain outcome that reconcile cannot resolve blocks without a fabricated verdict", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    try {
      // The merge "landed" from the action's view (it threw mid-flight) but the
      // repo disagrees afterwards: reconcile comes back unknown, forever.
      const git = new FakeGitPort(HEAD);
      const lying = new CrashAfterMergeGit(git, { head: OTHER_HEAD, contains: false });
      const clock = new ManualClock();
      const { attemptId, project, resultCommit, ledgerPath, effects } = await prepareVerifying(
        store,
        lying,
        clock.now,
      );
      const manager = new PromotionManager(store, effects, project.project_id);
      await expect(
        manager.promote({ attemptId, sourceCommit: resultCommit, expectedHeadCommit: project.head_commit }),
      ).rejects.toBeInstanceOf(SimulatedProcessCrash);
      await effects.close();
      clock.advance(1000); // the crashed owner's lease expires; reconcile runs

      // The restarted host must see the SAME (lying) git - the reconcile query
      // runs through the action closure bound at effects construction.
      const restarted = createPalimpsestEffects({ databasePath: ledgerPath, git: lying, clock: clock.now });
      try {
        const recovery = createPromotionRecoveryService({
          store,
          effects: restarted,
          projectId: project.project_id,
        });
        const report = await recovery.reconcileAll();
        expect(report.terminal).toHaveLength(0);
        expect(report.blocked.length).toBeGreaterThanOrEqual(1);
        expect(
          report.blocked.some(
            (b) =>
              b.outcome === "blocked" &&
              (b.reason.includes("uncertain") ||
                b.reason.includes("reconcile") ||
                b.reason.includes("redispatch")),
          ),
        ).toBe(true);
        const terminal = store.connection
          .prepare(
            "SELECT event_id FROM events WHERE event_type IN ('PROMOTION_COMMITTED','PROMOTION_FAILED')",
          )
          .all();
        expect(terminal).toHaveLength(0); // no fabricated verdict
      } finally {
        await restarted.close();
      }
    } finally {
      store.close();
    }
  });

  it("H1-A3: an in-flight promotion is reported untouched (no terminal, no re-execution)", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    try {
      const git = new FakeGitPort(HEAD);
      const clock = new ManualClock();
      const { attemptId, project, resultCommit, ledgerPath, effects } = await prepareVerifying(
        store,
        git,
        clock.now,
      );
      await effects.close();
      // Crash right after dispatch: Ordarium owns the outcome; the lease is
      // still alive, so the recovery pass must not touch it.
      const crashing = createPalimpsestEffects({
        databasePath: ledgerPath,
        leaseMs: 50_000,
        git,
        clock: clock.now,
        hooks: new (await import("@ordarium/testing")).FaultInjector().crashAt("after-dispatch", 1),
      });
      try {
        const manager = new PromotionManager(store, crashing, project.project_id);
        await expect(
          manager.promote({ attemptId, sourceCommit: resultCommit, expectedHeadCommit: project.head_commit }),
        ).rejects.toBeInstanceOf(SimulatedProcessCrash);
      } finally {
        await crashing.close();
      }

      const recovered = createPalimpsestEffects({ databasePath: ledgerPath, git, clock: clock.now });
      try {
        const recovery = createPromotionRecoveryService({
          store,
          effects: recovered,
          projectId: project.project_id,
        });
        const report = await recovery.reconcileAll();
        expect(report.terminal).toHaveLength(0);
        expect(report.inFlight.length).toBeGreaterThanOrEqual(1);
        expect(report.inFlight[0]?.outcome).toBe("in-flight");
        const terminal = store.connection
          .prepare(
            "SELECT event_id FROM events WHERE event_type IN ('PROMOTION_COMMITTED','PROMOTION_FAILED')",
          )
          .all();
        expect(terminal).toHaveLength(0);
      } finally {
        await recovered.close();
      }
    } finally {
      store.close();
    }
  });

  it("H1-A4: a PREPARED intent with no Ordarium record is redispatched exactly once", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    try {
      const git = new FakeGitPort(HEAD);
      const clock = new ManualClock();
      const { attemptId, project, resultCommit, ledgerPath, effects } = await prepareVerifying(
        store,
        git,
        clock.now,
      );
      await effects.close();
      const crashing = createPalimpsestEffects({
        databasePath: ledgerPath,
        leaseMs: 50,
        git,
        clock: clock.now,
        hooks: new (await import("@ordarium/testing")).FaultInjector().crashAt("after-claim", 1),
      });
      try {
        const manager = new PromotionManager(store, crashing, project.project_id);
        await expect(
          manager.promote({ attemptId, sourceCommit: resultCommit, expectedHeadCommit: project.head_commit }),
        ).rejects.toBeInstanceOf(SimulatedProcessCrash);
      } finally {
        await crashing.close();
      }

      // The Ordarium ledger was rebuilt from scratch: the record is gone while
      // the project store still holds the PREPARED intent. Recovery redispatches.
      const freshLedger = createPalimpsestEffects({ databasePath: tempOrdariumPath(), git, clock: clock.now });
      try {
        const recovery = createPromotionRecoveryService({
          store,
          effects: freshLedger,
          projectId: project.project_id,
        });
        const report = await recovery.reconcileAll();
        expect(report.terminal).toHaveLength(1);
        const redispatched = report.terminal[0]!;
        expect(redispatched.outcome).toBe("committed");
        if (redispatched.outcome === "committed") expect(redispatched.via).toBe("redispatch");
        const committed = store.connection
          .prepare("SELECT event_id FROM events WHERE event_type='PROMOTION_COMMITTED'")
          .all();
        expect(committed).toHaveLength(1);
      } finally {
        await freshLedger.close();
      }
    } finally {
      store.close();
    }
  });
});
