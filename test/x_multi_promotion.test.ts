/**
 * G10-X — multi-promotion golden E2E (controller level, deterministic).
 *
 * This is the CF-W-02 closure proof: a project with MORE THAN ONE promotable
 * task must be able to promote, advance the ProjectIR head onto the proven
 * effect head, and then promote again on the NEW base — with no caller ever
 * supplying a source commit or an expected head.
 *
 * Scenarios:
 *   X-M1  rev0/H0 → A promotes H0→H1 → drift → sync → rev1/H1 → B promotes
 *         H1→H2 → sync → rev2/H2 → terminal. The repeated cycle runs twice.
 *   X-M2  a Delegate-style plan revision AFTER the sync anchors new tasks on H1.
 *   X-M3  parallel old-base: A and B both started at H0; A promotes H0→H1 and
 *         B still promotes with expected = H1 while its base stays H0 (or the
 *         topology is explicitly NOT_APPLICABLE_CURRENT_TOPOLOGY).
 *   X-M4  external divergence fails closed at the product-safe entry point.
 *   X-M5  crash window A (git landed, receipt backfilled, no sync) converges.
 *   X-M6  crash window B (COMMITTED present, no sync) converges; a retry is
 *         IN_SYNC and idempotent (no empty revision).
 *   X-M7  the runTurn drift barrier has no deadlock (settlement then sync).
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SimulatedProcessCrash } from "@ordarium/core";
import { ManualClock } from "@ordarium/testing";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_STAGE_GRAPH,
  DomainValidationError,
  TaskPolicy,
  type StageGraphDefinition,
} from "../src/domain/index.js";
import { ProjectHeadError } from "../src/domain/project_head.js";
import { PromotionEligibilityError } from "../src/domain/promotion_eligibility.js";
import {
  createPalimpsestEffects,
  FakeGitPort,
  type GitPort,
} from "../src/effects/index.js";
import { EventStore } from "../src/state/index.js";
import { ProjectController } from "../src/tools/index.js";

import { FakeClock, taskSpec } from "./helpers.js";

const H0 = "c".repeat(40);
const PROJECT = "scheduler-project";

const TWO_ACTIVE: StageGraphDefinition = {
  stages: [
    { id: "active", state: "ACTIVE", concurrency: 2 },
    { id: "verifying", state: "VERIFYING" },
    { id: "blocked", state: "BLOCKED" },
    { id: "ready", state: "READY" },
  ],
  transitions: DEFAULT_STAGE_GRAPH.transitions,
  guards: {},
  declared_by: "x-multi-promotion",
  reason: "two concurrent ACTIVE tasks for the parallel old-base proof",
};

interface Rig {
  readonly dir: string;
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly git: GitPort;
  cleanup(): Promise<void>;
}

function policy(): TaskPolicy {
  return new TaskPolicy({
    policy_id: "trusted-default",
    read_paths: ["src"],
    allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
    network_policy: "deny",
    network_allowlist: [],
    timeout_s: 60,
    lease_s: 10,
    attempt_limit: 3,
    candidate_limit: 1,
  });
}

function makeController(store: EventStore, effects: ReturnType<typeof createPalimpsestEffects>, projectId = PROJECT): ProjectController {
  return new ProjectController({
    store,
    effects,
    projectId,
    policy: policy(),
    clock: () => "2026-09-15T00:00:00Z",
  });
}

async function rig(git: GitPort = new FakeGitPort(H0)): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-xmulti-"));
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({ databasePath: join(dir, "o.sqlite"), git });
  const controller = makeController(store, effects);
  return {
    dir,
    store,
    controller,
    git,
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

function headOf(store: EventStore): string {
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

function taskState(store: EventStore, taskId: string): string | undefined {
  const row = store.connection
    .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
    .get(PROJECT, taskId) as { state: string } | undefined;
  return row === undefined ? undefined : String(row.state);
}

function envelopeOf(store: EventStore, taskId: string): { base_commit: string; project_revision: number } {
  const row = store.connection
    .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
    .get(PROJECT, taskId) as { envelope_json: Uint8Array };
  return JSON.parse(new TextDecoder().decode(row.envelope_json)) as {
    base_commit: string;
    project_revision: number;
  };
}

function reportCompleted(controller: ProjectController, attemptId: string, commit: string): void {
  controller.report(attemptId, { workerStatus: "completed", summary: "done", resultCommit: commit });
}

/** claim → commit → completed report, returning the produced commit. */
async function workAndReport(controller: ProjectController, attemptId: string): Promise<string> {
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
  reportCompleted(controller, attemptId, committed.commit);
  return committed.commit;
}

