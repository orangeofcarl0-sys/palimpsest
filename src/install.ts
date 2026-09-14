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
import { join } from "node:path";

import { canonicalDigest } from "./schema/canonical.js";

import type { RuntimeHooks } from "@ordarium/core";

import { EventStore, dshDefaultStatePath } from "./state/index.js";
import { defaultOrdariumPath, createPalimpsestEffects } from "./effects/index.js";
import { GitCliPort, type GitPort } from "./effects/index.js";
import { TaskPolicy } from "./domain/index.js";
import { ProjectController } from "./tools/controller.js";
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
  PeerDirectoryPort,
  PeerRef,
  PeerTransportPort,
} from "./federation/index.js";
import { makeCommitmentService, makeFederationMessagingService, makeFederationService } from "./federation/index.js";
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
  makeCampaignProductionService,
  makeCampaignService,
  makeCompilerService,
  makeInterventionService,
  makeLifecycleService,
  makeNextActionAdmissionService,
  makeProspectiveService,
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
  /** G10-N (additive): claim-type registry; defaults to the builtin statement/dead-end registry. */
  reasoningClaimTypes?: ReasoningClaimTypeRegistry | undefined;
  /** G10-N (additive): the verification policy seam (separate from admission). */
  reasoningVerificationPolicy?: ReasoningVerificationPolicyPort | undefined;
  /** G10-N (additive): the epistemic admission policy seam (separate from verification). */
  reasoningAdmissionPolicy?: ReasoningEpistemicAdmissionPolicyPort | undefined;
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
  register(context: DshPluginContext): () => void;
  dispose(): Promise<void>;
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

/**
 * G10-J CF-I-02: derive a read-only Campaign activity observation. Counts are mechanical
 * facts about canonical Campaign history — never value, health, or dissolution authority.
 */
function campaignActivityPort(store: CampaignStore): CampaignActivityPort {
  return {
    observe: async (campaignId): Promise<CampaignActivityObservation> => {
      const definition = await store.definition(campaignId);
      if (definition === undefined) {
        return { campaignId, exists: false, lifecycle: null, basisThroughSeq: null, chainDigest: null, semanticEventCount: 0, activeCommitmentCount: 0, activeWatchCount: 0, inFlightWake: null, state: "known" };
      }
      const events = await store.replay(campaignId);
      const basis = await store.basis(campaignId);
      const openCommitments = new Set<string>();
      const activeWatches = new Set<string>();
      const startedWakes = new Set<string>();
      const endedWakes = new Set<string>();
      let lifecycle = "ACTIVE";
      for (const event of events) {
        if (event.type === "CAMPAIGN_COMMITMENT_OPENED") openCommitments.add((event.payload as { commitment: { commitmentId: string } }).commitment.commitmentId);
        else if (event.type === "CAMPAIGN_COMMITMENT_RESOLVED" || event.type === "CAMPAIGN_COMMITMENT_ABANDONED" || event.type === "CAMPAIGN_COMMITMENT_SUPERSEDED") openCommitments.delete((event.payload as { commitmentId: string }).commitmentId);
        else if (event.type === "WATCH_INSTALLED") activeWatches.add((event.payload as { watch: { watchId: string } }).watch.watchId);
        else if (event.type === "WATCH_TRIGGERED" || event.type === "WATCH_CANCELLED") activeWatches.delete((event.payload as { watchId: string }).watchId);
        else if (event.type === "WAKE_STARTED") startedWakes.add((event.payload as { wakeCycleId: string }).wakeCycleId);
        else if (event.type === "WAKE_CYCLE_COMPLETED" || event.type === "WAKE_COMPLETED") endedWakes.add((event.payload as { wakeCycleId: string }).wakeCycleId);
        if (event.type === "CAMPAIGN_TERMINATED") lifecycle = "TERMINATED";
        else if (event.type === "CAMPAIGN_DORMANT") lifecycle = "DORMANT";
        else if (event.type === "WAKE_STARTED") lifecycle = "WAKING";
        else if (event.type === "RECONCILIATION_COMMITTED") lifecycle = "RECONCILING";
        else if (event.type === "WAKE_CYCLE_COMPLETED" || event.type === "WAKE_COMPLETED") lifecycle = "ACTIVE";
      }
      return {
        campaignId,
        exists: true,
        lifecycle,
        basisThroughSeq: basis?.throughSeq ?? null,
        chainDigest: basis?.chainDigest ?? null,
        semanticEventCount: events.length,
        activeCommitmentCount: openCommitments.size,
        activeWatchCount: activeWatches.size,
        inFlightWake: [...startedWakes].some((id) => !endedWakes.has(id)),
        state: "known",
      };
    },
  };
}

/**
 * G10-I: derive a NORMALIZED collaboration observation from coordination events.
 * Purely mechanical: exact event-type counts, plus a documented payload key scan
 * for `peerId` / `activationId`. It never interprets messages as evidence,
 * commitment, or authority.
 */
