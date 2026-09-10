/**
 * PAL-FED-0 MCP stdio leaf (EXPERIMENTAL, §9/§31).
 *
 * A minimal Model Context Protocol (JSON-RPC 2.0 over newline-delimited stdio)
 * server that exposes exactly the six collaboration tools. The adapter owns
 * identity: tools receive no `from`, and the persisted author is always the
 * configured self peer.
 *
 * This leaf is deliberately independent of the project runtime so it can be
 * removed (or run in a different repository/process) without touching the
 * orchestrator.
 */

import { createInterface } from "node:readline";

import { FederationError } from "./errors.js";
import { ARTIFACTS_MAX, ARTIFACT_LOCATOR_MAX_CHARS, EVENT_BODY_MAX_CHARS } from "./limits.js";
import { FIXED_PEERS } from "./peers.js";
import { EVENT_KINDS } from "./types.js";
import type { FederationService } from "./service.js";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "palimpsest-collab", version: "0.1.0-pal-fed-0" } as const;

type JsonObject = { readonly [key: string]: unknown };

interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
}

const peerEnum = { type: "string", enum: [...FIXED_PEERS] } as const;

function toolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "collab_inbox",
      description:
        "Read the pending boundary-collaboration batch for this peer. Redelivers the same batch after a crash until collab_ack is called.",
      inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
    {
      name: "collab_ack",
      description:
        "Machine delivery acknowledgement for one batch: advances the durable cursors and clears the pending batch. Not a conversational 'thanks'.",
      inputSchema: {
        type: "object",
        properties: { batchId: { type: "string" } },
        required: ["batchId"],
        additionalProperties: false,
      },
    },
    {
      name: "collab_post",
      description:
        "Post one immutable boundary delta to the other peer. The sender is injected by the adapter and cannot be supplied.",
      inputSchema: {
        type: "object",
        properties: {
          to: peerEnum,
          threadId: { type: "string", description: "Omit to open a new thread." },
          kind: { type: "string", enum: [...EVENT_KINDS] },
          body: { type: "string", maxLength: EVENT_BODY_MAX_CHARS },
          contractId: { type: "string" },
          artifacts: {
            type: "array",
            maxItems: ARTIFACTS_MAX,
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["git_commit", "test_run", "document", "url", "other"] },
                locator: { type: "string", maxLength: ARTIFACT_LOCATOR_MAX_CHARS },
                label: { type: "string" },
                digest: { type: "string" },
              },
              required: ["kind", "locator"],
              additionalProperties: false,
            },
          },
          replyToEventId: { type: "string" },
          contractRef: {
            type: "object",
            properties: { contractId: { type: "string" }, revision: { type: "number" } },
            required: ["contractId", "revision"],
            additionalProperties: false,
          },
        },
        required: ["to", "kind", "body"],
        additionalProperties: false,
      },
    },
    {
      name: "collab_thread",
      description:
        "Return the durable collaboration history for one threadId (a derived view over immutable events, in feed order).",
      inputSchema: {
        type: "object",
        properties: { threadId: { type: "string" } },
        required: ["threadId"],
        additionalProperties: false,
      },
    },
    {
      name: "contract_get",
      description:
        "Read the current BoundaryContract revision, terms digest, agreement state, acceptances and basis refs.",
      inputSchema: {
        type: "object",
        properties: {
          contractId: { type: "string" },
          history: { type: "boolean", description: "Include bounded revision history." },
        },
        required: ["contractId"],
        additionalProperties: false,
      },
    },
    {
      name: "contract_update",
      description:
        "Revise or accept a BoundaryContract. action=propose supplies the complete next terms and clears prior acceptances; action=accept binds to the exact current termsDigest as the configured self peer.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["propose", "accept"] },
          contractId: { type: "string" },
          expectedRevision: { type: "number" },
          title: { type: "string" },
          terms: {
            type: "object",
            properties: {
              requirements: { type: "array", items: { type: "string" } },
              constraints: { type: "array", items: { type: "string" } },
              interfaceNotes: { type: "array", items: { type: "string" } },
              acceptanceCriteria: { type: "array", items: { type: "string" } },
              openQuestions: { type: "array", items: { type: "string" } },
            },
            required: ["requirements", "constraints", "interfaceNotes", "acceptanceCriteria", "openQuestions"],
            additionalProperties: false,
          },
          basisEventIds: { type: "array", items: { type: "string" } },
          expectedTermsDigest: { type: "string" },
        },
        required: ["action", "contractId", "expectedRevision"],
        additionalProperties: false,
      },
    },
  ];
}

