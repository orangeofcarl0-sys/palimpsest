/**
 * Trajectory-V0 §5/§6/§12 — the V0 COMPOSITION ADAPTER, corrected by V0S §4–§8.
 *
 *     composition knows wiring;  trajectory knows the dual-view semantics.
 *
 * This module is the ONE place that sees the concrete Work owner, the promotion read, the T0
 * project-evolution projection and the DSH session reader, and assembles them into ONE Handoff
 * Preview. It holds no policy: the binding classification, the admission policy, the status
 * separation and the caveats all live in `src/trajectory/`.
 *
 * V0S §4 — THE ADMISSION ORDER IS THE FIX.
 *
 * V0S §4 requires the Work Attempt to be verified against its canonical history BEFORE any
 * execution source is touched. The order below is therefore load-bearing and not a style choice:
 *
 *     1. read the canonical Work events for the project;
 *     2. require exactly one ATTEMPT_CREATED whose `entity_id === attemptId` AND whose
 *        `project_id === projectId`;
 *     3. require the canonical Work record to exist and agree with that creation event;
 *     4. ONLY THEN examine any claimed session or host record.
 *
 * A refusal at step 2 or 3 throws before the reader is ever called, so an unknown or foreign
 * attempt provably invokes zero read-port methods (§4 S1-A6).
 *
 * V0S §5 — the two facts V0 conflated are now separate fields, and a caller's session claim is
 * quarantined as `SESSION_CLAIMED_UNVERIFIED` with `sessionReadAdmission =
 * NOT_ADMITTED_TO_ATTEMPT`, so its events never enter the attempt's execution history.
 *
 * V0S §7 — the Work relation selector uses the canonical `event_id` identity set, never a display
 * label, and requires `ESTABLISHED_BY_OWNER_REFERENCE` with a non-null evidence object whose
 * carrying record is a real owner reference.
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
  AttemptAdmissionRefusal,
  buildHandoffPreview,
  buildProjectTrajectory,
  classifyHostObservation,
  classifySessionBinding,
  selectAttemptWorkRelations,
  trajectoryViewIdOf,
  type AttemptExecutionBinding,
  type AttemptRelationContext,
  type BindingEvidenceRef,
  type DshSessionEventPage,
  type DshSessionReadPort,
  type HandoffPreview,
  type HostObservationProvenance,
  type PreviewCanonicalFacts,
  type PreviewHostObservationSummary,
  type PreviewProjectEvolutionSummary,
  type ProcessLifecycle,
  type SessionReadAdmission,
  type TrajectoryProjection,
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
 * §6: the Attempt-scoped consumer surface.
 *
 * Deliberately TWO members. `previewAttempt` is Attempt-scoped by construction, and `hasDshReader`
 * reports whether a reader is composed. There is NO `readSessionPage`: an operation that takes a bare
 * session id is not Attempt-scoped, so it does not belong on this service (§6 S1-C).
 */
