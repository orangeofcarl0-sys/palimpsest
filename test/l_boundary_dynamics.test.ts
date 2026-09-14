/**
 * G10-L boundary-aware Organization Dynamics (§32) — a BoundaryWorkspace is a
 * basis-grounded observation subject; boundary diagnostics are mechanical and never
 * claim collaboration quality, correctness, or "should formalize".
 */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../src/schema/canonical.js";
import { SqliteRuntimeScopeStore, makeRuntimeScopeService } from "../src/runtime_scope/index.js";
import { SqliteOrganizationStore, materializeOrganizationDefinition, organizationRefOf } from "../src/organization/index.js";
import { basisDigestOf, makeOrganizationDynamicsService } from "../src/organization_dynamics/index.js";
import type { DynamicsBoundaryPort, DynamicsPolicy } from "../src/organization_dynamics/index.js";
import {
  SqliteBoundaryMemoryStore,
  makeBoundaryMemoryService,
  ORGANIZATION_BLUEPRINT_TYPE,
  materializeBoundaryWorkspaceRef,
} from "../src/boundary_memory/index.js";
import type { BoundaryObservation } from "../src/boundary_memory/index.js";
import type { PeerRef } from "../src/federation/index.js";

const P: PeerRef = { schemaVersion: 1, peerId: "palimpsest" };
const O: PeerRef = { schemaVersion: 1, peerId: "ordarium" };
const R: PeerRef = { schemaVersion: 1, peerId: "reasoner" };
const statementType = { typeId: "boundary.statement", version: "v1" };
const wsRef = (workspaceId: string) => materializeBoundaryWorkspaceRef({ workspaceId });
const content = (statement: string): unknown => ({ statement, tags: ["requirement"], references: [] });
const policy: DynamicsPolicy = { ref: { id: "default", version: "1" }, minDistinctBases: 2, churnMinReconfigurations: 3, concentrationShareThreshold: 0.5, federationMinMessageEvents: 4, federationMinDistinctPeers: 2 };

async function boundaryPort(): Promise<{ port: DynamicsBoundaryPort; service: ReturnType<typeof makeBoundaryMemoryService>; store: SqliteBoundaryMemoryStore }> {
  const store = new SqliteBoundaryMemoryStore(":memory:");
  const service = makeBoundaryMemoryService({ store, localPeer: P });
  await service.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "boundary" });
  return { port: { observe: (workspaceId) => service.boundaryObservation({ workspaceId }) }, service, store };
}

function dynamicsWith(boundary: DynamicsBoundaryPort | undefined, organizations?: { head: (id: string) => Promise<ReturnType<typeof organizationRefOf> | undefined>; get: (ref: never) => Promise<undefined> }) {
  const scopeStore = new SqliteRuntimeScopeStore(":memory:");
  const scopeService = makeRuntimeScopeService({ store: scopeStore, campaigns: { exists: async () => false } });
  return makeOrganizationDynamicsService({
    runtimeScopes: { store: scopeStore, service: scopeService },
    ...(boundary === undefined ? {} : { boundary }),
    ...(organizations === undefined ? {} : { organizations: organizations as never }),
  });
}

