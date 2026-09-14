/**
 * G10-M runtime structural evolution — multi-scope atomicity, ENCAPSULATE/COLLAPSE/
 * RETIRE_SCOPE golden paths, external-surface safety, authority independence, and the
 * adversarial/concurrency matrix (RS-A01…A29, M-N01…N24).
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SqliteRuntimeScopeStore,
  makeRuntimeScopeService,
  materializeRuntimeScopeDefinition,
  runtimeScopeMemberKey,
} from "../src/runtime_scope/index.js";
import type { RuntimeScopeMember, RuntimeScopeService } from "../src/runtime_scope/index.js";
import { makeOrganizationDynamicsService } from "../src/organization_dynamics/index.js";
import type { DynamicsPolicy, OrganizationDynamicsProposal } from "../src/organization_dynamics/index.js";
import {
  SqliteRuntimeEvolutionStore,
  makeRuntimeEvolutionService,
  runtimeEvolutionCandidateDigestOf,
} from "../src/runtime_evolution/index.js";
import type { RuntimeStructuralEvolutionAdmissionPort, RuntimeStructuralEvolutionCompilerPort } from "../src/runtime_evolution/index.js";

const SRC = (p: string): string => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), "utf-8");
const strip = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const policy: DynamicsPolicy = { ref: { id: "default", version: "1" }, minDistinctBases: 2, churnMinReconfigurations: 3, concentrationShareThreshold: 0.5, federationMinMessageEvents: 4, federationMinDistinctPeers: 2 };
const activation = (id: string): RuntimeScopeMember => ({
  kind: "activation",
  activation: { activationId: id, agentDefinitionId: `ag-${id}`, runDefinition: { digest: `rd-${id}` }, bindingResolution: { resolutionId: `res-${id}`, digest: `rr-${id}` } },
});
const childScope = (id: string): RuntimeScopeMember => ({ kind: "child_scope", scope: { schemaVersion: 1, scopeId: id } });
const authorize: RuntimeStructuralEvolutionAdmissionPort = { admit: async () => ({ outcome: "authorized" }) };
const deny: RuntimeStructuralEvolutionAdmissionPort = { admit: async () => ({ outcome: "denied", detail: "policy denies runtime restructuring" }) };

function build(config: { readonly path?: string; readonly campaigns?: boolean; readonly authority?: RuntimeStructuralEvolutionAdmissionPort; readonly compiler?: RuntimeStructuralEvolutionCompilerPort } = {}) {
  const store = new SqliteRuntimeScopeStore(config.path ?? ":memory:");
  const service = makeRuntimeScopeService({
    store,
    representationAdmission: { admit: async () => ({ admitted: true }) },
    ...(config.campaigns === true ? { campaigns: { exists: async () => true } } : {}),
  });
  const dynamics = makeOrganizationDynamicsService({ runtimeScopes: { store, service } });
  const evolutionStore = new SqliteRuntimeEvolutionStore(":memory:");
  const evolution = makeRuntimeEvolutionService({
    runtimeScopes: { store, service },
    dynamics,
    store: evolutionStore,
    compiler: config.compiler ?? compilerFor({}),
    authority: config.authority ?? authorize,
  });
  return { store, service, dynamics, evolutionStore, evolution };
}
type Env = ReturnType<typeof build>;

/** Compiler driven by a simple plan derived from the proposal kind + all scope states. */
function compilerFor(plan: { readonly newChildId?: string; readonly move?: readonly string[]; readonly synthetic?: readonly string[] }): RuntimeStructuralEvolutionCompilerPort {
  return {
    compile: async ({ proposal, scopes }) => {
      const byId = new Map(scopes.map((state) => [state.definition.scopeId, state]));
      const refOf = (scopeId: string) => ({ ref: { schemaVersion: 1 as const, scopeId }, basis: byId.get(scopeId)!.basis });
      if (proposal.kind === "ENCAPSULATE_RUNTIME_SCOPE") {
        if (proposal.subject.kind !== "runtime_scope") throw new Error("subject");
        const parentId = proposal.subject.scope.scopeId;
        const parent = byId.get(parentId)!;
        const keys = new Set(plan.move ?? []);
        const synth = (key: string): RuntimeScopeMember => (key.startsWith("activation:") ? activation(key.slice("activation:".length)) : childScope(key.slice("child_scope:".length)));
        const moved = [...parent.members.filter((member) => keys.has(runtimeScopeMemberKey(member))), ...(plan.synthetic ?? []).map(synth)];
        const body = {
          schemaVersion: 1 as const,
          kind: "ENCAPSULATE" as const,
          proposalDigest: proposal.digest,
          proposalBasisDigest: proposal.basisDigest,
          sourceParent: refOf(parentId),
          newChild: materializeRuntimeScopeDefinition({ scopeId: plan.newChildId ?? "N1", organizationBasis: null }),
          membersToMove: moved,
          compilerProvenance: "test-compiler",
        };
        return { ...body, digest: runtimeEvolutionCandidateDigestOf(body) };
      }
      if (proposal.kind === "COLLAPSE_RUNTIME_STRUCTURE") {
        if (proposal.subject.kind !== "runtime_scope") throw new Error("subject");
        const childId = proposal.subject.scope.scopeId;
        const child = byId.get(childId)!;
        const parentId = child.parent!.scopeId;
        const body = {
          schemaVersion: 1 as const,
          kind: "COLLAPSE" as const,
          proposalDigest: proposal.digest,
          proposalBasisDigest: proposal.basisDigest,
          child: refOf(childId),
          parent: refOf(parentId),
          compilerProvenance: "test-compiler",
        };
        return { ...body, digest: runtimeEvolutionCandidateDigestOf(body) };
      }
      if (proposal.subject.kind !== "runtime_scope") throw new Error("subject");
      const scopeId = proposal.subject.scope.scopeId;
      const body = {
        schemaVersion: 1 as const,
        kind: "RETIRE_SCOPE" as const,
        proposalDigest: proposal.digest,
        proposalBasisDigest: proposal.basisDigest,
        scope: refOf(scopeId),
        compilerProvenance: "test-compiler",
      };
      return { ...body, digest: runtimeEvolutionCandidateDigestOf(body) };
    },
  };
}

