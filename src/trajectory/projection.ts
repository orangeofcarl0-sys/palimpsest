/**
 * Trajectory-T0 §5 (T0-D) — ONE READ-ONLY PROJECTION PATH over read-only Owner ports.
 *
 *     Trajectory = Owner History + Provenance Relations + Temporal Currentness
 *
 * What this module does NOT do, by construction:
 *
 *   - it writes nothing: there is no canonical store, no append, no scheduler (§5, §10);
 *   - it verifies Proof, admits Reasoning, revises ProjectIR or promotes nothing (§3 "No false
 *     authority" — an edge DESCRIBES a supported relationship, it never authorizes one);
 *   - it does not invent a global clock: the multi-owner Basis Vector records the ACTUAL position
 *     in each owner history, and two independent histories are never ordered against each other
 *     without an explicit cross-owner reference (T0-I3);
 *   - it does not turn adjacency into causation: same-owner succession is TEMPORAL_ONLY and is
 *     never promoted to an established edge (T0-I2).
 *
 * Every node refers to a fact an owner recorded, or to an explicitly lower-trust observation.
 * Unresolved evidence stays unresolved (T0-I6). Given the same verified owner histories and the
 * same observation cut, the projection is byte-identical (T0-I7).
 */
import {
  parseProjectIr,
  parseSchedulerEvent,
  type ProjectIr,
  type SchedulerEvent,
} from "../schema/index.js";
import { canonicalDigest } from "../schema/index.js";
import { EMPTY_PREVIOUS_EVENT_DIGEST } from "../state/index.js";
/**
 * §5: the receipt is re-parsed by its OWNING module's parser, which re-derives the digest — so a
 * tampered receipt inside a PROJECT_REVISED payload is refused rather than believed.
 */
import { parseAcceptedIntentReconciliation } from "../project_intent/index.js";

import {
  BASIS_VECTOR_COMPLETENESS,
  readObservationWindow,
  trajectorySemanticDigestOf,
  workBasisComponent,
  type BasisVectorCompleteness,
  type JournalBasisComponent,
  type OwnerBasisCursor,
  type ProofBasisComponent,
  type ReasoningBasisComponent,
  type TrajectoryBasisVector,
  type WorkBasisComponent,
  type WorldBasisComponent,
} from "./contract.js";
import {
  HOST_OBSERVATION_ADMISSION,
  type TrajectoryAssociation,
  type TrajectoryIntentReceipt,
  type TrajectoryJournalEvent,
  type TrajectoryProjectionInputs,
  type TrajectoryProofClaimView,
  type TrajectoryReasoningEvent,
} from "./ports.js";
import {
  EDGE_EVIDENCE_STATES,
  makeOwnerReference,
  makeTrajectoryNode,
  trajectoryEdgeIdOf,
  TRAJECTORY_PROJECTION_SCHEMA_VERSION,
  type Currentness,
  type EpistemicStatus,
  type OwnerPlane,
  type ProjectionCompleteness,
  type SourceAuthenticity,
  type TrajectoryEdge,
  type TrajectoryEdgeEvidence,
  type TrajectoryNode,
  type TrajectoryOwnerReference,
  type TrajectoryRelation,
} from "./refs.js";

/** §3 T0-B1: the project-scoped root identity of one projection. */
export function trajectoryRootIdOf(input: { readonly projectId: string; readonly asOfSequence: number | null }): string {
  return `tr-${canonicalDigest({
    domain: "palimpsest.trajectory.root.v1",
    schemaVersion: TRAJECTORY_PROJECTION_SCHEMA_VERSION,
    projectId: input.projectId,
    asOfSequence: input.asOfSequence,
  }).slice(0, 32)}`;
}

/** §5: which owner plane supplied a source, and how completely. */
export interface SourceCoverageEntry {
  readonly ownerPlane: OwnerPlane;
  readonly scope: string;
  readonly availability: string;
  readonly referencedCount: number;
  readonly resolvedCount: number;
  readonly detail: string;
}

/** §5: a reference the projection could not establish, with the owner that should supply it. */
export interface UnresolvedReference {
  readonly relation: TrajectoryRelation | null;
  readonly requestedIdentity: string;
  readonly ownerThatShouldSupply: OwnerPlane | "NONE";
  readonly reason: string;
}

/** §5: a reference whose owner exists but DISAGREES with the claim. */
export interface TrajectoryConflict {
  readonly subject: string;
  readonly ownerPlane: OwnerPlane;
  readonly claimed: string;
  readonly observed: string;
  readonly detail: string;
}

/** §4: the currentness classification for one node, kept apart from its historical status. */
export interface CurrentnessClassification {
  readonly nodeId: string;
  readonly currentness: Currentness;
  readonly detail: string;
}

/** §4: the explicit cut an as-of projection was built at. */
export interface AsOfCut {
  readonly throughSequence: number;
  readonly predecessorBasis: { readonly projectSequence: number; readonly eventDigest: string } | null;
  readonly includedEventIds: readonly number[];
}

/** §5: the projection's output. */
export interface TrajectoryProjection {
  readonly schemaVersion: 1;
  readonly rootId: string;
  readonly projectId: string;
  readonly basisVector: TrajectoryBasisVector;
  readonly nodes: readonly TrajectoryNode[];
  readonly edges: readonly TrajectoryEdge[];
  readonly sourceCoverage: readonly SourceCoverageEntry[];
  readonly unresolved: readonly UnresolvedReference[];
  readonly conflicts: readonly TrajectoryConflict[];
  readonly currentness: readonly CurrentnessClassification[];
  readonly asOf: AsOfCut | null;
  /** §5: the maximal status a G1-B host observation may reach here. Never a causal edge. */
  readonly hostObservationAdmission: string;
  /** §4: deterministic semantic digest. Excludes time, path, PID and enumeration order. */
  readonly semanticDigest: string;
  readonly readOnly: true;
}

/** §5: a named refusal produced by the Work-history validation. */
export class TrajectoryRefusal extends Error {
  readonly kind: string;
  constructor(kind: string, message: string) {
    // The kind is part of the message so a caller that only sees `error.message` still learns
    // WHICH refusal fired rather than a generic validation failure.
    super(`${kind}: ${message}`);
    this.name = "TrajectoryRefusal";
    this.kind = kind;
  }
}

/* ------------------------------------------------------------------ *
 * §5 Work event validation
 * ------------------------------------------------------------------ */

/**
 * §5: validate a project's Work history the way its owner would.
 *
 * Re-parses each event through `parseSchedulerEvent` (which RECOMPUTES both the request digest and
 * the event digest, so a mutated payload with a stale digest is refused), then checks project
 * identity, per-project sequence continuity, previous-event-digest linkage and that every
 * causation reference points at an EARLIER event in the SAME project.
 *
 * When the interval does not begin at genesis, the caller must supply the validated predecessor
 * basis: T0 never assumes the previous digest is the genesis digest.
 */
