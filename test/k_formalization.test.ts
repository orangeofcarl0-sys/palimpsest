/**
 * G10-K / CF-J-02 — governed FORMALIZE_ORGANIZATION: an accepted OrganizationBlueprint
 * is the authoring source, but only an explicit fresh FORMALIZE proposal + complete
 * candidate + independent evolution authority can create canonical organization state.
 * Stable federation never auto-formalizes (K-N25…K-N33, BM-A26…BM-A33).
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteOrganizationStore, materializeOrganizationDefinition, organizationRefOf } from "../src/organization/index.js";
import type { OrganizationDefinition } from "../src/organization/index.js";
import { SqliteRuntimeScopeStore, makeRuntimeScopeService } from "../src/runtime_scope/index.js";
import type { RuntimeScopeOrganizationPort } from "../src/runtime_scope/index.js";
import { makeOrganizationDynamicsService } from "../src/organization_dynamics/index.js";
import type { DynamicsPolicy, DynamicsSubject, OrganizationDynamicsProposal } from "../src/organization_dynamics/index.js";
import {
  SqliteOrganizationEvolutionStore,
  formalizationCandidateDigestOf,
  makeOrganizationEvolutionService,
} from "../src/organization_evolution/index.js";
import type { OrganizationFormalizationCompilerPort, OrganizationEvolutionAdmissionPort } from "../src/organization_evolution/index.js";
import { SqliteBoundaryMemoryStore, ORGANIZATION_BLUEPRINT_TYPE, makeBoundaryMemoryService, organizationDefinitionOfBlueprint } from "../src/boundary_memory/index.js";
import type { PeerRef } from "../src/federation/index.js";

const P: PeerRef = { schemaVersion: 1, peerId: "palimpsest" };
const O: PeerRef = { schemaVersion: 1, peerId: "ordarium" };
const policy: DynamicsPolicy = { ref: { id: "default", version: "1" }, minDistinctBases: 2, churnMinReconfigurations: 3, concentrationShareThreshold: 0.5, federationMinMessageEvents: 4, federationMinDistinctPeers: 2 };
const ORG_ID = "O1";

const blueprintContent = {
  organizationDefinitionId: ORG_ID,
  mission: "deliver the jointly accepted boundary",
  members: [{ kind: "peer" as const, peer: P }],
  roles: [{ roleId: "r1", requiredCapabilities: [] }, { roleId: "r2", requiredCapabilities: [] }],
  assignments: [{ member: { kind: "peer" as const, peer: P }, roleId: "r1" }],
  norms: [{ normId: "n1", kind: "obligation" as const, roleId: "r1", actionTag: "publish" }],
  interactions: [{ interactionId: "i1", fromRoleId: "r1", toRoleId: "r2", protocol: "proto" }],
  references: [] as const,
};

const blueprintDefinition: OrganizationDefinition = materializeOrganizationDefinition({
  organizationDefinitionId: ORG_ID,
  revision: 0,
  mission: blueprintContent.mission,
  members: blueprintContent.members,
  roles: blueprintContent.roles,
  assignments: blueprintContent.assignments,
  norms: blueprintContent.norms,
  interactions: blueprintContent.interactions,
});

function subjectOf(): DynamicsSubject {
  return { kind: "organization", organization: { organizationDefinitionId: ORG_ID, revision: 0, digest: blueprintDefinition.digest } };
}

const authorize: OrganizationEvolutionAdmissionPort = { admit: async () => ({ outcome: "authorized" }) };
const deny: OrganizationEvolutionAdmissionPort = { admit: async () => ({ outcome: "denied", detail: "policy denies formalization" }) };

function makeCompiler(transform?: (organization: OrganizationDefinition) => OrganizationDefinition): OrganizationFormalizationCompilerPort {
  return {
    compile: async ({ proposal, blueprint, blueprintRevision, blueprintContentDigest }) => {
      const base = organizationDefinitionOfBlueprint(blueprint);
      const organization = transform === undefined ? base : transform(base);
      const body = {
        schemaVersion: 1 as const,
        proposalDigest: proposal.digest,
        proposalBasisDigest: proposal.basisDigest,
        kind: "FORMALIZE" as const,
        blueprint: blueprintRevision,
        blueprintContentDigest,
        organization,
        compilerProvenance: "test-formalization-compiler",
      };
      return { ...body, digest: formalizationCandidateDigestOf(body) };
    },
  };
}

async function buildEnv(input: { readonly authority?: OrganizationEvolutionAdmissionPort; readonly compiler?: OrganizationFormalizationCompilerPort; readonly paths?: boolean } = {}) {
  const dir = input.paths === true ? mkdtempSync(join(tmpdir(), "palimpsest-kf-")) : undefined;
  const at = (name: string): string => (dir === undefined ? ":memory:" : join(dir, name));
  const orgStore = new SqliteOrganizationStore(at("org.sqlite"));
  const scopeStore = new SqliteRuntimeScopeStore(at("scope.sqlite"));
  const evolutionStore = new SqliteOrganizationEvolutionStore(at("evolution.sqlite"));
  const boundaryStore = new SqliteBoundaryMemoryStore(at("boundary.sqlite"));
  const bp = makeBoundaryMemoryService({ store: boundaryStore, localPeer: P });
  const bo = makeBoundaryMemoryService({ store: boundaryStore, localPeer: O });
  const organizations: RuntimeScopeOrganizationPort = {
    current: (id) => orgStore.head(id),
    exists: async (ref) => (await orgStore.get(ref)) !== undefined,
    definition: async (ref) => { const d = await orgStore.get(ref); return d === undefined ? undefined : { interactions: d.interactions }; },
  };
  const scopeService = makeRuntimeScopeService({ store: scopeStore, organizations, campaigns: { exists: async () => false } });
  const dynamics = makeOrganizationDynamicsService({
    runtimeScopes: { store: scopeStore, service: scopeService },
    organizations: { head: (id) => orgStore.head(id), get: (ref) => orgStore.get(ref) },
  });
  const compiler = input.compiler ?? makeCompiler();
  const evolution = makeOrganizationEvolutionService({
    organizations: orgStore,
    dynamics,
    store: evolutionStore,
    compiler: { compile: async () => ({}) },
    authority: input.authority ?? authorize,
    formalization: { boundary: { acceptedBlueprint: (i) => bp.acceptedBlueprint(i) }, compiler },
  });
  return { dir, orgStore, scopeStore, evolutionStore, boundaryStore, bp, bo, scopeService, dynamics, evolution };
}

type Env = Awaited<ReturnType<typeof buildEnv>>;

/** Accept a joint organization blueprint into workspace W/BP. */
async function acceptBlueprint(env: Env): Promise<void> {
  await env.bp.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "formalize the federation" });
  await env.bp.createArtifact({ workspaceId: "W", artifactId: "BP", type: ORGANIZATION_BLUEPRINT_TYPE, title: "blueprint" });
  const c = await env.bp.proposeRevision({ workspaceId: "W", artifactId: "BP", base: null, content: blueprintContent, requiredAcceptors: [P, O], intent: "joint blueprint" });
  await env.bp.acceptRevision({ workspaceId: "W", artifactId: "BP", candidateDigest: c.digest, authenticatedPeer: null, local: true });
  await env.bo.acceptRevision({ workspaceId: "W", artifactId: "BP", candidateDigest: c.digest, authenticatedPeer: null, local: true });
}

