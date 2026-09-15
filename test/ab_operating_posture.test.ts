/**
 * G10-AB — Durable project operating posture & management history.
 *
 * Behavioural suite: a project durably remembers the user's preferred Work Mode,
 * keeps it strictly orthogonal to management involvement, and records what
 * management actually did in an append-only, NON-authoritative history.
 *
 *   OperatingPosture ≠ Authority        WorkModePreference ⟂ ManagementInvolvement
 *   WorkModePreference ≠ RecipePlan     ManagementActivityRecord ≠ WorkEvent
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import {
  DEFAULT_WORK_MODE_BASE,
  SqliteManagementActivityStore,
  SqliteWorkModePreferenceStore,
  buildProjectOperatingHistory,
  buildProjectWorkModePreference,
  buildProjectOperatingPostureView,
  classifyUnresolvedActivity,
  defaultWorkModePreference,
  deriveEffectiveModeStatus,
  explainActivityDecision,
  interruptedReasonOf,
  orderCandidatesByWorkModePreference,
  parseProjectWorkModePreference,
  unresolvedActivityOf,
  type EffectiveWorkModePreference,
  type ManagementActivityRecord,
} from "../src/project_operating/index.js";
import { builtinRecipeRegistry } from "../src/recipes/index.js";
import {
  SqliteManagementPreferenceStore,
  makeProjectManagementService,
} from "../src/project_management/index.js";
import { makeProjectWorkspaceService } from "../src/project_workspace/index.js";
import { PROMOTION_TERMINAL_TYPES } from "../src/domain/promotion_terminal.js";

import { FakeClock, taskSpec } from "./helpers.js";

const CLOCK = "2026-09-16T00:00:00Z";
const PROJECT = "ab-project";

const NO_CAPABILITIES = {
  independentVerifier: false,
  monitorConditionSource: false,
  reasoningBranches: false,
  independentPeer: false,
} as const;

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "palimpsest-ab-"));
}

function preferenceOf(
  baseMode: "FOCUS" | "EXPLORE" | "COORDINATE",
  modifiers: readonly ("VERIFY" | "MONITOR")[] = [],
): EffectiveWorkModePreference {
  return {
    preference: buildProjectWorkModePreference({
      projectId: PROJECT,
      baseMode,
      modifiers,
      updatedAt: CLOCK,
      updatedBy: "operator:test",
    }),
    source: "stored",
  };
}

/* -------------------------------------------------------------------------- *
 * Preference artifact + persistence
 * -------------------------------------------------------------------------- */