export function validateWorkHistory(input: {
  readonly projectId: string;
  readonly events: readonly unknown[];
  readonly fromSequence?: number | undefined;
  readonly predecessorBasis?: { readonly projectSequence: number; readonly eventDigest: string } | null | undefined;
}): readonly SchedulerEvent[] {
  const { projectId } = input;
  const fromSequence = input.fromSequence ?? 1;
  const parsed: SchedulerEvent[] = [];
  for (const raw of input.events) {
    let event: SchedulerEvent;
    try {
      event = parseSchedulerEvent(raw);
    } catch (error) {
      throw new TrajectoryRefusal(
        "INVALID_SOURCE_EVENT",
        `a Work event could not be parsed by the owner parser: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (event.project_id !== projectId) {
      throw new TrajectoryRefusal(
        "FOREIGN_PROJECT_EVENT",
        `an event belongs to project ${event.project_id} but ${projectId} was requested`,
      );
    }
    parsed.push(event);
  }

  const bySequence = new Map<number, SchedulerEvent>();
  for (const event of parsed) {
    if (bySequence.has(event.project_sequence)) {
      throw new TrajectoryRefusal(
        "DUPLICATE_PROJECT_SEQUENCE",
        `project ${projectId} has two events at project_sequence ${String(event.project_sequence)}`,
      );
    }
    bySequence.set(event.project_sequence, event);
  }

  const included: SchedulerEvent[] = [];
  const seenEventIds = new Set<number>();
  let previousSequence: number;
  let previousDigest: string;
  if (fromSequence === 1) {
    previousSequence = 0;
    previousDigest = EMPTY_PREVIOUS_EVENT_DIGEST;
  } else {
    const basis = input.predecessorBasis;
    if (basis === null || basis === undefined) {
      throw new TrajectoryRefusal(
        "MISSING_PREDECESSOR_BASIS",
        `the interval starts at project_sequence ${String(fromSequence)} but no validated predecessor basis was supplied`,
      );
    }
    if (basis.projectSequence !== fromSequence - 1) {
      throw new TrajectoryRefusal(
        "PREDECESSOR_BASIS_MISMATCH",
        `the predecessor basis names sequence ${String(basis.projectSequence)} but the interval starts at ${String(fromSequence)}`,
      );
    }
    previousSequence = basis.projectSequence;
    previousDigest = basis.eventDigest;
  }

  const ordered = [...bySequence.keys()].sort((a, b) => a - b);
  /**
   * §5: a causation reference must name an event that occurred EARLIER in the SAME project.
   *
   * Two cases are legitimate, and the difference matters when the interval is not genesis-anchored:
   *
   *   - the cited event is INSIDE this interval and already walked (`seenEventIds`), or
   *   - the cited event precedes the interval start. The latter is only accepted because the
   *     caller supplied a VALIDATED predecessor basis and the owner's global `event_id` is
   *     strictly increasing, so an id below the interval's first event necessarily precedes it.
   *     Without that basis the validation above has already refused, so this branch cannot be
   *     reached on an unanchored interval.
   *
   * A FORWARD reference — to an event not yet walked and not below the interval start — is refused.
   */
  const firstIncludedEventId = ordered.find((sequence) => sequence >= fromSequence);
  const intervalStartEventId =
    firstIncludedEventId === undefined ? null : bySequence.get(firstIncludedEventId)!.event_id;
  for (const sequence of ordered) {
    if (sequence < fromSequence) continue;
    if (sequence !== previousSequence + 1) {
      throw new TrajectoryRefusal(
        "SEQUENCE_DISCONTINUITY",
        `project ${projectId} jumps from project_sequence ${String(previousSequence)} to ${String(sequence)}`,
      );
    }
    const event = bySequence.get(sequence)!;
    if (event.previous_event_digest !== previousDigest) {
      throw new TrajectoryRefusal(
        "PREVIOUS_DIGEST_MISMATCH",
        `project ${projectId} at project_sequence ${String(sequence)} does not link to the prior event digest`,
      );
    }
    if (event.causation_id !== null) {
      const insideInterval = seenEventIds.has(event.causation_id);
      const beforeInterval = intervalStartEventId !== null && event.causation_id < intervalStartEventId;
      if (!insideInterval && !beforeInterval) {
        throw new TrajectoryRefusal(
          "CAUSATION_NOT_EARLIER",
          `project ${projectId} at project_sequence ${String(sequence)} cites causation_id ${String(event.causation_id)}, which is not an earlier event in this project`,
        );
      }
    }
    included.push(event);
    seenEventIds.add(event.event_id);
    previousSequence = sequence;
    previousDigest = event.event_digest;
  }
  return Object.freeze(included);
}

/* ------------------------------------------------------------------ *
 * Small owner-record readers (all read-only, all total)
 * ------------------------------------------------------------------ */

interface WorkEventView {
  readonly event: SchedulerEvent;
  readonly payload: Record<string, unknown>;
}

const payloadOf = (event: SchedulerEvent): Record<string, unknown> => event.payload as Record<string, unknown>;

const stringField = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const numberField = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** The ProjectIR carried by a PROJECT_CREATED / PROJECT_REVISED event, or null when absent/invalid. */
function projectIrOf(event: SchedulerEvent): ProjectIr | null {
  if (event.event_type !== "PROJECT_CREATED" && event.event_type !== "PROJECT_REVISED") return null;
  const raw = payloadOf(event)["project_ir"];
  if (raw === undefined) return null;
  try {
    return parseProjectIr(raw);
  } catch {
    return null;
  }
}

/** The accepted intent reconciliation receipt on a PROJECT_REVISED event, or null. */
function receiptOf(event: SchedulerEvent): TrajectoryIntentReceipt | null {
  if (event.event_type !== "PROJECT_REVISED") return null;
  const raw = payloadOf(event)["intent_reconciliation"];
  if (raw === undefined || raw === null) return null;
  try {
    return parseAcceptedIntentReconciliation(raw) as unknown as TrajectoryIntentReceipt;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Node / edge builders
 * ------------------------------------------------------------------ */

interface BuildState {
  readonly projectId: string;
  readonly nodes: TrajectoryNode[];
  readonly edges: TrajectoryEdge[];
  readonly unresolved: UnresolvedReference[];
  readonly conflicts: TrajectoryConflict[];
  readonly nodeByEventId: Map<number, TrajectoryNode>;
  readonly nodesByCanonicalId: Map<string, TrajectoryNode>;
}

function pushNode(state: BuildState, node: TrajectoryNode): TrajectoryNode {
  state.nodes.push(node);
  const key = `${node.reference.ownerPlane}\u0000${node.reference.ownerScope}\u0000${node.reference.canonicalId}`;
  state.nodesByCanonicalId.set(key, node);
  return node;
}

function pushEdge(state: BuildState, edge: TrajectoryEdge): void {
  state.edges.push(edge);
}

function established(input: {
  readonly relation: TrajectoryRelation;
  readonly from: TrajectoryNode;
  readonly to: TrajectoryNode;
  readonly byReference: TrajectoryOwnerReference;
  readonly carryingField: string;
  readonly compared: Readonly<Record<string, string>>;
  readonly detail: string;
}): TrajectoryEdge {
  return Object.freeze({
    schemaVersion: 1 as const,
    relation: input.relation,
    fromNodeId: input.from.nodeId,
    toNodeId: input.to.nodeId,
    evidenceState: "ESTABLISHED_BY_OWNER_REFERENCE" as const,
    evidence: Object.freeze({
      byReference: input.byReference,
      carryingField: input.carryingField,
      compared: Object.freeze({ ...input.compared }),
    }) satisfies TrajectoryEdgeEvidence,
    detail: input.detail,
  });
}

function nonEstablished(input: {
  readonly relation: TrajectoryRelation;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly evidenceState: (typeof EDGE_EVIDENCE_STATES)[number];
  readonly detail: string;
}): TrajectoryEdge {
  return Object.freeze({
    schemaVersion: 1 as const,
    relation: input.relation,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    evidenceState: input.evidenceState,
    evidence: null,
    detail: input.detail,
  });
}

/* ------------------------------------------------------------------ *
 * The projection
 * ------------------------------------------------------------------ */

export interface BuildTrajectoryOptions {
  readonly throughSequence?: number | undefined;
  readonly predecessorBasis?: { readonly projectSequence: number; readonly eventDigest: string } | null | undefined;
  /**
   * §4: owner cursors captured BEFORE this projection began, when a caller wants a checked cut.
   * When supplied, T0 re-reads them after the history and reports a RACED window if they moved.
   */
  readonly expectedWorkCursor?: { readonly projectSequence: number; readonly eventDigest: string } | null | undefined;
}

/**
 * §5: build the project trajectory.
 *
 * The projection reads the Work history first (the spine), then resolves every cross-owner
 * reference through the owning port. It never writes, never schedules and never promotes.
 */
export async function buildProjectTrajectory(
  inputs: TrajectoryProjectionInputs,
  options: BuildTrajectoryOptions = {},
): Promise<TrajectoryProjection> {
  const { projectId } = inputs;
  const work = inputs.work;

  /**
   * §4 observation-window consistency: read the Work basis, then the history, then the basis
   * again. If the basis moved, the window raced — reported, never silently re-read.
   */
  const window = await readObservationWindow<readonly SchedulerEvent[], readonly unknown[]>({
    readBasis: () => work.listProjectEvents(projectId),
    readHistory: () => work.listProjectEvents(projectId),
    equal: (left, right) =>
      left.length === right.length &&
      (left.length === 0 ||
        (left[left.length - 1]!.project_sequence === right[right.length - 1]!.project_sequence &&
          left[left.length - 1]!.event_digest === right[right.length - 1]!.event_digest)),
  });

  const rawEvents = window.history;
  const events = validateWorkHistory({
    projectId,
    events: rawEvents,
    ...(options.throughSequence === undefined ? {} : {}),
    predecessorBasis: options.predecessorBasis ?? null,
  });

  const asOfSequence = options.throughSequence ?? (events.length === 0 ? null : events[events.length - 1]!.project_sequence);
  const cutEvents = asOfSequence === null ? events : events.filter((event) => event.project_sequence <= asOfSequence);

  const state: BuildState = {
    projectId,
    nodes: [],
    edges: [],
    unresolved: [],
    conflicts: [],
    nodeByEventId: new Map(),
    nodesByCanonicalId: new Map(),
  };

  /* ---- Work spine: one node per canonical event ---- */
  for (const event of cutEvents) {
    const reference = makeOwnerReference({
      ownerPlane: "WORK",
      ownerScope: projectId,
      canonicalId: String(event.event_id),
      sourceSequence: event.project_sequence,
      sourceDigest: event.event_digest,
      projectId,
      verification: "VERIFIED_AGAINST_OWNER",
      verificationDetail: `event_id ${String(event.event_id)} re-parsed by parseSchedulerEvent; both digests recomputed and matched`,
    });
    const node = makeTrajectoryNode({
      reference,
      authenticity: "OWNER_RECORDED",
      epistemicStatus: epistemicStatusOf(event),
      currentness: "CURRENT",
      completeness: "COMPLETE",
      label: `${event.event_type} ${event.entity_id}`,
    });
    pushNode(state, node);
    state.nodeByEventId.set(event.event_id, node);
  }

  /* ---- Temporal succession: same owner, adjacent sequence. NEVER causation. ---- */
  for (let index = 1; index < cutEvents.length; index += 1) {
    const previous = cutEvents[index - 1]!;
    const current = cutEvents[index]!;
    const from = state.nodeByEventId.get(previous.event_id)!;
    const to = state.nodeByEventId.get(current.event_id)!;
    pushEdge(
      state,
      nonEstablished({
        relation: "SAME_OWNER_SEQUENCE_SUCCESSOR",
        fromNodeId: from.nodeId,
        toNodeId: to.nodeId,
        evidenceState: "TEMPORAL_ONLY",
        detail: `project_sequence ${String(previous.project_sequence)} precedes ${String(current.project_sequence)} in the same owner history; ordering only, not causation`,
      }),
    );
  }

  /* ---- Work relations ---- */
  buildWorkRelations(state, cutEvents);

  /* ---- ProjectIR revision chain ---- */
  buildRevisionRelations(state, cutEvents);

  /* ---- Cross-owner references ---- */
  await buildCrossOwnerReferences(state, inputs, cutEvents);

  /* ---- Basis vector ---- */
  const basisVector = await buildBasisVector(inputs, cutEvents, asOfSequence, window.moved, options.expectedWorkCursor ?? null);

  const rootId = trajectoryRootIdOf({ projectId, asOfSequence });
  const semanticDigest = trajectorySemanticDigestOf({
    rootId,
    basisVector,
    nodes: state.nodes,
    edges: state.edges,
    unresolved: state.unresolved,
  });

  return Object.freeze({
    schemaVersion: 1 as const,
    rootId,
    projectId,
    basisVector,
    nodes: Object.freeze([...state.nodes]),
    edges: Object.freeze([...state.edges]),
    sourceCoverage: Object.freeze(coverageOf(inputs, state)),
    unresolved: Object.freeze([...state.unresolved]),
    conflicts: Object.freeze([...state.conflicts]),
    currentness: Object.freeze(currentnessOf(basisVector, state)),
    asOf:
      options.throughSequence === undefined
        ? null
        : Object.freeze({
            throughSequence: options.throughSequence,
            predecessorBasis: options.predecessorBasis ?? null,
            includedEventIds: Object.freeze(cutEvents.map((event) => event.event_id)),
          }),
    hostObservationAdmission: HOST_OBSERVATION_ADMISSION,
    semanticDigest,
    readOnly: true as const,
  });
}

/** §3: the historical epistemic status of a Work event. */
function epistemicStatusOf(event: SchedulerEvent): EpistemicStatus {
  switch (event.event_type) {
    case "PROJECT_CREATED":
    case "PROJECT_REVISED":
      return "ADMITTED";
    case "PROMOTION_COMMITTED":
      return "PUBLISHED";
    case "ATTEMPT_COMPLETED":
      return "RECORDED";
    default:
      return "RECORDED";
  }
}

/** §5: the Work relations — authorization, result, promotion, rework. */
function buildWorkRelations(state: BuildState, events: readonly SchedulerEvent[]): void {
  const { projectId } = state;

  /** Authorization: ATTEMPT_CREATED names a task_id + envelope_id; the TASK_CREATED/TASK_REAUTHORIZED event carrying that envelope authorizes it. */
  const envelopeEventByEnvelopeId = new Map<string, SchedulerEvent>();
  for (const event of events) {
    if (event.event_type !== "TASK_CREATED" && event.event_type !== "TASK_REAUTHORIZED") continue;
    const envelope = payloadOf(event)["task_envelope"] as { envelope_id?: unknown } | undefined;
    const envelopeId = stringField(envelope?.envelope_id);
    if (envelopeId !== null) envelopeEventByEnvelopeId.set(envelopeId, event);
  }

  for (const event of events) {
    if (event.event_type !== "ATTEMPT_CREATED") continue;
    const attemptNode = state.nodeByEventId.get(event.event_id)!;
    const payload = payloadOf(event);
    const envelopeId = stringField(payload["envelope_id"]);
    const taskId = stringField(payload["task_id"]);
    if (envelopeId === null || taskId === null) {
      state.unresolved.push(
        Object.freeze({
          relation: "TASK_AUTHORIZED_ATTEMPT",
          requestedIdentity: event.entity_id,
          ownerThatShouldSupply: "WORK",
          reason: "the ATTEMPT_CREATED payload carries no envelope_id/task_id, so its authorization cannot be resolved",
        }),
      );
      continue;
    }
    const authorizationEvent = envelopeEventByEnvelopeId.get(envelopeId);
    if (authorizationEvent === undefined) {
      pushEdge(
        state,
        nonEstablished({
          relation: "TASK_AUTHORIZED_ATTEMPT",
          fromNodeId: attemptNode.nodeId,
          toNodeId: attemptNode.nodeId,
          evidenceState: "UNRESOLVED_SOURCE",
          detail: `no TASK_CREATED/TASK_REAUTHORIZED event in this project carries envelope_id ${envelopeId}`,
        }),
      );
      state.unresolved.push(
        Object.freeze({
          relation: "TASK_AUTHORIZED_ATTEMPT",
          requestedIdentity: envelopeId,
          ownerThatShouldSupply: "WORK",
          reason: "the authorizing envelope event is absent from the project history",
        }),
      );
      continue;
    }
    const authorizationNode = state.nodeByEventId.get(authorizationEvent.event_id)!;
    pushEdge(
      state,
      established({
        relation: "TASK_AUTHORIZED_ATTEMPT",
        from: authorizationNode,
        to: attemptNode,
        byReference: authorizationNode.reference,
        carryingField: "ATTEMPT_CREATED.payload.envelope_id == TASK_*.payload.task_envelope.envelope_id",
        compared: {
          envelopeId,
          taskId,
          authorizationEventType: authorizationEvent.event_type,
          authorizationEventId: String(authorizationEvent.event_id),
        },
        detail: `attempt ${event.entity_id} was authorized by ${authorizationEvent.event_type} at event_id ${String(authorizationEvent.event_id)}`,
      }),
    );
  }

  /** Result: an ATTEMPT_COMPLETED/FAILED event carries the attempt's own report. */
  const attemptCreatedEventByAttemptId = new Map<string, SchedulerEvent>();
  for (const event of events) {
    if (event.event_type === "ATTEMPT_CREATED") attemptCreatedEventByAttemptId.set(event.entity_id, event);
  }
  for (const event of events) {
    if (event.event_type !== "ATTEMPT_COMPLETED" && event.event_type !== "ATTEMPT_FAILED") continue;
    const terminalNode = state.nodeByEventId.get(event.event_id)!;
    const report = payloadOf(event)["attempt_report"] as { attempt_id?: unknown; result_commit?: unknown } | undefined;
    const reportAttemptId = stringField(report?.attempt_id);
    const created = attemptCreatedEventByAttemptId.get(event.entity_id);
    if (reportAttemptId === null || reportAttemptId !== event.entity_id) {
      state.conflicts.push(
        Object.freeze({
          subject: event.entity_id,
          ownerPlane: "WORK",
          claimed: event.entity_id,
          observed: reportAttemptId ?? "absent",
          detail: "the attempt report's attempt_id does not match the terminal event's entity_id",
        }),
      );
      continue;
    }
    if (created === undefined) {
      state.unresolved.push(
        Object.freeze({
          relation: "ATTEMPT_PRODUCED_RESULT",
          requestedIdentity: event.entity_id,
          ownerThatShouldSupply: "WORK",
          reason: "no ATTEMPT_CREATED event for this attempt exists in the project history",
        }),
      );
      continue;
    }
    const createdNode = state.nodeByEventId.get(created.event_id)!;
    pushEdge(
      state,
      established({
        relation: "ATTEMPT_PRODUCED_RESULT",
        from: createdNode,
        to: terminalNode,
        byReference: terminalNode.reference,
        carryingField: "ATTEMPT_COMPLETED.payload.attempt_report.attempt_id",
        compared: { attemptId: event.entity_id, resultCommit: stringField(report?.result_commit) ?? "none" },
        detail: `attempt ${event.entity_id} reported a result at event_id ${String(event.event_id)}`,
      }),
    );
  }

  /** Promotion: PROMOTION_COMMITTED names the attempt it promoted. */
  for (const event of events) {
    if (event.event_type !== "PROMOTION_COMMITTED") continue;
    const promotionNode = state.nodeByEventId.get(event.event_id)!;
    const payload = payloadOf(event);
    const attemptId = stringField(payload["attempt_id"]);
    if (attemptId === null) continue;
    const created = attemptCreatedEventByAttemptId.get(attemptId);
    const resultNode =
      created === undefined
        ? undefined
        : events
            .filter((candidate) => candidate.entity_id === attemptId && candidate.event_type === "ATTEMPT_COMPLETED")
            .map((candidate) => state.nodeByEventId.get(candidate.event_id))
            .find((node) => node !== undefined);
    if (resultNode === undefined) {
      pushEdge(
        state,
        nonEstablished({
          relation: "RESULT_PROMOTED",
          fromNodeId: promotionNode.nodeId,
          toNodeId: promotionNode.nodeId,
          evidenceState: "UNRESOLVED_SOURCE",
          detail: `promotion ${stringField(payload["promotion_id"]) ?? "?"} names attempt ${attemptId}, whose completed result is not in this project history`,
        }),
      );
      continue;
    }
    pushEdge(
      state,
      established({
        relation: "RESULT_PROMOTED",
        from: resultNode,
        to: promotionNode,
        byReference: promotionNode.reference,
        carryingField: "PROMOTION_COMMITTED.payload.attempt_id",
        compared: { attemptId, promotionId: stringField(payload["promotion_id"]) ?? "none" },
        detail: `the result of attempt ${attemptId} was promoted by ${stringField(payload["promotion_id"]) ?? "?"}`,
      }),
    );
  }

  /** Rework: a governed TASK_READY carries rework_provenance naming the ORIGIN result subject. */
  for (const event of events) {
    if (event.event_type !== "TASK_READY") continue;
    const readyNode = state.nodeByEventId.get(event.event_id)!;
    const provenance = payloadOf(event)["rework_provenance"] as
      | { origin_result_subject?: { kind?: unknown; ref?: unknown } }
      | undefined;
    if (provenance === undefined) continue;
    const originRef = stringField(provenance.origin_result_subject?.ref);
    const originKind = stringField(provenance.origin_result_subject?.kind);
    if (originRef === null) {
      state.unresolved.push(
        Object.freeze({
          relation: "ATTEMPT_REOPENED_FOR_REWORK",
          requestedIdentity: event.entity_id,
          ownerThatShouldSupply: "WORK",
          reason: "the rework provenance carries no origin_result_subject.ref",
        }),
      );
      continue;
    }
    const originTerminal = events.find(
      (candidate) =>
        candidate.entity_id === originRef &&
        (candidate.event_type === "ATTEMPT_COMPLETED" || candidate.event_type === "ATTEMPT_FAILED"),
    );
    if (originTerminal === undefined) {
      pushEdge(
        state,
        nonEstablished({
          relation: "ATTEMPT_REOPENED_FOR_REWORK",
          fromNodeId: readyNode.nodeId,
          toNodeId: readyNode.nodeId,
          evidenceState: "UNRESOLVED_SOURCE",
          detail: `the rework provenance names origin result ${originRef}, which is not in this project history`,
        }),
      );
      state.unresolved.push(
        Object.freeze({
          relation: "ATTEMPT_REOPENED_FOR_REWORK",
          requestedIdentity: originRef,
          ownerThatShouldSupply: "WORK",
          reason: "the origin result the rework cites is not recorded in this project",
        }),
      );
      continue;
    }
    const originNode = state.nodeByEventId.get(originTerminal.event_id)!;
    pushEdge(
      state,
      established({
        relation: "ATTEMPT_REOPENED_FOR_REWORK",
        from: originNode,
        to: readyNode,
        byReference: readyNode.reference,
        carryingField: "TASK_READY.payload.rework_provenance.origin_result_subject.ref",
        compared: { originRef, originKind: originKind ?? "unknown", taskId: event.entity_id },
        detail: `task ${event.entity_id} was reopened for rework against the result of ${originRef}`,
      }),
    );
  }
}

/** §5: the ProjectIR revision chain, from the events that carry each revision. */
function buildRevisionRelations(state: BuildState, events: readonly SchedulerEvent[]): void {
  const revisionNodeByRevision = new Map<number, TrajectoryNode>();
  const revisionEventByRevision = new Map<number, SchedulerEvent>();
  for (const event of events) {
    const ir = projectIrOf(event);
    if (ir === null) continue;
    revisionNodeByRevision.set(ir.revision, state.nodeByEventId.get(event.event_id)!);
    revisionEventByRevision.set(ir.revision, event);
  }

  for (const event of events) {
    if (event.event_type !== "PROJECT_REVISED") continue;
    const ir = projectIrOf(event);
    if (ir === null) continue;
    const to = state.nodeByEventId.get(event.event_id)!;
    if (ir.parent_revision === null) continue;
    const from = revisionNodeByRevision.get(ir.parent_revision);
    if (from === undefined) {
      pushEdge(
        state,
        nonEstablished({
          relation: "REVISION_SUCCEEDED_REVISION",
          fromNodeId: to.nodeId,
          toNodeId: to.nodeId,
          evidenceState: "UNRESOLVED_SOURCE",
          detail: `revision ${String(ir.revision)} names parent revision ${String(ir.parent_revision)}, which is not in this cut`,
        }),
      );
      state.unresolved.push(
        Object.freeze({
          relation: "REVISION_SUCCEEDED_REVISION",
          requestedIdentity: `revision-${String(ir.parent_revision)}`,
          ownerThatShouldSupply: "WORK",
          reason: "the parent ProjectIR revision is outside the projected interval",
        }),
      );
      continue;
    }
    pushEdge(
      state,
      established({
        relation: "REVISION_SUCCEEDED_REVISION",
        from,
        to,
        byReference: to.reference,
        carryingField: "PROJECT_REVISED.payload.project_ir.parent_revision",
        compared: {
          revision: String(ir.revision),
          parentRevision: String(ir.parent_revision),
          parentDigest: ir.parent_digest ?? "none",
        },
        detail: `ProjectIR revision ${String(ir.revision)} succeeded revision ${String(ir.parent_revision)}`,
      }),
    );

    /** Governed intent: the receipt's proposalBasis names the revision the proposal was made against. */
    const receipt = receiptOf(event);
    if (receipt === null) continue;
    const basisRevision = receipt.proposalBasis.revision;
    const basisNode = revisionNodeByRevision.get(basisRevision);
    if (basisNode !== undefined) {
      pushEdge(
        state,
        established({
          relation: "GOVERNED_INTENT_CHANGED_PROJECT",
          from: basisNode,
          to,
          byReference: to.reference,
          carryingField: "PROJECT_REVISED.payload.intent_reconciliation.proposalBasis",
          compared: {
            proposalId: receipt.proposalId,
            proposalDigest: receipt.proposalDigest,
            basisRevision: String(basisRevision),
            basisDigest: receipt.proposalBasis.digest,
          },
          detail: `an accepted intent receipt (proposal ${receipt.proposalId}) revised the project from revision ${String(basisRevision)}`,
        }),
      );
    } else {
      state.unresolved.push(
        Object.freeze({
          relation: "GOVERNED_INTENT_CHANGED_PROJECT",
          requestedIdentity: receipt.proposalId,
          ownerThatShouldSupply: "WORK",
          reason: `the receipt's proposal basis names revision ${String(basisRevision)}, which is outside the projected interval`,
        }),
      );
    }
  }
  void revisionEventByRevision;
}

