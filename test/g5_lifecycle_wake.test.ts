/**
 * G10-G5 lifecycle / checkpoint / wake machine proofs (§151).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  SqliteCampaignStore,
  makeCampaignService,
  makeLifecycleService,
  makeProspectiveService,
} from "../src/campaign/index.js";
import type {
  CampaignCheckpoint,
  CampaignInstitutionEpochSource,
} from "../src/campaign/index.js";

const SRC = (file: string): string => readFileSync(fileURLToPath(new URL(`../src/campaign/${file}`, import.meta.url)), "utf-8");
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const EPOCH0 = { institutionId: "inst-1", epoch: 0, digest: "e".repeat(64) };

function world(institutions?: CampaignInstitutionEpochSource) {
  const store = new SqliteCampaignStore(":memory:");
  let c = 0;
  let w = 0;
  let k = 0;
  const campaign = makeCampaignService({ store, allocateCommitmentId: () => `cc-${++c}` });
  const prospective = makeProspectiveService({ store, allocateWatchId: () => `w-${++w}`, clock: () => "2026-01-01T00:00:00Z" });
  const lifecycle = makeLifecycleService({ store, allocateWakeCycleId: () => `wc-${++k}`, institutions });
  return { store, campaign, prospective, lifecycle };
}

function checkpoint(): CampaignCheckpoint {
  return {
    campaignId: "camp-1",
    campaignBasisThroughSeq: 1,
    campaignBasisDigest: "b".repeat(64),
    institutionEpoch: EPOCH0,
    beliefStateDigest: "d".repeat(64),
    activeCommitmentIds: ["cc-1"],
    activeHypothesisIds: [],
    activeWatchIds: [],
    knownProjectRefs: [],
  };
}

async function dormant(w: ReturnType<typeof world>) {
  await w.campaign.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
  await w.prospective.installWatch({
    campaignId: "camp-1",
    condition: { kind: "not_before", at: "2026-12-01T00:00:00Z" },
    reason: "review later",
  });
  await w.lifecycle.beginDormancy({ campaignId: "camp-1", checkpoint: checkpoint(), reason: "nothing useful now" });
}

describe("G5-M01/M02/M03: dormant ≠ terminated; no runtime; body-free checkpoint", () => {
  it("a dormant campaign is alive, needs no runtime, and its checkpoint has no context/CoT", async () => {
    const w = world();
    await dormant(w);
    expect(await w.lifecycle.lifecycle("camp-1")).toBe("DORMANT");
    expect(await w.campaign.definition("camp-1")).toBeDefined();
    const code = strip(SRC("lifecycle.ts"));
    expect(code).not.toMatch(/runtime|activation|sessionref/i);
    expect(code).not.toMatch(/scratchpad|hiddenCot|chainOfThought|contextWindow|promptHistory/i);
    const cp = await w.lifecycle.latestCheckpoint("camp-1");
    expect(Object.keys(cp!).sort()).toEqual([
      "activeCommitmentIds",
      "activeHypothesisIds",
      "activeWatchIds",
      "beliefStateDigest",
      "campaignBasisDigest",
      "campaignBasisThroughSeq",
      "campaignId",
      "institutionEpoch",
      "knownProjectRefs",
    ]);
  });
});

describe("G5-M04/M05/M06: WAIT→Dormant atomic; explicit wake; cause recorded", () => {
  it("dormancy requires a wake route and commits checkpoint+quiescing+dormant together", async () => {
    const w = world();
    await w.campaign.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
    await expect(
      w.lifecycle.beginDormancy({ campaignId: "camp-1", checkpoint: checkpoint(), reason: "no route" }),
    ).rejects.toThrow(/wake route/);

    await w.prospective.installWatch({
      campaignId: "camp-1",
      condition: { kind: "external_signal", signalKey: "sig" },
      reason: "wait",
    });
    const before = (await w.store.replay("camp-1")).length;
    await w.lifecycle.beginDormancy({ campaignId: "camp-1", checkpoint: checkpoint(), reason: "wait" });
    const types = (await w.store.replay("camp-1")).slice(before).map((event) => event.type);
    expect(types).toEqual(["CHECKPOINT_RECORDED", "CAMPAIGN_QUIESCING", "CAMPAIGN_DORMANT"]);

    const { wakeCycleId } = await w.lifecycle.beginWake({ campaignId: "camp-1", cause: "watch-triggered" });
    expect(await w.lifecycle.lifecycle("camp-1")).toBe("WAKING");
    const states = await w.lifecycle.wakeStates("camp-1");
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ wakeCycleId, cause: "watch-triggered", reconciled: false, completed: false });
  });
});

describe("G5-M07/M08/M09: world reconciliation", () => {
  it("an unknown institution fact blocks reconciliation; a known epoch is recorded", async () => {
    let knowledge: { state: "known"; value: typeof EPOCH0 } | { state: "unknown"; detail: string } = { state: "unknown", detail: "down" };
    const w = world({ inspectEpoch: async () => knowledge });
    await dormant(w);
    const { wakeCycleId } = await w.lifecycle.beginWake({ campaignId: "camp-1", cause: "manual" });

    const incomplete = await w.lifecycle.observeWorld({ campaignId: "camp-1", wakeCycleId });
    expect(incomplete.status).toBe("reconciliation_incomplete");

    knowledge = { state: "known", value: { institutionId: "inst-1", epoch: 2, digest: "f".repeat(64) } };
    const complete = await w.lifecycle.observeWorld({ campaignId: "camp-1", wakeCycleId });
    expect(complete.status).toBe("complete");
    if (complete.status !== "complete") return;
    const beliefBefore = (await w.campaign.currentBeliefState("camp-1")).digest;
    await w.lifecycle.reconcile({ campaignId: "camp-1", wakeCycleId, snapshot: complete.snapshot });
    // Reconciliation records the new epoch and does NOT set belief by itself.
    expect((await w.campaign.currentBeliefState("camp-1")).digest).toBe(beliefBefore);
    expect(await w.lifecycle.lifecycle("camp-1")).toBe("RECONCILING");
    expect(complete.snapshot.institutionEpoch.epoch).toBe(2);
  });

  it("reconciliation reviews commitments and never auto-terminates", async () => {
    const w = world({ inspectEpoch: async () => ({ state: "known", value: EPOCH0 }) });
    await dormant(w);
    const { wakeCycleId } = await w.lifecycle.beginWake({ campaignId: "camp-1", cause: "manual" });
    const observed = await w.lifecycle.observeWorld({ campaignId: "camp-1", wakeCycleId });
    if (observed.status !== "complete") throw new Error("expected complete");
    const reviewed = await w.lifecycle.reconcile({ campaignId: "camp-1", wakeCycleId, snapshot: observed.snapshot });
    expect(reviewed.activeCommitmentIds).toEqual(["cc-1"]);
    expect(await w.lifecycle.lifecycle("camp-1")).not.toBe("TERMINATED");
  });
});

describe("G5-M11/M12: wake is not replay; one wake cycle", () => {
  it("the lifecycle module never starts or retries Work, and a wake cycle is singular", async () => {
    const code = strip(SRC("lifecycle.ts"));
    expect(code).not.toMatch(/controller|\.start\(|\.plan\(|attemptExecutor|scheduler/i);
    const w = world({ inspectEpoch: async () => ({ state: "known", value: EPOCH0 }) });
    await dormant(w);
    const { wakeCycleId } = await w.lifecycle.beginWake({ campaignId: "camp-1", cause: "manual" });
    const observed = await w.lifecycle.observeWorld({ campaignId: "camp-1", wakeCycleId });
    if (observed.status !== "complete") throw new Error("expected complete");
    await w.lifecycle.reconcile({ campaignId: "camp-1", wakeCycleId, snapshot: observed.snapshot });
    await w.lifecycle.completeWake({ campaignId: "camp-1", wakeCycleId, nextAction: "project" });
    const states = await w.lifecycle.wakeStates("camp-1");
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ reconciled: true, completed: true, nextAction: "project" });
    expect(await w.lifecycle.lifecycle("camp-1")).toBe("ACTIVE");
  });
});

describe("G5-M14: termination is explicit only", () => {
  it("a WAIT wake needs a route; termination is explicit and terminal", async () => {
    const w = world({ inspectEpoch: async () => ({ state: "known", value: EPOCH0 }) });
    await dormant(w);
    const { wakeCycleId } = await w.lifecycle.beginWake({ campaignId: "camp-1", cause: "manual" });
    await expect(w.lifecycle.completeWake({ campaignId: "camp-1", wakeCycleId, nextAction: "wait" })).rejects.toThrow(
      /wake route/,
    );
    await w.prospective.installWatch({
      campaignId: "camp-1",
      condition: { kind: "external_signal", signalKey: "sig" },
      reason: "wait again",
    });
    await w.lifecycle.completeWake({ campaignId: "camp-1", wakeCycleId, nextAction: "wait" });
    expect(await w.lifecycle.lifecycle("camp-1")).toBe("DORMANT");

    await w.lifecycle.terminate({ campaignId: "camp-1", reason: "objective abandoned" });
    expect(await w.lifecycle.lifecycle("camp-1")).toBe("TERMINATED");
    await expect(w.lifecycle.beginWake({ campaignId: "camp-1", cause: "manual" })).rejects.toThrow(/TERMINATED/);
  });
});
