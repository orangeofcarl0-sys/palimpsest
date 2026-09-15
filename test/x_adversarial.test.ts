/**
 * G10-X — adversarial / anti-forgery suite.
 *
 * Proves, against the real controller and derived surfaces:
 *   A. forgery negatives: a caller can never choose the expected head or the
 *      source commit, an unknown field on `promoteAttempt` is inert, and the
 *      agent-facing `PlanInput` has no head field at all;
 *   B. a stale compiled reconciliation candidate is refused with
 *      `stale_head_reconciliation` and ZERO writes;
 *   C. no-second-truth / anti-waste: the head kernel is pure, no git-head
 *      database/ledger/watcher was added, `git.head()` never sets the head, and
 *      the projector/store files are untouched;
 *   D. DIRECT/ASSIST semantics are preserved and a management mode grants no
 *      promotion authority;
 *   E. the derived workspace overview and the mechanical management/HTTP
 *      reconciliation expose the head without ever accepting a caller head.
 */

import { existsSync, readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { handleApplicationRequest } from "../src/application/http.js";
import { makePalimpsestApplicationSurface } from "../src/application/surface.js";
import { TaskPolicy } from "../src/domain/index.js";
import {
  compileProjectHeadReconciliation,
  ProjectHeadError,
} from "../src/domain/project_head.js";
import { createPalimpsestEffects, FakeGitPort, type GitPort } from "../src/effects/index.js";
import {
  AUTHORITY_REQUIRED_ACTIONS,
  DEFAULT_ACTION_POLICY,
  MANAGEMENT_ACTION_CLASSES,
  MANAGEMENT_POLICY_CELLS,
  defaultAllowedActionClasses,
  defaultConfirmationBoundaries,
  evaluateManagementAction,
  makeProjectManagementService,
  materializeManagementProfile,
  type ManagementInvolvement,
  type ProjectManagementService,
  type UserManagementControlPort,
} from "../src/project_management/index.js";
import {
  SqliteProjectAssetAssociationStore,
  SqliteProjectJournalStore,
  buildProjectWorkspaceView,
  makeProjectWorkspaceService,
  type ProjectWorkspaceService,
} from "../src/project_workspace/index.js";
import { parseProjectIr } from "../src/schema/models.js";
import { EventStore } from "../src/state/index.js";
import { ProjectController } from "../src/tools/index.js";
import { decodeJsonBlob } from "../src/tools/controller.js";

import { FakeClock, taskSpec } from "./helpers.js";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const CONTROLLER_SRC = join(SRC, "tools", "controller.ts");
const PROJECT_HEAD_SRC = join(SRC, "domain", "project_head.ts");
const PROMOTION_SRC = join(SRC, "effects", "promotion.ts");
const PROJECT_HEAD_STORE_GUESS = join(SRC, "domain", "project_head_store.ts");

const H0 = "c".repeat(40);
const PROJECT = "x-adversarial";
const CLOCK = "2026-09-15T00:00:00Z";

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

function profileFor(involvement: ManagementInvolvement) {
  return materializeManagementProfile({
    projectId: PROJECT,
    involvement,
    budgets: { maxStepsPerRun: 5 },
    allowedActionClasses: defaultAllowedActionClasses(involvement),
    confirmationBoundaries: defaultConfirmationBoundaries(involvement),
    updatedAt: CLOCK,
    updatedBy: "operator",
  });
}

function controlFor(involvement: ManagementInvolvement): UserManagementControlPort {
  return {
    get: async () => profileFor(involvement),
    set: async (input) => profileFor(input.involvement),
  };
}

interface Rig {
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly git: GitPort;
  readonly workspace: ProjectWorkspaceService;
  associationStore: SqliteProjectAssetAssociationStore;
  journalStore: SqliteProjectJournalStore;
  cleanup(): Promise<void>;
}

async function rig(git: GitPort = new FakeGitPort(H0)): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-xadv-"));
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({ databasePath: join(dir, "o.sqlite"), git });
  const controller = new ProjectController({
    store,
    effects,
    projectId: PROJECT,
    policy: policy(),
    clock: () => CLOCK,
  });
  const associations = new SqliteProjectAssetAssociationStore(join(dir, "a.sqlite"));
  const journal = new SqliteProjectJournalStore(join(dir, "j.sqlite"));
  const workspace = makeProjectWorkspaceService({ controller, associations, journal });
  return {
    store,
    controller,
    git,
    workspace,
    associationStore: associations,
    journalStore: journal,
    cleanup: async () => {
      associations.close();
      journal.close();
      await effects.close();
      store.close();
    },
  };
}