/* ------------------------------------------------------------------ *
 * §5 Cross-owner validation
 * ------------------------------------------------------------------ */

/**
 * §5: resolve every externally referenced Reasoning / Proof / Journal artifact through the OWNING
 * read port, verify the requested identity and digest, confirm the project association, classify an
 * unavailable source explicitly, and add an established edge ONLY when the relationship is
 * supported.
 *
 * A claim belonging to a different project never becomes associated merely because its ID appears
 * in a request.
 */
async function buildCrossOwnerReferences(
  state: BuildState,
  inputs: TrajectoryProjectionInputs,
  events: readonly SchedulerEvent[],
): Promise<void> {
  const { projectId } = state;
  const associations = await readAssociations(inputs, projectId);

  for (const event of events) {
    if (event.event_type !== "PROJECT_REVISED") continue;
    const receipt = receiptOf(event);
    if (receipt === null) continue;
    const revisedNode = state.nodeByEventId.get(event.event_id)!;
    for (const rawGround of receipt.groundBindings) {
      await resolveGround(state, inputs, associations, rawGround, revisedNode, projectId);
    }
  }
}

async function readAssociations(inputs: TrajectoryProjectionInputs, projectId: string): Promise<readonly TrajectoryAssociation[]> {
  if (inputs.workspace === undefined) return Object.freeze([]);
  try {
    return await inputs.workspace.associations(projectId);
  } catch {
    return Object.freeze([]);
  }
}

