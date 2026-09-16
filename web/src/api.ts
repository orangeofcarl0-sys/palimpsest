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
  /** G10-V: the DERIVED project workspace surface (the default landing when present). */
  readonly projectWorkspace: boolean;
  /** G10-V: the bounded management-autonomy surface (recommend/preview/step/request only). */
  readonly projectManagement: boolean;
  /** G10-S: read-only recipe catalog (a work-mode hint source, never a score). */
  readonly recipes?: boolean;
  /** G10-S: read-only advisor availability (per-task mode recommendations only). */
  readonly advisor?: boolean;
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

/* ------------------------------------------------------------------ *
 * G10-U Proof Vault (typed /api/proof/* and /api/proof/disclosure/* routes)
 *
 * Every helper here is a thin, typed wrapper over ONE strict server route.
 * No store, blob, or raw SQLite is reachable from the browser; content is only
 * ever read through the explicit `read_explicit` route.
 * ------------------------------------------------------------------ */

export type ProofClaimStanding =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "CONTRADICTED"
  | "INCONCLUSIVE"
  | "STALE";

export type ProofFreshness = "fresh" | "stale" | "unknown";

export type SourceProvenance = "LOCAL_IMPORT" | "EXTERNAL_REFERENCE" | "GENERATED_ARTIFACT";

export type EvidenceSelector =
  | { readonly kind: "WHOLE_SOURCE" }
  | { readonly kind: "TEXT_RANGE"; readonly start: number; readonly end: number }
  | { readonly kind: "JSON_POINTER"; readonly pointer: string };

export interface ProofSourceRevisionRef {
  readonly schemaVersion: 1;
  readonly sourceId: string;
  readonly revision: number;
  readonly contentDigest: string;
}

export interface ProofSourceRevision extends ProofSourceRevisionRef {
  readonly mediaType: string;
  readonly label: string;
  readonly provenance: SourceProvenance;
  readonly blobRef?: string;
  readonly externalResolverRef?: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly digest: string;
}

export interface ProofSourceSummary {
  readonly sourceId: string;
  readonly revisionCount: number;
  readonly latestRevision: number;
  readonly latestContentDigest: string;
  readonly latestMediaType: string;
  readonly latestLabel: string;
  readonly provenance: SourceProvenance;
}

export interface EvidenceItem {
  readonly schemaVersion: 1;
  readonly evidenceId: string;
  readonly sourceRevision: ProofSourceRevisionRef;
  readonly selector: EvidenceSelector;
  readonly selectionDigest: string;
  readonly provenanceDigest: string;
  readonly digest: string;
}

export interface PublishedProofClaim {
  readonly schemaVersion: 1;
  readonly claimRef: { readonly claimId: string };
  readonly claimType: { readonly typeId: string; readonly version: string };
  readonly content: unknown;
  readonly publicationProvenance: Readonly<Record<string, string>>;
  readonly publishedAt: string;
  readonly digest: string;
}

export interface ProofAssetDependency {
  readonly claimId: string;
  readonly effectiveStanding: ProofClaimStanding;
}

export interface ProofAssetView {
  readonly schemaVersion: 1;
  readonly claimRef: { readonly claimId: string };
  readonly claimType: { readonly typeId: string; readonly version: string };
  readonly content: unknown;
  readonly baseStanding: ProofClaimStanding;
  readonly effectiveStanding: ProofClaimStanding;
  readonly freshness: ProofFreshness;
  readonly freshnessExplanation: string;
  readonly supportingEvidence: readonly EvidenceItem[];
  readonly contradictingEvidence: readonly EvidenceItem[];
  readonly sourceRevisions: readonly ProofSourceRevisionRef[];
  readonly dependencies: readonly ProofAssetDependency[];
  readonly publicationProvenance: Readonly<Record<string, string>>;
  readonly digest: string;
}

export interface ProofWhyAssessment {
  readonly assessmentId: string;
  readonly standing: ProofClaimStanding;
  readonly policyRef: { readonly policyId: string; readonly version: string };
  readonly assessedAt: string;
  readonly previousAssessmentId?: string;
}

export interface ProofWhy {
  readonly claimRef: { readonly claimId: string };
  readonly claimType: { readonly typeId: string; readonly version: string };
  readonly content: unknown;
  readonly baseStanding: ProofClaimStanding;
  readonly effectiveStanding: ProofClaimStanding;
  readonly freshness: ProofFreshness;
  readonly freshnessExplanation: string;
  readonly verification: {
    readonly standing: ProofClaimStanding;
    readonly supportingEvidenceIds: readonly string[];
    readonly contradictingEvidenceIds: readonly string[];
    readonly policyRef: { readonly policyId: string; readonly version: string };
    readonly digest: string;
  } | null;
  readonly policyRef: { readonly policyId: string; readonly version: string } | null;
  readonly evidence: readonly EvidenceItem[];
  readonly sourceRevisions: readonly ProofSourceRevisionRef[];
  readonly provenance: Readonly<Record<string, string>>;
  readonly dependencies: readonly ProofAssetDependency[];
  readonly assessments: readonly ProofWhyAssessment[];
}

