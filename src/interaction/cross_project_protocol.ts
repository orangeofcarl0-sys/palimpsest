/**
 * UX-B §13/§14/§15/§16/§17/§63 — the STRICT, VERSIONED product envelope layer.
 *
 *   Envelope != CoordinationEvent        Envelope != TransportOperationKind
 *   Envelope != CanonicalStore           Answer != Evidence/Truth/Decision
 *   Oversize != Truncated                OneRequest != ExactlyOnce
 *
 * §13: this is the ONLY thing UX-B ever puts in an existing `PeerMessage.body`.
 * Federation still sees an ordinary `peer_message`; there is no new coordination
 * event type, no new transport operation kind and no new store. The kernel does
 * NOT bound `body` (audit SC-13), so the product maxima below are UX-B's own
 * responsibility: an oversize task/context/answer is REFUSED here, never silently
 * truncated on the wire.
 *
 * §16/SC-14 — the messageId decision, deliberately:
 *   The durable transport's `operationId` IS the `messageId`
 *   (`src/transport/pump.ts` builds the inbound `PeerMessage` with
 *   `messageId: envelope.operationId`), and `submit` fails closed with
 *   `transport_operation_conflict` when the same id already exists with DIFFERENT
 *   content (`src/transport/ordarium_transport.ts`). A `messageId` derived from
 *   `requestId` would therefore make a legitimate re-send of an EDITED request
 *   hard-fail at the transport, and would collapse two genuinely distinct sends
 *   into one. So UX-B KEEPS the kernel's random `messageId` (allocated by
 *   `FederationMessagingService.sendMessage`) and never derives it here.
 *   Correlation is `requestId` INSIDE the body; §16 explicitly does NOT promise
 *   exactly-once user-request creation, so a re-sent Ask is a NEW message. The
 *   `requestId` is stable for one logical Ask, which is what `status()` derives
 *   over.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier } from "../schema/identifier.js";

/* ------------------------------------------------------------------ *
 * Vocabulary (§14/§15)
 * ------------------------------------------------------------------ */

export const CROSS_PROJECT_PROTOCOL_SCHEMA_VERSION = 1 as const;
export const PROJECT_ASK_KIND = "PROJECT_ASK";
export const PROJECT_ANSWER_KIND = "PROJECT_ANSWER";
export const CROSS_PROJECT_MESSAGE_KINDS = [PROJECT_ASK_KIND, PROJECT_ANSWER_KIND] as const;
export type CrossProjectMessageKind = (typeof CROSS_PROJECT_MESSAGE_KINDS)[number];

export const PROJECT_ANSWER_STATUSES = ["ANSWERED", "PARTIAL", "DECLINED", "ERROR"] as const;
export type ProjectAnswerStatus = (typeof PROJECT_ANSWER_STATUSES)[number];

/**
 * §63: explicit PRODUCT maxima. Chosen to be far above a real question and far
 * below anything that would let a packet smuggle a workspace dump.
 */
export const CROSS_PROJECT_MAX_TASK_CHARS = 4_000;
export const CROSS_PROJECT_MAX_CONTEXT_TEXT_CHARS = 8_000;
export const CROSS_PROJECT_MAX_ANSWER_CHARS = 8_000;
export const CROSS_PROJECT_MAX_DETAIL_CHARS = 2_000;
/** The maximum serialized `PeerMessage.body` this protocol will ever produce. */
export const CROSS_PROJECT_MAX_BODY_BYTES = 32_768;

export const CROSS_PROJECT_PROTOCOL_DOMAIN = "palimpsest.interaction.cross-project-protocol.v1";

/* ------------------------------------------------------------------ *
 * Typed refusal
 * ------------------------------------------------------------------ */

export const CROSS_PROJECT_PROTOCOL_ERROR_REASONS = [
  "malformed_envelope",
  "unknown_field",
  "missing_field",
  "invalid_value",
  "unknown_schema_version",
  "unknown_kind",
  "oversized",
  /** §14 (review M2): the envelope names a protocol this deployment does not speak. */
  "protocol_mismatch",
] as const;
export type CrossProjectProtocolErrorReason = (typeof CROSS_PROJECT_PROTOCOL_ERROR_REASONS)[number];

export class CrossProjectProtocolError extends Error {
  constructor(
    readonly reason: CrossProjectProtocolErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "CrossProjectProtocolError";
  }

  /** The name the shared HTTP error mapper reads; `oversized` stays a caller fault. */
  get kind(): CrossProjectProtocolErrorReason {
    return this.reason;
  }
}

