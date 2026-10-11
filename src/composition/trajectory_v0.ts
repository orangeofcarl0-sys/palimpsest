/**
 * Trajectory-V0 §5/§6/§12 — the V0 COMPOSITION ADAPTER.
 *
 *     composition knows wiring;  trajectory knows the dual-view semantics.
 *
 * This module is the ONE place that sees the concrete Work owner, the promotion read, the T0
 * project-evolution projection and the DSH session reader, and assembles them into ONE Handoff
 * Preview. It holds no policy: the binding classification, the admission policy, the status
 * separation and the caveats all live in `src/trajectory/`.
 *
 * Two §5 rules are enforced HERE, because only the composition layer knows the difference:
 *
 *   1. **Exact identity, not label matching.** The Attempt is addressed by the canonical Work
 *      event's `entity_id` plus its event type, project id and source digest — never by
 *      `node.label.includes(attemptId)`.
 *   2. **Conservative quarantine.** A T0 relation whose verifier is known incomplete is moved into
 *      `quarantinedRelations` and never appears among the selected, actionable relations.
 *
 * Layer: L5 (`src/composition/`), like every other composition module.
 */
import type { ReasoningCellService } from "../reasoning_cell/index.js";
import type { ProofEvidenceService } from "../proof_asset/index.js";
import type { ProjectWorkspaceService, ProjectAssetAssociationStore, ProjectJournalStore } from "../project_workspace/index.js";
import type { EventStore } from "../state/index.js";
import type { SchedulerEvent } from "../schema/index.js";
import { composeTrajectoryInputs } from "./trajectory.js";
import {
  buildHandoffPreview,
  buildProjectTrajectory,
  classifyBinding,
  trajectoryViewIdOf,
  type AttemptExecutionBinding,
  type BindingEvidenceRef,
  type DshSessionEventPage,
  type DshSessionReadPort,
  type HandoffPreview,
  type PreviewCanonicalFacts,
  type PreviewHostObservationSummary,
  type PreviewProjectEvolutionSummary,
  type ProcessLifecycle,
  type TrajectoryProjectionInputs,
} from "../trajectory/index.js";

/**
 * The narrow Work-owner surface this adapter reads, declared STRUCTURALLY.
 *
 * Naming `ProjectController` would add another importer edge to the measured hotspot for four
 * method shapes.
 */
export interface TrajectoryV0WorkOwner {
  readonly store: Pick<EventStore, "listEvents">;
  attemptWorkRecord(attemptId: string): {
    readonly state: string;
    readonly taskId: string | null;
    readonly report: unknown;
    readonly envelope: { readonly envelope_id: string } | null;
  } | null;
  attemptWorldBasis(attemptId: string): { readonly basisDigest: string; readonly taskId: string; readonly capturedAt: string } | null;
  attemptBasisForResolution(attemptId: string): { readonly basis: { readonly basisDigest: string; readonly capturedAtRevision: number }; readonly taskId: string } | null;
}

export interface TrajectoryV0CompositionInput {
  readonly projectId: string;
  readonly controller: TrajectoryV0WorkOwner;
  readonly promotions: { promotionFactsSync(): readonly { readonly eventId: string; readonly promotionId: string; readonly attemptId: string; readonly sourceCommit: string; readonly expectedHeadCommit: string; readonly resultingHeadCommit: string }[] };
  readonly reasoning: ReasoningCellService | undefined;
  readonly proof: ProofEvidenceService | undefined;
  readonly projectWorkspace: ProjectWorkspaceService | undefined;
  readonly journalStore: ProjectJournalStore | undefined;
  readonly associationStore: ProjectAssetAssociationStore | undefined;
  /**
   * §4: the DSH session reader, when one is composed. Absent ⇒ every attempt reports
   * SESSION_UNBOUND, and the Preview says so rather than pretending no events occurred.
   */
  readonly dshSessionReader?: DshSessionReadPort | undefined;
}

