/**
 * SR-1 R3A — the federation tool cluster.
 *
 * palimpsest_attention, palimpsest_federation, palimpsest_boundary, kept together because they read the
 * same application face(s). Adapter only: tool metadata, its own argument parsing and a call to
 * the application façade. It reaches no durable store and no semantic service directly (§12).
 */

import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import type { DshToolDefinition } from "../../tools/dsh_types.js";
import { tool, ToolArgsError, required, requiredString, stringArray } from "./common.js";

export function defineFederationTools(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  const tools: DshToolDefinition[] = [];
if (application.attention !== undefined) {
    const attention = application.attention;
    tools.push(
      tool({
        name: "palimpsest_attention",
        description: "What currently deserves this peer's attention (derived from canonical state): unacked inbound messages, boundary decisions required, commitment offers requiring a decision, and newly relevant accepted boundary revisions. Read-only; host activation is a separate step",
        mode: "read-only",
        actions: ["pending"],
        extraProperties: {},
        run: async (action) => {
          if (action !== "pending") throw new ToolArgsError(`unsupported attention action "${action}"`);
          return { policyId: attention.policyId, pending: await attention.pending() };
        },
      }),
    );
  }

  if (application.federation !== undefined) {
    const federation = application.federation;
    tools.push(
      tool({
        name: "palimpsest_federation",
        description: "Peer collaboration: read your inbox/threads, contact peers, exchange messages, and act on explicit commitments (local identity is derived, never supplied)",
        mode: "mutating",
        actions: ["inbox", "thread", "message", "contact", "commitment", "commitments", "remote_decision"],
        extraProperties: {
          threadId: { type: "string" },
          to: { type: "string" },
          body: { type: "string" },
          competenceTags: { type: "array", items: { type: "string" } },
          reason: { type: "string" },
          commitmentAction: { type: "string", enum: ["offer", "accept", "reject", "release", "handoff_offer", "handoff_accept"] },
          commitmentId: { type: "string" },
          handoffId: { type: "string" },
          proposedHolder: { type: "string" },
          scope: { type: "object" },
          statement: { type: "string" },
          remoteDecision: { type: "string", enum: ["accept", "reject", "release"] },
        },
        run: async (action, object) => {
          if (action === "inbox") return federation.inbox();
          if (action === "commitments") return federation.commitments();
          if (action === "thread") return federation.thread(requiredString(object, "threadId"));
          if (action === "message") return federation.sendMessage({ to: { schemaVersion: 1, peerId: requiredString(object, "to") }, threadId: requiredString(object, "threadId"), body: requiredString(object, "body") });
          if (action === "contact") return federation.findCandidates({ competenceTags: stringArray(object.competenceTags ?? [], "competenceTags"), origin: object.origin ?? { kind: "runtime_scope", scope: { schemaVersion: 1, scopeId: "unscoped" } }, reason: requiredString(object, "reason") });
          if (action === "remote_decision") {
            if (federation.submitRemoteDecision === undefined) throw new ToolArgsError("remote commitment decisions are not configured for this installation");
            const decision = requiredString(object, "remoteDecision");
            if (decision !== "accept" && decision !== "reject" && decision !== "release") throw new ToolArgsError('remoteDecision must be "accept" | "reject" | "release"');
            return federation.submitRemoteDecision({ to: { schemaVersion: 1, peerId: requiredString(object, "to") }, commitmentId: requiredString(object, "commitmentId"), decision });
          }
          const commitmentAction = requiredString(object, "commitmentAction");
          if (commitmentAction === "offer") {
            const scope = required(object, "scope");
            if (typeof scope !== "object" || scope === null) throw new ToolArgsError("scope must be an object");
            return federation.offerCommitment({ proposedHolder: { schemaVersion: 1, peerId: requiredString(object, "proposedHolder") }, scope: scope as never, statement: requiredString(object, "statement") });
          }
          if (commitmentAction === "accept") return federation.acceptCommitment(requiredString(object, "commitmentId"));
          if (commitmentAction === "reject") return federation.rejectCommitment(requiredString(object, "commitmentId"));
          if (commitmentAction === "release") {
            await federation.releaseCommitment(requiredString(object, "commitmentId"));
            return { released: true };
          }
          if (commitmentAction === "handoff_offer") return federation.offerHandoff({ commitmentId: requiredString(object, "commitmentId"), to: { schemaVersion: 1, peerId: requiredString(object, "to") } });
          return federation.acceptHandoff(requiredString(object, "handoffId"));
        },
      }),
    );
  }

  if (application.boundary !== undefined) {
    const boundary = application.boundary;
    tools.push(
      tool({
        name: "palimpsest_boundary",
        description: "Shared boundary memory: inspect a workspace/artifact, propose a candidate revision, and explicitly accept or reject an exact candidate (authorship/acceptor identity is derived)",
        mode: "mutating",
        actions: ["view", "current", "pending", "membership", "observation", "propose", "decide", "submit_remote"],
        extraProperties: {
          workspaceId: { type: "string" },
          artifactId: { type: "string" },
          base: { type: "object" },
          content: { type: "object" },
          requiredAcceptors: { type: "array", items: { type: "string" } },
          intent: { type: "string" },
          candidateDigest: { type: "string" },
          decision: { type: "string", enum: ["accept", "reject"] },
          operation: { type: "object" },
          operationId: { type: "string" },
        },
        run: async (action, object) => {
          if (action === "view") return boundary.view(requiredString(object, "workspaceId"));
          if (action === "current") return boundary.currentAccepted({ workspaceId: requiredString(object, "workspaceId"), artifactId: requiredString(object, "artifactId") });
          if (action === "pending") return boundary.pendingCandidates({ workspaceId: requiredString(object, "workspaceId"), artifactId: requiredString(object, "artifactId") });
          if (action === "membership") return boundary.membership(requiredString(object, "workspaceId"));
          if (action === "observation") return boundary.observation(requiredString(object, "workspaceId"));
          if (action === "propose") {
            return boundary.proposeRevision({
              workspaceId: requiredString(object, "workspaceId"),
              artifactId: requiredString(object, "artifactId"),
              base: object.base ?? null,
              content: required(object, "content"),
              requiredAcceptors: stringArray(object.requiredAcceptors ?? [], "requiredAcceptors").map((peerId) => ({ schemaVersion: 1 as const, peerId })),
              intent: requiredString(object, "intent"),
            });
          }
          if (action === "submit_remote") {
            if (boundary.submitRemote === undefined) throw new ToolArgsError("remote boundary submission is not configured for this installation");
            const operation = required(object, "operation");
            if (typeof operation !== "object" || operation === null) throw new ToolArgsError("operation must be an object");
            return boundary.submitRemote({
              workspaceId: requiredString(object, "workspaceId"),
              operation: operation as never,
              ...(typeof object.operationId === "string" && object.operationId.length > 0 ? { operationId: object.operationId } : {}),
            });
          }
          const decision = requiredString(object, "decision");
          if (decision !== "accept" && decision !== "reject") throw new ToolArgsError('decision must be "accept" or "reject"');
          return boundary.decide({ workspaceId: requiredString(object, "workspaceId"), artifactId: requiredString(object, "artifactId"), candidateDigest: requiredString(object, "candidateDigest"), decision });
        },
      }),
    );
  }
  return tools;
}
