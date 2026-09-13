/**
 * G10-E5 federated workforce machine proofs + the §128 end-to-end flow.
 *
 *   E5-M01  real ContactNeed → candidate discovery
 *   E5-M02  candidate discovery does not assign
 *   E5-M03  outbound commitment offer via Ordarium transport (message)
 *   E5-M04  remote acceptance authenticated
 *   E5-M05  commitment → optional Participation, not automatic
 *   E5-M06  ephemeral peer collaboration without PersistentPoint (§114)
 *   E5-M07  FederatedManpowerPointView derived
 *   E5-M08  view identity anchored by PeerRef
 *   E5-M09  focus ≠ authority root
 *   E5-M10  competence ≠ authority
 *   E5-M11  coalition view derived only
 *   E5-M12  scheduler does not choose PeerRef
 *   E5-M13  WorkGraph unchanged
 *   E5-M14  CollaborationEvent ≠ Evidence
 *   E5-M15  full handoff flow (§128 steps 13–16)
 *   E5-M16  no manager hierarchy
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  SqliteCoordinationStore,
} from "../src/coordination/index.js";
import {
  FEDERATION_EVENT_PARSERS,
  COMMITMENT_EVENT_PARSERS,
  callbackPeerTransportPort,
  makeCommitmentService,
  makeFederationMessagingService,
  makeFederationService,
  materializePeerAdvertisement,
  materializePeerRef,
} from "../src/federation/index.js";
import { makeParticipationService } from "../src/coordination/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { materializeActivation } from "../src/runtime/index.js";
import type { Activation } from "../src/runtime/index.js";
import { SqliteAttemptCatalog } from "../src/coordination/index.js";

const LOCAL = materializePeerRef({ peerId: "peer-a" });
const REMOTE = materializePeerRef({ peerId: "peer-b" });
const THIRD = materializePeerRef({ peerId: "peer-c" });

const ALL_PARSERS = { ...FEDERATION_EVENT_PARSERS, ...COMMITMENT_EVENT_PARSERS };

function workDbWithRunningAttempt(): { databasePath: string; attempt: { projectId: string; attemptId: string } } {
  const databasePath = join(mkdtempSync(join(tmpdir(), "palimpsest-e5-work-")), "state.sqlite");
  const database = new DatabaseSync(databasePath);
  database.exec(
    "CREATE TABLE attempts (project_id TEXT NOT NULL, attempt_id TEXT NOT NULL, task_id TEXT, state TEXT NOT NULL, report_json BLOB, state_json BLOB NOT NULL, last_event_id INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (project_id, attempt_id))",
  );
  database
    .prepare(
      "INSERT INTO attempts (project_id, attempt_id, task_id, state, state_json, last_event_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run("p1", "attempt-1", "task-1", "RUNNING", "{}", 1, "2026-01-01T00:00:00.000Z");
  database.close();
  return { databasePath, attempt: { projectId: "p1", attemptId: "attempt-1" } };
}

function makeWorld() {
  const { databasePath, attempt } = workDbWithRunningAttempt();
  const store = new SqliteCoordinationStore(":memory:", { eventParsers: ALL_PARSERS });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-e5-ops-")), "ops.sqlite"),
    git: new FakeGitPort("b".repeat(40)),
  });
  const sent: string[] = [];
  const transportPort = callbackPeerTransportPort("callback", {
    onSend: async (request) => {
      sent.push(request.messageId);
      return { transportMessageId: `transport-${sent.length}`, delivered: true };
    },
    onWake: async () => ({ signaled: true }),
  });
  const advertisements = [
    materializePeerAdvertisement({ peer: REMOTE, competenceTags: ["typescript", "review"] }),
    materializePeerAdvertisement({ peer: THIRD, competenceTags: ["rust"] }),
  ];
  const directory = {
    observePeers: async () => ({ state: "known" as const, value: advertisements }),
  };
  const attemptCatalog = new SqliteAttemptCatalog(databasePath);
  let counters = { message: 0, commitment: 0, handoff: 0, contactNeed: 0, participation: 0, invocation: 0 };
  const messaging = makeFederationMessagingService({
    effects,
    store,
    localPeer: LOCAL,
    allocateMessageId: () => `msg-${++counters.message}`,
    allocateWakeId: () => `wake-${counters.message}`,
    transportPort,
  });
  const commitments = makeCommitmentService({
    store,
    localPeer: LOCAL,
    allocateCommitmentId: () => `com-${++counters.commitment}`,
    allocateHandoffId: () => `ho-${++counters.handoff}`,
  });
  const participation = makeParticipationService({
    store,
    attempts: attemptCatalog,
    allocateInvocationId: () => `inv-${++counters.invocation}`,
    allocateParticipationId: () => `part-${++counters.participation}`,
  });
  const federation = makeFederationService({
    store,
    localPeer: LOCAL,
    messaging,
    commitments,
    participation,
    directory,
    allocateContactNeedId: () => `need-${++counters.contactNeed}`,
  });
  // A second local instance acting as Peer-B (the remote side of the flow).
  const remoteCommitments = makeCommitmentService({
    store,
    localPeer: REMOTE,
    allocateCommitmentId: () => `com-b-${++counters.commitment}`,
    allocateHandoffId: () => `ho-b-${++counters.handoff}`,
  });
  return { store, effects, transportPort, sent, attempt, federation, commitments, remoteCommitments, participation };
}

function testActivation(): Activation {
  return materializeActivation({
    activationId: "act-e5",
    agentDefinitionId: "agent-1",
    runDefinition: { digest: "rd-e5" },
    bindingResolution: { resolutionId: "res-e5", digest: "rr-e5" },
  });
}

describe("E5-M01/M02/M06: contact discovery is explicit and non-assigning", () => {
  it("a declared need discovers candidates; candidates mutate nothing", async () => {
    const world = makeWorld();
    const need = await world.federation.declareContactNeed({
      origin: { kind: "attempt", attempt: world.attempt },
      competenceTags: ["typescript"],
      reason: "need a typescript reviewer",
    });
    const discovery = await world.federation.findCandidates(need);
    if (discovery.status !== "discovered") throw new Error("expected discovered");
    expect(discovery.candidates.map((candidate) => candidate.peer.peerId)).toEqual(["peer-b"]);
    // Nothing was assigned or recorded by discovery.
    expect(await world.store.replay()).toEqual([]);
    // E5-M06: no PersistentPoint is involved anywhere in the flow.
    const serialized = JSON.stringify(discovery);
    expect(serialized).not.toContain("persistentPoint");
  });
});

describe("E5-M03/M04/M09/M10: no global planner; focus/competence grant nothing", () => {
  it("the federation service exposes no assignment/manager APIs and no authority root", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../src/federation/federation_service.ts", import.meta.url)),
      "utf-8",
    ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const forbidden of [
      "assignPeerToTask",
      "forcePeerParticipation",
      "setWorker",
      "WorkforceManager",
      "GlobalAgentManager",
      "AuthorityRoot",
      "Scheduler",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

describe("§128 end-to-end: need → candidate → offer → authenticated acceptance → participation → handoff", () => {
  it("executes the full bottom-up collaboration flow with no global manager", async () => {
    const world = makeWorld();

    // 1–2: canonical Attempt exists (validated) and a canonical Activation exists independently.
    const activation = testActivation();
    // Step 1 is validated implicitly: beginParticipation below asserts the
    // canonical Attempt through SqliteAttemptCatalog, so an absent/terminal
    // Attempt would fail closed.
    expect(activation.activationId).toBe("act-e5");

    // 3–4: declared need → discovered candidate Peer-B.
    const need = await world.federation.declareContactNeed({
      origin: { kind: "attempt", attempt: world.attempt },
      competenceTags: ["typescript", "review"],
      reason: "review the change",
    });
    const discovery = await world.federation.findCandidates(need);
    if (discovery.status !== "discovered") throw new Error("expected discovered");
    expect(discovery.candidates.map((candidate) => candidate.peer.peerId)).toEqual(["peer-b"]);

    // 5: local Peer-A offers a commitment to Peer-B and sends the offer message
    //    through the Ordarium-admitted transport.
    const offer = await world.federation.offerCommitment({
      proposedHolder: REMOTE,
      scope: { kind: "attempt_participation", attempt: world.attempt },
      statement: "review attempt-1",
    });
    const { message, delivered } = await world.federation.sendMessage({
      to: REMOTE,
      threadId: "thread-1",
      body: `commitment offer ${offer.commitmentId}`,
    });
    expect(delivered).toBe(true);
    expect(world.sent).toEqual(["msg-1"]);

    // 7–8: authenticated inbound Peer-B acceptance → ACTIVE.
    await world.federation.acceptCommitment({
      commitmentId: offer.commitmentId,
      authenticatedPeer: REMOTE,
    });
    const active = await world.commitments.commitmentState(offer.commitmentId);
    expect(active?.state).toBe("ACTIVE");
    expect(active?.holder.peerId).toBe("peer-b");

    // E5-M05: participation is NOT automatic — it requires an explicit call.
    const beforeParticipation = (await world.store.replay()).map((event) => event.type);
    expect(beforeParticipation).not.toContain("PARTICIPATION_STARTED");

    // 9: Participation explicitly started against the canonical Attempt + Activation.
    await world.federation.beginParticipation({ activation, attempt: world.attempt });

    // 10–11: messages exchanged; an ack is recorded explicitly.
    await world.federation.acknowledge({ message });
    const thread = await world.federation.thread("thread-1");
    expect(thread.messages.map((entry) => entry.messageId)).toEqual(["msg-1"]);
    expect(thread.ackedMessageIds).toEqual(["msg-1"]);

    // 12: no Evidence was created anywhere (only collaboration event types).
    const types = (await world.store.replay()).map((event) => event.type);
    expect(types).not.toContain("EVIDENCE_RECORDED");
    expect(types).not.toContain("ADMISSION_DECISION");

    // 13–14: Peer-B (the current holder) offers a handoff to Peer-C; Peer-C accepts.
    const handoff = await world.remoteCommitments.offerHandoff({
      commitmentId: offer.commitmentId,
      to: THIRD,
    });
    const accepted = await world.remoteCommitments.acceptHandoff({
      handoffId: handoff.handoffId,
      authenticatedPeer: THIRD,
    });

    // 15–16: old superseded; successor responsibility ACTIVE for Peer-C.
    expect((await world.commitments.commitmentState(offer.commitmentId))?.state).toBe("SUPERSEDED");
    const successor = await world.remoteCommitments.commitmentState(accepted.successorCommitmentId);
    expect(successor?.state).toBe("ACTIVE");
    expect(successor?.holder.peerId).toBe("peer-c");

    // 17–18: no Work event types in the coordination store; scheduler untouched.
    for (const workType of ["TASK_STARTED", "ATTEMPT_STARTED", "PROMOTION_COMMITTED"]) {
      expect(types).not.toContain(workType);
    }

    // 19: no global manager API exists (structural assertion above); the
    // coalition view is derived, not an organization.
    const coalition = await world.federation.coalition("p1/attempt-1");
    expect(coalition.scope).toBe("p1/attempt-1");
    expect(coalition.peers.map((peer) => peer.peerId)).toEqual(["peer-c"]);
    expect(coalition).not.toHaveProperty("manager");
    expect(coalition).not.toHaveProperty("organization");
  });
});

describe("E5-M07/M08/M09/M11: derived views", () => {
  it("manpower point view is anchored by PeerRef and derived from events", async () => {
    const world = makeWorld();
    const offer = await world.federation.offerCommitment({
      proposedHolder: LOCAL,
      scope: { kind: "contact_need", contactNeedId: "need-1" },
      statement: "self-commit",
    });
    await world.federation.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: null, local: true });
    const view = await world.federation.manpowerPoint(LOCAL);
    expect(view.peer.peerId).toBe("peer-a");
    expect(view.activeCommitments.map((entry) => entry.commitmentId)).toEqual([offer.commitmentId]);
    expect(view).not.toHaveProperty("manpowerPointId");
    expect(view).not.toHaveProperty("runtimeAgent");
    // No continuity association source → no continuity field (never assumed).
    expect(view.continuity).toBeUndefined();
  });

  it("coalition view contains no hierarchy fields and is derived only", async () => {
    const world = makeWorld();
    const coalition = await world.federation.coalition("p1/attempt-1");
    expect(coalition.peers).toEqual([]);
    expect(Object.keys(coalition).sort()).toEqual(["peers", "scope"]);
  });
});

describe("E5-M12/M13/M14/M16: non-regression and boundaries", () => {
  it("scheduler/federation source boundaries hold; views carry no evidence or hierarchy", () => {
    const workforceSource = readFileSync(
      fileURLToPath(new URL("../src/federation/workforce.ts", import.meta.url)),
      "utf-8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(workforceSource).not.toMatch(/Scheduler|manager|subordinate|authorityChain/);
    const indexSource = readFileSync(
      fileURLToPath(new URL("../src/index.ts", import.meta.url)),
      "utf-8",
    );
    // §135: the root contract-core export stays free of federation/runtime mutation surfaces.
    expect(indexSource).not.toMatch(/federation|coordination/);
  });
});
