/**
 * PAL-FED-0 machine acceptance — fabric, events, inbox crash safety,
 * BoundaryContract (EXPERIMENTAL).
 *
 * Covers §50 FED-A01..A04, §51 FED-B01..B04, §52 FED-C01..C05,
 * §53 FED-D01..D06, plus the §36 size discipline. The two peers are real
 * adapter services against one on-disk coordination DB; the process-level
 * suite (federation_process.test.ts) adds the two-process proof.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { encodeCollaborationEvent, encodePeerInboxState } from "../src/federation/codec.js";
import { initFabric, readFabricMarker } from "../src/federation/fabric.js";
import { NS_EVENT, NS_PEERSTATE } from "../src/federation/limits.js";
import { openFederationService, type FederationService } from "../src/federation/service.js";
import { federationIdentity, openFederationStore } from "../src/federation/store.js";
import type { ContractTerms } from "../src/federation/types.js";

const FABRIC = "pal-fed-test";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // Windows may still hold a handle; the OS reclaims the temp dir.
    }
  }
});

function newDbPath(): string {
  const directory = mkdtempSync(join(tmpdir(), "pal-fed-"));
  directories.push(directory);
  return join(directory, "coordination.sqlite");
}

function makeClock(): () => Date {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + tick++ * 1_000);
}

const terms = (requirement: string): ContractTerms => ({
  requirements: [requirement],
  constraints: [],
  interfaceNotes: [],
  acceptanceCriteria: [],
  openQuestions: [],
});

interface Rig {
  readonly db: string;
  readonly p: FederationService;
  readonly o: FederationService;
  open(peer: "palimpsest.main" | "ordarium.main"): Promise<FederationService>;
  close(): Promise<void>;
}

async function makeRig(): Promise<Rig> {
  const db = newDbPath();
  const clock = makeClock();
  const boot = openFederationStore(db, clock);
  await initFabric(boot, { fabricId: FABRIC });
  await boot.close();
  const open = (peer: "palimpsest.main" | "ordarium.main") =>
    openFederationService({ dbPath: db, selfPeer: peer, fabricId: FABRIC, clock });
  const p = await open("palimpsest.main");
  const o = await open("ordarium.main");
  return {
    db,
    p,
    o,
    open,
    async close() {
      await p.close();
      await o.close();
    },
  };
}

describe("PAL-FED-0 fabric identity (§50)", () => {
  it("FED-A01: a fresh DB is not a fabric until explicit init", async () => {
    const db = newDbPath();
    const probe = openFederationStore(db);
    expect(await readFabricMarker(probe)).toBeUndefined();
    await probe.close();

    await expect(
      openFederationService({ dbPath: db, selfPeer: "palimpsest.main", fabricId: FABRIC }),
    ).rejects.toMatchObject({ code: "FED_FABRIC_MISSING" });
  });

  it("FED-A02: adapter configured with the wrong fabricId fails closed", async () => {
    const rig = await makeRig();
    try {
      await expect(
        openFederationService({ dbPath: rig.db, selfPeer: "palimpsest.main", fabricId: "some-other" }),
      ).rejects.toMatchObject({ code: "FED_FABRIC_MISMATCH" });
    } finally {
      await rig.close();
    }
  });

  it("FED-A03: a self or target not in the fabric is rejected", async () => {
    const rig = await makeRig();
    try {
      await expect(
        openFederationService({
          dbPath: rig.db,
          selfPeer: "intruder.main" as never,
          fabricId: FABRIC,
        }),
      ).rejects.toMatchObject({ code: "FED_PEER_UNKNOWN" });
      await expect(
        rig.p.post({ to: "intruder.main", kind: "need", body: "let me in" }),
      ).rejects.toMatchObject({ code: "FED_INPUT" });
    } finally {
      await rig.close();
    }
  });

  it("FED-A04: model input cannot claim another `from`; author is the configured peer", async () => {
    const rig = await makeRig();
    try {
      await expect(
        rig.p.post({
          from: "ordarium.main",
          to: "ordarium.main",
          kind: "need",
          body: "spoofed principal",
        }),
      ).rejects.toMatchObject({ code: "FED_INPUT" });

      const posted = await rig.p.post({ to: "ordarium.main", kind: "need", body: "real" });
      expect(posted.event.from).toBe("palimpsest.main");
      const stored = await rig.p.listEvents();
      expect(stored).toHaveLength(1);
      expect(stored[0]!.event.from).toBe("palimpsest.main");
    } finally {
      await rig.close();
    }
  });
});

describe("PAL-FED-0 CollaborationEvent (§51)", () => {
  it("FED-B01: bilateral post/read; own outbound is not inbound work", async () => {
    const rig = await makeRig();
    try {
      const posted = await rig.p.post({ to: "ordarium.main", kind: "need", body: "need X" });
      const inbound = await rig.o.inbox();
      expect(inbound.batchId).not.toBeNull();
      expect(inbound.events.map((item) => item.event.eventId)).toEqual([posted.event.eventId]);
      expect(inbound.events[0]!.event.to).toBe("ordarium.main");

      const mine = await rig.p.inbox();
      expect(mine.batchId).toBeNull();
      expect(mine.events).toHaveLength(0);
    } finally {
      await rig.close();
    }
  });

  it("FED-B02: an event subject is revision 1 only; rewriting it fails", async () => {
    const rig = await makeRig();
    try {
      const posted = await rig.p.post({ to: "ordarium.main", kind: "decision", body: "frozen" });
      const raw = openFederationStore(rig.db);
      try {
        const record = await raw.state.get(NS_EVENT, posted.event.eventId);
        expect(record?.revision).toBe(1);
        await expect(
          raw.state.write({
            namespace: NS_EVENT,
            key: posted.event.eventId,
            expectedRevision: 0,
            value: encodeCollaborationEvent(posted.event),
            identity: federationIdentity(FABRIC, "tamper"),
          }),
        ).rejects.toMatchObject({ code: "STATE_REVISION_CONFLICT" });
      } finally {
        await raw.close();
      }
    } finally {
      await rig.close();
    }
  });

  it("FED-B03: a thread is reconstructed in durable feed order", async () => {
    const rig = await makeRig();
    try {
      const threadId = "thr_acceptance";
      const first = await rig.p.post({ to: "ordarium.main", threadId, kind: "question", body: "q1" });
      const second = await rig.o.post({ to: "palimpsest.main", threadId, kind: "decision", body: "a1" });
      const view = await rig.p.thread({ threadId });
      expect(view.events.map((entry) => entry.event.eventId)).toEqual([
        first.event.eventId,
        second.event.eventId,
      ]);
    } finally {
      await rig.close();
    }
  });

  it("FED-B04: a dangling StateRef fails through Ordarium", async () => {
    const rig = await makeRig();
    try {
      await expect(
        rig.p.post({
          to: "ordarium.main",
          kind: "evidence",
          body: "cites a missing event",
          replyToEventId: "evt_does_not_exist",
        }),
      ).rejects.toMatchObject({ code: "STATE_REF_NOT_FOUND" });
    } finally {
      await rig.close();
    }
  });

  it("§36: oversized body and artifact count are rejected", async () => {
    const rig = await makeRig();
    try {
      await expect(
        rig.p.post({ to: "ordarium.main", kind: "need", body: "x".repeat(9_000) }),
      ).rejects.toMatchObject({ code: "FED_INPUT" });
      await expect(
        rig.p.post({
          to: "ordarium.main",
          kind: "evidence",
          body: "too many artifacts",
          artifacts: Array.from({ length: 17 }, (_value, index) => ({
            kind: "url" as const,
            locator: `https://example.invalid/${index}`,
          })),
        }),
      ).rejects.toMatchObject({ code: "FED_INPUT" });
    } finally {
      await rig.close();
    }
  });
});

describe("PAL-FED-0 inbox crash safety (§52)", () => {
  it("FED-C01: an unacked batch is redelivered after restart", async () => {
    const rig = await makeRig();
    try {
      await rig.p.post({ to: "ordarium.main", kind: "need", body: "survive restart" });
      const first = await rig.o.inbox();
      expect(first.batchId).not.toBeNull();
      expect(first.replayed).toBe(false);
      await rig.o.close();

      const restarted = await rig.open("ordarium.main");
      try {
        const replay = await restarted.inbox();
        expect(replay.batchId).toBe(first.batchId);
        expect(replay.replayed).toBe(true);
        expect(replay.events.map((item) => item.event.eventId)).toEqual(
          first.events.map((item) => item.event.eventId),
        );
      } finally {
        await restarted.close();
      }
    } finally {
      await rig.p.close();
    }
  });

  it("FED-C02: after ack the batch is not returned again", async () => {
    const rig = await makeRig();
    try {
      await rig.p.post({ to: "ordarium.main", kind: "need", body: "ack me" });
      const first = await rig.o.inbox();
      const acked = await rig.o.ack({ batchId: first.batchId });
      expect(acked.changed).toBe(true);
      const next = await rig.o.inbox();
      expect(next.batchId).toBeNull();
      expect(next.events).toHaveLength(0);
    } finally {
      await rig.close();
    }
  });

  it("FED-C03: a foreign batch id cannot move the cursor", async () => {
    const rig = await makeRig();
    try {
      await rig.p.post({ to: "ordarium.main", kind: "need", body: "keep me pending" });
      const pending = await rig.o.inbox();
      await expect(rig.o.ack({ batchId: "bat_foreign" })).rejects.toMatchObject({
        code: "FED_ACK_INVALID",
      });
      const again = await rig.o.inbox();
      expect(again.batchId).toBe(pending.batchId);
    } finally {
      await rig.close();
    }
  });

  it("FED-C04: a repeated ack of the completed batch is idempotent", async () => {
    const rig = await makeRig();
    try {
      await rig.p.post({ to: "ordarium.main", kind: "need", body: "ack twice" });
      const pending = await rig.o.inbox();
      const first = await rig.o.ack({ batchId: pending.batchId });
      const second = await rig.o.ack({ batchId: pending.batchId });
      expect(first.changed).toBe(true);
      expect(second.changed).toBe(false);
    } finally {
      await rig.close();
    }
  });

  it("FED-C05: an invalid stored cursor is surfaced, never reset", async () => {
    const rig = await makeRig();
    try {
      const raw = openFederationStore(rig.db);
      try {
        await raw.state.write({
          namespace: NS_PEERSTATE,
          key: "ordarium.main",
          expectedRevision: 0,
          value: encodePeerInboxState({
            schemaVersion: 1,
            peer: "ordarium.main",
            eventCursor: "not-a-durable-cursor",
          }),
          identity: federationIdentity(FABRIC, "tamper-cursor"),
        });
      } finally {
        await raw.close();
      }
      await expect(rig.o.inbox()).rejects.toMatchObject({ code: "FED_CURSOR_INVALID" });
      // The tampered cursor is still there: no silent reset to zero.
      const raw2 = openFederationStore(rig.db);
      try {
        const record = await raw2.state.get(NS_PEERSTATE, "ordarium.main");
        expect((record?.value as { eventCursor?: string }).eventCursor).toBe("not-a-durable-cursor");
      } finally {
        await raw2.close();
      }
    } finally {
      await rig.close();
    }
  });
});

describe("PAL-FED-0 BoundaryContract (§53)", () => {
  it("FED-D01: a proposal creates revision 1 as a draft with no forged acceptance", async () => {
    const rig = await makeRig();
    try {
      const created = await rig.p.contractUpdate({
        action: "propose",
        contractId: "ctr_d01",
        expectedRevision: 0,
        title: "restart-stable observation",
        terms: terms("Ordarium exposes an incremental state change feed"),
      });
      expect(created.revision).toBe(1);
      expect(created.contract.status).toBe("draft");
      expect(created.contract.acceptedBy).toEqual([]);
      expect(created.contract.proposedBy).toBe("palimpsest.main");
    } finally {
      await rig.close();
    }
  });

  it("FED-D02: agreement requires both peers to accept the same digest", async () => {
    const rig = await makeRig();
    try {
      await rig.p.contractUpdate({
        action: "propose",
        contractId: "ctr_d02",
        expectedRevision: 0,
        title: "bilateral",
        terms: terms("both sides accept"),
      });
      const digest = (await rig.p.contractGet({ contractId: "ctr_d02" })).contract.termsDigest;
      const afterO = await rig.o.contractUpdate({
        action: "accept",
        contractId: "ctr_d02",
        expectedRevision: 1,
        expectedTermsDigest: digest,
      });
      expect(afterO.contract.status).toBe("draft");
      const afterP = await rig.p.contractUpdate({
        action: "accept",
        contractId: "ctr_d02",
        expectedRevision: 2,
        expectedTermsDigest: digest,
      });
      expect(afterP.contract.status).toBe("agreed");
      expect(afterP.contract.acceptedBy.map((acceptance) => acceptance.peer).sort()).toEqual([
        "ordarium.main",
        "palimpsest.main",
      ]);
    } finally {
      await rig.close();
    }
  });

  it("FED-D03: changed terms clear prior agreement", async () => {
    const rig = await makeRig();
    try {
      await rig.p.contractUpdate({
        action: "propose",
        contractId: "ctr_d03",
        expectedRevision: 0,
        title: "v1",
        terms: terms("original"),
      });
      const digest = (await rig.p.contractGet({ contractId: "ctr_d03" })).contract.termsDigest;
      await rig.o.contractUpdate({
        action: "accept",
        contractId: "ctr_d03",
        expectedRevision: 1,
        expectedTermsDigest: digest,
      });
      const agreed = await rig.p.contractUpdate({
        action: "accept",
        contractId: "ctr_d03",
        expectedRevision: 2,
        expectedTermsDigest: digest,
      });
      expect(agreed.contract.status).toBe("agreed");

      const reproposed = await rig.p.contractUpdate({
        action: "propose",
        contractId: "ctr_d03",
        expectedRevision: 3,
        title: "v2",
        terms: terms("materially different"),
      });
      expect(reproposed.contract.status).toBe("draft");
      expect(reproposed.contract.acceptedBy).toEqual([]);
    } finally {
      await rig.close();
    }
  });

  it("FED-D04: concurrent proposals from the same revision — one wins, one conflicts", async () => {
    const rig = await makeRig();
    try {
      await rig.p.contractUpdate({
        action: "propose",
        contractId: "ctr_d04",
        expectedRevision: 0,
        title: "base",
        terms: terms("base"),
      });
      const winner = await rig.p.contractUpdate({
        action: "propose",
        contractId: "ctr_d04",
        expectedRevision: 1,
        title: "P branch",
        terms: terms("P"),
      });
      expect(winner.revision).toBe(2);
      await expect(
        rig.o.contractUpdate({
          action: "propose",
          contractId: "ctr_d04",
          expectedRevision: 1,
          title: "O branch",
          terms: terms("O"),
        }),
      ).rejects.toMatchObject({ code: "FED_CONFLICT", currentRevision: 2 });
      await expect(
        rig.o.contractUpdate({
          action: "propose",
          contractId: "ctr_d04",
          expectedRevision: 0,
          title: "recreate",
          terms: terms("again"),
        }),
      ).rejects.toMatchObject({ code: "FED_CONFLICT" });
    } finally {
      await rig.close();
    }
  });

  it("FED-D05: acceptance cannot be impersonated and is attributed to the configured peer", async () => {
    const rig = await makeRig();
    try {
      await rig.p.contractUpdate({
        action: "propose",
        contractId: "ctr_d05",
        expectedRevision: 0,
        title: "no impersonation",
        terms: terms("self only"),
      });
      const digest = (await rig.p.contractGet({ contractId: "ctr_d05" })).contract.termsDigest;
      await expect(
        rig.p.contractUpdate({
          action: "accept",
          contractId: "ctr_d05",
          expectedRevision: 1,
          expectedTermsDigest: digest,
          peer: "ordarium.main",
        }),
      ).rejects.toMatchObject({ code: "FED_INPUT" });
      const accepted = await rig.p.contractUpdate({
        action: "accept",
        contractId: "ctr_d05",
        expectedRevision: 1,
        expectedTermsDigest: digest,
      });
      expect(accepted.contract.acceptedBy.map((acceptance) => acceptance.peer)).toEqual([
        "palimpsest.main",
      ]);
    } finally {
      await rig.close();
    }
  });

  it("FED-D06: accepting a digest that is no longer current fails closed", async () => {
    const rig = await makeRig();
    try {
      await rig.p.contractUpdate({
        action: "propose",
        contractId: "ctr_d06",
        expectedRevision: 0,
        title: "v1",
        terms: terms("first"),
      });
      const oldDigest = (await rig.p.contractGet({ contractId: "ctr_d06" })).contract.termsDigest;
      await rig.p.contractUpdate({
        action: "propose",
        contractId: "ctr_d06",
        expectedRevision: 1,
        title: "v2",
        terms: terms("second"),
      });
      await expect(
        rig.o.contractUpdate({
          action: "accept",
          contractId: "ctr_d06",
          expectedRevision: 2,
          expectedTermsDigest: oldDigest,
        }),
      ).rejects.toMatchObject({ code: "FED_CONTRACT_STALE_DIGEST" });
    } finally {
      await rig.close();
    }
  });

  it("accept is idempotent for an already-accepted current digest", async () => {
    const rig = await makeRig();
    try {
      await rig.p.contractUpdate({
        action: "propose",
        contractId: "ctr_idem",
        expectedRevision: 0,
        title: "idempotent",
        terms: terms("once"),
      });
      const digest = (await rig.p.contractGet({ contractId: "ctr_idem" })).contract.termsDigest;
      const first = await rig.o.contractUpdate({
        action: "accept",
        contractId: "ctr_idem",
        expectedRevision: 1,
        expectedTermsDigest: digest,
      });
      expect(first.changed).toBe(true);
      const second = await rig.p.contractGet({ contractId: "ctr_idem" });
      const repeat = await rig.o.contractUpdate({
        action: "accept",
        contractId: "ctr_idem",
        expectedRevision: second.revision,
        expectedTermsDigest: digest,
      });
      expect(repeat.changed).toBe(false);
      expect(repeat.revision).toBe(second.revision);
    } finally {
      await rig.close();
    }
  });
});
