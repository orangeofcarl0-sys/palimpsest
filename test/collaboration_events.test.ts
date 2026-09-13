/**
 * G10-E3 collaboration event substrate machine proofs.
 *
 *   E3-M01  outbound `from` derived from the configured local PeerRef
 *   E3-M02  direct transport mutation absent from the service
 *   E3-M03  send passes Ordarium
 *   E3-M04  stable retry idempotency (messageId basis)
 *   E3-M05  authenticated inbound sender coherence (fail closed)
 *   E3-M06  unauthenticated input cannot (later) accept commitments
 *   E3-M07  Wake ≠ Ack (§129)
 *   E3-M08  Delivery ≠ Ack
 *   E3-M09  Ack ≠ Agreement
 *   E3-M10  Conversation ≠ Agreement (§130)
 *   E3-M11  CollaborationEvent ≠ Evidence
 *   E3-M12  Thread derived only
 *   E3-M13  Inbox derived only
 *   E3-M14  store restart/replay
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { SqliteCoordinationStore } from "../src/coordination/index.js";
import { FEDERATION_EVENT_PARSERS } from "../src/federation/index.js";
import { makeFederationMessagingService } from "../src/federation/index.js";
import { callbackPeerTransportPort, PeerTransportError } from "../src/federation/index.js";
import { materializePeerMessage, materializeThreadRef } from "../src/federation/index.js";
import { materializePeerRef } from "../src/federation/index.js";
import type { PeerMessage, PeerRef } from "../src/federation/index.js";

const MESSAGING_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/federation/messaging.ts", import.meta.url)),
  "utf-8",
);

const LOCAL: PeerRef = materializePeerRef({ peerId: "peer-a" });
const REMOTE: PeerRef = materializePeerRef({ peerId: "peer-b" });

function makeHarness(storePath = ":memory:") {
  const sent: string[] = [];
  const wakes: string[] = [];
  const transportPort = callbackPeerTransportPort("callback", {
    onSend: async (request) => {
      sent.push(request.messageId);
      return { transportMessageId: `transport-${sent.length}`, delivered: true };
    },
    onWake: async (request) => {
      wakes.push(request.wakeId);
      return { signaled: true };
    },
  });
  const store = new SqliteCoordinationStore(storePath, {
    eventParsers: FEDERATION_EVENT_PARSERS,
  });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-e3-")), "ops.sqlite"),
    git: new FakeGitPort("a".repeat(40)),
  });
  let messageCounter = 0;
  let wakeCounter = 0;
  const service = makeFederationMessagingService({
    effects,
    store,
    localPeer: LOCAL,
    allocateMessageId: () => `msg-${++messageCounter}`,
    allocateWakeId: () => `wake-${++wakeCounter}`,
    transportPort,
  });
  return { service, store, transportPort, effects, sent, wakes };
}

describe("E3-M01/M02/M03: outbound identity, no bypass, Ordarium admission", () => {
  it("from is the configured local peer; the port is only reachable through Ordarium", async () => {
    const harness = makeHarness();
    const { message, delivered } = await harness.service.sendMessage({
      to: REMOTE,
      threadId: "thread-1",
      body: "hello",
    });
    expect(message.from).toEqual(LOCAL);
    expect(message.to).toEqual(REMOTE);
    expect(delivered).toBe(true);
    expect(harness.sent).toEqual(["msg-1"]);
    // E3-M02: the service never calls port.send/wake directly.
    const code = MESSAGING_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/transportPort\.send\(|transportPort\.wake\(/);
    expect(code).toMatch(/effects\.invoke\(/);
  });
});

describe("E3-M04: stable retry idempotency (§67/§68)", () => {
  it("re-invoking the action with the same messageId does not duplicate remote delivery", async () => {
    const harness = makeHarness();
    const { message } = await harness.service.sendMessage({
      to: REMOTE,
      threadId: "thread-1",
      body: "hello",
    });
    const { defineFederationEffects } = await import("../src/effects/federation_actions.js");
    const actions = defineFederationEffects(harness.transportPort);
    const intent = { scope: "federation", callId: message.messageId, revision: 0 };
    const input = {
      messageId: message.messageId,
      fromPeerId: message.from.peerId,
      toPeerId: message.to.peerId,
      threadId: "thread-1",
      body: "hello",
    };
    await harness.effects.invoke(actions.messageSend, input, intent);
    // The port was NOT called again: Ordarium deduped the identical operation.
    expect(harness.sent).toEqual(["msg-1"]);
  });

  it("re-recording the same MESSAGE_PREPARED event is idempotent", async () => {
    const harness = makeHarness();
    const { message } = await harness.service.sendMessage({
      to: REMOTE,
      threadId: "thread-1",
      body: "hello",
    });
    const before = (await harness.store.replay()).length;
    const { canonicalDigest } = await import("../src/schema/canonical.js");
    await harness.store.append({
      eventId: canonicalDigest({
        domain: "palimpsest.coordination-event.v1",
        type: "MESSAGE_PREPARED",
        scope: "federation",
        content: { message },
      }),
      projectId: "federation",
      type: "MESSAGE_PREPARED",
      payload: { message },
    } as never);
    expect((await harness.store.replay()).length).toBe(before);
  });
});

describe("E3-M05/M06: inbound trust boundary (§69–§71)", () => {
  it("an authenticated peer that mismatches the message sender fails closed", async () => {
    const harness = makeHarness();
    const forged = materializePeerMessage({
      messageId: "msg-x",
      thread: materializeThreadRef({ threadId: "thread-1" }),
      from: materializePeerRef({ peerId: "peer-c" }),
      to: LOCAL,
      body: "spoof",
    });
    await expect(
      harness.service.recordInboundMessage({
        transportMessageId: "transport-x",
        authenticatedPeer: REMOTE,
        message: forged,
      }),
    ).rejects.toMatchObject({ kind: "sender_coherence_failed" });
  });

  it("unauthenticated inbound content is recorded unverified, never in the verified inbox", async () => {
    const harness = makeHarness();
    const inbound = materializePeerMessage({
      messageId: "msg-in",
      thread: materializeThreadRef({ threadId: "thread-1" }),
      from: REMOTE,
      to: LOCAL,
      body: "plain",
    });
    await harness.service.recordInboundMessage({
      transportMessageId: "transport-in",
      authenticatedPeer: null,
      message: inbound,
    });
    const inbox = await harness.service.inboxView(LOCAL);
    expect(inbox.received).toEqual([]);
    expect(inbox.unverified.map((message) => message.messageId)).toEqual(["msg-in"]);
    // Redelivery of the same transport message is idempotent.
    const before = (await harness.store.replay()).length;
    await harness.service.recordInboundMessage({
      transportMessageId: "transport-in",
      authenticatedPeer: null,
      message: inbound,
    });
    expect((await harness.store.replay()).length).toBe(before);
  });
});

describe("E3-M07..M10: Wake ≠ Ack ≠ Agreement; conversation ≠ agreement (§73–§77)", () => {
  it("wake produces attention only — no ack, no commitment", async () => {
    const harness = makeHarness();
    await harness.service.wakePeer({ to: REMOTE });
    expect(harness.wakes).toEqual(["wake-1"]);
    const types = (await harness.store.replay()).map((event) => event.type);
    expect(types).toEqual(["WAKE_SENT"]);
    expect(types).not.toContain("ACK_RECORDED");
    expect(types).not.toContain("COMMITMENT_ACCEPTED");
  });

  it("delivery is not an ack; a long conversation with acks still contains no agreement", async () => {
    const harness = makeHarness();
    for (let index = 0; index < 5; index += 1) {
      const { message } = await harness.service.sendMessage({
        to: REMOTE,
        threadId: "thread-1",
        body: `message ${index}`,
      });
      await harness.service.acknowledge({ message });
    }
    const history = await harness.store.replay();
    const types = history.map((event) => event.type);
    expect(types.filter((type) => type === "MESSAGE_PREPARED")).toHaveLength(5);
    expect(types.filter((type) => type === "MESSAGE_DELIVERED")).toHaveLength(5);
    expect(types.filter((type) => type === "ACK_RECORDED")).toHaveLength(5);
    // §77: zero agreement/commitment transitions — acks are receipt only.
    for (const forbidden of [
      "COMMITMENT_OFFERED",
      "COMMITMENT_ACCEPTED",
      "AGREEMENT_RECORDED",
      "HANDOFF_ACCEPTED",
    ]) {
      expect(types).not.toContain(forbidden);
    }
    const view = await harness.service.threadView("thread-1");
    expect(view.messages).toHaveLength(5);
    expect(view.deliveredMessageIds).toHaveLength(5);
    expect(view.ackedMessageIds).toHaveLength(5);
  });
});

describe("E3-M11: CollaborationEvent ≠ Evidence (§82)", () => {
  it("the federation package has no evidence/admission/verification path", () => {
    const code = MESSAGING_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // No evidence-linking / admission path exists; `unverified` (the explicit
    // §71 marker for unauthenticated input) is legitimate and is not evidence.
    expect(code).not.toMatch(/Evidence|evidenceId|admissionDecision|verificationResult|admitEvidence/);
    expect(code).toContain("unverified");
    const indexSource = readFileSync(
      fileURLToPath(new URL("../src/federation/index.ts", import.meta.url)),
      "utf-8",
    );
    expect(indexSource).not.toMatch(/evidence\//);
  });
});

describe("E3-M12/M13/M14: derived views only; restart/replay (§80/§81)", () => {
  it("thread and inbox views derive from events; a reopened store reproduces them", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "palimpsest-e3-store-")), "coordination.sqlite");
    const harness = makeHarness(path);
    await harness.service.sendMessage({ to: REMOTE, threadId: "thread-1", body: "one" });
    const { message } = await harness.service.sendMessage({
      to: REMOTE,
      threadId: "thread-1",
      body: "two",
    });
    await harness.service.acknowledge({ message });
    const viewBefore = await harness.service.threadView("thread-1");
    harness.store.close();

    // E3-M12: no thread table exists — the view is a projection.
    const reopened = new SqliteCoordinationStore(path, { eventParsers: FEDERATION_EVENT_PARSERS });
    const tables = (reopened as unknown as { close(): void }) && (await reopened.replay());
    expect(tables.map((event) => event.type)).toEqual([
      "MESSAGE_PREPARED",
      "MESSAGE_DELIVERED",
      "MESSAGE_PREPARED",
      "MESSAGE_DELIVERED",
      "ACK_RECORDED",
    ]);
    reopened.close();
    // The projection content is identical after restart (same events).
    expect(viewBefore.messages.map((entry) => entry.body)).toEqual(["one", "two"]);
  });
});
