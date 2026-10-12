/**
 * Trajectory-P2-C §8 — THE ATTRIBUTED EXECUTION PREVIEW ADAPTER.
 *
 * The critical consumer implementation. It produces an Attempt-scoped, read-only Preview whose Session
 * events are admitted ONLY after exact canonical Attempt admission AND a source-qualified durable
 * association. It is the ordinary product path, so it does NOT accept a caller-supplied
 * `sessionAssociations` array as authority.
 *
 * THE ADMISSION ORDER (§8.1/§8.4) — load-bearing, not stylistic:
 *
 *   1. admit the canonical Work Attempt (the SAME `admitAttempt` the ordinary Preview uses). An unknown
 *      or foreign attempt throws BEFORE any association or DSH access, so it causes ZERO reads.
 *   2. ask the QUALIFIER for the attempt's qualifications (durable records + trusted source + Work +
 *      header + window + currentness).
 *   3. select exactly ONE qualified invocation per §8.3, or report why none was selected.
 *   4. read the DSH page through the OFFICIAL reader, for the SELECTED session only.
 *   5. validate the page structurally (`validateSessionEventPage`) and the cross-field invariants.
 *   6. build the Preview, where events are exposed only when the invariants and the page hold.
 *
 * WHAT IT NEVER DOES. It never reads an unrelated session to "find a match", never uses
 * `claimedSessionId` to choose the session, never treats a `hostRecord.portInvocationId` as proof of
 * invocation ownership, and never auto-selects the latest invocation when several exist.
 *
 * Layer: L5 (`src/composition/`). Wiring and read-only adaptation; it owns no authority.
 */
import type { EventStore } from "../state/index.js";
import {
  AttemptAdmissionRefusal,
  buildHandoffPreview,
  validateAdmissionInvariants,
  type AttemptSessionAssociation,
  type DshSessionEventPage,
  type HandoffPreview,
  type SessionBindingState,
  type SessionReadAdmission,
  type AttemptExecutionBinding,
  type PreviewCanonicalFacts,
  type PreviewHostObservationSummary,
  type PreviewProjectEvolutionSummary,
} from "../trajectory/index.js";
import type { AssociationQualifier, ExecutionAssociationStore, QualifiedAssociation } from "../execution_association/index.js";
import { admitAttempt, attemptEvents, type TrajectoryV0WorkOwner } from "./trajectory_v0.js";

/** §8.3: how the adapter selected (or refused to select) an invocation. */
export const INVOCATION_SELECTION_STATES = [
  /** No durable association evidence exists: a Work-only preview, no session read. */
  "NO_DURABLE_EVIDENCE",
  /** Exactly one qualified invocation and no unresolved alternatives: selected automatically. */
  "SELECTED_UNIQUE",
  /** The caller named an invocation that is qualified. */
  "SELECTED_REQUESTED",
  /** Several invocations exist: explicit selection required, none chosen. */
  "AMBIGUOUS_REQUIRES_SELECTION",
  /** The requested invocation is not qualified. */
  "REQUESTED_NOT_QUALIFIED",
  /** The requested invocation belongs to a different attempt. */
  "REQUESTED_FOREIGN",
] as const;
export type InvocationSelectionState = (typeof INVOCATION_SELECTION_STATES)[number];

export interface AttributedPreviewResult {
  readonly preview: HandoffPreview;
  readonly selection: {
    readonly state: InvocationSelectionState;
    readonly invocationId: string | null;
    readonly detail: string;
  };
  /** §9.2: the derived execution provenance a viewer needs to distinguish read from inferred. */
  readonly provenance: {
    readonly qualificationState: string;
    readonly sourceEpochId: string | null;
    readonly durableBindingRef: string | null;
    readonly windowClosedConsistently: boolean;
    readonly readWatermark: number | null;
    readonly knownEventCount: number | null;
    readonly pageCoverage: string;
  };
}

export interface AttributedPreviewService {
  previewAttempt(input: {
    readonly attemptId: string;
    /** §8.3: a SELECTOR only. The selected invocation is still verified against durable evidence. */
    readonly requestedInvocationId?: string | undefined;
    readonly claimedSessionId?: string | undefined;
    readonly hostRecord?: { readonly attemptId: string; readonly hostLocalJobId: string | null; readonly portInvocationId: string | null; readonly eventKinds: readonly string[]; readonly exited: boolean; readonly exitCode: number | null; readonly spawnFailed: boolean; readonly unknownAfterRestart: boolean; readonly detail: string } | undefined;
    readonly maxEvents?: number | undefined;
  }): Promise<AttributedPreviewResult>;
  readonly hasDshReader: boolean;
  readonly hasQualifier: boolean;
}

