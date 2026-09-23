/**
 * G10-P live deployment launcher — closes CF-O-02 by making the whole application
 * stack reproducible from a typed profile, without adding any semantic kernel.
 *
 * It assembles EXISTING services through `installPalimpsest`, wires a durable
 * transport + inbound pump + attention derivation + host activation, and returns a
 * single `Deployment` handle. Semantic authority still comes from the canonical
 * stores and the governance configuration — never from this file.
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { installPalimpsest, type InstalledPalimpsest } from "../install.js";

/** The commands a deployment with no policy of its own starts from. */
const PACKAGED_DEFAULT_COMMANDS: ReadonlyArray<{ executable: string; argv_prefix: string[] }> = [
  { executable: "python", argv_prefix: ["-m", "pytest"] },
];
import { trustedDefaultPolicy } from "../composition/core.js";
import { authorizedCommands, deriveProjectStandard } from "./standard.js";
import type { HostDeploymentFactsPort } from "../composition/install_contract.js";
import type { DshPluginContext, DshToolDefinition, DshToolRegistry } from "../tools/index.js";
import { SqliteCoordinationStore, SqliteAttemptCatalog, ParticipationError } from "../coordination/index.js";
import type { AttemptCatalogPort } from "../coordination/index.js";
import { SqliteBoundaryMemoryStore } from "../boundary_memory/index.js";
import { SqliteRuntimeScopeStore } from "../runtime_scope/index.js";
import {
  materializePeerAdvertisement,
  materializePeerRef,
  type PeerContinuityAssociation,
  type PeerDirectoryPort,
  type PeerRef,
} from "../federation/index.js";
import type { ObservationKnowledge } from "../runtime/index.js";
import {
  SqliteTransportCursorStore,
  durableBoundaryClient,
  makeFederationInboundPump,
  ordariumDurableTransportAt,
  peerTransportFromDurable,
  type DurableBoundaryClient,
  type DurableOperationTransport,
  type FederationInboundPump,
  type InboundPumpStatus,
} from "../transport/index.js";
import {
  SqliteAttentionMarkStore,
  dshAgentsAttentionAdapter,
  nullAttentionAdapter,
  piAttentionAdapter,
  type AttentionActivationOutcome,
  type AttentionActivationPort,
  type AttentionService,
  type AttentionSignal,
} from "../attention/index.js";
import { staticBoundaryRoute } from "../boundary_memory/index.js";
import { SqliteProjectAssetAssociationStore, SqliteProjectJournalStore } from "../project_workspace/index.js";
import { SqliteManagementPreferenceStore } from "../project_management/index.js";
import { staticProjectPeerDirectory, type ProjectPeerDirectoryPort } from "../interaction/index.js";
import type { DelegationBranchHost } from "../interaction/delegation.js";
import type { PrincipalDeliveryPort } from "../interaction/delegation_terminal.js";
import { SqliteReasoningCellStore } from "../reasoning_cell/index.js";
import type { ReasoningBranchExecutionPort } from "../recipes/execution.js";
import type { RemoteSubmissionPort } from "../application/surface.js";
import { deploymentReasoningStorePath, firstPartyExploratoryAdmissionPolicy, firstPartyExploratoryVerificationPolicy } from "./reasoning_bundle.js";
import { deriveHostCollaborationReadiness, type HostCollaborationReadiness } from "./readiness.js";
import type { ProjectAgentDeploymentProfile } from "./profile.js";

/** Optional host services; the profile selects the KIND, the host supplies the instance. */
export interface DeploymentHostServices {
  readonly dshAgents?: Parameters<typeof dshAgentsAttentionAdapter>[0]["agents"] | undefined;
  readonly pi?: Parameters<typeof piAttentionAdapter>[0]["pi"] | undefined;
  /**
   * UX-C §20/SC-12: the host-derived EPHEMERAL branch execution port. The DSH host
   * knows its own runtime/bin, profile and working directory, so it constructs this
   * from that knowledge; a normal user never supplies it. It is wired only when the
   * profile carries the `reasoning` bundle.
   */
  readonly branchExecution?: ReasoningBranchExecutionPort | undefined;
  /**
   * PLMP-LEAN-1 §C.11 ② (additive): the SAME branch host, bound at run time to a FROZEN `workDir`. A
   * delegation must not hand its worker the live repository, so it needs a port PER delegation
   * snapshot rather than the one blocking port above. Supplying it is what makes the delegation face
   * available at all; absent ⇒ the face is absent, never a stub.
   */
  readonly branchExecutionFor?: ((workDir: string) => DelegationBranchHost) | undefined;
  /**
   * §"two surfaces know each other": facts about the running deployment, supplied as a port because
   * the dashboard url only exists after the host has bound a port.
   */
  readonly facts?: HostDeploymentFactsPort | undefined;
}

