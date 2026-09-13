/**
 * G10-K — Collaborative Boundary Memory: workspace identity, artifact typing,
 * branching candidates, explicit acceptance, store replay/crash, commitment
 * binding, and the adversarial negative suite (K-N01…K-N35, BM-A01…BM-A26).
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  ORGANIZATION_BLUEPRINT_TYPE,
  SqliteBoundaryMemoryStore,
  boundaryArtifactRefKey,
  boundaryWorkspaceRefKey,
  makeBoundaryArtifactTypeRegistry,
  makeBoundaryMemoryService,
  materializeAcceptedBoundaryRevisionRef,
} from "../src/boundary_memory/index.js";
import type { BoundaryMemoryService } from "../src/boundary_memory/index.js";
import { SqliteCoordinationStore } from "../src/coordination/index.js";
import { makeCommitmentService } from "../src/federation/index.js";
import type { CommitmentScopeGuard } from "../src/federation/index.js";
import type { PeerRef } from "../src/federation/index.js";

const P: PeerRef = { schemaVersion: 1, peerId: "palimpsest" };
const O: PeerRef = { schemaVersion: 1, peerId: "ordarium" };
const STRANGER: PeerRef = { schemaVersion: 1, peerId: "stranger" };

const statementType = { typeId: "boundary.statement", version: "v1" };
const content = (statement: string, tags: readonly string[] = ["requirement"]): unknown => ({ statement, tags, references: [] });

function buildEnv(): { store: SqliteBoundaryMemoryStore; p: BoundaryMemoryService; o: BoundaryMemoryService } {
  const store = new SqliteBoundaryMemoryStore(":memory:");
  return {
    store,
    p: makeBoundaryMemoryService({ store, localPeer: P }),
    o: makeBoundaryMemoryService({ store, localPeer: O }),
  };
}

async function openWithStatement(env: ReturnType<typeof buildEnv>, workspaceId = "W", artifactId = "A") {
  await env.p.openWorkspace({ workspaceId, participants: [P, O], purpose: "shared API boundary" });
  await env.p.createArtifact({ workspaceId, artifactId, type: statementType, title: "API boundary" });
}

async function acceptedStatement(env: ReturnType<typeof buildEnv>): Promise<void> {
  await openWithStatement(env);
  const c1 = await env.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("append/read/watch semantics"), requiredAcceptors: [P, O], intent: "declare the interface" });
  await env.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: null, local: true });
  await env.o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: null, local: true });
}

describe("G10-K boundary workspace & artifact identity", () => {
  it("K-N01/K-N02/BM-A02/A08: a workspace is explicit, never derived from a thread/message", async () => {
    const env = buildEnv();
    // No workspace exists until explicitly opened — a thread-like string opens nothing.
    await expect(env.p.workspaceView({ workspaceId: "thread-1" })).rejects.toMatchObject({ kind: "unknown_workspace" });
    expect(await env.store.workspace("thread-1")).toBeUndefined();
    await openWithStatement(env);
    // Namespaces stay distinct: workspace and artifact ref keys are not each other.
    const wsKey = boundaryWorkspaceRefKey({ schemaVersion: 1, workspaceId: "W" });
    const artKey = boundaryArtifactRefKey({ schemaVersion: 1, workspaceId: "W", artifactId: "A" });
    expect(wsKey).not.toBe(artKey);
    expect(wsKey).toBe("W");
    expect(artKey).toBe("W/A");
  });

  it("K-N19/BM-A21/A22: an unknown artifact type fails closed; a registered one validates content", async () => {
    const env = buildEnv();
    await env.p.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "p" });
    await expect(env.p.createArtifact({ workspaceId: "W", artifactId: "X", type: { typeId: "boundary.unknown", version: "v1" }, title: "x" })).rejects.toMatchObject({ kind: "unknown_type" });
    await env.p.createArtifact({ workspaceId: "W", artifactId: "A", type: statementType, title: "a" });
    await expect(
      env.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: { statement: "", tags: ["nope"], references: [] }, requiredAcceptors: [P, O], intent: "bad" }),
    ).rejects.toMatchObject({ kind: "invalid_content" });
  });

  it("A22: the registry is extensible without a payload:any escape hatch", async () => {
    const types = makeBoundaryArtifactTypeRegistry([
      { type: { typeId: "x.custom", version: "v1" }, validate: (raw) => Object.freeze({ value: (raw as { value: string }).value }) },
    ]);
    const store = new SqliteBoundaryMemoryStore(":memory:");
    const svc = makeBoundaryMemoryService({ store, localPeer: P, types });
    await svc.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "p" });
    await expect(svc.createArtifact({ workspaceId: "W", artifactId: "A", type: statementType, title: "a" })).rejects.toMatchObject({ kind: "unknown_type" });
    await svc.createArtifact({ workspaceId: "W", artifactId: "B", type: { typeId: "x.custom", version: "v1" }, title: "b" });
    const c = await svc.proposeRevision({ workspaceId: "W", artifactId: "B", base: null, content: { value: "v" }, requiredAcceptors: [P, O], intent: "i" });
    expect(c.contentDigest).toHaveLength(64);
  });

  it("K-N14/N15: required acceptors are explicit participants and a canonical set", async () => {
    const env = buildEnv();
    await openWithStatement(env);
    await expect(env.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("c"), requiredAcceptors: [P, STRANGER], intent: "i" })).rejects.toMatchObject({ kind: "not_a_participant" });
    await expect(env.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("c"), requiredAcceptors: [P, P], intent: "i" })).rejects.toThrow(/duplicate/);
  });

  it("BM-A10/K-N09: an author can never be the sole acceptor, and authorship is the LOCAL peer", async () => {
    const env = buildEnv();
    await openWithStatement(env);
    await expect(env.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("c"), requiredAcceptors: [P], intent: "i" })).rejects.toMatchObject({ kind: "unilateral_acceptance_unsupported" });
    const byO = await env.o.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("c"), requiredAcceptors: [P, O], intent: "i" });
    expect(byO.author.peerId).toBe("ordarium");
    const byP = await env.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("c2"), requiredAcceptors: [P, O], intent: "i" });
    expect(byP.author.peerId).toBe("palimpsest");
  });
});

describe("G10-K acceptance, branching & concurrency", () => {
  it("BM-A13/K-N16/K-N12: mutual acceptance advances the head; one acceptance is insufficient; retry is idempotent", async () => {
    const env = buildEnv();
    await openWithStatement(env);
    const c1 = await env.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("v1"), requiredAcceptors: [P, O], intent: "i" });
    expect(await env.p.pendingCandidates({ workspaceId: "W", artifactId: "A" })).toHaveLength(1);
    const first = await env.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: null, local: true });
    expect(first.standing).toBe("PARTIALLY_ACCEPTED");
    expect(first.accepted).toBeNull();
    expect(await env.p.currentAccepted({ workspaceId: "W", artifactId: "A" })).toBeNull();
    const retry = await env.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: null, local: true });
    expect(retry.acceptors.map((peer) => peer.peerId)).toEqual(["palimpsest"]);
    const second = await env.o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: null, local: true });
    expect(second.standing).toBe("ACCEPTED");
    expect(second.accepted?.revision).toBe(0);
    expect((await env.o.currentAccepted({ workspaceId: "W", artifactId: "A" }))?.ref.candidateDigest).toBe(c1.digest);
  });

  it("K-N08/BM-A11: unauthenticated input can never accept shared boundary state", async () => {
    const env = buildEnv();
    await env.p.openWorkspace({ workspaceId: "W3", participants: [P, O, STRANGER], purpose: "p" });
    await env.p.createArtifact({ workspaceId: "W3", artifactId: "A", type: statementType, title: "a" });
    const c1 = await env.p.proposeRevision({ workspaceId: "W3", artifactId: "A", base: null, content: content("v1"), requiredAcceptors: [P, O], intent: "i" });
    await expect(env.o.acceptRevision({ workspaceId: "W3", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: null, local: false })).rejects.toMatchObject({ kind: "unauthenticated_acceptance" });
    // A participant who is NOT a required acceptor can never decide the candidate.
    await expect(env.o.acceptRevision({ workspaceId: "W3", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: STRANGER })).rejects.toMatchObject({ kind: "not_required_acceptor" });
    await expect(env.o.rejectRevision({ workspaceId: "W3", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: STRANGER })).rejects.toMatchObject({ kind: "not_required_acceptor" });
  });

  it("K-N10/K-N11/BM-A14/A15/A16: concurrent branches never LWW; a stale branch cannot advance the head", async () => {
    const env = buildEnv();
    await acceptedStatement(env);
    const a0 = (await env.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))!;
    const c2 = await env.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: a0.ref, content: content("v2"), requiredAcceptors: [P, O], intent: "propose v2" });
    const c3 = await env.o.proposeRevision({ workspaceId: "W", artifactId: "A", base: a0.ref, content: content("v3-alt"), requiredAcceptors: [P, O], intent: "counter-propose" });
    expect(c2.digest).not.toBe(c3.digest);
    await env.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c2.digest, authenticatedPeer: null, local: true });
    await env.o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c2.digest, authenticatedPeer: null, local: true });
    const a1 = (await env.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))!;
    expect(a1.ref.revision).toBe(1);
    expect(a1.ref.candidateDigest).toBe(c2.digest);
    // The losing concurrent branch is now stale and cannot advance the head.
    await expect(env.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c3.digest, authenticatedPeer: null, local: true })).rejects.toMatchObject({ kind: "stale_candidate" });
    const pending = await env.p.pendingCandidates({ workspaceId: "W", artifactId: "A" });
    expect(pending.some((view) => view.candidate.digest === c3.digest && view.standing === "STALE")).toBe(true);
    expect((await env.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))?.ref.revision).toBe(1);
    // History retained: two accepted revisions, distinct digests, prior not deleted.
    const revisions = (await env.store.replay("W")).filter((event) => event.type === "REVISION_ACCEPTED");
    expect(revisions).toHaveLength(2);
  });

  it("K-N17/BM-A17: rejection is legitimate, terminal for that candidate, and history-retained", async () => {
    const env = buildEnv();
    await openWithStatement(env);
    const c1 = await env.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("v1"), requiredAcceptors: [P, O], intent: "i" });
    const rejected = await env.o.rejectRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: null, local: true });
    expect(rejected.standing).toBe("REJECTED");
    await expect(env.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: null, local: true })).rejects.toMatchObject({ kind: "already_decided" });
    expect((await env.store.replay("W")).some((event) => event.type === "CANDIDATE_REJECTED")).toBe(true);
    expect(await env.p.currentAccepted({ workspaceId: "W", artifactId: "A" })).toBeNull();
  });

  it("K-N34/BM-A18: restart reproduces the exact accepted head, pending and stale candidates", async () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-k-"));
    const path = join(dir, "boundary.sqlite");
    try {
      const store = new SqliteBoundaryMemoryStore(path);
      const p = makeBoundaryMemoryService({ store, localPeer: P });
      const o = makeBoundaryMemoryService({ store, localPeer: O });
      await p.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "p" });
      await p.createArtifact({ workspaceId: "W", artifactId: "A", type: statementType, title: "a" });
      const c1 = await p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("v1"), requiredAcceptors: [P, O], intent: "i" });
      await p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: null, local: true });
      await o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest, authenticatedPeer: null, local: true });
      const headBefore = (await p.currentAccepted({ workspaceId: "W", artifactId: "A" }))!.ref;
      const basisBefore = await store.basis("W");
      store.close();

      const reopened = new SqliteBoundaryMemoryStore(path);
      const p2 = makeBoundaryMemoryService({ store: reopened, localPeer: P });
      const headAfter = (await p2.currentAccepted({ workspaceId: "W", artifactId: "A" }))!.ref;
      expect(headAfter).toEqual(headBefore);
      expect(await reopened.basis("W")).toEqual(basisBefore);
      const view = await p2.workspaceView({ workspaceId: "W" });
      expect(view.workspace.participants.map((peer) => peer.peerId)).toEqual(["ordarium", "palimpsest"]);
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("K-N35/BM-A18: malformed durable history fails closed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-k-"));
    const path = join(dir, "boundary.sqlite");
    try {
      const store = new SqliteBoundaryMemoryStore(path);
      const p = makeBoundaryMemoryService({ store, localPeer: P });
      await openWithStatementWith(p);
      store.close();
      const raw = new DatabaseSync(path);
      raw.exec("UPDATE boundary_events SET payload_json = '{\"tampered\":true}' WHERE seq = 2");
      raw.close();
      const reopened = new SqliteBoundaryMemoryStore(path);
      const p2 = makeBoundaryMemoryService({ store: reopened, localPeer: P });
      await expect(p2.workspaceView({ workspaceId: "W" })).rejects.toMatchObject({ kind: "malformed_record" });
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("K-N13: an eventId reused with different content fails closed", async () => {
    const store = new SqliteBoundaryMemoryStore(":memory:");
    const opened = await store.openWorkspace({ schemaVersion: 1, workspaceId: "W", participants: [P, O], purpose: "p" });
    await expect(
      store.appendAtomic({
        workspaceId: "W",
        expectedBasis: (await store.basis("W"))!,
        events: [{ eventId: opened.eventId, type: "ARTIFACT_CREATED", payload: { artifact: { schemaVersion: 1, workspaceId: "W", artifactId: "A", type: statementType, title: "a" } } }],
      }),
    ).rejects.toMatchObject({ kind: "event_conflict" });
  });

  it("K-N34/§64: closing a workspace blocks mutation without deleting history", async () => {
    const env = buildEnv();
    await acceptedStatement(env);
    await env.p.closeWorkspace({ workspaceId: "W", reason: "archived" });
    await expect(env.p.createArtifact({ workspaceId: "W", artifactId: "B", type: statementType, title: "b" })).rejects.toMatchObject({ kind: "workspace_closed" });
    const view = await env.p.workspaceView({ workspaceId: "W" });
    expect(view.closed).toBe(true);
    expect(view.artifacts[0]!.current?.ref.revision).toBe(0);
  });
});

async function openWithStatementWith(p: BoundaryMemoryService): Promise<void> {
  await p.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "p" });
  await p.createArtifact({ workspaceId: "W", artifactId: "A", type: statementType, title: "a" });
}

describe("G10-K commitment binding (K-N22/K-N23/K-N24, BM-A24/A25)", () => {
  function env() {
    const store = new SqliteCoordinationStore(":memory:");
    let n = 0;
    return { store, allocate: () => `com-${++n}` };
  }

  it("K-N23: an exact ACCEPTED revision may be a commitment scope; supersession does not change the commitment", async () => {
    const boundary = buildEnv();
    await acceptedStatement(boundary);
    const a0 = (await boundary.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))!;
    const coord = env();
    const guard: CommitmentScopeGuard = { admitScope: async (scope) => { if (scope.kind === "boundary_revision") await boundary.p.admitBoundaryRevisionScope(scope.revision); } };
    const commitments = makeCommitmentService({ store: coord.store, localPeer: P, allocateCommitmentId: coord.allocate, allocateHandoffId: () => "ho-1", scopeGuard: guard });
    const offer = await commitments.offerCommitment({ proposedHolder: O, scope: { kind: "boundary_revision", revision: a0.ref }, statement: "Ordarium implements the accepted interface" });
    await commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: O });
    expect((await commitments.commitmentState(offer.commitmentId))?.state).toBe("ACTIVE");
    // Supersede A0 with A1 — the commitment lifecycle is independent.
    const c2 = await boundary.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: a0.ref, content: content("v2"), requiredAcceptors: [P, O], intent: "v2" });
    await boundary.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c2.digest, authenticatedPeer: null, local: true });
    await boundary.o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c2.digest, authenticatedPeer: null, local: true });
    expect((await boundary.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))?.ref.revision).toBe(1);
    expect((await commitments.commitmentState(offer.commitmentId))?.state).toBe("ACTIVE");
  });

  it("K-N22/N24: a candidate/fabricated revision cannot be a commitment scope; no guard means fail closed", async () => {
    const boundary = buildEnv();
    await acceptedStatement(boundary);
    const a0 = (await boundary.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))!;
    const coord = env();
    const guard: CommitmentScopeGuard = { admitScope: async (scope) => { if (scope.kind === "boundary_revision") await boundary.p.admitBoundaryRevisionScope(scope.revision); } };
    const commitments = makeCommitmentService({ store: coord.store, localPeer: P, allocateCommitmentId: coord.allocate, allocateHandoffId: () => "ho-1", scopeGuard: guard });
    const fabricated = materializeAcceptedBoundaryRevisionRef({ workspaceId: "W", artifactId: "A", revision: 7, candidateDigest: "a".repeat(64), revisionDigest: "b".repeat(64) });
    await expect(commitments.offerCommitment({ proposedHolder: O, scope: { kind: "boundary_revision", revision: fabricated }, statement: "s" })).rejects.toMatchObject({ kind: "unverified_scope" });
    // Accepted A0 is fine, but without a guard even a real ref is refused.
    const unguarded = makeCommitmentService({ store: coord.store, localPeer: P, allocateCommitmentId: coord.allocate, allocateHandoffId: () => "ho-2" });
    await expect(unguarded.offerCommitment({ proposedHolder: O, scope: { kind: "boundary_revision", revision: a0.ref }, statement: "s" })).rejects.toMatchObject({ kind: "unverified_scope" });
    // Boundary acceptance alone never created a commitment.
    expect(await commitments.activeCommitmentsOf(O)).toHaveLength(0);
  });

  it("K-N04/N05/BM-A04: boundary acceptance creates no commitment; candidate scopes are unrepresentable", async () => {
    const boundary = buildEnv();
    await acceptedStatement(boundary);
    const coord = env();
    const commitments = makeCommitmentService({ store: coord.store, localPeer: P, allocateCommitmentId: coord.allocate, allocateHandoffId: () => "ho-1" });
    expect(await commitments.activeCommitmentsOf(O)).toHaveLength(0);
    expect(await commitments.activeCommitmentsOf(P)).toHaveLength(0);
  });
});

describe("G10-K blueprint artifact type", () => {
  it("BM-A27/A28: a stored organization blueprint is not an OrganizationDefinition", async () => {
    const env = buildEnv();
    await env.p.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "formalize" });
    await env.p.createArtifact({ workspaceId: "W", artifactId: "BP", type: ORGANIZATION_BLUEPRINT_TYPE, title: "blueprint" });
    const blueprint = {
      organizationDefinitionId: "O1",
      mission: "deliver the shared boundary",
      members: [{ kind: "peer", peer: P }],
      roles: [{ roleId: "r1", requiredCapabilities: [] }, { roleId: "r2", requiredCapabilities: [] }],
      assignments: [{ member: { kind: "peer", peer: P }, roleId: "r1" }],
      norms: [{ normId: "n1", kind: "obligation", roleId: "r1", actionTag: "publish" }],
      interactions: [{ interactionId: "i1", fromRoleId: "r1", toRoleId: "r2", protocol: "proto" }],
      references: [],
    };
    const c = await env.p.proposeRevision({ workspaceId: "W", artifactId: "BP", base: null, content: blueprint, requiredAcceptors: [P, O], intent: "joint blueprint" });
    await env.p.acceptRevision({ workspaceId: "W", artifactId: "BP", candidateDigest: c.digest, authenticatedPeer: null, local: true });
    await env.o.acceptRevision({ workspaceId: "W", artifactId: "BP", candidateDigest: c.digest, authenticatedPeer: null, local: true });
    const accepted = await env.p.acceptedBlueprint({ workspaceId: "W", artifactId: "BP" });
    expect(accepted).toBeDefined();
    expect(accepted!.content.roles).toHaveLength(2);
    expect(accepted!.definition.revision).toBe(0);
    expect(accepted!.revision.revision).toBe(0);
  });

  it("K-N28/K-N29: an incomplete blueprint fails closed; missing structure cannot be inferred", async () => {
    const env = buildEnv();
    await env.p.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "p" });
    await env.p.createArtifact({ workspaceId: "W", artifactId: "BP", type: ORGANIZATION_BLUEPRINT_TYPE, title: "blueprint" });
    await expect(
      env.p.proposeRevision({
        workspaceId: "W",
        artifactId: "BP",
        base: null,
        // role assigned but not declared -> the OrganizationDefinition validator rejects it.
        content: { organizationDefinitionId: "O1", mission: "m", members: [], roles: [], assignments: [{ member: { kind: "peer", peer: P }, roleId: "missing" }], norms: [], interactions: [], references: [] },
        requiredAcceptors: [P, O],
        intent: "i",
      }),
    ).rejects.toMatchObject({ kind: "invalid_content" });
  });
});
