/**
 * G10-I — H carry-forward closures (CF-H-03/06/08) + golden E2E + negatives.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installPalimpsest } from "../src/install.js";
import { FakeGitPort } from "../src/effects/index.js";
import { MockHost } from "./helpers.js";
import { SqliteOrganizationStore, materializeOrganizationDefinition, organizationRefOf } from "../src/organization/index.js";
import { SqliteCampaignStore } from "../src/campaign/index.js";
import { SqliteRuntimeScopeStore, makeRuntimeScopeService, RuntimeScopeStoreError } from "../src/runtime_scope/index.js";
import type { RuntimeScopeBoundary, RuntimeScopeOrganizationPort, RuntimeScopeRepresentationAdmissionPort, RuntimeScopeCampaignPort } from "../src/runtime_scope/index.js";
import { makeOrganizationDynamicsService } from "../src/organization_dynamics/index.js";
import type { DynamicsCollaborationObservation, DynamicsCollaborationPort, DynamicsPolicy, DynamicsSubject } from "../src/organization_dynamics/index.js";

const policy: DynamicsPolicy = { ref: { id: "default", version: "1" }, minDistinctBases: 2, churnMinReconfigurations: 3, concentrationShareThreshold: 0.5, federationMinMessageEvents: 4, federationMinDistinctPeers: 2 };
const allowAll: RuntimeScopeRepresentationAdmissionPort = { admit: async () => ({ admitted: true }) };
const ACT = (id: string) => ({ kind: "activation" as const, activation: { activationId: id, agentDefinitionId: `ag-${id}`, runDefinition: { digest: `rd-${id}` }, bindingResolution: { resolutionId: `res-${id}`, digest: `rr-${id}` } } });
const peer = (id: string) => ({ schemaVersion: 1 as const, peerId: id });
const orgBoundary = (interactionId: string): RuntimeScopeBoundary => ({ boundaryId: "B", protocol: "palimpsest.contact.v1", source: { kind: "organization_interaction", interactionId }, exposed: true });
const declaredBoundary = (): RuntimeScopeBoundary => ({ boundaryId: "B", protocol: "palimpsest.contact.v1", source: { kind: "runtime_declared", declarationId: "d-1" }, exposed: true });

function orgDefinition(revision: number, interactions: readonly string[]) {
  return materializeOrganizationDefinition({
    organizationDefinitionId: "O",
    revision,
    mission: "m",
    members: [],
    roles: [{ roleId: "r1", requiredCapabilities: [] }, { roleId: "r2", requiredCapabilities: [] }],
    assignments: [],
    norms: [],
    interactions: interactions.map((interactionId) => ({ interactionId, fromRoleId: "r1", toRoleId: "r2", protocol: "p" })),
  });
}

const emptyCollab: DynamicsCollaborationObservation = { eventCounts: {}, messageEventCount: 0, distinctPeerIds: [], commitmentAcceptedEvents: 0, handoffAcceptedEvents: 0, contactRequestEvents: 0, participationActivationIds: [], coordinationHead: 0 };
function collabPort(observation: DynamicsCollaborationObservation): DynamicsCollaborationPort & { update: (next: Partial<DynamicsCollaborationObservation>) => void } {
  let current = observation;
  return { observe: async () => current, update: (next) => { current = { ...current, ...next }; } };
}

describe("G10-I carry-forward closures", () => {
  it("CF-H-03/I-N09: an organization_interaction boundary source is verified or fails closed", async () => {
    const orgStore = new SqliteOrganizationStore(":memory:");
    const org = orgDefinition(0, ["i-1"]);
    await orgStore.registerRevision({ definition: org, parent: null, expectedHeadRevision: null });
    const ref = organizationRefOf(org);
    const organizations: RuntimeScopeOrganizationPort = {
      current: (id) => orgStore.head(id),
      exists: async (r) => (await orgStore.get(r)) !== undefined,
      definition: async (r) => { const d = await orgStore.get(r); return d === undefined ? undefined : { interactions: d.interactions }; },
    };
    const store = new SqliteRuntimeScopeStore(":memory:");
    const service = makeRuntimeScopeService({ store, organizations, representationAdmission: allowAll });
    await service.openScope({ scopeId: "R", organizationBasis: ref });
    await service.declareBoundary({ scopeId: "R", boundary: orgBoundary("i-1") });
    expect((await service.scopeState("R")).boundary?.source).toEqual({ kind: "organization_interaction", interactionId: "i-1" });
    await expect(service.declareBoundary({ scopeId: "R", boundary: orgBoundary("i-999") })).rejects.toThrow(/does not declare/);
    await service.openScope({ scopeId: "U" }); // no organization basis
    await expect(service.declareBoundary({ scopeId: "U", boundary: orgBoundary("i-1") })).rejects.toThrow(/requires an organization basis/);
    await service.declareBoundary({ scopeId: "U", boundary: declaredBoundary() });
    store.close();
  });

  it("CF-H-06/I-N10: external representation mutation fails closed without admission; read-only Holon remains", async () => {
    const store = new SqliteRuntimeScopeStore(":memory:");
    const noAdmission = makeRuntimeScopeService({ store });
    await noAdmission.openScope({ scopeId: "R" });
    const before = (await store.replay("R")).length;
    await expect(noAdmission.associatePeer({ scopeId: "R", peer: peer("P") })).rejects.toBeInstanceOf(RuntimeScopeStoreError);
    await expect(noAdmission.declareBoundary({ scopeId: "R", boundary: declaredBoundary() })).rejects.toBeInstanceOf(RuntimeScopeStoreError);
    expect((await store.replay("R")).length).toBe(before); // zero writes
    const deny = makeRuntimeScopeService({ store, representationAdmission: { admit: async () => ({ admitted: false, detail: "policy" }) } });
    await expect(deny.associatePeer({ scopeId: "R", peer: peer("P") })).rejects.toThrow(/not admitted/);
    expect(await deny.holonView("R")).toBeTruthy(); // read-only view still works
    store.close();
  });

  it("CF-H-08/I-N11/I-N12: campaign association is verified, lifecycle-neutral, and internal", async () => {
    const orgStore = new SqliteOrganizationStore(":memory:");
    const campaignStore = new SqliteCampaignStore(":memory:");
    await campaignStore.genesis({ definition: { schemaVersion: 1, campaignId: "C1", institutionId: "I" }, initialCommitment: { schemaVersion: 1, commitmentId: "cc1", campaignId: "C1", statement: "s" } });
    const campaigns: RuntimeScopeCampaignPort = { exists: async (id) => (await campaignStore.definition(id)) !== undefined };
    const store = new SqliteRuntimeScopeStore(":memory:");
    const service = makeRuntimeScopeService({ store, campaigns, representationAdmission: allowAll });
    await service.openScope({ scopeId: "R" });
    await service.associatePeer({ scopeId: "R", peer: peer("P") });
    const before = await service.holonView("R");
    await service.associateCampaign({ scopeId: "R", campaignId: "C1" });
    expect((await service.scopeState("R")).campaignIds).toEqual(["C1"]);
    expect((await service.holonView("R")).digest).toBe(before.digest); // internal → external unchanged
    await expect(service.associateCampaign({ scopeId: "R", campaignId: "ghost" })).rejects.toThrow(/does not exist/);
    await service.closeScope({ scopeId: "R", reason: "done" });
    expect((await campaignStore.definition("C1"))?.campaignId).toBe("C1"); // scope close ≠ campaign termination
    store.close();
  });

  it("CF-H-08: campaign association requires a campaign source", async () => {
    const store = new SqliteRuntimeScopeStore(":memory:");
    const service = makeRuntimeScopeService({ store });
    await service.openScope({ scopeId: "R" });
    await expect(service.associateCampaign({ scopeId: "R", campaignId: "C1" })).rejects.toThrow(/no campaign source/);
    store.close();
  });
});

describe("G10-I golden E2E & negatives", () => {
  it("OD §44: observe → reconfigure → diagnose → propose → impact → stale → restart, without auto-transformation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pal-i-"));
    const orgStore = new SqliteOrganizationStore(join(dir, "org.sqlite"));
    const scopeStore = new SqliteRuntimeScopeStore(join(dir, "scope.sqlite"));
    const campaignStore = new SqliteCampaignStore(join(dir, "camp.sqlite"));
    const org = orgDefinition(0, ["i-1"]);
    await orgStore.registerRevision({ definition: org, parent: null, expectedHeadRevision: null });
    const ref = organizationRefOf(org);
    await campaignStore.genesis({ definition: { schemaVersion: 1, campaignId: "C1", institutionId: "I" }, initialCommitment: { schemaVersion: 1, commitmentId: "cc1", campaignId: "C1", statement: "s" } });
    const collab = collabPort(emptyCollab);
    const scopeService = makeRuntimeScopeService({
      store: scopeStore,
      organizations: { current: (id) => orgStore.head(id), exists: async (r) => (await orgStore.get(r)) !== undefined, definition: async (r) => { const d = await orgStore.get(r); return d === undefined ? undefined : { interactions: d.interactions }; } },
      campaigns: { exists: async (id) => (await campaignStore.definition(id)) !== undefined },
      representationAdmission: allowAll,
    });
    const dynamics = makeOrganizationDynamicsService({ runtimeScopes: { store: scopeStore, service: scopeService }, organizations: { head: (id) => orgStore.head(id), get: (r) => orgStore.get(r) }, collaboration: collab });
    const subject: DynamicsSubject = { kind: "organization", organization: ref };

    await scopeService.openScope({ scopeId: "R", organizationBasis: ref });
    await scopeService.addMember({ scopeId: "R", member: ACT("A1") });
    await scopeService.addMember({ scopeId: "R", member: ACT("A2") });
    await scopeService.associatePeer({ scopeId: "R", peer: peer("P") });
    await scopeService.declareBoundary({ scopeId: "R", boundary: orgBoundary("i-1") });
    await scopeService.associateCampaign({ scopeId: "R", campaignId: "C1" });

    const orgEventsBefore = (await orgStore.lineage("O")).length;
    collab.update({ messageEventCount: 5, distinctPeerIds: ["P", "Q"], commitmentAcceptedEvents: 1, coordinationHead: 1 });
    const s1 = await dynamics.observe(subject, policy);
    if (s1.status !== "observed") throw new Error("s1");

    await scopeService.removeMember({ scopeId: "R", memberKey: "activation:A1", reason: "replaced" });
    await scopeService.addMember({ scopeId: "R", member: ACT("A3") });
    collab.update({ messageEventCount: 9, coordinationHead: 4 });
    const s2 = await dynamics.observe(subject, policy);
    if (s2.status !== "observed") throw new Error("s2");
    expect(s2.snapshot.digest).not.toBe(s1.snapshot.digest);

    const diagnosed = await dynamics.diagnose(subject, policy);
    if (diagnosed.status !== "observed" || diagnosed.diagnosis === undefined) throw new Error("diagnose");
    expect(diagnosed.diagnosis.pressures.find((p) => p.kind === "STABLE_FEDERATION")?.standing).toBe("supported");
    const persistence = await dynamics.persist([s1.snapshot, s2.snapshot], policy);
    expect(persistence.entries.find((e) => e.kind === "STABLE_FEDERATION")?.standing).toBe("persistent");

    const proposed = await dynamics.propose({ subject, policy });
    if ("status" in proposed) throw new Error("propose");
    expect(proposed.proposal.kind).toBe("RETAIN_FEDERATION");
    const impact = dynamics.proposalImpact(proposed.proposal, proposed.snapshot);
    expect(impact.independenceLoss.distinctPeers).toBe(2);
    expect(impact.mapsToExistingTransformation).toBe("unsupported");
    expect(await dynamics.evaluateProposal(proposed.proposal)).toEqual({ status: "fresh" });
    await scopeService.addMember({ scopeId: "R", member: ACT("A4") });
    expect((await dynamics.evaluateProposal(proposed.proposal)).status).toBe("stale");

    // OD-A05: dynamics mutated NOTHING canonical.
    expect((await orgStore.lineage("O")).length).toBe(orgEventsBefore);
    expect((await campaignStore.replay("C1")).length).toBe(1);
    expect((await scopeStore.replay("R")).map((e) => e.type)).not.toContain("SCOPE_CLOSED");

    // Restart with unchanged histories → identical snapshot.
    scopeStore.close();
    orgStore.close();
    campaignStore.close();
    const reopened = new SqliteRuntimeScopeStore(join(dir, "scope.sqlite"));
    const reopenedService = makeRuntimeScopeService({ store: reopened });
    const reopenedDynamics = makeOrganizationDynamicsService({ runtimeScopes: { store: reopened, service: reopenedService }, organizations: { head: async () => ref, get: async () => org }, collaboration: collabPort({ ...emptyCollab, messageEventCount: 9, distinctPeerIds: ["P", "Q"], commitmentAcceptedEvents: 1, coordinationHead: 4 }) });
    const replayed = await reopenedDynamics.observe(subject, { ...policy, ref: { id: "default", version: "1" } });
    if (replayed.status !== "observed") throw new Error("replay");
    expect(replayed.snapshot.runtime.scopeCount).toBe(1);
    expect(replayed.snapshot.runtime.activationMemberCount).toBe(3);
    reopened.close();
  });

  it("I-N01/N03/N05/N06/N07: bursts do not persist; concentration/authority/zombie stay unresolved", async () => {
    const orgStore = new SqliteOrganizationStore(":memory:");
    const org = orgDefinition(0, ["i-1"]);
    await orgStore.registerRevision({ definition: org, parent: null, expectedHeadRevision: null });
    const ref = organizationRefOf(org);
    const store = new SqliteRuntimeScopeStore(":memory:");
    const service = makeRuntimeScopeService({ store });
    const collab = collabPort({ ...emptyCollab, messageEventCount: 50, distinctPeerIds: ["P", "Q"] });
    const dynamics = makeOrganizationDynamicsService({ runtimeScopes: { store, service }, organizations: { head: (id) => orgStore.head(id), get: (r) => orgStore.get(r) }, collaboration: collab });
    const subject: DynamicsSubject = { kind: "organization", organization: ref };
    const diagnosed = await dynamics.diagnose(subject, policy);
    if (diagnosed.status !== "observed" || diagnosed.diagnosis === undefined) throw new Error("diagnose");
    const p = (kind: string) => diagnosed.diagnosis!.pressures.find((x) => x.kind === kind)?.standing;
    expect(p("INTERACTION_CONCENTRATION")).toBe("unresolved"); // I-N03: no authority inference
    expect(p("ZOMBIE_ORGANIZATION_CANDIDATE")).toBe("unresolved"); // I-N05/N06
    const single = await dynamics.persist([diagnosed.snapshot], policy);
    expect(single.entries.find((e) => e.kind === "SHADOW_ORGANIZATION_CANDIDATE")?.standing).not.toBe("persistent"); // I-N01
    // I-N07: recorded membership is not liveness — the snapshot has no liveness field.
    expect(Object.hasOwn(diagnosed.snapshot.runtime, "liveActivationCount")).toBe(false);
    store.close();
  });

  it("H-A26: the installed dynamics surface is absent without wiring, present with it", () => {
    const bare = installPalimpsest(new MockHost() as never, {
      projectId: "p",
      databasePath: join(mkdtempSync(join(tmpdir(), "pal-i-bare-")), "s.sqlite"),
      ordariumDatabasePath: join(mkdtempSync(join(tmpdir(), "pal-i-bare-ops-")), "o.sqlite"),
      git: new FakeGitPort("c".repeat(40)),
      clock: () => "2026-08-13T00:00:00Z",
    });
    expect(bare.organizationDynamics).toBeUndefined();
    const scopeStore = new SqliteRuntimeScopeStore(":memory:");
    const withWiring = installPalimpsest(new MockHost() as never, {
      projectId: "p",
      databasePath: join(mkdtempSync(join(tmpdir(), "pal-i-w-")), "s.sqlite"),
      ordariumDatabasePath: join(mkdtempSync(join(tmpdir(), "pal-i-w-ops-")), "o.sqlite"),
      git: new FakeGitPort("c".repeat(40)),
      clock: () => "2026-08-13T00:00:00Z",
      runtimeScopeStore: scopeStore,
      organizationStore: new SqliteOrganizationStore(":memory:"),
    });
    expect(typeof withWiring.organizationDynamics?.service.observe).toBe("function");
  });
});
