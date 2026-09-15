/**
 * G10-AC-R closure — DEFECT REPRODUCTION (AC-R-01 … AC-R-07).
 *
 * Run before the fixes to reproduce; after the fixes every item must read
 * defect:false.
 *
 * Usage: node scripts/monitor/acr0-repro.mjs
 *
 * Every item exercises the REAL built modules from `dist/` (pathToFileURL, the
 * Windows-safe pattern used by `scripts/monitor/cold-resume.mjs`): real
 * Campaign/Prospective/Production services, a real SqliteCampaignStore, a real
 * work-mode preference store, the real monitor driver and the real posture
 * derivation. Only host adapters (tick source, wake activation port) and clocks
 * are stubbed.
 *
 * HONEST notes about what the live product can and cannot expose today:
 *
 *  A (AC-R-03) — The false "MONITOR AVAILABLE" claim lives in
 *    `deriveEffectiveModeStatus` (src/project_operating/posture.ts), the exact
 *    function the operating posture uses. `installPalimpsest` DOES declare
 *    `monitorRuntime: true` whenever a scope is composed, but
 *    `makeProjectManagementService`'s `operatingCapabilitiesOf()` narrows that
 *    declaration to four fields and DROPS `monitorRuntime`/provenance, so through
 *    the live install the posture currently under-reports (UNAVAILABLE) instead
 *    of over-reporting. Item A therefore reproduces the over-claim through the
 *    real posture deriver fed with exactly what the install declares, and also
 *    reports the observed install-level posture, marked as an honest observation.
 *
 *  C (AC-R-02) — At baseline `installPalimpsest` never starts the configured tick
 *    source, so the leak is only observable once something has started it. Item C
 *    therefore calls `installed.monitor.start()` explicitly before dispose (which
 *    is the undocumented workaround AC-R-01 describes). After the fix the install
 *    starts the source itself and the explicit call is an idempotent no-op.
 *
 * Exit code: 0 when the report is internally consistent with a known phase —
 * either every one of A–D reproduced (defect:true, the pre-fix baseline) or none
 * of them (defect:false, the post-fix state), with E always false. Non-zero
 * otherwise.
 */

import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..", "..");
const mod = (...segments) => pathToFileURL(join(REPO, ...segments)).href;

const PROJECT = "acr0-project";
const INSTITUTION = "acr0-institution";
const CAMPAIGN = "acr0-campaign";
const PAST = "2026-01-01T00:00:00Z";
const CLOCK = "2026-09-16T00:00:00Z";

const campaignMod = await import(mod("dist/src/campaign/index.js"));
const monitorMod = await import(mod("dist/src/monitor/index.js"));
const operatingMod = await import(mod("dist/src/project_operating/index.js"));
const recipesMod = await import(mod("dist/src/recipes/index.js"));
const workspaceMod = await import(mod("dist/src/project_workspace/index.js"));
const effectsMod = await import(mod("dist/src/effects/index.js"));
const installMod = await import(mod("dist/src/install.js"));

const items = [];
const record = (id, fields, defect) => items.push({ id, ...fields, defect });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CONTEXT = { tools: { register: () => undefined } };

/* -------------------------------------------------------------------------- *
 * A real campaign world (deterministic allocators so two fixtures are
 * semantically identical and therefore canonically comparable).
 * -------------------------------------------------------------------------- */

function campaignWorld(store, clock) {
  let commitment = 0;
  let watch = 0;
  let wake = 0;
  let observation = 0;
  let revision = 0;
  let interventionId = 0;
  const institutions = {
    inspectEpoch: async (institutionId) => ({
      state: "known",
      value: { institutionId, epoch: 1, digest: "e".repeat(64) },
    }),
  };
  const work = { inspectProject: async () => ({ state: "known", value: "running" }) };
  const campaign = campaignMod.makeCampaignService({
    store,
    allocateCommitmentId: () => `cc-${++commitment}`,
    institutions,
  });
  const prospective = campaignMod.makeProspectiveService({
    store,
    allocateWatchId: () => `w-${++watch}`,
    clock,
  });
  const production = campaignMod.makeCampaignProductionService({
    store,
    institutions,
    work,
    allocateWakeCycleId: () => `wc-${++wake}`,
    allocateWatchId: () => `w-${++watch}`,
    allocateObservationId: () => `obs-${++observation}`,
    allocateRevisionId: () => `br-${++revision}`,
  });
  const intervention = campaignMod.makeInterventionService({
    store,
    allocateInterventionId: () => `iv-${++interventionId}`,
  });
  const seed = async () => {
    await campaign.createCampaign({ campaignId: CAMPAIGN, institutionId: INSTITUTION, statement: "wait" });
    await intervention.register({
      campaignId: CAMPAIGN,
      project: campaignMod.materializeCampaignProjectRef({
        projectId: PROJECT,
        revision: 0,
        digest: "d".repeat(64),
      }),
      purpose: "test",
      targetHypothesisIds: [],
    });
    const dormant = await production.admitWait({
      campaignId: CAMPAIGN,
      reason: "nothing useful yet",
      watches: [{ condition: { kind: "not_before", at: PAST }, reason: "review" }],
    });
    if (dormant.status !== "dormant") throw new Error(`expected DORMANT, got ${dormant.status}`);
  };
  return { store, campaign, prospective, production, intervention, seed };
}

