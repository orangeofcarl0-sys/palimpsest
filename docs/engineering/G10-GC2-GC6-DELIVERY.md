# G10-GC2..GC6 — Delivery

Baseline `main` @ `d19d127`. Branch `experiment/g10-gc2-gc6-production-loop-closure`.

This branch implements the GC2–GC6 closure as one cohesive production-loop
change (the stages are deeply interdependent: checkpoint grounding, world
observation, reconciliation, and the wake state machine share one atomic
batching and freshness model). Stage-specific semantics are documented in the
per-stage docs above.

Gates: diff check clean; focused suite 8 passed; unit **101 files / 871 tests**;
build + build:web pass; e2e 21 passed (documented flake protocol).

Decisive proofs: derived grounded checkpoint with institution epoch and belief
digest, no hidden context; atomic WAIT+watches+checkpoint+quiescing+dormant;
empty wake plan refused; checkpoint_incomplete when the institution is unknown;
full world observation incl. linked Projects and real triggered watch; unknown
evidence/institution -> reconciliation_incomplete with zero writes; observation
mutates nothing; changed standing reconciles atomically; unchanged refresh is a
no-op with zero events; retried reconciliation converges; `beginWake` only from
DORMANT; second beginWake reports the in-flight cycle; completion requires
reconciliation and admission.

```text
G10-GC2..GC6 PRODUCTION LOOP CLOSURE: PASS
```
