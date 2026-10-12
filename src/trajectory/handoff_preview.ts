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
 *   completeness are separate fields, because a direct child exiting zero does not prove
 *   settlement, a `turn/end` does not prove promotion, and an attempt completing does not prove
 *   every DSH event was recovered.
 *
 * Trajectory-V0S §8 — WHAT THE V0 MODEL OVERSTATED.
 *
 * V0 derived completeness from "a session was read", so a readable but UNRELATED session made an
 * Attempt Handoff `COMPLETE`. The corrected model keeps four attribution dimensions distinct and
 * never lets one stand in for another:
 *
 *     canonicalCoverage   the canonical Work facts are present
 *     sourceReadability   the DSH source could be read at all
 *     sessionAttribution  the session is ATTRIBUTED to this Attempt (a verified binding)
 *     processObservation  the local process observation is complete
 *
 * A Preview cannot be `COMPLETE` unless the session is ATTRIBUTED, and an unattributed read is
 * reported as `NOT_ADMITTED_TO_ATTEMPT` rather than quietly presented as this attempt's history.
 */
import { canonicalDigest } from "../schema/index.js";
import {
  DSH_PAGE_DOES_NOT_PROVE,
  type AttemptExecutionBinding,
  type DshSessionEventPage,
  type HostObservationProvenance,
  type SessionBindingState,
  type SessionReadAdmission,
  type SessionReadState,
} from "./execution.js";
import { validateSessionEventPage, type EventPageCoverage, type PageIntegrityReason, type PageIntegrityState } from "./page_integrity.js";
import { validateAdmissionInvariants } from "./admission_invariants.js";

/* ------------------------------------------------------------------ *
 * §6 — The separate statuses
 * ------------------------------------------------------------------ */

/**
 * §6: process lifecycle, as the HOST observed it.
 *
 * `UNKNOWN_AFTER_RESTART` exists because the host-local job map is not durable: after a restart the
 * view must not fabricate a prior RUNNING/FINISHED phase, and a lost host job never retroactively
 * changes canonical Work settlement.
 *
 * §8 S1-E3/E4: `TIMEOUT_REQUESTED` and `ABORT_REQUESTED` are separate from `EXITED` and from
 * `EXIT_UNCONFIRMED`, because REQUESTING termination is not OBSERVING it. A process whose abort was
 * requested but whose exit was never confirmed is not `RUNNING` in the ordinary sense and is
 * certainly not `EXITED`.
 */
export const PROCESS_LIFECYCLE_STATES = [
  "NOT_OBSERVED",
  "SPAWN_ATTEMPTED",
  "RUNNING",
  "EXITED",
  "SPAWN_FAILED",
  "TIMEOUT_REQUESTED",
  "ABORT_REQUESTED",
  "EXIT_UNCONFIRMED",
  "UNKNOWN_AFTER_RESTART",
] as const;
export type ProcessLifecycle = (typeof PROCESS_LIFECYCLE_STATES)[number];

/** §6: the DSH session's own lifecycle, which is NOT the Work Attempt's lifecycle. */
export const SESSION_LIFECYCLE_STATES = [
  "NO_SESSION_BOUND",
  "SESSION_IDENTIFIED_NOT_READ",
  "SESSION_READ_NOT_ATTRIBUTED",
  "SESSION_READ",
  "SESSION_UNREADABLE",
] as const;
export type SessionLifecycle = (typeof SESSION_LIFECYCLE_STATES)[number];

/** §6: how complete this Preview is. Distinct from every lifecycle above. */
export const PREVIEW_COMPLETENESS_STATES = ["COMPLETE", "PARTIAL", "MINIMAL"] as const;
export type PreviewCompleteness = (typeof PREVIEW_COMPLETENESS_STATES)[number];

/**
 * §8: the four attribution dimensions, reported side by side so no consumer can read one as another.
 */
