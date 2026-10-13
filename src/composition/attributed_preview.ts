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
  buildTrajectoryContextCapsule,
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
  type TrajectoryContextCapsule,
} from "../trajectory/index.js";
import type { AssociationQualifier, ExecutionAssociationStore, QualifiedAssociation } from "../execution_association/index.js";
import { admitAttempt, attemptEvents, buildRelationContext, canonicalFactsOf, type TrajectoryV0WorkOwner } from "./trajectory_v0.js";

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
  /**
   * P2-D0 §10: build a bounded, read-only Trajectory Context Capsule for ONE permitted historical Attempt.
   *
   * The CONSUMER's permission is its own canonical Work/Context lineage, resolved by the injected
   * authorization port — never a caller-supplied SessionId, AttemptId, binding or epoch. The model supplies
   * nothing but its own consumer Attempt identity.
   */
  capsuleForConsumer(input: {
    readonly consumerAttemptId: string;
    /** §10.2: the historical Attempt the consumer believes it is continuing, if it names one. */
    readonly requestedOriginAttemptId?: string | undefined;
    readonly maxEvents?: number | undefined;
  }): Promise<CapsuleForConsumerResult>;
  readonly hasDshReader: boolean;
  readonly hasQualifier: boolean;
}

/** §10.2/§10.3: the Capsule authorization outcome. A refusal names WHY, and is never a silent absence. */
export const CAPSULE_AUTHORIZATION_STATES = [
  /** The consumer's own canonical lineage names exactly one permitted origin Attempt. */
  "AUTHORIZED",
  /** The consumer Attempt is not a canonical attempt of this project. */
  "CONSUMER_NOT_CANONICAL",
  /** The consumer Attempt has no governed rework lineage, so it may inspect no historical Attempt. */
  "NO_LINEAGE",
  /** The requested origin is not the one the consumer's lineage permits. */
  "ORIGIN_NOT_PERMITTED",
  /** The permitted origin Attempt produced no qualified execution evidence. */
  "NO_QUALIFIED_ORIGIN",
] as const;
export type CapsuleAuthorizationState = (typeof CAPSULE_AUTHORIZATION_STATES)[number];

export interface CapsuleForConsumerResult {
  readonly state: CapsuleAuthorizationState;
  readonly detail: string;
  /** §10.6: present only when the state is AUTHORIZED. A refused Capsule is NOT fabricated. */
  readonly capsule: TrajectoryContextCapsule | null;
  readonly originAttemptId: string | null;
  /** §10.3: the internal source identity the Context owner bound — never chosen by the model. */
  readonly permittedOriginAttemptId: string | null;
}

/**
 * §10.3: the CONSUMER AUTHORIZATION PORT.
 *
 * The source of permission is the current consumer Attempt's canonical Work/Context lineage. The
 * composition supplies the concrete read (the governed rework lineage the Context owner already resolves);
 * this module never invents a permission rule. The model can neither supply nor override the origin.
 */
export interface CapsuleAuthorizationPort {
  resolvePermittedOrigin(input: { readonly consumerAttemptId: string }):
    | { readonly ok: true; readonly originAttemptId: string; readonly basis: string }
    | { readonly ok: false; readonly reason: "CONSUMER_NOT_CANONICAL" | "NO_LINEAGE"; readonly detail: string };
}

export interface AttributedPreviewCompositionInput {
  readonly projectId: string;
  readonly controller: TrajectoryV0WorkOwner;
  readonly promotions: { promotionFactsSync(): readonly { readonly eventId: string; readonly promotionId: string; readonly attemptId: string; readonly sourceCommit: string; readonly expectedHeadCommit: string; readonly resultingHeadCommit: string }[] };
  readonly qualifier: AssociationQualifier | undefined;
  readonly store: ExecutionAssociationStore | undefined;
  readonly sessionReader: { readonly sourceIdentity: string; readonly evidenceClass: "REAL_DSH_QUERY" | "DSH_QUERY_PORT_FIXTURE"; readEvents(request: { readonly sessionId: string; readonly fromSeq?: number | undefined; readonly maxEvents?: number | undefined }): Promise<DshSessionEventPage>; close?(): Promise<void> } | undefined;
  /** §8.9: the project-evolution summary builder, injected so this module owns no T0 semantics. */
  readonly projectEvolutionOf: (input: {
    readonly attemptId: string;
    readonly events: readonly import("../schema/index.js").SchedulerEvent[];
    /** P2-D0 §8.3: the attempt's own relation context, so the injected builder can select its relations. */
    readonly relationContext: import("../trajectory/index.js").AttemptRelationContext;
  }) => Promise<PreviewProjectEvolutionSummary>;
  /**
   * P2-D0 §10.3: the consumer-authorization port, when the deployment composes one. Absent ⇒
   * `capsuleForConsumer` refuses with NO_LINEAGE rather than fabricating a Capsule.
   */
  readonly capsuleAuthorization?: CapsuleAuthorizationPort | undefined;
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