describe("G10-L BoundaryWorkspace as a Dynamics subject", () => {
  it("FB-A20/A21: observation is basis-grounded with mechanical metrics only", async () => {
    const b = await boundaryPort();
    await b.service.createArtifact({ workspaceId: "W", artifactId: "A", type: statementType, title: "a" });
    const c1 = await b.service.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("v1"), requiredAcceptors: [P, O], intent: "i" });
    await b.service.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: null, local: true });
    await b.service.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: O });
    const dynamics = dynamicsWith(b.port);
    const observed = await dynamics.observe({ kind: "boundary_workspace", workspace: wsRef("W") }, policy);
    if (observed.status !== "observed") throw new Error(observed.status);
    expect(observed.snapshot.knowledge.boundary).toBe("known");
    const metrics = observed.snapshot.boundary!;
    expect(metrics).toMatchObject({ workspaceId: "W", lifecycle: "OPEN", participantCount: 2, membershipRevision: 0, artifactCount: 1, acceptedArtifactCount: 1, acceptedRevisionCount: 1, revisionChurn: 1, membershipChurn: 0, blueprintAccepted: false });
    // The basis carries the exact boundary basis (throughSeq + chainDigest) and participates in freshness.
    expect(observed.snapshot.basis.boundary?.workspace.workspaceId).toBe("W");
    const diagnosis = await dynamics.diagnose({ kind: "boundary_workspace", workspace: wsRef("W") }, policy);
    if (!("diagnosis" in diagnosis) || diagnosis.diagnosis === undefined) throw new Error("no diagnosis");
    const standing = (kind: string) => diagnosis.diagnosis!.pressures.find((p) => p.kind === kind)?.standing;
    expect(standing("BOUNDARY_STABLE_ACCEPTED_STATE")).toBe("supported");
    expect(standing("BOUNDARY_NEGOTIATION_BACKLOG")).toBe("unsupported");
    expect(standing("BOUNDARY_BLUEPRINT_PRESENT")).toBe("unsupported");
    // Stability/correctness phrasing: never a quality or correctness claim.
    const stable = diagnosis.diagnosis!.pressures.find((p) => p.kind === "BOUNDARY_STABLE_ACCEPTED_STATE")!;
    expect(stable.unknowns.join(" ")).toMatch(/not establish semantic correctness/);
    b.store.close();
  });

  it("L-N23/L-N24/FB-A23: richness does not auto-FORMALIZE; the subject is not an organization", async () => {
    const b = await boundaryPort();
    await b.service.createArtifact({ workspaceId: "W", artifactId: "BP", type: ORGANIZATION_BLUEPRINT_TYPE, title: "bp" });
    const bp = { organizationDefinitionId: "O1", mission: "m", members: [{ kind: "peer", peer: R }], roles: [{ roleId: "r1", requiredCapabilities: [] }], assignments: [{ member: { kind: "peer", peer: R }, roleId: "r1" }], norms: [], interactions: [], references: [] };
    const c = await b.service.proposeRevision({ workspaceId: "W", artifactId: "BP", base: null, content: bp, requiredAcceptors: [P, O], intent: "bp" });
    await b.service.acceptRevision({ workspaceId: "W", artifactId: "BP", candidateDigest: c.digest, authenticatedPeer: null, local: true });
    await b.service.acceptRevision({ workspaceId: "W", artifactId: "BP", candidateDigest: c.digest, authenticatedPeer: O });
    const dynamics = dynamicsWith(b.port);
    const subject = { kind: "boundary_workspace" as const, workspace: wsRef("W") };
    const observed = await dynamics.observe(subject, policy);
    if (observed.status !== "observed") throw new Error(observed.status);
    expect(observed.snapshot.boundary?.blueprintAccepted).toBe(true);
    const proposed = await dynamics.propose({ subject, policy });
    if ("status" in proposed) throw new Error(proposed.status);
    // A present blueprint NEVER yields an automatic FORMALIZE proposal.
    expect(proposed.proposal.kind).not.toBe("FORMALIZE_ORGANIZATION");
    const diagnosis = await dynamics.diagnose(subject, policy);
    if (!("diagnosis" in diagnosis) || diagnosis.diagnosis === undefined) throw new Error("no diagnosis");
    const bpPressure = diagnosis.diagnosis.pressures.find((p) => p.kind === "BOUNDARY_BLUEPRINT_PRESENT")!;
    expect(bpPressure.standing).toBe("supported");
    expect(bpPressure.unknowns.join(" ")).toMatch(/does NOT by itself indicate/);
    b.store.close();
  });

  it("FB-A22/L-N27: a missing workspace is unknown, and a changed basis is an honest race", async () => {
    const b = await boundaryPort();
    const dynamics = dynamicsWith(b.port);
    const unknown = await dynamics.observe({ kind: "boundary_workspace", workspace: wsRef("MISSING") }, policy);
    if (unknown.status !== "observed") throw new Error(unknown.status);
    expect(unknown.snapshot.knowledge.boundary).toBe("unknown");
    const diagnosis = await dynamics.diagnose({ kind: "boundary_workspace", workspace: wsRef("MISSING") }, policy);
    if (!("diagnosis" in diagnosis) || diagnosis.diagnosis === undefined) throw new Error("no diagnosis");
    expect(diagnosis.diagnosis.pressures.find((p) => p.kind === "BOUNDARY_REVISION_CHURN")?.standing).toBe("unresolved");

    let calls = 0;
    const racing: DynamicsBoundaryPort = {
      observe: async (workspaceId: string): Promise<BoundaryObservation | undefined> => {
        calls += 1;
        const observation = await b.service.boundaryObservation({ workspaceId });
        return observation === undefined ? undefined : { ...observation, throughSeq: observation.throughSeq + calls };
      },
    };
    const racy = await dynamicsWith(racing).observe({ kind: "boundary_workspace", workspace: wsRef("W") }, policy);
    expect(racy.status).toBe("observation_raced");
    b.store.close();
  });

  it("FB-A26: existing Dynamics subject digests are unchanged by the additive boundary extension", async () => {
    const orgStore = new SqliteOrganizationStore(":memory:");
    const def = materializeOrganizationDefinition({
      organizationDefinitionId: "O", revision: 0, mission: "m",
      members: [{ kind: "peer", peer: P }],
      roles: [{ roleId: "r1", requiredCapabilities: [] }],
      assignments: [{ member: { kind: "peer", peer: P }, roleId: "r1" }],
      norms: [], interactions: [],
    });
    await orgStore.registerRevision({ definition: def, parent: null, expectedHeadRevision: null });
    const ref = organizationRefOf(def);
    const organizations = { head: async (id: string) => (id === "O" ? ref : undefined), get: async (r: never) => ((r as { organizationDefinitionId?: string }).organizationDefinitionId === "O" ? def : undefined) };
    const subject = { kind: "organization" as const, organization: ref };
    const withBoundary = await dynamicsWith({ observe: async () => undefined }, organizations as never).observe(subject, policy);
    const withoutBoundary = await dynamicsWith(undefined, organizations as never).observe(subject, policy);
    if (withBoundary.status !== "observed" || withoutBoundary.status !== "observed") throw new Error("not observed");
    expect(withBoundary.snapshot.digest).toBe(withoutBoundary.snapshot.digest);
    // The basis digest keeps its exact legacy shape (5 fields, no `boundary` key).
    const basis = withBoundary.snapshot.basis;
    expect(basis.boundary).toBeUndefined();
    expect(basisDigestOf(basis)).toBe(canonicalDigest({
      domain: "palimpsest.dynamics-basis.v1",
      subject: basis.subject, organization: basis.organization, runtimeScopes: basis.runtimeScopes,
      coordinationHead: basis.coordinationHead, synchronization: basis.synchronization,
    }));
    expect(withoutBoundary.snapshot.knowledge.boundary).toBeUndefined();
    orgStore.close();
  });
});
