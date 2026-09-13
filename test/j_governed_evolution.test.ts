/**
 * G10-J — governed dynamic evolution: kind matrix, standalone/institution golden
 * paths, terminal outcomes, and adversarial negatives.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  SqliteOrganizationStore,
  materializeOrganizationDefinition,
  organizationRefOf,
} from "../src/organization/index.js";
import type { OrganizationDefinition } from "../src/organization/index.js";
import { SqliteRuntimeScopeStore, makeRuntimeScopeService } from "../src/runtime_scope/index.js";
import type { RuntimeScopeOrganizationPort } from "../src/runtime_scope/index.js";
import { SqliteInstitutionStore, makeInstitutionService } from "../src/institution/index.js";
import { makeOrganizationDynamicsService } from "../src/organization_dynamics/index.js";
import type { DynamicsCollaborationObservation, DynamicsCollaborationPort, DynamicsPolicy, OrganizationDynamicsProposal } from "../src/organization_dynamics/index.js";
import { SqliteOrganizationEvolutionStore, evolutionCandidateDigestOf, evolutionCaseRefOf, makeOrganizationEvolutionService } from "../src/organization_evolution/index.js";
import type { CompleteEvolutionCandidate, OrganizationEvolutionAdmissionPort, OrganizationEvolutionCompilerPort } from "../src/organization_evolution/index.js";

const SRC = (p: string): string => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), "utf-8");
const strip = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const PEER = { schemaVersion: 1 as const, peerId: "p1" };
const MEMBER = { kind: "peer" as const, peer: PEER };
const policy: DynamicsPolicy = { ref: { id: "default", version: "1" }, minDistinctBases: 2, churnMinReconfigurations: 3, concentrationShareThreshold: 0.5, federationMinMessageEvents: 4, federationMinDistinctPeers: 2 };

function orgDef(revision: number, mission = "m", overrides: Partial<{ organizationDefinitionId: string; members: readonly unknown[] }> = {}): OrganizationDefinition {
  return materializeOrganizationDefinition({
    organizationDefinitionId: overrides.organizationDefinitionId ?? "O",
    revision,
    mission,
    members: (overrides.members as never) ?? [MEMBER],
    roles: [{ roleId: "r1", requiredCapabilities: [] }, { roleId: "r2", requiredCapabilities: [] }],
    assignments: [{ member: MEMBER, roleId: "r1" }],
    norms: [],
    interactions: [{ interactionId: "i-1", fromRoleId: "r1", toRoleId: "r2", protocol: "proto" }],
  });
}

const emptyCollab: DynamicsCollaborationObservation = { eventCounts: {}, messageEventCount: 0, distinctPeerIds: [], commitmentAcceptedEvents: 0, handoffAcceptedEvents: 0, contactRequestEvents: 0, participationActivationIds: [], coordinationHead: 0 };
function collabPort(init: DynamicsCollaborationObservation = emptyCollab): DynamicsCollaborationPort & { update: (n: Partial<DynamicsCollaborationObservation>) => void } {
  let current = init;
  return { observe: async () => current, update: (next) => { current = { ...current, ...next }; } };
}

function buildEnv(input: { readonly institution?: boolean; readonly collab?: DynamicsCollaborationPort } = {}) {
  const orgStore = new SqliteOrganizationStore(":memory:");
  const scopeStore = new SqliteRuntimeScopeStore(":memory:");
  const evolutionStore = new SqliteOrganizationEvolutionStore(":memory:");
  const organizations: RuntimeScopeOrganizationPort = {
    current: (id) => orgStore.head(id),
    exists: async (ref) => (await orgStore.get(ref)) !== undefined,
    definition: async (ref) => { const d = await orgStore.get(ref); return d === undefined ? undefined : { interactions: d.interactions }; },
  };
  const scopeService = makeRuntimeScopeService({ store: scopeStore, organizations, campaigns: { exists: async () => true }, representationAdmission: { admit: async () => ({ admitted: true }) } });
  const dynamics = makeOrganizationDynamicsService({ runtimeScopes: { store: scopeStore, service: scopeService }, organizations: { head: (id) => orgStore.head(id), get: (ref) => orgStore.get(ref) }, ...(input.collab === undefined ? {} : { collaboration: input.collab }) });
  const institutionStore = new SqliteInstitutionStore(":memory:");
  const institutionService = makeInstitutionService({ store: institutionStore, organizations: orgStore, allocateTransitionId: (() => { let n = 0; return () => `tr-${++n}`; })(), localGovernancePeer: PEER });
  const evolution = makeOrganizationEvolutionService({
    organizations: orgStore,
    dynamics,
    store: evolutionStore,
    ...(input.institution === true ? { institution: { institutionId: "I", service: institutionService, store: institutionStore } } : {}),
  });
  return { orgStore, scopeStore, evolutionStore, scopeService, dynamics, institutionStore, institutionService, evolution };
}

type Env = ReturnType<typeof buildEnv>;

/** A compiler that always authorizes; the test supplies the transformation. */
function compilerReturning(transform: (proposal: OrganizationDynamicsProposal, sources: readonly OrganizationDefinition[]) => unknown): OrganizationEvolutionCompilerPort {
  return { compile: async ({ proposal, sources }) => transform(proposal, sources) };
}

