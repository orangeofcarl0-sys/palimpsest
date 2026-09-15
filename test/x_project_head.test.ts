/**
 * G10-X canonical project-head evolution — behavioural suite.
 *
 * Proves, against real controller/promotion-manager behaviour:
 *   - the PURE derivation builds only the CONTIGUOUS applicable chain and
 *     never "takes the last resulting head" (a broken chain is CONFLICT);
 *   - an absorbed chain (after a reconciliation advances the head) is IN_SYNC;
 *   - the canonical promotion API derives the source from the attempt report
 *     and the expected head from the promotion chain, and callers cannot
 *     choose either;
 *   - external git divergence is typed and never fabricates a head;
 *   - the trusted revision head-advance advances the ProjectIR head through
 *     the SAME atomic batch and reauthorizes retained tasks;
 *   - runTurn has no deadlock: promotion → drift → new activation blocked →
 *     settlement allowed → quiescent → head sync → activation resumes.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compileProjectHeadReconciliation,
  deriveProjectHeadStatus,
  ProjectHeadError,
  type PromotionFact,
} from "../src/domain/project_head.js";
import {
  DEFAULT_STAGE_GRAPH,
  TaskPolicy,
  type StageGraphDefinition,
} from "../src/domain/index.js";
import {
  createPalimpsestEffects,
  FakeGitPort,
  type GitPort,
} from "../src/effects/index.js";
import { EventStore } from "../src/state/index.js";
import { ProjectController } from "../src/tools/index.js";

import { FakeClock, makeProject, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const R1 = "1".repeat(40);
const R2 = "2".repeat(40);
const R3 = "3".repeat(40);
const PROJECT = "scheduler-project";

function fact(overrides: Partial<PromotionFact> & { eventId: string }): PromotionFact {
  return {
    promotionId: `promotion-${overrides.eventId}`,
    attemptId: `attempt-${overrides.eventId}`,
    sourceCommit: "a".repeat(40),
    expectedHeadCommit: HEAD,
    resultingHeadCommit: HEAD,
    ...overrides,
  };
}

describe("G10-X pure project-head derivation", () => {
  it("no promotion means IN_SYNC at the project head", () => {
    const status = deriveProjectHeadStatus({
      project: { revision: 0, headCommit: HEAD },
      promotions: [],
    });
    expect(status.state).toBe("IN_SYNC");
    expect(status.provenEffectHeadCommit).toBe(HEAD);
    expect(status.latestPromotionEventRef).toBeNull();
  });

  it("a contiguous chain yields SYNC_REQUIRED at the last chained resulting head", () => {
    const status = deriveProjectHeadStatus({
      project: { revision: 0, headCommit: HEAD },
      promotions: [
        fact({ eventId: "10", expectedHeadCommit: HEAD, resultingHeadCommit: R1 }),
        fact({ eventId: "11", expectedHeadCommit: R1, resultingHeadCommit: R2 }),
      ],
    });
    expect(status.state).toBe("SYNC_REQUIRED");
    expect(status.provenEffectHeadCommit).toBe(R2);
    expect(status.latestPromotionEventRef).toBe("11");
  });

  it("a broken chain is CONFLICT and never skips to a later resulting head", () => {
    const status = deriveProjectHeadStatus({
      project: { revision: 0, headCommit: HEAD },
      promotions: [
        fact({ eventId: "10", expectedHeadCommit: HEAD, resultingHeadCommit: R1 }),
        // Does not chain onto R1: this is the exact "take the last resulting
        // head" trap - it must be a CONFLICT, not a silent R3.
        fact({ eventId: "11", expectedHeadCommit: R2, resultingHeadCommit: R3 }),
      ],
    });
    expect(status.state).toBe("CONFLICT");
    expect(status.provenEffectHeadCommit).toBe(R1);
    expect(status.latestPromotionEventRef).toBe("10");
  });

  it("a chain whose head has already been absorbed by a reconciliation is IN_SYNC", () => {
    const status = deriveProjectHeadStatus({
      project: { revision: 3, headCommit: R2 },
      promotions: [
        fact({ eventId: "10", expectedHeadCommit: HEAD, resultingHeadCommit: R1 }),
        fact({ eventId: "11", expectedHeadCommit: R1, resultingHeadCommit: R2 }),
      ],
    });
    expect(status.state).toBe("IN_SYNC");
    expect(status.provenEffectHeadCommit).toBe(R2);
    expect(status.latestPromotionEventRef).toBe("11");
  });

  it("a fact that neither anchors on the head nor is an absorbed tip is CONFLICT", () => {
    const status = deriveProjectHeadStatus({
      project: { revision: 0, headCommit: HEAD },
      promotions: [fact({ eventId: "10", expectedHeadCommit: R2, resultingHeadCommit: R3 })],
    });
    expect(status.state).toBe("CONFLICT");
    expect(status.provenEffectHeadCommit).toBe(HEAD);
  });
});

describe("G10-X pure reconciliation compiler", () => {
  const project = makeProject([taskSpec("task-1")]);

  it("IN_SYNC blocks with no_drift and is not compilable", () => {
    const status = deriveProjectHeadStatus({
      project: { revision: 0, headCommit: HEAD },
      promotions: [],
    });
    const candidate = compileProjectHeadReconciliation({
      project,
      status,
      tasks: [{ taskId: "task-1", state: "READY" }],
      openAttempts: [],
    });
    expect(candidate.compilable).toBe(false);
    expect(candidate.blockers.map((blocker) => blocker.kind)).toEqual(["no_drift"]);
  });

  it("quiescence_required blocks while an ACTIVE task or an open attempt exists", () => {
    const promotions = [
      fact({ eventId: "10", expectedHeadCommit: HEAD, resultingHeadCommit: R1 }),
    ];
    const status = deriveProjectHeadStatus({
      project: { revision: 0, headCommit: HEAD },
      promotions,
    });
    const candidate = compileProjectHeadReconciliation({
      project,
      status,
      tasks: [
        { taskId: "task-1", state: "VERIFYING" },
        { taskId: "task-2", state: "READY" },
      ],
      openAttempts: [{ attemptId: "attempt-9", taskId: "task-1", state: "RUNNING" }],
      promotions,
    });
    expect(candidate.compilable).toBe(false);
    expect(candidate.blockers.map((blocker) => blocker.kind)).toEqual(["quiescence_required"]);
    expect(candidate.blockers[0]!.refs).toEqual(["attempt-9", "task-1"]);
    expect(candidate.currentWorkState.verifyingTaskIds).toEqual(["task-1"]);
    expect(candidate.currentWorkState.runnableTaskIds).toEqual(["task-2"]);
  });

  it("quiescent SYNC_REQUIRED compiles and renders the provable chain basis", () => {
    const promotions = [
      fact({ eventId: "10", expectedHeadCommit: HEAD, resultingHeadCommit: R1 }),
      fact({ eventId: "11", expectedHeadCommit: R1, resultingHeadCommit: R2 }),
    ];
    const status = deriveProjectHeadStatus({
      project: { revision: 0, headCommit: HEAD },
      promotions,
    });
    const candidate = compileProjectHeadReconciliation({
      project,
      status,
      tasks: [{ taskId: "task-1", state: "READY" }],
      openAttempts: [],
      promotions,
    });
    expect(candidate.compilable).toBe(true);
    expect(candidate.blockers).toEqual([]);
    expect(candidate.toHead).toBe(R2);
    expect(candidate.promotionChainBasis).toEqual([
      { promotionId: "promotion-10", eventId: "10", from: HEAD, to: R1 },
      { promotionId: "promotion-11", eventId: "11", from: R1, to: R2 },
    ]);
  });

  it("SYNC_REQUIRED without a backing promotion fact is head_not_proven", () => {
    const status = {
      schemaVersion: 1 as const,
      projectRevision: 0,
      projectHeadCommit: HEAD,
      provenEffectHeadCommit: R1,
      latestPromotionEventRef: null,
      state: "SYNC_REQUIRED" as const,
    };
    const candidate = compileProjectHeadReconciliation({
      project,
      status,
      tasks: [],
      openAttempts: [],
    });
    expect(candidate.compilable).toBe(false);
    expect(candidate.blockers.map((blocker) => blocker.kind)).toEqual(["head_not_proven"]);
  });
});

/* ------------------------------------------------------------------ *
 * Controller rig: two concurrent ACTIVE tasks
 * ------------------------------------------------------------------ */

