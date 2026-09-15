/**
 * G10-AC-R closure — PRODUCT closure: the Monitor card's two readings, the honest
 * failed start, the project-scoped Campaign wake references in the operating
 * history, the read-only preview, and the absence of any HTTP force-tick
 * (ACR-N15 … ACR-N20 + ACR-N23).
 *
 * Everything here exercises the REAL services: a real `SqliteCampaignStore`, the
 * real Campaign / Prospective / Production services, a real Work Mode preference
 * store, the real management service over a real `ProjectController`, the real
 * monitor driver and the real `installPalimpsest` composition with the typed HTTP
 * dispatcher. Only host adapters (tick sources, wake activation ports) and clocks
 * are stubbed.
 *
 * HONEST (ACR-N15): this suite runs in vitest's `node` environment
 * (`vitest.config.ts` sets `environment: "node"`; there is no jsdom setup and no
 * React testing library), so the READINGS are proven at the DATA layer — the real
 * derived posture, the real driver `status()` and the real HTTP read models. The
 * RENDERING of those two readings as two separate blocks, and the visible
 * "never ticks" preview statement, are covered black-box by
 * `e2e/project-workspace.spec.ts` (E2E-PROJECT-03).
 */

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { handleApplicationRequest } from "../src/application/http.js";
import {
  SqliteCampaignStore,
  makeCampaignProductionService,
  makeCampaignService,
  makeInterventionService,
  makeProspectiveService,
  materializeCampaignProjectRef,
} from "../src/campaign/index.js";
import type { CampaignProductionService, CampaignService, InterventionService, ProspectiveService } from "../src/campaign/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import { FakeGitPort, createPalimpsestEffects } from "../src/effects/index.js";
import { installPalimpsest } from "../src/install.js";
import {
  linkedCampaignMonitorScope,
  makeCampaignMonitorDriver,
  manualMonitorTickSource,
  monitorAvailabilityOf,
  nullCampaignWakeActivation,
  recordingCampaignWakeActivation,
} from "../src/monitor/index.js";
import type { CampaignMonitorDriver, MonitorTickSourcePort } from "../src/monitor/index.js";
import {
  campaignChainPositionOf,
  linkedCampaignWakeEventSource,
} from "../src/project_operating/history.js";
import {
  SqliteManagementActivityStore,
  SqliteWorkModePreferenceStore,
  buildProjectOperatingPostureView,
  deriveEffectiveModeStatus,
  withMonitorRuntimeCapability,
} from "../src/project_operating/index.js";
import { makeProjectManagementService, SqliteManagementPreferenceStore } from "../src/project_management/index.js";
import { SqliteProjectAssetAssociationStore, makeProjectWorkspaceService } from "../src/project_workspace/index.js";
import { builtinRecipeRegistry } from "../src/recipes/index.js";
import { EventStore } from "../src/state/index.js";
import { ProjectController } from "../src/tools/index.js";

import { MockHost, taskSpec } from "./helpers.js";

const PROJECT = "acrp-project";
const INSTITUTION = "acrp-institution";
const CAMPAIGN = "acrp-campaign";
const OTHER_CAMPAIGN = "acrp-other-campaign";
const FIXED_NOW = "2026-09-16T00:00:00Z";
/** Strictly in the past, so a `not_before` watch is satisfied. */
const PAST = "2026-01-01T00:00:00Z";

const PROJECT_REF = materializeCampaignProjectRef({
  projectId: PROJECT,
  revision: 0,
  digest: "d".repeat(64),
});

/* -------------------------------------------------------------------------- *
 * A component rig: real Campaign services over a temp store, plus a real
 * management service over a real controller.
 * -------------------------------------------------------------------------- */

interface ComponentRig {
  readonly dir: string;
  readonly store: SqliteCampaignStore;
  readonly workMode: SqliteWorkModePreferenceStore;
  readonly campaign: CampaignService;
  readonly prospective: ProspectiveService;
  readonly production: CampaignProductionService;
  readonly intervention: InterventionService;
  readonly controller: ProjectController;
  readonly managementStore: SqliteManagementPreferenceStore;
  readonly activity: SqliteManagementActivityStore;
  close(): Promise<void>;
}

const openRigs: ComponentRig[] = [];
afterEach(async () => {
  for (const rig of openRigs.splice(0)) await rig.close();
});

