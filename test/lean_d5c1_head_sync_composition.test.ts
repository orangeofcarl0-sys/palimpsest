/**
 * PLMP-LEAN-1 §D5-c1 — HEAD-SYNC COMPOSITION PROOF, as machine proofs.
 *
 *     VERIFYING@E_0  --governed reopen-->  READY@E_0  --existing G10-X-->  READY@E_1
 *
 * The proposition, and the whole of the slice:
 *
 * > Governed reopening removes exactly the quiescence blocker that prevents the EXISTING G10-X authority
 * > from advancing the Project basis — and nothing else.
 *
 * NO product semantics are added here. Every step drives the shipped components: the real EventStore and
 * aggregate, the real scheduler transitions, the real promotion authority, the real rework admission, the
 * real head-reconciliation compiler and the real `reconcileProjectHead()` closure, and the real
 * attempt-authorization resolver. Only the worker and the git mechanics are deterministic fakes, because
 * this slice proves neither DSH nor git — the D4-LIVE gate already ran this promotion path on real git.
 *
 * The eight headline proofs:
 *
 *   1  before any reopening, the reconciliation is blocked, and the blocker IS the VERIFYING task
 *   2  the governed reopening changes Work readiness ONLY: ΔReadiness ≠ 0, ΔProjectBasis = 0
 *   3  READY@E_0 is reopenable but NOT executable (both sanctioned entrances refuse)
 *   4  the SAME reconciliation becomes compilable — D5 changed admissibility, not the head proof
 *   5  the basis advance is performed entirely by G10-X: PROJECT_REVISED + TASK_REAUTHORIZED, no REWORK event
 *   6  E_1 is the same Work at a new position: semantic projection identical, positional identity new
 *   7  TaskAuthority evolves; AttemptProvenance does not (the D5-b1 composition)
 *   8  D5-c1 stops at READY@E_1: the next mutating target is real, and no Attempt is created
 *
 * and the negatives pin what rework does NOT unlock: another VERIFYING task, an open Attempt, the absence of
 * drift, and a broken promotion chain.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";
import { ManualClock } from "@ordarium/testing";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy, type StageGraphDefinition } from "../src/domain/index.js";
import { ReworkAdmissionPermit } from "../src/domain/rework_admission.js";
import {
  compileProjectHeadReconciliation,
  type ProjectHeadReconciliationCandidate,
} from "../src/domain/project_head.js";
import { firstPartyAttemptResultVerificationSource } from "../src/project_verification/index.js";
import { semanticProjectionDigestOf } from "../src/project_world/index.js";
import { normalizeEventPayload, parseNewEvent, parseProjectIr, parseTaskEnvelope } from "../src/schema/index.js";
import { actionKey } from "../src/domain/index.js";

import { FakeClock, taskSpec } from "./helpers.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative: string): string =>
  execFileSync(
    process.execPath,
    ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, relative))},'utf8'))`],
    { encoding: "utf8" },
  );

const HEAD = "c".repeat(40); // H0 — the canonical head every result is derived from

/**
 * The DECLARED topology for this scenario (D4-0: capacity is what the plan declares, never a product
 * constant). Three tasks must reach VERIFYING together — the frozen genesis graph holds ONE task per stage,
 * which would stall the second drive — so the deployment declares what it needs, including the rework edge
 * D5-b2 added. Nothing here is new semantics: it is the genesis pipeline with wider capacity.
 */
const DECLARED_GRAPH: StageGraphDefinition = {
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
  declared_by: "d5c1-spec",
  reason: "three tasks must reach VERIFYING together for the head-sync composition proof",
};
const CLOCK = "2026-09-16T00:00:00Z";
const PROJECT = "d5c1";
const TASKS = ["task-a", "task-b", "task-c"] as const;

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

/* ================================================================== *
 * Rig
 * ================================================================== */

