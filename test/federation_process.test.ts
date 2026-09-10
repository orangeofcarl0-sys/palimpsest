/**
 * PAL-FED-0 real-process integration (§54) — EXPERIMENTAL.
 *
 * Two independently configured adapter processes (`self=palimpsest.main` and
 * `self=ordarium.main`) share one on-disk coordination SQLite DB and speak the
 * six MCP tools over stdio. The bilateral proof runs here, not through an
 * in-memory transport: post, read, reply, propose, accept, restart, replay.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { initFabric } from "../src/federation/fabric.js";
import { openFederationStore } from "../src/federation/store.js";

const CLI = fileURLToPath(new URL("../dist/src/federation/cli.js", import.meta.url));
const FABRIC = "pal-fed-process";

const directories: string[] = [];
const processes: McpProcess[] = [];

afterEach(async () => {
  for (const process of processes.splice(0)) {
    await process.close();
  }
  for (const directory of directories.splice(0)) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // Windows handle grace; the OS reclaims the temp dir.
    }
  }
});

interface ToolResult {
  readonly content: readonly { readonly type: string; readonly text: string }[];
  readonly isError?: boolean;
}

/** A minimal MCP stdio client around one `palimpsest-collab serve` process. */
class McpProcess {
  readonly #child: ChildProcess;
  readonly #pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  #nextId = 1;
  #exited = false;

  constructor(db: string, selfPeer: string) {
    this.#child = spawn(
      process.execPath,
      [CLI, "serve", "--db", db, "--fabric", FABRIC, "--self", selfPeer],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const lines = createInterface({ input: this.#child.stdout! });
    lines.on("line", (line) => {
      if (line.trim().length === 0) return;
      let message: { id?: unknown; result?: unknown; error?: unknown };
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (typeof message.id !== "number") return;
      const waiter = this.#pending.get(message.id);
      if (waiter === undefined) return;
      this.#pending.delete(message.id);
      if (message.error !== undefined) {
        waiter.reject(new Error(JSON.stringify(message.error)));
      } else {
        waiter.resolve(message.result);
      }
    });
    this.#child.stderr!.resume();
    this.#child.on("exit", () => {
      this.#exited = true;
      for (const waiter of this.#pending.values()) {
        waiter.reject(new Error("adapter process exited"));
      }
      this.#pending.clear();
    });
  }

  #send(payload: Record<string, unknown>): void {
    this.#child.stdin!.write(`${JSON.stringify(payload)}\n`);
  }

  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.#exited) return Promise.reject(new Error("adapter process already exited"));
    const id = this.#nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`MCP request '${method}' timed out`));
      }, 10_000);
      this.#pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.#send({ jsonrpc: "2.0", id, method, params });
    });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "pal-fed-test", version: "1" },
    });
    this.#send({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = (await this.request("tools/call", {
      name,
      arguments: args,
    })) as ToolResult;
    const text = result.content[0]?.text ?? "";
    if (result.isError === true) throw new Error(text);
    return JSON.parse(text);
  }

  async close(): Promise<void> {
    if (this.#exited) return;
    const done = new Promise<void>((resolve) => this.#child.once("exit", () => resolve()));
    this.#child.kill();
    await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 3_000))]);
  }
}

async function spawnAdapter(db: string, selfPeer: string): Promise<McpProcess> {
  const process = new McpProcess(db, selfPeer);
  processes.push(process);
  await process.initialize();
  return process;
}

