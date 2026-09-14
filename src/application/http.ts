/**
 * G10-O typed application HTTP routes.
 *
 * Every route is namespaced and STRICT; there is no generic `POST /api/advanced {service, method}`
 * tunnel, and no route imports a canonical store. HTTP authentication (the server's bearer token)
 * only admits a request to the server — it is never semantic authority.
 */

import type { PalimpsestApplicationSurface } from "./surface.js";

export interface ApplicationRouteResult {
  readonly status: number;
  readonly body: unknown;
}

export interface ApplicationRouteInput {
  readonly application: PalimpsestApplicationSurface;
  readonly method: string;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: unknown;
}

class InvalidRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRequest";
  }
}

function bodyObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new InvalidRequest("request body must be a JSON object");
  return body as Record<string, unknown>;
}

function str(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new InvalidRequest(`${what} must be a non-empty string`);
  return value;
}

function queryRequired(query: URLSearchParams, name: string): string {
  const value = query.get(name);
  if (value === null || value === "") throw new InvalidRequest(`query parameter "${name}" is required`);
  return value;
}

function requireSurface<T>(surface: T | undefined, name: string): T {
  if (surface === undefined) {
    const error = new Error(`the ${name} surface is not configured for this installation`);
    (error as { kind?: string }).kind = "surface_absent";
    throw error;
  }
  return surface;
}

/** Map a semantic error kind to an HTTP status without leaking internals. */
export function applicationErrorStatus(error: unknown): number {
  const kind = typeof error === "object" && error !== null ? String((error as { kind?: unknown }).kind ?? "") : "";
  if (error instanceof InvalidRequest) return 400;
  if (kind === "surface_absent") return 501;
  if (kind === "") return typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === "InvalidRequest" ? 400 : 500;
  if (/^unknown_|_unknown$|^not_admitted$/.test(kind)) return 404;
  if (/stale|basis_mismatch|conflict|already_|head_mismatch|_closed$|retired_lineage/.test(kind)) return 409;
  if (/unauthenticated|not_a_participant|not_required|unauthorized|unverified|representation_not_admitted|_denied$/.test(kind)) return 403;
  if (/^invalid_|unknown_type|invalid_content|missing_/.test(kind)) return 400;
  return 500;
}

function problem(status: number, detail: string): ApplicationRouteResult {
  return { status, body: { error: { status, detail } } };
}

export async function handleApplicationRequest(input: ApplicationRouteInput): Promise<ApplicationRouteResult | undefined> {
  const { application, method, pathname, query } = input;
  if (!pathname.startsWith("/api/")) return undefined;
  try {
    const result = await dispatch(application, method, pathname, query, input.body);
    return result;
  } catch (error) {
    const status = applicationErrorStatus(error);
    return problem(status, error instanceof Error ? error.message : String(error));
  }
}