export interface ClaimStandingSnapshot {
  readonly claim: { readonly claimId: string };
  readonly status: ProofClaimStanding;
  readonly supportingEvidenceIds: readonly string[];
  readonly contradictingEvidenceIds: readonly string[];
  readonly provenanceDigest: string;
  readonly digest: string;
}

export type EvidenceKnowledge<T> =
  | { readonly state: "known"; readonly value: T }
  | { readonly state: "unknown"; readonly detail: string }
  | { readonly state: "error"; readonly detail: string };

export type ProofReadExplicitResult =
  | { readonly state: "unavailable"; readonly sourceId: string; readonly revision: number; readonly contentDigest: string }
  | { readonly state: "available"; readonly sourceId: string; readonly revision: number; readonly contentDigest: string; readonly content: string };

export interface ProofClaimCandidateSummary {
  readonly candidateId: string;
  readonly claimType: { readonly typeId: string; readonly version: string };
  readonly content: unknown;
  readonly supportingEvidence: readonly { readonly evidenceId: string }[];
  readonly contradictingEvidence: readonly { readonly evidenceId: string }[];
  readonly dependencies: readonly { readonly claimId: string }[];
  readonly origin: string;
  readonly provenance: Readonly<Record<string, string>>;
  readonly digest: string;
}

export type ProofPreparePublicationResult =
  | { readonly status: "prepared"; readonly candidate: ProofClaimCandidateSummary }
  | { readonly status: "blocked"; readonly reason: string };

export interface ProofPublicationResult {
  readonly decision: "PUBLISH" | "REJECT" | "UNRESOLVED";
  readonly verification: {
    readonly standing: ProofClaimStanding;
    readonly supportingEvidenceIds: readonly string[];
    readonly contradictingEvidenceIds: readonly string[];
    readonly policyRef: { readonly policyId: string; readonly version: string };
    readonly digest: string;
  };
  readonly publication: {
    readonly candidateId: string;
    readonly decision: "PUBLISH" | "REJECT" | "UNRESOLVED";
    readonly policyRef: { readonly policyId: string; readonly version: string };
  };
  readonly claimId?: string;
}

export interface ClaimAssessmentRevision {
  readonly schemaVersion: 1;
  readonly assessmentId: string;
  readonly claimRef: { readonly claimId: string };
  readonly verificationPolicyRef: { readonly policyId: string; readonly version: string };
  readonly supportingEvidenceIds: readonly string[];
  readonly contradictingEvidenceIds: readonly string[];
  readonly standing: ProofClaimStanding;
  readonly provenanceDigest: string;
  readonly previousAssessmentId?: string;
  readonly assessedAt: string;
  readonly digest: string;
}

export interface AnalyzeEvidenceOutcome {
  readonly status: "analyzed" | "capability_required" | "blocked";
  readonly cellId?: string;
  readonly branchCount?: number;
  readonly admittedClaimIds?: readonly string[];
  readonly candidateDigests?: readonly string[];
  readonly detail?: string;
}

export interface DisclosureMaterial {
  readonly evidenceId: string;
  readonly sourceRevision: ProofSourceRevisionRef;
  readonly selector: EvidenceSelector;
  readonly materializationKind: "ORIGINAL_SOURCE" | "TEXT_EXCERPT" | "JSON_VALUE";
  readonly mediaType: string;
  readonly contentDigest: string;
  readonly fileName: string;
}

export interface DisclosurePreview {
  readonly schemaVersion: 1;
  readonly previewId: string;
  readonly purpose: string;
  readonly audienceLabel: string;
  readonly claimIds: readonly string[];
  readonly claims: readonly ProofAssetView[];
  readonly requiredDependencyIds: readonly string[];
  readonly evidenceRefs: readonly { readonly evidenceId: string }[];
  readonly sourceRevisionRefs: readonly ProofSourceRevisionRef[];
  readonly materials: readonly DisclosureMaterial[];
  readonly wholeSourceWarnings: readonly string[];
  readonly warnings: readonly string[];
  readonly excludedBySelection: readonly string[];
  readonly digest: string;
}

export interface DisclosureExportReceipt {
  readonly schemaVersion: 1;
  readonly bundleDigest: string;
  readonly purpose: string;
  readonly audienceLabel: string;
  readonly exportedAt: string;
  readonly exporterId: string;
  readonly digest: string;
}

export type DisclosureExportOutcome =
  | { readonly status: "exported"; readonly receipt: DisclosureExportReceipt }
  | { readonly status: "blocked"; readonly reason: string }
  | { readonly status: "capability_required"; readonly capability: string };

export interface ProofSurfaceAvailability {
  readonly proof: boolean;
  readonly disclosure: boolean;
}

/** GET /api/application/surfaces — narrowed to the two proof-plane booleans. */
export async function proofSurfaces(): Promise<ProofSurfaceAvailability> {
  const surfaces = await call<{ readonly proof?: boolean; readonly disclosure?: boolean }>("/api/application/surfaces");
  return { proof: surfaces.proof === true, disclosure: surfaces.disclosure === true };
}

/** GET /api/proof/sources */
export function proofSources(): Promise<readonly ProofSourceSummary[]> {
  return call<readonly ProofSourceSummary[]>("/api/proof/sources");
}

