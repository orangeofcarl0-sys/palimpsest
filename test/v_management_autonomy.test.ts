/**
 * G10-V graduated project-management autonomy — deterministic behaviour.
 *
 *   Mode ≠ Authority        EffectivePermission = Authority ∩ Policy ∩ Capability
 *   No self-escalation      Downgrade is immediate     No autonomy scalar
 *
 * The profile store is a deployment-local preference; the policy matrix is a pure
 * table; the service composes the derived workspace view with the EXISTING governed
 * services (`controller.runTurn`, `controller.plan`) and never attests authority.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import { decodeJsonBlob } from "../src/tools/controller.js";
import { parseProjectIr } from "../src/schema/models.js";
import { canonicalDatetime } from "../src/schema/datetime.js";
import { makePalimpsestApplicationSurface } from "../src/application/surface.js";
import { defineApplicationTools } from "../src/tools/application_tools.js";

import {
  SqliteProjectAssetAssociationStore,
  SqliteProjectJournalStore,
  makeProjectWorkspaceService,
  type ProjectWorkspaceService,
  type ProjectWorkspaceView,
} from "../src/project_workspace/index.js";
import {
  AUTHORITY_REQUIRED_ACTIONS,
  DEFAULT_ACTION_POLICY,
  DEFAULT_MAX_STEPS_PER_RUN,
  MANAGEMENT_ACTION_CLASSES,
  MANAGEMENT_INVOLVEMENTS,
  MANAGEMENT_POLICY_CELLS,
  MANAGEMENT_PROFILE_EPOCH,
  SqliteManagementPreferenceStore,
  defaultAllowedActionClasses,
  defaultConfirmationBoundaries,
  defaultManagementProfile,
  evaluateManagementAction,
  makeProjectManagementService,
  materializeManagementProfile,
  type ManagementActionClass,
  type ManagementInvolvement,
  type ProjectManagementService,
  type UserManagementControlPort,
} from "../src/project_management/index.js";

import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const CLOCK = "2026-08-13T00:00:00Z";
const PROJECT = "mgmt-project";

/* ------------------------------------------------------------------ *
 * The §27 policy matrix, transcribed from the spec (docs/engineering/
 * MANAGEMENT-AUTONOMY-MODEL.md §3)
 * ------------------------------------------------------------------ */

const EXPECTED_MATRIX: Record<ManagementActionClass, Record<ManagementInvolvement, string>> = {
  OBSERVE: { DIRECT: "explicit", ASSIST: "yes", MANAGE: "yes", DELEGATE: "yes" },
  RECOMMEND: { DIRECT: "explicit", ASSIST: "yes", MANAGE: "yes", DELEGATE: "yes" },
  PREPARE: { DIRECT: "explicit", ASSIST: "yes", MANAGE: "yes", DELEGATE: "yes" },
  ADVANCE_MECHANICAL_WORK: { DIRECT: "explicit", ASSIST: "no", MANAGE: "yes", DELEGATE: "yes" },
  START_LOCAL_RECIPE: { DIRECT: "explicit", ASSIST: "no", MANAGE: "yes", DELEGATE: "yes" },
  RUN_LOCAL_VERIFY: { DIRECT: "explicit", ASSIST: "no", MANAGE: "yes", DELEGATE: "yes" },
  APPLY_LOCAL_PLAN_REVISION: { DIRECT: "explicit", ASSIST: "no", MANAGE: "confirmation", DELEGATE: "within_envelope" },
  DISPATCH_LOCAL_WORK: { DIRECT: "explicit", ASSIST: "no", MANAGE: "existing_plan", DELEGATE: "yes" },
  SEND_PEER_REQUEST: { DIRECT: "explicit", ASSIST: "suggest", MANAGE: "confirmation", DELEGATE: "confirmation" },
  CREATE_EXTERNAL_COMMITMENT: { DIRECT: "semantic_authority", ASSIST: "no", MANAGE: "no", DELEGATE: "no" },
  APPROVE_DISCLOSURE: { DIRECT: "explicit", ASSIST: "no", MANAGE: "no", DELEGATE: "no" },
  EVOLVE_ORGANIZATION: { DIRECT: "governed", ASSIST: "governed", MANAGE: "governed", DELEGATE: "governed" },
  IRREVERSIBLE_EFFECT: {
    DIRECT: "semantic_authority",
    ASSIST: "semantic_authority",
    MANAGE: "semantic_authority",
    DELEGATE: "semantic_authority",
  },
};

