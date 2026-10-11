/**
 * Trajectory-V0 §6/§10 (V0-D / V0-H) — THE READ-ONLY HANDOFF PREVIEW.
 *
 * One bounded, serializable read model that combines both Trajectory views for ONE Work Attempt:
 * the canonical Work/Project evolution (reused from T0) and the execution observations (read
 * through the DSH port). It answers the §6 questions and nothing more.
 *
 * Two laws govern this file, and both are structural rather than aspirational:
 *
 *   §6 "No automatic continuation" — the Preview is INSPECTION DATA. It cannot resume a session,
 *   schedule a worker, settle an attempt, approve a promotion, select capital or inject context.
 *   There is no method here that could: the module holds no owner, and every input is a value.
 *
 *   §6 "Critical status separation" — there is no single `COMPLETED` boolean. Process lifecycle,
 *   DSH session lifecycle, canonical Work state, result verification, promotion and preview
 *   completeness are SIX separate fields, because a direct child exiting zero does not prove
 *   settlement, a `turn/end` does not prove promotion, and an attempt completing does not prove
 *   every DSH event was recovered.
 *
 * §10's admission policy is applied here rather than in the caller: a canonical fact may come from a
 * Work owner; a DSH fact only from a bound, readable source; a host fact only from a real local
 * observation with the G1-B limitation stated; and a cross-owner relation only when its source
 * relationship is exact. Missing source is never an empty history, and an unknown exit is never a
 * successful exit.
 */
import { canonicalDigest } from "../schema/index.js";
import {
  DSH_PAGE_DOES_NOT_PROVE,
  type AttemptExecutionBinding,
  type BindingState,
  type DshSessionEventPage,
  type SessionReadState,
} from "./execution.js";

/* ------------------------------------------------------------------ *
 * §6 — The six separate statuses
 * ------------------------------------------------------------------ */

/**
 * §6: process lifecycle, as the HOST observed it.
 *
 * `UNKNOWN_AFTER_RESTART` exists because the host-local job map is not durable: after a restart the
 * view must not fabricate a prior RUNNING/FINISHED phase, and a lost host job never retroactively
 * changes canonical Work settlement.
 */
export const PROCESS_LIFECYCLE_STATES = [
  "NOT_OBSERVED",
  "SPAWN_ATTEMPTED",
  "RUNNING",
  "EXITED",
  "SPAWN_FAILED",
  "TIMEOUT_REQUESTED",
  "ABORT_REQUESTED",
  "UNKNOWN_AFTER_RESTART",
] as const;
export type ProcessLifecycle = (typeof PROCESS_LIFECYCLE_STATES)[number];

/** §6: the DSH session's own lifecycle, which is NOT the Work Attempt's lifecycle. */
export const SESSION_LIFECYCLE_STATES = [
  "NO_SESSION_BOUND",
  "SESSION_IDENTIFIED_NOT_READ",
  "SESSION_READ",
  "SESSION_UNREADABLE",
] as const;
export type SessionLifecycle = (typeof SESSION_LIFECYCLE_STATES)[number];

/** §6: how complete this Preview is. Distinct from every lifecycle above. */
export const PREVIEW_COMPLETENESS_STATES = ["COMPLETE", "PARTIAL", "MINIMAL"] as const;
export type PreviewCompleteness = (typeof PREVIEW_COMPLETENESS_STATES)[number];

/* ------------------------------------------------------------------ *
 * §6 — The Preview shape
 * ------------------------------------------------------------------ */

/** §6 "Attempt Identity". */
export interface PreviewAttemptIdentity {
  readonly projectId: string;
  readonly taskId: string | null;
  readonly attemptId: string;
  readonly viewId: string;
  readonly workState: string | null;
  readonly historicalAuthorization: {
    readonly envelopeId: string | null;
    readonly basisDigest: string | null;
    readonly capturedAtRevision: number | null;
    readonly detail: string;
  };
}

