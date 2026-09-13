/**
 * G10-E3 collaboration message substrate — durable peer interaction without
 * confusing transport delivery, attention, acknowledgement, or truth.
 *
 * A `PeerMessage` is a durable collaboration record: `{messageId, thread,
 * from, to, kind: "message", body}`. Its body is NEVER Evidence (§63) — even
 * from a trusted sender. A `ThreadRef` is only a grouping identity; the
 * ThreadView is DERIVED from events (§60/§80) — never an independently
 * mutable conversation object, never a second canonical store.
 *
 * Events (§78), each with a strict typed parser:
 *   CONTACT_REQUESTED, MESSAGE_PREPARED, MESSAGE_DELIVERED, MESSAGE_RECEIVED,
 *   WAKE_SENT, ACK_RECORDED.
 *
 * F0 §23–§24: every parser validates the COMPLETE semantic artifact — exact
 * fields (nested unknown fields rejected), stable ids, enum literals, nested
 * PeerRef/ThreadRef artifacts — never an unchecked structural cast.
 *
 * Semantic firewalls: delivery ≠ ack (§74), wake ≠ ack (§73), ack ≠ agreement
 * (§76), conversation ≠ agreement (§77), collaboration event ≠ evidence (§82).
 */

import { isStableIdentifier } from "../schema/identifier.js";
import type { PeerRef } from "./peer.js";
import { parsePeerRef } from "./peer.js";
import type { CoordinationEventParsers } from "../coordination/store.js";
import { CoordinationStoreError } from "../coordination/errors.js";
import { requireBoolean, requireLiteral, requireSchemaVersion, requireStableId, requireString, strictObject } from "../coordination/strict.js";

export interface ThreadRef {
  readonly threadId: string;
}

export function materializeThreadRef(input: { readonly threadId: string }): ThreadRef {
  if (!isStableIdentifier(input.threadId)) {
    throw new CoordinationStoreError("threadId must be a stable identifier");
  }
  return Object.freeze({ threadId: input.threadId });
}

/** Strict ThreadRef artifact parser. */
export function parseThreadRef(raw: unknown, what = "thread"): ThreadRef {
  const record = strictObject(raw, { allowed: ["threadId"], required: ["threadId"] }, what);
  return Object.freeze({ threadId: requireStableId(record.threadId, `${what}.threadId`) });
}

/** A durable collaboration message. `body ≠ Evidence` — always (§63). */
export interface PeerMessage {
  readonly schemaVersion: 1;
  readonly messageId: string;
  readonly thread: ThreadRef;
  readonly from: PeerRef;
  readonly to: PeerRef;
  readonly kind: "message";
  readonly body: string;
}

export function materializePeerMessage(input: {
  readonly messageId: string;
  readonly thread: ThreadRef;
  readonly from: PeerRef;
  readonly to: PeerRef;
  readonly body: string;
}): PeerMessage {
  if (!isStableIdentifier(input.messageId)) {
    throw new CoordinationStoreError("messageId must be a stable identifier");
  }
  if (typeof input.body !== "string" || input.body.length === 0) {
    throw new CoordinationStoreError("message body must be a non-empty string");
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    messageId: input.messageId,
    thread: Object.freeze({ ...input.thread }),
    from: input.from,
    to: input.to,
    kind: "message" as const,
    body: input.body,
  });
}

const PEER_MESSAGE_KEYS = ["schemaVersion", "messageId", "thread", "from", "to", "kind", "body"] as const;

/** Strict PeerMessage artifact parser: exact fields, nested refs validated. */
export function parsePeerMessage(raw: unknown, what = "message"): PeerMessage {
  const record = strictObject(raw, { allowed: PEER_MESSAGE_KEYS, required: PEER_MESSAGE_KEYS }, what);
  requireSchemaVersion(record.schemaVersion, what);
  requireLiteral(record.kind, "message", `${what}.kind`);
  return Object.freeze({
    schemaVersion: 1 as const,
    messageId: requireStableId(record.messageId, `${what}.messageId`),
    thread: parseThreadRef(record.thread, `${what}.thread`),
    from: parsePeerRef(record.from),
    to: parsePeerRef(record.to),
    kind: "message" as const,
    body: requireString(record.body, `${what}.body`),
  });
}

