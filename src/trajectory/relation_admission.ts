/**
 * Trajectory-V0S §7 (S1-D) — PROJECT RELATION ADMISSION, corrected by Trajectory-V0S-H0 §6.
 *
 * Which T0 relations may an Attempt-scoped consumer present as fact?
 *
 * V0 answered with `node.label.includes(attemptId)`. V0S replaced that with "one endpoint is in the
 * attempt's canonical event-id set", which fixed the label defect and introduced two new ones:
 *
 *   H0 F1  a SHARED authorization event satisfies the endpoint rule for BOTH attempts, so attempt B's
 *          authorization relation was admitted into attempt A's Preview.
 *   H0 F2  T0 carries a Promotion's evidence on the `PROMOTION_COMMITTED` node and a governed
 *          reopening's evidence on the `TASK_READY` node — both DIFFERENT entity types from the
 *          attempt — so requiring the carrier to be one of the attempt's own events excluded two
 *          GENUINE relations.
 *
 * The corrected rule is per-relation ROLE semantics. Each relation names exactly which endpoint must
 * be the requested Attempt and which endpoint carries the evidence, and the evidence's own compared
 * field must agree with the requested attempt. A shared node cannot satisfy two different attempts'
 * relations, and a genuine cross-entity carrier is admitted because the requirement is on the ROLE,
 * not on the entity type.
 *
 * The policy lives here rather than in the composition adapter because it is TRAJECTORY semantics — a
 * judgement about what a Trajectory reference proves — not wiring.
 *
 * T0's projection is NOT modified. This is a read-side selection policy over a projection T0 already
 * built, and it can only ever REMOVE relations from what T0 produced.
 */
import type { TrajectoryEdge } from "./refs.js";
import type { TrajectoryProjection } from "./projection.js";

/**
 * §6: the T0 relations whose cross-owner verifier the T0 review found incomplete.
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

/** §6: relations this consumer may present, because their T0 verifier is exact for Work facts. */
export const SELECTED_T0_RELATIONS: ReadonlySet<string> = new Set([
  "TASK_AUTHORIZED_ATTEMPT",
  "ATTEMPT_PRODUCED_RESULT",
  "RESULT_PROMOTED",
  "ATTEMPT_REOPENED_FOR_REWORK",
]);

/**
 * §6.3: the stable identities an Attempt-scoped admission decision needs.
 *
 * Deliberately small and value-only: the module validates and filters T0's EXISTING evidence, and this
 * context is what it filters against. It is NOT a second relation builder and holds no owner.
 *
 * `canonicalEventIds` remains the broad set used for QUARANTINE SCOPING (is this unresolved relation
 * even about this attempt?). Admission itself uses the precise role fields below.
 */
export interface AttemptRelationContext {
  readonly projectId: string;
  readonly attemptId: string;
  /** The attempt's own `ATTEMPT_CREATED` event id, as a string. Null only if the caller has none. */
  readonly creationEventId: string | null;
  /**
   * The event id of the TASK_CREATED/TASK_REAUTHORIZED that authorizes THIS attempt, plus the envelope
   * id it carries. `null` when the attempt's authorization could not be resolved.
   */
  readonly authorizationEventId: string | null;
  readonly authorizationEnvelopeId: string | null;
  /**
   * The attempt's terminal result event ids (`ATTEMPT_COMPLETED` / `ATTEMPT_FAILED`).
   */
  readonly terminalEventIds: readonly string[];
  /** The COMPLETED (not failed) result event id, which is what a promotion names. */
  readonly completedEventId: string | null;
  /**
   * Every canonical Work event id associated with this attempt, used ONLY to scope quarantine
   * reporting so an unrelated unresolved relation is not reported as this attempt's fact.
   */
  readonly canonicalEventIds: ReadonlySet<string>;
}

/** §6: one admitted relation, as the Preview reports it. */
export interface AdmittedRelation {
  readonly relation: string;
  readonly evidenceState: string;
  readonly detail: string;
}

/** §6: one relation held back, with the reason. */
export interface QuarantinedRelation {
  readonly relation: string;
  readonly reason: string;
}

/** §6: the result of an admission decision for one edge. */
type Verdict = { readonly admit: true } | { readonly admit: false; readonly reason: string };

