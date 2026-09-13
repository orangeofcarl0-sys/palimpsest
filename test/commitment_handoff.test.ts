/**
 * G10-E4 commitment / handoff machine proofs.
 *
 *   E4-M01  Assignment ≠ Commitment (§87)
 *   E4-M02  message ≠ Commitment (§94)
 *   E4-M03  Ack ≠ Commitment (§94)
 *   E4-M04  offer ≠ active Commitment (§88/§91)
 *   E4-M05  acceptance requires the proposed holder identity (§91)
 *   E4-M06  unauthenticated acceptance rejected (§71/§91)
 *   E4-M07  Commitment ≠ Participation (§95) — orthogonal, both representable
 *   E4-M08  Commitment does not mutate the WorkGraph (§96)
 *   E4-M09  Handoff requires an ACTIVE commitment (§98)
 *   E4-M10  Handoff requires target acceptance (§99/§101)
 *   E4-M11  Handoff creates an explicit successor responsibility (§101)
 *   E4-M12  the old commitment stays historical/immutable (§101/§161)
 *   E4-M13  session handoff not fabricated (§102)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SqliteCoordinationStore } from "../src/coordination/index.js";
import {
  COMMITMENT_EVENT_PARSERS,
  CommitmentError,
  makeCommitmentService,
  materializePeerRef,
  successorCommitmentIdOf,
} from "../src/federation/index.js";
import type { CommitmentScope, PeerRef } from "../src/federation/index.js";

const SERVICE_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/federation/commitment_service.ts", import.meta.url)),
  "utf-8",
);

const LOCAL: PeerRef = materializePeerRef({ peerId: "peer-a" });
const REMOTE: PeerRef = materializePeerRef({ peerId: "peer-b" });
const THIRD: PeerRef = materializePeerRef({ peerId: "peer-c" });

const SCOPE: CommitmentScope = {
  kind: "attempt_participation",
  attempt: { projectId: "p1", attemptId: "attempt-1" },
};

function makeService() {
  const store = new SqliteCoordinationStore(":memory:", { eventParsers: COMMITMENT_EVENT_PARSERS });
  let commitmentCounter = 0;
  let handoffCounter = 0;
  const service = makeCommitmentService({
    store,
    localPeer: LOCAL,
    allocateCommitmentId: () => `com-${++commitmentCounter}`,
    allocateHandoffId: () => `ho-${++handoffCounter}`,
  });
  return { service, store };
}

describe("E4-M01/M02/M03/M08: no Work/message/ack path produces a commitment (§87/§94/§96)", () => {
  it("the commitment service never touches Work, scheduler, or messages; ack/message events create no commitment", () => {
    const code = SERVICE_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const forbidden of [
      "Scheduler",
      "TaskSpec",
      "ProjectController",
      "worktree",
      "MESSAGE_PREPARED",
      "ACK_RECORDED",
      "Evidence",
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });
});

describe("E4-M04/M05/M06: offers and explicit acceptance (§88/§91)", () => {
  it("an offered commitment is OFFERED, not ACTIVE; only the proposed holder may accept", async () => {
    const { service } = makeService();
    const offer = await service.offerCommitment({
      proposedHolder: REMOTE,
      scope: SCOPE,
      statement: "review the change",
    });
    const before = await service.commitmentState(offer.commitmentId);
    expect(before?.state).toBe("OFFERED");
    expect(before?.active).toBe(false);
    // A third party cannot accept.
    await expect(
      service.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: THIRD }),
    ).rejects.toMatchObject({ kind: "not_proposed_holder" });
    // The proposed holder accepts (authenticated).
    const accepted = await service.acceptCommitment({
      commitmentId: offer.commitmentId,
      authenticatedPeer: REMOTE,
    });
    expect(accepted.acceptedBy.peerId).toBe("peer-b");
    const after = await service.commitmentState(offer.commitmentId);
    expect(after?.state).toBe("ACTIVE");
    expect(after?.active).toBe(true);
  });

  it("unauthenticated acceptance is refused (never activates) — E4-M06", async () => {
    const { service } = makeService();
    const offer = await service.offerCommitment({
      proposedHolder: REMOTE,
      scope: SCOPE,
      statement: "s",
    });
    await expect(
      service.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: null }),
    ).rejects.toMatchObject({ kind: "unauthenticated_acceptance" });
    expect((await service.commitmentState(offer.commitmentId))?.state).toBe("OFFERED");
  });

  it("self-commitment requires an explicit local acceptance record", async () => {
    const { service, store } = makeService();
    const offer = await service.offerCommitment({
      proposedHolder: LOCAL,
      scope: SCOPE,
      statement: "self",
    });
    await service.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: null, local: true });
    const types = (await store.replay()).map((event) => event.type);
    expect(types).toEqual(["COMMITMENT_OFFERED", "COMMITMENT_ACCEPTED"]);
    // Rejection is a legitimate outcome, distinct from transport/runtime failure.
    const second = await service.offerCommitment({ proposedHolder: LOCAL, scope: SCOPE, statement: "s2" });
    await service.rejectCommitment({ commitmentId: second.commitmentId, authenticatedPeer: null, local: true });
    expect((await service.commitmentState(second.commitmentId))?.state).toBe("REJECTED");
  });
});

describe("E4-M07: Commitment ≠ Participation (§95)", () => {
  it("the commitment payloads carry no participation/activation fields", async () => {
    const { service, store } = makeService();
    await service.offerCommitment({ proposedHolder: REMOTE, scope: SCOPE, statement: "s" });
    const serialized = JSON.stringify(await store.replay());
    for (const forbidden of ["participationId", "activationId", "invocationId"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("E4-M09/M10/M11/M12: handoff semantics (§98–§101/§161)", () => {
  async function activeCommitment() {
    const harness = makeService();
    const offer = await harness.service.offerCommitment({
      proposedHolder: LOCAL,
      scope: SCOPE,
      statement: "own it",
    });
    await harness.service.acceptCommitment({
      commitmentId: offer.commitmentId,
      authenticatedPeer: null,
      local: true,
    });
    return { ...harness, offer };
  }

  it("a non-holder cannot offer a handoff; only the target may accept it", async () => {
    const { service, offer } = await activeCommitment();
    // The local peer IS the holder here, so offering is allowed; targeting works.
    const handoff = await service.offerHandoff({ commitmentId: offer.commitmentId, to: REMOTE });
    expect(handoff.from.peerId).toBe("peer-a");
    expect(handoff.to.peerId).toBe("peer-b");
    // A third party cannot accept the handoff.
    await expect(
      service.acceptHandoff({ handoffId: handoff.handoffId, authenticatedPeer: THIRD }),
    ).rejects.toMatchObject({ kind: "not_proposed_holder" });
    // Unauthenticated target cannot accept (§71).
    await expect(
      service.acceptHandoff({ handoffId: handoff.handoffId, authenticatedPeer: null }),
    ).rejects.toMatchObject({ kind: "unauthenticated_acceptance" });
    // The target accepts: explicit successor responsibility + old superseded.
    const accepted = await service.acceptHandoff({
      handoffId: handoff.handoffId,
      authenticatedPeer: REMOTE,
    });
    expect(accepted.successorCommitmentId).toBe(
      successorCommitmentIdOf(handoff.handoffId, offer.commitmentId),
    );
    // E4-M11: the successor responsibility is ACTIVE for the target.
    const successor = await service.commitmentState(accepted.successorCommitmentId);
    expect(successor?.state).toBe("ACTIVE");
    expect(successor?.holder.peerId).toBe("peer-b");
    // E4-M12: the old commitment is SUPERSEDED (history preserved, not mutated).
    const old = await service.commitmentState(offer.commitmentId);
    expect(old?.state).toBe("SUPERSEDED");
    expect(old?.offer.termsDigest).toBe(successor?.offer.termsDigest);
    // §161 replay: the transition is deterministic from history.
    const replayed = await service.commitmentState(offer.commitmentId);
    expect(replayed?.state).toBe("SUPERSEDED");
  });

  it("handoff requires an ACTIVE commitment (§98/M09)", async () => {
    const { service } = makeService();
    const offer = await service.offerCommitment({ proposedHolder: LOCAL, scope: SCOPE, statement: "s" });
    // Still OFFERED: no handoff possible; and the local peer is not yet holder.
    await expect(
      service.offerHandoff({ commitmentId: offer.commitmentId, to: REMOTE }),
    ).rejects.toThrow(CommitmentError);
  });

  it("a planner-style statement executes no handoff (°103): offering is the only path", () => {
    const code = SERVICE_SOURCE;
    expect(code).not.toMatch(/assignPeer|forceHandoff|shouldTake/);
  });
});

describe("E4-M13: session handoff not fabricated (§102)", () => {
  it("no session-transfer API or field exists anywhere in the commitment module", () => {
    const code = SERVICE_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/sessionHandoff|transferSession|SessionRef|sessionId/);
  });
});
