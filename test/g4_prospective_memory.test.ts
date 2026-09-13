/**
 * G10-G4 prospective memory / watcher / WAIT machine proofs (§122).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  SqliteCampaignStore,
  makeCampaignService,
  makeProspectiveService,
  materializeClaimStandingSnapshot,
} from "../src/campaign/index.js";
import type {
  CampaignClaimStatus,
  CampaignEvidencePort,
  CampaignExternalSignalPort,
  CampaignInstitutionEpochPort,
  CampaignProjectStandingPort,
  WatchEvaluation,
} from "../src/campaign/index.js";

const SRC = (file: string): string => readFileSync(fileURLToPath(new URL(`../src/campaign/${file}`, import.meta.url)), "utf-8");
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const PROJECT = { projectId: "p1", revision: 0, digest: "d".repeat(64) };

function evidencePort(get: () => CampaignClaimStatus | "unknown" | "error"): CampaignEvidencePort {
  return {
    inspectClaim: async (ref) => {
      const status = get();
      if (status === "unknown") return { state: "unknown", detail: "unknown" };
      if (status === "error") return { state: "error", detail: "evidence plane error" };
      return {
        state: "known",
        value: materializeClaimStandingSnapshot({
          claim: ref,
          status,
          supportingEvidenceIds: status === "SUPPORTED" ? ["ev-1"] : [],
          contradictingEvidenceIds: [],
          provenanceDigest: `prov-${status}`,
        }),
      };
    },
  };
}

function world(options: {
  clock?: () => string;
  evidence?: CampaignEvidencePort;
  signals?: CampaignExternalSignalPort;
  institutions?: CampaignInstitutionEpochPort;
  projects?: CampaignProjectStandingPort;
} = {}) {
  const store = new SqliteCampaignStore(":memory:");
  let c = 0;
  let w = 0;
  const campaign = makeCampaignService({
    institutions: TEST_INSTITUTIONS, store, allocateCommitmentId: () => `cc-${++c}` });
  const prospective = makeProspectiveService({
    store,
    allocateWatchId: () => `w-${++w}`,
    clock: options.clock ?? (() => "2026-01-01T00:00:00Z"),
    evidence: options.evidence,
    signals: options.signals,
    institutions: options.institutions,
    projects: options.projects,
  });
  return { store, campaign, prospective };
}

async function campaign(w: ReturnType<typeof world>) {
  await w.campaign.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
}

async function evalOf(w: ReturnType<typeof world>, watchId: string): Promise<WatchEvaluation> {
  const scanned = await w.prospective.scanWatches("camp-1");
  const found = scanned.find((entry) => entry.watchId === watchId);
  if (found === undefined) throw new Error("watch not found");
  return found;
}

describe("G4-M01/M11: durable definitions, no runtime required", () => {
  it("watch definitions are durable and evaluation needs no RuntimeAgent", async () => {
    const w = world();
    await campaign(w);
    const watch = await w.prospective.installWatch({
      campaignId: "camp-1",
      condition: { kind: "external_signal", signalKey: "sig" },
      reason: "wait for signal",
    });
    const states = await w.prospective.watchStates("camp-1");
    expect(states).toEqual([{ watch, status: "ACTIVE" }]);
    const code = strip(SRC("prospective.ts"));
    expect(code).not.toMatch(/runtime|activation|sessionref/i);
  });
});

describe("G4-M02/M03: unknown ≠ triggered, error ≠ false", () => {
  it("an unknown claim yields incomplete, never triggered", async () => {
    const w = world({ evidence: evidencePort(() => "unknown") });
    await campaign(w);
    const watch = await w.prospective.installWatch({
      campaignId: "camp-1",
      condition: { kind: "claim_changed", claim: { claimId: "claim-1" }, baselineDigest: "b".repeat(64) },
      reason: "watch claim",
    });
    expect((await evalOf(w, watch.watchId)).status).toBe("incomplete");
  });

  it("an erroring signal yields incomplete, never a false trigger", async () => {
    const w = world({ signals: { inspect: async () => ({ state: "error", detail: "signal bus down" }) } });
    await campaign(w);
    const watch = await w.prospective.installWatch({
      campaignId: "camp-1",
      condition: { kind: "external_signal", signalKey: "sig" },
      reason: "wait for signal",
    });
    expect((await evalOf(w, watch.watchId)).status).toBe("incomplete");
  });
});

describe("G4-M04: not_before uses the injected clock", () => {
  it("pending before the time and triggered at/after it; no Date.now in the module", async () => {
    let now = "2026-01-01T00:00:00Z";
    const w = world({ clock: () => now });
    await campaign(w);
    const watch = await w.prospective.installWatch({
      campaignId: "camp-1",
      condition: { kind: "not_before", at: "2026-06-01T00:00:00Z" },
      reason: "review later",
    });
    expect((await evalOf(w, watch.watchId)).status).toBe("pending");
    now = "2026-06-01T00:00:00Z";
    expect((await evalOf(w, watch.watchId)).status).toBe("triggered");
    expect(strip(SRC("prospective.ts"))).not.toMatch(/Date\.now/);
  });
});

describe("G4-M05/M06: claim and institution watches", () => {
  it("claim_changed compares against the current evidence observation", async () => {
    let status: CampaignClaimStatus | "unknown" = "SUPPORTED";
    const port = evidencePort(() => status);
    const baseline = (await port.inspectClaim({ claimId: "claim-1" }));
    if (baseline.state !== "known") throw new Error("expected known");
    const w = world({ evidence: port });
    await campaign(w);
    const watch = await w.prospective.installWatch({
      campaignId: "camp-1",
      condition: { kind: "claim_changed", claim: { claimId: "claim-1" }, baselineDigest: baseline.value.digest },
      reason: "watch claim",
    });
    expect((await evalOf(w, watch.watchId)).status).toBe("pending");
    status = "CONTRADICTED";
    expect((await evalOf(w, watch.watchId)).status).toBe("triggered");
  });

  it("an institution epoch change is detected against the baseline", async () => {
    const w = world({ institutions: { currentEpoch: async () => ({ state: "known", value: 2 }) } });
    await campaign(w);
    const watch = await w.prospective.installWatch({
      campaignId: "camp-1",
      condition: { kind: "institution_epoch_changed", institutionId: "inst-1", baselineEpoch: 0 },
      reason: "watch institution",
    });
    expect((await evalOf(w, watch.watchId)).status).toBe("triggered");
  });
});

describe("G4-M07/M08: read-only evaluation and idempotent triggers", () => {
  it("project-terminal evaluation is read-only; trigger recording is idempotent", async () => {
    const w = world({ projects: { inspectProject: async () => ({ state: "known", value: "completed" }) } });
    await campaign(w);
    const watch = await w.prospective.installWatch({
      campaignId: "camp-1",
      condition: { kind: "project_terminal", project: PROJECT },
      reason: "watch project",
    });
    const before = await w.store.basis("camp-1");
    expect((await evalOf(w, watch.watchId)).status).toBe("triggered");
    expect(await w.store.basis("camp-1")).toEqual(before); // evaluation wrote nothing
    await w.prospective.recordTrigger({ campaignId: "camp-1", watchId: watch.watchId, cause: "project_terminal" });
    await w.prospective.recordTrigger({ campaignId: "camp-1", watchId: watch.watchId, cause: "project_terminal" });
    const triggers = (await w.store.replay("camp-1")).filter((event) => event.type === "WATCH_TRIGGERED");
    expect(triggers).toHaveLength(1);
    expect((await w.prospective.watchStates("camp-1"))[0]!.status).toBe("TRIGGERED");
  });
});

describe("G4-M09/M10: WAIT is first-class and never failure", () => {
  it("WAIT requires a wake route and is not a failure", async () => {
    const w = world();
    await campaign(w);
    await expect(w.prospective.wait({ campaignId: "camp-1", reason: "nothing useful now", watches: [] })).rejects.toThrow(/wake route/);

    const result = await w.prospective.wait({
      campaignId: "camp-1",
      reason: "nothing useful now",
      watches: [{ condition: { kind: "not_before", at: "2026-12-01T00:00:00Z" }, reason: "review later" }],
    });
    expect(result.watchIds).toHaveLength(1);
    const types = (await w.store.replay("camp-1")).map((event) => event.type);
    expect(types).toContain("WAIT_DECIDED");
    expect(types).not.toContain("CAMPAIGN_TERMINATED");
    expect(await w.campaign.definition("camp-1")).toBeDefined();
  });
});

const TEST_INSTITUTIONS = {
  inspectEpoch: async () => ({
    state: "known" as const,
    value: { institutionId: "inst-1", epoch: 0, digest: "e".repeat(64) },
  }),
};
