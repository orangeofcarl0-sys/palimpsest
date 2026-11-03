/**
 * Trajectory-V0 §3/§4 (V0-A / V0-B) — EXECUTION IDENTITY, the Attempt→Session BINDING contract,
 * and the narrow DSH SESSION READ PORT.
 *
 * The governing law of this file:
 *
 *     Trajectory does not own Work truth.
 *     Trajectory does not own the DSH Session event log.
 *
 * So nothing here mints an AttemptId, mints a SessionId, writes a Session, resumes an Agent or
 * decides settlement. It *addresses* an execution by its canonical Work identity, *binds* it to a
 * DSH Session only when real evidence supports that binding, and *reads* Session events through a
 * port that a supported first-party reader satisfies.
 *
 * The identity separation the ruling requires is structural, not conventional — four different
 * owners produce four different ids, and this module never collapses them:
 *
 *     Work AttemptId    canonical Work identity           (the Work owner; never minted here)
 *     HostJobId         ephemeral host-local job identity  (the delegation service; may vanish on restart)
 *     Port InvocationId one process-port invocation        (the worker port; per invocation)
 *     DSH SessionId     DSH-owned session identity         (DSH; never minted here)
 *
 * Trajectory-V0S §5 — THE THREE FACTS THAT V0 CONFLATED.
 *
 * V0 used ONE state (`BOUND_LOCAL_ONLY`) for two different situations: a real local Host process
 * observation with no session at all, and a caller-selected readable session. Those are different
 * facts and the corrected model keeps them apart as three independent dimensions:
 *
 *     HOST OBSERVATION PROVENANCE   what the host actually saw (may exist with NO session)
 *     SESSION BINDING               whether an Attempt→Session relationship was ESTABLISHED
 *     SESSION READ ADMISSION        whether a read was requested, succeeded, and was ADMITTED
 *
 * The invariant that makes the separation real rather than cosmetic: a session read is ADMITTED to
 * an Attempt's execution view ONLY when `sessionBindingStatus === "BOUND_VERIFIED"`. A caller's
 * claim, a matching header, a scope match and an adapter's self-declared evidence class are all
 * provenance metadata — none of them can raise a claim to a binding (S-I2).
 */
import { canonicalDigest } from "../schema/index.js";

/* ------------------------------------------------------------------ *
 * §3 — The stable consumer address
 * ------------------------------------------------------------------ */

/**
 * §3: the stable consumer address for one Attempt's trajectory.
 *
 * Deliberately `(projectId, attemptId)` and NOT T0's `rootId`: T0's root identity includes an
 * `asOfSequence`, which makes it a *projection snapshot* identity. Reusing it as a permanent
 * project trajectory ID would silently change meaning when the cut moved.
 */
export function trajectoryViewIdOf(input: { readonly projectId: string; readonly attemptId: string }): string {
  return `tv-${canonicalDigest({
    domain: "palimpsest.trajectory.view.v1",
    projectId: input.projectId,
    attemptId: input.attemptId,
  }).slice(0, 32)}`;
}

/* ------------------------------------------------------------------ *
 * §5 — Host observation provenance (SEPARATE from session binding)
 * ------------------------------------------------------------------ */

/**
 * §5: where a HOST PROCESS OBSERVATION came from.
 *
 * This says nothing about any DSH Session. A real local spawn/exit observation is a fact about a
 * direct child process; it may exist while no session exists at all, and it never implies one.
 */
export const HOST_OBSERVATION_PROVENANCE_STATES = [
  /** A real local observation the host process made about its own direct child. */
  "LOCAL_PORT_OBSERVATION",
  /** The caller supplied the record. Evidence of a report, not of an origin. */
  "CALLER_DECLARATION",
  /** A record exists but its scope could not be tied to the requested attempt. */
  "UNVERIFIED_ORIGIN",
  /** A record was expected but the observation source is absent. */
  "SOURCE_UNAVAILABLE",
  /** The supplied record contradicts the requested attempt. */
  "CONFLICTING_SOURCE",
  /** No observation was supplied at all. */
  "NOT_OBSERVED",
] as const;
export type HostObservationProvenance = (typeof HOST_OBSERVATION_PROVENANCE_STATES)[number];

