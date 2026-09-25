/**
 * PLMP-LEAN-1 §D5-b1 — the ATTEMPT AUTHORIZATION RESOLVER: which envelope authorized THIS attempt.
 *
 *     Every Attempt proves its own authorization.
 *
 * The D5-b audit found a read-path defect that made rework impossible to express honestly. The WRITE model
 * was already correct and had been all along:
 *
 *     ATTEMPT_CREATED carries (task_id, envelope_id, attempt_no)     — an immutable canonical fact
 *     TASK_CREATED / TASK_REAUTHORIZED carry the full TaskEnvelope   — the authorization's own text
 *
 * so `A_0 → E_0` has always been recorded. What was wrong is how it was READ:
 *
 *     attempt  →  task_id  →  the task row's envelope column   ← the CURRENT envelope
 *
 * which returns whatever that task is authorized by NOW. For a task whose envelope has never moved the two
 * agree, which is why this went unnoticed; they diverge exactly when rework is what you want to do.
 *
 *     Attempt A_0 authorized by E_0 (history)   ≠   task T's current envelope
 *
 * THE FIX IS A READ MODEL, NOT A NEW FACT. The tempting alternative — copy the envelope into the attempt
 * row — would duplicate an authority that already exists in the Event Log, and then require proving the two
 * copies agree forever, plus a backfill whose only correct source is the very log being duplicated.
 * Palimpsest keeps the Event Log as canonical history and the SQL tables as projections; D5 rework is no
 * reason to invert that.
 *
 *     EventLog = authority
 *     AttemptAuthorizationResolver = canonical historical read
 *
 * NOTHING HERE IS DURABLE, and that is deliberate. There is no store: the resolver reads events and returns
 * an immutable value. If a future slice needs speed, an `attempt_authorization` projection may be added —
 * but it must be reconstructible from the Event Log in full, so it can never become a second authority.
 *
 * FAIL CLOSED ON EVERY AMBIGUITY. `AUTHORIZATION_NOT_FOUND` is returned, never a fallback to the current
 * task envelope. A record that cannot say which envelope authorized it is a corrupted history, and silently
 * substituting today's authority would be precisely the rewrite the audit measured.
 *
 * Layer: L1 (`src/state/`), beside the projector and the event store. Consumed by the Work owner and the
 * scheduler through the same function, so "which envelope authorized this attempt" has ONE definition.
 */
import type { TaskEnvelope } from "../schema/index.js";
import { parseTaskEnvelope } from "../schema/index.js";

/**
 * WHICH envelope authorized one attempt, and WHERE that claim comes from.
 *
 * Every field is a fact read from the log, so a consumer can point at the evidence rather than trust the
 * resolver: `createdEventId` is the event that asserted the binding, and `authorizationEventId` is the
 * event that supplied the envelope's text.
 */
export interface AttemptAuthorization {
  readonly projectId: string;
  readonly attemptId: string;
  readonly taskId: string;
  readonly envelopeId: string;
  readonly envelope: TaskEnvelope;
  /** The `ATTEMPT_CREATED` event that recorded `attempt → envelope_id`. */
  readonly createdEventId: number;
  /** The `TASK_CREATED` / `TASK_REAUTHORIZED` event that supplied this envelope. */
  readonly authorizationEventId: number;
}

/**
 * Why an authorization could not be resolved.
 *
 * One value per distinct corruption, because a caller that can only say "failed" cannot tell an operator
 * whether a history is damaged, truncated, or merely unknown. All of them refuse; none of them fall back.
 */
export const AUTHORIZATION_FAILURES = [
  /** No `ATTEMPT_CREATED` event names this attempt. */
  "ATTEMPT_NOT_RECORDED",
  /** The attempt's creation event predates the `envelope_id` field, so its binding was never recorded. */
  "BINDING_NOT_RECORDED",
  /** No task authorization event supplied this envelope id. */
  "AUTHORIZATION_NOT_FOUND",
  /** More than one task authorization event claims the same envelope id — a non-unique history. */
  "AUTHORIZATION_AMBIGUOUS",
  /** The authorization event's envelope disagrees with the id the attempt recorded. */
  "AUTHORIZATION_MISMATCH",
  /** The authorization event belongs to a different project or task than the attempt does. */
  "AUTHORIZATION_WRONG_SUBJECT",
] as const;
export type AuthorizationFailure = (typeof AUTHORIZATION_FAILURES)[number];