/**
 * §6.1: the ROLE each relation requires.
 *
 * Every entry states, for one relation kind:
 *   - which endpoint must be the requested attempt (or its result), by comparing to a context field;
 *   - whether the evidence carrier may be a different entity type (Promotion and Rework are TASK /
 *     promotion entities, which is exactly the case V0S wrongly rejected);
 *   - which `evidence.compared` field must equal the requested attempt id.
 */
function verdictFor(edge: TrajectoryEdge, context: AttemptRelationContext, nodeEventId: ReadonlyMap<string, string | null>): Verdict {
  const from = nodeEventId.get(edge.fromNodeId) ?? null;
  const to = nodeEventId.get(edge.toNodeId) ?? null;
  const evidence = edge.evidence;
  if (evidence === null) return { admit: false, reason: "the edge carries no owner evidence" };

  /** §6.2: the evidence reference must be a real Work-plane reference in this project. */
  const by = evidence.byReference;
  if (by.ownerPlane !== "WORK") return { admit: false, reason: `the edge's evidence names the ${by.ownerPlane} plane, not WORK` };
  if (by.canonicalId === null) return { admit: false, reason: "the edge's evidence carries no canonical identity" };
  if (by.projectId !== null && by.projectId !== context.projectId) {
    return { admit: false, reason: `the edge's evidence belongs to project ${by.projectId}, not ${context.projectId}` };
  }

  const compared = evidence.compared as Readonly<Record<string, string>>;

  switch (edge.relation) {
    /**
     * §6.1 TASK_AUTHORIZED_ATTEMPT: the DESTINATION is the requested attempt's creation event, the
     * SOURCE is that attempt's own authorization event, and the compared envelope matches. Requiring
     * the exact authorization event id is what stops a shared node from satisfying two attempts.
     */
    case "TASK_AUTHORIZED_ATTEMPT": {
      if (context.creationEventId === null) return { admit: false, reason: "this attempt's creation event is unknown" };
      if (to !== context.creationEventId) return { admit: false, reason: "the relation's destination is not this attempt's creation event" };
      if (context.authorizationEventId === null) return { admit: false, reason: "this attempt's authorization event could not be resolved" };
      if (from !== context.authorizationEventId) return { admit: false, reason: "the relation's source is not this attempt's authorization event" };
      if (context.authorizationEnvelopeId !== null && compared["envelopeId"] !== undefined && compared["envelopeId"] !== context.authorizationEnvelopeId) {
        return { admit: false, reason: `the compared envelope ${compared["envelopeId"]} is not this attempt's authorization envelope` };
      }
      return { admit: true };
    }

    /**
     * §6.1 ATTEMPT_PRODUCED_RESULT: the SOURCE is the requested attempt's creation event and the
     * DESTINATION is one of its own terminal result events.
     */
    case "ATTEMPT_PRODUCED_RESULT": {
      if (context.creationEventId === null) return { admit: false, reason: "this attempt's creation event is unknown" };
      if (from !== context.creationEventId) return { admit: false, reason: "the relation's source is not this attempt's creation event" };
      if (to === null || !context.terminalEventIds.includes(to)) return { admit: false, reason: "the relation's destination is not this attempt's terminal result event" };
      return { admit: true };
    }

    /**
     * §6.1 RESULT_PROMOTED: the SOURCE is the requested attempt's COMPLETED result, the DESTINATION is
     * a real PROMOTION_COMMITTED, and the promotion names this attempt. The carrier is the PROMOTION
     * event — a different entity type — which is REQUIRED, not rejected (H0-I2).
     */
    case "RESULT_PROMOTED": {
      if (context.completedEventId === null) return { admit: false, reason: "this attempt has no completed result event" };
      if (from !== context.completedEventId) return { admit: false, reason: "the relation's source is not this attempt's completed result" };
      if (to === null) return { admit: false, reason: "the relation's destination node carries no canonical identity" };
      if (to !== by.canonicalId) return { admit: false, reason: "the relation's destination is not the record carrying its evidence" };
      if (compared["attemptId"] !== context.attemptId) {
        return { admit: false, reason: `the promotion names attempt ${String(compared["attemptId"])}, not ${context.attemptId}` };
      }
      return { admit: true };
    }

    /**
     * §6.1 ATTEMPT_REOPENED_FOR_REWORK: the SOURCE is the requested attempt's own terminal result and
     * the provenance's `originRef` names this attempt. The carrier is the TASK_READY reopening — again
     * a different entity type, which is required (H0-I2).
     */
    case "ATTEMPT_REOPENED_FOR_REWORK": {
      if (from === null || !context.terminalEventIds.includes(from)) {
        return { admit: false, reason: "the relation's source is not this attempt's terminal result event" };
      }
      if (compared["originRef"] !== context.attemptId) {
        return { admit: false, reason: `the reopening cites origin result ${String(compared["originRef"])}, not ${context.attemptId}` };
      }
      if (to !== by.canonicalId) return { admit: false, reason: "the relation's destination is not the record carrying its evidence" };
      return { admit: true };
    }

    default:
      return { admit: false, reason: `the relation ${edge.relation} has no Attempt-scoped admission role` };
  }
}