/** GET /api/proof/sources/revisions?sourceId= */
export function proofSourceRevisions(sourceId: string): Promise<readonly ProofSourceRevision[]> {
  return call<readonly ProofSourceRevision[]>(`/api/proof/sources/revisions?sourceId=${encodeURIComponent(sourceId)}`);
}

/** GET /api/proof/sources/inspect?sourceId=&revision= */
export function proofSourceInspect(input: { readonly sourceId: string; readonly revision: number }): Promise<ProofSourceRevision | null> {
  return call<ProofSourceRevision | null>(
    `/api/proof/sources/inspect?sourceId=${encodeURIComponent(input.sourceId)}&revision=${encodeURIComponent(String(input.revision))}`,
  );
}

/** POST /api/proof/sources/import — the body field the server reads is `content` (base64). */
export function proofImportSource(input: {
  readonly sourceId: string;
  readonly label: string;
  readonly mediaType: string;
  readonly provenance: SourceProvenance;
  readonly contentBase64: string;
}): Promise<{ readonly revision: ProofSourceRevision }> {
  return call<{ readonly revision: ProofSourceRevision }>("/api/proof/sources/import", {
    method: "POST",
    body: JSON.stringify({
      sourceId: input.sourceId,
      label: input.label,
      mediaType: input.mediaType,
      provenance: input.provenance,
      content: input.contentBase64,
    }),
  });
}

/** POST /api/proof/sources/read_explicit — the ONLY explicit content read path. */
export function proofReadExplicit(input: {
  readonly sourceId: string;
  readonly revision: number;
  readonly contentDigest: string;
}): Promise<ProofReadExplicitResult> {
  return call<ProofReadExplicitResult>("/api/proof/sources/read_explicit", {
    method: "POST",
    body: JSON.stringify({ sourceId: input.sourceId, revision: input.revision, contentDigest: input.contentDigest }),
  });
}

/** POST /api/proof/evidence */
export function proofEvidenceCreate(input: {
  readonly sourceId: string;
  readonly revision: number;
  readonly contentDigest: string;
  readonly selector: EvidenceSelector;
}): Promise<EvidenceItem> {
  return call<EvidenceItem>("/api/proof/evidence", {
    method: "POST",
    body: JSON.stringify({
      sourceId: input.sourceId,
      revision: input.revision,
      contentDigest: input.contentDigest,
      selector: input.selector,
    }),
  });
}

/** GET /api/proof/claims */
export function proofClaims(): Promise<readonly PublishedProofClaim[]> {
  return call<readonly PublishedProofClaim[]>("/api/proof/claims");
}

/** GET /api/proof/claims/inspect?claimId= */
export function proofClaimInspect(claimId: string): Promise<EvidenceKnowledge<ClaimStandingSnapshot>> {
  return call<EvidenceKnowledge<ClaimStandingSnapshot>>(`/api/proof/claims/inspect?claimId=${encodeURIComponent(claimId)}`);
}

/** GET /api/proof/claims/why?claimId= */
export function proofClaimWhy(claimId: string): Promise<ProofWhy> {
  return call<ProofWhy>(`/api/proof/claims/why?claimId=${encodeURIComponent(claimId)}`);
}

/** POST /api/proof/publication/prepare (read-only materialization; never verifies/publishes) */
export function proofPreparePublication(input: { readonly cellId: string; readonly claimId: string }): Promise<ProofPreparePublicationResult> {
  return call<ProofPreparePublicationResult>("/api/proof/publication/prepare", {
    method: "POST",
    body: JSON.stringify({ cellId: input.cellId, claimId: input.claimId }),
  });
}

/** POST /api/proof/publication/evaluate (verify then the SEPARATE publication admission) */
export function proofEvaluatePublication(input: { readonly candidateId: string }): Promise<ProofPublicationResult> {
  return call<ProofPublicationResult>("/api/proof/publication/evaluate", {
    method: "POST",
    body: JSON.stringify({ candidateId: input.candidateId }),
  });
}

/** POST /api/proof/claims/reassess */
export function proofReassess(input: { readonly claimId: string }): Promise<ClaimAssessmentRevision> {
  return call<ClaimAssessmentRevision>("/api/proof/claims/reassess", {
    method: "POST",
    body: JSON.stringify({ claimId: input.claimId }),
  });
}

/** POST /api/proof/analyze — evidence-grounded explore; never publishes or approves. */
export function proofAnalyze(input: {
  readonly evidenceIds: readonly string[];
  readonly objective: string;
  readonly branchCount?: number;
}): Promise<AnalyzeEvidenceOutcome> {
  return call<AnalyzeEvidenceOutcome>("/api/proof/analyze", {
    method: "POST",
    body: JSON.stringify({
      evidenceIds: [...input.evidenceIds],
      objective: input.objective,
      ...(input.branchCount === undefined ? {} : { branchCount: input.branchCount }),
    }),
  });
}

/** POST /api/proof/disclosure/preview — a description of what WOULD be disclosed. */
export function disclosurePreview(input: {
  readonly purpose: string;
  readonly audienceLabel: string;
  readonly requestedClaimIds: readonly string[];
}): Promise<DisclosurePreview> {
  return call<DisclosurePreview>("/api/proof/disclosure/preview", {
    method: "POST",
    body: JSON.stringify({
      purpose: input.purpose,
      audienceLabel: input.audienceLabel,
      requestedClaimIds: [...input.requestedClaimIds],
    }),
  });
}

