# G10-E1 — Contract Coverage Matrix

| Proof / invariant | Code face | Machine test | Status |
| --- | --- | --- | --- |
| E1-M01 Activation ≠ Attempt | disjoint artifacts/fields | disjoint-field test | implemented + machine-tested |
| E1-M02 Invocation ≠ Participation | distinct artifacts (`purpose` vs `participationId`) | mutual-exclusion serialization test | implemented + machine-tested |
| E1-M03 Invocation ⇏ Participation | INVOCATION_RECORDED appends nothing else | history-shape test | implemented + machine-tested |
| E1-M04 Participation ⇏ ownership | no owner/authority/assignment fields | forbidden-content test | implemented + machine-tested |
| E1-M05 ActivationRef derived from actual Activation | `activationRefOf` | provenance-equality + freeze test | implemented + machine-tested |
| E1-M06 AttemptRef validated against canonical state | `AttemptCatalogPort` / `SqliteAttemptCatalog` | unknown/terminal/state tests | implemented + machine-tested |
| E1-M07 terminal Attempt refuses new participation | `attempt_terminal` fail-closed | terminal-state test (history still allowed) | implemented + machine-tested |
| E1-M08 Participation without Invocation | optional `invocation` | voluntary-participation test | implemented + machine-tested |
| E1-M09 byte-identical duplicate idempotent | canonical-JSON payload comparison | same-eventId re-append test | implemented + machine-tested |
| E1-M10 conflicting duplicate fail-closed | `coordination_conflict` | different-payload same-eventId test | implemented + machine-tested |
| E1-M11 restart/readback | SQLite replay | reopen-and-replay test | implemented + machine-tested |
| E1-M12 artifacts immutable | deep-freeze + detach | freeze/`TypeError` tests | implemented + machine-tested |
| E1-M13 scheduler unchanged | `src/scheduler` no-diff + import audit | static audit + scheduler suite | preserved |
| E1-M14 AttemptExecutor unchanged | `src/effects/executor` no-diff + import audit | static audit + suite | preserved |
| §30 lifecycle as events | PARTICIPATION_STARTED/ENDED events | lifecycle test (incl. end-twice idempotent, unknown-id fail-closed) | implemented + machine-tested |
| §33 strict typed payloads | per-type parsers, no generic bag | parser tests | implemented + machine-tested |

## Non-goals held

No scheduler mutation (§36); no AttemptExecutor mutation (§37); no Work
EventStore writes from coordination; no ownership/cardinality frozen (§137/§138);
frozen contracts untouched.
