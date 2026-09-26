/**
 * SR-1C §14 — the PUBLIC INSTALL CONTRACTS.
 *
 * `InstallPalimpsestOptions` and the `Installed*` capability surfaces describe what a caller of
 * `installPalimpsest()` may supply and what it gets back. They were the first ~600 lines of
 * `src/install.ts`; separating them from the runtime composition is what lets the capability
 * *wiring* move out into per-cluster composition modules without dragging the public contract
 * along with it.
 *
 * Compatibility: `src/install.ts` re-exports everything here, so no import path and no public
 * symbol changes; `pnpm architecture:check-public-api` proves it.
 *
 * TYPES ONLY: this module composes nothing, creates nothing and decides nothing.
 */
import type { RuntimeHooks } from "@ordarium/core";
import { GitCliPort } from "../effects/index.js";
import type { GitPort } from "../effects/index.js";
import { TaskPolicy } from "../domain/index.js";
import { ProjectController } from "../tools/controller.js";
import type { DshPluginContext, DshToolDefinition } from "../tools/dsh_types.js";
import type { LiveCompileOutcome, LiveCompileRequest, ObservationOutcome, RuntimeCarrierPort, RuntimeObservationPort, RuntimeRealizationOutcome, RuntimeRealizationRequest, RuntimeReleaseHandle } from "../runtime/index.js";
import type { PersistentPointStore } from "../continuity/index.js";
import type { AttemptCatalogPort, CoordinationStore } from "../coordination/index.js";
import type { FederationService, PeerContinuityAssociation, PeerDirectoryPort, PeerRef, PeerTransportPort } from "../federation/index.js";
import type { AttentionActivationPort, AttentionMarkStore, AttentionPolicy, AttentionService } from "../attention/index.js";
import type { OrganizationStore } from "../organization/index.js";
import type { InstitutionService, InstitutionStore } from "../institution/index.js";
import type { CampaignStore, CampaignEvidencePort, CampaignCompilerPort, CampaignExternalSignalPort, CampaignInstitutionEpochSource, CampaignWorkObservationPort, CampaignWorkAdmissionPort, InterventionService, CompilerService, LifecycleService, ProspectiveService, CampaignService, CampaignProductionService, NextActionAdmissionService } from "../campaign/index.js";
import type { HolonView, RuntimeScopeRepresentationAdmissionPort, RuntimeScopeService, RuntimeScopeStore } from "../runtime_scope/index.js";
import type { OrganizationDynamicsService, DynamicsPolicy } from "../organization_dynamics/index.js";
import type { OrganizationEvolutionAdmissionPort, OrganizationEvolutionCompilerPort, OrganizationEvolutionStore, OrganizationEvolutionService, OrganizationFormalizationCompilerPort } from "../organization_evolution/index.js";
import type { RuntimeEvolutionService, RuntimeEvolutionStore, RuntimeStructuralEvolutionAdmissionPort, RuntimeStructuralEvolutionCompilerPort } from "../runtime_evolution/index.js";
import type { ReasoningEpistemicAdmissionPolicyPort, ReasoningCellService, ReasoningCellStore, ReasoningClaimTypeRegistry, ReasoningVerificationPolicyPort } from "../reasoning_cell/index.js";
import type { OrganizationMemoryService, OrganizationMemoryStore } from "../organization_memory/index.js";
import { evaluate } from "../experiment/index.js";
import type { RecipeRegistry } from "../recipes/registry.js";
import { builtinRecipeRegistry } from "../recipes/registry.js";
import type { RecipeExecutionService, ReasoningBranchExecutionPort } from "../recipes/execution.js";
import type { EmpiricalArchitectureAdvisor } from "../advisor/advisor.js";
import type { PalimpsestApplicationSurface, RemoteSubmissionPort } from "../application/surface.js";
import type { HostDeploymentFactsPort } from "../application/common.js";
import type { BoundaryArtifactTypeRegistry, BoundaryCollaborationTransportPort, BoundaryHome, BoundaryMemoryService, BoundaryMemoryStore, BoundaryWorkspaceRoutePort, FederatedBoundaryClient } from "../boundary_memory/index.js";
import type { DisclosureAdmissionPort, DisclosureService, EvidenceExtractionService, LocalProofBlobStore, ProofEvidenceService, ProofEvidenceStore, ProofPublicationAdmissionPort, ProofVerificationPolicyPort } from "../proof_asset/index.js";
import type { ProofSourceContentPort } from "../proof_asset/source_content_port.js";
import type { ProjectWorkspaceService } from "../project_workspace/index.js";
import { SqliteProjectAssetAssociationStore, SqliteProjectJournalStore } from "../project_workspace/index.js";
import type { ExternalAssetBridgeService, ExternalAssetLibraryRegistry, ExternalAssetPublicationAdmissionPort } from "../external_assets/index.js";
import { SqliteExternalAssetBridgeStore } from "../external_assets/index.js";
import type { ProjectManagementService } from "../project_management/index.js";
import { SqliteManagementActivityStore } from "../project_operating/index.js";
import type { UserWorkModeControlPort, VerificationRuntimeCapabilityView, WorkModeCapabilityInputs } from "../project_operating/index.js";
import type { CollaborationService, CrossProjectService, ProjectPeerDirectoryPort } from "../interaction/index.js";
import type { DelegationService } from "../interaction/delegation.js";
import type { DelegationInstallOptions, DelegationInstallResult } from "./delegation_contract.js";
import type { ContinuationInstallOptions, ContinuationInstallResult } from "./continuation_contract.js";
import type { TaskProfilerPort } from "../advisor/index.js";
import { SqliteMonitorDeliveryMarkStore } from "../monitor/index.js";
import type { CampaignMonitorDriver, CampaignMonitorPolicy, CampaignMonitorScopePort, CampaignWakeActivationPort, MonitorTickSourcePort } from "../monitor/index.js";
import { SqliteProjectVerificationStore } from "../project_verification/index.js";
import type { ProjectVerificationOutcome, ProjectVerificationRun, ProjectVerificationService, ProjectVerificationStatus, ProjectVerifierPort, ProjectVerifierRegistry } from "../project_verification/index.js";
import { SqliteManagementPreferenceStore } from "../project_management/index.js";
/**
 * @see {@link HostDeploymentFactsPort} — declared in the application layer, which consumes it; the
 * composition root re-exports it so host wiring has a single import site for its ports.
 */
