/**
 * G10-F0 coordination-history integrity machine proofs (§12–§27).
 *
 *   F0-M01  strict artifact parsers: unknown/nested-unknown fields rejected on
 *           append AND on read; malformed stored row fails closed
 *   F0-M02  complete parser registry: every coordination event type registered
 *   F0-M03  expectedHeadSeq conflict → head_mismatch, nothing written
 *   F0-M04  crash-atomic rollback: injected failure leaves NO persisted prefix
 *   F0-M05  batch idempotency: full replay idempotent; partial set fails closed
 *   F0-M06  different-handle concurrent appends: distinct seq, deterministic replay
 *   F0-M07  SQLite contention classified as database_busy (never a silent retry)
 *   F0-M08  handoff is ONE atomic transition (SUPERSEDED + successor coexist)
 *   F0-M09  handoff crash-atomicity: no prefix; retry converges
 *   F0-M10  competing transition: exactly one stale-state write commits
 *   F0-M11  canonical serialization: key order does not change event identity
 *   F0-M12  store owns no scheduler/effects/WorkGraph concern (firewall)
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { materializeActivation } from "../src/runtime/index.js";
import type { Activation } from "../src/runtime/index.js";
import {
  CoordinationStoreError,
  DEFAULT_COORDINATION_EVENT_PARSERS,
  SqliteCoordinationStore,
  activationRefOf,
  attemptRefOf,
  materializeInvocation,
} from "../src/coordination/index.js";
import type { CoordinationAppendRequest, CoordinationEventType } from "../src/coordination/index.js";
import { makeCommitmentService, materializePeerRef } from "../src/federation/index.js";
import { canonicalDigest } from "../src/schema/canonical.js";

const ALL_EVENT_TYPES: readonly CoordinationEventType[] = [
  "INVOCATION_RECORDED",
  "PARTICIPATION_STARTED",
  "PARTICIPATION_ENDED",
  "CONTACT_REQUESTED",
  "MESSAGE_PREPARED",
  "MESSAGE_DELIVERED",
  "MESSAGE_RECEIVED",
  "WAKE_SENT",
  "ACK_RECORDED",
  "COMMITMENT_OFFERED",
  "COMMITMENT_ACCEPTED",
  "COMMITMENT_REJECTED",
  "COMMITMENT_RELEASED",
  "COMMITMENT_SUPERSEDED",
  "HANDOFF_OFFERED",
  "HANDOFF_ACCEPTED",
  "HANDOFF_REJECTED",
];

const PEER_A = materializePeerRef({ peerId: "peer-a" });
const PEER_B = materializePeerRef({ peerId: "peer-b" });
const LOCAL = PEER_A;
const REMOTE = PEER_B;

const SRC = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/${relative}`, import.meta.url)), "utf-8");
const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

function activation(): Activation {
  return materializeActivation({
    activationId: "act-f0",
    agentDefinitionId: "A",
    runDefinition: { digest: "rd-1" },
    bindingResolution: { resolutionId: "res-1", digest: "rr-1" },
  });
}

function tempDb(name: string): string {
  return join(mkdtempSync(join(tmpdir(), `palimpsest-f0-${name}-`)), "coordination.sqlite");
}

/** A WAKE_SENT append request with a caller-chosen eventId. */
function wakeReq(eventId: string, wakeId = eventId): CoordinationAppendRequest {
  return {
    eventId,
    projectId: "federation",
    type: "WAKE_SENT",
    payload: { wakeId, from: PEER_A, to: PEER_B },
  };
}

function commitmentService(store: SqliteCoordinationStore) {
  let commitmentCounter = 0;
  let handoffCounter = 0;
  return makeCommitmentService({
    store,
    localPeer: LOCAL,
    allocateCommitmentId: () => `c-${++commitmentCounter}`,
    allocateHandoffId: () => `h-${++handoffCounter}`,
  });
}

const SCOPE = {
  kind: "attempt_participation" as const,
  attempt: { projectId: "p1", attemptId: "attempt-1" },
};