async function propose(env: Env, scopeId: string, kind: string): Promise<OrganizationDynamicsProposal> {
  const advisor = { propose: async () => ({ kind, targets: [scopeId], intent: "test intent", advisorProvenance: "test-advisor" }) };
  const result = await env.dynamics.propose({ subject: { kind: "runtime_scope", scope: { schemaVersion: 1, scopeId } }, policy, advisor });
  if ("status" in result) throw new Error(result.status);
  return result.proposal;
}

/** P { A1, A2, X } with an explicit peer + boundary (external surface). */
async function parentWithMembers(env: Env, id = "P"): Promise<void> {
  await env.service.openScope({ scopeId: id });
  await env.service.addMember({ scopeId: id, member: activation("A1") });
  await env.service.addMember({ scopeId: id, member: activation("A2") });
  await env.service.addMember({ scopeId: id, member: activation("X") });
}
async function parentWithExternalSurface(env: Env, id = "P"): Promise<void> {
  await parentWithMembers(env, id);
  await env.service.associatePeer({ scopeId: id, peer: { schemaVersion: 1, peerId: "parent-peer" } });
  await env.service.declareBoundary({ scopeId: id, boundary: { boundaryId: "b1", protocol: "http", source: { kind: "runtime_declared", declarationId: "d1" }, exposed: true } });
}