export type { HostDeploymentFactsPort };

export interface InstallPalimpsestOptions extends DelegationInstallOptions, ContinuationInstallOptions {
  /** Orchestration ledger; defaults to $DSH_HOME/palimpsest/palimpsest.sqlite. */
  databasePath?: string | undefined;
  /** Shared Ordarium ledger; defaults to $DSH_HOME/ordarium/operations.sqlite. */
  ordariumDatabasePath?: string | undefined;
  /** Canonical repository (for the default git CLI port). */
  repository?: string | undefined;
  /** Side-effect git port; defaults to GitCliPort(repository, repository/.palimpsest/worktrees). */
  git?: GitPort | undefined;
  projectId: string;
  policy?: TaskPolicy | undefined;
  /** Where an attempt's work happens: "worktree" (default, isolated) or "in-place" (observed, not claimed). */
  execution?: import("../tools/controller.js").ExecutionMode | undefined;
  /**
   * §D4-a: how many canonical Work tasks may run at once. `SpeculativeMutationAuthority ≠
   * CanonicalMutationAuthority`, so two PLACED attempts are not two writers on one tree; the OPERATOR
   * states the capacity here, since a plan may not name its own stage graph. Absent ⇒ 1 (pre-D4).
   */
  concurrency?: number | undefined;
  /**
   * PLMP-LEAN-1 §1: the project's derived-and-confirmed done-ness. When present the controller
   * declares the release gate from it at project start, so the operator's "accept" has something
   * to evaluate without anyone reciting predicate vocabulary first.
   */
  standard?: import("../domain/standard.js").ProjectStandard | undefined;
  /**
   * PLMP-LEAN-1 §2.1 / 2A-Q: what this deployment can actually do. Absent ⇒ derived from what is
   * composed (a bound repository, a verification store), never assumed.
   */
  capabilities?: import("../domain/completion_contract.js").CompletionCapabilities | undefined;
  /** Palimpsest-side wire clock (ProjectIR/evidence timestamps). */
  clock?: (() => string) | undefined;
  /** Ordarium-side Date clock (leases/recovery); tests pass a ManualClock. */
  effectsClock?: (() => Date) | undefined;
  leaseMs?: number | undefined;
  hooks?: RuntimeHooks | undefined;
  /** G10-D5 (additive): host-neutral runtime carrier port. Absent = no runtime surface. */
  runtimeCarrierPort?: RuntimeCarrierPort | undefined;
  /** G10-D5 (additive): read-only runtime/continuity observation port. */
  runtimeObservationPort?: RuntimeObservationPort | undefined;
  /** G10-D5 (additive): the canonical PersistentPoint store (required for persistent realization). */
  continuityStore?: PersistentPointStore | undefined;
  /** G10-D5 (additive): activation allocator seam; default is a deterministic digest allocator. */
  allocateActivationId?: ((subject: string, context: string) => string) | undefined;
  /** G10-D5 (additive): observation-instance identity allocator; default is a random UUID (effect layer). */
  allocateSnapshotId?: (() => string) | undefined;
  /** G10-E5 (additive): the local collaboration peer identity. Absent = no federation surface. */
  localPeer?: PeerRef | undefined;
  /** G10-E5 (additive): the host-neutral peer transport port. */
  peerTransportPort?: PeerTransportPort | undefined;
  /** G10-E5 (additive): the read-only peer directory port. */
  peerDirectoryPort?: PeerDirectoryPort | undefined;
  /**
   * UX-B §7/§8/SC-10 (additive): the READ-ONLY project↔peer deployment directory.
   * It is genuinely separate from `peerDirectoryPort` (which carries peer identity
   * only, with no project dimension — audit Q1/Q2): this one answers "which project
   * is behind which peer", which is what lets a user say "ask the optics project"
   * instead of naming a `PeerRef`. With `localPeer` + federation it enables
   * `application.crossProject`; absent ⇒ that face (and its tool/routes) are absent,
   * never stubbed. It is deployment routing metadata, NOT authority or ownership.
   */
  projectPeerDirectory?: ProjectPeerDirectoryPort | undefined;
  /** G10-E5 (additive): the canonical Palimpsest-owned coordination store. */
  coordinationStore?: CoordinationStore | undefined;
  /** G10-E5 (additive): read-only canonical Attempt validation for participation. */
  attemptCatalog?: AttemptCatalogPort | undefined;
  /** G10-F5 (additive): the canonical organization lineage store. Absent = no organization surface. */
  organizationStore?: OrganizationStore | undefined;
  /** G10-F5 (additive): the canonical institution lineage store (requires organizationStore). */
  institutionStore?: InstitutionStore | undefined;
  /** G10-F5 (additive): institution transition-id allocator; default is a random UUID. */
  allocateTransitionId?: (() => string) | undefined;
  /**
   * G0 (additive): the trusted local institution governance identity. Distinct
   * from federation `localPeer`; required for `installed.institution.service.approveLocal`.
   */
  institutionGovernancePeer?: PeerRef | undefined;
  /** G10-G7 (additive): the canonical Campaign temporal store. Absent = no campaign surface. */
  campaignStore?: CampaignStore | undefined;
  /** G10-G7 (additive): read-only Evidence-plane bridge for campaign hypotheses/belief. */
  campaignEvidencePort?: CampaignEvidencePort | undefined;
  /** G10-G7 (additive): read-only Work project standing for interventions/watches. */
  campaignWorkPort?: CampaignWorkObservationPort | undefined;
  /** G10-G7 (additive): idempotent Work admission boundary for compiled Projects. */
  campaignWorkAdmissionPort?: CampaignWorkAdmissionPort | undefined;
  /** G10-G7 (additive): untrusted planner/compiler port. */
  campaignCompilerPort?: CampaignCompilerPort | undefined;
  /** G10-G7 (additive): external prospective-memory signal source. */
  campaignSignalPort?: CampaignExternalSignalPort | undefined;
  /** G10-G7 (additive): read-only institution epoch source for watches/wake. */
  campaignInstitutionEpochPort?: CampaignInstitutionEpochSource | undefined;
  /** G10-G7 (additive): injected campaign clock (not Date.now in materialization). */
  campaignClock?: (() => string) | undefined;
  /**
   * G10-AC (additive): which Campaigns this project's monitor may evaluate. Absent
   * ⇒ the monitor runtime is NOT composed and no background work happens. There is
   * no default that scans every Campaign.
   */
  campaignMonitorScope?: CampaignMonitorScopePort | undefined;
  /** G10-AC (additive): the host-driven tick. Absent ⇒ ticks are manual only. */
  campaignMonitorTickSource?: MonitorTickSourcePort | undefined;
  /** G10-AC (additive): the host wake adapter. Absent ⇒ pull mode, nothing is resumed. */
  campaignMonitorActivation?: CampaignWakeActivationPort | undefined;
  /**
   * G10-AC (additive): deployment-local delivery marks (duplicate suppression/backoff).
   * G10-AC-R: when a first-party runtime is composed and this is absent, a default
   * deployment-local store is created; `false` deliberately disables suppression.
   */
  campaignMonitorDeliveryMarks?: SqliteMonitorDeliveryMarkStore | false | undefined;
  /** G10-AC (additive): explicit per-tick budgets and redelivery cooldown. */
  campaignMonitorPolicy?: Partial<CampaignMonitorPolicy> | undefined;
  /**
   * G10-H (additive): the canonical runtime-organization store. Absent = no
   * RuntimeScope/Holon surface (never a stub). Organization grounding is
   * verified only when an organization store is also supplied.
   */
  runtimeScopeStore?: RuntimeScopeStore | undefined;
  /**
   * G10-I CF-H-06: trusted external-representation admission. Absent ⇒ external
   * representation mutation fails closed (read-only Holon observation remains).
   */
  runtimeScopeRepresentationAdmission?: RuntimeScopeRepresentationAdmissionPort | undefined;
  /** G10-J (additive): the evolution case store (evolution governance/execution history only). */
  organizationEvolutionStore?: OrganizationEvolutionStore | undefined;
  /** G10-J (additive): the untrusted complete-candidate authoring seam. */
  organizationEvolutionCompiler?: OrganizationEvolutionCompilerPort | undefined;
  /** G10-J (additive): the independent structural-evolution authority seam. */
  organizationEvolutionAuthority?: OrganizationEvolutionAdmissionPort | undefined;
  /** G10-J (additive): institution governing the subject organization (enables the F5 path). */
  organizationEvolutionInstitutionId?: string | undefined;
  /**
   * G10-K (additive): the canonical Boundary Memory store. With `localPeer`, this
   * enables `installed.boundaryMemory` — durable multi-peer shared boundary state.
   */
  boundaryMemoryStore?: BoundaryMemoryStore | undefined;
  /** G10-K (additive): artifact-type registry; defaults to the builtin registry. */
  boundaryArtifactTypes?: BoundaryArtifactTypeRegistry | undefined;
  /** G10-K (additive): untrusted formalization compiler enabling FORMALIZE_ORGANIZATION. */
  organizationFormalizationCompiler?: OrganizationFormalizationCompilerPort | undefined;
  /** G10-L (additive): the dedicated semantic transport for remote boundary collaboration. */
  boundaryCollaborationTransport?: BoundaryCollaborationTransportPort | undefined;
  /** G10-L (additive): workspace→canonical-home resolution (deployment binding, not social semantics). */
  boundaryWorkspaceRoute?: BoundaryWorkspaceRoutePort | undefined;
  /** G10-L (additive): this host's canonical boundary home id (defaults to `home-<localPeer>`). */
  boundaryHomeId?: string | undefined;
  /** G10-L (additive): remote operation-id allocator; default is a random UUID. */
  allocateBoundaryOperationId?: (() => string) | undefined;
  /** G10-M (additive): the runtime evolution case store (runtime process history only). */
  runtimeEvolutionStore?: RuntimeEvolutionStore | undefined;
  /** G10-M (additive): untrusted complete-runtime-candidate authoring seam. */
  runtimeEvolutionCompiler?: RuntimeStructuralEvolutionCompilerPort | undefined;
  /** G10-M (additive): independent runtime-structural authority seam. */
  runtimeEvolutionAuthority?: RuntimeStructuralEvolutionAdmissionPort | undefined;
  /** G10-N (additive): the canonical reasoning-cell store. */
  reasoningCellStore?: ReasoningCellStore | undefined;
  /**
   * UX-C §9/SC-4 (additive): who OWNS `reasoningCellStore`. Default `false` — a
   * caller-supplied store belongs to its caller and is NEVER closed by this
   * install (the audit found this ownership was previously implicit, which silently
   * leaked a store unless the caller happened to close it). Set `true` only when
   * this install created the store and should close it in `dispose()`.
   */
  reasoningCellStoreOwned?: boolean | undefined;
  /** G10-N (additive): claim-type registry; defaults to the builtin statement/dead-end registry. */
  reasoningClaimTypes?: ReasoningClaimTypeRegistry | undefined;
  /** G10-N (additive): the verification policy seam (separate from admission). */
  reasoningVerificationPolicy?: ReasoningVerificationPolicyPort | undefined;
  /** G10-N (additive): the epistemic admission policy seam (separate from verification). */
  reasoningAdmissionPolicy?: ReasoningEpistemicAdmissionPolicyPort | undefined;
  /**
   * G10-O (additive): the explicit versioned Dynamics policy used by the application-level
   * dynamics/evolution surfaces. Absent ⇒ those surfaces (and their tools/routes) are absent.
   */
  organizationDynamicsPolicy?: DynamicsPolicy | undefined;
  /**
   * G10-P (additive): explicit PeerRef↔PersistentPoint associations (deployment binding).
   * Supplying them makes `manpowerPoint(peer).continuity` truthful; absent ⇒ no continuity
   * is shown (never assumed).
   */
  peerContinuityAssociations?: readonly PeerContinuityAssociation[] | undefined;
  /**
   * G10-P (additive): the deployment attention policy. With `localPeer` + federation this
   * enables `installed.attention`; absent ⇒ no attention surface (never a hidden default).
   */
  attentionPolicy?: AttentionPolicy | undefined;
  /** G10-P (additive): deployment-local attention marks (accepted-revision dedupe). */
  attentionMarkStore?: AttentionMarkStore | undefined;
  /** G10-P (additive): the host activation adapter (DSH/Pi-shaped); absent ⇒ pull mode. */
  attentionActivation?: AttentionActivationPort | undefined;
  /**
   * G10-Q (additive): durable remote submission, so a non-home peer's agent can act through the
   * product tools (boundary mutation submission + remote commitment decision).
   */
  remoteTransport?: RemoteSubmissionPort | undefined;
  /**
   * G10-R (additive): the canonical empirical organization-memory store. Supplying it enables the
   * READ-ONLY empirical surface (experiments/runs/evaluations/interventions); absent ⇒ no empirical
   * surface (never a stub). Evaluation ≠ governance; memory ≠ authority.
   *
   * UX-C §7: this is NOT required for the advisor. The advisor is composed whenever the
   * installation can act (a local peer) or this store is supplied, and with no memory it
   * makes no empirical claim of any kind.
   */
  organizationMemoryStore?: OrganizationMemoryStore | undefined;
  /**
   * G10-S (additive): the versioned recipe catalog. This is PRODUCT CONFIG in code, not canonical
   * truth; it defaults to `builtinRecipeRegistry()`. The registry is descriptive only and grants no
   * authority.
   */
  recipeRegistry?: RecipeRegistry | undefined;
  /**
   * G10-S (additive): already-independent sovereign peers that exist for this deployment. This is
   * deployment wiring, never inferred; the advisor treats an empty list as "no independent peer".
   * Absent ⇒ `[]`.
   */
  knownIndependentPeers?: readonly { readonly peerId: string }[] | undefined;
  /**
   * G10-S (additive), DEPRECATED by G10-AD §16: a descriptive verifier ref for the Advisor.
   *
   * It is still ACCEPTED for compatibility, but it NO LONGER implies an executable independent
   * verifier: the Advisor's "independent verifier available" fact is derived LIVE from the composed
   * Project Verification runtime (registry + executable providers), and the deprecated string is
   * only displayed when no runtime exists. Wire `projectVerifierProviders` /
   * `projectVerifierRegistry` / `projectVerificationDefaultVerifierRef` for a real VERIFY capability.
   */
  verificationCapabilityRef?: string | undefined;
  /**
   * G10-S (additive): the host-neutral EXPLORE branch execution seam. Supplying it makes EXPLORE
   * execution possible; a branch is ephemeral and creates no PeerRef/PersistentPoint. Absent ⇒ the
   * advisor reports reasoning branches unavailable and EXPLORE execution fails closed.
   */
  reasoningBranchExecution?: ReasoningBranchExecutionPort | undefined;
  /**
   * Host facts that only exist once the deployment is running (see {@link HostDeploymentFactsPort}).
   * Absent means "this deployment knows of no dashboard", which the adapter reports as null — never
   * as an invented url.
   */
  hostFacts?: HostDeploymentFactsPort | undefined;
  /**
   * UX-A §3/§22 (additive): the UNTRUSTED TaskProfilerPort. Absent ⇒ the first-party
   * DETERMINISTIC, local, no-LLM lexical profiler is used, so `advisor.profile({ task })`
   * and AUTO/PARALLEL can actually profile a task sentence. A supplied profiler is
   * strict-parsed by `applyProfilerOutput`, re-sourced as UNTRUSTED_PROFILER, and can
   * never select a recipe.
   */
  taskProfiler?: TaskProfilerPort | undefined;
  /**
   * G10-T (additive): the canonical append-only Proof/Evidence plane store. Supplying it enables the
   * authoritative source-revision / evidence / candidate-claim / verification / publication /
   * assessment plane plus local, purpose-scoped disclosure. Absent ⇒ no proof surface (never a stub).
   */
  proofEvidenceStore?: ProofEvidenceStore | undefined;
  /** G10-T (additive): the local content-addressed blob vault for opaque source bytes. */
  proofBlobStore?: LocalProofBlobStore | undefined;
  /**
   * G10-T (additive): the explicit source-content resolver used for extract/read/verify/disclosure.
   * Content is reached ONLY through this port — never embedded in the semantic SQLite rows.
   */
  proofContentPort?: ProofSourceContentPort | undefined;
  /** G10-T (additive): the verification policy seam (separate from publication admission). */
  proofVerificationPolicy?: ProofVerificationPolicyPort | undefined;
  /** G10-T (additive): the publication-admission policy seam (separate from verification). */
  proofPublicationAdmission?: ProofPublicationAdmissionPort | undefined;
  /** G10-T (additive): the disclosure admission seam; absent ⇒ export fails closed unless supplied. */
  disclosureAdmission?: DisclosureAdmissionPort | undefined;
  /** G10-T (additive): the LOCAL disclosure export root. Absent ⇒ no exporter is wired. */
  disclosureExporterRoot?: string | undefined;
  /**
   * G10-V (additive): the Palimpsest-owned append-only ProjectAssetAssociation store (one
   * project's associations). Supplying it (or the journal / a proof store) enables the DERIVED
   * project workspace surface; absent ⇒ no projectWorkspace surface (never a stub).
   */
  projectAssociationStore?: SqliteProjectAssetAssociationStore | undefined;
  /** G10-V (additive): the Palimpsest-owned append-only project journal store. */
  projectJournalStore?: SqliteProjectJournalStore | undefined;
  /**
   * G10-V (additive): the deployment-local, NON-authoritative operator management-preference
   * store. It is the ONLY writer of an involvement change; absent ⇒ an in-memory DIRECT default
   * control (read-only in effect, everything degrades to DIRECT).
   */
  managementPreferenceStore?: SqliteManagementPreferenceStore | undefined;
  /**
   * G10-AB (additive): the deployment-local, NON-authoritative Work Mode preference store. It
   * is the ONLY writer of the user-level project default; absent ⇒ derived from
   * `operatingStorePath`/`databasePath`, else an in-memory FOCUS default.
   */
  workModePreferenceStore?: UserWorkModeControlPort | undefined;
  /** G10-AB (additive): the append-only, NON-authoritative management activity store. */
  managementActivityStore?: SqliteManagementActivityStore | undefined;
  /**
   * G10-AB: where the operator preference + activity stores live. Defaults to
   * `<databasePath dir>/project_operating.sqlite` (a deployment-local file), and to `:memory:`
   * when the orchestration store itself is in memory.
   */
  operatingStorePath?: string | undefined;
  /**
   * G10-AB §7/§30: which capabilities actually EXIST. Only what is declared here is reported as
   * available; `verify` being wired is not the same as an INDEPENDENT verifier.
   */
  operatingCapabilities?: Partial<WorkModeCapabilityInputs> | undefined;
  /**
   * G10-AD §29 (additive): the narrowly-owned, append-only Project Verification history store.
   * Absent ⇒ a default deployment-local store is created beside the G10-AB/AC operating store
   * (or `:memory:` when the orchestration store is in memory).
   */
  projectVerificationStore?: SqliteProjectVerificationStore | undefined;
  /**
   * G10-AD §29 (additive): the verifier CONFIG registry (definitions, not truth). Absent ⇒ it is
   * derived from the executable runtime ports, so a registered ref is always executable.
   */
  projectVerifierRegistry?: ProjectVerifierRegistry | undefined;
  /**
   * G10-AD §29 (additive): the EXECUTABLE verifier ports. Absent ⇒ this deployment registers the
   * first-party mechanical `git diff --check` verifier over `repository`. An EMPTY array is the
   * explicit "no verification runtime" deployment.
   */
  projectVerifierProviders?: readonly ProjectVerifierPort[] | undefined;
  /**
   * G10-AD §29 (additive): the verifier ref a caller/agent gets when it does not select one.
   * Absent ⇒ the first executable independent ref.
   */
  projectVerificationDefaultVerifierRef?: string | undefined;
  /**
   * G10-AE §7 (additive): the EXTERNAL ASSET LIBRARY registry — versioned deployment CONFIG,
   * never asset truth and never project context. Supplying it composes `installed.externalAssets`;
   * absent ⇒ no bridge surface at all (never a stub), so a bare Work-only install composes
   * exactly nothing and NO external library is ever consulted automatically.
   */
  externalAssetProviders?: ExternalAssetLibraryRegistry | undefined;
  /**
   * G10-AE §17 (additive): the narrow, append-only bridge history store. It owns operation
   * lineage/receipts ONLY (refs and digests, never asset content). Absent ⇒ a deployment-local
   * default is created beside the other operating stores (or `:memory:` when the orchestration
   * store is in memory); it is closed by `dispose()` only when this install created it.
   */
  externalAssetBridgeStore?: SqliteExternalAssetBridgeStore | undefined;
  /**
   * G10-AE §21 (additive): the SEPARATE publication approval port (`APPROVE | REJECT`). Absent ⇒
   * `approveAndPublish` fails closed and NOTHING is published: no agent, no management mode and no
   * ordinary HTTP authentication can stand in for this port.
   */
  externalAssetPublicationAdmission?: ExternalAssetPublicationAdmissionPort | undefined;
  /**
   * G10-AE §15 (additive): the explicit bound on imported text, in bytes. Content above it BLOCKS
   * the import with `content_too_large`; it is never truncated. Defaults to 256 KiB.
   */
  maxImportedTextBytes?: number | undefined;
}