interface Rig {
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly git: FakeGitPort;
  readonly policy: TaskPolicy;
  readonly attempts: Record<string, { attemptId: string; resultCommit: string }>;
  taskState(taskId: string): string;
  lastEventId(taskId: string): number;
  batchActivationId(taskId: string): number;
  ir(): ReturnType<typeof parseProjectIr>;
  envelopeOf(taskId: string): ReturnType<typeof parseTaskEnvelope>;
  policyEnvelope(taskId: string): ReturnType<typeof parseTaskEnvelope>;
  events(): ReturnType<EventStore["listEvents"]>;
  eventCount(): number;
  attemptCount(): number;
  attemptIds(): readonly string[];
  drive(taskId: string): Promise<{ attemptId: string; resultCommit: string }>;
  startWithoutCompleting(taskId: string): Promise<string>;
  /** Promote an ALREADY-DRIVEN attempt and settle it to SATISFIED; returns the new effect head H1. */
  promote(attemptId: string, resultCommit: string): Promise<string>;
  reopen(taskId: string): void;
  readyEvent(taskId: string): ReturnType<typeof parseNewEvent>;
  permit(taskId: string): ReworkAdmissionPermit;
  compile(): ProjectHeadReconciliationCandidate;
  verifySubject(attemptId: string): { baseCommit: string; digest: string };
  close(): Promise<void>;
}