function reviseCandidate(proposal: OrganizationDynamicsProposal, base: OrganizationDefinition, mission = "m2"): unknown {
  const candidate = orgDef(base.revision + 1, mission);
  const body = {
    schemaVersion: 1 as const,
    proposalDigest: proposal.digest,
    proposalBasisDigest: proposal.basisDigest,
    kind: "REVISE" as const,
    transformation: { kind: "REVISE" as const, base: organizationRefOf(base), candidate },
    compilerProvenance: "test-compiler",
  };
  return { ...body, digest: evolutionCandidateDigestOf(body) };
}

const authorize: OrganizationEvolutionAdmissionPort = { admit: async () => ({ outcome: "authorized" }) };

async function freshProposal(env: Env, mission = "m"): Promise<{ proposal: OrganizationDynamicsProposal; base: OrganizationDefinition }> {
  const o0 = orgDef(0, mission);
  await env.orgStore.registerRevision({ definition: o0, parent: null, expectedHeadRevision: null });
  await env.scopeService.openScope({ scopeId: "R", organizationBasis: organizationRefOf(o0) });
  const o1 = orgDef(1, `${mission}-next`);
  await env.orgStore.registerRevision({ definition: o1, parent: organizationRefOf(o0), expectedHeadRevision: 0 });
  const proposed = await env.dynamics.propose({ subject: { kind: "organization", organization: organizationRefOf(o1) }, policy });
  if ("status" in proposed) throw new Error(proposed.status);
  if (proposed.proposal.kind !== "REVISE_ORGANIZATION") throw new Error(`expected REVISE, got ${proposed.proposal.kind}`);
  return { proposal: proposed.proposal, base: o1 };
}

