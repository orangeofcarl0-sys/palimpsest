# G10-P Live Federation — P0 Current-State Assessment

Baseline: `orangeofcarl0-sys/palimpsest` `main @ 74b0a90042f091544c36531e7cef5d1bac5b4135` (verified locally).
Ordarium baseline: pinned `v1.2.0`; **latest released is `v1.3.1`** (annotated tag peels to commit `073409b`,
"ORD-BOOT-0.1 StateChangeFeed boundary hardening"), which adds the durable revisioned `StateChangeFeed`.

This assessment is the mandatory preflight (§7/§8) and answers its twelve questions. No new ontology is
proposed; every conclusion below is a wiring/closure statement, not a semantic rebase.

---

## 1. What exact semantic pieces already exist (real production code)

| Area | Reality |
| --- | --- |
| `src/coordination/` | ONE canonical append-only coordination store (`SqliteCoordinationStore`), per-type strict parsers, `append` / `appendAtomic` (head-CAS) / `head` / `replay`, stable `eventId`, idempotent duplicate eventId, fail-closed conflicts. |
| `src/federation/` | `PeerRef` (address-free stable identity), messages (`PeerMessage.messageId`), threads, `InboxView`/`ThreadView` derived from the ONE store, commitments (OFFERED/ACTIVE/REJECTED/RELEASED/SUPERSEDED) with explicit holder-only acceptance, handoff, contact needs, directory observation, coalition/workforce views. |
| `src/boundary_memory/` | G10-K/L canonical Boundary Memory + `BoundaryCollaborationTransportPort`, `makeFederatedBoundaryClient`, `makeBoundaryHome` (home is the only ingest path for remote mutations), membership lineage, strict remote envelope. |
| `src/continuity/` | `PersistentPoint` identity + `SqlitePersistentPointStore`. |
| `src/runtime_scope/` | RuntimeScope/Holon; `associatePeer` + `SCOPE_PEER_ASSOCIATED`; peer can be bound to a scope. |
| `src/campaign/` | Explicit dormancy/wake/reconcile cycle (caller-driven), never a background waker. |
| `src/application/` | G10-O composed façade `PalimpsestApplicationSurface`, typed HTTP routes, projections (work/organization/collaboration/runtime/reasoning). |
| `src/install.ts` | `installPalimpsest` assembles every surface additively; advanced tools registered only when a surface exists; `installed.application` is the product façade. |

## 2. What is still only test-harness wiring

- `recordInboundMessage` (federation inbound) has **zero callers in `src/`** — a host must call it by hand.
- `PeerTransportPort` has **no production implementation**; only `callbackPeerTransportPort` plus test fake sinks.
- `PeerContinuityAssociation` is a declared type with **no store, no persistence, and no install wiring**;
  `ManpowerPointView.continuity` is therefore always absent (`continuityAssociations` is never supplied).
- A "full stack" install exists only in `test/o_application_surface.test.ts` and `e2e/multigraph.spec.ts`.
- The CLI `serve` path is Work-only (CF-O-02); `serveOrchestration({application})` is invoked only from e2e.

## 3. Concrete `PeerTransportPort` implementations that exist

Only `callbackPeerTransportPort` (`src/federation/transport.ts`) — a host-callback adapter, outbound
`send`/optional `wake`. No durable, no network, no mailbox implementation. Boundary Memory has an
`inProcessBoundaryTransportPort` (a separate semantic transport, not this one).

## 4. Is there any inbound pump?

**No.** There is no poller, subscription, listener, or `EventEmitter` in `src/federation/` or
`src/coordination/`. The only `setInterval` in `src/` is the TUI. Every wake path
(`wakePeer`, campaign `beginWake`) is an explicit caller call.

## 5. Is there any durable transport cursor?