export interface CollabMcp {
  /** Handle one decoded JSON-RPC message; undefined means "no response". */
  handle(request: unknown): Promise<unknown | undefined>;
  /** Run the newline-delimited stdio loop until stdin ends or stop(). */
  start(stdio?: { stdin: NodeJS.ReadableStream; stdout: NodeJS.WritableStream }): Promise<void>;
  stop(): void;
}

export function createCollabMcp(service: FederationService): CollabMcp {
  const byName = new Map<string, (raw: unknown) => Promise<unknown>>([
    ["collab_inbox", () => service.inbox()],
    ["collab_ack", (raw) => service.ack(raw)],
    ["collab_post", (raw) => service.post(raw)],
    ["collab_thread", (raw) => service.thread(raw)],
    ["contract_get", (raw) => service.contractGet(raw)],
    ["contract_update", (raw) => service.contractUpdate(raw)],
  ]);

  async function callTool(name: string, rawArguments: unknown): Promise<unknown> {
    const tool = byName.get(name);
    if (tool === undefined) {
      return errorResult(`Unknown tool: ${name}`);
    }
    try {
      const value = await tool(rawArguments ?? {});
      return { content: [{ type: "text", text: JSON.stringify(value) }], isError: false };
    } catch (error) {
      if (error instanceof FederationError) {
        return errorResult(`${error.code}: ${error.message}`);
      }
      if (error instanceof Error && "code" in error && typeof error.code === "string") {
        return errorResult(`${error.code}: ${error.message}`);
      }
      return errorResult(`FED_INTERNAL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const handle = async (request: unknown): Promise<unknown | undefined> => {
    if (request === null || typeof request !== "object") return undefined;
    const message = request as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
    if (typeof message.method !== "string") return undefined;
    const isNotification = message.id === undefined;
    const respond = (result: unknown): unknown => ({
      jsonrpc: "2.0",
      ...(message.id === undefined ? {} : { id: message.id }),
      result,
    });
    const respondError = (code: number, text: string): unknown =>
      isNotification
        ? undefined
        : { jsonrpc: "2.0", id: message.id, error: { code, message: text } };

    switch (message.method) {
      case "initialize":
        return respond({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });
      case "notifications/initialized":
        return undefined;
      case "ping":
        return respond({});
      case "tools/list":
        return respond({ tools: toolDefinitions() });
      case "tools/call": {
        const params = message.params as { name?: unknown; arguments?: unknown } | undefined;
        if (typeof params?.name !== "string") {
          return respondError(-32602, "Invalid params: name is required");
        }
        const result = await callTool(params.name, params.arguments ?? {});
        return isNotification ? undefined : respond(result);
      }
      default:
        return respondError(-32601, `Method not found: ${message.method}`);
    }
  };

  let stopping = false;
  let stopped = (): void => {};
  const didStop = new Promise<void>((resolve) => {
    stopped = resolve;
  });

  return {
    handle,
    async start(stdio) {
      const input = stdio?.stdin ?? process.stdin;
      const output = stdio?.stdout ?? process.stdout;
      const lines = createInterface({ input });
      const closed = new Promise<void>((resolve) => {
        lines.on("close", resolve);
      });
      lines.on("line", (line) => {
        void (async () => {
          if (stopping || line.trim().length === 0) return;
          let request: unknown;
          try {
            request = JSON.parse(line);
          } catch {
            return;
          }
          const response = await handle(request);
          if (response !== undefined) output.write(`${JSON.stringify(response)}\n`);
        })();
      });
      await Promise.race([closed, didStop]);
      lines.close();
    },
    stop() {
      stopping = true;
      stopped();
    },
  };

  function errorResult(text: string): { content: { type: "text"; text: string }[]; isError: boolean } {
    return { content: [{ type: "text", text }], isError: true };
  }
}
