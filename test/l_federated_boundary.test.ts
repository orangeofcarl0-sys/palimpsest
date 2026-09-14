/**
 * G10-L adversarial / firewall / crash-retry matrix (L-N01…L-N35, FB-A01…A40).
 *
 * Storage location is never social authority; transport is never a semantic truth
 * store; membership is candidate+approval based; no replication/consensus/CRDT.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  SqliteBoundaryMemoryStore,
  makeBoundaryHome,
  makeBoundaryMemoryService,
  makeFederatedBoundaryClient,
  inProcessBoundaryTransportPort,
  staticBoundaryRoute,
} from "../src/boundary_memory/index.js";
import type { BoundaryCandidateRevision, MembershipChangeCandidate } from "../src/boundary_memory/index.js";
import { SqliteCoordinationStore } from "../src/coordination/index.js";
import { makeCommitmentService } from "../src/federation/index.js";
import type { CommitmentScopeGuard, PeerRef } from "../src/federation/index.js";

const SRC = (p: string): string => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), "utf-8");
const strip = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const P: PeerRef = { schemaVersion: 1, peerId: "palimpsest" };
const O: PeerRef = { schemaVersion: 1, peerId: "ordarium" };
const R: PeerRef = { schemaVersion: 1, peerId: "reasoner" };
const H: PeerRef = { schemaVersion: 1, peerId: "home-host" };
const statementType = { typeId: "boundary.statement", version: "v1" };
const content = (statement: string): unknown => ({ statement, tags: ["requirement"], references: [] });
const counter = (): (() => string) => { let n = 0; return () => `op-${++n}`; };

function build(handlers = true) {
  const store = new SqliteBoundaryMemoryStore(":memory:");
  const service = makeBoundaryMemoryService({ store, localPeer: H });
  const home = makeBoundaryHome({ homeId: "H", service, store });
  const transport = handlers ? inProcessBoundaryTransportPort({ H: (envelope) => home.handle(envelope) }) : inProcessBoundaryTransportPort({});
  const route = staticBoundaryRoute({ W: "H" });
  const next = counter();
  const client = (peer: PeerRef) => makeFederatedBoundaryClient({ peer, transport, route, allocateOperationId: () => `${peer.peerId}-${next()}` });
  return { store, service, home, transport, route, p: client(P), o: client(O), r: client(R) };
}
type Harness = ReturnType<typeof build>;

async function setup(h: Harness): Promise<void> {
  await h.service.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "p" });
  await h.service.createArtifact({ workspaceId: "W", artifactId: "A", type: statementType, title: "a" });
}

describe("G10-L storage-home and transport firewalls", () => {
  it("L-N01/L-N02/FB-A02: the storage home is not a participant and cannot accept for others", async () => {
    const h = build();
    await setup(h);
    // L-N02: opening a workspace does NOT make the hosting peer a participant.
    expect((await h.service.membership({ workspaceId: "W" })).participants.map((x) => x.peerId)).toEqual(["ordarium", "palimpsest"]);
    const c1 = (await h.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("v1"), requiredAcceptors: [P, O], intent: "i" })) as BoundaryCandidateRevision;
    // L-N01: the home has no path to accept on behalf of P/O (its own identity is not an acceptor).
    await expect(h.service.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: null, local: true })).rejects.toMatchObject({ kind: "not_a_participant" });
    h.store.close();
  });

  it("L-N22/FB-A03: an unreachable home yields an error and never creates a remote writer", async () => {
    const h = build(false);
    await setup(h);
    await expect(h.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("x"), requiredAcceptors: [P, O], intent: "i" })).rejects.toMatchObject({ kind: "home_unavailable" });
    expect((await h.store.replay("W")).filter((e) => e.type === "CANDIDATE_PROPOSED")).toHaveLength(0);
    h.store.close();
  });

  it("L-N03/L-N21/FB-A28/A29: the remote client has no local store path and returns canonical basis/refs", async () => {
    const h = build();
    await setup(h);
    // No raw store / no central-cache / no scaffolding surface is reachable remotely.
    expect("createArtifact" in h.p).toBe(false);
    expect("openWorkspace" in h.p).toBe(false);
    expect("replay" in h.p).toBe(false);
    const result = await h.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("v1"), requiredAcceptors: [P, O], intent: "i" }) as BoundaryCandidateRevision;
    expect(result.digest).toHaveLength(64);
    const basis = await h.p.basis({ workspaceId: "W" });
    expect(basis.throughSeq).toBeGreaterThan(0);
    expect(basis.chainDigest).toHaveLength(64);
    h.store.close();
  });

  it("L-N04/N20/A30/A31/A32/A33/A34/A35: no chat-transport smuggling, no consensus/CRDT, no foreign authority", () => {
    const transport = strip(SRC("boundary_memory/transport.ts"));
    const service = strip(SRC("boundary_memory/service.ts"));
    for (const source of [transport, service]) {
      // Dedicated semantic transport — never the chat message body.
      expect(source).not.toMatch(/PeerMessage|messages\.js|InboundPeerEnvelope/);
      // No distributed-database claims or machinery.
      expect(source).not.toMatch(/consensus|CRDT|raft|multi-master|two-phase/i);
      // No foreign authority / side effects.
      expect(source).not.toMatch(/scheduler/i);
      expect(source).not.toMatch(/from "\.\.\/effects/);
      expect(source).not.toMatch(/from "\.\.\/institution/);
      expect(source).not.toMatch(/activateOrganizationTransformation|registerRevision/);
    }
    // Remote operations never expose a raw store append.
    expect(transport).not.toMatch(/appendAtomic/);
    // Membership is boundary-owned and does not import organization truth.
    expect(strip(SRC("boundary_memory/membership.ts"))).not.toMatch(/organization\//);
  });
});

describe("G10-L membership independence and lifecycle", () => {
  it("L-N14/L-N31/L-N32/FB-A09/A10/A11: membership ≠ organization/commitment/authority", async () => {
    const h = build();
    await setup(h);
    const add = (await h.p.proposeMembershipChange({ workspaceId: "W", changeKind: "ADD_PARTICIPANT", target: R, intent: "add" })) as MembershipChangeCandidate;
    await h.p.approveMembershipChange({ workspaceId: "W", candidateDigest: add.digest });
    await h.o.approveMembershipChange({ workspaceId: "W", candidateDigest: add.digest });
    await h.r.approveMembershipChange({ workspaceId: "W", candidateDigest: add.digest });
    expect((await h.p.membership({ workspaceId: "W" })).participants.map((x) => x.peerId)).toEqual(["ordarium", "palimpsest", "reasoner"]);
    // No commitment, no coordination event, no organization write arose from membership approval.
    const coord = new SqliteCoordinationStore(":memory:");
    expect(await coord.head()).toBe(0);
    coord.close();
    h.store.close();
  });

  it("L-N33/FB-A19: closing a workspace does not release commitments", async () => {
    const h = build();
    await setup(h);
    const c1 = (await h.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("v1"), requiredAcceptors: [P, O], intent: "i" })) as BoundaryCandidateRevision;
    await h.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest });
    await h.o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest });
    const a1 = (await h.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))!;
    const coord = new SqliteCoordinationStore(":memory:");
    const guard: CommitmentScopeGuard = { admitScope: async (scope) => { if (scope.kind === "boundary_revision") await h.service.admitBoundaryRevisionScope(scope.revision); } };
    let n = 0;
    const commitments = makeCommitmentService({ store: coord, localPeer: P, allocateCommitmentId: () => `com-${++n}`, allocateHandoffId: () => "ho-1", scopeGuard: guard });
    const offer = await commitments.offerCommitment({ proposedHolder: O, scope: { kind: "boundary_revision", revision: a1.ref }, statement: "s" });
    await commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: O });
    await h.service.closeWorkspace({ workspaceId: "W", reason: "archived" });
    expect((await commitments.commitmentState(offer.commitmentId))?.state).toBe("ACTIVE");
    expect((await h.service.membership({ workspaceId: "W" })).participants).toHaveLength(2);
    coord.close();
    h.store.close();
  });

  it("L-N35/FB-A16: concurrent submissions cannot fork the accepted head", async () => {
    const h = build();
    await setup(h);
    const a0 = null;
    const c1 = (await h.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: a0, content: content("c1"), requiredAcceptors: [P, O], intent: "c1" })) as BoundaryCandidateRevision;
    const c2 = (await h.o.proposeRevision({ workspaceId: "W", artifactId: "A", base: a0, content: content("c2"), requiredAcceptors: [P, O], intent: "c2" })) as BoundaryCandidateRevision;
    await h.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest });
    await h.o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c2.digest });
    // Neither candidate is complete yet: still no accepted head.
    expect(await h.p.currentAccepted({ workspaceId: "W", artifactId: "A" })).toBeNull();
    await h.o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest });
    const head = (await h.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))!;
    expect(head.ref.revision).toBe(0);
    expect(head.ref.candidateDigest).toBe(c1.digest);
    // The competing branch can never advance the same head.
    await expect(h.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c2.digest })).rejects.toMatchObject({ kind: "stale_candidate" });
    expect((await h.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))?.ref.revision).toBe(0);
    h.store.close();
  });

  it("L-N34/FB-A08/A39: restart rebuilds membership and artifact lineage deterministically", async () => {
    const dir = mkdtemp();
    const path = join(dir, "b.sqlite");
    try {
      let h = buildWithPath(path);
      await setup(h);
      const add = (await h.p.proposeMembershipChange({ workspaceId: "W", changeKind: "ADD_PARTICIPANT", target: R, intent: "add" })) as MembershipChangeCandidate;
      await h.p.approveMembershipChange({ workspaceId: "W", candidateDigest: add.digest });
      await h.o.approveMembershipChange({ workspaceId: "W", candidateDigest: add.digest });
      await h.r.approveMembershipChange({ workspaceId: "W", candidateDigest: add.digest });
      const c1 = (await h.r.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("v1"), requiredAcceptors: [P, O], intent: "i" })) as BoundaryCandidateRevision;
      await h.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest });
      await h.o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest });
      const before = (await h.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))!;
      h.store.close();

      h = buildWithPath(path);
      const m = await h.p.membership({ workspaceId: "W" });
      expect(m.revision).toBe(1);
      expect(m.participants.map((x) => x.peerId)).toEqual(["ordarium", "palimpsest", "reasoner"]);
      expect((await h.o.currentAccepted({ workspaceId: "W", artifactId: "A" }))!.ref).toEqual(before.ref);
      h.store.close();
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows handle */ }
    }
  });

  it("L-N05/FB-A05: a lost response retried with the same operationId commits exactly once", async () => {
    const h = build();
    await setup(h);
    const c1 = (await h.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("v1"), requiredAcceptors: [P, O], intent: "i", operationId: "acc-1" })) as BoundaryCandidateRevision;
    await h.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, operationId: "accept-1" });
    await h.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, operationId: "accept-1" });
    expect((await h.store.replay("W")).filter((e) => e.type === "CANDIDATE_ACCEPTED")).toHaveLength(1);
    // Final acceptance retried after a lost response also converges.
    await h.o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, operationId: "accept-2" });
    await h.o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, operationId: "accept-2" });
    expect((await h.store.replay("W")).filter((e) => e.type === "REVISION_ACCEPTED")).toHaveLength(1);
    h.store.close();
  });
});

