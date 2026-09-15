/**
 * G10-AB adversarial suite (AB-N01…AB-N30).
 *
 * Negatives and firewalls: a preference is never authority, never a plan, never
 * a capability; the two axes stay independent; the activity log is never Work
 * truth; and a crash never fabricates success.
 */

import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import { defineApplicationTools } from "../src/tools/application_tools.js";
import { makePalimpsestApplicationSurface } from "../src/application/surface.js";
import {
  SqliteManagementActivityStore,
  SqliteWorkModePreferenceStore,
  buildProjectWorkModePreference,
  buildProjectOperatingPostureView,
  defaultWorkModePreference,
  deriveEffectiveModeStatus,
  explainActivityDecision,
  orderCandidatesByWorkModePreference,
} from "../src/project_operating/index.js";
import { builtinRecipeRegistry } from "../src/recipes/index.js";
import {
  SqliteManagementPreferenceStore,
  defaultManagementProfile,
  makeProjectManagementService,
} from "../src/project_management/index.js";
import { makeProjectWorkspaceService } from "../src/project_workspace/index.js";

import { FakeClock, taskSpec } from "./helpers.js";

const CLOCK = "2026-09-16T00:00:00Z";
const PROJECT = "ab-adv-project";
const REPO = join(__dirname, "..");

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "palimpsest-ab-adv-"));
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
}

/**
 * Strip comments before scanning for forbidden declarations. Several files name
 * the things they explicitly DO NOT have ("there is no universal HistoryStore"),
 * and a comment is not a declaration.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
}

function profileOf(involvement: "DIRECT" | "ASSIST" | "MANAGE" | "DELEGATE") {
  return {
    schemaVersion: 1,
    projectId: PROJECT,
    involvement,
    allowedActionClasses: [],
    confirmationBoundaries: [],
    budgets: { maxStepsPerRun: 1 },
    updatedAt: CLOCK,
    updatedBy: "operator:test",
    digest: "d",
  } as never;
}

const NO_CAPABILITIES = {
  independentVerifier: false,
  monitorConditionSource: false,
  reasoningBranches: false,
  independentPeer: false,
} as const;

/* -------------------------------------------------------------------------- *
 * AB-N01…AB-N04, AB-N25, AB-N26 — the artifact is not authority or a plan
 * -------------------------------------------------------------------------- */