const TWO_ACTIVE: StageGraphDefinition = {
  stages: [
    { id: "active", state: "ACTIVE", concurrency: 2 },
    { id: "verifying", state: "VERIFYING" },
    { id: "blocked", state: "BLOCKED" },
    { id: "ready", state: "READY" },
  ],
  transitions: DEFAULT_STAGE_GRAPH.transitions,
  guards: {},
  declared_by: "x-head-test",
  reason: "two concurrent ACTIVE tasks for the head barrier",
};

interface Rig {
  store: EventStore;
  controller: ProjectController;
  git: GitPort;
  cleanup(): Promise<void>;
}

async function rig(git: GitPort = new FakeGitPort(HEAD)): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-xhead-"));
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
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
    clock: () => "2026-09-15T00:00:00Z",
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

function taskState(store: EventStore, taskId: string): string | undefined {
  const row = store.connection
    .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
    .get(PROJECT, taskId) as { state: string } | undefined;
  return row === undefined ? undefined : String(row.state);
}

function headOf(store: EventStore): string {
  const row = store.connection
    .prepare("SELECT head_commit FROM projects WHERE project_id=?")
    .get(PROJECT) as { head_commit: string };
  return String(row.head_commit);
}

function report(controller: ProjectController, attemptId: string, commit: string): void {
  controller.report(attemptId, {
    workerStatus: "completed",
    summary: "done",
    resultCommit: commit,
  });
}

