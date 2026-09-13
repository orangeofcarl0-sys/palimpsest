# G10-E3 — Thread & Inbox Views

Both views are DERIVED from canonical coordination events — no second truth.

## ThreadView (§80/§59)

```ts
{ thread, messages: PeerMessage[], deliveredMessageIds, ackedMessageIds, wakes }
```

Built by replaying events and filtering by `threadId`: `MESSAGE_PREPARED`
(order preserved), `MESSAGE_DELIVERED` (only for messages in this thread),
`ACK_RECORDED` (by thread), `WAKE_SENT`. No thread row exists in the store
schema (proven) — a Thread is a projection, and after restart the projection
reproduces identically from events (E3-M14).

## InboxView (§81)

```ts
{ peer, received, unverified, wakes, acks }
```

Derived for one `PeerRef`: authenticated inbound messages (`received`),
unauthenticated inbound messages (`unverified` — never merged into
`received`), wakes addressed to the peer, and acks made by the peer. Not a
canonical store (§81); no inbox persistence exists.

## Replay guarantees

- Ordering: `seq` order (monotonic per store).
- Determinism: same events → same views (no clocks, no randomness in
  projection).
- Immutability: view arrays and message artifacts are deep-frozen.
- Non-promotion: `unverified` content stays labelled until a real
  authentication boundary says otherwise — it is never silently upgraded.