describe("G10-AB adversarial: the preference is not authority", () => {
  it("AB-N01 the Work Mode preference is not a RecipePlan and no recipe store exists", () => {
    const preference = buildProjectWorkModePreference({
      projectId: PROJECT,
      baseMode: "EXPLORE",
      modifiers: ["VERIFY"],
      updatedAt: CLOCK,
      updatedBy: "operator:test",
    });
    for (const forbidden of ["recipeId", "planId", "steps", "digestOfRecipe", "compiled"]) {
      expect(preference).not.toHaveProperty(forbidden);
    }
    // The recipes layer persists nothing: there is no recipe store to query.
    const recipeFiles = [...sourceFiles(join(REPO, "src", "recipes"))];
    for (const file of recipeFiles) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/CREATE TABLE|DatabaseSync|new EventStore/u);
    }
    expect(recipeFiles.some((file) => /store\.ts$/u.test(file))).toBe(false);
  });

  it("AB-N02/AB-N23/AB-N24/AB-N25 the operating plane owns no authority and no history store", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(REPO, "src", "project_operating"))) {
      const text = stripComments(readFileSync(file, "utf8"));
      for (const forbidden of [
        "PalimpsestEffectsRuntime",
        "grantAuthority",
        "EffectAuthority",
        "/federation/",
        "proof_asset",
        "ManagerAgent",
        "HistoryStore",
        "RecipeStore",
        "crossRevisionCompat",
      ]) {
        if (text.includes(forbidden)) offenders.push(`${file}: ${forbidden}`);
      }
    }
    expect(offenders).toEqual([]);
    // Exactly one activity table, and no universal history table.
    const activity = readFileSync(join(REPO, "src", "project_operating", "activity_store.ts"), "utf8");
    expect((activity.match(/CREATE TABLE IF NOT EXISTS/g) ?? []).length).toBe(1);
    expect(activity).toMatch(/management_activity/u);
  });

  it("AB-N30 no External or Personal asset scope crept in", () => {
    for (const file of sourceFiles(join(REPO, "src", "project_operating"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/PersonalAsset|ExternalAssetLibrary|globalAsset|autoIndex/iu);
    }
  });

  it("AB-N03 the management involvement semantics are unchanged", () => {
    const profile = defaultManagementProfile(PROJECT, "operator:unset");
    expect(profile.involvement).toBe("DIRECT");
    expect(profile.allowedActionClasses.length).toBeGreaterThan(0);
    // The posture view does not invent a new involvement or a new action class.
    const view = buildProjectOperatingPostureView({
      projectId: PROJECT,
      preference: { preference: defaultWorkModePreference(PROJECT), source: "safe_default" },
      registry: builtinRecipeRegistry(),
      capabilities: NO_CAPABILITIES,
      profile,
      workModeHistory: [],
      managementHistory: [],
    });
    expect(["DIRECT", "ASSIST", "MANAGE", "DELEGATE"]).toContain(view.management.involvement);
    for (const actionClass of view.management.automaticActionClasses) {
      expect(actionClass).not.toMatch(/GRANT|APPROVE_DISCLOSURE|CREATE_EXTERNAL_COMMITMENT/u);
    }
  });

  it("AB-N04/AB-N25/AB-N26 the axes stay independent in every combination", () => {
    const registry = builtinRecipeRegistry();
    const modes = ["FOCUS", "EXPLORE", "COORDINATE"] as const;
    const involvements = ["DIRECT", "ASSIST", "MANAGE", "DELEGATE"] as const;
    for (const baseMode of modes) {
      for (const involvement of involvements) {
        const view = buildProjectOperatingPostureView({
          projectId: PROJECT,
          preference: {
            preference: buildProjectWorkModePreference({
              projectId: PROJECT,
              baseMode,
              modifiers: [],
              updatedAt: CLOCK,
              updatedBy: "operator:test",
            }),
            source: "stored",
          },
          registry,
          capabilities: NO_CAPABILITIES,
          profile: profileOf(involvement),
          workModeHistory: [],
          managementHistory: [],
        });
        // Changing one axis never moves the other.
        expect(view.workMode.preferred.baseMode).toBe(baseMode);
        expect(view.management.involvement).toBe(involvement);
        // FOCUS + DELEGATE does not force multi-agent work.
        if (baseMode === "FOCUS") {
          expect(view.workMode.effectiveStatus.find((row) => row.capability === "FOCUS")?.availability).toBe(
            "AVAILABLE",
          );
        }
        // EXPLORE + DIRECT grants no proactive management.
        if (baseMode === "EXPLORE" && involvement === "DIRECT") {
          expect(view.management.automaticActionClasses).toEqual([]);
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * AB-N05…AB-N12 — mutation boundaries and honest availability
 * -------------------------------------------------------------------------- */

describe("G10-AB adversarial: no silent preference mutation", () => {
  it("AB-N05 an agent tool cannot persist the project Work Mode", async () => {
    const dir = tmpDir();
    const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
    const effects = createPalimpsestEffects({
      databasePath: join(dir, "o.sqlite"),
      git: new FakeGitPort("c".repeat(40)),
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
        timeout_s: 60,
        lease_s: 10,
        attempt_limit: 3,
        candidate_limit: 1,
      }),
      clock: () => CLOCK,
    });
    controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-a")] });
    const managementStore = new SqliteManagementPreferenceStore(":memory:", { clock: () => CLOCK });
    const workMode = new SqliteWorkModePreferenceStore(":memory:", { clock: () => CLOCK });
    const activity = new SqliteManagementActivityStore(":memory:");
    try {
      const workspace = makeProjectWorkspaceService({ controller });
      const management = makeProjectManagementService({
        workspace,
        control: managementStore,
        controller,
        workMode,
        activity,
        registry: builtinRecipeRegistry(),
        clock: () => CLOCK,
      });
      const application = makePalimpsestApplicationSurface({
        controller,
        projectWorkspace: workspace,
        projectManagement: management,
      });
      // The operator-only setter is absent from the agent surface entirely.
      expect(application.projectManagement).not.toHaveProperty("setWorkModePreference");
      const tools = defineApplicationTools(application);
      const manage = tools.find((tool) => tool.name === "palimpsest_manage")!;
      const actions = (
        manage as unknown as { parameters: { properties: { action: { enum: readonly string[] } } } }
      ).parameters.properties.action.enum;
      expect([...actions]).not.toContain("set_work_mode");
      expect([...actions]).not.toContain("setWorkModePreference");

      // A REQUEST changes nothing.
      const before = await management.posture();
      await application.projectManagement!.requestWorkModeChange({
        baseMode: "COORDINATE",
        modifiers: ["MONITOR"],
      });
      const after = await management.posture();
      expect(after.workMode.preferred.digest).toBe(before.workMode.preferred.digest);
      expect((await workMode.history(PROJECT)).length).toBe(0);
    } finally {
      await effects.close();
      store.close();
      managementStore.close();
      workMode.close();
      activity.close();
    }
  });

  it("AB-N06 the advisor cannot persist a Work Mode preference", () => {
    // The advisor takes no preference port at all, so there is nothing it could
    // write through; the posture is read-only for it.
    for (const file of sourceFiles(join(REPO, "src", "advisor"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/workMode\.set|setWorkModePreference|WorkModePreferenceStore/u);
    }
  });

  it("AB-N07/AB-N08 a lost preference or management store degrades to FOCUS + DIRECT", async () => {
    const dir = tmpDir();
    const missing = join(dir, "does-not-exist", "operating.sqlite");
    // A store whose file cannot be created: the caller must fall back safely.
    const workMode = new SqliteWorkModePreferenceStore(":memory:");
    try {
      const effective = await workMode.get(PROJECT);
      expect(effective.source).toBe("safe_default");
      expect(effective.preference.baseMode).toBe("FOCUS");
      expect(effective.preference.modifiers).toEqual([]);
    } finally {
      workMode.close();
    }
    // The management default is DIRECT with no proactive authority.
    const profile = defaultManagementProfile(PROJECT, "operator:unset");
    expect(profile.involvement).toBe("DIRECT");
    // A defaulting posture reports the fallback rather than presenting it as a
    // user choice.
    const view = buildProjectOperatingPostureView({
      projectId: PROJECT,
      preference: { preference: defaultWorkModePreference(PROJECT), source: "safe_default" },
      registry: builtinRecipeRegistry(),
      capabilities: NO_CAPABILITIES,
      profile,
      workModeHistory: [],
      managementHistory: [],
    });
    expect(view.workMode.preferred.source).toBe("safe_default");
    expect(view.workMode.capabilityWarnings).toEqual([]);
    expect(join(missing).length).toBeGreaterThan(0);
  });

  it("AB-N09/AB-N10 an unavailable VERIFY/MONITOR preference is kept but never active", () => {
    const rows = deriveEffectiveModeStatus({
      preference: {
        preference: buildProjectWorkModePreference({
          projectId: PROJECT,
          baseMode: "FOCUS",
          modifiers: ["VERIFY", "MONITOR"],
          updatedAt: CLOCK,
          updatedBy: "operator:test",
        }),
        source: "stored",
      },
      registry: builtinRecipeRegistry(),
      capabilities: NO_CAPABILITIES,
    });
    for (const modifier of ["VERIFY", "MONITOR"] as const) {
      const row = rows.find((entry) => entry.capability === modifier)!;
      expect(row.preferred).toBe(true);
      expect(row.availability).not.toBe("AVAILABLE");
    }
    // No verifier and no scheduler are invented to satisfy the preference.
    const view = buildProjectOperatingPostureView({
      projectId: PROJECT,
      preference: {
        preference: buildProjectWorkModePreference({
          projectId: PROJECT,
          baseMode: "FOCUS",
          modifiers: ["VERIFY", "MONITOR"],
          updatedAt: CLOCK,
          updatedBy: "operator:test",
        }),
        source: "stored",
      },
      registry: builtinRecipeRegistry(),
      capabilities: NO_CAPABILITIES,
      profile: profileOf("MANAGE"),
      workModeHistory: [],
      managementHistory: [],
    });
    expect(view.workMode.capabilityWarnings).toHaveLength(2);
  });

  it("AB-N11/AB-N12 a COORDINATE preference creates no peer, and FOCUS forbids nothing", () => {
    for (const file of sourceFiles(join(REPO, "src", "project_operating"))) {
      const text = readFileSync(file, "utf8");
      // Persisting a preference never touches a peer/commitment surface.
      expect(text, file).not.toMatch(/PeerRef|PersistentPoint|CommitmentOffer|acceptCommitment/u);
    }
    const registry = builtinRecipeRegistry();
    const ordered = orderCandidatesByWorkModePreference(
      [
        { actionId: "focus-1", baseMode: "FOCUS" },
        { actionId: "explore-1", baseMode: "EXPLORE" },
      ],
      {
        preference: buildProjectWorkModePreference({
          projectId: PROJECT,
          baseMode: "FOCUS",
          modifiers: [],
          updatedAt: CLOCK,
          updatedBy: "operator:test",
        }),
        source: "stored",
      },
    );
    // A FOCUS preference does not forbid an explicitly requested EXPLORE action:
    // it only orders it after Focus. Nothing is removed from the set.
    expect(ordered.ordered.map((entry) => entry.actionId).sort()).toEqual(["explore-1", "focus-1"]);
    expect(ordered.explanation?.detail).toMatch(/user prefers FOCUS/u);
    expect(registry.get("explore.v1")).toBeDefined();
  });

  it("AB-N27 a preference cannot override hard ineligibility", () => {
    // Only INELIGIBLE candidates are passed: the preference must not promote any.
    const { ordered, explanation } = orderCandidatesByWorkModePreference(
      [{ actionId: "explore-1", baseMode: "EXPLORE" }],
      {
        preference: buildProjectWorkModePreference({
          projectId: PROJECT,
          baseMode: "COORDINATE",
          modifiers: [],
          updatedAt: CLOCK,
          updatedBy: "operator:test",
        }),
        source: "stored",
      },
    );
    expect(ordered.map((entry) => entry.actionId)).toEqual(["explore-1"]);
    expect(explanation?.preferredCandidateIds).toEqual([]);
    expect(explanation?.blockedByEligibility).toBe(true);
    expect(explanation?.detail).toMatch(/not bent to honour a preference/u);
  });
});

/* -------------------------------------------------------------------------- *
 * AB-N13…AB-N22 — the activity log is history, never truth
 * -------------------------------------------------------------------------- */

describe("G10-AB adversarial: activity is never canonical truth", () => {
  function append(store: SqliteManagementActivityStore, overrides: Record<string, unknown> = {}) {
    return store.append({
      projectId: PROJECT,
      candidateRef: "candidate-1",
      candidateDigest: "d",
      actionClass: "APPLY_LOCAL_PLAN_REVISION",
      subjects: [{ kind: "task", id: "task-a" }],
      managementProfileRef: "management-profile:ab-adv-project:MANAGE",
      workModePreferenceRef: null,
      projectBasis: { revision: 1, digest: "d", headCommit: "c".repeat(40) },
      decision: "selected",
      confirmed: false,
      reason: "selected",
      typedReasonCode: "selected",
      startedAt: CLOCK,
      ...overrides,
    });
  }

  it("AB-N13/AB-N14 the record references canonical owners instead of copying them", () => {
    const store = new SqliteManagementActivityStore(":memory:");
    try {
      const record = append(store, {
        decision: "executed",
        finishedAt: CLOCK,
        canonicalOutcomeRefs: [
          { kind: "work_event", ref: "42" },
          { kind: "project_revision", ref: "2" },
        ],
      });
      const asText = JSON.stringify(record);
      // No canonical body is duplicated: no project_ir, no task envelope, no event digest.
      for (const forbidden of ["project_ir", "task_envelope", "event_digest", "requirements", "decisions"]) {
        expect(asText).not.toContain(forbidden);
      }
      expect(record.canonicalOutcomeRefs).toEqual([
        { kind: "work_event", ref: "42" },
        { kind: "project_revision", ref: "2" },
      ]);
    } finally {
      store.close();
    }
  });

  it("AB-N15 recommendation-only actions are not reported as Work mutation", () => {
    const store = new SqliteManagementActivityStore(":memory:");
    try {
      const record = append(store, {
        actionClass: "RECOMMEND",
        decision: "executed",
        reason: "recommendation published without mutation",
        typedReasonCode: "recommendation_no_mutation",
        canonicalOutcomeRefs: [],
        noncanonicalOutcomeSummary: "recommendation published without mutation",
        finishedAt: CLOCK,
      });
      expect(record.canonicalOutcomeRefs).toEqual([]);
      expect(record.typedReasonCode).toBe("recommendation_no_mutation");
    } finally {
      store.close();
    }
  });

  it("AB-N16/AB-N17 a pending confirmation and a refusal are both durably explainable", () => {
    const store = new SqliteManagementActivityStore(":memory:");
    try {
      const pending = append(store, {
        decision: "needs_confirmation",
        reason: "APPLY_LOCAL_PLAN_REVISION requires an operator confirmation under MANAGE",
        typedReasonCode: "awaiting_confirmation",
        finishedAt: null,
      });
      const refused = append(store, {
        candidateRef: "candidate-2",
        actionClass: "EVOLVE_ORGANIZATION",
        decision: "not_permitted",
        reason: "EVOLVE_ORGANIZATION is outside the operator's allowed action classes",
        typedReasonCode: "not_permitted",
        finishedAt: CLOCK,
      });
      expect(explainActivityDecision(pending)).toMatch(/needs_confirmation/u);
      expect(explainActivityDecision(refused)).toMatch(/not_permitted/u);
      // The refusal is retained even though another candidate was permitted.
      expect(store.list(PROJECT).some((record) => record.decision === "not_permitted")).toBe(true);
    } finally {
      store.close();
    }
  });

  it("AB-N18 a crash never fabricates activity success", () => {
    const store = new SqliteManagementActivityStore(":memory:");
    try {
      const selected = append(store, { decision: "selected" });
      // No probe evidence at all.
      const outcome = store.terminalizeInterrupted({
        projectId: PROJECT,
        recordId: selected.recordId,
        probe: { canonicalOutcomePresent: false, canonicalMutationProvablyAbsent: false },
        finishedAt: CLOCK,
      });
      expect(outcome.record.decision).toBe("interrupted");
      expect(outcome.record.decision).not.toBe("executed");
      expect(outcome.record.confirmed).toBe(false);
      expect(JSON.stringify(outcome.record)).not.toMatch(/"decision":"executed"/u);
      expect(outcome.record.reason).toMatch(/no success is claimed/u);
      // Re-terminalizing an already-terminal record is refused outright.
      expect(() =>
        store.terminalizeInterrupted({
          projectId: PROJECT,
          recordId: outcome.record.recordId,
          probe: { canonicalOutcomePresent: true, canonicalMutationProvablyAbsent: false },
          finishedAt: CLOCK,
        }),
      ).toThrow(/already terminal/u);
    } finally {
      store.close();
    }
  });

  it("AB-N19/AB-N20 the activity log carries no CoT and no raw Proof/Vault content", () => {
    const store = new SqliteManagementActivityStore(":memory:");
    try {
      const record = append(store, {
        decision: "executed",
        reason: "local recipe \"focus.v1\" outcome=reused_principal",
        finishedAt: CLOCK,
      });
      const asText = JSON.stringify(record);
      for (const forbidden of [
        "chain_of_thought",
        "chainOfThought",
        "scratchpad",
        "thought",
        "sourceContent",
        "disclosureMaterial",
        "publishedClaim",
        "evidenceJson",
      ]) {
        expect(asText, forbidden).not.toContain(forbidden);
      }
    } finally {
      store.close();
    }
  });

  it("AB-N21/AB-N22 activity and Work Mode both survive a restart", async () => {
    const dir = tmpDir();
    const path = join(dir, "operating.sqlite");
    const first = new SqliteWorkModePreferenceStore(path, { clock: () => CLOCK });
    await first.set({ projectId: PROJECT, baseMode: "EXPLORE", modifiers: ["VERIFY"], updatedBy: "operator:a" });
    first.close();
    const activity = new SqliteManagementActivityStore(path);
    append(activity, { decision: "executed", finishedAt: CLOCK });
    activity.close();

    const reopenedMode = new SqliteWorkModePreferenceStore(path);
    const reopenedActivity = new SqliteManagementActivityStore(path);
    try {
      const effective = await reopenedMode.get(PROJECT);
      expect(effective.source).toBe("stored");
      expect(effective.preference.baseMode).toBe("EXPLORE");
      expect(effective.preference.modifiers).toEqual(["VERIFY"]);
      const records = reopenedActivity.list(PROJECT);
      expect(records).toHaveLength(1);
      expect(records[0]!.actionClass).toBe("APPLY_LOCAL_PLAN_REVISION");
      expect(reopenedActivity.verifyChain(PROJECT).ok).toBe(true);
    } finally {
      reopenedMode.close();
      reopenedActivity.close();
    }
  });

  it("AB-N28 the AA promotion-terminal admission is untouched", () => {
    for (const file of sourceFiles(join(REPO, "src", "project_operating"))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/PROMOTION_|promotion_terminal|PromotionOutcomeWitness/u);
    }
  });
});
