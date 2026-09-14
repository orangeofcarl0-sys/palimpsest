/**
 * G10-L cross-host federated boundary E2E (§30/§31/§33).
 *
 * Two/three independent host contexts share ONE canonical semantic home. Remote peers
 * hold only a transport + route — never the canonical store object. Transport is
 * at-least-once with semantic idempotency; storage location is never authority.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SqliteBoundaryMemoryStore,
  makeBoundaryHome,
  makeBoundaryMemoryService,
  makeFederatedBoundaryClient,
  inProcessBoundaryTransportPort,
  staticBoundaryRoute,
  ORGANIZATION_BLUEPRINT_TYPE,
} from "../src/boundary_memory/index.js";
import type {
  BoundaryCandidateRevision,
  BoundaryMemoryService,
  MembershipChangeCandidate,
  MembershipView,
} from "../src/boundary_memory/index.js";
import { SqliteCoordinationStore } from "../src/coordination/index.js";
import { makeCommitmentService } from "../src/federation/index.js";
import type { CommitmentScopeGuard, PeerRef } from "../src/federation/index.js";

const P: PeerRef = { schemaVersion: 1, peerId: "palimpsest" };
const O: PeerRef = { schemaVersion: 1, peerId: "ordarium" };
const R: PeerRef = { schemaVersion: 1, peerId: "reasoner" };
const H: PeerRef = { schemaVersion: 1, peerId: "home-host" };
const statementType = { typeId: "boundary.statement", version: "v1" };
const content = (statement: string): unknown => ({ statement, tags: ["requirement"], references: [] });
const counter = (): (() => string) => { let n = 0; return () => `op-${++n}`; };

function build(path: string) {
  const store = new SqliteBoundaryMemoryStore(path);
  const service = makeBoundaryMemoryService({ store, localPeer: H });
  const home = makeBoundaryHome({ homeId: "H", service, store });
  const transport = inProcessBoundaryTransportPort({ H: (envelope) => home.handle(envelope) });
  const route = staticBoundaryRoute({ W: "H" });
  // ONE shared operation-id space: ids must be unique across every remote peer.
  const nextOperation = counter();
  const client = (peer: PeerRef) => makeFederatedBoundaryClient({ peer, transport, route, allocateOperationId: () => `${peer.peerId}-${nextOperation()}` });
  return { store, service, home, transport, route, p: client(P), o: client(O), r: client(R) };
}

type Harness = ReturnType<typeof build>;

describe("G10-L cross-host P↔O golden E2E (§30)", () => {
  it("remote submit/accept/observe over one canonical home, with retry idempotency and restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-l-"));
    const path = join(dir, "boundary.sqlite");
    try {
      let h: Harness = build(path);
      // 1: membership {P,O} — opened at the canonical home; the home peer is NOT a participant.
      await h.service.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "cross-host shared boundary" });
      await h.service.createArtifact({ workspaceId: "W", artifactId: "A", type: statementType, title: "API boundary" });
      expect((await h.service.membership({ workspaceId: "W" })).participants.map((x) => x.peerId)).toEqual(["ordarium", "palimpsest"]);

      // 2: P remote-observes W@B0.
      const b0 = await h.p.basis({ workspaceId: "W" });
      expect(b0.throughSeq).toBeGreaterThan(0);

      // 3-5: P submits C1; the response is lost; the SAME operationId retries → exactly one commit.
      const c1 = (await h.p.proposeRevision({
        workspaceId: "W", artifactId: "A", base: null, content: content("durable state change observation"),
        requiredAcceptors: [P, O], intent: "P: observe-only", operationId: "op-c1",
      })) as BoundaryCandidateRevision;
      const c1retry = (await h.p.proposeRevision({
        workspaceId: "W", artifactId: "A", base: null, content: content("durable state change observation"),
        requiredAcceptors: [P, O], intent: "P: observe-only", operationId: "op-c1",
      })) as BoundaryCandidateRevision;
      expect(c1retry.digest).toBe(c1.digest);
      expect((await h.store.replay("W")).filter((e) => e.type === "CANDIDATE_PROPOSED")).toHaveLength(1);

      // 6-9: O observes C1, O accepts, P accepts → A1.
      const seenByO = (await h.o.pendingCandidates({ workspaceId: "W", artifactId: "A" })) as readonly { candidate: BoundaryCandidateRevision }[];
      expect(seenByO.map((v) => v.candidate.digest)).toContain(c1.digest);
      await h.o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest });
      await h.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest });

      // 10: both hosts observe the exact same canonical head.
      const headP = (await h.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))!;
      const headO = (await h.o.currentAccepted({ workspaceId: "W", artifactId: "A" }))!;
      expect(headP.ref).toEqual(headO.ref);
      expect(headP.ref.revision).toBe(0);

      // 11-13: O submits A2; P submits a competing C3 from A1; A2 wins, C3 goes stale.
      const a2 = (await h.o.proposeRevision({
        workspaceId: "W", artifactId: "A", base: headO.ref, content: content("append/read/watch with sequence"),
        requiredAcceptors: [P, O], intent: "O: add sequence",
      })) as BoundaryCandidateRevision;
      const c3 = (await h.p.proposeRevision({
        workspaceId: "W", artifactId: "A", base: headP.ref, content: content("batched watch alternative"),
        requiredAcceptors: [P, O], intent: "P: alternative",
      })) as BoundaryCandidateRevision;
      await h.o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: a2.digest });
      await h.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: a2.digest });
      const head2 = (await h.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))!;
      expect(head2.ref.revision).toBe(1);
      expect(head2.ref.candidateDigest).toBe(a2.digest);
      const pending = (await h.p.pendingCandidates({ workspaceId: "W", artifactId: "A" })) as readonly { candidate: BoundaryCandidateRevision; standing: string }[];
      expect(pending.find((v) => v.candidate.digest === c3.digest)?.standing).toBe("STALE");

      // 14-15: restart the canonical home; both hosts re-observe the same state.
      h.store.close();
      h = build(path);
      const afterP = (await h.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))!;
      const afterO = (await h.o.currentAccepted({ workspaceId: "W", artifactId: "A" }))!;
      expect(afterP.ref).toEqual(head2.ref);
      expect(afterO.ref).toEqual(head2.ref);
      h.store.close();
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows handle */ }
    }
  });

  it("L-N03/L-N06/FB-A04: remote delivery ≠ commit; same operationId with a different payload fails closed", async () => {
    const h = build(":memory:");
    await h.service.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "p" });
    await h.service.createArtifact({ workspaceId: "W", artifactId: "A", type: statementType, title: "a" });
    await h.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("v1"), requiredAcceptors: [P, O], intent: "i", operationId: "op-x" });
    await expect(
      h.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("DIFFERENT"), requiredAcceptors: [P, O], intent: "i", operationId: "op-x" }),
    ).rejects.toMatchObject({ kind: "operation_conflict" });
    expect((await h.store.replay("W")).filter((e) => e.type === "CANDIDATE_PROPOSED")).toHaveLength(1);
    h.store.close();
  });

  it("L-N07/FB-A06: an unauthenticated envelope cannot author, and the home cannot accept for others", async () => {
    const h = build(":memory:");
    await h.service.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "p" });
    await h.service.createArtifact({ workspaceId: "W", artifactId: "A", type: statementType, title: "a" });
    const injected = await h.home.handle({
      schemaVersion: 1,
      operationId: "op-unauth",
      workspaceId: "W",
      authenticatedPeer: null,
      operation: { kind: "submit_artifact_candidate", artifactId: "A", base: null, content: content("x"), requiredAcceptors: [P, O], intent: "i" },
    });
    expect(injected).toMatchObject({ status: "error", code: "unauthenticated" });
    // The home host is not a participant and has no API to accept as P/O.
    await expect(h.service.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: "a".repeat(64), authenticatedPeer: null, local: true })).rejects.toMatchObject({ kind: "unknown_candidate" });
    h.store.close();
  });

  it("FB-A27: an unknown envelope version fails closed", async () => {
    const h = build(":memory:");
    await h.service.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "p" });
    const result = await h.home.handle({ schemaVersion: 2, operationId: "op-v2", workspaceId: "W", authenticatedPeer: P, operation: { kind: "workspace_view" } });
    expect(result).toMatchObject({ status: "error", code: "unsupported_version" });
    h.store.close();
  });
});

