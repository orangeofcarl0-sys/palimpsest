/**
 * G10-I — grounded snapshot, mechanical metrics, diagnostics, hysteresis,
 * proposal grounding/freshness/impact, and zero-mutation authority.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SqliteOrganizationStore, materializeOrganizationDefinition, organizationRefOf } from "../src/organization/index.js";
import { SqliteCampaignStore } from "../src/campaign/index.js";
import { SqliteRuntimeScopeStore, makeRuntimeScopeService } from "../src/runtime_scope/index.js";
import type { RuntimeScopeOrganizationPort, RuntimeScopeRepresentationAdmissionPort, RuntimeScopeCampaignPort, RuntimeScopeBoundary } from "../src/runtime_scope/index.js";
import { makeOrganizationDynamicsService, parseOrganizationDynamicsProposal } from "../src/organization_dynamics/index.js";
import type { DynamicsCollaborationObservation, DynamicsCollaborationPort, DynamicsPolicy, DynamicsSubject } from "../src/organization_dynamics/index.js";

const SRC = (p: string): string => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), "utf-8");
const strip = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const policy = (overrides: Partial<DynamicsPolicy> = {}): DynamicsPolicy => ({
  ref: { id: "default", version: "1" },
  minDistinctBases: 2,
  churnMinReconfigurations: 3,
  concentrationShareThreshold: 0.5,
  federationMinMessageEvents: 4,
  federationMinDistinctPeers: 2,
  ...overrides,
});

const allowAll: RuntimeScopeRepresentationAdmissionPort = { admit: async () => ({ admitted: true }) };
const boundary = (interactionId: string): RuntimeScopeBoundary => ({ boundaryId: "B", protocol: "palimpsest.contact.v1", source: { kind: "organization_interaction", interactionId }, exposed: true });
const ACT = (id: string) => ({ kind: "activation" as const, activation: { activationId: id, agentDefinitionId: `ag-${id}`, runDefinition: { digest: `rd-${id}` }, bindingResolution: { resolutionId: `res-${id}`, digest: `rr-${id}` } } });
const peer = (id: string) => ({ schemaVersion: 1 as const, peerId: id });

function mutableCollab(initial: DynamicsCollaborationObservation): DynamicsCollaborationPort & { update: (next: Partial<DynamicsCollaborationObservation>) => void } {
  let observation = initial;
  return {
    observe: async () => observation,
    update: (next) => {
      observation = { ...observation, ...next };
    },
  };
}

const emptyCollab = (): DynamicsCollaborationObservation => ({
  eventCounts: {},
  messageEventCount: 0,
  distinctPeerIds: [],
  commitmentAcceptedEvents: 0,
  handoffAcceptedEvents: 0,
  contactRequestEvents: 0,
  participationActivationIds: [],
  coordinationHead: 0,
});

function buildEnv(overrides: { readonly interactions?: readonly string[]; readonly orgRevision?: number } = {}) {
  const orgStore = new SqliteOrganizationStore(":memory:");
  const campaignStore = new SqliteCampaignStore(":memory:");
  const scopeStore = new SqliteRuntimeScopeStore(":memory:");
  const collab = mutableCollab(emptyCollab());
  const orgPort: RuntimeScopeOrganizationPort = {
    current: (id) => orgStore.head(id),
    exists: async (ref) => (await orgStore.get(ref)) !== undefined,
    definition: async (ref) => {
      const def = await orgStore.get(ref);
      return def === undefined ? undefined : { interactions: def.interactions };
    },
  };
  const campaigns: RuntimeScopeCampaignPort = { exists: async (id) => (await campaignStore.definition(id)) !== undefined };
  const scopeService = makeRuntimeScopeService({ store: scopeStore, organizations: orgPort, campaigns, representationAdmission: allowAll });
  const dynamics = makeOrganizationDynamicsService({ runtimeScopes: { store: scopeStore, service: scopeService }, organizations: { head: (id) => orgStore.head(id), get: (ref) => orgStore.get(ref) }, collaboration: collab });
  return { orgStore, campaignStore, scopeStore, scopeService, dynamics, collab };
}

async function seedOrg(env: ReturnType<typeof buildEnv>, interactions: readonly string[] = ["i-1"]) {
  const org = materializeOrganizationDefinition({
    organizationDefinitionId: "O",
    revision: 0,
    mission: "m",
    members: [],
    roles: [{ roleId: "r1", requiredCapabilities: [] }, { roleId: "r2", requiredCapabilities: [] }],
    assignments: [],
    norms: [],
    interactions: interactions.map((interactionId) => ({ interactionId, fromRoleId: "r1", toRoleId: "r2", protocol: "p" })),
  });
  await env.orgStore.registerRevision({ definition: org, parent: null, expectedHeadRevision: null });
  return organizationRefOf(org);
}

async function seedCampaign(env: ReturnType<typeof buildEnv>) {
  await env.campaignStore.genesis({
    definition: { schemaVersion: 1, campaignId: "C1", institutionId: "I" },
    initialCommitment: { schemaVersion: 1, commitmentId: "cc1", campaignId: "C1", statement: "s" },
  });
}

describe("G10-I snapshot & diagnostics", () => {
  it("OD-A09/A10/A27: deterministic snapshot with an exact multi-store basis and mechanical metrics", async () => {
    const env = buildEnv();
    const orgRef = await seedOrg(env);
    await env.scopeService.openScope({ scopeId: "R", organizationBasis: orgRef });
    await env.scopeService.addMember({ scopeId: "R", member: ACT("A1") });
    await env.scopeService.addMember({ scopeId: "R", member: ACT("A2") });
    await env.scopeService.removeMember({ scopeId: "R", memberKey: "activation:A1", reason: "r" });
    await env.scopeService.declareBoundary({ scopeId: "R", boundary: boundary("i-1") });
    const subject: DynamicsSubject = { kind: "organization", organization: orgRef };
    const first = await env.dynamics.observe(subject, policy());
    const second = await env.dynamics.observe(subject, policy());
    if (first.status !== "observed" || second.status !== "observed") throw new Error("observe");
    expect(first.snapshot.digest).toBe(second.snapshot.digest); // OD-A09 restart-deterministic
    expect(first.snapshot.basis.organization).toEqual(orgRef); // OD-A10 exact basis
    expect(first.snapshot.basis.runtimeScopes.map((s) => s.scope.scopeId)).toEqual(["R"]);
    expect(first.snapshot.runtime.scopeCount).toBe(1);
    expect(first.snapshot.runtime.activationMemberCount).toBe(1);
    expect(first.snapshot.runtime.memberAdditions).toBe(2);
    expect(first.snapshot.runtime.memberRemovals).toBe(1);
    expect(first.snapshot.runtime.reconfigurationCount).toBe(3);
    expect(first.snapshot.runtime.externalBoundaryCount).toBe(1);
    expect(first.snapshot.organization?.interactionCount).toBe(1);
  });

  it("OD-A08/A17/A18: a missing source is UNKNOWN, never empty; zombie stays unresolved", async () => {
    const env = buildEnv();
    const orgRef = await seedOrg(env);
    const dynamicsNoCollab = makeOrganizationDynamicsService({ runtimeScopes: { store: env.scopeStore, service: env.scopeService }, organizations: { head: (id) => env.orgStore.head(id), get: (ref) => env.orgStore.get(ref) } });
    const subject: DynamicsSubject = { kind: "organization", organization: orgRef };
    const observed = await dynamicsNoCollab.observe(subject, policy());
    if (observed.status !== "observed") throw new Error("observe");
    expect(observed.snapshot.collaboration).toBeNull();
    expect(observed.snapshot.knowledge.collaboration).toBe("unknown");
    const diagnosed = await dynamicsNoCollab.diagnose(subject, policy());
    if (diagnosed.status !== "observed" || diagnosed.diagnosis === undefined) throw new Error("diagnose");
    expect(diagnosed.diagnosis.pressures.find((p) => p.kind === "ZOMBIE_ORGANIZATION_CANDIDATE")?.standing).toBe("unresolved");
    expect(diagnosed.diagnosis.pressures.find((p) => p.kind === "STABLE_FEDERATION")?.standing).toBe("unresolved");
  });

  it("OD-A15/A16/A25/OD-A23: drift diagnostics are mechanical and policy-provenanced; stale grounding is supported", async () => {
    const env = buildEnv();
    const orgRef = await seedOrg(env);
    await env.scopeService.openScope({ scopeId: "R", organizationBasis: orgRef });
    await env.scopeService.declareBoundary({ scopeId: "R", boundary: boundary("i-1") });
    // Advance the organization revision → the recorded basis becomes stale.
    const next = materializeOrganizationDefinition({ organizationDefinitionId: "O", revision: 1, mission: "m2", members: [], roles: [{ roleId: "r1", requiredCapabilities: [] }, { roleId: "r2", requiredCapabilities: [] }], assignments: [], norms: [], interactions: [{ interactionId: "i-1", fromRoleId: "r1", toRoleId: "r2", protocol: "p" }] });
    await env.orgStore.registerRevision({ definition: next, parent: orgRef, expectedHeadRevision: 0 });
    const subject: DynamicsSubject = { kind: "organization", organization: orgRef };
    const diagnosed = await env.dynamics.diagnose(subject, policy());
    if (diagnosed.status !== "observed" || diagnosed.diagnosis === undefined) throw new Error("diagnose");
    expect(diagnosed.snapshot.runtime.organizationBasisFreshness).toBe("stale");
    expect(diagnosed.diagnosis.pressures.find((p) => p.kind === "STALE_ORGANIZATION_GROUNDING")?.standing).toBe("supported");
    // declared interaction i-1 has a boundary source → not "declared but unobserved".
    expect(diagnosed.diagnosis.pressures.find((p) => p.kind === "DECLARED_BUT_UNOBSERVED_INTERACTION")?.standing).toBe("unsupported");
    expect(diagnosed.diagnosis.policy).toEqual({ id: "default", version: "1" });
  });

  it("OD-A22/A23: churn threshold is taken from the explicit policy, not a magic number", async () => {
    const env = buildEnv();
    const orgRef = await seedOrg(env);
    await env.scopeService.openScope({ scopeId: "R" });
    await env.scopeService.addMember({ scopeId: "R", member: ACT("A1") });
    const subject: DynamicsSubject = { kind: "runtime_scope", scope: { schemaVersion: 1, scopeId: "R" } };
    const low = await env.dynamics.diagnose(subject, policy({ churnMinReconfigurations: 1 }));
    const high = await env.dynamics.diagnose(subject, policy({ ref: { id: "strict", version: "1" }, churnMinReconfigurations: 99 }));
    if (low.status !== "observed" || low.diagnosis === undefined || high.status !== "observed" || high.diagnosis === undefined) throw new Error("diagnose");
    expect(low.diagnosis.pressures.find((p) => p.kind === "RUNTIME_RECONFIGURATION_CHURN")?.standing).toBe("supported");
    expect(high.diagnosis.pressures.find((p) => p.kind === "RUNTIME_RECONFIGURATION_CHURN")?.standing).toBe("unsupported");
    expect(high.diagnosis.policy.id).toBe("strict");
    void orgRef;
  });

  it("OD-A12/A13/I-N22: persistence requires multiple distinct bases; stable federation is a supported outcome", async () => {
    const env = buildEnv();
    const orgRef = await seedOrg(env);
    await seedCampaign(env);
    env.collab.update({ messageEventCount: 6, distinctPeerIds: ["P", "Q"], commitmentAcceptedEvents: 1, coordinationHead: 1 });
    const subject: DynamicsSubject = { kind: "organization", organization: orgRef };
    const s1 = await env.dynamics.observe(subject, policy());
    if (s1.status !== "observed") throw new Error("s1");
    env.collab.update({ messageEventCount: 8, coordinationHead: 3 });
    const s2 = await env.dynamics.observe(subject, policy());
    if (s2.status !== "observed") throw new Error("s2");
    expect(s1.snapshot.digest).not.toBe(s2.snapshot.digest);
    const single = await env.dynamics.persist([s1.snapshot], policy());
    expect(single.entries.find((e) => e.kind === "STABLE_FEDERATION")?.standing).not.toBe("persistent");
    const across = await env.dynamics.persist([s1.snapshot, s2.snapshot], policy());
    const federation = across.entries.find((e) => e.kind === "STABLE_FEDERATION");
    expect(federation?.standing).toBe("persistent");
    expect(federation?.distinctBases).toBeGreaterThanOrEqual(2);
  });

  it("OD-A20/I-N21: interface compressibility reports evidence and semantic unknowns, never a score", async () => {
    const env = buildEnv();
    const orgRef = await seedOrg(env);
    await env.scopeService.openScope({ scopeId: "R", organizationBasis: orgRef });
    await env.scopeService.declareBoundary({ scopeId: "R", boundary: boundary("i-1") });
    const diagnosed = await env.dynamics.diagnose({ kind: "runtime_scope", scope: { schemaVersion: 1, scopeId: "R" } }, policy());
    if (diagnosed.status !== "observed" || diagnosed.diagnosis === undefined) throw new Error("diagnose");
    const c = diagnosed.diagnosis.interfaceCompressibility;
    expect(c.semanticSufficiency).toBe("requires_evidence");
    const proposal = await env.dynamics.propose({ subject: { kind: "runtime_scope", scope: { schemaVersion: 1, scopeId: "R" } }, policy: policy() });
    if ("status" in proposal) throw new Error("propose");
    const impact = env.dynamics.proposalImpact(proposal.proposal, proposal.snapshot);
    expect(impact.independenceLoss.distinctAuthorityDomains).toBe("unknown");
    expect(impact.independenceLoss.distinctEvidenceSources).toBe("unknown");
  });
});

describe("G10-I proposal grounding, freshness & zero mutation", () => {
  it("OD-A30/I-N20: a proposal is basis-bound and becomes stale after a source change", async () => {
    const env = buildEnv();
    const orgRef = await seedOrg(env);
    await env.scopeService.openScope({ scopeId: "R", organizationBasis: orgRef });
    const subject: DynamicsSubject = { kind: "runtime_scope", scope: { schemaVersion: 1, scopeId: "R" } };
    const proposed = await env.dynamics.propose({ subject, policy: policy() });
    if ("status" in proposed) throw new Error("propose");
    expect(await env.dynamics.evaluateProposal(proposed.proposal)).toEqual({ status: "fresh" });
    await env.scopeService.addMember({ scopeId: "R", member: ACT("A1") });
    const stale = await env.dynamics.evaluateProposal(proposed.proposal);
    expect(stale.status).toBe("stale");
  });

  it("I-N25/advisor: an untrusted advisor output is strictly parsed, and extra/mutation fields fail closed", async () => {
    const env = buildEnv();
    const orgRef = await seedOrg(env);
    await env.scopeService.openScope({ scopeId: "R", organizationBasis: orgRef });
    const subject: DynamicsSubject = { kind: "organization", organization: orgRef };
    const good = await env.dynamics.propose({ subject, policy: policy(), advisor: { propose: async () => ({ kind: "REVISE_ORGANIZATION", targets: ["O"], intent: "rebind", advisorProvenance: "model-x" }) } });
    if ("status" in good) throw new Error("propose");
    expect(good.proposal.advisorProvenance).toBe("model-x");
    expect(good.proposal.mapsToExistingTransformation).toBe("REVISE");
    await expect(env.dynamics.propose({ subject, policy: policy(), advisor: { propose: async () => ({ kind: "REVISE_ORGANIZATION", targets: ["O"], intent: "rebind", advisorProvenance: "m", applyNow: true }) } })).rejects.toThrow(/unknown/);
    await expect(env.dynamics.propose({ subject, policy: policy(), advisor: { propose: async () => ({ kind: "NOT_A_KIND", targets: [], intent: "x", advisorProvenance: "m" }) } })).rejects.toThrow(/unsupported/);
  });

  it("OD-A05/A29/I-N13..17: the dynamics module imports no canonical mutator", () => {
    for (const file of ["dynamics.ts", "service.ts"]) {
      const code = strip(SRC(`organization_dynamics/${file}`));
      expect(code).not.toMatch(/registerRevision|registerRevisions|planTransformationActivation|activateOrganizationTransformation|commitTransition|institution/);
      expect(code).not.toMatch(/applyProposal|activateProposal|mergeNow|splitNow|formalizeNow/);
      expect(code).not.toMatch(/ordarium|effects\//i);
    }
    expect(SRC("index.ts")).not.toMatch(/organization_dynamics|OrganizationDynamics/);
  });

  it("I-N25: a transferred diagnosis/proposal with unknown fields fails strict parsing", async () => {
    const env = buildEnv();
    const orgRef = await seedOrg(env);
    await env.scopeService.openScope({ scopeId: "R", organizationBasis: orgRef });
    const proposed = await env.dynamics.propose({ subject: { kind: "organization", organization: orgRef }, policy: policy() });
    if ("status" in proposed) throw new Error("propose");
    expect(() => parseOrganizationDynamicsProposal({ ...proposed.proposal, organizationHealth: 0.78 })).toThrow(/unknown/);
    expect(() => parseOrganizationDynamicsProposal({ ...proposed.proposal, digest: "0".repeat(64) })).toThrow(/digest/);
  });
});