/* ------------------------------------------------------------------ *
 * §5 — Session binding (SEPARATE from host observation)
 * ------------------------------------------------------------------ */

/**
 * §5: whether an Attempt→DSH Session relationship was ESTABLISHED.
 *
 * `BOUND_VERIFIED` is assigned ONLY when a real binding producer establishes the relationship.
 * No such producer exists in this deployment (see the V0S S2 audit), so it is unreachable today by
 * construction rather than by convention. A caller-supplied `dshSessionId` earns
 * `SESSION_CLAIMED_UNVERIFIED` — a distinct state that says "someone asked for this", never "this
 * attempt owns this session".
 */
export const SESSION_BINDING_STATES = [
  /** A real producer established the Attempt→Session relationship. UNREACHABLE without one. */
  "BOUND_VERIFIED",
  /** A session id was claimed but NO verified producer supports the relationship. */
  "SESSION_CLAIMED_UNVERIFIED",
  /** No session is bound to this Attempt. The honest default. */
  "SESSION_UNBOUND",
  /** More than one candidate could satisfy the binding. */
  "AMBIGUOUS",
  /** A supplied identity contradicts the source (e.g. header mismatch). */
  "CONFLICT",
  /** A session was claimed but the source cannot be read. */
  "SOURCE_UNAVAILABLE",
] as const;
export type SessionBindingState = (typeof SESSION_BINDING_STATES)[number];

/**
 * §5: where a session binding came from. Only a real producer can yield `BOUND_VERIFIED`.
 *
 * `evidenceClass` on a read adapter is PROVENANCE METADATA, not authorization: an adapter calling
 * itself `REAL_DSH_QUERY` cannot grant an Attempt ownership of a session (§8).
 */
export const BINDING_SOURCES = [
  /** A durable Attempt-keyed binding record written by a real producer. NOT PRESENT IN V0/V0S. */
  "CANONICAL_ATTEMPT_BINDING",
  /** The host port observed the session it spawned. Local and non-durable. NOT PRESENT IN V0S. */
  "HOST_PORT_OBSERVATION",
  /** The caller supplied the id. Evidence of a REQUEST, not of a binding. */
  "CALLER_DECLARATION",
  /** No source exists. */
  "NONE",
] as const;
export type BindingSource = (typeof BINDING_SOURCES)[number];

/* ------------------------------------------------------------------ *
 * §5 — Session read admission (SEPARATE from both above)
 * ------------------------------------------------------------------ */

/**
 * §5: whether a session read happened AND whether its events are admitted to the Attempt.
 *
 * A successful read of an unrelated session is `NOT_ADMITTED_TO_ATTEMPT`: the read is real, and its
 * events still do not belong to this attempt's execution history (S-I4).
 */
export const SESSION_READ_ADMISSION_STATES = [
  /** No read was requested (no session claimed, or the claim was refused before any read). */
  "NOT_REQUESTED",
  /** The read succeeded and the binding is verified, so its events are admitted. */
  "ADMITTED_TO_ATTEMPT",
  /** The read was attempted and failed. */
  "READ_FAILED",
  /** The read succeeded, but the binding is not verified, so its events are NOT admitted. */
  "NOT_ADMITTED_TO_ATTEMPT",
] as const;
export type SessionReadAdmission = (typeof SESSION_READ_ADMISSION_STATES)[number];

/**
 * §3: the immutable DSH session header identity, as far as this consumer reads it.
 *
 * `cwd` and `isSeeded` support a SCOPE CHECK — a session whose cwd is the Attempt's execution world
 * is plausibly that Attempt's session. But scope alone does not establish EXCLUSIVE ownership, and
 * it is NOT an Attempt→Session binding (S-I2).
 */