/** POST /api/proof/disclosure/approve_export — the SEPARATE explicit export action. */
export function disclosureApproveExport(input: { readonly previewId: string }): Promise<DisclosureExportOutcome> {
  return call<DisclosureExportOutcome>("/api/proof/disclosure/approve_export", {
    method: "POST",
    body: JSON.stringify({ previewId: input.previewId }),
  });
}

/** GET /api/proof/disclosure/history */
export function disclosureHistory(): Promise<readonly DisclosureExportReceipt[]> {
  return call<readonly DisclosureExportReceipt[]>("/api/proof/disclosure/history");
}

/* ------------------------------------------------------------------ *
 * G10-V Project Workspace (typed /api/project/* and /api/manage/* routes)
 *
 *   ProjectWorkspaceView ≠ CanonicalStore      OpenLoop ≠ WorkTask
 *   Association ≠ AssetContent                 Mode ≠ Authority
 *   Recommendation ≠ Mutation                  Request ≠ Change
 *
 * Every helper below is a thin, typed wrapper over ONE strict server route.
 * The workspace view is DERIVED server-side from the canonical owner matrix
 * plus the two narrowly-owned append-only histories; the browser never reaches
 * a store, and the management helpers can never set a mode (only request one).
 * ------------------------------------------------------------------ */

export type ProjectAssetKind =
  | "DECISION"
  | "PRODUCED_ARTIFACT"
  | "PROOF_CLAIM"
  | "EXPERIMENT"
  | "JOURNAL_ENTRY"
  | "CAMPAIGN"
  | "REASONING_CELL";

export type AssociationKind = "MANUAL" | "DERIVED_FROM_WORK" | "PUBLISHED";

/** An OPAQUE reference to an existing canonical asset - never its content. */
export interface CanonicalAssetRef {
  readonly kind: string;
  readonly id: string;
  readonly digest?: string;
}

export interface ProjectAssetAssociation {
  readonly schemaVersion: 1;
  readonly associationId: string;
  readonly projectId: string;
  readonly assetKind: ProjectAssetKind;
  readonly canonicalRef: CanonicalAssetRef;
  readonly associationKind: AssociationKind;
  readonly provenance: string;
  readonly recordedAt: string;
  readonly digest: string;
}

export type OpenLoopKind =
  | "BLOCKED_WORK"
  | "READY_WORK"
  | "CAMPAIGN_WATCH"
  | "REASONING_UNRESOLVED"
  | "STALE_PROOF"
  | "PENDING_COMMITMENT"
  | "PENDING_BOUNDARY_DECISION"
  | "JOURNAL_OPEN_QUESTION"
  | "JOURNAL_OPPORTUNITY";

/** A derived prompt to look - explicitly NOT a work task. */
export interface OpenLoop {
  readonly id: string;
  readonly kind: OpenLoopKind;
  readonly detail: string;
  readonly subjectRef?: { readonly kind: string; readonly id: string };
}

export interface WorkspaceHistoryEntry {
  readonly kind: string;
  readonly at: string;
  readonly detail: string;
}

export interface ProjectRequirement {
  readonly requirement_id: string;
  readonly statement: string;
  readonly priority: "critical" | "high" | "normal" | "low";
  readonly acceptance_refs: readonly string[];
}

export interface ProjectDecision {
  readonly decision_id: string;
  readonly statement: string;
  readonly rationale: string;
  readonly evidence_ids: readonly string[];
  readonly supersedes: string | null;
}

export interface WorkspaceProjectView {
  readonly goal: string;
  readonly revision: number;
  readonly digest: string;
  readonly headCommit: string;
  readonly requirements: readonly ProjectRequirement[];
  readonly decisions: readonly ProjectDecision[];
}

export interface WorkspaceTaskView {
  readonly task_id: string;
  readonly state: string;
  readonly last_event_id: number;
  readonly role?: string;
}

export interface WorkspaceAttemptView {
  readonly attempt_id: string;
  readonly task_id: string | null;
  readonly state: string;
  readonly attempt_no: number | null;
}

export interface WorkspaceEvidenceView {
  readonly evidence_id: string;
  readonly status: string;
}

export interface WorkspacePromotionView {
  readonly promotion_id: string;
  readonly state: string;
}

export interface WorkspaceResumeView {
  readonly action: string;
  readonly detail: string;
  readonly inFlightAttemptIds: readonly string[];
  readonly openTasks: readonly { readonly task_id: string; readonly state: string }[];
  readonly preparedPromotions: readonly string[];
}

export interface ProjectWorkspaceWorkView {
  readonly schedulerState: "RUNNING" | "PAUSED";
  readonly tasks: readonly WorkspaceTaskView[];
  readonly attempts: readonly WorkspaceAttemptView[];
  readonly evidence: readonly WorkspaceEvidenceView[];
  readonly promotions: readonly WorkspacePromotionView[];
  readonly resume: WorkspaceResumeView;
  readonly blockers: readonly string[];
}

