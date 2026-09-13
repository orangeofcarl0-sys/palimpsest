/**
 * G10-E3 federation messaging service — durable collaboration over the
 * coordination store, with outbound effects admitted by Ordarium.
 *
 * - `sendMessage({to, threadId, body})`: the `from` peer is the configured
 *   LOCAL peer (§65 — callers cannot spoof the sender); MESSAGE_PREPARED is
 *   appended, the Ordarium send action executes with the stable messageId,
 *   and MESSAGE_DELIVERED records transport acceptance. Delivery ≠ ack.
 * - `wakePeer({to})`: WAKE_SENT + the Ordarium wake action. §73: NO ack, NO
 *   agreement, NO commitment is produced.
 * - `recordInboundMessage(envelope)`: §70 sender coherence — when the
 *   adapter authenticated a peer, the protocol message's `from` MUST match or
 *   the record fails closed; unauthenticated content is recorded with
 *   `authenticated: false` (§71) and can never later create
 *   commitment/handoff acceptance.
 * - `acknowledge({messageId, by})`: explicit only (§75) — never auto-ack on
 *   delivery; receipt/attention only, never agreement (§76).
 * - `threadView(threadId)` / `inboxView(peer)`: DERIVED from events only
 *   (§80/§81) — no second canonical store.
 */

import type { PalimpsestEffectsRuntime } from "../effects/index.js";
import { defineFederationEffects } from "../effects/federation_actions.js";
import type { CoordinationEvent, CoordinationStore } from "../coordination/store.js";
import {
  FEDERATION_EVENT_PARSERS,
  materializePeerMessage,
  materializeThreadRef,
} from "./messages.js";
import type {
  AckRecordedPayload,
  ContactRequestedPayload,
  MessageDeliveredPayload,
  MessagePreparedPayload,
  MessageReceivedPayload,
  PeerMessage,
  ThreadRef,
  WakeSentPayload,
} from "./messages.js";
import type { PeerRef } from "./peer.js";
import type { InboundPeerEnvelope, PeerTransportPort } from "./transport.js";
import { PeerTransportError } from "./transport.js";
import { canonicalDigest } from "../schema/canonical.js";

export const FEDERATION_SCOPE = "federation";

export interface FederationMessagingDeps {
  readonly effects: PalimpsestEffectsRuntime;
  readonly store: CoordinationStore;
  /** The one configured local peer identity — outbound `from` derives from it (§65). */
  readonly localPeer: PeerRef;
  readonly allocateMessageId: () => string;
  readonly allocateWakeId: () => string;
  /** The transport port, bound at assembly; reachable only inside Ordarium action execute (§66). */
  readonly transportPort: PeerTransportPort;
}

export interface ThreadView {
  readonly thread: ThreadRef;
  readonly messages: readonly PeerMessage[];
  readonly deliveredMessageIds: readonly string[];
  readonly ackedMessageIds: readonly string[];
  readonly wakes: readonly WakeSentPayload[];
}

export interface InboxView {
  readonly peer: PeerRef;
  readonly received: readonly PeerMessage[];
  readonly unverified: readonly PeerMessage[];
  readonly wakes: readonly WakeSentPayload[];
  readonly acks: readonly AckRecordedPayload[];
}

function eventIdFor(type: string, content: unknown): string {
  return canonicalDigest({ domain: "palimpsest.coordination-event.v1", type, scope: FEDERATION_SCOPE, content });
}

export interface FederationMessagingService {
  sendMessage(input: {
    readonly to: PeerRef;
    readonly threadId: string;
    readonly body: string;
  }): Promise<{ readonly message: PeerMessage; readonly delivered: boolean }>;
  wakePeer(input: { readonly to: PeerRef }): Promise<WakeSentPayload>;
  recordInboundMessage(envelope: InboundPeerEnvelope): Promise<MessageReceivedPayload>;
  acknowledge(input: {
    readonly message: PeerMessage;
  }): Promise<AckRecordedPayload>;
  requestContact(input: { readonly contactNeedId: string; readonly to: PeerRef }): Promise<ContactRequestedPayload>;
  threadView(threadId: string): Promise<ThreadView>;
  inboxView(peer: PeerRef): Promise<InboxView>;
}

