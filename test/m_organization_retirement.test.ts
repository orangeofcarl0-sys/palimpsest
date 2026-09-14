/**
 * G10-M organization retirement — append-only lifecycle truth, institution/open-runtime
 * guards, historical readability, and post-retirement enforcement
 * (RS-A30…A37, M-N25…N32).
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SqliteOrganizationStore,
  materializeOrganizationDefinition,
  organizationRefOf,
} from "../src/organization/index.js";
import type { OrganizationDefinitionRef } from "../src/organization/index.js";
import { SqliteInstitutionStore, makeInstitutionService } from "../src/institution/index.js";
import { SqliteRuntimeScopeStore, makeRuntimeScopeService } from "../src/runtime_scope/index.js";
import type { RuntimeScopeOrganizationPort } from "../src/runtime_scope/index.js";
import { makeOrganizationDynamicsService } from "../src/organization_dynamics/index.js";
import type { DynamicsPolicy, OrganizationDynamicsProposal } from "../src/organization_dynamics/index.js";
import { SqliteOrganizationEvolutionStore, makeOrganizationEvolutionService } from "../src/organization_evolution/index.js";
import type { OrganizationEvolutionAdmissionPort, OrganizationRetirementWiring } from "../src/organization_evolution/index.js";
import type { PeerRef } from "../src/federation/index.js";

const policy: DynamicsPolicy = { ref: { id: "default", version: "1" }, minDistinctBases: 2, churnMinReconfigurations: 3, concentrationShareThreshold: 0.5, federationMinMessageEvents: 4, federationMinDistinctPeers: 2 };
const PEER: PeerRef = { schemaVersion: 1, peerId: "gov" };
const authorize: OrganizationEvolutionAdmissionPort = { admit: async () => ({ outcome: "authorized" }) };
const deny: OrganizationEvolutionAdmissionPort = { admit: async () => ({ outcome: "denied", detail: "policy denies retirement" }) };

function build(config: { readonly authority?: OrganizationEvolutionAdmissionPort; readonly retirement?: boolean | "unknown"; readonly path?: string } = {}) {
  const orgStore = new SqliteOrganizationStore(config.path ?? ":memory:");
  const institutionStore = new SqliteInstitutionStore(":memory:");
  const scopeStore = new SqliteRuntimeScopeStore(":memory:");
  const evolutionStore = new SqliteOrganizationEvolutionStore(":memory:");
  const organizations: RuntimeScopeOrganizationPort = {
    current: (id) => orgStore.head(id),
    exists: async (ref) => (await orgStore.get(ref)) !== undefined,
    definition: async (ref) => { const d = await orgStore.get(ref); return d === undefined ? undefined : { interactions: d.interactions }; },
    lifecycle: (id) => orgStore.lifecycle(id),
  };
  const scopeService = makeRuntimeScopeService({ store: scopeStore, organizations });
  const dynamics = makeOrganizationDynamicsService({
    runtimeScopes: { store: scopeStore, service: scopeService },
    organizations: { head: (id) => orgStore.head(id), get: (ref) => orgStore.get(ref), lifecycle: (id) => orgStore.lifecycle(id) },
  });
  let retirement: OrganizationRetirementWiring | undefined;
  if (config.retirement !== false) {
    retirement = {
      ...(config.retirement === "unknown" ? {} : { institutions: { currentBodies: async () => (await institutionStore.currentBodies()).map((epoch) => epoch.organization) } }),
      runtimeScopes: {
        openScopesGroundedTo: async (organizationDefinitionId: string) => {
          const ids: string[] = [];
          for (const ref of await scopeService.listScopes()) {
            const state = await scopeService.scopeState(ref.scopeId);
            if (state.lifecycle === "OPEN" && state.definition.organizationBasis?.organizationDefinitionId === organizationDefinitionId) ids.push(ref.scopeId);
          }
          return Object.freeze(ids);
        },
      },
    };
  }
  const evolution = makeOrganizationEvolutionService({
    organizations: orgStore,
    dynamics,
    store: evolutionStore,
    compiler: { compile: async () => ({}) },
    authority: config.authority ?? authorize,
    ...(retirement === undefined ? {} : { retirement }),
  });
  return { orgStore, institutionStore, scopeStore, evolutionStore, scopeService, dynamics, evolution };
}
type Env = ReturnType<typeof build>;

function orgDef(mission = "m", revision = 0) {
  return materializeOrganizationDefinition({
    organizationDefinitionId: "O1", revision, mission,
    members: [{ kind: "peer", peer: PEER }],
    roles: [{ roleId: "r1", requiredCapabilities: [] }],
    assignments: [{ member: { kind: "peer", peer: PEER }, roleId: "r1" }],
    norms: [], interactions: [],
  });
}

async function proposeRetire(env: Env, target: OrganizationDefinitionRef): Promise<OrganizationDynamicsProposal> {
  const advisor = { propose: async () => ({ kind: "DISSOLVE_OR_RETIRE_CANDIDATE", targets: [target.organizationDefinitionId], intent: "retire this organization", advisorProvenance: "test-advisor" }) };
  const result = await env.dynamics.propose({ subject: { kind: "organization", organization: target }, policy, advisor });
  if ("status" in result) throw new Error(result.status);
  return result.proposal;
}

async function activeOrg(env: Env): Promise<OrganizationDefinitionRef> {
  const def = orgDef();
  await env.orgStore.registerRevision({ definition: def, parent: null, expectedHeadRevision: null });
  return organizationRefOf(def);
}

describe("G10-M organization retirement golden (RS-A30/A31/A32/A33/A36)", () => {
  it("retires an unencumbered organization through append-only lifecycle truth", async () => {
    const env = build();
    const ref = await activeOrg(env);
    const outcome = await env.evolution.advanceEvolution({ proposal: await proposeRetire(env, ref), policy });
    expect(outcome.status).toBe("activated");
    expect(await env.orgStore.lifecycle("O1")).toBe("RETIRED");
    // History is fully readable; retirement deleted nothing.
    expect(await env.orgStore.head("O1")).toEqual(ref);
    expect((await env.orgStore.lineage("O1")).length).toBe(1);
    expect((await env.orgStore.retirements()).length).toBe(1);
    // No revision may advance a retired lineage — enforced at the STORE.
    await expect(env.orgStore.registerRevision({ definition: orgDef("m2", 1), parent: ref, expectedHeadRevision: 0 })).rejects.toMatchObject({ kind: "retired_lineage" });
    // A retired lineage cannot ground a new runtime scope.
    await expect(env.scopeService.openScope({ scopeId: "R", organizationBasis: ref })).rejects.toMatchObject({ kind: "organization_retired" });
    // A SECOND retirement attempt on the same (now RETIRED) lineage is blocked, and no
    // duplicate lifecycle record is ever created.
    const again = await env.evolution.advanceEvolution({ proposal: await proposeRetire(env, ref), policy });
    expect(again.status).toBe("blocked");
    expect((await env.orgStore.retirements()).length).toBe(1);
    env.orgStore.close();
  });

  it("§56: Dynamics observes the RETIRED lifecycle; retirement ≠ zombie diagnosis", async () => {
    const env = build();
    const ref = await activeOrg(env);
    const before = await env.dynamics.observe({ kind: "organization", organization: ref }, policy);
    if (before.status !== "observed") throw new Error(before.status);
    expect(before.snapshot.organizationLifecycle).toBe("ACTIVE");
    await env.evolution.advanceEvolution({ proposal: await proposeRetire(env, ref), policy });
    const after = await env.dynamics.observe({ kind: "organization", organization: ref }, policy);
    if (after.status !== "observed") throw new Error(after.status);
    expect(after.snapshot.organizationLifecycle).toBe("RETIRED");
    env.orgStore.close();
  });

  it("restart preserves RETIRED", async () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-mo-"));
    try {
      const env = build({ path: join(dir, "org.sqlite") });
      const ref = await activeOrg(env);
      await env.evolution.advanceEvolution({ proposal: await proposeRetire(env, ref), policy });
      env.orgStore.close();
      const reopened = new SqliteOrganizationStore(join(dir, "org.sqlite"));
      expect(await reopened.lifecycle("O1")).toBe("RETIRED");
      expect((await reopened.retirements()).length).toBe(1);
      reopened.close();
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows handle */ }
    }
  });
});

