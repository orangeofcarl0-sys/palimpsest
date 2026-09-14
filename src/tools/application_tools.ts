/**
 * G10-O application tools — few, cohesive, STRICT tools over the application surface.
 *
 * A tool caller can never supply local-peer identity, an authentication flag, a
 * VerificationResult, an AdmissionDecision, an evolution authority, or a raw store event;
 * the application surface derives all of those internally.
 */

import type { DshContentBlock, DshToolDefinition, DshToolRunContext } from "./dsh_types.js";
import type { PalimpsestApplicationSurface } from "../application/surface.js";

function textBlock(value: unknown): DshContentBlock[] {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}

class ToolArgsError extends TypeError {}

function argsObject(args: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof args !== "object" || args === null || Array.isArray(args)) throw new ToolArgsError("tool arguments must be an object");
  const object = args as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) throw new ToolArgsError(`unknown argument "${key}"`);
  }
  return object;
}

function required(object: Record<string, unknown>, name: string): unknown {
  if (object[name] === undefined || object[name] === null) throw new ToolArgsError(`argument "${name}" is required`);
  return object[name];
}

function requiredString(object: Record<string, unknown>, name: string): string {
  const value = required(object, name);
  if (typeof value !== "string" || value.trim() === "") throw new ToolArgsError(`argument "${name}" must be a non-empty string`);
  return value;
}

function stringArray(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) throw new ToolArgsError(`${what} must be an array of strings`);
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.trim() === "") throw new ToolArgsError(`${what} must contain non-empty strings`);
    return entry;
  });
}

function tool(input: {
  readonly name: string;
  readonly description: string;
  readonly mode: "read-only" | "mutating";
  readonly actions: readonly string[];
  readonly extraProperties?: Readonly<Record<string, unknown>>;
  readonly run: (action: string, object: Record<string, unknown>, context: DshToolRunContext) => Promise<unknown>;
}): DshToolDefinition {
  const properties: Record<string, unknown> = {
    action: { type: "string", enum: [...input.actions], description: "the semantic action to perform" },
    ...(input.extraProperties ?? {}),
  };
  const allowed = ["action", ...Object.keys(input.extraProperties ?? {})];
  return {
    name: input.name,
    description: `${input.description} — [${input.mode}]`,
    parameters: { type: "object", properties, required: ["action"], additionalProperties: false },
    output: { schema: { type: "object" }, render: (_args, value) => textBlock(value) },
    mode: input.mode,
    async execute(args: unknown, context: DshToolRunContext): Promise<unknown> {
      const object = argsObject(args, allowed);
      const action = requiredString(object, "action");
      if (!input.actions.includes(action)) throw new ToolArgsError(`unknown action "${action}"`);
      return input.run(action, object, context);
    },
  };
}