**No.** `CoordinationStore` exposes `append`/`appendAtomic`/`head`/`replay` only — `replay()` returns all
history; there is no "since seq" read and no cursor table. Inbound idempotency is instead keyed on the
transport message id (`MESSAGE_RECEIVED.eventId = digest(transportMessageId)`), which gives at-least-once
dedupe but **not** a resumable position. The unrelated `projection_cursors` table in `src/state/event_store.ts`
is a Work projection schema cursor.

## 6. How is `PeerRef` ↔ `PersistentPoint` wired today?

**It is not.** `PeerContinuityAssociation {peer, point}` is declared in `src/federation/peer.ts`, but the only
consumer is the optional `WorkforceViewDeps.continuityAssociations`, which `makeFederationService` never
supplies. `SqlitePersistentPointStore` is real and durable (`$DSH_HOME/palimpsest/continuity.sqlite`) but is
consumed only by runtime observation/realization — `PeerRef` never enters it. No new identity is needed; the
association type already exists and only needs a deployment-level source plus install wiring.

## 7. Can CLI / host install the full application stack?

`installPalimpsest` **can**, but the CLI **cannot**: `cli.ts` builds a bare `EventStore` + `PalimpsestEffects`
+ `ProjectController` and calls `serveOrchestration(controller, {port,host,token})` with no `application`, no
profile loader, and no store construction for coordination/boundary/runtime-scope. There is no
`--profile`/config file. This is CF-O-02.

## 8. Does DSH expose a real wake/resume/activation primitive?

**Yes — public and documented.**
- `ctx.agents.resume({ resumeSessionId, ... })` restores a persisted session/agent.
- `agent.followup(message)` queues a turn and **wakes the driver**; `agent.inject` is the non-waking twin.
- `ctx.subagents.followup(parent, childId, ...)` wakes a waiting Activation or cold-resumes from a persisted
  Session; `ctx.subagents.startContinuable` / `reportFrom` / `interrupt` are the durable-child signal surface.

Evidence: `@deepseek-ai/dsh-agent` README/`lib/types/index.d.ts` (`resume`, `followup`), `@deepseek-ai/dsh-subagent`
README, and a real third-party plugin calling `agent.followup()` / `agents.resume()`
(`dsh-better-sidebar-v0.18.0/src/sidechat-routes.ts`). These are **host activation**, never semantic authority.

## 9. Does Pi expose one?

**Yes.** `pi.sendMessage(message, { deliverAs, triggerTurn: true })` / `pi.sendUserMessage(...)` start or queue
a turn (wake/enqueue); the Agent Hub can revive a parked agent. Evidence: `oh-my-pi` `docs/extensions.md`,
`docs/agent-hub.md`, `docs/sdk.md`.

## 10. What can be solved without changing Palimpsest semantics?

Essentially all of G10-P:
- a **deployment profile** (host binding only) + a full-stack CLI launch path;
- a **durable transport adapter** over Ordarium state + `StateChangeFeed` (mechanical at-least-once), with a
  **deployment-local cursor** and an **inbound pump** that strictly parses envelopes and calls the existing
  `federation.recordInboundMessage`;
- a **minimal deterministic attention policy** (semantic `AttentionSignal`, coalesced/deduped) and a separate
  **host activation adapter** (DSH/Pi-shaped port, host-injected);
- **commitment enumeration** (read-only) to close CF-O-01 and populate the collaboration projection;
- **PeerRef↔PersistentPoint** install wiring from the deployment profile.

No new canonical manager, no new identity species, no new truth store, no effect authority.

## 11. What absolutely requires Ordarium v1.3.1?

The durable, resumable, filter-independent **observation position**. `StateChangeFeed` is the only
mechanical primitive that yields "committed revisions after a durable cursor" with a validated page/cursor
contract and a `hasMore` progression. It is therefore the recommended inbound-notification substrate. It is
**not** a collaboration store: its records are read, strictly parsed into transport envelopes, and handed to
the Palimpsest federation service (which owns message meaning).

