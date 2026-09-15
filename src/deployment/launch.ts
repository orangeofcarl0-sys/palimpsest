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
import type { RemoteSubmissionPort } from "../application/surface.js";
import type { ProjectAgentDeploymentProfile } from "./profile.js";

/** Optional host services; the profile selects the KIND, the host supplies the instance. */
export interface DeploymentHostServices {
  readonly dshAgents?: Parameters<typeof dshAgentsAttentionAdapter>[0]["agents"] | undefined;
  readonly pi?: Parameters<typeof piAttentionAdapter>[0]["pi"] | undefined;
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
  /** Drain the mailbox, then derive + (optionally) activate attention. Safe to repeat. */
  pumpAndActivate(input?: { readonly fromStart?: boolean }): Promise<DeploymentPumpReport>;
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

  const activation: AttentionActivationPort | undefined =
    profile.attention === undefined
      ? undefined
      : profile.attention.activation === "none"
        ? nullAttentionAdapter()
        : profile.attention.activation === "dsh"
          ? options.host?.dshAgents === undefined
            ? unavailableActivation("dsh")
            : dshAgentsAttentionAdapter({
                agents: options.host.dshAgents,
                resumeSessionId: profile.attention.sessionId!,
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

  const installed = installPalimpsest(context, {
    projectId: profile.projectId,
    databasePath: profile.databases.orchestration,
    ordariumDatabasePath: profile.databases.ordarium,
    ...(profile.repository === undefined ? {} : { repository: profile.repository }),
    localPeer,
    coordinationStore,
    peerTransportPort: peerTransportFromDurable(transport, { localPeer }),
    peerDirectoryPort: deploymentPeerDirectory(profile.directory),
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

  return {
    profile,
    localPeer,
    installed,
    transport,
    pump,
    submitRemoteCommitmentDecision,
    ...(installed.attention === undefined ? {} : { attention: installed.attention }),
    ...(activation === undefined ? {} : { attentionActivation: activation }),
    ...(boundaryClient === undefined ? {} : { boundaryClient }),
    pumpAndActivate,
    async close() {
      await installed.dispose();
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
