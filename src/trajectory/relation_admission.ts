/**
 * Trajectory-V0S §7 (S1-D) — PROJECT RELATION ADMISSION.
 *
 * Which T0 relations may an Attempt-scoped consumer present as fact?
 *
 * V0 answered with `node.label.includes(attemptId)` plus a permitted relation name. A display label can
 * be satisfied accidentally, and a permitted name says nothing about whether the relation was actually
 * established. This module answers with exact identity and explicit evidence instead.
 *
 * The policy lives here rather than in the composition adapter because it is TRAJECTORY semantics — a
 * judgement about what a Trajectory reference proves — not wiring. The composition layer's job is to
 * know which owners exist; deciding what their records are allowed to mean is this layer's job.
 *
 * T0's projection is NOT modified. This is a read-side selection policy over a projection T0 already
 * built, and it can only ever REMOVE relations from what T0 produced.
 */
import type { TrajectoryEdge } from "./refs.js";
import type { TrajectoryProjection } from "./projection.js";

/**
 * §7: the T0 relations whose cross-owner verifier the T0 review found incomplete.
 *
 * Each is quarantined rather than presented as an actionable fact, because presenting it would claim a
 * verification that has not happened.
 */
export const QUARANTINED_T0_RELATIONS: Readonly<Record<string, string>> = Object.freeze({
  RECEIPT_REFERENCED_GROUND:
    "T0's ground matching uses a substring scan over the serialized payload, so the exact Reasoning/Journal ground match is not guaranteed",
  GOVERNED_INTENT_CHANGED_PROJECT:
    "T0's cross-owner historical asOf and full ProjectIR parent/basis digest comparison are known incomplete",
  REVISION_SUCCEEDED_REVISION:
    "T0's ProjectIR parent/basis digest comparison is known incomplete",
});

/** §7: relations this consumer may present, because their T0 verifier is exact for Work facts. */
export const SELECTED_T0_RELATIONS: ReadonlySet<string> = new Set([
  "TASK_AUTHORIZED_ATTEMPT",
  "ATTEMPT_PRODUCED_RESULT",
  "RESULT_PROMOTED",
  "ATTEMPT_REOPENED_FOR_REWORK",
]);

/** §7: one admitted relation, as the Preview reports it. */
export interface AdmittedRelation {
  readonly relation: string;
  readonly evidenceState: string;
  readonly detail: string;
}

/** §7: one relation held back, with the reason. */
export interface QuarantinedRelation {
  readonly relation: string;
  readonly reason: string;
}

/**
 * §7: select the T0 Work relations that provably belong to THIS attempt.
 *
 * A relation is admitted only when ALL SIX hold:
 *
 *   1. it is an explicitly allowed Work relation kind;
 *   2. one of its endpoints IS one of the attempt's canonical Work event ids;
 *   3. `evidenceState === "ESTABLISHED_BY_OWNER_REFERENCE"`;
 *   4. it carries a non-null `TrajectoryEdgeEvidence`;
 *   5. that evidence names a WORK-plane reference whose canonical id is one of those events;
 *   6. the evidence reference's project agrees with the projection's project.
 *
 * Anything else is quarantined with the reason it failed, never silently dropped and never presented.
 */
export function selectAttemptWorkRelations(
  projection: TrajectoryProjection,
  canonicalEventIds: ReadonlySet<string>,
): { readonly selected: readonly AdmittedRelation[]; readonly quarantined: readonly QuarantinedRelation[] } {
  const selected: AdmittedRelation[] = [];
  const quarantined: QuarantinedRelation[] = [];

  /** §7: the canonical Work event id behind each node, so an edge can be tied to real identity. */
  const nodeEventId = new Map<string, string | null>();
  for (const node of projection.nodes) {
    nodeEventId.set(node.nodeId, node.reference.ownerPlane === "WORK" ? node.reference.canonicalId : null);
  }
  const touchesCanonical = (edge: TrajectoryEdge): boolean => {
    const from = nodeEventId.get(edge.fromNodeId) ?? null;
    const to = nodeEventId.get(edge.toNodeId) ?? null;
    return (from !== null && canonicalEventIds.has(from)) || (to !== null && canonicalEventIds.has(to));
  };

  for (const edge of projection.edges) {
    /** §7: a known-incomplete verifier is quarantined whenever it touches this attempt. */
    const quarantineReason = QUARANTINED_T0_RELATIONS[edge.relation];
    if (quarantineReason !== undefined) {
      if (touchesCanonical(edge)) quarantined.push({ relation: edge.relation, reason: quarantineReason });
      continue;
    }
    if (!SELECTED_T0_RELATIONS.has(edge.relation)) continue;
    if (!touchesCanonical(edge)) continue;

    /** §7 requirement 3+4: an established edge must carry its evidence, or it is not established. */
    if (edge.evidenceState !== "ESTABLISHED_BY_OWNER_REFERENCE" || edge.evidence === null) {
      quarantined.push({
        relation: edge.relation,
        reason: `the edge touches this attempt but its evidence state is ${edge.evidenceState}${edge.evidence === null ? " with no edge evidence" : ""}, so it is not an established relation`,
      });
      continue;
    }
    /**
     * §7 requirement 5+6: the carrying record must be a real owner reference, and it must be one of
     * THIS attempt's canonical Work events. A scope or identity mismatch is a wrong-source edge.
     */
    const by = edge.evidence.byReference;
    if (by.ownerPlane !== "WORK" || by.canonicalId === null || !canonicalEventIds.has(by.canonicalId)) {
      quarantined.push({
        relation: edge.relation,
        reason: `the edge's evidence names ${by.ownerPlane}:${String(by.canonicalId)}, which is not one of this attempt's canonical Work events`,
      });
      continue;
    }
    if (by.projectId !== null && by.projectId !== projection.projectId) {
      quarantined.push({
        relation: edge.relation,
        reason: `the edge's evidence belongs to project ${by.projectId}, not ${projection.projectId}`,
      });
      continue;
    }
    selected.push({ relation: edge.relation, evidenceState: edge.evidenceState, detail: edge.detail });
  }

  return Object.freeze({
    selected: Object.freeze(selected),
    quarantined: Object.freeze([...new Map(quarantined.map((entry) => [entry.relation, entry])).values()]),
  });
}
