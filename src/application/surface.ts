/**
 * G10-O PalimpsestApplicationSurface — ONE composed safe façade over the existing semantic
 * services. Tools and HTTP both call THIS surface; neither imports a store.
 *
 *   ApplicationSurface ≠ CanonicalStore      UI/Tool/HTTP ≠ AuthorityGrant
 *   Read model ≠ mutation path               caller ≠ caller-supplied Peer authority
 *
 * Only READ_ONLY and HIGH_LEVEL_SAFE_MUTATION service methods are exposed. Raw store
 * mutators, authority/admission ports, and verification ports are never reachable here.
 * Local actor identity is derived from installation wiring, never from a caller-supplied
 * `from`/`acceptedBy`/`localPeer`/`authenticated` field.
 */

import type { OrganizationDynamicsService, DynamicsPolicy, OrganizationDynamicsProposal } from "../organization_dynamics/index.js";
import type { OrganizationEvolutionService, EvolutionOutcome } from "../organization_evolution/index.js";
import type { RuntimeEvolutionService, RuntimeEvolutionOutcome } from "../runtime_evolution/index.js";
import type { RuntimeScopeService, RuntimeScopeStore, RuntimeScopeState, HolonView } from "../runtime_scope/index.js";
import type { BoundaryMemoryService, BoundaryObservation, BoundaryWorkspaceView, CandidateView, MembershipView, AcceptedBoundaryState } from "../boundary_memory/index.js";
import type { FederationService } from "../federation/index.js";
import type { CommitmentScope, CommitmentState, CommitmentSummary } from "../federation/index.js";
import type { AttentionService, AttentionSignal } from "../attention/index.js";
import type { CampaignService } from "../campaign/index.js";
import type { CampaignStore } from "../campaign/store.js";
import type { OrganizationStore } from "../organization/index.js";
import type { InstitutionService, InstitutionStore } from "../institution/index.js";
import type { ReasoningCellService, ReasoningFrontierView, ReasoningClaimGraphView, ReasoningCellView, ReasoningBranchBrief, CandidateStatus } from "../reasoning_cell/index.js";
import type { ReasoningClaimTypeRef, ReasoningClaimRef, ExternalEvidenceRef, EvaluationOutcome, InvalidationOutcome } from "../reasoning_cell/index.js";
import type { CampaignClaimStatus, ClaimStandingSnapshot, EvidenceKnowledge } from "../campaign/epistemic.js";
import type {
  AnalyzeEvidenceOutcome,
  ClaimAssessmentRevision,
  DisclosureExportOutcome,
  DisclosureExportReceipt,
  DisclosurePreview,
  DisclosureRequest,
  DisclosureService,
  EvidenceExtractionService,
  EvidenceItem,
  EvidenceSelector,
  ProofAssetView,
  ProofClaimCandidate,
  ProofEvidenceService,
  ProofPublicationResult,
  ProofSourceRevision,
  ProofSourceRevisionRef,
  ProofSourceSummary,
  ProofWhy,
  PublishedProofClaim,
  SourceProvenance,
} from "../proof_asset/index.js";
import { materializeProofSourceRevisionRef, reasoningClaimPublicationSource } from "../proof_asset/index.js";
import type {
  ArchitectureVariant,
  ExperimentDefinition,
  InterventionRecord,
  MeasurementCorrection,
  OrganizationEvaluation,
  RunResult,
  ScenarioDefinition,
} from "../organization_memory/index.js";
import type { OrganizationMemoryService, SimilarRunsQuery } from "../organization_memory/index.js";
import type { TaskFeatureName, TaskFeatureValue } from "../organization_memory/artifacts.js";
import { TASK_FEATURE_ALLOWED_VALUES, TASK_FEATURE_NAMES } from "../organization_memory/artifacts.js";
import type { CompiledRecipePlan, RecipeBaseMode, RecipeDefinition, RecipeModifier, RecipePlan, RecipeReadiness, RecipeRole } from "../recipes/artifacts.js";
import { parseCompiledRecipePlan, parseRecipePlan } from "../recipes/artifacts.js";
import type { RecipeRegistry } from "../recipes/registry.js";
import { compileRecipePlan } from "../recipes/compiler.js";
import type { RecipeExecutionContext, RecipeExecutionOutcome, RecipeExecutionService } from "../recipes/execution.js";
import type { ArchitectureRecommendInput, ArchitectureRecommendation, EmpiricalArchitectureAdvisor } from "../advisor/advisor.js";
import type { TaskProfile, TaskProfilerPort } from "../advisor/task_profile.js";
import { applyProfilerOutput, parseTaskProfile, unknownTaskProfile, withTaskFeature } from "../advisor/task_profile.js";
import type { PeerRef } from "../federation/peer.js";
import { materializePeerRef } from "../federation/peer.js";
import type { DurablePeerOperation } from "../transport/envelope.js";
import type { BoundaryRemoteOperation } from "../boundary_memory/index.js";
import type { ProjectController, ProjectHeadReconciliationResult } from "../tools/controller.js";
import type { TaskSpec } from "../schema/models.js";
import type {
  AppendDecisionResult,
  AssociationKind,
  CanonicalAssetRefInput,
  OpenLoop,
  ProjectAssetAssociation,
  ProjectAssetKind,
  ProjectJournalEntry,
  ProjectJournalKind,
  ProjectJournalRef,
  ProjectJournalResolution,
  ProjectJournalViewEntry,
  ProjectWorkspaceService,
  ProjectWorkspaceView,
  PromoteOpportunityResult,
  WorkspaceHistoryEntry,
} from "../project_workspace/index.js";
import type {
  ManagementActionCandidate,
  ManagementAssessment,
  ManagementBoundedRun,
  ManagementInvolvement,
  ManagementStepPreview,
  ManagementStepResult,
  ProjectManagementService,
} from "../project_management/index.js";
import { definePalimpsestControl } from "../tools/control_surface.js";
import type { ProjectionEnvelope } from "./projection_types.js";
import { collaborationProjection, organizationProjection, reasoningProjection, runtimeProjection, workProjection } from "./projections.js";

/** Read-only boundary workspace enumeration for the collaboration projection. */
export interface BoundaryWorkspaceReadPort {
  list(): Promise<readonly { readonly workspaceId: string; readonly participants: readonly PeerRef[]; readonly acceptedArtifacts: number }[]>;
}

export interface ProjectionsApplicationSurface {
  work(): Promise<ProjectionEnvelope>;
  organization(input: { readonly organizationDefinitionId: string }): Promise<ProjectionEnvelope>;
  collaboration(): Promise<ProjectionEnvelope>;
  runtime(): Promise<ProjectionEnvelope>;
  reasoning(input: { readonly cellId: string }): Promise<ProjectionEnvelope>;
}

/* ------------------------------------------------------------------ *
 * Work
 * ------------------------------------------------------------------ */

export interface WorkApplicationSurface {
  status(): unknown;
  graph(): unknown;
  preview(): unknown;
  /** Work control verbs (pause/resume/next/run/claim/gate/report/plan/promote/holdSet/holdClear). */
  control(op: string, args: readonly unknown[]): unknown;
}