/**
 * G10-D5: the high-level runtime service exposed when runtime wiring is
 * supplied (§94). It coordinates local realization steps and is NOT an
 * authority root (§98): effects stay Ordarium-admitted; observation is
 * read-only. Operations that lack their wiring are absent — never stubbed.
 */
export interface InstalledRuntime {
  /** Present iff an observation port + continuity store were supplied. */
  readonly observe?: (scope?: { scope?: string | undefined }) => Promise<ObservationOutcome>;
  /** Present iff an observation port + continuity store were supplied. */
  readonly compile?: (request: LiveCompileRequest) => Promise<LiveCompileOutcome>;
  /** Present iff a runtime carrier port was supplied. */
  readonly realize?: (request: RuntimeRealizationRequest) => Promise<RuntimeRealizationOutcome>;
  /** Present iff a runtime carrier port was supplied. */
  readonly release?: (handle: RuntimeReleaseHandle) => Promise<
    { readonly status: "released" } | { readonly status: "failed"; readonly reason: string; readonly detail: string }
  >;
}

export interface InstalledPalimpsest extends DelegationInstallResult, ContinuationInstallResult {
  readonly controller: ProjectController;
  readonly tools: readonly DshToolDefinition[];
  /** Present only when runtime wiring options are supplied (§93 backward compatibility). */
  readonly runtime?: InstalledRuntime | undefined;
  /** Present only when the full federation wiring is supplied (§132–§135) — never partial. */
  readonly federation?: FederationService | undefined;
  /** G10-F5 (additive): present only when an organization store is supplied. */
  readonly organization?: InstalledOrganization | undefined;
  /** G10-F5 (additive): present only when both organization + institution stores are supplied. */
  readonly institution?: InstalledInstitution | undefined;
  /** G10-G7 (additive): present only when a campaign store is supplied. */
  readonly campaign?: InstalledCampaign | undefined;
  /** G10-H (additive): present only when a runtime-scope store is supplied. */
  readonly runtimeScopes?: InstalledRuntimeScopes | undefined;
  /** G10-H (additive): the derived external Holon view — present with runtimeScopes. */
  readonly holons?: InstalledHolons | undefined;
  /** G10-I (additive): read-only Organization Dynamics — present iff runtimeScopeStore + organizationStore. */
  readonly organizationDynamics?: InstalledDynamics | undefined;
  /** G10-J (additive): governed evolution — present iff dynamics + evolution store/compiler/authority. */
  readonly organizationEvolution?: InstalledEvolution | undefined;
  /** G10-K (additive): boundary memory — present iff a boundary store + localPeer are supplied. */
  readonly boundaryMemory?: InstalledBoundaryMemory | undefined;
  /** G10-L (additive): federated boundary collaboration — present iff localPeer + transport + route. */
  readonly federatedBoundaryMemory?: InstalledFederatedBoundaryMemory | undefined;
  /** G10-M (additive): runtime structural evolution — present iff runtimeScopes + dynamics + store/compiler/authority. */
  readonly runtimeEvolution?: InstalledRuntimeEvolution | undefined;
  /** G10-N (additive): collaborative reasoning cells — present iff store + verification + admission policy. */
  readonly reasoningCells?: InstalledReasoningCells | undefined;
  /** G10-O (additive): the ONE composed application surface behind every tool/HTTP/UI entry. */
  readonly application: PalimpsestApplicationSurface;
  /** G10-P (additive): this host's canonical boundary home, exposed for a durable inbound pump. */
  readonly boundaryHome?: BoundaryHome | undefined;
  /** G10-P (additive): semantic attention derivation — present iff policy + localPeer + federation. */
  readonly attention?: AttentionService | undefined;
  /** G10-R (additive): read-only empirical history — present iff an organization-memory store is supplied. */
  readonly organizationMemory?: OrganizationMemoryService | undefined;
  /** G10-R (additive): the derived evaluation read model — present iff an organization-memory store is supplied. */
  readonly evaluation?: { readonly evaluate: typeof evaluate } | undefined;
  /** G10-S (additive): the versioned in-code recipe catalog (product config, never canonical truth). */
  readonly recipes: RecipeRegistry;
  /**
   * G10-S + UX-C §7/CF-UXA-02 (additive): the read-only empirical architecture advisor —
   * present whenever this installation can act (a local peer) or an organization-memory
   * store is supplied. An OrganizationMemory store is NOT a prerequisite: with no memory
   * the advisor makes no empirical claim of any kind.
   */
  readonly advisor?: EmpiricalArchitectureAdvisor | undefined;
  /** G10-S (additive): governed recipe execution — present iff a local peer is supplied. */
  readonly recipeExecution?: RecipeExecutionService | undefined;
  /**
   * UX-A §16 (additive): the ONE-REQUEST local collaboration composition — present iff the
   * recipe layer is actually composed (registry + governed execution). It is a thin,
   * STATELESS composition over the SAME owners every expert tool uses, and it owns no store,
   * no authority, no agent identity and no durable collaboration protocol. Absent ⇒ no
   * `application.collaboration` face and no `palimpsest_collaborate` tool.
   */
  readonly collaboration?: CollaborationService | undefined;
  /**
   * UX-B §28 (additive): the ONE-REQUEST CROSS-PROJECT collaboration composition —
   * present iff a `projectPeerDirectory` AND federation are supplied. It is a thin,
   * STATELESS product composition above the existing federation: it owns no store,
   * no authority, no agent identity and no new protocol. Absent ⇒ no
   * `application.crossProject` face and no `palimpsest_cross_project` tool.
   */
  readonly crossProject?: CrossProjectService | undefined;
  /** G10-P (additive): the host activation adapter when supplied (notification ≠ activation). */
  readonly attentionActivation?: AttentionActivationPort | undefined;
  /** G10-T (additive): the authoritative Proof/Evidence plane — present iff a proof store is supplied. */
  readonly proof?: ProofEvidenceService | undefined;
  /** G10-T CF-T-02 (additive): evidence-grounded Explore extraction — present iff a proof store is supplied. */
  readonly proofExtraction?: EvidenceExtractionService | undefined;
  /** G10-T (additive): local purpose-scoped disclosure — present iff a proof store is supplied. */
  readonly disclosure?: DisclosureService | undefined;
  /**
   * G10-V (additive): the DERIVED project workspace read model — present iff an association
   * store, a journal store, or a proof store is supplied. It copies no canonical truth and
   * owns only the association/journal histories.
   */
  readonly projectWorkspace?: ProjectWorkspaceService | undefined;
  /**
   * G10-V (additive): graduated project-management autonomy — present iff a workspace exists.
   * The installed service exposes the OPERATOR `applyOperatorModeChange`; the agent-facing
   * application surface/tools never do.
   */
  readonly projectManagement?: ProjectManagementService | undefined;
  /**
   * G10-AB (additive): the deployment-local operating-posture stores. Present iff a workspace
   * exists. Neither is authority: the Work Mode store holds a user default, and the activity
   * store is an append-only, non-authoritative audit log.
   */
  readonly projectOperating?:
    | {
        readonly workMode: UserWorkModeControlPort;
        readonly activity: SqliteManagementActivityStore;
      }
    | undefined;
  /**
   * G10-AC (additive): the long-horizon Campaign monitor runtime. Present only
   * when the operator explicitly wired a monitor scope. It is not an agent and
   * not a scheduler: it evaluates dormant watches, records canonical triggers,
   * advances the existing wake/reconciliation, and emits an at-least-once host
   * wake signal. It grants no authority and compiles no next action.
   */
  readonly monitor?: CampaignMonitorDriver | undefined;
  /**
   * G10-AD §29 (additive): the independent Project Verification runtime. Present iff a verification
   * history store was composed. It verifies ONLY the exact current ProjectIR head under a registered
   * verifier protocol and records the run; it grants no truth, no Work Evidence, no Proof
   * publication, no Reasoning admission and no authority.
   *
   * §15/§18/§19/§22 integration: `status()`/`history()`/`verifyCurrentHead()` are wired into the
   * operating posture (VERIFY availability), recipe execution (`bind_verification`), bounded
   * management (`RUN_LOCAL_VERIFY`), the application/HTTP surface and the Agent tools. All of those
   * consume this SAME runtime — none of them can register a verifier, inject a command, target an
   * arbitrary commit, or mint authority from a verdict.
   */
  readonly verification?: InstalledVerification | undefined;
  /**
   * G10-AE §7/§8/§28 (additive): the EXTERNAL ASSET LIBRARY bridge. Present iff an
   * `externalAssetProviders` registry was supplied. It exposes the read (providers/search/inspect),
   * prepare (reference/import/publication) and operator-explicit commit/approve operations over the
   * EXISTING owners — one `EXTERNAL_ASSET` ProjectAssetAssociation, one ProjectJournal entry, and the
   * governed external-effect path for publication. It can reach no Work, Proof or Reasoning owner,
   * never consults a library automatically and never injects an external asset into project context.
   *
   * The AGENT-facing surface (application/tools/HTTP) deliberately exposes only read/prepare: the
   * publication approval lives on this install object and behind the explicit admission port.
   */
  readonly externalAssets?: InstalledExternalAssets | undefined;
  register(context: DshPluginContext): () => void;
  dispose(): Promise<void>;
}