export interface DshSessionHeaderIdentity {
  readonly sessionId: string;
  readonly version: number;
  readonly createdAt: number;
  readonly cwd: string | null;
  readonly parentSession: string | null;
  readonly isSeeded: boolean;
  readonly origin: string | null;
  readonly delegationDepth: number | null;
}

/** §3: one piece of evidence supporting (or contradicting) a binding. */
export interface BindingEvidenceRef {
  readonly source: BindingSource;
  readonly detail: string;
  /** The exact values compared, so a reviewer re-checks the equality rather than trusting it. */
  readonly compared: Readonly<Record<string, string>>;
}

/** §3: the execution identity, the host-observation provenance and the session binding for one Attempt. */
export interface AttemptExecutionBinding {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly attemptId: string;
  readonly viewId: string;
  /** The attempt's historical authorization basis, when the Work owner supplies one. */
  readonly historicalWorkBasis: {
    readonly basisDigest: string | null;
    readonly capturedAtRevision: number | null;
    readonly taskId: string | null;
  };
  /** Genuinely known host-local job id, or null. Ephemeral — may vanish on restart. */
  readonly hostLocalJobId: string | null;
  /** Genuinely observed port invocation id, or null. */
  readonly portInvocationId: string | null;
  /**
   * §5: the POSITIVELY ESTABLISHED DSH session id, or null.
   *
   * Non-null ONLY when `sessionBindingStatus === "BOUND_VERIFIED"`. A claimed-but-unverified id is
   * recorded in `claimedSessionId`, never here, so no consumer can read a claim as a binding.
   */
  readonly dshSessionId: string | null;
  /** §5: the session id a caller supplied, recorded as a CLAIM. Never binding authority. */
  readonly claimedSessionId: string | null;
  /** §5: the host-observation provenance dimension. Independent of any session. */
  readonly hostObservationProvenance: HostObservationProvenance;
  readonly sessionSource: BindingSource;
  readonly sessionBindingStatus: SessionBindingState;
  readonly sessionReadAdmission: SessionReadAdmission;
  readonly bindingEvidenceRefs: readonly BindingEvidenceRef[];
  /** Why the binding holds the state it does. */
  readonly detail: string;
}

/**
 * §5: decide the SESSION BINDING state from the evidence actually present.
 *
 * The precedence is deliberately conservative:
 *
 *   1. a CONFLICT anywhere wins — a contradiction is never downgraded to "unbound";
 *   2. no claim at all yields SESSION_UNBOUND;
 *   3. more than one candidate yields AMBIGUOUS;
 *   4. a claim whose read was ATTEMPTED and failed yields SOURCE_UNAVAILABLE;
 *   5. a claim with no read attempt yields SESSION_CLAIMED_UNVERIFIED — never a binding.
 *
 * H0 §7.1: `readAttempted` is a separate input from `sourceReadable`, because "the source could not
 * be read" and "we never tried to read it" are different facts. Reporting an un-attempted read as
 * SOURCE_UNAVAILABLE would claim the source is broken when nothing was asked of it.
 *
 * ------------------------------------------------------------------ H1 §8.5 (C4)
 *
 * This function CANNOT return `BOUND_VERIFIED`. Its H0 `canonicalBindingPresent: boolean` input was
 * REMOVED: it authorized an arbitrary SessionId (that flag plus any claimed id produced
 * `BOUND_VERIFIED` for that id), and the composition derived the established id from the result. The
 * branch is deleted rather than guarded, because a classifier with no way to say "verified" cannot be
 * accidentally wired to one.
 *
 * Verification now lives ONLY in `resolveVerifiedSessionBinding` (`binding.ts`), which takes the
 * session id from producer-side association evidence and does not accept a caller claim at all.
 *
 * Note what is NOT an input: whether a host observation exists. A host observation is a different
 * fact and cannot move this state (§5 "No-session invariant").
 */