async function rig(): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-d5c1-"));
  cleanups.push(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a handle is open; the OS reaps it.
    }
  });
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "o.sqlite"),
    git,
    clock: new ManualClock().now,
    leaseMs: 50,
  });
  const policy = new TaskPolicy({
    policy_id: "trusted-default",
    read_paths: ["src"],
    allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
    network_policy: "deny",
    network_allowlist: [],
    timeout_s: 3600,
    lease_s: 60,
    attempt_limit: 3,
    candidate_limit: 1,
  });
  const controller = new ProjectController({ store, effects, projectId: PROJECT, policy, clock: () => CLOCK });
  controller.start({
    projectId: PROJECT,
    goal: "g",
    tasks: TASKS.map((taskId) => taskSpec(taskId)),
    stageGraph: DECLARED_GRAPH,
  });
  // Activation rides THREE declared gates (H1 D-2): the ACTIVE stage's concurrency, the VERIFYING stage's,
  // and the per-role slot table. All three are declared capacities, so all three are declared here.
  controller.declareRoleTable({
    roles: [{ role: "implementer", slots: 3 }],
    hardCap: 3,
    declaredBy: "d5c1-spec",
  });

  const row = (taskId: string): { state: string; last_event_id: number; state_json: Uint8Array } =>
    store.connection
      .prepare("SELECT state, last_event_id, state_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(PROJECT, taskId) as { state: string; last_event_id: number; state_json: Uint8Array };
  const activationOf = (taskId: string): number => {
    const anchor = JSON.parse(new TextDecoder().decode(row(taskId).state_json)) as { batch_activation_event_id?: number };
    if (anchor.batch_activation_event_id === undefined) {
      throw new Error(`task ${taskId} has no batch anchor, so no settlement event can be built for it`);
    }
    return Number(anchor.batch_activation_event_id);
  };
  const ir = (): ReturnType<typeof parseProjectIr> => {
    const project = store.connection
      .prepare("SELECT state_json FROM projects WHERE project_id=?")
      .get(PROJECT) as { state_json: Uint8Array };
    return parseProjectIr(JSON.parse(new TextDecoder().decode(project.state_json)));
  };
  const readEnvelope = (taskId: string): ReturnType<typeof parseTaskEnvelope> => {
    const task = store.connection
      .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(PROJECT, taskId) as { envelope_json: Uint8Array };
    return parseTaskEnvelope(JSON.parse(new TextDecoder().decode(task.envelope_json)));
  };

  /** Drive one task through the real pipeline to a COMPLETED candidate sitting in VERIFYING. */
  const drive = async (taskId: string): Promise<{ attemptId: string; resultCommit: string }> => {
    controller.step(); // TASK_STARTED
    const created = controller.step()!; // ATTEMPT_CREATED
    const attemptId = created.entity_id;
    await controller.claim(attemptId);
    const committed = await effects.invoke(
      effects.actions.gitCommit,
      { worktreeId: attemptId, message: "work" },
      { scope: PROJECT, revision: controller.promotions.projectRevision(), callId: `c:${attemptId}` },
    );
    controller.report(attemptId, { workerStatus: "completed", summary: "done", resultCommit: committed.commit });
    await controller.gate({ attemptId, predicate: "tests_pass", command: ["python", "-m", "pytest"] });
    expect(controller.step()!.event_type).toBe("TASK_VERIFYING");
    return { attemptId, resultCommit: committed.commit };
  };

  /** Start a task and OPEN an attempt, but never complete it — the open-attempt discipline negative. */
  const startWithoutCompleting = async (taskId: string): Promise<string> => {
    controller.step();
    const created = controller.step()!;
    await controller.claim(created.entity_id);
    return created.entity_id;
  };

  return {
    store,
    controller,
    git,
    policy,
    attempts: {},
    taskState: (taskId) => String(row(taskId).state),
    lastEventId: (taskId) => Number(row(taskId).last_event_id),
    batchActivationId: (taskId) => activationOf(taskId),
    ir,
    envelopeOf: (taskId) => readEnvelope(taskId),
    policyEnvelope: (taskId) => policy.authorize(ir(), taskId).envelope,
    events: () => store.listEvents(PROJECT),
    eventCount: () => store.listEvents(PROJECT).length,
    attemptCount: () =>
      (store.connection.prepare("SELECT COUNT(*) AS n FROM attempts WHERE project_id=?").get(PROJECT) as { n: number }).n,
    attemptIds: () =>
      (store.connection.prepare("SELECT attempt_id FROM attempts WHERE project_id=?").all(PROJECT) as Array<{ attempt_id: string }>).map(
        (row) => row.attempt_id,
      ),
    drive,
    startWithoutCompleting,
    promote: async (attemptId, resultCommit) => {
      await controller.promote(attemptId, resultCommit, HEAD);
      const satisfied = controller.step()!;
      expect(satisfied.event_type).toBe("TASK_SATISFIED");
      const facts = controller.promotions.promotionFactsSync();
      const tip = facts.at(-1);
      if (tip === undefined) throw new Error("promotion produced no fact");
      return tip.resultingHeadCommit;
    },
    reopen: (taskId) => {
      store.appendReworkReopening(readyEventFor(taskId), permitFor(taskId));
    },
    readyEvent: (taskId) => readyEventFor(taskId),
    permit: (taskId) => permitFor(taskId),
    compile: () =>
      compileProjectHeadReconciliation({
        project: ir(),
        status: controller.promotions.projectHeadStatusSync(),
        tasks: (
          store.connection.prepare("SELECT task_id, state FROM tasks WHERE project_id=?").all(PROJECT) as Array<Record<string, unknown>>
        ).map((entry) => ({ taskId: String(entry.task_id), state: String(entry.state) })),
        openAttempts: (
          store.connection
            .prepare("SELECT attempt_id, task_id, state FROM attempts WHERE project_id=? AND state IN ('CREATED','LEASED','RUNNING')")
            .all(PROJECT) as Array<Record<string, unknown>>
        ).map((entry) => ({ attemptId: String(entry.attempt_id), taskId: String(entry.task_id), state: String(entry.state) })),
        promotions: controller.promotions.promotionFactsSync(),
      }),
    verifySubject: (attemptId) => {
      const verificationSource = firstPartyAttemptResultVerificationSource({
        projectId: PROJECT,
        attemptWorkRecord: (id) => {
          const record = controller.attemptWorkRecord(id);
          return record === null
            ? null
            : { state: record.state, taskId: record.taskId, report: record.report, envelope: record.envelope };
        },
      });
      return verificationSource.materialize(attemptId);
    },
    close: async () => {
      await effects.close();
      store.close();
    },
  };

  function readyEventFor(taskId: string): ReturnType<typeof parseNewEvent> {
    const activationId = activationOf(taskId);
    return parseNewEvent({
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
        batch_activation_event_id: activationId,
      }),
      causation_id: Number(row(taskId).last_event_id),
      correlation_id: `task:${taskId}:rework`,
      idempotency_key: actionKey("task-batch-settle-v1", {
        project_id: PROJECT,
        task_id: taskId,
        batch_activation_event_id: activationId,
        target_state: "READY",
      }),
      expected_project_revision: ir().revision,
    });
  }

  function permitFor(taskId: string): ReworkAdmissionPermit {
    return ReworkAdmissionPermit.issue({
      projectId: PROJECT,
      taskId,
      originResultSubjectKind: "attempt_result",
      originResultSubjectRef: "attempt-0",
      originBasisDigest: "a".repeat(64),
      targetObservationDigest: "b".repeat(64),
      // Bound to what EXISTS: the verifying authority being set aside and its batch.
      currentEnvelopeId: readEnvelope(taskId).envelope_id,
      batchActivationEventId: activationOf(taskId),
      reason: "INCOMPATIBLE",
      targetFence: controller.reworkTargetFence(),
    });
  }
}

