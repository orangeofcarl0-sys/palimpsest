/**
 * SR-1C §15 — the COGNITION / PROJECT composition cluster.
 *
 * Evidence extraction over the Proof plane, the organization-memory store, the recipe registry
 * and profiler seams, the live verification probe, the architecture advisor, the recipe
 * execution service (the UX-A composition point), the attention service, and the project
 * workspace facade including the external-asset reference it closes over.
 *
 * COMPOSITION ONLY: no policy of its own, no discovery, no registry, no string-keyed lookup.
 * Input is a `Pick` of the public options this cluster reads plus the already-composed locals it
 * consumes (§16) — never the options bag.
 *
 * ABSENCE SEMANTICS (§17), preserved exactly:
 *   no organizationMemoryStore → no evaluation surface
 *   no attentionPolicy         → no attention service
 *   no projectJournalStore     → no project workspace
 *   no recipeRegistry/profiler → the first-party defaults, never a stub
 */
import { campaignProjectRefPort, externalImportViewOf } from "../composition/optional.js";
import type { FederationService } from "../federation/index.js";
import type { AttentionService, BoundaryAcceptedHead, BoundaryAttentionReadPort, PendingBoundaryDecision } from "../attention/index.js";
import { makeAttentionService } from "../attention/index.js";
import type { OrganizationMemoryService } from "../organization_memory/index.js";
import { makeOrganizationMemoryService } from "../organization_memory/index.js";
import type { RecipeRegistry } from "../recipes/registry.js";
import { builtinRecipeRegistry } from "../recipes/registry.js";
import type { RecipeExecutionService } from "../recipes/execution.js";
import { makeRecipeExecutionService } from "../recipes/execution.js";
import type { EmpiricalArchitectureAdvisor } from "../advisor/advisor.js";
import { makeEmpiricalArchitectureAdvisor } from "../advisor/advisor.js";
import type { EvidenceExtractionService, ProofEvidenceService } from "../proof_asset/index.js";
import { blobBackedSourceContentPort, makeEvidenceExtractionService } from "../proof_asset/index.js";
import type { ProjectWorkspaceService, ProjectJournalEntry } from "../project_workspace/index.js";
import { makeProjectWorkspaceService } from "../project_workspace/index.js";
import type { ExternalAssetBridgeService } from "../external_assets/index.js";
import { deterministicTaskProfiler } from "../interaction/index.js";
import type { TaskProfilerPort } from "../advisor/index.js";
import type { CampaignStore } from "../campaign/index.js";
import type { EventStore } from "../state/index.js";
import type { RecipeExecutionStatus } from "../application/surface.js";
import type { ProjectController } from "../tools/controller.js";
import type { InstallPalimpsestOptions, InstalledBoundaryMemory, InstalledCampaign, InstalledReasoningCells, InstalledVerification } from "./install_contract.js";

/** Exactly the public options this cluster may read. */
export type CognitionCompositionOptions = Pick<
  InstallPalimpsestOptions,
  | "localPeer"
  | "knownIndependentPeers"
  | "clock"
  | "organizationMemoryStore"
  | "attentionPolicy"
  | "attentionMarkStore"
  | "proofContentPort"
  | "proofBlobStore"
  | "verificationCapabilityRef"
  | "reasoningBranchExecution"
  | "recipeRegistry"
  | "projectJournalStore"
  | "projectAssociationStore"
  | "externalAssetProviders"
  | "projectId"
  | "taskProfiler"
>;

/** The already-composed values this cluster consumes. */
export interface CognitionCompositionInput {
  readonly options: CognitionCompositionOptions;
  readonly store: EventStore;
  readonly proof: ProofEvidenceService | undefined;
  readonly federation: FederationService | undefined;
  readonly boundaryMemory: InstalledBoundaryMemory | undefined;
  readonly campaign: InstalledCampaign | undefined;
  readonly reasoningCellsInstalled: InstalledReasoningCells | undefined;
  readonly controller: ProjectController;
  readonly campaignStore: CampaignStore | undefined;
}

/** What this cluster produced. */
export interface CognitionComposition {
  readonly proofExtraction: EvidenceExtractionService | undefined;
  readonly organizationMemory: OrganizationMemoryService | undefined;
  readonly recipeRegistry: RecipeRegistry;
  readonly taskProfiler: TaskProfilerPort;
  readonly verificationWiring: { runtime: InstalledVerification | undefined };
  readonly liveVerification: () => InstalledVerification | undefined;
  readonly advisor: EmpiricalArchitectureAdvisor | undefined;
  readonly recipeExecution: RecipeExecutionService | undefined;
  readonly recipeExecutionStatus: RecipeExecutionStatus | undefined;
  readonly attention: AttentionService | undefined;
  readonly externalAssetsRef: { service: ExternalAssetBridgeService | undefined };
  readonly projectWorkspace: ProjectWorkspaceService | undefined;
}
export function composeCognitionCapabilities(input: CognitionCompositionInput): CognitionComposition {
  const { options, store, proof, federation, boundaryMemory, campaign, reasoningCellsInstalled, controller, campaignStore } = input;

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

  return {
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
  };
}