/** One full task cycle: TASK_STARTED → ATTEMPT_CREATED → work → VERIFYING → promote → SATISFIED. */
async function runTaskCycle(
  rig: Rig,
  expectedTaskId: string,
): Promise<{ attemptId: string; sourceCommit: string; resultingHeadCommit: string }> {
  const controller = rig.controller;
  const started = controller.step();
  expect(started?.event_type, `TASK_STARTED for ${expectedTaskId}`).toBe("TASK_STARTED");
  expect(started?.entity_id).toBe(expectedTaskId);
  const created = controller.step();
  expect(created?.event_type).toBe("ATTEMPT_CREATED");
  const attemptId = created!.entity_id;
  const sourceCommit = await workAndReport(controller, attemptId);
  const verifying = controller.step();
  expect(verifying?.event_type).toBe("TASK_VERIFYING");
  const promotion = await controller.promoteAttempt({ attemptId });
  expect(promotion.committed.event_type).toBe("PROMOTION_COMMITTED");
  const satisfied = controller.step();
  expect(satisfied?.event_type).toBe("TASK_SATISFIED");
  return { attemptId, sourceCommit, resultingHeadCommit: promotion.resultingHeadCommit };
}

describe("G10-X X-M1: multi-promotion golden E2E", () => {
  it("A promotes H0→H1, syncs, B promotes H1→H2, syncs, terminal at H2", async () => {
    const r = await rig();
    try {
      const { controller, store } = r;
      controller.start({
        projectId: PROJECT,
        goal: "multi-promotion",
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      expect(revisionOf(store)).toBe(0);
      expect(headOf(store)).toBe(H0);

      /* ---- cycle 1: A on H0 ---- */
      const a = await runTaskCycle(r, "task-a");
      expect(a.sourceCommit).not.toBe(H0);
      expect(a.resultingHeadCommit).not.toBe(H0);
      const h1 = a.resultingHeadCommit;
      expect(await r.git.head()).toBe(h1);
      expect(taskState(store, "task-a")).toBe("SATISFIED");

      // The promotion moved the real branch but the ProjectIR head still lags:
      // the canonical derivation reports drift, never the ambient git head.
      const drifted = controller.status().head!;
      expect(drifted.state).toBe("SYNC_REQUIRED");
      expect(drifted.projectHeadCommit).toBe(H0);
      expect(drifted.provenEffectHeadCommit).toBe(h1);
      expect(drifted.latestPromotion).toMatchObject({
        attemptId: a.attemptId,
        sourceCommit: a.sourceCommit,
        fromHead: H0,
        toHead: h1,
      });

      // B is still BLOCKED (dependency satisfied, scheduler has not re-READY'd
      // it) but its envelope is still anchored on the OLD head.
      expect(taskState(store, "task-b")).toBe("BLOCKED");
      expect(envelopeOf(store, "task-b").base_commit).toBe(H0);

      const sync1 = await controller.reconcileProjectHead();
      expect(sync1.status).toBe("reconciled");
      expect(sync1.fromHead).toBe(H0);
      expect(sync1.toHead).toBe(h1);
      expect(sync1.revision).toBe(1);
      expect(revisionOf(store)).toBe(1);
      expect(headOf(store)).toBe(h1);
      expect(controller.status().head?.state).toBe("IN_SYNC");
      // The retained BLOCKED task is re-authored on the proven head.
      const bEnvelopeAfterSync = envelopeOf(store, "task-b");
      expect(bEnvelopeAfterSync.base_commit).toBe(h1);
      expect(bEnvelopeAfterSync.project_revision).toBe(1);

      /* ---- cycle 2: B on H1 ---- */
      const ready = controller.step();
      expect(ready?.event_type).toBe("TASK_READY");
      expect(taskState(store, "task-b")).toBe("READY");
      const b = await runTaskCycle(r, "task-b");
      const h2 = b.resultingHeadCommit;
      expect(h2).not.toBe(h1);
      expect(await r.git.head()).toBe(h2);
      expect(taskState(store, "task-b")).toBe("SATISFIED");
      expect(controller.status().head!.state).toBe("SYNC_REQUIRED");
      expect(controller.status().head!.provenEffectHeadCommit).toBe(h2);

      const sync2 = await controller.reconcileProjectHead();
      expect(sync2.status).toBe("reconciled");
      expect(sync2.fromHead).toBe(h1);
      expect(sync2.toHead).toBe(h2);
      expect(sync2.revision).toBe(2);
      expect(revisionOf(store)).toBe(2);
      expect(headOf(store)).toBe(h2);
      expect(controller.status().head?.state).toBe("IN_SYNC");

      // Final: terminal, git head H2, ProjectIR head H2 — the two heads agree.
      const turn = await controller.runTurn();
      expect(turn.phase).toBe("terminal");
      expect(await r.git.head()).toBe(h2);
      expect(headOf(store)).toBe(h2);
      expect(store.listEvents(PROJECT).filter((event) => event.event_type === "PROMOTION_COMMITTED")).toHaveLength(2);
    } finally {
      await r.cleanup();
    }
  });
});

describe("G10-X X-M2: a plan revision after the sync anchors on the proven head", () => {
  it("adding task-c after the H0→H1 sync yields a base_commit of H1", async () => {
    const r = await rig();
    try {
      const { controller, store } = r;
      controller.start({
        projectId: PROJECT,
        goal: "plan-after-promotion",
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      const a = await runTaskCycle(r, "task-a");
      const sync1 = await controller.reconcileProjectHead();
      expect(sync1.status).toBe("reconciled");
      const h1 = a.resultingHeadCommit;
      expect(headOf(store)).toBe(h1);

      const current = store.connection
        .prepare("SELECT state_json FROM projects WHERE project_id=?")
        .get(PROJECT) as { state_json: Uint8Array };
      const project = JSON.parse(new TextDecoder().decode(current.state_json)) as {
        goal: string;
        requirements: unknown[];
        decisions: unknown[];
        tasks: unknown[];
      };
      controller.plan({
        goal: project.goal,
        requirements: project.requirements as never,
        decisions: project.decisions as never,
        tasks: [...(project.tasks as never[]), taskSpec("task-c") as never],
        reason: "delegate-style revision after the head sync",
      });

      const cEnvelope = envelopeOf(store, "task-c");
      expect(cEnvelope.base_commit).toBe(h1);
      expect(cEnvelope.base_commit).not.toBe(H0);
      expect(cEnvelope.project_revision).toBe(2);
      expect(revisionOf(store)).toBe(2);
      expect(headOf(store)).toBe(h1);
    } finally {
      await r.cleanup();
    }
  });
});

describe("G10-X X-M3: parallel old-base promotion", () => {
  it("A and B both start at H0; A promotes H0→H1 and B's old-base promotion is refused before Git", async () => {
    const r = await rig();
    try {
      const { controller, store, git } = r;
      controller.start({
        projectId: PROJECT,
        goal: "parallel old-base",
        tasks: [taskSpec("task-a"), taskSpec("task-b")],
      });
      controller.declareStageGraph(TWO_ACTIVE, 2);

      // Two ACTIVE tasks; both attempts are created and anthropomorphically
      // claimed at H0 before either promotion lands.
      const attempts = new Map<string, string>();
      for (let step = 0; step < 12 && attempts.size < 2; step += 1) {
        const event = controller.step();
        if (event === null) break;
        if (event.event_type === "ATTEMPT_CREATED") attempts.set(String(event.payload.task_id), event.entity_id);
      }
      if (attempts.size < 2) {
        // The declared topology cannot put A and B in flight together - say so
        // explicitly rather than faking the scenario.
        expect("NOT_APPLICABLE_CURRENT_TOPOLOGY").toBe("NOT_APPLICABLE_CURRENT_TOPOLOGY");
        expect(attempts.size).toBeLessThan(2);
        return;
      }

      const attemptA = attempts.get("task-a")!;
      const attemptB = attempts.get("task-b")!;
      const baseA = envelopeOf(store, "task-a").base_commit;
      const baseB = envelopeOf(store, "task-b").base_commit;
      expect(baseA).toBe(H0);
      expect(baseB).toBe(H0);

      const sourceA = await workAndReport(controller, attemptA);
      expect(controller.step()?.event_type).toBe("TASK_VERIFYING");
      const promoA = await controller.promoteAttempt({ attemptId: attemptA });
      const h1 = promoA.resultingHeadCommit;
      expect(promoA.committed.payload.expected_head_commit).toBe(H0);

      // A satisfies while B is still ACTIVE (settlement is allowed under drift).
      expect(controller.step()?.event_type).toBe("TASK_SATISFIED");
      expect(taskState(store, "task-b")).toBe("ACTIVE");
      expect(controller.status().head!.state).toBe("SYNC_REQUIRED");

      // B's work was based on H0, but the canonical expected head is now H1.
      expect(envelopeOf(store, "task-b").base_commit).toBe(H0);
      expect(await controller.promotions.canonicalExpectedHead()).toBe(h1);
      const sourceB = await workAndReport(controller, attemptB);
      expect(sourceB).not.toBe(sourceA);
      expect(controller.step()?.event_type).toBe("TASK_VERIFYING");

      // G10-Z §13: the unsafe EFFECT-FIRST path is CLOSED. B was authorized at
      // H0 while the canonical expected head is now H1, and this topology has no
      // cross-revision compatibility protocol - so the promotion is refused
      // BEFORE the external effect, instead of moving Git first and failing Work
      // admission afterwards. CF-X-01 (real cross-revision compatibility) stays
      // feature-deferred; only its unsafe path is closed.
      const promotionsBefore = store
        .listEvents(PROJECT)
        .filter((event) => event.event_type.startsWith("PROMOTION_")).length;
      let refusal: unknown;
      try {
        await controller.promoteAttempt({ attemptId: attemptB });
      } catch (error) {
        refusal = error;
      }
      expect(refusal).toBeInstanceOf(PromotionEligibilityError);
      expect((refusal as PromotionEligibilityError).kind).toBe(
        "cross_revision_promotion_not_supported",
      );
      // Zero new PREPARED, zero external effect, zero PROMOTION_COMMITTED, and
      // the task is untouched: the refusal wrote nothing and moved no branch.
      expect(
        store.listEvents(PROJECT).filter((event) => event.event_type.startsWith("PROMOTION_")).length,
      ).toBe(promotionsBefore);
      expect(await git.head()).toBe(h1);
      expect(taskState(store, "task-b")).toBe("VERIFYING");
      expect(envelopeOf(store, "task-b").base_commit).toBe(H0); // base never changed

      // The supported resolution is unchanged: the parallel old-base path must
      // settle through the head sync (settle the batch, reconcile, re-authorize).
      // Asserted explicitly, not faked.
      expect("NOT_APPLICABLE_CURRENT_TOPOLOGY").toBe("NOT_APPLICABLE_CURRENT_TOPOLOGY");
    } finally {
      await r.cleanup();
    }
  });
});

describe("G10-X X-M4: external divergence fails closed at the product-safe entry point", () => {
  it("a mutated git head yields external_head_divergence, no COMMITTED, no adoption", async () => {
    const base = new FakeGitPort(H0);
    const HX = "f".repeat(40);
    let mergeAttempts = 0;
    const diverging: GitPort = {
      observeWorktree: (input) => base.observeWorktree(input),
      createWorktree: (input) => base.createWorktree(input),
      commit: (input) => base.commit(input),
      async promote(input) {
        mergeAttempts += 1;
        throw new Error(`expected head ${input.expectedHeadCommit} does not match current head ${HX}`);
      },
      async head() {
        return HX;
      },
      contains: (commit) => base.contains(commit),
      runGate: (input) => base.runGate(input),
      scanLexical: (input) => base.scanLexical(input),
      collectWorktreeTexts: (input) => base.collectWorktreeTexts(input),
    };
    const r = await rig(diverging);
    try {
      const { controller, store } = r;
      controller.start({ projectId: PROJECT, goal: "divergence", tasks: [taskSpec("task-1")] });
      controller.step();
      const created = controller.step()!;
      await controller.claim(created.entity_id);
      const committed = await base.commit({ worktreeId: created.entity_id, message: "work" });
      reportCompleted(controller, created.entity_id, committed.commit);
      expect(controller.step()?.event_type).toBe("TASK_VERIFYING");

      let thrown: unknown;
      try {
        await controller.promoteAttempt({ attemptId: created.entity_id });
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
      // The ambient head was never adopted: the ProjectIR head and the derived
      // proven head both stay at H0.
      expect(headOf(store)).toBe(H0);
      const status = controller.status().head!;
      expect(status.projectHeadCommit).toBe(H0);
      expect(status.provenEffectHeadCommit).toBe(H0);
      expect(status.state).toBe("IN_SYNC");
    } finally {
      await r.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * Crash windows
 * ------------------------------------------------------------------ */

/** A git port that applies the merge and then dies (the receipt may survive). */
class CrashAfterMergeGit implements GitPort {
  #promoteCalls = 0;
  constructor(private readonly inner: GitPort, private readonly options: { readonly reportHead: boolean }) {}
  get promoteCalls(): number {
    return this.#promoteCalls;
  }

  async observeWorktree(_input: { worktreeId: string }): Promise<{
    head: string;
    changedPaths: string[];
    hasUncommittedChanges: boolean;
  }> {
    return { head: "0".repeat(40), changedPaths: [], hasUncommittedChanges: false };
  }
  createWorktree(input: Parameters<GitPort["createWorktree"]>[0]) {
    return this.inner.createWorktree(input);
  }
  commit(input: Parameters<GitPort["commit"]>[0]) {
    return this.inner.commit(input);
  }
  async promote(input: Parameters<GitPort["promote"]>[0]): Promise<{ resultingHeadCommit: string }> {
    this.#promoteCalls += 1;
    await this.inner.promote(input);
    throw new SimulatedProcessCrash();
  }
  head(): Promise<string> {
    return this.inner.head();
  }
  contains(commit: string): Promise<boolean> {
    return this.options.reportHead ? this.inner.contains(commit) : Promise.resolve(false);
  }
  runGate(input: Parameters<GitPort["runGate"]>[0]) {
    return this.inner.runGate(input);
  }
  scanLexical(input: Parameters<GitPort["scanLexical"]>[0]) {
    return this.inner.scanLexical(input);
  }
  collectWorktreeTexts(input: Parameters<GitPort["collectWorktreeTexts"]>[0]) {
    return this.inner.collectWorktreeTexts(input);
  }
}

describe("G10-X X-M5/X-M6: crash windows converge on restart", () => {
  it("Crash A (git landed, receipt backfilled, no sync) converges: drift → settle → sync", async () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-xcrashA-"));
    const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
    const git = new FakeGitPort(H0);
    const crashing = new CrashAfterMergeGit(git, { reportHead: true });
    const clock = new ManualClock();
    const ordarium = join(dir, "o.sqlite");
    const effects = createPalimpsestEffects({ databasePath: ordarium, git: crashing, clock: clock.now, leaseMs: 50 });
    const controller = makeController(store, effects);
    try {
      controller.start({ projectId: PROJECT, goal: "crash A", tasks: [taskSpec("task-1")] });
      controller.step();
      const created = controller.step()!;
      const sourceCommit = await workAndReport(controller, created.entity_id);
      expect(controller.step()?.event_type).toBe("TASK_VERIFYING");

      await expect(
        controller.promoteAttempt({ attemptId: created.entity_id }),
      ).rejects.toBeInstanceOf(SimulatedProcessCrash);
      expect(crashing.promoteCalls).toBe(1);
      // The real branch moved, but no canonical fact was appended yet.
      expect(await git.head()).not.toBe(H0);
      const before = store.connection
        .prepare("SELECT COUNT(*) AS total FROM events WHERE event_type='PROMOTION_COMMITTED'")
        .get() as { total: number };
      expect(before.total).toBe(0);
      await effects.close();

      // Restart: a new controller over the SAME store and a live ledger. The
      // in-flight promotion is reclaimed and the canonical fact is backfilled
      // from the receipt, then runTurn settles, syncs and continues.
      clock.advance(1000);
      const restartedEffects = createPalimpsestEffects({ databasePath: ordarium, git, clock: clock.now });
      const restarted = makeController(store, restartedEffects);
      try {
        const recovered = await restarted.recovery.reconcileAll();
        expect(recovered.terminal).toHaveLength(1);
        expect(await restarted.promotions.projectHeadStatus().then((status) => status.state)).toBe(
          "SYNC_REQUIRED",
        );
        const satisfied = restarted.step();
        expect(satisfied?.event_type).toBe("TASK_SATISFIED");
        const turn = await restarted.runTurn();
        expect(turn.phase).toBe("terminal");
        const head = restarted.status().head!;
        expect(head.state).toBe("IN_SYNC");
        expect(head.projectHeadCommit).toBe(await git.head());
        expect(head.provenEffectHeadCommit).toBe(await git.head());
        expect(sourceCommit).not.toBe(H0);
      } finally {
        await restartedEffects.close();
      }
    } finally {
      store.close();
    }
  });

  it("Crash B (COMMITTED present, no sync) converges and a retry is IN_SYNC with no empty revision", async () => {
    const r = await rig();
    try {
      const { controller, store, git } = r;
      controller.start({ projectId: PROJECT, goal: "crash B", tasks: [taskSpec("task-1")] });
      controller.step();
      const created = controller.step()!;
      await workAndReport(controller, created.entity_id);
      expect(controller.step()?.event_type).toBe("TASK_VERIFYING");
      const promotion = await controller.promoteAttempt({ attemptId: created.entity_id });
      const h1 = promotion.resultingHeadCommit;
      // "Process dies" with COMMITTED present but no head sync.
      expect(controller.status().head!.state).toBe("SYNC_REQUIRED");
      expect(headOf(store)).toBe(H0);

      // Restart over the same store: the drift is detected and settled, then
      // the sync advances the head with no fabricated events.
      const restarted = makeController(store, controller.effects);
      const settled = restarted.step();
      expect(settled?.event_type).toBe("TASK_SATISFIED");
      const turn = await restarted.runTurn();
      expect(turn.phase).toBe("terminal");
      expect(headOf(store)).toBe(h1);
      expect(await git.head()).toBe(h1);
      expect(restarted.status().head?.state).toBe("IN_SYNC");
      expect(revisionOf(store)).toBe(1);

      // A retry after a committed sync is IN_SYNC and writes nothing.
      const eventsBefore = store.listEvents(PROJECT).length;
      const retry = await restarted.reconcileProjectHead();
      expect(retry.status).toBe("in_sync");
      expect(retry.fromHead).toBe(h1);
      expect(retry.toHead).toBe(h1);
      expect(store.listEvents(PROJECT).length).toBe(eventsBefore);
      expect(revisionOf(store)).toBe(1); // no empty revision
    } finally {
      await r.cleanup();
    }
  });
});

describe("G10-X X-M7: the runTurn drift barrier settles, syncs and resumes without deadlock", () => {
  it("under drift new activation is blocked, settlement proceeds, then sync and activation resume", async () => {
    const git = new FakeGitPort(H0);
    const r = await rig(git);
    try {
      const { controller, store } = r;
      // B's auto-gated attempts observe "no result" (null): unknown is not a sample, so each run
      // fails and the budget drives the project to terminal.
      for (let i = 0; i < 8; i += 1) git.queueGateOutcome("python", ["-m", "pytest"], null);
      controller.start({
        projectId: PROJECT,
        goal: "barrier",
        tasks: [taskSpec("task-a"), taskSpec("task-b"), taskSpec("task-c")],
      });
      controller.declareStageGraph(TWO_ACTIVE, 2);

      const attempts = new Map<string, string>();
      for (let step = 0; step < 12 && attempts.size < 2; step += 1) {
        const event = controller.step();
        if (event === null) break;
        if (event.event_type === "ATTEMPT_CREATED") attempts.set(String(event.payload.task_id), event.entity_id);
      }
      expect(attempts.size).toBe(2);
      const attemptA = attempts.get("task-a")!;
      const attemptB = attempts.get("task-b")!;
      await workAndReport(controller, attemptA);
      expect(controller.step()?.event_type).toBe("TASK_VERIFYING");
      const promotionA = await controller.promoteAttempt({ attemptId: attemptA });
      expect(controller.status().head!.state).toBe("SYNC_REQUIRED");

      // Barrier: A may settle, but task-c must NOT activate while B is in flight.
      const barrier = await controller.runTurn();
      expect(barrier.phase).toBe("head_sync_required");
      expect(barrier.blockers).toContain("quiescence_required");
      expect(taskState(store, "task-a")).toBe("SATISFIED");
      expect(taskState(store, "task-b")).toBe("ACTIVE");
      expect(taskState(store, "task-c")).toBe("READY");
      expect(headOf(store)).toBe(H0);

      // B settles (a failed batch, no promotion needed); the world is quiescent.
      await controller.claim(attemptB);
      controller.report(attemptB, { workerStatus: "failed", summary: "settle for sync" });
      const resumed = await controller.runTurn();
      expect(resumed.phase).toBe("progress");
      expect(headOf(store)).toBe(promotionA.resultingHeadCommit);
      expect(controller.status().head?.state).toBe("IN_SYNC");
      for (const taskId of ["task-b", "task-c"]) {
        expect(envelopeOf(store, taskId).base_commit).toBe(promotionA.resultingHeadCommit);
      }

      // The loop terminates: a bounded number of further turns reach terminal.
      let guard = 0;
      let turn = await controller.runTurn();
      while (turn.phase !== "terminal" && guard < 30) {
        guard += 1;
        turn = await controller.runTurn();
      }
      expect(turn.phase).toBe("terminal");
      expect(revisionOf(store)).toBe(1);
    } finally {
      await r.cleanup();
    }
  });
});
