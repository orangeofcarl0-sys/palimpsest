/**
 * G10-Q production remote-submission path (CI-deterministic).
 *
 * The real-host dogfood exposed that G10-P only let the HARNESS submit remote boundary mutations
 * and commitment decisions. G10-Q exposes those through the application surface + product tools so
 * an agent can act as a non-home peer:
 *
 *   boundary.submitRemote       → typed boundary mutation to the workspace's canonical home
 *   federation.submitRemoteDecision → this peer's explicit commitment decision to the owner
 *
 *   ApplicationSurface ≠ CanonicalStore     tool call ≠ caller-supplied identity
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { launchDeployment, type Deployment } from "../src/deployment/index.js";
import type { ProjectAgentDeploymentProfile } from "../src/deployment/index.js";
import { defineApplicationTools } from "../src/tools/application_tools.js";
import { materializePeerRef, type PeerRef } from "../src/federation/index.js";

const P: PeerRef = materializePeerRef({ peerId: "peer-palimpsest" });
const O: PeerRef = materializePeerRef({ peerId: "peer-ordarium" });
const WORKSPACE = "ws-q";
const ARTIFACT = "api";
const INTERFACE = { typeId: "boundary.interface", version: "v1" };
const iface = (description: string): unknown => ({
  interfaceId: "state-change-observation",
  description,
  operations: [{ operationId: "observe", semantics: "read changes since a durable point" }],
  references: [],
});

let root = "";

function profileFor(who: "palimpsest" | "ordarium", transportPath: string): ProjectAgentDeploymentProfile {
  const dir = join(root, who);
  return {
    schemaVersion: 1,
    profileId: `q-${who}`,
    projectId: who,
    localPeer: `peer-${who}`,
    persistentPoint: `pp-${who}`,
    transport: { namespace: "q-test", databasePath: transportPath },
    databases: {
      orchestration: join(dir, "palimpsest.sqlite"),
      ordarium: join(dir, "ops.sqlite"),
      coordination: join(dir, "coordination.sqlite"),
      transportCursors: join(dir, "cursors.sqlite"),
      boundaryMemory: join(dir, "boundary.sqlite"),
      runtimeScope: join(dir, "runtime.sqlite"),
      attentionMarks: join(dir, "attention.sqlite"),
    },
    attention: { policyId: "q-attention", cooldownMs: 0, activation: "none" },
    boundaryHomeId: "home-peer-palimpsest",
    boundaryRoutes: { [WORKSPACE]: "home-peer-palimpsest" },
  };
}

describe("G10-Q remote submission through the application surface", () => {
  it("lets a non-home peer counter-propose, and the owner accept, through product tools only", async () => {
    root = mkdtempSync(join(tmpdir(), "palimpsest-q-remote-"));
    const transportPath = join(root, "transport.sqlite");
    let p: Deployment | undefined;
    let o: Deployment | undefined;
    try {
      p = launchDeployment(profileFor("palimpsest", transportPath));
      o = launchDeployment(profileFor("ordarium", transportPath));
      const appP = p.installed.application;
      const appO = o.installed.application;

      // The application surfaces expose the remote-submission capabilities.
      expect(appO.boundary?.submitRemote).toBeTypeOf("function");
      expect(appO.federation?.submitRemoteDecision).toBeTypeOf("function");

      await appP.boundary!.view; // surface exists
      const bm = p.installed.boundaryMemory!.service;
      await bm.openWorkspace({ workspaceId: WORKSPACE, participants: [P, O], purpose: "consumption contract" });
      await bm.createArtifact({ workspaceId: WORKSPACE, artifactId: ARTIFACT, type: INTERFACE, title: "contract" });

      // O (non-home) counter-proposes through its own product tool — not the harness transport.
      const queued = (await appO.boundary!.submitRemote!({
        workspaceId: WORKSPACE,
        operation: {
          kind: "submit_artifact_candidate",
          artifactId: ARTIFACT,
          base: null,
          content: iface("Ordarium amended contract"),
          requiredAcceptors: [P],
          intent: "O counter-proposal",
        },
      })) as { queued: boolean; operationId: string };
      expect(queued.queued).toBe(true);

      const pump = await p.pumpAndActivate();
      expect(pump.pump.ingested).toBe(1);
      const pending = await bm.pendingCandidates({ workspaceId: WORKSPACE, artifactId: ARTIFACT });
      expect(pending).toHaveLength(1);
      expect(pending[0]!.candidate.author.peerId).toBe(O.peerId);
      const candidateDigest = pending[0]!.candidate.digest;

      // P (the canonical home) accepts its required revision.
      await appP.boundary!.decide({ workspaceId: WORKSPACE, artifactId: ARTIFACT, candidateDigest, decision: "accept" });
      const accepted = await bm.currentAccepted({ workspaceId: WORKSPACE, artifactId: ARTIFACT });
      expect(accepted).not.toBeNull();

      // P offers a real commitment scoped to the accepted revision.
      const offer = (await appP.federation!.offerCommitment({
        proposedHolder: O,
        scope: { kind: "boundary_revision", revision: accepted!.ref },
        statement: "Ordarium maintains the amended consumption contract",
      })) as { commitmentId: string };

      // O decides EXPLICITLY and communicates the typed decision to the owner.
      const decision = (await appO.federation!.submitRemoteDecision!({
        to: P,
        commitmentId: offer.commitmentId,
        decision: "accept",
      })) as { operationId: string; delivered: boolean };
      expect(decision.delivered).toBe(true);
      await p.pumpAndActivate();
      expect(await appP.federation!.commitmentState(offer.commitmentId)).toBe("ACTIVE");
      expect((await appP.federation!.commitments()).find((c) => c.commitmentId === offer.commitmentId)?.state).toBe("ACTIVE");

      // Duplicate attention / redelivery must NOT duplicate the semantic decision (CF-P-05 CLOSED_IN_Q):
      // replaying the identical operationId converges to the same single ACTIVE commitment.
      const before = (await appP.federation!.commitments()).length;
      await o.transport.submit({
        operationId: decision.operationId,
        from: O,
        to: P,
        operation: { kind: "commitment_accept", commitmentId: offer.commitmentId },
      });
      await p.pumpAndActivate();
      expect((await appP.federation!.commitments()).length).toBe(before);
      expect(await appP.federation!.commitmentState(offer.commitmentId)).toBe("ACTIVE");

      // A message/commitment never creates remote Work.
      const work = await o.installed.application.projections!.work();
      expect(work.nodes.filter((node) => node.kind === "task")).toHaveLength(0);
    } finally {
      await p?.close().catch(() => undefined);
      await o?.close().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 120));
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* windows handle lag */
      }
    }
  }, 120_000);

  it("exposes the remote actions in tool schemas and never accepts caller-supplied identity", async () => {
    root = mkdtempSync(join(tmpdir(), "palimpsest-q-tools-"));
    let p: Deployment | undefined;
    try {
      p = launchDeployment(profileFor("palimpsest", join(root, "transport.sqlite")));
      const tools = defineApplicationTools(p.installed.application);
      const federation = tools.find((tool) => tool.name === "palimpsest_federation")!;
      const boundary = tools.find((tool) => tool.name === "palimpsest_boundary")!;
      expect(federation).toBeDefined();
      expect(boundary).toBeDefined();
      expect((federation as unknown as { parameters: { properties: Record<string, unknown> } }).parameters.properties).not.toHaveProperty("from");
      // The action enums carry the remote-submission verbs.
      const actionsOf = (tool: unknown): readonly string[] =>
        ((tool as { parameters: { properties: { action: { enum: readonly string[] } } } }).parameters.properties.action.enum);
      expect(actionsOf(federation)).toContain("remote_decision");
      expect(actionsOf(boundary)).toContain("submit_remote");
      // No tool exposes authority-bearing identity fields.
      for (const tool of tools) {
        const properties = (tool as unknown as { parameters: { properties: Record<string, unknown> } }).parameters.properties;
        for (const forbidden of ["from", "acceptedBy", "localPeer", "authenticated", "authorized", "admissionDecision", "verificationResult"]) {
          expect(properties).not.toHaveProperty(forbidden);
        }
      }
    } finally {
      await p?.close().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 120));
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* windows handle lag */
      }
    }
  }, 120_000);
});