export interface AttributedPreviewCompositionInput {
  readonly projectId: string;
  readonly controller: TrajectoryV0WorkOwner;
  readonly promotions: { promotionFactsSync(): readonly { readonly eventId: string; readonly promotionId: string; readonly attemptId: string; readonly sourceCommit: string; readonly expectedHeadCommit: string; readonly resultingHeadCommit: string }[] };
  readonly qualifier: AssociationQualifier | undefined;
  readonly store: ExecutionAssociationStore | undefined;
  readonly sessionReader: { readonly sourceIdentity: string; readonly evidenceClass: "REAL_DSH_QUERY" | "DSH_QUERY_PORT_FIXTURE"; readEvents(request: { readonly sessionId: string; readonly fromSeq?: number | undefined; readonly maxEvents?: number | undefined }): Promise<DshSessionEventPage>; close?(): Promise<void> } | undefined;
  /** §8.9: the project-evolution summary builder, injected so this module owns no T0 semantics. */
  readonly projectEvolutionOf: (input: { readonly attemptId: string; readonly events: readonly import("../schema/index.js").SchedulerEvent[] }) => Promise<PreviewProjectEvolutionSummary>;
}

/** §8.5: a binding that is not verified at all. */
function unboundBinding(input: { readonly projectId: string; readonly attemptId: string; readonly viewId: string; readonly detail: string; readonly claimedSessionId: string | null }): AttemptExecutionBinding {
  return Object.freeze({
    schemaVersion: 1 as const,
    projectId: input.projectId,
    attemptId: input.attemptId,
    viewId: input.viewId,
    historicalWorkBasis: Object.freeze({ basisDigest: null, capturedAtRevision: null, taskId: null }),
    hostLocalJobId: null,
    portInvocationId: null,
    dshSessionId: null,
    claimedSessionId: input.claimedSessionId,
    hostObservationProvenance: "NOT_OBSERVED" as const,
    sessionSource: "NONE" as const,
    sessionBindingStatus: "SESSION_UNBOUND" as SessionBindingState,
    sessionReadAdmission: "NOT_REQUESTED" as SessionReadAdmission,
    bindingEvidenceRefs: Object.freeze([]),
    detail: input.detail,
  });
}