/**
 * G10-AE §28: the installed external-asset bridge surface.
 *
 *   ExternalAsset != ProjectAsset      Association != Ownership
 *   Reference != Import               PublicationPreview != Publication
 *
 * `service.<verb>` is the plane itself; the promoted verbs are the read/prepare/commit operations
 * the operator path uses. `commitReference`, `commitImport` and `approveAndPublish` are
 * OPERATOR-EXPLICIT: the agent-facing application surface never calls them.
 */
export interface InstalledExternalAssets extends ExternalAssetBridgeService {
  readonly store: SqliteExternalAssetBridgeStore;
  readonly registry: ExternalAssetLibraryRegistry;
  readonly service: ExternalAssetBridgeService;
}

/**
 * G10-AD §22/§29: the installed verification surface.
 *
 *   ProjectVerificationStatus ≠ Truth
 *   a recorded run     ≠ Work Evidence / Proof publication / Reasoning admission
 */
export interface InstalledVerification {
  readonly store: SqliteProjectVerificationStore;
  readonly registry: ProjectVerifierRegistry;
  readonly service: ProjectVerificationService;
  readonly defaultVerifierRef: string | null;
  /** The repository the mechanical protocol runs against, when one is configured. */
  readonly repository: string | null;
  status(): Promise<ProjectVerificationStatus>;
  /** The append-only history, newest first. */
  history(limit?: number): Promise<readonly ProjectVerificationRun[]>;
  verifyCurrentHead(input?: {
    readonly verifierRef?: string | undefined;
    readonly requestedBy?: string | undefined;
    readonly reason?: string | undefined;
    readonly signal?: AbortSignal | undefined;
  }): Promise<ProjectVerificationOutcome>;
  /**
   * G10-AD §15/§16: the STRUCTURAL runtime capability the Work Mode availability is
   * derived from. It is a pure read of the registered definitions + the executable
   * providers: a registered ref with NO provider is not a runtime, and a verifier
   * whose independence class does not count can never make VERIFY available. It runs
   * no verifier and reads no project state.
   */
  runtimeCapability(): VerificationRuntimeCapabilityView;
}

