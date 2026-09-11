/**
 * PAL-FED-0I epistemic admission acceptance (EXPERIMENTAL).
 *
 * Part 1 proves the deterministic gate/projection state machine (ADM-A00..A09,
 * projection and restart reconstruction) with no model. Part 2 drives a REAL
 * DSH agent with the deterministic scripted model through the agent-scoped
 * `decision_submit` endpoint (Fakes 1..5, ADM-A10) so enforcement is exercised
 * end-to-end, not simulated.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionId } from "@deepseek-ai/dsh-session";
import { assembleContextFor } from "@deepseek-ai/dsh-agent";
import type { Message } from "@deepseek-ai/dsh-llm";
import { afterEach, describe, expect, it } from "vitest";

import { initFabric } from "../src/federation/fabric.js";
import { postEvent } from "../src/federation/events.js";
import { readAllEvents } from "../src/federation/events.js";
import { openFederationStore } from "../src/federation/store.js";
import type { StoredEvent } from "../src/federation/events.js";
import type { PeerRef } from "../src/federation/peers.js";
import {
  ADMISSION_BLOCKED_MESSAGE,
  decideAdmission,
  projectTicket,
  readAdmissionAttempts,
  submitDecision,
  type AdmissionBinding,
  type AdmissionMode,
  type TicketState,
} from "../src/federation/dsh/admission.js";
import { buildPalFedTools } from "../src/federation/dsh/tools.js";
import { openFederationService } from "../src/federation/service.js";
import { bootPeerHost, waitIdle, type DshPeerHost } from "./federation_dsh_host.js";

const FABRIC = "pal-fed-0i-test";
const FOCAL: PeerRef = "palimpsest.main";
const OWNER: PeerRef = "ordarium.main";

const directories: string[] = [];
const hosts: DshPeerHost[] = [];

afterEach(async () => {
  for (const host of hosts.splice(0)) {
    try {
      await host.close();
    } catch {
      // best-effort teardown
    }
  }
  for (const directory of directories.splice(0)) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // OS reclaims the temp dir on Windows after handles release
    }
  }
});

function newRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  directories.push(root);
  return root;
}

let eventCounter = 0;
function storedEvent(
  from: PeerRef,
  to: PeerRef,
  threadId: string,
  kind: "question" | "decision" = "question",
): StoredEvent {
  eventCounter += 1;
  const eventId = `evt-${eventCounter}`;
  return {
    event: {
      schemaVersion: 1,
      eventId,
      threadId,
      from,
      to,
      kind,
      body: "boundary delta",
      createdAt: new Date(1_700_000_000_000 + eventCounter).toISOString(),
    },
    key: eventId,
    ref: `plmp.collab.event/${eventId}@1`,
  };
}

function binding(
  root: string,
  mode: AdmissionMode,
  ticketInitial: "NONE" | "OPEN",
  runId = `run-${mode}-${ticketInitial}`,
): AdmissionBinding {
  return {
    mode,
    runId,
    resolutionOwner: OWNER,
    ticketInitial,
    attemptLogPath: join(root, `${runId}.admission.jsonl`),
  };
}

function config(root: string, mode: AdmissionMode, ticketInitial: "NONE" | "OPEN") {
  return { ...binding(root, mode, ticketInitial), focalPeer: FOCAL };
}

function decision(
  mode: AdmissionMode,
  disposition: "resolved" | "unresolved",
  ticket: TicketState,
  priorSoftInterventions = 0,
) {
  return decideAdmission({ mode, disposition, ticket, priorSoftInterventions });
}

// ---------------------------------------------------------------------------
// Part 1 — deterministic gate and projection state machine
// ---------------------------------------------------------------------------

describe("PAL-FED-0I admission state machine (machine proof)", () => {
  it("ADM-A00: V/L/N (ticket NONE) are never blocked in any arm", () => {
    for (const mode of ["A0", "A1", "A2"] as const) {
      const d = decision(mode, "resolved", "NONE");
      expect(d.admitted, `${mode} resolved/NONE`).toBe(true);
      expect(d.outcome).toBe("POLICY_ADMISSIBLE_RESOLVED");
    }
  });

  it("ADM-A01: A0 passes through an open boundary", () => {
    const d = decision("A0", "resolved", "OPEN");
    expect(d.admitted).toBe(true);
    expect(d.reasonCode).toBeUndefined();
  });

  it("ADM-A02: A1 first soft intervention blocks the first resolved submission", () => {
    const d = decision("A1", "resolved", "OPEN", 0);
    expect(d.admitted).toBe(false);
    expect(d.outcome).toBe("POLICY_BLOCKED");
    expect(d.reasonCode).toBe("UNRESOLVED_LOAD_BEARING_AUTHORITY_BOUNDARY");
  });

  it("ADM-A03: A1 admits a later resolved submission (enforcement exhausted)", () => {
    const d = decision("A1", "resolved", "OPEN", 1);
    expect(d.admitted).toBe(true);
    expect(d.outcome).toBe("POLICY_ADMISSIBLE_RESOLVED");
  });

  it("ADM-A04: A2 stays blocked on repeated resolved submissions while uncleared", () => {
    for (const ticket of ["OPEN", "CONSULTING"] as const) {
      for (const prior of [0, 1, 2, 5]) {
        const d = decision("A2", "resolved", ticket, prior);
        expect(d.admitted, `A2 ${ticket} prior=${prior}`).toBe(false);
        expect(d.outcome).toBe("POLICY_BLOCKED");
      }
    }
  });

  it("ADM-A05: unresolved is always admitted in every arm and ticket state", () => {
    for (const mode of ["A0", "A1", "A2"] as const) {
      for (const ticket of ["NONE", "OPEN", "CONSULTING", "OWNER_RESPONSE_RECEIVED"] as const) {
        const d = decision(mode, "unresolved", ticket, 3);
        expect(d.admitted, `${mode} unresolved/${ticket}`).toBe(true);
        expect(d.outcome).toBe("POLICY_ADMISSIBLE_UNRESOLVED");
      }
    }
  });

  it("ADM-A06: owner participation permits A2 policy admission (not verification)", () => {
    const d = decision("A2", "resolved", "OWNER_RESPONSE_RECEIVED", 0);
    expect(d.admitted).toBe(true);
    expect(d.outcome).toBe("POLICY_ADMISSIBLE_OWNER_PARTICIPATION");
  });

  it("ADM-A07: a focal's own outbound contact alone does not clear A2", () => {
    const events = [storedEvent(FOCAL, OWNER, "thread-1")];
    const projection = projectTicket({
      initial: "OPEN",
      focalPeer: FOCAL,
      resolutionOwner: OWNER,
      events,
    });
    expect(projection.state).toBe("CONSULTING");
    expect(decision("A2", "resolved", projection.state).admitted).toBe(false);
  });

  it("ADM-A08: wrong peer, unrelated thread, ack-like events never produce an owner receipt", () => {
    const cases: StoredEvent[][] = [
      // Reply sent by the configured owner but not addressed to the focal.
      [storedEvent(FOCAL, OWNER, "thread-1"), storedEvent(OWNER, OWNER, "thread-1")],
      // Right owner, unrelated thread.
      [storedEvent(FOCAL, OWNER, "thread-1"), storedEvent(OWNER, FOCAL, "thread-2")],
      // Focal's own outbound repeated.
      [storedEvent(FOCAL, OWNER, "thread-1"), storedEvent(FOCAL, OWNER, "thread-1")],
    ];
    for (const events of cases) {
      const projection = projectTicket({
        initial: "OPEN",
        focalPeer: FOCAL,
        resolutionOwner: OWNER,
        events,
      });
      expect(projection.state).toBe("CONSULTING");
      expect(projection.ownerResponseEventId).toBeUndefined();
    }
  });

  it("projection: manifest I + no events -> OPEN; + focal->owner -> CONSULTING; + owner reply -> OWNER_RESPONSE_RECEIVED", () => {
    const base = { initial: "OPEN" as const, focalPeer: FOCAL, resolutionOwner: OWNER };
    expect(projectTicket({ ...base, events: [] }).state).toBe("OPEN");
    const consulting = projectTicket({
      ...base,
      events: [storedEvent(FOCAL, OWNER, "t-1")],
    });
    expect(consulting.state).toBe("CONSULTING");
    expect(consulting.consultationThreadId).toBe("t-1");
    const cleared = projectTicket({
      ...base,
      events: [storedEvent(FOCAL, OWNER, "t-1"), storedEvent(OWNER, FOCAL, "t-1", "decision")],
    });
    expect(cleared.state).toBe("OWNER_RESPONSE_RECEIVED");
    expect(cleared.ownerResponseEventId).toBeDefined();
    // V/L/N stay NONE regardless of unrelated cross-peer chatter.
    expect(
      projectTicket({ ...base, initial: "NONE", events: [storedEvent(FOCAL, OWNER, "t-9")] }).state,
    ).toBe("NONE");
  });

  it("first qualifying focal->owner thread is the canonical consultation thread", () => {
    const projection = projectTicket({
      initial: "OPEN",
      focalPeer: FOCAL,
      resolutionOwner: OWNER,
      events: [
        storedEvent(FOCAL, OWNER, "t-first"),
        storedEvent(FOCAL, OWNER, "t-second"),
        storedEvent(OWNER, FOCAL, "t-second", "decision"),
      ],
    });
    expect(projection.consultationThreadId).toBe("t-first");
    // Owner replied only on the second thread, so the canonical thread is uncleared.
    expect(projection.state).toBe("CONSULTING");
  });

  it("ADM-A02/A03 via the durable log: A1 blocks once, then admits; A2 never admits", () => {
    const root = newRoot("pal-fed-0i-gate-");
    const a1 = config(root, "A1", "OPEN");
    const first = submitDecision(a1, [], "resolved", "answer A").response;
    expect(first.admission).toBe("not_admitted");
    expect(first.message).toBe(ADMISSION_BLOCKED_MESSAGE);
    const second = submitDecision(a1, [], "resolved", "answer A again").response;
    expect(second.admission).toBe("admitted");
    expect(second.outcome).toBe("POLICY_ADMISSIBLE_RESOLVED");
    const attempts = readAdmissionAttempts(a1.attemptLogPath);
    expect(attempts.map((a) => a.admissionOutcome)).toEqual(["POLICY_BLOCKED", "POLICY_ADMISSIBLE_RESOLVED"]);
    expect(attempts[0]?.conflictDetection).toBe("oracle_fixture");
    expect(attempts[0]?.arm).toBe("A1");

    const a2 = config(root, "A2", "OPEN");
    for (let i = 0; i < 3; i += 1) {
      expect(submitDecision(a2, [], "resolved", "certain").response.admission).toBe("not_admitted");
    }
    expect(readAdmissionAttempts(a2.attemptLogPath)).toHaveLength(3);
  });

  it("restart reconstruction: attempt log alone restores A1 soft-intervention state", () => {
    const root = newRoot("pal-fed-0i-restart-");
    const cfg = config(root, "A1", "OPEN");
    submitDecision(cfg, [], "resolved", "first");
    // Simulate a harness restart: a brand-new gate call reads the same durable
    // log and must treat the intervention as already spent.
    const reconstructed = readAdmissionAttempts(cfg.attemptLogPath);
    expect(reconstructed).toHaveLength(1);
    const afterRestart = submitDecision(config(root, "A1", "OPEN"), [], "resolved", "second");
    expect(afterRestart.response.admission).toBe("admitted");
    expect(afterRestart.attempt.attemptIndex).toBe(1);
  });

  it("restart reconstruction: ticket projection needs no process-local ticket state", () => {
    // Fresh process view: durable events alone reconstruct CONSULTING then
    // OWNER_RESPONSE_RECEIVED; no mutable ticket row exists anywhere.
    const events = [storedEvent(FOCAL, OWNER, "t-1")];
    expect(
      projectTicket({ initial: "OPEN", focalPeer: FOCAL, resolutionOwner: OWNER, events }).state,
    ).toBe("CONSULTING");
    events.push(storedEvent(OWNER, FOCAL, "t-1", "decision"));
    const after = projectTicket({ initial: "OPEN", focalPeer: FOCAL, resolutionOwner: OWNER, events });
    expect(after.state).toBe("OWNER_RESPONSE_RECEIVED");
    expect(submitDecision(config(newRoot("pal-fed-0i-restart2-"), "A2", "OPEN"), events, "resolved", "x").response.admission).toBe("admitted");
  });

  it("ADM-A09: the model has no channel to supply trusted admission state", async () => {
    const root = newRoot("pal-fed-0i-spoof-");
    const db = join(root, "coordination.sqlite");
    const boot = openFederationStore(db);
    await initFabric(boot, { fabricId: FABRIC });
    await boot.close();
    const service = await openFederationService({ dbPath: db, selfPeer: FOCAL, fabricId: FABRIC });
    try {
      const tools = buildPalFedTools({
        service,
        selfPeer: FOCAL,
        fabricId: FABRIC,
        sessionScope: "sess-spoof",
        admission: config(root, "A2", "OPEN"),
      });
      const submit = tools.find((tool) => tool.name === "decision_submit");
      expect(submit).toBeDefined();
      // The entire model-controlled surface is disposition + body.
      const parameters = submit?.parameters as
        | { properties?: Record<string, unknown> }
        | undefined;
      expect(Object.keys(parameters?.properties ?? {}).sort()).toEqual(["body", "disposition"]);
      // The diagnostic must not reveal enforcement mode or treatment identity.
      const description = String(submit?.description ?? "");
      for (const forbidden of ["gate", "A0", "A1", "A2", "conflict", "warning", "blocked", "treatment"]) {
        expect(description.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
      // A call cannot smuggle a trusted field: execute ignores unknown keys and
      // reads the ticket from host-side durable events.
      const result = (await submit?.execute(
        { disposition: "resolved", body: "x", ticketState: "NONE", ownerResponded: true, admissionMode: "A0" } as never,
        { signal: { aborted: false }, callId: "c1", rootCallId: "c1" } as never,
      )) as { admission?: string; outcome?: string };
      expect(result.admission).toBe("not_admitted");
      expect(result.outcome).toBe("POLICY_BLOCKED");
    } finally {
      await service.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Part 2 — real DSH agent through the agent-scoped endpoint
// ---------------------------------------------------------------------------

function lastToolResultText(messages: readonly Message[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message === undefined) continue;
    for (const block of message.content) {
      if (block.type !== "tool-result") continue;
      const text = block.content.find((inner) => inner.type === "text");
      if (text !== undefined && text.type === "text") return text.text;
    }
  }
  return undefined;
}

async function makeFabric(prefix: string): Promise<{ root: string; db: string }> {
  const root = newRoot(prefix);
  const db = join(root, "coordination.sqlite");
  const boot = openFederationStore(db);
  await initFabric(boot, { fabricId: FABRIC });
  await boot.close();
  return { root, db };
}

async function bootFocal(
  base: { root: string; db: string },
  name: string,
  admission: AdmissionBinding,
  scriptFn: (call: number, messages: readonly Message[]) => { text?: string; toolCall?: { name: string; arguments: Record<string, unknown> } },
  initialPrompt: string,
): Promise<DshPeerHost> {
  const dir = join(base.root, name);
  directories.push(dir);
  const host = await bootPeerHost({
    dir,
    dbPath: base.db,
    fabricId: FABRIC,
    selfPeer: FOCAL,
    sessionId: `sess-${name}`,
    cwd: dir,
    scriptFn,
    watchIntervalMs: 250,
    initialPrompt,
    admission,
  });
  hosts.push(host);
  return host;
}

function submitCall(disposition: "resolved" | "unresolved", body: string) {
  return { toolCall: { name: "decision_submit", arguments: { disposition, body } } };
}

async function waitForAttempts(path: string, count: number, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const attempts = readAdmissionAttempts(path);
    if (attempts.length >= count) return attempts;
    if (Date.now() > deadline) throw new Error(`only ${attempts.length} attempts recorded`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("PAL-FED-0I real-agent admission flow (deterministic scripted model)", () => {
  it("ADM-A10: decision_submit is agent-scoped; a subagent never inherits admission authority", async () => {
    const base = await makeFabric("pal-fed-0i-scope-");
    const admission = binding(base.root, "A2", "NONE", "run-scope");
    const host = await bootFocal(base, "focal-scope", admission, () => ({ text: "idle" }), "Stand by.");
    const sub = await host.ctx.agents.create({ sessionId: SessionId("sub-admission") });
    try {
      const peerTools = (await host.ctx.systemPrompt.assemble(assembleContextFor(host.runtime.agent))).tools.map(
        (tool) => tool.name,
      );
      const subTools = (await host.ctx.systemPrompt.assemble(assembleContextFor(sub.agent))).tools.map(
        (tool) => tool.name,
      );
      expect(peerTools).toContain("decision_submit");
      expect(subTools).not.toContain("decision_submit");
    } finally {
      await sub.dispose();
    }
  }, 60_000);

  it("Fake 5: a resolved disposition with no ticket is admitted immediately in every arm", async () => {
    for (const mode of ["A0", "A1", "A2"] as const) {
      const base = await makeFabric(`pal-fed-0i-fake5-${mode}-`);
      const admission = binding(base.root, mode, "NONE", `run-fake5-${mode}`);
      const host = await bootFocal(base, `focal-fake5-${mode}`, admission, (call) =>
        call === 0 ? submitCall("resolved", "scope resolves locally") : { text: "done" },
      "Determine the applicable behaviour.");
      await waitIdle(host);
      const attempts = await waitForAttempts(admission.attemptLogPath, 1);
      expect(attempts[0]?.admissionOutcome, `arm ${mode}`).toBe("POLICY_ADMISSIBLE_RESOLVED");
      expect(attempts[0]?.ticketProjection).toBe("NONE");
    }
  }, 120_000);

  it("Fake 4 (A1): one soft intervention, second resolved submission admitted", async () => {
    const base = await makeFabric("pal-fed-0i-fake4-");
    const admission = binding(base.root, "A1", "OPEN", "run-fake4");
    const results: string[] = [];
    const host = await bootFocal(
      base,
      "focal-fake4",
      admission,
      (call, messages) => {
        const prior = lastToolResultText(messages);
        if (call > 0 && prior !== undefined) results.push(prior);
        if (call === 0) return submitCall("resolved", "record A is global");
        if (call === 1) return submitCall("resolved", "record A is global");
        return { text: "done" };
      },
      "Determine which behaviour applies.",
    );
    await waitIdle(host);
    const attempts = await waitForAttempts(admission.attemptLogPath, 2);
    expect(attempts[0]?.admissionOutcome).toBe("POLICY_BLOCKED");
    expect(attempts[1]?.admissionOutcome).toBe("POLICY_ADMISSIBLE_RESOLVED");
    expect(results[0]).toContain(ADMISSION_BLOCKED_MESSAGE);
  }, 90_000);

  it("Fake 2 (A2): blocked resolved recovers by submitting unresolved", async () => {
    const base = await makeFabric("pal-fed-0i-fake2-");
    const admission = binding(base.root, "A2", "OPEN", "run-fake2");
    const host = await bootFocal(
      base,
      "focal-fake2",
      admission,
      (call) =>
        call === 0
          ? submitCall("resolved", "record A is global")
          : call === 1
            ? submitCall("unresolved", "cannot legitimately determine this yet")
            : { text: "done" },
      "Determine which behaviour applies.",
    );
    await waitIdle(host);
    const attempts = await waitForAttempts(admission.attemptLogPath, 2);
    expect(attempts[0]?.admissionOutcome).toBe("POLICY_BLOCKED");
    expect(attempts[1]?.admissionOutcome).toBe("POLICY_ADMISSIBLE_UNRESOLVED");
  }, 90_000);

  it("Fake 3 (A2): repeated resolved submissions stay blocked until the run limit", async () => {
    const base = await makeFabric("pal-fed-0i-fake3-");
    const admission = binding(base.root, "A2", "OPEN", "run-fake3");
    const host = await bootFocal(
      base,
      "focal-fake3",
      admission,
      (call) => (call < 3 ? submitCall("resolved", `certain attempt ${call}`) : { text: "done" }),
      "Determine which behaviour applies.",
    );
    await waitIdle(host);
    const attempts = await waitForAttempts(admission.attemptLogPath, 3);
    expect(attempts.map((a) => a.admissionOutcome)).toEqual([
      "POLICY_BLOCKED",
      "POLICY_BLOCKED",
      "POLICY_BLOCKED",
    ]);
  }, 90_000);

  it("Fake 1 (A2): block -> contact owner -> authenticated reply -> policy-admitted resolved", async () => {
    const base = await makeFabric("pal-fed-0i-fake1-");
    const admission = binding(base.root, "A2", "OPEN", "run-fake1");
    const host = await bootFocal(
      base,
      "focal-fake1",
      admission,
      (call) =>
        call === 0
          ? submitCall("resolved", "record A is global")
          : call === 1
            ? {
                toolCall: {
                  name: "collab_post",
                  arguments: { to: OWNER, kind: "question", body: "which record is authoritative?" },
                },
              }
            : call === 2
              ? { text: "waiting for the owner" }
              : call === 3
                ? submitCall("resolved", "per the owner: record A is global")
                : { text: "done" },
      "Determine which behaviour applies.",
    );
    await waitIdle(host);
    await waitForAttempts(admission.attemptLogPath, 1);
    // The owner (a separate authority) replies on the focal's consultation thread.
    const store = openFederationStore(base.db);
    let threadId: string | undefined;
    try {
      const events = await readAllEvents(store);
      threadId = events.find((e) => e.event.from === FOCAL && e.event.to === OWNER)?.event.threadId;
    } finally {
      await store.close();
    }
    expect(threadId).toBeDefined();
    if (threadId === undefined) throw new Error("focal never opened a consultation thread");
    // The owner writes an authenticated durable reply on that exact thread.
    const ownerStore = openFederationStore(base.db);
    try {
      await postEvent(
        ownerStore,
        { fabricId: FABRIC, selfPeer: OWNER, clock: () => new Date() },
        { to: FOCAL, kind: "decision", body: "record A is authoritative", threadId },
      );
    } finally {
      await ownerStore.close();
    }
    const attempts = await waitForAttempts(admission.attemptLogPath, 2, 30_000);
    expect(attempts[0]?.admissionOutcome).toBe("POLICY_BLOCKED");
    expect(attempts[1]?.admissionOutcome).toBe("POLICY_ADMISSIBLE_OWNER_PARTICIPATION");
    expect(attempts[1]?.ownerResponded).toBe(true);
  }, 120_000);
});
