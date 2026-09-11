/**
 * PAL-FED-0D agent-scoped collaboration tools (EXPERIMENTAL, §9/§25/§31/§32).
 *
 * The six tools are registered into one DSH agent's scope, so a temporary
 * subagent does not inherit project-peer authority merely by existing. Each
 * call threads the real DSH invocation identity into the federation write so
 * the persisted Ordarium record carries authentic provenance.
 */

import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";

import type { FederationService } from "../service.js";
import { ARTIFACT_LOCATOR_MAX_CHARS, EVENT_BODY_MAX_CHARS } from "../limits.js";
import { FIXED_PEERS, type PeerRef } from "../peers.js";
import { ARTIFACT_KINDS, EVENT_KINDS } from "../types.js";
import { submitDecision, type AdmissionConfig } from "./admission.js";
import { dshInvocation } from "./provenance.js";

export interface PalFedToolContext {
  readonly service: FederationService;
  readonly selfPeer: PeerRef;
  readonly fabricId: string;
  /** DSH session/agent scope used for invocation provenance. */
  readonly sessionScope: string;
  /**
   * PAL-FED-0I experiment-only admission binding. Identical in A0/A1/A2; only
   * the trusted mode/ticket values differ. Absent means no completion endpoint.
   */
  readonly admission?: AdmissionConfig | undefined;
}

function assertNotAborted(exec: ToolRunContext, tool: string): void {
  if (exec.signal.aborted) {
    throw new Error(`FED_CANCELLED: ${tool} was cancelled before it could complete`);
  }
}

function text(value: JsonValue) {
  return [{ type: "text" as const, text: JSON.stringify(value) }];
}

/**
 * Build the six tool definitions bound to this peer's service. Every mutating
 * tool (including collab_inbox, which persists a pending batch) records the
 * real DSH call id/rootCallId as Ordarium invocation provenance.
 */