/* ------------------------------------------------------------------ *
 * Federation
 * ------------------------------------------------------------------ */

export interface FederationApplicationSurface {
  readonly localPeer: PeerRef;
  inbox(): Promise<unknown>;
  thread(threadId: string): Promise<unknown>;
  sendMessage(input: { readonly to: PeerRef; readonly threadId: string; readonly body: string }): Promise<unknown>;
  declareContactNeed(input: { readonly origin: unknown; readonly competenceTags: readonly string[]; readonly reason: string }): Promise<unknown>;
  findCandidates(input: { readonly competenceTags: readonly string[]; readonly origin: unknown; readonly reason: string }): Promise<unknown>;
  offerCommitment(input: { readonly proposedHolder: PeerRef; readonly scope: CommitmentScope; readonly statement: string }): Promise<unknown>;
  acceptCommitment(commitmentId: string): Promise<unknown>;
  rejectCommitment(commitmentId: string): Promise<unknown>;
  releaseCommitment(commitmentId: string): Promise<void>;
  offerHandoff(input: { readonly commitmentId: string; readonly to: PeerRef }): Promise<unknown>;
  acceptHandoff(handoffId: string): Promise<unknown>;
  commitmentState(commitmentId: string): Promise<CommitmentState | undefined>;
  /** G10-P (CF-O-01): read-only enumeration of every commitment with its derived state. */
  commitments(): Promise<readonly CommitmentSummary[]>;
  /**
   * G10-Q: communicate THIS peer's explicit decision on a commitment whose canonical record
   * lives with another peer. Absent when no durable remote-submission port is wired.
   */
  submitRemoteDecision?(input: {
    readonly to: PeerRef;
    readonly commitmentId: string;
    readonly decision: "accept" | "reject" | "release";
  }): Promise<unknown>;
}

/** G10-Q: the durable remote-submission port the application needs to act as a non-home peer. */
export interface RemoteSubmissionPort {
  submitOperation(input: {
    readonly to: PeerRef;
    readonly operation: DurablePeerOperation;
    readonly operationId?: string;
  }): Promise<unknown>;
  submitBoundary(input: {
    readonly workspaceId: string;
    readonly operation: BoundaryRemoteOperation;
    readonly operationId?: string;
  }): Promise<unknown>;
}

/* ------------------------------------------------------------------ *
 * Attention (semantic derivation; notification ≠ activation)
 * ------------------------------------------------------------------ */

export interface AttentionApplicationSurface {
  readonly policyId: string;
  /** Every currently open attention fact for this local peer (deduped, read-only). */
  pending(): Promise<readonly AttentionSignal[]>;
}

/* ------------------------------------------------------------------ *
 * Boundary
 * ------------------------------------------------------------------ */

export interface BoundaryApplicationSurface {
  readonly localPeer: PeerRef;
  view(workspaceId: string): Promise<BoundaryWorkspaceView>;
  currentAccepted(input: { readonly workspaceId: string; readonly artifactId: string }): Promise<AcceptedBoundaryState | null>;
  pendingCandidates(input: { readonly workspaceId: string; readonly artifactId: string }): Promise<readonly CandidateView[]>;
  changesSince(input: { readonly workspaceId: string; readonly sinceSeq: number }): Promise<unknown>;
  membership(workspaceId: string): Promise<MembershipView>;
  observation(workspaceId: string): Promise<BoundaryObservation | undefined>;
  proposeRevision(input: { readonly workspaceId: string; readonly artifactId: string; readonly base: unknown; readonly content: unknown; readonly requiredAcceptors: readonly PeerRef[]; readonly intent: string }): Promise<unknown>;
  decide(input: { readonly workspaceId: string; readonly artifactId: string; readonly candidateDigest: string; readonly decision: "accept" | "reject" }): Promise<unknown>;
  /**
   * G10-Q: submit a typed boundary mutation to the workspace's canonical home when THIS peer is
   * not the home. Submission-only (at-least-once); the reply is a queue receipt, never acceptance.
   */
  submitRemote?(input: {
    readonly workspaceId: string;
    readonly operation: BoundaryRemoteOperation;
    readonly operationId?: string;
  }): Promise<unknown>;
}

/* ------------------------------------------------------------------ *
 * Runtime / Holon
 * ------------------------------------------------------------------ */

export interface RuntimeApplicationSurface {
  list(): Promise<readonly { readonly scopeId: string }[]>;
  view(scopeId: string): Promise<RuntimeScopeState>;
  holon(scopeId: string): Promise<HolonView>;
}

/* ------------------------------------------------------------------ *
 * Organization / Institution
 * ------------------------------------------------------------------ */

export interface OrganizationApplicationSurface {
  view(organizationDefinitionId: string): Promise<unknown>;
  retirements(): Promise<unknown>;
  institutions(): Promise<readonly string[]>;
  institutionView(institutionId: string): Promise<unknown>;
}

/* ------------------------------------------------------------------ *
 * Campaign
 * ------------------------------------------------------------------ */

export interface CampaignApplicationSurface {
  view(campaignId: string): Promise<unknown>;
}

/* ------------------------------------------------------------------ *
 * Dynamics / evolution
 * ------------------------------------------------------------------ */

export interface DynamicsApplicationSurface {
  observe(subject: unknown): Promise<unknown>;
  diagnose(subject: unknown): Promise<unknown>;
  propose(input: { readonly subject: unknown; readonly advisor?: unknown }): Promise<unknown>;
  proposalImpact(input: { readonly proposal: unknown; readonly subject: unknown }): Promise<unknown>;
  freshness(proposal: unknown): Promise<unknown>;
  readonly policy: DynamicsPolicy;
}

export interface EvolutionApplicationSurface {
  inspectOrganization(caseRef: string): Promise<unknown>;
  prepareOrganization(proposal: OrganizationDynamicsProposal): Promise<EvolutionOutcome>;
  advanceOrganization(proposal: OrganizationDynamicsProposal): Promise<EvolutionOutcome>;
  inspectRuntime(caseRef: string): Promise<unknown>;
  advanceRuntime(proposal: OrganizationDynamicsProposal): Promise<RuntimeEvolutionOutcome>;
  readonly policy: DynamicsPolicy;
}

/* ------------------------------------------------------------------ *
 * Reasoning
 * ------------------------------------------------------------------ */

export interface ReasoningApplicationSurface {
  view(cellId: string): Promise<ReasoningCellView>;
  openBranch(input: { readonly cellId: string; readonly question: string; readonly attribution?: unknown }): Promise<{ readonly branch: unknown; readonly brief: ReasoningBranchBrief }>;
  brief(input: { readonly cellId: string; readonly branchId: string }): Promise<ReasoningBranchBrief>;
  submitCandidate(input: { readonly cellId: string; readonly branchId: string; readonly type: ReasoningClaimTypeRef; readonly content: unknown; readonly dependencies?: readonly ReasoningClaimRef[]; readonly externalEvidenceRefs?: readonly ExternalEvidenceRef[] }): Promise<{ readonly candidate: unknown; readonly status: CandidateStatus }>;
  evaluate(input: { readonly cellId: string; readonly candidateDigest: string }): Promise<EvaluationOutcome>;
  invalidate(input: { readonly cellId: string; readonly targetClaimId: string; readonly reason: string }): Promise<InvalidationOutcome>;
  frontier(cellId: string): Promise<ReasoningFrontierView>;
  graph(cellId: string): Promise<ReasoningClaimGraphView>;
}