function associatedWith(
  associations: readonly TrajectoryAssociation[],
  kind: string,
  id: string,
): TrajectoryAssociation | undefined {
  return associations.find((entry) => entry.assetKind === kind && entry.canonicalRef.id === id);
}

async function resolveGround(
  state: BuildState,
  inputs: TrajectoryProjectionInputs,
  associations: readonly TrajectoryAssociation[],
  rawGround: unknown,
  revisedNode: TrajectoryNode,
  projectId: string,
): Promise<void> {
  if (typeof rawGround !== "object" || rawGround === null) {
    state.unresolved.push(
      Object.freeze({
        relation: "RECEIPT_REFERENCED_GROUND",
        requestedIdentity: "unknown",
        ownerThatShouldSupply: "NONE",
        reason: "the receipt carries a ground binding that is not an object",
      }),
    );
    return;
  }
  const ground = rawGround as Record<string, unknown>;
  const kind = stringField(ground["kind"]);

  if (kind === "proof") {
    const claimId = stringField(ground["claimId"]);
    if (claimId === null) {
      state.unresolved.push(
        Object.freeze({ relation: "RECEIPT_REFERENCED_GROUND", requestedIdentity: "proof:?", ownerThatShouldSupply: "PROOF", reason: "the proof ground carries no claimId" }),
      );
      return;
    }
    const reference = makeOwnerReference({
      ownerPlane: "PROOF",
      ownerScope: "proof",
      canonicalId: claimId,
      sourceDigest: null,
      projectId,
      verification: "UNRESOLVED",
      verificationDetail: "pending resolution against the proof plane",
    });
    if (inputs.proof === undefined) {
      const node = makeTrajectoryNode({
        reference: { ...reference, verification: "UNRESOLVED", verificationDetail: "the proof plane is not composed in this deployment" },
        authenticity: "UNRESOLVED",
        epistemicStatus: "UNRESOLVED",
        currentness: "UNAVAILABLE",
        completeness: "MISSING_SOURCE",
        label: `proof ${claimId}`,
      });
      pushNode(state, node);
      pushEdge(
        state,
        nonEstablished({
          relation: "RECEIPT_REFERENCED_GROUND",
          fromNodeId: node.nodeId,
          toNodeId: revisedNode.nodeId,
          evidenceState: "UNRESOLVED_SOURCE",
          detail: "the receipt grounds on a proof claim, but no proof plane is composed",
        }),
      );
      state.unresolved.push(
        Object.freeze({ relation: "RECEIPT_REFERENCED_GROUND", requestedIdentity: claimId, ownerThatShouldSupply: "PROOF", reason: "the proof plane is not composed" }),
      );
      return;
    }
    const view = await safeProofView(inputs.proof, claimId);
    if (view === null) {
      const node = makeTrajectoryNode({
        reference: { ...reference, verification: "UNRESOLVED", verificationDetail: "the proof plane resolved no published claim with this id" },
        authenticity: "UNRESOLVED",
        epistemicStatus: "UNRESOLVED",
        currentness: "UNAVAILABLE",
        completeness: "MISSING_SOURCE",
        label: `proof ${claimId}`,
      });
      pushNode(state, node);
      pushEdge(
        state,
        nonEstablished({
          relation: "RECEIPT_REFERENCED_GROUND",
          fromNodeId: node.nodeId,
          toNodeId: revisedNode.nodeId,
          evidenceState: "UNRESOLVED_SOURCE",
          detail: `the proof plane holds no published claim ${claimId}`,
        }),
      );
      state.unresolved.push(
        Object.freeze({ relation: "RECEIPT_REFERENCED_GROUND", requestedIdentity: claimId, ownerThatShouldSupply: "PROOF", reason: "the proof claim is not published in the proof plane" }),
      );
      return;
    }
    const association = associatedWith(associations, "PROOF_CLAIM", claimId);
    if (association === undefined) {
      const node = makeTrajectoryNode({
        reference: { ...reference, verification: "MISMATCH", verificationDetail: "the proof claim exists but is NOT associated with this project" },
        authenticity: "OWNER_RECORDED",
        epistemicStatus: "PUBLISHED",
        currentness: "CURRENT",
        completeness: "PARTIAL",
        label: `proof ${claimId}`,
      });
      pushNode(state, node);
      pushEdge(
        state,
        nonEstablished({
          relation: "RECEIPT_REFERENCED_GROUND",
          fromNodeId: node.nodeId,
          toNodeId: revisedNode.nodeId,
          evidenceState: "UNRESOLVED_SOURCE",
          detail: `proof claim ${claimId} is published but carries no project association for ${projectId}`,
        }),
      );
      state.unresolved.push(
        Object.freeze({ relation: "RECEIPT_REFERENCED_GROUND", requestedIdentity: claimId, ownerThatShouldSupply: "WORKSPACE", reason: `no PROOF_CLAIM association exists for ${claimId} in project ${projectId}` }),
      );
      return;
    }
    const referenceVerified = makeOwnerReference({
      ownerPlane: "PROOF",
      ownerScope: "proof",
      canonicalId: claimId,
      sourceDigest: null,
      projectId,
      verification: "RESOLVED_WITHOUT_DIGEST",
      verificationDetail: `resolved by the proof plane; associated via ${association.associationId}`,
    });
    const node = makeTrajectoryNode({
      reference: referenceVerified,
      authenticity: "OWNER_RECORDED",
      epistemicStatus: "PUBLISHED",
      currentness: "CURRENT",
      completeness: "COMPLETE",
      label: `proof ${claimId}`,
    });
    pushNode(state, node);
    pushEdge(
      state,
      established({
        relation: "RECEIPT_REFERENCED_GROUND",
        from: node,
        to: revisedNode,
        byReference: node.reference,
        carryingField: "PROJECT_REVISED.payload.intent_reconciliation.groundBindings[kind=proof].claimId",
        compared: {
          claimId,
          projectAssociation: association.associationId,
          standingAtProposal: stringField(ground["standingAtProposal"]) ?? "unknown",
        },
        detail: `the accepted receipt grounds on published proof claim ${claimId}`,
      }),
    );
    return;
  }

  if (kind === "reasoning") {
    const cellId = stringField(ground["cellId"]);
    const claimId = stringField(ground["claimId"]);
    if (cellId === null || claimId === null) {
      state.unresolved.push(
        Object.freeze({ relation: "RECEIPT_REFERENCED_GROUND", requestedIdentity: "reasoning:?", ownerThatShouldSupply: "REASONING", reason: "the reasoning ground carries no cellId/claimId" }),
      );
      return;
    }
    if (inputs.reasoning === undefined) {
      const node = makeTrajectoryNode({
        reference: makeOwnerReference({
          ownerPlane: "REASONING",
          ownerScope: cellId,
          canonicalId: claimId,
          sourceDigest: null,
          projectId,
          verification: "UNRESOLVED",
          verificationDetail: "the reasoning plane is not composed in this deployment",
        }),
        authenticity: "UNRESOLVED",
        epistemicStatus: "UNRESOLVED",
        currentness: "UNAVAILABLE",
        completeness: "MISSING_SOURCE",
        label: `reasoning ${claimId}`,
      });
      pushNode(state, node);
      pushEdge(
        state,
        nonEstablished({
          relation: "RECEIPT_REFERENCED_GROUND",
          fromNodeId: node.nodeId,
          toNodeId: revisedNode.nodeId,
          evidenceState: "UNRESOLVED_SOURCE",
          detail: "the receipt grounds on a reasoning claim, but no reasoning plane is composed",
        }),
      );
      state.unresolved.push(
        Object.freeze({ relation: "RECEIPT_REFERENCED_GROUND", requestedIdentity: claimId, ownerThatShouldSupply: "REASONING", reason: "the reasoning plane is not composed" }),
      );
      return;
    }
    const frontier = await safeFrontier(inputs.reasoning, cellId);
    const active = frontier?.activeClaimIds.includes(claimId) ?? false;
    const inactive = frontier?.inactiveClaimIds.includes(claimId) ?? false;
    const cellAssociation = associatedWith(associations, "REASONING_CELL", cellId);
    const replay = await safeReasoningReplay(inputs.reasoning, cellId);
    const admitted = replay.some(
      (entry) => entry.type === "CLAIM_ADMITTED" && canonicalDigest(entry.payload).length > 0 && JSON.stringify(entry.payload).includes(claimId),
    );
    if (frontier === null) {
      state.unresolved.push(
        Object.freeze({ relation: "RECEIPT_REFERENCED_GROUND", requestedIdentity: `${cellId}/${claimId}`, ownerThatShouldSupply: "REASONING", reason: `the reasoning plane resolved no cell ${cellId}` }),
      );
      return;
    }
    if (!active && !inactive && !admitted) {
      state.unresolved.push(
        Object.freeze({ relation: "RECEIPT_REFERENCED_GROUND", requestedIdentity: `${cellId}/${claimId}`, ownerThatShouldSupply: "REASONING", reason: `cell ${cellId} neither holds claim ${claimId} on its frontier nor records its admission` }),
      );
      return;
    }
    if (cellAssociation === undefined) {
      const node = makeTrajectoryNode({
        reference: makeOwnerReference({
          ownerPlane: "REASONING",
          ownerScope: cellId,
          canonicalId: claimId,
          sourceDigest: frontier.frontierDigest,
          projectId,
          verification: "MISMATCH",
          verificationDetail: "the reasoning claim exists but its cell is NOT associated with this project",
        }),
        authenticity: "OWNER_RECORDED",
        epistemicStatus: active ? "ADMITTED" : "INVALIDATED",
        currentness: active ? "CURRENT" : "STALE_BY_OWNER",
        completeness: "PARTIAL",
        label: `reasoning ${claimId}`,
      });
      pushNode(state, node);
      pushEdge(
        state,
        nonEstablished({
          relation: "RECEIPT_REFERENCED_GROUND",
          fromNodeId: node.nodeId,
          toNodeId: revisedNode.nodeId,
          evidenceState: "UNRESOLVED_SOURCE",
          detail: `reasoning cell ${cellId} carries no project association for ${projectId}`,
        }),
      );
      state.unresolved.push(
        Object.freeze({ relation: "RECEIPT_REFERENCED_GROUND", requestedIdentity: `${cellId}/${claimId}`, ownerThatShouldSupply: "WORKSPACE", reason: `no REASONING_CELL association exists for ${cellId} in project ${projectId}` }),
      );
      return;
    }
    const node = makeTrajectoryNode({
      reference: makeOwnerReference({
        ownerPlane: "REASONING",
        ownerScope: cellId,
        canonicalId: claimId,
        sourceDigest: frontier.frontierDigest,
        projectId,
        verification: "RESOLVED_WITHOUT_DIGEST",
        verificationDetail: `resolved by the reasoning plane (frontier revision ${String(frontier.frontierRevision)}); associated via ${cellAssociation.associationId}`,
      }),
      authenticity: "OWNER_RECORDED",
      epistemicStatus: active ? "ADMITTED" : inactive ? "INVALIDATED" : "ADMITTED",
      currentness: active ? "CURRENT" : "STALE_BY_OWNER",
      completeness: "COMPLETE",
      label: `reasoning ${claimId}`,
    });
    pushNode(state, node);
    pushEdge(
      state,
      established({
        relation: "RECEIPT_REFERENCED_GROUND",
        from: node,
        to: revisedNode,
        byReference: node.reference,
        carryingField: "PROJECT_REVISED.payload.intent_reconciliation.groundBindings[kind=reasoning].claimId",
        compared: {
          cellId,
          claimId,
          projectAssociation: cellAssociation.associationId,
          frontierRevision: String(frontier.frontierRevision),
          frontierDigest: frontier.frontierDigest,
          activeAtProposal: stringField(String(ground["activeAtProposal"])) ?? "unknown",
        },
        detail: `the accepted receipt grounds on reasoning claim ${claimId} in cell ${cellId}`,
      }),
    );
    return;
  }

  if (kind === "negative_result") {
    const entryId = stringField(ground["entryId"]);
    if (entryId === null) {
      state.unresolved.push(
        Object.freeze({ relation: "RECEIPT_REFERENCED_GROUND", requestedIdentity: "negative_result:?", ownerThatShouldSupply: "WORKSPACE", reason: "the negative-result ground carries no entryId" }),
      );
      return;
    }
    if (inputs.workspace === undefined) {
      state.unresolved.push(
        Object.freeze({ relation: "RECEIPT_REFERENCED_GROUND", requestedIdentity: entryId, ownerThatShouldSupply: "WORKSPACE", reason: "the workspace (journal) plane is not composed" }),
      );
      return;
    }
    const journal = await safeJournal(inputs.workspace, projectId);
    const entry = journal.find((candidate) => candidate.type === "JOURNAL_ENTRY_RECORDED" && JSON.stringify(candidate.payload).includes(entryId));
    if (entry === undefined) {
      state.unresolved.push(
        Object.freeze({ relation: "RECEIPT_REFERENCED_GROUND", requestedIdentity: entryId, ownerThatShouldSupply: "WORKSPACE", reason: `the project journal holds no recorded entry ${entryId}` }),
      );
      return;
    }
    const node = makeTrajectoryNode({
      reference: makeOwnerReference({
        ownerPlane: "WORKSPACE",
        ownerScope: projectId,
        canonicalId: entryId,
        sourceSequence: entry.seq,
        sourceDigest: entry.chainDigest,
        projectId,
        verification: "VERIFIED_AGAINST_OWNER",
        verificationDetail: `resolved in the project journal at seq ${String(entry.seq)}`,
      }),
      authenticity: "OWNER_RECORDED",
      /**
       * §7 B-N7: a NEGATIVE_RESULT is a journal entry that GROUNDED a proposal. It is NOT
       * independent Proof truth, so its epistemic status is RECORDED — never PUBLISHED/ADMITTED.
       */
      epistemicStatus: "RECORDED",
      currentness: "CURRENT",
      completeness: "COMPLETE",
      label: `journal negative result ${entryId}`,
    });
    pushNode(state, node);
    pushEdge(
      state,
      established({
        relation: "RECEIPT_REFERENCED_GROUND",
        from: node,
        to: revisedNode,
        byReference: node.reference,
        carryingField: "PROJECT_REVISED.payload.intent_reconciliation.groundBindings[kind=negative_result].entryId",
        compared: { entryId, journalSeq: String(entry.seq), journalKind: "NEGATIVE_RESULT" },
        detail: `the accepted receipt grounds on journal entry ${entryId}; the entry is recorded, NOT proof truth`,
      }),
    );
    return;
  }

  state.unresolved.push(
    Object.freeze({
      relation: "RECEIPT_REFERENCED_GROUND",
      requestedIdentity: kind ?? "unknown",
      ownerThatShouldSupply: "NONE",
      reason: `the receipt carries an unrecognised ground kind "${kind ?? "unknown"}"`,
    }),
  );
}