/** A fresh FORMALIZE proposal grounded on the prospective target organization. */
async function formalizeProposal(env: Env): Promise<OrganizationDynamicsProposal> {
  const advisor = { propose: async () => ({ kind: "FORMALIZE_ORGANIZATION", targets: [ORG_ID], intent: "formalize the accepted blueprint", advisorProvenance: "test-advisor" }) };
  const proposed = await env.dynamics.propose({ subject: subjectOf(), policy, advisor });
  if ("status" in proposed) throw new Error(proposed.status);
  expect(proposed.proposal.kind).toBe("FORMALIZE_ORGANIZATION");
  return proposed.proposal;
}

describe("G10-K FORMALIZE_ORGANIZATION", () => {
  it("K-N27/BM-A29/A31: a fresh FORMALIZE proposal + accepted blueprint + authority registers a complete genesis definition", async () => {
    const env = await buildEnv();
    await acceptBlueprint(env);
    const proposal = await formalizeProposal(env);
    const outcome = await env.evolution.prepareEvolution({ proposal, policy, blueprintSource: { workspaceId: "W", artifactId: "BP" } });
    expect(outcome.status).toBe("activated");
    if (outcome.status === "activated") {
      expect(outcome.activated[0]).toEqual(organizationRefOf(blueprintDefinition));
    }
    const head = await env.orgStore.head(ORG_ID);
    expect(head?.revision).toBe(0);
    expect(head?.digest).toBe(blueprintDefinition.digest);
    expect(env.evolution.dispositionOf("FORMALIZE_ORGANIZATION")).toBe("EXECUTABLE_FORMALIZE");
    // Provenance retained: the workspace/blueprint is historical, not canonical org.
    expect((await env.bp.currentAccepted({ workspaceId: "W", artifactId: "BP" }))?.ref.revision).toBe(0);
  });

  it("K-N30/K-N31/BM-A32/A33: formalization auto-creates NO Institution, RuntimeScope, or Campaign", async () => {
    const env = await buildEnv();
    await acceptBlueprint(env);
    await env.evolution.prepareEvolution({ proposal: await formalizeProposal(env), policy, blueprintSource: { workspaceId: "W", artifactId: "BP" } });
    expect(await env.scopeService.listScopes()).toHaveLength(0);
    const cases = await env.evolutionStore.cases();
    expect(cases.length).toBeGreaterThan(0);
    // Only ONE canonical write: the organization genesis revision.
    expect(await env.orgStore.lineage(ORG_ID)).toHaveLength(1);
  });

  it("K-N26/BM-A31: blueprint acceptance is not evolution authority — denial writes nothing", async () => {
    const env = await buildEnv({ authority: deny });
    await acceptBlueprint(env);
    const outcome = await env.evolution.prepareEvolution({ proposal: await formalizeProposal(env), policy, blueprintSource: { workspaceId: "W", artifactId: "BP" } });
    expect(outcome.status).toBe("denied");
    expect(await env.orgStore.head(ORG_ID)).toBeUndefined();
    expect(await env.orgStore.lineage(ORG_ID)).toHaveLength(0);
  });

  it("K-N27/BM-A29: FORMALIZE without an accepted blueprint is incomplete (zero writes)", async () => {
    const env = await buildEnv();
    await env.bp.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "p" });
    await env.bp.createArtifact({ workspaceId: "W", artifactId: "BP", type: ORGANIZATION_BLUEPRINT_TYPE, title: "blueprint" });
    // Artifact exists but has NO accepted revision yet.
    const outcome = await env.evolution.prepareEvolution({ proposal: await formalizeProposal(env), policy, blueprintSource: { workspaceId: "W", artifactId: "BP" } });
    expect(outcome.status).toBe("incomplete");
    expect(await env.orgStore.head(ORG_ID)).toBeUndefined();
  });

  it("K-N28/K-N29/BM-A30: a compiler that invents roles is rejected; nothing is written", async () => {
    const inventing = makeCompiler((base) =>
      materializeOrganizationDefinition({
        organizationDefinitionId: base.organizationDefinitionId,
        revision: 0,
        mission: base.mission,
        members: base.members,
        roles: [...base.roles, { roleId: "invented", requiredCapabilities: [] }],
        assignments: base.assignments,
        norms: base.norms,
        interactions: base.interactions,
      }),
    );
    const env = await buildEnv({ compiler: inventing });
    await acceptBlueprint(env);
    const outcome = await env.evolution.prepareEvolution({ proposal: await formalizeProposal(env), policy, blueprintSource: { workspaceId: "W", artifactId: "BP" } });
    expect(outcome.status).toBe("incomplete");
    expect(await env.orgStore.head(ORG_ID)).toBeUndefined();
  });

  it("K-N25/BM-A26/A28: a rich workspace does NOT auto-formalize; accepted blueprint ⇒ zero org writes", async () => {
    const env = await buildEnv();
    await acceptBlueprint(env);
    // No FORMALIZE proposal was ever made: federation remains federation.
    expect(await env.orgStore.head(ORG_ID)).toBeUndefined();
    expect(await env.orgStore.lineage(ORG_ID)).toHaveLength(0);
    expect(await env.scopeService.listScopes()).toHaveLength(0);
  });

  it("BM-A29: a stale proposal (subject digest ≠ accepted blueprint) writes nothing", async () => {
    const env = await buildEnv();
    await acceptBlueprint(env);
    const proposal = await formalizeProposal(env);
    const stale: OrganizationDynamicsProposal = Object.freeze({ ...proposal, subject: { kind: "organization" as const, organization: { organizationDefinitionId: ORG_ID, revision: 0, digest: "f".repeat(64) } } });
    const outcome = await env.evolution.prepareEvolution({ proposal: stale, policy, blueprintSource: { workspaceId: "W", artifactId: "BP" } });
    expect(outcome.status).toBe("stale_proposal");
    expect(await env.orgStore.head(ORG_ID)).toBeUndefined();
  });

  it("restart reproduces the formalization linkage", async () => {
    const env = await buildEnv({ paths: true });
    try {
      await acceptBlueprint(env);
      const proposal = await formalizeProposal(env);
      const outcome = await env.evolution.prepareEvolution({ proposal, policy, blueprintSource: { workspaceId: "W", artifactId: "BP" } });
      expect(outcome.status).toBe("activated");
      const caseRef = outcome.status === "activated" ? outcome.caseRef : null;
      expect(caseRef).not.toBeNull();
      env.evolutionStore.close();
      env.orgStore.close();
      env.boundaryStore.close();
      env.scopeStore.close();

      const evolutionStore = new SqliteOrganizationEvolutionStore(join(env.dir!, "evolution.sqlite"));
      const record = await evolutionStore.case(caseRef!);
      expect(record).toBeDefined();
      const events = await evolutionStore.replay(caseRef!);
      expect(events.some((event) => event.type === "EVOLUTION_FORMALIZATION_COMPILED")).toBe(true);
      expect(events.some((event) => event.type === "EVOLUTION_ACTIVATED")).toBe(true);
      evolutionStore.close();
    } finally {
      try {
        rmSync(env.dir!, { recursive: true, force: true });
      } catch {
        // Windows may still hold a handle briefly; the temp dir is disposable.
      }
    }
  });
});
