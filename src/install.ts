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
import { composeDelegationCapability } from "./composition/delegation.js";
import { composeContinuationCapability } from "./composition/continuation.js";
import { composeContextKnowledgePorts } from "./composition/context_knowledge.js";
import { composeProjectIntentCapability } from "./composition/project_intent.js";
import { composeProjectCollaborationCapability } from "./composition/project_collaboration.js";
import { composeInstitutionalLearningCapability } from "./composition/institutional_learning.js";
import { composeProcedureCapability } from "./composition/procedures.js";
import { composeExecutionAssociationCluster, type ExecutionAssociationInstallOptions, type ExecutionAssociationInstallResult } from "./composition/execution_association.js";
import type { InstallPalimpsestOptions, InstalledPalimpsest } from "./composition/install_contract.js";
export { defaultAllocateActivationId, trustedDefaultPolicy };

// SR-1C §14: the public install contracts live in their own module; re-exported so every
// existing import path keeps working.
export * from "./composition/install_contract.js";

/**
 * Trajectory-P2-C §7.7: the install OPTIONS and RESULT are widened HERE rather than in
 * `install_contract.ts`, which sits at its recorded §22 hotspot ceiling (700 LOC). Adding two `extends`
 * clauses pushed it over; the correct response to a size ratchet is to keep the aggregate contract at its
 * ceiling and attach the new cohesive contract at the point of use, which is what these aliases do.
 */
export type PalimpsestInstallOptions = InstallPalimpsestOptions & ExecutionAssociationInstallOptions;
export type InstalledPalimpsestWithTrajectory = InstalledPalimpsest & ExecutionAssociationInstallResult;