/** §4/§7: one host observation record the caller captured for an attempt. */
export interface TrajectoryV0HostRecord {
  readonly attemptId: string;
  readonly hostLocalJobId: string | null;
  readonly portInvocationId: string | null;
  readonly eventKinds: readonly string[];
  readonly exited: boolean;
  readonly exitCode: number | null;
  readonly spawnFailed: boolean;
  readonly unknownAfterRestart: boolean;
  readonly detail: string;
}

/**
 * §5: the T0 relations whose cross-owner verifier the T0 review found incomplete.
 *
 * Each is quarantined rather than presented as an actionable fact. This is the honest reading of
 * §5's list: these are exactly the relationships that depend on the incomplete verifiers.
 */
const QUARANTINED_T0_RELATIONS: Readonly<Record<string, string>> = Object.freeze({
  RECEIPT_REFERENCED_GROUND:
    "T0's ground matching uses a substring scan over the serialized payload, so the exact Reasoning/Journal ground match is not guaranteed",
  GOVERNED_INTENT_CHANGED_PROJECT:
    "T0's cross-owner historical asOf and full ProjectIR parent/basis digest comparison are known incomplete",
  REVISION_SUCCEEDED_REVISION:
    "T0's ProjectIR parent/basis digest comparison is known incomplete",
});

/** §5: relations V0 may present as selected, because their T0 verifier is exact for Work facts. */
const SELECTED_T0_RELATIONS = new Set([
  "TASK_AUTHORIZED_ATTEMPT",
  "ATTEMPT_PRODUCED_RESULT",
  "RESULT_PROMOTED",
  "ATTEMPT_REOPENED_FOR_REWORK",
]);

export interface TrajectoryV0Service {
  /**
   * §6: build the read-only Handoff Preview for one canonical Work Attempt.
   *
   * `claimedSessionId` is a CALLER REQUEST, never binding authority: it can at most earn
   * BOUND_LOCAL_ONLY, and only when the session header agrees.
   */
  previewAttempt(input: {
    readonly attemptId: string;
    readonly claimedSessionId?: string | undefined;
    readonly hostRecord?: TrajectoryV0HostRecord | undefined;
  }): Promise<HandoffPreview>;
  /** §4: read one bounded page of a session's events through the composed reader. */
  readSessionPage(input: { readonly sessionId: string; readonly fromSeq?: number | undefined; readonly maxEvents?: number | undefined }): Promise<DshSessionEventPage>;
  /** §10: whether a DSH reader is composed at all. */
  readonly hasDshReader: boolean;
}

/**
 * §5: locate the canonical Work events for one attempt by EXACT identity.
 *
 * The selector uses `event.entity_id === attemptId` plus the event type, project id and source
 * digest. It deliberately does NOT match on a display label.
 */
function attemptEvents(events: readonly SchedulerEvent[], attemptId: string): {
  readonly created: SchedulerEvent | null;
  readonly terminal: SchedulerEvent | null;
  readonly authorization: SchedulerEvent | null;
} {
  const created = events.find((event) => event.event_type === "ATTEMPT_CREATED" && event.entity_id === attemptId) ?? null;
  const terminal =
    events.find(
      (event) =>
        event.entity_id === attemptId &&
        (event.event_type === "ATTEMPT_COMPLETED" || event.event_type === "ATTEMPT_FAILED"),
    ) ?? null;

  /** The authorizing event is the one whose envelope_id the attempt's own ATTEMPT_CREATED names. */
  let authorization: SchedulerEvent | null = null;
  if (created !== null) {
    const envelopeId = (created.payload as { envelope_id?: unknown }).envelope_id;
    if (typeof envelopeId === "string") {
      authorization =
        events.find((event) => {
          if (event.event_type !== "TASK_CREATED" && event.event_type !== "TASK_REAUTHORIZED") return false;
          const envelope = (event.payload as { task_envelope?: { envelope_id?: unknown } }).task_envelope;
          return envelope?.envelope_id === envelopeId;
        }) ?? null;
    }
  }
  return Object.freeze({ created, terminal, authorization });
}