describe("G10-M multi-scope atomic transition primitive (RS-A10/A11/A12/A13)", () => {
  it("applies one logical transition over many scopes, all-or-none, with independent chains", async () => {
    const env = build();
    await env.service.openScope({ scopeId: "P" });
    await env.service.openScope({ scopeId: "C" });
    const pBasis = (await env.store.basis("P"))!;
    const cBasis = (await env.store.basis("C"))!;
    const result = await env.store.applyStructuralTransition({
      expectedScopes: [
        { scopeId: "P", expectedBasis: pBasis, events: [{ eventId: "e-p1", type: "SCOPE_MEMBER_ADDED", payload: { member: childScope("C") } }] },
        { scopeId: "C", expectedBasis: cBasis, events: [{ eventId: "e-c1", type: "SCOPE_MEMBER_ADDED", payload: { member: activation("A1") } }] },
      ],
      createScopes: [{ definition: materializeRuntimeScopeDefinition({ scopeId: "N", organizationBasis: null }), events: [{ eventId: "e-n1", type: "SCOPE_MEMBER_ADDED", payload: { member: activation("A2") } }] }],
    });
    expect(result.created.filter((event) => event.type === "RUNTIME_SCOPE_OPENED")).toHaveLength(1);
    expect((await env.store.replay("P"))[1]!.chainDigest).not.toBe((await env.store.replay("C"))[1]!.chainDigest);
    expect((await env.service.scopeState("N")).members.map(runtimeScopeMemberKey)).toEqual(["activation:A2"]);
    // Idempotent replay.
    const again = await env.store.applyStructuralTransition({
      expectedScopes: [
        { scopeId: "P", expectedBasis: (await env.store.basis("P"))!, events: [{ eventId: "e-p1", type: "SCOPE_MEMBER_ADDED", payload: { member: childScope("C") } }] },
        { scopeId: "C", expectedBasis: (await env.store.basis("C"))!, events: [{ eventId: "e-c1", type: "SCOPE_MEMBER_ADDED", payload: { member: activation("A1") } }] },
      ],
      createScopes: [{ definition: materializeRuntimeScopeDefinition({ scopeId: "N", organizationBasis: null }), events: [{ eventId: "e-n1", type: "SCOPE_MEMBER_ADDED", payload: { member: activation("A2") } }] }],
    });
    expect(again.created[0]!.seq).toBe(1);
    expect((await env.store.replay("P")).filter((e) => e.eventId === "e-p1")).toHaveLength(1);
    env.store.close();
  });

  it("M-N24/RS-A10: a partial transition fails closed and never completes the rest", async () => {
    const env = build();
    await env.service.openScope({ scopeId: "P" });
    await env.service.openScope({ scopeId: "C" });
    await env.store.appendAtomic({ scopeId: "P", expectedBasis: (await env.store.basis("P"))!, events: [{ eventId: "e-p1", type: "SCOPE_MEMBER_ADDED", payload: { member: childScope("C") } }] });
    await expect(
      env.store.applyStructuralTransition({
        expectedScopes: [
          { scopeId: "P", expectedBasis: (await env.store.basis("P"))!, events: [{ eventId: "e-p1", type: "SCOPE_MEMBER_ADDED", payload: { member: childScope("C") } }] },
          { scopeId: "C", expectedBasis: (await env.store.basis("C"))!, events: [{ eventId: "e-c1", type: "SCOPE_MEMBER_ADDED", payload: { member: activation("A1") } }] },
        ],
        createScopes: [],
      }),
    ).rejects.toMatchObject({ kind: "recovery_required" });
    expect((await env.store.replay("C")).some((e) => e.eventId === "e-c1")).toBe(false);
    env.store.close();
  });

  it("an eventId reused with different content fails closed; a stale basis fails closed", async () => {
    const env = build();
    await env.service.openScope({ scopeId: "P" });
    const basis = (await env.store.basis("P"))!;
    await env.store.appendAtomic({ scopeId: "P", expectedBasis: basis, events: [{ eventId: "e1", type: "SCOPE_MEMBER_ADDED", payload: { member: activation("A1") } }] });
    await expect(
      env.store.applyStructuralTransition({ expectedScopes: [{ scopeId: "P", expectedBasis: (await env.store.basis("P"))!, events: [{ eventId: "e1", type: "SCOPE_MEMBER_ADDED", payload: { member: activation("DIFFERENT") } }] }], createScopes: [] }),
    ).rejects.toMatchObject({ kind: "event_conflict" });
    await expect(
      env.store.applyStructuralTransition({ expectedScopes: [{ scopeId: "P", expectedBasis: basis, events: [{ eventId: "e2", type: "SCOPE_MEMBER_ADDED", payload: { member: activation("A2") } }] }], createScopes: [] }),
    ).rejects.toMatchObject({ kind: "basis_mismatch" });
    env.store.close();
  });
});