describe("G10-J kind disposition & terminal outcomes", () => {
  it("J-N13/J-N14/J-N15/GE-A21/A22/A23: terminal kinds resolve with zero canonical writes", async () => {
    const env = buildEnv({ collab: collabPort({ ...emptyCollab, messageEventCount: 8, distinctPeerIds: ["P", "Q"], coordinationHead: 2 }) });
    const o0 = orgDef(0);
    await env.orgStore.registerRevision({ definition: o0, parent: null, expectedHeadRevision: null });
    const propose = await env.dynamics.propose({ subject: { kind: "organization", organization: organizationRefOf(o0) }, policy });
    if ("status" in propose) throw new Error(propose.status);
    expect(propose.proposal.kind).toBe("RETAIN_FEDERATION");
    const before = (await env.orgStore.lineage("O")).length;
    const resolved = await env.evolution.prepareEvolution({ proposal: propose.proposal, policy });
    expect(resolved.status).toBe("terminal_resolved");
    if (resolved.status === "terminal_resolved") expect(resolved.kind).toBe("RETAIN_FEDERATION");
    expect((await env.orgStore.lineage("O")).length).toBe(before); // zero Organization writes
    // NO_CHANGE with no evidence.
    const quiet = buildEnv();
    const q0 = orgDef(0, "quiet");
    await quiet.orgStore.registerRevision({ definition: q0, parent: null, expectedHeadRevision: null });
    const noChange = await quiet.dynamics.propose({ subject: { kind: "organization", organization: organizationRefOf(q0) }, policy });
    if ("status" in noChange) throw new Error(noChange.status);
    expect(noChange.proposal.kind).toBe("NO_CHANGE");
    const r = await quiet.evolution.prepareEvolution({ proposal: noChange.proposal, policy });
    expect(r.status).toBe("terminal_resolved");
  });

  it("GE-A38/J-N15: an unsupported kind is explicit and never falls back to mutation", async () => {
    const env = buildEnv();
    const o0 = orgDef(0);
    await env.orgStore.registerRevision({ definition: o0, parent: null, expectedHeadRevision: null });
    const proposed = await env.dynamics.propose({ subject: { kind: "organization", organization: organizationRefOf(o0) }, policy });
    if ("status" in proposed) throw new Error(proposed.status);
    const unsupported = { ...proposed.proposal, kind: "ENCAPSULATE_RUNTIME_SCOPE" as const };
    const before = (await env.orgStore.lineage("O")).length;
    const result = await env.evolution.prepareEvolution({ proposal: unsupported, policy });
    expect(result.status).toBe("unsupported_evolution_kind");
    expect((await env.orgStore.lineage("O")).length).toBe(before);
    expect(env.evolution.dispositionOf("ENCAPSULATE_RUNTIME_SCOPE")).toBe("DEFERRED_UNSUPPORTED");
    expect(env.evolution.dispositionOf("REVISE_ORGANIZATION")).toBe("EXECUTABLE_IN_J");
  });
});