describe("F0-M01: strict artifact parsers (append + read)", () => {
  it("rejects an unknown nested field on append and writes nothing", async () => {
    const store = new SqliteCoordinationStore(":memory:");
    const invocation = {
      ...materializeInvocation({
        invocationId: "inv-1",
        activation: activationRefOf(activation()),
        attempt: attemptRefOf("p1", "attempt-1"),
      }),
      rogue: true,
    };
    await expect(
      store.append({ eventId: "e", projectId: "p1", type: "INVOCATION_RECORDED", payload: { invocation } }),
    ).rejects.toBeInstanceOf(CoordinationStoreError);
    expect(await store.replay()).toHaveLength(0);
  });

  it("rejects a malformed nested artifact anywhere in a batch before any write", async () => {
    const store = new SqliteCoordinationStore(":memory:");
    await expect(
      store.appendAtomic({
        expectedHeadSeq: 0,
        events: [
          wakeReq("ok-1"),
          { eventId: "bad", projectId: "federation", type: "WAKE_SENT", payload: { wakeId: "w", from: { peerId: "x" } } },
        ],
      }),
    ).rejects.toBeInstanceOf(CoordinationStoreError);
    expect(await store.replay()).toHaveLength(0);
  });

  it("fails closed on read for a raw-inserted unknown nested field and malformed JSON", async () => {
    const path = tempDb("read");
    const store = new SqliteCoordinationStore(path);
    store.close();
    const raw = new DatabaseSync(path);
    const badInvocation = {
      invocation: {
        schemaVersion: 1,
        invocationId: "inv-1",
        activation: activationRefOf(activation()),
        attempt: attemptRefOf("p1", "attempt-1"),
        purpose: "participate",
        rogue: true,
      },
    };
    raw
      .prepare("INSERT INTO coordination_events VALUES (?, ?, ?, ?, ?)")
      .run("bad-nested", 1, "p1", "INVOCATION_RECORDED", JSON.stringify(badInvocation));
    raw
      .prepare("INSERT INTO coordination_events VALUES (?, ?, ?, ?, ?)")
      .run("bad-json", 2, "p1", "INVOCATION_RECORDED", "{not-json");
    raw.close();
    const reader = new SqliteCoordinationStore(path);
    await expect(reader.replay()).rejects.toThrow(/unknown field "rogue"/);
    reader.close();
    const raw2 = new DatabaseSync(path);
    raw2.prepare("DELETE FROM coordination_events WHERE event_id = 'bad-nested'").run();
    raw2.close();
    const reader2 = new SqliteCoordinationStore(path);
    await expect(reader2.replay()).rejects.toThrow(/malformed payload/);
    reader2.close();
  });
});

describe("F0-M02: complete parser registry (§25)", () => {
  it("every coordination event type has a registered strict parser", () => {
    expect(Object.keys(DEFAULT_COORDINATION_EVENT_PARSERS).sort()).toEqual([...ALL_EVENT_TYPES].sort());
    for (const type of ALL_EVENT_TYPES) {
      expect(typeof DEFAULT_COORDINATION_EVENT_PARSERS[type]).toBe("function");
    }
  });
});

describe("F0-M03: expected-head conditional admission (§14)", () => {
  it("a stale expectedHeadSeq is rejected and nothing is written", async () => {
    const store = new SqliteCoordinationStore(":memory:");
    await store.append(wakeReq("e1"));
    expect(await store.head()).toBe(1);
    await expect(
      store.appendAtomic({ expectedHeadSeq: 0, events: [wakeReq("e2")] }),
    ).rejects.toMatchObject({ kind: "coordination_conflict", category: "head_mismatch" });
    expect((await store.replay()).map((event) => event.eventId)).toEqual(["e1"]);
  });
});

describe("F0-M04: crash-atomic rollback (§20)", () => {
  it("an injected failure before COMMIT leaves no persisted prefix", async () => {
    const store = new SqliteCoordinationStore(":memory:", {
      _failBeforeCommit: () => {
        throw new Error("injected-crash");
      },
    });
    await expect(
      store.appendAtomic({ expectedHeadSeq: 0, events: [wakeReq("a"), wakeReq("b"), wakeReq("c")] }),
    ).rejects.toThrow(/injected-crash/);
    expect(await store.replay()).toHaveLength(0);
    expect(await store.head()).toBe(0);
  });
});

