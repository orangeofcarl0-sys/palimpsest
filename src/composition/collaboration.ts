/**
 * SR-1C §15 — the COLLABORATION composition cluster.
 *
 * Proof/disclosure, the runtime realization carrier, boundary memory (home, federated client)
 * and the federation services (messaging, commitments, participation), plus the campaign
 * institution epoch source and the whole campaign block — everything the composition root used
 * to build between the core substrate and the applications it exposes.
 *
 * COMPOSITION ONLY: no policy of its own, no discovery, no registry, no string-keyed lookup.
 * Its input is a `Pick` of the public options this cluster reads plus the already-composed
 * locals it consumes — never the options bag (§16).
 *
 * ABSENCE SEMANTICS (§17), preserved exactly:
 *   no proofEvidenceStore     → no Proof plane, and no derived disclosure projection
 *   no runtimeCarrierPort     → no runtime surface
 *   no boundaryMemoryStore    → no boundary memory, no boundary home, no federated client
 *   no peerTransportPort      → no federation service, so no messaging/commitments/participation
 *   no campaignStore          → no campaign or institution-epoch source
 */
import { randomUUID } from "node:crypto";
import { defaultAllocateActivationId } from "../composition/core.js";
import { makeRuntimeRealizationService, observeAndCompileGroundedPlan, observeBindingState } from "../runtime/index.js";
import { makeParticipationService } from "../coordination/index.js";
import type { CommitmentScope, FederationService } from "../federation/index.js";
import { makeCommitmentService, makeFederationMessagingService, makeFederationService } from "../federation/index.js";
import type { CampaignEvidencePort } from "../campaign/index.js";
import { committedReconciliationOf, inFlightWake, makeCampaignProductionService, makeCampaignService, makeCompilerService, makeInterventionService, makeLifecycleService, makeNextActionAdmissionService, makeProspectiveService } from "../campaign/index.js";
import type { BoundaryHome } from "../boundary_memory/index.js";
import { makeBoundaryHome, makeBoundaryMemoryService, makeFederatedBoundaryClient } from "../boundary_memory/index.js";
import type { DisclosureService, ProofEvidenceService } from "../proof_asset/index.js";
import { blobBackedSourceContentPort, localDisclosureExporter, makeDisclosureService, makeProofEvidenceService, proofCampaignEvidencePort } from "../proof_asset/index.js";
import type { ProofSourceContentPort } from "../proof_asset/source_content_port.js";
import type { EventStore } from "../state/index.js";
import type { PalimpsestEffectsRuntime } from "../effects/index.js";
import type { CampaignInstitutionEpochSource } from "../campaign/index.js";
import type { InstallPalimpsestOptions, InstalledBoundaryMemory, InstalledCampaign, InstalledFederatedBoundaryMemory, InstalledRuntime } from "./install_contract.js";

/** Exactly the public options this cluster may read. */
export type CollaborationCompositionOptions = Pick<
  InstallPalimpsestOptions,
  | "localPeer"
  | "proofEvidenceStore"
  | "proofContentPort"
  | "proofBlobStore"
  | "proofVerificationPolicy"
  | "proofPublicationAdmission"
  | "disclosureExporterRoot"
  | "disclosureAdmission"
  | "runtimeCarrierPort"
  | "runtimeObservationPort"
  | "boundaryMemoryStore"
  | "boundaryHomeId"
  | "boundaryArtifactTypes"
  | "boundaryCollaborationTransport"
  | "boundaryWorkspaceRoute"
  | "allocateBoundaryOperationId"
  | "allocateSnapshotId"
  | "peerTransportPort"
  | "peerDirectoryPort"
  | "peerContinuityAssociations"
  | "continuityStore"
  | "coordinationStore"
  | "attemptCatalog"
  | "allocateActivationId"
  | "institutionStore"
  | "campaignStore"
  | "campaignClock"
  | "campaignEvidencePort"
  | "campaignSignalPort"
  | "campaignWorkPort"
  | "campaignWorkAdmissionPort"
  | "campaignCompilerPort"
  | "campaignInstitutionEpochPort"
>;

/** The already-composed values this cluster consumes. */
export interface CollaborationCompositionInput {
  readonly options: CollaborationCompositionOptions;
  readonly store: EventStore;
  readonly effects: PalimpsestEffectsRuntime;
}

/** What this cluster produced. */
export interface CollaborationComposition {
  readonly proof: ProofEvidenceService | undefined;
  readonly disclosure: DisclosureService | undefined;
  readonly campaignEvidence: CampaignEvidencePort | undefined;
  readonly runtime: InstalledRuntime | undefined;
  readonly boundaryMemory: InstalledBoundaryMemory | undefined;
  readonly boundaryHome: BoundaryHome | undefined;
  readonly federatedBoundaryMemory: InstalledFederatedBoundaryMemory | undefined;
  readonly federation: FederationService | undefined;
  readonly campaignInstitutionSource: CampaignInstitutionEpochSource | undefined;
  readonly campaign: InstalledCampaign | undefined;
}
export function composeCollaborationCapabilities(input: CollaborationCompositionInput): CollaborationComposition {
  const { options, store, effects } = input;

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

  return {
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
  };
}