export function defineApplicationTools(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  const tools: DshToolDefinition[] = [];

  tools.push(
    tool({
      name: "palimpsest_surfaces",
      description: "Report which advanced Palimpsest surfaces are configured for this installation (a missing surface is never an empty known state)",
      mode: "read-only",
      actions: ["list"],
      run: async () => ({
        work: true,
        federation: application.federation !== undefined,
        boundary: application.boundary !== undefined,
        runtime: application.runtime !== undefined,
        organization: application.organization !== undefined,
        campaign: application.campaign !== undefined,
        dynamics: application.dynamics !== undefined,
        evolution: application.evolution !== undefined,
        reasoning: application.reasoning !== undefined,
        attention: application.attention !== undefined,
        projections: application.projections !== undefined,
      }),
    }),
  );

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

  if (application.runtime !== undefined) {
    const runtime = application.runtime;
    tools.push(
      tool({
        name: "palimpsest_runtime_view",
        description: "Read-only runtime organization: the RuntimeScope list/state and the derived external Holon view (internal structure vs external surface)",
        mode: "read-only",
        actions: ["scopes", "scope", "holon"],
        extraProperties: { scopeId: { type: "string" } },
        run: async (action, object) => {
          if (action === "scopes") return runtime.list();
          if (action === "scope") return runtime.view(requiredString(object, "scopeId"));
          return runtime.holon(requiredString(object, "scopeId"));
        },
      }),
    );
  }

  if (application.organization !== undefined) {
    const organization = application.organization;
    tools.push(
      tool({
        name: "palimpsest_organization_view",
        description: "Read-only organization/institution: definition head, ACTIVE/RETIRED lifecycle, retirements, and institution current bodies",
        mode: "read-only",
        actions: ["view", "retirements", "institutions", "institution"],
        extraProperties: { organizationDefinitionId: { type: "string" }, institutionId: { type: "string" } },
        run: async (action, object) => {
          if (action === "view") return organization.view(requiredString(object, "organizationDefinitionId"));
          if (action === "retirements") return organization.retirements();
          if (action === "institutions") return organization.institutions();
          return organization.institutionView(requiredString(object, "institutionId"));
        },
      }),
    );
  }

  if (application.campaign !== undefined) {
    const campaign = application.campaign;
    tools.push(
      tool({
        name: "palimpsest_campaign_view",
        description: "Read-only campaign: lifecycle, basis, commitment states, and hypotheses",
        mode: "read-only",
        actions: ["view"],
        extraProperties: { campaignId: { type: "string" } },
        run: async (action, object) => campaign.view(requiredString(object, "campaignId")),
      }),
    );
  }

  if (application.dynamics !== undefined) {
    const dynamics = application.dynamics;
    tools.push(
      tool({
        name: "palimpsest_dynamics",
        description: "Read-only organization dynamics: observe/diagnose a subject, produce a non-canonical proposal, inspect its impact, and check proposal freshness (the pressure vector is never a scalar score)",
        mode: "read-only",
        actions: ["observe", "diagnose", "propose", "impact", "freshness"],
        extraProperties: { subject: { type: "object" }, proposal: { type: "object" }, advisor: { type: "object" } },
        run: async (action, object) => {
          if (action === "observe") return dynamics.observe(required(object, "subject"));
          if (action === "diagnose") return dynamics.diagnose(required(object, "subject"));
          if (action === "propose") return dynamics.propose({ subject: required(object, "subject"), ...(object.advisor === undefined ? {} : { advisor: object.advisor }) });
          if (action === "impact") return dynamics.proposalImpact({ proposal: required(object, "proposal"), subject: required(object, "subject") });
          return dynamics.freshness(required(object, "proposal"));
        },
      }),
    );
  }

  if (application.evolution !== undefined) {
    const evolution = application.evolution;
    tools.push(
      tool({
        name: "palimpsest_evolution",
        description: "Governed structural evolution: inspect a case, and prepare/advance an assessed candidate through the EXISTING authority and governance path (a caller can never self-authorize)",
        mode: "mutating",
        actions: ["inspect", "prepare", "advance", "inspect_runtime", "advance_runtime"],
        extraProperties: { caseRef: { type: "string" }, proposal: { type: "object" } },
        run: async (action, object) => {
          if (action === "inspect") return evolution.inspectOrganization(requiredString(object, "caseRef"));
          if (action === "prepare") return evolution.prepareOrganization(required(object, "proposal") as never);
          if (action === "advance") return evolution.advanceOrganization(required(object, "proposal") as never);
          if (action === "inspect_runtime") return evolution.inspectRuntime(requiredString(object, "caseRef"));
          return evolution.advanceRuntime(required(object, "proposal") as never);
        },
      }),
    );
  }

  if (application.reasoning !== undefined) {
    const reasoning = application.reasoning;
    tools.push(
      tool({
        name: "palimpsest_reasoning",
        description: "Collaborative reasoning: view a cell, open a branch and read its FROZEN brief, submit a structured candidate, and request evaluation (the service performs verification then epistemic admission; no chain-of-thought is ever stored)",
        mode: "mutating",
        actions: ["view", "frontier", "graph", "brief", "branch", "candidate", "evaluate", "invalidate"],
        extraProperties: {
          cellId: { type: "string" },
          branchId: { type: "string" },
          question: { type: "string" },
          type: { type: "object" },
          content: { type: "object" },
          dependencies: { type: "array", items: { type: "object" } },
          candidateDigest: { type: "string" },
          targetClaimId: { type: "string" },
          reason: { type: "string" },
        },
        run: async (action, object) => {
          if (action === "view") return reasoning.view(requiredString(object, "cellId"));
          if (action === "frontier") return reasoning.frontier(requiredString(object, "cellId"));
          if (action === "graph") return reasoning.graph(requiredString(object, "cellId"));
          if (action === "brief") return reasoning.brief({ cellId: requiredString(object, "cellId"), branchId: requiredString(object, "branchId") });
          if (action === "branch") return reasoning.openBranch({ cellId: requiredString(object, "cellId"), question: requiredString(object, "question") });
          if (action === "candidate") {
            return reasoning.submitCandidate({
              cellId: requiredString(object, "cellId"),
              branchId: requiredString(object, "branchId"),
              type: required(object, "type") as never,
              content: required(object, "content"),
              ...(Array.isArray(object.dependencies) ? { dependencies: object.dependencies as never } : {}),
            });
          }
          if (action === "evaluate") return reasoning.evaluate({ cellId: requiredString(object, "cellId"), candidateDigest: requiredString(object, "candidateDigest") });
          return reasoning.invalidate({ cellId: requiredString(object, "cellId"), targetClaimId: requiredString(object, "targetClaimId"), reason: requiredString(object, "reason") });
        },
      }),
    );
  }

  if (application.projections !== undefined) {
    const projections = application.projections;
    tools.push(
      tool({
        name: "palimpsest_graph",
        description: "Read-only MultiGraph projections: typed nodes/edges per species with canonical refs, per-source bases, and an honest known/unknown/error/stale knowledge state (never a canonical graph)",
        mode: "read-only",
        actions: ["work", "organization", "collaboration", "runtime", "reasoning"],
        extraProperties: { organizationDefinitionId: { type: "string" }, cellId: { type: "string" } },
        run: async (action, object) => {
          if (action === "work") return projections.work();
          if (action === "organization") return projections.organization({ organizationDefinitionId: requiredString(object, "organizationDefinitionId") });
          if (action === "collaboration") return projections.collaboration();
          if (action === "runtime") return projections.runtime();
          return projections.reasoning({ cellId: requiredString(object, "cellId") });
        },
      }),
    );
  }

  return tools;
}