export interface PreviewAttribution {
  readonly canonicalCoverage: "PRESENT" | "ABSENT";
  readonly sourceReadability: "READABLE" | "UNREADABLE" | "NOT_REQUESTED" | "NOT_COMPOSED";
  readonly sessionAttribution: "ATTRIBUTED" | "NOT_ATTRIBUTED" | "NO_SESSION";
  readonly processObservation: "COMPLETE" | "PARTIAL" | "NOT_OBSERVED" | "CONFLICTING";
  /** H0 §9.1: how much of the attributed session's event log this Preview covers. */
  readonly eventPageCoverage: EventPageCoverage;
  /**
   * H1 §7: the STRUCTURAL integrity of the page that produced the coverage. `INVALID` means the page
   * contradicted itself, so no coverage is claimed and none of its events entered the execution view.
   */
  readonly pageIntegrity: PageIntegrityState;
  /** H1 §7.4: the bounded, machine-readable reason a page was refused, or null. */
  readonly pageIntegrityReason: PageIntegrityReason | null;
  readonly detail: string;
}

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
  readonly sessionBindingStatus: SessionBindingState;
  readonly bindingSource: string;
  readonly bindingDetail: string;
  readonly hostObservationProvenance: HostObservationProvenance;
  readonly hostObservationDetail: string;
  readonly sessionReadAdmission: SessionReadAdmission;
  readonly processLifecycle: ProcessLifecycle;
  readonly processDetail: string;
  readonly sessionLifecycle: SessionLifecycle;
  readonly sessionReadState: SessionReadState | null;
  /** The session id a caller CLAIMED, if any. A claim is not a binding. */
  readonly claimedSessionId: string | null;
  /** The session id a verified producer ESTABLISHED, if any. Null without a producer. */
  readonly dshSessionId: string | null;
  readonly hostLocalJobId: string | null;
  readonly portInvocationId: string | null;
  /** §9: which reader produced the page, when one did. Provenance metadata, not authorization. */
  readonly sourceEvidenceClass: string | null;
  /** §9: the sanitized source identity, when a page was read. */
  readonly sourceIdentity: string | null;
  /** §9: the read watermark and the requested/returned page bounds, when a page was read. */
  readonly readWatermark: number | null;
  readonly requestedPageSize: number | null;
  readonly returnedPageSize: number | null;
  /**
   * §5: bounded, sanitized event views. EMPTY whenever the read is not ADMITTED to this attempt —
   * which is NOT "no events happened".
   */
  readonly events: readonly {
    readonly sessionId: string;
    readonly seq: number;
    readonly type: string;
    readonly inherited: boolean;
    readonly durability: string;
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
      /** H1 §9.2: the stable edge identity, so distinct rejected edges stay distinguishable. */
      readonly edgeId?: string | undefined;
     }[];
  readonly unresolvedReferences: readonly string[];
  readonly currentnessCaveats: readonly string[];
  /**
   * H1 §9.5: the structured projection failure origin, surfaced so a consumer can distinguish a
   * canonical Work failure from an unknown source-stage failure without parsing caveat text.
   */
  readonly projectionFailureOrigin: "CANONICAL_WORK_VALIDATION" | "UNKNOWN_SOURCE_STAGE" | null;
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
  readonly attribution: PreviewAttribution;
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
   * H1 §9.3: WHICH lifecycle phases the observation actually covers.
   *
   * A producer-established observation is not automatically a complete lifecycle observation: a host
   * that saw a Spawn has not seen an Exit. This is a SEPARATE dimension from provenance (§9.3 keeps
   * source authenticity, process observation coverage, process lifecycle and Work outcome apart), and
   * it is what `processObservation` is derived from.
   *
   *   SPAWN_AND_EXIT  both a spawn and an exit were observed
   *   SPAWN_ONLY      a spawn was observed; no exit was
   *   EXIT_ONLY       an exit was observed without a recorded spawn observation
   *   NONE            neither was observed
   */
  readonly lifecycleCoverage: HostLifecycleCoverage;
  /**
   * §10: a caller-supplied `trustedIngestion: true` is NOT evidence. This field records that the
   * observation came from a real local producer, and states the G1-B limitation.
   */
  readonly originLimitation: string;
}

