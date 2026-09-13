/**
 * G10-GC1 Campaign → Institution grounding machine proofs (§39).
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CampaignStoreError, SqliteCampaignStore, makeCampaignService } from "../src/campaign/index.js";
import type { CampaignInstitutionEpochSource } from "../src/campaign/index.js";
import { SqliteOrganizationStore, materializeOrganizationDefinition, organizationRefOf } from "../src/organization/index.js";
import { SqliteInstitutionStore, makeInstitutionService } from "../src/institution/index.js";
import { materializePeerRef } from "../src/federation/index.js";
import { installPalimpsest } from "../src/install.js";
import { FakeGitPort } from "../src/effects/index.js";
import { MockHost } from "./helpers.js";

const SRC = (f: string): string => readFileSync(fileURLToPath(new URL(`../src/campaign/${f}`, import.meta.url)), "utf-8");
const strip = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const PA = materializePeerRef({ peerId: "peer-a" });
const KNOWN: CampaignInstitutionEpochSource = {
  inspectEpoch: async () => ({ state: "known", value: { institutionId: "inst-1", epoch: 0, digest: "e".repeat(64) } }),
};

function service(institutions?: CampaignInstitutionEpochSource, store = new SqliteCampaignStore(":memory:")) {
  let c = 0;
  return { store, service: makeCampaignService({ store, allocateCommitmentId: () => `cc-${++c}`, institutions }) };
}

describe("GC1-M01..M05: genesis grounding", () => {
  it("a known institution allows genesis; every other case refuses with zero events", async () => {
    const ok = service(KNOWN);
    await ok.service.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
    expect((await ok.store.replay("camp-1")).length).toBe(1);

    const missing = service(undefined);
    await expect(
      missing.service.createCampaign({ campaignId: "camp-2", institutionId: "inst-1", statement: "root" }),
    ).rejects.toMatchObject({ kind: "institution_unavailable" });
    expect(await missing.store.definition("camp-2")).toBeUndefined();
    expect((await missing.store.replay("camp-2")).length).toBe(0);

    const unknown = service({ inspectEpoch: async () => ({ state: "unknown", detail: "ghost" }) });
    await expect(
      unknown.service.createCampaign({ campaignId: "camp-3", institutionId: "ghost", statement: "root" }),
    ).rejects.toMatchObject({ kind: "institution_unknown" });
    expect((await unknown.store.replay("camp-3")).length).toBe(0);

    const errored = service({ inspectEpoch: async () => ({ state: "error", detail: "store down" }) });
    await expect(
      errored.service.createCampaign({ campaignId: "camp-4", institutionId: "inst-1", statement: "root" }),
    ).rejects.toMatchObject({ kind: "institution_error" });
    expect((await errored.store.replay("camp-4")).length).toBe(0);
  });
});

describe("GC1-M06/M07: ownership immutability and historical independence", () => {
  it("ownership has no setter and replay never needs the institution again", async () => {
    const w = service(KNOWN);
    const created = await w.service.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
    expect(created.definition.institutionId).toBe("inst-1");
    expect((w.service as unknown as { setInstitutionId?: unknown }).setInstitutionId).toBeUndefined();
    expect(strip(SRC("service.ts"))).not.toMatch(/setInstitutionId/);
    // Replay through the store alone requires no institution port.
    expect((await w.store.replay("camp-1")).length).toBe(1);
  });
});

describe("GC1-M08: install gating", () => {
  it("campaignStore alone does not expose the campaign surface", () => {
    const opts = () => ({
      projectId: "p",
      databasePath: join(mkdtempSync(join(tmpdir(), "pal-gc1-")), "s.sqlite"),
      ordariumDatabasePath: join(mkdtempSync(join(tmpdir(), "pal-gc1-ops-")), "o.sqlite"),
      git: new FakeGitPort("c".repeat(40)),
      clock: () => "2026-08-13T00:00:00Z",
    });
    const store = new SqliteCampaignStore(":memory:");
    const withoutInstitution = installPalimpsest(new MockHost() as never, { ...opts(), campaignStore: store });
    expect(withoutInstitution.campaign).toBeUndefined();
    const withInstitution = installPalimpsest(new MockHost() as never, {
      ...opts(),
      campaignStore: store,
      campaignInstitutionEpochPort: KNOWN,
    });
    expect(withInstitution.campaign?.store).toBe(store);
  });
});

describe("GC1-M09/M10: campaign survives institution body replacement", () => {
  it("an authorized epoch advance leaves CampaignId and ownership unchanged", async () => {
    const organizations = new SqliteOrganizationStore(":memory:");
    const institutionStore = new SqliteInstitutionStore(":memory:");
    let t = 0;
    const institutions = makeInstitutionService({ store: institutionStore, organizations, allocateTransitionId: () => `t-${++t}` });
    const org = (id: string, peerId: string) =>
      materializeOrganizationDefinition({ organizationDefinitionId: id, revision: 0, mission: id, members: [{ kind: "peer", peer: materializePeerRef({ peerId }) }], roles: [], assignments: [] });
    const o1 = org("org-1", "peer-a");
    const o2 = org("org-2", "peer-b");
    await organizations.registerRevision({ definition: o1, parent: null, expectedHeadRevision: null });
    await organizations.registerRevision({ definition: o2, parent: null, expectedHeadRevision: null });
    await institutions.genesis({ institutionId: "inst-1", purpose: "p", authorities: [PA], requiredApprovals: 1, organization: organizationRefOf(o1) });

    const w = service({
      inspectEpoch: async (institutionId) => {
        const head = await institutionStore.head(institutionId);
        if (head === undefined) return { state: "unknown", detail: "missing" };
        return { state: "known", value: { institutionId, epoch: head.epoch, digest: head.digest } };
      },
    });
    await w.service.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });

    const proposal = await institutions.proposeTransition({ institutionId: "inst-1", proposedOrganization: organizationRefOf(o2), reason: "body" });
    await institutions.approveRemote({ transitionId: proposal.transitionId, authenticatedPeer: PA });
    const epoch = await institutions.advance({ transitionId: proposal.transitionId });
    expect(epoch.organization.organizationDefinitionId).toBe("org-2");
    expect((await w.service.definition("camp-1"))!.campaignId).toBe("camp-1");
    expect((await w.service.definition("camp-1"))!.institutionId).toBe("inst-1");
    organizations.close();
    institutionStore.close();
  });
});