/** §6 "Execution Evidence". */
export interface PreviewExecutionEvidence {
  readonly bindingStatus: BindingState;
  readonly bindingSource: string;
  readonly bindingDetail: string;
  readonly processLifecycle: ProcessLifecycle;
  readonly processDetail: string;
  readonly sessionLifecycle: SessionLifecycle;
  readonly sessionReadState: SessionReadState | null;
  readonly dshSessionId: string | null;
  readonly hostLocalJobId: string | null;
  readonly portInvocationId: string | null;
  /** Bounded, sanitized event views. Empty when no session is bound — which is NOT "no events happened". */
  readonly events: readonly {
    readonly sessionId: string;
    readonly seq: number;
    readonly type: string;
    readonly inherited: boolean;
    readonly summary: string;
    readonly observedStatus: string | null;
  }[];
  readonly eventsDetail: string;
}

/** §6 "Canonical Outcome". */
export interface PreviewCanonicalOutcome {
  readonly attemptState: string | null;
  readonly resultRefs: readonly string[];
  readonly resultDetail: string;
  readonly verificationState: string;
  readonly promotionState: string;
  readonly promotionId: string | null;
  readonly reworkState: string;
  readonly reworkDetail: string;
}

/** §6 "Project Context" — the safe portion of the T0 projection. */
export interface PreviewProjectContext {
  readonly projectionRootId: string | null;
  readonly projectionSemanticDigest: string | null;
  readonly workSequence: number | null;
  readonly workEventDigest: string | null;
  readonly projectIrRevision: number | null;
  /** §5: stated explicitly, because a Work cut plus present-day cross-owner reads is NOT atomic. */
  readonly historicalBasisNote: string;
  readonly selectedRelations: readonly {
    readonly relation: string;
    readonly evidenceState: string;
    readonly detail: string;
  }[];
  /** §5: T0 relations whose verifier is known incomplete are quarantined here, not presented as fact. */
  readonly quarantinedRelations: readonly {
    readonly relation: string;
    readonly reason: string;
  }[];
  readonly unresolvedReferences: readonly string[];
  readonly currentnessCaveats: readonly string[];
}

/** §6 "Handoff Caveats". */
export interface PreviewCaveats {
  readonly sourcesUnavailable: readonly string[];
  readonly missingSession: boolean;
  readonly staleBasis: boolean;
  readonly contradictoryObservations: readonly string[];
  readonly epistemicLimits: readonly string[];
}

/**
 * §6: the whole Preview. One bounded, serializable read model.
 *
 * `previewDigest` is a deterministic digest of the semantic content, so two constructions from the
 * same inputs agree — and it excludes the construction time and any host path.
 */
export interface HandoffPreview {
  readonly schemaVersion: 1;
  readonly kind: "HANDOFF_PREVIEW";
  readonly previewId: string;
  readonly attempt: PreviewAttemptIdentity;
  readonly execution: PreviewExecutionEvidence;
  readonly canonical: PreviewCanonicalOutcome;
  readonly projectContext: PreviewProjectContext;
  readonly caveats: PreviewCaveats;
  readonly completeness: PreviewCompleteness;
  /**
   * §6: what this Preview is. Stated on the object so no consumer can mistake it for an authority.
   */
  readonly isInspectionData: true;
  readonly doesNotAuthorize: readonly string[];
  readonly previewDigest: string;
}

/** §6/§10: what a Preview explicitly does not authorize. */
export const PREVIEW_DOES_NOT_AUTHORIZE = Object.freeze([
  "resuming a DSH session",
  "scheduling a worker",
  "settling a Work attempt",
  "approving a promotion",
  "selecting capital for a model",
  "injecting content into the next Agent prompt",
  "widening Context Pull permissions, Work scope or project asset access",
] as const);

/* ------------------------------------------------------------------ *
 * §6 — Inputs
 * ------------------------------------------------------------------ */

/**
 * §6: the canonical Work facts the Preview may present.
 *
 * Every field is a value read from the Work owner. `null` means the owner supplied nothing — which
 * is reported as an absence, never as a default.
 */
