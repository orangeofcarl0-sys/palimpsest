# G10-Z — Carry-Forward

No `BLOCKER_IN_Z`. `CF-Y-01` is **CLOSED_IN_Z**; `CF-Y-02` is
**CLOSED_IN_Z** (superseded by the replay-safe reader). `CF-X-01` remains
**STILL_DEFERRED_WITH_TRIGGER** with its unsafe effect-first path closed. The items
below are surfaced or re-confirmed by the Z work and do not block the delivered
claims.

| ID | Kind | Finding | Concrete trigger |
| --- | --- | --- | --- |
| CF-Y-01 | semantics/authority | **CLOSED_IN_Z.** A retired task's historical result no longer carries promotion authority; every entry point (product, expert, selection, recovery) passes one shared assessment. Guarded by `Z-N01`/`Z-N02` and the `cfy1` reproducer. | Closed; keep the reproducer and the Z suites as the regression guard. |
| CF-Y-02 | coverage | **CLOSED_IN_Z (superseded).** The read-vs-batch atomicity concern is now dominated by the replay-safety requirement: `PROMOTION_PREPARED` admission and the fence read the `promotions` projection, and `verifyFull`/`rebuildProjections` re-validate in order. | Revisit only if a second writer or a compile-then-commit split is introduced. |
| CF-Z-01 | scale | **NEW.** The promotion fence is derived per call with no cache: O(pending intents) per `planReconciled`, currently bounded by the declared stage-graph concurrency (at most one unresolved intent per VERIFYING task). | A project with a large pending-promotion backlog, or a concurrency policy that allows many simultaneous unresolved intents. |
| CF-Z-02 | coverage/invariant | **NEW.** Only `PROMOTION_PREPARED` is validated against the Work basis. `PROMOTION_COMMITTED` is deliberately unvalidated so a proven external effect can always be recorded honestly even when its Work was retired (§28). A foreign writer (or direct `EventStore.append`) could therefore append a `COMMITTED` for an ineligible attempt; the aggregate would not refuse it. | A hardened ingestion path, or evidence of a writer other than `PromotionManager`. |
| CF-Z-03 | coverage | **NEW.** The `input_world_stale` **report** facet is unreachable through the event store - `#validateAttemptTransition` refuses a completed report whose input identity does not match the task envelope - so it is asserted as defence in depth (`Z-N06` pure-function half) rather than as a live hole. | A future path that records reports without the aggregate's input-identity check. |
| CF-Z-04 | semantics | **NEW.** `TASK_SATISFIED` is not produced automatically after a recovered promotion; the scheduler step still has to run (`runTurn` does it). If a future flow expects recovery alone to settle Work, it must chain the step. | A host that calls `reconcileAll()` without a subsequent turn. |
| CF-W-04 | coverage | **STILL_DEFERRED_WITH_TRIGGER.** `resume.action = "blocked"` remains defensive with no dedicated reproduction test. | A feature that changes a project revision without settling/re-authorizing in-flight work. |
| CF-W-05 | product/route | **STILL_DEFERRED_WITH_TRIGGER.** `GET /api/manage/preview` still unconsumed by `web/**`; the new promotion preview is controller/status-level only. | A UI change that wants preview without the step path. |
| CF-W-06 | semantics | **STILL_DEFERRED_WITH_TRIGGER.** Retained-task dependency-state reconciliation is unchanged and Z does not depend on it. | An operator expecting a revision/head sync to recompute retained-task states. |
| CF-W-07 | scale | **STILL_DEFERRED_WITH_TRIGGER, weight unchanged.** One revision per promotion still costs O(tasks); the fence adds one projection scan per revision. | A project with thousands of tasks where promotions/revisions are frequent. |
| CF-X-01 | semantics/invariant | **STILL_DEFERRED_WITH_TRIGGER — unsafe path closed, feature unsupported.** Old-base results are refused before Git (`cross_revision_promotion_not_supported`); real cross-revision/parallel promotion with a compatibility protocol is still not implemented and is not faked. | A topology/product need for two concurrent tasks to promote independently from the same base. |
| CF-X-02 | product/route | **STILL_DEFERRED_WITH_TRIGGER.** `ProjectWorkspaceView.project.head` and the new promotion-fence loops are in the payload but not rendered by `web/**`. | A UI change that wants to show head state, promotion provenance, or the fence. |
| CF-X-03 | coverage | **STILL_DEFERRED_WITH_TRIGGER.** Trusted `headAdvance` still has no production caller beyond `reconcileProjectHead` (now also the documented exemption from the drift blocker). | A future internal caller that wants to commit a pre-compiled reconciliation without the wrapper. |
| CF-X-04 | coverage | **STILL_DEFERRED_WITH_TRIGGER.** `pump`/`promote` CLI paths still lack CLI-level end-to-end tests. | A CLI-behaviour change, or a request for CLI-level regression coverage. |

## Recommended next stage (assessment only)

Ranked by correctness/authority risk first, then state consistency, operational
capability, product polish, ecosystem:

1. **CF-Z-02** — the only remaining item where a durable authority artifact
   (`PROMOTION_COMMITTED`) can be appended without its Work basis being checked.
   It matters only for a writer other than `PromotionManager`, which is exactly the
   situation the Z fence assumption rests on.
2. **CF-W-06** — retained-task dependency-state reconciliation. It becomes
   load-bearing as soon as concurrency allows more than one in-flight
   authorization per base, which is also CF-X-01's precondition.
3. **CF-X-01** — real cross-revision compatibility, if a topology need appears.
   It is a capability, not a correctness gap: the unsafe ordering is already
   closed.
4. Everything else is scale, operability and product surface, in that order.

Explicitly **not** privileged by this ordering: the External Asset Library Bridge.