export interface DeploymentActivationReport {
  readonly signal: AttentionSignal;
  readonly outcome: AttentionActivationOutcome;
}

export interface DeploymentPumpReport {
  readonly pump: InboundPumpStatus;
  /** Pending semantic attention signals (pull mode works with no activation adapter). */
  readonly signals: readonly AttentionSignal[];
  readonly activations: readonly DeploymentActivationReport[];
}

export interface Deployment {
  readonly profile: ProjectAgentDeploymentProfile;
  readonly localPeer: PeerRef;
  readonly installed: InstalledPalimpsest;
  readonly transport: DurableOperationTransport;
  readonly pump: FederationInboundPump;
  readonly attention?: AttentionService | undefined;
  readonly attentionActivation?: AttentionActivationPort | undefined;
  readonly boundaryClient?: DurableBoundaryClient | undefined;
  /**
   * UX-C §9/§30: the packaged local-collaboration status. `storeOwned` is TRUE only
   * when THIS deployment created and therefore closes the ReasoningCell store.
   */
  readonly reasoning: DeploymentReasoningStatus;
  /** Drain the mailbox, then derive + (optionally) activate attention. Safe to repeat. */
  pumpAndActivate(input?: { readonly fromStart?: boolean }): Promise<DeploymentPumpReport>;
  /**
   * UX-C §24/§23: the host LATE-BINDING seam for activation. The DSH host creates or
   * cold-resumes the persistent principal session after the deployment exists, so it
   * binds the resume-capable adapter here instead of re-implementing
   * pump→drain→activate→mark. An explicit `activation: "none"` profile stays pull
   * mode: binding is accepted but never turns it active (§26).
   */
  bindAttentionActivation(activation: AttentionActivationPort | undefined): void;
  /**
   * PLMP-LEAN-1 §C.11 ③: the host LATE-BINDING seam for a delegated research branch's terminal
   * result, mirroring {@link bindAttentionActivation} for the same reason — the principal session
   * exists only after the deployment does. Unlike activation there is no pull mode to protect: an
   * unbound delivery reports `delivered: false`, and the canonical state is unchanged either way.
   */
  bindDelegationDelivery(delivery: PrincipalDeliveryPort | undefined): void;
  /** UX-C §30: the derived, non-authoritative readiness view (no numeric score). */
  collaborationReadiness(): HostCollaborationReadiness;
  /**
   * Send THIS peer's explicit decision on a commitment it holds/owes to the peer that owns
   * the commitment record. A message body is NEVER interpreted as a decision, so this typed
   * operation is the only remote-decision path. At-least-once; the stable operationId makes
   * retries idempotent at the owner.
   */
  submitRemoteCommitmentDecision(input: {
    readonly to: PeerRef;
    readonly commitmentId: string;
    readonly decision: "accept" | "reject" | "release";
    readonly operationId?: string | undefined;
  }): Promise<{ readonly operationId: string; readonly delivered: boolean }>;
  close(): Promise<void>;
}

/** UX-C §9/§30: what the packaged reasoning bundle composed, and who owns it. */
export interface DeploymentReasoningStatus {
  readonly storeConfigured: boolean;
  /** TRUE iff this deployment created the store and closes it in `close()`. */
  readonly storeOwned: boolean;
  readonly branchAdapter?: string | undefined;
}

export class DeploymentLaunchError extends Error {
  constructor(
    readonly kind: "orchestration_store_unavailable" | "host_service_absent",
    message: string,
  ) {
    super(message);
    this.name = "DeploymentLaunchError";
  }
}