describe("G10-M ENCAPSULATE golden (RS-A15/A16/A17, M-N01/N02/N03/N04)", () => {
  it("moves exact members into a new child atomically and preserves the parent's external Holon digest", async () => {
    const env = build({ compiler: compilerFor({ newChildId: "N1", move: ["activation:A1", "activation:A2"] }) });
    await parentWithExternalSurface(env);
    const before = await env.service.holonView("P");
    const result = await env.evolution.advanceRuntimeEvolution({ proposal: await propose(env, "P", "ENCAPSULATE_RUNTIME_SCOPE"), policy });
    expect(result.status).toBe("activated");
    const p = await env.service.scopeState("P");
    expect(p.members.map(runtimeScopeMemberKey)).toEqual(["activation:X", "child_scope:N1"]);
    const n = await env.service.scopeState("N1");
    expect(n.members.map(runtimeScopeMemberKey)).toEqual(["activation:A1", "activation:A2"]);
    // No external semantics are inherited.
    expect(n.peer).toBeNull();
    expect(n.boundary).toBeNull();
    expect(n.campaignIds).toEqual([]);
    expect(n.definition.organizationBasis).toBeNull();
    // Internal-only change: the parent's external Holon contract is byte-identical.
    const after = await env.service.holonView("P");
    expect(after.digest).toBe(before.digest);
    expect(after.peer).toEqual(before.peer);
    expect(after.boundary).toEqual(before.boundary);
    env.store.close();
  });

  it("M-N03/N04: a missing member or an occupied new scope id blocks with zero writes", async () => {
    const missing = build({ compiler: compilerFor({ newChildId: "N1", synthetic: ["activation:NOPE"] }) });
    await parentWithMembers(missing);
    const blocked = await missing.evolution.advanceRuntimeEvolution({ proposal: await propose(missing, "P", "ENCAPSULATE_RUNTIME_SCOPE"), policy });
    expect(blocked.status).toBe("blocked");
    expect((await missing.service.scopeState("P")).members).toHaveLength(3);
    missing.store.close();

    const occupied = build({ compiler: compilerFor({ newChildId: "N1", move: ["activation:A1"] }) });
    await parentWithMembers(occupied);
    await occupied.service.openScope({ scopeId: "N1" }); // the id is already taken by a real scope
    const blocked2 = await occupied.evolution.advanceRuntimeEvolution({ proposal: await propose(occupied, "P", "ENCAPSULATE_RUNTIME_SCOPE"), policy });
    expect(blocked2.status).toBe("blocked");
    expect((await occupied.service.scopeState("P")).members).toHaveLength(3);
    occupied.store.close();
  });
});