/** H1 §9.3: which lifecycle phases a host observation actually covers. */
export const HOST_LIFECYCLE_COVERAGE_STATES = ["SPAWN_AND_EXIT", "SPAWN_ONLY", "EXIT_ONLY", "NONE"] as const;
export type HostLifecycleCoverage = (typeof HOST_LIFECYCLE_COVERAGE_STATES)[number];

/**
 * §5: the safe portion of the T0 project evolution projection, already selected.
 *
 * V0 does not re-derive T0 semantics here. The composition layer runs T0 and hands over only the
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
      /** H1 §9.2: the stable edge identity, so distinct rejected edges stay distinguishable. */
      readonly edgeId?: string | undefined;
     }[];
  readonly unresolvedReferences: readonly string[];
  readonly currentnessCaveats: readonly string[];
  /**
   * H0 §9.2: the STRUCTURED basis-vector completeness (`COMPLETE` | `INCOMPLETE` | `RACED`), or null
   * when the projection could not be built. The Preview reads this field rather than scanning caveat
   * text for words such as "stale".
   */
  readonly basisCompleteness?: "COMPLETE" | "INCOMPLETE" | "RACED" | null | undefined;
  /**
   * H1 §9.5: the STRUCTURED failure origin, or null when the projection succeeded.
   *
   * `CANONICAL_WORK_VALIDATION` means T0 refused the canonical Work history itself.
   * `UNKNOWN_SOURCE_STAGE` means the projection failed but its origin could not be established — a
   * canonical-source failure must NOT be silently downgraded to an optional owner's absence, and the
   * honest report is "unknown" rather than a guess.
   */
  readonly failureOrigin?: "CANONICAL_WORK_VALIDATION" | "UNKNOWN_SOURCE_STAGE" | null | undefined;
  /** H1 §9.5: T0's own refusal kind, when the origin is `CANONICAL_WORK_VALIDATION`. */
  readonly failureKind?: string | null | undefined;
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
 * §5/§10: map a session read state onto the Preview's session lifecycle.
 *
 * An unsupported format or a corrupt session is `SESSION_UNREADABLE` — never "no events".
 *
 * §8: a READ_OK page whose binding is not verified is `SESSION_READ_NOT_ATTRIBUTED`. The read
 * happened; the events are not this attempt's, and the lifecycle says so.
 *
 * §5: a session that was IDENTIFIED (claimed) but never read is `SESSION_IDENTIFIED_NOT_READ` —
 * distinct from `NO_SESSION_BOUND`, because a caller did name one.
 */
export function sessionLifecycleOf(
  readState: SessionReadState | null,
  admission: SessionReadAdmission = "NOT_REQUESTED",
  identified = false,
  /**
   * H1 §7.4: an INVALID page is not a readable source. Its `readState` may be `READ_OK` while the
   * page contradicts itself, so the lifecycle must report `SESSION_UNREADABLE` rather than
   * `SESSION_READ`: a page that failed validation is not a trustworthy read.
   */
  pageInvalid = false,
): SessionLifecycle {
  if (readState === null) return identified ? "SESSION_IDENTIFIED_NOT_READ" : "NO_SESSION_BOUND";
  if (readState === "READ_CAPABILITY_ABSENT") return "SESSION_IDENTIFIED_NOT_READ";
  if (readState !== "READ_OK") return "SESSION_UNREADABLE";
  if (pageInvalid) return "SESSION_UNREADABLE";
  return admission === "ADMITTED_TO_ATTEMPT" ? "SESSION_READ" : "SESSION_READ_NOT_ATTRIBUTED";
}

/**
 * §8, corrected by H0 §9 — derive the Preview's completeness from what is actually present.
 *
 * `COMPLETE` requires the session read to be ATTRIBUTED to this attempt AND canonical result facts AND
 * project context AND — the H0 addition — FULL event-page coverage.
 *
 * H0 §9.1: V0S required only `SESSION_READ`, so an attributed read returning 50 events from a known
 * 200-event source still produced `COMPLETE`. A partial page is not complete coverage, and the Preview
 * must not imply it is. `eventPageCoverage` reports that dimension explicitly.
 */