function noopContext(): DshPluginContext {
  const tools: DshToolRegistry = {
    register(_definition: DshToolDefinition): (() => void) | { dispose(): void } {
      return () => {};
    },
  };
  return { tools };
}

function ensureSqliteFile(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.close();
}

function deploymentPeerDirectory(
  entries: ProjectAgentDeploymentProfile["directory"],
): PeerDirectoryPort {
  if (entries === undefined) {
    return {
      observePeers: async (): Promise<ObservationKnowledge<readonly never[]>> => ({
        state: "unknown",
        detail: "no peer directory is configured for this deployment (unknown is never an empty directory)",
      }) as ObservationKnowledge<readonly never[]>,
    };
  }
  const advertisements = entries.map((entry) =>
    materializePeerAdvertisement({
      peer: materializePeerRef({ peerId: entry.peerId }),
      competenceTags: entry.competenceTags,
    }),
  );
  return { observePeers: async () => ({ state: "known", value: Object.freeze(advertisements) }) };
}

/**
 * UX-B §7/§42/SC-9: the deployment's project↔peer bindings as a READ-ONLY
 * `ProjectPeerDirectoryPort`.
 *
 * WHY THIS EXISTS: the profile's `directory` carries peer identity only, so in a
 * profile-launched deployment there was no way for a user to name a PROJECT, and
 * `knownIndependentPeers` was never passed either — which meant UX-A's COORDINATE
 * handoff was unreachable and `AUTO cannot silently cross projects` was only
 * VACUOUSLY true (audit SC-9/SC-19). Supplying `projectDirectory` makes the peers
 * really observable, so both facts become falsifiable in a real launched
 * deployment.
 *
 * It is ADDITIVE and strictly bounded: absent `projectDirectory` ⇒ `undefined` ⇒
 * `application.crossProject` is absent (a 501 `surface_absent`, never a stub) and
 * nothing else changes. The descriptors are validated by
 * `staticProjectPeerDirectory`, so a malformed binding fails at launch instead of
 * producing a directory the product would have to distrust per call.
 */
function deploymentProjectDirectory(
  entries: ProjectAgentDeploymentProfile["projectDirectory"],
): ProjectPeerDirectoryPort | undefined {
  if (entries === undefined) return undefined;
  return staticProjectPeerDirectory(
    entries.map((entry) => ({
      projectId: entry.projectId,
      ...(entry.displayName === undefined ? {} : { displayName: entry.displayName }),
      aliases: entry.aliases,
      peer: materializePeerRef({ peerId: entry.peerId }),
      competenceTags: entry.competenceTags,
    })),
    { directoryId: "deployment-project-directory" },
  );
}

function deploymentAttemptCatalog(orchestrationDatabasePath: string): AttemptCatalogPort {
  ensureSqliteFile(orchestrationDatabasePath);
  const catalog = new SqliteAttemptCatalog(orchestrationDatabasePath);
  return {
    async assertAdmissibleAttempt(attempt) {
      try {
        await catalog.assertAdmissibleAttempt(attempt);
      } catch (error) {
        // A Work ledger with no attempts table means "no attempt is admissible" —
        // never a silent pass. Semantic participation errors pass through unchanged.
        if (error instanceof ParticipationError) throw error;
        throw new ParticipationError(
          "attempt_unknown",
          `attempt "${attempt.attemptId}" is not present in the orchestration ledger`,
        );
      }
    },
  };
}

function unavailableActivation(kind: "dsh" | "pi"): AttentionActivationPort {
  return {
    adapterId: `unavailable-${kind}`,
    activate: async () => ({
      activated: false,
      detail: `the profile requests a "${kind}" activation adapter but no host service was supplied`,
    }),
  };
}

/**
 * UX-C §23: a DSH activation whose persisted session id is not known at launch. It
 * activates nothing and never invents a session; the host binds the real adapter
 * through `Deployment.bindAttentionActivation` once it has created/resumed the
 * principal. The durable signal therefore stays PENDING (never marked delivered).
 */
function unboundDshActivation(): AttentionActivationPort {
  return {
    adapterId: "dsh-agents-unbound",
    activate: async () => ({
      activated: false,
      detail:
        "the deployment requests DSH activation but no persisted principal session is bound yet; the DSH host must bind one (a PeerRef is never used as a host session)",
    }),
  };
}