describe("G10-M COLLAPSE golden + external-surface blocks (RS-A18/A19/A20, M-N07/N08/N09/N10)", () => {
  async function parentWithChild(env: Env, options: { readonly peer?: boolean; readonly boundary?: boolean; readonly campaign?: boolean } = {}): Promise<void> {
    await env.service.openScope({ scopeId: "P" });
    await env.service.openScope({ scopeId: "C" });
    await env.service.addMember({ scopeId: "P", member: childScope("C") });
    await env.service.addMember({ scopeId: "C", member: activation("A1") });
    await env.service.addMember({ scopeId: "C", member: activation("A2") });
    if (options.peer === true) await env.service.associatePeer({ scopeId: "C", peer: { schemaVersion: 1, peerId: "child-peer" } });
    if (options.boundary === true) await env.service.declareBoundary({ scopeId: "C", boundary: { boundaryId: "b", protocol: "http", source: { kind: "runtime_declared", declarationId: "d" }, exposed: true } });
    if (options.campaign === true) await env.service.associateCampaign({ scopeId: "C", campaignId: "camp-1" });
  }

  it("collapses an internal-only child atomically; the child survives as closed history", async () => {
    const env = build({ compiler: compilerFor({}) });
    await parentWithChild(env);
    const result = await env.evolution.advanceRuntimeEvolution({ proposal: await propose(env, "C", "COLLAPSE_RUNTIME_STRUCTURE"), policy });
    expect(result.status).toBe("activated");
    const p = await env.service.scopeState("P");
    expect(p.members.map(runtimeScopeMemberKey)).toEqual(["activation:A1", "activation:A2"]);
    const c = await env.service.scopeState("C");
    expect(c.lifecycle).toBe("CLOSED");
    expect(c.members).toHaveLength(0);
    expect((await env.store.replay("C")).some((e) => e.type === "SCOPE_CLOSED")).toBe(true);
    env.store.close();
  });

  it("M-N07/N08/N09: an externally represented or campaign-hosting child is blocked with zero writes", async () => {
    for (const options of [{ peer: true }, { boundary: true }, { campaign: true }] as const) {
      const env = build({ compiler: compilerFor({}), campaigns: true });
      await parentWithChild(env, options);
      const outcome = await env.evolution.advanceRuntimeEvolution({ proposal: await propose(env, "C", "COLLAPSE_RUNTIME_STRUCTURE"), policy });
      expect(outcome.status).toBe("blocked");
      const c = await env.service.scopeState("C");
      expect(c.lifecycle).toBe("OPEN");
      expect(c.members).toHaveLength(2);
      env.store.close();
    }
  });

  it("M-N10/RS-A18: a member collision blocks collapse", async () => {
    const env = build({ compiler: compilerFor({}) });
    await env.service.openScope({ scopeId: "P" });
    await env.service.openScope({ scopeId: "C" });
    await env.service.addMember({ scopeId: "P", member: childScope("C") });
    await env.service.addMember({ scopeId: "P", member: activation("A1") });
    await env.service.addMember({ scopeId: "C", member: activation("A1") });
    const outcome = await env.evolution.advanceRuntimeEvolution({ proposal: await propose(env, "C", "COLLAPSE_RUNTIME_STRUCTURE"), policy });
    expect(outcome.status).toBe("blocked");
    env.store.close();
  });
});

