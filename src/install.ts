/**
 * installPalimpsest — the golden path (docs/01 §6, P2).
 *
 * One call wires the orchestration ledger, the shared Ordarium effects
 * runtime, the trusted policy, the controller and the seven tools into a
 * DSH host context. Defaults are zero-config and strong: `$DSH_HOME`
 * ledgers, a trusted-default policy (deny network, bounded attempts), and
 * the git CLI port rooted at the canonical repository.
 */

import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import { canonicalDigest } from "./schema/canonical.js";

import type { RuntimeHooks } from "@ordarium/core";

import { EventStore, dshDefaultStatePath } from "./state/index.js";
import { defaultOrdariumPath, createPalimpsestEffects } from "./effects/index.js";
import { GitCliPort, type GitPort } from "./effects/index.js";
import { TaskPolicy } from "./domain/index.js";
import { ProjectController } from "./tools/controller.js";
// SR-1 §11/§12: composition lives in `src/composition/`; this file composes the groups and
// assembles the installed surface. The two public helpers below are re-exported so the
// package export surface is byte-identical to the pre-refactor one (§27/§31).
import { composeCore, defaultAllocateActivationId, trustedDefaultPolicy } from "./composition/core.js";
import { composeInstalledLifecycle } from "./composition/lifecycle.js";
import {
  campaignActivityPort,
  campaignProjectRefPort,
  coordinationObservationPort,
  directManagementControl,
  externalImportViewOf,
} from "./composition/optional.js";

export { defaultAllocateActivationId, trustedDefaultPolicy };
import { definePalimpsestTools } from "./tools/tools.js";
import type { DshPluginContext, DshToolDefinition } from "./tools/dsh_types.js";
import type {
  LiveCompileOutcome,
  LiveCompileRequest,
  ObservationOutcome,
  RuntimeCarrierPort,
  RuntimeObservationPort,
  RuntimeRealizationOutcome,
  RuntimeRealizationRequest,
  RuntimeReleaseHandle,
} from "./runtime/index.js";
import {
  makeRuntimeRealizationService,
  observeAndCompileGroundedPlan,
  observeBindingState,
} from "./runtime/index.js";
import type { PersistentPointStore } from "./continuity/index.js";
import type {
  AttemptCatalogPort,
  CoordinationStore,
} from "./coordination/index.js";
import { makeParticipationService } from "./coordination/index.js";
import type {
  CommitmentScope,
  FederationService,
  PeerContinuityAssociation,
  PeerDirectoryPort,
  PeerRef,
  PeerTransportPort,
} from "./federation/index.js";
import { makeCommitmentService, makeFederationMessagingService, makeFederationService } from "./federation/index.js";
import type {
  AttentionActivationPort,
  AttentionMarkStore,
  AttentionPolicy,
  AttentionService,
  BoundaryAcceptedHead,
  BoundaryAttentionReadPort,
  PendingBoundaryDecision,
} from "./attention/index.js";
import { makeAttentionService } from "./attention/index.js";
import type { OrganizationStore } from "./organization/index.js";
import type { InstitutionService, InstitutionStore } from "./institution/index.js";
import { makeInstitutionService } from "./institution/index.js";
import type {
  CampaignStore,
  CampaignEvidencePort,
  CampaignCompilerPort,
  CampaignExternalSignalPort,
  CampaignInstitutionEpochSource,
  CampaignWorkObservationPort,
  CampaignWorkAdmissionPort,
  InterventionService,
  CompilerService,
  LifecycleService,
  ProspectiveService,
  CampaignService,
} from "./campaign/index.js";
import {
  committedReconciliationOf,
  inFlightWake,
  linkedProjectRefs,
  makeCampaignProductionService,
  makeCampaignService,
  makeCompilerService,
  makeInterventionService,
  makeLifecycleService,
  makeNextActionAdmissionService,
  makeProspectiveService,
  projectLinkedProjects,
} from "./campaign/index.js";
import type { CampaignProductionService, NextActionAdmissionService } from "./campaign/index.js";
import type {
  HolonView,
  RuntimeScopeCampaignPort,
  RuntimeScopeOrganizationPort,
  RuntimeScopeRepresentationAdmissionPort,
  RuntimeScopeService,
  RuntimeScopeStore,
} from "./runtime_scope/index.js";
import { makeRuntimeScopeService } from "./runtime_scope/index.js";
import type { CampaignActivityObservation, CampaignActivityPort, DynamicsCollaborationPort, OrganizationDynamicsService } from "./organization_dynamics/index.js";
import { makeOrganizationDynamicsService } from "./organization_dynamics/index.js";
import type { OrganizationEvolutionAdmissionPort, OrganizationEvolutionCompilerPort, OrganizationEvolutionStore, OrganizationEvolutionService, OrganizationFormalizationCompilerPort } from "./organization_evolution/index.js";
import { makeOrganizationEvolutionService } from "./organization_evolution/index.js";
import type { RuntimeEvolutionService, RuntimeEvolutionStore, RuntimeStructuralEvolutionAdmissionPort, RuntimeStructuralEvolutionCompilerPort } from "./runtime_evolution/index.js";
import { makeRuntimeEvolutionService } from "./runtime_evolution/index.js";
import type { ReasoningEpistemicAdmissionPolicyPort, ReasoningCellService, ReasoningCellStore, ReasoningClaimTypeRegistry, ReasoningVerificationPolicyPort } from "./reasoning_cell/index.js";
import { makeReasoningCellService } from "./reasoning_cell/index.js";
import type { OrganizationMemoryService, OrganizationMemoryStore } from "./organization_memory/index.js";
import { makeOrganizationMemoryService } from "./organization_memory/index.js";
import { evaluate } from "./experiment/index.js";
import type { RecipeRegistry } from "./recipes/registry.js";
import { builtinRecipeRegistry } from "./recipes/registry.js";
import type { RecipeExecutionService, ReasoningBranchExecutionPort } from "./recipes/execution.js";
import { makeRecipeExecutionService } from "./recipes/execution.js";
import type { EmpiricalArchitectureAdvisor } from "./advisor/advisor.js";
import { makeEmpiricalArchitectureAdvisor } from "./advisor/advisor.js";
import type { PalimpsestApplicationSurface, RemoteSubmissionPort } from "./application/surface.js";
import { makePalimpsestApplicationSurface } from "./application/surface.js";
import { defineApplicationTools } from "./tools/application_tools.js";
import type { DynamicsPolicy } from "./organization_dynamics/index.js";
import type {
  BoundaryArtifactTypeRegistry,
  BoundaryCollaborationTransportPort,
  BoundaryHome,
  BoundaryMemoryService,
  BoundaryMemoryStore,
  BoundaryWorkspaceRoutePort,
  FederatedBoundaryClient,
} from "./boundary_memory/index.js";
import { makeBoundaryHome, makeBoundaryMemoryService, makeFederatedBoundaryClient } from "./boundary_memory/index.js";
import type {
  DisclosureAdmissionPort,
  DisclosureService,
  EvidenceExtractionService,
  LocalProofBlobStore,
  ProofEvidenceService,
  ProofEvidenceStore,
  ProofPublicationAdmissionPort,
  ProofVerificationPolicyPort,
} from "./proof_asset/index.js";
import {
  blobBackedSourceContentPort,
  localDisclosureExporter,
  makeDisclosureService,
  makeEvidenceExtractionService,
  makeProofEvidenceService,
  proofCampaignEvidencePort,
} from "./proof_asset/index.js";
import type { ProofSourceContentPort } from "./proof_asset/source_content_port.js";
import type { ProjectWorkspaceCampaignPort, ProjectWorkspaceService } from "./project_workspace/index.js";
import { makeProjectWorkspaceService, SqliteProjectAssetAssociationStore, SqliteProjectJournalStore } from "./project_workspace/index.js";
import type { ProjectJournalEntry, WorkspaceExternalImportView } from "./project_workspace/index.js";
import type {
  ExternalAssetBridgeService,
  ExternalAssetLibraryRegistry,
  ExternalAssetProjectBasis,
  ExternalAssetPublicationAdmissionPort,
} from "./external_assets/index.js";
import {
  SqliteExternalAssetBridgeStore,
  defineExternalAssetEffects,
  externalAssetImportProvenanceOf,
  makeExternalAssetBridgeService,
  sqliteExternalAssetAssociationPort,
  sqliteExternalAssetJournalPort,
} from "./external_assets/index.js";
import type {
  ManagementAutonomyProfile,
  ManagementInvolvement,
  ProjectManagementService,
  UserManagementControlPort,
} from "./project_management/index.js";
import {
  SqliteManagementActivityStore,
  SqliteWorkModePreferenceStore,
  withMonitorRuntimeCapability,
  type UserWorkModeControlPort,
  type VerificationRuntimeCapabilityView,
  type WorkModeCapabilityInputs,
  linkedCampaignWakeEventSource,
} from "./project_operating/index.js";
import {
  deterministicTaskProfiler,
  makeCollaborationService,
  makeCrossProjectService,
  type CollaborationService,
  type CrossProjectService,
  type ProjectPeerDirectoryPort,
} from "./interaction/index.js";
import type { TaskProfilerPort } from "./advisor/index.js";
import {
  SqliteMonitorDeliveryMarkStore,
  makeCampaignMonitorDriver,
  nullCampaignWakeActivation,
  type CampaignMonitorDriver,
  type CampaignMonitorPolicy,
  type CampaignMonitorScopePort,
  type CampaignWakeActivationPort,
  type MonitorRuntimeCapability,
  type MonitorTickSourcePort,
} from "./monitor/index.js";
import {
  SqliteProjectVerificationStore,
  commandProjectHeadVerifier,
  firstPartyProjectHeadVerificationSource,
  independenceSummary,
  makeProjectVerificationService,
  verifierRegistryFromPorts,
  type ProjectVerificationOutcome,
  type ProjectVerificationRun,
  type ProjectVerificationService,
  type ProjectVerificationStatus,
  type ProjectVerifierPort,
  type ProjectVerifierRegistry,
} from "./project_verification/index.js";
import {
  DEFAULT_MAX_STEPS_PER_RUN,
  defaultAllowedActionClasses,
  defaultConfirmationBoundaries,
  defaultManagementProfile,
  makeProjectManagementService,
  materializeManagementProfile,
  SqliteManagementPreferenceStore,
} from "./project_management/index.js";