async function safeProofView(
  port: NonNullable<TrajectoryProjectionInputs["proof"]>,
  claimId: string,
): Promise<TrajectoryProofClaimView | null> {
  try {
    return await port.proofClaimView(claimId);
  } catch {
    return null;
  }
}

async function safeFrontier(
  port: NonNullable<TrajectoryProjectionInputs["reasoning"]>,
  cellId: string,
): Promise<{ readonly cellId: string; readonly frontierRevision: number; readonly frontierDigest: string; readonly activeClaimIds: readonly string[]; readonly inactiveClaimIds: readonly string[] } | null> {
  try {
    return await port.frontier(cellId);
  } catch {
    return null;
  }
}

async function safeReasoningReplay(
  port: NonNullable<TrajectoryProjectionInputs["reasoning"]>,
  cellId: string,
): Promise<readonly TrajectoryReasoningEvent[]> {
  try {
    return await port.replay(cellId);
  } catch {
    return Object.freeze([]);
  }
}

async function safeJournal(
  port: NonNullable<TrajectoryProjectionInputs["workspace"]>,
  projectId: string,
): Promise<readonly TrajectoryJournalEvent[]> {
  try {
    return await port.replayJournal(projectId);
  } catch {
    return Object.freeze([]);
  }
}

/* ------------------------------------------------------------------ *
 * §4 Basis vector
 * ------------------------------------------------------------------ */

