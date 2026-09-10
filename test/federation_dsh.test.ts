/**
 * PAL-FED-0D DSH runtime acceptance (EXPERIMENTAL).
 *
 * Proves the runtime binding, not the federation protocol (already covered by
 * the PAL-FED-0 suites): real DSH Agent registry/session/loop, agent-scoped
 * tool authority, authentic DSH invocation provenance, watcher wake that is not
 * an ack, bidirectional wake, crash/redelivery across a DSH session resume,
 * and the loop-storm negative.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionId } from "@deepseek-ai/dsh-session";
import { assembleContextFor } from "@deepseek-ai/dsh-agent";
import type { Message } from "@deepseek-ai/dsh-llm";
import { afterEach, describe, expect, it } from "vitest";

import { initFabric } from "../src/federation/fabric.js";
import { readAllEvents } from "../src/federation/events.js";
import { NS_EVENT } from "../src/federation/limits.js";
import { openFederationStore } from "../src/federation/store.js";
import type { ScriptedStep } from "../src/federation/dsh/deterministic_llm.js";
import { bootPeerHost, waitIdle, type DshPeerHost } from "./federation_dsh_host.js";

const FABRIC = "pal-fed-dsh-test";
const PAL_FED_TOOLS = [
  "collab_inbox",
  "collab_ack",
  "collab_post",
  "collab_thread",
  "contract_get",
  "contract_update",
];

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

async function makeFabric(): Promise<{ root: string; db: string }> {
  const root = mkdtempSync(join(tmpdir(), "pal-fed-dsh-"));
  directories.push(root);
  const db = join(root, "coordination.sqlite");
  const boot = openFederationStore(db);
  await initFabric(boot, { fabricId: FABRIC });
  await boot.close();
  return { root, db };
}

type StepFactory = (call: number, messages: readonly Message[]) => ScriptedStep;

async function boot(
  base: { root: string; db: string },
  name: string,
  selfPeer: "palimpsest.main" | "ordarium.main",
  scriptFn: StepFactory,
  options: { resume?: boolean; initialPrompt?: string; watchIntervalMs?: number } = {},
): Promise<DshPeerHost> {
  const dir = join(base.root, name);
  directories.push(dir);
  const host = await bootPeerHost({
    dir,
    dbPath: base.db,
    fabricId: FABRIC,
    selfPeer,
    sessionId: `sess-${name}`,
    cwd: dir,
    scriptFn,
    resume: options.resume === true,
    watchIntervalMs: options.watchIntervalMs ?? 300,
    ...(options.initialPrompt === undefined ? {} : { initialPrompt: options.initialPrompt }),
  });
  hosts.push(host);
  return host;
}

/** Last tool-result JSON visible to the model, if any. */
function lastToolResult(messages: readonly Message[]): Record<string, unknown> | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    for (const block of message.content) {
      if (block.type !== "tool-result") continue;
      const text = block.content.find((inner) => inner.type === "text");
      if (text !== undefined && text.type === "text") {
        try {
          return JSON.parse(text.text) as Record<string, unknown>;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 15_000,
  stepMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) throw new Error("condition not met before timeout");
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

async function eventCount(db: string): Promise<number> {
  const store = openFederationStore(db);
  try {
    return (await readAllEvents(store)).length;
  } finally {
    await store.close();
  }
}

describe("PAL-FED-0D DSH runtime binding", () => {
  it("FED-DSH-A00: DSH owns the peer agent: registry, session, loop and typed root", async () => {
    const base = await makeFabric();
    const peer = await boot(base, "probe-p", "palimpsest.main", () => ({ text: "idle" }));

    expect(peer.runtime.agent.id).toBe("sess-probe-p");
    expect(peer.ctx.agents.get(SessionId("sess-probe-p"))).toBe(peer.runtime.agent);
    expect(peer.ctx.agents.roots().map((agent) => agent.id)).toContain("sess-probe-p");
    expect(peer.ctx.agents.isOwnedBy(SessionId("sess-probe-p"), peer.ctx.agents.roots()[0]!)).toBe(false);
    const live = peer.runtime.agent as unknown as { session: unknown; followup: unknown };
    expect(live.session).toBeTruthy();
    expect(typeof live.followup).toBe("function");
    expect(peer.runtime.tools.map((tool) => tool.name).sort()).toEqual([...PAL_FED_TOOLS].sort());

    const assembly = await peer.ctx.systemPrompt.assemble(assembleContextFor(peer.runtime.agent));
    expect(assembly.sections.map((section) => section.name)).toContain("pal-fed:peer-collaboration");
  }, 60_000);

  it("FED-DSH-A01: collaboration tools are agent-scoped; a subagent does not inherit them", async () => {
    const base = await makeFabric();
    const peer = await boot(base, "probe-scope", "palimpsest.main", () => ({ text: "idle" }));

    const sub = await peer.ctx.agents.create({ sessionId: SessionId("sub-1") });
    try {
      const peerAssembly = await peer.ctx.systemPrompt.assemble(assembleContextFor(peer.runtime.agent));
      const subAssembly = await peer.ctx.systemPrompt.assemble(assembleContextFor(sub.agent));
      const peerTools = peerAssembly.tools.map((tool) => tool.name);
      const subTools = subAssembly.tools.map((tool) => tool.name);
      for (const name of PAL_FED_TOOLS) {
        expect(peerTools, `peer sees ${name}`).toContain(name);
        expect(subTools, `subagent hides ${name}`).not.toContain(name);
      }
      expect(subAssembly.sections.map((section) => section.name)).not.toContain(
        "pal-fed:peer-collaboration",
      );
    } finally {
      await sub.dispose();
    }
  }, 60_000);

  it("FED-DSH-A02: a real DSH tool call records authentic invocation provenance", async () => {
    const base = await makeFabric();
    const peer = await boot(
      base,
      "probe-prov",
      "palimpsest.main",
      (call) =>
        call === 0
          ? {
              toolCall: {
                name: "collab_post",
                arguments: { to: "ordarium.main", kind: "need", body: "need restart-stable observation" },
              },
            }
          : { text: "posted" },
      { initialPrompt: "Raise the boundary question with the peer." },
    );

    await waitIdle(peer);
    await waitFor(async () => (await eventCount(base.db)) === 1);

    const store = openFederationStore(base.db);
    try {
      const events = await readAllEvents(store);
      expect(events).toHaveLength(1);
      expect(events[0]!.event.from).toBe("palimpsest.main");
      const record = await store.state.get(NS_EVENT, events[0]!.event.eventId);
      expect(record).toBeDefined();
      expect(record!.identity.source).toBe("dsh");
      expect(record!.identity.actor).toBe("palimpsest.main");
      expect(record!.identity.scope).toBe("sess-probe-prov");
      expect(record!.identity.callId.length).toBeGreaterThan(0);
      expect(record!.identity.rootCallId?.length ?? 0).toBeGreaterThan(0);
    } finally {
      await store.close();
    }
  }, 60_000);

  it("FED-DSH-A03: a pending peer batch wakes the receiving DSH agent; wake is not ack", async () => {
    const base = await makeFabric();
    const palimpsest = await boot(
      base,
      "wake-p",
      "palimpsest.main",
      (call) =>
        call === 0
          ? {
              toolCall: {
                name: "collab_post",
                arguments: { to: "ordarium.main", kind: "need", body: "wake the peer" },
              },
            }
          : { text: "sent" },
      { initialPrompt: "Contact the peer." },
    );
    await waitIdle(palimpsest);
    await waitFor(async () => (await eventCount(base.db)) === 1);

    let observedBatchId: string | undefined;
    const ordarium = await boot(base, "wake-o", "ordarium.main", (call, messages) => {
      if (call === 0) return { toolCall: { name: "collab_inbox", arguments: {} } };
      const inbox = lastToolResult(messages);
      if (call === 1 && typeof inbox?.batchId === "string") {
        observedBatchId = inbox.batchId;
        return { toolCall: { name: "collab_ack", arguments: { batchId: inbox.batchId } } };
      }
      return { text: "handled" };
    });

    await waitFor(() => ordarium.runtime.watcher.status().wakeCount >= 1);
    await waitIdle(ordarium);

    expect(observedBatchId).toBeDefined();
    // Machine ack advanced the durable cursor: nothing pending, still one event.
    const after = await ordarium.runtime.service.inbox();
    expect(after.batchId).toBeNull();
    expect(await eventCount(base.db)).toBe(1);
    // The sender was not woken: machine ack is not a collaboration event.
    expect(palimpsest.runtime.watcher.status().wakeCount).toBe(0);
  }, 90_000);

  it("FED-DSH-A04: bidirectional wake: both peers notify each other without a human bus", async () => {
    const base = await makeFabric();
    let threadId: string | undefined;
    const palimpsest = await boot(
      base,
      "bi-p",
      "palimpsest.main",
      (call, messages) => {
        if (call === 0) {
          return {
            toolCall: {
              name: "collab_post",
              arguments: { to: "ordarium.main", kind: "question", body: "does polling suffice?" },
            },
          };
        }
        const inbox = lastToolResult(messages);
        if (typeof inbox?.batchId === "string") {
          return { toolCall: { name: "collab_ack", arguments: { batchId: inbox.batchId } } };
        }
        return { text: "done" };
      },
      { initialPrompt: "Ask the peer." },
    );
    await waitIdle(palimpsest);
    await waitFor(async () => (await eventCount(base.db)) === 1);
    {
      const store = openFederationStore(base.db);
      try {
        threadId = (await readAllEvents(store))[0]!.event.threadId;
      } finally {
        await store.close();
      }
    }

    let pendingBatch: string | undefined;
    const ordarium = await boot(base, "bi-o", "ordarium.main", (call, messages) => {
      if (call === 0) return { toolCall: { name: "collab_inbox", arguments: {} } };
      const inbox = lastToolResult(messages);
      if (call === 1 && typeof inbox?.batchId === "string") {
        pendingBatch = inbox.batchId;
        return {
          toolCall: {
            name: "collab_post",
            arguments: {
              to: "palimpsest.main",
              threadId,
              kind: "decision",
              body: "checkpoint polling suffices for PAL-FED-0D",
            },
          },
        };
      }
      if (call === 2 && pendingBatch !== undefined) {
        return { toolCall: { name: "collab_ack", arguments: { batchId: pendingBatch } } };
      }
      return { text: "replied" };
    });

    await waitFor(() => ordarium.runtime.watcher.status().wakeCount >= 1);
    await waitIdle(ordarium);
    await waitFor(async () => (await eventCount(base.db)) === 2);
    await waitFor(() => palimpsest.runtime.watcher.status().wakeCount >= 1);
    await waitIdle(palimpsest);

    expect(palimpsest.runtime.watcher.status().wakeCount).toBeGreaterThanOrEqual(1);
    expect(ordarium.runtime.watcher.status().wakeCount).toBeGreaterThanOrEqual(1);
    expect(await eventCount(base.db)).toBe(2);
    const thread = await palimpsest.runtime.service.thread({ threadId: threadId! });
    expect(thread.events.map((entry) => entry.event.from)).toEqual([
      "palimpsest.main",
      "ordarium.main",
    ]);
  }, 120_000);

  it("FED-DSH-A05: crash before ack redelivers the same batch through a DSH session resume", async () => {
    const base = await makeFabric();
    const palimpsest = await boot(
      base,
      "crash-p",
      "palimpsest.main",
      (call) =>
        call === 0
          ? {
              toolCall: {
                name: "collab_post",
                arguments: { to: "ordarium.main", kind: "evidence", body: "survive the crash" },
              },
            }
          : { text: "sent" },
      { initialPrompt: "Send evidence." },
    );
    await waitIdle(palimpsest);
    await waitFor(async () => (await eventCount(base.db)) === 1);

    // First O lifetime: read the inbox, never ack, then stop.
    const first = await boot(base, "crash-o", "ordarium.main", (call) =>
      call === 0 ? { toolCall: { name: "collab_inbox", arguments: {} } } : { text: "no ack" },
    );
    await waitFor(() => first.runtime.watcher.status().wakeCount >= 1);
    await waitIdle(first);
    const pending = await first.runtime.service.inbox();
    expect(pending.batchId).not.toBeNull();
    const pendingId = pending.batchId!;
    await first.close();
    hosts.splice(hosts.indexOf(first), 1);

    // Second O lifetime resumes the persisted DSH session and redelivers B.
    let redelivered: string | undefined;
    let acked = false;
    const second = await boot(
      base,
      "crash-o",
      "ordarium.main",
      (call, messages) => {
        if (call === 0) return { toolCall: { name: "collab_inbox", arguments: {} } };
        const inbox = lastToolResult(messages);
        if (call === 1 && typeof inbox?.batchId === "string") {
          redelivered = inbox.batchId;
          acked = true;
          return { toolCall: { name: "collab_ack", arguments: { batchId: inbox.batchId } } };
        }
        return { text: "acked" };
      },
      { resume: true },
    );

    expect(second.runtime.agent.id).toBe("sess-crash-o");
    await waitFor(() => second.runtime.watcher.status().wakeCount >= 1);
    await waitIdle(second);

    expect(redelivered ?? pendingId).toBe(pendingId);
    expect(acked).toBe(true);
    const after = await second.runtime.service.inbox();
    expect(after.batchId).toBeNull();
    expect(await eventCount(base.db)).toBe(1);
  }, 120_000);

  it("FED-DSH-A06: loop-storm negative: a no-reply event produces no acknowledgement message", async () => {
    const base = await makeFabric();
    const palimpsest = await boot(
      base,
      "storm-p",
      "palimpsest.main",
      (call) =>
        call === 0
          ? {
              toolCall: {
                name: "collab_post",
                arguments: { to: "ordarium.main", kind: "evidence", body: "FYI only, no reply needed" },
              },
            }
          : { text: "sent" },
      { initialPrompt: "Send a no-reply evidence note." },
    );
    await waitIdle(palimpsest);
    await waitFor(async () => (await eventCount(base.db)) === 1);

    const ordarium = await boot(base, "storm-o", "ordarium.main", (call, messages) => {
      if (call === 0) return { toolCall: { name: "collab_inbox", arguments: {} } };
      const inbox = lastToolResult(messages);
      if (call === 1 && typeof inbox?.batchId === "string") {
        return { toolCall: { name: "collab_ack", arguments: { batchId: inbox.batchId } } };
      }
      return { text: "noted" };
    });
    await waitFor(() => ordarium.runtime.watcher.status().wakeCount >= 1);
    await waitIdle(ordarium);

    // Give any (incorrect) reactive loop a chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(await eventCount(base.db)).toBe(1);
    expect(palimpsest.runtime.watcher.status().wakeCount).toBe(0);
  }, 90_000);
});