export interface ProjectWorkspaceAssetsView {
  readonly associations: readonly ProjectAssetAssociation[];
  readonly byKind: Readonly<Record<string, number>>;
}

export interface ProjectWorkspaceView {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly project: WorkspaceProjectView;
  readonly work: ProjectWorkspaceWorkView;
  readonly assets: ProjectWorkspaceAssetsView;
  readonly openLoops: readonly OpenLoop[];
  readonly relations: { readonly campaignProjectRefs: readonly { readonly projectId: string; readonly revision: number; readonly digest: string }[] };
  readonly historySummary: readonly WorkspaceHistoryEntry[];
  readonly knowledgeWarnings: readonly string[];
}

export type ProjectJournalKind = "IDEA" | "OPEN_QUESTION" | "NEGATIVE_RESULT" | "OPPORTUNITY" | "REFERENCE_NOTE";
export type ProjectJournalResolutionStatus = "RESOLVED" | "DISMISSED" | "PROMOTED";

export interface ProjectJournalRef {
  readonly kind: string;
  readonly id: string;
}

export interface ProjectJournalResolution {
  readonly status: ProjectJournalResolutionStatus;
  readonly detail?: string;
}

export interface ProjectJournalEntry {
  readonly schemaVersion: 1;
  readonly entryId: string;
  readonly projectId: string;
  readonly kind: ProjectJournalKind;
  readonly title: string;
  readonly body: string;
  readonly provenance: string;
  readonly relatedRefs: readonly ProjectJournalRef[];
  readonly createdAt: string;
  readonly supersedes?: string;
  readonly resolution?: ProjectJournalResolution;
  readonly digest: string;
}

export interface ProjectJournalViewEntry {
  readonly entry: ProjectJournalEntry;
  readonly resolution?: ProjectJournalResolution;
  readonly resolvedAt?: string;
}

export type ManagementInvolvement = "DIRECT" | "ASSIST" | "MANAGE" | "DELEGATE";

export type ManagementRiskClass = "LOW" | "MEDIUM" | "HIGH" | "CONSTITUTIONAL";

export interface ManagementActionSubjectRef {
  readonly kind: string;
  readonly id: string;
}

/** A DERIVED, content-addressed prompt - no authority and no score. */
export interface ManagementActionCandidate {
  readonly actionId: string;
  readonly kind: string;
  readonly reason: string;
  readonly subjects: readonly ManagementActionSubjectRef[];
  readonly riskClass: ManagementRiskClass;
  readonly requiredConfirmation: boolean;
  readonly capability: string;
  readonly executable: boolean;
}

export interface ManagementAutonomyProfile {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly involvement: ManagementInvolvement;
  readonly budgets: { readonly maxStepsPerRun: number; readonly maxWallClockMs?: number };
  readonly allowedActionClasses: readonly string[];
  readonly confirmationBoundaries: readonly string[];
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly digest: string;
}

export interface ManagementAssessment {
  readonly profile: ManagementAutonomyProfile;
  readonly view: ProjectWorkspaceView;
  readonly candidates: readonly ManagementActionCandidate[];
}

export type ManagementStepPreview =
  | { readonly candidate: ManagementActionCandidate; readonly permitted: boolean; readonly requiredConfirmation: boolean; readonly reason: string }
  | { readonly candidate: null; readonly reason: string };

export type ManagementStepStatus = "executed" | "needs_confirmation" | "not_permitted" | "nothing_to_do";

export interface ManagementStepResult {
  readonly status: ManagementStepStatus;
  readonly action?: string;
  readonly detail: string;
}

export interface ManagementBoundedRun {
  readonly steps: readonly ManagementStepResult[];
  readonly stoppedReason: string;
}

/** GET /api/project/workspace */
export function projectWorkspace(): Promise<ProjectWorkspaceView> {
  return call<ProjectWorkspaceView>("/api/project/workspace");
}

/** GET /api/project/assets */
export function projectAssets(): Promise<readonly ProjectAssetAssociation[]> {
  return call<readonly ProjectAssetAssociation[]>("/api/project/assets");
}

/** GET /api/project/open_loops */
export function projectOpenLoops(): Promise<readonly OpenLoop[]> {
  return call<readonly OpenLoop[]>("/api/project/open_loops");
}

/** GET /api/project/history */
export function projectHistory(): Promise<readonly WorkspaceHistoryEntry[]> {
  return call<readonly WorkspaceHistoryEntry[]>("/api/project/history");
}

/** GET /api/project/journal[?projectId=] */
export function projectJournal(projectId?: string): Promise<readonly ProjectJournalViewEntry[]> {
  return call<readonly ProjectJournalViewEntry[]>(`/api/project/journal${projectId === undefined ? "" : `?projectId=${encodeURIComponent(projectId)}`}`);
}

/** POST /api/project/journal - appends one journal entry (a NEW event, never an edit). */
export function projectJournalRecord(input: {
  readonly kind: ProjectJournalKind;
  readonly title: string;
  readonly body: string;
  readonly provenance: string;
  readonly relatedRefs?: readonly ProjectJournalRef[];
  readonly projectId?: string;
}): Promise<ProjectJournalEntry> {
  return call<ProjectJournalEntry>("/api/project/journal", {
    method: "POST",
    body: JSON.stringify({
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      kind: input.kind,
      title: input.title,
      body: input.body,
      provenance: input.provenance,
      ...(input.relatedRefs === undefined ? {} : { relatedRefs: [...input.relatedRefs] }),
    }),
  });
}

