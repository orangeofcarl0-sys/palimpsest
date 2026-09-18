/**
 * SR-1 R3B — the peer route cluster: federation, attention and boundary memory.
 *
 * These three faces are one cluster because they are one conversation. The canonical switchboard
 * ordered them federation → attention → boundary, and the manifest keeps that order so the file
 * reads the way the protocol does: an inbound/outbound peer message, the derived "what deserves
 * attention" view over it, and the shared-artifact boundary the message may be about.
 */

import {
  InvalidRequest,
  bodyObject,
  queryRequired,
  requireSurface,
  route,
  str,
  type ApplicationRouteDescriptor,
} from "./common.js";

export const FEDERATION_ROUTES: readonly ApplicationRouteDescriptor[] = [
  route({
    path: "/api/federation/inbox",
    methods: ["GET"],
    face: "federation",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.federation, "federation").inbox());
    },
  }),
  route({
    path: "/api/federation/thread",
    methods: ["GET"],
    face: "federation",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.federation, "federation").thread(queryRequired(query, "threadId")));
    },
  }),
  route({
    path: "/api/federation/message",
    methods: ["POST"],
    face: "federation",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(await requireSurface(application.federation, "federation").sendMessage({ to: { schemaVersion: 1, peerId: str(b.to, "to") }, threadId: str(b.threadId, "threadId"), body: str(b.body, "body") }));
    },
  }),
  route({
    path: "/api/federation/contact",
    methods: ["POST"],
    face: "federation",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const tags = Array.isArray(b.competenceTags) ? b.competenceTags.map((tag) => str(tag, "competenceTags[]")) : [];
      return ok(await requireSurface(application.federation, "federation").findCandidates({ competenceTags: tags, origin: b.origin ?? { kind: "runtime_declared" }, reason: str(b.reason, "reason") }));
    },
  }),
  route({
    path: "/api/federation/commitment",
    methods: ["POST"],
    face: "federation",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const federation = requireSurface(application.federation, "federation");
      const action = str(b.action, "action");
      if (action === "accept") return ok(await federation.acceptCommitment(str(b.commitmentId, "commitmentId")));
      if (action === "reject") return ok(await federation.rejectCommitment(str(b.commitmentId, "commitmentId")));
      if (action === "release") {
        await federation.releaseCommitment(str(b.commitmentId, "commitmentId"));
        return ok({ released: true });
      }
      if (action === "handoff_offer") return ok(await federation.offerHandoff({ commitmentId: str(b.commitmentId, "commitmentId"), to: { schemaVersion: 1, peerId: str(b.to, "to") } }));
      if (action === "handoff_accept") return ok(await federation.acceptHandoff(str(b.handoffId, "handoffId")));
      if (action === "offer") {
        const scope = b.scope as { kind?: unknown };
        if (typeof scope !== "object" || scope === null || scope.kind === undefined) throw new InvalidRequest("scope is required");
        return ok(await federation.offerCommitment({ proposedHolder: { schemaVersion: 1, peerId: str(b.proposedHolder, "proposedHolder") }, scope: scope as never, statement: str(b.statement, "statement") }));
      }
      throw new InvalidRequest(`unsupported commitment action "${action}"`);
    },
  }),
  route({
    path: "/api/federation/commitments",
    methods: ["GET"],
    face: "federation",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.federation, "federation").commitments());
    },
  }),
  route({
    path: "/api/federation/remote_decision",
    methods: ["POST"],
    face: "federation",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const federation = requireSurface(application.federation, "federation");
      if (federation.submitRemoteDecision === undefined) throw new InvalidRequest("remote commitment decisions are not configured");
      const decision = str(b.decision, "decision");
      if (decision !== "accept" && decision !== "reject" && decision !== "release") throw new InvalidRequest('decision must be "accept" | "reject" | "release"');
      return ok(await federation.submitRemoteDecision({ to: { schemaVersion: 1, peerId: str(b.to, "to") }, commitmentId: str(b.commitmentId, "commitmentId"), decision }));
    },
  }),
  /* ---- attention (semantic derivation; activation is a separate host step) ---- */
  route({
    path: "/api/attention",
    methods: ["GET"],
    face: "attention",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      const attention = requireSurface(application.attention, "attention");
      return ok({ policyId: attention.policyId, pending: await attention.pending() });
    },
  }),
  /* ---- boundary ---- */
  route({
    path: "/api/boundary/workspace",
    methods: ["GET"],
    face: "boundary",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.boundary, "boundary").view(queryRequired(query, "workspaceId")));
    },
  }),
  route({
    path: "/api/boundary/current",
    methods: ["GET"],
    face: "boundary",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.boundary, "boundary").currentAccepted({ workspaceId: queryRequired(query, "workspaceId"), artifactId: queryRequired(query, "artifactId") }));
    },
  }),
  route({
    path: "/api/boundary/pending",
    methods: ["GET"],
    face: "boundary",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.boundary, "boundary").pendingCandidates({ workspaceId: queryRequired(query, "workspaceId"), artifactId: queryRequired(query, "artifactId") }));
    },
  }),
  route({
    path: "/api/boundary/membership",
    methods: ["GET"],
    face: "boundary",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.boundary, "boundary").membership(queryRequired(query, "workspaceId")));
    },
  }),
  route({
    path: "/api/boundary/observation",
    methods: ["GET"],
    face: "boundary",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.boundary, "boundary").observation(queryRequired(query, "workspaceId")));
    },
  }),
  route({
    path: "/api/boundary/propose",
    methods: ["POST"],
    face: "boundary",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const acceptors = Array.isArray(b.requiredAcceptors) ? b.requiredAcceptors.map((peer) => ({ schemaVersion: 1 as const, peerId: str(peer, "requiredAcceptors[]") })) : [];
      return ok(await requireSurface(application.boundary, "boundary").proposeRevision({ workspaceId: str(b.workspaceId, "workspaceId"), artifactId: str(b.artifactId, "artifactId"), base: b.base ?? null, content: b.content, requiredAcceptors: acceptors, intent: str(b.intent, "intent") }));
    },
  }),
  route({
    path: "/api/boundary/decide",
    methods: ["POST"],
    face: "boundary",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const decision = str(b.decision, "decision");
      if (decision !== "accept" && decision !== "reject") throw new InvalidRequest('decision must be "accept" or "reject"');
      return ok(await requireSurface(application.boundary, "boundary").decide({ workspaceId: str(b.workspaceId, "workspaceId"), artifactId: str(b.artifactId, "artifactId"), candidateDigest: str(b.candidateDigest, "candidateDigest"), decision }));
    },
  }),
  route({
    path: "/api/boundary/submit_remote",
    methods: ["POST"],
    face: "boundary",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const boundary = requireSurface(application.boundary, "boundary");
      if (boundary.submitRemote === undefined) throw new InvalidRequest("remote boundary submission is not configured");
      const operation = b.operation;
      if (typeof operation !== "object" || operation === null || Array.isArray(operation)) throw new InvalidRequest("operation must be an object");
      return ok(await boundary.submitRemote({
        workspaceId: str(b.workspaceId, "workspaceId"),
        operation: operation as never,
        ...(typeof b.operationId === "string" && b.operationId.length > 0 ? { operationId: b.operationId } : {}),
      }));
    },
  }),
];