export function buildPalFedTools(context: PalFedToolContext): ToolDefinition[] {
  const { service, selfPeer, fabricId, sessionScope } = context;

  const invocationFor = (exec: ToolRunContext) =>
    dshInvocation(
      sessionScope,
      selfPeer,
      { callId: String(exec.callId), rootCallId: String(exec.rootCallId) },
      fabricId,
    );

  const collabInbox = defineTool({
    name: "collab_inbox",
    description:
      "Read the pending boundary-collaboration batch for this peer. The same batch is redelivered after a crash until collab_ack is called. Not purely read-only: it may persist a pending batch.",
    parameters: {},
    output: { schema: { type: "json" }, render: (_args, value) => text(value) },
    execute: async (_args, exec) => {
      assertNotAborted(exec, "collab_inbox");
      const result = await service.inbox(invocationFor(exec));
      assertNotAborted(exec, "collab_inbox");
      return result as unknown as JsonValue;
    },
  });

  const collabAck = defineTool({
    name: "collab_ack",
    description:
      "Machine delivery acknowledgement for one batch: advances the durable cursors and clears the pending batch. Not a conversational 'thanks'; never call it before handling the batch.",
    parameters: {
      batchId: { type: "string", required: true, description: "The batchId returned by collab_inbox." },
    },
    output: { schema: { type: "json" }, render: (_args, value) => text(value) },
    execute: async (args, exec) => {
      assertNotAborted(exec, "collab_ack");
      const result = await service.ack({ batchId: args.batchId }, invocationFor(exec));
      assertNotAborted(exec, "collab_ack");
      return result as unknown as JsonValue;
    },
  });

  const collabPost = defineTool({
    name: "collab_post",
    description:
      "Post one immutable boundary delta to the other peer. The sender is injected by the adapter and cannot be supplied. Keep the body a boundary delta, not a plan dump.",
    parameters: {
      to: { type: "string", enum: [...FIXED_PEERS], required: true },
      threadId: { type: "string", description: "Omit to open a new thread." },
      kind: { type: "string", enum: [...EVENT_KINDS], required: true },
      body: { type: "string", required: true, description: `Boundary delta text (<= ${EVENT_BODY_MAX_CHARS} chars).` },
      contractId: { type: "string" },
      artifacts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: [...ARTIFACT_KINDS], required: true },
            locator: { type: "string", required: true, description: `<= ${ARTIFACT_LOCATOR_MAX_CHARS} chars` },
            label: { type: "string" },
            digest: { type: "string" },
          },
        },
      },
      replyToEventId: { type: "string" },
      contractRef: {
        type: "object",
        additionalProperties: false,
        properties: {
          contractId: { type: "string", required: true },
          revision: { type: "integer", required: true },
        },
      },
    },
    output: { schema: { type: "json" }, render: (_args, value) => text(value) },
    execute: async (args, exec) => {
      assertNotAborted(exec, "collab_post");
      const result = await service.post(args, invocationFor(exec));
      assertNotAborted(exec, "collab_post");
      return result as unknown as JsonValue;
    },
  });

  const collabThread = defineTool({
    name: "collab_thread",
    description:
      "Return the durable collaboration history for one threadId (a derived view over immutable events, in feed order).",
    parameters: { threadId: { type: "string", required: true } },
    output: { schema: { type: "json" }, render: (_args, value) => text(value) },
    execute: async (args) => {
      const result = await service.thread({ threadId: args.threadId });
      return result as unknown as JsonValue;
    },
  });

  const contractGet = defineTool({
    name: "contract_get",
    description:
      "Read the current BoundaryContract revision, terms digest, agreement state, acceptances and basis refs.",
    parameters: {
      contractId: { type: "string", required: true },
      history: { type: "boolean", description: "Include bounded revision history." },
    },
    output: { schema: { type: "json" }, render: (_args, value) => text(value) },
    execute: async (args) => {
      const result = await service.contractGet({
        contractId: args.contractId,
        ...(args.history === undefined ? {} : { history: args.history }),
      });
      return result as unknown as JsonValue;
    },
  });

  const contractUpdate = defineTool({
    name: "contract_update",
    description:
      "Revise or accept a BoundaryContract. action=propose supplies the complete next terms and clears prior acceptances; action=accept binds to the exact current termsDigest as the configured self peer.",
    parameters: {
      action: { type: "string", enum: ["propose", "accept"], required: true },
      contractId: { type: "string", required: true },
      expectedRevision: { type: "integer", required: true },
      title: { type: "string" },
      terms: {
        type: "object",
        additionalProperties: false,
        properties: {
          requirements: { type: "array", items: { type: "string" } },
          constraints: { type: "array", items: { type: "string" } },
          interfaceNotes: { type: "array", items: { type: "string" } },
          acceptanceCriteria: { type: "array", items: { type: "string" } },
          openQuestions: { type: "array", items: { type: "string" } },
        },
      },
      basisEventIds: { type: "array", items: { type: "string" } },
      expectedTermsDigest: { type: "string" },
    },
    output: { schema: { type: "json" }, render: (_args, value) => text(value) },
    execute: async (args, exec) => {
      assertNotAborted(exec, "contract_update");
      const result = await service.contractUpdate(args, invocationFor(exec));
      assertNotAborted(exec, "contract_update");
      return result as unknown as JsonValue;
    },
  });

  const decisionSubmit =
    context.admission === undefined
      ? []
      : [
          defineTool({
            name: "decision_submit",
            description:
              "Submit your final task disposition for admission. disposition=resolved means you have concluded the question; disposition=unresolved means you cannot legitimately determine it yet. The task is complete only after this endpoint returns an admitted result.",
            parameters: {
              disposition: {
                type: "string",
                enum: ["resolved", "unresolved"],
                required: true,
                description: "Your task disposition.",
              },
              body: {
                type: "string",
                required: true,
                description: "The conclusion, or the reason it cannot be determined.",
              },
            },
            output: { schema: { type: "json" }, render: (_args, value) => text(value) },
            execute: async (args) => {
              const admission = context.admission;
              if (admission === undefined) {
                throw new Error("FED_ADMISSION_UNAVAILABLE: no admission binding is configured");
              }
              const disposition = args.disposition === "unresolved" ? "unresolved" : "resolved";
              // Trusted host state only: the model cannot supply run/ticket/peer/
              // owner/mode fields, and the durable events are read host-side (§40).
              const events = await service.listEvents();
              const { response } = submitDecision(
                admission,
                events,
                disposition,
                String(args.body ?? ""),
              );
              return response as unknown as JsonValue;
            },
          }),
        ];

  return [collabInbox, collabAck, collabPost, collabThread, contractGet, contractUpdate, ...decisionSubmit];
}