function readIr(controller: ProjectController) {
  const row = controller.store.connection
    .prepare("SELECT state_json FROM projects WHERE project_id=?")
    .get(PROJECT) as { state_json: unknown } | undefined;
  if (row === undefined) throw new Error("project is not initialized");
  return parseProjectIr(decodeJsonBlob(row.state_json));
}

function events(store: EventStore) {
  return store.listEvents(PROJECT);
}

function headOf(store: EventStore): string {
  const row = store.connection
    .prepare("SELECT head_commit FROM projects WHERE project_id=?")
    .get(PROJECT) as { head_commit: string };
  return String(row.head_commit);
}

async function workAndReport(controller: ProjectController, attemptId: string): Promise<string> {
  await controller.claim(attemptId);
  const committed = await controller.effects.invoke(
    controller.effects.actions.gitCommit,
    { worktreeId: attemptId, message: "work" },
    { scope: PROJECT, revision: controller.promotions.projectRevision(), callId: `commit:${attemptId}` },
  );
  controller.report(attemptId, {
    workerStatus: "completed",
    summary: "done",
    resultCommit: committed.commit,
  });
  return committed.commit;
}

/** A single-task project promoted once: the head drifts H0 → H1. */
async function driftedRig(): Promise<Rig & { attemptId: string; sourceCommit: string; h1: string }> {
  const r = await rig();
  const { controller } = r;
  controller.start({ projectId: PROJECT, goal: "adversarial", tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])] });
  controller.step();
  const created = controller.step()!;
  const sourceCommit = await workAndReport(controller, created.entity_id);
  expect(controller.step()?.event_type).toBe("TASK_VERIFYING");
  const promotion = await controller.promoteAttempt({ attemptId: created.entity_id });
  expect(controller.step()?.event_type).toBe("TASK_SATISFIED");
  return { ...r, attemptId: created.entity_id, sourceCommit, h1: promotion.resultingHeadCommit };
}

/* ------------------------------------------------------------------ *
 * A. Forgery negatives
 * ------------------------------------------------------------------ */