/* ------------------------------------------------------------------ *
 * Proof / Evidence (G10-T; read-only derivation + explicit publication)
 * ------------------------------------------------------------------ */

/**
 * The authoritative Proof/Evidence plane as seen by products. Every method delegates to the
 * injected `ProofEvidenceService`; NO method accepts a caller-supplied standing or publication
 * decision. `preparePublication` materializes a candidate from an ACTIVE admitted reasoning claim
 * (read-only) and records it on the proof plane — it never verifies and never publishes.
 */
export interface ProofApplicationSurface {
  /** Explicit, model-free import of source bytes (never embedded in the semantic rows). */
  importSource(input: {
    readonly bytes: Uint8Array;
    readonly mediaType: string;
    readonly label: string;
    readonly provenance: SourceProvenance;
    readonly sourceId: string;
    readonly metadata?: Readonly<Record<string, string>> | undefined;
  }): Promise<{ readonly revision: ProofSourceRevision }>;
  /** Record an evidence selection over an immutable revision; the selection digest is recomputed. */
  recordEvidence(input: { readonly sourceRevision: ProofSourceRevisionRef; readonly selector: EvidenceSelector }): Promise<EvidenceItem>;
  sources(): Promise<readonly ProofSourceSummary[]>;
  sourceRevisions(sourceId: string): Promise<readonly ProofSourceRevision[]>;
  inspectSource(revisionRef: ProofSourceRevisionRef): Promise<ProofSourceRevision | undefined>;
  /** EXPLICIT content read through the configured content port; unavailable content is `undefined`. */
  readContentExplicit(revisionRef: ProofSourceRevisionRef): Promise<Uint8Array | undefined>;
  evidence(evidenceId: string): Promise<EvidenceItem | undefined>;
  claims(): Promise<readonly PublishedProofClaim[]>;
  inspectClaim(claimId: string): Promise<EvidenceKnowledge<ClaimStandingSnapshot>>;
  why(claimId: string): Promise<ProofWhy>;
  preparePublication(input: {
    readonly cellId: string;
    readonly claimId: string;
  }): Promise<{ readonly status: "prepared"; readonly candidate: ProofClaimCandidate } | { readonly status: "blocked"; readonly reason: string }>;
  /** Verify then run the SEPARATE publication admission; verification alone never publishes. */
  evaluatePublication(input: { readonly candidateId: string }): Promise<ProofPublicationResult>;
  reassess(input: { readonly claimId: string }): Promise<ClaimAssessmentRevision>;
  assetView(claimId: string): Promise<ProofAssetView>;
  /**
   * G10-T CF-T-02: evidence-grounded Explore extraction. Builds a selector-only
   * evidence context, runs ephemeral branches and evaluates their candidates
   * through the REAL ReasoningCell service. It NEVER verifies with the proof plane,
   * publishes, or approves disclosure. Absent extraction wiring ⇒ `capability_required`.
   */
  analyzeEvidence(input: { readonly evidenceIds: readonly string[]; readonly objective: string; readonly branchCount?: number }): Promise<AnalyzeEvidenceOutcome>;
}

/** Local, purpose-scoped disclosure over published claims. Preview ≠ export ≠ recipient receipt. */
export interface DisclosureApplicationSurface {
  preview(request: DisclosureRequest): Promise<DisclosurePreview>;
  approveAndExport(input: { readonly previewId: string }): Promise<DisclosureExportOutcome>;
  history(): Promise<readonly DisclosureExportReceipt[]>;
}

/* ------------------------------------------------------------------ *
 * Empirical (read-only history; evaluation ≠ governance, memory ≠ authority)
 * ------------------------------------------------------------------ */

/**
 * G10-R: the pure READ model over canonical empirical history. Every method
 * re-derives from the append-only OrganizationMemory store; there is no writer,
 * no mutator of another subsystem, and no authority reachable here.
 */
export interface EmpiricalApplicationSurface {
  experiments(): Promise<readonly ExperimentDefinition[]>;
  experiment(experimentId: string): Promise<ExperimentDefinition>;
  scenarios(experimentId: string): Promise<readonly ScenarioDefinition[]>;
  variants(experimentId: string): Promise<readonly ArchitectureVariant[]>;
  runs(experimentId: string): Promise<readonly RunResult[]>;
  run(runRef: string): Promise<RunResult | undefined>;
  evaluations(experimentId: string): Promise<readonly OrganizationEvaluation[]>;
  corrections(experimentId: string): Promise<readonly MeasurementCorrection[]>;
  interventions(): Promise<readonly InterventionRecord[]>;
  similarRuns(query: SimilarRunsQuery): Promise<readonly RunResult[]>;
  structuralHistory(subjectRef: string): Promise<readonly InterventionRecord[]>;
}

/* ------------------------------------------------------------------ *
 * Recipes / advisor (G10-S; recipe layer is descriptive product config)
 * ------------------------------------------------------------------ */

/** One recipe's honest, per-capability readiness (a stated enum, never a score). */
export interface RecipeReadinessReport {
  readonly recipeId: string;
  readonly role: RecipeRole;
  readonly baseMode?: RecipeBaseMode | undefined;
  readonly modifier?: RecipeModifier | undefined;
  readonly readiness: RecipeReadiness;
  readonly capabilityRequirements: readonly string[];
  readonly limitations: readonly string[];
}

/** READ-ONLY recipe catalog. Recipes are product config, not canonical truth. */
export interface RecipesApplicationSurface {
  list(): readonly RecipeDefinition[];
  inspect(recipeId: string): RecipeDefinition | undefined;
  readiness(): readonly RecipeReadinessReport[];
}

export interface AdvisorProfileInput {
  /** An opaque task description; only meaningful with an untrusted profiler wired. */
  readonly task?: string | undefined;
  /** Caller/user-declared feature values (strictly validated; the caller is the source). */
  readonly values?: Readonly<Record<string, string>> | undefined;
}

/** The plain-language explanation portion of a recommendation (no scores/weights). */
export interface AdvisorExplanation {
  readonly recommendedPlan: RecipePlan;
  readonly rationale: readonly string[];
  readonly blockers: readonly string[];
  readonly unavailableEvidence: readonly string[];
}

/**
 * READ-ONLY empirical architecture advisor. `profile` may consume UNTRUSTED profiler output (strictly
 * parsed and re-sourced) but can never select a recipe; only `recommend` maps a profile + the install's
 * honest capabilities to eligible plans, and the human remains the chooser.
 */
export interface AdvisorApplicationSurface {
  profile(input: AdvisorProfileInput): Promise<TaskProfile>;
  recommend(input: ArchitectureRecommendInput): Promise<ArchitectureRecommendation>;
  explain(input: ArchitectureRecommendInput): Promise<AdvisorExplanation>;
}

/** The execution bindings actually wired for this install (plain boolean facts, never guesses). */
export interface RecipeExecutionStatus {
  readonly localPeerId: string;
  readonly reasoningCell: boolean;
  readonly branchExecution: boolean;
  readonly federation: boolean;
}