describe("F0-M05: batch idempotency and partial-set fail-closed (§18)", () => {
  it("retrying a committed batch is idempotent; a partial historical set fails closed", async () => {
    const store = new SqliteCoordinationStore(":memory:");
    const batch = [wakeReq("k1"), wakeReq("k2")];
    await store.appendAtomic({ expectedHeadSeq: 0, events: batch });
    expect(await store.replay()).toHaveLength(2);
    // Retry after the head advanced: all events present byte-identical → success.
    const again = await store.appendAtomic({ expectedHeadSeq: 0, events: batch });
    expect(again.map((event) => event.eventId)).toEqual(["k1", "k2"]);
    expect(await store.replay()).toHaveLength(2);

    const partial = new SqliteCoordinationStore(":memory:");
    await partial.append(wakeReq("p1"));
    await expect(
      partial.appendAtomic({ expectedHeadSeq: 1, events: [wakeReq("p1"), wakeReq("p2")] }),
    ).rejects.toMatchObject({ kind: "coordination_conflict", category: "recovery_required" });
    expect((await partial.replay()).map((event) => event.eventId)).toEqual(["p1"]);
  });
});

describe("F0-M06: different-handle concurrency (§16)", () => {
  it("two handles appending different events both succeed with distinct seq", async () => {
    const path = tempDb("concurrent");
    const first = new SqliteCoordinationStore(path, { busyTimeoutMs: 5000 });
    const second = new SqliteCoordinationStore(path, { busyTimeoutMs: 5000 });
    await Promise.all([first.append(wakeReq("h1")), second.append(wakeReq("h2"))]);
    const events = await first.replay();
    expect(events.map((event) => event.eventId).sort()).toEqual(["h1", "h2"]);
    expect(new Set(events.map((event) => event.seq)).size).toBe(2);
    // Deterministic replay through the other handle.
    expect((await second.replay()).map((event) => event.seq)).toEqual([1, 2]);
    first.close();
    second.close();
  });
});

describe("F0-M07: SQLite contention classification (§17)", () => {
  it("a held write lock surfaces as database_busy, not a silent retry or semantic conflict", async () => {
    const path = tempDb("busy");
    const store = new SqliteCoordinationStore(path, { busyTimeoutMs: 40 });
    const raw = new DatabaseSync(path);
    raw.exec("BEGIN IMMEDIATE");
    await expect(
      store.appendAtomic({ expectedHeadSeq: 0, events: [wakeReq("busy1")] }),
    ).rejects.toMatchObject({ kind: "coordination_conflict", category: "database_busy" });
    raw.exec("ROLLBACK");
    raw.close();
    expect(await store.replay()).toHaveLength(0);
    store.close();
  });
});

describe("F0-M08: handoff is ONE atomic transition (§19)", () => {
  it("SUPERSEDED, HANDOFF_ACCEPTED, successor OFFERED+ACCEPTED commit together with contiguous seq", async () => {
    const store = new SqliteCoordinationStore(":memory:");
    const service = commitmentService(store);
    const offer = await service.offerCommitment({ proposedHolder: LOCAL, scope: SCOPE, statement: "own" });
    await service.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: null, local: true });
    const handoff = await service.offerHandoff({ commitmentId: offer.commitmentId, to: REMOTE });
    const accepted = await service.acceptHandoff({ handoffId: handoff.handoffId, authenticatedPeer: REMOTE });

    const events = await store.replay();
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(events.map((event) => event.type)).toEqual([
      "COMMITMENT_OFFERED",
      "COMMITMENT_ACCEPTED",
      "HANDOFF_OFFERED",
      "COMMITMENT_SUPERSEDED",
      "HANDOFF_ACCEPTED",
      "COMMITMENT_OFFERED",
      "COMMITMENT_ACCEPTED",
    ]);
    expect(events.filter((event) => event.type === "COMMITMENT_SUPERSEDED")).toHaveLength(1);
    expect((await service.commitmentState(offer.commitmentId))?.state).toBe("SUPERSEDED");
    expect((await service.commitmentState(accepted.successorCommitmentId))?.state).toBe("ACTIVE");
  });
});