/** claim → commit → completed report for one created attempt. */
async function completeAttempt(
  controller: ProjectController,
  attemptId: string,
): Promise<string> {
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
  report(controller, attemptId, committed.commit);
  return committed.commit;
}

describe("G10-X canonical promotion derivation", () => {
  it("canonicalExpectedHead follows the chain; promote() refuses caller-chosen values", async () => {
    const { controller, git, cleanup } = await rig();
    try {
      controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-1")] });
      controller.step(); // TASK_STARTED
      const created = controller.step()!; // ATTEMPT_CREATED
      expect(await controller.promotions.canonicalExpectedHead()).toBe(HEAD);

      await controller.claim(created.entity_id);
      const committed = await controller.effects.invoke(
        controller.effects.actions.gitCommit,
        { worktreeId: created.entity_id, message: "work" },
        {
          scope: PROJECT,
          revision: controller.promotions.projectRevision(),
          callId: `c:${created.entity_id}`,
        },
      );
      report(controller, created.entity_id, committed.commit);
      controller.step(); // TASK_VERIFYING

      // A caller cannot choose the source commit...
      await expect(
        controller.promote(created.entity_id, "f".repeat(40), HEAD),
      ).rejects.toMatchObject({ kind: "caller_source_not_canonical" });
      // ...nor the expected head.
      await expect(
        controller.promote(created.entity_id, committed.commit, "e".repeat(40)),
      ).rejects.toMatchObject({ kind: "caller_head_not_canonical" });

      const result = await controller.promotions.promoteAttempt({ attemptId: created.entity_id });
      expect(result.committed.event_type).toBe("PROMOTION_COMMITTED");
      expect(await controller.promotions.canonicalExpectedHead()).toBe(
        result.resultingHeadCommit,
      );
      expect(await git.head()).toBe(result.resultingHeadCommit);
    } finally {
      await cleanup();
    }
  });

  it("promoteAttempt fails closed on a null result_commit", async () => {
    const { controller, cleanup } = await rig();
    try {
      controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-1")] });
      controller.step();
      const created = controller.step()!;
      await controller.claim(created.entity_id);
      controller.report(created.entity_id, { workerStatus: "failed", summary: "no commit" });
      controller.step(); // TASK_READY (failed batch); the report has no result commit
      // G10-Z §10: a new promotion may only start from a COMPLETED attempt of a
      // current VERIFYING task, so this is now refused EARLIER and for a
      // stronger reason than the missing source commit - the guarantee under
      // test (fail closed, write nothing) is preserved and tightened. A
      // COMPLETED report cannot carry a null result commit through the product
      // surface at all (the controller fills it in), so `result_commit_missing`
      // remains defence in depth for direct writers.
      await expect(
        controller.promotions.promoteAttempt({ attemptId: created.entity_id }),
      ).rejects.toMatchObject({ kind: "attempt_not_completed" });
    } finally {
      await cleanup();
    }
  });

  it("external git divergence is typed and fabricates no promotion", async () => {
    const base = new FakeGitPort(HEAD);
    let mergeAttempts = 0;
    const diverging: GitPort = {
      createWorktree: (input) => base.createWorktree(input),
      commit: (input) => base.commit(input),
      async promote() {
        mergeAttempts += 1;
        throw new Error(`expected head ${HEAD} does not match current head ${R3}`);
      },
      async head() {
        return R3;
      },
      contains: (commit) => base.contains(commit),
      runGate: (input) => base.runGate(input),
      scanLexical: (input) => base.scanLexical(input),
      collectWorktreeTexts: (input) => base.collectWorktreeTexts(input),
    };
    const { controller, store, cleanup } = await rig(diverging);
    try {
      controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-1")] });
      controller.step();
      const created = controller.step()!;
      await controller.claim(created.entity_id);
      const committed = await base.commit({
        worktreeId: created.entity_id,
        message: "work",
      });
      report(controller, created.entity_id, committed.commit);
      controller.step(); // VERIFYING
      let thrown: unknown;
      try {
        await controller.promote(created.entity_id, committed.commit, HEAD);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ProjectHeadError);
      expect((thrown as ProjectHeadError).kind).toBe("external_head_divergence");
      expect(mergeAttempts).toBe(1);
      const terminal = store.connection
        .prepare(
          "SELECT COUNT(*) AS total FROM events WHERE event_type IN ('PROMOTION_COMMITTED','PROMOTION_FAILED')",
        )
        .get() as { total: number };
      expect(terminal.total).toBe(0);
    } finally {
      await cleanup();
    }
  });
});