function driverOver(world, workMode, clock, activation, tickSource) {
  return monitorMod.makeCampaignMonitorDriver({
    projectId: PROJECT,
    workMode,
    scope: monitorMod.linkedCampaignMonitorScope({ store: world.store }),
    prospective: {
      scanWatches: (campaignId) => world.prospective.scanWatches(campaignId),
      recordTriggers: (input) => world.prospective.recordTriggers(input),
      watchStates: (campaignId) => world.prospective.watchStates(campaignId),
    },
    production: {
      lifecycleState: (campaignId) => world.production.lifecycleState(campaignId),
      beginWake: (input) => world.production.beginWake(input),
      reconcileCurrentWorld: (input) => world.production.reconcileCurrentWorld(input),
    },
    history: { readEvents: (campaignId) => world.store.replay(campaignId) },
    activation: activation ?? monitorMod.nullCampaignWakeActivation(),
    clock,
    ...(tickSource === undefined ? {} : { tickSource }),
  });
}

/* -------------------------------------------------------------------------- *
 * A real install rig (scope + optional tick/activation).
 * -------------------------------------------------------------------------- */

async function installRig({ tickSource, activation } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pal-acr0-"));
  const clock = () => CLOCK;
  const campaignStore = new campaignMod.SqliteCampaignStore(join(dir, "campaign.sqlite"));
  const world = campaignWorld(campaignStore, clock);
  await world.seed();
  const workMode = new operatingMod.SqliteWorkModePreferenceStore(join(dir, "operating.sqlite"), { clock });
  await workMode.set({ projectId: PROJECT, baseMode: "FOCUS", modifiers: ["MONITOR"], updatedBy: "operator:repro" });
  const installed = installMod.installPalimpsest(CONTEXT, {
    projectId: PROJECT,
    databasePath: join(dir, "work.sqlite"),
    ordariumDatabasePath: join(dir, "ops.sqlite"),
    git: new effectsMod.FakeGitPort("c".repeat(40)),
    projectAssociationStore: new workspaceMod.SqliteProjectAssetAssociationStore(join(dir, "assoc.sqlite")),
    workModePreferenceStore: workMode,
    campaignStore,
    campaignInstitutionEpochPort: {
      inspectEpoch: async (institutionId) => ({
        state: "known",
        value: { institutionId, epoch: 1, digest: "e".repeat(64) },
      }),
    },
    campaignMonitorScope: monitorMod.linkedCampaignMonitorScope({ store: campaignStore }),
    campaignMonitorPolicy: { redeliveryAfterMs: 300_000 },
    ...(tickSource === undefined ? {} : { campaignMonitorTickSource: tickSource }),
    ...(activation === undefined ? {} : { campaignMonitorActivation: activation }),
  });
  return { dir, installed, campaignStore, workMode, world };
}

/* -------------------------------------------------------------------------- *
 * A (AC-R-03) — a scope-only runtime must NOT be reported AVAILABLE.
 * -------------------------------------------------------------------------- */

async function itemA() {
  // What the install declares for a scope-only composition: a first-party
  // runtime with NO tick source and NO real activation. Fed to the REAL posture
  // deriver.
  const workMode = new operatingMod.SqliteWorkModePreferenceStore(":memory:", { clock: () => CLOCK });
  await workMode.set({ projectId: PROJECT, baseMode: "FOCUS", modifiers: ["MONITOR"], updatedBy: "operator:repro" });
  const preference = await workMode.get(PROJECT);
  const rows = operatingMod.deriveEffectiveModeStatus({
    preference,
    registry: recipesMod.builtinRecipeRegistry(),
    capabilities: {
      independentVerifier: false,
      monitorConditionSource: false,
      reasoningBranches: false,
      independentPeer: false,
      monitorRuntime: true,
      monitorRuntimeProvenance: "first_party",
    },
  });
  workMode.close();
  const declared = rows.find((row) => row.capability === "MONITOR");

  // And the honest install-level observation (see the HONEST note in the header).
  const rig = await installRig();
  const installRow = (await rig.installed.projectManagement.posture()).workMode.effectiveStatus.find(
    (row) => row.capability === "MONITOR",
  );
  const capability =
    typeof rig.installed.monitor?.capability === "function" ? rig.installed.monitor.capability() : undefined;
  await rig.installed.dispose();

  const defect = declared.availability === "AVAILABLE" || installRow.availability === "AVAILABLE";
  record(
    "AC-R-03",
    {
      monitorComposed: rig.installed.monitor !== undefined,
      postureMonitorAvailability: installRow.availability,
      postureMonitorReason: installRow.reason,
      declaredScopeOnlyAvailability: declared.availability,
      declaredScopeOnlyReason: declared.reason,
      capabilityStartState: capability?.startState ?? null,
    },
    defect,
  );
}