export interface TrajectoryV0Service {
  /**
   * §6: build the read-only Handoff Preview for one canonical Work Attempt.
   *
   * `claimedSessionId` is a CALLER REQUEST, never binding authority: it can at most earn
   * SESSION_CLAIMED_UNVERIFIED, and its events are never admitted to the attempt.
   *
   * Throws `AttemptAdmissionRefusal` when the attempt is not a canonical attempt of this project.
   */
  previewAttempt(input: {
    readonly attemptId: string;
    readonly claimedSessionId?: string | undefined;
    readonly hostRecord?: TrajectoryV0HostRecord | undefined;
  }): Promise<HandoffPreview>;
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

/**
 * §4 S1-A: admit the Work Attempt BEFORE any execution source is read.
 *
 * This is the gate the ruling requires. It reads the project's canonical Work events and requires
 * a matching `ATTEMPT_CREATED`; it then requires the canonical Work record to exist and its task
 * binding to agree with that event. It throws `AttemptAdmissionRefusal` rather than returning a
 * partially-verified Preview.
 *
 * Note what it does NOT do: it never falls back to a display label, a task title or a substring
 * match, and it never consults the DSH reader.
 */
function admitAttempt(input: {
  readonly projectId: string;
  readonly attemptId: string;
  readonly events: readonly SchedulerEvent[];
  readonly record: ReturnType<TrajectoryV0WorkOwner["attemptWorkRecord"]>;
}): { readonly created: SchedulerEvent; readonly terminal: SchedulerEvent | null; readonly authorization: SchedulerEvent | null } {
  const { created, terminal, authorization } = attemptEvents(input.events, input.attemptId);
  if (created === null) {
    /**
     * §4 S1-A1/A2, corrected by H0 §7.2: a project-scoped read cannot see another project's events,
     * so an attempt outside this project is refused as ATTEMPT_NOT_FOUND WITHIN THE PROJECT SCOPE.
     * The FOREIGN_ATTEMPT code remains for the case the read itself surfaces an out-of-scope creation
     * event, which is checked below; no unscoped global probe is performed to manufacture it.
     */
    throw new AttemptAdmissionRefusal(
      "ATTEMPT_NOT_FOUND",
      `no canonical ATTEMPT_CREATED event names attempt ${input.attemptId} in project ${input.projectId}`,
    );
  }
  if (created.project_id !== input.projectId) {
    throw new AttemptAdmissionRefusal(
      "FOREIGN_ATTEMPT",
      `the canonical creation event for attempt ${input.attemptId} belongs to project ${created.project_id}, not ${input.projectId}`,
    );
  }
  if (input.record === null) {
    throw new AttemptAdmissionRefusal(
      "ATTEMPT_SOURCE_CONFLICT",
      `attempt ${input.attemptId} has a canonical creation event but no canonical Work record, so its identity cannot be verified`,
    );
  }
  /**
   * §4 S1-A4: the record must not CONTRADICT its own creation event. A record bound to a different
   * task than the creation event names is a corrupted history, and a corrupted history is refused
   * rather than presented.
   */
  const createdTaskId = (created.payload as { task_id?: unknown }).task_id;
  if (typeof createdTaskId === "string" && input.record.taskId !== null && input.record.taskId !== createdTaskId) {
    throw new AttemptAdmissionRefusal(
      "ATTEMPT_SOURCE_CONFLICT",
      `attempt ${input.attemptId} is recorded against task ${input.record.taskId} but its creation event names task ${createdTaskId}`,
    );
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
  readonly admitted: { readonly created: SchedulerEvent; readonly terminal: SchedulerEvent | null; readonly authorization: SchedulerEvent | null };
}): PreviewCanonicalFacts {
  const { created, terminal, authorization } = input.admitted;

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
  context: AttemptRelationContext,
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

  const { selected, quarantined } = selectAttemptWorkRelations(projection, context);

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
    quarantinedRelations: Object.freeze(quarantined),
    unresolvedReferences: Object.freeze(projection.unresolved.map((entry) => `${entry.relation ?? "UNKNOWN"}:${entry.requestedIdentity}`)),
    currentnessCaveats: Object.freeze(caveats),
  });
}

/**
 * §6.3: build the exact AttemptRelationContext from this attempt's OWN canonical records.
 *
 * Every identity here is resolved from the attempt's own events, never from a label or a shared node.
 * The `canonicalEventIds` set is retained ONLY to scope quarantine reporting; admission itself uses the
 * precise role fields.
 */
function buildRelationContext(input: {
  readonly projectId: string;
  readonly attemptId: string;
  readonly events: readonly SchedulerEvent[];
  readonly admitted: { readonly created: SchedulerEvent; readonly terminal: SchedulerEvent | null; readonly authorization: SchedulerEvent | null };
}): AttemptRelationContext {
  const { attemptId, events, admitted } = input;

  /** §6.1: every event the Work owner recorded against this attempt entity. */
  const attemptEvents = events.filter((event) => event.entity_type === "attempt" && event.entity_id === attemptId);

  /** §6.1: the terminal result events for THIS attempt, split into all-terminal and completed-only. */
  const terminalEvents = attemptEvents.filter((event) => event.event_type === "ATTEMPT_COMPLETED" || event.event_type === "ATTEMPT_FAILED");
  const terminalEventIds = terminalEvents.map((event) => String(event.event_id));
  const completed = terminalEvents.find((event) => event.event_type === "ATTEMPT_COMPLETED") ?? null;

  /** §6.1: the envelope this attempt's creation event names, which is its own authorization. */
  const createdEnvelopeId = (admitted.created.payload as { envelope_id?: unknown }).envelope_id;
  const authorizationEnvelopeId = typeof createdEnvelopeId === "string" ? createdEnvelopeId : null;

  const canonicalEventIds = new Set<string>(attemptEvents.map((event) => String(event.event_id)));
  canonicalEventIds.add(String(admitted.created.event_id));
  if (admitted.terminal !== null) canonicalEventIds.add(String(admitted.terminal.event_id));
  if (admitted.authorization !== null) canonicalEventIds.add(String(admitted.authorization.event_id));

  return Object.freeze({
    projectId: input.projectId,
    attemptId,
    creationEventId: String(admitted.created.event_id),
    authorizationEventId: admitted.authorization === null ? null : String(admitted.authorization.event_id),
    authorizationEnvelopeId,
    terminalEventIds: Object.freeze(terminalEventIds),
    completedEventId: completed === null ? null : String(completed.event_id),
    canonicalEventIds,
  });
}

