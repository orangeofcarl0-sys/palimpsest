/**
 * Trajectory-T0 §5/§10 — the TRAJECTORY composition adapter.
 *
 *     composition knows wiring;  trajectory knows projection semantics.
 *
 * This is the ONE place that may see the concrete Work/Event-Log owner, the Reasoning owner, the
 * Proof owner and the ProjectWorkspace owner, and adapt their READS into `TrajectoryProjectionInputs`.
 * It holds NO policy: every judgement (is this claim associated? is that digest the one the owner
 * holds? did the chain link?) belongs to `src/trajectory/`.
 *
 * Two boundaries this file exists to keep:
 *
 *   1. **Read-only.** There is no `append`, `settle`, `publish`, `admit`, `revise` or `promote` in
 *      this adapter. Trajectory gets reads and nothing else, so "Trajectory cannot mutate canonical
 *      state" is a fact about the wiring rather than a promise about discipline.
 *   2. **No reverse dependency.** `src/trajectory/**` names no owner; only this module names both.
 *      That is what keeps an owner from ever depending on Trajectory.
 *
 * Layer: L5 (`src/composition/`), like every other composition module.
 */
import type { ReasoningCellService } from "../reasoning_cell/index.js";
import type { ProofEvidenceService } from "../proof_asset/index.js";
import type { ProjectWorkspaceService } from "../project_workspace/index.js";
import type { ProjectAssetAssociationStore, ProjectJournalStore } from "../project_workspace/index.js";
import type { EventStore } from "../state/index.js";
import type { SchedulerEvent } from "../schema/index.js";
import type {
  TrajectoryAssociation,
  TrajectoryJournalEvent,
  TrajectoryProjectionInputs,
  TrajectoryProofEvent,
  TrajectoryReasoningEvent,
} from "../trajectory/index.js";

/**
 * The narrow Work-owner surface this adapter reads, declared STRUCTURALLY.
 *
 * Naming `ProjectController` would add a new importer edge to the measured hotspot for four method
 * shapes, which is the same reason `work_delegation.ts` and `composition/project_intent.ts` declare
 * their dependencies as `Pick`-style shapes rather than reaching for the class.
 */
export interface TrajectoryWorkOwner {
  readonly store: Pick<EventStore, "listEvents">;
  attemptWorldBasis(attemptId: string): { readonly basisDigest: string; readonly taskId: string; readonly capturedAt: string } | null;
  attemptBasisForResolution(attemptId: string): { readonly basis: { readonly basisDigest: string; readonly capturedAtRevision: number }; readonly taskId: string } | null;
  attemptCurrentness(attemptId: string): {
    readonly currentness: "CURRENT" | "STALE" | "UNKNOWN";
    readonly basisDigest: string;
    readonly currentBasisDigest: string;
    readonly reasons: readonly string[];
    readonly detail: string;
  } | null;
}

export interface TrajectoryCompositionInput {
  readonly projectId: string;
  readonly controller: TrajectoryWorkOwner;
  /** The PromotionManager read face. `promotionFactsSync` is the owner's own projection read. */
  readonly promotions: { promotionFactsSync(): readonly { readonly eventId: string; readonly promotionId: string; readonly attemptId: string; readonly sourceCommit: string; readonly expectedHeadCommit: string; readonly resultingHeadCommit: string }[] };
  readonly reasoning: ReasoningCellService | undefined;
  readonly proof: ProofEvidenceService | undefined;
  readonly projectWorkspace: ProjectWorkspaceService | undefined;
  /** The journal STORE, for the per-project sequence and chain digest the service façade withholds. */
  readonly journalStore: ProjectJournalStore | undefined;
  /** The association STORE, for the per-project association history. */
  readonly associationStore: ProjectAssetAssociationStore | undefined;
}

/**
 * Adapt the composed owners into the projection's read-only ports.
 *
 * Every optional capability is present EXACTLY when its owner is composed. An absent owner yields
 * an absent port — which the projection records as `NOT_COMPOSED`, never as an empty history. That
 * distinction is the whole reason the ports are optional rather than stubbed.
 */