export function classifySessionBinding(input: {
  readonly claimedSessionId: string | null;
  readonly candidateCount: number;
  /** Whether a read was actually attempted through this path. */
  readonly readAttempted?: boolean | undefined;
  /** Whether an ATTEMPTED read succeeded. Meaningless when `readAttempted` is false. */
  readonly sourceReadable: boolean;
  readonly conflictDetail: string | null;
}): { readonly state: SessionBindingState; readonly source: BindingSource; readonly detail: string } {
  if (input.conflictDetail !== null) {
    return Object.freeze({
      state: "CONFLICT" as const,
      source: "CALLER_DECLARATION" as const,
      detail: input.conflictDetail,
    });
  }
  if (input.claimedSessionId === null) {
    return Object.freeze({
      state: "SESSION_UNBOUND" as const,
      source: "NONE" as const,
      detail: "no session is bound to this attempt and no source supplies one",
    });
  }
  if (input.candidateCount > 1) {
    return Object.freeze({
      state: "AMBIGUOUS" as const,
      source: "CALLER_DECLARATION" as const,
      detail: `${String(input.candidateCount)} sessions could satisfy this attempt, so none is selected`,
    });
  }
  /**
   * H0 §7.1: SOURCE_UNAVAILABLE is reserved for a read that was actually ATTEMPTED and failed. When
   * no read was attempted, the honest state is the unverified claim below.
   */
  if (input.readAttempted === true && !input.sourceReadable) {
    return Object.freeze({
      state: "SOURCE_UNAVAILABLE" as const,
      source: "CALLER_DECLARATION" as const,
      detail: "a session was claimed, a read was attempted, and its source could not be read",
    });
  }
  return Object.freeze({
    state: "SESSION_CLAIMED_UNVERIFIED" as const,
    source: "CALLER_DECLARATION" as const,
    detail:
      "the caller supplied this session id as a DECLARATION; a claim is evidence of a request, and this classifier has no authority to establish an Attempt→Session binding",
  });
}

/**
 * §5: decide the HOST OBSERVATION provenance from the evidence actually present.
 *
 * `attemptMatches` is the identity check: a record whose `attemptId` is not the requested attempt is
 * `CONFLICTING_SOURCE`, never silently dropped (§5 "HostRecord identity").
 *
 * H0 §8.2: the ordinary Attempt Preview receives the record FROM THE CALLER, and nothing in the
 * request proves a host component produced it. So a caller-supplied record is a
 * `CALLER_DECLARATION` — the honest classification — regardless of how many host-shaped identifiers it
 * carries. `LOCAL_PORT_OBSERVATION` is reserved for a record whose origin is established by a
 * supported, non-caller-controlled mechanism (`originEstablished`), which this Preview cannot supply.
 * A non-null HostJobId or InvocationId is NOT evidence of origin.
 */
export function classifyHostObservation(input: {
  readonly recordPresent: boolean;
  readonly attemptMatches: boolean;
  readonly hasLocalIdentity: boolean;
  /**
   * H0 §8.2: whether a supported producer established this record's origin. Defaults to false; a
   * caller cannot set it, because the ordinary Preview has no way to verify it.
   */
  readonly originEstablished?: boolean | undefined;
  readonly conflictDetail: string | null;
}): { readonly provenance: HostObservationProvenance; readonly detail: string } {
  if (input.conflictDetail !== null) {
    return Object.freeze({ provenance: "CONFLICTING_SOURCE" as const, detail: input.conflictDetail });
  }
  if (!input.recordPresent) {
    return Object.freeze({
      provenance: "NOT_OBSERVED" as const,
      detail: "no host observation was supplied for this attempt",
    });
  }
  if (!input.attemptMatches) {
    return Object.freeze({
      provenance: "UNVERIFIED_ORIGIN" as const,
      detail: "a host record was supplied but its attempt scope could not be tied to the requested attempt",
    });
  }
  /**
   * §8.2: only a producer-established origin earns LOCAL_PORT_OBSERVATION. Absent that, the record is
   * a caller declaration — its process facts are still reported, with the honest qualification.
   */
  if (input.originEstablished !== true) {
    return Object.freeze({
      provenance: "CALLER_DECLARATION" as const,
      detail: input.hasLocalIdentity
        ? "the caller supplied this record; its host job and invocation identifiers are caller testimony, and no producer established its origin"
        : "the caller supplied a record for this attempt that carries no host-local identity of its own",
    });
  }
  return Object.freeze({
    provenance: "LOCAL_PORT_OBSERVATION" as const,
    detail: "a producer-established local host observation supports this attempt's process lifecycle; it establishes no DSH session",
  });
}

