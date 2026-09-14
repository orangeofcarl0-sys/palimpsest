/**
 * G10-P durable transport machine proofs (P4/P5).
 *
 *   P-A03 TransportTruth ≠ CollaborationTruth   P-A04 StateChangeFeed event ≠ PeerMessage
 *   P-A11 at-least-once transport converges via idempotent ingest
 *   P-A12 duplicate envelope does not duplicate semantic event
 *   P-A13 crash before cursor checkpoint loses no semantic work
 *   P-A14 crash after semantic ingest replays safely
 *   P-A16 localPeer cannot be supplied by remote/tool caller
 *   P-A28 StateChangeFeed cursor contract respected
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MemoryLedger, createStateStore } from "@ordarium/core";
import type { OrdariumStateStore } from "@ordarium/core";

import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { SqliteCoordinationStore } from "../src/coordination/index.js";
import {
  FEDERATION_EVENT_PARSERS,
  makeFederationMessagingService,
  materializePeerRef,
} from "../src/federation/index.js";
import { callbackPeerTransportPort } from "../src/federation/index.js";
import type { PeerRef } from "../src/federation/index.js";
import {
  DurableEnvelopeError,
  DurableTransportError,
  InboundPumpError,
  durableBoundaryClient,
  durableEnvelopeDigestOf,
  mailboxNamespace,
  makeOrdariumDurableTransport,
  makeFederationInboundPump,
  materializeDurablePeerEnvelope,
  parseDurablePeerEnvelope,
  peerTransportFromDurable,
  type BoundaryHomeIngestPort,
  type DurableOperationTransportPort,
  type FederationRemoteIngestPort,
  type TransportCursorStore,
} from "../src/transport/index.js";
import { staticBoundaryRoute } from "../src/boundary_memory/index.js";
import { BoundaryRemoteError } from "../src/boundary_memory/index.js";

const P: PeerRef = materializePeerRef({ peerId: "peer-palimpsest" });
const O: PeerRef = materializePeerRef({ peerId: "peer-ordarium" });
const NS = "dogfood";

const dirs: string[] = [];
function tmpRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-p-transport-"));
  dirs.push(dir);
  return dir;
}

function memoryTransport(state: OrdariumStateStore): DurableOperationTransportPort {
  return makeOrdariumDurableTransport({ state, namespace: NS, clock: () => "2026-09-14T00:00:00.000Z" });
}

/** A cursor store that can be told to forget writes (simulates a crash before checkpoint). */
function memoryCursors(options: { readonly forgetWrites?: boolean } = {}): TransportCursorStore & {
  readonly writes: () => number;
} {
  const values = new Map<string, string>();
  let writes = 0;
  return {
    read: async ({ consumerId, mailbox }) => values.get(`${consumerId}\u0000${mailbox}`),
    write: async ({ consumerId, mailbox, cursor }) => {
      writes += 1;
      if (options.forgetWrites === true) return;
      values.set(`${consumerId}\u0000${mailbox}`, cursor);
    },
    clear: async ({ consumerId, mailbox }) => {
      values.delete(`${consumerId}\u0000${mailbox}`);
    },
    writes: () => writes,
  };
}

/** A real receiver-side federation service over a real coordination store, inbound-only. */
function makeReceiver(localPeer: PeerRef) {
  const store = new SqliteCoordinationStore(":memory:", { eventParsers: FEDERATION_EVENT_PARSERS });
  const effects = createPalimpsestEffects({
    databasePath: join(tmpRoot(), "ops.sqlite"),
    git: new FakeGitPort("a".repeat(40)),
  });
  const messaging = makeFederationMessagingService({
    effects,
    store,
    localPeer,
    allocateMessageId: () => `msg-${Math.random().toString(36).slice(2)}`,
    allocateWakeId: () => `wake-${Math.random().toString(36).slice(2)}`,
    transportPort: callbackPeerTransportPort("unused", {
      onSend: async () => {
        throw new Error("the receiver never sends");
      },
    }),
  });
  const port: FederationRemoteIngestPort = {
    recordInboundMessage: (envelope) => messaging.recordInboundMessage(envelope),
    acceptCommitment: async () => {
      throw new Error("no commitment service in this harness");
    },
    rejectCommitment: async () => {
      throw new Error("no commitment service in this harness");
    },
    releaseCommitment: async () => {
      throw new Error("no commitment service in this harness");
    },
    commitmentState: async () => undefined,
  };
  return { store, messaging, port };
}

