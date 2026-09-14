#!/usr/bin/env node
/**
 * G10-P live two-peer dogfood runner.
 *
 * Starts TWO separately configured persistent project peers (Palimpsest/Main and
 * Ordarium/Main archetype) over one shared durable transport ledger, drives the
 * §69 golden path with real stores/services, and emits a structured operational
 * evidence timeline (NONCANONICAL telemetry for the future Empirical stage).
 *
 *   node scripts/dogfood/live-federation.mjs [--out <path>]
 *
 * Run after `pnpm run build` (imports dist/src).
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

import { launchDeployment } from "../../dist/src/deployment/index.js";
import { materializePeerRef } from "../../dist/src/federation/index.js";

const P = materializePeerRef({ peerId: "peer-palimpsest" });
const O = materializePeerRef({ peerId: "peer-ordarium" });
const WORKSPACE = "ws-live";
const ARTIFACT = "api";
const INTERFACE_TYPE = { typeId: "boundary.interface", version: "v1" };
const iface = (description, operations) => ({ interfaceId: "state-change-observation", description, operations, references: [] });

const startedAt = Date.now();
const timeline = [];
const metrics = {
  messageLatencyMs: null,
  boundaryDecisionLatencyMs: null,
  commitmentLifecycleMs: null,
  duplicateTransportDeliveries: 0,
  duplicateSemanticMessages: 0,
  restarts: 0,
  wakeSignalsDrained: 0,
  activationAttempts: 0,
  userInterventions: 0,
  failures: 0,
};

function at() {
  return Date.now() - startedAt;
}
function record(event, detail = {}) {
  timeline.push({ atMs: at(), event, detail });
}

function profileFor({ who, other, transportPath, root }) {
  const dir = join(root, who);
  return {
    schemaVersion: 1,
    profileId: `deploy-${who}`,
    projectId: who,
    localPeer: `peer-${who}`,
    persistentPoint: `pp-${who}`,
    transport: { namespace: "dogfood", databasePath: transportPath },
    databases: {
      orchestration: join(dir, "palimpsest.sqlite"),
      ordarium: join(dir, "ops.sqlite"),
      coordination: join(dir, "coordination.sqlite"),
      transportCursors: join(dir, "cursors.sqlite"),
      boundaryMemory: join(dir, "boundary.sqlite"),
      runtimeScope: join(dir, "runtime.sqlite"),
      attentionMarks: join(dir, "attention.sqlite"),
    },
    directory: [{ peerId: other, competenceTags: ["state-change-feed"] }],
    attention: { policyId: "dogfood-attention-v1", cooldownMs: 0, activation: "none" },
    boundaryHomeId: `home-peer-${who}`,
    boundaryRoutes: { [WORKSPACE]: "home-peer-palimpsest" },
  };
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-dogfood-"));
  const transportPath = join(root, "transport.sqlite");
  let p = launchDeployment(profileFor({ who: "palimpsest", other: O.peerId, transportPath, root }));
  let o = launchDeployment(profileFor({ who: "ordarium", other: P.peerId, transportPath, root }));
  try {
    record("peer_p_started", { localPeer: P.peerId, persistentPoint: "pp-palimpsest" });
    record("peer_o_started", { localPeer: O.peerId, persistentPoint: "pp-ordarium" });

    const bm = p.installed.boundaryMemory.service;
    await bm.openWorkspace({ workspaceId: WORKSPACE, participants: [P, O], purpose: "state-change observation interface" });
    await bm.createArtifact({ workspaceId: WORKSPACE, artifactId: ARTIFACT, type: INTERFACE_TYPE, title: "state-change API" });
    record("boundary_workspace_opened", { workspaceId: WORKSPACE, participants: [P.peerId, O.peerId] });

    // 4-5: P detects a dependency and sends durable work while O is offline.
    const need = await p.installed.application.federation.declareContactNeed({
      origin: { kind: "runtime_scope", scope: { schemaVersion: 1, scopeId: "scope-live" } },
      competenceTags: ["state-change-feed"],
      reason: "requires a durable observation property",
    });
    const sentAtMs = Date.now();
    await p.installed.application.federation.sendMessage({
      to: O,
      threadId: "thread-live",
      body: "Palimpsest requires a durable state-change observation property",
    });
    record("durable_message_sent", { contactNeedId: need.contactNeedId, to: O.peerId });

    // 6-8: stop O before ingest, restart, replay.
    await o.close();
    record("peer_o_stopped_before_ingest", {});
    o = launchDeployment(profileFor({ who: "ordarium", other: P.peerId, transportPath, root }));
    metrics.restarts += 1;
    record("peer_o_restarted", {});
    const pump1 = await o.pumpAndActivate();
    metrics.messageLatencyMs = Date.now() - sentAtMs;
    record("durable_replay_ingested", { ingested: pump1.pump.ingested, semanticLatencyMs: metrics.messageLatencyMs });
    const inbox = await o.installed.application.federation.inbox();
    assert.equal(inbox.received.length, 1, "offline peer must receive exactly one durable message");
    record("semantic_inbox_reconstructed", { received: inbox.received.length });

    // 41: duplicate transport delivery.
    for (let i = 0; i < 2; i += 1) {
      await p.transport.submit({
        operationId: "dup-op-1",
        from: P,
        to: O,
        operation: { kind: "peer_message", threadId: "thread-live", body: "duplicate probe" },
      });
      metrics.duplicateTransportDeliveries += 1;
    }
    await o.pumpAndActivate();
    const inboxAfter = await o.installed.application.federation.inbox();
    metrics.duplicateSemanticMessages = inboxAfter.received.filter((m) => m.body === "duplicate probe").length;
    assert.equal(metrics.duplicateSemanticMessages, 1, "duplicate delivery must converge to one semantic message");
    record("duplicate_delivery_converged", { semanticMessages: metrics.duplicateSemanticMessages });

    // 10-11: counter-proposal + joint acceptance.
    const boundaryStart = Date.now();
    await o.boundaryClient.submit({
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
    await p.pumpAndActivate();
    record("boundary_candidate_submitted", { by: O.peerId });
    const pending = await bm.pendingCandidates({ workspaceId: WORKSPACE, artifactId: ARTIFACT });
    assert.equal(pending.length, 1, "the canonical home must hold exactly one pending candidate");
    const candidateDigest = pending[0].candidate.digest;
    await p.installed.application.boundary.decide({ workspaceId: WORKSPACE, artifactId: ARTIFACT, candidateDigest, decision: "accept" });
    await o.boundaryClient.submit({ workspaceId: WORKSPACE, operation: { kind: "accept_artifact_candidate", artifactId: ARTIFACT, candidateDigest } });
    await p.pumpAndActivate();
    const accepted = await bm.currentAccepted({ workspaceId: WORKSPACE, artifactId: ARTIFACT });
    assert.ok(accepted, "joint acceptance must produce an accepted revision");
    metrics.boundaryDecisionLatencyMs = Date.now() - boundaryStart;
    record("boundary_revision_accepted", { candidateDigest, latencyMs: metrics.boundaryDecisionLatencyMs });

    // 12-13: explicit commitment (offer by P, accept by O).
    const commitmentStart = Date.now();
    const offer = await p.installed.application.federation.offerCommitment({
      proposedHolder: O,
      scope: { kind: "boundary_revision", revision: accepted.ref },
      statement: "Ordarium implements the amended interface",
    });
    await p.installed.application.federation.sendMessage({ to: O, threadId: "thread-live", body: `commitment offered: ${offer.commitmentId}` });
    await o.submitRemoteCommitmentDecision({ to: P, commitmentId: offer.commitmentId, decision: "accept" });
    await p.pumpAndActivate();
    const state = await p.installed.application.federation.commitmentState(offer.commitmentId);
    assert.equal(state, "ACTIVE", "the holder's explicit acceptance must activate the commitment");
    metrics.commitmentLifecycleMs = Date.now() - commitmentStart;
    record("commitment_activated", { commitmentId: offer.commitmentId, latencyMs: metrics.commitmentLifecycleMs });

    // 24: refusal path (no auto-acceptance).
    const second = await p.installed.application.federation.offerCommitment({
      proposedHolder: O,
      scope: { kind: "boundary_revision", revision: accepted.ref },
      statement: "Ordarium also maintains a mirror registry",
    });
    await o.submitRemoteCommitmentDecision({ to: P, commitmentId: second.commitmentId, decision: "reject" });
    await p.pumpAndActivate();
    assert.equal(await p.installed.application.federation.commitmentState(second.commitmentId), "REJECTED");
    record("commitment_refused", { commitmentId: second.commitmentId });

    // 15-17: O implements locally, publishes a completion/change notice, then the
    // holder explicitly releases the responsibility (a notice alone never closes it).
    await o.installed.application.federation.sendMessage({
      to: P,
      threadId: "thread-live",
      body: "Ordarium released the amended interface; append/read/watch implemented",
    });
    const noticePump = await p.pumpAndActivate();
    record("completion_notice_observed", { ingested: noticePump.pump.ingested });
    assert.equal(
      await p.installed.application.federation.commitmentState(offer.commitmentId),
      "ACTIVE",
      "a change notice must not close a commitment",
    );
    await o.submitRemoteCommitmentDecision({ to: P, commitmentId: offer.commitmentId, decision: "release" });
    await p.pumpAndActivate();
    assert.equal(await p.installed.application.federation.commitmentState(offer.commitmentId), "RELEASED");
    record("commitment_released", { commitmentId: offer.commitmentId });

    // 18: collaboration graph carries peers + workspace + commitments.
    const collaboration = await p.installed.application.projections.collaboration();
    record("collaboration_projection", {
      peers: collaboration.nodes.filter((n) => n.kind === "peer").length,
      workspaces: collaboration.nodes.filter((n) => n.kind === "workspace").length,
      commitments: collaboration.nodes.filter((n) => n.kind === "commitment").length,
    });

    // 14-15: attention derivation + pull mode (no activation adapter).
    const pendingAttention = await o.installed.application.attention.pending();
    const drained = await o.pumpAndActivate();
    metrics.wakeSignalsDrained += drained.signals.length;
    metrics.activationAttempts += drained.activations.length;
    record("attention_derived", {
      pending: pendingAttention.length,
      drained: drained.signals.length,
      activationAdapter: "none (pull mode)",
    });

    // 19-20: restart BOTH and confirm semantic reconstruction.
    await p.close();
    await o.close();
    p = launchDeployment(profileFor({ who: "palimpsest", other: O.peerId, transportPath, root }));
    o = launchDeployment(profileFor({ who: "ordarium", other: P.peerId, transportPath, root }));
    metrics.restarts += 2;
    assert.equal(await p.installed.application.federation.commitmentState(offer.commitmentId), "RELEASED");
    assert.equal((await p.installed.boundaryMemory.service.currentAccepted({ workspaceId: WORKSPACE, artifactId: ARTIFACT })).ref.candidateDigest, candidateDigest);
    record("both_restarted_state_reconstructed", { commitment: "RELEASED", acceptedRevision: candidateDigest.slice(0, 12) });

    record("run_completed", { userInterventions: metrics.userInterventions });
    return { ordarium: "v1.3.1", peers: { p: P.peerId, o: O.peerId }, timeline, metrics, result: "PASS" };
  } catch (error) {
    metrics.failures += 1;
    record("run_failed", { error: error instanceof Error ? error.message : String(error) });
    return { ordarium: "v1.3.1", timeline, metrics, result: "FAIL" };
  } finally {
    await p?.close().catch(() => undefined);
    await o?.close().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows may hold the SQLite handle briefly.
    }
  }
}

const outIndex = process.argv.indexOf("--out");
const evidence = await main();
const json = JSON.stringify(evidence, null, 2);
if (outIndex >= 0 && process.argv[outIndex + 1] !== undefined) {
  writeFileSync(process.argv[outIndex + 1], json, "utf8");
}
console.log(json);
process.exitCode = evidence.result === "PASS" ? 0 : 1;