/* -------------------------------------------------------------------------- *
 * B (AC-R-01) — install must START an explicitly supplied tick source.
 * -------------------------------------------------------------------------- */

async function itemB() {
  const tickSource = monitorMod.intervalMonitorTickSource({ intervalMs: 30 });
  const activation = monitorMod.recordingCampaignWakeActivation();
  const rig = await installRig({ tickSource, activation });
  // NEVER call start(): the install itself must initiate startup.
  await sleep(200);
  const status = await rig.installed.monitor.status();
  const fires = status.tickSource?.fires ?? 0;
  const driverStarted = status.driverStarted;
  await rig.installed.dispose();
  record("AC-R-01", { fires, driverStarted }, fires === 0);
}

/* -------------------------------------------------------------------------- *
 * C (AC-R-02) — dispose must STOP the monitor.
 * -------------------------------------------------------------------------- */

async function itemC() {
  const tickSource = monitorMod.intervalMonitorTickSource({ intervalMs: 30 });
  const activation = monitorMod.recordingCampaignWakeActivation();
  const rig = await installRig({ tickSource, activation });
  // Baseline install does not start the source; start it explicitly (the
  // undocumented workaround AC-R-01 describes) so the dispose leak is observable
  // in both phases. After the fix this is an idempotent no-op.
  await rig.installed.monitor.start();
  await sleep(120);
  const firesBeforeDispose = tickSource.status().fires;
  await rig.installed.dispose();
  await sleep(200);
  const firesAfterDispose = tickSource.status().fires;
  const stillRunning = tickSource.status().running;
  record(
    "AC-R-02",
    { firesBeforeDispose, firesAfterDispose, stillRunning },
    firesAfterDispose > firesBeforeDispose || stillRunning,
  );
}

/* -------------------------------------------------------------------------- *
 * D (AC-R-04) — equivalent triggers at different clocks must be canonically
 * identical.
 * -------------------------------------------------------------------------- */

async function itemD() {
  const runs = [];
  for (const clockValue of ["2026-09-16T00:00:00Z", "2027-12-25T12:34:56Z"]) {
    const dir = mkdtempSync(join(tmpdir(), "pal-acr0-d-"));
    const store = new campaignMod.SqliteCampaignStore(join(dir, "campaign.sqlite"));
    const world = campaignWorld(store, () => clockValue);
    await world.seed();
    const workMode = new operatingMod.SqliteWorkModePreferenceStore(join(dir, "operating.sqlite"), {
      clock: () => clockValue,
    });
    await workMode.set({ projectId: PROJECT, baseMode: "FOCUS", modifiers: ["MONITOR"], updatedBy: "operator:repro" });
    const driver = driverOver(world, workMode, () => clockValue);
    await driver.tick();
    const triggered = (await store.replay(CAMPAIGN)).find((event) => event.type === "WATCH_TRIGGERED");
    runs.push({
      clock: clockValue,
      eventId: triggered?.eventId ?? null,
      cause: triggered?.payload.cause ?? null,
    });
    await driver.dispose();
    workMode.close();
    store.close();
  }
  const defect = runs[0].eventId !== runs[1].eventId || runs[0].cause !== runs[1].cause;
  record(
    "AC-R-04",
    {
      firstClock: runs[0].clock,
      secondClock: runs[1].clock,
      firstEventId: runs[0].eventId,
      secondEventId: runs[1].eventId,
      firstCause: runs[0].cause,
      secondCause: runs[1].cause,
    },
    defect,
  );
}

/* -------------------------------------------------------------------------- *
 * E (AC-R-05/06) — baseline absence checks.
 * -------------------------------------------------------------------------- */

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

async function itemE() {
  const webFiles = walk(join(REPO, "web", "src"), []);
  const workspaceRendersMonitor = webFiles.some((file) => /monitor/i.test(readFileSync(file, "utf8")));
  const historyPath = join(REPO, "src", "project_operating", "history.ts");
  let historyText = "";
  try {
    historyText = readFileSync(historyPath, "utf8");
  } catch {
    historyText = "";
  }
  const operatingHistoryReferencesCampaignEvents = /WATCH_TRIGGERED|WAKE_STARTED/.test(historyText);
  record(
    "AC-R-05/06",
    {
      workspaceRendersMonitor,
      webFileCount: webFiles.length,
      operatingHistoryReferencesCampaignEvents,
    },
    false,
  );
}

await itemA();
await itemB();
await itemC();
await itemD();
await itemE();

const anyDefect = items.some((item) => item.defect);
const coreDefects = items.filter((item) => item.id.startsWith("AC-R-0") && item.id !== "AC-R-05/06").map((item) => item.defect);
const consistent =
  coreDefects.length === 4 &&
  coreDefects.every((value) => value === coreDefects[0]) &&
  items.filter((item) => item.id === "AC-R-05/06").every((item) => item.defect === false);

console.log(JSON.stringify({ items, anyDefect }, null, 2));
process.exit(consistent ? 0 : 1);
