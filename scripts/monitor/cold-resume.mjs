/**
 * G10-AC monitor runtime dogfood — COLD RESUME.
 *
 * Runs the real Campaign monitor driver over a real Campaign store in a temp
 * directory and proves the honest end-to-end shape of an automatic wake:
 *
 *   T0:      a `not_before` watch is installed and the Campaign is driven DORMANT.
 *   before T: a tick evaluates the scoped Campaign and NOTHING triggers.
 *   after T:  a tick records WATCH_TRIGGERED and starts exactly one wake; a second
 *             tick reconciles the world and cold-resumes the persisted principal.
 *
 * The activation adapter is DSH-style: `agents.get(id)` returns undefined (there is
 * NO resident principal), so `agents.resume({ resumeSessionId })` must be used -
 * that is the cold resume. The resumed principal's first turn is captured and its
 * first three lines are printed.
 *
 * Nothing here writes Work: a real Work EventStore is opened and its event count
 * is compared before/after the monitor pass.
 *
 * Usage: node scripts/monitor/cold-resume.mjs
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..", "..");
const mod = (...segments) => pathToFileURL(join(REPO, ...segments)).href;

const PROJECT = "cold-resume-project";
const INSTITUTION = "cold-resume-institution";
const CAMPAIGN = "cold-resume-campaign";
const PRINCIPAL_SESSION = "cold-resume-principal-session";
const T0 = "2026-09-16T00:00:00Z";

async function load() {
  const campaign = await import(mod("dist/src/campaign/index.js"));
  const monitor = await import(mod("dist/src/monitor/index.js"));
  const operating = await import(mod("dist/src/project_operating/index.js"));
  const state = await import(mod("dist/src/state/index.js"));
  return { campaign, monitor, operating, state };
}

function countWorkEvents(workStore) {
  const row = workStore.connection.prepare("SELECT COUNT(*) AS n FROM events").get();
  return Number(row.n);
}

async function main() {
  const { campaign, monitor, operating, state } = await load();
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-monitor-cold-resume-"));

  let now = "2026-09-15T00:00:00Z"; // strictly BEFORE T0

  const store = new campaign.SqliteCampaignStore(join(dir, "campaign.sqlite"));
  const workStore = new state.EventStore(join(dir, "work.sqlite"), { clock: () => now });
  const workMode = new operating.SqliteWorkModePreferenceStore(join(dir, "operating.sqlite"), {
    clock: () => now,
  });
  const marks = new monitor.SqliteMonitorDeliveryMarkStore(join(dir, "monitor-marks.sqlite"));

  const institutions = {
    inspectEpoch: async (institutionId) => ({
      state: "known",
      value: { institutionId, epoch: 1, digest: "e".repeat(64) },
    }),
  };
  const work = {
    inspectProject: async () => ({ state: "known", value: "running" }),
  };

  let commitment = 0;
  let watch = 0;
  let wake = 0;
  let observation = 0;
  let revision = 0;
  let intervention = 0;
  const campaignService = campaign.makeCampaignService({
    store,
    allocateCommitmentId: () => `cc-${++commitment}`,
    institutions,
  });
  const prospective = campaign.makeProspectiveService({
    store,
    allocateWatchId: () => `w-${++watch}`,
    clock: () => now,
  });
  const production = campaign.makeCampaignProductionService({
    store,
    institutions,
    work,
    allocateWakeCycleId: () => `wc-${++wake}`,
    allocateWatchId: () => `w-${++watch}`,
    allocateObservationId: () => `obs-${++observation}`,
    allocateRevisionId: () => `br-${++revision}`,
  });
  const interventionService = campaign.makeInterventionService({
    store,
    allocateInterventionId: () => `iv-${++intervention}`,
  });

  // --- 1. project-linked Campaign driven to DORMANT with a not_before watch ----
  await campaignService.createCampaign({
    campaignId: CAMPAIGN,
    institutionId: INSTITUTION,
    statement: "wait for the review date",
  });
  await interventionService.register({
    campaignId: CAMPAIGN,
    project: campaign.materializeCampaignProjectRef({
      projectId: PROJECT,
      revision: 0,
      digest: "d".repeat(64),
    }),
    purpose: "test",
    targetHypothesisIds: [],
  });
  const dormant = await production.admitWait({
    campaignId: CAMPAIGN,
    reason: "nothing useful until the review date",
    watches: [{ condition: { kind: "not_before", at: T0 }, reason: "review at T0" }],
  });
  if (dormant.status !== "dormant") throw new Error(`expected DORMANT, got ${dormant.status}`);

  // --- 2. the operator opt-in --------------------------------------------------
  await workMode.set({ projectId: PROJECT, baseMode: "FOCUS", modifiers: ["MONITOR"], updatedBy: "operator:dogfood" });

  // --- 3/4. the driver plus a DSH-style cold-resume adapter --------------------
  const messages = [];
  let resumeCalls = 0;
  const activation = monitor.dshCampaignWakeAdapter({
    agents: {
      // No resident principal: this is what makes the resume a COLD resume.
      get: () => undefined,
      resume: async ({ resumeSessionId }) => {
        resumeCalls += 1;
        return {
          agent: {
            followup: (message) => {
              messages.push({ resumeSessionId, message });
            },
          },
        };
      },
    },
    resumeSessionId: PRINCIPAL_SESSION,
  });

  const tickSource = monitor.manualMonitorTickSource();
  const driver = monitor.makeCampaignMonitorDriver({
    projectId: PROJECT,
    workMode,
    scope: monitor.linkedCampaignMonitorScope({ store }),
    prospective: {
      scanWatches: (campaignId) => prospective.scanWatches(campaignId),
      recordTriggers: (input) => prospective.recordTriggers(input),
      watchStates: (campaignId) => prospective.watchStates(campaignId),
    },
    production: {
      lifecycleState: (campaignId) => production.lifecycleState(campaignId),
      beginWake: (input) => production.beginWake(input),
      reconcileCurrentWorld: (input) => production.reconcileCurrentWorld(input),
    },
    history: { readEvents: (campaignId) => store.replay(campaignId) },
    activation,
    marks,
    tickSource,
    clock: () => now,
  });

  const baseline = new Set((await store.replay(CAMPAIGN)).map((event) => event.eventId));
  const workBefore = countWorkEvents(workStore);

  // --- 5. tick BEFORE T: nothing triggers -------------------------------------
  const beforeTick = await driver.tick();
  const beforeOutcome = beforeTick.campaigns[0];
  const beforeTrigger = beforeOutcome !== undefined && beforeOutcome.triggeredWatchIds.length > 0;
  console.log(
    `before T (${now} < ${T0}): scopedCampaigns=${beforeTick.scopedCampaignCount} ` +
      `triggeredWatchIds=[${beforeOutcome?.triggeredWatchIds.join(",") ?? ""}] ` +
      `-> ${beforeTrigger ? "TRIGGERED (unexpected)" : "nothing triggered"}`,
  );

  // --- 6. advance past T: ONE tick carries the whole mechanical progression ---
  // §42: the driver re-derives its continuation after each successful write, so a
  // single tick triggers the watch, starts the wake, reconciles the world and
  // activates the host. The second tick below is the proof that the resting state
  // is stable: it delivers nothing new and starts no second wake.
  now = "2026-09-16T01:00:00Z";
  const afterTick = await driver.tick();
  const idleTick = await driver.tick();
  const idleOutcome = idleTick.campaigns[0];

  const created = (await store.replay(CAMPAIGN)).filter((event) => !baseline.has(event.eventId));
  const campaignEventsCreated = created.map((event) => event.type);
  const triggeredWatchIds = created
    .filter((event) => event.type === "WATCH_TRIGGERED")
    .map((event) => event.payload.watchId);
  const wakeStarted = campaignEventsCreated.filter((type) => type === "WAKE_STARTED").length;
  const wakeEvent = created.find((event) => event.type === "WAKE_STARTED");
  const wakeCycleId = wakeEvent === undefined ? null : wakeEvent.payload.wakeCycleId;
  const lifecycle = await production.lifecycleState(CAMPAIGN);
  const outcome = afterTick.campaigns[0];
  const activationPhase = outcome?.activationPhase ?? null;
  const delivered = outcome?.delivered ?? false;
  const status = await driver.status();
  const signalId = status.lastActivation === null ? null : status.lastActivation.signalId;
  const coldResumed = resumeCalls > 0 && messages.length > 0;
  const workEventsCreated = countWorkEvents(workStore) - workBefore;

  console.log(`\ncanonical event types created: ${campaignEventsCreated.join(", ")}`);
  console.log(`wake cycle id: ${wakeCycleId}`);
  console.log(`lifecycle: ${lifecycle}`);
  console.log(`delivered signal id: ${signalId}`);
  if (messages.length > 0) {
    console.log("\nresumed principal message (first 3 lines):");
    console.log(messages[0].message.split("\n").slice(0, 3).join("\n"));
  }

  const pass =
    wakeStarted === 1 &&
    triggeredWatchIds.length >= 1 &&
    delivered === true &&
    coldResumed === true &&
    workEventsCreated === 0 &&
    campaignEventsCreated.filter((type) => type === "WAKE_STARTED").length === 1;

  const summary = {
    beforeTrigger,
    triggeredWatchIds,
    wakeStarted,
    wakeCycleId,
    lifecycle,
    activationPhase,
    delivered,
    signalId,
    coldResumed,
    campaignEventsCreated,
    workEventsCreated,
    pass,
  };
  console.log(`\n${JSON.stringify(summary, null, 2)}`);

  try {
    workMode.close();
    marks.close();
    workStore.close();
    store.close();
  } catch {
    /* best effort */
  }

  process.exit(pass ? 0 : 1);
}

await main();