export type AuthorizationResolution =
  | { readonly state: "RESOLVED"; readonly authorization: AttemptAuthorization }
  | { readonly state: "UNRESOLVED"; readonly reason: AuthorizationFailure; readonly detail: string };

/** The minimal event shape this resolver reads. Structural, so it names no store implementation. */
export interface AuthorizationEventView {
  readonly eventId: number;
  readonly projectId: string;
  readonly eventType: string;
  readonly entityId: string;
  readonly payload: unknown;
}

/** The read this resolver needs: the project's events, in canonical order. */
export interface AuthorizationEventSource {
  listProjectEvents(projectId: string): readonly AuthorizationEventView[];
}

/**
 * Adapt a store's own event list into the view this resolver reads.
 *
 * A FUNCTION rather than a required method on the store, so the resolver stays usable over any event source
 * (a live store, a replay, a test fixture) and the store gains no opinion about authorization. The mapping
 * is field-for-field and adds nothing: `event_id` is already the canonical ordering, so the resolver needs
 * no sequence of its own.
 */
export function authorizationEventsFrom(
  list: (projectId: string) => readonly {
    readonly event_id: number;
    readonly project_id: string;
    readonly event_type: string;
    readonly entity_id: string;
    readonly payload: unknown;
  }[],
): AuthorizationEventSource {
  return Object.freeze({
    listProjectEvents(projectId: string): readonly AuthorizationEventView[] {
      return list(projectId).map((event) =>
        Object.freeze({
          eventId: event.event_id,
          projectId: event.project_id,
          eventType: event.event_type,
          entityId: event.entity_id,
          payload: event.payload,
        }),
      );
    },
  });
}

/** Resolve against a source, so a caller does not have to fetch the events itself. */
export function resolveAttemptAuthorizationFrom(input: {
  readonly source: AuthorizationEventSource;
  readonly projectId: string;
  readonly attemptId: string;
}): AuthorizationResolution {
  return resolveAttemptAuthorization({
    projectId: input.projectId,
    attemptId: input.attemptId,
    events: input.source.listProjectEvents(input.projectId),
  });
}

