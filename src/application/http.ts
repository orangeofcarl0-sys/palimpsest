/**
 * G10-O typed application HTTP routes.
 *
 * Every route is namespaced and STRICT; there is no generic `POST /api/advanced {service, method}`
 * tunnel, and no route imports a canonical store. HTTP authentication (the server's bearer token)
 * only admits a request to the server — it is never semantic authority.
 */

import type { PalimpsestApplicationSurface } from "./surface.js";
import type { VariantKind } from "../organization_memory/index.js";
import { VARIANT_KINDS } from "../organization_memory/index.js";
import type { CompiledRecipePlan } from "../recipes/artifacts.js";
import { parseCompiledRecipePlan, parseRecipePlan } from "../recipes/artifacts.js";
import type { TaskProfile } from "../advisor/task_profile.js";
import { parseTaskProfile } from "../advisor/task_profile.js";
import type { RecipeExecutionContext } from "../recipes/execution.js";
import { SOURCE_PROVENANCES, parseEvidenceSelector, parseProofSourceRevisionRef } from "../proof_asset/index.js";

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

/** Strict-parse a request body artifact; a malformed body is a 400, never an internal error. */
function parseBody<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new InvalidRequest(error instanceof Error ? error.message : String(error));
  }
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
      experiments: application.empirical !== undefined,
      recipes: application.recipes !== undefined,
      advisor: application.advisor !== undefined,
      recipeExecution: application.recipeExecution !== undefined,
      proof: application.proof !== undefined,
      disclosure: application.disclosure !== undefined,
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
  if (pathname === "/api/federation/remote_decision") {
    requirePost();
    const b = bodyObject(body);
    const federation = requireSurface(application.federation, "federation");
    if (federation.submitRemoteDecision === undefined) throw new InvalidRequest("remote commitment decisions are not configured");
    const decision = str(b.decision, "decision");
    if (decision !== "accept" && decision !== "reject" && decision !== "release") throw new InvalidRequest('decision must be "accept" | "reject" | "release"');
    return ok(await federation.submitRemoteDecision({ to: { schemaVersion: 1, peerId: str(b.to, "to") }, commitmentId: str(b.commitmentId, "commitmentId"), decision }));
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
  if (pathname === "/api/boundary/submit_remote") {
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

  /* ---- empirical memory (READ-ONLY history; evaluation ≠ governance) ---- */
  if (pathname === "/api/experiments") {
    requireGet();
    return ok(await requireSurface(application.empirical, "experiments").experiments());
  }
  if (pathname === "/api/experiments/experiment") {
    requireGet();
    return ok(await requireSurface(application.empirical, "experiments").experiment(queryRequired(query, "experimentId")));
  }
  if (pathname === "/api/experiments/scenarios") {
    requireGet();
    return ok(await requireSurface(application.empirical, "experiments").scenarios(queryRequired(query, "experimentId")));
  }
  if (pathname === "/api/experiments/variants") {
    requireGet();
    return ok(await requireSurface(application.empirical, "experiments").variants(queryRequired(query, "experimentId")));
  }
  if (pathname === "/api/experiments/runs") {
    requireGet();
    return ok(await requireSurface(application.empirical, "experiments").runs(queryRequired(query, "experimentId")));
  }
  if (pathname === "/api/experiments/run") {
    requireGet();
    return ok(await requireSurface(application.empirical, "experiments").run(queryRequired(query, "runRef")));
  }
  if (pathname === "/api/experiments/evaluations") {
    requireGet();
    return ok(await requireSurface(application.empirical, "experiments").evaluations(queryRequired(query, "experimentId")));
  }
  if (pathname === "/api/experiments/corrections") {
    requireGet();
    return ok(await requireSurface(application.empirical, "experiments").corrections(queryRequired(query, "experimentId")));
  }
  if (pathname === "/api/memory/interventions") {
    requireGet();
    return ok(await requireSurface(application.empirical, "experiments").interventions());
  }
  if (pathname === "/api/memory/similar_runs") {
    requireGet();
    const empirical = requireSurface(application.empirical, "experiments");
    const scenarioId = query.get("scenarioId");
    const variantKind = query.get("variantKind");
    const provider = query.get("provider");
    const model = query.get("model");
    if (variantKind !== null && !(VARIANT_KINDS as readonly string[]).includes(variantKind)) {
      throw new InvalidRequest(`query parameter "variantKind" must be one of ${VARIANT_KINDS.join(", ")}`);
    }
    return ok(await empirical.similarRuns({
      ...(scenarioId === null || scenarioId === "" ? {} : { scenarioId }),
      ...(variantKind === null ? {} : { variantKind: variantKind as VariantKind }),
      ...(provider === null || provider === "" ? {} : { provider }),
      ...(model === null || model === "" ? {} : { model }),
    }));
  }
  if (pathname === "/api/memory/structural_history") {
    requireGet();
    return ok(await requireSurface(application.empirical, "experiments").structuralHistory(queryRequired(query, "subjectRef")));
  }

  /* ---- recipes / advisor (G10-S; read-only except an explicit governed start) ---- */
  if (pathname === "/api/recipes") {
    requireGet();
    return ok(requireSurface(application.recipes, "recipes").list());
  }
  if (pathname === "/api/recipes/recipe") {
    requireGet();
    return ok(requireSurface(application.recipes, "recipes").inspect(queryRequired(query, "id")) ?? null);
  }
  if (pathname === "/api/recipes/readiness") {
    requireGet();
    return ok(requireSurface(application.recipes, "recipes").readiness());
  }
  if (pathname === "/api/recipes/compile") {
    requirePost();
    const recipeExecution = requireSurface(application.recipeExecution, "recipeExecution");
    return ok(recipeExecution.compile(parseBody(() => parseRecipePlan(body, "request body"))));
  }
  if (pathname === "/api/recipes/execute") {
    requirePost();
    const recipeExecution = requireSurface(application.recipeExecution, "recipeExecution");
    const b = bodyObject(body);
    const hasEnvelope = Object.hasOwn(b, "compiled");
    const compiled: CompiledRecipePlan = parseBody(() => parseCompiledRecipePlan(hasEnvelope ? b.compiled : body, "request body"));
    const context = hasEnvelope ? b.context : undefined;
    return ok(await recipeExecution.start(compiled, (context === undefined || context === null ? {} : context) as RecipeExecutionContext));
  }
  if (pathname === "/api/advisor/recommend") {
    requirePost();
    const b = bodyObject(body);
    const advisor = requireSurface(application.advisor, "advisor");
    const taskProfile: TaskProfile = parseBody(() => parseTaskProfile(b.taskProfile, "taskProfile"));
    return ok(
      await advisor.recommend({
        taskProfile,
        ...(b.preferences === undefined ? {} : { preferences: b.preferences as never }),
        ...(typeof b.userRequestedMultiAgent === "boolean" ? { userRequestedMultiAgent: b.userRequestedMultiAgent } : {}),
      }),
    );
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

  /* ---- proof / evidence (G10-T; raw content is POST-only and goes through the explicit port) ---- */
  if (pathname === "/api/proof/sources") {
    requireGet();
    return ok(await requireSurface(application.proof, "proof").sources());
  }
  if (pathname === "/api/proof/sources/revisions") {
    requireGet();
    return ok(await requireSurface(application.proof, "proof").sourceRevisions(queryRequired(query, "sourceId")));
  }
  if (pathname === "/api/proof/sources/inspect") {
    requireGet();
    const proof = requireSurface(application.proof, "proof");
    const sourceId = queryRequired(query, "sourceId");
    const revision = Number(queryRequired(query, "revision"));
    if (!Number.isSafeInteger(revision) || revision < 0) throw new InvalidRequest('query parameter "revision" must be a non-negative integer');
    const revisions = await proof.sourceRevisions(sourceId);
    const found = revisions.find((entry) => entry.revision === revision);
    if (found === undefined) return ok(null);
    return ok(await proof.inspectSource({ schemaVersion: 1, sourceId: found.sourceId, revision: found.revision, contentDigest: found.contentDigest }));
  }
  if (pathname === "/api/proof/sources/import") {
    requirePost();
    const b = bodyObject(body);
    const provenance = str(b.provenance, "provenance");
    if (!(SOURCE_PROVENANCES as readonly string[]).includes(provenance)) {
      throw new InvalidRequest(`provenance must be one of ${SOURCE_PROVENANCES.join(", ")}`);
    }
    const content = str(b.content, "content");
    const bytes = new Uint8Array(Buffer.from(content, "base64"));
    const metadata = b.metadata === undefined ? undefined : (b.metadata as Readonly<Record<string, string>>);
    return ok(
      await requireSurface(application.proof, "proof").importSource({
        bytes,
        mediaType: str(b.mediaType, "mediaType"),
        label: str(b.label, "label"),
        provenance: provenance as (typeof SOURCE_PROVENANCES)[number],
        sourceId: str(b.sourceId, "sourceId"),
        ...(metadata === undefined ? {} : { metadata }),
      }),
    );
  }
  if (pathname === "/api/proof/sources/read_explicit") {
    requirePost();
    const b = bodyObject(body);
    const ref = parseBody(() =>
      parseProofSourceRevisionRef({
        schemaVersion: 1,
        sourceId: str(b.sourceId, "sourceId"),
        revision: b.revision,
        contentDigest: str(b.contentDigest, "contentDigest"),
      }),
    );
    const bytes = await requireSurface(application.proof, "proof").readContentExplicit(ref);
    if (bytes === undefined) return ok({ state: "unavailable", sourceId: ref.sourceId, revision: ref.revision, contentDigest: ref.contentDigest });
    return ok({ state: "available", sourceId: ref.sourceId, revision: ref.revision, contentDigest: ref.contentDigest, content: Buffer.from(bytes).toString("base64") });
  }
  if (pathname === "/api/proof/evidence") {
    requirePost();
    const b = bodyObject(body);
    const sourceRevision = parseBody(() =>
      parseProofSourceRevisionRef({
        schemaVersion: 1,
        sourceId: str(b.sourceId, "sourceId"),
        revision: b.revision,
        contentDigest: str(b.contentDigest, "contentDigest"),
      }),
    );
    const selector = parseBody(() => parseEvidenceSelector(b.selector, "selector"));
    return ok(await requireSurface(application.proof, "proof").recordEvidence({ sourceRevision, selector }));
  }
  if (pathname === "/api/proof/claims") {
    requireGet();
    return ok(await requireSurface(application.proof, "proof").claims());
  }
  if (pathname === "/api/proof/claims/inspect") {
    requireGet();
    return ok(await requireSurface(application.proof, "proof").inspectClaim(queryRequired(query, "claimId")));
  }
  if (pathname === "/api/proof/claims/why") {
    requireGet();
    return ok(await requireSurface(application.proof, "proof").why(queryRequired(query, "claimId")));
  }
  if (pathname === "/api/proof/publication/prepare") {
    requirePost();
    const b = bodyObject(body);
    return ok(await requireSurface(application.proof, "proof").preparePublication({ cellId: str(b.cellId, "cellId"), claimId: str(b.claimId, "claimId") }));
  }
  if (pathname === "/api/proof/publication/evaluate") {
    requirePost();
    const b = bodyObject(body);
    return ok(await requireSurface(application.proof, "proof").evaluatePublication({ candidateId: str(b.candidateId, "candidateId") }));
  }
  if (pathname === "/api/proof/claims/reassess") {
    requirePost();
    const b = bodyObject(body);
    return ok(await requireSurface(application.proof, "proof").reassess({ claimId: str(b.claimId, "claimId") }));
  }
  if (pathname === "/api/proof/disclosure/history") {
    requireGet();
    return ok(await requireSurface(application.disclosure, "disclosure").history());
  }
  if (pathname === "/api/proof/disclosure/preview") {
    requirePost();
    const b = bodyObject(body);
    const requestedClaimIds = Array.isArray(b.requestedClaimIds) ? b.requestedClaimIds.map((id) => str(id, "requestedClaimIds[]")) : [];
    return ok(
      await requireSurface(application.disclosure, "disclosure").preview({
        purpose: str(b.purpose, "purpose"),
        audienceLabel: str(b.audienceLabel, "audienceLabel"),
        requestedClaimIds,
      }),
    );
  }
  if (pathname === "/api/proof/disclosure/approve_export") {
    requirePost();
    const b = bodyObject(body);
    return ok(await requireSurface(application.disclosure, "disclosure").approveAndExport({ previewId: str(b.previewId, "previewId") }));
  }

  return undefined;
}