describe("G10-X head advance through the revision batch", () => {
  it("reconcileProjectHead reauthorizes retained tasks onto the proven head", async () => {
    const { controller, store, cleanup } = await rig();
    try {
      controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      controller.step(); // TASK_STARTED task-a
      const created = controller.step()!;
      const commit = await completeAttempt(controller, created.entity_id);
      controller.step(); // TASK_VERIFYING
      const promotion = await controller.promote(created.entity_id, commit, HEAD);
      controller.step(); // TASK_SATISFIED
      controller.step(); // TASK_READY task-b

      const before = controller.status();
      expect(before.head?.state).toBe("SYNC_REQUIRED");
      expect(before.head?.provenEffectHeadCommit).toBe(promotion.resultingHeadCommit);
      expect(before.head?.projectHeadCommit).toBe(HEAD);

      const outcome = await controller.reconcileProjectHead();
      expect(outcome.status).toBe("reconciled");
      expect(outcome.fromHead).toBe(HEAD);
      expect(outcome.toHead).toBe(promotion.resultingHeadCommit);
      expect(headOf(store)).toBe(promotion.resultingHeadCommit);
      expect(controller.status().head?.state).toBe("IN_SYNC");

      // The retained READY task's envelope is rebound onto the new base.
      const envelope = JSON.parse(
        new TextDecoder().decode(
          (
            store.connection
              .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
              .get(PROJECT, "task-b") as { envelope_json: Uint8Array }
          ).envelope_json,
        ),
      ) as { base_commit: string; project_revision: number };
      expect(envelope.base_commit).toBe(promotion.resultingHeadCommit);
      expect(envelope.project_revision).toBe(outcome.revision);
      // A second reconciliation is a no-op.
      expect((await controller.reconcileProjectHead()).status).toBe("in_sync");
    } finally {
      await cleanup();
    }
  });

  it("a forged headAdvance is refused with caller_head_not_canonical and zero writes", async () => {
    const { controller, store, cleanup } = await rig();
    try {
      controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-1")] });
      const before = store.listEvents(PROJECT).length;
      expect(() =>
        controller.planReconciled(
          { tasks: [taskSpec("task-1")] },
          { headAdvance: { fromPromotionEventId: "999", toHead: R3 } },
        ),
      ).toThrow(ProjectHeadError);
      expect(store.listEvents(PROJECT).length).toBe(before);
    } finally {
      await cleanup();
    }
  });
});

