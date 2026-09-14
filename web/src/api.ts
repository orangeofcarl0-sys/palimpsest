/** Token-authed fetch wrapper over the PLMP-WEB-1 endpoints. */

import type {
  CanvasDiffResult,
  CanvasDoc,
  OrchestrationGraph,
  PresetMeta,
  ProjectProposal,
  ProposalDiagnostic,
} from "./types";

const TOKEN_KEY = "palimpsest-token";

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(value: string): void {
  localStorage.setItem(TOKEN_KEY, value);
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${getToken()}`,
      ...(init?.body === undefined ? {} : { "content-type": "application/json" }),
    },
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new ApiError(response.status, message);
  }
  return body as T;
}

export interface GraphResponse {
  graph?: OrchestrationGraph;
  changed: boolean;
  /** Spec 35 (PLMP-PARSE-1): opaque validator for the COMPLETE projection -
   * not the canonical event cursor. Send it back for the cheap fast path. */
  viewCursor: string;
}

/** Spec 35: the polling protocol is viewCursor-based (same viewCursor ⇒ same
 * complete graph; the unchanged fast path skips the graph build). The legacy
 * numeric ?cursor= remains supported server-side but the panel uses the
 * freshness-correct protocol. */
export const getGraph = (viewCursor?: string): Promise<GraphResponse> =>
  call<GraphResponse>(`/api/graph${viewCursor === undefined ? "" : `?viewCursor=${encodeURIComponent(viewCursor)}`}`);

export const health = (): Promise<{ ok: boolean; projectInitialized: boolean; eventCursor: number }> =>
  call("/api/health");

export const control = (op: string, body?: unknown): Promise<{ result: unknown }> =>
  call(`/api/control/${op}`, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export const validateProposal = (
  proposal: ProjectProposal,
): Promise<{ diagnostics: ProposalDiagnostic[] }> =>
  call("/api/proposal/validate", { method: "POST", body: JSON.stringify(proposal) });

export const listPresets = (): Promise<{ presets: PresetMeta[] }> => call("/api/presets");

/** PLMP-ARCH-3: a preset draft is pure derivation - the kernel builds it, zero writes. */
export const presetDraft = (
  id: string,
  params: Record<string, unknown>,
): Promise<{ proposal: ProjectProposal }> =>
  call(`/api/preset/${id}/draft`, { method: "POST", body: JSON.stringify(params) });

/** PLMP-CANVAS: pure derivations over the canvas doc - zero server-side state. */

/** PLMP-CANVAS-7 D8: the compile-independent Work-authoring anchor - one
 * server observation returns BOTH anchors (revision + digest); runtime-
 * invalid graphs still anchor (the endpoint never compiles). */
export const anchorCanvas = (
  doc: CanvasDoc,
): Promise<{ baseRevision: number; baseGraphDigest: string }> =>
  call("/api/canvas/anchor", { method: "POST", body: JSON.stringify({ doc }) });

export const compileCanvas = (
  doc: CanvasDoc,
  goal?: string,
): Promise<{
  proposal: ProjectProposal;
  diagnostics: ProposalDiagnostic[];
  /** PLMP-GRAPH-5 §B3: the draft's semantic freshness anchor. */
  graphDigest: string;
}> =>
  call("/api/canvas/compile", {
    method: "POST",
    body: JSON.stringify({ doc, ...(goal === undefined ? {} : { goal }) }),
  });

export const diffCanvas = (payload: {
  doc?: CanvasDoc;
  proposal?: ProjectProposal;
}): Promise<{ diff: CanvasDiffResult }> =>
  call("/api/canvas/diff", { method: "POST", body: JSON.stringify(payload) });

export const layoutCanvas = (doc: CanvasDoc, layout: string): Promise<{ doc: CanvasDoc }> =>
  call("/api/canvas/layout", { method: "POST", body: JSON.stringify({ doc, layout }) });

export const insertProposal = (
  doc: CanvasDoc,
  proposal: ProjectProposal,
): Promise<{ doc: CanvasDoc }> =>
  call("/api/canvas/insert", { method: "POST", body: JSON.stringify({ doc, proposal }) });

export const declareProposal = (
  proposal: ProjectProposal,
  stageGraph?: unknown,
): Promise<{ diagnostics: ProposalDiagnostic[]; declared: boolean; eventType?: string }> =>
  call("/api/proposal/declare", {
    method: "POST",
    body: JSON.stringify({ proposal, ...(stageGraph === undefined ? {} : { stageGraph }) }),
  });

/** PLMP-GRAPH-2: patch review face - validate/preview/apply to the draft, zero writes. */
export interface CanvasPatchPreviewEntry {
  op: "add" | "remove" | "update" | "move";
  target: "node" | "edge";
  id: string;
  detail: string;
}

export interface CanvasPatchDiagnostic {
  type: string;
  id?: string;
  detail: string;
}

export interface CanvasPatchResult {
  applied: boolean;
  doc?: CanvasDoc;
  preview: CanvasPatchPreviewEntry[];
  diagnostics: CanvasPatchDiagnostic[];
  compileError?: string;
  /** PLMP-GRAPH-5 §B3: freshness anchor - the returned draft on success, the
   * requested draft on refusal (both guaranteed by the kernel contract). */
  graphDigest: string;
}

export const patchCanvas = (doc: CanvasDoc, patch: unknown): Promise<CanvasPatchResult> =>
  call("/api/canvas/patch", { method: "POST", body: JSON.stringify({ doc, patch }) });

/* ------------------------------------------------------------------ *
 * G10-O unified application surface (typed routes; same canonical state as the tools)
 * ------------------------------------------------------------------ */

export interface ApplicationSurfaceAvailability {
  readonly work: boolean;
  readonly federation: boolean;
  readonly boundary: boolean;
  readonly runtime: boolean;
  readonly organization: boolean;
  readonly campaign: boolean;
  readonly dynamics: boolean;
  readonly evolution: boolean;
  readonly reasoning: boolean;
  readonly projections: boolean;
}

export function applicationSurfaces(): Promise<ApplicationSurfaceAvailability> {
  return call<ApplicationSurfaceAvailability>("/api/application/surfaces");
}

export type GraphSpecies = "work" | "organization" | "collaboration" | "runtime" | "reasoning";

export interface CanonicalNodeRef {
  readonly species: GraphSpecies;
  readonly kind: string;
  readonly id: string;
}

export interface ProjectionNode {
  readonly presentationId: string;
  readonly ref: CanonicalNodeRef;
  readonly kind: string;
  readonly label: string;
  readonly state: string | null;
}

export interface ProjectionEdge {
  readonly presentationId: string;
  readonly from: string;
  readonly to: string;
  readonly kind: string;
}

export interface ProjectionEnvelope {
  readonly schemaVersion: 1;
  readonly species: GraphSpecies;
  readonly knowledge: "known" | "unknown" | "error" | "stale";
  readonly sourceBases: readonly { readonly source: string; readonly ref: string; readonly throughSeq: number | null; readonly chainDigest: string | null }[];
  readonly nodes: readonly ProjectionNode[];
  readonly edges: readonly ProjectionEdge[];
  readonly projectionDigest: string;
}

export function projection(species: GraphSpecies, params: { readonly organizationDefinitionId?: string; readonly cellId?: string } = {}): Promise<ProjectionEnvelope> {
  const search = new URLSearchParams();
  if (params.organizationDefinitionId !== undefined) search.set("organizationDefinitionId", params.organizationDefinitionId);
  if (params.cellId !== undefined) search.set("cellId", params.cellId);
  const query = search.toString();
  return call<ProjectionEnvelope>(`/api/projection/${species}${query === "" ? "" : `?${query}`}`);
}

export function reasoningEvaluate(input: { readonly cellId: string; readonly candidateDigest: string }): Promise<unknown> {
  return call<unknown>("/api/reasoning/evaluate", { method: "POST", body: JSON.stringify(input) });
}

export function boundaryDecide(input: { readonly workspaceId: string; readonly artifactId: string; readonly candidateDigest: string; readonly decision: "accept" | "reject" }): Promise<unknown> {
  return call<unknown>("/api/boundary/decide", { method: "POST", body: JSON.stringify(input) });
}

export function boundaryView(workspaceId: string): Promise<unknown> {
  return call<unknown>(`/api/boundary/workspace?workspaceId=${encodeURIComponent(workspaceId)}`);
}
