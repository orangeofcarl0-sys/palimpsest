/**
 * Trajectory-T0 §4 (T0-C) — the MULTI-OWNER BASIS VECTOR.
 *
 * Palimpsest has several independent histories: Work uses per-project sequences and digests, a
 * Reasoning Cell uses a per-cell sequence and chain digest, Proof has its own evidence-plane
 * sequence and chain digest, the Project Journal has its own per-project event basis. NO shared
 * wall-clock timestamp makes these streams globally atomic (T0-I3).
 *
 * So a trajectory never claims one globally authoritative total order. It records the ACTUAL
 * recorded position in each available owner history — a vector of cursors — plus an explicit
 * statement of which owners were unavailable. A missing owner is recorded as unavailable, never
 * as an empty history (T0-I6).
 */
import { canonicalDigest } from "../schema/index.js";

/** §4: one owner's recorded position, or an explicit statement that it could not be read. */
export const OWNER_BASIS_AVAILABILITY = [
  /** The owner was read and its cursor is recorded. */
  "AVAILABLE",
  /** The owner exists but holds nothing at the requested cut. */
  "EMPTY",
  /** The owner could not be read at all. NEVER interpreted as an empty history. */
  "UNAVAILABLE",
  /** The owner's plane does not exist in this composition. */
  "NOT_COMPOSED",
] as const;
export type OwnerBasisAvailability = (typeof OWNER_BASIS_AVAILABILITY)[number];

export interface OwnerBasisCursor {
  readonly availability: OwnerBasisAvailability;
  /** The owner's scope (projectId, cellId, proof scope id). */
  readonly scope: string | null;
  /** The per-owner sequence position, when the owner has one. */
  readonly throughSequence: number | null;
  /** The owner's chain digest / basis digest, when the owner records one. */
  readonly digest: string | null;
  /** Why this cursor holds the state it does. */
  readonly detail: string;
}

/** §4: the Work / ProjectIR component of the vector. */
export interface WorkBasisComponent {
  readonly projectId: string;
  /** The highest project_sequence included in this projection. */
  readonly projectSequence: number | null;
  /** The event_digest at that sequence — the per-project chain position. */
  readonly eventDigest: string | null;
  /** The ProjectIR revision the Work history had reached at the cut. */
  readonly projectIrRevision: number | null;
  readonly projectIrDigest: string | null;
}

/** §4: one Reasoning Cell position. */
export interface ReasoningBasisComponent extends OwnerBasisCursor {
  readonly cellId: string;
  readonly frontierRevision: number | null;
  readonly frontierDigest: string | null;
}

/** §4: the Proof evidence-plane position. */
export interface ProofBasisComponent extends OwnerBasisCursor {
  readonly scopeId: string | null;
}

/** §4: the Project Journal position. */
export interface JournalBasisComponent extends OwnerBasisCursor {
  readonly projectId: string;
}

/** §4: one World / Attempt basis reference, when one exists for a referenced attempt. */
export interface WorldBasisComponent extends OwnerBasisCursor {
  readonly attemptId: string;
  readonly basisDigest: string | null;
}

/**
 * §4: the full recorded position across every available owner history.
 *
 * `completeness` is a first-class field rather than something a reader infers: a vector built
 * while one owner was unreadable is `INCOMPLETE`, and a projection over it must not present its
 * result as globally consistent (T0-I6).
 */
export const BASIS_VECTOR_COMPLETENESS = ["COMPLETE", "INCOMPLETE", "RACED"] as const;
export type BasisVectorCompleteness = (typeof BASIS_VECTOR_COMPLETENESS)[number];

export interface TrajectoryBasisVector {
  readonly schemaVersion: 1;
  readonly work: WorkBasisComponent;
  readonly projectIr: OwnerBasisCursor;
  readonly reasoning: readonly ReasoningBasisComponent[];
  readonly proof: ProofBasisComponent;
  readonly journal: readonly JournalBasisComponent[];
  readonly world: readonly WorldBasisComponent[];
  readonly completeness: BasisVectorCompleteness;
  /** Every owner that could not be read, with the reason. Never silently dropped. */
  readonly unavailable: readonly string[];
}

/** §4: build a Work component. */
export function workBasisComponent(input: WorkBasisComponent): WorkBasisComponent {
  return Object.freeze({ ...input });
}

/**
 * §4 "Observation-window consistency" — the optimistic observation protocol.
 *
 * Where the owner supports basis reads, a projection reads the basis BEFORE the history, reads the
 * history, reads the basis AFTER, and compares. If the basis moved, the window raced. This is an
 * optimistic protocol, NOT a global distributed transaction, and T0 does not claim otherwise.
 */
export interface ObservationWindowReading<TBasis, THistory> {
  readonly basisBefore: TBasis;
  readonly history: THistory;
  readonly basisAfter: TBasis;
  readonly moved: boolean;
}

/**
 * §4: run the observation-window protocol over one owner.
 *
 * `equal` is supplied by the caller because "the basis moved" is owner-specific (a chain digest,
 * a sequence, a revision). A basis that moved marks the window RACED rather than silently
 * re-reading: a caller that wanted a consistent cut must ask again.
 */
export async function readObservationWindow<TBasis, THistory>(input: {
  readonly readBasis: () => Promise<TBasis> | TBasis;
  readonly readHistory: () => Promise<THistory> | THistory;
  readonly equal: (left: TBasis, right: TBasis) => boolean;
}): Promise<ObservationWindowReading<TBasis, THistory>> {
  const basisBefore = await input.readBasis();
  const history = await input.readHistory();
  const basisAfter = await input.readBasis();
  return Object.freeze({
    basisBefore,
    history,
    basisAfter,
    moved: !input.equal(basisBefore, basisAfter),
  });
}

/**
 * §4 "Replay determinism": the semantic digest of a projection.
 *
 * Computed over the SEMANTIC content only. Projection time, machine path, process PID and
 * incidental enumeration order are excluded by construction — the caller passes the semantic
 * fields, and this function never sees the ambient environment.
 */
export function trajectorySemanticDigestOf(input: {
  readonly rootId: string;
  readonly basisVector: TrajectoryBasisVector;
  readonly nodes: readonly unknown[];
  readonly edges: readonly unknown[];
  readonly unresolved: readonly unknown[];
}): string {
  return canonicalDigest({
    domain: "palimpsest.trajectory.projection.v1",
    rootId: input.rootId,
    basisVector: input.basisVector,
    nodes: input.nodes,
    edges: input.edges,
    unresolved: input.unresolved,
  });
}