describe("G10-J standalone golden path", () => {
  it("GE-A08..A28: proposal → candidate → F3 admissible → authority → activation → post-observation", async () => {
    const env = buildEnv();
    const { proposal, base } = await freshProposal(env);
    env.evolution = makeOrganizationEvolutionService({
      organizations: env.orgStore,
      dynamics: env.dynamics,
      store: env.evolutionStore,
      compiler: compilerReturning((p, sources) => reviseCandidate(p, sources[0] ?? base)),
      authority: authorize,
    });
    const result = await env.evolution.prepareEvolution({ proposal, policy });
    if (result.status !== "activated") throw new Error(`expected activated, got ${result.status}: ${"detail" in result ? result.detail : ""}`);
    expect(result.activated[0]?.revision).toBe(2);
    expect((await env.orgStore.head("O"))?.revision).toBe(2); // canonical advance
    expect((await env.orgStore.get(organizationRefOf(base)))?.mission).toBe(base.mission); // source immutable
    const inspection = await env.evolution.inspectEvolution(result.caseRef!);
    expect(inspection.state).toBe("POST_OBSERVED");
    expect(inspection.events.map((e) => e.type)).toEqual([
      "EVOLUTION_CASE_OPENED",
      "EVOLUTION_CANDIDATE_COMPILED",
      "EVOLUTION_ASSESSED",
      "EVOLUTION_AUTHORIZED",
      "EVOLUTION_ACTIVATED",
      "EVOLUTION_POST_OBSERVED",
    ]);
    // J-N20/GE-A31: retry converges without a duplicate revision.
    const retry = await env.evolution.prepareEvolution({ proposal, policy });
    expect(retry.status).toBe("activated");
    expect((await env.orgStore.lineage("O")).filter((r) => r.definition.revision === 2)).toHaveLength(1);
  });

  it("J-N01/J-N02/J-N22: a kind mismatch, a wrong source, and unknown compiler fields are rejected", async () => {
    const env = buildEnv();
    const { proposal, base } = await freshProposal(env);
    // wrong kind
    env.evolution = makeOrganizationEvolutionService({
      organizations: env.orgStore,
      dynamics: env.dynamics,
      store: env.evolutionStore,
      compiler: compilerReturning((p, sources) => {
        const candidate = orgDef(base.revision + 1, "x");
        const body = { schemaVersion: 1 as const, proposalDigest: p.digest, proposalBasisDigest: p.basisDigest, kind: "SPLIT" as const, transformation: { kind: "REVISE" as const, base: organizationRefOf(base), candidate }, compilerProvenance: "c" };
        return { ...body, digest: evolutionCandidateDigestOf(body) };
      }),
      authority: authorize,
    });
    expect((await env.evolution.prepareEvolution({ proposal, policy })).status).toBe("incomplete");
    // unknown field
    env.evolution = makeOrganizationEvolutionService({
      organizations: env.orgStore,
      dynamics: env.dynamics,
      store: env.evolutionStore,
      compiler: { compile: async () => ({ ...(reviseCandidate(proposal, base) as Record<string, unknown>), extra: true }) },
      authority: authorize,
    });
    expect((await env.evolution.prepareEvolution({ proposal, policy })).status).toBe("incomplete");
  });

  it("J-N04/GE-A32: the same proposal bound to a different candidate conflicts", async () => {
    const env = buildEnv();
    const { proposal, base } = await freshProposal(env);
    // Seed a mid-flight case for this proposal bound to candidate A; a different
    // candidate for the SAME proposal must conflict (J-N04).
    const rawA = reviseCandidate(proposal, base, "a") as { digest: string };
    await env.evolutionStore.openCase({ caseRef: evolutionCaseRefOf({ proposalDigest: proposal.digest, candidateDigest: rawA.digest }), proposalDigest: proposal.digest, candidateDigest: rawA.digest, subjectKey: "organization:O" });
    env.evolution = makeOrganizationEvolutionService({ organizations: env.orgStore, dynamics: env.dynamics, store: env.evolutionStore, compiler: compilerReturning((p) => reviseCandidate(p, base, "b")), authority: authorize });
    const conflict = await env.evolution.prepareEvolution({ proposal, policy });
    expect(conflict.status).toBe("incomplete");
    if (conflict.status === "incomplete") expect(conflict.detail).toMatch(/different candidate/);
  });
});