/**
 * G10-S: descriptive compilation plus execution through the EXISTING governed services.
 * `compile`/`status` are pure reads; `start` runs the wired ReasoningCell/Federation services and
 * never admits a claim, accepts a boundary revision, evolves anything, or produces an effect itself.
 */
export interface RecipeExecutionApplicationSurface {
  compile(plan: RecipePlan): CompiledRecipePlan;
  start(compiled: CompiledRecipePlan, context: RecipeExecutionContext): Promise<RecipeExecutionOutcome>;
  status(): RecipeExecutionStatus;
}

/**
 * G10-V: the DERIVED project workspace as seen by products. Every read re-derives from the
 * canonical owner matrix plus the two narrowly-owned append-only histories; nothing here
 * copies a canonical fact. The `projectId` inputs default to this installation's project (a
 * caller cannot address another project's history through this surface).
 */
export interface ProjectWorkspaceApplicationSurface {
  view(): Promise<ProjectWorkspaceView>;
  assets(): Promise<readonly ProjectAssetAssociation[]>;
  openLoops(): Promise<readonly OpenLoop[]>;
  history(): Promise<readonly WorkspaceHistoryEntry[]>;
  journal(projectId?: string): Promise<readonly ProjectJournalViewEntry[]>;
  associateAsset(input: {
    readonly projectId?: string | undefined;
    readonly assetKind: ProjectAssetKind;
    readonly canonicalRef: CanonicalAssetRefInput;
    readonly associationKind: AssociationKind;
    readonly provenance: string;
  }): Promise<ProjectAssetAssociation>;
  recordJournalEntry(input: {
    readonly projectId?: string | undefined;
    readonly kind: ProjectJournalKind;
    readonly title: string;
    readonly body: string;
    readonly provenance: string;
    readonly relatedRefs?: readonly ProjectJournalRef[] | undefined;
  }): Promise<ProjectJournalEntry>;
  resolveJournalEntry(input: {
    readonly projectId?: string | undefined;
    readonly entryId: string;
    readonly resolution: ProjectJournalResolution;
  }): Promise<ProjectJournalViewEntry>;
  appendDecision(input: {
    readonly projectId?: string | undefined;
    readonly statement: string;
    readonly rationale: string;
    readonly evidenceIds: readonly string[];
    readonly supersedes?: string | undefined;
  }): Promise<AppendDecisionResult>;
  promoteOpportunity(input: {
    readonly projectId?: string | undefined;
    readonly entryId: string;
    readonly taskSpec: TaskSpec;
  }): Promise<PromoteOpportunityResult>;
}

/**
 * G10-V: graduated project-management autonomy as seen by AGENTS. It can inspect, recommend,
 * preview, execute one bounded local step, run bounded, or REQUEST a mode change. It deliberately
 * has NO `setModeUpward`/`grantAuthority`/`approveDisclosure`/`forceCommitment`: a mode is never
 * authority and the agent-facing path can never escalate its own involvement.
 */
export interface ProjectManagementApplicationSurface {
  status(): Promise<ManagementAssessment>;
  recommend(): Promise<readonly ManagementActionCandidate[]>;
  preview(): Promise<ManagementStepPreview>;
  step(input?: { readonly confirmed?: boolean | undefined }): Promise<ManagementStepResult>;
  run(input?: { readonly maxSteps?: number | undefined }): Promise<ManagementBoundedRun>;
  requestModeChange(input: { readonly to: ManagementInvolvement }): Promise<{ readonly status: "requested"; readonly detail: string }>;
  /**
   * G10-X: the mechanical project-head reconciliation (advance the ProjectIR
   * head onto the proven effect head through the ordinary revision batch). It
   * never promotes an attempt, never accepts a caller head, and is a mechanical
   * consistency step - not a plan revision and not an authority act.
   */
  reconcileProjectHead(): Promise<ProjectHeadReconciliationResult>;
}

export interface PalimpsestApplicationSurface {  readonly work: WorkApplicationSurface;
  readonly federation?: FederationApplicationSurface | undefined;
  readonly boundary?: BoundaryApplicationSurface | undefined;
  readonly runtime?: RuntimeApplicationSurface | undefined;
  readonly organization?: OrganizationApplicationSurface | undefined;
  readonly campaign?: CampaignApplicationSurface | undefined;
  readonly dynamics?: DynamicsApplicationSurface | undefined;
  readonly evolution?: EvolutionApplicationSurface | undefined;
  readonly reasoning?: ReasoningApplicationSurface | undefined;
  /** G10-P: semantic attention derivation (read-only; the host adapter activates separately). */
  readonly attention?: AttentionApplicationSurface | undefined;
  /** G10-R: read-only empirical history (evaluation ≠ governance; memory ≠ authority). */
  readonly empirical?: EmpiricalApplicationSurface | undefined;
  /** G10-S: read-only recipe catalog with honest per-capability readiness. */
  readonly recipes?: RecipesApplicationSurface | undefined;
  /** G10-S: read-only empirical architecture advisor (suggestion only; never a chooser). */
  readonly advisor?: AdvisorApplicationSurface | undefined;
  /** G10-S: descriptive compile + governed execution of an existing recipe plan. */
  readonly recipeExecution?: RecipeExecutionApplicationSurface | undefined;
  /** G10-T (additive): the authoritative Proof/Evidence plane; absent ⇒ no proof surface. */
  readonly proof?: ProofApplicationSurface | undefined;
  /** G10-T (additive): local purpose-scoped disclosure; absent ⇒ no disclosure surface. */
  readonly disclosure?: DisclosureApplicationSurface | undefined;
  /** G10-V (additive): the DERIVED project workspace; absent ⇒ no projectWorkspace surface. */
  readonly projectWorkspace?: ProjectWorkspaceApplicationSurface | undefined;
  /** G10-V (additive): agent-facing management autonomy (never an escalation path). */
  readonly projectManagement?: ProjectManagementApplicationSurface | undefined;
  /** Derived MultiGraph projections (read-only; never a canonical graph). */
  readonly projections?: ProjectionsApplicationSurface | undefined;
}

