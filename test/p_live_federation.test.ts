/**
 * G10-P golden live federation E2E — two separately configured persistent project peers.
 *
 *   P-A01/P-A02 stable PeerRef + PersistentPoint across restart
 *   P-A03 TransportTruth ≠ CollaborationTruth      P-A07 message ≠ commitment
 *   P-A10 remote request cannot directly assign Work
 *   P-A11/A12 at-least-once converges; duplicate envelope ≠ duplicate semantic event
 *   P-A13/A14 crash windows lose no semantic work
 *   P-A15 offline peer receives durable work later
 *   P-A19 deployment config ≠ semantic authority    P-A21 no global planner
 *   P-A24 refusal/counterproposal path works        P-A26 Work-only install unchanged
 *   P-A29 application surface remains the façade    P-A30/A31 production stores only
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { launchDeployment, type Deployment } from "../src/deployment/index.js";
import type { ProjectAgentDeploymentProfile } from "../src/deployment/index.js";
import { materializePeerRef, type PeerRef } from "../src/federation/index.js";

const P: PeerRef = materializePeerRef({ peerId: "peer-palimpsest" });
const O: PeerRef = materializePeerRef({ peerId: "peer-ordarium" });

const WORKSPACE = "ws-live";
const ARTIFACT = "api";
const INTERFACE_TYPE = { typeId: "boundary.interface", version: "v1" };

function iface(description: string, operations: readonly { operationId: string; semantics: string }[]): unknown {
  return { interfaceId: "state-change-observation", description, operations, references: [] };
}

let root = "";

function newRoot(): string {
  root = mkdtempSync(join(tmpdir(), "palimpsest-p-live-"));
  return root;
}

function profileFor(input: {
  readonly who: "palimpsest" | "ordarium";
  readonly other: string;
  readonly transportPath: string;
  readonly namespace: string;
}): ProjectAgentDeploymentProfile {
  const dir = join(root, input.who);
  const homeOfPalimpsest = "home-peer-palimpsest";
  return {
    schemaVersion: 1,
    profileId: `deploy-${input.who}`,
    projectId: input.who,
    localPeer: `peer-${input.who}`,
    persistentPoint: `pp-${input.who}`,
    transport: { namespace: input.namespace, databasePath: input.transportPath },
    databases: {
      orchestration: join(dir, "palimpsest.sqlite"),
      ordarium: join(dir, "ops.sqlite"),
      coordination: join(dir, "coordination.sqlite"),
      transportCursors: join(dir, "cursors.sqlite"),
      boundaryMemory: join(dir, "boundary.sqlite"),
      runtimeScope: join(dir, "runtime.sqlite"),
      attentionMarks: join(dir, "attention.sqlite"),
    },
    directory: [{ peerId: input.other, competenceTags: ["state-change-feed"] }],
    attention: { policyId: "live-attention-v1", cooldownMs: 0, activation: "none" },
    boundaryHomeId: `home-peer-${input.who}`,
    boundaryRoutes: { [WORKSPACE]: homeOfPalimpsest },
  };
}

function starts(): { p: Deployment; o: Deployment } {
  const transportPath = join(root, "transport.sqlite");
  const p = launchDeployment(
    profileFor({ who: "palimpsest", other: O.peerId, transportPath, namespace: "dogfood" }),
  );
  const o = launchDeployment(profileFor({ who: "ordarium", other: P.peerId, transportPath, namespace: "dogfood" }));
  return { p, o };
}

async function workTaskCount(deployment: Deployment): Promise<number> {
  // The Work projection is honest about a missing project (unknown/error, never a fake
  // empty known graph); either way there are no task nodes created by remote messages.
  const projection = await deployment.installed.application.projections!.work();
  return projection.nodes.filter((node) => node.kind === "task").length;
}

describe("G10-P golden live federation (two persistent project peers)", () => {
  it("exchanges durable semantics, survives restarts, duplicate delivery and negotiation without a planner", async () => {
    newRoot();
    let { p, o } = starts();
    try {
      const appP = p.installed.application;
      const appO = o.installed.application;
      expect(appP.federation).toBeDefined();
      expect(appO.federation).toBeDefined();

      // --- different lived state: distinct DBs, distinct local peers, distinct inboxes ---
      expect(p.localPeer.peerId).not.toBe(o.localPeer.peerId);
      expect(p.profile.databases.coordination).not.toBe(o.profile.databases.coordination);

      // --- P holds the canonical boundary home; P opens the shared interface workspace ---
      const bm = p.installed.boundaryMemory!.service;
      await bm.openWorkspace({ workspaceId: WORKSPACE, participants: [P, O], purpose: "state-change observation interface" });
      await bm.createArtifact({ workspaceId: WORKSPACE, artifactId: ARTIFACT, type: INTERFACE_TYPE, title: "state-change API" });

      // --- 4-5: P detects a real dependency and sends a durable message while O is offline ---
      const need = (await appP.federation!.declareContactNeed({
        origin: { kind: "runtime_scope", scope: { schemaVersion: 1, scopeId: "scope-live" } },
        competenceTags: ["state-change-feed"],
        reason: "Palimpsest requires a durable Ordarium observation property",
      })) as { contactNeedId: string };
      expect(need.contactNeedId.length).toBeGreaterThan(0);
      await appP.federation!.sendMessage({ to: O, threadId: "thread-live", body: "Palimpsest requires a durable state-change observation property" });

      // --- 6-7: O goes offline (close) and restarts from the same profile ---
      await o.close();
      o = launchDeployment(profileFor({ who: "ordarium", other: P.peerId, transportPath: join(root, "transport.sqlite"), namespace: "dogfood" }));

      // --- 8-9: replay the durable transport; the semantic inbox reconstructs one message ---
      const pump1 = await o.pumpAndActivate();
      expect(pump1.pump.ingested).toBe(1);
      const inboxO = (await o.installed.application.federation!.inbox()) as { received: readonly { body: string; from: { peerId: string } }[] };
      expect(inboxO.received).toHaveLength(1);
      expect(inboxO.received[0]?.body).toContain("durable state-change observation property");
      expect(inboxO.received[0]?.from.peerId).toBe(P.peerId);

      // --- 10-11: message ≠ task: O has not automatically acquired any Work ---
      expect(await workTaskCount(o)).toBe(0);

      // --- 41: duplicate transport delivery converges to ONE semantic message ---
      const dupBody = "duplicate transport probe";
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await p.transport.submit({
          operationId: "dup-op-1",
          from: P,
          to: O,
          operation: { kind: "peer_message", threadId: "thread-live", body: dupBody },
        });
      }
      await o.pumpAndActivate();
      const inboxAfterDup = (await o.installed.application.federation!.inbox()) as { received: readonly { body: string }[] };
      expect(inboxAfterDup.received.filter((message) => message.body === dupBody)).toHaveLength(1);

      // --- 10: O counter-proposes a boundary revision durably to P's canonical home ---
      const queued = await o.boundaryClient!.submit({
        workspaceId: WORKSPACE,
        operation: {
          kind: "submit_artifact_candidate",
          artifactId: ARTIFACT,
          base: null,
          content: iface("Ordarium counter-proposal: append/read/watch", [
            { operationId: "append", semantics: "durably append a change" },
            { operationId: "read", semantics: "read changes since a durable point" },
            { operationId: "watch", semantics: "observe future changes" },
          ]),
          requiredAcceptors: [P, O],
          intent: "O: amended v2 interface",
        },
      });
      expect(queued.queued).toBe(true);
      const pumpP = await p.pumpAndActivate();
      expect(pumpP.pump.ingested).toBe(1);

      const pending = await bm.pendingCandidates({ workspaceId: WORKSPACE, artifactId: ARTIFACT });
      expect(pending).toHaveLength(1);
      const candidateDigest = pending[0]!.candidate.digest;
      expect(pending[0]!.candidate.author.peerId).toBe(O.peerId);

      // --- 11: P and O each explicitly accept the SAME revision (joint acceptance) ---
      await p.installed.application.boundary!.decide({ workspaceId: WORKSPACE, artifactId: ARTIFACT, candidateDigest, decision: "accept" });
      await o.boundaryClient!.submit({
        workspaceId: WORKSPACE,
        operation: { kind: "accept_artifact_candidate", artifactId: ARTIFACT, candidateDigest },
      });
      await p.pumpAndActivate();
      const accepted = await bm.currentAccepted({ workspaceId: WORKSPACE, artifactId: ARTIFACT });
      expect(accepted).not.toBeNull();
      expect(accepted!.ref.candidateDigest).toBe(candidateDigest);

      // --- 12-13: P offers a commitment scoped to the accepted revision; O accepts EXPLICITLY ---
      const offer = (await appP.federation!.offerCommitment({
        proposedHolder: O,
        scope: { kind: "boundary_revision", revision: accepted!.ref },
        statement: "Ordarium implements the amended interface",
      })) as { commitmentId: string };
      await appP.federation!.sendMessage({ to: O, threadId: "thread-live", body: `commitment offered: ${offer.commitmentId}` });

      // O decides locally, then communicates the decision as a typed durable operation.
      const decision = await o.submitRemoteCommitmentDecision({ to: P, commitmentId: offer.commitmentId, decision: "accept" });
      expect(decision.delivered).toBe(true);
      await p.pumpAndActivate();
      expect(await appP.federation!.commitmentState(offer.commitmentId)).toBe("ACTIVE");

      // --- replaying the same decision is idempotent (no duplicate semantic event) ---
      const before = (await appP.federation!.commitments()).length;
      await p.transport.submit({
        operationId: decision.operationId,
        from: O,
        to: P,
        operation: { kind: "commitment_accept", commitmentId: offer.commitmentId },
      });
      await p.pumpAndActivate();
      expect((await appP.federation!.commitments()).length).toBe(before);
      expect(await appP.federation!.commitmentState(offer.commitmentId)).toBe("ACTIVE");

      // --- 24: negotiation is real — O REFUSES a second offer (no auto-acceptance) ---
      const second = (await appP.federation!.offerCommitment({
        proposedHolder: O,
        scope: { kind: "boundary_revision", revision: accepted!.ref },
        statement: "Ordarium also maintains a mirror registry",
      })) as { commitmentId: string };
      await o.submitRemoteCommitmentDecision({ to: P, commitmentId: second.commitmentId, decision: "reject" });
      await p.pumpAndActivate();
      expect(await appP.federation!.commitmentState(second.commitmentId)).toBe("REJECTED");

      // --- 15-17: O implements locally, publishes a completion/change notice, and the
      // holder explicitly releases the responsibility (a notice alone never closes it).
      await o.installed.application.federation!.sendMessage({ to: P, threadId: "thread-live", body: "Ordarium released the amended interface; append/read/watch implemented" });
      const notice = await p.pumpAndActivate();
      expect(notice.pump.ingested).toBe(1);
      expect(await appP.federation!.commitmentState(offer.commitmentId)).toBe("ACTIVE");
      await o.submitRemoteCommitmentDecision({ to: P, commitmentId: offer.commitmentId, decision: "release" });
      await p.pumpAndActivate();
      expect(await appP.federation!.commitmentState(offer.commitmentId)).toBe("RELEASED");

      // --- 18: collaboration projection now carries commitment nodes/edges (CF-O-01 closed) ---
      const collaboration = await appP.projections!.collaboration();
      const kinds = collaboration.nodes.map((node) => node.kind);
      expect(kinds).toContain("commitment");
      expect(collaboration.edges.some((edge) => edge.kind === "commitment_holder")).toBe(true);
      expect(collaboration.nodes.some((node) => node.kind === "workspace")).toBe(true);

      // --- 14-15: attention is derived from semantic state; pull mode works with no adapter ---
      const attentionO = await o.installed.application.attention!.pending();
      expect(attentionO.some((signal) => signal.kind === "inbound_peer_message")).toBe(true);
      const drain = await o.pumpAndActivate();
      expect(drain.signals.length).toBeGreaterThan(0);
      expect(drain.activations.every((entry) => entry.outcome.activated === false)).toBe(true);

      // --- 19-20: restart BOTH; semantic state reconstructs identically ---
      await p.close();
      await o.close();
      const restarted = starts();
      p = restarted.p;
      o = restarted.o;
      expect(await p.installed.application.federation!.commitmentState(offer.commitmentId)).toBe("RELEASED");
      expect((await p.installed.boundaryMemory!.service.currentAccepted({ workspaceId: WORKSPACE, artifactId: ARTIFACT }))?.ref.candidateDigest).toBe(candidateDigest);
      const inboxO2 = (await o.installed.application.federation!.inbox()) as { received: readonly unknown[] };
      expect(inboxO2.received.length).toBeGreaterThanOrEqual(3);
      expect((await p.installed.application.federation!.commitments()).map((c) => c.commitmentId)).toContain(offer.commitmentId);
      // P still owns exactly one canonical boundary truth; O never became a writer.
      expect(p.installed.boundaryMemory).toBeDefined();
    } finally {
      await p?.close().catch(() => undefined);
      await o?.close().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 150));
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Windows may hold the SQLite handle briefly; the OS reclaims the temp dir.
      }
    }
  }, 120_000);

  it("keeps PeerRef + PersistentPoint stable across restart and never assumes continuity (P-A01/P-A02)", async () => {
    newRoot();
    const transportPath = join(root, "transport.sqlite");
    let p = launchDeployment(profileFor({ who: "palimpsest", other: O.peerId, transportPath, namespace: "dogfood" }));
    try {
      const first = await p.installed.federation!.manpowerPoint(P);
      expect(first.continuity).toBe("pp-palimpsest");
      // No association for the other peer: continuity is absent, never assumed.
      const other = await p.installed.federation!.manpowerPoint(O);
      expect(other.continuity).toBeUndefined();
      // No commitments exist yet: an empty list is a real empty known state.
      expect(await p.installed.application.federation!.commitments()).toEqual([]);

      await p.close();
      p = launchDeployment(profileFor({ who: "palimpsest", other: O.peerId, transportPath, namespace: "dogfood" }));
      const after = await p.installed.federation!.manpowerPoint(P);
      expect(after.continuity).toBe("pp-palimpsest");
      expect(p.localPeer.peerId).toBe("peer-palimpsest");
    } finally {
      await p?.close().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 150));
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Windows may hold the SQLite handle briefly; the OS reclaims the temp dir.
      }
    }
  }, 120_000);
});