describe("G10-P durable envelope", () => {
  it("strictly rejects unknown fields, versions and operations", () => {
    const good = materializeDurablePeerEnvelope({
      operationId: "op-1",
      from: P,
      to: O,
      sentAt: "t",
      operation: { kind: "peer_message", threadId: "thread-1", body: "hello" },
    });
    expect(parseDurablePeerEnvelope(good)).toEqual(good);
    expect(() => parseDurablePeerEnvelope({ ...good, extra: 1 })).toThrow(DurableEnvelopeError);
    expect(() => parseDurablePeerEnvelope({ ...good, schemaVersion: 2 })).toThrow(DurableEnvelopeError);
    expect(() =>
      parseDurablePeerEnvelope({ ...good, operation: { kind: "raw_store_append", payload: {} } }),
    ).toThrow(DurableEnvelopeError);
    expect(() =>
      parseDurablePeerEnvelope({ ...good, operation: { kind: "peer_message", threadId: "thread-1", body: "hello", forged: 1 } }),
    ).toThrow(DurableEnvelopeError);
  });

  it("derives per-peer mailbox namespaces without smuggling an address into PeerRef", () => {
    expect(mailboxNamespace("dogfood", "peer-palimpsest")).toBe(
      "palimpsest.peer-transport.dogfood.peer-palimpsest",
    );
    expect(durableEnvelopeDigestOf(parseDurablePeerEnvelope(materializeDurablePeerEnvelope({
      operationId: "op-2",
      from: P,
      to: O,
      sentAt: "t",
      operation: { kind: "commitment_accept", commitmentId: "com-1" },
    })))).toMatch(/^[0-9a-f]{64}$/u);
  });
});

describe("G10-P durable transport idempotency", () => {
  it("treats an identical operationId retry as success and a divergent one as a conflict", async () => {
    const transport = memoryTransport(createStateStore({ ledger: new MemoryLedger() }));
    const request = {
      operationId: "op-idem",
      from: P,
      to: O,
      operation: { kind: "peer_message" as const, threadId: "thread-1", body: "hello" },
    };
    expect((await transport.submit(request)).delivered).toBe(true);
    expect((await transport.submit(request)).delivered).toBe(true);
    await expect(
      transport.submit({ ...request, operation: { kind: "peer_message", threadId: "thread-1", body: "different" } }),
    ).rejects.toBeInstanceOf(DurableTransportError);
  });

  it("fails closed on a malformed cursor instead of restarting at zero", async () => {
    const transport = memoryTransport(createStateStore({ ledger: new MemoryLedger() }));
    const mailbox = mailboxNamespace(NS, O.peerId);
    await expect(transport.observe({ mailbox, cursor: "%%%bad%%%" })).rejects.toBeInstanceOf(
      DurableTransportError,
    );
  });

  it("fails closed on a future (foreign-ledger) cursor as a transport epoch mismatch", async () => {
    const state = createStateStore({ ledger: new MemoryLedger() });
    const transport = memoryTransport(state);
    const mailbox = mailboxNamespace(NS, O.peerId);
    await transport.submit({
      operationId: "op-1",
      from: P,
      to: O,
      operation: { kind: "peer_message", threadId: "thread-1", body: "hello" },
    });
    const future = Buffer.from(JSON.stringify({ c: "999999" }), "utf8").toString("base64url");
    let thrown: unknown;
    try {
      await transport.observe({ mailbox, cursor: future });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DurableTransportError);
    expect((thrown as DurableTransportError).kind).toBe("transport_epoch_mismatch");
  });
});

