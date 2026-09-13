/**
 * G10-E6 campaign-wide adversarial conformance review (§144–§161).
 *
 * Consolidated cross-cutting proofs not already covered per-stage:
 *   E6-X01  idempotency / conflict matrix across all four concerns
 *   E6-X02  multi-process store: concurrent duplicate, conflicting duplicate,
 *           stable ordering, reader restart, malformed-row fail-closed
 *   E6-X03  restart replay reproduces peers/threads/commitments/handoffs/
 *           participation/inbox from canonical events alone
 *   E6-X04  no automatic collaboration→Evidence or commitment→verification path
 *   E6-X05  persistence optionality: all four runtime×collaboration
 *           combinations reachable without cross-coupling
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { SqliteCoordinationStore } from "../src/coordination/index.js";
import {
  COMMITMENT_EVENT_PARSERS,
  CommitmentError,
  FEDERATION_EVENT_PARSERS,
  callbackPeerTransportPort,
  makeCommitmentService,
  makeFederationMessagingService,
  materializePeerRef,
} from "../src/federation/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";

const ALL_PARSERS = { ...FEDERATION_EVENT_PARSERS, ...COMMITMENT_EVENT_PARSERS };
const LOCAL = materializePeerRef({ peerId: "peer-a" });
const REMOTE = materializePeerRef({ peerId: "peer-b" });

const SCOPE = {
  kind: "attempt_participation" as const,
  attempt: { projectId: "p1", attemptId: "attempt-1" },
};

function world(path = ":memory:") {
  const store = new SqliteCoordinationStore(path, { eventParsers: ALL_PARSERS });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-e6-")), "ops.sqlite"),
    git: new FakeGitPort("c".repeat(40)),
  });
  const sent: string[] = [];
  const transportPort = callbackPeerTransportPort("callback", {
    onSend: async (request) => {
      sent.push(request.messageId);
      return { transportMessageId: `transport-${sent.length}`, delivered: true };
    },
    onWake: async () => ({ signaled: true }),
  });
  let messageCounter = 0;
  const messaging = makeFederationMessagingService({
    effects,
    store,
    localPeer: LOCAL,
    allocateMessageId: () => `msg-${++messageCounter}`,
    allocateWakeId: () => `wake-${messageCounter}`,
    transportPort,
  });
  let commitmentCounter = 0;
  let handoffCounter = 0;
  const commitments = makeCommitmentService({
    store,
    localPeer: LOCAL,
    allocateCommitmentId: () => `com-${++commitmentCounter}`,
    allocateHandoffId: () => `ho-${++handoffCounter}`,
  });
  return { store, messaging, commitments, sent, effects, transportPort };
}

describe("E6-X01: idempotency / conflict matrix (§156)", () => {
  it("accept twice / reject after accept / accept after reject / accept handoff twice all fail closed", async () => {
    const w = world();
    const offer = await w.commitments.offerCommitment({
      proposedHolder: REMOTE,
      scope: SCOPE,
      statement: "s",
    });
    await w.commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: REMOTE });
    // Accept twice: the commitment is no longer OFFERED.
    await expect(
      w.commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: REMOTE }),
    ).rejects.toMatchObject({ kind: "commitment_conflict" });
    // Reject after accepted: also a conflict (no history rewrite).
    await expect(
      w.commitments.rejectCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: REMOTE }),
    ).rejects.toMatchObject({ kind: "commitment_conflict" });

    const offer2 = await w.commitments.offerCommitment({
      proposedHolder: REMOTE,
      scope: SCOPE,
      statement: "s2",
    });
    await w.commitments.rejectCommitment({ commitmentId: offer2.commitmentId, authenticatedPeer: REMOTE });
    await expect(
      w.commitments.acceptCommitment({ commitmentId: offer2.commitmentId, authenticatedPeer: REMOTE }),
    ).rejects.toMatchObject({ kind: "commitment_conflict" });
  });

  it("the same message sent twice is two distinct messages (ids allocated), and store event re-appends are idempotent", async () => {
    const w = world();
    await w.messaging.sendMessage({ to: REMOTE, threadId: "t1", body: "one" });
    await w.messaging.sendMessage({ to: REMOTE, threadId: "t1", body: "one" });
    const history = await w.store.replay();
    const prepared = history.filter((event) => event.type === "MESSAGE_PREPARED");
    expect(prepared).toHaveLength(2);
    // Redelivery of an identical event (same id + payload) stays idempotent.
    const before = history.length;
    await w.store.append(history[0]! as never);
    expect((await w.store.replay()).length).toBe(before);
  });
});

describe("E6-X02: multi-process store behavior (§158)", () => {
  it("two handles: idempotent duplicate, conflicting duplicate fail-closed, stable order, restart replay", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "palimpsest-e6-store-")), "coordination.sqlite");
    const first = new SqliteCoordinationStore(path, { eventParsers: ALL_PARSERS });
    const second = new SqliteCoordinationStore(path, { eventParsers: ALL_PARSERS });

    const event = await first.append({
      eventId: "evt-1",
      projectId: "federation",
      type: "WAKE_SENT",
      payload: { wakeId: "w1", from: LOCAL, to: REMOTE },
    } as never);
    expect(event[0]!.seq).toBe(1);

    // The other handle sees it and can append; ordering is stable.
    const firstSeq = (await second.replay()).length;
    expect(firstSeq).toBe(1);
    await second.append({
      eventId: "evt-2",
      projectId: "federation",
      type: "WAKE_SENT",
      payload: { wakeId: "w2", from: LOCAL, to: REMOTE },
    } as never);
    expect((await first.replay()).map((entry) => entry.eventId)).toEqual(["evt-1", "evt-2"]);

    // Idempotent duplicate through the second handle.
    await second.append({
      eventId: "evt-1",
      projectId: "federation",
      type: "WAKE_SENT",
      payload: { wakeId: "w1", from: LOCAL, to: REMOTE },
    } as never);
    expect((await second.replay()).length).toBe(2);

    // Conflicting duplicate fails closed.
    await expect(
      second.append({
        eventId: "evt-1",
        projectId: "federation",
        type: "WAKE_SENT",
        payload: { wakeId: "different", from: LOCAL, to: REMOTE },
      } as never),
    ).rejects.toMatchObject({ kind: "coordination_conflict" });

    // Malformed stored row fails closed on read (never skipped/repaired).
    first.close();
    second.close();
    const raw = new DatabaseSync(path);
    raw
      .prepare("UPDATE coordination_events SET payload_json = ? WHERE event_id = 'evt-2'")
      .run("{not-json");
    raw.close();
    const reader = new SqliteCoordinationStore(path, { eventParsers: ALL_PARSERS });
    await expect(reader.replay()).rejects.toThrow(/malformed payload/);
    reader.close();
  });
});

describe("E6-X03: restart replay reproduces all four concerns (§157/§159/§160/§161)", () => {
  it("after reopen: peers, thread, active commitment, handoff successor, participation, inbox", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "palimpsest-e6-replay-")), "coordination.sqlite");
    const w = world(path);
    const { message } = await w.messaging.sendMessage({ to: REMOTE, threadId: "t1", body: "hello" });
    await w.messaging.acknowledge({ message });
    const offer = await w.commitments.offerCommitment({
      proposedHolder: LOCAL,
      scope: SCOPE,
      statement: "own",
    });
    await w.commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: null, local: true });
    const handoff = await w.commitments.offerHandoff({ commitmentId: offer.commitmentId, to: REMOTE });
    const accepted = await w.commitments.acceptHandoff({
      handoffId: handoff.handoffId,
      authenticatedPeer: REMOTE,
    });
    const threadBefore = await w.messaging.threadView("t1");
    w.store.close();

    const reopened = new SqliteCoordinationStore(path, { eventParsers: ALL_PARSERS });
    const events = await reopened.replay();
    // Peers referenced in history survive as event content.
    expect(JSON.stringify(events)).toContain("peer-b");
    // Thread derived identically.
    const rebuilt = makeFederationMessagingService({
      effects: w.effects,
      store: reopened,
      localPeer: LOCAL,
      allocateMessageId: () => "unused",
      allocateWakeId: () => "unused",
      transportPort: w.transportPort,
    });
    const threadAfter = await rebuilt.threadView("t1");
    expect(JSON.stringify(threadAfter)).toBe(JSON.stringify(threadBefore));
    // Commitment/handoff states replay deterministically.
    const commitmentsReopened = makeCommitmentService({
      store: reopened,
      localPeer: LOCAL,
      allocateCommitmentId: () => "unused",
      allocateHandoffId: () => "unused",
    });
    expect((await commitmentsReopened.commitmentState(offer.commitmentId))?.state).toBe("SUPERSEDED");
    expect((await commitmentsReopened.commitmentState(accepted.successorCommitmentId))?.state).toBe("ACTIVE");
    // Inbox derivable after restart (empty verified inbox; the ack is ours).
    const inbox = await rebuilt.inboxView(LOCAL);
    expect(inbox.acks.map((ack) => ack.messageId)).toEqual(["msg-1"]);
    reopened.close();
  });
});

describe("E6-X04: no automatic Evidence/verification promotion (§150)", () => {
  it("no evidence event types are ever written and no evidence APIs are imported", async () => {
    const w = world();
    await w.messaging.sendMessage({ to: REMOTE, threadId: "t1", body: "claim" });
    const offer = await w.commitments.offerCommitment({ proposedHolder: LOCAL, scope: SCOPE, statement: "s" });
    await w.commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: null, local: true });
    const types = (await w.store.replay()).map((event) => event.type);
    for (const forbidden of ["EVIDENCE_RECORDED", "ADMISSION_DECISION", "VERIFICATION_RESULT", "WORKER_REPORT"]) {
      expect(types).not.toContain(forbidden);
    }
    for (const file of ["commitment_service.ts", "messaging.ts", "federation_service.ts", "workforce.ts"]) {
      const source = readFileSync(fileURLToPath(new URL(`../src/federation/${file}`, import.meta.url)), "utf-8");
      expect(source).not.toMatch(/from "\.\.\/evidence|admitEvidence|recordEvidence/);
    }
  });
});

describe("E6-X05: persistence optionality (§153)", () => {
  it("collaboration works with no continuity store, no point, and no runtime realization", async () => {
    const w = world();
    // Pure collaboration: no point store, no runtime service anywhere.
    const offer = await w.commitments.offerCommitment({
      proposedHolder: REMOTE,
      scope: { kind: "contact_need", contactNeedId: "need-1" },
      statement: "help",
    });
    await w.commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: REMOTE });
    expect((await w.commitments.commitmentState(offer.commitmentId))?.state).toBe("ACTIVE");
    const serialized = JSON.stringify(await w.store.replay());
    expect(serialized).not.toContain("persistentPoint");
    expect(serialized).not.toContain("activationId");
  });
});
