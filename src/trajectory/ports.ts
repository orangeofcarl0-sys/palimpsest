/**
 * Trajectory-T0 §5 (T0-D) — the READ-ONLY structural ports the projection consumes.
 *
 * The projection layer must NOT reach into a deployment/composition layer to obtain owner
 * services. So T0 declares the SHAPE of the reads it needs, and composition adapts the real
 * owners into these ports. Every port method is a read; there is no method that writes.
 *
 * Two consequences worth stating, because they are the point of the boundary:
 *
 *   1. `src/trajectory/**` names no owner implementation. It can therefore be satisfied by a
 *      real owner, by a composition adapter, or by a fixture — and the projection cannot tell
 *      the difference, which is exactly why the projection owns no authority.
 *   2. There is no `append`, `settle`, `publish`, `admit`, `revise` or `promote` anywhere in this
 *      file. Trajectory is read-only by construction, not by discipline (T0-I1).
 */
import type { SchedulerEvent } from "../schema/index.js";

/* ------------------------------------------------------------------ *
 * Work / ProjectIR — the canonical Work history
 * ------------------------------------------------------------------ */

/** §5: the Work history as the owner exposes it. The chain is verified by T0, not by the port. */
export interface TrajectoryWorkPort {
  /**
   * The project's committed events in `project_sequence` order.
   *
   * This is `EventStore.listEvents(projectId)`. T0 does NOT trust it blindly: it re-parses each
   * event through the owner parser and re-verifies sequence continuity, previous-digest linkage
   * and causation references (§5 "Work event validation").
   */
  listProjectEvents(projectId: string): Promise<readonly SchedulerEvent[]>;

  /**
   * The attempt's historical world basis, or null when the attempt has none.
   *
   * Historical and immutable per attempt — a later world is what `assessCurrentness` reports,
   * never a reason to rewrite what the attempt started from.
   */
  readWorldBasis(attemptId: string): Promise<TrajectoryWorldBasis | null>;

  /** §4: currentness for one attempt, or null when it has no recorded basis. */
  assessCurrentness(attemptId: string): Promise<TrajectoryCurrentnessAssessment | null>;

  /** The committed promotion facts for the project, in event order. */
  readPromotions(projectId: string): Promise<readonly TrajectoryPromotionFact[]>;
}

/** §5: the historical basis of one attempt, as a reference (never the whole basis object). */
export interface TrajectoryWorldBasis {
  readonly attemptId: string;
  readonly taskId: string;
  readonly basisDigest: string;
  readonly capturedAtRevision: number;
  readonly capturedAt: string;
}

/**
 * §4: the currentness verdict for one attempt.
 *
 * `basisDigest` is B_0 (unchanged by the call); `currentBasisDigest` is B_1, the basis
 * re-resolved against the current world. They are distinct fields so a reader can never mistake
 * one for the other.
 */
export interface TrajectoryCurrentnessAssessment {
  readonly attemptId: string;
  readonly basisDigest: string;
  readonly currentBasisDigest: string;
  readonly currentness: "CURRENT" | "STALE" | "UNKNOWN";
  readonly reasons: readonly string[];
  readonly detail: string;
}

/** §5: one committed promotion, as the promotion owner records it. */
export interface TrajectoryPromotionFact {
  readonly eventId: number;
  readonly promotionId: string;
  readonly attemptId: string;
  readonly sourceCommit: string;
  readonly expectedHeadCommit: string;
  readonly resultingHeadCommit: string;
}

/* ------------------------------------------------------------------ *
 * Reasoning Cell — a per-cell chained history
 * ------------------------------------------------------------------ */

/** §5: the minimum a Reasoning event must expose for T0 to reference it. */
export interface TrajectoryReasoningEvent {
  readonly cellId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly chainDigest: string;
}

/** §5: the reasoning cell store, as a read-only port. */
export interface TrajectoryReasoningPort {
  /** The cell's full ordered event history. Throws on a seq gap or chain corruption. */
  replay(cellId: string): Promise<readonly TrajectoryReasoningEvent[]>;
  /** The cell's store basis (throughSeq + chainDigest), or null when the cell is unknown. */
  basis(cellId: string): Promise<{ readonly cellId: string; readonly throughSeq: number; readonly chainDigest: string } | null>;
  /**
   * The accepted frontier: the active admitted claims and the frozen frontier basis.
   *
   * The frontier digest CHANGES when a claim is admitted or invalidated, which is what makes a
   * post-observation frontier change detectable (§4 observation-window consistency).
   */
  frontier(cellId: string): Promise<TrajectoryReasoningFrontier | null>;
}

export interface TrajectoryReasoningFrontier {
  readonly cellId: string;
  readonly frontierRevision: number;
  readonly frontierDigest: string;
  readonly activeClaimIds: readonly string[];
  readonly inactiveClaimIds: readonly string[];
}

/* ------------------------------------------------------------------ *
 * Proof Asset — the evidence-plane chained history
 * ------------------------------------------------------------------ */

/** §5: the minimum a Proof event must expose for T0 to reference it. */
export interface TrajectoryProofEvent {
  readonly eventId: string;
  readonly seq: number;
  readonly scopeId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly chainDigest: string;
}

