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
import { trustedDefaultPolicy, composeCore, defaultAllocateActivationId } from "./composition/core.js";
import { composeGovernanceCapabilities } from "./composition/governance.js";
import { composeInstalledLifecycle } from "./composition/lifecycle.js";
import { campaignActivityPort, campaignProjectRefPort, coordinationObservationPort, directManagementControl, externalImportViewOf } from "./composition/optional.js";
import type { DshPluginContext } from "./tools/dsh_types.js";
import { makeRuntimeRealizationService, observeAndCompileGroundedPlan, observeBindingState } from "./runtime/index.js";
import { makeParticipationService } from "./coordination/index.js";
import type { CommitmentScope, FederationService, PeerRef } from "./federation/index.js";
import { makeCommitmentService, makeFederationMessagingService, makeFederationService } from "./federation/index.js";
import type { AttentionService, BoundaryAcceptedHead, BoundaryAttentionReadPort, PendingBoundaryDecision } from "./attention/index.js";
import { makeAttentionService } from "./attention/index.js";
import { makeInstitutionService } from "./institution/index.js";
import type { CampaignEvidencePort } from "./campaign/index.js";
import { committedReconciliationOf, inFlightWake, makeCampaignProductionService, makeCampaignService, makeCompilerService, makeInterventionService, makeLifecycleService, makeNextActionAdmissionService, makeProspectiveService } from "./campaign/index.js";
import type { RuntimeScopeCampaignPort, RuntimeScopeOrganizationPort } from "./runtime_scope/index.js";
import { makeRuntimeScopeService } from "./runtime_scope/index.js";
import { makeOrganizationDynamicsService } from "./organization_dynamics/index.js";
import { makeOrganizationEvolutionService } from "./organization_evolution/index.js";
import { makeRuntimeEvolutionService } from "./runtime_evolution/index.js";
import { makeReasoningCellService } from "./reasoning_cell/index.js";
import type { OrganizationMemoryService } from "./organization_memory/index.js";
import { makeOrganizationMemoryService } from "./organization_memory/index.js";
import { evaluate } from "./experiment/index.js";
import type { RecipeRegistry } from "./recipes/registry.js";
import { builtinRecipeRegistry } from "./recipes/registry.js";
import type { RecipeExecutionService } from "./recipes/execution.js";
import { makeRecipeExecutionService } from "./recipes/execution.js";
import type { EmpiricalArchitectureAdvisor } from "./advisor/advisor.js";
import { makeEmpiricalArchitectureAdvisor } from "./advisor/advisor.js";
import { makePalimpsestApplicationSurface } from "./application/surface.js";
import { defineApplicationTools } from "./tools/application_tools.js";
import type { BoundaryHome } from "./boundary_memory/index.js";
import { makeBoundaryHome, makeBoundaryMemoryService, makeFederatedBoundaryClient } from "./boundary_memory/index.js";
import type { DisclosureService, EvidenceExtractionService, ProofEvidenceService } from "./proof_asset/index.js";
import { blobBackedSourceContentPort, localDisclosureExporter, makeDisclosureService, makeEvidenceExtractionService, makeProofEvidenceService, proofCampaignEvidencePort } from "./proof_asset/index.js";
import type { ProofSourceContentPort } from "./proof_asset/source_content_port.js";
import type { ProjectWorkspaceService, ProjectJournalEntry } from "./project_workspace/index.js";
import { makeProjectWorkspaceService } from "./project_workspace/index.js";
import type { ExternalAssetBridgeService, ExternalAssetProjectBasis } from "./external_assets/index.js";
import { SqliteExternalAssetBridgeStore, defineExternalAssetEffects, makeExternalAssetBridgeService, sqliteExternalAssetAssociationPort, sqliteExternalAssetJournalPort } from "./external_assets/index.js";
import type { ProjectManagementService } from "./project_management/index.js";
import { SqliteManagementActivityStore, SqliteWorkModePreferenceStore, withMonitorRuntimeCapability, linkedCampaignWakeEventSource } from "./project_operating/index.js";
import type { UserWorkModeControlPort, VerificationRuntimeCapabilityView } from "./project_operating/index.js";
import { deterministicTaskProfiler, makeCollaborationService, makeCrossProjectService } from "./interaction/index.js";
import type { CollaborationService, CrossProjectService } from "./interaction/index.js";
import type { TaskProfilerPort } from "./advisor/index.js";
import { SqliteMonitorDeliveryMarkStore, makeCampaignMonitorDriver, nullCampaignWakeActivation } from "./monitor/index.js";
import type { CampaignMonitorDriver, MonitorRuntimeCapability } from "./monitor/index.js";
import { SqliteProjectVerificationStore, commandProjectHeadVerifier, firstPartyProjectHeadVerificationSource, independenceSummary, makeProjectVerificationService, verifierRegistryFromPorts } from "./project_verification/index.js";
import type { ProjectVerifierPort, ProjectVerifierRegistry } from "./project_verification/index.js";
import { makeProjectManagementService } from "./project_management/index.js";
import type { InstallPalimpsestOptions, InstalledBoundaryMemory, InstalledCampaign, InstalledDynamics, InstalledEvolution, InstalledExternalAssets, InstalledFederatedBoundaryMemory, InstalledHolons, InstalledInstitution, InstalledOrganization, InstalledPalimpsest, InstalledReasoningCells, InstalledRuntime, InstalledRuntimeEvolution, InstalledRuntimeScopes, InstalledVerification } from "./composition/install_contract.js";
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