/** G10-H: the runtime-organization surface (never forces organization wiring). */
export interface InstalledRuntimeScopes {
  readonly store: RuntimeScopeStore;
  readonly service: RuntimeScopeService;
}

/** G10-H: read-only external Holon projection surface. */
export interface InstalledHolons {
  view(scopeId: string): Promise<HolonView>;
}

/** G10-I: read-only Organization Dynamics surface (observation/diagnosis/proposal). */
export interface InstalledDynamics {
  readonly service: OrganizationDynamicsService;
}

/** G10-J: the governed-evolution surface (unified mutating boundary). */
export interface InstalledEvolution {
  readonly service: OrganizationEvolutionService;
}

/** G10-N: the collaborative reasoning cell surface (cell-local admitted epistemic state). */
export interface InstalledReasoningCells {
  readonly store: ReasoningCellStore;
  readonly service: ReasoningCellService;
}

/** G10-M: the governed runtime structural evolution surface. */
export interface InstalledRuntimeEvolution {
  readonly service: RuntimeEvolutionService;
}

/** G10-K: the collaborative boundary-memory surface (shared boundary state). */
export interface InstalledBoundaryMemory {
  readonly store: BoundaryMemoryStore;
  readonly service: BoundaryMemoryService;
}

/**
 * G10-L: the federated boundary surface. `client` lets this host act as a remote peer
 * against whichever canonical home the route resolves; `home` is present only when this
 * host physically holds the canonical store (`StorageHome ≠ AuthorityRoot`).
 */