function fail(reason: CrossProjectProtocolErrorReason, message: string): never {
  throw new CrossProjectProtocolError(reason, message);
}

/* ------------------------------------------------------------------ *
 * The schema digest (§14/§15 `protocolDigest`)
 * ------------------------------------------------------------------ */

/**
 * The normative schema description the digest binds. It is deliberately DATA, not
 * prose: a change to any field list, status set, schema version or maximum changes
 * the digest, so two deployments that disagree about the protocol can notice.
 */
const PROTOCOL_SCHEMA = Object.freeze({
  schemaVersion: CROSS_PROJECT_PROTOCOL_SCHEMA_VERSION,
  kinds: Object.freeze({
    PROJECT_ASK: Object.freeze([
      "schemaVersion",
      "kind",
      "requestId",
      "sourceProjectId",
      "targetProjectId",
      "task",
      "contextText",
      "protocolDigest",
    ]),
    PROJECT_ANSWER: Object.freeze([
      "schemaVersion",
      "kind",
      "requestId",
      "sourceProjectId",
      "responderProjectId",
      "status",
      "answer",
      "detail",
      "protocolDigest",
    ]),
  }),
  answerStatuses: PROJECT_ANSWER_STATUSES,
  maxima: Object.freeze({
    taskChars: CROSS_PROJECT_MAX_TASK_CHARS,
    contextTextChars: CROSS_PROJECT_MAX_CONTEXT_TEXT_CHARS,
    answerChars: CROSS_PROJECT_MAX_ANSWER_CHARS,
    detailChars: CROSS_PROJECT_MAX_DETAIL_CHARS,
    bodyBytes: CROSS_PROJECT_MAX_BODY_BYTES,
  }),
});

/** The digest over the schema. Deterministic; nothing about it is per-installation. */
export function crossProjectProtocolDigest(): string {
  return canonicalDigest({ domain: CROSS_PROJECT_PROTOCOL_DOMAIN, schema: PROTOCOL_SCHEMA });
}

export const CROSS_PROJECT_PROTOCOL_DIGEST = crossProjectProtocolDigest();

/** A human/CI-readable description of the protocol, for docs and host guidance. */
export function crossProjectProtocolSchema(): unknown {
  return PROTOCOL_SCHEMA;
}

/* ------------------------------------------------------------------ *
 * Envelopes
 * ------------------------------------------------------------------ */

export interface ProjectAskEnvelope {
  readonly schemaVersion: 1;
  readonly kind: "PROJECT_ASK";
  readonly requestId: string;
  readonly sourceProjectId: string;
  readonly targetProjectId: string;
  readonly task: string;
  readonly contextText?: string | undefined;
  readonly protocolDigest: string;
}

export interface ProjectAnswerEnvelope {
  readonly schemaVersion: 1;
  readonly kind: "PROJECT_ANSWER";
  readonly requestId: string;
  readonly sourceProjectId: string;
  readonly responderProjectId: string;
  readonly status: ProjectAnswerStatus;
  readonly answer?: string | undefined;
  readonly detail?: string | undefined;
  readonly protocolDigest: string;
}

export type CrossProjectMessageEnvelope = ProjectAskEnvelope | ProjectAnswerEnvelope;

/* ------------------------------------------------------------------ *
 * Strict parsing (§14: unknown fields fail closed)
 * ------------------------------------------------------------------ */

const ASK_KEYS = PROTOCOL_SCHEMA.kinds.PROJECT_ASK;
const ANSWER_KEYS = PROTOCOL_SCHEMA.kinds.PROJECT_ANSWER;
/**
 * The REQUIRED subset. `contextText` (ask) is the only optional ask field, and for
 * an answer `answer`/`detail` are conditionally required by the status rule below
 * — so neither is listed here.
 */
const ASK_REQUIRED = [
  "schemaVersion",
  "kind",
  "requestId",
  "sourceProjectId",
  "targetProjectId",
  "task",
  "protocolDigest",
] as const;
const ANSWER_REQUIRED = [
  "schemaVersion",
  "kind",
  "requestId",
  "sourceProjectId",
  "responderProjectId",
  "status",
  "protocolDigest",
] as const;

function plainObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("malformed_envelope", `${what} must be an object`);
  }
  const prototype: unknown = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("malformed_envelope", `${what} must be a plain object`);
  }
  return raw as Record<string, unknown>;
}

/**
 * §14 (review M3): the key set is PER KIND. Accepting any key from either kind let a
 * PROJECT_ASK carry `status`/`answer` (silently dropped on rebuild, but §14 says unknown
 * fields fail closed) and vice versa.
 */