export function composeAttributedPreview(input: AttributedPreviewCompositionInput): AttributedPreviewService {
  const { projectId, controller } = input;

  return Object.freeze({
    hasDshReader: input.sessionReader !== undefined,
    hasQualifier: input.qualifier !== undefined,

    async previewAttempt(request: {
      readonly attemptId: string;
      readonly requestedInvocationId?: string | undefined;
      readonly claimedSessionId?: string | undefined;
      readonly hostRecord?: { readonly attemptId: string; readonly hostLocalJobId: string | null; readonly portInvocationId: string | null; readonly eventKinds: readonly string[]; readonly exited: boolean; readonly exitCode: number | null; readonly spawnFailed: boolean; readonly unknownAfterRestart: boolean; readonly detail: string } | undefined;
      readonly maxEvents?: number | undefined;
    }): Promise<AttributedPreviewResult> {
      /* ---- §8.1 STEP 1: canonical Work admission, BEFORE any association or DSH access. ---- */
      const events = controller.store.listEvents(projectId);
      const record = controller.attemptWorkRecord(request.attemptId);
      const admitted = admitAttempt({ projectId, attemptId: request.attemptId, events, record });
      if (request.hostRecord !== undefined && request.hostRecord.attemptId !== request.attemptId) {
        throw new AttemptAdmissionRefusal("HOST_RECORD_CONFLICT", `a host record for attempt ${request.hostRecord.attemptId} was supplied for attempt ${request.attemptId}`);
      }

      const viewId = `tv-${request.attemptId}`;
      const canonical: PreviewCanonicalFacts = Object.freeze({
        attemptState: record?.state ?? null,
        taskId: record?.taskId ?? null,
        workState: null,
        envelopeId: (admitted.created.payload as { envelope_id?: unknown }).envelope_id as string | null,
        basisDigest: null,
        capturedAtRevision: null,
        authorizationDetail: `admitted by canonical ATTEMPT_CREATED at event_id ${String(admitted.created.event_id)}`,
        resultRefs: Object.freeze([]),
        resultDetail: "no terminal result event is read by the attributed adapter",
        verificationState: "NOT_OBSERVED_BY_P2C",
        promotionState: input.promotions.promotionFactsSync().some((fact) => fact.attemptId === request.attemptId) ? "PROMOTED" : "NOT_PROMOTED",
        promotionId: null,
        reworkState: "NONE",
        reworkDetail: "rework is not derived by the attributed adapter",
      });
      const host: PreviewHostObservationSummary = Object.freeze({
        hostLocalJobId: request.hostRecord?.hostLocalJobId ?? null,
        portInvocationId: request.hostRecord?.portInvocationId ?? null,
        processLifecycle: "NOT_OBSERVED" as const,
        processDetail: "the attributed adapter does not accept a caller host record as provenance",
        observedEventKinds: Object.freeze([]),
        lifecycleCoverage: "NONE" as const,
        originLimitation: "a caller-supplied host record is not producer-established provenance",
      });
      const projectEvolution = await input.projectEvolutionOf({ attemptId: request.attemptId, events });

      /**
       * §7.2: no qualifier ⇒ no association authority at all. The honest result is a Work-only preview.
       */
      if (input.qualifier === undefined || input.store === undefined) {
        const binding = unboundBinding({ projectId, attemptId: request.attemptId, viewId, detail: "no execution-association capability is composed, so no session can be attributed", claimedSessionId: request.claimedSessionId ?? null });
        return Object.freeze({
          preview: buildHandoffPreview({ projectId, attemptId: request.attemptId, binding, canonical, host, projectEvolution }),
          selection: Object.freeze({ state: "NO_DURABLE_EVIDENCE" as const, invocationId: null, detail: "the execution-association qualifier is not composed" }),
          provenance: Object.freeze({ qualificationState: "NO_DURABLE_OBSERVATION", sourceEpochId: null, durableBindingRef: null, windowClosedConsistently: false, readWatermark: null, knownEventCount: null, pageCoverage: "NOT_APPLICABLE" }),
        });
      }

      /* ---- §8.2 STEP 2: the qualifier is the ONLY source of read authority. ---- */
      const qualification = await input.qualifier.qualifyAttempt({ projectId, attemptId: request.attemptId });
      const qualified = qualification.qualifications.filter((entry): entry is QualifiedAssociation => entry.state === "ASSOCIATION_QUALIFIED");

      /* ---- §8.3 STEP 3: invocation selection. ---- */
      const selection = selectInvocation({ qualified, all: qualification.qualifications, requested: request.requestedInvocationId });

      if (selection.selected === null) {
        const detail =
          selection.state === "AMBIGUOUS_REQUIRES_SELECTION"
            ? `${String(qualified.length)} invocations are qualified for this attempt, so an explicit invocationId is required; none is auto-selected`
            : selection.state === "REQUESTED_NOT_QUALIFIED"
              ? `the requested invocation ${String(request.requestedInvocationId)} is not qualified for this attempt`
              : selection.state === "REQUESTED_FOREIGN"
                ? `the requested invocation ${String(request.requestedInvocationId)} does not belong to this attempt`
                : "no durable association evidence qualifies a session for this attempt";
        const binding = unboundBinding({ projectId, attemptId: request.attemptId, viewId, detail, claimedSessionId: request.claimedSessionId ?? null });
        return Object.freeze({
          preview: buildHandoffPreview({ projectId, attemptId: request.attemptId, binding, canonical, host, projectEvolution }),
          selection: Object.freeze({ state: selection.state, invocationId: null, detail }),
          provenance: Object.freeze({ qualificationState: selection.qualificationState, sourceEpochId: null, durableBindingRef: null, windowClosedConsistently: false, readWatermark: null, knownEventCount: null, pageCoverage: "NOT_APPLICABLE" }),
        });
      }

      const chosen = selection.selected;

      /* ---- §8.6 STEP 4: read ONLY the selected session, through the official reader. ---- */
      const page = await readSelectedSession(input.sessionReader, chosen.dshSessionId, request.maxEvents);

      /* ---- §8.4/§8.5 STEP 5-6: admission requires a verified binding, a valid page and consistent fields. ---- */
      const pageOk = page !== undefined && page.readState === "READ_OK";
      const binding: AttemptExecutionBinding = Object.freeze({
        schemaVersion: 1 as const,
        projectId,
        attemptId: request.attemptId,
        viewId,
        historicalWorkBasis: Object.freeze({ basisDigest: null, capturedAtRevision: null, taskId: record?.taskId ?? null }),
        hostLocalJobId: chosen.hostLocalJobId,
        portInvocationId: chosen.invocationId,
        dshSessionId: chosen.dshSessionId,
        claimedSessionId: request.claimedSessionId ?? null,
        hostObservationProvenance: "LOCAL_PORT_OBSERVATION" as const,
        sessionSource: "CANONICAL_ATTEMPT_BINDING" as const,
        sessionBindingStatus: "BOUND_VERIFIED" as SessionBindingState,
        /** §8.4: events are admitted ONLY when the read succeeded; a failed read is READ_FAILED. */
        sessionReadAdmission: (pageOk ? "ADMITTED_TO_ATTEMPT" : page === undefined ? "NOT_REQUESTED" : "READ_FAILED") as SessionReadAdmission,
        bindingEvidenceRefs: Object.freeze([
          Object.freeze({ source: "CANONICAL_ATTEMPT_BINDING" as const, detail: "a source-qualified durable association establishes this session for this invocation", compared: Object.freeze({ attemptId: request.attemptId, invocationId: chosen.invocationId, dshSessionId: chosen.dshSessionId }) }),
        ]),
        detail: `a source-qualified durable association (epoch ${chosen.sourceEpochId}) establishes session ${chosen.dshSessionId} for invocation ${chosen.invocationId}`,
      });

      const invariants = validateAdmissionInvariants({ binding, ...(page === undefined ? {} : { page }) });
      const preview = buildHandoffPreview({
        projectId,
        attemptId: request.attemptId,
        binding,
        canonical,
        host,
        ...(page === undefined ? {} : { sessionPage: page }),
        projectEvolution,
      });

      return Object.freeze({
        preview,
        selection: Object.freeze({ state: selection.state, invocationId: chosen.invocationId, detail: selection.detail }),
        provenance: Object.freeze({
          qualificationState: "ASSOCIATION_QUALIFIED",
          sourceEpochId: chosen.sourceEpochId,
          durableBindingRef: chosen.durableBindingRef,
          windowClosedConsistently: chosen.basis.windowClosedConsistently,
          readWatermark: page?.throughSeq ?? null,
          knownEventCount: page?.knownEventCount ?? null,
          pageCoverage: preview.attribution.eventPageCoverage,
        }),
      });
    },
  });
}

