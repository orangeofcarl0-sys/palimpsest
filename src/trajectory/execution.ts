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
 * owners produce four different ids, and V0 never collapses them:
 *
 *     Work AttemptId    canonical Work identity           (the Work owner; never minted here)
 *     HostJobId         ephemeral host-local job identity  (the delegation service; may vanish on restart)
 *     Port InvocationId one process-port invocation        (the worker port; per invocation)
 *     DSH SessionId     DSH-owned session identity         (DSH; never minted here)
 *
 * Their cardinality is NOT assumed. A Trajectory View ID is derived from `(projectId, attemptId)`
 * and is a read-model address, not an authority.
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
 * §3 — Binding states
 * ------------------------------------------------------------------ */

/**
 * §3: how well an Attempt is bound to a DSH Session.
 *
 * `BOUND_VERIFIED` is assigned ONLY when a real binding producer establishes the relationship. A
 * caller-supplied `dshSessionId` never reaches it: the strongest a caller's claim can earn is
 * `BOUND_LOCAL_ONLY`, and even that requires the header to agree.
 */
export const BINDING_STATES = [
  /** A real producer established the Attempt→Session relationship. */
  "BOUND_VERIFIED",
  /** A local, non-durable observation supports the binding; the producer is not canonical. */
  "BOUND_LOCAL_ONLY",
  /** No session is bound to this Attempt. The honest default. */
  "SESSION_UNBOUND",
  /** More than one candidate could satisfy the binding. */
  "AMBIGUOUS",
  /** A supplied identity contradicts the source (e.g. header mismatch). */
  "CONFLICT",
  /** A session was claimed but the source cannot be read. */
  "SOURCE_UNAVAILABLE",
] as const;
export type BindingState = (typeof BINDING_STATES)[number];

/** §3: where a session binding came from. Only a real producer can yield `BOUND_VERIFIED`. */
export const BINDING_SOURCES = [
  /** A durable Attempt-keyed binding record written by a real producer. NOT PRESENT IN V0. */
  "CANONICAL_ATTEMPT_BINDING",
  /** The host port observed the session it spawned. Local and non-durable. */
  "HOST_PORT_OBSERVATION",
  /** The caller supplied the id. Evidence of a REQUEST, not of a binding. */
  "CALLER_DECLARATION",
  /** No source exists. */
  "NONE",
] as const;
export type BindingSource = (typeof BINDING_SOURCES)[number];

/**
 * §3: the immutable DSH session header identity, as far as V0 reads it.
 *
 * `cwd` and `isSeeded` support a SCOPE CHECK — a session whose cwd is the Attempt's execution world
 * is plausibly that Attempt's session. But scope alone does not establish EXCLUSIVE ownership, so it
 * can never raise a binding above `BOUND_LOCAL_ONLY`.
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

/** §3: the execution identity and binding for one Work Attempt. */
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
  /** Positively established DSH session id, or null. */
  readonly dshSessionId: string | null;
  readonly sessionSource: BindingSource;
  readonly bindingStatus: BindingState;
  readonly bindingEvidenceRefs: readonly BindingEvidenceRef[];
  /** Why the binding holds the state it does. */
  readonly detail: string;
}

/**
 * §3: decide the binding state from the evidence actually present.
 *
 * The precedence is deliberately conservative:
 *
 *   1. a CONFLICT anywhere wins — a contradiction is never downgraded to "unbound";
 *   2. a canonical producer yields BOUND_VERIFIED;
 *   3. a local observation yields BOUND_LOCAL_ONLY (it may not claim verified);
 *   4. more than one candidate yields AMBIGUOUS;
 *   5. a claimed-but-unreadable session yields SOURCE_UNAVAILABLE;
 *   6. otherwise SESSION_UNBOUND.
 */
export function classifyBinding(input: {
  readonly claimedSessionId: string | null;
  readonly canonicalBindingPresent: boolean;
  readonly localObservationPresent: boolean;
  readonly candidateCount: number;
  readonly sourceReadable: boolean;
  readonly conflictDetail: string | null;
}): { readonly state: BindingState; readonly source: BindingSource; readonly detail: string } {
  if (input.conflictDetail !== null) {
    return Object.freeze({
      state: "CONFLICT" as const,
      source: input.canonicalBindingPresent ? ("CANONICAL_ATTEMPT_BINDING" as const) : ("CALLER_DECLARATION" as const),
      detail: input.conflictDetail,
    });
  }
  if (input.canonicalBindingPresent) {
    return Object.freeze({
      state: "BOUND_VERIFIED" as const,
      source: "CANONICAL_ATTEMPT_BINDING" as const,
      detail: "a durable Attempt-keyed binding record establishes this session for this attempt",
    });
  }
  if (input.claimedSessionId === null && !input.localObservationPresent) {
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
  if (!input.sourceReadable) {
    return Object.freeze({
      state: "SOURCE_UNAVAILABLE" as const,
      source: input.claimedSessionId !== null ? ("CALLER_DECLARATION" as const) : ("HOST_PORT_OBSERVATION" as const),
      detail: "a session was identified but its source could not be read",
    });
  }
  /**
   * §3: a caller-supplied id, or a local host observation, can never exceed BOUND_LOCAL_ONLY.
   * `BOUND_VERIFIED` is reserved for a real producer.
   */
  return Object.freeze({
    state: "BOUND_LOCAL_ONLY" as const,
    source: input.claimedSessionId !== null ? ("CALLER_DECLARATION" as const) : ("HOST_PORT_OBSERVATION" as const),
    detail:
      input.claimedSessionId !== null
        ? "the caller supplied this session id and its header agrees; a declaration is evidence of a request, not of a binding"
        : "a local host observation supports this binding, but no canonical producer confirms it",
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
  /** No read capability is composed at all. */
  "READ_CAPABILITY_ABSENT",
] as const;
export type SessionReadState = (typeof SESSION_READ_STATES)[number];

/** §4: one event reference. Its own SessionId and Session Seq — never merged into a global sequence. */
export interface DshEventReference {
  readonly sessionId: string;
  readonly seq: number;
  readonly type: string;
  /** Whether this event is inside the fork-inherited prefix, when the source reports the cut. */
  readonly inherited: boolean;
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
  /** The read watermark: the highest seq included in this page. */
  readonly throughSeq: number | null;
  /** The highest seq the source reports, independent of the page bound. */
  readonly knownEventCount: number | null;
  readonly inheritedEventCount: number | null;
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
  /** First seq to include (inclusive). Defaults to 0. */
  readonly fromSeq?: number | undefined;
  /** Maximum number of events to return. Defaults to 50. */
  readonly maxEvents?: number | undefined;
}

/** §4: the default small page size. */
export const DSH_READ_DEFAULT_PAGE = 50;

/**
 * §4: the narrow read-only port over DSH's own Session events.
 *
 * Every method is a read. There is no `append`, `create`, `resume`, `flush` or `activate` — a
 * Trajectory consumer cannot make a session live through this interface.
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
}

/* ------------------------------------------------------------------ *
 * §4 — Event vocabulary and sanitization
 * ------------------------------------------------------------------ */

/**
 * §4: the DSH event types V0 recognizes by name. Anything else stays opaque and is referenced by
 * exact SessionId/Seq rather than interpreted.
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
 */
export function sanitizeDshEvent(input: {
  readonly sessionId: string;
  readonly seq: number;
  readonly type: string;
  readonly time: number;
  readonly data: Record<string, unknown>;
  readonly inherited: boolean;
  readonly surface: string | null;
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
] as const);