export interface ApplicationSurfaceDeps {
  readonly controller: ProjectController;
  readonly localPeer?: PeerRef | undefined;
  readonly federation?: FederationService | undefined;
  readonly boundary?: BoundaryMemoryService | undefined;
  readonly runtimeScopes?: { readonly store: RuntimeScopeStore; readonly service: RuntimeScopeService } | undefined;
  readonly organizations?: OrganizationStore | undefined;
  readonly institution?: { readonly store: InstitutionStore; readonly service: InstitutionService } | undefined;
  readonly campaign?: CampaignService | undefined;
  readonly campaignStore?: CampaignStore | undefined;
  readonly dynamics?: OrganizationDynamicsService | undefined;
  readonly organizationEvolution?: OrganizationEvolutionService | undefined;
  readonly runtimeEvolution?: RuntimeEvolutionService | undefined;
  readonly reasoning?: ReasoningCellService | undefined;
  readonly dynamicsPolicy?: DynamicsPolicy | undefined;
  /** Optional read-only boundary workspace enumeration (collaboration projection). */
  readonly boundaryWorkspaces?: BoundaryWorkspaceReadPort | undefined;
  /** G10-P (additive): the semantic attention service, when a policy and federation are wired. */
  readonly attention?: AttentionService | undefined;
  /** G10-Q (additive): durable remote submission, needed for a non-home peer to act via tools. */
  readonly remoteTransport?: RemoteSubmissionPort | undefined;
  /** G10-R (additive): the empirical organization-memory service; absent ⇒ no empirical surface. */
  readonly organizationMemory?: OrganizationMemoryService | undefined;
  /** G10-S (additive): the versioned recipe catalog; absent ⇒ no recipes surface. */
  readonly recipes?: RecipeRegistry | undefined;
  /** G10-S (additive): the read-only empirical architecture advisor; absent ⇒ no advisor surface. */
  readonly advisor?: EmpiricalArchitectureAdvisor | undefined;
  /** G10-S (additive): descriptive compile + governed execution deps; absent ⇒ no execution surface. */
  readonly recipeExecution?: { readonly service: RecipeExecutionService; readonly status: RecipeExecutionStatus } | undefined;
  /** G10-S (additive): an UNTRUSTED host profiler; its output is strict-parsed and never selects a recipe. */
  readonly taskProfiler?: TaskProfilerPort | undefined;
  /** G10-T (additive): the authoritative Proof/Evidence service; absent ⇒ no proof surface. */
  readonly proof?: ProofEvidenceService | undefined;
  /** G10-T CF-T-02 (additive): evidence-grounded extraction behind the proof surface. */
  readonly proofExtraction?: EvidenceExtractionService | undefined;
  /** G10-T (additive): the local disclosure service; absent ⇒ no disclosure surface. */
  readonly disclosure?: DisclosureService | undefined;
  /** G10-V (additive): the DERIVED project workspace service; absent ⇒ no workspace surface. */
  readonly projectWorkspace?: ProjectWorkspaceService | undefined;
  /** G10-V (additive): the bounded management service; absent ⇒ no management surface. */
  readonly projectManagement?: ProjectManagementService | undefined;
}

function invalidInput(message: string): Error {
  const error = new Error(message);
  (error as { kind?: string }).kind = "invalid_value";
  return error;
}

function requireLocal(deps: ApplicationSurfaceDeps): PeerRef {
  if (deps.localPeer === undefined) throw new Error("no local peer is configured for this installation");
  return deps.localPeer;
}

/**
 * Tool/HTTP callers naturally write peer ids as bare strings. Normalize them to the canonical
 * `PeerRef` shape here (the product boundary), so the strict wire parser still sees exact refs.
 */
function asPeerRef(value: unknown): PeerRef {
  return typeof value === "string" ? materializePeerRef({ peerId: value }) : (value as PeerRef);
}

function normalizeBoundaryOperation(operation: BoundaryRemoteOperation): BoundaryRemoteOperation {
  const raw = operation as unknown as Record<string, unknown>;
  if (raw.kind === "submit_artifact_candidate" && Array.isArray(raw.requiredAcceptors)) {
    return { ...raw, requiredAcceptors: (raw.requiredAcceptors as unknown[]).map(asPeerRef) } as unknown as BoundaryRemoteOperation;
  }
  if (raw.kind === "submit_membership_change" && raw.target !== undefined) {
    return { ...raw, target: asPeerRef(raw.target) } as unknown as BoundaryRemoteOperation;
  }
  return operation;
}