export interface PreviewCanonicalFacts {
  readonly attemptState: string | null;
  readonly taskId: string | null;
  readonly workState: string | null;
  readonly envelopeId: string | null;
  readonly basisDigest: string | null;
  readonly capturedAtRevision: number | null;
  readonly authorizationDetail: string;
  readonly resultRefs: readonly string[];
  readonly resultDetail: string;
  readonly verificationState: string;
  readonly promotionState: string;
  readonly promotionId: string | null;
  readonly reworkState: string;
  readonly reworkDetail: string;
}

/** §6: the host observations for this attempt, as the delegation service supplied them. */
export interface PreviewHostObservationSummary {
  readonly hostLocalJobId: string | null;
  readonly portInvocationId: string | null;
  readonly processLifecycle: ProcessLifecycle;
  readonly processDetail: string;
  readonly observedEventKinds: readonly string[];
  /**
   * §10: a caller-supplied `trustedIngestion: true` is NOT evidence. This field records that the
   * observation came from a real local producer, and states the G1-B limitation.
   */
  readonly originLimitation: string;
}

/**
 * §5: the safe portion of the T0 project evolution projection, already selected.
 *
 * V0 does NOT re-derive T0 semantics here. The composition layer runs T0 and hands over only the
 * relations that are exactly source-backed, plus an explicit quarantine list for the rest.
 */
export interface PreviewProjectEvolutionSummary {
  readonly projectionRootId: string | null;
  readonly projectionSemanticDigest: string | null;
  readonly workSequence: number | null;
  readonly workEventDigest: string | null;
  readonly projectIrRevision: number | null;
  readonly selectedRelations: readonly {
    readonly relation: string;
    readonly evidenceState: string;
    readonly detail: string;
  }[];
  readonly quarantinedRelations: readonly {
    readonly relation: string;
    readonly reason: string;
  }[];
  readonly unresolvedReferences: readonly string[];
  readonly currentnessCaveats: readonly string[];
}

/** §6: the whole input to one Preview. */
export interface HandoffPreviewInput {
  readonly projectId: string;
  readonly attemptId: string;
  readonly binding: AttemptExecutionBinding;
  readonly canonical: PreviewCanonicalFacts;
  readonly host: PreviewHostObservationSummary;
  /** Absent when the DSH reader was not composed at all. */
  readonly sessionPage?: DshSessionEventPage | undefined;
  readonly projectEvolution: PreviewProjectEvolutionSummary;
}

/* ------------------------------------------------------------------ *
 * §10 — The admission policy
 * ------------------------------------------------------------------ */

/**
 * §10: map a session read state onto the Preview's session lifecycle.
 *
 * An unsupported format or a corrupt session is `SESSION_UNREADABLE` — never "no events".
 */
export function sessionLifecycleOf(readState: SessionReadState | null): SessionLifecycle {
  if (readState === null) return "NO_SESSION_BOUND";
  if (readState === "READ_OK") return "SESSION_READ";
  if (readState === "READ_CAPABILITY_ABSENT") return "SESSION_IDENTIFIED_NOT_READ";
  return "SESSION_UNREADABLE";
}

/**
 * §10: derive the Preview's completeness from what is actually present.
 *
 * `COMPLETE` requires a readable bound session AND canonical result facts. A minimal Preview is a
 * legitimate outcome — an unbound attempt with full canonical facts is still useful, and calling it
 * incomplete would be more honest than calling it complete.
 */
export function previewCompletenessOf(input: {
  readonly sessionLifecycle: SessionLifecycle;
  readonly hasCanonicalResult: boolean;
  readonly hasProjectContext: boolean;
}): PreviewCompleteness {
  if (input.sessionLifecycle === "SESSION_READ" && input.hasCanonicalResult && input.hasProjectContext) return "COMPLETE";
  if (input.hasCanonicalResult || input.hasProjectContext) return "PARTIAL";
  return "MINIMAL";
}