async function buildBasisVector(
  inputs: TrajectoryProjectionInputs,
  cutEvents: readonly SchedulerEvent[],
  asOfSequence: number | null,
  raced: boolean,
  expectedWorkCursor: { readonly projectSequence: number; readonly eventDigest: string } | null,
): Promise<TrajectoryBasisVector> {
  const { projectId } = inputs;
  const unavailable: string[] = [];
  const last = cutEvents.length === 0 ? null : cutEvents[cutEvents.length - 1]!;

  const workComponent: WorkBasisComponent = workBasisComponent({
    projectId,
    projectSequence: last?.project_sequence ?? null,
    eventDigest: last?.event_digest ?? null,
    projectIrRevision: projectIrAt(cutEvents)?.revision ?? null,
    projectIrDigest: projectIrAt(cutEvents)?.digest ?? null,
  });

  const projectIrCursor: OwnerBasisCursor = Object.freeze({
    availability: projectIrAt(cutEvents) === null ? "EMPTY" : "AVAILABLE",
    scope: projectId,
    throughSequence: projectIrAt(cutEvents)?.revision ?? null,
    digest: projectIrAt(cutEvents)?.digest ?? null,
    detail: "the ProjectIR revision recorded in the Work event history at this cut",
  });

  /** Reasoning: only cells actually referenced by this cut are read. */
  const reasoningComponents: ReasoningBasisComponent[] = [];
  const referencedCells = referencedReasoningCells(cutEvents);
  for (const cellId of referencedCells) {
    if (inputs.reasoning === undefined) {
      reasoningComponents.push(
        Object.freeze({
          cellId,
          availability: "NOT_COMPOSED" as const,
          scope: cellId,
          throughSequence: null,
          digest: null,
          frontierRevision: null,
          frontierDigest: null,
          detail: "the reasoning plane is not composed in this deployment",
        }),
      );
      unavailable.push(`reasoning cell ${cellId}`);
      continue;
    }
    const basis = await safeReasoningBasis(inputs.reasoning, cellId);
    const frontier = await safeFrontier(inputs.reasoning, cellId);
    reasoningComponents.push(
      Object.freeze({
        cellId,
        availability: basis === null ? ("UNAVAILABLE" as const) : ("AVAILABLE" as const),
        scope: cellId,
        throughSequence: basis?.throughSeq ?? null,
        digest: basis?.chainDigest ?? null,
        frontierRevision: frontier?.frontierRevision ?? null,
        frontierDigest: frontier?.frontierDigest ?? null,
        detail: basis === null ? "the reasoning plane resolved no such cell" : `cell chain read through seq ${String(basis.throughSeq)}`,
      }),
    );
    if (basis === null) unavailable.push(`reasoning cell ${cellId}`);
  }

  /** Proof: a single global scope. */
  let proofComponent: ProofBasisComponent;
  if (inputs.proof === undefined) {
    proofComponent = Object.freeze({
      availability: "NOT_COMPOSED" as const,
      scope: null,
      throughSequence: null,
      digest: null,
      scopeId: null,
      detail: "the proof plane is not composed in this deployment",
    });
    unavailable.push("proof plane");
  } else {
    const basis = await safeProofBasis(inputs.proof);
    proofComponent = Object.freeze({
      availability: basis === null ? ("UNAVAILABLE" as const) : ("AVAILABLE" as const),
      scope: basis?.scopeId ?? null,
      throughSequence: basis?.throughSeq ?? null,
      digest: basis?.chainDigest ?? null,
      scopeId: basis?.scopeId ?? null,
      detail: basis === null ? "the proof plane resolved no basis" : `proof chain read through seq ${String(basis.throughSeq)}`,
    });
    if (basis === null) unavailable.push("proof plane");
  }

  /** Journal: the project's own journal scope. */
  const journalComponents: JournalBasisComponent[] = [];
  if (inputs.workspace === undefined) {
    journalComponents.push(
      Object.freeze({
        projectId,
        availability: "NOT_COMPOSED" as const,
        scope: projectId,
        throughSequence: null,
        digest: null,
        detail: "the workspace (journal) plane is not composed in this deployment",
      }),
    );
  } else {
    const basis = await safeJournalBasis(inputs.workspace, projectId);
    journalComponents.push(
      Object.freeze({
        projectId,
        availability: basis === null ? ("EMPTY" as const) : ("AVAILABLE" as const),
        scope: basis?.scopeId ?? projectId,
        throughSequence: basis?.throughSeq ?? null,
        digest: basis?.chainDigest ?? null,
        detail: basis === null ? "the project has no journal scope" : `journal read through seq ${String(basis.throughSeq)}`,
      }),
    );
  }

  /** World: the historical basis of every attempt this cut references. */
  const worldComponents: WorldBasisComponent[] = [];
  for (const attemptId of referencedAttempts(cutEvents)) {
    const basis = await safeWorldBasis(inputs.work, attemptId);
    worldComponents.push(
      Object.freeze({
        attemptId,
        availability: basis === null ? ("EMPTY" as const) : ("AVAILABLE" as const),
        scope: attemptId,
        throughSequence: basis?.capturedAtRevision ?? null,
        digest: basis?.basisDigest ?? null,
        basisDigest: basis?.basisDigest ?? null,
        detail: basis === null ? "the attempt recorded no world basis" : "the attempt's immutable captured basis",
      }),
    );
  }

  const cursorMoved =
    expectedWorkCursor !== null &&
    (workComponent.projectSequence !== expectedWorkCursor.projectSequence || workComponent.eventDigest !== expectedWorkCursor.eventDigest);
  const completeness: BasisVectorCompleteness =
    raced || cursorMoved ? BASIS_VECTOR_COMPLETENESS[2] : unavailable.length > 0 ? BASIS_VECTOR_COMPLETENESS[1] : BASIS_VECTOR_COMPLETENESS[0];

  return Object.freeze({
    schemaVersion: 1 as const,
    work: workComponent,
    projectIr: projectIrCursor,
    reasoning: Object.freeze(reasoningComponents),
    proof: proofComponent,
    journal: Object.freeze(journalComponents),
    world: Object.freeze(worldComponents),
    completeness,
    unavailable: Object.freeze([...unavailable]),
  });
  void asOfSequence;
}

