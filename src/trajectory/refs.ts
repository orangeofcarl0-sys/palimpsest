/**
 * Trajectory-T0 §3 (T0-B2/T0-B4) — the OWNER REFERENCE and the typed RELATION.
 *
 * A Trajectory node does not copy an owner's artifact. It names the real source and says how
 * strongly that naming is supported. Two facts stay separate on purpose (§3 T0-B3):
 *
 *     source AUTHENTICITY  ≠  historical EPISTEMIC STATUS  ≠  CURRENTNESS  ≠  COMPLETENESS
 *
 * and an EDGE is not a truth claim — it is a description of a relationship that some owner's own
 * record establishes, or explicitly does not.
 *
 *     Trajectory owns only the interpretation and presentation of references. (T0-I1)
 */
import { canonicalDigest } from "../schema/index.js";

/** §3 T0-B2: the four owner planes a trajectory may reference. */
export const OWNER_PLANES = ["WORK", "REASONING", "PROOF", "WORKSPACE"] as const;
export type OwnerPlane = (typeof OWNER_PLANES)[number];

/**
 * §3 T0-B2: how well the named source was verified against its owning read port.
 *
 * An empty string or unknown digest can never serve as proof of source identity, so
 * `UNRESOLVED` and `MISMATCH` are first-class outcomes rather than a silent absence.
 */
export const REFERENCE_VERIFICATION_STATES = [
  /** The owner port resolved the exact identity AND the digest/basis agreed. */
  "VERIFIED_AGAINST_OWNER",
  /** The owner port resolved the identity, but the source carries no digest to compare. */
  "RESOLVED_WITHOUT_DIGEST",
  /** The owner port could not resolve the reference at all. */
  "UNRESOLVED",
  /** The owner resolved the identity but the digest/basis DISAGREED — a conflict, never a pass. */
  "MISMATCH",
] as const;
export type ReferenceVerificationState = (typeof REFERENCE_VERIFICATION_STATES)[number];

/**
 * §3 T0-B2: a small, verifiable reference to one fact an existing owner recorded.
 *
 * Deliberately NOT the artifact itself: keeping the reference small is what makes the projection
 * cheap to rebuild and impossible to mistake for a second store.
 */
export interface TrajectoryOwnerReference {
  readonly schemaVersion: 1;
  readonly ownerPlane: OwnerPlane;
  /** The owner's own scope: a projectId, a cellId, a proof scope, or the workspace scope. */
  readonly ownerScope: string;
  /** The canonical event / artifact identity inside that owner. */
  readonly canonicalId: string;
  /** The source revision or per-owner sequence position, when the owner has one. */
  readonly sourceSequence: number | null;
  /** The source digest, when the owner records one. Never fabricated to fill the field. */
  readonly sourceDigest: string | null;
  /** The project this reference is associated with, where an association is required. */
  readonly projectId: string | null;
  readonly verification: ReferenceVerificationState;
  /** Why the verification state holds — the exact owner evidence or the exact absence. */
  readonly verificationDetail: string;
}

/**
 * §3 T0-B4: the basis of an edge. This is the distinction that keeps temporal adjacency from
 * being laundered into causation (T0-I2).
 */
export const EDGE_EVIDENCE_STATES = [
  /** The owning record itself states the relationship (e.g. an authorization event, a receipt field). */
  "ESTABLISHED_BY_OWNER_REFERENCE",
  /** Only ordering is known: same owner, adjacent sequence. NEVER promoted to causation. */
  "TEMPORAL_ONLY",
  /** A caller or artifact DECLARED the relationship; no owner record corroborates it. */
  "DECLARED_ONLY",
  /** The source the relationship needs is missing. */
  "UNRESOLVED_SOURCE",
  /** The source exists but disagrees with the claimed relationship. */
  "CONFLICTING_SOURCE",
] as const;
export type EdgeEvidenceState = (typeof EDGE_EVIDENCE_STATES)[number];

