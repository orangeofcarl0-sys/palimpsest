# G10-O — G10-N Carry-Forward Disposition

Inputs: `G10-N-CARRY-FORWARD.md`, `G10-N-COLLABORATIVE-REASONING-DELIVERY.md`,
`G10-N-COLLABORATIVE-REASONING-CELL-SPEC.md`.

| ID | Disposition | Trigger / product treatment |
|---|---|---|
| CF-N-01 ReasoningCell → Campaign/Evidence publication | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | A Campaign consuming a cell's accepted claim as Evidence input. The product surface shows `accepted claims are cell-local; not published to Evidence` and offers **no** "Publish as Evidence" affordance. |
| CF-N-02 ReasoningCell runtime/Holon packaging | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | A cell that must present externally as a peer. The UI shows a branch's `ActivationRef` attribution only; a cell is never drawn as a Peer/Holon. |
| CF-N-03 no branch execution port | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | A host-managed branch runner. The agent tools DO cover open-branch / read-frozen-brief / submit-candidate / evaluate, without implementing the host seam. |
| CF-N-04 no invalidation reactivation | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | Re-admitting an invalidated claim after new evidence (workaround: a new semantic claim). |
| CF-N-05 small builtin claim taxonomy | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | A domain-specific structured claim type via the extensible registry. |
| CF-N-06 no cross-cell claim composition | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | Federated/hierarchical cells sharing one admitted state. |
| CF-N-07 briefs are frozen | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | Mid-flight frontier refresh semantics for a long-running branch. |
| CF-N-08 no bounded verification retry | `STILL_DEFERRED_WITH_CONCRETE_TRIGGER` | A production verification implementation needing a retry contract. |
| CF-N-09 frontier metrics not in Dynamics | `CLOSED_IN_O` | The application surface exposes ReasoningCell views/metrics directly (`palimpsest_reasoning`, `/api/reasoning/*`, the Reasoning projection) without forcing a Dynamics subject. |

## Summary

```text
CLOSED_IN_O:                          CF-N-09
REQUIRED_BUT_RESCOPED_WITH_PROOF:     none
STILL_DEFERRED_WITH_CONCRETE_TRIGGER: CF-N-01 … CF-N-08
OBSOLETE_AFTER_O_DESIGN:              none
```
No `BLOCKER_IN_O` remains. The deferred semantic bridges are explicitly surfaced as *not
configured* in both the API (`/api/application/surfaces`) and the UI, so the product never
visually claims a relation that does not exist.