describe("G10-P inbound pump", () => {
  it("ingests durably stored work for an offline receiver, exactly once semantically", async () => {
    const state = createStateStore({ ledger: new MemoryLedger() });
    const transportP = memoryTransport(state);
    const transportO = memoryTransport(state);
    const receiver = makeReceiver(O);

    // P sends while O is "offline" (no pump running).
    await transportP.submit({
      operationId: "msg-1",
      from: P,
      to: O,
      operation: { kind: "peer_message", threadId: "thread-1", body: "we need an observation property" },
    });

    const cursors = memoryCursors();
    const pump = makeFederationInboundPump({
      transport: transportO,
      localPeer: O,
      cursorStore: cursors,
      consumerId: "deployment-O",
      federation: receiver.port,
    });
    const first = await pump.pumpOnce();
    expect(first.ingested).toBe(1);

    // Redelivery of the identical envelope must not duplicate semantic history.
    await transportP.submit({
      operationId: "msg-1",
      from: P,
      to: O,
      operation: { kind: "peer_message", threadId: "thread-1", body: "we need an observation property" },
    });
    await pump.pumpOnce();

    const inbox = await receiver.messaging.inboxView(O);
    expect(inbox.received).toHaveLength(1);
    expect(inbox.received[0]?.body).toBe("we need an observation property");
  });

  it("loses no semantic work when the cursor checkpoint never persisted (crash after ingest)", async () => {
    const state = createStateStore({ ledger: new MemoryLedger() });
    const transport = memoryTransport(state);
    const receiver = makeReceiver(O);
    await transport.submit({
      operationId: "msg-crash",
      from: P,
      to: O,
      operation: { kind: "peer_message", threadId: "thread-1", body: "replayed" },
    });
    const pump = makeFederationInboundPump({
      transport,
      localPeer: O,
      cursorStore: memoryCursors({ forgetWrites: true }),
      consumerId: "deployment-O",
      federation: receiver.port,
    });
    await pump.pumpOnce();
    await pump.pumpOnce(); // replays the same change: the semantic event is idempotent
    const inbox = await receiver.messaging.inboxView(O);
    expect(inbox.received).toHaveLength(1);
  });

  it("never interprets a misaddressed operation (mailbox isolation)", async () => {
    const state = createStateStore({ ledger: new MemoryLedger() });
    const transport = memoryTransport(state);
    const receiver = makeReceiver(O);
    // Written to P's own mailbox, then pumped by a P-local peer: skipped, not ingested.
    await transport.submit({
      operationId: "msg-misaddressed",
      from: O,
      to: P,
      operation: { kind: "peer_message", threadId: "thread-1", body: "not for this mailbox" },
    });
    const pump = makeFederationInboundPump({
      transport,
      localPeer: O,
      cursorStore: memoryCursors(),
      consumerId: "deployment-O",
      federation: receiver.port,
    });
    const report = await pump.pumpOnce();
    expect(report.ingested).toBe(0);
    expect(report.skipped).toBe(0); // mailbox(O) is empty; P's mailbox was never observed
  });

  it("fails closed rather than silently skipping a malformed stored envelope", async () => {
    const state = createStateStore({ ledger: new MemoryLedger() });
    const transport = memoryTransport(state);
    const mailbox = mailboxNamespace(NS, O.peerId);
    await state.write({
      namespace: mailbox,
      key: "op-bad",
      expectedRevision: 0,
      value: { schemaVersion: 1, operationId: "op-bad", from: { peerId: "x" }, to: { peerId: O.peerId } },
      identity: { source: "test", scope: NS, callId: "op-bad" },
    });
    const receiver = makeReceiver(O);
    const pump = makeFederationInboundPump({
      transport,
      localPeer: O,
      cursorStore: memoryCursors(),
      consumerId: "deployment-O",
      federation: receiver.port,
    });
    await expect(pump.pumpOnce()).rejects.toBeInstanceOf(DurableEnvelopeError);
  });

  it("fails closed when a boundary operation arrives with no local canonical home", async () => {
    const state = createStateStore({ ledger: new MemoryLedger() });
    const transport = memoryTransport(state);
    await transport.submit({
      operationId: "bop-1",
      from: P,
      to: O,
      operation: {
        kind: "boundary",
        workspaceId: "ws-1",
        operation: { kind: "submit_artifact_candidate", artifactId: "a-1", base: null, content: {}, requiredAcceptors: [P], intent: "i" },
      },
    });
    const receiver = makeReceiver(O);
    const pump = makeFederationInboundPump({
      transport,
      localPeer: O,
      cursorStore: memoryCursors(),
      consumerId: "deployment-O",
      federation: receiver.port,
    });
    await expect(pump.pumpOnce()).rejects.toBeInstanceOf(InboundPumpError);
  });
});

