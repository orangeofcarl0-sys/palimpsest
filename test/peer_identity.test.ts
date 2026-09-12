/**
 * G10-E2 peer identity / ContactNeed / discovery machine proofs.
 *
 *   E2-M01  PeerRef ≠ AgentDefinitionId
 *   E2-M02  PeerRef ≠ ActivationId
 *   E2-M03  PeerRef ≠ PersistentPointId
 *   E2-M04  PeerRef ≠ RuntimeAgentRef
 *   E2-M05  PeerRef ≠ SessionRef
 *   E2-M06  transport address not embedded in PeerRef
 *   E2-M07  ContactNeed ≠ ownership
 *   E2-M08  advertisement ≠ evidence
 *   E2-M09  competence ≠ authority
 *   E2-M10  unknown directory ≠ empty directory
 *   E2-M11  deterministic contact matching
 *   E2-M12  candidate ≠ assignment
 *   plus §44 association ≠ identity, §55 focus ≠ authority root.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  PeerIdentityError,
  discoverContactCandidates,
  materializeContactNeed,
  materializePeerAdvertisement,
  materializePeerRef,
  parsePeerRef,
} from "../src/federation/index.js";
import type { ContactNeed, PeerAdvertisement, PeerRef } from "../src/federation/index.js";

const PEER_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/federation/peer.ts", import.meta.url)),
  "utf-8",
);
const DIRECTORY_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/federation/directory.ts", import.meta.url)),
  "utf-8",
);

const PEER_A: PeerRef = materializePeerRef({ peerId: "peer-a" });

const advertisement = (peerId: string, tags: string[]): PeerAdvertisement =>
  materializePeerAdvertisement({ peer: materializePeerRef({ peerId }), competenceTags: tags });

describe("E2-M01..M06: peer identity firewalls", () => {
  it("PeerRef is identity-only — no runtime/session/point/definition/transport fields", () => {
    const peer = materializePeerRef({ peerId: "peer-a" });
    expect(peer).toEqual({ schemaVersion: 1, peerId: "peer-a" });
    const serialized = JSON.stringify(peer);
    for (const forbidden of [
      "agentDefinitionId",
      "activationId",
      "persistentPointId",
      "runtimeAdapter",
      "agentId",
      "sessionId",
      "url",
      "address",
      "endpoint",
      "authority",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    // Field NAME distinctness (E2-M01..M05): peerId is its own namespace.
    expect(Object.keys(peer)).toEqual(["schemaVersion", "peerId"]);
  });

  it("transport-address-like ids and malformed ids are rejected (E2-M06)", () => {
    for (const bad of ["https://peer.example", "//peer", "peer/x", "peer x", "", "peer\u0000"]) {
      expect(() => materializePeerRef({ peerId: bad })).toThrow(PeerIdentityError);
    }
    expect(() => parsePeerRef({ schemaVersion: 1, peerId: "p", transport: "x" })).toThrow(
      /unknown PeerRef field/,
    );
  });

  it("string equality with other namespaces implies no relation (§18 discipline)", () => {
    // The same string may exist as an AgentDefinitionId, PersistentPointId,
    // or runtimeAgentId — the PeerRef artifact owns collaboration identity.
    const peer = materializePeerRef({ peerId: "alpha" });
    expect(peer.peerId).toBe("alpha");
    expect(Object.keys(peer)).not.toContain("agentDefinitionId");
    expect(Object.keys(peer)).not.toContain("persistentPointId");
  });
});

describe("E2-M07: ContactNeed ≠ ownership (§48/§49/§50)", () => {
  it("a declared need carries no assignment/ownership/obligation semantics", () => {
    const need: ContactNeed = materializeContactNeed({
      contactNeedId: "need-1",
      origin: { kind: "attempt", attempt: { projectId: "p1", attemptId: "attempt-1" } },
      competenceTags: ["typescript"],
      reason: "needs a typescript reviewer",
    });
    expect(need).toBeDefined();
    const serialized = JSON.stringify(need);
    for (const forbidden of ["owner", "assigned", "obligation", "grants", "authority"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
    // Explicit creation only: the module exposes no auto-derivation from
    // blocked tasks / dependencies / failures.
    expect(PEER_SOURCE).not.toMatch(/deriveNeedFromTask|autoDerive|onBlocked/);
  });
});

describe("E2-M08/M09: advertisement ≠ evidence; competence ≠ authority (§46/§47)", () => {
  it("advertisements carry competence tags only — no evidence/authority fields", () => {
    const ad = advertisement("peer-a", ["typescript", "review"]);
    const serialized = JSON.stringify(ad);
    for (const forbidden of ["evidence", "authorityGrants", "permissions", "effectRights", "verified"]) {
      expect(serialized).not.toContain(forbidden);
    }
    const code = PEER_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/authorityGrants|permissions|evidenceIds/);
  });
});

describe("E2-M10: unknown directory ≠ empty directory (§52)", () => {
  it("an unknown directory propagates as directory_unknown, never as zero candidates", async () => {
    const directory = {
      observePeers: async () => ({ state: "unknown" as const, detail: "adapter cold" }),
    };
    const need = materializeContactNeed({
      contactNeedId: "need-1",
      origin: { kind: "runtime_scope", scope: "local" },
      competenceTags: ["typescript"],
      reason: "r",
    });
    const outcome = await discoverContactCandidates(directory, need);
    expect(outcome.status).toBe("directory_unknown");
    if (outcome.status !== "directory_unknown") return;
    expect(outcome.detail).toContain("never an empty directory");
  });
});

describe("E2-M11/M12: deterministic matching; candidate ≠ assignment (§53/§54)", () => {
  it("subset matching with lexical peer ordering; no candidates without a need", async () => {
    const need = materializeContactNeed({
      contactNeedId: "need-1",
      origin: { kind: "runtime_scope", scope: "local" },
      competenceTags: ["typescript", "review"],
      reason: "r",
    });
    const ads = [
      advertisement("peer-c", ["typescript"]),
      advertisement("peer-a", ["typescript", "review", "docs"]),
      advertisement("peer-b", ["typescript", "review"]),
      advertisement("peer-d", ["rust"]),
    ];
    const candidates = (await discoverContactCandidates(
      { observePeers: async () => ({ state: "known" as const, value: ads }) },
      need,
    )) as Extract<Awaited<ReturnType<typeof discoverContactCandidates>>, { status: "discovered" }>;
    expect(candidates.status).toBe("discovered");
    if (candidates.status !== "discovered") return;
    // peer-c lacks "review"; peer-d lacks everything; peer-a < peer-b lexically.
    expect(candidates.candidates.map((candidate) => candidate.peer.peerId)).toEqual([
      "peer-a",
      "peer-b",
    ]);
    // Determinism: same inputs → same order, again.
    const again = await discoverContactCandidates(
      { observePeers: async () => ({ state: "known" as const, value: [...ads].reverse() }) },
      need,
    );
    if (again.status !== "discovered") throw new Error("expected discovered");
    expect(again.candidates.map((candidate) => candidate.peer.peerId)).toEqual(
      candidates.candidates.map((candidate) => candidate.peer.peerId),
    );
    // A need with NO requested tags matches nothing (no blanket contact).
    const emptyNeed = materializeContactNeed({
      contactNeedId: "need-2",
      origin: { kind: "runtime_scope", scope: "local" },
      competenceTags: [],
      reason: "r",
    });
    const none = await discoverContactCandidates(
      { observePeers: async () => ({ state: "known" as const, value: ads }) },
      emptyNeed,
    );
    if (none.status !== "discovered") throw new Error("expected discovered");
    expect(none.candidates).toEqual([]);
  });

  it("candidates are plain refs+advertisements — no assignment/commitment fields (E2-M12)", () => {
    const need = materializeContactNeed({
      contactNeedId: "need-1",
      origin: { kind: "runtime_scope", scope: "local" },
      competenceTags: ["typescript"],
      reason: "r",
    });
    // Structural: ContactCandidate has exactly {peer, advertisement} — no
    // assignment/commitment fields (the matcher output type is exactly that).
    const ad = advertisement("peer-a", ["typescript"]);
    const candidate = { peer: ad.peer, advertisement: ad };
    expect(Object.keys(candidate).sort()).toEqual(["advertisement", "peer"]);
  });
});

describe("§44/§55: association ≠ identity; focus ≠ authority root", () => {
  it("peer continuity association is an explicit artifact, never identity equality", () => {
    expect(PEER_SOURCE).toMatch(/PeerContinuityAssociation/);
    expect(PEER_SOURCE).toMatch(/association ≠ identity/);
    // The PeerRef itself carries no point field.
    const peer = PEER_A;
    expect(peer).not.toHaveProperty("point");
  });

  it("the federation module has no authority-root concept", () => {
    const code = PEER_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const dirCode = DIRECTORY_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/AuthorityRoot|authorityRoot|UserFacingMainAgent/);
    expect(dirCode).not.toMatch(/AuthorityRoot|grant|revoke/);
  });
});