async function makeComponentRig(): Promise<ComponentRig> {
  const dir = mkdtempSync(join(tmpdir(), "pal-acrp-"));
  const store = new SqliteCampaignStore(join(dir, "campaign.sqlite"));
  const workMode = new SqliteWorkModePreferenceStore(join(dir, "operating.sqlite"), { clock: () => FIXED_NOW });
  const institutions = {
    inspectEpoch: async (institutionId: string) => ({
      state: "known" as const,
      value: { institutionId, epoch: 1, digest: "e".repeat(64) },
    }),
  };
  const work = { inspectProject: async () => ({ state: "known" as const, value: "running" as const }) };
  let commitment = 0;
  let watch = 0;
  let wake = 0;
  let observation = 0;
  let revision = 0;
  let interventionId = 0;
  const campaign = makeCampaignService({ store, allocateCommitmentId: () => `cc-${++commitment}`, institutions });
  const prospective = makeProspectiveService({
    store,
    allocateWatchId: () => `w-${++watch}`,
    clock: () => FIXED_NOW,
  });
  const production = makeCampaignProductionService({
    store,
    institutions,
    work,
    allocateWakeCycleId: () => `wc-${++wake}`,
    allocateWatchId: () => `w-${++watch}`,
    allocateObservationId: () => `obs-${++observation}`,
    allocateRevisionId: () => `br-${++revision}`,
  });
  const intervention = makeInterventionService({ store, allocateInterventionId: () => `iv-${++interventionId}` });

  // The REAL management service over a REAL controller and EventStore.
  const controllerStore = new EventStore(join(dir, "work.sqlite"), { clock: () => FIXED_NOW });
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "ops.sqlite"),
    git: new FakeGitPort("c".repeat(40)),
  });
  const controller = new ProjectController({
    store: controllerStore,
    effects,
    projectId: PROJECT,
    policy: new TaskPolicy({
      policy_id: "acrp-default",
      read_paths: ["src"],
      allowed_commands: [],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => FIXED_NOW,
  });
  controller.start({ projectId: PROJECT, goal: "acrp", tasks: [taskSpec("task-a")] });
  const managementStore = new SqliteManagementPreferenceStore(join(dir, "management.sqlite"), {
    clock: () => FIXED_NOW,
  });
  await managementStore.set({ projectId: PROJECT, involvement: "ASSIST", updatedBy: "operator:test" });
  const activity = new SqliteManagementActivityStore(join(dir, "activity.sqlite"));

  const rig: ComponentRig = {
    dir,
    store,
    workMode,
    campaign,
    prospective,
    production,
    intervention,
    controller,
    managementStore,
    activity,
    async close() {
      await effects.close();
      try {
        controllerStore.close();
      } catch {
        /* already closed */
      }
      managementStore.close();
      activity.close();
      try {
        workMode.close();
      } catch {
        /* already closed */
      }
      try {
        store.close();
      } catch {
        /* already closed */
      }
    },
  };
  openRigs.push(rig);
  return rig;
}

/** A project-linked DORMANT Campaign with a SATISFIED `not_before` watch. */
async function seedDormant(
  rig: ComponentRig,
  campaignId = CAMPAIGN,
  link = true,
): Promise<void> {
  await rig.campaign.createCampaign({ campaignId, institutionId: INSTITUTION, statement: "root" });
  if (link) {
    await rig.intervention.register({
      campaignId,
      project: PROJECT_REF,
      purpose: "test",
      targetHypothesisIds: [],
    });
  }
  const dormant = await rig.production.admitWait({
    campaignId,
    reason: "nothing useful yet",
    watches: [{ condition: { kind: "not_before", at: PAST }, reason: "review" }],
  });
  if (dormant.status !== "dormant") throw new Error(`expected DORMANT, got ${dormant.status}`);
}

async function setMonitorPreference(rig: ComponentRig, modifiers: readonly ("MONITOR" | "VERIFY")[]): Promise<void> {
  await rig.workMode.set({ projectId: PROJECT, baseMode: "FOCUS", modifiers: [...modifiers], updatedBy: "operator:test" });
}

function driverOf(
  rig: ComponentRig,
  options: {
    readonly tickSource?: MonitorTickSourcePort;
    readonly activation?: ReturnType<typeof recordingCampaignWakeActivation>;
  } = {},
): CampaignMonitorDriver {
  return makeCampaignMonitorDriver({
    projectId: PROJECT,
    workMode: rig.workMode,
    scope: linkedCampaignMonitorScope({ store: rig.store }),
    prospective: rig.prospective,
    production: rig.production,
    history: { readEvents: (campaignId) => rig.store.replay(campaignId) },
    activation: options.activation ?? nullCampaignWakeActivation(),
    clock: () => FIXED_NOW,
    ...(options.tickSource === undefined ? {} : { tickSource: options.tickSource }),
  });
}

/** A tick source whose `start()` fails; used for the FAILED runtime branch. */
function failingTickSource(message: string): MonitorTickSourcePort {
  return Object.freeze({
    sourceId: "test:failing-start",
    async start(): Promise<void> {
      throw new Error(message);
    },
    async stop(): Promise<void> {},
    status() {
      return Object.freeze({ running: false, kind: "manual" as const, fires: 0 });
    },
  });
}

/** The real management service, with the real linked Campaign wake-event seam. */
function managementOf(rig: ComponentRig) {
  const workspace = makeProjectWorkspaceService({ controller: rig.controller });
  const source = linkedCampaignWakeEventSource({ store: rig.store });
  return makeProjectManagementService({
    workspace,
    control: rig.managementStore,
    controller: rig.controller,
    workMode: rig.workMode,
    activity: rig.activity,
    registry: builtinRecipeRegistry(),
    clock: () => FIXED_NOW,
    campaignWakeEvents: () => source.projectCampaignWakeEvents(PROJECT),
  });
}

/* -------------------------------------------------------------------------- *
 * An install rig (the real `installPalimpsest` composition + the typed routes).
 * -------------------------------------------------------------------------- */

interface InstallRig {
  readonly dir: string;
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly campaignStore: SqliteCampaignStore;
  readonly workMode: SqliteWorkModePreferenceStore;
  readonly activation: ReturnType<typeof recordingCampaignWakeActivation>;
  close(): Promise<void>;
}

const openInstalls: InstallRig[] = [];
afterEach(async () => {
  for (const rig of openInstalls.splice(0)) await rig.close();
});

async function makeInstallRig(): Promise<InstallRig> {
  const dir = mkdtempSync(join(tmpdir(), "pal-acrp-inst-"));
  const campaignStore = new SqliteCampaignStore(join(dir, "campaign.sqlite"));
  const workMode = new SqliteWorkModePreferenceStore(join(dir, "operating.sqlite"), { clock: () => FIXED_NOW });
  await workMode.set({ projectId: PROJECT, baseMode: "FOCUS", modifiers: ["MONITOR"], updatedBy: "operator:test" });

  const institutions = {
    inspectEpoch: async (institutionId: string) => ({
      state: "known" as const,
      value: { institutionId, epoch: 1, digest: "e".repeat(64) },
    }),
  };
  let commitment = 0;
  let watch = 0;
  let wake = 0;
  let observation = 0;
  let revision = 0;
  const campaign = makeCampaignService({ store: campaignStore, allocateCommitmentId: () => `cc-${++commitment}`, institutions });
  const production = makeCampaignProductionService({
    store: campaignStore,
    institutions,
    work: { inspectProject: async () => ({ state: "known" as const, value: "running" as const }) },
    allocateWakeCycleId: () => `wc-${++wake}`,
    allocateWatchId: () => `w-${++watch}`,
    allocateObservationId: () => `obs-${++observation}`,
    allocateRevisionId: () => `br-${++revision}`,
  });
  const intervention = makeInterventionService({ store: campaignStore, allocateInterventionId: () => "iv-1" });
  await campaign.createCampaign({ campaignId: CAMPAIGN, institutionId: INSTITUTION, statement: "root" });
  await intervention.register({ campaignId: CAMPAIGN, project: PROJECT_REF, purpose: "test", targetHypothesisIds: [] });
  const dormant = await production.admitWait({
    campaignId: CAMPAIGN,
    reason: "nothing useful yet",
    watches: [{ condition: { kind: "not_before", at: PAST }, reason: "review" }],
  });
  if (dormant.status !== "dormant") throw new Error(`expected DORMANT, got ${dormant.status}`);

  const activation = recordingCampaignWakeActivation();
  const installed = installPalimpsest(new MockHost() as never, {
    projectId: PROJECT,
    databasePath: join(dir, "work.sqlite"),
    ordariumDatabasePath: join(dir, "ops.sqlite"),
    git: new FakeGitPort("c".repeat(40)),
    workModePreferenceStore: workMode,
    projectAssociationStore: new SqliteProjectAssetAssociationStore(join(dir, "assoc.sqlite")),
    campaignStore,
    campaignWorkPort: { inspectProject: async () => ({ state: "known" as const, value: "running" as const }) },
    campaignInstitutionEpochPort: institutions,
    campaignMonitorScope: linkedCampaignMonitorScope({ store: campaignStore }),
    campaignMonitorTickSource: manualMonitorTickSource(),
    campaignMonitorActivation: activation,
    campaignClock: () => FIXED_NOW,
    campaignMonitorPolicy: { redeliveryAfterMs: 300_000 },
  });

  const rig: InstallRig = {
    dir,
    installed,
    campaignStore,
    workMode,
    activation,
    async close() {
      await installed.dispose();
      try {
        workMode.close();
      } catch {
        /* already closed */
      }
      try {
        campaignStore.close();
      } catch {
        /* already closed */
      }
    },
  };
  openInstalls.push(rig);
  return rig;
}

async function http(
  installed: ReturnType<typeof installPalimpsest>,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const url = new URL(path, "http://localhost");
  const result = await handleApplicationRequest({
    application: installed.application,
    method,
    pathname: url.pathname,
    query: url.searchParams,
    body,
  });
  if (result === undefined) throw new Error(`no application route for ${method} ${path}`);
  return result;
}

/* ========================================================================== *
 * ACR-N15 — the preference and the runtime are two INDEPENDENT readings
 * ========================================================================== */

describe("G10-AC-R ACR-N15 preferred posture vs runtime state", () => {
  it("ACR-N15 a preferred MONITOR with no runtime is UNAVAILABLE, and the two readings move independently", async () => {
    const rig = await makeComponentRig();
    await seedDormant(rig);
    await setMonitorPreference(rig, ["MONITOR"]);

    // (1) The PREFERENCE, read through the real derived posture with NO runtime
    // capability declared at all.
    const basePosture = buildProjectOperatingPostureView({
      projectId: PROJECT,
      preference: await rig.workMode.get(PROJECT),
      registry: builtinRecipeRegistry(),
      capabilities: {
        independentVerifier: false,
        monitorConditionSource: false,
        reasoningBranches: false,
        independentPeer: false,
      },
      profile: await rig.managementStore.get(PROJECT),
      workModeHistory: await rig.workMode.history(PROJECT),
      managementHistory: (await rig.managementStore.history?.(PROJECT)) ?? [],
    });
    const baseRow = basePosture.workMode.effectiveStatus.find((row) => row.capability === "MONITOR");
    expect(baseRow?.preferred).toBe(true);
    expect(baseRow?.availability).toBe("UNAVAILABLE");
    expect(basePosture.workMode.capabilityWarnings.join(" ")).toMatch(/MONITOR is preferred but unavailable/);

    // (2) The RUNTIME, read from the real driver. Same preference, and the driver
    // reports its own independent state: composed but not configured at all.
    const driver = driverOf(rig);
    const status = await driver.status();
    expect(status.monitorPreferenceEnabled).toBe(true);
    expect(status.preferenceSource).toBe("stored");
    expect(status.capability.startState).toBe("NOT_CONFIGURED");
    expect(status.availability.availability).toBe("UNAVAILABLE");
    expect(status.availability.reason).toMatch(/scope only/);

    // (3) The SAME, fully wired and started runtime, with the preference turned
    // OFF: the runtime is RUNNING/AVAILABLE while the project no longer prefers
    // MONITOR. Neither reading is derived from the other.
    await setMonitorPreference(rig, []);
    const wired = driverOf(rig, {
      tickSource: manualMonitorTickSource(),
      activation: recordingCampaignWakeActivation(),
    });
    await wired.ready();
    const wiredStatus = await wired.status();
    expect(wiredStatus.monitorPreferenceEnabled).toBe(false);
    expect(wiredStatus.capability.startState).toBe("RUNNING");
    expect(wiredStatus.capability.started).toBe(true);
    expect(wiredStatus.availability.availability).toBe("AVAILABLE");
    expect(wiredStatus.disabledReason).toMatch(/does not include MONITOR/);
    await wired.dispose();

    // (4) And the SHARED availability table — the one both the driver and the
    // posture import — answers the same way for the same structural capability.
    expect(monitorAvailabilityOf(undefined).availability).toBe("PREVIEW_ONLY");
    expect(
      monitorAvailabilityOf({
        tickSourceConfigured: false,
        activationConfigured: false,
        startState: "NOT_CONFIGURED",
        startError: null,
      }).availability,
    ).toBe("UNAVAILABLE");
    await driver.dispose();
  });

  it("ACR-N15b HONEST: the two readings are rendered as separate blocks by the Playwright spec, not here", () => {
    // HONEST: vitest runs in `environment: "node"` (see vitest.config.ts) with no
    // jsdom and no React testing library, so this suite cannot mount
    // `ProjectWorkspaceView`. The DATA proven above is exactly what the Monitor
    // tab renders into `monitor-preference` and `monitor-runtime`; the RENDERING
    // (and the absence of any force-tick control) is asserted black-box in
    // `e2e/project-workspace.spec.ts` test E2E-PROJECT-03.
    const vitestConfig = readFileSync(fileURLToPath(new URL("../vitest.config.ts", import.meta.url)), "utf8");
    expect(vitestConfig).toContain('environment: "node"');
    const e2eSpec = readFileSync(fileURLToPath(new URL("../e2e/project-workspace.spec.ts", import.meta.url)), "utf8");
    expect(e2eSpec).toContain("monitor-preference");
    expect(e2eSpec).toContain("monitor-runtime");
    expect(e2eSpec).toContain("monitor-preview-never-ticks");
  });
});

/* ========================================================================== *
 * ACR-N16 — a FAILED startup is shown honestly
 * ========================================================================== */

describe("G10-AC-R ACR-N16 failed startup", () => {
  it("ACR-N16 a throwing tick source yields FAILED with the error text and no AVAILABLE posture", async () => {
    const rig = await makeComponentRig();
    await seedDormant(rig);
    await setMonitorPreference(rig, ["MONITOR"]);
    const message = "the interval timer could not be created";
    const driver = driverOf(rig, {
      tickSource: failingTickSource(message),
      activation: recordingCampaignWakeActivation(),
    });

    const outcome = await driver.ready();
    expect(outcome.status).toBe("failed");
    expect(outcome.error).toBe(message);

    const status = await driver.status();
    expect(status.capability.startState).toBe("FAILED");
    expect(status.capability.started).toBe(false);
    expect(status.capability.startError).toBe(message);
    expect(status.availability.availability).toBe("UNAVAILABLE");
    expect(status.availability.reason).toContain(message);
    expect(status.driverStarted).toBe(false);

    // The derived posture cannot present it as active either.
    const preference = await rig.workMode.get(PROJECT);
    const rows = deriveEffectiveModeStatus({
      preference,
      registry: builtinRecipeRegistry(),
      capabilities: {
        independentVerifier: false,
        monitorConditionSource: false,
        reasoningBranches: false,
        independentPeer: false,
        monitorRuntimeCapability: status.capability,
      },
    });
    const row = rows.find((entry) => entry.capability === "MONITOR");
    expect(row?.availability).toBe("UNAVAILABLE");
    expect(row?.reason).toContain(message);
    expect(row?.availability).not.toBe("AVAILABLE");

    // `withMonitorRuntimeCapability` replaces ONLY the MONITOR row on a derived
    // view, so an install can never render a stale AVAILABLE claim.
    const view = buildProjectOperatingPostureView({
      projectId: PROJECT,
      preference,
      registry: builtinRecipeRegistry(),
      capabilities: {
        independentVerifier: false,
        monitorConditionSource: false,
        reasoningBranches: false,
        independentPeer: false,
      },
      profile: await rig.managementStore.get(PROJECT),
      workModeHistory: [],
      managementHistory: [],
    });
    const patched = withMonitorRuntimeCapability(view, status.capability);
    const patchedRow = patched.workMode.effectiveStatus.find((entry) => entry.capability === "MONITOR");
    expect(patchedRow?.availability).toBe("UNAVAILABLE");
    expect(patchedRow?.reason).toContain(message);
    expect(patched.workMode.capabilityWarnings.join(" ")).toContain(message);
    // No other row moved.
    expect(patched.workMode.effectiveStatus.filter((entry) => entry.capability !== "MONITOR")).toEqual(
      view.workMode.effectiveStatus.filter((entry) => entry.capability !== "MONITOR"),
    );

    await driver.dispose();
  });
});

/* ========================================================================== *
 * ACR-N17 / ACR-N18 — the operating history references canonical Campaign events
 * ========================================================================== */

describe("G10-AC-R ACR-N17/N18 operating history references Campaign events", () => {
  it("ACR-N17 a woken Campaign appears as campaign_wake entries naming the canonical events", async () => {
    const rig = await makeComponentRig();
    await seedDormant(rig);
    await setMonitorPreference(rig, ["MONITOR"]);
    const driver = driverOf(rig, { activation: recordingCampaignWakeActivation() });
    await driver.tick();
    await driver.dispose();

    const events = await rig.store.replay(CAMPAIGN);
    const types = events.map((event) => event.type);
    expect(types).toContain("WATCH_TRIGGERED");
    expect(types).toContain("WAKE_STARTED");
    const triggered = events.find((event) => event.type === "WATCH_TRIGGERED")!;
    const started = events.find((event) => event.type === "WAKE_STARTED")!;

    const history = await managementOf(rig).operatingHistory();
    const wakes = history.entries.filter((entry) => entry.kind === "campaign_wake");
    expect(wakes.length).toBeGreaterThanOrEqual(2);

    const summaries = wakes.map((entry) => entry.summary);
    expect(summaries).toContain(`WATCH_TRIGGERED in Campaign ${CAMPAIGN}`);
    expect(summaries).toContain(`WAKE_STARTED in Campaign ${CAMPAIGN}`);

    // Every entry NAMES the canonical event and copies no Campaign payload.
    for (const entry of wakes) {
      expect(entry.actor).toBe(`campaign:${CAMPAIGN}`);
      expect(entry.ref.startsWith(`${CAMPAIGN}:`)).toBe(true);
      expect(entry.canonicalOutcomeRefs).toHaveLength(1);
      expect(entry.canonicalOutcomeRefs[0]!.startsWith("campaign_event:")).toBe(true);
      expect(entry.incompleteCanonicalRef).toBe(false);
      // COPY NOTHING: the summary is the event type plus the campaign name, and
      // no watch reason, wake cause or reconciliation content is carried.
      expect(entry.summary).not.toContain("review");
      expect(entry.summary).not.toContain("cause");
      expect(Object.keys(entry).sort()).toEqual([
        "actor",
        "at",
        "canonicalOutcomeRefs",
        "incompleteCanonicalRef",
        "kind",
        "ref",
        "summary",
      ]);
    }
    expect(wakes.map((entry) => entry.ref)).toContain(`${CAMPAIGN}:${triggered.eventId}`);
    expect(wakes.map((entry) => entry.ref)).toContain(`${CAMPAIGN}:${started.eventId}`);
    expect(wakes.map((entry) => entry.canonicalOutcomeRefs[0])).toContain(`campaign_event:${triggered.eventId}`);

    // The count matches, the ordering key is the canonical chain position (NOT a
    // clock read), and the four documented event types are the only ones admitted.
    const admitted = events.filter((event) =>
      ["WATCH_TRIGGERED", "WAKE_STARTED", "RECONCILIATION_COMMITTED", "WAKE_CYCLE_COMPLETED"].includes(event.type),
    );
    expect(history.counts.campaignWakeEvents).toBe(admitted.length);
    expect(wakes.map((entry) => entry.at).sort()).toEqual(
      admitted.map((event) => campaignChainPositionOf(event.seq)).sort(),
    );
    for (const entry of wakes) expect(entry.at.startsWith("campaign-seq:")).toBe(true);
    // No Campaign event type outside the admitted four is referenced.
    const referencedTypes = wakes.map((entry) => entry.summary.split(" in Campaign ")[0]!);
    for (const type of referencedTypes) {
      expect(["WATCH_TRIGGERED", "WAKE_STARTED", "RECONCILIATION_COMMITTED", "WAKE_CYCLE_COMPLETED"]).toContain(type);
    }
    expect(referencedTypes).not.toContain("CAMPAIGN_DORMANT");
    expect(history.hasIncompleteAuditRecords).toBe(false);
  });

  it("ACR-N18 only the LINKED Campaign's events appear, even when another Campaign has triggered", async () => {
    const rig = await makeComponentRig();
    await seedDormant(rig, CAMPAIGN, true);
    // A SECOND Campaign with a triggered watch but NO project link.
    await seedDormant(rig, OTHER_CAMPAIGN, false);
    await rig.prospective.recordTrigger({ campaignId: OTHER_CAMPAIGN, watchId: "w-2", cause: "monitor_condition_satisfied" });
    const otherTypes = (await rig.store.replay(OTHER_CAMPAIGN)).map((event) => event.type);
    expect(otherTypes).toContain("WATCH_TRIGGERED");

    // The linked scope sees exactly one Campaign.
    const scope = linkedCampaignMonitorScope({ store: rig.store });
    expect(await scope.campaignIdsForProject(PROJECT)).toEqual([CAMPAIGN]);

    await setMonitorPreference(rig, ["MONITOR"]);
    const driver = driverOf(rig);
    await driver.tick();
    await driver.dispose();

    const history = await managementOf(rig).operatingHistory();
    const wakes = history.entries.filter((entry) => entry.kind === "campaign_wake");
    expect(wakes.length).toBeGreaterThan(0);
    // EVERY entry belongs to the linked Campaign; the unlinked Campaign's own
    // canonical WATCH_TRIGGERED is NOT referenced.
    for (const entry of wakes) {
      expect(entry.actor).toBe(`campaign:${CAMPAIGN}`);
      expect(entry.ref.startsWith(`${OTHER_CAMPAIGN}:`)).toBe(false);
      expect(entry.summary).not.toContain(OTHER_CAMPAIGN);
    }
    expect(history.entries.some((entry) => entry.ref.includes(OTHER_CAMPAIGN))).toBe(false);
    // And the history never widened: it does not reference every Campaign.
    const linkedOnly = await linkedCampaignWakeEventSource({ store: rig.store }).projectCampaignWakeEvents(PROJECT);
    expect(linkedOnly.length).toBe(history.counts.campaignWakeEvents);
    expect(linkedOnly.every((event) => event.campaignId === CAMPAIGN)).toBe(true);
  });

  it("ACR-N18b a service with NO Campaign seam references zero events and invents none", async () => {
    const rig = await makeComponentRig();
    await seedDormant(rig);
    await setMonitorPreference(rig, ["MONITOR"]);
    const driver = driverOf(rig);
    await driver.tick();
    await driver.dispose();
    expect((await rig.store.replay(CAMPAIGN)).map((event) => event.type)).toContain("WATCH_TRIGGERED");

    const workspace = makeProjectWorkspaceService({ controller: rig.controller });
    const withoutSeam = makeProjectManagementService({
      workspace,
      control: rig.managementStore,
      controller: rig.controller,
      workMode: rig.workMode,
      activity: rig.activity,
      registry: builtinRecipeRegistry(),
      clock: () => FIXED_NOW,
    });
    const history = await withoutSeam.operatingHistory();
    expect(history.counts.campaignWakeEvents).toBe(0);
    expect(history.entries.filter((entry) => entry.kind === "campaign_wake")).toHaveLength(0);
  });
});

/* ========================================================================== *
 * ACR-N19 — the preview is read-only
 * ========================================================================== */

describe("G10-AC-R ACR-N19 preview is read-only", () => {
  it("ACR-N19 GET /api/monitor/preview writes no Campaign event and no Work event", async () => {
    const rig = await makeInstallRig();
    const before = (await rig.campaignStore.replay(CAMPAIGN)).map((event) => event.eventId);
    const lifecycleBefore = await rig.installed.controller.store.connection
      .prepare("SELECT COUNT(*) AS n FROM events")
      .get() as { n: number };

    // The read-only preview is reachable through the SAME typed route the browser
    // uses, and it reports a pending condition without performing it.
    const preview = await http(rig.installed, "GET", "/api/monitor/preview");
    expect(preview.status).toBe(200);
    const body = preview.body as {
      readonly trigger: string;
      readonly scopedCampaignCount: number;
      readonly campaigns: readonly { readonly campaignId: string; readonly lifecycle: string; readonly triggeredWatchIds: readonly string[]; readonly beganWake: boolean; readonly delivered: boolean }[];
      readonly wakeAdvances: number;
      readonly activations: number;
    };
    expect(body.trigger).toBe("manual");
    expect(body.scopedCampaignCount).toBe(1);
    expect(body.wakeAdvances).toBe(0);
    expect(body.activations).toBe(0);
    const outcome = body.campaigns[0]!;
    expect(outcome.campaignId).toBe(CAMPAIGN);
    expect(outcome.lifecycle).toBe("DORMANT");
    expect(outcome.triggeredWatchIds).toEqual(["w-1"]);
    expect(outcome.beganWake).toBe(false);
    expect(outcome.delivered).toBe(false);

    // The application-surface preview agrees, and NEITHER read changed anything.
    const direct = await rig.installed.application.monitor!.preview();
    expect(direct.campaigns[0]?.beganWake).toBe(false);

    const after = (await rig.campaignStore.replay(CAMPAIGN)).map((event) => event.eventId);
    expect(after).toEqual(before);
    const lifecycleAfter = await rig.installed.controller.store.connection
      .prepare("SELECT COUNT(*) AS n FROM events")
      .get() as { n: number };
    expect(Number(lifecycleAfter.n)).toBe(Number(lifecycleBefore.n));
    // No signal was produced and no wake started.
    expect(rig.activation.signals).toHaveLength(0);
    expect(after).not.toContain("WAKE_STARTED");

    // The status route is read-only too.
    const status = await http(rig.installed, "GET", "/api/monitor/status");
    expect(status.status).toBe(200);
    const statusBody = status.body as {
      readonly capability: { readonly startState: string };
      readonly availability: { readonly availability: string };
      readonly driverStarted: boolean;
      readonly scopedCampaignCount: number;
      readonly dormantCampaignCount: number;
      readonly activeWatchCount: number;
      readonly inFlightWakeCount: number;
    };
    expect(statusBody.capability.startState).toBe("RUNNING");
    expect(statusBody.driverStarted).toBe(true);
    expect(statusBody.availability.availability).toBe("AVAILABLE");
    expect(statusBody.scopedCampaignCount).toBe(1);
    expect(statusBody.dormantCampaignCount).toBe(1);
    expect(statusBody.activeWatchCount).toBe(1);
    expect(statusBody.inFlightWakeCount).toBe(0);
    expect((await rig.campaignStore.replay(CAMPAIGN)).map((event) => event.eventId)).toEqual(before);
  });
});

/* ========================================================================== *
 * ACR-N20 — no HTTP force tick
 * ========================================================================== */

describe("G10-AC-R ACR-N20 no HTTP force tick", () => {
  it("ACR-N20 POST to either monitor route is refused and no tick-like route exists", async () => {
    const rig = await makeInstallRig();
    const before = (await rig.campaignStore.replay(CAMPAIGN)).map((event) => event.eventId);

    // The ACTUAL refusal: `requireGet()` throws an InvalidRequest, which the
    // dispatcher maps to 400 (src/application/http.ts:92) — not 405.
    for (const path of ["/api/monitor/status", "/api/monitor/preview"]) {
      const refused = await http(rig.installed, "POST", path, {});
      expect(refused.status).toBe(400);
      expect((refused.body as { readonly error: { readonly detail: string } }).error.detail).toContain("requires GET");
    }
    // Nothing was ticked by the refused requests.
    expect((await rig.campaignStore.replay(CAMPAIGN)).map((event) => event.eventId)).toEqual(before);
    expect(rig.activation.signals).toHaveLength(0);

    // A tick-shaped path is not routed at all (the dispatcher returns undefined,
    // which the server turns into a 404).
    const url = new URL("/api/monitor/tick", "http://localhost");
    const unrouted = await handleApplicationRequest({
      application: rig.installed.application,
      method: "POST",
      pathname: url.pathname,
      query: url.searchParams,
      body: {},
    });
    expect(unrouted).toBeUndefined();

    // Structural: the route table contains the two read-only monitor routes and no
    // force-tick route of any name.
    const httpSource = readFileSync(fileURLToPath(new URL("../src/application/http.ts", import.meta.url)), "utf8");
    const monitorRoutes = [...httpSource.matchAll(/pathname === "(\/api\/monitor\/[^"]+)"/gu)].map((match) => match[1]!);
    expect(monitorRoutes.sort()).toEqual(["/api/monitor/preview", "/api/monitor/status"]);
    expect(monitorRoutes.some((route) => /tick|run|force|fire/iu.test(route))).toBe(false);
    // The read-only monitor surface has no force-tick member at all.
    const surfaceSource = readFileSync(fileURLToPath(new URL("../src/application/surface.ts", import.meta.url)), "utf8");
    const monitorSurface = surfaceSource.slice(surfaceSource.indexOf("export interface MonitorApplicationSurface"));
    const members = monitorSurface.slice(0, monitorSurface.indexOf("}"));
    expect(members).toContain("status()");
    expect(members).toContain("preview()");
    expect(members).not.toMatch(/tick\(/u);
  });
});

/* ========================================================================== *
 * ACR-N26 — an unwired installation reports the ABSENCE, never a number
 * ========================================================================== */

describe("G10-AC-R ACR-N26 an absent monitor runtime is reported as absent", () => {
  it("ACR-N26 no scope wired ⇒ the read route answers 501 and no driver is composed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pal-acrp-none-"));
    const installed = installPalimpsest(new MockHost() as never, {
      projectId: PROJECT,
      databasePath: join(dir, "work.sqlite"),
      ordariumDatabasePath: join(dir, "ops.sqlite"),
      git: new FakeGitPort("c".repeat(40)),
      projectAssociationStore: new SqliteProjectAssetAssociationStore(join(dir, "assoc.sqlite")),
    });
    try {
      // No scope was supplied, so no monitor runtime is composed at all.
      expect(installed.monitor).toBeUndefined();
      const status = await http(installed, "GET", "/api/monitor/status");
      expect(status.status).toBe(501);
      expect((status.body as { readonly error: { readonly detail: string } }).error.detail).toContain(
        "the monitor surface is not configured",
      );
      const preview = await http(installed, "GET", "/api/monitor/preview");
      expect(preview.status).toBe(501);
      // The read-only face is absent — the UI must render "no monitor runtime is
      // wired for this installation" rather than fabricating zeroes.
      expect(installed.application.monitor).toBeUndefined();
      const surfaces = (await http(installed, "GET", "/api/application/surfaces")).body as Record<string, boolean>;
      expect(surfaces.monitor).toBe(false);
    } finally {
      await installed.dispose();
    }
  });
});