describe("G10-M RETIRE_SCOPE golden + blocks (RS-A04/A21/A22, M-N12/N13/N14/N15/N16)", () => {
  it("retires an empty child atomically; history remains replayable and close ≠ retirement case", async () => {
    const env = build({ compiler: compilerFor({}) });
    await env.service.openScope({ scopeId: "P" });
    await env.service.openScope({ scopeId: "R" });
    await env.service.addMember({ scopeId: "P", member: childScope("R") });
    const result = await env.evolution.advanceRuntimeEvolution({ proposal: await propose(env, "R", "DISSOLVE_OR_RETIRE_CANDIDATE"), policy });
    expect(result.status).toBe("activated");
    expect((await env.service.scopeState("P")).members).toHaveLength(0);
    const r = await env.service.scopeState("R");
    expect(r.lifecycle).toBe("CLOSED");
    expect((await env.store.replay("R")).length).toBeGreaterThan(1);
    // M-N16: a raw closeScope is NOT a runtime evolution case.
    const cases = await env.evolutionStore.cases();
    expect(cases.every((record) => record.candidateDigest.length === 64)).toBe(true);
    await env.service.openScope({ scopeId: "Q" });
    await env.service.closeScope({ scopeId: "Q", reason: "raw close" });
    expect((await env.evolutionStore.cases()).length).toBe(cases.length);
    env.store.close();
  });

  it("M-N12/N13/N14/N15: a non-empty, externally represented, or campaign-hosting scope blocks retirement", async () => {
    const member = build({ compiler: compilerFor({}) });
    await env0(member);
    member.store.close();

    const nonEmpty = build({ compiler: compilerFor({}) });
    await nonEmpty.service.openScope({ scopeId: "R" });
    await nonEmpty.service.addMember({ scopeId: "R", member: activation("A1") });
    expect((await nonEmpty.evolution.advanceRuntimeEvolution({ proposal: await propose(nonEmpty, "R", "DISSOLVE_OR_RETIRE_CANDIDATE"), policy })).status).toBe("blocked");
    nonEmpty.store.close();

    const withChild = build({ compiler: compilerFor({}) });
    await withChild.service.openScope({ scopeId: "R" });
    await withChild.service.openScope({ scopeId: "RC" });
    await withChild.service.addMember({ scopeId: "R", member: childScope("RC") });
    expect((await withChild.evolution.advanceRuntimeEvolution({ proposal: await propose(withChild, "R", "DISSOLVE_OR_RETIRE_CANDIDATE"), policy })).status).toBe("blocked");
    withChild.store.close();

    const represented = build({ compiler: compilerFor({}) });
    await represented.service.openScope({ scopeId: "R" });
    await represented.service.associatePeer({ scopeId: "R", peer: { schemaVersion: 1, peerId: "p" } });
    expect((await represented.evolution.advanceRuntimeEvolution({ proposal: await propose(represented, "R", "DISSOLVE_OR_RETIRE_CANDIDATE"), policy })).status).toBe("blocked");
    represented.store.close();

    const campaign = build({ compiler: compilerFor({}), campaigns: true });
    await campaign.service.openScope({ scopeId: "R" });
    await campaign.service.associateCampaign({ scopeId: "R", campaignId: "c1" });
    expect((await campaign.evolution.advanceRuntimeEvolution({ proposal: await propose(campaign, "R", "DISSOLVE_OR_RETIRE_CANDIDATE"), policy })).status).toBe("blocked");
    campaign.store.close();
  });
});

async function env0(env: Env): Promise<void> {
  await env.service.openScope({ scopeId: "Z" });
  await env.service.closeScope({ scopeId: "Z", reason: "noop" });
}