export type ContactRequestedPayload = {
  readonly contactNeedId: string;
  readonly from: PeerRef;
  readonly to: PeerRef;
};

export type MessagePreparedPayload = { readonly message: PeerMessage };
export type MessageDeliveredPayload = { readonly messageId: string; readonly transportMessageId?: string };
export type MessageReceivedPayload = {
  readonly message: PeerMessage;
  /** §69/§71: whether the transport adapter authenticated the sender. */
  readonly authenticated: boolean;
};

export type WakeSentPayload = {
  readonly wakeId: string;
  readonly from: PeerRef;
  readonly to: PeerRef;
};

export type AckRecordedPayload = {
  readonly messageId: string;
  readonly by: PeerRef;
  readonly thread: ThreadRef;
};

/** Strict parsers for the federation event types (registered with the store). */
export const FEDERATION_EVENT_PARSERS: CoordinationEventParsers = Object.freeze({
  CONTACT_REQUESTED: (payload) => {
    const record = strictObject(
      payload,
      { allowed: ["contactNeedId", "from", "to"], required: ["contactNeedId", "from", "to"] },
      "CONTACT_REQUESTED",
    );
    return Object.freeze({
      contactNeedId: requireStableId(record.contactNeedId, "contactNeedId"),
      from: parsePeerRef(record.from),
      to: parsePeerRef(record.to),
    }) satisfies ContactRequestedPayload;
  },
  MESSAGE_PREPARED: (payload) => {
    const record = strictObject(payload, { allowed: ["message"], required: ["message"] }, "MESSAGE_PREPARED");
    return Object.freeze({ message: parsePeerMessage(record.message) }) satisfies MessagePreparedPayload;
  },
  MESSAGE_DELIVERED: (payload) => {
    const record = strictObject(
      payload,
      { allowed: ["messageId", "transportMessageId"], required: ["messageId"] },
      "MESSAGE_DELIVERED",
    );
    const transportMessageId = record.transportMessageId;
    return Object.freeze({
      messageId: requireStableId(record.messageId, "messageId"),
      ...(transportMessageId === undefined
        ? {}
        : { transportMessageId: requireString(transportMessageId, "transportMessageId") }),
    }) satisfies MessageDeliveredPayload;
  },
  MESSAGE_RECEIVED: (payload) => {
    const record = strictObject(
      payload,
      { allowed: ["message", "authenticated"], required: ["message", "authenticated"] },
      "MESSAGE_RECEIVED",
    );
    return Object.freeze({
      message: parsePeerMessage(record.message),
      authenticated: requireBoolean(record.authenticated, "MESSAGE_RECEIVED.authenticated"),
    }) satisfies MessageReceivedPayload;
  },
  WAKE_SENT: (payload) => {
    const record = strictObject(
      payload,
      { allowed: ["wakeId", "from", "to"], required: ["wakeId", "from", "to"] },
      "WAKE_SENT",
    );
    return Object.freeze({
      wakeId: requireStableId(record.wakeId, "wakeId"),
      from: parsePeerRef(record.from),
      to: parsePeerRef(record.to),
    }) satisfies WakeSentPayload;
  },
  ACK_RECORDED: (payload) => {
    const record = strictObject(
      payload,
      { allowed: ["messageId", "by", "thread"], required: ["messageId", "by", "thread"] },
      "ACK_RECORDED",
    );
    return Object.freeze({
      messageId: requireStableId(record.messageId, "messageId"),
      by: parsePeerRef(record.by),
      thread: parseThreadRef(record.thread),
    }) satisfies AckRecordedPayload;
  },
});
