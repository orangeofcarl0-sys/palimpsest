# G10-E1 — Coordination Store Record

## Ownership (E0 decision, implemented)

| Question | Answer |
| --- | --- |
| What truth does it own? | Coordination history: Invocation / Participation / (later: collaboration, commitment, handoff) events — Palimpsest semantic truth |
| What it does NOT own | Work/Attempt truth (EventStore), effect admission (Ordarium ledger), continuity identity (continuity store), runtime carrier identity (host) |
| Derived views | `participationsFor(attempt)`; later ThreadView/InboxView — projections only |
| Restart | replay from SQLite, byte-identical history (proven) |
| Conflict | same eventId different content → fail closed; byte-identical → idempotent (proven); malformed rows → fail closed (proven) |

## Event inventory (§148 preview)

| Event | Actor identity source | Target identity source | Idempotency | Semantic transition | Explicitly NOT |
| --- | --- | --- | --- | --- | --- |
| `INVOCATION_RECORDED` | ActivationRef (derived from actual Activation) | AttemptRef (validated against Work store) | derived eventId; byte-identical idempotent | an invitation now exists | acceptance, participation, commitment |
| `PARTICIPATION_STARTED` | ActivationRef | AttemptRef (must be non-terminal at start) | derived eventId | participation now exists | ownership, commitment, evidence |
| `PARTICIPATION_ENDED` | participationId (must exist in history) | — | derived eventId; end-twice idempotent | participation ended with a reason | Attempt outcome mutation |

## Storage review answers (§147 preview)

One canonical coordination store; Work EventStore, continuity store, and
Ordarium ledger own disjoint truths; restart behavior and conflict behavior
machine-proven; no overlapping canonical truth.