function profileFor(involvement: ManagementInvolvement, overrides: { readonly all?: boolean } = {}) {
  return materializeManagementProfile({
    projectId: PROJECT,
    involvement,
    budgets: { maxStepsPerRun: DEFAULT_MAX_STEPS_PER_RUN },
    allowedActionClasses: overrides.all === true ? [...MANAGEMENT_ACTION_CLASSES] : defaultAllowedActionClasses(involvement),
    confirmationBoundaries: overrides.all === true ? [] : defaultConfirmationBoundaries(involvement),
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

/* ------------------------------------------------------------------ *
 * Rig
 * ------------------------------------------------------------------ */

interface Rig {
  readonly root: string;
  readonly store: EventStore;
  readonly controller: ProjectController;
  readonly associations: SqliteProjectAssetAssociationStore;
  readonly journal: SqliteProjectJournalStore;
  readonly workspace: ProjectWorkspaceService;
  readonly managementPath: string;
  cleanup(): Promise<void>;
}

function makeRig(tasks = [taskSpec("task-1")], requirements: readonly unknown[] = []): Rig {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-v-mgmt-"));
  const store = new EventStore(join(root, "palimpsest.sqlite"), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({ databasePath: join(root, "ops.sqlite"), git: new FakeGitPort(HEAD) });
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
  const associations = new SqliteProjectAssetAssociationStore(join(root, "project-workspace.sqlite"));
  const journal = new SqliteProjectJournalStore(join(root, "project-journal.sqlite"));
  controller.start({
    projectId: PROJECT,
    goal: "Deliver the bounded management surface.",
    requirements: requirements as never,
    decisions: [],
    tasks,
    committedAt: CLOCK,
  });
  const workspace = makeProjectWorkspaceService({ controller, associations, journal, clock: () => CLOCK });
  return {
    root,
    store,
    controller,
    associations,
    journal,
    workspace,
    managementPath: join(root, "management.sqlite"),
    async cleanup() {
      for (const store0 of [associations, journal]) {
        try {
          store0.close();
        } catch {
          /* already closed */
        }
      }
      await controller.close();
      store.close();
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* windows handle lag */
      }
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

function countEvents(controller: ProjectController): number {
  const row = controller.store.connection.prepare("SELECT COUNT(*) AS total FROM events").get() as { total: number };
  return Number(row.total);
}

function serviceFor(rig: Rig, involvement: ManagementInvolvement, workspace: ProjectWorkspaceService = rig.workspace): ProjectManagementService {
  return makeProjectManagementService({ workspace, control: controlFor(involvement), controller: rig.controller, clock: () => CLOCK });
}

function viewWith(real: ProjectWorkspaceService, override: (view: ProjectWorkspaceView) => ProjectWorkspaceView): ProjectWorkspaceService {
  return { ...real, view: async () => override(await real.view()) };
}

/* ------------------------------------------------------------------ *
 * Policy matrix + evaluation
 * ------------------------------------------------------------------ */

describe("G10-V management policy matrix (§27)", () => {
  it("matches every cell for all 13 action classes × 4 involvements", () => {
    expect([...MANAGEMENT_ACTION_CLASSES]).toHaveLength(13);
    expect([...MANAGEMENT_INVOLVEMENTS]).toEqual(["DIRECT", "ASSIST", "MANAGE", "DELEGATE"]);
    expect(Object.keys(EXPECTED_MATRIX).sort()).toEqual([...MANAGEMENT_ACTION_CLASSES].sort());
    for (const actionClass of MANAGEMENT_ACTION_CLASSES) {
      for (const involvement of MANAGEMENT_INVOLVEMENTS) {
        const expected = EXPECTED_MATRIX[actionClass][involvement];
        expect(DEFAULT_ACTION_POLICY[actionClass][involvement], `${actionClass}/${involvement}`).toBe(expected);
        expect(MANAGEMENT_POLICY_CELLS as readonly string[]).toContain(expected);
      }
    }
  });

  it("never permits the authority-shaped classes on mode alone", () => {
    expect([...AUTHORITY_REQUIRED_ACTIONS]).toEqual([
      "CREATE_EXTERNAL_COMMITMENT",
      "APPROVE_DISCLOSURE",
      "EVOLVE_ORGANIZATION",
      "IRREVERSIBLE_EFFECT",
    ]);
    for (const involvement of MANAGEMENT_INVOLVEMENTS) {
      const profile = profileFor(involvement);
      for (const actionClass of AUTHORITY_REQUIRED_ACTIONS) {
        const evaluation = evaluateManagementAction({
          profile,
          actionClass,
          hasSemanticAuthority: false,
          capabilityAvailable: true,
          isWithinEnvelope: true,
          confirmed: true,
        });
        expect(evaluation.permitted, `${actionClass} at ${involvement}`).toBe(false);
      }
    }
  });

  it("never permits when the capability is unavailable", () => {
    const profile = profileFor("DELEGATE", { all: true });
    for (const actionClass of MANAGEMENT_ACTION_CLASSES) {
      const evaluation = evaluateManagementAction({
        profile,
        actionClass,
        hasSemanticAuthority: true,
        capabilityAvailable: false,
        isWithinEnvelope: true,
        confirmed: true,
      });
      expect(evaluation.permitted, actionClass).toBe(false);
      expect(evaluation.reason).toMatch(/capability that is not available/u);
    }
  });

  it("treats suggest as non-executable and applies the envelope gate", () => {
    // SEND_PEER_REQUEST is a suggestion at ASSIST: never permitted, even confirmed.
    const assist = profileFor("ASSIST");
    expect(
      evaluateManagementAction({
        profile: assist,
        actionClass: "SEND_PEER_REQUEST",
        hasSemanticAuthority: false,
        capabilityAvailable: true,
        isWithinEnvelope: true,
        confirmed: true,
      }).permitted,
    ).toBe(false);

    // within_envelope / existing_plan need a candidate inside the plan.
    const delegate = profileFor("DELEGATE");
    const outside = evaluateManagementAction({
      profile: delegate,
      actionClass: "APPLY_LOCAL_PLAN_REVISION",
      hasSemanticAuthority: false,
      capabilityAvailable: true,
      isWithinEnvelope: false,
      confirmed: true,
    });
    expect(outside.permitted).toBe(false);
    const inside = evaluateManagementAction({
      profile: delegate,
      actionClass: "APPLY_LOCAL_PLAN_REVISION",
      hasSemanticAuthority: false,
      capabilityAvailable: true,
      isWithinEnvelope: true,
      confirmed: true,
    });
    expect(inside.permitted).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Preference store
 * ------------------------------------------------------------------ */

describe("G10-V SqliteManagementPreferenceStore", () => {
  it("defaults to DIRECT with a deterministic epoch profile", async () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-v-mgmt-store-"));
    const store = new SqliteManagementPreferenceStore(join(root, "management.sqlite"), { clock: () => CLOCK });
    try {
      const profile = await store.get(PROJECT);
      expect(profile.involvement).toBe("DIRECT");
      // The epoch constant is the deterministic default; the artifact stores it canonically.
      expect(profile.updatedAt).toBe(canonicalDatetime(MANAGEMENT_PROFILE_EPOCH));
      expect(profile.digest).toBe(defaultManagementProfile(PROJECT, "operator:unset").digest);
      expect(await store.history(PROJECT)).toEqual([]);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records a mode-history row only when the involvement actually changes", async () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-v-mgmt-history-"));
    const store = new SqliteManagementPreferenceStore(join(root, "management.sqlite"), { clock: () => CLOCK });
    try {
      await store.set({ projectId: PROJECT, involvement: "DELEGATE", updatedBy: "operator" });
      let history = await store.history(PROJECT);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ seq: 1, fromInvolvement: "DIRECT", toInvolvement: "DELEGATE", updatedBy: "operator" });

      await store.set({ projectId: PROJECT, involvement: "MANAGE", updatedBy: "operator" });
      history = await store.history(PROJECT);
      expect(history).toHaveLength(2);
      expect(history[1]).toMatchObject({ seq: 2, fromInvolvement: "DELEGATE", toInvolvement: "MANAGE" });

      // A no-op set updates the profile but records no history row.
      await store.set({ projectId: PROJECT, involvement: "MANAGE", updatedBy: "operator" });
      expect(await store.history(PROJECT)).toHaveLength(2);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns the last mode after close/reopen, and degrades to DIRECT when the DB is lost", async () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-v-mgmt-reopen-"));
    const path = join(root, "management.sqlite");
    const first = new SqliteManagementPreferenceStore(path, { clock: () => CLOCK });
    await first.set({ projectId: PROJECT, involvement: "ASSIST", updatedBy: "operator" });
    first.close();

    const reopened = new SqliteManagementPreferenceStore(path, { clock: () => CLOCK });
    try {
      expect((await reopened.get(PROJECT)).involvement).toBe("ASSIST");
    } finally {
      reopened.close();
    }

    rmSync(path, { force: true });
    const afterLoss = new SqliteManagementPreferenceStore(path, { clock: () => CLOCK });
    try {
      const degraded = await afterLoss.get(PROJECT);
      expect(degraded.involvement).toBe("DIRECT");
      expect(degraded.digest).toBe(defaultManagementProfile(PROJECT, "operator:unset").digest);
      expect(await afterLoss.history(PROJECT)).toEqual([]);
    } finally {
      afterLoss.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/* ------------------------------------------------------------------ *
 * The bounded service over a real controller
 * ------------------------------------------------------------------ */

describe("G10-V bounded management service over a real controller", () => {
  it("DIRECT step() asks for confirmation and only a confirmed step applies a task-only plan", async () => {
    const rig = makeRig();
    try {
      const management = serviceFor(rig, "DIRECT");
      const before = readIr(rig.controller);
      const events = countEvents(rig.controller);

      const unconfirmed = await management.step();
      expect(unconfirmed.status).toBe("needs_confirmation");
      expect(unconfirmed.action).toBe("DISPATCH_LOCAL_WORK");
      expect(readIr(rig.controller).revision).toBe(before.revision);
      expect(countEvents(rig.controller)).toBe(events);

      const confirmed = await management.step({ confirmed: true });
      expect(confirmed.status).toBe("executed");
      const after = readIr(rig.controller);
      expect(after.revision).toBe(before.revision + 1);
      expect(after.tasks.map((task) => task.task_id)).toEqual(before.tasks.map((task) => task.task_id));
      expect(after.goal).toBe(before.goal);
      expect(JSON.stringify(after.requirements)).toBe(JSON.stringify(before.requirements));
      expect(countEvents(rig.controller)).toBeGreaterThan(events);
    } finally {
      await rig.cleanup();
    }
  });

  it("ASSIST recommend() returns candidates and mutates nothing", async () => {
    const rig = makeRig();
    try {
      const management = serviceFor(rig, "ASSIST");
      const before = readIr(rig.controller);
      const events = countEvents(rig.controller);

      const candidates = await management.recommend();
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every((candidate) => typeof candidate.actionId === "string")).toBe(true);

      expect(readIr(rig.controller).revision).toBe(before.revision);
      expect(readIr(rig.controller).tasks).toHaveLength(before.tasks.length);
      expect(countEvents(rig.controller)).toBe(events);
    } finally {
      await rig.cleanup();
    }
  });

  it("MANAGE advances mechanical Work through controller.runTurn", async () => {
    const rig = makeRig();
    try {
      const realView = await rig.workspace.view();
      const ready = realView.work.tasks.find((task) => task.state === "READY")!;
      const synthetic = viewWith(rig.workspace, (view) => ({
        ...view,
        work: {
          ...view.work,
          attempts: [...view.work.attempts, { attempt_id: "synthetic-attempt", task_id: ready.task_id, state: "RUNNING", attempt_no: 1 }],
        },
      }));
      const management = serviceFor(rig, "MANAGE", synthetic);

      const result = await management.step();
      expect(result.status).toBe("executed");
      expect(result.action).toBe("ADVANCE_MECHANICAL_WORK");
      expect(result.detail).toContain("controller.runTurn");
    } finally {
      await rig.cleanup();
    }
  });

  it("MANAGE refuses a requirement change", async () => {
    const rig = makeRig([taskSpec("task-1")], [
      { requirement_id: "req-1", statement: "Never change requirements.", priority: "critical", acceptance_refs: ["acc-1"] },
    ]);
    try {
      const synthetic = viewWith(rig.workspace, (view) => ({
        ...view,
        openLoops: [
          { id: "BLOCKED_WORK:req-1", kind: "BLOCKED_WORK", detail: "a requirement change was requested", subjectRef: { kind: "requirement", id: "req-1" } },
        ],
      }));
      const management = serviceFor(rig, "MANAGE", synthetic);
      const before = readIr(rig.controller);
      const events = countEvents(rig.controller);

      const result = await management.step({ confirmed: true });
      expect(result.status).toBe("not_permitted");
      expect(result.action).toBe("APPLY_LOCAL_PLAN_REVISION");
      expect(result.detail).toMatch(/never changes requirements/u);
      expect(readIr(rig.controller).revision).toBe(before.revision);
      expect(countEvents(rig.controller)).toBe(events);
    } finally {
      await rig.cleanup();
    }
  });

  it("DELEGATE applies a task-only plan revision while the goal and requirements stay byte-identical", async () => {
    const rig = makeRig([taskSpec("task-1")], [
      { requirement_id: "req-1", statement: "Keep the goal.", priority: "critical", acceptance_refs: ["acc-1"] },
    ]);
    try {
      const management = serviceFor(rig, "DELEGATE");
      const before = readIr(rig.controller);
      const result = await management.step();
      expect(result.status).toBe("executed");
      expect(result.action).toBe("DISPATCH_LOCAL_WORK");

      const after = readIr(rig.controller);
      expect(after.revision).toBe(before.revision + 1);
      expect(after.goal).toBe(before.goal);
      expect(JSON.stringify(after.requirements)).toBe(JSON.stringify(before.requirements));
      expect(JSON.stringify(after.tasks)).toBe(JSON.stringify(before.tasks));
    } finally {
      await rig.cleanup();
    }
  });

  it("downgrades mid-run: the per-step profile read stops proactive work immediately", async () => {
    const rig = makeRig();
    try {
      const store = new SqliteManagementPreferenceStore(rig.managementPath, { clock: () => CLOCK });
      try {
        await store.set({ projectId: PROJECT, involvement: "DELEGATE", updatedBy: "operator" });
        // `step()` re-reads the profile too, so the DELEGATE profile is served for the
        // first runBounded budget read AND the first step's assessment; from then on the
        // deployment has been downgraded to DIRECT mid-run.
        let reads = 0;
        const control: UserManagementControlPort = {
          get: async (projectId) => {
            reads += 1;
            return reads <= 2 ? store.get(projectId) : profileFor("DIRECT");
          },
          set: (input) => store.set(input),
        };
        const management = makeProjectManagementService({ workspace: rig.workspace, control, controller: rig.controller, clock: () => CLOCK });

        const run = await management.runBounded({ maxSteps: 5 });
        expect(reads).toBeGreaterThanOrEqual(3); // the profile is re-read every step
        expect(run.steps).toHaveLength(2);
        expect(run.steps[0]).toMatchObject({ status: "executed", action: "DISPATCH_LOCAL_WORK" });
        expect(run.steps[1]).toMatchObject({ status: "needs_confirmation" });
        expect(run.stoppedReason).toBe("needs_confirmation");
        // Exactly one proactive plan revision was applied before the downgrade.
        expect(readIr(rig.controller).revision).toBe(1);
      } finally {
        store.close();
      }
    } finally {
      await rig.cleanup();
    }
  });

  it("keeps the management mode orthogonal to the work mode and recipe refs", async () => {
    const rig = makeRig();
    try {
      const store = new SqliteManagementPreferenceStore(rig.managementPath, { clock: () => CLOCK });
      try {
        const control: UserManagementControlPort = { get: (id) => store.get(id), set: (input) => store.set(input) };
        const management = makeProjectManagementService({ workspace: rig.workspace, control, controller: rig.controller, clock: () => CLOCK });

        const irBefore = readIr(rig.controller);
        const eventsBefore = countEvents(rig.controller);
        const profileBefore = await store.get(PROJECT);

        // A management change never touches the work ledger.
        const applied = await management.applyOperatorModeChange({ to: "DELEGATE", updatedBy: "operator" });
        expect(applied.involvement).toBe("DELEGATE");
        expect(JSON.stringify(readIr(rig.controller))).toBe(JSON.stringify(irBefore));
        expect(countEvents(rig.controller)).toBe(eventsBefore);

        // A work revision never touches the operator profile.
        const profileAfterChange = await store.get(PROJECT);
        rig.controller.plan({
          goal: readIr(rig.controller).goal,
          requirements: readIr(rig.controller).requirements,
          decisions: readIr(rig.controller).decisions,
          tasks: [...readIr(rig.controller).tasks, taskSpec("task-work-2")],
          reason: "a work revision",
        });
        const profileAfterWork = await store.get(PROJECT);
        expect(profileAfterWork.digest).toBe(profileAfterChange.digest);
        expect(profileAfterWork.involvement).toBe("DELEGATE");
        expect(profileBefore.involvement).toBe("DIRECT");

        // No work-mode/recipe field exists on the profile at all.
        for (const forbidden of ["workMode", "baseMode", "mode", "recipeRefs", "recipes"]) {
          expect(profileAfterWork).not.toHaveProperty(forbidden);
        }
      } finally {
        store.close();
      }
    } finally {
      await rig.cleanup();
    }
  });
});

/* ------------------------------------------------------------------ *
 * No escalation on the agent-facing surface
 * ------------------------------------------------------------------ */

describe("G10-V no escalation path on the agent-facing surface", () => {
  it("exposes only requestModeChange on the application surface; applyOperatorModeChange stays operator-only", async () => {
    const rig = makeRig();
    try {
      const store = new SqliteManagementPreferenceStore(rig.managementPath, { clock: () => CLOCK });
      try {
        const control: UserManagementControlPort = { get: (id) => store.get(id), set: (input) => store.set(input) };
        const management = makeProjectManagementService({ workspace: rig.workspace, control, controller: rig.controller, clock: () => CLOCK });
        const application = makePalimpsestApplicationSurface({
          controller: rig.controller,
          projectWorkspace: rig.workspace,
          projectManagement: management,
        });

        const surface = application.projectManagement!;
        expect(Object.keys(surface).sort()).toEqual(["preview", "recommend", "requestModeChange", "run", "status", "step"]);
        for (const forbidden of [
          "applyOperatorModeChange",
          "setModeUpward",
          "set_mode_upward",
          "grantAuthority",
          "grant_authority",
          "approveDisclosure",
          "approve_disclosure",
          "forceCommitment",
          "force_commitment",
        ]) {
          expect(surface).not.toHaveProperty(forbidden);
        }
        // The operator path exists on the composed service, not on the agent surface.
        expect(typeof (management as unknown as Record<string, unknown>).applyOperatorModeChange).toBe("function");

        // A request applies nothing.
        const before = await store.get(PROJECT);
        const requested = await surface.requestModeChange({ to: "DELEGATE" });
        expect(requested.status).toBe("requested");
        expect((await store.get(PROJECT)).digest).toBe(before.digest);
        expect((await store.get(PROJECT)).involvement).toBe("DIRECT");

        // The tool schema mirrors the surface: no escalation action exists.
        const tools = defineApplicationTools(application);
        const manage = tools.find((tool) => tool.name === "palimpsest_manage")!;
        expect(manage).toBeDefined();
        const actions = (manage as unknown as { parameters: { properties: { action: { enum: readonly string[] } } } }).parameters.properties.action.enum;
        expect([...actions]).toEqual(["status", "recommend", "preview", "step", "run", "request_mode_change"]);
        for (const forbidden of [
          "apply_operator_mode",
          "set_mode_upward",
          "grant_authority",
          "approve_disclosure",
          "force_commitment",
        ]) {
          expect(actions).not.toContain(forbidden);
        }
      } finally {
        store.close();
      }
    } finally {
      await rig.cleanup();
    }
  });
});