export function makeFederationMessagingService(
  deps: FederationMessagingDeps,
): FederationMessagingService {
  const actions = defineFederationEffects(deps.transportPort);

  async function append(type: string, payload: unknown): Promise<void> {
    await deps.store.append({
      eventId: eventIdFor(type, payload),
      projectId: FEDERATION_SCOPE,
      type,
      payload,
    } as never);
  }

  async function sendMessage(input: {
    readonly to: PeerRef;
    readonly threadId: string;
    readonly body: string;
  }): Promise<{ readonly message: PeerMessage; readonly delivered: boolean }> {
    const message = materializePeerMessage({
      messageId: deps.allocateMessageId(),
      thread: materializeThreadRef({ threadId: input.threadId }),
      // §65: the sender is the configured local peer — never caller-supplied.
      from: deps.localPeer,
      to: input.to,
      body: input.body,
    });
    await append("MESSAGE_PREPARED", { message });
    let result: { transportMessageId: string; delivered: boolean };
    try {
      result = await deps.effects.invoke(
        actions.messageSend,
        {
          messageId: message.messageId,
          fromPeerId: message.from.peerId,
          toPeerId: message.to.peerId,
          threadId: input.threadId,
          body: input.body,
        },
        { scope: FEDERATION_SCOPE, callId: message.messageId, revision: 0 },
      );
    } catch (error) {
      throw new PeerTransportError(
        "transport_failed",
        error instanceof Error ? error.message : String(error),
      );
    }
    // §68: the delivery record is an idempotent event append — a retry after
    // a crash between remote delivery and this append converges (stable
    // messageId), and non-atomicity across remote/local is documented.
    await append("MESSAGE_DELIVERED", {
      messageId: message.messageId,
      transportMessageId: result.transportMessageId,
    });
    return { message, delivered: result.delivered };
  }

  async function wakePeer(input: { readonly to: PeerRef }): Promise<WakeSentPayload> {
    const payload: WakeSentPayload = {
      wakeId: deps.allocateWakeId(),
      from: deps.localPeer,
      to: input.to,
    };
    await append("WAKE_SENT", payload);
    try {
      await deps.effects.invoke(
        actions.peerWake,
        { wakeId: payload.wakeId, fromPeerId: payload.from.peerId, toPeerId: payload.to.peerId },
        { scope: FEDERATION_SCOPE, callId: payload.wakeId, revision: 0 },
      );
    } catch (error) {
      throw new PeerTransportError(
        "transport_failed",
        error instanceof Error ? error.message : String(error),
      );
    }
    // §73: attention only — no ack, no agreement, no commitment is created here.
    return payload;
  }

  async function recordInboundMessage(envelope: InboundPeerEnvelope): Promise<MessageReceivedPayload> {
    // §70: sender coherence — an authenticated sender must match the message's from.
    if (
      envelope.authenticatedPeer !== null &&
      envelope.authenticatedPeer.peerId !== envelope.message.from.peerId
    ) {
      throw new PeerTransportError(
        "sender_coherence_failed",
        `authenticated peer "${envelope.authenticatedPeer.peerId}" does not match message sender "${envelope.message.from.peerId}"`,
      );
    }
    const payload: MessageReceivedPayload = {
      message: envelope.message,
      authenticated: envelope.authenticatedPeer !== null,
    };
    // Idempotent on the TRANSPORT message identity: redelivery of the same
    // transport message must not duplicate history (§156-style).
    if (typeof envelope.transportMessageId !== "string" || envelope.transportMessageId.length === 0) {
      throw new PeerTransportError("transport_failed", "transportMessageId must be non-empty");
    }
    await deps.store.append({
      eventId: canonicalDigest({
        domain: "palimpsest.coordination-event.v1",
        type: "MESSAGE_RECEIVED",
        scope: FEDERATION_SCOPE,
        transportMessageId: envelope.transportMessageId,
      }),
      projectId: FEDERATION_SCOPE,
      type: "MESSAGE_RECEIVED",
      payload,
    } as never);
    return payload;
  }

  async function acknowledge(input: {
    readonly message: PeerMessage;
  }): Promise<AckRecordedPayload> {
    const payload: AckRecordedPayload = {
      messageId: input.message.messageId,
      by: deps.localPeer,
      thread: input.message.thread,
    };
    // §75: explicit acknowledgement only; receipt/attention only (§76).
    await append("ACK_RECORDED", payload);
    return payload;
  }

  async function requestContact(input: {
    readonly contactNeedId: string;
    readonly to: PeerRef;
  }): Promise<ContactRequestedPayload> {
    const payload: ContactRequestedPayload = {
      contactNeedId: input.contactNeedId,
      from: deps.localPeer,
      to: input.to,
    };
    await append("CONTACT_REQUESTED", payload);
    return payload;
  }

  async function threadView(threadId: string): Promise<ThreadView> {
    const history = await deps.store.replay();
    const messages: PeerMessage[] = [];
    const deliveredMessageIds: string[] = [];
    const ackedMessageIds: string[] = [];
    const wakes: WakeSentPayload[] = [];
    for (const event of history) {
      if (event.type === "MESSAGE_PREPARED") {
        const payload = event.payload as MessagePreparedPayload;
        if (payload.message.thread.threadId === threadId) messages.push(payload.message);
      } else if (event.type === "MESSAGE_DELIVERED") {
        const payload = event.payload as MessageDeliveredPayload;
        if (messages.some((message) => message.messageId === payload.messageId)) {
          deliveredMessageIds.push(payload.messageId);
        }
      } else if (event.type === "ACK_RECORDED") {
        const payload = event.payload as AckRecordedPayload;
        if (payload.thread.threadId === threadId) ackedMessageIds.push(payload.messageId);
      } else if (event.type === "WAKE_SENT") {
        const payload = event.payload as WakeSentPayload;
        wakes.push(payload);
      }
    }
    return Object.freeze({
      thread: materializeThreadRef({ threadId }),
      messages: Object.freeze(messages),
      deliveredMessageIds: Object.freeze(deliveredMessageIds),
      ackedMessageIds: Object.freeze(ackedMessageIds),
      wakes: Object.freeze(wakes),
    });
  }

  async function inboxView(peer: PeerRef): Promise<InboxView> {
    const history = await deps.store.replay();
    const received: PeerMessage[] = [];
    const unverified: PeerMessage[] = [];
    const wakes: WakeSentPayload[] = [];
    const acks: AckRecordedPayload[] = [];
    for (const event of history) {
      if (event.type === "MESSAGE_RECEIVED") {
        const payload = event.payload as MessageReceivedPayload;
        if (payload.message.to.peerId !== peer.peerId) continue;
        if (payload.authenticated) received.push(payload.message);
        else unverified.push(payload.message);
      } else if (event.type === "WAKE_SENT") {
        const payload = event.payload as WakeSentPayload;
        if (payload.to.peerId === peer.peerId) wakes.push(payload);
      } else if (event.type === "ACK_RECORDED") {
        const payload = event.payload as AckRecordedPayload;
        if (payload.by.peerId === peer.peerId) acks.push(payload);
      }
    }
    return Object.freeze({
      peer,
      received: Object.freeze(received),
      unverified: Object.freeze(unverified),
      wakes: Object.freeze(wakes),
      acks: Object.freeze(acks),
    });
  }

  return {
    sendMessage,
    wakePeer,
    recordInboundMessage,
    acknowledge,
    requestContact,
    threadView,
    inboxView,
  };
}

export { FEDERATION_EVENT_PARSERS };
export type { CoordinationEvent };