describe("G10-X A: forgery negatives", () => {
  it("the caller can neither replace the attempt result commit nor choose the expected head", async () => {
    const r = await rig();
    try {
      const { controller } = r;
      controller.start({ projectId: PROJECT, goal: "forgery", tasks: [taskSpec("task-1")] });
      controller.step();
      const created = controller.step()!;
      const canonicalSource = await workAndReport(controller, created.entity_id);
      expect(controller.step()?.event_type).toBe("TASK_VERIFYING");
      const before = events(r.store).length;
      // The source commit is the canonical AttemptReport.result_commit.
      await expect(
        controller.promote(created.entity_id, "f".repeat(40), H0),
      ).rejects.toMatchObject({ kind: "caller_source_not_canonical" });
      // The expected head is the canonically proven effect head - never a choice.
      await expect(
        controller.promote(created.entity_id, canonicalSource, "e".repeat(40)),
      ).rejects.toMatchObject({ kind: "caller_head_not_canonical" });
      expect(events(r.store).length).toBe(before);
      // The canonical product-safe path still works.
      const result = await controller.promoteAttempt({ attemptId: created.entity_id });
      expect(result.committed.payload.source_commit).toBe(canonicalSource);
      expect(result.committed.payload.expected_head_commit).toBe(H0);
    } finally {
      await r.cleanup();
    }
  });

  it("an unknown head field on promoteAttempt is inert (the canonical derivation wins)", async () => {
    const r = await rig();
    try {
      const { controller } = r;
      controller.start({ projectId: PROJECT, goal: "inert", tasks: [taskSpec("task-1")] });
      controller.step();
      const created = controller.step()!;
      const canonicalSource = await workAndReport(controller, created.entity_id);
      expect(controller.step()?.event_type).toBe("TASK_VERIFYING");
      const forgedHead = "d".repeat(40);
      const result = await controller.promoteAttempt({
        attemptId: created.entity_id,
        // A caller may smuggle any extra field: it changes nothing.
        expectedHeadCommit: forgedHead,
        sourceCommit: "f".repeat(40),
        headAdvance: { toHead: forgedHead },
      } as never);
      const payload = result.committed.payload;
      expect(payload.expected_head_commit).toBe(H0);
      expect(payload.source_commit).toBe(canonicalSource);
      expect(payload.resulting_head_commit).not.toBe(forgedHead);
      expect(await r.git.head()).toBe(result.resultingHeadCommit);
    } finally {
      await r.cleanup();
    }
  });

  it("promoteAttempt fails closed when the attempt has no canonical result commit", async () => {
    const r = await rig();
    try {
      const { controller } = r;
      controller.start({ projectId: PROJECT, goal: "no-commit", tasks: [taskSpec("task-1")] });
      controller.step();
      const created = controller.step()!;
      await controller.claim(created.entity_id);
      controller.report(created.entity_id, { workerStatus: "failed", summary: "no commit" });
      // G10-Z §10: a new promotion may only start from a COMPLETED attempt of a
      // current VERIFYING task, so this is refused earlier and for a stronger
      // reason than the missing source commit. The guarantee under test (fail
      // closed, write nothing) is preserved and tightened.
      await expect(
        controller.promotions.promoteAttempt({ attemptId: created.entity_id }),
      ).rejects.toMatchObject({ kind: "attempt_not_completed" });
    } finally {
      await r.cleanup();
    }
  });

  it("the agent-facing PlanInput has no head field (the trusted advance is a separate type)", () => {
    const source = readFileSync(CONTROLLER_SRC, "utf8");
    const planInput = /export interface PlanInput \{([\s\S]*?)\n\}/u.exec(source);
    expect(planInput).not.toBeNull();
    expect(planInput![1]).not.toMatch(/head/iu);
    expect(source).toContain("export interface TrustedPlanOptions");
    expect(source).toMatch(/TRUSTED-ONLY/iu);
    // `plan` is declared with the agent-facing input only.
    expect(source).toMatch(/^\s*plan\(input: PlanInput\): SchedulerEvent \{/mu);
  });
});

/* ------------------------------------------------------------------ *
 * B. Stale reconciliation
 * ------------------------------------------------------------------ */

describe("G10-X B: a stale compiled reconciliation is refused with zero writes", () => {
  it("compile the sync target, advance the chain, then commit the old candidate", async () => {
    const r = await rig();
    try {
      const { controller, store } = r;
      controller.start({
        projectId: PROJECT,
        goal: "stale",
        tasks: [taskSpec("task-a"), taskSpec("task-b", ["task-a"])],
      });
      controller.step();
      const created = controller.step()!;
      await workAndReport(controller, created.entity_id);
      expect(controller.step()?.event_type).toBe("TASK_VERIFYING");
      await controller.promoteAttempt({ attemptId: created.entity_id });
      expect(controller.step()?.event_type).toBe("TASK_SATISFIED");
      expect(controller.status().head!.state).toBe("SYNC_REQUIRED");

      // Compile the sync target while the world is quiescent (task-b BLOCKED).
      const project = readIr(controller);
      const status = await controller.promotions.projectHeadStatus();
      const facts = await controller.promotions.promotionFacts();
      const taskRows = (
        store.connection
          .prepare("SELECT task_id, state FROM tasks WHERE project_id=?")
          .all(PROJECT) as Array<{ task_id: string; state: string }>
      ).map((row) => ({ taskId: String(row.task_id), state: String(row.state) }));
      const staleCandidate = compileProjectHeadReconciliation({
        project,
        status,
        tasks: taskRows,
        openAttempts: [],
        promotions: facts,
      });
      expect(staleCandidate.compilable).toBe(true);
      const oldTarget = staleCandidate.toHead;

      // Advance the chain: sync to the first promotion, then promote task-b on
      // the NEW base (its envelope is re-authorized on H1), reaching H2.
      const sync = await controller.reconcileProjectHead();
      expect(sync.status).toBe("reconciled");
      expect(sync.toHead).toBe(oldTarget);
      expect(controller.step()?.event_type).toBe("TASK_READY");
      controller.step(); // TASK_STARTED task-b
      const createdB = controller.step()!; // ATTEMPT_CREATED
      await workAndReport(controller, createdB.entity_id);
      expect(controller.step()?.event_type).toBe("TASK_VERIFYING");
      const second = await controller.promoteAttempt({ attemptId: createdB.entity_id });
      expect(second.resultingHeadCommit).not.toBe(oldTarget);
      expect(controller.step()?.event_type).toBe("TASK_SATISFIED");

      const before = events(store).length;
      const revisionBefore = readIr(controller).revision;
      let thrown: unknown;
      try {
        await controller.reconcileProjectHead({ candidate: staleCandidate });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ProjectHeadError);
      expect((thrown as ProjectHeadError).kind).toBe("stale_head_reconciliation");
      expect(events(store).length).toBe(before); // zero writes
      expect(readIr(controller).revision).toBe(revisionBefore);
      expect(headOf(store)).toBe(oldTarget);
      // The canonical sync still works afterwards, onto the CURRENT proven head.
      const fresh = await controller.reconcileProjectHead();
      expect(fresh.status).toBe("reconciled");
      expect(fresh.toHead).toBe(second.resultingHeadCommit);
    } finally {
      await r.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * C. No-second-truth / anti-waste
 * ------------------------------------------------------------------ */

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

describe("G10-X C: no second truth, no wasted state", () => {
  it("the head kernel is pure: no store handle, no git, no clock", () => {
    const code = stripComments(readFileSync(PROJECT_HEAD_SRC, "utf8"));
    expect(code).not.toMatch(/DatabaseSync|EventStore|sqlite/iu);
    expect(code).not.toMatch(/\.head\(/u);
    expect(code).not.toMatch(/new Date|Date\.now/u);
    // The only import is the schema type.
    const imports = code.match(/^import .*$/gmu) ?? [];
    expect(imports).toEqual(['import type { ProjectIr } from "../schema/index.js";']);
  });

  it("no git-head database/ledger/watcher was added in this stage", () => {
    expect(existsSync(PROJECT_HEAD_STORE_GUESS)).toBe(false);
    for (const file of readdirSync(SRC, { recursive: true })) {
      if (typeof file !== "string" || !file.endsWith(".ts")) continue;
      const code = readFileSync(join(SRC, file), "utf8");
      expect(code, `${file} must not create a git-head table`).not.toMatch(/CREATE TABLE[^;]*git[_-]?head/iu);
      expect(code, `${file} must not declare a git-head watcher`).not.toMatch(/gitHeadWatcher|headWatcher/iu);
    }
  });

  it("git.head() is never an input to the canonical head advance", () => {
    const controller = stripComments(readFileSync(CONTROLLER_SRC, "utf8"));
    const start = controller.indexOf("reconcileProjectHead(");
    const next = controller.indexOf("\n  /**", controller.indexOf("status:", start));
    expect(start).toBeGreaterThan(0);
    const region = controller.slice(start, next);
    expect(region).not.toMatch(/git\.head\(/u);

    const promotion = stripComments(readFileSync(PROMOTION_SRC, "utf8"));
    const headCalls = promotion.match(/git\.head\(/gu) ?? [];
    // Exactly one occurrence: the diagnostic-only helper used by the
    // divergence check. It is never assigned to `projects.head_commit`.
    expect(headCalls).toHaveLength(1);
    expect(promotion).toMatch(/#gitHeadOrUndefined\(\): Promise<string \| undefined>/u);
    expect(promotion).not.toMatch(/head_commit\s*=\s*(await\s+)?this\.#g?i?t?Head/u);
  });

  it("the projector/store files are unchanged in this stage (no G10-X coupling)", () => {
    const untouched = [
      join(SRC, "state", "event_store.ts"),
      join(SRC, "application", "projections.ts"),
      join(SRC, "application", "projection_types.ts"),
    ];
    for (const file of untouched) {
      const code = readFileSync(file, "utf8");
      expect(code, file).not.toMatch(/project_head|ProjectHead|deriveProjectHeadStatus/u);
    }
  });
});

/* ------------------------------------------------------------------ *
 * D. Mode ≠ authority
 * ------------------------------------------------------------------ */

describe("G10-X D: DIRECT/ASSIST semantics are preserved; a mode grants no promotion authority", () => {
  it("RECONCILE_PROJECT_HEAD follows the matrix and is not an authority-shaped action", () => {
    expect([...MANAGEMENT_ACTION_CLASSES]).toContain("RECONCILE_PROJECT_HEAD");
    expect([...AUTHORITY_REQUIRED_ACTIONS]).not.toContain("RECONCILE_PROJECT_HEAD");
    expect(DEFAULT_ACTION_POLICY.RECONCILE_PROJECT_HEAD).toEqual({
      DIRECT: "explicit",
      ASSIST: "suggest",
      MANAGE: "yes",
      DELEGATE: "yes",
    });
    for (const cell of Object.values(DEFAULT_ACTION_POLICY.RECONCILE_PROJECT_HEAD)) {
      expect(MANAGEMENT_POLICY_CELLS as readonly string[]).toContain(cell);
    }
    // It is a DIFFERENT class from APPLY_LOCAL_PLAN_REVISION: a mechanical
    // consistency step, never a plan revision.
    expect(DEFAULT_ACTION_POLICY.RECONCILE_PROJECT_HEAD).not.toEqual(
      DEFAULT_ACTION_POLICY.APPLY_LOCAL_PLAN_REVISION,
    );
  });

  it("evaluates DIRECT (explicit), ASSIST (suggest) and MANAGE/DELEGATE (yes) exactly", () => {
    const evaluate = (involvement: ManagementInvolvement, confirmed: boolean) =>
      evaluateManagementAction({
        profile: profileFor(involvement),
        actionClass: "RECONCILE_PROJECT_HEAD",
        hasSemanticAuthority: false,
        capabilityAvailable: true,
        isWithinEnvelope: false,
        confirmed,
      });
    expect(evaluate("DIRECT", false)).toMatchObject({ permitted: false, requiredConfirmation: true });
    expect(evaluate("DIRECT", true)).toMatchObject({ permitted: true, requiredConfirmation: true });
    expect(evaluate("ASSIST", false)).toMatchObject({ permitted: false, requiredConfirmation: false });
    expect(evaluate("ASSIST", true).permitted).toBe(false);
    expect(evaluate("MANAGE", false).permitted).toBe(true);
    expect(evaluate("DELEGATE", false).permitted).toBe(true);
  });

  it("the management service exposes no promotion method and never calls one", async () => {
    const r = await rig();
    try {
      const management = makeProjectManagementService({
        workspace: r.workspace,
        control: controlFor("MANAGE"),
        controller: r.controller,
      });
      const keys = Object.keys(management);
      expect(keys).not.toContain("promote");
      expect(keys).not.toContain("promoteAttempt");
      const source = stripComments(readFileSync(join(SRC, "project_management", "service.ts"), "utf8"));
      expect(source).not.toMatch(/promoteAttempt|\.promote\(/u);
      expect(source).toContain("controller.reconcileProjectHead()");
    } finally {
      await r.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * E. Workspace + management + HTTP integration
 * ------------------------------------------------------------------ */

describe("G10-X E: the derived head is exposed, never accepted", () => {
  it("the workspace overview shows the head state and promotion provenance + drift loops", async () => {
    const r = await driftedRig();
    try {
      const view = await r.workspace.view();
      expect(view.project.head).toMatchObject({
        state: "SYNC_REQUIRED",
        stateLabel: "sync required",
        projectHeadCommit: H0,
        provenEffectHeadCommit: r.h1,
      });
      expect(view.project.head?.latestPromotion).toMatchObject({ fromHead: H0, toHead: r.h1 });
      const drift = view.openLoops.find((loop) => loop.kind === "PROJECT_HEAD_DRIFT");
      expect(drift).toBeDefined();
      expect(drift?.subjectRef).toEqual({ kind: "project", id: PROJECT });

      // The candidate builder derives the mechanical action from the drift loop.
      const management = makeProjectManagementService({
        workspace: r.workspace,
        control: controlFor("MANAGE"),
        controller: r.controller,
      });
      const candidates = await management.recommend();
      expect(candidates.some((candidate) => candidate.kind === "RECONCILE_PROJECT_HEAD")).toBe(true);

      // The mechanical step advances the head through the ordinary revision batch.
      const before = events(r.store).length;
      const stepped = await management.step();
      expect(stepped.status).toBe("executed");
      expect(headOf(r.store)).toBe(r.h1);
      expect(events(r.store).length).toBeGreaterThan(before);
      const after = await r.workspace.view();
      expect(after.project.head?.state).toBe("IN_SYNC");
      expect(after.project.head?.stateLabel).toBe("in sync");
      expect(after.openLoops.some((loop) => loop.kind === "PROJECT_HEAD_DRIFT")).toBe(false);
    } finally {
      await r.cleanup();
    }
  });

  it("a PROJECT_HEAD_CONFLICT loop is derived when the head status is CONFLICT (never auto-advanced)", async () => {
    const r = await driftedRig();
    try {
      const status = r.controller.status();
      expect(status.head).toBeDefined();
      const conflictStatus = { ...status, head: { ...status.head!, state: "CONFLICT" as const } };
      const view = buildProjectWorkspaceView({
        project: readIr(r.controller),
        status: conflictStatus,
        graph: r.controller.orchestrationGraph(),
      });
      expect(view.project.head).toMatchObject({ state: "CONFLICT", stateLabel: "conflict" });
      const conflict = view.openLoops.find((loop) => loop.kind === "PROJECT_HEAD_CONFLICT");
      expect(conflict).toBeDefined();
      expect(conflict?.subjectRef).toEqual({ kind: "project", id: PROJECT });
      expect(view.openLoops.some((loop) => loop.kind === "PROJECT_HEAD_DRIFT")).toBe(false);

      // The real ledger is NOT forged: the controller keeps reporting drift.
      expect(r.controller.status().head?.state).toBe("SYNC_REQUIRED");
      const real = await r.workspace.view();
      expect(real.openLoops.some((loop) => loop.kind === "PROJECT_HEAD_CONFLICT")).toBe(false);
      expect(real.openLoops.some((loop) => loop.kind === "PROJECT_HEAD_DRIFT")).toBe(true);
    } finally {
      await r.cleanup();
    }
  });

  it("POST /api/project/reconcile_head wraps the canonical reconciliation; GET is refused", async () => {
    const r = await driftedRig();
    try {
      const management = makeProjectManagementService({
        workspace: r.workspace,
        control: controlFor("MANAGE"),
        controller: r.controller,
      });
      const application = makePalimpsestApplicationSurface({
        controller: r.controller,
        projectWorkspace: r.workspace,
        projectManagement: management,
      });

      const wrongMethod = await handleApplicationRequest({
        application,
        method: "GET",
        pathname: "/api/project/reconcile_head",
        query: new URLSearchParams(),
        body: undefined,
      });
      expect(wrongMethod?.status).toBe(400);

      const response = await handleApplicationRequest({
        application,
        method: "POST",
        pathname: "/api/project/reconcile_head",
        query: new URLSearchParams(),
        // No head, commit or plan on the wire: the body is ignored entirely.
        body: { toHead: "f".repeat(40), sourceCommit: "e".repeat(40) },
      });
      expect(response?.status).toBe(200);
      const body = response?.body as { status: string; fromHead: string; toHead: string };
      expect(body.status).toBe("reconciled");
      expect(body.fromHead).toBe(H0);
      expect(body.toHead).toBe(r.h1);
      expect(headOf(r.store)).toBe(r.h1);
    } finally {
      await r.cleanup();
    }
  });

  it("an ASSIST mode can only SUGGEST the reconciliation; a wrapped drift-only view is never executed", async () => {
    const r = await driftedRig();
    try {
      const real = r.workspace;
      const view = await real.view();
      const driftLoop = view.openLoops.find((loop) => loop.kind === "PROJECT_HEAD_DRIFT")!;
      const driftOnly: ProjectWorkspaceService = {
        ...real,
        view: async () => ({ ...(await real.view()), openLoops: [driftLoop] }),
      };
      const assist = makeProjectManagementService({
        workspace: driftOnly,
        control: controlFor("ASSIST"),
        controller: r.controller,
      });
      const before = events(r.store).length;
      const preview = await assist.previewStep();
      expect(preview.candidate?.kind).toBe("RECONCILE_PROJECT_HEAD");
      if (preview.candidate === null) throw new Error("expected a candidate");
      expect(preview.permitted).toBe(false);
      expect(preview.reason).toMatch(/suggestion/u);
      const stepped = await assist.step();
      expect(stepped.status).toBe("not_permitted");
      expect(events(r.store).length).toBe(before);
      expect(headOf(r.store)).toBe(H0);

      // DIRECT requires an explicit confirmation; the confirmation executes it.
      const direct = makeProjectManagementService({
        workspace: driftOnly,
        control: controlFor("DIRECT"),
        controller: r.controller,
      });
      const pending = await direct.step();
      expect(pending.status).toBe("needs_confirmation");
      const confirmed = await direct.step({ confirmed: true });
      expect(confirmed.status).toBe("executed");
      expect(headOf(r.store)).toBe(r.h1);
    } finally {
      await r.cleanup();
    }
  });
});