describe("G10-X runTurn head barrier has no deadlock", () => {
  it("promotion → drift → new activation blocked → settlement allowed → quiescent → head sync → activation resumes", async () => {
    const { controller, store, cleanup } = await rig();
    try {
      controller.start({
        projectId: PROJECT,
        goal: "g",
        tasks: [taskSpec("task-a"), taskSpec("task-b"), taskSpec("task-c")],
      });
      controller.declareStageGraph(TWO_ACTIVE, 2);

      // Two tasks occupy ACTIVE (concurrency 2); task-c stays READY. Create
      // both attempts up front, then complete only task-a.
      const attempts = new Map<string, string>();
      for (let step = 0; step < 10 && attempts.size < 2; step += 1) {
        const event = controller.step();
        if (event === null) break;
        if (event.event_type === "ATTEMPT_CREATED") {
          attempts.set(String(event.payload.task_id), event.entity_id);
        }
      }
      const attemptA = attempts.get("task-a")!;
      const attemptB = attempts.get("task-b")!;
      const commitA = await completeAttempt(controller, attemptA);
      controller.step(); // TASK_VERIFYING task-a
      expect(taskState(store, "task-a")).toBe("VERIFYING");
      expect(taskState(store, "task-b")).toBe("ACTIVE");
      expect(taskState(store, "task-c")).toBe("READY");

      // Promote task-a: the head drifts while task-b is still in flight.
      const promotionA = await controller.promote(attemptA, commitA, HEAD);
      expect(controller.status().head?.state).toBe("SYNC_REQUIRED");

      // Barrier: task-a settles (settlement allowed) but no new activation
      // (task-c) and no unreconciled head advance while task-b is ACTIVE.
      const barrier = await controller.runTurn();
      expect(barrier.phase).toBe("head_sync_required");
      expect(barrier.blockers).toContain("quiescence_required");
      expect(taskState(store, "task-a")).toBe("SATISFIED");
      expect(taskState(store, "task-b")).toBe("ACTIVE");
      expect(taskState(store, "task-c")).toBe("READY");
      expect(headOf(store)).toBe(HEAD); // still drifting: task-b is in flight

      // Settle task-b: its batch fails back to READY (no promotion needed), so
      // the project reaches quiescence WITHOUT a second old-base promotion.
      await controller.claim(attemptB);
      controller.report(attemptB, { workerStatus: "failed", summary: "settle for head sync" });

      const resumed = await controller.runTurn();
      expect(resumed.phase).toBe("progress");
      expect(headOf(store)).toBe(promotionA.resultingHeadCommit);
      expect(controller.status().head?.state).toBe("IN_SYNC");
      expect(taskState(store, "task-b")).toBe("READY");
      expect(taskState(store, "task-c")).toBe("READY");

      // The reauthorized envelopes are anchored on the proven head.
      for (const taskId of ["task-b", "task-c"]) {
        const envelope = JSON.parse(
          new TextDecoder().decode(
            (
              store.connection
                .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
                .get(PROJECT, taskId) as { envelope_json: Uint8Array }
            ).envelope_json,
          ),
        ) as { base_commit: string };
        expect(envelope.base_commit).toBe(promotionA.resultingHeadCommit);
      }
    } finally {
      await cleanup();
    }
  });
});
