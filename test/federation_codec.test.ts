/**
 * PAL-FED-0 durable codec strictness (§35) — EXPERIMENTAL.
 *
 * The decoders are the single trust boundary for durable records: unknown
 * fields, closed unions, peer identity, digests and cross-field invariants are
 * all machine-checked here.
 */

import { describe, expect, it } from "vitest";

import {
  decodeBoundaryContract,
  decodeCollaborationEvent,
  decodeFabricMarker,
  decodePeerInboxState,
  encodeBoundaryContract,
  encodeCollaborationEvent,
  encodeFabricMarker,
  encodePeerInboxState,
  termsDigestOf,
} from "../src/federation/codec.js";
import type {
  BoundaryContract,
  CollaborationEvent,
  ContractTerms,
  FederationFabricMarker,
  PeerInboxState,
} from "../src/federation/types.js";

const terms: ContractTerms = {
  requirements: ["A"],
  constraints: [],
  interfaceNotes: [],
  acceptanceCriteria: [],
  openQuestions: [],
};

const event: CollaborationEvent = {
  schemaVersion: 1,
  eventId: "evt_1",
  threadId: "thr_1",
  from: "palimpsest.main",
  to: "ordarium.main",
  kind: "need",
  body: "boundary delta",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const contract: BoundaryContract = {
  schemaVersion: 1,
  contractId: "ctr_1",
  participants: ["palimpsest.main", "ordarium.main"],
  title: "t",
  terms,
  termsDigest: termsDigestOf(terms),
  proposedBy: "palimpsest.main",
  acceptedBy: [],
  status: "draft",
  updatedBy: "palimpsest.main",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const fabric: FederationFabricMarker = {
  schemaVersion: 1,
  protocol: "PAL-FED-0",
  fabricId: "f",
  peers: ["palimpsest.main", "ordarium.main"],
  createdAt: "2026-01-01T00:00:00.000Z",
};

const peerState: PeerInboxState = {
  schemaVersion: 1,
  peer: "ordarium.main",
  eventCursor: "v1:abc",
  pending: { batchId: "bat_1", eventNextCursor: "v1:def", eventIds: ["evt_1"], contractRevisions: [] },
  lastAckedBatchId: "bat_0",
};

describe("PAL-FED-0 durable codec (§35)", () => {
  it("round-trips every durable shape", () => {
    expect(decodeCollaborationEvent(encodeCollaborationEvent(event))).toEqual(event);
    expect(decodeBoundaryContract(encodeBoundaryContract(contract))).toEqual(contract);
    expect(decodeFabricMarker(encodeFabricMarker(fabric))).toEqual(fabric);
    expect(decodePeerInboxState(encodePeerInboxState(peerState))).toEqual(peerState);
  });

  it("rejects unknown durable fields", () => {
    expect(() =>
      decodeCollaborationEvent({ ...encodeCollaborationEvent(event), persona: "architect" }),
    ).toThrowError(/unknown field 'persona'/);
    expect(() =>
      decodeFabricMarker({ ...encodeFabricMarker(fabric), extra: 1 }),
    ).toThrowError(/unknown field 'extra'/);
  });

  it("rejects a self-addressed event and an unknown peer", () => {
    expect(() =>
      decodeCollaborationEvent({ ...encodeCollaborationEvent(event), to: "palimpsest.main" }),
    ).toThrowError(/cannot be addressed from and to/);
    expect(() =>
      decodeCollaborationEvent({ ...encodeCollaborationEvent(event), from: "someone.else" }),
    ).toThrowError(/is not a PAL-FED-0 peer/);
  });

  it("rejects a fabric marker with the wrong protocol or peer set", () => {
    expect(() => decodeFabricMarker({ ...encodeFabricMarker(fabric), protocol: "OTHER" })).toThrowError(
      /protocol/,
    );
    expect(() =>
      decodeFabricMarker({ ...encodeFabricMarker(fabric), peers: ["palimpsest.main", "palimpsest.main"] }),
    ).toThrowError(/peers/);
  });

  it("rejects a contract whose termsDigest does not bind its terms", () => {
    expect(() =>
      decodeBoundaryContract({ ...encodeBoundaryContract(contract), termsDigest: "0".repeat(64) }),
    ).toThrowError(/does not bind the stored terms/);
  });

  it("rejects an acceptance bound to a stale digest", () => {
    const tampered = {
      ...encodeBoundaryContract(contract),
      acceptedBy: [
        { peer: "ordarium.main", termsDigest: "1".repeat(64), acceptedAt: "2026-01-01T00:00:00.000Z" },
      ],
    };
    expect(() => decodeBoundaryContract(tampered)).toThrowError(/stale digest/);
  });

  it("termsDigestOf is canonical and order-insensitive to object key order", () => {
    const reordered: ContractTerms = {
      openQuestions: [],
      acceptanceCriteria: [],
      interfaceNotes: [],
      constraints: [],
      requirements: ["A"],
    };
    expect(termsDigestOf(reordered)).toBe(termsDigestOf(terms));
  });
});
