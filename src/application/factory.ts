/**
 * SR-1D R2 §10/§13 — the aggregate application-surface factory.
 *
 * It owns the two aggregate types a caller sees (`ApplicationSurfaceDeps`,
 * `PalimpsestApplicationSurface`) and composes the eight per-capability clusters. It is
 * deliberately shallow: no capability logic lives here, only the assembly.
 */

import { makeWorkSurfaces } from "./surfaces/work.js";
import type { WorkApplicationSurface } from "./surfaces/work.js";
import { makeProductSurfaces } from "./surfaces/product.js";
import type { CollaborationApplicationSurface, CrossProjectApplicationSurface, DelegationApplicationSurface } from "./surfaces/product.js";
import { makeFederationSurfaces } from "./surfaces/federation.js";
import type { FederationApplicationSurface, BoundaryApplicationSurface, AttentionApplicationSurface, RemoteSubmissionPort } from "./surfaces/federation.js";
import { makeCognitionSurfaces } from "./surfaces/cognition.js";
import type { ReasoningApplicationSurface, EmpiricalApplicationSurface, RecipesApplicationSurface, AdvisorApplicationSurface, RecipeExecutionApplicationSurface, RecipeExecutionStatus } from "./surfaces/cognition.js";
import { makeProofSurfaces } from "./surfaces/proof.js";
import type { ProofApplicationSurface, DisclosureApplicationSurface } from "./surfaces/proof.js";
import { makeProjectSurfaces } from "./surfaces/project.js";
import type { ProjectWorkspaceApplicationSurface, ProjectManagementApplicationSurface, MonitorApplicationSurface, VerificationApplicationSurface, ExternalAssetsApplicationSurface } from "./surfaces/project.js";
import { makeOrganizationSurfaces } from "./surfaces/organization.js";
import type { RuntimeApplicationSurface, OrganizationApplicationSurface, CampaignApplicationSurface, DynamicsApplicationSurface, EvolutionApplicationSurface } from "./surfaces/organization.js";
import { makeProjectionsSurfaces } from "./surfaces/projections.js";
import type { ProjectionsApplicationSurface, BoundaryWorkspaceReadPort } from "./surfaces/projections.js";

import type { OrganizationDynamicsService, DynamicsPolicy } from "../organization_dynamics/index.js";
import type { OrganizationEvolutionService } from "../organization_evolution/index.js";
import type { RuntimeEvolutionService } from "../runtime_evolution/index.js";
import type { RuntimeScopeService, RuntimeScopeStore } from "../runtime_scope/index.js";
import type { BoundaryMemoryService } from "../boundary_memory/index.js";
import type { FederationService } from "../federation/index.js";
import type { AttentionService } from "../attention/index.js";
import type { CampaignService } from "../campaign/index.js";
import type { CampaignStore } from "../campaign/store.js";
import type { OrganizationStore } from "../organization/index.js";
import type { InstitutionService, InstitutionStore } from "../institution/index.js";
import type { ReasoningCellService } from "../reasoning_cell/index.js";
import type { DisclosureService, EvidenceExtractionService, ProofEvidenceService } from "../proof_asset/index.js";
import type { CollaborationService } from "../interaction/collaboration.js";
import type { CrossProjectService } from "../interaction/cross_project.js";
import type { DelegationService } from "../interaction/delegation.js";
import type { OrganizationMemoryService } from "../organization_memory/index.js";
import type { RecipeRegistry } from "../recipes/registry.js";
import type { RecipeExecutionService } from "../recipes/execution.js";
import type { EmpiricalArchitectureAdvisor } from "../advisor/advisor.js";
import type { TaskProfilerPort } from "../advisor/task_profile.js";
import type { PeerRef } from "../federation/peer.js";
import type { ProjectController } from "../tools/controller.js";
import type { HostDeploymentFactsPort } from "./common.js";
import type { ProjectWorkspaceService } from "../project_workspace/index.js";
import type { ProjectManagementService } from "../project_management/index.js";
import type { CampaignMonitorStatus, CampaignMonitorTickResult } from "../monitor/index.js";
import type { ProjectVerificationService } from "../project_verification/index.js";

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
  /**
   * UX-A §16 (additive): one-request local multi-agent collaboration. ABSENT ⇒ this
   * deployment has no collaboration surface at all — never a stub (the same rule
   * the verification/externalAssets faces follow).
   */
  readonly collaboration?: CollaborationApplicationSurface | undefined;
  /**
   * UX-B §28/SC-15 (additive): one-request CROSS-PROJECT collaboration. ABSENT ⇒
   * this deployment has no project directory or no federation, so the face is
   * absent rather than stubbed (the same rule every optional face follows).
   */
  readonly crossProject?: CrossProjectApplicationSurface | undefined;
  /**
   * PLMP-LEAN-1 §C.14 (additive): RESEARCH delegation (D1) — the ASYNC sibling of `collaboration`.
   * ABSENT ⇒ this deployment has no reasoning store, no repository to snapshot or no async branch
   * host, so the face is absent rather than stubbed (the same rule every optional face follows).
   */
  readonly delegation?: DelegationApplicationSurface | undefined;
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
  /** G10-AC (additive): read-only long-horizon monitor status and preview. */
  readonly monitor?: MonitorApplicationSurface | undefined;
  /** G10-AD (additive): project-head verification status/history/request. */
  readonly verification?: VerificationApplicationSurface | undefined;
  /**
   * G10-AE §28 (additive): the External Asset Library bridge. ABSENT ⇒ this
   * deployment has no external library at all — never a stub and never an empty
   * "known" list (the HTTP face answers `501 surface_absent`, exactly as it does
   * for the verification face).
   */
  readonly externalAssets?: ExternalAssetsApplicationSurface | undefined;
}