/**
 * §5: the proof plane's read-only view.
 *
 * Standing is TEMPORAL. `proofClaimView` reports the CURRENT effective standing, which may differ
 * from the standing recorded at publication. T0 keeps those as separate facts and never
 * overwrites the historical one (§4 currentness; §7 B-N5/G-N13).
 */
export interface TrajectoryProofPort {
  replay(): Promise<readonly TrajectoryProofEvent[]>;
  basis(): Promise<{ readonly scopeId: string; readonly throughSeq: number; readonly chainDigest: string } | null>;
  /** The current view of a published claim, or null when it is not a published claim. */
  proofClaimView(claimId: string): Promise<TrajectoryProofClaimView | null>;
}

export interface TrajectoryProofClaimView {
  readonly claimId: string;
  readonly claimType: string;
  /** The standing recorded when the claim was published. Never rewritten. */
  readonly publishedStanding: string | null;
  /** The standing computed from the CURRENT plane. May differ from `publishedStanding`. */
  currentEffectiveStanding: string;
  readonly freshness: string;
  /** The evidence items that supported the published claim. */
  readonly supportingEvidenceIds: readonly string[];
}

/* ------------------------------------------------------------------ *
 * Project Workspace — journal + association
 * ------------------------------------------------------------------ */

/** §5: one journal event, as the workspace owner records it. */
export interface TrajectoryJournalEvent {
  readonly scopeId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly chainDigest: string;
}

/** §5: one project↔asset association. */
export interface TrajectoryAssociation {
  readonly associationId: string;
  readonly projectId: string;
  readonly assetKind: string;
  readonly canonicalRef: { readonly kind: string; readonly id: string; readonly digest?: string | undefined };
  readonly associationKind: string;
  readonly provenance: string;
}

/** §5: the workspace owner's read-only view. */
export interface TrajectoryWorkspacePort {
  replayJournal(projectId: string): Promise<readonly TrajectoryJournalEvent[]>;
  journalBasis(projectId: string): Promise<{ readonly scopeId: string; readonly throughSeq: number; readonly chainDigest: string } | null>;
  associations(projectId: string): Promise<readonly TrajectoryAssociation[]>;
}

/* ------------------------------------------------------------------ *
 * Project Intent — the accepted reconciliation receipts
 * ------------------------------------------------------------------ */

/**
 * §5: the accepted intent receipt, as the owner persists it inside the PROJECT_REVISED payload.
 *
 * T0 reads this from the Work event log (`payload.intent_reconciliation`) and re-derives its
 * digest through the owner parser, so a tampered receipt is refused rather than believed.
 */
export interface TrajectoryIntentReceipt {
  readonly proposalId: string;
  readonly proposalDigest: string;
  readonly proposalBasis: {
    readonly projectId: string;
    readonly revision: number;
    readonly digest: string;
    readonly headCommit: string;
  };
  readonly groundBindings: readonly unknown[];
  readonly rationale: string;
  readonly admission: {
    readonly decision: "ADMIT";
    readonly policyRef: { readonly policyId: string; readonly version: string };
    readonly provenanceDigest: string;
  };
  readonly acceptedAt: string;
  readonly digest: string;
}

/* ------------------------------------------------------------------ *
 * Host Observation (G1-B) — deliberately quarantined
 * ------------------------------------------------------------------ */

/**
 * §5 "Optional Host evidence": the maximal admitted status a G1-B observation can reach inside T0.
 *
 * T0 does NOT let a host observation establish a verified execution-causation edge. Until G1-B's
 * authority-bearing readback contract is closed, this is the ceiling — and T0 may simply omit the
 * input and record it as an unavailable capability.
 */
export const HOST_OBSERVATION_ADMISSION = "LOCAL_HOST_OBSERVATION_UNVERIFIED_FOR_CAUSAL_ADMISSION" as const;
export type HostObservationAdmission = typeof HOST_OBSERVATION_ADMISSION;

export interface TrajectoryHostObservationPort {
  /**
   * Local, non-canonical observations for one attempt. Whatever this returns, T0 admits it only
   * at `LOCAL_HOST_OBSERVATION_UNVERIFIED_FOR_CAUSAL_ADMISSION`.
   */
  observationsFor(attemptId: string): Promise<
    readonly {
      readonly observationRef: string;
      readonly eventKind: string;
      readonly at: string;
      /** A producer-claimed correlation state. T0 records it and never promotes it to an edge. */
      readonly claimedState: string;
    }[]
  >;
}

/* ------------------------------------------------------------------ *
 * The composed input
 * ------------------------------------------------------------------ */

/**
 * §5: the projection's whole input surface.
 *
 * `reasoning`, `proof`, `workspace` and `hostObservation` are optional because a deployment may
 * not compose them — and an absent owner must be recorded as `NOT_COMPOSED`, never silently
 * treated as an empty history (T0-I6).
 */
export interface TrajectoryProjectionInputs {
  readonly projectId: string;
  readonly work: TrajectoryWorkPort;
  readonly reasoning?: TrajectoryReasoningPort | undefined;
  readonly proof?: TrajectoryProofPort | undefined;
  readonly workspace?: TrajectoryWorkspacePort | undefined;
  readonly hostObservation?: TrajectoryHostObservationPort | undefined;
}
