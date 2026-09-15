/**
 * G10-AC-R closure — install lifecycle, the availability table, and the
 * deterministic trigger cause (ACR-N01 … ACR-N14 + the partial-wiring matrix).
 *
 * Everything here exercises the REAL services: a real `SqliteCampaignStore`, the
 * real Campaign / Prospective / Production services, a real Work Mode preference
 * store, the real `SqliteMonitorDeliveryMarkStore` and the real
 * `installPalimpsest` composition. Only host adapters (the wake activation port,
 * the tick source) and clocks are stubbed. Campaign semantics are never mocked.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  SqliteCampaignStore,
  makeCampaignProductionService,
  makeCampaignService,
  makeInterventionService,
  makeProspectiveService,
  materializeCampaignProjectRef,
} from "../src/campaign/index.js";
import type {
  CampaignInstitutionReader,
  CampaignProductionService,
  CampaignProjectReader,
  CampaignProjectRef,
  CampaignService,
  InterventionService,
  ProspectiveService,
} from "../src/campaign/index.js";
import { FakeGitPort } from "../src/effects/index.js";
import { installPalimpsest } from "../src/install.js";
import {
  SqliteMonitorDeliveryMarkStore,
  intervalMonitorTickSource,
  linkedCampaignMonitorScope,
  makeCampaignMonitorDriver,
  manualMonitorTickSource,
  monitorAvailabilityOf,
  nullCampaignWakeActivation,
  recordingCampaignWakeActivation,
} from "../src/monitor/index.js";
import type {
  CampaignMonitorDriver,
  CampaignMonitorScopePort,
  CampaignWakeActivationPort,
  MonitorRuntimeCapability,
  MonitorTickSourcePort,
} from "../src/monitor/index.js";
import {
  SqliteWorkModePreferenceStore,
  deriveEffectiveModeStatus,
} from "../src/project_operating/index.js";
import { SqliteProjectAssetAssociationStore } from "../src/project_workspace/index.js";
import { builtinRecipeRegistry } from "../src/recipes/index.js";
import { MockHost } from "./helpers.js";

const PROJECT = "acr-p1";
const INSTITUTION = "acr-inst";
const CAMPAIGN = "acr-camp";
const FIXED_NOW = "2026-09-16T00:00:00Z";
const PAST = "2026-01-01T00:00:00Z";
const OTHER_CLOCK = "2027-12-25T12:34:56Z";

const PROJECT_REF: CampaignProjectRef = materializeCampaignProjectRef({
  projectId: PROJECT,
  revision: 0,
  digest: "d".repeat(64),
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- *
 * A component rig (real services over a temp store).
 * -------------------------------------------------------------------------- */

interface ComponentRig {
  readonly dir: string;
  readonly store: SqliteCampaignStore;
  readonly workMode: SqliteWorkModePreferenceStore;
  readonly campaign: CampaignService;
  readonly prospective: ProspectiveService;
  readonly production: CampaignProductionService;
  readonly intervention: InterventionService;
  readonly scope: CampaignMonitorScopePort;
  readonly clock: { value: string };
  close(): void;
}

const openRigs: ComponentRig[] = [];
afterEach(() => {
  for (const rig of openRigs.splice(0)) rig.close();
});