/** POST /api/project/journal/resolve - records a resolution event for an existing entry. */
export function projectJournalResolve(input: {
  readonly entryId: string;
  readonly status: ProjectJournalResolutionStatus;
  readonly detail?: string;
  readonly projectId?: string;
}): Promise<ProjectJournalViewEntry> {
  return call<ProjectJournalViewEntry>("/api/project/journal/resolve", {
    method: "POST",
    body: JSON.stringify({
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      entryId: input.entryId,
      status: input.status,
      ...(input.detail === undefined ? {} : { detail: input.detail }),
    }),
  });
}

/** POST /api/project/decision - appends a decision through the existing ProjectIR lineage. */
export function projectDecision(input: {
  readonly statement: string;
  readonly rationale: string;
  readonly evidenceIds: readonly string[];
  readonly supersedes?: string;
  readonly projectId?: string;
}): Promise<{ readonly revision: number; readonly decision: ProjectDecision }> {
  return call<{ readonly revision: number; readonly decision: ProjectDecision }>("/api/project/decision", {
    method: "POST",
    body: JSON.stringify({
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      statement: input.statement,
      rationale: input.rationale,
      evidenceIds: [...input.evidenceIds],
      ...(input.supersedes === undefined ? {} : { supersedes: input.supersedes }),
    }),
  });
}

/** POST /api/project/association - links this project to an EXISTING canonical asset. */
export function projectAssociation(input: {
  readonly assetKind: ProjectAssetKind;
  readonly canonicalRef: CanonicalAssetRef;
  readonly associationKind: AssociationKind;
  readonly provenance: string;
  readonly projectId?: string;
}): Promise<ProjectAssetAssociation> {
  return call<ProjectAssetAssociation>("/api/project/association", {
    method: "POST",
    body: JSON.stringify({
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      assetKind: input.assetKind,
      canonicalRef: input.canonicalRef,
      associationKind: input.associationKind,
      provenance: input.provenance,
    }),
  });
}

/** POST /api/project/opportunity/promote - the EXPLICIT opportunity-to-task promotion. */
export function projectOpportunityPromote(input: {
  readonly entryId: string;
  readonly taskSpec: unknown;
  readonly projectId?: string;
}): Promise<{ readonly revision: number; readonly entryId: string; readonly taskId: string }> {
  return call<{ readonly revision: number; readonly entryId: string; readonly taskId: string }>("/api/project/opportunity/promote", {
    method: "POST",
    body: JSON.stringify({
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      entryId: input.entryId,
      taskSpec: input.taskSpec,
    }),
  });
}

/**
 * G10-AB §42: the DERIVED operating posture - the operator's Work Mode preference
 * with its EFFECTIVE capability status, plus the management axis. Read-only; the
 * preference is never authority and an unavailable capability is never presented
 * as active.
 */
export function operatingPosture(): Promise<ProjectOperatingPostureView> {
  return call<ProjectOperatingPostureView>("/api/project/operating-posture");
}

/** G10-AB: the durable, append-only management activity history (read-only). */
export function managementActivity(limit?: number): Promise<readonly ManagementActivityRecord[]> {
  return call<readonly ManagementActivityRecord[]>(
    limit === undefined ? "/api/manage/activity" : `/api/manage/activity?limit=${String(limit)}`,
  );
}

/** G10-AB: the derived operating history (references only). */
export function projectOperatingHistory(): Promise<ProjectOperatingHistory> {
  return call<ProjectOperatingHistory>("/api/project/operating-history");
}

export interface EffectiveModeStatus {
  readonly capability: string;
  readonly role: "base" | "modifier";
  readonly preferred: boolean;
  readonly readiness: string;
  readonly availability: "AVAILABLE" | "CONDITIONAL" | "PREVIEW_ONLY" | "UNAVAILABLE";
  readonly reason: string;
}

export interface ProjectOperatingPostureView {
  readonly projectId: string;
  readonly workMode: {
    readonly preferred: {
      readonly baseMode: string;
      readonly modifiers: readonly string[];
      readonly updatedAt: string;
      readonly updatedBy: string;
      readonly digest: string;
      readonly source: "stored" | "safe_default";
      readonly degradedReason?: string | undefined;
    };
    readonly effectiveStatus: readonly EffectiveModeStatus[];
    readonly capabilityWarnings: readonly string[];
    readonly historySummary: {
      readonly changes: number;
      readonly lastChange: {
        readonly at: string;
        readonly updatedBy: string;
        readonly from: string;
        readonly to: string;
      } | null;
    };
  };
  readonly management: {
    readonly involvement: string;
    readonly automaticActionClasses: readonly string[];
    readonly confirmationBoundaries: readonly string[];
    readonly historySummary: {
      readonly changes: number;
      readonly lastChange: {
        readonly at: string;
        readonly updatedBy: string;
        readonly from: string;
        readonly to: string;
      } | null;
    };
  };
}