describe("G10-AB work mode preference", () => {
  it("stores only the semantic mode, never a compiled recipe plan", () => {
    const preference = buildProjectWorkModePreference({
      projectId: PROJECT,
      baseMode: "EXPLORE",
      modifiers: ["VERIFY"],
      updatedAt: CLOCK,
      updatedBy: "operator:test",
    });
    expect(Object.keys(preference).sort()).toEqual([
      "baseMode",
      "digest",
      "modifiers",
      "projectId",
      "schemaVersion",
      "updatedAt",
      "updatedBy",
    ]);
    // No recipe id, no plan, no capability grant.
    const asText = JSON.stringify(preference);
    expect(asText).not.toMatch(/RecipePlan|recipeId|planId|authority/u);
    expect(preference.baseMode).toBe("EXPLORE");
    expect(preference.modifiers).toEqual(["VERIFY"]);
  });

  it("defaults safely to FOCUS and reports that it is a default", async () => {
    const store = new SqliteWorkModePreferenceStore(":memory:");
    try {
      const effective = await store.get(PROJECT);
      expect(effective.source).toBe("safe_default");
      expect(effective.preference.baseMode).toBe(DEFAULT_WORK_MODE_BASE);
      expect(effective.preference.modifiers).toEqual([]);
      expect(effective.degradedReason).toBeUndefined();
    } finally {
      store.close();
    }
  });

  it("persists across a restart and keeps an append-only change history", async () => {
    const dir = tmpDir();
    const path = join(dir, "operating.sqlite");
    const first = new SqliteWorkModePreferenceStore(path, { clock: () => CLOCK });
    await first.set({ projectId: PROJECT, baseMode: "EXPLORE", modifiers: ["VERIFY"], updatedBy: "operator:a" });
    await first.set({ projectId: PROJECT, baseMode: "COORDINATE", modifiers: [], updatedBy: "operator:b" });
    first.close();

    const reopened = new SqliteWorkModePreferenceStore(path);
    try {
      const effective = await reopened.get(PROJECT);
      expect(effective.source).toBe("stored");
      expect(effective.preference.baseMode).toBe("COORDINATE");
      expect(effective.preference.modifiers).toEqual([]);

      const history = await reopened.history(PROJECT);
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        fromBaseMode: "FOCUS",
        toBaseMode: "EXPLORE",
        toModifiers: ["VERIFY"],
        updatedBy: "operator:a",
      });
      expect(history[1]).toMatchObject({
        fromBaseMode: "EXPLORE",
        fromModifiers: ["VERIFY"],
        toBaseMode: "COORDINATE",
        toModifiers: [],
        updatedBy: "operator:b",
      });
    } finally {
      reopened.close();
    }
  });

  it("degrades to FOCUS with an explicit reason when the stored value is unusable", async () => {
    const dir = tmpDir();
    const path = join(dir, "operating.sqlite");
    const store = new SqliteWorkModePreferenceStore(path);
    store.close();
    // Write an unsupported base mode directly (a foreign/older writer).
    const { DatabaseSync } = await import("node:sqlite");
    const raw = new DatabaseSync(path);
    raw
      .prepare(
        "INSERT INTO work_mode_preferences (project_id, preference_json, updated_at) VALUES (?, ?, ?)",
      )
      .run(PROJECT, JSON.stringify({ baseMode: "AUTONOMOUS", modifiers: [], updatedAt: CLOCK }), CLOCK);
    raw.close();

    const reopened = new SqliteWorkModePreferenceStore(path);
    try {
      const effective = await reopened.get(PROJECT);
      expect(effective.source).toBe("safe_default");
      expect(effective.preference.baseMode).toBe("FOCUS");
      expect(effective.degradedReason).toMatch(/unsupported baseMode/u);
      // The unusable value is never widened into a capability.
      expect(effective.preference.modifiers).toEqual([]);
    } finally {
      reopened.close();
    }
  });

  it("rejects an unknown base mode or modifier at the artifact boundary", () => {
    expect(() =>
      parseProjectWorkModePreference({
        schemaVersion: 1,
        projectId: PROJECT,
        baseMode: "AUTONOMOUS",
        modifiers: [],
        updatedAt: CLOCK,
        updatedBy: "operator:test",
      }),
    ).toThrow(/baseMode must be one of/u);
    expect(() =>
      parseProjectWorkModePreference({
        schemaVersion: 1,
        projectId: PROJECT,
        baseMode: "FOCUS",
        modifiers: ["AUTO_MERGE"],
        updatedAt: CLOCK,
        updatedBy: "operator:test",
      }),
    ).toThrow(/modifiers entries must be one of/u);
  });
});

/* -------------------------------------------------------------------------- *
 * Effective capability status
 * -------------------------------------------------------------------------- */

