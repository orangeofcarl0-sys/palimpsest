# G10-D3 — Contract Coverage Matrix

| Proof / invariant | Code face | Machine test | Status |
| --- | --- | --- | --- |
| D3-M01 strict identity artifact | `materializePersistentPoint`/`parsePersistentPoint` | grammar/unknown-field/version tests | implemented + machine-tested |
| D3-M02..M04 point ≠ definition/runtime/session | identity-only artifact + forbidden-field audit | structural + serialized-content tests | implemented + machine-tested |
| D3-M05 explicit creation only | materializer + `store.register`; resolution/realization never create | kernel source audit (no store in resolver) + missing-point test | implemented + machine-tested |
| D3-M06 durable restart/readback | SQLite file store | reopen-and-read test | implemented + machine-tested |
| D3-M07 duplicate registration fail-closed | PRIMARY KEY + artifact comparison | identical-duplicate idempotent / conflict fail-closed / corrupt-record fail-closed tests | implemented + machine-tested |
| D3-M08 persistent selection requires existing point | store verification before effect | unregistered-point test (no effect fired) | implemented + machine-tested |
| D3-M09 missing point never auto-created | fail-closed outcome `persistent_point_missing` | store stays empty after refusal | implemented + machine-tested |
| D3-M10 unavailable point never silently falls back | typed `realized:false` action result → `continuity_unavailable` | port-unavailable test | implemented + machine-tested |
| D3-M11 carrier replacement preserves point identity | §67 chain through the real Ordarium ledger | replacement test (P unchanged, new activation/carrier) | implemented + machine-tested |
| D3-M12 ephemeral + persistent coexist | one mixed plan, both routes | mixed-realization test | implemented + machine-tested |
| D3-M13 BindingDefinition unchanged | kernel untouched | kernel source audit (no store dependency) | preserved |
| D3-M14 BindingResolution unchanged | resolution semantics untouched | kernel source audit + full binding suites green | preserved |
| §64 realize against verified P | `realizeRuntime` store verification before effect | verification ordering (no effect on missing) | implemented + machine-tested |
| §66 no fallback | typed result boundary (not-thrown classes) — Ordarium-wrapping finding recorded | typed-outcome tests | implemented + machine-tested |
| §101 persistence review | single durable store inventory | store tests (restart/concurrency/corruption) | documented + machine-tested |

## Non-goals held

No attachment history (§63); no point delete; no AgentDefinition↔Point
ownership fields (§69); no Ordarium state for continuity; no
organization/collaboration semantics; frozen contracts untouched.