export function previewCompletenessOf(input: {
  readonly sessionLifecycle: SessionLifecycle;
  readonly hasCanonicalResult: boolean;
  readonly hasProjectContext: boolean;
  /**
   * H0 §9.1: whether the attributed page covered the WHOLE known event range. Defaults to
   * `NOT_APPLICABLE`, which is correct when no attributed read happened at all.
   */
  readonly eventPageCoverage?: EventPageCoverage | undefined;
}): PreviewCompleteness {
  const coverage = input.eventPageCoverage ?? "NOT_APPLICABLE";
  if (input.sessionLifecycle === "SESSION_READ" && coverage === "FULL" && input.hasCanonicalResult && input.hasProjectContext) return "COMPLETE";
  if (input.hasCanonicalResult || input.hasProjectContext) return "PARTIAL";
  return "MINIMAL";
}

/**
 * H0 §9.1: how much of the attributed session's event log the Preview actually covers.
 *
 * The vocabulary and the derivation both live in `page_integrity.ts`, beside the structural validator
 * that produces them, so the dependency between the two modules runs one way.
 */
export { EVENT_PAGE_COVERAGE_STATES } from "./page_integrity.js";
export type { EventPageCoverage } from "./page_integrity.js";

/** §8: the four attribution dimensions, derived together so they stay consistent. */
function attributionOf(input: {
  readonly binding: AttemptExecutionBinding;
  readonly sessionPage: DshSessionEventPage | undefined;
  readonly host: PreviewHostObservationSummary;
  readonly canonical: PreviewCanonicalFacts;
  readonly projectEvolution: PreviewProjectEvolutionSummary;
  readonly eventPageCoverage: EventPageCoverage;
  readonly pageIntegrity: PageIntegrityState;
  readonly pageIntegrityReason: PageIntegrityReason | null;
}): PreviewAttribution {
  const canonicalCoverage = input.canonical.attemptState !== null || input.projectEvolution.projectionRootId !== null ? "PRESENT" : "ABSENT";

  /**
   * H0 §7: source readability follows what ACTUALLY happened. When no read was requested through this
   * path — which is the case for every caller claim while no binding producer exists — the honest value
   * is `NOT_REQUESTED`, never `UNREADABLE`: a source that was never asked anything is not unreadable.
   */
  let sourceReadability: PreviewAttribution["sourceReadability"];
  if (input.binding.sessionReadAdmission === "NOT_REQUESTED" && input.sessionPage === undefined) sourceReadability = "NOT_REQUESTED";
  else if (input.binding.claimedSessionId === null && input.binding.dshSessionId === null) sourceReadability = "NOT_REQUESTED";
  else if (input.sessionPage?.readState === "READ_CAPABILITY_ABSENT") sourceReadability = "NOT_COMPOSED";
  else if (input.sessionPage?.readState === "READ_OK") sourceReadability = "READABLE";
  else sourceReadability = "UNREADABLE";

  let sessionAttribution: PreviewAttribution["sessionAttribution"];
  if (input.binding.dshSessionId === null) sessionAttribution = "NO_SESSION";
  else if (input.binding.sessionBindingStatus === "BOUND_VERIFIED") sessionAttribution = "ATTRIBUTED";
  else sessionAttribution = "NOT_ATTRIBUTED";

  /**
   * H0 §8.3: process observation coverage is NOT implied by provenance. A caller declaration is at
   * most `PARTIAL`, because a declared record proves no actual host observation.
   *
   * H1 §9.3: and a producer-established observation is NOT automatically COMPLETE either. `COMPLETE`
   * now additionally requires that BOTH a spawn and an exit were actually observed; a producer that
   * saw only a Spawn reports `PARTIAL`, which is the F6 defect corrected.
   */
  let processObservation: PreviewAttribution["processObservation"];
  if (input.binding.hostObservationProvenance === "CONFLICTING_SOURCE") processObservation = "CONFLICTING";
  else if (input.binding.hostObservationProvenance === "NOT_OBSERVED") processObservation = "NOT_OBSERVED";
  else if (input.binding.hostObservationProvenance === "LOCAL_PORT_OBSERVATION") {
    processObservation = input.host.lifecycleCoverage === "SPAWN_AND_EXIT" ? "COMPLETE" : "PARTIAL";
  } else processObservation = "PARTIAL";

  return Object.freeze({
    canonicalCoverage,
    sourceReadability,
    sessionAttribution,
    processObservation,
    eventPageCoverage: input.eventPageCoverage,
    pageIntegrity: input.pageIntegrity,
    pageIntegrityReason: input.pageIntegrityReason,
    detail:
      `canonical=${canonicalCoverage}; source=${sourceReadability}; session=${sessionAttribution}; process=${processObservation}` +
      (input.pageIntegrity === "INVALID" ? `; page=INVALID (${String(input.pageIntegrityReason)})` : `; page=${input.pageIntegrity}`) +
      " — these are separate facts: a readable source is not an attributed session, and a local process observation is not a session identity",
  });
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
  readonly eventPageCoverage: EventPageCoverage;
  readonly pageIntegrity: PageIntegrityState;
  readonly pageIntegrityReason: PageIntegrityReason | null;
}): PreviewCaveats {
  const sourcesUnavailable: string[] = [];
  const contradictoryObservations: string[] = [];
  const epistemicLimits: string[] = [];

  /**
   * §5: the "no session" caveat follows the SESSION, not the binding state. An attempt can be
   * host-observed while having no DSH session at all, and that absence must be stated either way.
   */
  if (input.binding.dshSessionId === null && input.binding.claimedSessionId === null) {
    epistemicLimits.push(
      "No DSH session is bound to this attempt: no producer records an Attempt→Session relationship, so no session events are presented.",
    );
  }
  if (input.binding.claimedSessionId !== null && input.binding.dshSessionId === null) {
    epistemicLimits.push(
      "A DSH session id was CLAIMED by the caller but no producer establishes an Attempt→Session binding, so the session's events are not admitted to this attempt's execution history.",
    );
  }
  if (input.binding.hostObservationProvenance === "CONFLICTING_SOURCE") {
    contradictoryObservations.push(input.binding.detail);
  }
  if (input.binding.sessionBindingStatus === "SOURCE_UNAVAILABLE" || input.sessionPage?.readState === "READ_CAPABILITY_ABSENT") {
    sourcesUnavailable.push("The DSH session source could not be read; its absence is a missing source, not an empty history.");
  }
  if (input.binding.sessionBindingStatus === "CONFLICT") {
    contradictoryObservations.push(input.binding.detail);
  }
  if (input.binding.sessionBindingStatus === "SESSION_CLAIMED_UNVERIFIED") {
    /**
     * H0 §7.1: the caveat states what actually happened — a declaration was recorded and NO read was
     * performed — rather than claiming a header was checked or a source was unreadable.
     */
    epistemicLimits.push(
      "The session binding is UNVERIFIED: the caller supplied the id as a DECLARATION. No producer establishes an Attempt→Session relationship, so no session read was performed through this path and no header agreement is claimed.",
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
  if (input.sessionPage !== undefined && input.sessionPage.readState === "INVALID_REQUEST") {
    sourcesUnavailable.push("The session read request was refused because its cursor or page size was not a usable bounded request.");
  }
  if (input.sessionPage !== undefined && input.sessionPage.durabilityProvenance === "DURABILITY_UNRESOLVED" && input.sessionPage.events.length > 0) {
    epistemicLimits.push(
      "The persisted/synthetic boundary of the returned events could not be verified against the storage seam, so no event is asserted to have been durably stored.",
    );
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
  /**
   * H0 §9.1: coverage is stated when an attributed page is partial or unknown, and the live-session
   * limitation is stated whenever an attributed read happened at all.
   */
  if (input.eventPageCoverage === "PARTIAL") {
    epistemicLimits.push(
      "The attributed session page is PARTIAL: it returned fewer events than the source reports, so it is NOT complete execution-event coverage.",
    );
  }
  if (input.eventPageCoverage === "UNKNOWN") {
    epistemicLimits.push("The source reported no total event count, so the page's event coverage cannot be claimed.");
  }
  /**
   * H1 §7.4: an INVALID page is reported as a SOURCE contradiction, and the exact bounded reason is
   * named so an operator can act on it without re-deriving the page.
   */
  if (input.pageIntegrity === "INVALID") {
    contradictoryObservations.push(
      `The DSH session page is INVALID (${String(input.pageIntegrityReason)}): the page contradicts itself, so no event coverage is claimed and none of its events are admitted to this attempt's execution history.`,
    );
  }
  if (input.eventPageCoverage !== "NOT_APPLICABLE") {
    epistemicLimits.push(
      "A fully read event prefix is not proof that a live session has terminated or will never append more events.",
    );
  }
  if (input.sessionPage !== undefined && input.sessionPage.syntheticRecoveryEventCount !== null && input.sessionPage.syntheticRecoveryEventCount > 0) {
    epistemicLimits.push(
      "Synthetic recovery closers are present; they balance an interrupted tail and are NOT evidence that the original execution completed successfully.",
    );
  }

  return Object.freeze({
    sourcesUnavailable: Object.freeze([...new Set(sourcesUnavailable)]),
    missingSession: input.binding.dshSessionId === null,
    /**
     * H0 §9.2: derived from the STRUCTURED basis completeness, never by scanning caveat text. A basis
     * that is not globally COMPLETE means the Work cut and the cross-owner reads are not one atomic
     * snapshot, which is exactly what "stale basis" names.
     */
    staleBasis: input.projectEvolution.basisCompleteness !== undefined && input.projectEvolution.basisCompleteness !== null && input.projectEvolution.basisCompleteness !== "COMPLETE",
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
  /**
   * H1 §7: coverage is derived from a STRUCTURAL validation of the page, not from two numbers. An
   * INVALID page yields `NOT_APPLICABLE`, so it can never claim FULL and can never complete a Handoff.
   */
  const pageIntegrity = validateSessionEventPage({
    page: input.sessionPage,
    admitted: input.binding.sessionReadAdmission === "ADMITTED_TO_ATTEMPT",
    expectedSessionId: input.binding.dshSessionId,
  });
  /**
   * §7.4 FAIL CLOSED: an INVALID page contributes NO events to the execution view, cannot complete the
   * Handoff and is not reported as a readable session. The canonical Work facts are untouched — a
   * malformed Session page is not a Work failure, and the Preview must not fabricate one.
   */
  const pageRefused = pageIntegrity.state === "INVALID";

  /**
   * P2-C §8.5: THE CROSS-FIELD ADMISSION INVARIANTS. A binding whose fields contradict one another must
   * never expose events, regardless of the admission flag. The canonical case the F11 falsifier
   * reproduces is `SESSION_CLAIMED_UNVERIFIED` + `dshSessionId: null` + `ADMITTED_TO_ATTEMPT`, which the
   * preview now refuses rather than presenting the page's events.
   */
  const admissionInvariants = validateAdmissionInvariants({
    binding: input.binding,
    ...(input.sessionPage === undefined ? {} : { page: input.sessionPage }),
  });
  const invariantsRefused = !admissionInvariants.admissible;

  const identified = input.binding.claimedSessionId !== null || input.binding.dshSessionId !== null;
  const sessionLifecycle = sessionLifecycleOf(input.sessionPage?.readState ?? null, input.binding.sessionReadAdmission, identified, pageRefused);
  const hasCanonicalResult = input.canonical.resultRefs.length > 0;
  const hasProjectContext = input.projectEvolution.projectionRootId !== null;

  const eventPageCoverage = pageIntegrity.coverage;

  const completeness = previewCompletenessOf({ sessionLifecycle, hasCanonicalResult, hasProjectContext, eventPageCoverage });
  const attribution = attributionOf({
    binding: input.binding,
    sessionPage: input.sessionPage,
    host: input.host,
    canonical: input.canonical,
    projectEvolution: input.projectEvolution,
    eventPageCoverage,
    pageIntegrity: pageIntegrity.state,
    pageIntegrityReason: pageIntegrity.reason,
  });

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

  /**
   * §5/S-I4: events enter the execution view ONLY when the read is ADMITTED. An unattributed read
   * returns an empty view with a detail that says the events exist elsewhere and are not this
   * attempt's — never a silently populated history.
   *
   * H1 §7.4: an INVALID page is refused as well. A page that contradicts itself is not merely
   * downgraded to PARTIAL while its events are still exposed as trusted execution evidence.
   */
  const admitted = input.binding.sessionReadAdmission === "ADMITTED_TO_ATTEMPT" && !pageRefused && !invariantsRefused;
  const events = (admitted ? (input.sessionPage?.events ?? []) : []).map((event) =>
    Object.freeze({
      sessionId: event.sessionId,
      seq: event.seq,
      type: event.type,
      inherited: event.inherited,
      durability: event.durability,
      summary: event.summary,
      observedStatus: event.observedStatus,
    }),
  );

  const execution: PreviewExecutionEvidence = Object.freeze({
    sessionBindingStatus: input.binding.sessionBindingStatus,
    bindingSource: input.binding.sessionSource,
    bindingDetail: input.binding.detail,
    hostObservationProvenance: input.binding.hostObservationProvenance,
    hostObservationDetail: input.host.processDetail,
    sessionReadAdmission: input.binding.sessionReadAdmission,
    processLifecycle: input.host.processLifecycle,
    processDetail: input.host.processDetail,
    sessionLifecycle,
    sessionReadState: input.sessionPage?.readState ?? null,
    claimedSessionId: input.binding.claimedSessionId,
    dshSessionId: input.binding.dshSessionId,
    hostLocalJobId: input.binding.hostLocalJobId ?? input.host.hostLocalJobId,
    portInvocationId: input.binding.portInvocationId ?? input.host.portInvocationId,
    sourceEvidenceClass: input.sessionPage?.sourceEvidenceClass ?? null,
    sourceIdentity: input.sessionPage?.sourceIdentity ?? null,
    readWatermark: input.sessionPage?.throughSeq ?? null,
    requestedPageSize: input.sessionPage?.requestedMaxEvents ?? null,
    returnedPageSize: input.sessionPage?.returnedCount ?? null,
    events: Object.freeze(events),
    eventsDetail:
      input.sessionPage === undefined
        ? "no DSH session read was performed, so no events are presented — this is NOT evidence that no events occurred"
        : invariantsRefused
          ? `the binding's fields contradict one another (${String(admissionInvariants.reason)}), so its events are NOT admitted to this attempt's execution history`
          : pageRefused
            ? `the session page failed its integrity validation (${String(pageIntegrity.reason)}), so its events are NOT admitted to this attempt's execution history`
            : !admitted && input.sessionPage.events.length > 0
              ? `the session read returned ${String(input.sessionPage.returnedCount)} event(s), but no verified Attempt→Session binding exists, so they are NOT admitted to this attempt's execution history`
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
    /**
     * H1 §9.5: the failure origin is reported structurally. A canonical Work validation failure and an
     * unattributable projection failure are different facts and must not be collapsed into one caveat.
     */
    projectionFailureOrigin: input.projectEvolution.failureOrigin ?? null,
  });

  const caveats = caveatsOf({
    binding: input.binding,
    host: input.host,
    sessionPage: input.sessionPage,
    projectEvolution: input.projectEvolution,
    canonical: input.canonical,
    eventPageCoverage,
    pageIntegrity: pageIntegrity.state,
    pageIntegrityReason: pageIntegrity.reason,
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
      sessionBindingStatus: execution.sessionBindingStatus,
      bindingSource: execution.bindingSource,
      hostObservationProvenance: execution.hostObservationProvenance,
      sessionReadAdmission: execution.sessionReadAdmission,
      processLifecycle: execution.processLifecycle,
      sessionLifecycle: execution.sessionLifecycle,
      sessionReadState: execution.sessionReadState,
      claimedSessionId: execution.claimedSessionId,
      dshSessionId: execution.dshSessionId,
      hostLocalJobId: execution.hostLocalJobId,
      portInvocationId: execution.portInvocationId,
      events: execution.events,
    },
    canonical,
    projectContext,
    caveats,
    attribution,
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
    attribution,
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