export interface InstalledFederatedBoundaryMemory {
  readonly client: FederatedBoundaryClient;
  readonly home?: BoundaryHome | undefined;
}

/** G10-F5: the additive organization surface (never forces institution configuration). */
export interface InstalledOrganization {
  readonly store: OrganizationStore;
}

/**
 * G10-G7: the additive Campaign surface. Only operations whose dependencies
 * are supplied are present — never stubbed (§187). The service coordinates
 * Campaign semantics; it is NOT Institution/Work/Evidence/Ordarium authority.
 */
export interface InstalledCampaign {
  readonly store: CampaignStore;
  /** GC7: the grounded production loop (checkpoint→dormancy→wake→reconcile→admit). */
  readonly production: CampaignProductionService;
  readonly campaign: CampaignService;
  readonly prospective: ProspectiveService;
  readonly lifecycle: LifecycleService;
  readonly interventions?: InterventionService | undefined;
  readonly compiler?: CompilerService | undefined;
  /**
   * GC3 §93: the RECOMMENDED application-facing compile/admit pair. Present iff
   * a compiler port is configured. `admitNextAction` accepts ONE complete
   * `CompiledCampaignAction` and dispatches Project/WAIT internally.
   */
  readonly compileNextAction?: CompilerService["compileNextAction"] | undefined;
  readonly admitNextAction?: NextActionAdmissionService["admitCompiledNextAction"] | undefined;
}

/** G10-F5: the additive institution governance surface. */
export interface InstalledInstitution {
  readonly store: InstitutionStore;
  readonly service: InstitutionService;
}