export interface ManagementActivityRecord {
  readonly recordId: string;
  readonly sequence: number;
  readonly candidateRef: string;
  readonly actionClass: string;
  readonly decision: string;
  readonly confirmed: boolean;
  readonly reason: string;
  readonly typedReasonCode: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly canonicalOutcomeRefs: readonly { readonly kind: string; readonly ref: string }[];
  readonly supersedesRecordId: string | null;
}

export interface ProjectOperatingHistory {
  readonly entries: readonly {
    readonly kind: string;
    readonly ref: string;
    readonly at: string;
    readonly actor: string;
    readonly summary: string;
    readonly decision?: string | undefined;
    readonly canonicalOutcomeRefs: readonly string[];
    readonly incompleteCanonicalRef: boolean;
  }[];
  readonly counts: {
    readonly workModeChanges: number;
    readonly managementModeChanges: number;
    readonly managementActivity: number;
    readonly unresolvedActivity: number;
    readonly incompleteCanonicalRefs: number;
    /** G10-AC-R §13: canonical Campaign wake events REFERENCED by this view. */
    readonly campaignWakeEvents: number;
  };
  readonly hasIncompleteAuditRecords: boolean;
}

/* ------------------------------------------------------------------ *
 * G10-AC-R §11/§12: the READ-ONLY monitor runtime face
 * ------------------------------------------------------------------ */

/**
 * GET /api/monitor/status. Read-only observation of the composed Campaign
 * monitor runtime. There is no force-tick helper in this module on purpose:
 * `POST /api/monitor/status` is refused by the server (the route requires GET),
 * and the operator/debug tick exists only on the installed runtime.
 */
export function monitorStatus(): Promise<MonitorStatus> {
  return call<MonitorStatus>("/api/monitor/status");
}

/** GET /api/monitor/preview. READ-ONLY: what a tick WOULD do; it never ticks. */
export function monitorPreview(): Promise<MonitorPreview> {
  return call<MonitorPreview>("/api/monitor/preview");
}

/** The LIVE runtime capability the availability is derived from (never a claim). */
export interface MonitorRuntimeCapabilityView {
  readonly driverComposed: boolean;
  readonly scopeConfigured: boolean;
  readonly tickSourceConfigured: boolean;
  /** FALSE for the null/pull adapter: nothing can autonomously wake a host. */
  readonly activationConfigured: boolean;
  readonly deliveryMarksConfigured: boolean;
  readonly started: boolean;
  readonly startState: "NOT_CONFIGURED" | "MANUAL_ONLY" | "STARTING" | "RUNNING" | "FAILED";
  readonly startError: string | null;
  readonly provenance: "first_party" | "declared_external";
}

/** The at-least-once host wake signal; its identity is semantic, never a clock. */
export interface MonitorWakeActivationSignal {
  readonly signalId: string;
  readonly projectId: string;
  readonly campaignId: string;
  readonly wakeCycleId: string;
  readonly cause: string;
  readonly phase: string;
  readonly reconciliationDigest: string | null;
  readonly blockerCode: string | null;
  readonly detail: string;
  readonly createdAt: string;
}

export interface MonitorStatus {
  readonly projectId: string;
  readonly runtimeConfigured: boolean;
  readonly driverStarted: boolean;
  readonly capability: MonitorRuntimeCapabilityView;
  readonly availability: {
    readonly availability: "AVAILABLE" | "CONDITIONAL" | "PREVIEW_ONLY" | "UNAVAILABLE";
    readonly reason: string;
  };
  readonly deliveryMarks: "default" | "supplied" | "disabled";
  readonly monitorPreferenceEnabled: boolean;
  readonly preferenceSource: "stored" | "safe_default" | "unavailable";
  readonly disabledReason: string | null;
  readonly scopeId: string;
  readonly scopedCampaignCount: number;
  readonly dormantCampaignCount: number;
  readonly activeWatchCount: number;
  readonly inFlightWakeCount: number;
  readonly lastTick: string | null;
  readonly lastActivation: MonitorWakeActivationSignal | null;
  readonly tickSource: {
    readonly kind: string;
    readonly running: boolean;
    readonly fires: number;
    readonly intervalMs?: number | undefined;
  } | null;
}

/** ONE Campaign's outcome in a tick or preview (read-only when previewed). */
export interface MonitorCampaignOutcome {
  readonly campaignId: string;
  readonly lifecycle: string;
  readonly triggeredWatchIds: readonly string[];
  readonly beganWake: boolean;
  readonly wakeCycleId: string | null;
  readonly reconciled: boolean;
  readonly activationPhase: string | null;
  readonly delivered: boolean;
  readonly detail: string;
}

export interface MonitorPreview {
  readonly trigger: string;
  readonly enabled: boolean;
  readonly disabledReason: string | null;
  readonly scopedCampaignCount: number;
  readonly campaigns: readonly MonitorCampaignOutcome[];
  readonly wakeAdvances: number;
  readonly activations: number;
  readonly detail: string;
}

/** GET /api/manage/status - profile + derived view + derived candidates (read-only). */
export function manageStatus(): Promise<ManagementAssessment> {
  return call<ManagementAssessment>("/api/manage/status");
}

/**
 * POST /api/manage/step.
 *
 * An unconfirmed step evaluates the deterministic policy and acts only where no
 * confirmation boundary applies; a confirmed step still cannot cross an authority
 * boundary (a mode never grants authority).
 */
