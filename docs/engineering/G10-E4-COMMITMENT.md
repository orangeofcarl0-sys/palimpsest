# G10-E4 — Commitment

Status: **G10-E4 · EXPLICIT PEER COMMITMENT · NO UNILATERAL COMMITMENT · NOT A FROZEN CONTRACT**

## Semantics (§86)

A Commitment is an explicitly ACCEPTED responsibility/obligation by a
PeerRef. It requires explicit acceptance; there is NO unilateral commitment
of another peer. `Assignment ≠ Commitment` (§87): Work/scheduler operations
produce no commitment (the service contains no Work/scheduler interaction).
`Commitment ≠ Work ownership` (§96): commitment changes no Task, scheduler,
or project authority, and mutates no WorkGraph.

## Shape and events

```ts
interface CommitmentOffer {
  commitmentId; proposer: PeerRef; proposedHolder: PeerRef;
  scope: {kind:"attempt_participation", attempt} | {kind:"contact_need", contactNeedId};
  termsDigest;   // canonical digest of typed terms (§90) — no arbitrary JSON
}
```

Events (strict parsers registered with the coordination store):
`COMMITMENT_OFFERED`, `COMMITMENT_ACCEPTED`, `COMMITMENT_REJECTED`,
`COMMITMENT_RELEASED`, `COMMITMENT_SUPERSEDED`.

## Lifecycle (§93/§160)

Derived from append-only events — never a mutable last-write-wins row:
`OFFERED → ACTIVE | REJECTED`, then `RELEASED` or `SUPERSEDED` (via handoff).
Acceptance rules: only the PROPOSED HOLDER may accept/reject; for a remote
holder the inbound identity must be AUTHENTICATED (§71/§91) — unauthenticated
input can NEVER activate a commitment. Self-commitment requires an explicit
local acceptance record (still never unilateral over another peer).
Rejection is a legitimate outcome — not a transport/runtime/Attempt failure
(§92). Release requires the current holder.

## Firewalls proven

Offer ≠ ACTIVE (E4-M04); third-party and unauthenticated acceptance refused
(E4-M05/M06); commitment payloads carry no participation/activation fields
(E4-M07); message/ack events create no commitment (E4-M02/M03, structural);
Work untouched (E4-M08, static audit).