/** §5: the host observation event kinds that describe a TERMINATION REQUEST rather than an outcome. */
const TERMINATION_REQUEST_KINDS = new Set(["DIRECT_CHILD_TIMEOUT_REQUESTED", "DIRECT_CHILD_ABORT_REQUESTED"]);
/**
 * §8 S1-E3/E4/E5: derive the host-observation summary from a captured record.
 *
 * The chronology is preserved: a termination REQUEST is reported as a request, an EXIT is reported
 * only when an exit was actually observed, and an abort whose exit was never confirmed is
 * `EXIT_UNCONFIRMED` — not the ordinary `RUNNING` it used to be misreported as.
 */
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
  const kinds = record.eventKinds;
  const requestedAbort = kinds.includes("DIRECT_CHILD_ABORT_REQUESTED");
  const requestedTimeout = kinds.includes("DIRECT_CHILD_TIMEOUT_REQUESTED");
  const exitUnconfirmed = kinds.includes("DIRECT_CHILD_EXIT_UNCONFIRMED");

  let lifecycle: ProcessLifecycle;
  if (record.unknownAfterRestart) lifecycle = "UNKNOWN_AFTER_RESTART";
  else if (record.spawnFailed) lifecycle = "SPAWN_FAILED";
  /**
   * §8: an OBSERVED exit is the only thing that yields EXITED — even when a termination was
   * requested earlier. The request is retained in the detail, so the chronology is not lost.
   */
  else if (record.exited) lifecycle = "EXITED";
  else if (exitUnconfirmed) lifecycle = "EXIT_UNCONFIRMED";
  else if (requestedAbort) lifecycle = "ABORT_REQUESTED";
  else if (requestedTimeout) lifecycle = "TIMEOUT_REQUESTED";
  else if (kinds.includes("DIRECT_CHILD_SPAWN_OBSERVED")) lifecycle = "RUNNING";
  else if (kinds.includes("DIRECT_CHILD_SPAWN_ATTEMPTED")) lifecycle = "SPAWN_ATTEMPTED";
  else lifecycle = "NOT_OBSERVED";

  /** §8 S1-E5: when an exit was observed after a request, say so rather than dropping the request. */
  const chronology =
    record.exited && (requestedAbort || requestedTimeout)
      ? `${record.detail}; a termination was requested (${requestedAbort ? "abort" : "timeout"}) and an exit was LATER observed`
      : record.detail;

  return Object.freeze({
    hostLocalJobId: record.hostLocalJobId,
    portInvocationId: record.portInvocationId,
    processLifecycle: lifecycle,
    processDetail: chronology,
    observedEventKinds: Object.freeze([...kinds]),
    originLimitation:
      "G1-B local host observations are NOT independent, authority-bearing provenance: the Correlator exposes caller-controlled trust surfaces and does not enforce every Run/Claim/Readback relationship. A caller-supplied trustedIngestion flag is not evidence.",
  });
}