export function installPalimpsest(
  context: DshPluginContext,
  options: PalimpsestInstallOptions,
): InstalledPalimpsestWithTrajectory {
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
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    standard: options.standard,
    /**
     * PLMP-LEAN-1 §2.1 / 2A-Q + §D2-LIVE: what this deployment can actually do.
     *
     * An explicit caller assertion is passed through untouched. Otherwise this stays UNSET here on
     * purpose: whether a verifier is composed is decided further down, by the cluster that composes
     * the verification runtime, and it is bound back through `core.verificationCapabilities`.
     *
     * It used to be guessed HERE from `options.projectVerificationStore !== undefined`, which is a
     * statement about how verification was REQUESTED rather than about what was COMPOSED — and on the
     * packaged path the store is not passed but CREATED, so the guess was `false` on a deployment that
     * verifies attempt results correctly. Readiness then reported `DEGRADED` and every boundary task
     * was refused with `ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE` (measured by the D2 live gate).
     */
    ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
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
    verificationAdmission: core.verificationAdmission,
    // §D2-LIVE: the cluster that COMPOSES the verification runtime states what it composed, so the
    // controller's capability is a fact about the deployment rather than a guess from its options.
    verificationCapabilities: core.verificationCapabilities,
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

  /*
   * PLMP-LEAN-1 §C.11–§C.14 (D1-e): the RESEARCH delegation composition.
   *
   * It is the ASYNC sibling of the collaboration service above: the SAME cognition backend, the SAME
   * settlement path, a different interaction lifecycle. The cluster decides for itself whether this
   * deployment can truthfully delegate (a reasoning store, a repository and an async branch host) and
   * composes nothing otherwise, so absence here stays absence.
   */
  const delegation = composeDelegationCapability({
    options,
    reasoning: reasoningCellsInstalled?.service,
  });

  /*
   * Trajectory-P2-C §7: THE EXECUTION-ASSOCIATION CLUSTER.
   *
   * ONE composition module owns the whole of P2-C's wiring — the host-derived Work Worker Port, the
   * durable store, the trusted recorder, the source-verifying qualifier, the official DSH reader and the
   * read-only attributed Preview. Keeping it in `src/composition/` is what lets this file remain a
   * COMPOSITION ROOT (§25 A03): bounded fan-out, no direct capability-family imports.
   *
   * It is composed BEFORE the continuation cluster because the delegation service consumes its recorder.
   * §7.2: composing it starts NOTHING — no worker, no attempt, no model, no continuation.
   */
  const executionAssociationCluster = composeExecutionAssociationCluster({
    options: {
      projectId: options.projectId,
      databasePath: options.databasePath,
      workWorkerBin: options.workWorkerBin,
      workWorkerProfile: options.workWorkerProfile,
      workWorkerTimeoutMs: options.workWorkerTimeoutMs,
      executionAssociationSourceKind: options.executionAssociationSourceKind,
      dshHomePath: options.dshHomePath,
      dshSessionsRoot: options.dshSessionsRoot,
      sessionReaderModule: options.sessionReaderModule,
      workWorkerPort: options.workWorkerPort,
      ...(options.historicalEpochs === undefined ? {} : { historicalEpochs: options.historicalEpochs }),
      /**
       * Trajectory-P2-D1 §11.5: the EXPERIMENTAL Attempt-bound delivery, DEFAULT OFF. Passed through only
       * when the deployment enabled it, so a default deployment composes exactly what it did before.
       */
      ...(options.experimentalTrajectoryContextDelivery === undefined ? {} : { experimentalTrajectoryContextDelivery: options.experimentalTrajectoryContextDelivery }),
      ...(options.trajectoryCapsuleMaxSerializedBytes === undefined ? {} : { trajectoryCapsuleMaxSerializedBytes: options.trajectoryCapsuleMaxSerializedBytes }),
      /** Trajectory-P2-D2 §7/§8: the experimental presentation ARM and section budget, DEFAULT OFF. */
      ...(options.trajectoryPresentationMode === undefined ? {} : { trajectoryPresentationMode: options.trajectoryPresentationMode }),
      ...(options.trajectorySectionMaxBytes === undefined ? {} : { trajectorySectionMaxBytes: options.trajectorySectionMaxBytes }),
      /**
       * P2-D0 §8.3: the cross-owner reads the T0 project-evolution projection consumes, so the attributed
       * Preview presents the real projection rather than an empty one. These are the SAME owners the V0
       * trajectory composition uses; an absent owner is reported by the projection's own basis vector.
       */
      trajectoryOwners: {
        reasoning: reasoningCellsInstalled?.service,
        proof,
        projectWorkspace,
        journalStore: options.projectJournalStore,
        associationStore: options.projectAssociationStore,
      },
    },
    store,
    controller,
  });
  const { workWorkerPortFactory, recorder: executionAssociationRecorder, sessionSourceQualification, trajectory } = executionAssociationCluster;

  /**
   * Trajectory-P2-D1 §11.5: bind the EXPERIMENTAL Attempt-bound Capsule delivery provider, when the
   * deployment enabled it. DEFAULT OFF: with the option absent or false, `trajectoryCapsuleDelivery` is
   * undefined and nothing is bound, so the worker context is byte-identical to production.
   */
  if (executionAssociationCluster.trajectoryCapsuleDelivery !== undefined) {
    core.trajectoryCapsuleDelivery.bind(executionAssociationCluster.trajectoryCapsuleDelivery);
    /**
     * P2-E1 §10.1: bind the TRUSTED ARM from the SAME frozen configuration. It is bound independently of the
     * provider so the Context Owner's error path reports the real arm (a CONTROL failure stays CONTROL) rather
     * than guessing one. `trajectoryPresentationMode` is trusted configuration the model cannot reach.
     */
    core.trajectoryAssignedArm.bind(options.trajectoryPresentationMode ?? "OFF");
  }

  /*
   * PLMP-LEAN-1 §D5-d: the PACKAGED RESULT CONTINUATION composition.
   *
   * It is composed AFTER the association cluster because the delegation service consumes its recorder,
   * and in the order the ruling fixed: core → governance/verification → work delegation → continuation.
   * The D3 authority stores it creates are closed by the install lifecycle via `ownedResources`.
   */
  const continuationCluster = composeContinuationCapability({
    options: {
      projectId: options.projectId,
      repository,
      databasePath: options.databasePath,
      ...(options.clock === undefined ? {} : { clock: options.clock }),
      workWorkerPort: workWorkerPortFactory,
      ...(executionAssociationRecorder === undefined ? {} : { sessionIdentityRecorder: executionAssociationRecorder }),
      sessionSourceQualification,
    },
    store,
    controller,
    worldBasisRuntime: core.worldBasisRuntime,
    worldObservation: core.worldObservation,
    worldsRoot: core.worldsRoot,
  });
  const { continuation, workDelegation } = continuationCluster;

  /*
   * E5-P §26/§27: the GOVERNED PROCEDURAL CAPITALIZATION surface.
   *
   * It turns durable empirical experience into a grounded candidate, requires an INDEPENDENT
   * authority to admit it, and keeps the admitted revision in its own append-only chain. It owns
   * procedural capital and NOTHING else: the authoring seam is the caller's
   * (`options.procedureAuthoring`), the authority is the caller's (`options.procedureAdmission`),
   * and it reaches no Work, effect, promotion, commitment, intent or organization authority.
   *
   * It is composed BEFORE the context-knowledge binding because the procedure owner is one of the
   * read capabilities that boundary adapts (E5-P §15).
   *
   * ABSENCE IS HONEST: without a durable store a procedure could not survive a restart and could
   * therefore never be inherited, so the face is simply absent rather than stubbed.
   */
  const procedureStore = options.procedureStore;
  const procedures = procedureStore === undefined
    ? undefined
    : composeProcedureCapability({
        projectId: options.projectId,
        store: procedureStore,
        organizationMemory,
        projectWorkspace,
        authoring: options.procedureAuthoring,
        admission: options.procedureAdmission,
        clock: options.clock,
      });

  /*
   * E1-K §10.2/§10.3: the CONTEXT-KNOWLEDGE composition.
   *
   * It is composed HERE because this is the first point at which all three knowledge owners exist:
   * the Proof plane (collaboration cluster), the Reasoning service (organization cluster) and the
   * ProjectWorkspace (cognition cluster). The ports are adapted by `src/composition/context_knowledge.ts`
   * — which holds NO policy — and bound ONCE through the core holder, whose read-through provider the
   * Context owner has held since birth.
   *
   * ABSENCE IS HONEST: when no knowledge owner is composed, `composeContextKnowledgePorts` returns
   * `undefined` and the binder is never called, so an explicit selection honestly refuses with
   * `KNOWLEDGE_CAPABILITY_UNAVAILABLE` rather than binding an empty capability.
   */
  const contextKnowledgePorts = composeContextKnowledgePorts({
    projectId: options.projectId,
    proof,
    reasoning: reasoningCellsInstalled?.service,
    projectWorkspace,
    // E5-P §15: the procedure owner is an ADDITIVE read capability of the SAME knowledge boundary.
    // Absent ⇒ a procedure selection honestly refuses rather than binding an empty capability.
    ...(procedures === undefined ? {} : { procedures }),
  });
  if (contextKnowledgePorts !== undefined) core.contextKnowledge.bind(contextKnowledgePorts);

  /*
   * E2-I §24/§30: the GOVERNED PROJECT INTENT surface.
   *
   * It composes from the SAME already-composed owners the knowledge bridge uses, plus the Work owner
   * (through the controller) that the revision is applied to. Absence is honest: with no workspace there
   * is no journal/association owner to ground a proposal in, so the surface is simply absent rather than
   * stubbed.
   *
   * The authority is the CALLER's, supplied through `options.projectIntentAdmission`. Nothing here
   * invents one — an absent authority means `apply` answers `authority_unresolved`.
   */
  const intent = composeProjectIntentCapability({
    projectId: options.projectId,
    controller,
    proof,
    reasoning: reasoningCellsInstalled?.service,
    projectWorkspace,
    admission: options.projectIntentAdmission,
    clock: options.clock,
  });

  /*
   * E3-C §30/§31: the PROJECT-GROUNDED COLLABORATION surface.
   *
   * It composes from the Work owner (to observe Project reality) and the EXISTING Federation service (to
   * declare a durable need). It owns no store, no peer identity, no Work and no authority — the admission
   * authority is the CALLER's, supplied through `options.projectCollaborationAdmission`, and the authoring
   * seam through `options.projectCollaborationAuthoring`.
   *
   * ABSENCE IS HONEST: without a Federation service there is no declaration owner, so the surface is
   * simply absent rather than stubbed.
   */
  const projectCollaboration = composeProjectCollaborationCapability({
    projectId: options.projectId,
    controller,
    federation,
    authoring: options.projectCollaborationAuthoring,
    admission: options.projectCollaborationAdmission,
    clock: options.clock,
  });

  /*
   * E4-L §24/§30: the GOVERNED INSTITUTIONAL LEARNING surface.
   *
   * It connects the EXISTING evolution histories to the EXISTING empirical memory: reconciliation projects
   * every ACTIVATED structural change into exactly one `InterventionRecord`, and the evaluation read joins
   * an intervention to the ordinary experiments that studied it.
   *
   * It owns NO store, NO Organization, NO RuntimeScope, NO DynamicsProposal and NO authority — it reads
   * evolution history and writes only through OrganizationMemory's own `recordIntervention`. ABSENCE IS
   * HONEST: without an evolution history or the memory owner there is nothing to connect, so the face is
   * simply absent rather than stubbed.
   */
  const institutionalLearning = composeInstitutionalLearningCapability({
    organizationEvolutionStore: options.organizationEvolutionStore,
    runtimeEvolutionStore: options.runtimeEvolutionStore,
    organizationMemory,
    clock: options.clock,
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
    delegationService: delegation,
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
      // §D3-a: the attempt world-basis store. This install created it whenever it composed the basis
      // runtime (a repository is present), so it closes it here with the other install-created stores.
      ...(core.worldBasisStore === undefined
        ? []
        : [{ what: "attemptWorldBasisStore", ownership: "INSTALL_CREATED_AND_MANAGED" as const, close: () => core.worldBasisStore?.close() }]),
      // §D5-d: the D3 authority stores the continuation composition created (observation records,
      // compatibility issuances, cross-basis admissions, derived candidates). There is deliberately no
      // continuation store: the service is a stateless orchestrator and owns nothing.
      ...continuationCluster.ownedResources,
      // Trajectory-P2-C §7.5: the execution-association store and the mounted DSH session reader. Both
      // were created by THIS install (unless the caller supplied its own store), so this install closes
      // them — after the controller and the log, in the recorded order.
      ...executionAssociationCluster.ownedResources,
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
    ...(delegation === undefined ? {} : { delegation }),
    ...(continuation === undefined ? {} : { continuation }),
    ...(options.attentionActivation === undefined ? {} : { attentionActivation: options.attentionActivation }),
    ...(proof === undefined ? {} : { proof }),
    ...(proofExtraction === undefined ? {} : { proofExtraction }),
    ...(disclosure === undefined ? {} : { disclosure }),
    ...(projectWorkspace === undefined ? {} : { projectWorkspace }),
    ...(intent === undefined ? {} : { intent }),
    ...(projectCollaboration === undefined ? {} : { projectCollaboration }),
    ...(institutionalLearning === undefined ? {} : { institutionalLearning }),
    ...(procedures === undefined ? {} : { procedures }),
    ...(projectManagement === undefined ? {} : { projectManagement }),
    ...(operatingStores === undefined ? {} : { projectOperating: operatingStores }),
    ...(verification === undefined ? {} : { verification }),
    ...(monitor === undefined ? {} : { monitor }),
    ...(externalAssets === undefined ? {} : { externalAssets }),
    // Trajectory-P2-C §7.7: the read-only attributed Preview surface, and the recorder the host wires.
    ...(trajectory === undefined ? {} : { trajectory }),
    ...(executionAssociationRecorder === undefined ? {} : { executionAssociationRecorder }),
    ...(executionAssociationCluster.qualifier === undefined ? {} : { executionAssociationQualifier: executionAssociationCluster.qualifier }),
    ...(workDelegation === undefined ? {} : { workDelegation }),
    register: lifecycle.register,
    dispose: () => lifecycle.dispose(),
  };
}