export function launchDeployment(
  profile: ProjectAgentDeploymentProfile,
  options: { readonly context?: DshPluginContext; readonly host?: DeploymentHostServices } = {},
): Deployment {
  const localPeer = materializePeerRef({ peerId: profile.localPeer });
  const context = options.context ?? noopContext();

  const coordinationStore = new SqliteCoordinationStore(profile.databases.coordination);
  const boundaryMemoryStore =
    profile.databases.boundaryMemory === undefined
      ? undefined
      : new SqliteBoundaryMemoryStore(profile.databases.boundaryMemory);
  const runtimeScopeStore =
    profile.databases.runtimeScope === undefined
      ? undefined
      : new SqliteRuntimeScopeStore(profile.databases.runtimeScope);
  // G10-V: the project workspace is wired only when the profile lists its narrowly-owned
  // histories. These stores hold associations/journal records only — never a copy of a
  // canonical fact — and are closed by this deployment.
  const projectAssociationStore =
    profile.databases.projectAssociations === undefined
      ? undefined
      : new SqliteProjectAssetAssociationStore(profile.databases.projectAssociations);
  const projectJournalStore =
    profile.databases.projectJournal === undefined
      ? undefined
      : new SqliteProjectJournalStore(profile.databases.projectJournal);
  const managementPreferenceStore =
    profile.databases.management === undefined
      ? undefined
      : new SqliteManagementPreferenceStore(profile.databases.management);

  const transport = ordariumDurableTransportAt({
    databasePath: profile.transport.databasePath,
    namespace: profile.transport.namespace,
  });
  const cursorStore = new SqliteTransportCursorStore(profile.databases.transportCursors);
  const marks =
    profile.attention !== undefined && profile.databases.attentionMarks !== undefined
      ? new SqliteAttentionMarkStore(profile.databases.attentionMarks)
      : undefined;

  // UX-C §9/SC-4: the DEPLOYMENT-OWNED local collaboration bundle. It is composed only
  // when the profile carries `reasoning`; the store path is derived beside this project's
  // orchestration DB unless the ONE advanced override names one. Nothing is opened,
  // spawned or sent by existing.
  let reasoningStore: SqliteReasoningCellStore | undefined;
  if (profile.reasoning !== undefined) {
    const storePath = profile.reasoning.storePath ?? deploymentReasoningStorePath(profile.databases.orchestration);
    ensureSqliteFile(storePath);
    reasoningStore = new SqliteReasoningCellStore(storePath);
  }
  const reasoningBranchExecution =
    profile.reasoning === undefined ? undefined : options.host?.branchExecution;
  /**
   * PLMP-LEAN-1 §C.11 ②: the async branch host, alongside the blocking one above. Both are the same
   * adapter bound to a different `workDir`; a delegation gets a frozen snapshot's directory, the
   * blocking collaboration path gets the live one.
   */
  const delegationBranchExecution = options.host?.branchExecutionFor;
  /**
   * §C.11 ③: the principal's delivery seam is LATE-BOUND, exactly like attention activation — the host
   * creates or resumes the persistent principal session AFTER this deployment exists.
   *
   * It exists only where a followup is a legitimate path: a reachable DSH agent AND a profile that
   * asked for DSH activation. `activation: "none"` is an operator saying "pull mode only", and a
   * delegation whose terminal result could never come back would be a trap — an agent would start
   * research and wait for an answer that cannot arrive. Absence is the honest answer there, so
   * `palimpsest_delegate` is absent too.
   */
  const delegationDelivery: { port: PrincipalDeliveryPort | undefined } | undefined =
    options.host?.dshAgents === undefined || profile.attention?.activation !== "dsh"
      ? undefined
      : { port: undefined };

  // UX-C §23/§26: a DSH activation is LATE-BOUND by the host to the persisted principal
  // session it creates/resumes, so a profile may omit `sessionId`. Until the host binds
  // one, activation honestly reports that it is unbound; an explicit `"none"` stays pull.
  const explicitPullMode = profile.attention?.activation === "none";
  let activation: AttentionActivationPort | undefined =
    profile.attention === undefined
      ? undefined
      : explicitPullMode
        ? nullAttentionAdapter()
        : profile.attention.activation === "dsh"
          ? options.host?.dshAgents === undefined || profile.attention.sessionId === undefined
            ? unboundDshActivation()
            : dshAgentsAttentionAdapter({
                agents: options.host.dshAgents,
                resumeSessionId: profile.attention.sessionId,
              })
          : options.host?.pi === undefined
            ? unavailableActivation("pi")
            : piAttentionAdapter({
                pi: options.host.pi,
                ...(profile.attention.deliverAs === undefined ? {} : { deliverAs: profile.attention.deliverAs }),
              });

  const continuityAssociations: readonly PeerContinuityAssociation[] | undefined =
    profile.persistentPoint === undefined
      ? undefined
      : [{ peer: localPeer, point: profile.persistentPoint }];

  // UX-B §7/§42/SC-9: the project↔peer binding directory, when the profile declares
  // one. `undefined` keeps the cross-project face (and the advisor's peer list)
  // exactly as they were before this option existed.
  const projectPeerDirectory = deploymentProjectDirectory(profile.projectDirectory);
  // SC-9: the SAME declared bindings are the deployment's known independent peers,
  // so UX-A's COORDINATE handoff is reachable in a launched deployment instead of
  // being vacuously non-mutating. Only present when the profile declares bindings.
  const knownIndependentPeers =
    profile.projectDirectory === undefined
      ? undefined
      : profile.projectDirectory.map((entry) => ({ peerId: entry.peerId }));

  // G10-Q: the durable remote-submission port lets a NON-home peer act through product tools
  // (submit a boundary mutation to the home; communicate an explicit commitment decision to the
  // owner). A queue receipt is mechanical, never an acceptance.
  const boundaryClient =
    profile.boundaryRoutes === undefined
      ? undefined
      : durableBoundaryClient(transport, {
          localPeer,
          route: staticBoundaryRoute(profile.boundaryRoutes),
          allocateOperationId: () => `bop-${profile.profileId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        });
  let remoteOperationCounter = 0;
  const remoteTransport: RemoteSubmissionPort = {
    submitOperation: async (input) => {
      const operationId = input.operationId ?? `rop-${profile.profileId}-${++remoteOperationCounter}`;
      const result = await transport.submit({
        operationId,
        from: localPeer,
        to: input.to,
        operation: input.operation,
      });
      return { operationId, delivered: result.delivered };
    },
    submitBoundary: (input) => {
      if (boundaryClient === undefined) {
        throw new DeploymentLaunchError(
          "host_service_absent",
          "no boundary route is configured for this deployment, so no canonical home is reachable",
        );
      }
      return boundaryClient.submit({
        workspaceId: input.workspaceId,
        operation: input.operation,
        ...(input.operationId === undefined ? {} : { operationId: input.operationId }),
      });
    },
  };

  const policyCommands =
    profile.policy?.allowed_commands.map((command) => ({
      executable: command.executable,
      argv_prefix: [...command.argv_prefix],
    })) ?? PACKAGED_DEFAULT_COMMANDS;
  const deploymentStandard = deriveProjectStandard({
    repository: profile.repository,
    policyCommands,
    ...(profile.standard === undefined ? {} : { statement: profile.standard.statement }),
    confirmed: profile.standard !== undefined,
  });
  // The policy is the operator's bound; the standard narrows it to what this repository can
  // actually run. A deployment with a repository never falls back to a packaged command.
  const authorized = authorizedCommands(deploymentStandard, policyCommands);
  const deploymentPolicy = trustedDefaultPolicy({
    allowed_commands: (authorized.length > 0 ? authorized : policyCommands).map((command) => ({
      executable: command.executable,
      argv_prefix: [...command.argv_prefix],
    })),
  });

  const installed = installPalimpsest(context, {
    projectId: profile.projectId,
    databasePath: profile.databases.orchestration,
    ordariumDatabasePath: profile.databases.ordarium,
    ...(profile.repository === undefined ? {} : { repository: profile.repository }),
    ...(profile.execution === undefined ? {} : { execution: profile.execution }),
    // PLMP-LEAN-1 §1: the project's done-ness is DERIVED here from the repository, intersected
    // with the operator's policy bound (never widened by it), and — when the operator confirmed it
    // with a `standard` sentence — handed to the controller, which declares the release gate at
    // genesis. This is what removes "recite predicate vocabulary" and "declare a gate through the
    // CLI" from the operator's job; the derivation is reported either way, notes included.
    policy: deploymentPolicy,
    standard: deploymentStandard,
    localPeer,
    coordinationStore,
    peerTransportPort: peerTransportFromDurable(transport, { localPeer }),
    peerDirectoryPort: deploymentPeerDirectory(profile.directory),
    ...(projectPeerDirectory === undefined ? {} : { projectPeerDirectory }),
    ...(knownIndependentPeers === undefined ? {} : { knownIndependentPeers }),
    attemptCatalog: deploymentAttemptCatalog(profile.databases.orchestration),
    ...(boundaryMemoryStore === undefined ? {} : { boundaryMemoryStore }),
    ...(runtimeScopeStore === undefined ? {} : { runtimeScopeStore }),
    ...(projectAssociationStore === undefined ? {} : { projectAssociationStore }),
    ...(projectJournalStore === undefined ? {} : { projectJournalStore }),
    ...(managementPreferenceStore === undefined ? {} : { managementPreferenceStore }),
    ...(profile.boundaryHomeId === undefined ? {} : { boundaryHomeId: profile.boundaryHomeId }),
    ...(continuityAssociations === undefined ? {} : { peerContinuityAssociations: continuityAssociations }),
    ...(profile.attention === undefined
      ? {}
      : {
          attentionPolicy: { policyId: profile.attention.policyId, cooldownMs: profile.attention.cooldownMs },
        }),
    ...(marks === undefined ? {} : { attentionMarkStore: marks }),
    ...(activation === undefined ? {} : { attentionActivation: activation }),
    ...(reasoningStore === undefined
      ? {}
      : {
          // UX-C §11/§12: the packaged policies are EXPLORATORY by construction. A
          // deployment that needs stronger semantics composes its own policies through
          // the expert `installPalimpsest` API; this bundle never fabricates support and
          // never replaces a caller-supplied policy (it only supplies one when the
          // profile asked for the first-party bundle).
          reasoningCellStore: reasoningStore,
          reasoningVerificationPolicy: firstPartyExploratoryVerificationPolicy(),
          reasoningAdmissionPolicy: firstPartyExploratoryAdmissionPolicy(),
        }),
    ...(reasoningBranchExecution === undefined ? {} : { reasoningBranchExecution }),
    ...(delegationBranchExecution === undefined ? {} : { delegationBranchExecution }),
    // The stable late-bound READ port: the delegation service holds THIS object for its whole life,
    // and whatever the host binds later becomes the delivery. A terminal result that arrives before a
    // binding reports `delivered: false` with that reason instead of vanishing.
    ...(delegationDelivery === undefined
      ? {}
      : {
          delegationDelivery: {
            get adapterId(): string {
              return delegationDelivery.port?.adapterId ?? "unbound";
            },
            deliver: async (text: string) => {
              const port = delegationDelivery.port;
              if (port === undefined) {
                return {
                  delivered: false,
                  detail:
                    "no principal delivery is bound yet; the host binds one once it has created or resumed the principal session",
                };
              }
              return port.deliver(text);
            },
          },
        }),
    ...(options.host?.facts === undefined ? {} : { hostFacts: options.host.facts }),
    remoteTransport,
  });

  const pump = makeFederationInboundPump({
    transport,
    localPeer,
    cursorStore,
    consumerId: profile.profileId,
    ...(installed.federation === undefined ? {} : { federation: installed.federation }),
    ...(installed.boundaryHome === undefined ? {} : { boundaryHome: installed.boundaryHome }),
  });

  async function pumpAndActivate(input?: { readonly fromStart?: boolean }): Promise<DeploymentPumpReport> {
    const report = await pump.pumpOnce(input);
    if (installed.attention === undefined) {
      return { pump: report, signals: [], activations: [] };
    }
    const signals = await installed.attention.drain();
    const activations: DeploymentActivationReport[] = [];
    // Pull mode remains valid: without an activation adapter the signals are returned
    // and stay pending (never marked delivered), so the inbox stays the truth path.
    if (activation === undefined) return { pump: report, signals, activations };
    for (const signal of signals) {
      const outcome = await activation.activate(signal);
      activations.push({ signal, outcome });
      if (outcome.activated) await installed.attention.markDelivered([signal.signalId]);
    }
    return { pump: report, signals, activations };
  }

  let decisionCounter = 0;
  async function submitRemoteCommitmentDecision(input: {
    readonly to: PeerRef;
    readonly commitmentId: string;
    readonly decision: "accept" | "reject" | "release";
    readonly operationId?: string | undefined;
  }): Promise<{ readonly operationId: string; readonly delivered: boolean }> {
    const operationId =
      input.operationId ?? `cd-${profile.profileId}-${input.commitmentId}-${input.decision}-${++decisionCounter}`;
    const result = await transport.submit({
      operationId,
      from: localPeer,
      to: input.to,
      operation: { kind: `commitment_${input.decision}`, commitmentId: input.commitmentId },
    });
    return { operationId, delivered: result.delivered };
  }

  function attentionClass(): HostCollaborationReadiness["attention"] {
    if (installed.attention === undefined) return "ABSENT";
    const adapterId = activation?.adapterId;
    // `ACTIVE` means a host WAKE is really bound. The null/unbound/unavailable adapters
    // derive signals but activate nothing, so they are honestly PULL.
    return adapterId === "dsh-agents" || adapterId === "pi-host" ? "ACTIVE" : "PULL";
  }

  function bindAttentionActivation(next: AttentionActivationPort | undefined): void {
    // §26/SC-14: an explicit `activation: "none"` profile is pull mode and is NEVER
    // flipped active by the host. With no attention configured there is nothing to bind.
    if (explicitPullMode || profile.attention === undefined) return;
    activation = next;
  }

  function bindDelegationDelivery(next: PrincipalDeliveryPort | undefined): void {
    // A deployment with no delivery seam (pull mode, or no DSH agent) has nothing to bind, and binding
    // one must not silently CREATE the capability the install already decided against.
    if (delegationDelivery === undefined) return;
    delegationDelivery.port = next;
  }

  function collaborationReadiness(): HostCollaborationReadiness {
    return deriveHostCollaborationReadiness({
      advisorPresent: installed.application.advisor !== undefined,
      reasoningStoreConfigured: reasoningStore !== undefined,
      branchAdapter: reasoningBranchExecution?.adapterId,
      projectVerificationAvailable: installed.application.verification !== undefined || installed.verification !== undefined,
      crossProjectAvailable: installed.application.crossProject !== undefined,
      inboundPumpConfigured: true,
      attention: attentionClass(),
      coldResume: activation?.adapterId === "dsh-agents" ? "AVAILABLE" : "UNAVAILABLE",
    });
  }

  return {
    profile,
    localPeer,
    installed,
    transport,
    pump,
    submitRemoteCommitmentDecision,
    reasoning: Object.freeze({
      storeConfigured: reasoningStore !== undefined,
      storeOwned: reasoningStore !== undefined,
      ...(reasoningBranchExecution === undefined ? {} : { branchAdapter: reasoningBranchExecution.adapterId }),
    }),
    ...(installed.attention === undefined ? {} : { attention: installed.attention }),
    get attentionActivation(): AttentionActivationPort | undefined {
      return activation;
    },
    ...(boundaryClient === undefined ? {} : { boundaryClient }),
    pumpAndActivate,
    bindAttentionActivation,
    bindDelegationDelivery,
    collaborationReadiness,
    async close() {
      await installed.dispose();
      // UX-C §9/SC-4: close ONLY the store this deployment created. A store supplied by
      // the caller keeps its own lifetime (the install never closes it either).
      reasoningStore?.close();
      coordinationStore.close();
      boundaryMemoryStore?.close();
      runtimeScopeStore?.close();
      // The G10-V workspace/management stores are closed by `installed.dispose()` above.
      transport.close();
      cursorStore.close();
      marks?.close();
    },
  };
}