function projectIrAt(cutEvents: readonly SchedulerEvent[]): ProjectIr | null {
  let found: ProjectIr | null = null;
  for (const event of cutEvents) {
    const ir = projectIrOf(event);
    if (ir !== null) found = ir;
  }
  return found;
}

function referencedAttempts(cutEvents: readonly SchedulerEvent[]): readonly string[] {
  const ids = new Set<string>();
  for (const event of cutEvents) {
    if (event.event_type === "ATTEMPT_CREATED") ids.add(event.entity_id);
  }
  return Object.freeze([...ids].sort());
}

function referencedReasoningCells(cutEvents: readonly SchedulerEvent[]): readonly string[] {
  const cells = new Set<string>();
  for (const event of cutEvents) {
    const receipt = receiptOf(event);
    if (receipt === null) continue;
    for (const rawGround of receipt.groundBindings) {
      if (typeof rawGround !== "object" || rawGround === null) continue;
      const ground = rawGround as Record<string, unknown>;
      if (ground["kind"] === "reasoning") {
        const cellId = stringField(ground["cellId"]);
        if (cellId !== null) cells.add(cellId);
      }
    }
  }
  return Object.freeze([...cells].sort());
}

async function safeReasoningBasis(
  port: NonNullable<TrajectoryProjectionInputs["reasoning"]>,
  cellId: string,
): Promise<{ readonly cellId: string; readonly throughSeq: number; readonly chainDigest: string } | null> {
  try {
    return await port.basis(cellId);
  } catch {
    return null;
  }
}