describe("G10-M retirement guards (RS-A34/A35, M-N28/N29/N30)", () => {
  it("M-N29/RS-A34: an organization that is a current institution body cannot retire", async () => {
    const env = build();
    const ref = await activeOrg(env);
    const institution = makeInstitutionService({ store: env.institutionStore, organizations: { get: (r) => env.orgStore.get(r), lifecycle: (id) => env.orgStore.lifecycle(id) }, allocateTransitionId: () => "tr-1" });
    await institution.genesis({ institutionId: "I1", purpose: "p", authorities: [PEER], requiredApprovals: 1, organization: ref });
    const outcome = await env.evolution.advanceEvolution({ proposal: await proposeRetire(env, ref), policy });
    expect(outcome.status).toBe("blocked");
    expect(await env.orgStore.lifecycle("O1")).toBe("ACTIVE");
    env.orgStore.close();
  });

  it("M-N30/RS-A35: an organization with an OPEN runtime scope cannot retire", async () => {
    const env = build();
    const ref = await activeOrg(env);
    await env.scopeService.openScope({ scopeId: "R", organizationBasis: ref });
    const outcome = await env.evolution.advanceEvolution({ proposal: await proposeRetire(env, ref), policy });
    expect(outcome.status).toBe("blocked");
    expect(await env.orgStore.lifecycle("O1")).toBe("ACTIVE");
    env.orgStore.close();
  });

  it("RS-A34/§49: unavailable institution enumeration blocks retirement (never assumes institution-free)", async () => {
    const env = build({ retirement: "unknown" });
    const ref = await activeOrg(env);
    const outcome = await env.evolution.advanceEvolution({ proposal: await proposeRetire(env, ref), policy });
    expect(outcome.status).toBe("blocked");
    expect(await env.orgStore.lifecycle("O1")).toBe("ACTIVE");
    env.orgStore.close();
  });

  it("RS-A24/M-N20: a stale proposal or a denied authority retires nothing", async () => {
    const stale = build();
    const staleRef = await activeOrg(stale);
    const proposal = await proposeRetire(stale, staleRef);
    await stale.orgStore.registerRevision({ definition: orgDef("m2", 1), parent: staleRef, expectedHeadRevision: 0 });
    expect((await stale.evolution.advanceEvolution({ proposal, policy })).status).toBe("stale_proposal");
    expect(await stale.orgStore.lifecycle("O1")).toBe("ACTIVE");
    stale.orgStore.close();

    const denied = build({ authority: deny });
    const deniedRef = await activeOrg(denied);
    expect((await denied.evolution.advanceEvolution({ proposal: await proposeRetire(denied, deniedRef), policy })).status).toBe("denied");
    expect(await denied.orgStore.lifecycle("O1")).toBe("ACTIVE");
    denied.orgStore.close();
  });

  it("M-N28/RS-A33: an institution cannot newly adopt a retired organization body", async () => {
    const env = build();
    const ref = await activeOrg(env);
    await env.evolution.advanceEvolution({ proposal: await proposeRetire(env, ref), policy });
    const institution = makeInstitutionService({ store: env.institutionStore, organizations: { get: (r) => env.orgStore.get(r), lifecycle: (id) => env.orgStore.lifecycle(id) }, allocateTransitionId: () => "tr-1" });
    await expect(institution.genesis({ institutionId: "I1", purpose: "p", authorities: [PEER], requiredApprovals: 1, organization: ref })).rejects.toMatchObject({ kind: "organization_retired" });
    env.orgStore.close();
  });

  it("M-N33/RS-A38: DISSOLVE is subject-disambiguated with no fallback semantics", async () => {
    const env = build();
    await activeOrg(env);
    // The organization service owns only the organization-subject retirement; runtime subjects
    // and boundary workspaces are explicitly unsupported here (routed, never reinterpreted).
    expect(env.evolution.dispositionOf("DISSOLVE_OR_RETIRE_CANDIDATE")).toBe("EXECUTABLE_RETIREMENT");
    env.orgStore.close();
  });
});
