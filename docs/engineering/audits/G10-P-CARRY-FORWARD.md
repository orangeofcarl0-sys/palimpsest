# G10-P Carry-Forward Register

Mandatory input for the next stage. No `BLOCKER_IN_P`. New items P1 (`CF-P-01`, `CF-P-02`);
the rest are non-blocking with preserved concrete triggers. CF-O dispositions:
`G10-P-O-CARRY-FORWARD-DISPOSITION.md`.

## CF-P-01 — No ledger epoch binding to a transport cursor
- **Observed at:** `src/transport/ordarium_transport.ts` (`transport_epoch_mismatch`), `src/transport/cursor_store.ts`
- **Evidence:** Ordarium v1.3.1 binds no ledger UUID/epoch to a `StateChangeFeed` cursor. A consumer
  pointed at a *replaced* ledger fails closed when the cursor is ahead of the high-water, but a swap
  to a ledger with an equal-or-higher position is undetectable. An explicit operator `clear()` is the
  reset path. G10-P does not pretend to solve it.
- **Category:** RESILIENCE · **Trigger:** an Ordarium ledger epoch/identity primitive. · **Blocking:** NON_BLOCKING

## CF-P-02 — Durable boundary transport is submission-only
- **Observed at:** `src/transport/adapters.ts` (`durableBoundaryClient`)
- **Evidence:** G10-L's `FederatedBoundaryClient` is synchronous request/response (it needs the
  canonical home's basis in the reply). A fire-and-forget at-least-once substrate cannot honestly
  fabricate that reply, so remote peers only SUBMIT mutations and remote bound reads are refused.
  The canonical home answers reads locally.
- **Category:** PROTOCOL · **Trigger:** a durable correlated-reply protocol. · **Blocking:** NON_BLOCKING

## CF-P-03 — Inbound pump checkpoints per single change
- **Observed at:** `src/transport/pump.ts` (`limit: 1`)
- **Evidence:** the feed returns one opaque cursor per page, not per record, so exact
  checkpoint-after-each-ingest requires `limit: 1`. Batched paging needs a feed that exposes
  per-record positions (or a checkpoint derived from semantic idempotency). ·
  **Trigger:** Ordarium per-record positions. · **Blocking:** NON_BLOCKING (performance only)

## CF-P-04 — A poisoned envelope blocks its mailbox until operator action
- **Observed at:** `src/transport/pump.ts` (fail-closed before checkpoint)
- **Evidence:** a malformed/unknown-version envelope fails closed and is never silently skipped, so
  the mailbox does not advance past it. There is no quarantine/skip command yet.
- **Category:** OPS · **Trigger:** an operator quarantine command. · **Blocking:** NON_BLOCKING

## CF-P-05 — Attention delivered-set is in-memory
- **Observed at:** `src/attention/service.ts`
- **Evidence:** coalescing and the delivered set live in memory; a restart may re-signal an
  unresolved semantic fact. This is at-least-once attention by design (the underlying semantic state
  is the durable truth). Accepted-boundary marks ARE persisted. ·
  **Trigger:** a durable delivered-set requirement. · **Blocking:** NON_BLOCKING

## CF-P-06 — Escalation requires an explicit policy
- **Observed at:** `src/attention/service.ts` (`AttentionPolicy.escalate`)
- **Evidence:** `requiresUserAttention` defaults to false and is only set by an operator-supplied
  policy. No automatic inference of "authority missing / conflicting commitments / value decision"
  is implemented (that would invent semantics).
- **Category:** POLICY · **Trigger:** explicit escalation rules. · **Blocking:** NON_BLOCKING

## CF-P-07 — CF-O leftovers re-adjudicated
- CF-O-03 layout, CF-O-04/05 inspector depth, CF-O-07 multi-tenant identity, CF-O-08 evolution
  console, CF-O-09 host-side branch execution, CF-O-10 projection caching: STILL_DEFERRED_WITH_TRIGGER.
- CF-O-06: machine attention closed via StateChangeFeed; browser push still deferred.
- **Blocking:** NON_BLOCKING

## CF-P-08 — Dogfood is one OS process
- **Observed at:** `scripts/dogfood/live-federation.mjs`
- **Evidence:** two independent deployments over a real reopened SQLite ledger, but in one process.
  A true two-OS-process dogfood needs a host that launches two processes. ·
  **Trigger:** a multi-process host. · **Blocking:** NON_BLOCKING

## CF-P-09 — Transport authentication is an adapter assertion
- **Observed at:** `src/transport/ordarium_transport.ts`, `src/boundary_memory/transport.ts`
- **Evidence:** the sender identity is the local install's configured local peer, written to a local
  trusted ledger; there is no cryptographic peer identity/PKI. Wording is "authenticated as asserted
  by the adapter". **Trigger:** cryptographic peer identity. · **Blocking:** NON_BLOCKING

## CF-P-10 — Static peer discovery only
- **Observed at:** `src/deployment/launch.ts` (`deploymentPeerDirectory`)
- **Evidence:** the profile may list known peers; absent, the directory is honestly UNKNOWN. There is
  no dynamic peer registry/discovery. **Trigger:** a real peer registry. · **Blocking:** NON_BLOCKING

---
```text
No BLOCKER_IN_P. Next-stage candidates (spec §80): G10-Q Empirical Organization Evaluation
(now has real operational evidence) · Federated Boundary Operational Resilience ·
Multi-Institution Governance · ReasoningCell → Campaign/Evidence publication.
```