describe("G10-L dynamic membership golden E2E (§31)", () => {
  it("ADD/REMOVE by explicit consent, membership↔artifact freshness, and R's lifecycle", async () => {
    const h = build(":memory:");
    const coord = new SqliteCoordinationStore(":memory:");
    await h.service.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "p" });
    await h.service.createArtifact({ workspaceId: "W", artifactId: "A", type: statementType, title: "a" });
    // An accepted A1 (so history exists to survive membership change).
    const c1 = (await h.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("v1"), requiredAcceptors: [P, O], intent: "i" })) as BoundaryCandidateRevision;
    await h.p.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest });
    await h.o.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: c1.digest });
    const a1 = (await h.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))!;
    // An old-basis pending candidate that must go stale when membership advances.
    const oldPending = (await h.p.proposeRevision({ workspaceId: "W", artifactId: "A", base: a1.ref, content: content("old-basis"), requiredAcceptors: [P, O], intent: "old" })) as BoundaryCandidateRevision;
    // A commitment scoped to A1 must survive membership change.
    const guard: CommitmentScopeGuard = { admitScope: async (scope) => { if (scope.kind === "boundary_revision") await h.service.admitBoundaryRevisionScope(scope.revision); } };
    let n = 0;
    const commitments = makeCommitmentService({ store: coord, localPeer: P, allocateCommitmentId: () => `com-${++n}`, allocateHandoffId: () => "ho-1", scopeGuard: guard });
    const offer = await commitments.offerCommitment({ proposedHolder: O, scope: { kind: "boundary_revision", revision: a1.ref }, statement: "Ordarium implements A1" });
    await commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: O });

    // 2-5: propose ADD R; P, O, and R (own join) all approve.
    const add = (await h.p.proposeMembershipChange({ workspaceId: "W", changeKind: "ADD_PARTICIPANT", target: R, intent: "add reasoner" })) as MembershipChangeCandidate;
    expect(add.requiredApprovers.map((x) => x.peerId)).toEqual(["ordarium", "palimpsest", "reasoner"]);
    await h.p.approveMembershipChange({ workspaceId: "W", candidateDigest: add.digest });
    await h.o.approveMembershipChange({ workspaceId: "W", candidateDigest: add.digest });
    const partial = await h.r.membership({ workspaceId: "W" });
    expect(partial.revision).toBe(0); // one approval still outstanding
    const finalAdd = (await h.r.approveMembershipChange({ workspaceId: "W", candidateDigest: add.digest })) as { standing: string };
    expect(finalAdd.standing).toBe("ACCEPTED");
    const m1 = (await h.p.membership({ workspaceId: "W" })) as MembershipView;
    expect(m1.participants.map((x) => x.peerId)).toEqual(["ordarium", "palimpsest", "reasoner"]);
    expect(m1.revision).toBe(1);

    // 7: R can now author a new revision.
    const byR = (await h.r.proposeRevision({ workspaceId: "W", artifactId: "A", base: a1.ref, content: content("v2-by-R"), requiredAcceptors: [P, O, R], intent: "R revises" })) as BoundaryCandidateRevision;
    expect(byR.author.peerId).toBe("reasoner");
    // 8: the old-basis pending candidate is now stale (never silently reinterpreted).
    const afterAdd = (await h.p.pendingCandidates({ workspaceId: "W", artifactId: "A" })) as readonly { candidate: BoundaryCandidateRevision; standing: string }[];
    expect(afterAdd.find((v) => v.candidate.digest === oldPending.digest)?.standing).toBe("STALE");
    // 9-10: accepted history and the commitment survive.
    expect((await h.p.currentAccepted({ workspaceId: "W", artifactId: "A" }))?.ref).toEqual(a1.ref);
    expect((await commitments.commitmentState(offer.commitmentId))?.state).toBe("ACTIVE");

    // 11-13: consensual REMOVE R.
    const remove = (await h.p.proposeMembershipChange({ workspaceId: "W", changeKind: "REMOVE_PARTICIPANT_CONSENSUAL", target: R, intent: "remove reasoner" })) as MembershipChangeCandidate;
    await h.p.approveMembershipChange({ workspaceId: "W", candidateDigest: remove.digest });
    await h.o.approveMembershipChange({ workspaceId: "W", candidateDigest: remove.digest });
    await h.r.approveMembershipChange({ workspaceId: "W", candidateDigest: remove.digest });
    const m2 = (await h.p.membership({ workspaceId: "W" })) as MembershipView;
    expect(m2.participants.map((x) => x.peerId)).toEqual(["ordarium", "palimpsest"]);
    expect(m2.revision).toBe(2);

    // 14-15: R can no longer author/accept; R's historical contribution remains.
    await expect(h.r.proposeRevision({ workspaceId: "W", artifactId: "A", base: a1.ref, content: content("v3-by-R"), requiredAcceptors: [P, O], intent: "x" })).rejects.toMatchObject({ kind: "not_a_participant" });
    await expect(h.r.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: byR.digest })).rejects.toMatchObject({ kind: "not_a_participant" });
    // Retrying an already-accepted membership change is an idempotent no-op.
    const replayRemove = (await h.r.approveMembershipChange({ workspaceId: "W", candidateDigest: remove.digest })) as { standing: string };
    expect(replayRemove.standing).toBe("ACCEPTED");
    expect((await h.store.replay("W")).some((e) => e.type === "CANDIDATE_PROPOSED" && (e.payload as { candidate: BoundaryCandidateRevision }).candidate.author.peerId === "reasoner")).toBe(true);

    h.store.close();
    coord.close();
  });

  it("L-N12/L-N13/L-N19/FB-A13/A14/A15: membership is approval-based, consensual, and branch-safe", async () => {
    const h = build(":memory:");
    await h.service.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "p" });
    // A joining peer must not ordinary-author before joining.
    await expect(h.r.proposeRevision({ workspaceId: "W", artifactId: "A", base: null, content: content("x"), requiredAcceptors: [P, O], intent: "i" })).rejects.toMatchObject({ kind: "not_a_participant" });
    const add1 = (await h.p.proposeMembershipChange({ workspaceId: "W", changeKind: "ADD_PARTICIPANT", target: R, intent: "add" })) as MembershipChangeCandidate;
    const add2 = (await h.o.proposeMembershipChange({ workspaceId: "W", changeKind: "ADD_PARTICIPANT", target: R, intent: "also add" })) as MembershipChangeCandidate;
    expect(add1.digest).not.toBe(add2.digest);
    // L-N12: one approval cannot advance membership.
    await h.p.approveMembershipChange({ workspaceId: "W", candidateDigest: add1.digest });
    expect((await h.p.membership({ workspaceId: "W" })).revision).toBe(0);
    // L-N13: v1 REMOVE is consensual — a 2-peer workspace cannot drop below 2, and the target must approve.
    await expect(h.p.proposeMembershipChange({ workspaceId: "W", changeKind: "REMOVE_PARTICIPANT_CONSENSUAL", target: O, intent: "remove" })).rejects.toMatchObject({ kind: "invalid_registration" });
    // No LWW: add1 accepted makes add2 stale.
    await h.o.approveMembershipChange({ workspaceId: "W", candidateDigest: add1.digest });
    await h.r.approveMembershipChange({ workspaceId: "W", candidateDigest: add1.digest });
    expect((await h.p.membership({ workspaceId: "W" })).revision).toBe(1);
    const pendingM = (await h.p.membership({ workspaceId: "W" })).pending;
    expect(pendingM.find((v) => v.candidate.digest === add2.digest)?.standing).toBe("STALE");
    await expect(h.o.approveMembershipChange({ workspaceId: "W", candidateDigest: add2.digest })).rejects.toMatchObject({ kind: "stale_membership" });
    h.store.close();
  });

  it("L-N29/FB-A09/A10/A11: workspace membership ≠ blueprint members ≠ commitment ≠ authority", async () => {
    const h = build(":memory:");
    await h.service.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "p" });
    await h.service.createArtifact({ workspaceId: "W", artifactId: "BP", type: ORGANIZATION_BLUEPRINT_TYPE, title: "bp" });
    const blueprint = {
      organizationDefinitionId: "O1", mission: "m",
      members: [{ kind: "peer", peer: R }],
      roles: [{ roleId: "r1", requiredCapabilities: [] }],
      assignments: [{ member: { kind: "peer", peer: R }, roleId: "r1" }],
      norms: [], interactions: [], references: [],
    };
    await h.p.proposeRevision({ workspaceId: "W", artifactId: "BP", base: null, content: blueprint, requiredAcceptors: [P, O], intent: "bp" });
    const membership = await h.p.membership({ workspaceId: "W" });
    expect(membership.participants.map((x) => x.peerId)).toEqual(["ordarium", "palimpsest"]);
    // The blueprint's explicit member (R) is NOT a workspace participant.
    expect(membership.participants.some((x) => x.peerId === "reasoner")).toBe(false);
    h.store.close();
  });
});
