/**
 * SR-1 §11/§12 — optional-capability port adapters.
 *
 * These five helpers were private functions inside `src/install.ts`. Each one adapts an
 * EXISTING owner's store or service into a narrow read-only port that a different capability
 * consumes, and each is used only when the corresponding optional store is supplied. They
 * carry no policy, own no state and decide nothing; moving them here is a pure relocation
 * that keeps the composition root from holding capability adaptation details.
 *
 * They stay module-private (`export` only for `install.ts`), because nothing else may reach
 * for them: exposing an adapter is what SR-1 §15 forbids doing accidentally.
 */

import type { CampaignStore } from "../campaign/index.js";
import { linkedProjectRefs, projectLinkedProjects } from "../campaign/index.js";
import type { CoordinationStore } from "../coordination/index.js";
import { externalAssetImportProvenanceOf } from "../external_assets/index.js";
import type {
  CampaignActivityObservation,
  CampaignActivityPort,
  DynamicsCollaborationPort,
} from "../organization_dynamics/index.js";
import type {
  ManagementAutonomyProfile,
  ManagementInvolvement,
  UserManagementControlPort,
} from "../project_management/index.js";
import {
  DEFAULT_MAX_STEPS_PER_RUN,
  defaultAllowedActionClasses,
  defaultConfirmationBoundaries,
  defaultManagementProfile,
  materializeManagementProfile,
} from "../project_management/index.js";
import type { ProjectJournalEntry, ProjectWorkspaceCampaignPort, WorkspaceExternalImportView } from "../project_workspace/index.js";

/**
 * G10-J CF-I-02: derive a read-only Campaign activity observation. Counts are mechanical
 * facts about canonical Campaign history — never value, health, or dissolution authority.
 */
export function campaignActivityPort(store: CampaignStore): CampaignActivityPort {
  return {
    observe: async (campaignId): Promise<CampaignActivityObservation> => {
      const definition = await store.definition(campaignId);
      if (definition === undefined) {
        return {
          campaignId,
          exists: false,
          lifecycle: null,
          basisThroughSeq: null,
          chainDigest: null,
          semanticEventCount: 0,
          activeCommitmentCount: 0,
          activeWatchCount: 0,
          inFlightWake: null,
          state: "known",
        };
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
export function coordinationObservationPort(store: CoordinationStore): DynamicsCollaborationPort {
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

/**
 * G10-V: a read-only, in-memory DIRECT management control. It is used only when no
 * `managementPreferenceStore` is supplied: reads degrade to the safe DIRECT default, and a
 * write fails closed (the operator must configure a store; the agent-facing path never writes).
 */
export function directManagementControl(clock: () => string): UserManagementControlPort {
  return {
    get: async (projectId: string): Promise<ManagementAutonomyProfile> => defaultManagementProfile(projectId, "operator:unset"),
    set: async (input: {
      readonly projectId: string;
      readonly involvement: ManagementInvolvement;
      readonly updatedBy: string;
    }): Promise<ManagementAutonomyProfile> =>
      materializeManagementProfile({
        projectId: input.projectId,
        involvement: input.involvement,
        budgets: { maxStepsPerRun: DEFAULT_MAX_STEPS_PER_RUN },
        allowedActionClasses: defaultAllowedActionClasses(input.involvement),
        confirmationBoundaries: defaultConfirmationBoundaries(input.involvement),
        updatedAt: clock(),
        updatedBy: input.updatedBy,
      }),
  };
}

/**
 * G10-V: adapt the canonical Campaign stores into the workspace's read-only project-ref port.
 * It DERIVES complete `(projectId, revision, digest)` references from canonical history; a
 * campaign whose linked-project projection reports an identity conflict is skipped (never
 * guessed), so the workspace can still show the other campaigns' relations honestly.
 */
export function campaignProjectRefPort(store: CampaignStore): ProjectWorkspaceCampaignPort {
  return {
    projectRefs: async (): Promise<readonly { readonly projectId: string; readonly revision: number; readonly digest: string }[]> => {
      const refs: { readonly projectId: string; readonly revision: number; readonly digest: string }[] = [];
      for (const definition of await store.campaigns()) {
        const projection = projectLinkedProjects(await store.replay(definition.campaignId));
        if (projection.status !== "known") continue;
        for (const ref of linkedProjectRefs(projection)) refs.push(ref);
      }
      return Object.freeze(refs);
    },
  };
}

/**
 * G10-AE §16/§26: the workspace's read-only view of an IMPORTED journal entry.
 * The bridge plane owns the structured `ExternalAssetImportProvenance` artifact and
 * re-verifies its digest against the entry's `relatedRefs`, so a prose-only
 * lookalike is never reported as an external import.
 */
export function externalImportViewOf(entry: ProjectJournalEntry): WorkspaceExternalImportView | undefined {
  const provenance = externalAssetImportProvenanceOf(entry);
  if (provenance === undefined) return undefined;
  return Object.freeze({
    entryId: entry.entryId,
    journalKind: entry.kind,
    title: entry.title,
    createdAt: entry.createdAt,
    providerId: provenance.providerId,
    assetId: provenance.assetId,
    contentDigest: provenance.contentDigest,
    refDigest: provenance.refDigest,
    provenanceDigest: provenance.digest,
    operationId: provenance.importOperationId,
    ...(provenance.sourceLocator === undefined ? {} : { sourceLocator: provenance.sourceLocator }),
  });
}