/**
 * §6: select the T0 Work relations that provably belong to THIS attempt.
 *
 * Admission requires ALL of:
 *
 *   1. an explicitly allowed Work relation kind;
 *   2. `evidenceState === "ESTABLISHED_BY_OWNER_REFERENCE"`;
 *   3. a non-null `TrajectoryEdgeEvidence`;
 *   4. the relation-specific ROLE to hold (see `verdictFor`): the correct endpoint is this attempt,
 *      and the evidence's own compared field names this attempt.
 *
 * A relation that fails 4 is reported with the exact reason it failed. A relation that does not
 * concern this attempt at all is neither admitted nor reported.
 */
export function selectAttemptWorkRelations(
  projection: TrajectoryProjection,
  context: AttemptRelationContext,
): { readonly selected: readonly AdmittedRelation[]; readonly quarantined: readonly QuarantinedRelation[] } {
  const selected: AdmittedRelation[] = [];
  const quarantined: QuarantinedRelation[] = [];

  /** §6: the canonical Work event id behind each node, so an edge can be tied to real identity. */
  const nodeEventId = new Map<string, string | null>();
  for (const node of projection.nodes) {
    nodeEventId.set(node.nodeId, node.reference.ownerPlane === "WORK" ? node.reference.canonicalId : null);
  }
  /**
   * §6.2: quarantine is scoped to the requested attempt. A relation whose endpoints do not touch this
   * attempt at all is not this attempt's unresolved fact and is not reported.
   */
  const concernsThisAttempt = (edge: TrajectoryEdge): boolean => {
    const from = nodeEventId.get(edge.fromNodeId) ?? null;
    const to = nodeEventId.get(edge.toNodeId) ?? null;
    return (from !== null && context.canonicalEventIds.has(from)) || (to !== null && context.canonicalEventIds.has(to));
  };

  for (const edge of projection.edges) {
    const quarantineReason = QUARANTINED_T0_RELATIONS[edge.relation];
    if (quarantineReason !== undefined) {
      if (concernsThisAttempt(edge)) quarantined.push({ relation: edge.relation, reason: quarantineReason });
      continue;
    }
    if (!SELECTED_T0_RELATIONS.has(edge.relation)) continue;
    if (!concernsThisAttempt(edge)) continue;

    /** §6.2 requirement 2+3: only an established, evidenced edge may be admitted. */
    if (edge.evidenceState !== "ESTABLISHED_BY_OWNER_REFERENCE" || edge.evidence === null) {
      quarantined.push({
        relation: edge.relation,
        reason: `the edge concerns this attempt but its evidence state is ${edge.evidenceState}${edge.evidence === null ? " with no edge evidence" : ""}, so it is not an established relation`,
      });
      continue;
    }

    /** §6.1/§6.2 requirement 4: the relation-specific role must hold. */
    const verdict = verdictFor(edge, context, nodeEventId);
    if (!verdict.admit) {
      quarantined.push({ relation: edge.relation, reason: verdict.reason });
      continue;
    }
    selected.push({ relation: edge.relation, evidenceState: edge.evidenceState, detail: edge.detail });
  }

  return Object.freeze({
    selected: Object.freeze(selected),
    quarantined: Object.freeze([...new Map(quarantined.map((entry) => [entry.relation, entry])).values()]),
  });
}