describe("F0-M09: handoff crash-atomicity (§20)", () => {
  it("a crash during the transition leaves no prefix and a retry converges", async () => {
    let crash = false;
    const store = new SqliteCoordinationStore(":memory:", {
      _failBeforeCommit: () => {
        if (crash) throw new Error("injected-crash");
      },
    });
    const service = commitmentService(store);
    const offer = await service.offerCommitment({ proposedHolder: LOCAL, scope: SCOPE, statement: "own" });
    await service.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: null, local: true });
    const handoff = await service.offerHandoff({ commitmentId: offer.commitmentId, to: REMOTE });
    const before = (await store.replay()).length;

    crash = true;
    await expect(
      service.acceptHandoff({ handoffId: handoff.handoffId, authenticatedPeer: REMOTE }),
    ).rejects.toThrow(/injected-crash/);

    const afterCrash = await store.replay();
    expect(afterCrash).toHaveLength(before);
    const types = afterCrash.map((event) => event.type);
    // No prefix of the four-event transition survives.
    expect(types).not.toContain("COMMITMENT_SUPERSEDED");
    expect(types).not.toContain("HANDOFF_ACCEPTED");
    // The old responsibility is still ACTIVE and the handoff still OFFERED.
    expect((await service.commitmentState(offer.commitmentId))?.state).toBe("ACTIVE");

    crash = false;
    const accepted = await service.acceptHandoff({ handoffId: handoff.handoffId, authenticatedPeer: REMOTE });
    expect((await service.commitmentState(offer.commitmentId))?.state).toBe("SUPERSEDED");
    expect((await service.commitmentState(accepted.successorCommitmentId))?.state).toBe("ACTIVE");
  });
});

describe("F0-M10: competing transitions (§21)", () => {
  it("exactly one stale-state write commits; the other fails honestly", async () => {
    const store = new SqliteCoordinationStore(":memory:");
    const service = commitmentService(store);
    const offer = await service.offerCommitment({ proposedHolder: LOCAL, scope: SCOPE, statement: "own" });
    await service.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: null, local: true });
    const handoff = await service.offerHandoff({ commitmentId: offer.commitmentId, to: REMOTE });
    const head = await store.head();

    // Process A: release from the shared starting head.
    await store.appendAtomic({
      expectedHeadSeq: head,
      events: [
        {
          eventId: canonicalDigest({ domain: "palimpsest.coordination-event.v1", type: "COMMITMENT_RELEASED", scope: "federation", content: { commitmentId: offer.commitmentId, releasedBy: LOCAL } }),
          projectId: "federation",
          type: "COMMITMENT_RELEASED",
          payload: { commitmentId: offer.commitmentId, releasedBy: LOCAL },
        },
      ],
    });
    // Process B: accept the handoff from the SAME starting head.
    const successor = "c-successor";
    await expect(
      store.appendAtomic({
        expectedHeadSeq: head,
        events: [
          {
            eventId: "x-superseded",
            projectId: "federation",
            type: "COMMITMENT_SUPERSEDED",
            payload: { commitmentId: offer.commitmentId, handoffId: handoff.handoffId },
          },
          {
            eventId: "x-handoff-accepted",
            projectId: "federation",
            type: "HANDOFF_ACCEPTED",
            payload: {
              handoffId: handoff.handoffId,
              commitmentId: offer.commitmentId,
              successorCommitmentId: successor,
              to: REMOTE,
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ kind: "coordination_conflict", category: "head_mismatch" });

    const types = (await store.replay()).map((event) => event.type);
    expect(types).toContain("COMMITMENT_RELEASED");
    expect(types).not.toContain("COMMITMENT_SUPERSEDED");
    expect(types).not.toContain("HANDOFF_ACCEPTED");
    expect((await service.commitmentState(offer.commitmentId))?.state).toBe("RELEASED");
  });
});

describe("F0-M11: canonical serialization identity (§26)", () => {
  it("semantically identical payloads with different key order are the same event", async () => {
    const store = new SqliteCoordinationStore(":memory:");
    await store.append(wakeReq("evt-order", "w1"));
    const reordered: CoordinationAppendRequest = {
      eventId: "evt-order",
      projectId: "federation",
      type: "WAKE_SENT",
      payload: { to: PEER_B, from: PEER_A, wakeId: "w1" },
    };
    const second = await store.append(reordered);
    expect(second[0]!.seq).toBe(1);
    expect(await store.replay()).toHaveLength(1);
  });
});

describe("F0-M12: store concern firewall", () => {
  it("the coordination store imports no scheduler/effects/WorkGraph concern", () => {
    const code = stripComments(SRC("coordination/store.ts"));
    expect(code).not.toMatch(/scheduler/i);
    expect(code).not.toMatch(/effects\//);
    expect(code).not.toMatch(/workgraph/i);
  });
});