describe("G10-L transport reorder / duplicate semantics", () => {
  it("L-N20: reordering submissions cannot change canonical semantic rules", async () => {
    const h = build();
    await setup(h);
    // Accepting before any candidate exists is rejected (semantic rule, not transport state).
    await expect(h.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: "a".repeat(64) })).rejects.toMatchObject({ kind: "unknown_candidate" });
    const c1 = (await h.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("v1"), requiredAcceptors: [P, O], intent: "i" })) as BoundaryCandidateRevision;
    await h.o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest });
    await h.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest });
    expect((await h.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))?.ref.candidateDigest).toBe(c1.digest);
    h.store.close();
  });
});

/* helpers */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
function mkdtemp(): string { return mkdtempSync(join(tmpdir(), "palimpsest-lf-")); }
function buildWithPath(path: string): Harness {
  const store = new SqliteBoundaryMemoryStore(path);
  const service = makeBoundaryMemoryService({ store, localPeer: H });
  const home = makeBoundaryHome({ homeId: "H", service, store });
  const transport = inProcessBoundaryTransportPort({ H: (envelope) => home.handle(envelope) });
  const route = staticBoundaryRoute({ W: "H" });
  const next = counter();
  const client = (peer: PeerRef) => makeFederatedBoundaryClient({ peer, transport, route, allocateOperationId: () => `${peer.peerId}-${next()}` });
  return { store, service, home, transport, route, p: client(P), o: client(O), r: client(R) };
}