Contract extracted from the released v1.3.1 source (used verbatim by the conformance tests):
- `changes(filter?: {namespace?: string; limit?: number}, cursor?: string): Promise<StateChangePage>`;
- `StateChangePage = { changes: StateRecord[]; cursor: string; hasMore: boolean }` — `cursor` is always present
  and filter-independent; capability gate `ledger.capabilities.stateChangeFeed === true` via
  `supportsStateChangeFeed`;
- `limit` must be a safe integer `1..1000` (`maxStateChangePageItems`); absent uses the ledger default `100`;
  `limit=0`, negative, fractional, `NaN`, `Infinity`, unsafe or `>1000` throw `TypeError`;
- malformed / future cursor throws `InvalidCursorError` (future validated against the **global** high-water,
  not the namespace max); `cursor=0` is valid on an empty ledger, `cursor=1` is refused;
- `hasMore` is true when at least one further matching change already exists;
- on-disk schema v4 (`ordarium_state_changes(change_seq, namespace, key, revision)`), v3→v4 migration
  backfills historical revisions deterministically; a changed/replaced ledger lowers the high-water and a
  stale future cursor fails closed.

## 12. Which CF-O items are necessary for the dogfood golden path?

- **CF-O-01** (commitment enumeration) — required for honest collaboration-graph commitment edges and for
  reading "is there an open commitment requiring local decision". Close.
- **CF-O-02** (CLI full-stack launch) — required by §30/§65 for a reproducible live launch path. Close.
- **CF-O-06** (no push) — partially closed for machine attention via StateChangeFeed observation (§10); the
  browser debugger stays poll-based; no WebSocket/SSE.
- **CF-O-09** (reasoning branch execution host-side) — still deferred; not on the golden path.
- CF-O-03/04/05/07/08/10 — unrelated to live federation; re-adjudicated with preserved triggers.

---

## Architecture decision (P)

```
Host deployment profile (host binding only)
        │  localPeer · persistentPoint · repo · DB paths · transport namespace · attention adapter
        ▼
installPalimpsest (full stack, unchanged semantics)
   ├── federation service  ── outbound send/wake through Ordarium Safe Actions
   │        transportPort = OrdariumDurablePeerTransport
   │              writes envelope → shared transport ledger (Ordarium state, CAS, per-message subject)
   └── inbound pump (transport adapter, source-firewalled)
              StateChangeFeed(changes) ── "something changed" (mechanical, at-least-once)
                 → re-read exact StateRecord → STRICT envelope parser
                 → federation.recordInboundMessage (semantic ingest, idempotent on transportMessageId)
                 → deployment-local cursor checkpoint (NOT semantic identity)
   attention policy (deterministic, coalesced) → AttentionSignal
        ▼
host activation adapter (DSH resume/followup · Pi sendMessage) — Notification ≠ Activation
```

**Red lines held:** `TransportTruth ≠ CollaborationTruth`; `Notification ≠ Activation`;
`StateChangeFeed Event ≠ PeerMessage`; `PeerRef ≠ RuntimeAgentRef ≠ SessionRef`;
`Main Agent ≠ AuthorityRoot`; `AtLeastOnceDelivery ≠ DuplicateSemanticEvent`; deployment config is host
binding, never semantic authority. No `FederationManager`/`GlobalAgentManager`/`CrossProjectPlanner` is
introduced; the coordination structure stays peer-to-peer relations + dumb durable transport + local
attention decision + host activation.

## Carry-forward consequences to verify during P

1. **Ledger epoch limitation (§18):** v1.3.1 has no ledger UUID bound to the cursor. A consumer that is
   pointed at a *different* ledger file must **fail closed** (future cursor → `InvalidCursorError`) or require
   an explicit operator reset. This is recorded honestly and carried forward.
2. **Firewall:** outbound transport is the only path allowed to touch the transport ledger; the pump imports
   the federation service, not the coordination store; the attention adapter imports no canonical store or
   authority port.
3. **Compatibility:** Work-only install and the legacy `serve` face are unchanged; advanced routes appear only
   when a profile/`application` supplies them.