describe("PAL-FED-0 two-process bilateral integration (§54)", () => {
  it("two adapters share one DB: post, read, reply, contract, restart, replay", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pal-fed-proc-"));
    directories.push(directory);
    const db = join(directory, "coordination.sqlite");
    const boot = openFederationStore(db);
    await initFabric(boot, { fabricId: FABRIC });
    await boot.close();

    const palimpsest = await spawnAdapter(db, "palimpsest.main");
    let ordarium = await spawnAdapter(db, "ordarium.main");

    // P -> O boundary delta.
    const posted = (await palimpsest.callTool("collab_post", {
      to: "ordarium.main",
      kind: "need",
      body: "Palimpsest requires restart-stable incremental state observation.",
    })) as { event: { eventId: string; threadId: string } };

    const inbound = (await ordarium.callTool("collab_inbox", {})) as {
      batchId: string;
      events: { event: { eventId: string; from: string } }[];
    };
    expect(inbound.batchId).toEqual(expect.any(String));
    expect(inbound.events.map((item) => item.event.eventId)).toEqual([posted.event.eventId]);
    expect(inbound.events[0]!.event.from).toBe("palimpsest.main");

    // O -> P response on the same thread.
    await ordarium.callTool("collab_post", {
      to: "palimpsest.main",
      threadId: posted.event.threadId,
      kind: "question",
      body: "Which wake latency target must the primitive meet?",
    });
    const reply = (await palimpsest.callTool("collab_inbox", {})) as {
      batchId: string;
      events: { event: { from: string } }[];
    };
    expect(reply.events).toHaveLength(1);
    expect(reply.events[0]!.event.from).toBe("ordarium.main");
    await palimpsest.callTool("collab_ack", { batchId: reply.batchId });

    const thread = (await palimpsest.callTool("collab_thread", {
      threadId: posted.event.threadId,
    })) as { events: unknown[] };
    expect(thread.events).toHaveLength(2);

    // BoundaryContract: propose -> accept -> agreed across the two processes.
    await palimpsest.callTool("contract_update", {
      action: "propose",
      contractId: "ctr_process",
      expectedRevision: 0,
      title: "peer wake boundary",
      terms: {
        requirements: ["A generic wait/change-observation primitive remains an open question"],
        constraints: ["Ordarium must remain scheduler-free"],
        interfaceNotes: [],
        acceptanceCriteria: [],
        openQuestions: ["Does checkpoint polling suffice for PAL-FED-0?"],
      },
    });
    const digest = ((await palimpsest.callTool("contract_get", {
      contractId: "ctr_process",
    })) as { contract: { termsDigest: string } }).contract.termsDigest;
    await ordarium.callTool("contract_update", {
      action: "accept",
      contractId: "ctr_process",
      expectedRevision: 1,
      expectedTermsDigest: digest,
    });
    const agreed = (await palimpsest.callTool("contract_update", {
      action: "accept",
      contractId: "ctr_process",
      expectedRevision: 2,
      expectedTermsDigest: digest,
    })) as { contract: { status: string } };
    expect(agreed.contract.status).toBe("agreed");

    // Restart O without acking the first batch: the same batch must replay.
    const pendingBatchId = inbound.batchId;
    await ordarium.close();
    ordarium = await spawnAdapter(db, "ordarium.main");
    const replay = (await ordarium.callTool("collab_inbox", {})) as {
      batchId: string;
      replayed: boolean;
      events: { event: { eventId: string } }[];
    };
    expect(replay.batchId).toBe(pendingBatchId);
    expect(replay.replayed).toBe(true);
    expect(replay.events.map((item) => item.event.eventId)).toEqual([posted.event.eventId]);

    await ordarium.callTool("collab_ack", { batchId: replay.batchId });
    // Booting the contract stream legitimately surfaces the contract revisions
    // created while the event batch was pending; drain until quiescent.
    let next = ((await ordarium.callTool("collab_inbox", {})) as { batchId: string | null }).batchId;
    for (let guard = 0; next !== null && guard < 5; guard += 1) {
      expect(next).not.toBe(replay.batchId);
      await ordarium.callTool("collab_ack", { batchId: next });
      next = ((await ordarium.callTool("collab_inbox", {})) as { batchId: string | null }).batchId;
    }
    expect(next).toBeNull();
  }, 60_000);
});
