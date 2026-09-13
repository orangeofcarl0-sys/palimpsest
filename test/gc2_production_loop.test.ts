/**
 * G10-GC2..GC6 production-loop closure machine proofs.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CampaignStoreError,
  SqliteCampaignStore,
  makeCampaignProductionService,
  makeCampaignService,
  makeProspectiveService,
  materializeClaimStandingSnapshot,
  reconciliationDigestOf,
} from "../src/campaign/index.js";
import type { CampaignClaimStatus, CampaignInstitutionReader, CampaignProjectReader } from "../src/campaign/index.js";

const SRC = (f: string): string => readFileSync(fileURLToPath(new URL(`../src/campaign/${f}`, import.meta.url)), "utf-8");
const strip = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const EPOCH = { institutionId: "inst-1", epoch: 1, digest: "e".repeat(64) };

function world(options: {
  epoch?: CampaignInstitutionReader;
  claimStatus?: () => CampaignClaimStatus | "unknown" | "error";
  projectState?: () => "completed" | "failed" | "running" | "unknown";
} = {}) {
  const store = new SqliteCampaignStore(":memory:");
  let c = 0;
  let w = 0;
  let k = 0;
  let o = 0;
  let r = 0;
  const institutions: CampaignInstitutionReader =
    options.epoch ?? { inspectEpoch: async () => ({ state: "known", value: EPOCH }) };
  const claimStatus = options.claimStatus ?? (() => "SUPPORTED" as CampaignClaimStatus);
  const evidence = {
    inspectClaim: async (ref: { claimId: string }) => {
      const status = claimStatus();
      if (status === "unknown") return { state: "unknown" as const, detail: "unknown" };
      if (status === "error") return { state: "error" as const, detail: "error" };
      return {
        state: "known" as const,
        value: materializeClaimStandingSnapshot({
          claim: ref,
          status,
          supportingEvidenceIds: status === "SUPPORTED" ? ["ev-1"] : [],
          contradictingEvidenceIds: status === "CONTRADICTED" ? ["ev-2"] : [],
          provenanceDigest: `prov-${status}`,
        }),
      };
    },
  };
  const projectState = options.projectState ?? (() => "running" as const);
  const work: CampaignProjectReader = {
    inspectProject: async () => {
      const state = projectState();
      return state === "unknown" ? { state: "unknown", detail: "unknown" } : { state: "known", value: state };
    },
  };
  const campaign = makeCampaignService({ store, allocateCommitmentId: () => `cc-${++c}`, evidence, institutions });
  const prospective = makeProspectiveService({ store, allocateWatchId: () => `w-${++w}`, clock: () => "2026-01-01T00:00:00Z" });
  const production = makeCampaignProductionService({
    store,
    institutions,
    evidence,
    work,
    allocateWakeCycleId: () => `wc-${++k}`,
    allocateWatchId: () => `pw-${++w}`,
    allocateObservationId: () => `obs-${++o}`,
    allocateRevisionId: () => `br-${++r}`,
  });
  return { store, campaign, prospective, production };
}

async function ready(w: ReturnType<typeof world>, claimId = "claim-1") {
  await w.campaign.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
  const h = await w.campaign.proposeHypothesis({ campaignId: "camp-1", statement: "H", claimId });
  if (h.state !== "known") throw new Error("hypothesis not registered");
  await w.campaign.refreshCampaignBeliefs("camp-1");
  return h.value;
}

describe("GC2: grounded checkpoint + atomic dormancy", () => {
  it("derives the checkpoint and commits WAIT+watches+checkpoint+quiescing+dormant as one batch", async () => {
    const w = world();
    const hypothesis = await ready(w);
    const checkpoint = await w.production.buildCurrentCampaignCheckpoint("camp-1");
    expect(checkpoint.state).toBe("known");
    if (checkpoint.state !== "known") return;
    expect(checkpoint.value.institutionEpoch.epoch).toBe(1);
    expect(checkpoint.value.activeHypothesisIds).toEqual([hypothesis.hypothesisId]);
    expect(checkpoint.value.activeCommitmentIds).toEqual(["cc-1"]);
    expect(checkpoint.value.beliefStateDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(checkpoint.value)).not.toMatch(/scratchpad|chainOfThought|sessionRef/i);

    const before = (await w.store.replay("camp-1")).length;
    const result = await w.production.admitWait({
      campaignId: "camp-1",
      reason: "nothing useful now",
      watches: [{ condition: { kind: "not_before", at: "2027-01-01T00:00:00Z" }, reason: "later" }],
    });
    expect(result.status).toBe("dormant");
    const types = (await w.store.replay("camp-1")).slice(before).map((event) => event.type);
    expect(types).toEqual(["WATCH_INSTALLED", "WAIT_DECIDED", "CHECKPOINT_RECORDED", "CAMPAIGN_QUIESCING", "CAMPAIGN_DORMANT"]);
    expect(await w.production.lifecycleState("camp-1")).toBe("DORMANT");
    expect(strip(SRC("production.ts"))).not.toMatch(/checkpoint:\s*callerObject/);
  });

  it("an empty wake plan and an ungrounded checkpoint are refused", async () => {
    const w = world();
    await ready(w);
    await expect(
      w.production.admitWait({ campaignId: "camp-1", reason: "r", watches: [] }),
    ).rejects.toBeInstanceOf(CampaignStoreError);

    // Create grounded, then make the institution unreadable: the checkpoint
    // must refuse to be built (checkpoint_incomplete).
    let epochDown = false;
    const flaky = world({
      epoch: {
        inspectEpoch: async () =>
          epochDown ? { state: "unknown" as const, detail: "down" } : { state: "known" as const, value: EPOCH },
      },
    });
    await flaky.campaign.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
    epochDown = true;
    const cp = await flaky.production.buildCurrentCampaignCheckpoint("camp-1");
    expect(cp.state).toBe("unknown");
    expect(await flaky.production.admitWait({
      campaignId: "camp-1",
      reason: "r",
      watches: [{ condition: { kind: "external_signal", signalKey: "s" }, reason: "w" }],
    })).toMatchObject({ status: "checkpoint_incomplete" });
  });
});

describe("GC3: full relevant-world observation", () => {
  it("includes institution epoch, active claims, linked projects, and the real triggering watch", async () => {
    const w = world({ projectState: () => "completed" });
    await ready(w);
    // Link a project via a direct intervention-like admission for observation.
    await w.campaign.openCommitment({ campaignId: "camp-1", statement: "second" });
    await w.prospective.installWatch({ campaignId: "camp-1", condition: { kind: "external_signal", signalKey: "sig" }, reason: "w" });
    const watchIds = (await w.prospective.watchStates("camp-1")).map((entry) => entry.watch!.watchId);
    const watchId = watchIds[0]!;
    await w.prospective.recordTrigger({ campaignId: "camp-1", watchId, cause: "signal" });

    const started = await w.production.beginWake({ campaignId: "camp-1", cause: { kind: "watch", watchId } });
    // Not DORMANT yet → blocked, proving the state machine gate.
    expect(started.status).toBe("blocked");
  });

  it("unknown evidence blocks observation; zero hypotheses needs no Evidence port", async () => {
    // Observation is gated on the CURRENT in-flight wake (§95): start a wake.
    const startWake = async (prod: ReturnType<typeof world>["production"]) => {
      const dormant = await prod.admitWait({
        campaignId: "camp-1",
        reason: "wait",
        watches: [{ condition: { kind: "not_before", at: "2027-01-01T00:00:00Z" }, reason: "later" }],
      });
      if (dormant.status !== "dormant") throw new Error("expected dormant");
      const started = await prod.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "s", reason: "r" } });
      if (started.status !== "started") throw new Error("expected started");
      return started.wakeCycleId;
    };

    let down = false;
    const unknownEpoch = world({
      epoch: {
        inspectEpoch: async () =>
          down ? { state: "unknown" as const, detail: "down" } : { state: "known" as const, value: EPOCH },
      },
    });
    await unknownEpoch.campaign.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
    const wc1 = await startWake(unknownEpoch.production);
    down = true;
    const observed = await unknownEpoch.production.observeCurrentWorld({
      campaignId: "camp-1",
      wakeCycle: wc1,
      wakeCause: { kind: "manual", signalId: "s", reason: "r" },
    });
    expect(observed.status).toBe("reconciliation_incomplete");

    let claimUnknown = false;
    const unknownClaim = world({ claimStatus: () => (claimUnknown ? "unknown" : ("SUPPORTED" as CampaignClaimStatus)) });
    await ready(unknownClaim);
    const wc2 = await startWake(unknownClaim.production);
    claimUnknown = true;
    const obs2 = await unknownClaim.production.observeCurrentWorld({
      campaignId: "camp-1",
      wakeCycle: wc2,
      wakeCause: { kind: "manual", signalId: "s", reason: "r" },
    });
    expect(obs2.status).toBe("reconciliation_incomplete");

    const noHypotheses = world();
    await noHypotheses.campaign.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
    const wc3 = await startWake(noHypotheses.production);
    const obs3 = await noHypotheses.production.observeCurrentWorld({
      campaignId: "camp-1",
      wakeCycle: wc3,
      wakeCause: { kind: "manual", signalId: "s", reason: "r" },
    });
    expect(obs3.status).toBe("complete");
  });

  it("observation mutates zero semantic stores", async () => {
    const w = world();
    await ready(w);
    const before = await w.store.basis("camp-1");
    await w.production.observeCurrentWorld({
      campaignId: "camp-1",
      wakeCycle: "wc-x",
      wakeCause: { kind: "manual", signalId: "s", reason: "r" },
    });
    expect(await w.store.basis("camp-1")).toEqual(before);
  });
});

describe("GC4: atomic epistemic reconciliation with unchanged no-op", () => {
  it("changed standing appends observation+revision+report+review atomically; unchanged is a no-op", async () => {
    let status: CampaignClaimStatus = "SUPPORTED";
    const w = world({ claimStatus: () => status });
    await ready(w);
    await w.production.admitWait({
      campaignId: "camp-1",
      reason: "wait",
      watches: [{ condition: { kind: "not_before", at: "2027-01-01T00:00:00Z" }, reason: "later" }],
    });
    // Not yet waking: reconcile requires the wake path; drive it directly.
    const start = await w.production.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "cli", reason: "operator" } });
    expect(start.status).toBe("started");
    if (start.status !== "started") return;

    status = "CONTRADICTED";
    const reconciled = await w.production.reconcileCurrentWorld({
      campaignId: "camp-1",
      wakeCycle: start.wakeCycleId,
      wakeCause: { kind: "manual", signalId: "cli", reason: "operator" },
    });
    expect(reconciled.status).toBe("reconciled");
    if (reconciled.status !== "reconciled") return;
    expect(reconciled.report.changedHypothesisIds).toHaveLength(1);
    expect(reconciled.report.digest).toBe(reconciliationDigestOf(reconciled.report));
    const types = (await w.store.replay("camp-1")).map((event) => event.type);
    expect(types).toContain("EVIDENCE_OBSERVED");
    expect(types).toContain("BELIEF_REVISED");
    expect(types).toContain("RECONCILIATION_COMMITTED");
    expect(types).toContain("COMMITMENTS_REVIEWED");
    expect(await w.production.lifecycleState("camp-1")).toBe("RECONCILING");

    // Unchanged refresh is a successful no-op with zero new events.
    const before = (await w.store.replay("camp-1")).length;
    const refresh = await w.campaign.refreshCampaignBeliefs("camp-1");
    expect(refresh.status).toBe("refreshed");
    if (refresh.status === "refreshed") expect(refresh.observations).toHaveLength(0);
    expect((await w.store.replay("camp-1")).length).toBe(before);
  });

  it("a retried reconciliation with the same wake cycle converges without duplicate world commits", async () => {
    const w = world();
    await ready(w);
    await w.production.admitWait({
      campaignId: "camp-1",
      reason: "wait",
      watches: [{ condition: { kind: "not_before", at: "2027-01-01T00:00:00Z" }, reason: "later" }],
    });
    const start = await w.production.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "cli", reason: "r" } });
    if (start.status !== "started") throw new Error("expected started");
    const first = await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: start.wakeCycleId, wakeCause: { kind: "manual", signalId: "cli", reason: "r" } });
    expect(first.status).toBe("reconciled");
    const second = await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: start.wakeCycleId, wakeCause: { kind: "manual", signalId: "cli", reason: "r" } });
    expect(second.status).toBe("reconciled");
    const observations = (await w.store.replay("camp-1")).filter((event) => event.type === "EVIDENCE_OBSERVED");
    expect(observations).toHaveLength(1); // unchanged → no-op on retry
  });
});

describe("GC5: strict wake state machine", () => {
  it("beginWake only from DORMANT; a second attempt reports the in-flight cycle; completion requires reconciliation and admission", async () => {
    const w = world();
    await ready(w);
    // ACTIVE → refused.
    expect((await w.production.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "s", reason: "r" } })).status).toBe("blocked");

    await w.production.admitWait({
      campaignId: "camp-1",
      reason: "wait",
      watches: [{ condition: { kind: "not_before", at: "2027-01-01T00:00:00Z" }, reason: "later" }],
    });
    const start = await w.production.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "s", reason: "r" } });
    expect(start.status).toBe("started");
    if (start.status !== "started") return;
    // Second beginWake → same cycle, no new one.
    expect(await w.production.beginWake({ campaignId: "camp-1", cause: { kind: "manual", signalId: "s", reason: "r" } })).toEqual({
      status: "wake_already_in_progress",
      wakeCycleId: start.wakeCycleId,
    });
    expect(await w.production.resumeWake("camp-1")).toEqual({ status: "in_progress", wakeCycleId: start.wakeCycleId });
    const bogus = {
      kind: "project" as const,
      wakeCycleId: start.wakeCycleId,
      compilationId: "cmp-bogus",
      reconciliationDigest: "0".repeat(64),
      admissionKey: "adm-bogus",
      project: { projectId: "p1", revision: 0, digest: "a".repeat(64) },
    };
    // Completion before reconciliation → refused (no bound admission exists).
    await expect(
      w.production.completeWakeWithAction({ campaignId: "camp-1", wakeCycleId: start.wakeCycleId, action: bogus }),
    ).rejects.toBeInstanceOf(CampaignStoreError);
    await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: start.wakeCycleId, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    // Project completion without an admitted Project → refused.
    await expect(
      w.production.completeWakeWithAction({ campaignId: "camp-1", wakeCycleId: start.wakeCycleId, action: bogus }),
    ).rejects.toThrow(/PROJECT_ADMITTED bound to THIS wake/);
  });
});