export interface InstallPalimpsestOptions {
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

export interface InstalledPalimpsest {
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

export function installPalimpsest(
  context: DshPluginContext,
  options: InstallPalimpsestOptions,
): InstalledPalimpsest {
  // §12: the core substrate is composed by an explicit typed function; the rest of this
  // file only decides which capabilities to compose and how to assemble the result.
  const core = composeCore({
    projectId: options.projectId,
    repository: options.repository,
    git: options.git,
    databasePath: options.databasePath,
    ordariumDatabasePath: options.ordariumDatabasePath,
    policy: options.policy,
    clock: options.clock,
    effectsClock: options.effectsClock,
    leaseMs: options.leaseMs,
    hooks: options.hooks,
  });
  const { repository, git, store, effects, policy, controller, baseTools } = core;

  // G10-T: the authoritative Proof/Evidence plane exists only when a canonical proof store is
  // supplied. Source bytes never enter the semantic rows; they are reachable only through the
  // explicit content port (or the content-addressed blob vault). Disclosure is a LOCAL,
  // purpose-scoped projection over published claims — never a federation send.
  let proof: ProofEvidenceService | undefined;
  let disclosure: DisclosureService | undefined;
  if (options.proofEvidenceStore !== undefined) {
    const sourceContentPort = options.proofContentPort;
    proof = makeProofEvidenceService({
      store: options.proofEvidenceStore,
      ...(options.proofBlobStore === undefined ? {} : { blob: options.proofBlobStore }),
      ...(sourceContentPort === undefined
        ? {}
        : {
            contentPort: {
              resolve: (input: { readonly revision: { readonly sourceId: string; readonly revision: number; readonly contentDigest: string } }) =>
                sourceContentPort.readContent({ sourceId: input.revision.sourceId, revision: input.revision.revision, contentDigest: input.revision.contentDigest }),
            },
          }),
      ...(options.proofVerificationPolicy === undefined ? {} : { verificationPolicy: options.proofVerificationPolicy }),
      ...(options.proofPublicationAdmission === undefined ? {} : { publicationAdmission: options.proofPublicationAdmission }),
    });
    const exporter = options.disclosureExporterRoot === undefined ? undefined : localDisclosureExporter(options.disclosureExporterRoot);
    // Blob-backed source bytes are exposed to disclosure through the SAME explicit read port idiom.
    const disclosureContent: ProofSourceContentPort | undefined =
      sourceContentPort ?? (options.proofBlobStore === undefined ? undefined : blobBackedSourceContentPort(options.proofBlobStore));
    disclosure = makeDisclosureService({
      proof,
      ...(exporter === undefined ? {} : { exporter }),
      ...(options.disclosureAdmission === undefined ? {} : { admission: options.disclosureAdmission }),
      ...(disclosureContent === undefined ? {} : { content: disclosureContent }),
    });
  }
  // G10-T: Campaign gains a real authoritative Evidence plane when no explicit port was given,
  // so a hypothesis can reference a published proof claim's standing snapshot read-only. An
  // explicitly supplied port always wins (the Campaign never fabricates a second Evidence plane).
  const campaignEvidence: CampaignEvidencePort | undefined =
    options.campaignEvidencePort ?? (proof === undefined ? undefined : proofCampaignEvidencePort(proof));

  // G10-D5: the runtime service exists only when runtime wiring is supplied
  // (§92/§93). No hidden default host behavior; the seven-tool orchestration
  // surface is unchanged when the options are absent.
  let runtime: InstalledRuntime | undefined;
  if (
    options.runtimeCarrierPort !== undefined ||
    (options.runtimeObservationPort !== undefined && options.continuityStore !== undefined)
  ) {
    const observationDeps =
      options.runtimeObservationPort !== undefined && options.continuityStore !== undefined
        ? {
            pointStore: options.continuityStore,
            observationPort: options.runtimeObservationPort,
            allocateSnapshotId: options.allocateSnapshotId ?? (() => `obs-${randomUUID()}`),
          }
        : undefined;
    const realizationService =
      options.runtimeCarrierPort === undefined
        ? undefined
        : makeRuntimeRealizationService({
            effects,
            allocateActivationId:
              options.allocateActivationId ?? defaultAllocateActivationId,
            port: options.runtimeCarrierPort,
            ...(options.continuityStore === undefined ? {} : { pointStore: options.continuityStore }),
          });
    runtime = {
      ...(observationDeps === undefined ? {} : { observe: () => observeBindingState(observationDeps) }),
      ...(observationDeps === undefined
        ? {}
        : { compile: (request) => observeAndCompileGroundedPlan(observationDeps, request) }),
      ...(realizationService === undefined
        ? {}
        : {
            realize: (request) => realizationService.realize(request),
            release: (request) => realizationService.releaseCarrier(request),
          }),
    };
  }

  // G10-K: Boundary Memory exists only when a boundary store and a local peer are
  // supplied (§66). Authorship derives from `localPeer`; without it there is no
  // truthful local author, so the surface is absent — never stubbed.
  let boundaryMemory: InstalledBoundaryMemory | undefined;
  if (options.boundaryMemoryStore !== undefined && options.localPeer !== undefined) {
    const service = makeBoundaryMemoryService({
      store: options.boundaryMemoryStore,
      localPeer: options.localPeer,
      ...(options.boundaryArtifactTypes === undefined ? {} : { types: options.boundaryArtifactTypes }),
    });
    boundaryMemory = { store: options.boundaryMemoryStore, service };
  }

  // G10-P: this host's canonical boundary home is built ONCE whenever it holds a canonical
  // store, so a durable inbound pump can drive remote boundary operations into it even when
  // no request/response transport is configured.
  let boundaryHome: BoundaryHome | undefined;
  if (boundaryMemory !== undefined && options.localPeer !== undefined) {
    boundaryHome = makeBoundaryHome({
      homeId: options.boundaryHomeId ?? `home-${options.localPeer.peerId}`,
      service: boundaryMemory.service,
      store: boundaryMemory.store,
    });
  }

  // G10-L: the federated surface exists when a local peer, a semantic transport, and a
  // workspace→home route are supplied. `home` is present only when THIS host actually
  // holds a canonical boundary store; a pure remote peer gets only the client.
  let federatedBoundaryMemory: InstalledFederatedBoundaryMemory | undefined;
  if (options.localPeer !== undefined && options.boundaryCollaborationTransport !== undefined && options.boundaryWorkspaceRoute !== undefined) {
    const client = makeFederatedBoundaryClient({
      peer: options.localPeer,
      transport: options.boundaryCollaborationTransport,
      route: options.boundaryWorkspaceRoute,
      allocateOperationId: options.allocateBoundaryOperationId ?? (() => `bop-${randomUUID()}`),
    });
    federatedBoundaryMemory = {
      client,
      ...(boundaryHome === undefined ? {} : { home: boundaryHome }),
    };
  }

  // G10-E5 (§132–§135): the federation service exists only when the full
  // collaboration wiring is supplied. No hidden default peers or transports;
  // the high-level service is the recommended path (never raw transport).
  let federation: FederationService | undefined;
  if (
    options.localPeer !== undefined &&
    options.coordinationStore !== undefined &&
    options.peerTransportPort !== undefined &&
    options.peerDirectoryPort !== undefined &&
    options.attemptCatalog !== undefined
  ) {
    const messaging = makeFederationMessagingService({
      effects,
      store: options.coordinationStore,
      localPeer: options.localPeer,
      allocateMessageId: () => `msg-${randomUUID()}`,
      allocateWakeId: () => `wake-${randomUUID()}`,
      transportPort: options.peerTransportPort,
    });
    const commitments = makeCommitmentService({
      store: options.coordinationStore,
      localPeer: options.localPeer,
      allocateCommitmentId: () => `com-${randomUUID()}`,
      allocateHandoffId: () => `ho-${randomUUID()}`,
      // G10-K §27: only boundary memory can verify an exact accepted revision.
      ...(boundaryMemory === undefined
        ? {}
        : {
            scopeGuard: {
              admitScope: async (scope: CommitmentScope) => {
                if (scope.kind === "boundary_revision") await boundaryMemory!.service.admitBoundaryRevisionScope(scope.revision);
              },
            },
          }),
    });
    const participation = makeParticipationService({
      store: options.coordinationStore,
      attempts: options.attemptCatalog,
      allocateInvocationId: () => `inv-${randomUUID()}`,
      allocateParticipationId: () => `part-${randomUUID()}`,
    });
    federation = makeFederationService({
      store: options.coordinationStore,
      localPeer: options.localPeer,
      messaging,
      commitments,
      participation,
      directory: options.peerDirectoryPort,
      allocateContactNeedId: () => `need-${randomUUID()}`,
      ...(options.peerContinuityAssociations === undefined
        ? {}
        : { continuityAssociations: options.peerContinuityAssociations }),
    });
  }

  // GC1 §35/§142: the installed campaign surface requires a canonical
  // institution source; without one there is no truthful genesis boundary.
  const campaignInstitutionSource =
    options.campaignInstitutionEpochPort ??
    (options.institutionStore === undefined
      ? undefined
      : {
          inspectEpoch: async (institutionId: string) => {
            const epoch = await options.institutionStore!.currentEpoch(institutionId);
            const ref = await options.institutionStore!.head(institutionId);
            if (epoch === undefined || ref === undefined) {
              return { state: "unknown" as const, detail: `institution "${institutionId}" does not exist` };
            }
            return { state: "known" as const, value: { institutionId, epoch: ref.epoch, digest: ref.digest } };
          },
        });
  let campaign: InstalledCampaign | undefined;
  if (options.campaignStore !== undefined && campaignInstitutionSource !== undefined) {
    const campaignStore = options.campaignStore;
    const campaignService = makeCampaignService({
      store: campaignStore,
      allocateCommitmentId: () => `cc-${randomUUID()}`,
      evidence: campaignEvidence,
      institutions: campaignInstitutionSource,
    });
    const prospective = makeProspectiveService({
      store: campaignStore,
      allocateWatchId: () => `cw-${randomUUID()}`,
      clock: options.campaignClock ?? (() => new Date().toISOString()),
      evidence: campaignEvidence,
      signals: options.campaignSignalPort,
      // Adapt the full-epoch source to the watch port's epoch-number view.
      institutions: {
        currentEpoch: async (institutionId: string) => {
          const knowledge = await campaignInstitutionSource.inspectEpoch(institutionId);
          return knowledge.state === "known" ? { state: "known" as const, value: knowledge.value.epoch } : knowledge;
        },
      },
      projects: options.campaignWorkPort,
    });
    const lifecycle = makeLifecycleService({
      store: campaignStore,
      allocateWakeCycleId: () => `wc-${randomUUID()}`,
      institutions: campaignInstitutionSource,
      evidence: campaignEvidence,
      work: options.campaignWorkPort,
    });
    const interventions =
      options.campaignWorkPort === undefined
        ? undefined
        : makeInterventionService({
            store: campaignStore,
            allocateInterventionId: () => `iv-${randomUUID()}`,
            work: options.campaignWorkPort,
            evidence: campaignEvidence,
          });
    const production = makeCampaignProductionService({
      store: campaignStore,
      institutions: campaignInstitutionSource,
      evidence: campaignEvidence,
      work: options.campaignWorkPort,
      allocateWakeCycleId: () => `wc-${randomUUID()}`,
      allocateWatchId: () => `cw-${randomUUID()}`,
      allocateObservationId: () => `obs-${randomUUID()}`,
      allocateRevisionId: () => `br-${randomUUID()}`,
    });
    const compiler =
      options.campaignCompilerPort === undefined
        ? undefined
        : makeCompilerService({
            store: campaignStore,
            allocateCompilationId: () => `cmp-${randomUUID()}`,
            compiler: options.campaignCompilerPort,
            work: options.campaignWorkAdmissionPort,
            buildContext: async (campaignId) => {
              const definition = await campaignService.definition(campaignId);
              if (definition === undefined) {
                throw new Error(`campaign "${campaignId}" does not exist`);
              }
              const commitments = await campaignService.commitmentStates(campaignId);
              const hypotheses = await campaignService.hypotheses(campaignId);
              const beliefState = await campaignService.currentBeliefState(campaignId);
              const events = await campaignStore.replay(campaignId);
              const projection = production.activeIds(events);
              const epoch = await campaignInstitutionSource.inspectEpoch(definition.institutionId);
              const observationRefs = events
                .filter((event) => event.type === "EVIDENCE_OBSERVED")
                .map((event) => (event.payload as { observation: { observationId: string } }).observation.observationId);
              // GC2 §65: the context's reconciliation is the CURRENT wake's
              // committed reconciliation — never "the latest one anywhere".
              const inFlight = inFlightWake(events);
              const reconciliation =
                inFlight === undefined ? undefined : committedReconciliationOf(events, inFlight);
              const reconciliationDigest = reconciliation?.digest ?? null;
              const interventions = events
                .filter((event) => event.type === "INTERVENTION_REGISTERED")
                .map((event) => {
                  const intervention = (event.payload as { intervention: { project: { projectId: string }; purpose: string } }).intervention;
                  return `${intervention.project.projectId}:${intervention.purpose}`;
                });
              return {
                campaignId,
                institutionId: definition.institutionId,
                activeCommitments: commitments.filter((entry) => entry.state === "OPEN").map((entry) => entry.commitment),
                activeHypotheses: hypotheses.filter((entry) => entry.state === "ACTIVE").map((entry) => entry.hypothesis),
                beliefState,
                recentObservationRefs: observationRefs,
                interventionSummaries: interventions,
                institutionEpoch: epoch.state === "known" ? epoch.value : null,
                activeWatchIds: projection.watches,
                reconciliationDigest,
                wakeCycleId: inFlight ?? null,
              };
            },
          });
    // GC3 §93: the unified admission boundary is present iff a compiler is
    // configured. It drives Project (Work saga + wake completion) and WAIT
    // (prospective transition + wake completion) through ONE entry point.
    const nextAction =
      options.campaignCompilerPort === undefined
        ? undefined
        : makeNextActionAdmissionService({
            store: campaignStore,
            ...(compiler === undefined ? {} : { projectAdmission: { admit: (input) => compiler.admitCompiledAction(input) } }),
            production: {
              buildCurrentCampaignCheckpoint: (campaignId, options) => production.buildCurrentCampaignCheckpoint(campaignId, options),
              completeWakeWithAction: (input) => production.completeWakeWithAction(input),
              lifecycleState: (campaignId) => production.lifecycleState(campaignId),
            },
            allocateWatchId: () => `cw-${randomUUID()}`,
          });
    campaign = {
      store: campaignStore,
      production,
      campaign: campaignService,
      prospective,
      lifecycle,
      ...(interventions === undefined ? {} : { interventions }),
      ...(compiler === undefined ? {} : { compiler }),
      ...(compiler === undefined ? {} : { compileNextAction: (input) => compiler.compileNextAction(input) }),
      ...(nextAction === undefined ? {} : { admitNextAction: (input) => nextAction.admitCompiledNextAction(input) }),
    };
  }

  // G10-AC-R: `dispose()` is a no-op on a second call, so a host that disposes the
  // install twice (or disposes after the monitor already stopped) cannot
  // double-close the controller, stores or effects.

  // G10-F5 (§153): ADDITIVE organization/institution surfaces. Supplying no
  // organization/institution store changes nothing (§154); institution wiring
  // requires the organization store because an epoch references a body.
  const organization: InstalledOrganization | undefined =
    options.organizationStore === undefined ? undefined : { store: options.organizationStore };
  let institution: InstalledInstitution | undefined;
  if (options.organizationStore !== undefined && options.institutionStore !== undefined) {
    institution = {
      store: options.institutionStore,
      service: makeInstitutionService({
        store: options.institutionStore,
        organizations: options.organizationStore,
        allocateTransitionId: options.allocateTransitionId ?? (() => `tr-${randomUUID()}`),
        localGovernancePeer: options.institutionGovernancePeer,
      }),
    };
  }

  // G10-H (§23): the runtime-organization surface exists only when a
  // runtime-scope store is supplied. Organization grounding uses the same
  // canonical organization store when present; without it a scope may still
  // exist with NO organization association, but a supplied basis cannot be
  // verified (fail closed).
  let runtimeScopes: InstalledRuntimeScopes | undefined;
  let holons: InstalledHolons | undefined;
  if (options.runtimeScopeStore !== undefined) {
    const organizationStore = options.organizationStore;
    const organizations: RuntimeScopeOrganizationPort | undefined =
      organizationStore === undefined
        ? undefined
        : {
            current: async (organizationDefinitionId: string) => organizationStore.head(organizationDefinitionId),
            exists: async (ref) => (await organizationStore.get(ref)) !== undefined,
            definition: async (ref) => {
              const definition = await organizationStore.get(ref);
              return definition === undefined ? undefined : { interactions: definition.interactions };
            },
            // G10-M: a RETIRED lineage cannot ground a new runtime scope.
            lifecycle: async (organizationDefinitionId: string) => organizationStore.lifecycle(organizationDefinitionId),
          };
    // CF-H-08: campaign association is verified against the canonical campaign store.
    const campaignStore = options.campaignStore;
    const campaigns: RuntimeScopeCampaignPort | undefined =
      campaignStore === undefined ? undefined : { exists: async (campaignId) => (await campaignStore.definition(campaignId)) !== undefined };
    const service = makeRuntimeScopeService({
      store: options.runtimeScopeStore,
      organizations,
      campaigns,
      ...(options.runtimeScopeRepresentationAdmission === undefined ? {} : { representationAdmission: options.runtimeScopeRepresentationAdmission }),
    });
    runtimeScopes = { store: options.runtimeScopeStore, service };
    holons = { view: (scopeId) => service.holonView(scopeId) };
  }

  // G10-I: the read-only Dynamics surface needs the runtime-scope and
  // organization sources; without them it is absent (never stubbed).
  let organizationDynamics: InstalledDynamics | undefined;
  if (runtimeScopes !== undefined && options.organizationStore !== undefined) {
    const orgStore = options.organizationStore;
    const dynamicsService = makeOrganizationDynamicsService({
      runtimeScopes: { store: runtimeScopes.store, service: runtimeScopes.service },
      organizations: { head: (id) => orgStore.head(id), get: (ref) => orgStore.get(ref), lifecycle: (id) => orgStore.lifecycle(id) },
      ...(options.coordinationStore === undefined ? {} : { collaboration: coordinationObservationPort(options.coordinationStore) }),
      ...(options.campaignStore === undefined ? {} : { campaignActivity: campaignActivityPort(options.campaignStore) }),
      // G10-L: boundary-aware observation is available whenever this host holds the store.
      ...(boundaryMemory === undefined ? {} : { boundary: { observe: (workspaceId: string) => boundaryMemory!.service.boundaryObservation({ workspaceId }) } }),
    });
    organizationDynamics = { service: dynamicsService };
  }

  // G10-J: governed evolution needs the read-only dynamics surface plus an explicit,
  // trusted-authority-wired evolution case store. Missing wiring -> a read-only-absent
  // surface, never a stub.
  let organizationEvolutionInstalled: InstalledEvolution | undefined;
  if (
    organizationDynamics !== undefined &&
    options.organizationEvolutionStore !== undefined &&
    options.organizationEvolutionCompiler !== undefined &&
    options.organizationEvolutionAuthority !== undefined &&
    options.organizationStore !== undefined
  ) {
    const organizationEvolution = makeOrganizationEvolutionService({
      organizations: options.organizationStore,
      dynamics: organizationDynamics.service,
      store: options.organizationEvolutionStore,
      compiler: options.organizationEvolutionCompiler,
      authority: options.organizationEvolutionAuthority,
      ...(institution === undefined || options.organizationEvolutionInstitutionId === undefined
        ? {}
        : { institution: { institutionId: options.organizationEvolutionInstitutionId, service: institution.service, store: institution.store } }),
      // G10-K CF-J-02: FORMALIZE_ORGANIZATION is enabled only when an accepted
      // blueprint source (boundary memory) AND an untrusted formalization compiler exist.
      ...(boundaryMemory === undefined || options.organizationFormalizationCompiler === undefined
        ? {}
        : {
            formalization: {
              boundary: { acceptedBlueprint: (input: { readonly workspaceId: string; readonly artifactId: string }) => boundaryMemory!.service.acceptedBlueprint(input) },
              compiler: options.organizationFormalizationCompiler,
            },
          }),
      // G10-M: exhaustive, read-only retirement safety ports. Absent ⇒ assessment is blocked.
      ...(options.organizationStore === undefined
        ? {}
        : {
            retirement: {
              ...(options.institutionStore === undefined
                ? {}
                : { institutions: { currentBodies: async () => (await options.institutionStore!.currentBodies()).map((epoch) => epoch.organization) } }),
              ...(runtimeScopes === undefined
                ? {}
                : {
                    runtimeScopes: {
                      openScopesGroundedTo: async (organizationDefinitionId: string) => {
                        const ids: string[] = [];
                        for (const ref of await runtimeScopes!.service.listScopes()) {
                          const state = await runtimeScopes!.service.scopeState(ref.scopeId);
                          if (state.lifecycle === "OPEN" && state.definition.organizationBasis?.organizationDefinitionId === organizationDefinitionId) ids.push(ref.scopeId);
                        }
                        return Object.freeze(ids);
                      },
                    },
                  }),
            },
          }),
    });
    organizationEvolutionInstalled = { service: organizationEvolution };
  }

  // G10-M: runtime structural evolution — present iff a runtime-scope store, the dynamics
  // surface, an evolution case store, an untrusted compiler, and an independent runtime
  // structural authority are ALL supplied (never stubbed).
  let runtimeEvolutionInstalled: InstalledRuntimeEvolution | undefined;
  if (
    runtimeScopes !== undefined &&
    organizationDynamics !== undefined &&
    options.runtimeEvolutionStore !== undefined &&
    options.runtimeEvolutionCompiler !== undefined &&
    options.runtimeEvolutionAuthority !== undefined
  ) {
    runtimeEvolutionInstalled = {
      service: makeRuntimeEvolutionService({
        runtimeScopes: { store: runtimeScopes.store, service: runtimeScopes.service },
        dynamics: organizationDynamics.service,
        store: options.runtimeEvolutionStore,
        compiler: options.runtimeEvolutionCompiler,
        authority: options.runtimeEvolutionAuthority,
      }),
    };
  }

  // G10-N: reasoning cells need a canonical store plus BOTH policy seams. Missing wiring →
  // the surface is absent (never stubbed).
  let reasoningCellsInstalled: InstalledReasoningCells | undefined;
  if (options.reasoningCellStore !== undefined && options.reasoningVerificationPolicy !== undefined && options.reasoningAdmissionPolicy !== undefined) {
    reasoningCellsInstalled = {
      store: options.reasoningCellStore,
      service: makeReasoningCellService({
        store: options.reasoningCellStore,
        verificationPolicy: options.reasoningVerificationPolicy,
        admissionPolicy: options.reasoningAdmissionPolicy,
        ...(options.reasoningClaimTypes === undefined ? {} : { claimTypes: options.reasoningClaimTypes }),
      }),
    };
  }

  // G10-T CF-T-02: evidence-grounded extraction exists whenever the proof plane exists. It is
  // built even without reasoning/branch/content wiring (those are reported honestly as
  // `capability_required` at call time) so the proof surface always answers `analyze`.
  const proofExtraction: EvidenceExtractionService | undefined =
    proof === undefined
      ? undefined
      : (() => {
          const content =
            options.proofContentPort ?? (options.proofBlobStore === undefined ? undefined : blobBackedSourceContentPort(options.proofBlobStore));
          return makeEvidenceExtractionService({
            proof,
            ...(reasoningCellsInstalled === undefined ? {} : { reasoning: reasoningCellsInstalled.service }),
            ...(options.reasoningBranchExecution === undefined ? {} : { branchExecution: options.reasoningBranchExecution }),
            ...(content === undefined ? {} : { content }),
            ...(options.clock === undefined ? {} : { clock: options.clock }),
          });
        })();

  // G10-R: the empirical organization-memory surface exists only when a canonical
  // store is supplied; it is a pure READ model and owns no other subsystem. Evaluation
  // ≠ governance and memory ≠ authority.
  const organizationMemory: OrganizationMemoryService | undefined =
    options.organizationMemoryStore === undefined
      ? undefined
      : makeOrganizationMemoryService({ store: options.organizationMemoryStore });

  // G10-S: recipes are versioned product CONFIG in code — no store, no authority. The registry is
  // exposed on the install unconditionally; the application surface only carries it when the recipe
  // layer is actually wired (so a bare Work install keeps exactly its Work tools).
  const recipeRegistry: RecipeRegistry = options.recipeRegistry ?? builtinRecipeRegistry();

  /*
   * UX-A §3/§22: the ONE task profiler this install uses.
   *
   * Before UX-A, `ApplicationSurfaceDeps.taskProfiler` was declared but NEVER
   * supplied, so `advisor.profile({ task })` returned nine UNKNOWN features on a real
   * installation (the UX-A gap assessment §8.1). The first-party default is the
   * DETERMINISTIC, local, no-model lexical profiler: it emits a value only where the
   * text carries an explicit signal, leaves everything else UNKNOWN, and never
   * selects a recipe. A host may supply a smarter profiler; its output is still
   * strict-parsed and re-sourced as UNTRUSTED_PROFILER.
   */
  const taskProfiler: TaskProfilerPort = options.taskProfiler ?? deterministicTaskProfiler();

  /*
   * G10-AD §15/§16/§18/§28: the LIVE verification-runtime hand-over.
   *
   * The Project Verification runtime is composed AFTER the Advisor and the recipe
   * execution service (it needs the operating-store path and the project
   * workspace), while those two must read it. A mutable wiring holder - the SAME
   * pattern the monitor uses - is the honest hand-over: readers resolve the
   * runtime per call, so nothing claims a runtime that was never composed
   * (`undefined` means exactly "no verification runtime here", never a stub).
   */
  const verificationWiring: { runtime: InstalledVerification | undefined } = {
    runtime: undefined,
  };
  function liveVerification(): InstalledVerification | undefined {
    return verificationWiring.runtime;
  }

  // G10-S + UX-C §7/CF-UXA-02: the advisor exists whenever its DESCRIPTIVE dependencies
  // exist — an empirical organization-memory store is OPTIONAL (`memory: undefined`), not a
  // prerequisite. With no memory it reports empty empirical support, omits the
  // INSUFFICIENT_EMPIRICAL_EVIDENCE marker and states honestly that the recommendation
  // rests on stated capability and task features alone. It is composed when this installation
  // can act on a recommendation (a local peer) or when an explicit empirical store was
  // supplied, so a bare Work-only install keeps exactly its nine Work tools.
  //
  // G10-AD §16/§28: the verifier fact comes from the REAL runtime/registry, read lazily (the
  // runtime is composed below). A descriptive `verificationCapabilityRef` option can no longer make
  // the Advisor report an independent verifier available.
  const advisor: EmpiricalArchitectureAdvisor | undefined =
    options.organizationMemoryStore === undefined && options.localPeer === undefined
      ? undefined
      : makeEmpiricalArchitectureAdvisor({
          registry: recipeRegistry,
          ...(organizationMemory === undefined ? {} : { memory: organizationMemory }),
          capabilities: {
            independentPeers: (options.knownIndependentPeers ?? []).map((peer) => Object.freeze({ peerId: peer.peerId })),
            // G10-AD §28: read lazily from the composed runtime. When there is no
            // runtime, the deprecated `verificationCapabilityRef` string may still
            // be DISPLAYED, but `independentVerifierAvailable` stays false: a
            // descriptive ref never inflates capability.
            get verifierRef(): string | undefined {
              return liveVerification()?.defaultVerifierRef ?? options.verificationCapabilityRef;
            },
            get independentVerifierAvailable(): boolean {
              return liveVerification()?.runtimeCapability().independentVerifierAvailable === true;
            },
            campaignMonitoring: campaign !== undefined,
            reasoningBranches: options.reasoningBranchExecution !== undefined,
          },
        });

  // G10-S: execution is present iff a local peer exists (it always acts AS this peer; execution owns
  // no identity). It runs the EXISTING governed services only and never admits a claim, accepts a
  // boundary revision, evolves anything, or produces an effect on its own.
  const recipeExecution: RecipeExecutionService | undefined =
    options.localPeer === undefined
      ? undefined
      : makeRecipeExecutionService({
          localPeer: options.localPeer,
          reasoning: reasoningCellsInstalled?.service,
          branchExecution: options.reasoningBranchExecution,
          federation,
          // G10-AD §18: a VERIFY modifier in a compiled plan runs the base mode and
          // THEN verifies the exact current project head through this runtime. Read
          // lazily: the runtime is composed further down. Absent ⇒ the step returns
          // `capability_required`, never a fake success.
          verification: () => liveVerification()?.service,
        });

  // G10-P: semantic attention is a DERIVATION of the surfaces above — never a scheduler and
  // never an authority. It exists only when a policy + local peer + federation are supplied.
  let attention: AttentionService | undefined;
  if (options.attentionPolicy !== undefined && options.localPeer !== undefined && federation !== undefined) {
    const localPeer = options.localPeer;
    const boundaryAttention: BoundaryAttentionReadPort | undefined =
      boundaryMemory === undefined
        ? undefined
        : {
            pendingDecisionsFor: async (peer) => {
              const pending: PendingBoundaryDecision[] = [];
              for (const definition of await boundaryMemory!.store.workspaces()) {
                const view = await boundaryMemory!.service.workspaceView({ workspaceId: definition.workspaceId });
                for (const artifact of view.artifacts) {
                  for (const candidate of artifact.pending) {
                    if (candidate.standing !== "PROPOSED" && candidate.standing !== "PARTIALLY_ACCEPTED") continue;
                    const revision = candidate.candidate;
                    if (!revision.requiredAcceptors.some((acceptor) => acceptor.peerId === peer.peerId)) continue;
                    if (candidate.acceptors.some((acceptor) => acceptor.peerId === peer.peerId)) continue;
                    if (candidate.rejectedBy.some((rejector) => rejector.peerId === peer.peerId)) continue;
                    pending.push({
                      workspaceId: definition.workspaceId,
                      artifactId: revision.artifactId,
                      candidateDigest: revision.digest,
                      author: revision.author,
                      intent: revision.intent,
                    });
                  }
                }
              }
              return pending;
            },
            acceptedHeadsFor: async (peer) => {
              const heads: BoundaryAcceptedHead[] = [];
              for (const definition of await boundaryMemory!.store.workspaces()) {
                if (!definition.participants.some((participant) => participant.peerId === peer.peerId)) continue;
                const view = await boundaryMemory!.service.workspaceView({ workspaceId: definition.workspaceId });
                for (const artifact of view.artifacts) {
                  if (artifact.current === null) continue;
                  heads.push({
                    workspaceId: definition.workspaceId,
                    artifactId: artifact.artifact.artifactId,
                    acceptedRevision: artifact.current.ref.revision,
                    candidateDigest: artifact.current.ref.candidateDigest,
                    revisionDigest: artifact.current.ref.revisionDigest,
                    author: artifact.current.candidate.author,
                  });
                }
              }
              return heads;
            },
          };
    attention = makeAttentionService({
      localPeer,
      federation: { inbox: (peer) => federation!.inbox(peer), commitments: () => federation!.commitments() },
      ...(boundaryAttention === undefined ? {} : { boundary: boundaryAttention }),
      ...(options.attentionMarkStore === undefined ? {} : { marks: options.attentionMarkStore }),
      policy: options.attentionPolicy,
    });
  }

  // G10-S: the execution bindings actually wired, reported as plain boolean facts (never guessed).
  const recipeExecutionStatus =
    recipeExecution === undefined || options.localPeer === undefined
      ? undefined
      : Object.freeze({
          localPeerId: options.localPeer.peerId,
          reasoningCell: reasoningCellsInstalled !== undefined,
          branchExecution: options.reasoningBranchExecution !== undefined,
          federation: federation !== undefined,
        });

  // G10-V: the DERIVED project workspace exists only when it has at least one truthful source
  // (the association store, the journal store, or the authoritative proof plane). It OWNS the
  // association/journal histories and copies no canonical fact; the proof/memory/campaign planes
  // are read-only ports, and an absent operand is reported (knowledgeWarnings), never guessed.
  //
  // G10-AE §26: when the operator supplies an external-asset provider registry the workspace view
  // additionally consumes the BRIDGE's own derived read (the plane's `resolve(projectId)`) and its
  // structured import-provenance reader. Both are read-only. They are wired LAZILY through
  // `externalAssetsRef` because the bridge itself is composed further down (it depends on the
  // composed Ordarium effects runtime).
  const externalAssetsRef: { service: ExternalAssetBridgeService | undefined } = { service: undefined };
  const projectWorkspace: ProjectWorkspaceService | undefined =
    options.projectAssociationStore === undefined && options.projectJournalStore === undefined && proof === undefined
      ? undefined
      : makeProjectWorkspaceService({
          controller,
          ...(options.projectAssociationStore === undefined ? {} : { associations: options.projectAssociationStore }),
          ...(options.projectJournalStore === undefined ? {} : { journal: options.projectJournalStore }),
          ...(proof === undefined
            ? {}
            : {
                proof: {
                  publishedClaims: () => proof!.publishedClaims(),
                  assetView: (claimId: string) => proof!.proofAssetView(claimId),
                },
              }),
          ...(organizationMemory === undefined
            ? {}
            : { memory: { evaluations: (experimentId: string) => organizationMemory!.evaluations(experimentId) } }),
          ...(campaign === undefined ? {} : { campaigns: campaignProjectRefPort(campaign.store) }),
          ...(options.externalAssetProviders === undefined
            ? {}
            : {
                externalAssets: {
                  resolve: async (projectId: string) => {
                    const service = externalAssetsRef.service;
                    if (service === undefined) {
                      throw new Error("the external asset bridge is not composed for this installation");
                    }
                    return service.resolve(projectId);
                  },
                },
                // G10-AE §16: the bridge's OWN structured-provenance reader (it re-verifies the
                // provenance digest and the relatedRefs linkage), so the workspace never has to
                // reinterpret an imported entry's provenance prose.
                externalImports: { of: (entry: ProjectJournalEntry) => externalImportViewOf(entry) },
              }),
        });

  // G10-V: the bounded management service exists only alongside a workspace (it composes the
  // workspace view with the operator profile and the EXISTING governed services). It owns no
  // authority: the default control is an in-memory DIRECT profile when no store is supplied.
  // G10-AB: the deployment-local operating-posture stores. They are NON-authoritative: the
  // Work Mode preference is a user default, and the activity log only REFERENCES canonical
  // owners. Both default to a file beside the orchestration store so a durable project
  // remembers its posture across sessions; an in-memory orchestration store stays in memory.
  // G10-AB: the deployment-local operating-posture stores share ONE derived path
  // (a file beside the orchestration store, or `:memory:`), which the monitor's
  // DEFAULT delivery-mark store reuses below.
  const derivedOperatingStorePath =
    options.operatingStorePath ??
    (options.databasePath === undefined || options.databasePath === ":memory:"
      ? ":memory:"
      : join(dirname(options.databasePath), "project_operating.sqlite"));
  const operatingStores:
    | { readonly workMode: UserWorkModeControlPort; readonly activity: SqliteManagementActivityStore }
    | undefined = (() => {
    if (projectWorkspace === undefined) return undefined;
    const derived = derivedOperatingStorePath;
    try {
      return {
        workMode: options.workModePreferenceStore ?? new SqliteWorkModePreferenceStore(derived),
        activity: options.managementActivityStore ?? new SqliteManagementActivityStore(derived),
      };
    } catch {
      // An unusable operating store must not take the whole runtime down: the
      // posture simply reports safe defaults and records no activity.
      return undefined;
    }
  })();

  // G10-AD §29: the independent Project Verification runtime, composed ADDITIVELY.
  //
  //  - the HISTORY store defaults to the SAME derived deployment-local path the G10-AB/AC
  //    operating stores use (a sibling table, never a second database truth); it is closed by
  //    `dispose()` only when this install created it;
  //  - the RUNTIME defaults to the first-party MECHANICAL `git diff --check` verifier over this
  //    deployment's repository - a real independent execution path (a bounded subprocess). An
  //    explicitly supplied port list is authoritative, and `[]` means "no verification runtime";
  //  - the REGISTRY is config: it defaults to exactly the executable ports, so a ref can never be
  //    registered without a runtime behind it;
  //  - `defaultVerifierRef` is only what a caller gets when it does not select a ref.
  //
  // G10-AD §15/§18/§19/§22/§23/§28 integration: the SAME runtime is handed to the operating posture
  // (VERIFY availability), recipe execution (`bind_verification`), bounded management
  // (`RUN_LOCAL_VERIFY`), the Advisor's independence fact and the application/HTTP/tool surface.
  //
  // A PRODUCT install - a derived workspace or a recipe execution binding - gets the first-party
  // runtime by default, so a normal deployment has a real VERIFY path. A BARE Work-only install
  // gets NO verification surface at all (never a stub), so its routes/tools are unchanged. It
  // grants no authority and can emit no Work/Proof/Reasoning record.
  const projectVerificationConfigured =
    options.projectVerificationStore !== undefined ||
    options.projectVerifierRegistry !== undefined ||
    options.projectVerifierProviders !== undefined ||
    options.projectVerificationDefaultVerifierRef !== undefined ||
    projectWorkspace !== undefined ||
    recipeExecution !== undefined;
  const verificationStoreCreated =
    projectVerificationConfigured && options.projectVerificationStore === undefined;
  let projectVerificationStore: SqliteProjectVerificationStore | undefined;
  if (projectVerificationConfigured) {
    try {
      projectVerificationStore =
        options.projectVerificationStore ??
        new SqliteProjectVerificationStore(derivedOperatingStorePath);
    } catch {
      // An unusable verification store must not take the whole runtime down: the
      // verification surface is simply absent (never a stub).
      projectVerificationStore = undefined;
    }
  }
  const verificationProviders: readonly ProjectVerifierPort[] =
    options.projectVerifierProviders ??
    Object.freeze([
      commandProjectHeadVerifier({ command: "git", args: ["diff", "--check"] }),
    ]);
  const verificationRegistry: ProjectVerifierRegistry =
    options.projectVerifierRegistry ?? verifierRegistryFromPorts(verificationProviders);
  const executableVerifierDefinitions = verificationRegistry
    .list()
    .filter((definition) =>
      verificationProviders.some(
        (provider) => provider.definition.verifierRef === definition.verifierRef,
      ),
    );
  // The RESOLVED default, by the SAME rule the service uses (the explicit option,
  // else the first verifier that actually has a provider). Reporting the raw option
  // made this field null while an unqualified verifyCurrentHead used a real ref -
  // two answers to one question.
  const resolvedDefaultVerifierRef =
    options.projectVerificationDefaultVerifierRef ??
    executableVerifierDefinitions[0]?.verifierRef ??
    null;
  const verification: InstalledVerification | undefined =
    projectVerificationStore === undefined
      ? undefined
      : (() => {
          const store = projectVerificationStore;
          const repository = options.repository ?? null;
          const service = makeProjectVerificationService({
            projectId: options.projectId,
            source: firstPartyProjectHeadVerificationSource({ controller, git }),
            store,
            registry: verificationRegistry,
            providers: verificationProviders,
            ...(options.projectVerificationDefaultVerifierRef === undefined
              ? {}
              : { defaultVerifierRef: options.projectVerificationDefaultVerifierRef }),
            ...(repository === null ? {} : { repository }),
            ...(options.clock === undefined ? {} : { clock: options.clock }),
          });
          return {
            store,
            registry: verificationRegistry,
            service,
            defaultVerifierRef: resolvedDefaultVerifierRef,
            repository,
            status: () => service.status(),
            history: (limit?: number) => service.history(limit),
            verifyCurrentHead: (input) =>
              service.verifyCurrentHead({
                requestedBy: input?.requestedBy ?? "operator:install",
                reason: input?.reason ?? "explicit request through the installed verification runtime",
                ...(input?.verifierRef === undefined ? {} : { verifierRef: input.verifierRef }),
                ...(input?.signal === undefined ? {} : { signal: input.signal }),
              }),
            // §15/§16: the availability fact is derived from the REGISTERED definitions
            // that have a real execution binding - never from a bare bool/string.
            runtimeCapability: (): VerificationRuntimeCapabilityView => {
              const summary = independenceSummary(executableVerifierDefinitions);
              const runtimeAvailable = executableVerifierDefinitions.length > 0;
              const independentVerifierAvailable =
                runtimeAvailable && summary.independentVerifyAvailable;
              return Object.freeze({
                runtimeAvailable,
                independentVerifierAvailable,
                independentVerifierRefs: summary.independentRefs,
                defaultVerifierRef: resolvedDefaultVerifierRef,
                note: independentVerifierAvailable
                  ? `VERIFY is available from a real independent runtime (${summary.independentRefs.join(", ")})`
                  : runtimeAvailable
                    ? "a verification runtime exists but no registered verifier counts as independent; VERIFY is not available"
                    : "no verification runtime exists; the VERIFY preference is retained and reported honestly",
              });
            },
          };
        })();
  // Hand the LIVE runtime to whatever was composed before it (recipe execution, and
  // any later reader). This mirrors the monitor's `monitorWiring` hand-over.
  verificationWiring.runtime = verification;

  /*
   * G10-AE §7/§17/§21/§22: the EXTERNAL ASSET LIBRARY bridge, composed ADDITIVELY.
   *
   *  - it exists ONLY when the operator supplies a provider registry: with no registry there is
   *    no surface at all (never a stub) and a bare Work-only install composes nothing;
   *  - the bridge HISTORY store defaults to the SAME derived deployment-local path the G10-AB/AC/AD
   *    stores use (a sibling table, never a second database truth);
   *  - it writes through the EXISTING owners: the Project Workspace association store (pinned to
   *    `EXTERNAL_ASSET` and an exact digest) and the Project Journal store (the ONLY import target).
   *    Supplying neither leaves search/inspect/prepare usable and every commit fail-closed;
   *  - publication goes through the shared Ordarium effects runtime: the
   *    `palimpsest.external_asset.publish` Safe Action is DEFINED in `src/external_assets/effects.ts`
   *    and INVOKED here, so Web/tools/Workspace never call a provider write directly;
   *  - the project scope/basis is a READ of the canonical ProjectIR projection - no new truth.
   */
  let externalAssets: InstalledExternalAssets | undefined;
  let externalAssetBridgeStoreCreated = false;
  /** Set ONLY for a store this install created (a supplied one belongs to its caller). */
  let externalAssetBridgeStore: SqliteExternalAssetBridgeStore | undefined;
  if (options.externalAssetProviders !== undefined) {
    try {
      const bridgeStore =
        options.externalAssetBridgeStore ??
        new SqliteExternalAssetBridgeStore(derivedOperatingStorePath);
      externalAssetBridgeStoreCreated = options.externalAssetBridgeStore === undefined;
      if (externalAssetBridgeStoreCreated) externalAssetBridgeStore = bridgeStore;
      const externalRegistry = options.externalAssetProviders;
      const journalPort =
        options.projectJournalStore === undefined
          ? undefined
          : sqliteExternalAssetJournalPort(options.projectJournalStore);
      const associationPort =
        options.projectAssociationStore === undefined
          ? undefined
          : sqliteExternalAssetAssociationPort(options.projectAssociationStore, options.clock);
      const publicationEffects = defineExternalAssetEffects({
        publicationPort: (providerId) => externalRegistry.get(providerId)?.publication,
        // Fail closed with a clear reason when this install holds no journal owner.
        journal: journalPort ?? {
          read: async (projectId: string, entryId: string) => {
            throw new Error(
              `no project journal store is configured: journal entry "${entryId}" of project "${projectId}" cannot be read for publication`,
            );
          },
        },
      });
      const projectBasisOf = async (projectId: string): Promise<ExternalAssetProjectBasis | undefined> => {
        if (projectId !== controller.projectId) return undefined;
        const row = controller.store.connection
          .prepare("SELECT revision, digest FROM projects WHERE project_id=?")
          .get(projectId) as { revision: unknown; digest: unknown } | undefined;
        if (row === undefined) return undefined;
        return Object.freeze({
          projectId,
          revision: Number(row.revision),
          digest: String(row.digest),
        });
      };
      const projectRevisionOf = async (projectId: string): Promise<number> =>
        (await projectBasisOf(projectId))?.revision ?? 0;
      const externalAssetService = makeExternalAssetBridgeService({
        registry: externalRegistry,
        bridge: bridgeStore,
        projectScope: { basis: projectBasisOf },
        ...(associationPort === undefined ? {} : { associations: associationPort }),
        ...(journalPort === undefined ? {} : { journal: journalPort }),
        ...(options.externalAssetPublicationAdmission === undefined
          ? {}
          : { publicationAdmission: options.externalAssetPublicationAdmission }),
        ...(options.maxImportedTextBytes === undefined
          ? {}
          : { maxImportedTextBytes: options.maxImportedTextBytes }),
        ...(options.clock === undefined ? {} : { clock: options.clock }),
        invokeEffect: {
          invoke: async (input) =>
            effects.invoke(publicationEffects.publishExternalAsset, input, {
              scope: options.projectId,
              callId: `external-asset-publish:${input.publicationId}`,
              // The Ordarium authorization evidence is the project revision the publication was
              // prepared under; the load-bearing binding is the preview's `payloadDigest`.
              revision: await projectRevisionOf(controller.projectId),
            }),
        },
      });
      externalAssets = Object.freeze({
        ...externalAssetService,
        store: bridgeStore,
        registry: externalRegistry,
        service: externalAssetService,
      });
      // G10-AE §26: the derived workspace view now reads its external section from
      // THIS service (the plane's own read-only resolve).
      externalAssetsRef.service = externalAssetService;
    } catch {
      // An unusable bridge must not take the whole runtime down: the surface is simply
      // absent (never a stub) and no external library is consulted.
      externalAssets = undefined;
      externalAssetsRef.service = undefined;
      // A store this install created has no other owner: release it here. The previous
      // code dropped the flag instead, leaking the file handle it had just opened.
      if (externalAssetBridgeStoreCreated) externalAssetBridgeStore?.close();
      externalAssetBridgeStoreCreated = false;
    }
  }

  const monitorWiring: { capability: MonitorRuntimeCapability | undefined } = { capability: undefined };
  function liveMonitorCapability(): MonitorRuntimeCapability | undefined {
    return monitor?.capability() ?? monitorWiring.capability;
  }

  const projectManagementBase: ProjectManagementService | undefined =
    projectWorkspace === undefined
      ? undefined
      : makeProjectManagementService({
          workspace: projectWorkspace,
          control: options.managementPreferenceStore ?? directManagementControl(options.clock ?? (() => new Date().toISOString())),
          controller,
          ...(recipeExecution === undefined ? {} : { recipes: { registry: recipeRegistry, execution: recipeExecution } }),
          // G10-AD §16/§21: `capabilities.verify` is deliberately GONE (it was a bare
          // boolean and is now ignored). RUN_LOCAL_VERIFY availability and its typed
          // execution both come from the REAL verification runtime below.
          capabilities: { recipeExecution: recipeExecution !== undefined },
          // G10-AD §19/§21: the typed verification runtime. It makes RUN_LOCAL_VERIFY
          // available, lets the candidate builder derive a verification-due candidate,
          // and returns the durable `project_verification:<runId>` ref the activity
          // record references. Read lazily through the same wiring holder.
          verification: () => liveVerification()?.service,
          ...(operatingStores === undefined ? {} : { workMode: operatingStores.workMode, activity: operatingStores.activity }),
          registry: recipeRegistry,
          // G10-AC-R §13: the operating history REFERENCES canonical Campaign wake
          // events for the Campaigns this project actually links to - never a global
          // scan, never a copied Campaign payload, never an invented event. Without a
          // Campaign store the seam is absent and the history honestly reports zero
          // Campaign references.
          ...(options.campaignStore === undefined
            ? {}
            : {
                campaignWakeEvents: () =>
                  linkedCampaignWakeEventSource({ store: options.campaignStore! }).projectCampaignWakeEvents(
                    options.projectId,
                  ),
              }),
          projectBasis: () => {
            // A read of the canonical ProjectIR projection - the same source the
            // management service's own `readProject()` uses. No new truth.
            const row = controller.store.connection
              .prepare("SELECT revision, digest, head_commit FROM projects WHERE project_id=?")
              .get(controller.projectId) as
              | { revision: number; digest: string; head_commit: string }
              | undefined;
            if (row === undefined) return { revision: 0, digest: "", headCommit: "" };
            return {
              revision: Number(row.revision),
              digest: String(row.digest),
              headCommit: String(row.head_commit),
            };
          },
          operatingCapabilities: () => ({
            // G10-AC §34 / AC-R §5: MONITOR availability derives from REAL runtime
            // wiring, read LIVE (the monitor runtime is composed after this
            // service), not from a bare boolean. An embedder may still declare an
            // equivalent external implementation explicitly via
            // `monitorConditionSource`. `monitorRuntime` is kept for backward
            // compatibility, but a bare `true` is no longer an availability claim.
            ...(options.operatingCapabilities ?? {}),
            monitorRuntime: liveMonitorCapability() !== undefined,
            monitorRuntimeProvenance: "first_party" as const,
            monitorRuntimeCapability: liveMonitorCapability(),
            // G10-AD §15/§16: VERIFY availability derives from the REAL Project
            // Verification runtime, read LIVE. The capability VIEW takes precedence
            // over the deprecated `independentVerifier` bool in the ONE availability
            // table, so a caller's bare declaration can never inflate the row - and
            // when no runtime exists the view is simply absent (the declaration, if
            // any, is reported as CONDITIONAL at best).
            ...(liveVerification() === undefined
              ? {}
              : { verificationRuntimeCapability: liveVerification()!.runtimeCapability() }),
          }),
        });

  // G10-AC-R §5: `makeProjectManagementService` narrows the declared capability
  // inputs to a fixed set of fields, so the LIVE monitor capability cannot ride
  // through it. Wrap ONLY the derived read (`posture`) so the MONITOR row is
  // recomputed from the live driver capability at call time; every other
  // behaviour is the base service, unchanged.
  // HONEST: this wrapper is required because `src/project_management/service.ts`
  // (outside this fix's write scope) does not forward the new capability field.
  const projectManagement: ProjectManagementService | undefined =
    projectManagementBase === undefined
      ? undefined
      : {
          ...projectManagementBase,
          posture: async () =>
            withMonitorRuntimeCapability(await projectManagementBase.posture(), liveMonitorCapability()),
        };

  // G10-O: ONE composed application surface over the services actually wired above. Tools and
  // HTTP both go through this; neither imports a store. Advanced application tools are registered
  // ONLY when their surface exists (a bare Work install keeps exactly the nine Work tools).
  // G10-AC: the monitor runtime is composed ONLY when the operator explicitly
  // wires a scope, and it owns no canonical store. With no scope there is no
  // driver, MONITOR degrades to PREVIEW_ONLY/UNAVAILABLE, and NOTHING runs in the
  // background. A configured tick source is STARTED at the end of this function.
  //
  // G10-AC-R §6/§7: delivery marks suppress duplicates. When a first-party runtime
  // is composed (a tick source is supplied) and the host supplied neither a store
  // nor `false`, a DEFAULT deployment-local store is created at the SAME derived
  // operating-store path the AB stores use (or `:memory:`), so a normal runtime
  // does not re-deliver on every tick. `false` deliberately disables suppression.
  let monitorMarks: SqliteMonitorDeliveryMarkStore | undefined;
  let deliveryMarksSource: "default" | "supplied" | "disabled";
  if (options.campaignMonitorDeliveryMarks === false) {
    monitorMarks = undefined;
    deliveryMarksSource = "disabled";
  } else if (options.campaignMonitorDeliveryMarks !== undefined) {
    monitorMarks = options.campaignMonitorDeliveryMarks;
    deliveryMarksSource = "supplied";
  } else if (options.campaignMonitorTickSource !== undefined && campaign !== undefined && options.campaignMonitorScope !== undefined) {
    try {
      monitorMarks = new SqliteMonitorDeliveryMarkStore(derivedOperatingStorePath);
      deliveryMarksSource = "default";
    } catch {
      // An unusable mark store must not take the runtime down: suppression is
      // simply off and the status says so.
      monitorMarks = undefined;
      deliveryMarksSource = "disabled";
    }
  } else {
    monitorMarks = undefined;
    deliveryMarksSource = "disabled";
  }

  const monitor: CampaignMonitorDriver | undefined =
    campaign === undefined || options.campaignMonitorScope === undefined
      ? undefined
      : makeCampaignMonitorDriver({
          projectId: options.projectId,
          // The opt-in gate is read through the SAME operator store the rest of the
          // runtime uses. Without one the driver cannot prove an opt-in, so it
          // refuses to scan rather than assuming MONITOR.
          workMode: operatingStores?.workMode ?? {
            get: async () => {
              throw new Error("no Work Mode preference store is configured");
            },
            set: async () => {
              throw new Error("no Work Mode preference store is configured");
            },
            history: async () => [],
          },
          scope: options.campaignMonitorScope,
          prospective: {
            scanWatches: (campaignId) => campaign.prospective.scanWatches(campaignId),
            recordTriggers: (input) => campaign.prospective.recordTriggers(input),
            watchStates: (campaignId) => campaign.prospective.watchStates(campaignId),
          },
          production: {
            lifecycleState: (campaignId) => campaign.production.lifecycleState(campaignId),
            beginWake: (input) => campaign.production.beginWake(input),
            reconcileCurrentWorld: (input) => campaign.production.reconcileCurrentWorld(input),
          },
          history: {
            readEvents: (campaignId) => campaign.store.replay(campaignId),
          },
          activation: options.campaignMonitorActivation ?? nullCampaignWakeActivation(),
          ...(monitorMarks === undefined ? {} : { marks: monitorMarks }),
          deliveryMarksSource,
          ...(options.campaignMonitorPolicy === undefined
            ? {}
            : { policy: options.campaignMonitorPolicy }),
          ...(options.campaignMonitorTickSource === undefined
            ? {}
            : { tickSource: options.campaignMonitorTickSource }),
          ...(options.campaignClock === undefined ? {} : { clock: options.campaignClock }),
        });

  monitorWiring.capability = monitor?.capability();

  // G10-AC-R §8: INITIATE startup when a runtime is composed. `void monitor.start()`
  // is not enough - the promise is kept so a host can `await installed.monitor.ready()`
  // and so `dispose` can settle it. `ready()` never rejects (a failure becomes
  // `startState: "FAILED"` in the driver), so there is no unhandled rejection.
  const monitorReady = monitor === undefined ? undefined : monitor.ready();
  void monitorReady?.catch(() => {
    // Defensive only: `ready()` resolves even on a failed start.
  });

  /*
   * UX-A §3/§16/§17/§22: the ONE-REQUEST collaboration composition.
   *
   * It is composed ONLY from wiring that already exists here, and it owns nothing:
   *
   *   advisor            → the architecture selector (§12) — never re-implemented
   *   recipeRegistry     → the descriptive catalog (product config)
   *   recipeExecution    → the governed execution service (§3/§17)
   *   reasoning service  → the accepted-frontier READ (§19 findings)
   *   liveVerification() → the DERIVED independent-verification availability (§34)
   *   projectManagement  → the durable Work Mode preference, CONTEXT ONLY (§8/§31)
   *
   * The verification and posture readers are THUNKS for the same reason
   * `verificationWiring`/`liveVerification()` exist above: they are read per call, so
   * an absent service means exactly "not composed" (never a stub, never a guess).
   * The minimum wiring is the recipe layer: without it there is nothing to plan or
   * run, so `collaboration` is simply ABSENT.
   */
  const collaboration: CollaborationService | undefined =
    recipeExecution === undefined
      ? undefined
      : makeCollaborationService({
          projectId: options.projectId,
          clock: options.clock ?? (() => new Date().toISOString()),
          recipes: recipeRegistry,
          recipeExecution,
          ...(advisor === undefined ? {} : { advisor }),
          // UX-A §22/§3: the deterministic, local, no-LLM profiler is the
          // FIRST-PARTY default, so AUTO/PARALLEL can profile a task sentence
          // without an LLM classifier. A supplied profiler is UNTRUSTED and is
          // strict-parsed + re-sourced by `applyProfilerOutput`.
          taskProfiler,
          ...(reasoningCellsInstalled === undefined ? {} : { reasoning: reasoningCellsInstalled.service }),
          ...(verification === undefined ? {} : { verificationStatus: () => verification.status() }),
          ...(projectManagement === undefined ? {} : { posture: () => projectManagement.posture() }),
        });

  /*
   * UX-B §28/§72/SC-9: the ONE-REQUEST CROSS-PROJECT collaboration composition.
   *
   * It is composed ONLY from wiring that already exists here, and it owns nothing:
   *
   *   projectPeerDirectory → the read-only project↔peer deployment binding (§7/§8)
   *   federation           → the EXISTING sendMessage/thread/inbox/acknowledge (§4)
   *   collaboration        → the EXISTING local collaboration the REMOTE principal
   *                          may answer with (§52) — never re-implemented
   *
   * The minimum wiring is federation + a project directory: without a directory
   * there is no way to turn a project NAME into an address, so `crossProject` is
   * simply ABSENT and the product answers `surface_absent` (the same rule every
   * other optional face follows — never a stub and never a guess).
   */
  const crossProject: CrossProjectService | undefined =
    options.projectPeerDirectory === undefined || options.localPeer === undefined || federation === undefined
      ? undefined
      : makeCrossProjectService({
          projectId: options.projectId,
          localPeer: options.localPeer,
          clock: options.clock ?? (() => new Date().toISOString()),
          directory: options.projectPeerDirectory,
          federation,
          ...(collaboration === undefined ? {} : { collaboration }),
        });

  const application = makePalimpsestApplicationSurface({
    controller,
    ...(options.localPeer === undefined ? {} : { localPeer: options.localPeer }),
    ...(federation === undefined ? {} : { federation }),
    ...(boundaryMemory === undefined ? {} : { boundary: boundaryMemory.service }),
    ...(runtimeScopes === undefined ? {} : { runtimeScopes: { store: runtimeScopes.store, service: runtimeScopes.service } }),
    ...(options.organizationStore === undefined ? {} : { organizations: options.organizationStore }),
    ...(institution === undefined ? {} : { institution: { store: institution.store, service: institution.service } }),
    ...(campaign === undefined ? {} : { campaign: campaign.campaign, campaignStore: campaign.store }),
    ...(organizationDynamics === undefined ? {} : { dynamics: organizationDynamics.service }),
    ...(organizationEvolutionInstalled === undefined ? {} : { organizationEvolution: organizationEvolutionInstalled.service }),
    ...(runtimeEvolutionInstalled === undefined ? {} : { runtimeEvolution: runtimeEvolutionInstalled.service }),
    ...(reasoningCellsInstalled === undefined ? {} : { reasoning: reasoningCellsInstalled.service }),
    ...(options.organizationDynamicsPolicy === undefined ? {} : { dynamicsPolicy: options.organizationDynamicsPolicy }),
    ...(attention === undefined ? {} : { attention }),
    ...(organizationMemory === undefined ? {} : { organizationMemory }),
    // G10-S: the recipe catalog is wired only when the recipe layer is actually composed, so a bare
    // Work-only install keeps exactly the nine Work tools (the registry itself stays on the install).
    ...(advisor === undefined && recipeExecution === undefined ? {} : { recipes: recipeRegistry }),
    ...(advisor === undefined ? {} : { advisor }),
    ...(recipeExecution === undefined || recipeExecutionStatus === undefined
      ? {}
      : { recipeExecution: { service: recipeExecution, status: recipeExecutionStatus } }),
    // UX-A §3/§22: the UNTRUSTED profiler seam is now actually SUPPLIED, so
    // `advisor.profile({ task })` profiles a sentence instead of returning nine
    // UNKNOWN features. Absent ⇒ the deterministic first-party profiler above.
    taskProfiler,
    // UX-A §16: the one-request collaboration face. ABSENT ⇒ no such surface,
    // never a stub (the G10-AC-R §11 lesson: a declared-but-uncomposed face is a 501).
    ...(collaboration === undefined ? {} : { collaboration }),
    // UX-B §28: the cross-project face over the SAME composed federation. ABSENT ⇒
    // no such surface, never a stub (the G10-AC-R §11 lesson).
    ...(crossProject === undefined ? {} : { crossProject }),
    ...(options.remoteTransport === undefined ? {} : { remoteTransport: options.remoteTransport }),
    ...(proof === undefined ? {} : { proof }),
    ...(proofExtraction === undefined ? {} : { proofExtraction }),
    ...(disclosure === undefined ? {} : { disclosure }),
    ...(projectWorkspace === undefined ? {} : { projectWorkspace }),
    ...(projectManagement === undefined ? {} : { projectManagement }),
    ...(monitor === undefined ? {} : { monitor }),
    // G10-AD §22/§23: the project-head verification face over the SAME composed runtime.
    ...(verification === undefined ? {} : { verification: { service: verification.service } }),
    // G10-AE §28: the external-asset bridge face. Absent ⇒ the surface (and its HTTP
    // routes) are absent with a truthful 501 `surface_absent`, never a fabricated
    // empty provider list. The operator-explicit commit/approve verbs live HERE (the
    // composed application face) and never on the agent tool face.
    ...(externalAssets === undefined ? {} : { externalAssets }),
    ...(options.boundaryMemoryStore === undefined || boundaryMemory === undefined
      ? {}
      : {
          boundaryWorkspaces: {
            list: async () => {
              const definitions = await options.boundaryMemoryStore!.workspaces();
              const listed: { workspaceId: string; participants: readonly PeerRef[]; acceptedArtifacts: number }[] = [];
              for (const definition of definitions) {
                const view = await boundaryMemory!.service.workspaceView({ workspaceId: definition.workspaceId });
                listed.push({ workspaceId: definition.workspaceId, participants: definition.participants, acceptedArtifacts: view.artifacts.filter((artifact) => artifact.current !== null).length });
              }
              return listed;
            },
          },
        }),
  });
  const hasAdvancedSurface =
    application.federation !== undefined ||
    application.boundary !== undefined ||
    application.runtime !== undefined ||
    application.organization !== undefined ||
    application.campaign !== undefined ||
    application.dynamics !== undefined ||
    application.evolution !== undefined ||
    application.reasoning !== undefined ||
    application.attention !== undefined ||
    application.empirical !== undefined ||
    application.recipes !== undefined ||
    application.advisor !== undefined ||
    application.recipeExecution !== undefined ||
    // UX-A §17: a collaboration-only deployment still gets its tool face, so
    // `palimpsest_collaborate` is composed exactly when the service is.
    application.collaboration !== undefined ||
    // UX-B §29: a cross-project-only deployment still gets its tool face, so
    // `palimpsest_cross_project` is composed exactly when the service is.
    application.crossProject !== undefined ||
    application.proof !== undefined ||
    application.disclosure !== undefined ||
    application.projectWorkspace !== undefined ||
    application.projectManagement !== undefined ||
    // G10-AE: an external-library-only deployment still gets its (read/prepare) tool
    // face, so `palimpsest_external_assets` is composed exactly when the bridge is.
    application.externalAssets !== undefined ||
    application.projections !== undefined;
  const tools = [...baseTools, ...(hasAdvancedSurface ? defineApplicationTools(application) : [])];

  // §12/§14: registration and disposal are one explicit lifecycle composition, so the
  // ownership rules live in one reviewable place (`src/composition/lifecycle.ts`).
  const lifecycle = composeInstalledLifecycle({
    context,
    tools,
    controller,
    store,
    effects,
    ...(monitor === undefined ? {} : { monitor }),
    ownedResources: Object.freeze([
      // G10-R: closed because this install wired it into the application surface.
      ...(options.organizationMemoryStore === undefined
        ? []
        : [{ what: "organizationMemoryStore", ownership: "CALLER_SUPPLIED_INSTALL_MANAGED_LEGACY" as const, close: () => options.organizationMemoryStore?.close() }]),
      // UX-C §9/SC-4: only when ownership was made explicit; a deployment-owned store keeps its own lifetime.
      ...(options.reasoningCellStoreOwned === true
        ? [{ what: "reasoningCellStore", ownership: "INSTALL_CREATED_AND_MANAGED" as const, close: () => options.reasoningCellStore?.close() }]
        : []),
      // G10-T: the authoritative proof store, when one was supplied.
      ...(options.proofEvidenceStore === undefined
        ? []
        : [{ what: "proofEvidenceStore", ownership: "CALLER_SUPPLIED_INSTALL_MANAGED_LEGACY" as const, close: () => options.proofEvidenceStore?.close() }]),
      // G10-V: the narrowly-owned workspace/management stores, when supplied.
      ...(options.projectAssociationStore === undefined
        ? []
        : [{ what: "projectAssociationStore", ownership: "CALLER_SUPPLIED_INSTALL_MANAGED_LEGACY" as const, close: () => options.projectAssociationStore?.close() }]),
      ...(options.projectJournalStore === undefined
        ? []
        : [{ what: "projectJournalStore", ownership: "CALLER_SUPPLIED_INSTALL_MANAGED_LEGACY" as const, close: () => options.projectJournalStore?.close() }]),
      ...(options.managementPreferenceStore === undefined
        ? []
        : [{ what: "managementPreferenceStore", ownership: "CALLER_SUPPLIED_INSTALL_MANAGED_LEGACY" as const, close: () => options.managementPreferenceStore?.close() }]),
      // G10-AD §29: the deployment-local verification HISTORY store, only when this install created it.
      ...(verificationStoreCreated && projectVerificationStore !== undefined
        ? [{ what: "projectVerificationStore", ownership: "INSTALL_CREATED_AND_MANAGED" as const, close: () => projectVerificationStore?.close() }]
        : []),
      // G10-AE §17: the deployment-local bridge history store, same discipline.
      ...(externalAssetBridgeStoreCreated && externalAssetBridgeStore !== undefined
        ? [{ what: "externalAssetBridgeStore", ownership: "INSTALL_CREATED_AND_MANAGED" as const, close: () => externalAssetBridgeStore?.close() }]
        : []),
    ]),
  });

  return {
    controller,
    application,
    tools,
    ...(runtime === undefined ? {} : { runtime }),
    ...(federation === undefined ? {} : { federation }),
    ...(organization === undefined ? {} : { organization }),
    ...(institution === undefined ? {} : { institution }),
    ...(campaign === undefined ? {} : { campaign }),
    ...(runtimeScopes === undefined ? {} : { runtimeScopes }),
    ...(holons === undefined ? {} : { holons }),
    ...(organizationDynamics === undefined ? {} : { organizationDynamics }),
    ...(organizationEvolutionInstalled === undefined ? {} : { organizationEvolution: organizationEvolutionInstalled }),
    ...(runtimeEvolutionInstalled === undefined ? {} : { runtimeEvolution: runtimeEvolutionInstalled }),
    ...(reasoningCellsInstalled === undefined ? {} : { reasoningCells: reasoningCellsInstalled }),
    ...(boundaryMemory === undefined ? {} : { boundaryMemory }),
    ...(federatedBoundaryMemory === undefined ? {} : { federatedBoundaryMemory }),
    ...(boundaryHome === undefined ? {} : { boundaryHome }),
    ...(attention === undefined ? {} : { attention }),
    ...(organizationMemory === undefined ? {} : { organizationMemory }),
    ...(organizationMemory === undefined ? {} : { evaluation: { evaluate } }),
    recipes: recipeRegistry,
    ...(advisor === undefined ? {} : { advisor }),
    ...(recipeExecution === undefined ? {} : { recipeExecution }),
    ...(collaboration === undefined ? {} : { collaboration }),
    ...(crossProject === undefined ? {} : { crossProject }),
    ...(options.attentionActivation === undefined ? {} : { attentionActivation: options.attentionActivation }),
    ...(proof === undefined ? {} : { proof }),
    ...(proofExtraction === undefined ? {} : { proofExtraction }),
    ...(disclosure === undefined ? {} : { disclosure }),
    ...(projectWorkspace === undefined ? {} : { projectWorkspace }),
    ...(projectManagement === undefined ? {} : { projectManagement }),
    ...(operatingStores === undefined ? {} : { projectOperating: operatingStores }),
    ...(verification === undefined ? {} : { verification }),
    ...(monitor === undefined ? {} : { monitor }),
    ...(externalAssets === undefined ? {} : { externalAssets }),
    register: lifecycle.register,
    dispose: () => lifecycle.dispose(),
  };
}
