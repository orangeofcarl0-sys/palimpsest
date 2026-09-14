# G10-M — G10-L / G10-J Carry-Forward Disposition

Inputs: `G10-L-CARRY-FORWARD.md`, `G10-L-FEDERATED-BOUNDARY-COLLABORATION-DELIVERY.md`,
`G10-L-FEDERATED-BOUNDARY-COLLABORATION-SPEC.md`, `G10-J-CARRY-FORWARD.md`.

## Long-deferred J items

### CF-J-03 — RuntimeScope structural kinds → `CLOSED_IN_M`
`ENCAPSULATE_RUNTIME_SCOPE` / `COLLAPSE_RUNTIME_STRUCTURE` are now executable through
`runtime_evolution` as atomic multi-scope transitions with a deterministic safety assessment
and an independent runtime-structural authority. Encapsulation ≠ SPLIT; collapse ≠ MERGE.

### CF-J-04 — DISSOLVE / RETIRE → `CLOSED_IN_M` (subject-disambiguated)
- `runtime_scope` → `RETIRE_SCOPE` (safe detach + close + evolution receipt).
- `organization` → append-only lifecycle retirement (no revision deletion).
- `boundary_workspace` → explicit unsupported, recorded as CF-M-01.

## L items (re-adjudicated; Runtime Structural Evolution does not depend on any of them)

| ID | Disposition | Concrete trigger (preserved) |
|---|---|---|
| CF-L-01 canonical-home migration/failover | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | a real multi-host deployment needing planned home migration. Runtime structural evolution is entirely local to the RuntimeScopeStore/home and does NOT require it. |
| CF-L-02 remote operation status/metadata | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | a transport needing an operation status query. Not required: runtime structural evolution has no remote protocol. |
| CF-L-03 remote scaffolding | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | a workspace bootstrapped by a participant. |
| CF-L-04 remote workspace close | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | a governed remote close/archive. |
| CF-L-05 cache/change feed | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | a latency/offline requirement. |
| CF-L-06 formalization evidence port | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | an obligation genuinely requiring external evidence. |
| CF-L-07 empirical post-observation | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | an empirical evaluation stage. |
| CF-L-08 candidate rebase helper | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | agent/UI ergonomics for an explicit rebase. |
| CF-L-09 artifact type migration | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | evolving an artifact schema while preserving identity. |
| CF-L-10 structured message refs | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | typed candidate/change references in messages. |
| CF-L-11 institution governance for formalization genesis | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | a formalization requiring an institution body's approval. |

L's P1 (CF-L-01/02) remain deferred with the same guarantees and triggers; M's runtime
evolution does not lower any canonical-home guarantee.

## Summary

```text
CLOSED_IN_M:                          CF-J-03, CF-J-04
REQUIRED_BUT_RESCOPED_WITH_PROOF:     none
STILL_DEFERRED_WITH_CONCRETE_TRIGGER: CF-L-01 … CF-L-11
OBSOLETE_AFTER_M_DESIGN:              none
```
No `BLOCKER_IN_M` remains.