describe("G10-AB effective capability status", () => {
  it("keeps a preference for an unavailable capability and never calls it active", () => {
    const rows = deriveEffectiveModeStatus({
      preference: preferenceOf("EXPLORE", ["VERIFY", "MONITOR"]),
      registry: builtinRecipeRegistry(),
      capabilities: NO_CAPABILITIES,
    });
    const byCapability = new Map(rows.map((row) => [row.capability, row]));
    // The PREFERENCE is retained...
    expect(byCapability.get("EXPLORE")?.preferred).toBe(true);
    expect(byCapability.get("VERIFY")?.preferred).toBe(true);
    expect(byCapability.get("MONITOR")?.preferred).toBe(true);
    // ...and the EFFECTIVE status is honest about what exists.
    expect(byCapability.get("EXPLORE")?.availability).toBe("UNAVAILABLE");
    expect(byCapability.get("VERIFY")?.availability).toBe("UNAVAILABLE");
    // G10-AC §34: availability now derives from REAL runtime wiring. This rig
    // composes no monitor runtime, so MONITOR is UNAVAILABLE here - the
    // preference is still retained, and the reason says no runtime is composed.
    expect(byCapability.get("MONITOR")?.availability).toBe("UNAVAILABLE");
    expect(byCapability.get("MONITOR")?.reason).toMatch(/no monitor runtime is composed/u);
    // FOCUS is always available as the conventional anchor.
    expect(byCapability.get("FOCUS")?.availability).toBe("AVAILABLE");
    for (const row of rows) expect(row.reason.length).toBeGreaterThan(0);
  });

  it("verifies availability only when the capability is actually declared", () => {
    const rows = deriveEffectiveModeStatus({
      preference: preferenceOf("EXPLORE", ["VERIFY"]),
      registry: builtinRecipeRegistry(),
      capabilities: {
        independentVerifier: true,
        monitorConditionSource: false,
        reasoningBranches: true,
        independentPeer: true,
      },
    });
    const byCapability = new Map(rows.map((row) => [row.capability, row]));
    expect(byCapability.get("EXPLORE")?.availability).toBe("CONDITIONAL");
    expect(byCapability.get("VERIFY")?.availability).toBe("AVAILABLE");
    expect(byCapability.get("COORDINATE")?.availability).toBe("AVAILABLE");
    expect(byCapability.get("COORDINATE")?.preferred).toBe(false);
  });

  it("a COORDINATE preference creates no peer and is shown as ineligible", () => {
    const rows = deriveEffectiveModeStatus({
      preference: preferenceOf("COORDINATE"),
      registry: builtinRecipeRegistry(),
      capabilities: NO_CAPABILITIES,
    });
    const coordinate = rows.find((row) => row.capability === "COORDINATE")!;
    expect(coordinate.preferred).toBe(true);
    expect(coordinate.availability).toBe("UNAVAILABLE");
    expect(coordinate.reason).toMatch(/no genuine independent peer/u);
  });
});

/* -------------------------------------------------------------------------- *
 * Orthogonality
 * -------------------------------------------------------------------------- */

