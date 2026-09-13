/**
 * G10-GC0 CampaignStore hardening machine proofs (§26).
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  CampaignStoreError,
  SqliteCampaignStore,
  makeCampaignService,
  materializeCampaignCommitment,
  parseCampaignNextActionProposal,
  parseProjectOperationalStanding,
  parseWorldSnapshot,
} from "../src/campaign/index.js";
import type { CampaignAppendRequest, CampaignBasisRef } from "../src/campaign/index.js";

function tmp(name: string): string {
  return join(mkdtempSync(join(tmpdir(), `pal-gc0-${name}-`)), "campaign.sqlite");
}

function opened(eventId: string, statement: string): CampaignAppendRequest {
  return {
    eventId,
    type: "CAMPAIGN_COMMITMENT_OPENED",
    payload: { commitment: materializeCampaignCommitment({ commitmentId: `cc-${eventId}`, campaignId: "camp-1", statement }) },
  };
}

async function seededStore(path = ":memory:") {
  const store = new SqliteCampaignStore(path);
  let c = 0;
  const service = makeCampaignService({ store, allocateCommitmentId: () => `cc-${++c}` });
  await service.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
  return { store, service };
}

describe("GC0-M01/M02: full-batch idempotent retry", () => {
  it("an identical completed batch succeeds even when the basis has advanced", async () => {
    const { store } = await seededStore();
    const basis1 = (await store.basis("camp-1"))!;
    const batch = [opened("e1", "one"), opened("e2", "two")];
    const first = await store.appendAtomic({ expectedBasis: basis1, events: batch });
    expect(first.map((event) => event.seq)).toEqual([2, 3]);

    // Retry with the now-historical basis → idempotent success.
    const retry = await store.appendAtomic({ expectedBasis: basis1, events: batch });
    expect(retry.map((event) => event.eventId)).toEqual(["e1", "e2"]);
    expect((await store.replay("camp-1")).length).toBe(3);

    // Retry again after further history → still idempotent.
    await store.appendAtomic({ expectedBasis: (await store.basis("camp-1"))!, events: [opened("e3", "three")] });
    const third = await store.appendAtomic({ expectedBasis: basis1, events: batch });
    expect(third.map((event) => event.eventId)).toEqual(["e1", "e2"]);
    expect((await store.replay("camp-1")).length).toBe(4);
  });
});

describe("GC0-M03/M04/M05: partial, conflict, corruption", () => {
  it("a partially present batch fails recovery_required", async () => {
    const { store } = await seededStore();
    const basis1 = (await store.basis("camp-1"))!;
    await store.appendAtomic({ expectedBasis: basis1, events: [opened("p1", "x")] });
    await expect(
      store.appendAtomic({ expectedBasis: (await store.basis("camp-1"))!, events: [opened("p1", "x"), opened("p2", "y")] }),
    ).rejects.toMatchObject({ kind: "recovery_required" });
  });

  it("an eventId with different content fails event_conflict", async () => {
    const { store } = await seededStore();
    const basis1 = (await store.basis("camp-1"))!;
    await store.appendAtomic({ expectedBasis: basis1, events: [opened("x1", "original")] });
    await expect(
      store.appendAtomic({ expectedBasis: (await store.basis("camp-1"))!, events: [opened("x1", "changed")] }),
    ).rejects.toMatchObject({ kind: "event_conflict" });
  });

  it("chain corruption fails even on an idempotent retry", async () => {
    const path = tmp("corrupt");
    const { store } = await seededStore(path);
    const basis1 = (await store.basis("camp-1"))!;
    const batch = [opened("c1", "one")];
    await store.appendAtomic({ expectedBasis: basis1, events: batch });
    store.close();
    const raw = new DatabaseSync(path);
    raw.prepare("UPDATE campaign_events SET chain_digest = ? WHERE campaign_id='camp-1' AND seq=2").run("0".repeat(64));
    raw.close();
    const reader = new SqliteCampaignStore(path);
    await expect(reader.appendAtomic({ expectedBasis: basis1, events: batch })).rejects.toMatchObject({ kind: "malformed_record" });
    reader.close();
  });

  it("a plain stale basis with no overlap fails basis_mismatch; unknown campaign fails unknown_campaign", async () => {
    const { store } = await seededStore();
    const stale: CampaignBasisRef = { campaignId: "camp-1", throughSeq: 0, chainDigest: "0".repeat(64) };
    await expect(store.appendAtomic({ expectedBasis: stale, events: [opened("n1", "n")] })).rejects.toMatchObject({
      kind: "basis_mismatch",
    });
    await expect(
      store.appendAtomic({ expectedBasis: { campaignId: "ghost", throughSeq: 0, chainDigest: "1".repeat(64) }, events: [opened("n2", "n")] }),
    ).rejects.toMatchObject({ kind: "unknown_campaign" });
  });
});

describe("GC0-M06/M07/M08/M09/M10: strict parsers", () => {
  it("malformed watch condition is rejected at compiler candidate parsing", () => {
    expect(() =>
      parseCampaignNextActionProposal(
        { kind: "wait", reason: "r", watches: [{ condition: { kind: "not_a_condition" }, reason: "x" }] },
        { knownHypothesisIds: new Set() },
      ),
    ).toThrow(CampaignStoreError);
  });

  it("invalid claim status, non-string evidence ids, invalid project standing, and a bad snapshot digest are rejected", () => {
    const base = {
      wakeCycleId: "wc-1",
      institutionEpoch: { institutionId: "inst-1", epoch: 0, digest: "e".repeat(64) },
      claimObservations: [
        { claim: { claimId: "q1" }, status: "SUPPORTED", supportingEvidenceIds: ["ev-1"], contradictingEvidenceIds: [], provenanceDigest: "p", digest: "d".repeat(64) },
      ],
      projectObservations: [{ project: { projectId: "p1", revision: 0, digest: "a".repeat(64) }, standing: "completed" }],
      triggeredWatchIds: [],
      digest: "f".repeat(64),
    };
    expect(() => parseWorldSnapshot({ ...base, claimObservations: [{ ...base.claimObservations[0]!, status: "MAYBE" }] })).toThrow();
    expect(() =>
      parseWorldSnapshot({
        ...base,
        claimObservations: [{ ...base.claimObservations[0]!, supportingEvidenceIds: [1 as unknown as string] }],
      }),
    ).toThrow();
    expect(() =>
      parseWorldSnapshot({
        ...base,
        projectObservations: [{ project: base.projectObservations[0]!.project, standing: "exploded" }],
      }),
    ).toThrow();
    expect(() => parseWorldSnapshot({ ...base, digest: "0".repeat(64) })).toThrow(/digest/);
    expect(() => parseProjectOperationalStanding("exploded")).toThrow(CampaignStoreError);
    expect(parseProjectOperationalStanding("running")).toBe("running");
  });
});

describe("GC0-M11/M12: replay and multi-writer safety", () => {
  it("a historical campaign replays deterministically after restart", async () => {
    const path = tmp("replay");
    const { store, service } = await seededStore(path);
    const basis = (await store.basis("camp-1"))!;
    await store.appendAtomic({ expectedBasis: basis, events: [opened("r1", "one"), opened("r2", "two")] });
    const before = await store.replay("camp-1");
    store.close();
    const reopened = new SqliteCampaignStore(path);
    expect(await reopened.replay("camp-1")).toEqual(before);
    void service;
    reopened.close();
  });

  it("two handles appending different events to different campaigns do not collide", async () => {
    const path = tmp("multi");
    const a = new SqliteCampaignStore(path);
    const b = new SqliteCampaignStore(path);
    await a.genesis({
      definition: { schemaVersion: 1, campaignId: "camp-a", institutionId: "inst-1" },
      initialCommitment: materializeCampaignCommitment({ commitmentId: "cc-a", campaignId: "camp-a", statement: "a" }),
    });
    await b.genesis({
      definition: { schemaVersion: 1, campaignId: "camp-b", institutionId: "inst-1" },
      initialCommitment: materializeCampaignCommitment({ commitmentId: "cc-b", campaignId: "camp-b", statement: "b" }),
    });
    await Promise.all([
      a.appendAtomic({ expectedBasis: (await a.basis("camp-a"))!, events: [opened("a1", "one")] }),
      b.appendAtomic({ expectedBasis: (await b.basis("camp-b"))!, events: [opened("b1", "one")] }),
    ]);
    expect((await a.replay("camp-a")).map((event) => event.seq)).toEqual([1, 2]);
    expect((await b.replay("camp-b")).map((event) => event.seq)).toEqual([1, 2]);
    a.close();
    b.close();
  });
});