/**
 * §10: build the caveat block.
 *
 * Every caveat is derived from a real absence or conflict — this function never emits a generic
 * disclaimer, and it never suppresses one that applies.
 */
function caveatsOf(input: {
  readonly binding: AttemptExecutionBinding;
  readonly host: PreviewHostObservationSummary;
  readonly sessionPage: DshSessionEventPage | undefined;
  readonly projectEvolution: PreviewProjectEvolutionSummary;
  readonly canonical: PreviewCanonicalFacts;
}): PreviewCaveats {
  const sourcesUnavailable: string[] = [];
  const contradictoryObservations: string[] = [];
  const epistemicLimits: string[] = [];

  /**
   * §4/§6: the "no DSH session" caveat follows the SESSION, not the binding state. An attempt can
   * be host-observed (BOUND_LOCAL_ONLY) while still having no DSH session at all, and that absence
   * must be stated either way.
   */
  if (input.binding.dshSessionId === null) {
    epistemicLimits.push(
      "No DSH session is bound to this attempt: no producer records an Attempt→Session relationship, so no session events are presented.",
    );
  }
  if (input.binding.bindingStatus === "SOURCE_UNAVAILABLE" || input.sessionPage?.readState === "READ_CAPABILITY_ABSENT") {
    sourcesUnavailable.push("The DSH session source could not be read; its absence is a missing source, not an empty history.");
  }
  if (input.binding.bindingStatus === "CONFLICT") {
    contradictoryObservations.push(input.binding.detail);
  }
  if (input.binding.bindingStatus === "BOUND_LOCAL_ONLY") {
    epistemicLimits.push(
      "The session binding is LOCAL ONLY: the caller supplied the id and its header agreed, which is evidence of a request rather than of an established binding.",
    );
  }
  if (input.sessionPage !== undefined && input.sessionPage.readState === "CORRUPT_SESSION") {
    sourcesUnavailable.push("The stored session failed validation, so its events are not presented.");
  }
  if (input.sessionPage !== undefined && input.sessionPage.readState === "FORMAT_UNSUPPORTED") {
    sourcesUnavailable.push("The stored session format is not supported by the installed reader, so it was not interpreted as an empty stream.");
  }
  if (input.sessionPage !== undefined && input.sessionPage.readState === "EVENT_GAP") {
    epistemicLimits.push("The session log has a sequence gap, so the event view is incomplete.");
  }

  epistemicLimits.push(input.host.originLimitation);
  epistemicLimits.push(
    "A direct child exiting with code zero does not prove Work settlement, and a DSH turn/end does not prove promotion.",
  );
  epistemicLimits.push("A Work attempt completing does not prove every DSH event was durably recovered.");
  for (const limit of DSH_PAGE_DOES_NOT_PROVE) epistemicLimits.push(limit);

  if (input.projectEvolution.quarantinedRelations.length > 0) {
    epistemicLimits.push(
      `${String(input.projectEvolution.quarantinedRelations.length)} cross-owner relation(s) are quarantined as UNVERIFIED_RELATION because their T0 verifier is known incomplete.`,
    );
  }
  if (input.projectEvolution.currentnessCaveats.length > 0) {
    for (const caveat of input.projectEvolution.currentnessCaveats) epistemicLimits.push(caveat);
  }
  if (input.canonical.resultRefs.length === 0) {
    epistemicLimits.push("No canonical result reference exists for this attempt, so no result is asserted.");
  }

  return Object.freeze({
    sourcesUnavailable: Object.freeze([...new Set(sourcesUnavailable)]),
    missingSession: input.binding.dshSessionId === null,
    staleBasis: input.projectEvolution.currentnessCaveats.some((caveat) => caveat.toLowerCase().includes("stale")),
    contradictoryObservations: Object.freeze([...new Set(contradictoryObservations)]),
    epistemicLimits: Object.freeze([...new Set(epistemicLimits)]),
  });
}

/* ------------------------------------------------------------------ *
 * §6 — Build the Preview
 * ------------------------------------------------------------------ */