  const service: AttributedPreviewService = {
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
      /**
       * P2-D0 §8.1/§8.2: THE CANONICAL FACTS COME FROM THE EXISTING V0 SEMANTIC, NOT PLACEHOLDERS.
       *
       * `canonicalFactsOf` is the SAME function the ordinary V0 Preview uses, so the attributed Preview
       * reports the real terminal result reference, the promotion identity, the governed-rework state and
       * the historical Work basis. Verification remains `NOT_OBSERVED_BY_V0` — the same honest value the
       * V0 composition uses, because verification is a separate owner's fact that neither composition
       * infers from a completed attempt. No Session admission depends on any of this (§8.5).
       */
      const canonical: PreviewCanonicalFacts = canonicalFactsOf({
        events,
        attemptId: request.attemptId,
        record,
        basis: controller.attemptBasisForResolution(request.attemptId),
        promotions: input.promotions.promotionFactsSync(),
        admitted,
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
      /**
       * P2-D0 §8.3: the T0 project-evolution projection is supplied by the COMPOSITION through the
       * injected `projectEvolutionOf`, which the product cluster now wires to the SAME `projectEvolutionOf`
       * the V0 composition uses (with the attempt's own relation context). The adapter therefore presents
       * the real projection root, semantic digest, Work sequence/digest, ProjectIR revision, selected and
       * quarantined relations and the cross-owner basis caveats — or the honest structured failure origin.
       */
      const relationContext = buildRelationContext({ projectId, attemptId: request.attemptId, events, admitted });
      const projectEvolution = await input.projectEvolutionOf({ attemptId: request.attemptId, events, relationContext });

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
            ? selection.detail
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

      /**
       * P2-D0 §9.2: A CALLER CLAIM IS A DECLARATION, AND A DISAGREEMENT IS REPORTED.
       *
       * The verified SessionId remains the ONLY read target. When the caller's claimed id differs from it,
       * the discrepancy is recorded on the binding's evidence and stated in the detail, so a consumer sees
       * that the claim was contradicted rather than silently ignored. The claim creates no source authority.
       */
      const claimDisagrees = request.claimedSessionId !== undefined && request.claimedSessionId !== chosen.dshSessionId;

      /**
       * §8.6 STEP 4 / P2-D0 §7.6: read ONLY the selected session, through the official reader.
       *
       * THE FINAL RELEVANT-BASIS RECHECK. The qualifier rechecked currentness BEFORE it returned, but the
       * Event Read is asynchronous: a conflicting observation or a relevant finalization can be committed
       * to the SAME Invocation while the page is being read (F3). The store head is captured before the
       * read and re-checked after it; a relevant change yields an explicit RACED outcome rather than a
       * stale admission. This is a bounded optimistic read-check, not a distributed transaction, and it
       * does not loop.
       */
      const headBeforeRead = input.store.head();
      const invocationEventIdsBefore = input.store
        .replayForAttempt({ projectId, attemptId: request.attemptId })
        .filter((event) => event.payload.invocationId === chosen.invocationId)
        .map((event) => event.eventId);
      const page = await readSelectedSession(input.sessionReader, chosen.dshSessionId, request.maxEvents);
      const headAfterRead = input.store.head();
      const invocationEventIdsAfter = input.store
        .replayForAttempt({ projectId, attemptId: request.attemptId })
        .filter((event) => event.payload.invocationId === chosen.invocationId)
        .map((event) => event.eventId);
      const relevantChangedDuringRead =
        headAfterRead !== headBeforeRead &&
        (invocationEventIdsAfter.length !== invocationEventIdsBefore.length ||
          invocationEventIdsAfter.some((eventId, index) => eventId !== invocationEventIdsBefore[index]));
      if (relevantChangedDuringRead) {
        const binding = unboundBinding({
          projectId,
          attemptId: request.attemptId,
          viewId,
          detail: `the association evidence for invocation ${chosen.invocationId} changed while its session page was being read, so the page is NOT admitted as current attribution`,
          claimedSessionId: request.claimedSessionId ?? null,
        });
        return Object.freeze({
          preview: buildHandoffPreview({ projectId, attemptId: request.attemptId, binding, canonical, host, projectEvolution }),
          selection: Object.freeze({ state: "AMBIGUOUS_REQUIRES_SELECTION" as const, invocationId: null, detail: `the qualification basis for invocation ${chosen.invocationId} changed during the event read, so the preview is not bound to a stable basis` }),
          provenance: Object.freeze({
            qualificationState: "RACED",
            sourceEpochId: chosen.sourceEpochId,
            durableBindingRef: chosen.durableBindingRef,
            windowClosedConsistently: chosen.basis.windowClosedConsistently,
            readWatermark: page?.throughSeq ?? null,
            knownEventCount: page?.knownEventCount ?? null,
            pageCoverage: "NOT_APPLICABLE",
          }),
        });
      }

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
          ...(claimDisagrees
            ? [Object.freeze({ source: "CALLER_DECLARATION" as const, detail: `the caller claimed session ${String(request.claimedSessionId)}, which the verified association contradicts; the claim is a declaration and grants no read authority`, compared: Object.freeze({ claimedSessionId: String(request.claimedSessionId), verifiedSessionId: chosen.dshSessionId, attemptId: request.attemptId }) })]
            : []),
        ]),
        detail: claimDisagrees
          ? `a source-qualified durable association (epoch ${chosen.sourceEpochId}) establishes session ${chosen.dshSessionId} for invocation ${chosen.invocationId}; the caller's claim of ${String(request.claimedSessionId)} DISAGREES and is retained only as a declaration`
          : `a source-qualified durable association (epoch ${chosen.sourceEpochId}) establishes session ${chosen.dshSessionId} for invocation ${chosen.invocationId}`,
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

    async capsuleForConsumer(request: {
      readonly consumerAttemptId: string;
      readonly requestedOriginAttemptId?: string | undefined;
      readonly maxEvents?: number | undefined;
    }): Promise<CapsuleForConsumerResult> {
      /**
       * §10.3 STEP 1: THE CONSUMER'S PERMISSION IS ITS OWN CANONICAL LINEAGE.
       *
       * The consumer must be a canonical attempt of this project, and its governed rework lineage must
       * name exactly one permitted origin Attempt. A caller-supplied `requestedOriginAttemptId` is a
       * SELECTOR that must AGREE with the lineage — it can never widen the permission.
       */
      const consumerRecord = controller.attemptWorkRecord(request.consumerAttemptId);
      if (consumerRecord === null) {
        return Object.freeze({ state: "CONSUMER_NOT_CANONICAL" as const, detail: `attempt ${request.consumerAttemptId} is not a canonical attempt of this project`, capsule: null, originAttemptId: null, permittedOriginAttemptId: null });
      }
      if (input.capsuleAuthorization === undefined) {
        return Object.freeze({ state: "NO_LINEAGE" as const, detail: "this deployment composes no consumer-authorization port, so no historical Attempt may be inspected", capsule: null, originAttemptId: null, permittedOriginAttemptId: null });
      }
      const permitted = input.capsuleAuthorization.resolvePermittedOrigin({ consumerAttemptId: request.consumerAttemptId });
      if (!permitted.ok) {
        return Object.freeze({ state: permitted.reason, detail: permitted.detail, capsule: null, originAttemptId: null, permittedOriginAttemptId: null });
      }
      /** §10.3: a named origin that disagrees with the lineage is refused; the lineage is the authority. */
      if (request.requestedOriginAttemptId !== undefined && request.requestedOriginAttemptId !== permitted.originAttemptId) {
        return Object.freeze({
          state: "ORIGIN_NOT_PERMITTED" as const,
          detail: `the consumer's canonical lineage permits origin attempt ${permitted.originAttemptId}, not the requested ${request.requestedOriginAttemptId}`,
          capsule: null,
          originAttemptId: request.requestedOriginAttemptId,
          permittedOriginAttemptId: permitted.originAttemptId,
        });
      }

      /**
       * §10.4 STEP 2: build the origin Attempt's ATTRIBUTED Preview through the SAME admission path, so a
       * Capsule can only ever present evidence that already passed qualification and admission.
       */
      let origin: AttributedPreviewResult;
      try {
        origin = await service.previewAttempt({ attemptId: permitted.originAttemptId, ...(request.maxEvents === undefined ? {} : { maxEvents: request.maxEvents }) });
      } catch (error) {
        return Object.freeze({ state: "NO_QUALIFIED_ORIGIN" as const, detail: `the permitted origin attempt could not be admitted: ${error instanceof Error ? error.message : String(error)}`, capsule: null, originAttemptId: permitted.originAttemptId, permittedOriginAttemptId: permitted.originAttemptId });
      }
      if (origin.selection.state === "NO_DURABLE_EVIDENCE") {
        return Object.freeze({ state: "NO_QUALIFIED_ORIGIN" as const, detail: `the permitted origin attempt ${permitted.originAttemptId} produced no qualified execution evidence`, capsule: null, originAttemptId: permitted.originAttemptId, permittedOriginAttemptId: permitted.originAttemptId });
      }

      /**
       * §10.6: the Capsule's uncertainty is fed the admission's OWN provenance, so it cannot be less
       * complete than the attribution it presents.
       */
      const capsule = buildTrajectoryContextCapsule({
        consumerAttemptId: request.consumerAttemptId,
        originAttemptId: permitted.originAttemptId,
        authorizationBasis: permitted.basis,
        preview: origin.preview,
        attributionProvenance: {
          qualificationState: origin.provenance.qualificationState,
          sourceEpochId: origin.provenance.sourceEpochId,
          durableBindingRef: origin.provenance.durableBindingRef,
          invocationSelectionState: origin.selection.state,
          otherInvocationsUnresolved: [],
          knownEventCount: origin.provenance.knownEventCount,
        },
      });
      return Object.freeze({ state: "AUTHORIZED" as const, detail: `the consumer's canonical lineage permits inspecting origin attempt ${permitted.originAttemptId}`, capsule, originAttemptId: permitted.originAttemptId, permittedOriginAttemptId: permitted.originAttemptId });
    },
  };
  return Object.freeze(service);
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
 * §8.3 / P2-D0 §7.4: select an invocation from the qualified set.
 *
 * A caller-supplied invocation id is a SELECTOR, never authority: it must be one of the QUALIFIED
 * invocations, or the request is refused.
 *
 * THE P2-D0 CORRECTION. An automatic unique selection is allowed ONLY when the whole relevant Invocation
 * set justifies it. Before P2-D0 the adapter returned SELECTED_UNIQUE for one qualified invocation without
 * consulting the unresolved states of the others, so `I-1 QUALIFIED + I-2 OBSERVATION_INCOMPLETE` reported
 * "no unresolved alternative exists" (F2) — a claim the evidence does not support. Now:
 *
 *   · zero qualified            → NO_DURABLE_EVIDENCE;
 *   · a requested, qualified id → SELECTED_REQUESTED, and the result states that other Invocations may
 *                                 remain unresolved (the selected page is not the whole Attempt history);
 *   · exactly one qualified AND no other Invocation exists at all → SELECTED_UNIQUE;
 *   · otherwise                 → AMBIGUOUS_REQUIRES_SELECTION.
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
  /**
   * P2-D0 §7.4: the invocations that exist but did NOT qualify. These are the "unresolved alternatives"
   * the detail must name — the whole reason a single qualified invocation is not automatically the answer.
   */
  const unresolved = input.all.filter((entry) => entry.state !== "ASSOCIATION_QUALIFIED").map((entry) => `${entry.invocationId} (${entry.state})`);
  if (input.requested !== undefined) {
    const match = input.qualified.find((entry) => entry.invocationId === input.requested);
    if (match !== undefined) {
      return {
        selected: match,
        state: "SELECTED_REQUESTED",
        detail:
          unresolved.length === 0
            ? `the requested invocation ${input.requested} is qualified and no other invocation remains unresolved`
            : `the requested invocation ${input.requested} is qualified; ${String(unresolved.length)} other invocation(s) remain unresolved (${unresolved.join(", ")}), so this page is not the entire Attempt history`,
        qualificationState: "ASSOCIATION_QUALIFIED",
      };
    }
    const belongs = input.all.some((entry) => entry.invocationId === input.requested);
    return {
      selected: null,
      state: belongs ? "REQUESTED_NOT_QUALIFIED" : "REQUESTED_FOREIGN",
      detail: belongs ? `the requested invocation ${input.requested} belongs to this attempt but is not qualified` : `the requested invocation ${input.requested} does not belong to this attempt`,
      qualificationState: "ASSOCIATION_QUALIFIED",
    };
  }
  /**
   * §7.4: SELECTED_UNIQUE requires that NO other invocation exists at all. A qualified invocation beside an
   * unresolved one is an ambiguous set, not a unique answer.
   */
  if (input.qualified.length === 1 && input.all.length === 1) {
    return { selected: input.qualified[0]!, state: "SELECTED_UNIQUE", detail: "exactly one invocation is qualified and no unresolved alternative exists", qualificationState: "ASSOCIATION_QUALIFIED" };
  }
  return {
    selected: null,
    state: "AMBIGUOUS_REQUIRES_SELECTION",
    detail:
      unresolved.length > 0
        ? `${String(input.qualified.length)} invocation(s) are qualified and ${String(unresolved.length)} remain unresolved (${unresolved.join(", ")}); an explicit invocationId is required`
        : `${String(input.qualified.length)} invocations are qualified; an explicit invocationId is required`,
    qualificationState: "ASSOCIATION_QUALIFIED",
  };
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
