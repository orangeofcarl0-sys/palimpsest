/**
 * G10-E3 PeerTransportPort — the host-neutral external transport seam (§64).
 * Outbound mutation only: `send` (and optional `wake`). Inbound content enters
 * through an explicitly trusted boundary (`InboundPeerEnvelope`, §69) whose
 * `authenticatedPeer` is what the ADAPTER asserts — not cryptographic
 * unforgeability unless the adapter guarantees it.
 *
 * The high-level service owns the configured `localPeer` (§65): outbound
 * `from` is DERIVED from it — callers choose `to`, never `from`. Every
 * outbound send/wake executes through Ordarium Safe Actions (§66); the port
 * is reachable only inside action `execute`.
 *
 * Idempotency (§67): the stable `messageId`/`wakeId` is the Ordarium (and
 * port) idempotency basis; exactly-once remote delivery is NOT assumed. The
 * crash boundary (§68) — remote delivered, local event not yet written, retry
 * — is handled by the stable messageId plus the reconciliation-safe,
 * idempotent event append; non-atomicity is documented honestly.
 */

import type { PeerMessage } from "./messages.js";
import type { PeerRef } from "./peer.js";

export interface PeerSendRequest {
  /** Stable idempotency basis — retrying the same message must not duplicate remote delivery. */
  readonly messageId: string;
  readonly from: PeerRef;
  readonly to: PeerRef;
  readonly threadId: string;
  readonly body: string;
}

export interface PeerSendResult {
  /** Transport-level acceptance/delivery. NEVER an ack, never agreement (§74). */
  readonly transportMessageId: string;
  readonly delivered: boolean;
}

export interface PeerWakeRequest {
  readonly wakeId: string;
  readonly from: PeerRef;
  readonly to: PeerRef;
}

export interface PeerWakeResult {
  /** Attention signal only — never an ack, never collaboration (§72/§73). */
  readonly signaled: boolean;
}

export interface PeerTransportPort {
  readonly adapterId: string;
  send(request: PeerSendRequest): Promise<PeerSendResult>;
  wake?(request: PeerWakeRequest): Promise<PeerWakeResult>;
}

export interface CallbackPeerTransportPortCallbacks {
  onSend(request: PeerSendRequest): Promise<PeerSendResult>;
  onWake?(request: PeerWakeRequest): Promise<PeerWakeResult>;
}

/** Production-usable callback adapter: the host integration IS the callbacks. */
export function callbackPeerTransportPort(
  adapterId: string,
  callbacks: CallbackPeerTransportPortCallbacks,
): PeerTransportPort {
  return {
    adapterId,
    send: (request) => callbacks.onSend(request),
    ...(callbacks.onWake === undefined ? {} : { wake: (request: PeerWakeRequest) => callbacks.onWake!(request) }),
  };
}

/**
 * Inbound trust boundary (§69/§70/§71): the transport adapter asserts the
 * sender identity (`authenticatedPeer`); when a protocol message encodes a
 * sender, it must MATCH the authenticated peer or the inbound record fails
 * closed. `authenticatedPeer: null` means the adapter cannot authenticate —
 * usable for plain unverified messages only, and NEVER sufficient to create
 * commitment/handoff acceptance later.
 */
export interface InboundPeerEnvelope {
  readonly transportMessageId: string;
  readonly authenticatedPeer: PeerRef | null;
  readonly message: PeerMessage;
}

export class PeerTransportError extends Error {
  constructor(
    readonly kind:
      | "sender_coherence_failed"
      | "transport_failed"
      | "wake_unsupported"
      | "message_unknown",
    message: string,
  ) {
    super(message);
    this.name = "PeerTransportError";
  }
}