/* ------------------------------------------------------------------ *
 * §4 — The DSH session read port
 * ------------------------------------------------------------------ */

/** §4: the read outcomes a DSH source can produce. An unsupported format is NEVER an empty stream. */
export const SESSION_READ_STATES = [
  "READ_OK",
  /** The session id is absent from the source. */
  "SESSION_MISSING",
  /** The stored record contradicts the requested identity. */
  "IDENTITY_CONFLICT",
  /** A durable record failed validation. */
  "CORRUPT_SESSION",
  /** The persistence backend could not be read. */
  "BACKEND_UNAVAILABLE",
  /** The stored format is not supported by the installed reader. */
  "FORMAT_UNSUPPORTED",
  /** A gap in the event sequence. */
  "EVENT_GAP",
  /** The observation is truncated or incomplete. */
  "TRUNCATED_OBSERVATION",
  /** The requested cursor or page size was not a usable bounded request. */
  "INVALID_REQUEST",
  /** No read capability is composed at all. */
  "READ_CAPABILITY_ABSENT",
] as const;
export type SessionReadState = (typeof SESSION_READ_STATES)[number];

/**
 * §9: the DURABILITY PROVENANCE of one returned event.
 *
 * DSH's cold read appends `interruptedTurnClosers(events)` to the stored prefix, so a returned event
 * is either something the writer actually persisted or something DSH synthesized in memory to
 * balance an interrupted turn. They are NOT the same fact and must not be reported as one.
 */
export const DSH_EVENT_DURABILITY_STATES = [
  /** The event was read from the session's stored prefix. */
  "PERSISTED_DSH_EVENT",
  /** DSH synthesized this closer in memory; it was never written by the original execution. */
  "SYNTHETIC_RECOVERY_EVENT",
  /** The persisted/synthetic boundary could not be verified against the storage seam. */
  "DURABILITY_UNRESOLVED",
] as const;
export type DshEventDurability = (typeof DSH_EVENT_DURABILITY_STATES)[number];

/** §4: one event reference. Its own SessionId and Session Seq — never merged into a global sequence. */
export interface DshEventReference {
  readonly sessionId: string;
  readonly seq: number;
  readonly type: string;
  /** Whether this event is inside the fork-inherited prefix, when the source reports the cut. */
  readonly inherited: boolean;
  /** §9: whether this event is stored or was synthesized for an interrupted tail. */
  readonly durability: DshEventDurability;
}

/**
 * §4: a bounded, sanitized event view.
 *
 * What it deliberately does NOT carry: raw prompts, hidden reasoning, full tool arguments,
 * environment variables, secrets or file contents. `summary` is a bounded, sanitized description.
 */
export interface DshEventView extends DshEventReference {
  /** Unix epoch milliseconds as the source recorded it. */
  readonly time: number;
  readonly surface: string | null;
  /** A bounded, sanitized summary — never the raw payload. */
  readonly summary: string;
  /** Duration only when the source actually recorded real timing. */
  readonly durationMs: number | null;
  /** The source's own status for this event, when it has one. */
  readonly observedStatus: string | null;
}