async function safeProofBasis(
  port: NonNullable<TrajectoryProjectionInputs["proof"]>,
): Promise<{ readonly scopeId: string; readonly throughSeq: number; readonly chainDigest: string } | null> {
  try {
    return await port.basis();
  } catch {
    return null;
  }
}

async function safeJournalBasis(
  port: NonNullable<TrajectoryProjectionInputs["workspace"]>,
  projectId: string,
): Promise<{ readonly scopeId: string; readonly throughSeq: number; readonly chainDigest: string } | null> {
  try {
    return await port.journalBasis(projectId);
  } catch {
    return null;
  }
}

async function safeWorldBasis(
  port: TrajectoryProjectionInputs["work"],
  attemptId: string,
): Promise<{ readonly basisDigest: string; readonly capturedAtRevision: number } | null> {
  try {
    const basis = await port.readWorldBasis(attemptId);
    return basis === null ? null : { basisDigest: basis.basisDigest, capturedAtRevision: basis.capturedAtRevision };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * §5 Coverage / §4 Currentness
 * ------------------------------------------------------------------ */

function coverageOf(inputs: TrajectoryProjectionInputs, state: BuildState): readonly SourceCoverageEntry[] {
  const count = (plane: OwnerPlane): { referenced: number; resolved: number } => {
    let referenced = 0;
    let resolved = 0;
    for (const node of state.nodes) {
      if (node.reference.ownerPlane !== plane) continue;
      referenced += 1;
      if (node.reference.verification === "VERIFIED_AGAINST_OWNER" || node.reference.verification === "RESOLVED_WITHOUT_DIGEST") resolved += 1;
    }
    return { referenced, resolved };
  };
  const work = count("WORK");
  const reasoning = count("REASONING");
  const proof = count("PROOF");
  const workspace = count("WORKSPACE");
  return Object.freeze([
    Object.freeze({ ownerPlane: "WORK" as const, scope: state.projectId, availability: "AVAILABLE", referencedCount: work.referenced, resolvedCount: work.resolved, detail: "the canonical Work event history, re-validated by T0" }),
    Object.freeze({ ownerPlane: "REASONING" as const, scope: state.projectId, availability: inputs.reasoning === undefined ? "NOT_COMPOSED" : "AVAILABLE", referencedCount: reasoning.referenced, resolvedCount: reasoning.resolved, detail: "referenced reasoning cells, read through the reasoning plane" }),
    Object.freeze({ ownerPlane: "PROOF" as const, scope: "proof", availability: inputs.proof === undefined ? "NOT_COMPOSED" : "AVAILABLE", referencedCount: proof.referenced, resolvedCount: proof.resolved, detail: "referenced proof claims, read through the proof plane" }),
    Object.freeze({ ownerPlane: "WORKSPACE" as const, scope: state.projectId, availability: inputs.workspace === undefined ? "NOT_COMPOSED" : "AVAILABLE", referencedCount: workspace.referenced, resolvedCount: workspace.resolved, detail: "journal entries and project associations, read through the workspace plane" }),
  ]);
}

function currentnessOf(basisVector: TrajectoryBasisVector, state: BuildState): readonly CurrentnessClassification[] {
  const classifications: CurrentnessClassification[] = [];
  for (const node of state.nodes) {
    let currentness: Currentness = node.currentness;
    let detail = "the referenced owner fact is immutable in its own history";
    if (node.reference.ownerPlane === "PROOF") {
      currentness = node.epistemicStatus === "PUBLISHED" ? "CURRENT" : "UNKNOWN";
      detail = "proof standing is temporal; the historical standing is preserved and the current one is reported separately";
    } else if (node.reference.ownerPlane === "REASONING") {
      currentness = node.currentness;
      detail = "reasoning currentness follows the cell's accepted frontier";
    } else if (node.reference.ownerPlane === "WORKSPACE") {
      currentness = "CURRENT";
      detail = "a journal entry is immutable once recorded";
    }
    classifications.push(Object.freeze({ nodeId: node.nodeId, currentness, detail }));
  }
  void basisVector;
  return Object.freeze(classifications);
}

/* ------------------------------------------------------------------ *
 * §5 Semantic goals: the small internal API
 * ------------------------------------------------------------------ */

/** §5 `buildProjectTrajectory` is above. `traceAttempt` focuses one attempt's subgraph. */
export async function traceAttempt(
  inputs: TrajectoryProjectionInputs,
  attemptId: string,
  options: BuildTrajectoryOptions = {},
): Promise<{
  readonly projection: TrajectoryProjection;
  readonly attemptNodeId: string | null;
  readonly nodes: readonly TrajectoryNode[];
  readonly edges: readonly TrajectoryEdge[];
}> {
  const projection = await buildProjectTrajectory(inputs, options);
  const attemptNode = projection.nodes.find(
    (node) => node.reference.ownerPlane === "WORK" && node.reference.canonicalId !== null && node.label.includes(attemptId) && node.label.startsWith("ATTEMPT_CREATED"),
  );
  if (attemptNode === undefined) {
    return Object.freeze({ projection, attemptNodeId: null, nodes: Object.freeze([]), edges: Object.freeze([]) });
  }
  return Object.freeze({
    projection,
    attemptNodeId: attemptNode.nodeId,
    nodes: Object.freeze(projection.nodes.filter((node) => node.nodeId === attemptNode.nodeId)),
    edges: Object.freeze(projection.edges.filter((edge) => edge.fromNodeId === attemptNode.nodeId || edge.toNodeId === attemptNode.nodeId)),
  });
}

/** §5 `traceIntentRevision` focuses the accepted-receipt subgraph of one PROJECT_REVISED event. */
export async function traceIntentRevision(
  inputs: TrajectoryProjectionInputs,
  options: BuildTrajectoryOptions = {},
): Promise<{
  readonly projection: TrajectoryProjection;
  readonly revisedNodeIds: readonly string[];
  readonly groundEdges: readonly TrajectoryEdge[];
}> {
  const projection = await buildProjectTrajectory(inputs, options);
  const revisedNodeIds = projection.nodes
    .filter((node) => node.reference.ownerPlane === "WORK" && node.label.startsWith("PROJECT_REVISED"))
    .map((node) => node.nodeId);
  return Object.freeze({
    projection,
    revisedNodeIds: Object.freeze(revisedNodeIds),
    groundEdges: Object.freeze(
      projection.edges.filter(
        (edge) => edge.relation === "RECEIPT_REFERENCED_GROUND" || edge.relation === "GOVERNED_INTENT_CHANGED_PROJECT",
      ),
    ),
  });
}

/**
 * §4 `trajectoryAsOf` — an explicit historical cut.
 *
 * The cut refers to an explicit Owner cursor. When the interval does not begin at genesis the
 * caller MUST supply the validated predecessor basis, so a historical projection never assumes
 * the previous digest is the genesis digest.
 */
export async function trajectoryAsOf(
  inputs: TrajectoryProjectionInputs,
  cut: { readonly throughSequence: number; readonly predecessorBasis: { readonly projectSequence: number; readonly eventDigest: string } | null },
): Promise<TrajectoryProjection> {
  if (cut.throughSequence > 1 && cut.predecessorBasis === null) {
    throw new TrajectoryRefusal(
      "MISSING_PREDECESSOR_BASIS",
      `an as-of cut at project_sequence ${String(cut.throughSequence)} requires an explicit validated predecessor basis`,
    );
  }
  return buildProjectTrajectory(inputs, { throughSequence: cut.throughSequence, predecessorBasis: cut.predecessorBasis });
}