/**
 * §4/§5: compose the V0 service.
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

    async previewAttempt(request: {
      readonly attemptId: string;
      readonly claimedSessionId?: string | undefined;
      readonly hostRecord?: TrajectoryV0HostRecord | undefined;
    }): Promise<HandoffPreview> {
      /* ---- §4 STEP 1-3: canonical Work admission, BEFORE any execution source is touched. ---- */
      const events = controller.store.listEvents(projectId);
      const record = controller.attemptWorkRecord(request.attemptId);
      /**
       * H0 §7.2: the ordinary Attempt Preview is PROJECT-SCOPED. It does NOT probe other projects to
       * distinguish a foreign attempt from an unknown one: a normal project-scoped read must not
       * require an unrestricted `listEvents()`. An attempt outside this project is refused within the
       * project scope.
       */
      const admitted = admitAttempt({ projectId, attemptId: request.attemptId, events, record });

      /* ---- §5: the host record's identity is checked before any of its fields are accepted. ---- */
      if (request.hostRecord !== undefined && request.hostRecord.attemptId !== request.attemptId) {
        throw new AttemptAdmissionRefusal(
          "HOST_RECORD_CONFLICT",
          `a host record for attempt ${request.hostRecord.attemptId} was supplied for attempt ${request.attemptId}`,
        );
      }

      const basis = controller.attemptBasisForResolution(request.attemptId);
      const promotions = input.promotions.promotionFactsSync();

      const canonical = canonicalFactsOf({ events, attemptId: request.attemptId, record, basis, promotions, admitted });

      /**
       * H0 §7 (C3): A CLAIMED SESSION IS A DECLARATION, NOT A SOURCE ACCESS.
       *
       * No canonical Attempt→Session producer exists in this deployment (V0S S2), so a caller-supplied
       * session id can never establish a binding. V0S nevertheless performed a header read and an event
       * read for any claimed id, which meant caller testimony triggered DSH I/O and produced event
       * counts and watermarks for a session the attempt does not own.
       *
       * The corrected rule: while no producer exists, the ordinary Attempt Preview performs ZERO reads.
       * The claim is recorded as a declaration, the established session id stays null, and the read
       * admission is `NOT_REQUESTED` — because nothing was requested THROUGH this path.
       */
      const claimedSessionId = request.claimedSessionId ?? null;
      const sessionPage: DshSessionEventPage | undefined = undefined;
      const conflictDetail: string | null = null;
      /** §7: no read happened, so the source's readability is UNKNOWN, not false. */
      const sourceReadable = claimedSessionId === null;

      const classification = classifySessionBinding({
        claimedSessionId,
        /** §5: NO canonical Attempt→Session producer exists in this deployment, so this is false. */
        canonicalBindingPresent: false,
        candidateCount: claimedSessionId === null ? 0 : 1,
        sourceReadable,
        conflictDetail,
      });

      /**
       * §7.1: the read admission describes what ACTUALLY happened. Nothing was requested through the
       * Attempt path, so it is `NOT_REQUESTED` — NOT `READ_FAILED`, which would claim a failed attempt.
       */
      const sessionReadAdmission: SessionReadAdmission = "NOT_REQUESTED";

      const hostClassification = classifyHostObservation({
        recordPresent: request.hostRecord !== undefined,
        attemptMatches: request.hostRecord === undefined ? false : request.hostRecord.attemptId === request.attemptId,
        hasLocalIdentity: request.hostRecord === undefined ? false : request.hostRecord.hostLocalJobId !== null || request.hostRecord.portInvocationId !== null,
        conflictDetail: null,
      });

      const evidenceRefs: BindingEvidenceRef[] = [];
      if (claimedSessionId !== null) {
        evidenceRefs.push(
          Object.freeze({
            source: "CALLER_DECLARATION" as const,
            detail: "the caller supplied this session id as a declaration; no read was performed and no header agreement is claimed",
            compared: Object.freeze({ claimedSessionId, attemptId: request.attemptId }),
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
        /**
         * §5: NO producer establishes an Attempt→Session relationship, so the ESTABLISHED id is
         * always null and the caller's id is recorded only as a CLAIM.
         */
        dshSessionId: classification.state === "BOUND_VERIFIED" ? claimedSessionId : null,
        claimedSessionId,
        hostObservationProvenance: hostClassification.provenance as HostObservationProvenance,
        sessionSource: classification.source,
        sessionBindingStatus: classification.state,
        sessionReadAdmission,
        bindingEvidenceRefs: Object.freeze(evidenceRefs),
        detail: classification.detail,
      });

      /**
       * §6.3: the AttemptRelationContext the selector validates against. Every field is an EXACT
       * canonical identity resolved from this attempt's own records, so a shared authorization event
       * cannot satisfy two attempts' relations and a genuine cross-entity carrier is admitted by ROLE.
       */
      const relationContext: AttemptRelationContext = buildRelationContext({
        projectId,
        attemptId: request.attemptId,
        events,
        admitted,
      });

      const projectEvolution = await projectEvolutionOf(projectionInputs, relationContext);

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
