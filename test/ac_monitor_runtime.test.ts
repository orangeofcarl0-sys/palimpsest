/**
 * G10-AC Campaign monitor runtime — behavioural suite (AC-N01 … AC-N30).
 *
 * Everything here exercises the REAL services:
 *   - a real `SqliteCampaignStore` (temp file, so `sqlite_master` is inspectable)
 *   - the real Campaign / Prospective / Production / Intervention services
 *   - a real `SqliteWorkModePreferenceStore`, `SqliteManagementPreferenceStore`,
 *     `SqliteManagementActivityStore`, real Work `EventStore`, real
 *     `SqliteMonitorDeliveryMarkStore`
 *
 * Only host adapters (the wake activation port, the tick source) and clocks are
 * stubbed. Campaign semantics are never mocked.
 *
 * The monitor driver is the ONE automatic path that turns durable prospective
 * memory into a wake, and then STOPS. These tests are mostly NEGATIVE: they prove
 * what a tick may NOT do.
 */

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

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
  CampaignProjectReader,
  CampaignProjectRef,
  CampaignProductionService,
  CampaignService,
  CampaignWatchDraft,
  InterventionService,
  ProspectiveService,
} from "../src/campaign/index.js";
import {
  DEFAULT_CAMPAIGN_MONITOR_POLICY,
  SqliteMonitorDeliveryMarkStore,
  allowlistCampaignMonitorScope,
  buildCampaignWakeActivationSignal,
  composedCampaignMonitorScope,
  deriveMonitorContinuation,
  dshCampaignWakeAdapter,
  emptyCampaignMonitorScope,
  intervalMonitorTickSource,
  linkedCampaignMonitorScope,
  makeCampaignMonitorDriver,
  manualMonitorTickSource,
  nullCampaignWakeActivation,
  pendingWakeCauseOf,
  recordingCampaignWakeActivation,
} from "../src/monitor/index.js";
import type {
  CampaignMonitorScopePort,
  CampaignMonitorTickResult,
  CampaignWakeActivationPort,
  MonitorTickSourcePort,
} from "../src/monitor/index.js";
import {
  SqliteManagementActivityStore,
  SqliteWorkModePreferenceStore,
  deriveEffectiveModeStatus,
} from "../src/project_operating/index.js";
import { SqliteManagementPreferenceStore } from "../src/project_management/index.js";
import { builtinRecipeRegistry } from "../src/recipes/index.js";
import { EventStore } from "../src/state/index.js";

/* -------------------------------------------------------------------------- *
 * Shared fixture
 * -------------------------------------------------------------------------- */

const PROJECT = "proj-1";
const OTHER_PROJECT = "proj-2";
const INSTITUTION = "inst-1";
const CAMPAIGN = "camp-1";
const OTHER_CAMPAIGN = "camp-2";
const PRINCIPAL_SESSION = "principal-session-1";

const FIXED_NOW = "2026-09-16T00:00:00Z";
const PAST = "2026-01-01T00:00:00Z";
const FUTURE = "2030-01-01T00:00:00Z";

const EPOCH = Object.freeze({ institutionId: INSTITUTION, epoch: 1, digest: "e".repeat(64) });
const PROJECT_REF: CampaignProjectRef = materializeCampaignProjectRef({
  projectId: PROJECT,
  revision: 0,
  digest: "d".repeat(64),
});
const OTHER_PROJECT_REF: CampaignProjectRef = materializeCampaignProjectRef({
  projectId: OTHER_PROJECT,
  revision: 0,
  digest: "a".repeat(64),
});