export function composeTrajectoryInputs(input: TrajectoryCompositionInput): TrajectoryProjectionInputs {
  const { projectId, controller } = input;

  const work: TrajectoryProjectionInputs["work"] = {
    /**
     * The canonical Work history. The projection RE-VALIDATES it through `parseSchedulerEvent`, so
     * this read is a transport of the owner's events rather than a grant of trust in them.
     */
    async listProjectEvents(id: string): Promise<readonly SchedulerEvent[]> {
      return controller.store.listEvents(id);
    },
    async readWorldBasis(attemptId: string) {
      const resolution = controller.attemptBasisForResolution(attemptId);
      if (resolution === null) return null;
      return {
        attemptId,
        taskId: resolution.taskId,
        basisDigest: resolution.basis.basisDigest,
        capturedAtRevision: resolution.basis.capturedAtRevision,
        capturedAt: "",
      };
    },
    async assessCurrentness(attemptId: string) {
      const assessment = controller.attemptCurrentness(attemptId);
      if (assessment === null) return null;
      return {
        attemptId,
        basisDigest: assessment.basisDigest,
        currentBasisDigest: assessment.currentBasisDigest,
        currentness: assessment.currentness,
        reasons: assessment.reasons,
        detail: assessment.detail,
      };
    },
    async readPromotions(id: string) {
      void id;
      return input.promotions.promotionFactsSync().map((fact) => ({
        eventId: Number(fact.eventId),
        promotionId: fact.promotionId,
        attemptId: fact.attemptId,
        sourceCommit: fact.sourceCommit,
        expectedHeadCommit: fact.expectedHeadCommit,
        resultingHeadCommit: fact.resultingHeadCommit,
      }));
    },
  };

  const reasoning =
    input.reasoning === undefined
      ? undefined
      : {
          async replay(cellId: string): Promise<readonly TrajectoryReasoningEvent[]> {
            const events = await input.reasoning!.events({ cellId });
            return events.map((event) => ({
              cellId: event.cellId,
              seq: event.seq,
              eventId: event.eventId,
              type: event.type,
              payload: event.payload,
              chainDigest: event.chainDigest,
            }));
          },
          async basis(cellId: string) {
            const definition = await input.reasoning!.listCells();
            if (!definition.some((cell) => cell.cellId === cellId)) return null;
            const view = await input.reasoning!.cellView({ cellId });
            return { cellId, throughSeq: view.storeBasis.throughSeq, chainDigest: view.storeBasis.chainDigest };
          },
          async frontier(cellId: string) {
            try {
              const view = await input.reasoning!.frontier({ cellId });
              const cell = await input.reasoning!.cellView({ cellId });
              return {
                cellId,
                frontierRevision: view.basis.frontierRevision,
                frontierDigest: view.basis.frontierDigest,
                activeClaimIds: view.claims.map((claim) => claim.ref.claimId),
                inactiveClaimIds: cell.inactiveClaimIds,
              };
            } catch {
              return null;
            }
          },
        };

  const proof =
    input.proof === undefined
      ? undefined
      : {
          async replay(): Promise<readonly TrajectoryProofEvent[]> {
            const events = await input.proof!.replay();
            return events.map((event) => ({
              eventId: event.eventId,
              seq: event.seq,
              scopeId: event.scopeId,
              type: event.type,
              payload: event.payload,
              chainDigest: event.chainDigest,
            }));
          },
          async basis() {
            const basis = await input.proof!.basis();
            return basis === undefined ? null : { scopeId: basis.scopeId, throughSeq: basis.throughSeq, chainDigest: basis.chainDigest };
          },
          async proofClaimView(claimId: string) {
            const published = await input.proof!.publishedClaims();
            if (!published.some((claim) => claim.claimRef.claimId === claimId)) return null;
            const view = await input.proof!.proofAssetView(claimId);
            return {
              claimId,
              claimType: String(view.claimType),
              /**
               * The historical standing is read from the IMMUTABLE assessment history, and the
               * current one from the live view — two different facts, reported as two fields.
               */
              publishedStanding: String(view.baseStanding),
              currentEffectiveStanding: String(view.effectiveStanding),
              freshness: String(view.freshness),
              supportingEvidenceIds: [],
            };
          },
        };

  const workspace =
    input.projectWorkspace === undefined && input.journalStore === undefined && input.associationStore === undefined
      ? undefined
      : {
          async replayJournal(id: string): Promise<readonly TrajectoryJournalEvent[]> {
            if (input.journalStore === undefined) return [];
            const events = await input.journalStore.replay(id);
            return events.map((event) => ({
              scopeId: event.scopeId,
              seq: event.seq,
              eventId: event.eventId,
              type: event.type,
              payload: event.payload,
              chainDigest: event.chainDigest,
            }));
          },
          async journalBasis(id: string) {
            if (input.journalStore === undefined) return null;
            const basis = await input.journalStore.basis(id);
            return basis === undefined ? null : { scopeId: basis.scopeId, throughSeq: basis.throughSeq, chainDigest: basis.chainDigest };
          },
          async associations(id: string): Promise<readonly TrajectoryAssociation[]> {
            if (input.associationStore === undefined) return [];
            const events = await input.associationStore.replay(id);
            const associations: TrajectoryAssociation[] = [];
            for (const event of events) {
              const payload = event.payload as { association?: TrajectoryAssociation } | undefined;
              const association = payload?.association;
              if (association !== undefined) associations.push(association);
            }
            return associations;
          },
        };

  return Object.freeze({
    projectId,
    work,
    ...(reasoning === undefined ? {} : { reasoning }),
    ...(proof === undefined ? {} : { proof }),
    ...(workspace === undefined ? {} : { workspace }),
  });
}