function exactKeys(object: Record<string, unknown>, what: string, allowed: readonly string[]): void {
  for (const key of Object.getOwnPropertyNames(object)) {
    if (!allowed.includes(key)) fail("unknown_field", `${what}: unknown field "${key}"`);
  }
}

function requireSchemaVersion(value: unknown, what: string): 1 {
  if (value !== CROSS_PROJECT_PROTOCOL_SCHEMA_VERSION) {
    fail(
      "unknown_schema_version",
      `${what}.schemaVersion must be ${CROSS_PROJECT_PROTOCOL_SCHEMA_VERSION} (received ${String(value)})`,
    );
  }
  return 1;
}

function requireStableId(value: unknown, what: string): string {
  if (typeof value !== "string" || !isStableIdentifier(value)) {
    fail("invalid_value", `${what} must be a stable identifier`);
  }
  return value;
}

function requireProjectId(value: unknown, what: string): string {
  // §12: a project id is NOT assumed to be a PeerRef, but it must still be a
  // canonical, addressable name so it cannot carry a path or a header.
  if (typeof value !== "string" || !isStableIdentifier(value)) {
    fail("invalid_value", `${what} must be a stable project id`);
  }
  return value;
}

function requireBoundedText(value: unknown, max: number, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail("invalid_value", `${what} must be a non-empty string`);
  }
  if ([...value].length > max) {
    fail("oversized", `${what} exceeds the ${max}-character product maximum (${[...value].length}); oversized is REFUSED, never truncated`);
  }
  return value;
}

/**
 * §14 (review M2): the digest is a VERIFIED protocol identity, not a shape check. A
 * packet whose digest is not this deployment's protocol is refused: the sender is
 * speaking a protocol we do not implement, and silently accepting it would make the
 * field decorative. This is deliberately fail-closed across protocol revisions — two
 * deployments must agree on the envelope before they exchange answers.
 */
function requireProtocolDigest(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    fail("invalid_value", `${what} must be a lowercase SHA-256 hex digest`);
  }
  if (value !== CROSS_PROJECT_PROTOCOL_DIGEST) {
    fail("protocol_mismatch", `${what} is not this deployment's cross-project protocol`);
  }
  return value;
}

function requireOwn(object: Record<string, unknown>, key: string, what: string): void {
  if (!Object.hasOwn(object, key) || object[key] === undefined) {
    fail("missing_field", `${what}: field "${key}" is required`);
  }
}

/** Strict parse of a `PROJECT_ASK` envelope. Every rule fails CLOSED. */
export function parseProjectAskEnvelope(raw: unknown, what = "ProjectAskEnvelope"): ProjectAskEnvelope {
  const object = plainObject(raw, what);
  exactKeys(object, what, ASK_KEYS);
  if (object.kind !== PROJECT_ASK_KIND) {
    fail("unknown_kind", `${what}.kind must be "${PROJECT_ASK_KIND}"`);
  }
  for (const key of ASK_REQUIRED) requireOwn(object, key, what);
  const contextText =
    object.contextText === undefined
      ? undefined
      : requireBoundedText(object.contextText, CROSS_PROJECT_MAX_CONTEXT_TEXT_CHARS, `${what}.contextText`);
  return Object.freeze({
    schemaVersion: requireSchemaVersion(object.schemaVersion, what),
    kind: PROJECT_ASK_KIND,
    requestId: requireStableId(object.requestId, `${what}.requestId`),
    sourceProjectId: requireProjectId(object.sourceProjectId, `${what}.sourceProjectId`),
    targetProjectId: requireProjectId(object.targetProjectId, `${what}.targetProjectId`),
    task: requireBoundedText(object.task, CROSS_PROJECT_MAX_TASK_CHARS, `${what}.task`),
    ...(contextText === undefined ? {} : { contextText }),
    protocolDigest: requireProtocolDigest(object.protocolDigest, `${what}.protocolDigest`),
  });
}