const SRC = (file: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/monitor/${file}`, import.meta.url)), "utf-8");
const strip = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/** The event types a monitor tick is allowed to create (watch/wake/reconciliation). */
const MONITOR_EVENT_FAMILY: ReadonlySet<string> = new Set([
  "WATCH_INSTALLED",
  "WATCH_TRIGGERED",
  "WATCH_CANCELLED",
  "WAKE_STARTED",
  "EVIDENCE_OBSERVED",
  "BELIEF_REVISED",
  "RECONCILIATION_COMMITTED",
  "WORLD_RECONCILED",
  "COMMITMENTS_REVIEWED",
]);

interface Rig {
  readonly dir: string;
  readonly store: SqliteCampaignStore;
  readonly workStore: EventStore;
  readonly activity: SqliteManagementActivityStore;
  readonly management: SqliteManagementPreferenceStore;
  readonly workMode: SqliteWorkModePreferenceStore;
  readonly marks: SqliteMonitorDeliveryMarkStore;
  readonly campaign: CampaignService;
  readonly prospective: ProspectiveService;
  readonly production: CampaignProductionService;
  readonly intervention: InterventionService;
  readonly scope: CampaignMonitorScopePort;
  readonly clock: { value: string };
  readonly prospectClock: { value: string };
  close(): void;
}

const openRigs: Rig[] = [];
afterEach(() => {
  for (const rig of openRigs.splice(0)) rig.close();
});

function makeRig(): Rig {
  const dir = mkdtempSync(join(tmpdir(), "pal-ac-mon-"));
  const clock = { value: FIXED_NOW };
  const prospectClock = { value: FIXED_NOW };
  const store = new SqliteCampaignStore(join(dir, "campaign.sqlite"));
  const workStore = new EventStore(join(dir, "work.sqlite"), { clock: () => FIXED_NOW });
  const activity = new SqliteManagementActivityStore(join(dir, "activity.sqlite"));
  const management = new SqliteManagementPreferenceStore(join(dir, "management.sqlite"), {
    clock: () => FIXED_NOW,
  });
  const workMode = new SqliteWorkModePreferenceStore(join(dir, "operating.sqlite"), {
    clock: () => FIXED_NOW,
  });
  const marks = new SqliteMonitorDeliveryMarkStore(join(dir, "marks.sqlite"));

  const institutions: CampaignInstitutionReader = {
    inspectEpoch: async (institutionId: string) => ({
      state: "known" as const,
      value: { ...EPOCH, institutionId },
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
  const prospective = makeProspectiveService({
    store,
    allocateWatchId: () => `w-${++watch}`,
    clock: () => prospectClock.value,
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

  const rig: Rig = {
    dir,
    store,
    workStore,
    activity,
    management,
    workMode,
    marks,
    campaign,
    prospective,
    production,
    intervention,
    scope: linkedCampaignMonitorScope({ store }),
    clock,
    prospectClock,
    close() {
      for (const closeable of [marks, workMode, management, activity]) {
        try {
          closeable.close();
        } catch {
          /* already closed */
        }
      }
      try {
        workStore.close();
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

async function createCampaign(rig: Rig, campaignId = CAMPAIGN): Promise<void> {
  await rig.campaign.createCampaign({ campaignId, institutionId: INSTITUTION, statement: "root" });
}

async function linkProject(
  rig: Rig,
  campaignId = CAMPAIGN,
  project: CampaignProjectRef = PROJECT_REF,
): Promise<void> {
  await rig.intervention.register({
    campaignId,
    project,
    purpose: "test",
    targetHypothesisIds: [],
  });
}

async function seedDormant(
  rig: Rig,
  watches: readonly CampaignWatchDraft[],
  campaignId = CAMPAIGN,
): Promise<readonly string[]> {
  const result = await rig.production.admitWait({
    campaignId,
    reason: "no useful action now",
    watches,
  });
  if (result.status !== "dormant") throw new Error(`expected dormant, got ${result.status}`);
  return result.watchIds;
}

/** Seed DORMANT + a canonical trigger + a WAKING cycle + a canonical reconciliation. */
async function seedReconciling(rig: Rig): Promise<string> {
  await createCampaign(rig);
  await linkProject(rig);
  const watchIds = await seedDormant(rig, [
    { condition: { kind: "not_before", at: PAST }, reason: "review later" },
  ]);
  const watchId = watchIds[0]!;
  await rig.prospective.recordTrigger({ campaignId: CAMPAIGN, watchId, cause: "time reached" });
  const start = await rig.production.beginWake({
    campaignId: CAMPAIGN,
    cause: { kind: "watch", watchId },
  });
  if (start.status !== "started") throw new Error(`expected started wake, got ${start.status}`);
  const reconciled = await rig.production.reconcileCurrentWorld({
    campaignId: CAMPAIGN,
    wakeCycle: start.wakeCycleId,
    wakeCause: { kind: "watch", watchId },
  });
  if (reconciled.status !== "reconciled" && reconciled.status !== "no_active_commitment") {
    throw new Error(`expected reconciliation, got ${reconciled.status}`);
  }
  return start.wakeCycleId;
}

async function setPreference(
  rig: Rig,
  baseMode: "FOCUS" | "EXPLORE" | "COORDINATE",
  modifiers: readonly ("VERIFY" | "MONITOR")[],
): Promise<void> {
  await rig.workMode.set({ projectId: PROJECT, baseMode, modifiers, updatedBy: "operator:test" });
}

function driverOf(
  rig: Rig,
  options: {
    readonly activation?: CampaignWakeActivationPort;
    readonly tickSource?: MonitorTickSourcePort;
    readonly policy?: Partial<typeof DEFAULT_CAMPAIGN_MONITOR_POLICY>;
    readonly scope?: CampaignMonitorScopePort;
    readonly projectId?: string;
  } = {},
) {
  return makeCampaignMonitorDriver({
    projectId: options.projectId ?? PROJECT,
    workMode: rig.workMode,
    scope: options.scope ?? rig.scope,
    prospective: rig.prospective,
    production: rig.production,
    history: { readEvents: (campaignId: string) => rig.store.replay(campaignId) },
    activation: options.activation ?? nullCampaignWakeActivation(),
    marks: rig.marks,
    clock: () => rig.clock.value,
    ...(options.policy === undefined ? {} : { policy: options.policy }),
    ...(options.tickSource === undefined ? {} : { tickSource: options.tickSource }),
  });
}

async function typesOf(rig: Rig, campaignId = CAMPAIGN): Promise<readonly string[]> {
  return (await rig.store.replay(campaignId)).map((event) => event.type);
}

async function countOf(rig: Rig, type: string, campaignId = CAMPAIGN): Promise<number> {
  return (await typesOf(rig, campaignId)).filter((entry) => entry === type).length;
}

async function workEventCount(rig: Rig): Promise<number> {
  const row = rig.workStore.connection
    .prepare("SELECT COUNT(*) AS n FROM events")
    .get() as { n: number };
  return Number(row.n);
}

function tablesOf(path: string): readonly string[] {
  const database = new DatabaseSync(path);
  try {
    const rows = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as unknown as { name: string }[];
    return Object.freeze(rows.map((row) => String(row.name)));
  } finally {
    database.close();
  }
}

function onlyCampaign(tick: CampaignMonitorTickResult) {
  const outcome = tick.campaigns[0];
  if (outcome === undefined) throw new Error("expected exactly one scoped campaign outcome");
  return outcome;
}

/* -------------------------------------------------------------------------- *
 * AC-N01 … AC-N05 — structural firewalls
 * -------------------------------------------------------------------------- */

describe("G10-AC structural firewalls", () => {
  it("AC-N01 a MONITOR preference alone creates no Watch", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const driver = driverOf(rig);

    const before = await countOf(rig, "WATCH_INSTALLED");
    for (let i = 0; i < 3; i += 1) await driver.tick();
    expect(await countOf(rig, "WATCH_INSTALLED")).toBe(before);
    expect(before).toBe(0);
    expect((await rig.store.campaigns()).length).toBe(1);
  });

  it("AC-N02 a MONITOR preference alone creates no Campaign", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const driver = driverOf(rig);

    const before = (await rig.store.campaigns()).length;
    for (let i = 0; i < 3; i += 1) await driver.tick();
    expect((await rig.store.campaigns()).length).toBe(before);
    expect(before).toBe(1);
    // And it never created a second campaign anywhere in the store.
    expect((await rig.store.campaigns()).map((definition) => definition.campaignId)).toEqual([
      CAMPAIGN,
    ]);
  });

  it("AC-N03 a tick grants no authority and creates only watch/wake/reconciliation events", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "review later" },
    ]);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const driver = driverOf(rig);

    const before = new Set((await rig.store.replay(CAMPAIGN)).map((event) => event.eventId));
    const first = await driver.tick();
    const second = await driver.tick();
    const created = (await rig.store.replay(CAMPAIGN)).filter((event) => !before.has(event.eventId));

    expect(created.length).toBeGreaterThan(0);
    for (const event of created) {
      expect(MONITOR_EVENT_FAMILY.has(event.type)).toBe(true);
      expect(event.type).not.toMatch(/AUTHORITY|PROOF|BOUNDARY|ADMITTED|COMPILED/);
    }
    expect(created.map((event) => event.type)).toContain("WAKE_STARTED");
    // The driver's own return value carries no authority artifact vocabulary.
    expect(JSON.stringify({ first, second })).not.toMatch(/authority|boundary|proof|commitment/i);
  });

  it("AC-N04 the driver owns no canonical truth and creates no monitoring table", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "review later" },
    ]);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const driver = driverOf(rig);

    expect(Object.keys(driver).sort()).toEqual(["dispose", "previewTick", "start", "status", "stop", "tick"]);
    for (const key of Object.keys(driver)) expect(key).not.toMatch(/store|db|table|close/i);
    expect((driver as unknown as Record<string, unknown>).store).toBeUndefined();

    const campaignTablesBefore = tablesOf(join(rig.dir, "campaign.sqlite"));
    await driver.tick();
    await driver.tick();
    const campaignTablesAfter = tablesOf(join(rig.dir, "campaign.sqlite"));
    expect(campaignTablesAfter).toEqual(campaignTablesBefore);
    expect([...campaignTablesAfter].sort()).toEqual(["campaign_definitions", "campaign_events"]);
    // The ONLY deployment-local table monitoring owns is the delivery marks.
    expect(tablesOf(join(rig.dir, "marks.sqlite"))).toEqual(["monitor_delivery_marks"]);
  });

  it("AC-N05 previewTick is read-only: no canonical write and no delivery mark", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "review later" },
    ]);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const driver = driverOf(rig);

    const before = (await rig.store.replay(CAMPAIGN)).length;
    const preview = await driver.previewTick();
    expect((await rig.store.replay(CAMPAIGN)).length).toBe(before);
    expect(rig.marks.list(PROJECT)).toHaveLength(0);
    // It still reports what a real tick WOULD do.
    expect(onlyCampaign(preview).triggeredWatchIds.length).toBe(1);
    expect(onlyCampaign(preview).beganWake).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * AC-N06 … AC-N12 — incomplete watches, no Work, no hidden timer
 * -------------------------------------------------------------------------- */

describe("G10-AC incomplete watches and the opt-in gate", () => {
  it("AC-N06 an incomplete watch never triggers and the detail names the missing source", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    // No external-signal port is configured on the prospective service.
    await seedDormant(rig, [
      { condition: { kind: "external_signal", signalKey: "sig" }, reason: "wait for signal" },
    ]);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const driver = driverOf(rig);

    const tick = await driver.tick();
    expect(await countOf(rig, "WATCH_TRIGGERED")).toBe(0);
    expect(await countOf(rig, "WAKE_STARTED")).toBe(0);
    expect(onlyCampaign(tick).detail).toMatch(/no signal port/);
    const status = await driver.status();
    expect(status.activeWatchCount).toBe(1);
  });

  it("AC-N07 a WATCH_TRIGGERED creates no Work", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "review later" },
    ]);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const driver = driverOf(rig);

    await driver.tick();
    const types = await typesOf(rig);
    expect(types).toContain("WATCH_TRIGGERED");
    expect(types).toContain("WAKE_STARTED");
    expect(types).not.toContain("PROJECT_ADMITTED");
    expect(await workEventCount(rig)).toBe(0);
    expect(rig.activity.list(PROJECT)).toHaveLength(0);
  });

  it("AC-N08/N09/N10 no next-action compile/admit, no commitment accept, no proof publication", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "review later" },
    ]);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const driver = driverOf(rig);

    const before = new Set((await rig.store.replay(CAMPAIGN)).map((event) => event.eventId));
    await driver.tick();
    await driver.tick();
    const created = (await rig.store.replay(CAMPAIGN)).filter((event) => !before.has(event.eventId));
    for (const event of created) expect(MONITOR_EVENT_FAMILY.has(event.type)).toBe(true);

    const allTypes = await typesOf(rig);
    for (const forbidden of [
      "PROJECT_ADMITTED",
      "WAIT_ADMITTED",
      "NEXT_ACTION_COMPILED",
      "CAMPAIGN_COMMITMENT_RESOLVED",
      "PROOF_PUBLISHED",
      "BOUNDARY_DECLARED",
    ]) {
      expect(allTypes).not.toContain(forbidden);
    }

    // The dependency surface has no compiler/admission/authority port at all.
    const code = strip(SRC("driver.ts"));
    expect(code).not.toMatch(/compil|admit|authority|proof/i);
    // ...and no Work/Project/management store seam.
    expect(code).not.toMatch(/EventStore|ProjectController|ManagementActivity/);
  });

  it("AC-N11 MONITOR absent disables new automatic scans", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "review later" },
    ]);
    await setPreference(rig, "FOCUS", []); // no MONITOR
    const driver = driverOf(rig);

    // The watch condition IS satisfied (not_before is in the past).
    const scan = await rig.prospective.scanWatches(CAMPAIGN);
    expect(scan.every((entry) => entry.status === "triggered")).toBe(true);

    const tick = await driver.tick();
    expect(tick.enabled).toBe(false);
    expect(tick.disabledReason).toMatch(/MONITOR/);
    expect(await countOf(rig, "WATCH_TRIGGERED")).toBe(0);
    expect(await countOf(rig, "WAKE_STARTED")).toBe(0);
  });

  it("AC-N12 a preference alone starts no hidden timer", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "review later" },
    ]);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    // No tick source is configured.
    const driver = driverOf(rig);

    expect((await driver.status()).tickSource).toBeNull();
    await driver.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const status = await driver.status();
    expect(status.driverStarted).toBe(true);
    expect(status.tickSource).toBeNull();
    expect(await countOf(rig, "WAKE_STARTED")).toBe(0);
    expect(await countOf(rig, "WATCH_TRIGGERED")).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * AC-N15 — scoping, never a global scan
 * -------------------------------------------------------------------------- */

describe("G10-AC monitor scope", () => {
  it("AC-N15 linkedCampaignMonitorScope returns only the linked campaign", async () => {
    const rig = makeRig();
    await createCampaign(rig, CAMPAIGN);
    await createCampaign(rig, OTHER_CAMPAIGN);
    await linkProject(rig, CAMPAIGN, PROJECT_REF);
    await linkProject(rig, OTHER_CAMPAIGN, OTHER_PROJECT_REF);

    const linked = linkedCampaignMonitorScope({ store: rig.store });
    expect(await linked.campaignIdsForProject(PROJECT)).toEqual([CAMPAIGN]);
    expect(await linked.campaignIdsForProject(OTHER_PROJECT)).toEqual([OTHER_CAMPAIGN]);
    expect(await linked.campaignIdsForProject("proj-unlinked")).toEqual([]);

    // The honest default monitors nothing...
    expect(await emptyCampaignMonitorScope().campaignIdsForProject(PROJECT)).toEqual([]);
    // ...and an explicit allowlist is exactly what the operator named.
    const allowlisted = allowlistCampaignMonitorScope({ campaignIds: [OTHER_CAMPAIGN, CAMPAIGN] });
    expect(await allowlisted.campaignIdsForProject(PROJECT)).toEqual([CAMPAIGN, OTHER_CAMPAIGN]);
    const composed = composedCampaignMonitorScope({
      scopes: [linked, allowlistCampaignMonitorScope({ campaignIds: ["camp-explicit"] })],
    });
    expect(await composed.campaignIdsForProject(PROJECT)).toEqual([CAMPAIGN, "camp-explicit"]);
  });
});

/* -------------------------------------------------------------------------- *
 * AC-N16 … AC-N23 — the crash matrix and duplicate suppression
 * -------------------------------------------------------------------------- */

describe("G10-AC crash matrix and duplicate suppression", () => {
  it("AC-N16 trigger-before-wake recovery starts exactly one wake", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    const watchIds = await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "review later" },
    ]);
    const watchId = watchIds[0]!;
    // The trigger is canonical; the wake was never begun (the "crash" seam).
    await rig.prospective.recordTrigger({ campaignId: CAMPAIGN, watchId, cause: "time reached" });
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const driver = driverOf(rig);

    const tick = await driver.tick();
    expect(await countOf(rig, "WATCH_TRIGGERED")).toBe(1);
    expect(await countOf(rig, "WAKE_STARTED")).toBe(1);
    expect(onlyCampaign(tick).beganWake).toBe(true);
    expect(onlyCampaign(tick).detail).toMatch(/pending wake/);
  });

  it("AC-N17 wake-before-reconciliation continues the SAME wake cycle", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    const watchIds = await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "review later" },
    ]);
    const watchId = watchIds[0]!;
    await rig.prospective.recordTrigger({ campaignId: CAMPAIGN, watchId, cause: "time reached" });
    const start = await rig.production.beginWake({
      campaignId: CAMPAIGN,
      cause: { kind: "watch", watchId },
    });
    if (start.status !== "started") throw new Error(`expected started, got ${start.status}`);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const driver = driverOf(rig);

    const tick = await driver.tick();
    expect(onlyCampaign(tick).wakeCycleId).toBe(start.wakeCycleId);
    expect(onlyCampaign(tick).reconciled).toBe(true);
    expect(await countOf(rig, "WAKE_STARTED")).toBe(1);
    expect(await countOf(rig, "RECONCILIATION_COMMITTED")).toBe(1);
  });

  it("AC-N18 reconciliation-before-activation yields a deterministic signalId across drivers", async () => {
    const rig = makeRig();
    const wakeCycleId = await seedReconciling(rig);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const activation = recordingCampaignWakeActivation();
    const first = driverOf(rig, { activation, policy: { redeliveryAfterMs: 0 } });
    const second = driverOf(rig, { activation, policy: { redeliveryAfterMs: 0 } });

    await first.tick();
    const firstStatus = await first.status();
    await second.tick();
    const secondStatus = await second.status();

    expect(firstStatus.lastActivation).not.toBeNull();
    expect(secondStatus.lastActivation).not.toBeNull();
    expect(firstStatus.lastActivation!.signalId).toBe(secondStatus.lastActivation!.signalId);
    expect(firstStatus.lastActivation!.wakeCycleId).toBe(wakeCycleId);
    // Two independent drivers attempted delivery; the IDENTITY never moved.
    expect(activation.signals.length).toBe(2);
    expect(activation.signals[0]!.signalId).toBe(activation.signals[1]!.signalId);
    expect(rig.marks.get(activation.signals[0]!.signalId)!.attemptCount).toBe(2);
  });

  it("AC-N19 activation failure preserves the wake and retries on a later tick", async () => {
    const rig = makeRig();
    const wakeCycleId = await seedReconciling(rig);
    await setPreference(rig, "FOCUS", ["MONITOR"]);

    let fail = true;
    let attempts = 0;
    const flaky: CampaignWakeActivationPort = {
      adapterId: "test:flaky",
      async activate() {
        attempts += 1;
        return fail
          ? { activated: false, detail: "the host is unreachable" }
          : { activated: true, detail: "delivered on retry" };
      },
    };
    const driver = driverOf(rig, { activation: flaky, policy: { redeliveryAfterMs: 0 } });

    const beforeEvents = (await rig.store.replay(CAMPAIGN)).length;
    const first = await driver.tick();
    expect(onlyCampaign(first).delivered).toBe(false);
    expect(attempts).toBe(1);
    // The canonical wake history is untouched by a host failure.
    expect((await rig.store.replay(CAMPAIGN)).length).toBe(beforeEvents);

    fail = false;
    const second = await driver.tick();
    expect(onlyCampaign(second).delivered).toBe(true);
    expect(attempts).toBe(2);

    const signalId = (await driver.status()).lastActivation!.signalId;
    expect(rig.marks.get(signalId)!.attemptCount).toBe(2);
    expect(await countOf(rig, "WAKE_STARTED")).toBe(1);
    expect(await countOf(rig, "RECONCILIATION_COMMITTED")).toBe(1);
    expect(await countOf(rig, "WAKE_CYCLE_COMPLETED")).toBe(0);
    expect(wakeCycleId).toBe(onlyCampaign(second).wakeCycleId);
  });

  it("AC-N20 activation success is not wake completion", async () => {
    const rig = makeRig();
    await seedReconciling(rig);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const driver = driverOf(rig, { activation: recordingCampaignWakeActivation() });

    const tick = await driver.tick();
    expect(onlyCampaign(tick).delivered).toBe(true);
    expect(await countOf(rig, "WAKE_CYCLE_COMPLETED")).toBe(0);
    expect(await rig.production.lifecycleState(CAMPAIGN)).toBe("RECONCILING");
  });

  it("AC-N21 redelivery creates no second wake", async () => {
    const rig = makeRig();
    await seedReconciling(rig);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const activation = recordingCampaignWakeActivation();
    const driver = driverOf(rig, { activation, policy: { redeliveryAfterMs: 0 } });

    await driver.tick();
    await driver.tick();

    expect(activation.signals.length).toBe(2);
    expect(activation.signals[0]!.signalId).toBe(activation.signals[1]!.signalId);
    expect(await countOf(rig, "WAKE_STARTED")).toBe(1);
    expect(await countOf(rig, "WAKE_CYCLE_COMPLETED")).toBe(0);
  });

  it("AC-N22 overlapping ticks create no duplicate semantic wake", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "review later" },
    ]);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const driver = driverOf(rig);

    const [left, right] = await Promise.all([driver.tick(), driver.tick()]);
    expect(left).toEqual(right);
    expect(await countOf(rig, "WAKE_STARTED")).toBe(1);
    expect(await countOf(rig, "WATCH_TRIGGERED")).toBe(1);
  });

  it("AC-N23 multiple triggered watches record all triggers but one wake from the smallest watchId", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    const watchIds = await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "first" },
      { condition: { kind: "not_before", at: PAST }, reason: "second" },
    ]);
    expect(watchIds).toHaveLength(2);
    const smallest = [...watchIds].sort()[0]!;
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const driver = driverOf(rig);

    const tick = await driver.tick();
    expect(await countOf(rig, "WATCH_TRIGGERED")).toBe(2);
    expect(await countOf(rig, "WAKE_STARTED")).toBe(1);
    expect([...onlyCampaign(tick).triggeredWatchIds].sort()).toEqual([...watchIds].sort());

    const wake = (await rig.store.replay(CAMPAIGN)).find((event) => event.type === "WAKE_STARTED");
    expect((wake!.payload as { cause: string }).cause).toBe(`watch:${smallest}`);
  });
});

/* -------------------------------------------------------------------------- *
 * AC-N24 — DIRECT involvement is not wideened by a wake
 * -------------------------------------------------------------------------- */

describe("G10-AC management isolation", () => {
  it("AC-N24 a DIRECT wake causes no automatic management mutation", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "review later" },
    ]);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    // The default posture is involvement DIRECT (never silently widened).
    expect((await rig.management.get(PROJECT)).involvement).toBe("DIRECT");
    const driver = driverOf(rig);

    await driver.tick();
    await driver.tick();

    expect(rig.activity.list(PROJECT)).toHaveLength(0);
    expect(await workEventCount(rig)).toBe(0);
    const projectRow = rig.workStore.connection
      .prepare("SELECT revision FROM projects WHERE project_id = ?")
      .get(PROJECT) as { revision: number } | undefined;
    expect(projectRow).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * AC-N26 … AC-N29 — disabling, recipes, posture
 * -------------------------------------------------------------------------- */

describe("G10-AC disabling and posture integration", () => {
  it("AC-N26 disabling MONITOR does not cancel watches", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    await seedDormant(rig, [
      { condition: { kind: "not_before", at: FUTURE }, reason: "review much later" },
    ]);
    await setPreference(rig, "FOCUS", ["MONITOR"]);

    expect((await rig.prospective.watchStates(CAMPAIGN)).map((state) => state.status)).toEqual(["ACTIVE"]);

    await setPreference(rig, "FOCUS", []); // MONITOR disabled
    await driverOf(rig).tick();

    const states = await rig.prospective.watchStates(CAMPAIGN);
    expect(states.map((state) => state.status)).toEqual(["ACTIVE"]);
    expect(states.some((state) => state.status === "CANCELLED")).toBe(false);
    expect(await countOf(rig, "WATCH_CANCELLED")).toBe(0);
  });

  it("AC-N27 EXPLORE + MONITOR does not widen recipe compatibility", async () => {
    const registry = builtinRecipeRegistry();
    expect(registry.get("explore.v1")!.supportedModifiers).not.toContain("MONITOR");
    expect(registry.get("focus.v1")!.supportedModifiers).toContain("MONITOR");

    // The preference itself is accepted (the modifier is a real capability)...
    const rig = makeRig();
    await rig.workMode.set({
      projectId: PROJECT,
      baseMode: "EXPLORE",
      modifiers: ["MONITOR"],
      updatedBy: "operator:test",
    });
    const effective = await rig.workMode.get(PROJECT);
    expect(effective.source).toBe("stored");
    expect(effective.preference.baseMode).toBe("EXPLORE");
    expect(effective.preference.modifiers).toContain("MONITOR");
  });

  it("AC-N28 monitor.v1 readiness is honest about the runtime wiring", async () => {
    const monitor = builtinRecipeRegistry().get("monitor.v1")!;
    expect(monitor.readiness).toBe("CONDITIONAL");
    expect(monitor.limitations).toContain("requires an explicit monitor tick/runtime wiring");
    expect(monitor.limitations).toContain("a MONITOR preference alone does not create watches");
    expect(monitor.limitations).toContain("delivery is at-least-once");
  });

  it("AC-N29 MONITOR availability follows the REAL runtime wiring", async () => {
    const registry = builtinRecipeRegistry();
    const preference = {
      preference: {
        schemaVersion: 1 as const,
        projectId: PROJECT,
        baseMode: "FOCUS" as const,
        modifiers: Object.freeze(["MONITOR"] as const),
        updatedAt: FIXED_NOW,
        updatedBy: "operator:test",
        digest: "f".repeat(64),
      },
      source: "stored" as const,
    };

    const withoutRuntime = deriveEffectiveModeStatus({
      preference,
      registry,
      capabilities: {
        independentVerifier: false,
        monitorConditionSource: false,
        reasoningBranches: false,
        independentPeer: false,
      },
    });
    const monitorWithout = withoutRuntime.find((row) => row.capability === "MONITOR")!;
    expect(monitorWithout.preferred).toBe(true);
    expect(["UNAVAILABLE", "PREVIEW_ONLY"]).toContain(monitorWithout.availability);
    expect(monitorWithout.reason).toMatch(/no monitor runtime is composed/);

    const withRuntime = deriveEffectiveModeStatus({
      preference,
      registry,
      capabilities: {
        independentVerifier: false,
        monitorConditionSource: false,
        monitorRuntime: true,
        monitorRuntimeProvenance: "first_party",
        reasoningBranches: false,
        independentPeer: false,
      },
    });
    const monitorWith = withRuntime.find((row) => row.capability === "MONITOR")!;
    expect(monitorWith.availability).toBe("AVAILABLE");
    expect(monitorWith.reason).toMatch(/Campaign monitor runtime is composed/);
  });
});

/* -------------------------------------------------------------------------- *
 * AC-N30 — the delivery marks table is the only deployment-local truth
 * -------------------------------------------------------------------------- */

describe("G10-AC deployment-local footprint", () => {
  it("AC-N30 a full pass writes only the delivery marks table", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "review later" },
    ]);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const driver = driverOf(rig, { activation: recordingCampaignWakeActivation() });

    await driver.tick();
    await driver.tick();

    expect(tablesOf(join(rig.dir, "marks.sqlite"))).toEqual(["monitor_delivery_marks"]);
    expect(rig.marks.list(PROJECT).length).toBeGreaterThan(0);
    // The campaign store gained no monitoring-only table.
    expect([...tablesOf(join(rig.dir, "campaign.sqlite"))].sort()).toEqual([
      "campaign_definitions",
      "campaign_events",
    ]);
  });
});

/* -------------------------------------------------------------------------- *
 * Positive golden + activation failure
 * -------------------------------------------------------------------------- */

describe("G10-AC golden wake path", () => {
  it("golden: a past not_before watch under MONITOR produces a cold-resumed wake", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    const watchIds = await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "review later" },
    ]);
    const watchId = watchIds[0]!;
    await setPreference(rig, "FOCUS", ["MONITOR"]);

    const messages: string[] = [];
    const activation = dshCampaignWakeAdapter({
      agents: {
        get: () => undefined,
        resume: async () => ({
          agent: {
            followup: (message: string) => {
              messages.push(message);
            },
          },
        }),
      },
      resumeSessionId: PRINCIPAL_SESSION,
    });
    const driver = driverOf(rig, { activation });

    // §42: ONE tick carries the whole mechanical progression - the driver
    // re-derives its continuation after each successful write and continues
    // while it makes progress, stopping at the activation phase.
    const wakeTick = await driver.tick();
    expect(await countOf(rig, "WATCH_TRIGGERED")).toBe(1);
    expect(await countOf(rig, "WAKE_STARTED")).toBe(1);
    expect(await countOf(rig, "RECONCILIATION_COMMITTED")).toBe(1);
    expect(onlyCampaign(wakeTick).beganWake).toBe(true);
    expect(onlyCampaign(wakeTick).reconciled).toBe(true);

    // A further tick delivers nothing new: the wake cycle is unchanged and the
    // one signal identity was already delivered.
    const outcome = onlyCampaign(wakeTick);
    expect(await rig.production.lifecycleState(CAMPAIGN)).toBe("RECONCILING");
    expect(outcome.activationPhase).toBe("RECONCILIATION_READY");
    expect(outcome.delivered).toBe(true);
    await driver.tick();
    expect(await countOf(rig, "WAKE_STARTED")).toBe(1);

    // Exactly one cold-resumed signal, carrying the exact semantic refs.
    expect(messages).toHaveLength(1);
    const signal = (await driver.status()).lastActivation!;
    expect(signal.campaignId).toBe(CAMPAIGN);
    expect(signal.wakeCycleId).toBe(outcome.wakeCycleId);
    expect(signal.cause).toBe(`watch:${watchId}`);
    expect(messages[0]!.split("\n")[0]).toMatch(/Palimpsest campaign wake/);
    expect(messages[0]).toContain(`campaign: ${CAMPAIGN}`);
    expect(messages[0]).toContain(`wake cycle: ${outcome.wakeCycleId}`);
  });

  it("activation failure: the wake survives and status still reports it in flight", async () => {
    const rig = makeRig();
    const wakeCycleId = await seedReconciling(rig);
    await setPreference(rig, "FOCUS", ["MONITOR"]);
    const failing: CampaignWakeActivationPort = {
      adapterId: "test:failing",
      async activate() {
        return { activated: false, detail: "the deployment runtime refused the wake" };
      },
    };
    const driver = driverOf(rig, { activation: failing });

    const tick = await driver.tick();
    expect(onlyCampaign(tick).delivered).toBe(false);
    expect(await countOf(rig, "WAKE_CYCLE_COMPLETED")).toBe(0);
    expect(await countOf(rig, "WAKE_STARTED")).toBe(1);
    expect(await countOf(rig, "RECONCILIATION_COMMITTED")).toBe(1);

    const status = await driver.status();
    expect(status.inFlightWakeCount).toBe(1);
    expect(status.lastActivation).not.toBeNull();
    expect(status.lastActivation!.signalId).toBe(
      buildCampaignWakeActivationSignal({
        projectId: PROJECT,
        campaignId: CAMPAIGN,
        wakeCycleId,
        cause: status.lastActivation!.cause,
        phase: status.lastActivation!.phase,
        reconciliationDigest: status.lastActivation!.reconciliationDigest,
        blockerCode: status.lastActivation!.blockerCode,
        detail: status.lastActivation!.detail,
        createdAt: status.lastActivation!.createdAt,
      }).signalId,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Supporting primitives
 * -------------------------------------------------------------------------- */

describe("G10-AC supporting primitives", () => {
  it("intervalMonitorTickSource refuses a missing/non-positive interval", () => {
    expect(() => intervalMonitorTickSource({ intervalMs: 0 as number })).toThrow(TypeError);
    expect(() => intervalMonitorTickSource({} as never)).toThrow(/explicit positive integer/);
    const source = intervalMonitorTickSource({ intervalMs: 1000 });
    expect(source.status()).toMatchObject({ running: false, kind: "interval", intervalMs: 1000 });
  });

  it("manualMonitorTickSource only fires when asked", async () => {
    const source = manualMonitorTickSource();
    const seen: string[] = [];
    await source.start((trigger) => {
      seen.push(trigger);
    });
    expect(source.status()).toMatchObject({ running: true, kind: "manual", fires: 0 });
    await source.fire();
    await source.fire("signal_hint");
    expect(seen).toEqual(["manual", "signal_hint"]);
    await source.stop();
    expect(source.status().running).toBe(false);
  });

  it("deriveMonitorContinuation derives trigger-before-wake from history alone", async () => {
    const rig = makeRig();
    await createCampaign(rig);
    await linkProject(rig);
    const watchIds = await seedDormant(rig, [
      { condition: { kind: "not_before", at: PAST }, reason: "review later" },
    ]);
    const watchId = watchIds[0]!;
    await rig.prospective.recordTrigger({ campaignId: CAMPAIGN, watchId, cause: "time reached" });
    const derivation = deriveMonitorContinuation(await rig.store.replay(CAMPAIGN));
    expect(derivation.triggeredWatchIds).toEqual([watchId]);
    expect(derivation.inFlightWakeCycleId).toBeNull();
    expect(pendingWakeCauseOf(derivation)).toEqual({ kind: "watch", watchId });
  });
});
