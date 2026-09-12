# G10-E0 — Coordination Store Decision

## 1. Options compared (§19)

| Option | Assessment |
| --- | --- |
| A. existing Work EventStore | Rejected: appending collaboration/participation/commitment events to the orchestration ledger would silently expand Work truth into CollaborationGraph truth and couple Work event-schema evolution to federation semantics. |
| B. **dedicated Palimpsest coordination store** | **CHOSEN** — a Palimpsest-owned, append-only semantic history store (SQLite, default `$DSH_HOME/palimpsest/coordination.sqlite`, `node:sqlite` like the other Palimpsest-owned stores), injected through a port. Participation / collaboration / commitment truth is Palimpsest semantic truth — clearly separated from the Work ledger and from Ordarium effect truth. |
| C. Ordarium state | Rejected: effect authority ≠ collaboration semantic ownership (same argument as the D0 continuity-store decision). |
| D. in-memory store | Rejected as canonical (§119-style honesty): the participation history must survive restart. |

## 2. One coordination truth (§20)

Exactly **one** canonical coordination/federation history store exists. The
Work EventStore, the continuity store, and the Ordarium effect ledger each own
their own truths and never duplicate coordination history. Derived views
(ThreadView, InboxView, active-commitment views) are projections, never a
second truth. Requirements carried into E1: append-only semantic history;
monotonic per-store event sequence; stable eventId; strict typed payload
parsers per event type; duplicate eventId byte-identical → idempotent,
different content → fail closed; restart-safe; cross-process concurrency
safe; malformed stored record → fail closed; no implicit delete.

## 3. Concern ≠ store (§32)

One physical coordination store is implementation consolidation ONLY:

```text
Participation ≠ Collaboration ≠ Commitment ≠ ContactNeed
```

remain distinct semantic concern domains with distinct event types and
distinct proofs — a shared store never merges them.