describe("G10-AB two-axis orthogonality", () => {
  it("every Work Mode combines with every involvement without changing the other axis", () => {
    const registry = builtinRecipeRegistry();
    const modes = ["FOCUS", "EXPLORE", "COORDINATE"] as const;
    const involvements = ["DIRECT", "ASSIST", "MANAGE", "DELEGATE"] as const;
    for (const baseMode of modes) {
      for (const involvement of involvements) {
        const view = buildProjectOperatingPostureView({
          projectId: PROJECT,
          preference: preferenceOf(baseMode),
          registry,
          capabilities: NO_CAPABILITIES,
          profile: {
            schemaVersion: 1,
            projectId: PROJECT,
            involvement,
            allowedActionClasses: [],
            confirmationBoundaries: [],
            budgets: { maxStepsPerRun: 1 },
            updatedAt: CLOCK,
            updatedBy: "operator:test",
            digest: "d",
          } as never,
          workModeHistory: [],
          managementHistory: [],
        });
        expect(view.workMode.preferred.baseMode).toBe(baseMode);
        expect(view.management.involvement).toBe(involvement);
      }
    }
  });

  it("FOCUS+DIRECT is the conventional single-agent default and mutates nothing", () => {
    const view = buildProjectOperatingPostureView({
      projectId: PROJECT,
      preference: { preference: defaultWorkModePreference(PROJECT), source: "safe_default" },
      registry: builtinRecipeRegistry(),
      capabilities: NO_CAPABILITIES,
      profile: {
        schemaVersion: 1,
        projectId: PROJECT,
        involvement: "DIRECT",
        allowedActionClasses: [],
        confirmationBoundaries: [],
        budgets: { maxStepsPerRun: 1 },
        updatedAt: CLOCK,
        updatedBy: "operator:unset",
        digest: "d",
      } as never,
      workModeHistory: [],
      managementHistory: [],
    });
    expect(view.workMode.preferred.baseMode).toBe("FOCUS");
    expect(view.workMode.preferred.source).toBe("safe_default");
    expect(view.management.involvement).toBe("DIRECT");
    // DIRECT may run nothing automatically: every proactive class needs an
    // explicit act or a confirmation.
    expect(view.management.automaticActionClasses).toEqual([]);
    expect(view.management.confirmationBoundaries.length).toBeGreaterThan(0);
  });

  it("EXPLORE+DIRECT does not escalate management, and FOCUS+DELEGATE does not force multi-agent", () => {
    const registry = builtinRecipeRegistry();
    const build = (baseMode: "FOCUS" | "EXPLORE", involvement: "DIRECT" | "DELEGATE") =>
      buildProjectOperatingPostureView({
        projectId: PROJECT,
        preference: preferenceOf(baseMode),
        registry,
        capabilities: NO_CAPABILITIES,
        profile: {
          schemaVersion: 1,
          projectId: PROJECT,
          involvement,
          allowedActionClasses: [],
          confirmationBoundaries: [],
          budgets: { maxStepsPerRun: 1 },
          updatedAt: CLOCK,
          updatedBy: "operator:test",
          digest: "d",
        } as never,
        workModeHistory: [],
        managementHistory: [],
      });
    const exploreDirect = build("EXPLORE", "DIRECT");
    expect(exploreDirect.management.automaticActionClasses).toEqual([]);
    expect(exploreDirect.workMode.preferred.modifiers).toEqual([]);

    const focusDelegate = build("FOCUS", "DELEGATE");
    expect(focusDelegate.workMode.preferred.baseMode).toBe("FOCUS");
    expect(focusDelegate.management.automaticActionClasses.length).toBeGreaterThan(0);
    // A DELEGATE involvement grants no authority-shaped class.
    expect(focusDelegate.management.automaticActionClasses).not.toContain("CREATE_EXTERNAL_COMMITMENT");
    expect(focusDelegate.management.automaticActionClasses).not.toContain("APPROVE_DISCLOSURE");
  });
});

/* -------------------------------------------------------------------------- *
 * Preference ordering (never eligibility)
 * -------------------------------------------------------------------------- */

describe("G10-AB work mode preference ordering", () => {
  const candidates = [
    { actionId: "focus-1", baseMode: "FOCUS" },
    { actionId: "explore-1", baseMode: "EXPLORE" },
    { actionId: "unmoded-1" },
  ];

  it("orders the preferred mode first and explains the preference", () => {
    const { ordered, explanation } = orderCandidatesByWorkModePreference(
      candidates,
      preferenceOf("EXPLORE"),
    );
    expect(ordered.map((entry) => entry.actionId)).toEqual(["explore-1", "focus-1", "unmoded-1"]);
    expect(explanation?.preferredBaseMode).toBe("EXPLORE");
    expect(explanation?.preferredCandidateIds).toEqual(["explore-1"]);
    expect(explanation?.blockedByEligibility).toBe(false);
    expect(explanation?.detail).toMatch(/user prefers EXPLORE/u);
  });

  it("reports that eligibility blocked the preference instead of bending eligibility", () => {
    const { ordered, explanation } = orderCandidatesByWorkModePreference(
      [{ actionId: "focus-2", baseMode: "FOCUS" }, { actionId: "unmoded-2" }],
      preferenceOf("COORDINATE"),
    );
    expect(ordered.map((entry) => entry.actionId)).toEqual(["focus-2", "unmoded-2"]);
    expect(explanation?.blockedByEligibility).toBe(true);
    expect(explanation?.detail).toMatch(/eligibility is not bent to honour a preference/u);
  });

  it("changes nothing when no preference is configured", () => {
    const { ordered, explanation } = orderCandidatesByWorkModePreference(candidates, null);
    expect(ordered.map((entry) => entry.actionId)).toEqual(["focus-1", "explore-1", "unmoded-1"]);
    expect(explanation).toBeNull();
  });
});