/**
 * §6: build the Handoff Preview. Pure — it reads nothing further and writes nothing.
 *
 * The construction is synchronous and total: every input is a value, so the same inputs always
 * produce the same Preview and the same `previewDigest`.
 */
export function buildHandoffPreview(input: HandoffPreviewInput): HandoffPreview {
  const sessionLifecycle = sessionLifecycleOf(input.sessionPage?.readState ?? null);
  const hasCanonicalResult = input.canonical.resultRefs.length > 0;
  const hasProjectContext = input.projectEvolution.projectionRootId !== null;

  const completeness = previewCompletenessOf({ sessionLifecycle, hasCanonicalResult, hasProjectContext });

  const attempt: PreviewAttemptIdentity = Object.freeze({
    projectId: input.projectId,
    taskId: input.canonical.taskId ?? input.binding.historicalWorkBasis.taskId,
    attemptId: input.attemptId,
    viewId: input.binding.viewId,
    workState: input.canonical.workState,
    historicalAuthorization: Object.freeze({
      envelopeId: input.canonical.envelopeId,
      basisDigest: input.canonical.basisDigest ?? input.binding.historicalWorkBasis.basisDigest,
      capturedAtRevision: input.canonical.capturedAtRevision ?? input.binding.historicalWorkBasis.capturedAtRevision,
      detail: input.canonical.authorizationDetail,
    }),
  });

  const events = (input.sessionPage?.events ?? []).map((event) =>
    Object.freeze({
      sessionId: event.sessionId,
      seq: event.seq,
      type: event.type,
      inherited: event.inherited,
      summary: event.summary,
      observedStatus: event.observedStatus,
    }),
  );

  const execution: PreviewExecutionEvidence = Object.freeze({
    bindingStatus: input.binding.bindingStatus,
    bindingSource: input.binding.sessionSource,
    bindingDetail: input.binding.detail,
    processLifecycle: input.host.processLifecycle,
    processDetail: input.host.processDetail,
    sessionLifecycle,
    sessionReadState: input.sessionPage?.readState ?? null,
    dshSessionId: input.binding.dshSessionId,
    hostLocalJobId: input.binding.hostLocalJobId ?? input.host.hostLocalJobId,
    portInvocationId: input.binding.portInvocationId ?? input.host.portInvocationId,
    events: Object.freeze(events),
    eventsDetail:
      input.sessionPage === undefined
        ? "no DSH session read was performed, so no events are presented — this is NOT evidence that no events occurred"
        : input.sessionPage.detail,
  });

  const canonical: PreviewCanonicalOutcome = Object.freeze({
    attemptState: input.canonical.attemptState,
    resultRefs: Object.freeze([...input.canonical.resultRefs]),
    resultDetail: input.canonical.resultDetail,
    verificationState: input.canonical.verificationState,
    promotionState: input.canonical.promotionState,
    promotionId: input.canonical.promotionId,
    reworkState: input.canonical.reworkState,
    reworkDetail: input.canonical.reworkDetail,
  });

  const projectContext: PreviewProjectContext = Object.freeze({
    projectionRootId: input.projectEvolution.projectionRootId,
    projectionSemanticDigest: input.projectEvolution.projectionSemanticDigest,
    workSequence: input.projectEvolution.workSequence,
    workEventDigest: input.projectEvolution.workEventDigest,
    projectIrRevision: input.projectEvolution.projectIrRevision,
    /**
     * §5: stated explicitly and unconditionally. A Work-sequence cut combined with present-day
     * Reasoning/Proof reads is NOT an atomic historical snapshot, and the Preview says so.
     */
    historicalBasisNote:
      "WORK_HISTORICAL_CUT_WITH_CURRENT_CROSS_OWNER_READS: the Work sequence/digest is a historical cut, while cross-owner (Reasoning/Proof/Journal) reads are present-day. They are not one atomic snapshot.",
    selectedRelations: Object.freeze(input.projectEvolution.selectedRelations.map((relation) => Object.freeze({ ...relation }))),
    quarantinedRelations: Object.freeze(input.projectEvolution.quarantinedRelations.map((relation) => Object.freeze({ ...relation }))),
    unresolvedReferences: Object.freeze([...input.projectEvolution.unresolvedReferences]),
    currentnessCaveats: Object.freeze([...input.projectEvolution.currentnessCaveats]),
  });

  const caveats = caveatsOf({
    binding: input.binding,
    host: input.host,
    sessionPage: input.sessionPage,
    projectEvolution: input.projectEvolution,
    canonical: input.canonical,
  });

  const previewId = `hp-${canonicalDigest({
    domain: "palimpsest.trajectory.handoff-preview.v1",
    projectId: input.projectId,
    attemptId: input.attemptId,
  }).slice(0, 32)}`;

  /**
   * §4/§8: the digest covers the SEMANTIC content only. Construction time, host path and PID are
   * absent by construction, so two builds from the same inputs agree.
   */
  const previewDigest = canonicalDigest({
    domain: "palimpsest.trajectory.handoff-preview-content.v1",
    previewId,
    attempt,
    execution: {
      bindingStatus: execution.bindingStatus,
      bindingSource: execution.bindingSource,
      processLifecycle: execution.processLifecycle,
      sessionLifecycle: execution.sessionLifecycle,
      sessionReadState: execution.sessionReadState,
      dshSessionId: execution.dshSessionId,
      hostLocalJobId: execution.hostLocalJobId,
      portInvocationId: execution.portInvocationId,
      events: execution.events,
    },
    canonical,
    projectContext,
    caveats,
    completeness,
  });

  return Object.freeze({
    schemaVersion: 1 as const,
    kind: "HANDOFF_PREVIEW" as const,
    previewId,
    attempt,
    execution,
    canonical,
    projectContext,
    caveats,
    completeness,
    isInspectionData: true as const,
    doesNotAuthorize: PREVIEW_DOES_NOT_AUTHORIZE,
    previewDigest,
  });
}