function coordinationObservationPort(store: CoordinationStore): DynamicsCollaborationPort {
  return {
    observe: async () => {
      const events = await store.replay();
      const eventCounts: Record<string, number> = {};
      const peerIds = new Set<string>();
      const activationIds = new Set<string>();
      let messageEventCount = 0;
      let commitmentAcceptedEvents = 0;
      let handoffAcceptedEvents = 0;
      let contactRequestEvents = 0;
      const scan = (value: unknown): void => {
        if (Array.isArray(value)) {
          for (const item of value) scan(item);
          return;
        }
        if (typeof value !== "object" || value === null) return;
        for (const [key, item] of Object.entries(value)) {
          if (key === "peerId" && typeof item === "string") peerIds.add(item);
          else if (key === "activationId" && typeof item === "string") activationIds.add(item);
          else scan(item);
        }
      };
      for (const event of events) {
        eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
        if (event.type === "MESSAGE_PREPARED" || event.type === "MESSAGE_DELIVERED" || event.type === "MESSAGE_RECEIVED") messageEventCount += 1;
        if (event.type === "COMMITMENT_ACCEPTED") commitmentAcceptedEvents += 1;
        if (event.type === "HANDOFF_ACCEPTED") handoffAcceptedEvents += 1;
        if (event.type === "CONTACT_REQUESTED") contactRequestEvents += 1;
        scan(event.payload);
      }
      return {
        eventCounts: Object.freeze(eventCounts),
        messageEventCount,
        distinctPeerIds: Object.freeze([...peerIds].sort()),
        commitmentAcceptedEvents,
        handoffAcceptedEvents,
        contactRequestEvents,
        participationActivationIds: Object.freeze([...activationIds].sort()),
        coordinationHead: await store.head(),
      };
    },
  };
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

/**
 * G10-D5 default activation allocator: a domain-separated digest over
 * (context, subject) — retry-stable (same context ⇒ same id ⇒ Ordarium
 * idempotent dedupe), and not any forbidden identity (§21).
 */
export function defaultAllocateActivationId(subject: string, context: string): string {
  return `act-${canonicalDigest({
    domain: "palimpsest.activation-id.v1",
    context,
    subject,
  }).slice(0, 32)}`;
}

export function trustedDefaultPolicy(): TaskPolicy {
  return new TaskPolicy({
    policy_id: "trusted-default",
    read_paths: ["src"],
    allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
    network_policy: "deny",
    network_allowlist: [],
    timeout_s: 60,
    lease_s: 10,
    attempt_limit: 2,
    candidate_limit: 1,
  });
}

export function installPalimpsest(
  context: DshPluginContext,
  options: InstallPalimpsestOptions,
): InstalledPalimpsest {
  const repository = options.repository ?? process.cwd();
  const git =
    options.git ??
    new GitCliPort(repository, join(repository, ".palimpsest", "worktrees"));
  const store = new EventStore(options.databasePath ?? dshDefaultStatePath(), {
    clock: options.clock ?? (() => new Date().toISOString()),
  });
  const effects = createPalimpsestEffects({
    databasePath: options.ordariumDatabasePath ?? defaultOrdariumPath(),
    git,
    clock: options.effectsClock,
    leaseMs: options.leaseMs,
    hooks: options.hooks,
  });
  const policy = options.policy ?? trustedDefaultPolicy();
  const controller = new ProjectController({
    store,
    effects,
    projectId: options.projectId,
    policy,
    clock: options.clock,
  });
  const tools = definePalimpsestTools(controller);

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
      ...(boundaryMemory === undefined
        ? {}
        : {
            home: makeBoundaryHome({
              homeId: options.boundaryHomeId ?? `home-${options.localPeer.peerId}`,
              service: boundaryMemory.service,
              store: boundaryMemory.store,
            }),
          }),
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
      evidence: options.campaignEvidencePort,
      institutions: campaignInstitutionSource,
    });
    const prospective = makeProspectiveService({
      store: campaignStore,
      allocateWatchId: () => `cw-${randomUUID()}`,
      clock: options.campaignClock ?? (() => new Date().toISOString()),
      evidence: options.campaignEvidencePort,
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
      evidence: options.campaignEvidencePort,
      work: options.campaignWorkPort,
    });
    const interventions =
      options.campaignWorkPort === undefined
        ? undefined
        : makeInterventionService({
            store: campaignStore,
            allocateInterventionId: () => `iv-${randomUUID()}`,
            work: options.campaignWorkPort,
            evidence: options.campaignEvidencePort,
          });
    const production = makeCampaignProductionService({
      store: campaignStore,
      institutions: campaignInstitutionSource,
      evidence: options.campaignEvidencePort,
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

  const disposers: (() => void)[] = [];

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

  for (const definition of tools) {
    const registered = context.tools.register(definition);
    if (typeof registered === "function") disposers.push(registered);
    else if (registered !== undefined) disposers.push(() => registered.dispose());
  }

  return {
    controller,
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
    register(next: DshPluginContext): () => void {
      const inner: (() => void)[] = [];
      for (const definition of tools) {
        const registered = next.tools.register(definition);
        if (typeof registered === "function") inner.push(registered);
        else if (registered !== undefined) inner.push(() => registered.dispose());
      }
      return () => {
        for (const dispose of [...inner].reverse()) dispose();
      };
    },
    async dispose() {
      for (const dispose of [...disposers].reverse()) dispose();
      await controller.close();
      store.close();
    },
  };
}
