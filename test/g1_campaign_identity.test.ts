/**
 * G10-G1 Campaign identity machine proofs (§61).
 *
 *   G1-M01 Campaign ≠ Institution
 *   G1-M02 Campaign ≠ Project
 *   G1-M03 Campaign exists with zero runtime
 *   G1-M04 Campaign persists across Organization body replacement
 *   G1-M05 CampaignCommitment ≠ federation Commitment
 *   G1-M06 commitments immutable / event-derived
 *   G1-M07 superseding does not rewrite the old commitment
 *   G1-M08 CampaignBasis changes on event append
 *   G1-M09 stale expected basis rejected
 *   G1-M10 store restart/replay deterministic
 *   G1-M11 event-chain corruption fails closed
 *   G1-M12 independent campaign writes are safe; per-campaign conflicts only
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  CampaignStoreError,
  SqliteCampaignStore,
  makeCampaignService,
} from "../src/campaign/index.js";
import type { CampaignService } from "../src/campaign/index.js";
import {
  SqliteOrganizationStore,
  materializeOrganizationDefinition,
  organizationRefOf,
} from "../src/organization/index.js";
import { SqliteInstitutionStore, makeInstitutionService } from "../src/institution/index.js";
import { materializePeerRef } from "../src/federation/index.js";

const SRC = (file: string): string => readFileSync(fileURLToPath(new URL(`../src/campaign/${file}`, import.meta.url)), "utf-8");
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const PA = materializePeerRef({ peerId: "peer-a" });

function world() {
  const store = new SqliteCampaignStore(":memory:");
  let counter = 0;
  const service: CampaignService = makeCampaignService({
    store,
    allocateCommitmentId: () => `cc-${++counter}`,
  });
  return { store, service };
}

function tmp(name: string): string {
  return join(mkdtempSync(join(tmpdir(), `palimpsest-g1-${name}-`)), "campaign.sqlite");
}

describe("G1-M01/M02/M05: campaign identity firewalls", () => {
  it("campaign, institution, and project identities are separate namespaces", async () => {
    const w = world();
    const created = await w.service.createCampaign({
      campaignId: "camp-1",
      institutionId: "inst-1",
      statement: "long-horizon objective",
    });
    expect(created.definition.campaignId).toBe("camp-1");
    expect(created.definition.institutionId).toBe("inst-1");
    expect(created.definition).not.toHaveProperty("projectId");
    expect(created.definition).not.toHaveProperty("organizationId");
    expect(created.definition).not.toHaveProperty("activationId");
    expect(created.commitment.commitmentId).not.toBe(created.definition.campaignId);
  });

  it("the campaign module imports no Work, scheduler, Ordarium, or federation concern", () => {
    for (const file of ["artifacts.ts", "store.ts", "service.ts"]) {
      const code = strip(SRC(file));
      expect(code).not.toMatch(/workgraph|scheduler|projectir|taskspec/i);
      expect(code).not.toMatch(/ordarium|effects\//i);
      expect(code).not.toMatch(/federation|peerref|commitment_service/i);
      expect(code).not.toMatch(/runtime|activation|sessionref/i);
    }
  });
});

describe("G1-M03: campaign exists with zero runtime", () => {
  it("creation and replay require no RuntimeAgent/Session/Activation", async () => {
    const w = world();
    await w.service.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "s" });
    // No runtime object exists anywhere in this test.
    expect((await w.store.replay("camp-1")).length).toBe(1);
    expect(await w.store.basis("camp-1")).toBeDefined();
  });
});

describe("G1-M04: campaign persists across Organization body replacement", () => {
  it("an institution epoch transition leaves the campaign untouched", async () => {
    const organizations = new SqliteOrganizationStore(":memory:");
    const institutionStore = new SqliteInstitutionStore(":memory:");
    let t = 0;
    const institutions = makeInstitutionService({
      store: institutionStore,
      organizations,
      allocateTransitionId: () => `t-${++t}`,
    });
    const makeOrg = (id: string, peerId: string) =>
      materializeOrganizationDefinition({
        organizationDefinitionId: id,
        revision: 0,
        mission: id,
        members: [{ kind: "peer", peer: materializePeerRef({ peerId }) }],
        roles: [],
        assignments: [],
      });
    const o1 = makeOrg("org-1", "peer-a");
    const o2 = makeOrg("org-2", "peer-b");
    await organizations.registerRevision({ definition: o1, parent: null, expectedHeadRevision: null });
    await organizations.registerRevision({ definition: o2, parent: null, expectedHeadRevision: null });
    await institutions.genesis({
      institutionId: "inst-1",
      purpose: "p",
      authorities: [PA],
      requiredApprovals: 1,
      organization: organizationRefOf(o1),
    });

    const w = world();
    await w.service.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "s" });
    const before = await w.service.definition("camp-1");

    const proposal = await institutions.proposeTransition({
      institutionId: "inst-1",
      proposedOrganization: organizationRefOf(o2),
      reason: "replace body",
    });
    await institutions.approveRemote({ transitionId: proposal.transitionId, authenticatedPeer: PA });
    const epoch = await institutions.advance({ transitionId: proposal.transitionId });
    expect(epoch.organization.organizationDefinitionId).toBe("org-2");

    expect(await w.service.definition("camp-1")).toEqual(before);
    expect((await w.store.replay("camp-1")).length).toBe(1);
    organizations.close();
    institutionStore.close();
  });
});

describe("G1-M06/M07: commitment immutability and supersession", () => {
  it("commitments are event-derived, frozen, and never rewritten", async () => {
    const w = world();
    const created = await w.service.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
    expect(Object.isFrozen(created.commitment)).toBe(true);
    const successor = await w.service.supersedeCommitment({
      campaignId: "camp-1",
      commitmentId: created.commitment.commitmentId,
      statement: "refined intention",
    });
    expect(successor.commitmentId).not.toBe(created.commitment.commitmentId);
    const states = await w.service.commitmentStates("camp-1");
    const root = states.find((entry) => entry.commitment.commitmentId === created.commitment.commitmentId);
    const next = states.find((entry) => entry.commitment.commitmentId === successor.commitmentId);
    expect(root?.state).toBe("SUPERSEDED");
    expect(root?.commitment.statement).toBe("root");
    expect(next?.state).toBe("OPEN");
    // History keeps both opened events.
    const opened = (await w.store.replay("camp-1")).filter((event) => event.type === "CAMPAIGN_COMMITMENT_OPENED");
    expect(opened).toHaveLength(2);
  });
});

describe("G1-M08/M09: basis freshness and per-campaign conflict", () => {
  it("basis advances on append and a stale expected basis is rejected", async () => {
    const w = world();
    await w.service.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
    const basis1 = await w.store.basis("camp-1");
    await w.service.openCommitment({ campaignId: "camp-1", statement: "second" });
    const basis2 = await w.store.basis("camp-1");
    expect(basis2!.throughSeq).toBeGreaterThan(basis1!.throughSeq);
    expect(basis2!.chainDigest).not.toBe(basis1!.chainDigest);

    await expect(
      w.store.appendAtomic({
        expectedBasis: basis1!,
        events: [{ eventId: "evt-stale", type: "CAMPAIGN_COMMITMENT_RESOLVED", payload: { commitmentId: "cc-1", reason: "r" } }],
      }),
    ).rejects.toMatchObject({ kind: "basis_mismatch" });
  });

  it("an append to one campaign does not invalidate another campaign's basis", async () => {
    const w = world();
    await w.service.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "a" });
    await w.service.createCampaign({ campaignId: "camp-2", institutionId: "inst-1", statement: "b" });
    const basis1 = await w.store.basis("camp-1");
    await w.service.openCommitment({ campaignId: "camp-2", statement: "more" });
    // camp-1's basis is unchanged and still admissible.
    await expect(
      w.store.appendAtomic({
        expectedBasis: basis1!,
        events: [{ eventId: "evt-ok", type: "CAMPAIGN_COMMITMENT_RESOLVED", payload: { commitmentId: "cc-1", reason: "done" } }],
      }),
    ).resolves.toHaveLength(1);
  });
});

describe("G1-M10/M11: restart replay and chain integrity", () => {
  it("a reopened store replays deterministically", async () => {
    const path = tmp("replay");
    const first = new SqliteCampaignStore(path);
    const service = makeCampaignService({ store: first, allocateCommitmentId: (() => { let i = 0; return () => `cc-${++i}`; })() });
    await service.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
    await service.openCommitment({ campaignId: "camp-1", statement: "second" });
    const before = await first.replay("camp-1");
    first.close();

    const reopened = new SqliteCampaignStore(path);
    expect(await reopened.replay("camp-1")).toEqual(before);
    expect((await reopened.basis("camp-1"))!.throughSeq).toBe(2);
    reopened.close();
  });

  it("a tampered chain digest fails closed on replay", async () => {
    const path = tmp("corrupt");
    const store = new SqliteCampaignStore(path);
    const service = makeCampaignService({ store, allocateCommitmentId: () => "cc-1" });
    await service.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
    store.close();
    const raw = new DatabaseSync(path);
    raw.prepare("UPDATE campaign_events SET chain_digest = ? WHERE campaign_id = 'camp-1' AND seq = 1").run("0".repeat(64));
    raw.close();
    const reader = new SqliteCampaignStore(path);
    await expect(reader.replay("camp-1")).rejects.toBeInstanceOf(CampaignStoreError);
    reader.close();
  });
});

describe("G1-M12: cross-process writer safety", () => {
  it("two handles can append to different campaigns independently", async () => {
    const path = tmp("concurrent");
    const a = new SqliteCampaignStore(path);
    const b = new SqliteCampaignStore(path);
    const sa = makeCampaignService({ store: a, allocateCommitmentId: () => "cc-a" });
    await sa.createCampaign({ campaignId: "camp-a", institutionId: "inst-1", statement: "a" });
    await sa.createCampaign({ campaignId: "camp-b", institutionId: "inst-1", statement: "b" });
    await Promise.all([
      sa.openCommitment({ campaignId: "camp-a", statement: "a2" }),
      makeCampaignService({ store: b, allocateCommitmentId: () => "cc-b" }).openCommitment({
        campaignId: "camp-b",
        statement: "b2",
      }),
    ]);
    expect((await a.replay("camp-a")).map((event) => event.seq)).toEqual([1, 2]);
    expect((await b.replay("camp-b")).map((event) => event.seq)).toEqual([1, 2]);
    a.close();
    b.close();
  });
});