/** §4: one page of a session's events. */
export interface DshSessionEventPage {
  readonly schemaVersion: 1;
  readonly readState: SessionReadState;
  readonly sessionId: string | null;
  readonly header: DshSessionHeaderIdentity | null;
  /** The source identity this page was read from (a backend label or a fixture label). */
  readonly sourceIdentity: string;
  /** §8/§9: which reader produced this page. Provenance metadata, NOT authorization. */
  readonly sourceEvidenceClass: "REAL_DSH_QUERY" | "DSH_QUERY_PORT_FIXTURE";
  /** The read watermark: the highest seq included in this page. */
  readonly throughSeq: number | null;
  /** The highest seq the source reports, independent of the page bound. */
  readonly knownEventCount: number | null;
  readonly inheritedEventCount: number | null;
  /** §9: the cursor that was actually requested, so a reviewer sees what was asked for. */
  readonly requestedFromSeq: number;
  /** §9: the maximum that was actually requested, after validation. */
  readonly requestedMaxEvents: number;
  /** §9: how many events this page returned — distinct from `requestedMaxEvents`. */
  readonly returnedCount: number;
  /** §9: the RETURN is bounded. This does NOT mean the DISK IO was bounded. */
  readonly pageBounded: true;
  /** §9: whether the underlying read was itself bounded, or the whole log was read first. */
  readonly diskIoBounded: boolean;
  /** §9: whether the persisted/synthetic boundary was verified for this page. */
  readonly durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED" | "DURABILITY_UNRESOLVED";
  /** §9: events read from the stored prefix, when the boundary was verified. */
  readonly persistedEventCount: number | null;
  /** §9: synthetic in-memory closers, when the boundary was verified. */
  readonly syntheticRecoveryEventCount: number | null;
  readonly events: readonly DshEventView[];
  readonly knownParentSession: string | null;
  /** What this page proves, stated on the page itself. */
  readonly proves: readonly string[];
  /** What it explicitly does NOT prove. */
  readonly doesNotProve: readonly string[];
  readonly detail: string;
}

/** §4: a bounded read request. */
export interface DshSessionReadRequest {
  readonly sessionId: string;
  /** First seq to include (inclusive). Defaults to 0. Must be a non-negative safe integer. */
  readonly fromSeq?: number | undefined;
  /** Maximum number of events to return. Defaults to 50. Must be a positive safe integer. */
  readonly maxEvents?: number | undefined;
}

/** §4: the default small page size. */
export const DSH_READ_DEFAULT_PAGE = 50;

/** §9: the hard maximum page size. A request above it is refused rather than silently clamped. */
export const DSH_READ_MAX_PAGE = 200;

/**
 * §9: validate a bounded read request.
 *
 * A negative, fractional, non-finite or absent-bounds cursor is REFUSED, not coerced: silently
 * turning `-1` into `0` would let a caller believe it read a range it never addressed.
 */
export function validateReadRequest(request: DshSessionReadRequest): {
  readonly ok: boolean;
  readonly fromSeq: number;
  readonly maxEvents: number;
  readonly detail: string;
} {
  const rawFrom = request.fromSeq ?? 0;
  const rawMax = request.maxEvents ?? DSH_READ_DEFAULT_PAGE;
  if (!Number.isSafeInteger(rawFrom) || rawFrom < 0) {
    return Object.freeze({ ok: false, fromSeq: 0, maxEvents: 0, detail: `fromSeq must be a non-negative safe integer, received ${String(rawFrom)}` });
  }
  if (!Number.isSafeInteger(rawMax) || rawMax <= 0) {
    return Object.freeze({ ok: false, fromSeq: rawFrom, maxEvents: 0, detail: `maxEvents must be a positive safe integer, received ${String(rawMax)}` });
  }
  if (rawMax > DSH_READ_MAX_PAGE) {
    return Object.freeze({
      ok: false,
      fromSeq: rawFrom,
      maxEvents: rawMax,
      detail: `maxEvents ${String(rawMax)} exceeds the hard maximum of ${String(DSH_READ_MAX_PAGE)}`,
    });
  }
  return Object.freeze({ ok: true, fromSeq: rawFrom, maxEvents: rawMax, detail: `bounded read of at most ${String(rawMax)} events from seq ${String(rawFrom)}` });
}

