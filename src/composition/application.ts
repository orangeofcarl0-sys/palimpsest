/**
 * SR-1C §20 — the APPLICATION assembly.
 *
 * This is the last thing `installPalimpsest` used to do by hand: turn the composed capability
 * groups into the aggregate `PalimpsestApplicationSurface`, decide whether an ADVANCED surface
 * exists at all, and assemble the tool set (the legacy Work tools plus the agent-facing
 * application tools when that surface is present).
 *
 * COMPOSITION ONLY. Its input is the composed GROUPS plus the few option fields the assembly
 * itself reads — never the options bag (§34). It decides no capability: a capability that was
 * not composed is simply absent here, and absence stays absence (§15) — the surface never gets
 * a stub, which is why `hasAdvancedSurface` derives the tool set from what actually exists.
 */
import type { PeerRef } from "../federation/index.js";
import type { CrossProjectService } from "../interaction/cross_project.js";
import type { CollaborationService } from "../interaction/collaboration.js";
import type { PalimpsestApplicationSurface } from "../application/surface.js";
import { makePalimpsestApplicationSurface } from "../application/surface.js";
import { defineApplicationTools } from "../tools/application_tools.js";
import type { DshToolDefinition } from "../tools/dsh_types.js";
import type { ProjectController } from "../tools/controller.js";
import type { CollaborationComposition } from "./collaboration.js";
import type { CognitionComposition } from "./cognition.js";
import type { OrganizationComposition } from "./organization.js";
import type { GovernanceComposition } from "./governance.js";
import type { InstallPalimpsestOptions } from "./install_contract.js";
/** The composed groups this assembly consumes. */
export interface ApplicationAssemblyInput {
  readonly controller: ProjectController;
  readonly baseTools: readonly DshToolDefinition[];
  readonly collaboration: CollaborationComposition;
  readonly organization: OrganizationComposition;
  readonly cognition: CognitionComposition;
  readonly governance: GovernanceComposition;
  /** The UX-A / UX-B services, composed after the groups. */
  readonly collaborationService: CollaborationService | undefined;
  readonly crossProjectService: CrossProjectService | undefined;
  /** Exactly the option fields the assembly reads. */
  readonly assemblyOptions: ApplicationAssemblyOptions;
}

export type ApplicationAssemblyOptions = Pick<
  InstallPalimpsestOptions,
  | "localPeer"
  | "organizationStore"
  | "organizationDynamicsPolicy"
  | "remoteTransport"
  | "boundaryMemoryStore"
  | "proofEvidenceStore"
  | "reasoningCellStore"
  | "attentionActivation"
>;

/** What the assembly produced. */
export interface ApplicationAssembly {
  readonly application: PalimpsestApplicationSurface;
  readonly hasAdvancedSurface: boolean;
  readonly tools: readonly DshToolDefinition[];
}
export function composeApplicationAssembly(input: ApplicationAssemblyInput): ApplicationAssembly {
  const {
    proof,
    disclosure,
    campaignEvidence,
    runtime,
    boundaryMemory,
    boundaryHome,
    federatedBoundaryMemory,
    federation,
    campaignInstitutionSource,
    campaign,
  } = input.collaboration;
  const { organization, institution, runtimeScopes, holons, organizationDynamics, organizationEvolutionInstalled, runtimeEvolutionInstalled, reasoningCellsInstalled } = input.organization;
  const { proofExtraction, organizationMemory, recipeRegistry, taskProfiler, verificationWiring, liveVerification, advisor, recipeExecution, recipeExecutionStatus, attention, externalAssetsRef, projectWorkspace } = input.cognition;
  const { verification, externalAssets, projectManagement, operatingStores, monitor } = input.governance;
  const { controller, baseTools, collaborationService, crossProjectService, assemblyOptions } = input;
  void campaignEvidence;
  void boundaryHome;
  void federatedBoundaryMemory;
  void campaignInstitutionSource;
  void holons;
  void organizationDynamics;
  void organizationEvolutionInstalled;
  void runtimeEvolutionInstalled;
  void reasoningCellsInstalled;
  void proofExtraction;
  void taskProfiler;
  void verificationWiring;
  void liveVerification;
  void recipeExecutionStatus;
  void externalAssetsRef;

  const application = makePalimpsestApplicationSurface({
    controller,
    ...(assemblyOptions.localPeer === undefined ? {} : { localPeer: assemblyOptions.localPeer }),
    ...(federation === undefined ? {} : { federation }),
    ...(boundaryMemory === undefined ? {} : { boundary: boundaryMemory.service }),
    ...(runtimeScopes === undefined ? {} : { runtimeScopes: { store: runtimeScopes.store, service: runtimeScopes.service } }),
    ...(assemblyOptions.organizationStore === undefined ? {} : { organizations: assemblyOptions.organizationStore }),
    ...(institution === undefined ? {} : { institution: { store: institution.store, service: institution.service } }),
    ...(campaign === undefined ? {} : { campaign: campaign.campaign, campaignStore: campaign.store }),
    ...(organizationDynamics === undefined ? {} : { dynamics: organizationDynamics.service }),
    ...(organizationEvolutionInstalled === undefined ? {} : { organizationEvolution: organizationEvolutionInstalled.service }),
    ...(runtimeEvolutionInstalled === undefined ? {} : { runtimeEvolution: runtimeEvolutionInstalled.service }),
    ...(reasoningCellsInstalled === undefined ? {} : { reasoning: reasoningCellsInstalled.service }),
    ...(assemblyOptions.organizationDynamicsPolicy === undefined ? {} : { dynamicsPolicy: assemblyOptions.organizationDynamicsPolicy }),
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
    ...(collaborationService === undefined ? {} : { collaboration: collaborationService }),
    // UX-B §28: the cross-project face over the SAME composed federation. ABSENT ⇒
    // no such surface, never a stub (the G10-AC-R §11 lesson).
    ...(crossProjectService === undefined ? {} : { crossProject: crossProjectService }),
    ...(assemblyOptions.remoteTransport === undefined ? {} : { remoteTransport: assemblyOptions.remoteTransport }),
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
    ...(assemblyOptions.boundaryMemoryStore === undefined || boundaryMemory === undefined
      ? {}
      : {
          boundaryWorkspaces: {
            list: async () => {
              const definitions = await assemblyOptions.boundaryMemoryStore!.workspaces();
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

  return { application, hasAdvancedSurface, tools };
}
