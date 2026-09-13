/**
 * G10-F1 formal Coalition grounding machine proofs (§43).
 *
 *   F1-M01  coalition derived from commitments/participations
 *   F1-M02  messages alone do not create membership
 *   F1-M03  coalition overlap allowed (no unique owner)
 *   F1-M04  coalition has no manager
 *   F1-M05  coalition ≠ organization; derivation writes nothing
 *   F1-M06  snapshot immutable
 *   F1-M07  new history yields a new basis/snapshot; old is historical
 *   F1-M08  coalition provenance does not create an organization
 *   F1-M09  WorkGraph unchanged
 *   F1-M10  scheduler unchanged
 *   plus scope typing, no CoalitionId, strict round-trip/digest fail-closed
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { materializeActivation } from "../src/runtime/index.js";
import type { Activation } from "../src/runtime/index.js";
import {
  SqliteCoordinationStore,
  attemptRefOf,
  makeParticipationService,
} from "../src/coordination/index.js";
import type { AttemptRef } from "../src/coordination/index.js";
import {
  callbackPeerTransportPort,
  deriveCoalitionSnapshot,
  isCoalitionSnapshotCurrent,
  coalitionProvenanceOf,
  makeCommitmentService,
  makeFederationMessagingService,
  materializePeerRef,
  parseCoalitionScope,
  parseCoalitionSnapshot,
} from "../src/federation/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";

const COALITION_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/federation/coalition.ts", import.meta.url)),
  "utf-8",
);
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const LOCAL = materializePeerRef({ peerId: "peer-a" });
const REMOTE = materializePeerRef({ peerId: "peer-b" });
const ATT1: AttemptRef = attemptRefOf("p1", "attempt-1");
const ATT2: AttemptRef = attemptRefOf("p1", "attempt-2");
const SCOPE1 = { kind: "attempt_participation" as const, attempt: ATT1 };
const SCOPE2 = { kind: "attempt_participation" as const, attempt: ATT2 };

function activation(id = "act-1"): Activation {
  return materializeActivation({
    activationId: id,
    agentDefinitionId: "A",
    runDefinition: { digest: "rd-1" },
    bindingResolution: { resolutionId: "res-1", digest: "rr-1" },
  });
}

function world() {
  const store = new SqliteCoordinationStore(":memory:");
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-f1-")), "ops.sqlite"),
    git: new FakeGitPort("c".repeat(40)),
  });
  let sent = 0;
  const transportPort = callbackPeerTransportPort("callback", {
    onSend: async () => ({ transportMessageId: `transport-${++sent}`, delivered: true }),
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
    allocateCommitmentId: () => `c-${++commitmentCounter}`,
    allocateHandoffId: () => `h-${++handoffCounter}`,
  });
  let invocationCounter = 0;
  let participationCounter = 0;
  const participation = makeParticipationService({
    store,
    attempts: { assertAdmissibleAttempt: async () => {} },
    allocateInvocationId: () => `inv-${++invocationCounter}`,
    allocateParticipationId: () => `p-${++participationCounter}`,
  });
  return { store, messaging, commitments, participation, effects };
}

function deepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(deepFrozen);
}

describe("F1-M01: coalition derived from active commitments/participations (§37)", () => {
  it("members are active commitment holders; active participations are recorded as provenance", async () => {
    const w = world();
    const offer = await w.commitments.offerCommitment({
      proposedHolder: REMOTE,
      scope: SCOPE1,
      statement: "help",
    });
    await w.commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: REMOTE });
    await w.participation.beginParticipation({ activation: activation(), attempt: ATT1 });

    const snap = await deriveCoalitionSnapshot(w.store, SCOPE1);
    expect(snap.members.map((member) => member.peerId)).toEqual(["peer-b"]);
    expect(snap.sourceCommitments).toEqual(["c-1"]);
    // Participation is Activation-anchored (no PeerRef) — recorded, not a member.
    expect(snap.sourceParticipations).toEqual(["p-1"]);
  });

  it("an offered-but-unaccepted or released commitment is not a member", async () => {
    const w = world();
    const offer = await w.commitments.offerCommitment({
      proposedHolder: REMOTE,
      scope: SCOPE1,
      statement: "help",
    });
    expect((await deriveCoalitionSnapshot(w.store, SCOPE1)).members).toEqual([]);
    await w.commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: REMOTE });
    expect((await deriveCoalitionSnapshot(w.store, SCOPE1)).members.map((m) => m.peerId)).toEqual(["peer-b"]);
    const second = await w.commitments.offerCommitment({ proposedHolder: LOCAL, scope: SCOPE1, statement: "own" });
    await w.commitments.acceptCommitment({ commitmentId: second.commitmentId, authenticatedPeer: null, local: true });
    await w.commitments.releaseCommitment({ commitmentId: second.commitmentId });
    expect((await deriveCoalitionSnapshot(w.store, SCOPE1)).members.map((m) => m.peerId)).toEqual(["peer-b"]);
  });
});

describe("F1-M02: messages alone do not create membership (§37)", () => {
  it("messages, wakes, and acks produce no coalition members", async () => {
    const w = world();
    const { message } = await w.messaging.sendMessage({ to: REMOTE, threadId: "t1", body: "hi" });
    await w.messaging.acknowledge({ message });
    await w.messaging.wakePeer({ to: REMOTE });
    const snap = await deriveCoalitionSnapshot(w.store, SCOPE1);
    expect(snap.members).toEqual([]);
    expect(snap.sourceCommitments).toEqual([]);
    expect(snap.sourceParticipations).toEqual([]);
  });
});

describe("F1-M03: coalition overlap allowed (§38)", () => {
  it("the same peer is a member of two coalitions; no unique owner field exists", async () => {
    const w = world();
    for (const scope of [SCOPE1, SCOPE2]) {
      const offer = await w.commitments.offerCommitment({ proposedHolder: LOCAL, scope, statement: "own" });
      await w.commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: null, local: true });
    }
    const k1 = await deriveCoalitionSnapshot(w.store, SCOPE1);
    const k2 = await deriveCoalitionSnapshot(w.store, SCOPE2);
    expect(k1.members.map((m) => m.peerId)).toEqual(["peer-a"]);
    expect(k2.members.map((m) => m.peerId)).toEqual(["peer-a"]);
    expect(k1).not.toHaveProperty("groupId");
    expect(k1.members[0]).not.toHaveProperty("organizationId");
    expect(k1.members[0]).not.toHaveProperty("coalitionId");
  });
});

describe("F1-M04: coalition has no manager (§39)", () => {
  it("the snapshot and the module expose no manager/leader/authority concept", () => {
    const code = strip(COALITION_SOURCE);
    expect(code).not.toMatch(/manager|leader|authorityRoot|hierarchy|subordinate/i);
  });
});

describe("F1-M05: coalition ≠ organization; derivation is read-only (§41)", () => {
  it("deriving writes nothing and creates no organization artifact", async () => {
    const w = world();
    const offer = await w.commitments.offerCommitment({ proposedHolder: REMOTE, scope: SCOPE1, statement: "help" });
    await w.commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: REMOTE });
    const before = (await w.store.replay()).length;
    const snap = await deriveCoalitionSnapshot(w.store, SCOPE1);
    expect((await w.store.replay()).length).toBe(before);
    expect(snap).not.toHaveProperty("organization");
    expect(snap).not.toHaveProperty("coalitionId");
    const code = strip(COALITION_SOURCE);
    expect(code).not.toMatch(/organization/i);
  });
});

describe("F1-M06: snapshot immutability (§40)", () => {
  it("the snapshot is deeply frozen", async () => {
    const w = world();
    const offer = await w.commitments.offerCommitment({ proposedHolder: REMOTE, scope: SCOPE1, statement: "help" });
    await w.commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: REMOTE });
    const snap = await deriveCoalitionSnapshot(w.store, SCOPE1);
    expect(deepFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.members)).toBe(true);
    expect(Object.isFrozen(snap.scope)).toBe(true);
  });
});

describe("F1-M07: new history yields a new basis/snapshot (§36/§40)", () => {
  it("a later derivation has a newer basis; the old snapshot is historical", async () => {
    const w = world();
    const offer = await w.commitments.offerCommitment({ proposedHolder: REMOTE, scope: SCOPE1, statement: "help" });
    await w.commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: REMOTE });
    const first = await deriveCoalitionSnapshot(w.store, SCOPE1);
    await w.messaging.wakePeer({ to: REMOTE });
    const second = await deriveCoalitionSnapshot(w.store, SCOPE1);
    expect(second.basis.throughSeq).toBeGreaterThan(first.basis.throughSeq);
    expect(second.basis.digest).not.toBe(first.basis.digest);
    expect(second.digest).not.toBe(first.digest);
    expect(await isCoalitionSnapshotCurrent(w.store, first)).toBe(false);
    expect(await isCoalitionSnapshotCurrent(w.store, second)).toBe(true);
    // The old snapshot is unchanged (immutable history recognition).
    expect(first.basis.throughSeq).toBe(2);
  });
});

describe("F1-M08: coalition provenance does not create an organization (§42)", () => {
  it("provenance cites the snapshot digest and writes nothing", async () => {
    const w = world();
    const offer = await w.commitments.offerCommitment({ proposedHolder: REMOTE, scope: SCOPE1, statement: "help" });
    await w.commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: REMOTE });
    const snap = await deriveCoalitionSnapshot(w.store, SCOPE1);
    const before = (await w.store.replay()).length;
    const provenance = coalitionProvenanceOf(snap);
    expect(provenance.snapshotDigest).toBe(snap.digest);
    expect(provenance.basis.throughSeq).toBe(snap.basis.throughSeq);
    expect((await w.store.replay()).length).toBe(before);
  });
});

describe("F1-M09/M10: WorkGraph and scheduler unchanged", () => {
  it("the coalition module imports no WorkGraph or scheduler concern", () => {
    const code = strip(COALITION_SOURCE);
    expect(code).not.toMatch(/workgraph|scheduler/i);
  });
});

describe("F1 scope typing and strict parsing (§33–§35)", () => {
  it("rejects an arbitrary string scope; accepts only grounded scopes", () => {
    expect(() => parseCoalitionScope("p1/attempt-1")).toThrow();
    expect(() => parseCoalitionScope({ kind: "team", name: "x" })).toThrow();
    expect(parseCoalitionScope(SCOPE1)).toEqual(SCOPE1);
    expect(parseCoalitionScope({ kind: "contact_need", contactNeedId: "need-1" })).toEqual({
      kind: "contact_need",
      contactNeedId: "need-1",
    });
  });

  it("snapshot round-trips strictly and fails closed on a digest mismatch", async () => {
    const w = world();
    const offer = await w.commitments.offerCommitment({ proposedHolder: REMOTE, scope: SCOPE1, statement: "help" });
    await w.commitments.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: REMOTE });
    const snap = await deriveCoalitionSnapshot(w.store, SCOPE1);
    expect(parseCoalitionSnapshot(snap)).toEqual(snap);
    expect(() => parseCoalitionSnapshot({ ...snap, digest: "0".repeat(64) })).toThrow(/digest does not match/);
    expect(() => parseCoalitionSnapshot({ ...snap, rogue: true })).toThrow(/unknown field/);
    // basis is deterministic for the same history
    const again = await deriveCoalitionSnapshot(w.store, SCOPE1);
    expect(again.basis).toEqual(snap.basis);
    expect(again.digest).toBe(snap.digest);
  });
});