export function makePalimpsestApplicationSurface(deps: ApplicationSurfaceDeps): PalimpsestApplicationSurface {
  const work: WorkApplicationSurface = {
    status: () => deps.controller.status(),
    graph: () => deps.controller.orchestrationGraph(),
    preview: () => deps.controller.preview(),
    control: (op, args) => {
      // Reuse the existing Work control surface — Work stays Work-scoped.
      const surface = definePalimpsestControl(deps.controller) as unknown as Record<string, (...a: readonly unknown[]) => unknown>;
      const verb = surface[op];
      if (verb === undefined) throw new Error(`unknown work control verb "${op}"`);
      return verb(...args);
    },
  };

  const federation: FederationApplicationSurface | undefined =
    deps.federation === undefined
      ? undefined
      : (() => {
          const service = deps.federation!;
          const localPeer = requireLocal(deps);
          return {
            localPeer,
            inbox: () => service.inbox(localPeer),
            thread: (threadId) => service.thread(threadId),
            sendMessage: (input) => service.sendMessage({ to: input.to, threadId: input.threadId, body: input.body }),
            declareContactNeed: async (input) => {
              const need = await service.declareContactNeed({ origin: input.origin as never, competenceTags: input.competenceTags, reason: input.reason });
              return need;
            },
            findCandidates: async (input) => {
              const need = await service.declareContactNeed({ origin: input.origin as never, competenceTags: input.competenceTags, reason: input.reason });
              const candidates = await service.findCandidates(need);
              return { need, candidates };
            },
            offerCommitment: (input) => service.offerCommitment(input),
            // Local actor identity is derived here — never supplied by the caller.
            acceptCommitment: (commitmentId) => service.acceptCommitment({ commitmentId, authenticatedPeer: null, local: true }),
            rejectCommitment: (commitmentId) => service.rejectCommitment({ commitmentId, authenticatedPeer: null, local: true }),
            releaseCommitment: (commitmentId) => service.releaseCommitment({ commitmentId }),
            offerHandoff: (input) => service.offerHandoff(input),
            acceptHandoff: (handoffId) => service.acceptHandoff({ handoffId, authenticatedPeer: null, local: true }),
            commitmentState: async (commitmentId) => (await service.commitmentState(commitmentId))?.state as CommitmentState | undefined,
            commitments: () => service.commitments(),
            ...(deps.remoteTransport === undefined
              ? {}
              : {
                  submitRemoteDecision: (input: {
                    readonly to: PeerRef;
                    readonly commitmentId: string;
                    readonly decision: "accept" | "reject" | "release";
                  }) =>
                    deps.remoteTransport!.submitOperation({
                      to: input.to,
                      operation: { kind: `commitment_${input.decision}`, commitmentId: input.commitmentId },
                    }),
                }),
          };
        })();

  const boundary: BoundaryApplicationSurface | undefined =
    deps.boundary === undefined
      ? undefined
      : (() => {
          const service = deps.boundary!;
          const localPeer = requireLocal(deps);
          return {
            localPeer,
            view: (workspaceId) => service.workspaceView({ workspaceId }),
            currentAccepted: (input) => service.currentAccepted(input),
            pendingCandidates: (input) => service.pendingCandidates(input),
            changesSince: (input) => service.changesSince({ workspaceId: input.workspaceId, throughSeq: input.sinceSeq }),
            membership: (workspaceId) => service.membership({ workspaceId }),
            observation: (workspaceId) => service.boundaryObservation({ workspaceId }),
            proposeRevision: (input) => service.proposeRevision({ workspaceId: input.workspaceId, artifactId: input.artifactId, base: input.base as never, content: input.content, requiredAcceptors: input.requiredAcceptors, intent: input.intent }),
            decide: (input) =>
              input.decision === "accept"
                ? service.acceptRevision({ workspaceId: input.workspaceId, artifactId: input.artifactId, candidateDigest: input.candidateDigest, authenticatedPeer: null, local: true })
                : service.rejectRevision({ workspaceId: input.workspaceId, artifactId: input.artifactId, candidateDigest: input.candidateDigest, authenticatedPeer: null, local: true }),
            ...(deps.remoteTransport === undefined
              ? {}
              : {
                  submitRemote: (input: {
                    readonly workspaceId: string;
                    readonly operation: BoundaryRemoteOperation;
                    readonly operationId?: string;
                  }) =>
                    deps.remoteTransport!.submitBoundary({
                      workspaceId: input.workspaceId,
                      operation: normalizeBoundaryOperation(input.operation),
                      ...(input.operationId === undefined ? {} : { operationId: input.operationId }),
                    }),
                }),
          };
        })();

  const runtime: RuntimeApplicationSurface | undefined =
    deps.runtimeScopes === undefined
      ? undefined
      : {
          list: async () => (await deps.runtimeScopes!.service.listScopes()).map((ref) => ({ scopeId: ref.scopeId })),
          view: (scopeId) => deps.runtimeScopes!.service.scopeState(scopeId),
          holon: (scopeId) => deps.runtimeScopes!.service.holonView(scopeId),
        };

  const organization: OrganizationApplicationSurface | undefined =
    deps.organizations === undefined
      ? undefined
      : (() => {
          const store = deps.organizations!;
          return {
            view: async (organizationDefinitionId: string) => {
              const head = await store.head(organizationDefinitionId);
              const lifecycle = await store.lifecycle(organizationDefinitionId);
              if (head === undefined && lifecycle === undefined) {
                const error = new Error(`organization "${organizationDefinitionId}" does not exist`);
                (error as { kind?: string }).kind = "unknown_organization";
                throw error;
              }
              const current = await store.current(organizationDefinitionId);
              return { organizationDefinitionId, head: head ?? null, lifecycle: lifecycle ?? null, current: current ?? null, revisionCount: (await store.lineage(organizationDefinitionId)).length };
            },
            retirements: () => store.retirements(),
            institutions: async () => (deps.institution === undefined ? [] : await deps.institution.store.institutions()),
            institutionView: async (institutionId: string) => {
              if (deps.institution === undefined) return { institutionId, known: false };
              const head = await deps.institution.store.head(institutionId);
              const epoch = await deps.institution.store.currentEpoch(institutionId);
              return { institutionId, known: head !== undefined, head: head ?? null, epoch: epoch ?? null };
            },
          };
        })();

  const campaign: CampaignApplicationSurface | undefined =
    deps.campaign === undefined || deps.campaignStore === undefined
      ? undefined
      : (() => {
          const service = deps.campaign!;
          const store = deps.campaignStore!;
          return {
            view: async (campaignId: string) => {
              const definition = await service.definition(campaignId);
              if (definition === undefined) return { campaignId, known: false };
              const events = await store.replay(campaignId);
              const basis = await service.basis(campaignId);
              const commitments = await service.commitmentStates(campaignId);
              const hypotheses = await service.hypotheses(campaignId);
              let lifecycle = "ACTIVE";
              for (const event of events) {
                if (event.type === "CAMPAIGN_TERMINATED") lifecycle = "TERMINATED";
                else if (event.type === "CAMPAIGN_DORMANT") lifecycle = "DORMANT";
                else if (event.type === "WAKE_STARTED") lifecycle = "WAKING";
                else if (event.type === "RECONCILIATION_COMMITTED") lifecycle = "RECONCILING";
                else if (event.type === "WAKE_CYCLE_COMPLETED" || event.type === "WAKE_COMPLETED") lifecycle = "ACTIVE";
              }
              return { campaignId, known: true, definition, lifecycle, basis: basis ?? null, commitments, hypotheses, semanticEventCount: events.length };
            },
          };
        })();

  const dynamics: DynamicsApplicationSurface | undefined =
    deps.dynamics === undefined || deps.dynamicsPolicy === undefined
      ? undefined
      : (() => {
          const service = deps.dynamics!;
          const policy = deps.dynamicsPolicy!;
          return {
            policy,
            observe: (subject) => service.observe(subject as never, policy),
            diagnose: (subject) => service.diagnose(subject as never, policy),
            propose: (input) => service.propose({ subject: input.subject as never, policy, advisor: input.advisor as never }),
            proposalImpact: async (input) => {
              const observed = await service.observe(input.subject as never, policy);
              if (observed.status !== "observed") return observed;
              return service.proposalImpact(input.proposal as never, observed.snapshot);
            },
            freshness: (proposal) => service.evaluateProposal(proposal as never),
          };
        })();

  const evolution: EvolutionApplicationSurface | undefined =
    deps.dynamicsPolicy === undefined ||
    (deps.organizationEvolution === undefined && deps.runtimeEvolution === undefined)
      ? undefined
      : {
          policy: deps.dynamicsPolicy!,
          inspectOrganization: async (caseRef) => {
            if (deps.organizationEvolution === undefined) throw new Error("organization evolution is not configured");
            return deps.organizationEvolution.inspectEvolution(caseRef);
          },
          prepareOrganization: async (proposal) => {
            if (deps.organizationEvolution === undefined) throw new Error("organization evolution is not configured");
            return deps.organizationEvolution.prepareEvolution({ proposal, policy: deps.dynamicsPolicy! });
          },
          advanceOrganization: async (proposal) => {
            if (deps.organizationEvolution === undefined) throw new Error("organization evolution is not configured");
            return deps.organizationEvolution.advanceEvolution({ proposal, policy: deps.dynamicsPolicy! });
          },
          inspectRuntime: async (caseRef) => {
            if (deps.runtimeEvolution === undefined) throw new Error("runtime evolution is not configured");
            return deps.runtimeEvolution.inspectRuntimeEvolution(caseRef);
          },
          advanceRuntime: async (proposal) => {
            if (deps.runtimeEvolution === undefined) throw new Error("runtime evolution is not configured");
            return deps.runtimeEvolution.advanceRuntimeEvolution({ proposal, policy: deps.dynamicsPolicy! });
          },
        };

  const reasoning: ReasoningApplicationSurface | undefined =
    deps.reasoning === undefined
      ? undefined
      : {
          view: (cellId) => deps.reasoning!.cellView({ cellId }),
          openBranch: (input) => deps.reasoning!.openBranch({ cellId: input.cellId, question: input.question, attribution: input.attribution as never }),
          brief: (input) => deps.reasoning!.branchBrief(input),
          submitCandidate: (input) => deps.reasoning!.submitCandidate(input),
          evaluate: (input) => deps.reasoning!.evaluateCandidate(input),
          invalidate: (input) => deps.reasoning!.requestInvalidation(input),
          frontier: (cellId) => deps.reasoning!.frontier({ cellId }),
          graph: (cellId) => deps.reasoning!.claimGraph({ cellId }),
        };

  const attention: AttentionApplicationSurface | undefined =
    deps.attention === undefined
      ? undefined
      : {
          policyId: deps.attention.policy.policyId,
          pending: () => deps.attention!.pending(),
        };

  const empirical: EmpiricalApplicationSurface | undefined =
    deps.organizationMemory === undefined
      ? undefined
      : {
          experiments: () => deps.organizationMemory!.experiments(),
          experiment: (experimentId) => deps.organizationMemory!.experiment(experimentId),
          scenarios: (experimentId) => deps.organizationMemory!.scenarios(experimentId),
          variants: (experimentId) => deps.organizationMemory!.variants(experimentId),
          runs: (experimentId) => deps.organizationMemory!.runs(experimentId),
          run: (runRef) => deps.organizationMemory!.run(runRef),
          evaluations: (experimentId) => deps.organizationMemory!.evaluations(experimentId),
          corrections: (experimentId) => deps.organizationMemory!.corrections(experimentId),
          interventions: () => deps.organizationMemory!.interventions(),
          similarRuns: (query) => deps.organizationMemory!.similarRuns(query),
          structuralHistory: (subjectRef) => deps.organizationMemory!.structuralHistory(subjectRef),
        };

  const recipes: RecipesApplicationSurface | undefined =
    deps.recipes === undefined
      ? undefined
      : {
          list: () => deps.recipes!.list(),
          inspect: (recipeId) => deps.recipes!.get(recipeId),
          readiness: () =>
            deps.recipes!.list().map((definition) =>
              Object.freeze({
                recipeId: definition.recipeId,
                role: definition.role,
                ...(definition.baseMode === undefined ? {} : { baseMode: definition.baseMode }),
                ...(definition.modifier === undefined ? {} : { modifier: definition.modifier }),
                readiness: definition.readiness,
                capabilityRequirements: definition.capabilityRequirements,
                limitations: definition.limitations,
              }),
            ),
        };

  const advisor: AdvisorApplicationSurface | undefined =
    deps.advisor === undefined
      ? undefined
      : {
          profile: async (input) => {
            // A wired UNTRUSTED profiler is strict-parsed and re-sourced; it never selects a recipe.
            if (deps.taskProfiler !== undefined && input.task !== undefined) {
              const proposed = await deps.taskProfiler.profile({ task: input.task });
              return applyProfilerOutput(unknownTaskProfile(), proposed);
            }
            let profile = unknownTaskProfile();
            for (const [feature, value] of Object.entries(input.values ?? {})) {
              if (!(TASK_FEATURE_NAMES as readonly string[]).includes(feature)) {
                throw invalidInput(`unknown task feature "${feature}"`);
              }
              const name = feature as TaskFeatureName;
              if (!(TASK_FEATURE_ALLOWED_VALUES[name] as readonly string[]).includes(value)) {
                throw invalidInput(`value "${value}" is not allowed for task feature "${feature}"`);
              }
              profile = withTaskFeature(profile, name, value as TaskFeatureValue);
            }
            return profile;
          },
          recommend: (input) => deps.advisor!.recommend({ ...input, taskProfile: parseTaskProfile(input.taskProfile) }),
          explain: async (input) => {
            const recommendation = await deps.advisor!.recommend({ ...input, taskProfile: parseTaskProfile(input.taskProfile) });
            return Object.freeze({
              recommendedPlan: recommendation.recommendedPlan,
              rationale: recommendation.rationale,
              blockers: recommendation.blockers,
              unavailableEvidence: recommendation.unavailableEvidence,
            });
          },
        };

  const recipeExecution: RecipeExecutionApplicationSurface | undefined =
    deps.recipeExecution === undefined || deps.recipes === undefined
      ? undefined
      : {
          // Re-parse defensively at the boundary: a raw caller-supplied plan cannot slip past its digest.
          compile: (plan) => compileRecipePlan(parseRecipePlan(plan, "RecipePlan"), deps.recipes!),
          start: (compiled, context) => deps.recipeExecution!.service.execute(parseCompiledRecipePlan(compiled, "CompiledRecipePlan"), context),
          status: () => deps.recipeExecution!.status,
        };

  const proof: ProofApplicationSurface | undefined =
    deps.proof === undefined
      ? undefined
      : (() => {
          const service = deps.proof!;
          const revision = (ref: ProofSourceRevisionRef) =>
            materializeProofSourceRevisionRef({ sourceId: ref.sourceId, revision: ref.revision, contentDigest: ref.contentDigest });
          return {
            importSource: (input) =>
              service.importSource({
                bytes: input.bytes,
                mediaType: input.mediaType,
                label: input.label,
                provenance: input.provenance,
                sourceId: input.sourceId,
                ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
              }),
            recordEvidence: (input) => service.recordEvidence({ sourceRevision: revision(input.sourceRevision), selector: input.selector }),
            sources: () => service.sources(),
            sourceRevisions: (sourceId) => service.sourceRevisions(sourceId),
            inspectSource: (revisionRef) => service.sourceRevision(revision(revisionRef)),
            readContentExplicit: (revisionRef) => service.readSourceContent(revision(revisionRef)),
            evidence: (evidenceId) => service.evidence(evidenceId),
            claims: () => service.publishedClaims(),
            inspectClaim: (claimId) => service.inspectClaim({ claimId }),
            why: (claimId) => service.why(claimId),
            preparePublication: async (input) => {
              if (deps.reasoning === undefined) {
                return Object.freeze({ status: "blocked" as const, reason: "no reasoning cell service is configured; a reasoning-origin candidate cannot be prepared" });
              }
              const source = reasoningClaimPublicationSource({ reasoning: deps.reasoning });
              const prepared = await source.preparePublication({ cellId: input.cellId, claimId: input.claimId });
              if (prepared.status === "blocked") return prepared;
              // Recording the candidate on the proof plane NEVER verifies or publishes it: the
              // separate verification + publication-admission policies must still run.
              const candidate = await service.prepareCandidate({
                claimType: prepared.candidate.claimType,
                content: prepared.candidate.content,
                supportingEvidenceIds: prepared.candidate.supportingEvidence.map((entry) => entry.evidenceId),
                contradictingEvidenceIds: prepared.candidate.contradictingEvidence.map((entry) => entry.evidenceId),
                dependencies: prepared.candidate.dependencies,
                origin: prepared.candidate.origin,
                provenance: prepared.candidate.provenance,
              });
              return Object.freeze({ status: "prepared" as const, candidate });
            },
            evaluatePublication: async (input) => {
              await service.verify({ candidateId: input.candidateId });
              return service.decidePublication({ candidateId: input.candidateId });
            },
            reassess: (input) => service.reassess({ claimId: input.claimId }),
            assetView: (claimId) => service.proofAssetView(claimId),
            analyzeEvidence: (input) => {
              const extraction = deps.proofExtraction;
              if (extraction === undefined) {
                return Promise.resolve(
                  Object.freeze({
                    status: "capability_required" as const,
                    detail: "evidence extraction is not configured for this installation (needs a source content port and reasoning/branch execution wiring)",
                  }),
                );
              }
              return extraction.analyzeEvidence(input);
            },
          };
        })();

  const disclosure: DisclosureApplicationSurface | undefined =
    deps.disclosure === undefined
      ? undefined
      : {
          preview: (request) => deps.disclosure!.preview(request),
          approveAndExport: (input) => deps.disclosure!.approveAndExport(input),
          history: () => deps.disclosure!.history(),
        };

  const projectWorkspace: ProjectWorkspaceApplicationSurface | undefined =
    deps.projectWorkspace === undefined
      ? undefined
      : (() => {
          const service = deps.projectWorkspace!;
          // The installation's project: a caller can address a projectId only if it names THIS
          // project (the service asserts it), so the default is the truthful local scope.
          const projectId = deps.controller.projectId;
          return {
            view: () => service.view(),
            assets: () => service.assets(),
            openLoops: () => service.openLoops(),
            history: () => service.history(),
            journal: (id) => service.journal(id),
            associateAsset: (input) =>
              service.associateAsset({
                projectId: input.projectId ?? projectId,
                assetKind: input.assetKind,
                canonicalRef: input.canonicalRef,
                associationKind: input.associationKind,
                provenance: input.provenance,
              }),
            recordJournalEntry: (input) =>
              service.recordJournalEntry({
                projectId: input.projectId ?? projectId,
                kind: input.kind,
                title: input.title,
                body: input.body,
                provenance: input.provenance,
                ...(input.relatedRefs === undefined ? {} : { relatedRefs: input.relatedRefs }),
              }),
            resolveJournalEntry: (input) =>
              service.resolveJournalEntry({ projectId: input.projectId ?? projectId, entryId: input.entryId, resolution: input.resolution }),
            appendDecision: (input) =>
              service.appendDecision({
                projectId: input.projectId ?? projectId,
                statement: input.statement,
                rationale: input.rationale,
                evidenceIds: input.evidenceIds,
                ...(input.supersedes === undefined ? {} : { supersedes: input.supersedes }),
              }),
            promoteOpportunity: (input) =>
              service.promoteOpportunity({ projectId: input.projectId ?? projectId, entryId: input.entryId, taskSpec: input.taskSpec }),
          };
        })();

  const projectManagement: ProjectManagementApplicationSurface | undefined =
    deps.projectManagement === undefined
      ? undefined
      : {
          status: () => deps.projectManagement!.assess(),
          recommend: () => deps.projectManagement!.recommend(),
          preview: () => deps.projectManagement!.previewStep(),
          step: (input) => deps.projectManagement!.step(input),
          run: (input) => deps.projectManagement!.runBounded(input),
          // A REQUEST only: `requestedBy` is filled here, never supplied by the caller, and the
          // service never applies an upward change on the agent-facing path.
          requestModeChange: (input) => deps.projectManagement!.requestModeChange({ to: input.to, requestedBy: "agent" }),
          // G10-X mechanical consistency: no caller head, no raw plan, no promotion.
          reconcileProjectHead: () => deps.projectManagement!.reconcileProjectHead(),
        };

  const projections: ProjectionsApplicationSurface = {
    work: async () => {
      try {
        return workProjection(deps.controller.orchestrationGraph(), deps.controller.viewCursor());
      } catch {
        // A source error is an ERROR projection, never an empty known graph.
        return workProjection(null, null);
      }
    },
    organization: async (input) => {
      if (deps.organizations === undefined) throw new Error("organization surface is not configured");
      const definition = await deps.organizations.current(input.organizationDefinitionId);
      const lifecycle = await deps.organizations.lifecycle(input.organizationDefinitionId);
      return organizationProjection({ organizationDefinitionId: input.organizationDefinitionId, definition: definition ?? null, lifecycle: lifecycle ?? null });
    },
    collaboration: async () => {
      const localPeerId = requireLocal(deps).peerId;
      const peers = new Set<string>();
      if (deps.federation !== undefined) {
        const inbox = (await deps.federation.inbox(requireLocal(deps))) as { received?: readonly { from?: { peerId?: string }; to?: { peerId?: string } }[] };
        for (const message of inbox.received ?? []) {
          if (message.from?.peerId !== undefined) peers.add(message.from.peerId);
          if (message.to?.peerId !== undefined) peers.add(message.to.peerId);
        }
      }
      const workspaces = deps.boundaryWorkspaces === undefined ? [] : (await deps.boundaryWorkspaces.list()).map((workspace) => ({ workspaceId: workspace.workspaceId, participants: workspace.participants.map((peer) => peer.peerId), acceptedArtifacts: workspace.acceptedArtifacts }));
      // CF-O-01 CLOSED: the commitment nodes/edges come from the read-only enumeration.
      const commitments = deps.federation === undefined ? [] : (await deps.federation.commitments()).map((commitment) => ({ commitmentId: commitment.commitmentId, holderId: commitment.holder.peerId, state: commitment.state }));
      return collaborationProjection({ localPeerId, peers: [...peers], commitments, workspaces });
    },
    runtime: async () => {
      if (deps.runtimeScopes === undefined) throw new Error("runtime surface is not configured");
      return runtimeProjection({ list: () => deps.runtimeScopes!.service.listScopes(), state: (scopeId) => deps.runtimeScopes!.service.scopeState(scopeId) });
    },
    reasoning: async (input) => {
      if (deps.reasoning === undefined) throw new Error("reasoning surface is not configured");
      const view = await deps.reasoning.cellView({ cellId: input.cellId });
      const graph = await deps.reasoning.claimGraph({ cellId: input.cellId });
      return reasoningProjection({
        cellId: input.cellId,
        frontierRevision: view.frontierBasis.frontierRevision,
        frontierDigest: view.frontierBasis.frontierDigest,
        nodes: graph.nodes.map((node) => ({ ref: { claimId: node.ref.claimId }, claim: { type: { typeId: node.claim.type.typeId }, dependencies: node.claim.dependencies.map((dependency) => ({ claimId: dependency.claimId })) }, active: node.active })),
        candidates: view.candidates,
        branches: view.branches.map((branch) => ({ ref: { branchId: branch.ref.branchId }, question: branch.question, closed: branch.closed })),
      });
    },
  };

  return {
    work,
    ...(federation === undefined ? {} : { federation }),
    ...(boundary === undefined ? {} : { boundary }),
    ...(runtime === undefined ? {} : { runtime }),
    ...(organization === undefined ? {} : { organization }),
    ...(campaign === undefined ? {} : { campaign }),
    ...(dynamics === undefined ? {} : { dynamics }),
    ...(evolution === undefined ? {} : { evolution }),
    ...(reasoning === undefined ? {} : { reasoning }),
    ...(attention === undefined ? {} : { attention }),
    ...(empirical === undefined ? {} : { empirical }),
    ...(recipes === undefined ? {} : { recipes }),
    ...(advisor === undefined ? {} : { advisor }),
    ...(recipeExecution === undefined ? {} : { recipeExecution }),
    ...(proof === undefined ? {} : { proof }),
    ...(disclosure === undefined ? {} : { disclosure }),
    ...(projectWorkspace === undefined ? {} : { projectWorkspace }),
    ...(projectManagement === undefined ? {} : { projectManagement }),
    ...(deps.boundaryWorkspaces === undefined && deps.organizations === undefined && deps.runtimeScopes === undefined && deps.reasoning === undefined ? {} : { projections }),
  };
}