export function manageStep(input?: { readonly confirmed?: boolean }): Promise<ManagementStepResult> {
  return call<ManagementStepResult>("/api/manage/step", {
    method: "POST",
    body: JSON.stringify(input?.confirmed === undefined ? {} : { confirmed: input.confirmed }),
  });
}

/** POST /api/manage/run - bounded; the per-step read re-checks a downgrade immediately. */
export function manageRun(input?: { readonly maxSteps?: number }): Promise<ManagementBoundedRun> {
  return call<ManagementBoundedRun>("/api/manage/run", {
    method: "POST",
    body: JSON.stringify(input?.maxSteps === undefined ? {} : { maxSteps: input.maxSteps }),
  });
}

/**
 * POST /api/manage/request_mode_change.
 *
 * A REQUEST only. The agent-facing path can never apply an involvement change:
 * the returned status is always `requested` and only the operator control port
 * may persist it. There is deliberately no mode-setter helper in this module.
 */
export function manageRequestModeChange(input: { readonly to: ManagementInvolvement }): Promise<{ readonly status: "requested"; readonly detail: string }> {
  return call<{ readonly status: "requested"; readonly detail: string }>("/api/manage/request_mode_change", {
    method: "POST",
    body: JSON.stringify({ to: input.to }),
  });
}

/* ------------------------------------------------------------------ *
 * G10-AD §23: project-head verification (status / history / explicit run)
 * ------------------------------------------------------------------ */

/**
 * GET /api/verification/status.
 *
 * The DERIVED status of the EXACT current ProjectIR head. `state === "PASS"` means
 * only "the named verifier protocol passed" — never "the world is true", never Work
 * Evidence, never Proof publication, never Reasoning admission, never task state.
 * The status is derived per read; this module owns no verification state.
 */
export function verificationStatus(): Promise<VerificationStatus> {
  return call<VerificationStatus>("/api/verification/status");
}

/** GET /api/verification/history. The append-only runs, newest first (references only). */
export function verificationHistory(limit?: number): Promise<readonly VerificationRun[]> {
  return call<readonly VerificationRun[]>(
    limit === undefined ? "/api/verification/history" : `/api/verification/history?limit=${limit}`,
  );
}

/**
 * POST /api/verification/verify_current_head.
 *
 * A caller may select a REGISTERED `verifierRef` (or leave it to the deployment
 * default); the server refuses an unknown ref with a typed reason and runs nothing.
 * There is deliberately no helper that accepts a command, a commit or an
 * independence class: the subject is always the exact current project head.
 */
export function verificationVerifyCurrentHead(input?: {
  readonly verifierRef?: string;
  readonly reason?: string;
}): Promise<VerificationOutcome> {
  return call<VerificationOutcome>("/api/verification/verify_current_head", {
    method: "POST",
    body: JSON.stringify({
      ...(input?.verifierRef === undefined ? {} : { verifierRef: input.verifierRef }),
      ...(input?.reason === undefined ? {} : { reason: input.reason }),
    }),
  });
}

/** The exact verification subject: the canonical ProjectIR head, never a caller's commit. */
export interface VerificationSubject {
  readonly projectRevision: number;
  readonly projectDigest: string;
  readonly headCommit: string;
  readonly digest: string;
}

export interface VerificationRun {
  readonly runId: string;
  readonly requestRef: string;
  readonly subject: VerificationSubject;
  readonly verifierRef: string;
  readonly verifierDefinitionDigest: string;
  readonly independence: string;
  readonly status: string;
  readonly verdict: string | null;
  readonly score: number | null;
  readonly detail: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly freshness: string;
  readonly resultDigest: string | null;
  readonly runDigest: string;
}

export interface VerificationRunView {
  readonly run: VerificationRun;
  readonly freshness: string;
  readonly current: boolean;
  readonly reasons: readonly string[];
  readonly independent: boolean;
  readonly independenceBasis: string;
}

export interface VerificationStatus {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly subject: VerificationSubject | null;
  readonly repositoryHead: string | null;
  readonly repositoryConsistent: boolean | null;
  readonly runtimeAvailable: boolean;
  readonly independentVerifyAvailable: boolean;
  readonly registeredVerifierRefs: readonly string[];
  readonly executableVerifierRefs: readonly string[];
  readonly independentVerifierRefs: readonly string[];
  readonly declaredSeparateVerifierRefs: readonly string[];
  readonly defaultVerifierRef: string | null;
  readonly latestRun: VerificationRunView | null;
  readonly currentSubjectRun: VerificationRunView | null;
  readonly freshIndependentRun: VerificationRunView | null;
  readonly unresolvedRunIds: readonly string[];
  readonly state: string;
  readonly verdictScope: string;
  readonly detail: string;
  readonly derivedAt: string;
}

export interface VerificationOutcome {
  readonly status: "recorded" | "blocked";
  readonly typedReasonCode: string;
  readonly detail: string;
  readonly run: VerificationRun | null;
}

/** The canonical/product ref of a durable verification run (never a copied body). */
export function verificationRunRef(runId: string): string {
  return `project_verification:${runId}`;
}
