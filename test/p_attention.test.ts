/**
 * G10-P attention + host activation machine proofs (P6/P7).
 *
 *   P-A05 notification ≠ activation        P-A25 user escalation is explicit
 *   P-A34 attention failure loses no semantic inbox state
 *   P-A35 pull mode works without an activation adapter
 *   Duplicate transport events do NOT multiply attention signals.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { SqliteCoordinationStore } from "../src/coordination/index.js";
import {
  callbackPeerTransportPort,
  makeCommitmentService,
  makeFederationMessagingService,
  materializePeerMessage,
  materializePeerRef,
  materializeThreadRef,
} from "../src/federation/index.js";
import type { PeerRef } from "../src/federation/index.js";
import {
  SqliteAttentionMarkStore,
  defaultAttentionPolicy,
  dshAgentsAttentionAdapter,
  makeAttentionService,
  nullAttentionAdapter,
  piAttentionAdapter,
  recordingAttentionAdapter,
  type AttentionPolicy,
  type BoundaryAttentionReadPort,
} from "../src/attention/index.js";

const LOCAL: PeerRef = materializePeerRef({ peerId: "peer-local" });
const REMOTE: PeerRef = materializePeerRef({ peerId: "peer-remote" });

function harness(policy: AttentionPolicy = defaultAttentionPolicy()) {
  const store = new SqliteCoordinationStore(":memory:");
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-p-attn-")), "ops.sqlite"),
    git: new FakeGitPort("a".repeat(40)),
  });
  const messaging = makeFederationMessagingService({
    effects,
    store,
    localPeer: LOCAL,
    allocateMessageId: () => `msg-${Math.random().toString(36).slice(2)}`,
    allocateWakeId: () => `wake-${Math.random().toString(36).slice(2)}`,
    transportPort: callbackPeerTransportPort("unused", {
      onSend: async () => ({ transportMessageId: "t", delivered: true }),
    }),
  });
  let commitmentCounter = 0;
  const commitments = makeCommitmentService({
    store,
    localPeer: LOCAL,
    allocateCommitmentId: () => `com-${++commitmentCounter}`,
    allocateHandoffId: () => "ho-1",
  });
  const marks = new SqliteAttentionMarkStore(":memory:");
  const service = makeAttentionService({
    localPeer: LOCAL,
    federation: {
      inbox: (peer) => messaging.inboxView(peer),
      commitments: () => commitments.listCommitments(),
    },
    marks,
    policy,
  });
  return { store, messaging, commitments, marks, service };
}

function inbound(transportMessageId: string, body = "hello") {
  return {
    transportMessageId,
    authenticatedPeer: REMOTE,
    message: materializePeerMessage({
      messageId: `m-${transportMessageId}`,
      thread: materializeThreadRef({ threadId: "thread-1" }),
      from: REMOTE,
      to: LOCAL,
      body,
    }),
  };
}

describe("G10-P attention derivation", () => {
  it("derives one inbound signal; duplicate semantic ingest does not multiply it", async () => {
    const { messaging, service } = harness();
    await messaging.recordInboundMessage(inbound("t1"));
    await messaging.recordInboundMessage(inbound("t1"));
    const pending = await service.pending();
    const inboundSignals = pending.filter((signal) => signal.kind === "inbound_peer_message");
    expect(inboundSignals).toHaveLength(1);
    expect(inboundSignals[0]!.peer.peerId).toBe(REMOTE.peerId);
  });

  it("drops the signal once the semantic fact is resolved (explicit ack)", async () => {
    const { messaging, service } = harness();
    const recorded = await messaging.recordInboundMessage(inbound("t2"));
    expect((await service.pending()).some((signal) => signal.kind === "inbound_peer_message")).toBe(true);
    await messaging.acknowledge({ message: recorded.message });
    expect((await service.pending()).some((signal) => signal.kind === "inbound_peer_message")).toBe(false);
  });

  it("raises a commitment-decision signal only for an OFFERED commitment held locally", async () => {
    const { commitments, service } = harness();
    const offer = await commitments.offerCommitment({
      proposedHolder: LOCAL,
      scope: { kind: "contact_need", contactNeedId: "need-1" },
      statement: "hold this responsibility",
    });
    expect((await service.pending()).some((signal) => signal.kind === "commitment_decision_required")).toBe(true);
    await commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: null, local: true });
    expect((await service.pending()).some((signal) => signal.kind === "commitment_decision_required")).toBe(false);
  });

  it("escalates only when the policy explicitly says so (never invented)", async () => {
    const plain = harness();
    await plain.messaging.recordInboundMessage(inbound("t3"));
    expect((await plain.service.pending()).every((signal) => signal.requiresUserAttention === false)).toBe(true);

    const escalating = harness({
      policyId: "escalate-all",
      cooldownMs: 0,
      escalate: (candidate) => candidate.kind === "inbound_peer_message",
    });
    await escalating.messaging.recordInboundMessage(inbound("t4"));
    expect(
      (await escalating.service.pending()).find((signal) => signal.kind === "inbound_peer_message")?.requiresUserAttention,
    ).toBe(true);
  });

  it("coalesces re-delivery within the cooldown and never re-delivers a marked signal", async () => {
    const { messaging, service } = harness({ policyId: "coalesce", cooldownMs: 60_000 });
    await messaging.recordInboundMessage(inbound("t5"));
    const first = await service.drain();
    expect(first).toHaveLength(1);
    // Within the cooldown window the same coalescing key is suppressed.
    expect(await service.drain()).toHaveLength(0);
    // Once marked delivered, even after the window the exact signal is not re-delivered.
    await service.markDelivered([first[0]!.signalId]);
    expect(await service.drain()).toHaveLength(0);
    // The underlying semantic fact is still visible in the full pending derivation.
    expect((await service.pending()).length).toBe(1);
  });

  it("derives boundary decision and accepted-revision signals from the read port", async () => {
    const { messaging, commitments, marks } = harness();
    const boundary: BoundaryAttentionReadPort = {
      pendingDecisionsFor: async () => [
        { workspaceId: "ws-1", artifactId: "api", candidateDigest: "c".repeat(64), author: REMOTE, intent: "propose" },
      ],
      acceptedHeadsFor: async () => [
        { workspaceId: "ws-1", artifactId: "api", acceptedRevision: 0, candidateDigest: "d".repeat(64), revisionDigest: "e".repeat(64), author: REMOTE },
      ],
    };
    const service = makeAttentionService({
      localPeer: LOCAL,
      federation: {
        inbox: (peer) => messaging.inboxView(peer),
        commitments: () => commitments.listCommitments(),
      },
      boundary,
      marks,
      policy: defaultAttentionPolicy(),
    });
    const pending = await service.pending();
    expect(pending.some((signal) => signal.kind === "boundary_decision_required")).toBe(true);
    const accepted = pending.find((signal) => signal.kind === "boundary_revision_accepted");
    expect(accepted).toBeDefined();
    await service.markDelivered([accepted!.signalId]);
    // The accepted-revision mark is persisted, so a restart does not re-signal it.
    expect((await service.pending()).some((signal) => signal.kind === "boundary_revision_accepted")).toBe(false);
  });
});

describe("G10-P host activation adapters", () => {
  it("DSH adapter wakes a resident agent through the documented followup path", async () => {
    const delivered: string[] = [];
    const adapter = dshAgentsAttentionAdapter({
      agents: { get: () => ({ followup: (message: string) => delivered.push(message) }) },
      resumeSessionId: "session-1",
    });
    const outcome = await adapter.activate({
      schemaVersion: 1,
      signalId: "s1",
      kind: "inbound_peer_message",
      peer: REMOTE,
      subjects: [],
      reason: "a message awaits attention",
      requiresUserAttention: false,
      createdAt: "2026-09-14T00:00:00.000Z",
    });
    expect(outcome.activated).toBe(true);
    expect(delivered).toHaveLength(1);
  });

  it("DSH adapter cold-resumes a persisted session when no agent is resident", async () => {
    const delivered: string[] = [];
    const adapter = dshAgentsAttentionAdapter({
      agents: {
        resume: async () => ({ agent: { followup: (message: string) => delivered.push(message) } }),
      },
      resumeSessionId: "session-cold",
    });
    const outcome = await adapter.activate({
      schemaVersion: 1,
      signalId: "s2",
      kind: "commitment_decision_required",
      peer: REMOTE,
      subjects: [],
      reason: "decide",
      requiresUserAttention: false,
      createdAt: "2026-09-14T00:00:00.000Z",
    });
    expect(outcome.activated).toBe(true);
    expect(delivered).toHaveLength(1);
  });

  it("never throws: a host failure returns activated:false so the inbox is not lost", async () => {
    const dsh = dshAgentsAttentionAdapter({
      agents: {
        get: () => ({
          followup: () => {
            throw new Error("host exploded");
          },
        }),
      },
      resumeSessionId: "session-err",
    });
    const outcome = await dsh.activate({
      schemaVersion: 1,
      signalId: "s3",
      kind: "inbound_peer_message",
      peer: REMOTE,
      subjects: [],
      reason: "x",
      requiresUserAttention: false,
      createdAt: "2026-09-14T00:00:00.000Z",
    });
    expect(outcome.activated).toBe(false);
    expect(outcome.detail).toContain("host exploded");
  });

  it("Pi adapter uses the documented triggerTurn wake primitive", async () => {
    const calls: unknown[] = [];
    const adapter = piAttentionAdapter({ pi: { sendMessage: (message, options) => calls.push({ message, options }) } });
    const outcome = await adapter.activate({
      schemaVersion: 1,
      signalId: "s4",
      kind: "inbound_peer_message",
      peer: REMOTE,
      subjects: [],
      reason: "y",
      requiresUserAttention: false,
      createdAt: "2026-09-14T00:00:00.000Z",
    });
    expect(outcome.activated).toBe(true);
    expect(calls[0]).toMatchObject({ options: { deliverAs: "followUp", triggerTurn: true } });
  });

  it("null/recording adapters reflect pull mode and test capture", async () => {
    expect((await nullAttentionAdapter().activate({} as never)).activated).toBe(false);
    const recorder = recordingAttentionAdapter();
    await recorder.activate({ signalId: "s5" } as never);
    expect(recorder.activated).toHaveLength(1);
  });
});