/** §3 T0-B4: the relation families. Each names a real owner-supported relationship. */
export const TRAJECTORY_RELATIONS = [
  // Temporal (never causation)
  "SAME_OWNER_SEQUENCE_SUCCESSOR",
  "EXPLICIT_PREDECESSOR",
  // Work
  "TASK_AUTHORIZED_ATTEMPT",
  "ATTEMPT_PRODUCED_RESULT",
  "RESULT_VERIFIED",
  "RESULT_PROMOTED",
  "ATTEMPT_REOPENED_FOR_REWORK",
  // Cognitive
  "BRANCH_SUBMITTED_CANDIDATE",
  "CANDIDATE_EVALUATED",
  "CLAIM_ADMITTED",
  "CLAIM_INVALIDATED",
  "PROOF_SOURCE_SUPPORTED_EVIDENCE",
  "RECEIPT_REFERENCED_GROUND",
  // Project evolution
  "REVISION_SUCCEEDED_REVISION",
  "GOVERNED_INTENT_CHANGED_PROJECT",
  "PROMOTION_APPLIED_TO_PROJECT",
] as const;
export type TrajectoryRelation = (typeof TRAJECTORY_RELATIONS)[number];

/**
 * §3 T0-B4: the exact owner evidence that establishes an edge.
 *
 * An `ESTABLISHED_BY_OWNER_REFERENCE` edge MUST carry this. An edge without it may only be
 * TEMPORAL_ONLY / DECLARED_ONLY / UNRESOLVED_SOURCE / CONFLICTING_SOURCE.
 */
export interface TrajectoryEdgeEvidence {
  /** The owner record that states the relationship. */
  readonly byReference: TrajectoryOwnerReference;
  /** The owner field / event that carries the link, e.g. `payload.rework_provenance.origin_result_subject.ref`. */
  readonly carryingField: string;
  /** The exact values compared, so a reviewer can re-check the equality rather than trust it. */
  readonly compared: Readonly<Record<string, string>>;
}

export interface TrajectoryEdge {
  readonly schemaVersion: 1;
  readonly relation: TrajectoryRelation;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly evidenceState: EdgeEvidenceState;
  /** Present ONLY when `evidenceState === "ESTABLISHED_BY_OWNER_REFERENCE"`. */
  readonly evidence: TrajectoryEdgeEvidence | null;
  readonly detail: string;
}

/** §3 T0-B3: the source-authenticity dimension, kept separate from epistemic status. */
export const SOURCE_AUTHENTICITY_STATES = [
  "OWNER_RECORDED",
  "LOWER_TRUST_OBSERVATION",
  "UNRESOLVED",
] as const;
export type SourceAuthenticity = (typeof SOURCE_AUTHENTICITY_STATES)[number];

/**
 * §3 T0-B3: the historical epistemic status of a referenced fact.
 *
 * `ADMITTED` and `CURRENT` are NOT levels of the same ladder, which is why this is its own
 * dimension: an admitted Reasoning Claim can be historically valid while its current standing is
 * stale. Those are different facts and are recorded as different fields.
 */
export const EPISTEMIC_STATUS_STATES = [
  "RECORDED",
  "CANDIDATE",
  "ADMITTED",
  "INVALIDATED",
  "PUBLISHED",
  "OBSERVED_UNVERIFIED",
  "UNRESOLVED",
] as const;
export type EpistemicStatus = (typeof EPISTEMIC_STATUS_STATES)[number];

/** §4: the currentness dimension. Historical standing is never overwritten by it. */
export const CURRENTNESS_STATES = ["CURRENT", "CHANGED", "STALE_BY_OWNER", "UNAVAILABLE", "UNKNOWN", "RACED"] as const;
export type Currentness = (typeof CURRENTNESS_STATES)[number];

/** §3 T0-B3: how complete the projection is for this node. */
export const COMPLETENESS_STATES = ["COMPLETE", "PARTIAL", "MISSING_SOURCE"] as const;
export type ProjectionCompleteness = (typeof COMPLETENESS_STATES)[number];