/** §5: derive the canonical facts for one attempt from its own records. */
function canonicalFactsOf(input: {
  readonly events: readonly SchedulerEvent[];
  readonly attemptId: string;
  readonly record: ReturnType<TrajectoryV0WorkOwner["attemptWorkRecord"]>;
  readonly basis: ReturnType<TrajectoryV0WorkOwner["attemptBasisForResolution"]>;
  readonly promotions: readonly { readonly promotionId: string; readonly attemptId: string; readonly sourceCommit: string }[];
}): PreviewCanonicalFacts {
  const { created, terminal, authorization } = attemptEvents(input.events, input.attemptId);

  const resultRefs: string[] = [];
  let resultDetail = "no ATTEMPT_COMPLETED/ATTEMPT_FAILED event exists for this attempt in the project history";
  if (terminal !== null) {
    const report = (terminal.payload as { attempt_report?: { result_commit?: unknown; worker_status?: unknown } }).attempt_report;
    const commit = typeof report?.result_commit === "string" ? report.result_commit : null;
    if (commit !== null) resultRefs.push(commit);
    resultDetail = `the attempt reported ${String(report?.worker_status ?? "unknown")} at event_id ${String(terminal.event_id)} (project_sequence ${String(terminal.project_sequence)})`;
  }

  /** Promotion is read from the promotion owner, matched by the attempt id it names. */
  const promotion = input.promotions.find((fact) => fact.attemptId === input.attemptId);
  const promotionState = promotion === undefined ? "NOT_PROMOTED" : "PROMOTED";
  const promotionId = promotion?.promotionId ?? null;

  /** Rework: a governed TASK_READY whose provenance names this attempt as the ORIGIN result. */
  const rework = input.events.find((event) => {
    if (event.event_type !== "TASK_READY") return false;
    const provenance = (event.payload as { rework_provenance?: { origin_result_subject?: { ref?: unknown } } }).rework_provenance;
    return provenance?.origin_result_subject?.ref === input.attemptId;
  });

  return Object.freeze({
    attemptState: input.record?.state ?? null,
    taskId: input.record?.taskId ?? null,
    workState: null,
    envelopeId: created === null ? null : ((created.payload as { envelope_id?: unknown }).envelope_id as string | null),
    basisDigest: input.basis?.basis.basisDigest ?? null,
    capturedAtRevision: input.basis?.basis.capturedAtRevision ?? null,
    authorizationDetail:
      authorization === null
        ? "the authorizing TASK_CREATED/TASK_REAUTHORIZED event was not found for this attempt's envelope_id"
        : `authorized by ${authorization.event_type} at event_id ${String(authorization.event_id)} (project_sequence ${String(authorization.project_sequence)})`,
    resultRefs: Object.freeze(resultRefs),
    resultDetail,
    /** §6: verification is NOT inferred from a completed attempt. It is a separate owner's fact. */
    verificationState: "NOT_OBSERVED_BY_V0",
    promotionState,
    promotionId,
    reworkState: rework === undefined ? "NONE" : "REOPENED_FOR_REWORK",
    reworkDetail:
      rework === undefined
        ? "no governed TASK_READY references this attempt's result as its origin"
        : `the governed reopening at event_id ${String(rework.event_id)} names this attempt's result as its origin`,
  });
}