/* ------------------------------------------------------------------ *
 * §10 — Read-only verification helper
 * ------------------------------------------------------------------ */

/**
 * §10: the fields a read-only check compares before and after building a Preview.
 *
 * This exists so a test can assert that construction changed nothing, using the SAME definition of
 * "the owner's state" that the Preview reads.
 */
export interface ReadOnlySnapshot {
  readonly workEventCount: number;
  readonly workLastEventDigest: string | null;
  readonly projectIrRevision: number | null;
  readonly projectIrDigest: string | null;
  readonly reasoningBases: readonly string[];
  readonly proofBasis: string | null;
  readonly sessionSourceDigest: string | null;
}

/** §10: compare two snapshots and report exactly which dimension moved. */
export function readOnlyViolations(before: ReadOnlySnapshot, after: ReadOnlySnapshot): readonly string[] {
  const violations: string[] = [];
  if (before.workEventCount !== after.workEventCount) violations.push(`work event count changed: ${String(before.workEventCount)} -> ${String(after.workEventCount)}`);
  if (before.workLastEventDigest !== after.workLastEventDigest) violations.push("work chain digest changed");
  if (before.projectIrRevision !== after.projectIrRevision) violations.push("ProjectIR revision changed");
  if (before.projectIrDigest !== after.projectIrDigest) violations.push("ProjectIR digest changed");
  if (before.proofBasis !== after.proofBasis) violations.push("proof basis changed");
  if (before.sessionSourceDigest !== after.sessionSourceDigest) violations.push("DSH session source changed");
  if (before.reasoningBases.length !== after.reasoningBases.length) violations.push("reasoning cell count changed");
  else for (let index = 0; index < before.reasoningBases.length; index += 1) {
    if (before.reasoningBases[index] !== after.reasoningBases[index]) violations.push(`reasoning basis ${String(index)} changed`);
  }
  return Object.freeze(violations);
}
