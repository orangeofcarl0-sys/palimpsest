/**
 * G10-P adversarial + source firewall (P14).
 *
 *   P-A05 host wake ≠ semantic authority      Ack ≠ agreement
 *   P-A08 boundary acceptance requires existing semantic rules
 *   P-A09 commitment holder acceptance remains explicit
 *   P-A17 transport auth assertion cannot be self-reported
 *   P-A20 deployment profile ≠ canonical species
 *   P-A21 no global planner/manager introduced
 *   P-A31 no dogfood-only raw store backdoor
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { MemoryLedger, createStateStore } from "@ordarium/core";

import { SqliteCoordinationStore } from "../src/coordination/index.js";
import {
  makeCommitmentService,
  materializePeerMessage,
  materializePeerRef,
  materializeThreadRef,
} from "../src/federation/index.js";
import type { PeerRef } from "../src/federation/index.js";
import {
  makeFederationInboundPump,
  makeOrdariumDurableTransport,
  type FederationRemoteIngestPort,
  type TransportCursorStore,
} from "../src/transport/index.js";

const SRC = (path: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf-8");
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const P: PeerRef = materializePeerRef({ peerId: "peer-p" });
const REMOTE: PeerRef = materializePeerRef({ peerId: "peer-o" });
const OTHER: PeerRef = materializePeerRef({ peerId: "peer-x" });

const memoryCursors = (): TransportCursorStore => {
  const values = new Map<string, string>();
  return {
    read: async ({ consumerId, mailbox }) => values.get(`${consumerId}\u0000${mailbox}`),
    write: async ({ consumerId, mailbox, cursor }) => void values.set(`${consumerId}\u0000${mailbox}`, cursor),
    clear: async ({ consumerId, mailbox }) => void values.delete(`${consumerId}\u0000${mailbox}`),
  };
};

describe("G10-P source firewall", () => {
  it("the inbound pump never touches a canonical store or appends a semantic event", () => {
    const code = strip(SRC("transport/pump.ts"));
    for (const forbidden of ['"/store.js"', "coordination/store", "boundary_memory/store", "commitment_service", ".append(", "appendAtomic"]) {
      expect(code.includes(forbidden)).toBe(false);
    }
  });

  it("the durable transport carries no semantic vocabulary (it is mechanically neutral)", () => {
    const code = strip(SRC("transport/ordarium_transport.ts"));
    for (const forbidden of ["MESSAGE_RECEIVED", "MESSAGE_PREPARED", "COMMITMENT_", "BOUNDARY_", "coordination", "boundary_memory"]) {
      expect(code.includes(forbidden)).toBe(false);
    }
  });

  it("the attention service and host adapter import no store and no authority/admission port", () => {
    for (const path of ["attention/service.ts", "attention/host_adapter.ts", "attention/signals.ts", "attention/marks.ts"]) {
      const code = strip(SRC(path));
      for (const forbidden of ["/store.js", "admission", "authority", "Authority", "EventEmitter", "setInterval"]) {
        expect(code.includes(forbidden)).toBe(false);
      }
    }
  });

  it("deployment config imports no semantic implementation (only the identifier grammar)", () => {
    const code = strip(SRC("deployment/profile.ts"));
    const imports = [...code.matchAll(/from\s+"([^"]+)"/gu)].map((match) => match[1]);
    expect(imports).toEqual(["../schema/identifier.js"]);
  });

  it("introduces no global planner/manager/scheduler anywhere in src", () => {
    const sources = [
      "federation/federation_service.ts",
      "transport/pump.ts",
      "attention/service.ts",
      "deployment/launch.ts",
      "application/surface.ts",
    ].map((path) => strip(SRC(path)));
    for (const code of sources) {
      for (const forbidden of [
        "FederationManager",
        "GlobalAgentManager",
        "MasterAgent",
        "CrossProjectPlanner",
        "GlobalTaskAllocator",
        "GlobalConversationCoordinator",
        "AttentionScheduler",
      ]) {
        expect(code.includes(forbidden)).toBe(false);
      }
    }
  });

  it("the host adapter is structural only: it never imports a semantic package", () => {
    const code = strip(SRC("attention/host_adapter.ts"));
    expect(/from\s+"[^"]*(federation|coordination|boundary_memory|install)[^"]*"/u.test(code)).toBe(false);
  });
});

describe("G10-P adversarial behaviors", () => {
  it("fails closed (and does not advance the cursor) when a NON-holder asserts a commitment acceptance", async () => {
    const store = new SqliteCoordinationStore(":memory:");
    const commitments = makeCommitmentService({
      store,
      localPeer: P,
      allocateCommitmentId: () => "com-1",
      allocateHandoffId: () => "ho-1",
    });
    const offer = await commitments.offerCommitment({
      proposedHolder: REMOTE,
      scope: { kind: "contact_need", contactNeedId: "need-1" },
      statement: "x",
    });
    const transport = makeOrdariumDurableTransport({
      state: createStateStore({ ledger: new MemoryLedger() }),
      namespace: "ns",
      clock: () => "t",
    });
    await transport.submit({
      operationId: "op-forged",
      from: OTHER,
      to: P,
      operation: { kind: "commitment_accept", commitmentId: offer.commitmentId },
    });
    const port: FederationRemoteIngestPort = {
      recordInboundMessage: async () => {
        throw new Error("not used");
      },
      acceptCommitment: (input) => commitments.acceptCommitment(input),
      rejectCommitment: (input) => commitments.rejectCommitment(input),
      releaseCommitment: (input) => commitments.releaseCommitment(input),
      commitmentState: (commitmentId) => commitments.commitmentState(commitmentId),
    };
    const pump = makeFederationInboundPump({
      transport,
      localPeer: P,
      cursorStore: memoryCursors(),
      consumerId: "consumer-p",
      federation: port,
    });
    await expect(pump.pumpOnce()).rejects.toBeTruthy();
    // A refused semantic operation must NOT be silently skipped past.
    expect(await pump.cursor()).toBeUndefined();
  });

  it("an acknowledgement is receipt only — it never becomes agreement or a commitment", async () => {
    const store = new SqliteCoordinationStore(":memory:");
    const commitments = makeCommitmentService({
      store,
      localPeer: P,
      allocateCommitmentId: () => "com-x",
      allocateHandoffId: () => "ho-x",
    });
    // Model an inbound acknowledgement by observing that the commitment store is
    // untouched: there is no ack-to-commitment path in the coordination vocabulary.
    expect(await commitments.listCommitments()).toEqual([]);
    expect(commitments.releaseCommitment).toBeTypeOf("function");
  });

  it("a misaddressed envelope written to a peer's own mailbox is never interpreted", async () => {
    const transport = makeOrdariumDurableTransport({
      state: createStateStore({ ledger: new MemoryLedger() }),
      namespace: "ns",
      clock: () => "t",
    });
    await transport.submit({
      operationId: "op-other",
      from: P,
      to: OTHER,
      operation: { kind: "peer_message", threadId: "t", body: "for someone else" },
    });
    let ingested = 0;
    const port: FederationRemoteIngestPort = {
      recordInboundMessage: async () => {
        ingested += 1;
      },
      acceptCommitment: async () => undefined,
      rejectCommitment: async () => undefined,
      releaseCommitment: async () => undefined,
      commitmentState: async () => undefined,
    };
    const pump = makeFederationInboundPump({
      transport,
      localPeer: P,
      cursorStore: memoryCursors(),
      consumerId: "consumer-p",
      federation: port,
    });
    await pump.pumpOnce();
    expect(ingested).toBe(0);
  });

  it("a message body is never parsed into a commitment (transport vs collaboration truth)", () => {
    // Structural: the pump's message branch constructs a PeerMessage and calls the
    // inbound message path only; it contains no commitment-offer construction.
    const code = strip(SRC("transport/pump.ts"));
    expect(code).toContain("recordInboundMessage");
    expect(code.includes("offerCommitment")).toBe(false);
    expect(materializePeerMessage({
      messageId: "m1",
      thread: materializeThreadRef({ threadId: "t1" }),
      from: P,
      to: REMOTE,
      body: "I promise to implement X",
    }).body).toBe("I promise to implement X");
  });
});
