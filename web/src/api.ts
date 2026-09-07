/** Token-authed fetch wrapper over the PLMP-WEB-1 endpoints. */

import type {
  CanvasDiffResult,
  CanvasDoc,
  OrchestrationGraph,
  PresetMeta,
  ProjectProposal,
  ProposalDiagnostic,
  SatelliteAttempt,
  TraceRow,
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
  graph: OrchestrationGraph;
  changed: boolean;
}

export const getGraph = (cursor?: number): Promise<GraphResponse> =>
  call<GraphResponse>(`/api/graph${cursor === undefined ? "" : `?cursor=${cursor}`}`);

export const health = (): Promise<{ ok: boolean; cursor: number }> => call("/api/health");

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

export const compileCanvas = (
  doc: CanvasDoc,
  goal?: string,
): Promise<{ proposal: ProjectProposal; diagnostics: ProposalDiagnostic[] }> =>
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

export const deriveCanvas = (): Promise<{
  satellites: SatelliteAttempt[];
  traces: TraceRow[];
}> => call("/api/canvas/derive", { method: "POST", body: "{}" });

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
}

export const patchCanvas = (doc: CanvasDoc, patch: unknown): Promise<CanvasPatchResult> =>
  call("/api/canvas/patch", { method: "POST", body: JSON.stringify({ doc, patch }) });