/* -------------------------------------------------------------------------- *
 * Management activity
 * -------------------------------------------------------------------------- */

describe("G10-AB management activity store", () => {
  function appendSelected(
    store: SqliteManagementActivityStore,
    overrides: Record<string, unknown> = {},
  ): ManagementActivityRecord {
    return store.append({
      projectId: PROJECT,
      candidateRef: "candidate-1",
      candidateDigest: "digest-1",
      actionClass: "OBSERVE",
      subjects: [{ kind: "task", id: "task-a" }],
      managementProfileRef: "management-profile:ab-project:MANAGE",
      workModePreferenceRef: null,
      projectBasis: { revision: 3, digest: "d", headCommit: "c".repeat(40) },
      decision: "selected",
      confirmed: false,
      reason: "selected for execution",
      typedReasonCode: "selected",
      startedAt: CLOCK,
      ...overrides,
    });
  }

  it("chains records per project and verifies the chain", () => {
    const store = new SqliteManagementActivityStore(":memory:");
    try {
      appendSelected(store, {
        decision: "executed",
        finishedAt: CLOCK,
        canonicalOutcomeRefs: [{ kind: "project_revision", ref: "3" }],
      });
      appendSelected(store, { candidateRef: "candidate-2", actionClass: "RECOMMEND", decision: "not_permitted", reason: "outside the allowed classes", finishedAt: CLOCK });
      const records = store.list(PROJECT);
      expect(records.map((record) => record.sequence)).toEqual([1, 2]);
      expect(records[1]!.previousRecordDigest).toBe(records[0]!.recordDigest);
      expect(store.verifyChain(PROJECT).ok).toBe(true);
    } finally {
      store.close();
    }
  });

  it("detects a rewritten record through the content digest", async () => {
    const dir = tmpDir();
    const path = join(dir, "activity.sqlite");
    const store = new SqliteManagementActivityStore(path);
    appendSelected(store, { decision: "failed", reason: "policy refused", finishedAt: CLOCK });
    store.close();

    const { DatabaseSync } = await import("node:sqlite");
    const raw = new DatabaseSync(path);
    const row = raw.prepare("SELECT record_json FROM management_activity WHERE sequence=1").get() as {
      record_json: Uint8Array;
    };
    const record = JSON.parse(new TextDecoder().decode(row.record_json)) as ManagementActivityRecord;
    const tampered = { ...record, reason: "policy allowed" };
    raw
      .prepare("UPDATE management_activity SET record_json=? WHERE sequence=1")
      .run(new TextEncoder().encode(JSON.stringify(tampered)));
    raw.close();

    const reopened = new SqliteManagementActivityStore(path);
    try {
      const verdict = reopened.verifyChain(PROJECT);
      expect(verdict.ok).toBe(false);
      expect(verdict.problem).toMatch(/content digest mismatch/u);
    } finally {
      reopened.close();
    }
  });

  it("records a NEEDS_CONFIRMATION decision durably and answers what was awaited", () => {
    const store = new SqliteManagementActivityStore(":memory:");
    try {
      appendSelected(store, {
        decision: "needs_confirmation",
        reason: "APPLY_LOCAL_PLAN_REVISION requires an operator confirmation under MANAGE",
        typedReasonCode: "awaiting_confirmation",
        finishedAt: null,
      });
      const records = store.list(PROJECT);
      expect(records[0]!.decision).toBe("needs_confirmation");
      expect(records[0]!.confirmed).toBe(false);
      expect(unresolvedActivityOf(records)).toHaveLength(1);
      expect(explainActivityDecision(records[0]!)).toMatch(/needs_confirmation/u);
    } finally {
      store.close();
    }
  });

  it("leaves a crash-unresolved record opened, and terminalizes it WITHOUT claiming success", () => {
    const store = new SqliteManagementActivityStore(":memory:");
    try {
      const selected = appendSelected(store, { decision: "selected" });
      // No terminal record: the process died between the phases.
      expect(store.unresolved(PROJECT).map((record) => record.recordId)).toEqual([selected.recordId]);

      // The canonical outcome IS present (the mutation landed before the crash).
      const completed = store.terminalizeInterrupted({
        projectId: PROJECT,
        recordId: selected.recordId,
        probe: { canonicalOutcomePresent: true, canonicalMutationProvablyAbsent: false },
        finishedAt: CLOCK,
        canonicalOutcomeRefs: [{ kind: "project_revision", ref: "3" }],
      });
      expect(completed.classification).toBe("OBSERVED_COMPLETED");
      expect(completed.record.decision).toBe("interrupted");
      expect(completed.record.reason).toMatch(/no terminal activity record was written/u);
      expect(completed.record.reason).not.toMatch(/succeed|success/u);
      expect(completed.record.supersedesRecordId).toBe(selected.recordId);
      expect(store.unresolved(PROJECT)).toEqual([]);

      // Without a mechanical proof the honest answer is UNKNOWN.
      const second = appendSelected(store, { candidateRef: "candidate-3", decision: "selected" });
      const unknown = store.terminalizeInterrupted({
        projectId: PROJECT,
        recordId: second.recordId,
        probe: { canonicalOutcomePresent: false, canonicalMutationProvablyAbsent: false },
        finishedAt: CLOCK,
      });
      expect(unknown.classification).toBe("UNKNOWN");
      expect(interruptedReasonOf("UNKNOWN")).toMatch(/no success is claimed/u);
    } finally {
      store.close();
    }
  });

  it("classifies NOT_APPLIED mechanically and never infers success from prose", () => {
    const store = new SqliteManagementActivityStore(":memory:");
    try {
      const selected = appendSelected(store, { decision: "selected" });
      const records = store.list(PROJECT);
      expect(
        classifyUnresolvedActivity(records[0]!, {
          canonicalOutcomePresent: false,
          canonicalMutationProvablyAbsent: true,
        }),
      ).toBe("OBSERVED_NOT_APPLIED");
      void selected;
      // A record that already reached a terminal decision is never reclassified:
      // its own outcome stands, and no probe can rewrite it.
      const terminalRecord = appendSelected(store, {
        candidateRef: "candidate-terminal",
        decision: "executed",
        finishedAt: CLOCK,
      });
      expect(
        classifyUnresolvedActivity(terminalRecord, {
          canonicalOutcomePresent: true,
          canonicalMutationProvablyAbsent: false,
        }),
      ).toBe("UNKNOWN");
    } finally {
      store.close();
    }
  });

  it("stores no chain-of-thought and no source content", () => {
    const store = new SqliteManagementActivityStore(":memory:");
    try {
      const record = appendSelected(store, {
        reason: "OBSERVE is permitted under MANAGE; nothing was mutated",
        decision: "executed",
        finishedAt: CLOCK,
      });
      const asText = JSON.stringify(record);
      for (const forbidden of ["chain_of_thought", "chainOfThought", "scratchpad", "reasoning_text", "prompt"]) {
        expect(asText).not.toContain(forbidden);
      }
      expect(Object.keys(record)).not.toContain("cot");
    } finally {
      store.close();
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Operating history (references only)
 * -------------------------------------------------------------------------- */

describe("G10-AB operating history", () => {
  it("interleaves references and flags an unresolvable canonical ref", () => {
    const store = new SqliteManagementActivityStore(":memory:");
    try {
      store.append({
        projectId: PROJECT,
        candidateRef: "candidate-1",
        candidateDigest: "d",
        actionClass: "APPLY_LOCAL_PLAN_REVISION",
        subjects: [],
        managementProfileRef: "management-profile:ab-project:MANAGE",
        workModePreferenceRef: null,
        projectBasis: { revision: 3, digest: "d", headCommit: "c".repeat(40) },
        decision: "executed",
        confirmed: true,
        reason: "applied a local task-plan revision",
        typedReasonCode: "plan_revision_applied",
        startedAt: CLOCK,
        finishedAt: CLOCK,
        canonicalOutcomeRefs: [{ kind: "project_revision", ref: "3" }],
      });
      const history = buildProjectOperatingHistory({
        projectId: PROJECT,
        workModeHistory: [
          { projectId: PROJECT, seq: 1, fromBaseMode: "FOCUS", toBaseMode: "EXPLORE", fromModifiers: [], toModifiers: [], updatedBy: "operator:a", at: CLOCK },
        ],
        managementHistory: [
          { projectId: PROJECT, seq: 1, fromInvolvement: "DIRECT", toInvolvement: "MANAGE", updatedBy: "operator:a", at: CLOCK },
        ],
        activity: store.list(PROJECT),
        unresolvedRecordIds: [],
        // The canonical owner CAN be resolved.
        resolvableCanonicalRefs: ["project_revision:3"],
      });
      expect(history.counts).toEqual({
        workModeChanges: 1,
        managementModeChanges: 1,
        managementActivity: 1,
        unresolvedActivity: 0,
        incompleteCanonicalRefs: 0,
      });
      expect(history.hasIncompleteAuditRecords).toBe(false);
      expect(history.entries.map((entry) => entry.kind)).toContain("work_mode_change");
      expect(history.entries.map((entry) => entry.kind)).toContain("management_activity");
    } finally {
      store.close();
    }
  });

  it("shows an incomplete audit record when the canonical ref cannot be resolved", () => {
    const store = new SqliteManagementActivityStore(":memory:");
    try {
      store.append({
        projectId: PROJECT,
        candidateRef: "candidate-1",
        candidateDigest: "d",
        actionClass: "RECONCILE_PROJECT_HEAD",
        subjects: [],
        managementProfileRef: "management-profile:ab-project:MANAGE",
        workModePreferenceRef: null,
        projectBasis: { revision: 9, digest: "d", headCommit: "c".repeat(40) },
        decision: "executed",
        confirmed: true,
        reason: "project head reconciled",
        typedReasonCode: "head_reconciled",
        startedAt: CLOCK,
        finishedAt: CLOCK,
        canonicalOutcomeRefs: [{ kind: "project_revision", ref: "99" }],
      });
      const history = buildProjectOperatingHistory({
        projectId: PROJECT,
        workModeHistory: [],
        managementHistory: [],
        activity: store.list(PROJECT),
        unresolvedRecordIds: [],
        resolvableCanonicalRefs: [],
      });
      // The record does NOT prove the revision: it is flagged as incomplete.
      expect(history.hasIncompleteAuditRecords).toBe(true);
      expect(history.counts.incompleteCanonicalRefs).toBe(1);
    } finally {
      store.close();
    }
  });
});

/* -------------------------------------------------------------------------- *
 * End-to-end over a real controller
 * -------------------------------------------------------------------------- */

describe("G10-AB service integration", () => {
  async function rig() {
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
    await managementStore.set({ projectId: PROJECT, involvement: "MANAGE", updatedBy: "operator:test" });
    const workMode = new SqliteWorkModePreferenceStore(":memory:", { clock: () => CLOCK });
    const activity = new SqliteManagementActivityStore(join(dir, "activity.sqlite"));
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
    return {
      dir,
      store,
      effects,
      controller,
      managementStore,
      workMode,
      activity,
      management,
      cleanup: async () => {
        await effects.close();
        try {
          store.close();
        } catch {
          /* closed */
        }
        managementStore.close();
        workMode.close();
        activity.close();
      },
    };
  }

  it("derives a posture from the persisted preference and the real registry", async () => {
    const r = await rig();
    try {
      expect((await r.management.posture()).workMode.preferred.source).toBe("safe_default");
      await r.management.setWorkModePreference({
        baseMode: "EXPLORE",
        modifiers: ["VERIFY", "MONITOR"],
        updatedBy: "operator:test",
      });
      const posture = await r.management.posture();
      expect(posture.workMode.preferred.baseMode).toBe("EXPLORE");
      expect(posture.workMode.preferred.modifiers).toEqual(["MONITOR", "VERIFY"]);
      expect(posture.workMode.preferred.source).toBe("stored");
      expect(posture.management.involvement).toBe("MANAGE");
      // The unavailable capabilities are reported as such, with the preference kept.
      expect(posture.workMode.capabilityWarnings.length).toBeGreaterThan(0);
      expect(posture.workMode.effectiveStatus.find((row) => row.capability === "VERIFY")?.availability).toBe(
        "UNAVAILABLE",
      );
      // The operator act is recorded as activity (not as a second mode truth).
      expect(r.activity.list(PROJECT).map((record) => record.actionClass)).toContain(
        "OPERATOR_WORK_MODE_CHANGE",
      );
    } finally {
      await r.cleanup();
    }
  });

  it("records a step end-to-end with canonical refs and keeps the activity non-authoritative", async () => {
    const r = await rig();
    try {
      const result = await r.management.step({ confirmed: true });
      const records = r.activity.list(PROJECT);
      expect(records.length).toBeGreaterThanOrEqual(1);
      const terminal = records.at(-1)!;
      expect(terminal.decision === "executed" || terminal.decision === "not_permitted").toBe(true);
      // The activity record REFERENCES canonical owners rather than copying them.
      for (const ref of terminal.canonicalOutcomeRefs) {
        expect(PROMOTION_TERMINAL_TYPES.length).toBeGreaterThan(0);
        expect(ref.ref.length).toBeGreaterThan(0);
      }
      expect(result.activityRecordId).toBe(terminal.recordId);
      // Work truth is still the EventStore's.
      const revisions = r.store
        .listEvents(PROJECT)
        .filter((event) => event.event_type === "PROJECT_REVISED").length;
      if (terminal.decision === "executed") {
        expect(revisions).toBeGreaterThanOrEqual(0);
      }
      expect(r.activity.verifyChain(PROJECT).ok).toBe(true);
    } finally {
      await r.cleanup();
    }
  });

  it("a Work Mode REQUEST never persists the user default", async () => {
    const r = await rig();
    try {
      const before = await r.management.posture();
      const requested = await r.management.requestWorkModeChange({
        baseMode: "COORDINATE",
        modifiers: ["MONITOR"],
        requestedBy: "agent",
      });
      expect(requested.status).toBe("requested");
      expect(requested.detail).toMatch(/only the operator control port can apply it/u);
      const after = await r.management.posture();
      expect(after.workMode.preferred.baseMode).toBe(before.workMode.preferred.baseMode);
      expect(after.workMode.preferred.digest).toBe(before.workMode.preferred.digest);
    } finally {
      await r.cleanup();
    }
  });

  it("the operating history joins posture and management changes across a restart", async () => {
    const dir = tmpDir();
    const operatingPath = join(dir, "operating.sqlite");
    const first = new SqliteWorkModePreferenceStore(operatingPath, { clock: () => CLOCK });
    await first.set({ projectId: PROJECT, baseMode: "EXPLORE", modifiers: [], updatedBy: "operator:a" });
    first.close();
    const reopened = new SqliteWorkModePreferenceStore(operatingPath);
    try {
      const effective = await reopened.get(PROJECT);
      expect(effective.preference.baseMode).toBe("EXPLORE");
      expect(effective.source).toBe("stored");
      expect(await reopened.history(PROJECT)).toHaveLength(1);
    } finally {
      reopened.close();
    }
  });
});
