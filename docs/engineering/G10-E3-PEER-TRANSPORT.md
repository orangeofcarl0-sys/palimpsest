# G10-E3 — Peer Transport

## Port (§64)

```ts
interface PeerTransportPort {
  readonly adapterId: string;
  send(request: PeerSendRequest): Promise<PeerSendResult>;   // outbound mutation only
  wake?(request: PeerWakeRequest): Promise<PeerWakeResult>;
}
```

`PeerSendResult` = transport acceptance/delivery — **never an ack, never
agreement** (§74). `PeerWakeResult` = attention signal only (§72).
`callbackPeerTransportPort` is a production-usable adapter for embedding
hosts.

## Outbound identity (§65)

The service owns the configured `localPeer`; outbound `from` is DERIVED from
it. Callers choose `to` only — sender spoofing is structurally impossible
(E3-M01).

## Effect authority (§66/§146)

| Mutation | Action | Profile | Idempotency basis |
| --- | --- | --- | --- |
| message send | `palimpsest.federation.message.send` | `effects.idempotent()` | stable `messageId` (Ordarium dedupe proven: a re-invoked identical send did not re-call the port) |
| peer wake | `palimpsest.federation.wake` | `effects.idempotent()` | stable `wakeId` |

The port is reachable ONLY inside action `execute` (static audit, E3-M02).

## Inbound trust boundary (§69–§71)

`InboundPeerEnvelope {transportMessageId, authenticatedPeer: PeerRef | null,
message}`. `authenticatedPeer` is what the ADAPTER asserts — not
cryptographic unforgeability unless the adapter guarantees it. Sender
coherence: an authenticated peer that differs from the message's `from` fails
closed (E3-M05). Unauthenticated input is recorded with
`authenticated: false` and appears only in the inbox's `unverified` list
(E3-M06) — it can NEVER later create commitment/handoff acceptance (E4
enforces). Redelivery of the same transport message is idempotent (stable
transport identity in the derived eventId).

## Crash boundary (§68)

Remote delivered → crash → local delivery event missing → retry: the stable
messageId makes both the Ordarium operation and the event append idempotent,
so retries converge. Non-atomicity across remote/local is documented, not
hidden.