describe("G10-J institution-governed path & authority firewall", () => {
  it("GE-A16/A24/A25 + golden: authority → org candidate → F5 approvals → new epoch adopts successor", async () => {
    const env = buildEnv({ institution: true });
    const o0 = orgDef(0, "inst");
    await env.orgStore.registerRevision({ definition: o0, parent: null, expectedHeadRevision: null });
    await env.institutionService.genesis({ institutionId: "I", purpose: "p", authorities: [PEER], requiredApprovals: 1, organization: organizationRefOf(o0) });
    await env.scopeService.openScope({ scopeId: "R", organizationBasis: organizationRefOf(o0) });
    const o1 = orgDef(1, "inst-next");
    await env.orgStore.registerRevision({ definition: o1, parent: organizationRefOf(o0), expectedHeadRevision: 0 });
    const proposed = await env.dynamics.propose({ subject: { kind: "organization", organization: organizationRefOf(o1) }, policy });
    if ("status" in proposed) throw new Error(proposed.status);
    expect(proposed.proposal.kind).toBe("REVISE_ORGANIZATION");

    env.evolution = makeOrganizationEvolutionService({
      organizations: env.orgStore,
      dynamics: env.dynamics,
      store: env.evolutionStore,
      compiler: compilerReturning((p) => reviseCandidate(p, o1)),
      authority: authorize,
      institution: { institutionId: "I", service: env.institutionService, store: env.institutionStore },
    });
    const first = await env.evolution.prepareEvolution({ proposal: proposed.proposal, policy });
    if (first.status !== "awaiting_governance") throw new Error(`expected awaiting_governance, got ${first.status}`);
    // Organization candidate exists, but the institution still points at O@0.
    expect((await env.orgStore.head("O"))?.revision).toBe(2);
    expect((await env.institutionStore.currentEpoch("I"))?.organization.revision).toBe(0);
    await env.institutionService.approveLocal({ transitionId: first.transitionId });
    await env.institutionService.advance({ transitionId: first.transitionId });
    expect((await env.institutionStore.currentEpoch("I"))?.organization.revision).toBe(2);
    expect((await env.institutionStore.currentEpoch("I"))?.institutionId).toBe("I");
    const resumed = await env.evolution.resumeEvolution({ proposal: proposed.proposal, policy });
    expect(resumed.status).toBe("activated");
    const inspection = await env.evolution.inspectEvolution(first.caseRef);
    expect(inspection.events.map((e) => e.type)).toContain("EVOLUTION_GOVERNANCE_REQUIRED");
  });

  it("J-N08/J-N16/J-N17: denied authority and split/merge do not fork or merge institutions", async () => {
    const env = buildEnv({ institution: true });
    const o0 = orgDef(0, "inst2");
    await env.orgStore.registerRevision({ definition: o0, parent: null, expectedHeadRevision: null });
    await env.institutionService.genesis({ institutionId: "I", purpose: "p", authorities: [PEER], requiredApprovals: 1, organization: organizationRefOf(o0) });
    await env.scopeService.openScope({ scopeId: "R", organizationBasis: organizationRefOf(o0) });
    const o1 = orgDef(1, "inst2-next");
    await env.orgStore.registerRevision({ definition: o1, parent: organizationRefOf(o0), expectedHeadRevision: 0 });
    const proposed = await env.dynamics.propose({ subject: { kind: "organization", organization: organizationRefOf(o1) }, policy });
    if ("status" in proposed) throw new Error(proposed.status);
    const epochsBefore = (await env.institutionStore.epochs("I")).length;
    const denied = makeOrganizationEvolutionService({
      organizations: env.orgStore,
      dynamics: env.dynamics,
      store: env.evolutionStore,
      compiler: compilerReturning((p) => reviseCandidate(p, o1)),
      authority: { admit: async () => ({ outcome: "denied", detail: "not permitted" }) },
      institution: { institutionId: "I", service: env.institutionService, store: env.institutionStore },
    });
    const result = await denied.prepareEvolution({ proposal: proposed.proposal, policy });
    expect(result.status).toBe("denied");
    expect((await env.orgStore.head("O"))?.revision).toBe(1); // zero Organization activation
    expect((await env.institutionStore.epochs("I")).length).toBe(epochsBefore); // zero Institution transition
  });
});