/** Strict parse of a `PROJECT_ANSWER` envelope. Every rule fails CLOSED. */
export function parseProjectAnswerEnvelope(raw: unknown, what = "ProjectAnswerEnvelope"): ProjectAnswerEnvelope {
  const object = plainObject(raw, what);
  exactKeys(object, what, ANSWER_KEYS);
  if (object.kind !== PROJECT_ANSWER_KIND) {
    fail("unknown_kind", `${what}.kind must be "${PROJECT_ANSWER_KIND}"`);
  }
  for (const key of ANSWER_REQUIRED) requireOwn(object, key, what);
  const status = object.status;
  if (typeof status !== "string" || !(PROJECT_ANSWER_STATUSES as readonly string[]).includes(status)) {
    fail("invalid_value", `${what}.status must be one of ${PROJECT_ANSWER_STATUSES.join(", ")}`);
  }
  const answer =
    object.answer === undefined ? undefined : requireBoundedText(object.answer, CROSS_PROJECT_MAX_ANSWER_CHARS, `${what}.answer`);
  const detail =
    object.detail === undefined ? undefined : requireBoundedText(object.detail, CROSS_PROJECT_MAX_DETAIL_CHARS, `${what}.detail`);
  if (status === "ANSWERED" && answer === undefined) {
    fail("missing_field", `${what}: an "ANSWERED" answer must carry the answer text`);
  }
  if (status !== "ANSWERED" && detail === undefined) {
    fail("missing_field", `${what}: a "${status}" answer must carry a detail explaining it`);
  }
  if ((status === "DECLINED" || status === "ERROR") && answer !== undefined) {
    // A refusal produced no answer; carrying one would let a refusal smuggle content.
    fail("invalid_value", `${what}: a "${status}" answer must not carry answer text`);
  }
  return Object.freeze({
    schemaVersion: requireSchemaVersion(object.schemaVersion, what),
    kind: PROJECT_ANSWER_KIND,
    requestId: requireStableId(object.requestId, `${what}.requestId`),
    sourceProjectId: requireProjectId(object.sourceProjectId, `${what}.sourceProjectId`),
    responderProjectId: requireProjectId(object.responderProjectId, `${what}.responderProjectId`),
    status: status as ProjectAnswerStatus,
    ...(answer === undefined ? {} : { answer }),
    ...(detail === undefined ? {} : { detail }),
    protocolDigest: requireProtocolDigest(object.protocolDigest, `${what}.protocolDigest`),
  });
}

/** Parse either envelope kind. An unknown kind fails closed. */
export function parseCrossProjectEnvelope(raw: unknown, what = "CrossProjectMessageEnvelope"): CrossProjectMessageEnvelope {
  const object = plainObject(raw, what);
  if (object.kind === PROJECT_ASK_KIND) return parseProjectAskEnvelope(object, what);
  if (object.kind === PROJECT_ANSWER_KIND) return parseProjectAnswerEnvelope(object, what);
  fail("unknown_kind", `${what}.kind must be one of ${CROSS_PROJECT_MESSAGE_KINDS.join(", ")}`);
}

/**
 * Parse a `PeerMessage.body`. A body that is not JSON, or is JSON but not this
 * protocol, is NOT an error the caller should crash on: it is `undefined`, which
 * every derivation treats as "not a cross-project message of ours". A body that
 * IS one of ours but malformed still fails closed, so a hostile packet can never
 * be half-read.
 */
export function parseCrossProjectBody(body: string, what = "PeerMessage.body"): CrossProjectMessageEnvelope | undefined {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) return undefined;
  const kind = (json as { readonly kind?: unknown }).kind;
  if (kind !== PROJECT_ASK_KIND && kind !== PROJECT_ANSWER_KIND) return undefined;
  return parseCrossProjectEnvelope(json, what);
}

/* ------------------------------------------------------------------ *
 * Materialization + serialization (§63 body bound)
 * ------------------------------------------------------------------ */

export function materializeProjectAskEnvelope(input: {
  readonly requestId: string;
  readonly sourceProjectId: string;
  readonly targetProjectId: string;
  readonly task: string;
  readonly contextText?: string | undefined;
}): ProjectAskEnvelope {
  const envelope: ProjectAskEnvelope = Object.freeze({
    schemaVersion: CROSS_PROJECT_PROTOCOL_SCHEMA_VERSION,
    kind: PROJECT_ASK_KIND,
    requestId: requireStableId(input.requestId, "requestId"),
    sourceProjectId: requireProjectId(input.sourceProjectId, "sourceProjectId"),
    targetProjectId: requireProjectId(input.targetProjectId, "targetProjectId"),
    task: requireBoundedText(input.task, CROSS_PROJECT_MAX_TASK_CHARS, "task"),
    ...(input.contextText === undefined
      ? {}
      : { contextText: requireBoundedText(input.contextText, CROSS_PROJECT_MAX_CONTEXT_TEXT_CHARS, "contextText") }),
    protocolDigest: CROSS_PROJECT_PROTOCOL_DIGEST,
  });
  // Round-trip through the strict parser so the materializer can never emit a shape
  // the parser would reject.
  return parseProjectAskEnvelope(envelope);
}