/** §3 T0-B3: one referenced historical fact, or one explicitly limited observation. */
export interface TrajectoryNode {
  readonly schemaVersion: 1;
  /** Deterministic node identity (§3 T0-B1): derived, never generated, never model-authored. */
  readonly nodeId: string;
  readonly reference: TrajectoryOwnerReference;
  readonly authenticity: SourceAuthenticity;
  readonly epistemicStatus: EpistemicStatus;
  readonly currentness: Currentness;
  readonly completeness: ProjectionCompleteness;
  /** A short, non-authoritative label for a read model. Never used for identity. */
  readonly label: string;
}

/** §3 T0-B1: the stable projection schema version, part of every identity. */
export const TRAJECTORY_PROJECTION_SCHEMA_VERSION = 1;

/**
 * §3 T0-B1: a deterministic node identity.
 *
 * Domain-separated and derived ONLY from the owner reference's stable coordinates — never from
 * projection time, a machine path, a PID, or enumeration order (§4 replay determinism).
 */
export function trajectoryNodeIdOf(reference: TrajectoryOwnerReference): string {
  return `tn-${canonicalDigest({
    domain: "palimpsest.trajectory.node.v1",
    schemaVersion: TRAJECTORY_PROJECTION_SCHEMA_VERSION,
    ownerPlane: reference.ownerPlane,
    ownerScope: reference.ownerScope,
    canonicalId: reference.canonicalId,
    sourceSequence: reference.sourceSequence,
    sourceDigest: reference.sourceDigest,
    projectId: reference.projectId,
  }).slice(0, 32)}`;
}

/** §3 T0-B1: a deterministic edge identity, derived from its endpoints and relation. */
export function trajectoryEdgeIdOf(edge: Pick<TrajectoryEdge, "relation" | "fromNodeId" | "toNodeId">): string {
  return `te-${canonicalDigest({
    domain: "palimpsest.trajectory.edge.v1",
    relation: edge.relation,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
  }).slice(0, 32)}`;
}

/**
 * §3: build a reference with the verification state it actually earned.
 *
 * Kept as a constructor so every reference passes through one place that refuses to invent a
 * digest: a `null` digest is recorded as `null`, never as a placeholder string.
 */
export function makeOwnerReference(input: {
  readonly ownerPlane: OwnerPlane;
  readonly ownerScope: string;
  readonly canonicalId: string;
  readonly sourceSequence?: number | null;
  readonly sourceDigest?: string | null;
  readonly projectId?: string | null;
  readonly verification: ReferenceVerificationState;
  readonly verificationDetail: string;
}): TrajectoryOwnerReference {
  return Object.freeze({
    schemaVersion: 1 as const,
    ownerPlane: input.ownerPlane,
    ownerScope: input.ownerScope,
    canonicalId: input.canonicalId,
    sourceSequence: input.sourceSequence ?? null,
    sourceDigest: input.sourceDigest ?? null,
    projectId: input.projectId ?? null,
    verification: input.verification,
    verificationDetail: input.verificationDetail,
  });
}

/** §3 T0-B3: build a node with all four dimensions explicit. */
export function makeTrajectoryNode(input: {
  readonly reference: TrajectoryOwnerReference;
  readonly authenticity: SourceAuthenticity;
  readonly epistemicStatus: EpistemicStatus;
  readonly currentness: Currentness;
  readonly completeness: ProjectionCompleteness;
  readonly label: string;
}): TrajectoryNode {
  return Object.freeze({
    schemaVersion: 1 as const,
    nodeId: trajectoryNodeIdOf(input.reference),
    reference: input.reference,
    authenticity: input.authenticity,
    epistemicStatus: input.epistemicStatus,
    currentness: input.currentness,
    completeness: input.completeness,
    label: input.label,
  });
}

/**
 * §3 "No false authority": an edge describes a supported relationship and never authorizes Work
 * execution, settlement, publication, admission, revision, promotion or spending.
 */
export const EDGE_DOES_NOT_AUTHORIZE = Object.freeze([
  "Work execution",
  "Work settlement",
  "Proof publication",
  "Reasoning admission",
  "ProjectIR revision",
  "Promotion",
  "External spending",
] as const);
