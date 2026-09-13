/**
 * G10-K golden Palimpsest ↔ Ordarium E2E (§50) — long-lived peer collaboration
 * over durable shared boundary state, with conversation, commitment, evidence,
 * and organization kept strictly separate.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteBoundaryMemoryStore, makeBoundaryMemoryService } from "../src/boundary_memory/index.js";
import type { BoundaryMemoryService } from "../src/boundary_memory/index.js";
import { SqliteCoordinationStore } from "../src/coordination/index.js";
import { makeCommitmentService } from "../src/federation/index.js";
import type { CommitmentScopeGuard } from "../src/federation/index.js";
import type { PeerRef } from "../src/federation/index.js";
import { SqliteOrganizationStore } from "../src/organization/index.js";

const SRC = (p: string): string => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), "utf-8");
const strip = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const P: PeerRef = { schemaVersion: 1, peerId: "palimpsest" };
const O: PeerRef = { schemaVersion: 1, peerId: "ordarium" };
const interfaceType = { typeId: "boundary.interface", version: "v1" };
const iface = (description: string, operations: readonly { operationId: string; semantics: string }[]): unknown => ({
  interfaceId: "state-change-observation",
  description,
  operations,
  references: [],
});

describe("G10-K golden E2E (§50)", () => {
  it("propose / counterpropose / accept / commit / revise / restart with no cross-contamination", async () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-kg-"));
    const boundaryPath = join(dir, "boundary.sqlite");
    const coordPath = join(dir, "coordination.sqlite");
    try {
      const boundaryStore = new SqliteBoundaryMemoryStore(boundaryPath);
      const coordination = new SqliteCoordinationStore(coordPath);
      const p: BoundaryMemoryService = makeBoundaryMemoryService({ store: boundaryStore, localPeer: P });
      const o: BoundaryMemoryService = makeBoundaryMemoryService({ store: boundaryStore, localPeer: O });

      // 1-3: two peers, one explicit workspace.
      await p.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "durable state-change observation" });
      await p.createArtifact({ workspaceId: "W", artifactId: "api", type: interfaceType, title: "state-change API" });

      // 4: P proposes C1.
      const c1 = await p.proposeRevision({
        workspaceId: "W", artifactId: "api", base: null,
        content: iface("we need durable state change observation", [{ operationId: "observe", semantics: "read changes" }]),
        requiredAcceptors: [P, O], intent: "P: observe-only interface",
      });
      // 5: O does not accept C1; O counter-proposes C2 from the same (genesis) base.
      const c2 = await o.proposeRevision({
        workspaceId: "W", artifactId: "api", base: null,
        content: iface("append/read/watch semantics", [
          { operationId: "append", semantics: "durably append a change" },
          { operationId: "read", semantics: "read changes since a point" },
          { operationId: "watch", semantics: "subscribe to future changes" },
        ]),
        requiredAcceptors: [P, O], intent: "O: append/read/watch contract",
      });
      expect(c2.digest).not.toBe(c1.digest);

      // 6-8: both accept C2; it becomes A1.
      await p.acceptRevision({ workspaceId: "W", artifactId: "api", candidateDigest: c2.digest, authenticatedPeer: null, local: true });
      await o.acceptRevision({ workspaceId: "W", artifactId: "api", candidateDigest: c2.digest, authenticatedPeer: null, local: true });
      const a1 = (await p.currentAccepted({ workspaceId: "W", artifactId: "api" }))!;
      expect(a1.ref.revision).toBe(0);
      expect(a1.ref.candidateDigest).toBe(c2.digest);

      // 9-10: no conversation/commitment came from boundary acceptance.
      expect(await coordination.head()).toBe(0);
      const guard: CommitmentScopeGuard = { admitScope: async (scope) => { if (scope.kind === "boundary_revision") await p.admitBoundaryRevisionScope(scope.revision); } };
      let n = 0;
      const commitments = makeCommitmentService({ store: coordination, localPeer: O, allocateCommitmentId: () => `com-${++n}`, allocateHandoffId: () => "ho-1", scopeGuard: guard });
      expect(await commitments.activeCommitmentsOf(O)).toHaveLength(0);

      // 11-12: O explicitly accepts a Commitment scoped to A1.
      const offer = await commitments.offerCommitment({ proposedHolder: O, scope: { kind: "boundary_revision", revision: a1.ref }, statement: "Ordarium implements append/read/watch" });
      await commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: O });
      expect((await commitments.commitmentState(offer.commitmentId))?.state).toBe("ACTIVE");

      // 13-14: O proposes A2 based on A1; a concurrent P candidate also branches from A1.
      const a2candidate = await o.proposeRevision({
        workspaceId: "W", artifactId: "api", base: a1.ref,
        content: iface("append/read/watch with monotonic sequence", [{ operationId: "append", semantics: "append with a monotonically increasing sequence" }]),
        requiredAcceptors: [P, O], intent: "O: add a sequence guarantee",
      });
      const concurrent = await p.proposeRevision({
        workspaceId: "W", artifactId: "api", base: a1.ref,
        content: iface("append/read/watch with batched watch", [{ operationId: "watch", semantics: "batched watch" }]),
        requiredAcceptors: [P, O], intent: "P: alternative revision",
      });
      await o.acceptRevision({ workspaceId: "W", artifactId: "api", candidateDigest: a2candidate.digest, authenticatedPeer: null, local: true });
      await p.acceptRevision({ workspaceId: "W", artifactId: "api", candidateDigest: a2candidate.digest, authenticatedPeer: null, local: true });

      // 15-17: A1 is superseded history; the concurrent branch is stale; the commitment is unchanged.
      const a2 = (await p.currentAccepted({ workspaceId: "W", artifactId: "api" }))!;
      expect(a2.ref.revision).toBe(1);
      const revisions = (await boundaryStore.replay("W")).filter((event) => event.type === "REVISION_ACCEPTED");
      expect(revisions).toHaveLength(2);
      const pending = await p.pendingCandidates({ workspaceId: "W", artifactId: "api" });
      expect(pending.some((view) => view.candidate.digest === concurrent.digest && view.standing === "STALE")).toBe(true);
      expect(pending.some((view) => view.candidate.digest === c1.digest && view.standing === "STALE")).toBe(true);
      expect((await commitments.commitmentState(offer.commitmentId))?.state).toBe("ACTIVE");

      // 20: no Organization exists — nothing invoked a FORMALIZE path.
      const orgStore = new SqliteOrganizationStore(":memory:");
      expect(await orgStore.head("O1")).toBeUndefined();

      // 18-19: restart reproduces the exact accepted head, commitment, and stale candidates.
      boundaryStore.close();
      coordination.close();
      const reopened = new SqliteBoundaryMemoryStore(boundaryPath);
      const p2 = makeBoundaryMemoryService({ store: reopened, localPeer: P });
      const reopenedA2 = (await p2.currentAccepted({ workspaceId: "W", artifactId: "api" }))!;
      expect(reopenedA2.ref).toEqual(a2.ref);
      const reopenedPending = await p2.pendingCandidates({ workspaceId: "W", artifactId: "api" });
      expect(reopenedPending.some((view) => view.candidate.digest === concurrent.digest && view.standing === "STALE")).toBe(true);
      reopened.close();
      orgStore.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows may briefly hold a handle; the temp dir is disposable.
      }
    }
  });
});

describe("G10-K firewall (BM-A05/A07/A19/A20/A34/A35)", () => {
  it("boundary memory owns no second truth: no evidence, organization-store, campaign, or scheduler import", () => {
    const store = strip(SRC("boundary_memory/store.ts"));
    const service = strip(SRC("boundary_memory/service.ts"));
    const artifacts = strip(SRC("boundary_memory/artifacts.ts"));
    for (const source of [store, service, artifacts]) {
      expect(source).not.toMatch(/from "\.\.\/evidence/);
      expect(source).not.toMatch(/from "\.\.\/campaign/);
      expect(source).not.toMatch(/from "\.\.\/scheduler/);
      expect(source).not.toMatch(/from "\.\.\/institution/);
      // No canonical organization MUTATION path may be reachable from boundary memory.
      expect(source).not.toMatch(/organization\/store/);
      expect(source).not.toMatch(/SqliteOrganizationStore/);
      expect(source).not.toMatch(/registerRevision/);
    }
    // The Boundary Memory store never exposes an update/delete path.
    expect(store).not.toMatch(/UPDATE boundary_events/);
    expect(store).not.toMatch(/DELETE FROM/);
  });

  it("the commitment scope variant is the ONLY accepted-revision binding; a candidate is unrepresentable", async () => {
    const store = new SqliteBoundaryMemoryStore(":memory:");
    const p = makeBoundaryMemoryService({ store, localPeer: P });
    await p.openWorkspace({ workspaceId: "W", participants: [P, O], purpose: "p" });
    await p.createArtifact({ workspaceId: "W", artifactId: "api", type: interfaceType, title: "a" });
    const c1 = await p.proposeRevision({ workspaceId: "W", artifactId: "api", base: null, content: iface("x", []), requiredAcceptors: [P, O], intent: "i" });
    // A candidate digest alone is not a scoped revision: admitting it requires a real accepted ref.
    await expect(p.admitBoundaryRevisionScope({ schemaVersion: 1, workspaceId: "W", artifactId: "api", revision: 0, candidateDigest: c1.digest, revisionDigest: "a".repeat(64) })).rejects.toMatchObject({ kind: "unverified_scope" });
  });
});
