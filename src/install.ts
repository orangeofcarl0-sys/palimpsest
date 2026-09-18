/**
 * installPalimpsest — the golden path (docs/01 §6, P2).
 *
 * One call wires the orchestration ledger, the shared Ordarium effects
 * runtime, the trusted policy, the controller and the seven tools into a
 * DSH host context. Defaults are zero-config and strong: `$DSH_HOME`
 * ledgers, a trusted-default policy (deny network, bounded attempts), and
 * the git CLI port rooted at the canonical repository.
 */

import { trustedDefaultPolicy, composeCore, defaultAllocateActivationId } from "./composition/core.js";
import { composeCollaborationCapabilities } from "./composition/collaboration.js";
import { composeOrganizationCapabilities } from "./composition/organization.js";
import { composeCognitionCapabilities } from "./composition/cognition.js";
import { composeGovernanceCapabilities } from "./composition/governance.js";
import { composeInstalledLifecycle } from "./composition/lifecycle.js";
import type { DshPluginContext } from "./tools/dsh_types.js";
import type { PeerRef } from "./federation/index.js";
import { evaluate } from "./experiment/index.js";
import { makePalimpsestApplicationSurface } from "./application/surface.js";
import { defineApplicationTools } from "./tools/application_tools.js";
import { makeCollaborationService, makeCrossProjectService } from "./interaction/index.js";
import type { CollaborationService, CrossProjectService } from "./interaction/index.js";
import type { InstallPalimpsestOptions, InstalledPalimpsest } from "./composition/install_contract.js";
export { defaultAllocateActivationId, trustedDefaultPolicy };

// SR-1C §14: the public install contracts live in their own module; re-exported so every
// existing import path keeps working.
export * from "./composition/install_contract.js";

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
  // §12/§15: the collaboration cluster (Proof/disclosure, runtime, boundary memory, federation,
  // campaign) composes itself from a narrow typed input.
  const collaborationCluster = composeCollaborationCapabilities({
    options,
    store,
    effects,
  });
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
  } = collaborationCluster;


  // G10-AC-R: `dispose()` is a no-op on a second call, so a host that disposes the
  // install twice (or disposes after the monitor already stopped) cannot
  // double-close the controller, stores or effects.

  // G10-F5 (§153): ADDITIVE organization/institution surfaces. Supplying no
  // organization/institution store changes nothing (§154); institution wiring
  // requires the organization store because an epoch references a body.
  // §12/§15: the organization cluster (organization/institution, runtime scopes + Holons,
  // dynamics, both evolution planes, reasoning-cell installation) composes itself.
  const organizationCluster = composeOrganizationCapabilities({
    options,
    store,
    proof,
    campaign,
    boundaryMemory,
  });
  const {
    organization,
    institution,
    runtimeScopes,
    holons,
    organizationDynamics,
    organizationEvolutionInstalled,
    runtimeEvolutionInstalled,
    reasoningCellsInstalled,
  } = organizationCluster;

  // §12/§15: the cognition/project cluster (evidence extraction, organization memory, recipes,
  // profiler, verification probe, advisor, recipe execution, attention, project workspace)
  // composes itself.
  const cognition = composeCognitionCapabilities({
    options,
    store,
    proof,
    federation,
    boundaryMemory,
    campaign,
    reasoningCellsInstalled,
    controller,
    campaignStore: options.campaignStore,
  });
  const {
    proofExtraction,
    organizationMemory,
    recipeRegistry,
    taskProfiler,
    verificationWiring,
    liveVerification,
    advisor,
    recipeExecution,
    recipeExecutionStatus,
    attention,
    externalAssetsRef,
    projectWorkspace,
  } = cognition;


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
  // §12/§15: the governance/project-management cluster (operating posture, project-head
  // verification, external-asset bridge, monitor, project management) composes itself from a
  // narrow typed input; this file only decides to compose it.
  const governance = composeGovernanceCapabilities({
    options,
    store,
    controller,
    effects,
    repository,
    git,
    projectWorkspace,
    campaign,
    recipeRegistry,
    recipeExecution,
    externalAssetsRef,
    verificationWiring,
    liveVerification,
  });
  const {
    verification,
    projectVerificationStore,
    verificationStoreCreated,
    externalAssets,
    externalAssetBridgeStore,
    externalAssetBridgeStoreCreated,
    projectManagement,
    operatingStores,
    monitor,
    monitorReady,
  } = governance;


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