/**
 * The D5-c1 scenario: three real attempts at H0, task-a promoted (Git/effect head H1), the named tasks left
 * VERIFYING, then the named tasks reopened. Everything downstream of `promote` is drift, and everything
 * downstream of `reopen` is the governed readiness change this slice is about.
 */
async function scenario(reopened: readonly string[]): Promise<Rig> {
  const r = await rig();
  const driven = await r.drive("task-a");
  r.attempts["task-a"] = driven;
  r.attempts["task-b"] = await r.drive("task-b");
  r.attempts["task-c"] = await r.drive("task-c");
  // Every result in the scenario derives from H0; promoting task-a creates the drift window this slice
  // lives in: Git/effect head H1, ProjectIR head H0, tasks b and c VERIFYING.
  const h1 = await r.promote(driven.attemptId, driven.resultCommit);
  r.attempts["promote"] = { attemptId: driven.attemptId, resultCommit: h1 };
  for (const taskId of reopened) r.reopen(taskId);
  return r;
}

/* ================================================================== *
 * 1. Before reopening, the reconciliation is blocked BY the VERIFYING task
 * ================================================================== */

describe("§D5-c1 before reopening, the VERIFYING task IS the quiescence blocker", () => {
  it("SYNC_REQUIRED, and the same G10-X compiler refuses — naming task-b and task-c, no open attempts", async () => {
    const r = await scenario([]);
    try {
      const status = r.controller.promotions.projectHeadStatusSync();
      expect(status.state).toBe("SYNC_REQUIRED");
      expect(status.projectHeadCommit).toBe(HEAD);
      expect(status.provenEffectHeadCommit).not.toBe(HEAD);

      const candidate = r.compile();
      expect(candidate.compilable).toBe(false);
      expect(candidate.blockers.map((blocker) => blocker.kind)).toEqual(["quiescence_required"]);
      // THE BLOCKER IS EXACTLY THE VERIFYING TASKS — not a leftover fixture state:
      expect(candidate.currentWorkState.verifyingTaskIds).toEqual(["task-b", "task-c"]);
      expect(candidate.currentWorkState.openAttemptIds).toEqual([]);
      expect(candidate.blockers[0]!.refs).toEqual(["task-b", "task-c"]);
      // And the sanctioned public entrance reports the same block with ZERO writes.
      const before = r.eventCount();
      const blocked = await r.controller.reconcileProjectHead();
      expect(blocked.status).toBe("blocked");
      expect(blocked.blockers[0]).toContain("quiescence_required");
      expect(r.eventCount()).toBe(before);
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 2. The governed reopening changes Work readiness ONLY
 * ================================================================== */

describe("§D5-c1 the governed reopening: ΔWorkReadiness ≠ 0 and ΔProjectBasis = 0", () => {
  it("task-b becomes READY and NOTHING else moves — no basis, no rebinding, no new attempt", async () => {
    const r = await scenario([]);
    try {
      const attemptA = r.attempts["task-a"]!.attemptId;
      const before = {
        events: r.eventCount(),
        ir: r.ir(),
        envelopeB: r.envelopeOf("task-b"),
        gitHead: await r.git.head(),
        attempts: r.attemptCount(),
        attemptARecord: JSON.stringify(r.controller.attemptWorkRecord(attemptA)),
        promotions: r.controller.promotions.promotionFactsSync(),
      };

      r.reopen("task-b");
      expect(r.taskState("task-b")).toBe("READY");

      // ΔProjectBasis = 0, field by field:
      expect(r.ir()).toEqual(before.ir); // head, revision, digest — the whole ProjectIR
      expect(r.envelopeOf("task-b")).toEqual(before.envelopeB); // E_0 unchanged on the task row
      expect(await r.git.head()).toBe(before.gitHead); // canonical git unchanged by rework
      expect(r.controller.promotions.promotionFactsSync()).toEqual(before.promotions); // no new head proof
      expect(r.attemptCount()).toBe(before.attempts); // no new attempt, hence no new world
      // ΔWorkReadiness ≠ 0, and it is the ONLY delta:
      expect(r.eventCount()).toBe(before.events + 1);
      expect(r.events().at(-1)!.event_type).toBe("TASK_READY");
      expect(JSON.stringify(r.controller.attemptWorkRecord(attemptA))).toBe(before.attemptARecord);
      for (const forbidden of ["TASK_REAUTHORIZED", "PROJECT_REVISED", "TASK_STARTED", "ATTEMPT_CREATED"]) {
        expect(r.events().slice(before.events).map((event) => event.event_type)).not.toContain(forbidden);
      }
    } finally {
      await r.close();
    }
  }, 180_000);

  it("NEGATIVE A: reopening task-b does NOT imply global quiescence — task-c still blocks", async () => {
    const r = await scenario(["task-b"]);
    try {
      const candidate = r.compile();
      expect(r.taskState("task-b")).toBe("READY");
      expect(candidate.compilable).toBe(false);
      expect(candidate.blockers[0]!.kind).toBe("quiescence_required");
      // Rework(B) does not unlock the project: the blocker is now exactly task-c.
      expect(candidate.blockers[0]!.refs).toEqual(["task-c"]);
      expect(candidate.currentWorkState.verifyingTaskIds).toEqual(["task-c"]);
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 3. READY@E_0 is reopenable but NOT executable
 * ================================================================== */

describe("§D5-c1 READY@E_0 ≠ Executable@E_0", () => {
  it("the mutating bootstrap refuses with HEAD_NOT_IN_SYNC, and opens nothing", async () => {
    const r = await scenario(["task-b"]);
    try {
      const before = { attempts: r.attemptCount(), events: r.eventCount() };
      await expect(r.controller.prepareMutatingWork({ expectedTaskId: "task-b" })).rejects.toThrow(
        /HEAD_NOT_IN_SYNC/u,
      );
      expect(r.attemptCount()).toBe(before.attempts);
      expect(r.eventCount()).toBe(before.events);
    } finally {
      await r.close();
    }
  }, 180_000);

  it("runTurn holds the head barrier: it settles, refuses to advance while task-c verifies, and starts nothing", async () => {
    const r = await scenario(["task-b"]);
    try {
      const before = r.eventCount();
      const turn = await r.controller.runTurn();
      expect(turn.phase).toBe("head_sync_required");
      expect(turn.blockers).toContain("quiescence_required");
      // Not one activation event in the turn:
      const appended = r.events().slice(before).map((event) => event.event_type);
      expect(appended).not.toContain("TASK_STARTED");
      expect(appended).not.toContain("ATTEMPT_CREATED");
      expect(appended).not.toContain("PROJECT_REVISED");
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 4–5. The SAME reconciliation becomes compilable, and G10-X performs the advance
 * ================================================================== */

describe("§D5-c1 after reopening, the EXISTING G10-X authority advances the basis", () => {
  it("the same compiler now says compilable — D5 changed admissibility, not the head proof", async () => {
    const r = await scenario(["task-b"]);
    try {
      const beforeReopen = r.compile();
      expect(beforeReopen.compilable).toBe(false);
      r.reopen("task-c");
      const afterReopen = r.compile();
      expect(afterReopen.compilable).toBe(true);
      expect(afterReopen.blockers).toEqual([]);
      expect(afterReopen.fromHead).toBe(HEAD);
      expect(afterReopen.toHead).toBe(beforeReopen.toHead);
      // D5 minted no new head proof: the chain and its backing event are exactly what they were.
      expect(afterReopen.latestPromotionEventId).toBe(beforeReopen.latestPromotionEventId);
      expect(afterReopen.promotionChainBasis).toEqual(beforeReopen.promotionChainBasis);
      expect(afterReopen.promotionChainBasis).toHaveLength(1);
    } finally {
      await r.close();
    }
  }, 180_000);

  it("reconcileProjectHead() lands PROJECT_REVISED + TASK_REAUTHORIZED — and no REWORK event exists", async () => {
    const r = await scenario(["task-b", "task-c"]);
    try {
      const before = r.eventCount();
      const revisionBefore = r.ir().revision;
      const result = await r.controller.reconcileProjectHead();
      expect(result.status).toBe("reconciled");
      expect(result.fromHead).toBe(HEAD);
      expect(result.toHead).not.toBe(HEAD);
      expect(result.revision).toBe(revisionBefore + 1);

      const appended = r.events().slice(before);
      const types = appended.map((event) => event.event_type);
      expect(types).toContain("PROJECT_REVISED");
      // Retained runnable tasks are reauthorized by the SAME closure (G10-X normal semantics):
      const reauthorized = appended
        .filter((event) => event.event_type === "TASK_REAUTHORIZED")
        .map((event) => event.entity_id);
      expect(reauthorized).toEqual(expect.arrayContaining(["task-b", "task-c"]));
      // And the closure introduced no new vocabulary:
      for (const event of r.events()) {
        expect(event.event_type).not.toMatch(/REWORK/u);
      }

      const project = r.ir();
      expect(project.head_commit).toBe(result.toHead);
      expect(project.revision).toBe(1);
      expect(r.taskState("task-b")).toBe("READY");
      const envelopeB = r.envelopeOf("task-b");
      expect(envelopeB.base_commit).toBe(result.toHead);
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 6. E_1 is the same Work at a new position
 * ================================================================== */

describe("§D5-c1 E_0 ≠ E_1, and the semantic projection is identical", () => {
  it("proof 6 speaks the CANONICAL semantic language — no second definition lives in this file", () => {
    /**
     * D3-a froze the semantic projection (`semanticProjectionDigestOf`): the digest of what the work IS,
     * with every positional field excluded and the field list written out so a new envelope field is a
     * deliberate decision. A second, local "same Work" definition here would let this suite stay green
     * while the canonical Work identity actually changed. The patterns are assembled from fragments so
     * this assertion cannot match its own source.
     */
    const text = source("test/lean_d5c1_head_sync_composition.test.ts");
    for (const fragment of ["SEMANTIC_FIELDS", "semanticDigest"]) {
      expect(text).not.toMatch(new RegExp(`(?:const|function) ${fragment}`));
    }
    expect(text).toContain("semanticProjectionDigestOf(");
  });

  it("same Work, new basis: positional identity moves, semantic identity does not", async () => {
    const r = await scenario(["task-b", "task-c"]);
    try {
      const e0 = r.envelopeOf("task-b");
      const semanticBefore = semanticProjectionDigestOf(e0);
      await r.controller.reconcileProjectHead();
      const e1 = r.envelopeOf("task-b");

      // Same Work — measured by the CANONICAL projection D3-a froze, never by a local re-definition:
      expect(semanticProjectionDigestOf(e1)).toBe(semanticBefore);
      // New position:
      expect(e1.envelope_id).not.toBe(e0.envelope_id);
      expect(e1.base_commit).not.toBe(e0.base_commit);
      expect(e1.base_commit).toBe(r.ir().head_commit);
      expect(e1.project_revision).toBe(e0.project_revision + 1);
      expect(e1.project_digest).not.toBe(e0.project_digest);
      expect(e1.idempotency_key).not.toBe(e0.idempotency_key);
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 7. TaskAuthority evolves; AttemptProvenance does not
 * ================================================================== */

describe("§D5-c1 the D5-b1 composition: AttemptAuthorization(B0) = E_0 survives the basis advance", () => {
  it("the task rebinds to E_1 while the attempt keeps E_0, byte for byte, with a stable subject", async () => {
    const r = await scenario(["task-b", "task-c"]);
    try {
      const attemptB = r.attempts["task-b"]!.attemptId;
      const recordBefore = r.controller.attemptWorkRecord(attemptB);
      const subjectBefore = r.verifySubject(attemptB);
      expect(String(recordBefore?.envelope?.base_commit)).toBe(HEAD);

      await r.controller.reconcileProjectHead();

      // Task-current moved:
      expect(r.envelopeOf("task-b").envelope_id).not.toBe(recordBefore?.envelope?.envelope_id);
      // Attempt-historical did not — the record is byte-identical and the shipped verification subject
      // still resolves to the SAME identity at the OLD base:
      const recordAfter = r.controller.attemptWorkRecord(attemptB);
      expect(JSON.stringify(recordAfter)).toBe(JSON.stringify(recordBefore));
      const subjectAfter = r.verifySubject(attemptB);
      expect(subjectAfter.baseCommit).toBe(HEAD);
      expect(subjectAfter.digest).toBe(subjectBefore.digest);
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * 8. D5-c1 stops at READY@E_1 — no new Attempt
 * ================================================================== */

describe("§D5-c1 stops here: the next mutating target is real, and nothing is started", () => {
  it("mutatingWorkTarget names task-b at H1 with resumed=false, and the log holds no activation", async () => {
    const r = await scenario(["task-b", "task-c"]);
    try {
      const result = await r.controller.reconcileProjectHead();
      expect(result.status).toBe("reconciled");
      const before = { events: r.eventCount(), attempts: r.attemptCount() };

      const target = r.controller.mutatingWorkTarget({ expectedTaskId: "task-b" });
      expect(target.taskId).toBe("task-b");
      expect(target.baseCommit).toBe(r.ir().head_commit);
      expect(target.baseCommit).not.toBe(HEAD);
      expect(target.resumed).toBe(false);

      // Read-only: D5-c2/c3 own the new Attempt, the PriorResultContext and the real worker. Nothing at all
      // was appended after the reconciliation, so no activation rode along with the read.
      expect(r.eventCount()).toBe(before.events);
      expect(r.attemptCount()).toBe(before.attempts);
      expect(r.events().slice(before.events).map((event) => event.event_type)).not.toContain("TASK_STARTED");
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * Negatives: what governed reopening does NOT unlock
 * ================================================================== */

describe("§D5-c1 negatives — rework removes the quiescence blocker, and only that", () => {
  it("NEGATIVE B: an OPEN attempt blocks the reconciliation in its own right", async () => {
    const r = await rig();
    try {
      const driven = await r.drive("task-a");
      r.attempts["task-a"] = driven;
      await r.promote(driven.attemptId, driven.resultCommit);
      r.attempts["task-b"] = await r.drive("task-b");
      // task-c is started and its attempt is OPEN (LEASED), before the reopening.
      const openAttemptId = await r.startWithoutCompleting("task-c");
      r.reopen("task-b");

      const candidate = r.compile();
      expect(candidate.compilable).toBe(false);
      // Both blocking classes are named: the ACTIVE task AND its open attempt.
      expect(candidate.blockers[0]!.kind).toBe("quiescence_required");
      expect(candidate.blockers[0]!.refs).toContain("task-c");
      expect(candidate.blockers[0]!.refs).toContain(openAttemptId);
      expect(candidate.currentWorkState.openAttemptIds).toEqual([openAttemptId]);
    } finally {
      await r.close();
    }
  }, 180_000);

  it("NEGATIVE C: without head drift, reopened Work manufactures no PROJECT_REVISED", async () => {
    const r = await rig();
    try {
      r.attempts["task-a"] = await r.drive("task-a");
      r.attempts["task-b"] = await r.drive("task-b");
      expect(r.controller.promotions.projectHeadStatusSync().state).toBe("IN_SYNC");
      const before = r.eventCount();

      r.reopen("task-b");
      expect(r.taskState("task-b")).toBe("READY");

      const candidate = r.compile();
      expect(candidate.compilable).toBe(false);
      expect(candidate.blockers.map((blocker) => blocker.kind)).toEqual(["no_drift"]);
      const result = await r.controller.reconcileProjectHead();
      expect(result.status).toBe("in_sync");
      // D5 is not a basis-advance authority: nothing was written beyond the reopening itself.
      expect(r.events().slice(before).map((event) => event.event_type)).toEqual(["TASK_READY"]);
    } finally {
      await r.close();
    }
  }, 180_000);

  it("NEGATIVE D: a governed reopen cannot make a BROKEN promotion chain compilable", async () => {
    const r = await rig();
    try {
      r.attempts["task-a"] = await r.drive("task-a");
      r.attempts["task-b"] = await r.drive("task-b");
      // The real pipeline cannot PRODUCE a conflict — the promotion admission pins the expected head to the
      // canonical chain, so a forged one is refused before any fact exists:
      await expect(r.controller.promote("task-b", r.attempts["task-b"]!.resultCommit, "f".repeat(40))).rejects.toThrow();
      // The compiler's conflict branch is therefore defense in depth, proven at the component the shipped
      // controller calls, with fabricated facts that no real append could create:
      const conflicted = compileProjectHeadReconciliation({
        project: { ...r.ir() },
        status: {
          schemaVersion: 1 as const,
          projectRevision: r.ir().revision,
          projectHeadCommit: HEAD,
          provenEffectHeadCommit: "d".repeat(40),
          latestPromotionEventRef: "99",
          state: "CONFLICT",
        },
        tasks: [{ taskId: "task-b", state: "READY" }, { taskId: "task-c", state: "READY" }],
        openAttempts: [],
        promotions: [
          {
            eventId: "98",
            promotionId: "p98",
            attemptId: "a98",
            sourceCommit: "9".repeat(40),
            expectedHeadCommit: HEAD,
            resultingHeadCommit: "d".repeat(40),
          },
          {
            eventId: "99",
            promotionId: "p99",
            attemptId: "a99",
            sourceCommit: "8".repeat(40),
            expectedHeadCommit: "e".repeat(40), // ≠ the running chain head — the break
            resultingHeadCommit: "7".repeat(40),
          },
        ],
      });
      expect(conflicted.compilable).toBe(false);
      expect(conflicted.blockers.map((blocker) => blocker.kind)).toEqual(["head_conflict"]);
      // Every task is quiescent here — the ONLY blocker is the broken chain, which no reopen can touch.
    } finally {
      await r.close();
    }
  }, 180_000);
});

/* ================================================================== *
 * The slice adds no product surface
 * ================================================================== */

describe("§D5-c1 adds no product semantics", () => {
  it("the slice is tests and docs: no product file mentions a D5 head-sync path", () => {
    for (const file of ["src/domain/project_head.ts", "src/scheduler/scheduler.ts"]) {
      expect(source(file), `${file} must not grow a rework-specific head path`).not.toMatch(/rework/iu);
    }
  });
});