export function materializeProjectAnswerEnvelope(input: {
  readonly requestId: string;
  readonly sourceProjectId: string;
  readonly responderProjectId: string;
  readonly status: ProjectAnswerStatus;
  readonly answer?: string | undefined;
  readonly detail?: string | undefined;
}): ProjectAnswerEnvelope {
  const envelope: ProjectAnswerEnvelope = Object.freeze({
    schemaVersion: CROSS_PROJECT_PROTOCOL_SCHEMA_VERSION,
    kind: PROJECT_ANSWER_KIND,
    requestId: requireStableId(input.requestId, "requestId"),
    sourceProjectId: requireProjectId(input.sourceProjectId, "sourceProjectId"),
    responderProjectId: requireProjectId(input.responderProjectId, "responderProjectId"),
    status: input.status,
    ...(input.answer === undefined
      ? {}
      : { answer: requireBoundedText(input.answer, CROSS_PROJECT_MAX_ANSWER_CHARS, "answer") }),
    ...(input.detail === undefined ? {} : { detail: requireBoundedText(input.detail, CROSS_PROJECT_MAX_DETAIL_CHARS, "detail") }),
    protocolDigest: CROSS_PROJECT_PROTOCOL_DIGEST,
  });
  return parseProjectAnswerEnvelope(envelope);
}

function bodyBytesOf(body: string): number {
  return new TextEncoder().encode(body).length;
}

/**
 * §63: serialize, and REFUSE anything over the product maximum. There is no
 * truncation path in this module.
 */
export function serializeCrossProjectEnvelope(envelope: CrossProjectMessageEnvelope): string {
  const body = JSON.stringify(envelope);
  const bytes = bodyBytesOf(body);
  if (bytes > CROSS_PROJECT_MAX_BODY_BYTES) {
    fail(
      "oversized",
      `serialized cross-project body is ${bytes} bytes and exceeds the ${CROSS_PROJECT_MAX_BODY_BYTES}-byte product maximum; it is REFUSED, never truncated`,
    );
  }
  return body;
}

/* ------------------------------------------------------------------ *
 * Identity derivation (§16/§17)
 * ------------------------------------------------------------------ */

const REQUEST_ID_DOMAIN = `${CROSS_PROJECT_PROTOCOL_DOMAIN}.request-id`;

/**
 * §16: a deterministic `requestId` per logical Ask. Determinism is over the full
 * request content PLUS the caller's `nonce`; the service supplies a per-content
 * sequence as the nonce, so a repeated identical Ask is a NEW user request (a new
 * correlation id) while a re-derivation of the SAME pending Ask is stable.
 */
export function allocateCrossProjectRequestId(input: {
  readonly sourceProjectId: string;
  readonly targetProjectId: string;
  readonly task: string;
  readonly contextText?: string | undefined;
  readonly requestedBy: string;
  readonly nonce: string;
}): string {
  const digest = canonicalDigest({
    domain: REQUEST_ID_DOMAIN,
    sourceProjectId: input.sourceProjectId,
    targetProjectId: input.targetProjectId,
    task: input.task,
    contextText: input.contextText ?? null,
    requestedBy: input.requestedBy,
    nonce: input.nonce,
  });
  return `cpq-${digest.slice(0, 32)}`;
}

/**
 * §17: the thread id is DERIVED from the requestId under the EXISTING `ThreadRef`
 * grammar (`isStableIdentifier`), so all request/answer messages for one Ask share
 * exactly one thread — and a peer can verify the derivation rather than trusting
 * whichever thread an inbound message claims.
 */
export function threadIdForRequest(requestId: string): string {
  const id = requireStableId(requestId, "requestId");
  const threadId = `thr-${id}`;
  if (!isStableIdentifier(threadId)) {
    fail("invalid_value", `derived thread id is not a stable identifier for requestId "${id}"`);
  }
  return threadId;
}

/** The content identity of a terminal answer, used to collapse identical duplicates (§21). */
export function projectAnswerContentDigest(envelope: ProjectAnswerEnvelope): string {
  return canonicalDigest({
    domain: `${CROSS_PROJECT_PROTOCOL_DOMAIN}.answer-content`,
    requestId: envelope.requestId,
    sourceProjectId: envelope.sourceProjectId,
    responderProjectId: envelope.responderProjectId,
    status: envelope.status,
    answer: envelope.answer ?? null,
    detail: envelope.detail ?? null,
  });
}