export interface ApplicationSurfaceDeps {
  readonly controller: ProjectController;
  /**
   * Host facts about the RUNNING deployment (the dashboard url). Optional: an installation with no
   * dashboard and no host wiring simply has none, which the work face reports as null.
   */
  readonly hostFacts?: HostDeploymentFactsPort | undefined;
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
  /**
   * UX-A §16 (additive): the composed one-request collaboration service. ABSENT ⇒
   * `application.collaboration` (and `palimpsest_collaborate`) are absent — the
   * surface is never a stub, so a deployment without the recipe layer answers
   * `surface_absent` rather than pretending to collaborate.
   */
  readonly collaboration?: CollaborationService | undefined;
  /**
   * UX-B §28/SC-15 (additive): the composed cross-project service. ABSENT ⇒
   * `application.crossProject` (and `palimpsest_cross_project`) are absent — the
   * face is never a stub, so a deployment without a project directory answers
   * `surface_absent` rather than pretending it can reach another project.
   */
  readonly crossProject?: CrossProjectService | undefined;
  /**
   * PLMP-LEAN-1 §C.14 (additive): the composed RESEARCH delegation runtime. ABSENT ⇒
   * `application.delegation` (and `palimpsest_delegate`) are absent — the surface is never a stub, so
   * a deployment with no reasoning store or no async branch host answers `surface_absent` rather than
   * pretending it can research something in the background.
   */
  readonly delegation?: DelegationService | undefined;
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
  /** G10-AC: the composed Campaign monitor driver, when the operator wired one. */
  readonly monitor?: {
    status(): Promise<CampaignMonitorStatus>;
    previewTick(): Promise<CampaignMonitorTickResult>;
  } | undefined;
  /**
   * G10-AD §22/§29: the composed Project Verification runtime. Absent ⇒ the
   * verification surface is absent (a 501, never a stub). The structural `Pick`
   * means the real `ProjectVerificationService` is passed straight through.
   */
  readonly verification?: {
    readonly service: Pick<
      ProjectVerificationService,
      "status" | "history" | "verifyCurrentHead" | "verifyAttemptResult"
    >;
  } | undefined;
  /**
   * G10-AE §28/§29: the composed External Asset Library bridge. Absent ⇒ the
   * `externalAssets` surface is absent (a 501, never a fabricated empty list). The
   * structural type is the plane's own read/prepare/commit/approve face, so the
   * installed bridge is passed straight through — this surface adds no logic, no
   * bypass and no second approval path.
   */
  readonly externalAssets?: ExternalAssetsApplicationSurface | undefined;
}


export function makePalimpsestApplicationSurface(deps: ApplicationSurfaceDeps): PalimpsestApplicationSurface {
  const workCluster = makeWorkSurfaces(deps);
  const productCluster = makeProductSurfaces(deps);
  const federationCluster = makeFederationSurfaces(deps);
  const cognitionCluster = makeCognitionSurfaces(deps);
  const proofCluster = makeProofSurfaces(deps);
  const projectCluster = makeProjectSurfaces(deps);
  const organizationCluster = makeOrganizationSurfaces(deps);
  const projectionsCluster = makeProjectionsSurfaces(deps);
  const { work } = workCluster;
  const { collaboration, crossProject, delegation } = productCluster;
  const { federation, boundary, attention } = federationCluster;
  const { reasoning, empirical, recipes, advisor, recipeExecution } = cognitionCluster;
  const { proof, disclosure } = proofCluster;
  const { projectWorkspace, projectManagement, monitor, verification, externalAssets } = projectCluster;
  const { runtime, organization, campaign, dynamics, evolution } = organizationCluster;
  const { projections } = projectionsCluster;

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
    ...(collaboration === undefined ? {} : { collaboration }),
    // UX-B §28/SC-15: mapped here, not merely declared. The monitor 501 bug
    // documented above `const monitor` is the reason this line ships WITH the face.
    ...(crossProject === undefined ? {} : { crossProject }),
    ...(delegation === undefined ? {} : { delegation }),
    ...(proof === undefined ? {} : { proof }),
    ...(disclosure === undefined ? {} : { disclosure }),
    ...(projectWorkspace === undefined ? {} : { projectWorkspace }),
    ...(projectManagement === undefined ? {} : { projectManagement }),
    ...(monitor === undefined ? {} : { monitor }),
    ...(verification === undefined ? {} : { verification }),
    ...(externalAssets === undefined ? {} : { externalAssets }),
    ...(deps.boundaryWorkspaces === undefined && deps.organizations === undefined && deps.runtimeScopes === undefined && deps.reasoning === undefined ? {} : { projections }),
  };
}