/**
 * §4: the narrow read-only port over DSH's own Session events.
 *
 * Every method is a read. There is no `append`, `create`, `resume`, `flush` or `activate` — a
 * Trajectory consumer cannot make a session live through this interface.
 *
 * §6: this port is an OPERATOR/DIAGNOSTIC capability. It is deliberately NOT exposed on the
 * Attempt-scoped consumer service, because a `sessionId`-only read is not Attempt-scoped.
 */
export interface DshSessionReadPort {
  /** A label naming the backing reader, so evidence can state which reader was used. */
  readonly sourceIdentity: string;
  /** §4: whether this port is backed by a supported first-party reader or is a structural fixture. */
  readonly evidenceClass: "REAL_DSH_QUERY" | "DSH_QUERY_PORT_FIXTURE";
  /** Read one bounded page of a session's events. */
  readEvents(request: DshSessionReadRequest): Promise<DshSessionEventPage>;
  /** Read a session's immutable header identity, or report why it is unavailable. */
  readHeaderIdentity(sessionId: string): Promise<{
    readonly readState: SessionReadState;
    readonly header: DshSessionHeaderIdentity | null;
    readonly detail: string;
  }>;
  /** §9: release any resources this reader holds. Idempotent. */
  close?(): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * §4 — Event vocabulary and sanitization
 * ------------------------------------------------------------------ */

/**
 * §4: the DSH event types this consumer recognizes by name. Anything else stays opaque and is
 * referenced by exact SessionId/Seq rather than interpreted.
 */
export const RECOGNIZED_DSH_EVENT_TYPES = [
  "turn/start",
  "turn/end",
  "step/start",
  "step/end",
  "assistant/message",
  "assistant/attempt",
  "tool/call",
  "tool/result",
] as const;
export type RecognizedDshEventType = (typeof RECOGNIZED_DSH_EVENT_TYPES)[number];

const RECOGNIZED = new Set<string>(RECOGNIZED_DSH_EVENT_TYPES);

/**
 * §4: sanitize one raw DSH event into a bounded view.
 *
 * The rule is that the DEFAULT view never carries content. A recognized type contributes a
 * structural summary built from non-content fields; an unrecognized type contributes only its kind
 * and position. Nothing here reads `data.message`, `data.arguments` or any other content field.
 *
 * §9: `durability` defaults to `DURABILITY_UNRESOLVED`. A bare sanitize call has verified no
 * storage boundary, so claiming `PERSISTED_DSH_EVENT` here would be exactly the overclaim the
 * ruling forbids; the real reader supplies the class it actually proved.
 */
export function sanitizeDshEvent(input: {
  readonly sessionId: string;
  readonly seq: number;
  readonly type: string;
  readonly time: number;
  readonly data: Record<string, unknown>;
  readonly inherited: boolean;
  readonly surface: string | null;
  readonly durability?: DshEventDurability | undefined;
}): DshEventView {
  const { data } = input;
  const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

  let summary: string;
  let observedStatus: string | null = null;

  switch (input.type) {
    case "turn/start":
      summary = `turn ${String(num(data["turn"]) ?? "?")} opened`;
      break;
    case "turn/end":
      summary = `turn ${String(num(data["turn"]) ?? "?")} closed`;
      // A turn/end reason is a structural status, not content — and it is explicitly NOT a success signal.
      observedStatus = str((data["reason"] as { kind?: unknown } | undefined)?.kind) ?? "unknown";
      break;
    case "step/start":
      summary = `step ${String(num(data["step"]) ?? "?")} of turn ${String(num(data["turn"]) ?? "?")} opened`;
      break;
    case "step/end":
      summary = `step ${String(num(data["step"]) ?? "?")} of turn ${String(num(data["turn"]) ?? "?")} closed`;
      break;
    case "assistant/message":
      // §4: the CONTENT is deliberately absent. Only the structural position is reported.
      summary = `assistant message at turn ${String(num(data["turn"]) ?? "?")} step ${String(num(data["step"]) ?? "?")}`;
      break;
    case "assistant/attempt":
      summary = `assistant attempt at turn ${String(num(data["turn"]) ?? "?")}`;
      // A failed attempt is a status, and is never flattened into successful output.
      observedStatus = str(data["status"]) ?? (data["failure"] === undefined ? null : "failure");
      break;
    case "tool/call":
      // §4: the tool NAME is structural; its ARGUMENTS are content and are withheld.
      summary = `tool call ${String(str(data["name"]) ?? "unknown")} at step ${String(num(data["step"]) ?? "?")}`;
      break;
    case "tool/result":
      summary = `tool result at step ${String(num(data["step"]) ?? "?")}`;
      observedStatus = data["message"] === undefined ? "unknown" : "recorded";
      break;
    default:
      summary = RECOGNIZED.has(input.type) ? input.type : `unrecognized event kind ${input.type}`;
      break;
  }

  return Object.freeze({
    sessionId: input.sessionId,
    seq: input.seq,
    type: input.type,
    inherited: input.inherited,
    durability: input.durability ?? "DURABILITY_UNRESOLVED",
    time: input.time,
    surface: input.surface,
    summary,
    durationMs: null,
    observedStatus,
  });
}

/**
 * §4: what a session event page proves and what it does not.
 *
 * Stated on every page so a consumer cannot over-read it — the ruling is explicit that a `turn/end`
 * is not settlement and a `tool/call` without a result is not a success.
 */
export const DSH_PAGE_PROVES = Object.freeze([
  "these exact events exist in this session's own log, at these local sequence numbers",
  "the session's immutable header identity, when the source supplied it",
] as const);

export const DSH_PAGE_DOES_NOT_PROVE = Object.freeze([
  "that the Work Attempt settled, verified or promoted",
  "that a turn/end means the work succeeded — the turn may have aborted or blocked",
  "that a tool/call without a matching tool/result succeeded",
  "that a failed assistant/attempt produced valid output",
  "that the current model surface equals the complete raw execution history",
  "that no tool was called, merely because no tool/call event appears in this page",
  "that this session belongs to the requested Work Attempt (binding is a separate fact)",
  "that a synthetic recovery event was written by the original execution",
] as const);

/* ------------------------------------------------------------------ *
 * §4/§5 — Attempt admission refusal
 * ------------------------------------------------------------------ */

/**
 * §4/§5: the machine-readable refusals an Attempt-scoped consumer raises.
 *
 * These exist so a caller learns WHY an attempt was refused before any execution source was read,
 * instead of receiving a superficially valid Preview over an unverified identity.
 */
export const ATTEMPT_ADMISSION_REFUSAL_CODES = [
  /** No canonical ATTEMPT_CREATED event matches the requested id in the configured project. */
  "ATTEMPT_NOT_FOUND",
  /** The attempt's canonical creation event belongs to a different project. */
  "FOREIGN_ATTEMPT",
  /** The canonical Work record contradicts its own creation event or is unreadable. */
  "ATTEMPT_SOURCE_CONFLICT",
  /** A supplied host record names a different attempt than the requested one. */
  "HOST_RECORD_CONFLICT",
] as const;
export type AttemptAdmissionRefusalCode = (typeof ATTEMPT_ADMISSION_REFUSAL_CODES)[number];

/** §4/§5: a typed, machine-readable Attempt admission refusal. */
export class AttemptAdmissionRefusal extends Error {
  readonly code: AttemptAdmissionRefusalCode;
  constructor(code: AttemptAdmissionRefusalCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "AttemptAdmissionRefusal";
    this.code = code;
  }
}