function makeComponentRig(clockValue = FIXED_NOW): ComponentRig {
  const dir = mkdtempSync(join(tmpdir(), "pal-acr-"));
  const clock = { value: clockValue };
  const store = new SqliteCampaignStore(join(dir, "campaign.sqlite"));
  const workMode = new SqliteWorkModePreferenceStore(join(dir, "operating.sqlite"), {
    clock: () => clock.value,
  });
  const institutions: CampaignInstitutionReader = {
    inspectEpoch: async (institutionId: string) => ({
      state: "known" as const,
      value: { institutionId, epoch: 1, digest: "e".repeat(64) },
    }),
  };
  const work: CampaignProjectReader = {
    inspectProject: async () => ({ state: "known" as const, value: "running" as const }),
  };
  let commitment = 0;
  let watch = 0;
  let wake = 0;
  let observation = 0;
  let revision = 0;
  let interventionId = 0;
  const campaign = makeCampaignService({
    store,
    allocateCommitmentId: () => `cc-${++commitment}`,
    institutions,
  });
  // Deterministic watch ids, so two rigs are semantically identical and their
  // canonical trigger identities are directly comparable (ACR-N13).
  const prospective = makeProspectiveService({
    store,
    allocateWatchId: () => `w-${++watch}`,
    clock: () => clock.value,
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
  const intervention = makeInterventionService({
    store,
    allocateInterventionId: () => `iv-${++interventionId}`,
  });
  const rig: ComponentRig = {
    dir,
    store,
    workMode,
    campaign,
    prospective,
    production,
    intervention,
    scope: linkedCampaignMonitorScope({ store }),
    clock,
    close() {
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

async function seedDormant(rig: ComponentRig): Promise<void> {
  await rig.campaign.createCampaign({ campaignId: CAMPAIGN, institutionId: INSTITUTION, statement: "root" });
  await rig.intervention.register({
    campaignId: CAMPAIGN,
    project: PROJECT_REF,
    purpose: "test",
    targetHypothesisIds: [],
  });
  const dormant = await rig.production.admitWait({
    campaignId: CAMPAIGN,
    reason: "nothing useful yet",
    watches: [{ condition: { kind: "not_before", at: PAST }, reason: "review" }],
  });
  if (dormant.status !== "dormant") throw new Error(`expected DORMANT, got ${dormant.status}`);
}

async function setMonitor(rig: ComponentRig): Promise<void> {
  await rig.workMode.set({ projectId: PROJECT, baseMode: "FOCUS", modifiers: ["MONITOR"], updatedBy: "operator:test" });
}

function driverOf(
  rig: ComponentRig,
  options: {
    readonly tickSource?: MonitorTickSourcePort;
    readonly activation?: CampaignWakeActivationPort;
    readonly marks?: SqliteMonitorDeliveryMarkStore;
    readonly redeliveryAfterMs?: number;
  } = {},
): CampaignMonitorDriver {
  return makeCampaignMonitorDriver({
    projectId: PROJECT,
    workMode: rig.workMode,
    scope: rig.scope,
    prospective: rig.prospective,
    production: rig.production,
    history: { readEvents: (campaignId) => rig.store.replay(campaignId) },
    activation: options.activation ?? nullCampaignWakeActivation(),
    clock: () => rig.clock.value,
    ...(options.marks === undefined ? {} : { marks: options.marks }),
    ...(options.tickSource === undefined ? {} : { tickSource: options.tickSource }),
    ...(options.redeliveryAfterMs === undefined
      ? {}
      : { policy: { redeliveryAfterMs: options.redeliveryAfterMs } }),
  });
}

async function monitorRowFor(rig: ComponentRig, capability: MonitorRuntimeCapability) {
  const preference = await rig.workMode.get(PROJECT);
  const rows = deriveEffectiveModeStatus({
    preference,
    registry: builtinRecipeRegistry(),
    capabilities: {
      independentVerifier: false,
      monitorConditionSource: false,
      reasoningBranches: false,
      independentPeer: false,
      monitorRuntimeCapability: capability,
    },
  });
  const row = rows.find((entry) => entry.capability === "MONITOR");
  if (row === undefined) throw new Error("MONITOR row missing");
  return row;
}

/** A tick source whose start() fails; used for the FAILED branch. */
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

/* -------------------------------------------------------------------------- *
 * An install rig (the real `installPalimpsest` composition).
 * -------------------------------------------------------------------------- */

interface InstallRig {
  readonly dir: string;
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly campaignStore: SqliteCampaignStore;
  readonly workMode: SqliteWorkModePreferenceStore;
}

const openInstalls: InstallRig[] = [];
afterEach(async () => {
  for (const rig of openInstalls.splice(0)) {
    try {
      await rig.installed.dispose();
    } catch {
      /* already disposed */
    }
    try {
      rig.workMode.close();
    } catch {
      /* already closed */
    }
    try {
      rig.campaignStore.close();
    } catch {
      /* already closed */
    }
  }
});

async function makeInstallRig(options: {
  readonly tickSource?: MonitorTickSourcePort;
  readonly activation?: CampaignWakeActivationPort;
  readonly redeliveryAfterMs?: number;
}): Promise<InstallRig> {
  const dir = mkdtempSync(join(tmpdir(), "pal-acr-inst-"));
  const campaignStore = new SqliteCampaignStore(join(dir, "campaign.sqlite"));
  const workMode = new SqliteWorkModePreferenceStore(join(dir, "operating.sqlite"), { clock: () => FIXED_NOW });
  await workMode.set({ projectId: PROJECT, baseMode: "FOCUS", modifiers: ["MONITOR"], updatedBy: "operator:test" });

  // Seed a project-linked DORMANT campaign with a satisfied not_before watch.
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
    campaignClock: () => FIXED_NOW,
    campaignMonitorPolicy: { redeliveryAfterMs: options.redeliveryAfterMs ?? 300_000 },
    ...(options.tickSource === undefined ? {} : { campaignMonitorTickSource: options.tickSource }),
    ...(options.activation === undefined ? {} : { campaignMonitorActivation: options.activation }),
  });
  const rig: InstallRig = { dir, installed, campaignStore, workMode };
  openInstalls.push(rig);
  return rig;
}

/* -------------------------------------------------------------------------- *
 * ACR-N01 … ACR-N05 + the matrix — the partial-wiring availability table
 * -------------------------------------------------------------------------- */

describe("G10-AC-R availability is derived from REAL wiring", () => {
  it("ACR-N01 scope only is NOT AVAILABLE: the posture row and startState are honest", async () => {
    const rig = makeComponentRig();
    await seedDormant(rig);
    await setMonitor(rig);
    const driver = driverOf(rig); // no tick source, implicit null activation
    const capability = driver.capability();
    expect(capability.tickSourceConfigured).toBe(false);
    expect(capability.activationConfigured).toBe(false);
    expect(capability.startState).toBe("NOT_CONFIGURED");
    expect((await driver.ready()).status).toBe("not_configured");

    const row = await monitorRowFor(rig, capability);
    expect(row.availability).toBe("UNAVAILABLE");
    expect(row.reason).toMatch(/scope only/);
    expect(monitorAvailabilityOf(capability).availability).toBe("UNAVAILABLE");

    // ...and through the REAL install: a scope-only composition is not AVAILABLE.
    const install = await makeInstallRig({});
    expect(install.installed.monitor).toBeDefined();
    const installPosture = await install.installed.projectManagement!.posture();
    const installRow = installPosture.workMode.effectiveStatus.find((entry) => entry.capability === "MONITOR");
    expect(installRow?.availability).toBe("UNAVAILABLE");
    expect(installRow?.reason).toMatch(/scope only/);
    expect(install.installed.monitor!.capability().startState).toBe("NOT_CONFIGURED");
  });

  it("ACR-N02 tick-only is NOT autonomous AVAILABLE and names the missing host wake adapter", async () => {
    const rig = makeComponentRig();
    await seedDormant(rig);
    await setMonitor(rig);
    const driver = driverOf(rig, { tickSource: manualMonitorTickSource() });
    const capability = driver.capability();
    expect(capability.tickSourceConfigured).toBe(true);
    expect(capability.activationConfigured).toBe(false);
    const mapped = monitorAvailabilityOf(capability);
    expect(mapped.availability).toBe("CONDITIONAL");
    expect(mapped.reason).toMatch(/no real host wake activation adapter/);
  });

  it("ACR-N03 activation-only is NOT autonomous AVAILABLE and names the missing tick source", async () => {
    const rig = makeComponentRig();
    await seedDormant(rig);
    await setMonitor(rig);
    const driver = driverOf(rig, { activation: recordingCampaignWakeActivation() });
    const capability = driver.capability();
    expect(capability.tickSourceConfigured).toBe(false);
    expect(capability.activationConfigured).toBe(true);
    const mapped = monitorAvailabilityOf(capability);
    expect(mapped.availability).toBe("CONDITIONAL");
    expect(mapped.reason).toMatch(/no monitor tick source is configured/);
    expect(mapped.availability).not.toBe("AVAILABLE");
  });

  it("ACR-N04 a full STARTED runtime IS AVAILABLE and the reason names the real wiring", async () => {
    const rig = makeComponentRig();
    await seedDormant(rig);
    await setMonitor(rig);
    const driver = driverOf(rig, {
      tickSource: manualMonitorTickSource(),
      activation: recordingCampaignWakeActivation(),
    });
    const outcome = await driver.ready();
    expect(outcome.status).toBe("running");
    const capability = driver.capability();
    expect(capability.startState).toBe("RUNNING");
    expect(capability.started).toBe(true);
    const mapped = monitorAvailabilityOf(capability);
    expect(mapped.availability).toBe("AVAILABLE");
    expect(mapped.reason).toMatch(/explicit tick source and a real host wake activation adapter/);
    const row = await monitorRowFor(rig, capability);
    expect(row.availability).toBe("AVAILABLE");
    await driver.dispose();
  });

  it("ACR-N05 a FAILED start is not AVAILABLE and the reason carries the error text", async () => {
    const rig = makeComponentRig();
    await seedDormant(rig);
    await setMonitor(rig);
    const message = "the interval timer could not be created";
    const driver = driverOf(rig, {
      tickSource: failingTickSource(message),
      activation: recordingCampaignWakeActivation(),
    });
    const outcome = await driver.ready();
    expect(outcome.status).toBe("failed");
    expect(outcome.error).toBe(message);
    const capability = driver.capability();
    expect(capability.startState).toBe("FAILED");
    expect(capability.started).toBe(false);
    const mapped = monitorAvailabilityOf(capability);
    expect(mapped.availability).toBe("UNAVAILABLE");
    expect(mapped.reason).toContain(message);
    const row = await monitorRowFor(rig, capability);
    expect(row.availability).toBe("UNAVAILABLE");
    await driver.dispose();
  });

  it("ACR-N04b/matrix the five §17 partial wirings get exactly their honest availability", async () => {
    const rig = makeComponentRig();
    await seedDormant(rig);
    await setMonitor(rig);
    const tick = manualMonitorTickSource();
    const real = recordingCampaignWakeActivation();

    const scopeOnly = driverOf(rig);
    const scopeTick = driverOf(rig, { tickSource: tick });
    const scopeActivation = driverOf(rig, { activation: real });
    const started = driverOf(rig, { tickSource: tick, activation: real });
    const failed = driverOf(rig, { tickSource: failingTickSource("expected failure"), activation: real });
    await started.ready();
    await failed.ready();

    const availability = (driver: CampaignMonitorDriver) => monitorAvailabilityOf(driver.capability()).availability;
    expect(availability(scopeOnly)).toBe("UNAVAILABLE");
    expect(availability(scopeTick)).toBe("CONDITIONAL");
    expect(availability(scopeActivation)).toBe("CONDITIONAL");
    expect(availability(started)).toBe("AVAILABLE");
    expect(availability(failed)).toBe("UNAVAILABLE");

    // Exactly one configuration is AVAILABLE: the fully wired, started runtime.
    const all = [scopeOnly, scopeTick, scopeActivation, started, failed].map(availability);
    expect(all.filter((value) => value === "AVAILABLE")).toHaveLength(1);

    for (const driver of [scopeOnly, scopeTick, scopeActivation, started, failed]) await driver.dispose();
  });

  it("ACR-N09 the null activation adapter never claims an autonomous wake", async () => {
    const rig = makeComponentRig();
    await seedDormant(rig);
    await setMonitor(rig);
    const driver = driverOf(rig, {
      tickSource: manualMonitorTickSource(),
      activation: nullCampaignWakeActivation(),
    });
    await driver.ready();
    const capability = driver.capability();
    expect(capability.activationConfigured).toBe(false);
    expect(capability.deliveryMarksConfigured).toBe(false);
    expect(monitorAvailabilityOf(capability).availability).toBe("CONDITIONAL");
    expect(monitorAvailabilityOf(capability).availability).not.toBe("AVAILABLE");
    await driver.dispose();
  });
});

/* -------------------------------------------------------------------------- *
 * ACR-N06 … ACR-N08 — the install lifecycle
 * -------------------------------------------------------------------------- */

describe("G10-AC-R install lifecycle", () => {
  it("ACR-N06 the standard install STARTS an explicitly supplied tick source", async () => {
    const tickSource = intervalMonitorTickSource({ intervalMs: 30 });
    const activation = recordingCampaignWakeActivation();
    const rig = await makeInstallRig({ tickSource, activation });
    // We NEVER call start() ourselves: only installPalimpsest ran.
    await rig.installed.monitor!.ready();
    const status = await rig.installed.monitor!.status();
    expect(status.capability.startState).toBe("RUNNING");
    expect(status.capability.started).toBe(true);
    expect(status.driverStarted).toBe(true);
    await sleep(120);
    const after = await rig.installed.monitor!.status();
    expect(after.tickSource?.fires ?? 0).toBeGreaterThan(0);
    expect(after.tickSource?.running).toBe(true);

    // The install's own posture derives the SAME honest AVAILABLE claim from the
    // LIVE capability (the install wires the capability into the posture read).
    const posture = await rig.installed.projectManagement!.posture();
    const row = posture.workMode.effectiveStatus.find((entry) => entry.capability === "MONITOR");
    expect(row?.availability).toBe("AVAILABLE");
    expect(row?.reason).toMatch(/explicit tick source and a real host wake activation adapter/);
  });

  it("ACR-N07 await installed.dispose() stops the monitor", async () => {
    const tickSource = intervalMonitorTickSource({ intervalMs: 30 });
    const rig = await makeInstallRig({ tickSource, activation: recordingCampaignWakeActivation() });
    await rig.installed.monitor!.ready();
    await sleep(90);
    const firesBeforeDispose = tickSource.status().fires;
    expect(tickSource.status().running).toBe(true);
    await rig.installed.dispose();
    await sleep(150);
    expect(tickSource.status().fires).toBe(firesBeforeDispose);
    expect(tickSource.status().running).toBe(false);
  });

  it("ACR-N08 no callback runs after stores close and a second dispose is a no-op", async () => {
    const errors: unknown[] = [];
    const tickSource = intervalMonitorTickSource({
      intervalMs: 20,
      onError: (error) => errors.push(error),
    });
    const rig = await makeInstallRig({ tickSource, activation: recordingCampaignWakeActivation() });
    await rig.installed.monitor!.ready();
    await sleep(60);
    await rig.installed.dispose();
    const firesAfterDispose = tickSource.status().fires;
    await sleep(140);
    // No tick ran after dispose (the source is stopped) and no callback threw.
    expect(tickSource.status().fires).toBe(firesAfterDispose);
    expect(errors).toHaveLength(0);
    // Idempotent: a second dispose resolves and changes nothing.
    await expect(rig.installed.dispose()).resolves.toBeUndefined();
    expect(tickSource.status().running).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * ACR-N10 … ACR-N11 — delivery marks
 * -------------------------------------------------------------------------- */

describe("G10-AC-R delivery marks", () => {
  it("ACR-N10 the DEFAULT marks suppress inside the cooldown", async () => {
    const activation = recordingCampaignWakeActivation();
    const rig = await makeInstallRig({
      tickSource: manualMonitorTickSource(),
      activation,
      redeliveryAfterMs: 3_600_000,
    });
    await rig.installed.monitor!.ready();
    const status = await rig.installed.monitor!.status();
    expect(status.deliveryMarks).toBe("default");

    await rig.installed.monitor!.tick();
    await rig.installed.monitor!.tick();
    // The second tick is inside the cooldown, so exactly ONE signal was recorded.
    expect(activation.signals).toHaveLength(1);
    expect(status.lastActivation).toBeNull(); // (status was read before the ticks)
    const after = await rig.installed.monitor!.status();
    expect(after.lastActivation).not.toBeNull();
  });

  it("ACR-N11 marks loss stays semantically safe: same signalId, one WAKE_STARTED", async () => {
    const rig = makeComponentRig();
    await seedDormant(rig);
    await setMonitor(rig);
    const activation = recordingCampaignWakeActivation();
    const firstMarks = new SqliteMonitorDeliveryMarkStore(join(rig.dir, "marks-1.sqlite"));
    const first = driverOf(rig, { activation, marks: firstMarks, redeliveryAfterMs: 0 });
    await first.tick();
    const firstSignal = activation.signals[0];
    expect(firstSignal).toBeDefined();

    // "Marks loss": a fresh driver over the SAME campaign with a fresh marks DB.
    const secondMarks = new SqliteMonitorDeliveryMarkStore(join(rig.dir, "marks-2.sqlite"));
    const second = driverOf(rig, { activation, marks: secondMarks, redeliveryAfterMs: 0 });
    await second.tick();

    // At-least-once delivery, but the SAME semantic identity and ONE wake.
    expect(activation.signals).toHaveLength(2);
    expect(activation.signals[1]!.signalId).toBe(firstSignal!.signalId);
    const types = (await rig.store.replay(CAMPAIGN)).map((event) => event.type);
    expect(types.filter((type) => type === "WAKE_STARTED")).toHaveLength(1);
    // `dispose()` closes each driver's OWNED marks store exactly once.
    await first.dispose();
    await second.dispose();
  });
});

/* -------------------------------------------------------------------------- *
 * ACR-N12 … ACR-N14 — the deterministic canonical trigger cause
 * -------------------------------------------------------------------------- */

describe("G10-AC-R deterministic trigger cause", () => {
  it("ACR-N12 the trigger cause has no wall-clock text", async () => {
    const rig = makeComponentRig();
    await seedDormant(rig);
    await setMonitor(rig);
    const driver = driverOf(rig);
    await driver.tick();
    const triggered = (await rig.store.replay(CAMPAIGN)).find((event) => event.type === "WATCH_TRIGGERED");
    expect(triggered).toBeDefined();
    const cause = (triggered!.payload as { cause: string }).cause;
    expect(cause).toBe("monitor_condition_satisfied");
    expect(/[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(cause)).toBe(false);
    await driver.dispose();
  });

  it("ACR-N13 equivalent triggers at different clocks have identical canonical identity", async () => {
    const runs: { eventId: string; cause: string }[] = [];
    for (const clockValue of [FIXED_NOW, OTHER_CLOCK]) {
      const rig = makeComponentRig(clockValue);
      await seedDormant(rig);
      await setMonitor(rig);
      const driver = driverOf(rig);
      await driver.tick();
      const triggered = (await rig.store.replay(CAMPAIGN)).find((event) => event.type === "WATCH_TRIGGERED");
      if (triggered === undefined) throw new Error("expected a canonical trigger");
      runs.push({ eventId: triggered.eventId, cause: (triggered.payload as { cause: string }).cause });
      await driver.dispose();
    }
    expect(runs[0]!.cause).toBe(runs[1]!.cause);
    // The canonical identity is the digest of the payload: identical payloads =>
    // the SAME event id at two different clocks.
    expect(runs[0]!.eventId).toBe(runs[1]!.eventId);
  });

  it("ACR-N14 dynamic evaluation detail stays non-canonical", async () => {
    const rig = makeComponentRig();
    await seedDormant(rig);
    await setMonitor(rig);
    const driver = driverOf(rig);
    const tick = await driver.tick();
    const triggered = (await rig.store.replay(CAMPAIGN)).find((event) => event.type === "WATCH_TRIGGERED");
    expect(triggered).toBeDefined();
    const payload = triggered!.payload as Record<string, unknown>;
    // The canonical payload carries ONLY the semantic fields.
    expect(Object.keys(payload).sort()).toEqual(["cause", "watchId"]);
    expect(payload).not.toHaveProperty("at");
    expect(payload).not.toHaveProperty("epoch");
    // The clock is visible ONLY in the driver's non-canonical outcome detail.
    const outcome = tick.campaigns[0];
    expect(outcome).toBeDefined();
    expect(outcome!.detail).toContain(FIXED_NOW);
    await driver.dispose();
  });
});