describe("G10-M authority, freshness, concurrency, restart", () => {
  it("RS-A06/A24/M-N20: a denied authority or a stale proposal writes nothing", async () => {
    const denied = build({ compiler: compilerFor({ newChildId: "N1", move: ["activation:A1"] }), authority: deny });
    await parentWithMembers(denied);
    const proposal = await propose(denied, "P", "ENCAPSULATE_RUNTIME_SCOPE");
    expect((await denied.evolution.advanceRuntimeEvolution({ proposal, policy })).status).toBe("denied");
    expect((await denied.service.scopeState("P")).members).toHaveLength(3);
    denied.store.close();

    const stale = build({ compiler: compilerFor({ newChildId: "N1", move: ["activation:A1"] }) });
    await parentWithMembers(stale);
    const staleProposal = await propose(stale, "P", "ENCAPSULATE_RUNTIME_SCOPE");
    await stale.service.addMember({ scopeId: "P", member: activation("A3") });
    expect((await stale.evolution.advanceRuntimeEvolution({ proposal: staleProposal, policy })).status).toBe("stale_proposal");
    expect((await stale.service.scopeState("P")).members).toHaveLength(4);
    stale.store.close();
  });

  it("RS-A25/M-N21: a source basis changed during compilation is a stale candidate with zero writes", async () => {
    let mutated = false;
    const compiler: RuntimeStructuralEvolutionCompilerPort = {
      compile: async (input) => {
        if (!mutated) {
          mutated = true;
          // Simulate a concurrent change between compile and activation.
          await envRef!.service.addMember({ scopeId: "P", member: activation("CONCURRENT") });
        }
        return compilerFor({ newChildId: "N1", move: ["activation:A1"] }).compile(input);
      },
    };
    const env = build({ compiler });
    envRef = env;
    await parentWithMembers(env);
    const outcome = await env.evolution.advanceRuntimeEvolution({ proposal: await propose(env, "P", "ENCAPSULATE_RUNTIME_SCOPE"), policy });
    expect(["stale_candidate", "blocked", "stale_proposal"]).toContain(outcome.status);
    expect((await env.service.scopeState("P")).members.some((member) => runtimeScopeMemberKey(member) === "activation:CONCURRENT")).toBe(true);
    expect((await env.service.scopeState("P")).members.every((member) => runtimeScopeMemberKey(member) !== "child_scope:N1")).toBe(true);
    env.store.close();
  });

  it("M-N06/RS-A25: two competing encapsulations on the same parent cannot both win", async () => {
    const env = build({ compiler: compilerFor({ newChildId: "N1", move: ["activation:A1"] }) });
    await parentWithMembers(env);
    const first = await env.evolution.advanceRuntimeEvolution({ proposal: await propose(env, "P", "ENCAPSULATE_RUNTIME_SCOPE"), policy });
    expect(first.status).toBe("activated");
    // Competing encapsulation of the SAME child id — must not create a second child.
    // The competing proposal can never create a SECOND child under the same parent.
    const second = await env.evolution.advanceRuntimeEvolution({ proposal: await propose(env, "P", "ENCAPSULATE_RUNTIME_SCOPE"), policy });
    expect(["blocked", "stale_proposal", "stale_candidate", "incomplete"]).toContain(second.status);
    expect((await env.service.scopeState("P")).members.filter((member) => member.kind === "child_scope")).toHaveLength(1);
    env.store.close();
  });

  it("M-N23/RS-A10: a restart reproduces the exact forest and never exposes a partial state", async () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-m-"));
    try {
      const env = build({ path: join(dir, "scope.sqlite"), compiler: compilerFor({ newChildId: "N1", move: ["activation:A1", "activation:A2"] }) });
      await parentWithExternalSurface(env);
      const result = await env.evolution.advanceRuntimeEvolution({ proposal: await propose(env, "P", "ENCAPSULATE_RUNTIME_SCOPE"), policy });
      expect(result.status).toBe("activated");
      env.store.close();
      const reopened = new SqliteRuntimeScopeStore(join(dir, "scope.sqlite"));
      const service = makeRuntimeScopeService({ store: reopened });
      expect((await service.scopeState("P")).members.map(runtimeScopeMemberKey)).toEqual(["activation:X", "child_scope:N1"]);
      expect((await service.scopeState("N1")).members.map(runtimeScopeMemberKey)).toEqual(["activation:A1", "activation:A2"]);
      expect((await service.scopeState("N1")).parent?.scopeId).toBe("P");
      reopened.close();
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows handle */ }
    }
  });

  it("RS-A26/A27/A28/A29: runtime evolution touches no foreign store", () => {
    for (const file of ["artifacts.ts", "assessment.ts", "store.ts", "service.ts"]) {
      const source = strip(SRC(`runtime_evolution/${file}`));
      expect(source).not.toMatch(/from "\.\.\/organization\//);
      expect(source).not.toMatch(/from "\.\.\/institution/);
      expect(source).not.toMatch(/from "\.\.\/boundary_memory\/(store|service)/);
      expect(source).not.toMatch(/from "\.\.\/campaign/);
      expect(source).not.toMatch(/from "\.\.\/scheduler/);
      expect(source).not.toMatch(/from "\.\.\/effects/);
    }
  });
});

let envRef: Env | undefined;