describe("G10-P durable adapters", () => {
  it("derives the outbound sender from the local peer, never the request", async () => {
    const state = createStateStore({ ledger: new MemoryLedger() });
    const transport = memoryTransport(state);
    const port = peerTransportFromDurable(transport, { localPeer: P });
    await port.send({
      messageId: "msg-adapter",
      // A forged `from` is ignored by construction.
      from: O,
      to: O,
      threadId: "thread-1",
      body: "hello",
    });
    const observation = await transport.observe({ mailbox: mailboxNamespace(NS, O.peerId), limit: 1 });
    expect(observation.envelopes[0]?.from.peerId).toBe(P.peerId);
  });

  it("routes boundary mutations to the home peer mailbox (submission only)", async () => {
    const state = createStateStore({ ledger: new MemoryLedger() });
    const transport = memoryTransport(state);
    const client = durableBoundaryClient(transport, {
      localPeer: O,
      route: staticBoundaryRoute({ "ws-1": `home-${P.peerId}` }),
      allocateOperationId: () => "bop-routed",
    });

    const queued = await client.submit({
      workspaceId: "ws-1",
      operation: { kind: "submit_artifact_candidate", artifactId: "a-1", base: null, content: { version: 1 }, requiredAcceptors: [P], intent: "propose an interface" },
    });
    expect(queued).toEqual({ queued: true, operationId: "bop-routed" });

    const observed = await transport.observe({ mailbox: mailboxNamespace(NS, P.peerId), limit: 1 });
    expect(observed.envelopes[0]?.operation.kind).toBe("boundary");
    // The reply is a mechanical queue receipt, never a boundary acceptance.
    expect(queued).not.toHaveProperty("accepted");
  });

  it("fails closed when no canonical home route exists for a workspace", async () => {
    const transport = memoryTransport(createStateStore({ ledger: new MemoryLedger() }));
    const client = durableBoundaryClient(transport, {
      localPeer: O,
      route: staticBoundaryRoute({}),
      allocateOperationId: () => "bop-none",
    });
    await expect(
      client.submit({ workspaceId: "ws-unknown", operation: { kind: "workspace_view" } }),
    ).rejects.toBeInstanceOf(BoundaryRemoteError);
  });

  it("drives ingest of a boundary mutation into a fake canonical home", async () => {
    const state = createStateStore({ ledger: new MemoryLedger() });
    const transport = memoryTransport(state);
    const handled: string[] = [];
    const home: BoundaryHomeIngestPort = {
      handle: async (raw) => {
        const envelope = raw as { operationId: string };
        if (!handled.includes(envelope.operationId)) handled.push(envelope.operationId);
        return { ok: true };
      },
    };
    const client = durableBoundaryClient(transport, {
      localPeer: O,
      route: staticBoundaryRoute({ "ws-1": `home-${P.peerId}` }),
      allocateOperationId: () => "bop-home",
    });
    await client.submit({
      workspaceId: "ws-1",
      operation: { kind: "submit_artifact_candidate", artifactId: "a-1", base: null, content: { version: 1 }, requiredAcceptors: [P], intent: "propose an interface" },
    });
    const receiver = makeReceiver(P);
    const pump = makeFederationInboundPump({
      transport,
      localPeer: P,
      cursorStore: memoryCursors(),
      consumerId: "deployment-P",
      federation: receiver.port,
      boundaryHome: home,
    });
    await pump.pumpOnce();
    await pump.pumpOnce();
    expect(handled).toEqual(["bop-home"]);
  });
});

// Eagerly clean the temp roots created by the real-effects receiver harnesses.
process.on("exit", () => {
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows may still hold a handle; the OS reclaims the tmp directory.
    }
  }
});