/* ========================================================================== *
 * ACR-N23 — monitor.v1 readiness stays CONDITIONAL
 * ========================================================================== */
describe("G10-AC-R ACR-N23 monitor.v1 readiness", () => {
  it("ACR-N23 monitor.v1 is CONDITIONAL, neither PRODUCTION_READY nor PREVIEW_ONLY", () => {
    const definition = builtinRecipeRegistry().get("monitor.v1");
    expect(definition).toBeDefined();
    expect(definition!.readiness).toBe("CONDITIONAL");
    expect(definition!.readiness).not.toBe("PRODUCTION_READY");
    expect(definition!.readiness).not.toBe("PREVIEW_ONLY");
    expect(definition!.capabilityRequirements).toEqual(["campaign.watcher"]);
    expect(definition!.limitations.join(" ")).toMatch(/at-least-once/);

    // The posture reports that SAME readiness next to the derived availability:
    // a CONDITIONAL recipe can still be UNAVAILABLE at runtime.
    const rows = deriveEffectiveModeStatus({
      preference: {
        preference: {
          schemaVersion: 1,
          projectId: PROJECT,
          baseMode: "FOCUS",
          modifiers: ["MONITOR"],
          updatedAt: FIXED_NOW,
          updatedBy: "operator:test",
          digest: "d".repeat(64),
        },
        source: "stored",
      },
      registry: builtinRecipeRegistry(),
      capabilities: {
        independentVerifier: false,
        monitorConditionSource: false,
        reasoningBranches: false,
        independentPeer: false,
      },
    });
    const row = rows.find((entry) => entry.capability === "MONITOR")!;
    expect(row.readiness).toBe("CONDITIONAL");
    expect(row.preferred).toBe(true);
    expect(row.availability).toBe("UNAVAILABLE");
    // Nothing in this derivation claims a started runtime.
    expect(monitorAvailabilityOf(undefined).availability).toBe("PREVIEW_ONLY");
  });

  it("ACR-N23b the same config is reachable from the real install's posture read", async () => {
    const rig = await makeInstallRig();
    const posture = await rig.installed.projectManagement!.posture();
    const row = posture.workMode.effectiveStatus.find((entry) => entry.capability === "MONITOR")!;
    // monitor.v1 readiness (registry) and MONITOR availability (runtime) are two
    // different questions, answered from two different sources.
    expect(row.readiness).toBe("CONDITIONAL");
    expect(row.preferred).toBe(true);
    expect(row.availability).toBe("AVAILABLE");
    expect(row.reason).toMatch(/explicit tick source and a real host wake activation adapter/);
  });
});