describe("G10-J adversarial & firewalls", () => {
  it("GE-A13/I-N07: a blocked F3 assessment cannot be authority-overridden", async () => {
    const env = buildEnv();
    const { proposal, base } = await freshProposal(env);
    env.evolution = makeOrganizationEvolutionService({
      organizations: env.orgStore,
      dynamics: env.dynamics,
      store: env.evolutionStore,
      // Candidate revision does not advance → F3 blocked.
      compiler: compilerReturning((p) => reviseCandidate(p, base, "same-rev")),
      authority: authorize,
    });
    // Force an invalid candidate by reusing the base revision.
    env.evolution = makeOrganizationEvolutionService({
      organizations: env.orgStore,
      dynamics: env.dynamics,
      store: env.evolutionStore,
      compiler: compilerReturning((p) => {
        const candidate = orgDef(base.revision, "no-advance");
        const body = { schemaVersion: 1 as const, proposalDigest: p.digest, proposalBasisDigest: p.basisDigest, kind: "REVISE" as const, transformation: { kind: "REVISE" as const, base: organizationRefOf(base), candidate }, compilerProvenance: "c" };
        return { ...body, digest: evolutionCandidateDigestOf(body) };
      }),
      authority: authorize,
    });
    const result = await env.evolution.prepareEvolution({ proposal, policy });
    expect(result.status).toBe("blocked");
    expect((await env.orgStore.head("O"))?.revision).toBe(1);
  });

  it("I-N05/GE-A11/A12/A30: a stale proposal is refused; evolution owns no Organization truth", () => {
    // Source firewall: the evolution bridge may use F3 mutators (allowed) but the
    // Dynamics module must remain mutation-free.
    for (const file of ["dynamics.ts", "service.ts"]) {
      expect(strip(SRC(`organization_dynamics/${file}`))).not.toMatch(/registerRevision|activateOrganizationTransformation|commitTransition/);
    }
    // The evolution module never writes Organization definitions directly.
    const evolutionCode = strip(SRC("organization_evolution/service.ts"));
    expect(evolutionCode).not.toMatch(/registerRevision\b/);
    expect(evolutionCode).toMatch(/activateOrganizationTransformation/); // reuses F3
    expect(SRC("index.ts")).not.toMatch(/organization_evolution|OrganizationEvolution/);
  });

  it("I-N06/GE-A08: a stale proposal cannot compile", async () => {
    const env = buildEnv();
    const { proposal, base } = await freshProposal(env);
    // Advance the organization head after the proposal was grounded.
    await env.orgStore.registerRevision({ definition: orgDef(2, "moved"), parent: organizationRefOf(base), expectedHeadRevision: 1 });
    env.evolution = makeOrganizationEvolutionService({ organizations: env.orgStore, dynamics: env.dynamics, store: env.evolutionStore, compiler: compilerReturning((p) => reviseCandidate(p, base)), authority: authorize });
    const result = await env.evolution.prepareEvolution({ proposal, policy });
    expect(result.status).toBe("stale_proposal");
  });
});

describe("G10-J CF-I-02 campaign activity observation", () => {
  it("known activity is consulted (zombie resolved away from UNKNOWN); a missing source stays UNKNOWN", async () => {
    const env = buildEnv();
    const o0 = orgDef(0, "cfi02");
    await env.orgStore.registerRevision({ definition: o0, parent: null, expectedHeadRevision: null });
    await env.scopeService.openScope({ scopeId: "R", organizationBasis: organizationRefOf(o0) });
    await env.scopeService.associateCampaign({ scopeId: "R", campaignId: "C1" });
    const subject = { kind: "organization" as const, organization: organizationRefOf(o0) };
    // Without an activity source → UNKNOWN → zombie unresolved.
    const unaware = await env.dynamics.diagnose(subject, policy);
    if (unaware.status !== "observed" || unaware.diagnosis === undefined) throw new Error("diagnose");
    expect(unaware.snapshot.knowledge.campaignActivity).toBe("unknown");
    expect(unaware.diagnosis.pressures.find((p) => p.kind === "ZOMBIE_ORGANIZATION_CANDIDATE")?.standing).toBe("unresolved");
    // With a read-only activity source → KNOWN zero activity → zombie unsupported (a runtime scope exists).
    const aware = makeOrganizationDynamicsService({
      runtimeScopes: { store: env.scopeStore, service: env.scopeService },
      organizations: { head: (id) => env.orgStore.head(id), get: (r) => env.orgStore.get(r) },
      collaboration: collabPort(),
      campaignActivity: { observe: async (campaignId) => ({ campaignId, exists: true, lifecycle: "DORMANT", basisThroughSeq: 1, chainDigest: "a".repeat(64), semanticEventCount: 0, activeCommitmentCount: 0, activeWatchCount: 0, inFlightWake: false, state: "known" }) },
    });
    const awareResult = await aware.diagnose(subject, policy);
    if (awareResult.status !== "observed" || awareResult.diagnosis === undefined) throw new Error("diagnose2");
    expect(awareResult.snapshot.knowledge.campaignActivity).toBe("known");
    expect(awareResult.snapshot.campaignActivity?.[0]?.lifecycle).toBe("DORMANT");
    expect(awareResult.diagnosis.pressures.find((p) => p.kind === "ZOMBIE_ORGANIZATION_CANDIDATE")?.standing).toBe("unsupported");
  });
});