const ENVELOPE_BEARING_TASK_EVENTS: ReadonlySet<string> = new Set(["TASK_CREATED", "TASK_REAUTHORIZED"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Resolve which envelope authorized one attempt, from the canonical Event Log.
 *
 * PURE over the events it is handed: it writes nothing, caches nothing and reads no other table. That is
 * what makes it safe to call from the Work owner and the scheduler without either becoming a second source
 * of truth.
 *
 * THE AMBIGUITY RULE IS DELIBERATE. Two task-authorized envelopes sharing one `envelope_id` would make
 * "which envelope is E" unanswerable, so it is reported rather than resolved. Nothing in this file selects
 * a "latest" or a "first" candidate: picking one would be a guess dressed as a lookup, and a guess about
 * AUTHORIZATION is exactly what this project refuses.
 */
export function resolveAttemptAuthorization(input: {
  readonly projectId: string;
  readonly attemptId: string;
  readonly events: readonly AuthorizationEventView[];
}): AuthorizationResolution {
  const { projectId, attemptId, events } = input;

  const created = events.find(
    (event) => event.eventType === "ATTEMPT_CREATED" && event.entityId === attemptId && event.projectId === projectId,
  );
  if (created === undefined) {
    return {
      state: "UNRESOLVED",
      reason: "ATTEMPT_NOT_RECORDED",
      detail: `no ATTEMPT_CREATED event names attempt "${attemptId}" in project "${projectId}", so this attempt has no recorded authorization`,
    };
  }

  const createdPayload = asRecord(created.payload);
  const taskId = createdPayload?.task_id;
  const envelopeId = createdPayload?.envelope_id;
  /**
   * A creation event without a binding is reported as such rather than repaired from the current task
   * envelope. In the current schema this is unreachable — `ATTEMPT_CREATED`'s parser REQUIRES `envelope_id`
   * and the repository has exactly one baseline migration, so every attempt ever recorded carries it — which
   * is exactly why the guard is cheap to keep and worth keeping: it is the branch that would otherwise
   * become the silent fallback.
   */
  if (typeof taskId !== "string" || typeof envelopeId !== "string") {
    return {
      state: "UNRESOLVED",
      reason: "BINDING_NOT_RECORDED",
      detail: `attempt "${attemptId}" was recorded without a task/envelope binding, so which envelope authorized it was never captured and cannot be reconstructed without guessing`,
    };
  }

  /**
   * Find the task authorization events that carried this envelope.
   *
   * The id is the envelope's own identity, so a match is a proof rather than a resemblance — but the match
   * is still checked field by field below, because an event that CLAIMS the id while carrying a different
   * envelope is a corrupted record rather than a hit.
   */
  const candidates: { readonly event: AuthorizationEventView; readonly envelope: TaskEnvelope }[] = [];
  for (const event of events) {
    if (!ENVELOPE_BEARING_TASK_EVENTS.has(event.eventType)) continue;
    if (event.projectId !== projectId) continue;
    const payload = asRecord(event.payload);
    const raw = payload?.task_envelope;
    if (raw === undefined) continue;
    let envelope: TaskEnvelope;
    try {
      envelope = parseTaskEnvelope(raw);
    } catch {
      // An unreadable envelope is not a candidate; if it were the only one, the attempt is unresolvable,
      // which the caller learns from AUTHORIZATION_NOT_FOUND or MISMATCH rather than from a parse error.
      continue;
    }
    if (envelope.envelope_id !== envelopeId) continue;
    candidates.push({ event, envelope });
  }

  if (candidates.length === 0) {
    return {
      state: "UNRESOLVED",
      reason: "AUTHORIZATION_NOT_FOUND",
      detail: `attempt "${attemptId}" records envelope "${envelopeId}", but no TASK_CREATED or TASK_REAUTHORIZED event in this project supplies it — the attempt cites an authorization that does not exist, so nothing may be substituted for it`,
    };
  }
  if (candidates.length > 1) {
    return {
      state: "UNRESOLVED",
      reason: "AUTHORIZATION_AMBIGUOUS",
      detail: `${String(candidates.length)} task authorization events claim envelope "${envelopeId}" (event ids ${candidates.map((entry) => String(entry.event.eventId)).join(", ")}), so "which envelope is ${envelopeId}" has no single answer — this is a corrupted history, not a lookup to be ordered`,
    };
  }

  const hit = candidates[0]!;
  // The event must be about the SAME task and project the attempt is. A match on envelope id alone would
  // let a task's authorization be read as another task's.
  if (hit.envelope.task_id !== taskId || hit.envelope.project_id !== projectId || hit.event.entityId !== taskId) {
    return {
      state: "UNRESOLVED",
      reason: "AUTHORIZATION_WRONG_SUBJECT",
      detail: `attempt "${attemptId}" is bound to task "${taskId}", but envelope "${envelopeId}" was authorized for task "${hit.envelope.task_id}" — an authorization cannot be borrowed across subjects`,
    };
  }
  if (hit.envelope.envelope_id !== envelopeId) {
    return {
      state: "UNRESOLVED",
      reason: "AUTHORIZATION_MISMATCH",
      detail: `envelope "${envelopeId}" resolves to an envelope whose own id is "${hit.envelope.envelope_id}"`,
    };
  }

  return {
    state: "RESOLVED",
    authorization: Object.freeze({
      projectId,
      attemptId,
      taskId,
      envelopeId,
      envelope: hit.envelope,
      createdEventId: created.eventId,
      authorizationEventId: hit.event.eventId,
    }),
  };
}