/** §5: build the safe project-evolution summary, quarantining the known-incomplete relations. */
async function projectEvolutionOf(
  inputs: TrajectoryProjectionInputs,
  attemptId: string,
): Promise<PreviewProjectEvolutionSummary> {
  let projection;
  try {
    projection = await buildProjectTrajectory(inputs);
  } catch {
    return Object.freeze({
      projectionRootId: null,
      projectionSemanticDigest: null,
      workSequence: null,
      workEventDigest: null,
      projectIrRevision: null,
      selectedRelations: Object.freeze([]),
      quarantinedRelations: Object.freeze([]),
      unresolvedReferences: Object.freeze([]),
      currentnessCaveats: Object.freeze(["the T0 project-evolution projection could not be built for this project"]),
    });
  }

  const selected: { relation: string; evidenceState: string; detail: string }[] = [];
  const quarantined: { relation: string; reason: string }[] = [];

  /** §5: only relations that TOUCH this attempt are presented, and only when exactly established. */
  const attemptNodeIds = new Set(
    projection.nodes
      .filter((node) => node.reference.ownerPlane === "WORK" && node.reference.canonicalId !== null && node.label.includes(attemptId))
      .map((node) => node.nodeId),
  );

  for (const edge of projection.edges) {
    const reason = QUARANTINED_T0_RELATIONS[edge.relation];
    if (reason !== undefined) {
      quarantined.push({ relation: edge.relation, reason });
      continue;
    }
    if (!SELECTED_T0_RELATIONS.has(edge.relation)) continue;
    const touchesAttempt = attemptNodeIds.has(edge.fromNodeId) || attemptNodeIds.has(edge.toNodeId);
    if (!touchesAttempt) continue;
    selected.push({ relation: edge.relation, evidenceState: edge.evidenceState, detail: edge.detail });
  }

  const caveats: string[] = [];
  if (projection.basisVector.completeness !== "COMPLETE") {
    caveats.push(`the T0 basis vector is ${projection.basisVector.completeness}, so the projection is not a globally consistent snapshot`);
  }
  if (projection.basisVector.unavailable.length > 0) {
    caveats.push(`owners unavailable during projection: ${projection.basisVector.unavailable.join(", ")}`);
  }

  return Object.freeze({
    projectionRootId: projection.rootId,
    projectionSemanticDigest: projection.semanticDigest,
    workSequence: projection.basisVector.work.projectSequence,
    workEventDigest: projection.basisVector.work.eventDigest,
    projectIrRevision: projection.basisVector.work.projectIrRevision,
    selectedRelations: Object.freeze(selected),
    quarantinedRelations: Object.freeze(
      [...new Map(quarantined.map((entry) => [entry.relation, entry])).values()],
    ),
    unresolvedReferences: Object.freeze(projection.unresolved.map((entry) => `${entry.relation ?? "UNKNOWN"}:${entry.requestedIdentity}`)),
    currentnessCaveats: Object.freeze(caveats),
  });
}

/** §6: derive the host-observation summary from a captured record. */
function hostSummaryOf(record: TrajectoryV0HostRecord | undefined): PreviewHostObservationSummary {
  if (record === undefined) {
    return Object.freeze({
      hostLocalJobId: null,
      portInvocationId: null,
      processLifecycle: "NOT_OBSERVED" as ProcessLifecycle,
      processDetail: "no host observation was supplied for this attempt",
      observedEventKinds: Object.freeze([]),
      originLimitation:
        "G1-B local host observations are NOT independent, authority-bearing provenance: the Correlator exposes caller-controlled trust surfaces and does not enforce every Run/Claim/Readback relationship.",
    });
  }
  let lifecycle: ProcessLifecycle;
  if (record.unknownAfterRestart) lifecycle = "UNKNOWN_AFTER_RESTART";
  else if (record.spawnFailed) lifecycle = "SPAWN_FAILED";
  else if (record.exited) lifecycle = "EXITED";
  else if (record.eventKinds.includes("DIRECT_CHILD_SPAWN_OBSERVED")) lifecycle = "RUNNING";
  else if (record.eventKinds.includes("DIRECT_CHILD_SPAWN_ATTEMPTED")) lifecycle = "SPAWN_ATTEMPTED";
  else lifecycle = "NOT_OBSERVED";

  return Object.freeze({
    hostLocalJobId: record.hostLocalJobId,
    portInvocationId: record.portInvocationId,
    processLifecycle: lifecycle,
    processDetail: record.detail,
    observedEventKinds: Object.freeze([...record.eventKinds]),
    originLimitation:
      "G1-B local host observations are NOT independent, authority-bearing provenance: the Correlator exposes caller-controlled trust surfaces and does not enforce every Run/Claim/Readback relationship. A caller-supplied trustedIngestion flag is not evidence.",
  });
}