async function dispatch(application: PalimpsestApplicationSurface, method: string, pathname: string, query: URLSearchParams, body: unknown): Promise<ApplicationRouteResult | undefined> {
  const ok = (value: unknown): ApplicationRouteResult => ({ status: 200, body: value === undefined ? null : value });
  const requireGet = (): void => {
    if (method !== "GET") throw new InvalidRequest(`route ${pathname} requires GET`);
  };
  const requirePost = (): void => {
    if (method !== "POST") throw new InvalidRequest(`route ${pathname} requires POST`);
  };

  if (pathname === "/api/application/surfaces") {
    requireGet();
    return ok({
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
    });
  }

  /* ---- federation ---- */
  if (pathname === "/api/federation/inbox") {
    requireGet();
    return ok(await requireSurface(application.federation, "federation").inbox());
  }
  if (pathname === "/api/federation/thread") {
    requireGet();
    return ok(await requireSurface(application.federation, "federation").thread(queryRequired(query, "threadId")));
  }
  if (pathname === "/api/federation/message") {
    requirePost();
    const b = bodyObject(body);
    return ok(await requireSurface(application.federation, "federation").sendMessage({ to: { schemaVersion: 1, peerId: str(b.to, "to") }, threadId: str(b.threadId, "threadId"), body: str(b.body, "body") }));
  }
  if (pathname === "/api/federation/contact") {
    requirePost();
    const b = bodyObject(body);
    const tags = Array.isArray(b.competenceTags) ? b.competenceTags.map((tag) => str(tag, "competenceTags[]")) : [];
    return ok(await requireSurface(application.federation, "federation").findCandidates({ competenceTags: tags, origin: b.origin ?? { kind: "runtime_declared" }, reason: str(b.reason, "reason") }));
  }
  if (pathname === "/api/federation/commitment") {
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
  }
  if (pathname === "/api/federation/commitments") {
    requireGet();
    return ok(await requireSurface(application.federation, "federation").commitments());
  }

  /* ---- attention (semantic derivation; activation is a separate host step) ---- */
  if (pathname === "/api/attention") {
    requireGet();
    const attention = requireSurface(application.attention, "attention");
    return ok({ policyId: attention.policyId, pending: await attention.pending() });
  }

  /* ---- boundary ---- */
  if (pathname === "/api/boundary/workspace") {
    requireGet();
    return ok(await requireSurface(application.boundary, "boundary").view(queryRequired(query, "workspaceId")));
  }
  if (pathname === "/api/boundary/current") {
    requireGet();
    return ok(await requireSurface(application.boundary, "boundary").currentAccepted({ workspaceId: queryRequired(query, "workspaceId"), artifactId: queryRequired(query, "artifactId") }));
  }
  if (pathname === "/api/boundary/pending") {
    requireGet();
    return ok(await requireSurface(application.boundary, "boundary").pendingCandidates({ workspaceId: queryRequired(query, "workspaceId"), artifactId: queryRequired(query, "artifactId") }));
  }
  if (pathname === "/api/boundary/membership") {
    requireGet();
    return ok(await requireSurface(application.boundary, "boundary").membership(queryRequired(query, "workspaceId")));
  }
  if (pathname === "/api/boundary/observation") {
    requireGet();
    return ok(await requireSurface(application.boundary, "boundary").observation(queryRequired(query, "workspaceId")));
  }
  if (pathname === "/api/boundary/propose") {
    requirePost();
    const b = bodyObject(body);
    const acceptors = Array.isArray(b.requiredAcceptors) ? b.requiredAcceptors.map((peer) => ({ schemaVersion: 1 as const, peerId: str(peer, "requiredAcceptors[]") })) : [];
    return ok(await requireSurface(application.boundary, "boundary").proposeRevision({ workspaceId: str(b.workspaceId, "workspaceId"), artifactId: str(b.artifactId, "artifactId"), base: b.base ?? null, content: b.content, requiredAcceptors: acceptors, intent: str(b.intent, "intent") }));
  }
  if (pathname === "/api/boundary/decide") {
    requirePost();
    const b = bodyObject(body);
    const decision = str(b.decision, "decision");
    if (decision !== "accept" && decision !== "reject") throw new InvalidRequest('decision must be "accept" or "reject"');
    return ok(await requireSurface(application.boundary, "boundary").decide({ workspaceId: str(b.workspaceId, "workspaceId"), artifactId: str(b.artifactId, "artifactId"), candidateDigest: str(b.candidateDigest, "candidateDigest"), decision }));
  }

  /* ---- runtime ---- */
  if (pathname === "/api/runtime/scopes") {
    requireGet();
    return ok(await requireSurface(application.runtime, "runtime").list());
  }
  if (pathname === "/api/runtime/scope") {
    requireGet();
    return ok(await requireSurface(application.runtime, "runtime").view(queryRequired(query, "scopeId")));
  }
  if (pathname === "/api/runtime/holon") {
    requireGet();
    return ok(await requireSurface(application.runtime, "runtime").holon(queryRequired(query, "scopeId")));
  }

  /* ---- organization / institution ---- */
  if (pathname === "/api/organization/view") {
    requireGet();
    return ok(await requireSurface(application.organization, "organization").view(queryRequired(query, "organizationDefinitionId")));
  }
  if (pathname === "/api/organization/retirements") {
    requireGet();
    return ok(await requireSurface(application.organization, "organization").retirements());
  }
  if (pathname === "/api/organization/institutions") {
    requireGet();
    return ok(await requireSurface(application.organization, "organization").institutions());
  }
  if (pathname === "/api/organization/institution") {
    requireGet();
    return ok(await requireSurface(application.organization, "organization").institutionView(queryRequired(query, "institutionId")));
  }

  /* ---- campaign ---- */
  if (pathname === "/api/campaign/view") {
    requireGet();
    return ok(await requireSurface(application.campaign, "campaign").view(queryRequired(query, "campaignId")));
  }

  /* ---- dynamics ---- */
  if (pathname === "/api/dynamics/observe" || pathname === "/api/dynamics/diagnose" || pathname === "/api/dynamics/propose" || pathname === "/api/dynamics/impact" || pathname === "/api/dynamics/freshness") {
    requirePost();
    const b = bodyObject(body);
    const dynamics = requireSurface(application.dynamics, "dynamics");
    if (pathname === "/api/dynamics/observe") return ok(await dynamics.observe(b.subject));
    if (pathname === "/api/dynamics/diagnose") return ok(await dynamics.diagnose(b.subject));
    if (pathname === "/api/dynamics/propose") return ok(await dynamics.propose({ subject: b.subject, ...(b.advisor === undefined ? {} : { advisor: b.advisor }) }));
    if (pathname === "/api/dynamics/impact") return ok(await dynamics.proposalImpact({ proposal: b.proposal, subject: b.subject }));
    return ok(await dynamics.freshness(b.proposal));
  }

  /* ---- evolution ---- */
  if (pathname.startsWith("/api/evolution/")) {
    requirePost();
    const b = bodyObject(body);
    const evolution = requireSurface(application.evolution, "evolution");
    if (pathname === "/api/evolution/inspect") return ok(await evolution.inspectOrganization(str(b.caseRef, "caseRef")));
    if (pathname === "/api/evolution/prepare") return ok(await evolution.prepareOrganization(b.proposal as never));
    if (pathname === "/api/evolution/advance") return ok(await evolution.advanceOrganization(b.proposal as never));
    if (pathname === "/api/evolution/inspect_runtime") return ok(await evolution.inspectRuntime(str(b.caseRef, "caseRef")));
    if (pathname === "/api/evolution/advance_runtime") return ok(await evolution.advanceRuntime(b.proposal as never));
    throw new InvalidRequest(`unknown evolution action "${pathname}"`);
  }

  /* ---- reasoning ---- */
  if (pathname === "/api/reasoning/view") {
    requireGet();
    return ok(await requireSurface(application.reasoning, "reasoning").view(queryRequired(query, "cellId")));
  }
  if (pathname === "/api/reasoning/frontier") {
    requireGet();
    return ok(await requireSurface(application.reasoning, "reasoning").frontier(queryRequired(query, "cellId")));
  }
  if (pathname === "/api/reasoning/graph") {
    requireGet();
    return ok(await requireSurface(application.reasoning, "reasoning").graph(queryRequired(query, "cellId")));
  }
  if (pathname === "/api/reasoning/brief") {
    requireGet();
    return ok(await requireSurface(application.reasoning, "reasoning").brief({ cellId: queryRequired(query, "cellId"), branchId: queryRequired(query, "branchId") }));
  }
  if (pathname === "/api/reasoning/branch") {
    requirePost();
    const b = bodyObject(body);
    return ok(await requireSurface(application.reasoning, "reasoning").openBranch({ cellId: str(b.cellId, "cellId"), question: str(b.question, "question") }));
  }
  if (pathname === "/api/reasoning/candidate") {
    requirePost();
    const b = bodyObject(body);
    return ok(await requireSurface(application.reasoning, "reasoning").submitCandidate({ cellId: str(b.cellId, "cellId"), branchId: str(b.branchId, "branchId"), type: b.type as never, content: b.content, ...(Array.isArray(b.dependencies) ? { dependencies: b.dependencies as never } : {}) }));
  }
  if (pathname === "/api/reasoning/evaluate") {
    requirePost();
    const b = bodyObject(body);
    return ok(await requireSurface(application.reasoning, "reasoning").evaluate({ cellId: str(b.cellId, "cellId"), candidateDigest: str(b.candidateDigest, "candidateDigest") }));
  }
  if (pathname === "/api/reasoning/invalidate") {
    requirePost();
    const b = bodyObject(body);
    return ok(await requireSurface(application.reasoning, "reasoning").invalidate({ cellId: str(b.cellId, "cellId"), targetClaimId: str(b.targetClaimId, "targetClaimId"), reason: str(b.reason, "reason") }));
  }

  /* ---- projections ---- */
  if (pathname === "/api/projection/work") {
    requireGet();
    return ok(await requireSurface(application.projections, "projections").work());
  }
  if (pathname === "/api/projection/organization") {
    requireGet();
    return ok(await requireSurface(application.projections, "projections").organization({ organizationDefinitionId: queryRequired(query, "organizationDefinitionId") }));
  }
  if (pathname === "/api/projection/collaboration") {
    requireGet();
    return ok(await requireSurface(application.projections, "projections").collaboration());
  }
  if (pathname === "/api/projection/runtime") {
    requireGet();
    return ok(await requireSurface(application.projections, "projections").runtime());
  }
  if (pathname === "/api/projection/reasoning") {
    requireGet();
    return ok(await requireSurface(application.projections, "projections").reasoning({ cellId: queryRequired(query, "cellId") }));
  }

  return undefined;
}