/** §8.6: read the selected session, or report why no page exists. Never reads any other session. */
async function readSelectedSession(
  reader: AttributedPreviewCompositionInput["sessionReader"],
  sessionId: string,
  maxEvents: number | undefined,
): Promise<DshSessionEventPage | undefined> {
  if (reader === undefined) return undefined;
  return reader.readEvents({ sessionId, ...(maxEvents === undefined ? {} : { maxEvents }) });
}

/**
 * §8.3: select an invocation from the qualified set.
 *
 * A caller-supplied invocation id is a SELECTOR, never authority: it must be one of the QUALIFIED
 * invocations, or the request is refused. With several qualified invocations and no request, the adapter
 * refuses rather than auto-selecting the latest.
 */
function selectInvocation(input: {
  readonly qualified: readonly QualifiedAssociation[];
  readonly all: readonly { readonly invocationId: string; readonly state: string }[];
  readonly requested: string | undefined;
}): { readonly selected: QualifiedAssociation | null; readonly state: InvocationSelectionState; readonly detail: string; readonly qualificationState: string } {
  if (input.qualified.length === 0) {
    const states = [...new Set(input.all.map((entry) => entry.state))];
    return { selected: null, state: "NO_DURABLE_EVIDENCE", detail: `no invocation is qualified for this attempt (observed states: ${states.join(", ") || "none"})`, qualificationState: states[0] ?? "NO_DURABLE_OBSERVATION" };
  }
  if (input.requested !== undefined) {
    const match = input.qualified.find((entry) => entry.invocationId === input.requested);
    if (match !== undefined) return { selected: match, state: "SELECTED_REQUESTED", detail: `the requested invocation ${input.requested} is qualified`, qualificationState: "ASSOCIATION_QUALIFIED" };
    const belongs = input.all.some((entry) => entry.invocationId === input.requested);
    return {
      selected: null,
      state: belongs ? "REQUESTED_NOT_QUALIFIED" : "REQUESTED_FOREIGN",
      detail: belongs ? `the requested invocation ${input.requested} belongs to this attempt but is not qualified` : `the requested invocation ${input.requested} does not belong to this attempt`,
      qualificationState: "ASSOCIATION_QUALIFIED",
    };
  }
  if (input.qualified.length === 1) {
    return { selected: input.qualified[0]!, state: "SELECTED_UNIQUE", detail: "exactly one invocation is qualified and no unresolved alternative exists", qualificationState: "ASSOCIATION_QUALIFIED" };
  }
  return { selected: null, state: "AMBIGUOUS_REQUIRES_SELECTION", detail: `${String(input.qualified.length)} invocations are qualified; an explicit invocationId is required`, qualificationState: "ASSOCIATION_QUALIFIED" };
}

/** §9.5: the H1 associations for one attempt, when a caller wants the raw evidence rather than a preview. */
export function associationsOf(qualification: { readonly qualifications: readonly { readonly state: string }[] }): readonly AttemptSessionAssociation[] {
  return Object.freeze(
    qualification.qualifications
      .filter((entry): entry is QualifiedAssociation => entry.state === "ASSOCIATION_QUALIFIED")
      .map((entry) => entry.h1Association),
  );
}

/** Re-exported so a caller need not import the trajectory barrel for the store type. */
export type { ExecutionAssociationStore };