/**
 * §5/§6: compose the V0 service.
 *
 * Every optional capability is present exactly when its owner is composed, so an absent reader
 * yields SESSION_UNBOUND rather than a stub.
 */
export function composeTrajectoryV0(input: TrajectoryV0CompositionInput): TrajectoryV0Service {
  const { projectId, controller } = input;

  const projectionInputs: TrajectoryProjectionInputs = composeTrajectoryInputs({
    projectId,
    controller: {
      store: controller.store,
      attemptWorldBasis: controller.attemptWorldBasis,
      attemptBasisForResolution: controller.attemptBasisForResolution,
      attemptCurrentness: () => null,
    },
    promotions: input.promotions,
    reasoning: input.reasoning,
    proof: input.proof,
    projectWorkspace: input.projectWorkspace,
    journalStore: input.journalStore,
    associationStore: input.associationStore,
  });

  const reader = input.dshSessionReader;

  return Object.freeze({
    hasDshReader: reader !== undefined,

    async readSessionPage(request: { readonly sessionId: string; readonly fromSeq?: number | undefined; readonly maxEvents?: number | undefined }): Promise<DshSessionEventPage> {
      if (reader === undefined) {
        return Object.freeze({
          schemaVersion: 1 as const,
          readState: "READ_CAPABILITY_ABSENT" as const,
          sessionId: request.sessionId,
          header: null,
          sourceIdentity: "NONE",
          throughSeq: null,
          knownEventCount: null,
          inheritedEventCount: null,
          events: Object.freeze([]),
          knownParentSession: null,
          proves: Object.freeze([]),
          doesNotProve: Object.freeze(["a missing read capability is not evidence that no events occurred"]),
          detail: "no DSH session reader is composed in this deployment",
        });
      }
      return reader.readEvents(request);
    },

    async previewAttempt(request: {
      readonly attemptId: string;
      readonly claimedSessionId?: string | undefined;
      readonly hostRecord?: TrajectoryV0HostRecord | undefined;
    }): Promise<HandoffPreview> {
      const events = controller.store.listEvents(projectId);
      const record = controller.attemptWorkRecord(request.attemptId);
      const basis = controller.attemptBasisForResolution(request.attemptId);
      const promotions = input.promotions.promotionFactsSync();

      const canonical = canonicalFactsOf({ events, attemptId: request.attemptId, record, basis, promotions });

      /** §3: resolve the session binding from REAL evidence only. */
      const claimedSessionId = request.claimedSessionId ?? null;
      let sessionPage: DshSessionEventPage | undefined;
      let conflictDetail: string | null = null;
      /**
       * §3: whether the SESSION SOURCE is readable. This is only a question when a session was
       * claimed at all — with no claim there is nothing to read, and the binding is decided by the
       * host observation (or by nothing). Defaulting this to false would misreport a purely
       * host-observed attempt as an unavailable source.
       */
      let sourceReadable = true;

      if (claimedSessionId !== null && reader !== undefined) {
        /**
         * §3/§10: the claimed id is checked against the source's own immutable header. A header
         * that names a different session is a CONFLICT, not a silent miss.
         */
        const headerResult = await reader.readHeaderIdentity(claimedSessionId);
        if (headerResult.readState === "READ_OK" && headerResult.header !== null) {
          if (headerResult.header.sessionId !== claimedSessionId) {
            conflictDetail = `the source's header names session ${headerResult.header.sessionId} but ${claimedSessionId} was claimed`;
          } else {
            sessionPage = await reader.readEvents({ sessionId: claimedSessionId });
            sourceReadable = sessionPage.readState === "READ_OK";
          }
        } else if (headerResult.readState === "IDENTITY_CONFLICT") {
          conflictDetail = headerResult.detail;
        } else {
          sourceReadable = false;
          sessionPage = await reader.readEvents({ sessionId: claimedSessionId });
        }
      } else if (claimedSessionId !== null && reader === undefined) {
        /**
         * §4/§10: a session was claimed but NO reader is composed. This must not collapse to
         * "no session bound" — the consumer asked for a session and the capability is absent, which
         * is a missing SOURCE. An explicit page records that, so the session lifecycle reads
         * UNREADABLE rather than NO_SESSION_BOUND.
         */
        sourceReadable = false;
        sessionPage = Object.freeze({
          schemaVersion: 1 as const,
          readState: "READ_CAPABILITY_ABSENT" as const,
          sessionId: claimedSessionId,
          header: null,
          sourceIdentity: "NONE",
          throughSeq: null,
          knownEventCount: null,
          inheritedEventCount: null,
          events: Object.freeze([]),
          knownParentSession: null,
          proves: Object.freeze([]),
          doesNotProve: Object.freeze(["a missing read capability is not evidence that no events occurred"]),
          detail: "a session was claimed for this attempt but no DSH session reader is composed in this deployment",
        });
      }

      const classification = classifyBinding({
        claimedSessionId,
        /** §3: NO canonical Attempt→Session producer exists in this deployment, so this is false. */
        canonicalBindingPresent: false,
        localObservationPresent: request.hostRecord !== undefined && request.hostRecord.hostLocalJobId !== null,
        candidateCount: claimedSessionId === null ? 0 : 1,
        sourceReadable,
        conflictDetail,
      });

      const evidenceRefs: BindingEvidenceRef[] = [];
      if (claimedSessionId !== null) {
        evidenceRefs.push(
          Object.freeze({
            source: "CALLER_DECLARATION" as const,
            detail: "the caller supplied this session id for the attempt",
            compared: Object.freeze({ claimedSessionId, attemptId: request.attemptId }),
          }),
        );
      }
      if (sessionPage?.header != null) {
        evidenceRefs.push(
          Object.freeze({
            source: "CALLER_DECLARATION" as const,
            detail: "the source's immutable header agreed with the claimed id",
            compared: Object.freeze({
              headerSessionId: sessionPage.header.sessionId,
              headerCwd: sessionPage.header.cwd ?? "",
              headerIsSeeded: String(sessionPage.header.isSeeded),
            }),
          }),
        );
      }

      const binding: AttemptExecutionBinding = Object.freeze({
        schemaVersion: 1 as const,
        projectId,
        attemptId: request.attemptId,
        viewId: trajectoryViewIdOf({ projectId, attemptId: request.attemptId }),
        historicalWorkBasis: Object.freeze({
          basisDigest: basis?.basis.basisDigest ?? null,
          capturedAtRevision: basis?.basis.capturedAtRevision ?? null,
          taskId: basis?.taskId ?? record?.taskId ?? null,
        }),
        hostLocalJobId: request.hostRecord?.hostLocalJobId ?? null,
        portInvocationId: request.hostRecord?.portInvocationId ?? null,
        dshSessionId: claimedSessionId,
        sessionSource: classification.source,
        bindingStatus: classification.state,
        bindingEvidenceRefs: Object.freeze(evidenceRefs),
        detail: classification.detail,
      });

      const projectEvolution = await projectEvolutionOf(projectionInputs, request.attemptId);

      return buildHandoffPreview({
        projectId,
        attemptId: request.attemptId,
        binding,
        canonical,
        host: hostSummaryOf(request.hostRecord),
        ...(sessionPage === undefined ? {} : { sessionPage }),
        projectEvolution,
      });
    },
  });
}
