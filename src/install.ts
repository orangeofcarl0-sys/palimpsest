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
import { composeApplicationAssembly } from "./composition/application.js";
import { composeCognitionCapabilities } from "./composition/cognition.js";
import { composeGovernanceCapabilities } from "./composition/governance.js";
import { composeInstalledLifecycle } from "./composition/lifecycle.js";
import type { DshPluginContext } from "./tools/dsh_types.js";
import { evaluate } from "./experiment/index.js";
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
    execution: options.execution,
    standard: options.standard,
    /**
     * PLMP-LEAN-1 §2.1 / 2A-Q: this is the only place that knows whether a verifier is composed, so
     * it is where the capability is stated. Readiness then reports it honestly rather than guessing,
     * and a task requiring independent verification is told the truth before the work starts.
     */
    capabilities: options.capabilities ?? {
      independentVerifierAvailable: options.projectVerificationStore !== undefined,
      sandboxSpawnVerified: options.repository !== undefined && options.repository !== "",
    },
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

  // §20: the aggregate surface and the tool set are assembled from the composed groups; this
  // file no longer knows which capability faces exist.
  const assembly = composeApplicationAssembly({
    controller,
    baseTools,
    collaboration: collaborationCluster,
    organization: organizationCluster,
    cognition,
    governance,
    collaborationService: collaboration,
    crossProjectService: crossProject,
    assemblyOptions: options,
  });
  const { application, tools } = assembly;


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
