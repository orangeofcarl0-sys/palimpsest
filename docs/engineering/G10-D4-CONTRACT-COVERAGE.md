# G10-D4 — Contract Coverage Matrix

| Proof / invariant | Code face | Machine test | Status |
| --- | --- | --- | --- |
| D4-M01 point list from the canonical store | `observeBindingState` over `pointStore.list()` | two-registered-points snapshot test | implemented + machine-tested |
| D4-M02 ephemeral facts from runtime observation | port result → snapshot capabilities | profile echo test | implemented + machine-tested |
| D4-M03 UNKNOWN ≠ UNAVAILABLE / ≠ empty | `ObservationKnowledge` refused before snapshot | unknown-ephemeral refusal test | implemented + machine-tested |
| D4-M04 incomplete → no snapshot | `observation_incomplete` outcome | refusal tests (ephemeral + per-point) | implemented + machine-tested |
| D4-M05 registered point cannot be silently omitted | every canonical point observed; any unknown refuses | P-2-unknown refusal test | implemented + machine-tested |
| D4-M06 observation is read-only | store read APIs only; no carrier service | store-unchanged test | implemented + machine-tested |
| D4-M07 relevant change changes SnapshotRef | availability drift → content digest drift → ref drift | change tests (+§87 release/loss) | implemented + machine-tested |
| D4-M08 old resolution stale | kernel freshness vs current state | staleness test (byte-immutable R1) | implemented + machine-tested |
| D4-M09 re-resolution current | recompile against S2 | truthful-condition test (unsatisfied-or-planned, digest differs) | implemented + machine-tested |
| D4-M10 realize re-checks freshness | service freshness gate vs current observation | stale-realize refusal test | implemented + machine-tested |
| D4-M11 observation never creates PersistentPoints | read path audit + store equality after observe | store-equality test | implemented + machine-tested |
| D4-M12 observation never creates RuntimeAgents | no carrier service in the observation path | structural (no port in `observation.ts` creation path) | implemented + machine-tested |
| §76 knowledge states | `ObservationKnowledge` discriminated union | state tests | implemented + machine-tested |
| §80 availability semantics | documented meaning (admissible for realization) | docs + availability-drift test | documented |
| §81 snapshot identity | injected allocator; deterministic tests | deterministic ids in tests | implemented + machine-tested |
| §83 distinct steps | observe then compile; pure compiler never observes | structural (compiler untouched) | preserved |
| §85 TOCTOU honesty | documented non-atomicity + mitigations | Closed-Loop record | documented |

## Non-goals held

No snapshot persistence; no store/event changes; no scheduler change; no
UNKNOWN→unavailable collapse; frozen contracts untouched.
