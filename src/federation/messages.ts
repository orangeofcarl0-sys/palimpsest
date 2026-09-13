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
 * Semantic firewalls: delivery ≠ ack (§74), wake ≠ ack (§73), ack ≠ agreement
 * (§76), conversation ≠ agreement (§77), collaboration event ≠ evidence (§82).
 */

import { isStableIdentifier } from "../schema/identifier.js";
import type { PeerRef } from "./peer.js";
import { materializePeerRef } from "./peer.js";
import type { CoordinationEventParsers } from "../coordination/store.js";
import { CoordinationStoreError } from "../coordination/store.js";

export interface ThreadRef {
  readonly threadId: string;
}

export function materializeThreadRef(input: { readonly threadId: string }): ThreadRef {
  if (!isStableIdentifier(input.threadId)) {
    throw new CoordinationStoreError("threadId must be a stable identifier");
  }
  return Object.freeze({ threadId: input.threadId });
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

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CoordinationStoreError(`malformed ${what} payload`);
  }
  return value as Record<string, unknown>;
}

function parseMessage(value: unknown, what: string): PeerMessage {
  const record = asRecord(value, what);
  const thread = asRecord(record.thread, `${what}.thread`);
  return materializePeerMessage({
    messageId: record.messageId as string,
    thread: materializeThreadRef({ threadId: thread.threadId as string }),
    from: materializePeerRef({ peerId: asRecord(record.from, `${what}.from`).peerId as string }),
    to: materializePeerRef({ peerId: asRecord(record.to, `${what}.to`).peerId as string }),
    body: record.body as string,
  });
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CoordinationStoreError(`${what} must be a non-empty string`);
  }
  return value;
}

function requirePeer(value: unknown, what: string): PeerRef {
  return materializePeerRef({ peerId: asRecord(value, what).peerId as string });
}

/** Strict parsers for the federation event types (registered with the store). */
export const FEDERATION_EVENT_PARSERS: CoordinationEventParsers = Object.freeze({
  CONTACT_REQUESTED: (payload) => {
    const record = asRecord(payload, "CONTACT_REQUESTED");
    return {
      contactNeedId: requireString(record.contactNeedId, "contactNeedId"),
      from: requirePeer(record.from, "from"),
      to: requirePeer(record.to, "to"),
    } satisfies ContactRequestedPayload;
  },
  MESSAGE_PREPARED: (payload) => {
    const record = asRecord(payload, "MESSAGE_PREPARED");
    return { message: parseMessage(record.message, "message") } satisfies MessagePreparedPayload;
  },
  MESSAGE_DELIVERED: (payload) => {
    const record = asRecord(payload, "MESSAGE_DELIVERED");
    return {
      messageId: requireString(record.messageId, "messageId"),
      ...(record.transportMessageId === undefined
        ? {}
        : { transportMessageId: requireString(record.transportMessageId, "transportMessageId") }),
    } satisfies MessageDeliveredPayload;
  },
  MESSAGE_RECEIVED: (payload) => {
    const record = asRecord(payload, "MESSAGE_RECEIVED");
    if (typeof record.authenticated !== "boolean") {
      throw new CoordinationStoreError("MESSAGE_RECEIVED.authenticated must be a boolean");
    }
    return {
      message: parseMessage(record.message, "message"),
      authenticated: record.authenticated,
    } satisfies MessageReceivedPayload;
  },
  WAKE_SENT: (payload) => {
    const record = asRecord(payload, "WAKE_SENT");
    return {
      wakeId: requireString(record.wakeId, "wakeId"),
      from: requirePeer(record.from, "from"),
      to: requirePeer(record.to, "to"),
    } satisfies WakeSentPayload;
  },
  ACK_RECORDED: (payload) => {
    const record = asRecord(payload, "ACK_RECORDED");
    return {
      messageId: requireString(record.messageId, "messageId"),
      by: requirePeer(record.by, "by"),
      thread: materializeThreadRef({ threadId: asRecord(record.thread, "thread").threadId as string }),
    } satisfies AckRecordedPayload;
  },
});
