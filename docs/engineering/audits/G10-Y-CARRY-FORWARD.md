# G10-Y — Carry-Forward

No `BLOCKER_IN_Y`. `CF-W-03` is **CLOSED_IN_Y**. `CF-X-01` remains
**STILL_DEFERRED_WITH_TRIGGER** (it was never in scope). The items below are
surfaced or re-confirmed by the Y work and do not block the delivered claims.

| ID | Kind | Finding | Concrete trigger |
| --- | --- | --- | --- |
| CF-W-03 | semantics | **CLOSED_IN_Y.** Work Evidence revocation is now canonical, append-only and inside the same `appendAtomic` revision batch; the post-commit raw repair is deleted. | Closed; keep the checkpoint fault-injection suite and `scripts/audit/y0-cf-w-03-repro.mjs` as the regression guard. |
| CF-Y-01 | semantics/authority | **NEW, PRE-EXISTING (verified on the baseline).** A promotion still commits for the attempt of a task a revision has already retired: after the revision marks `task-a` `STALE`, `promoteAttempt({attemptId})` commits a `PROMOTION_COMMITTED` whose `resulting_head_commit` diverges from the ProjectIR head, even though the retired task can never reach `TASK_SATISFIED`. Reproduced on the untouched canonical baseline (`palimpsest-g10x`, X-era dist): `taskAStateAfterRevision: "STALE"`, `promotionOfRetiredTaskAttempt: "COMMITTED"`, one `PROMOTION_COMMITTED`. This is **promotion-authority** scope, adjacent to `CF-X-01`, not Evidence authority — Y deliberately did not widen into it. | A topology/product need to prevent a retired task's work from advancing the canonical head, or a consolidation with `CF-X-01`. |
| CF-Y-02 | coverage | **NEW.** The revocation plan is compiled from a read of the `evidence`/`attempts` projections taken just before the batch opens, not from a snapshot pinned at batch-open time. Within one process the batch opens immediately after compilation, so this is not reachable today; a future multi-writer or deferred-commit path would need the plan and the batch to share one read view. | A second writer, or a batch that is compiled and committed in different steps. |
| CF-W-04 | coverage | **STILL_DEFERRED_WITH_TRIGGER.** `resume.action = "blocked"` remains defensive with no dedicated reproduction test. | A feature that changes a project revision without settling/re-authorizing in-flight work. |
| CF-W-05 | product/route | **STILL_DEFERRED_WITH_TRIGGER.** `GET /api/manage/preview` still unconsumed by `web/**`. | A UI change that wants preview without the step path. |
| CF-W-06 | semantics | **REASSESSED_IN_Y, deliberately not merged.** A revision still does not recompute dependency-derived state for retained tasks. Y's Evidence atomicity does not depend on it. | An operator expecting a revision/head sync to recompute retained-task states. |
| CF-W-07 | scale | **STILL_DEFERRED_WITH_TRIGGER, weight unchanged.** One revision per promotion still costs O(tasks); Y adds only one attempts read per *retired* task plus one scoped evidence read. | A project with thousands of tasks where promotions/revisions are frequent. |
| CF-X-01 | semantics/invariant | **STILL_DEFERRED_WITH_TRIGGER.** Parallel old-base promotion remains `NOT_APPLICABLE_CURRENT_TOPOLOGY`; it must settle through the head sync. Verified unchanged (`Y-N25`, `Y-N29`). | A topology/product need for two concurrent tasks to promote independently from the same base. |
| CF-X-02 | product/route | **STILL_DEFERRED_WITH_TRIGGER.** `ProjectWorkspaceView.project.head` still not rendered by `web/**`. | A UI change that wants to show project-head state and promotion provenance. |
| CF-X-03 | coverage | **STILL_DEFERRED_WITH_TRIGGER.** Trusted `headAdvance` still has no production caller beyond `reconcileProjectHead`. | A future internal caller that wants to commit a pre-compiled reconciliation without the wrapper. |
| CF-X-04 | coverage | **STILL_DEFERRED_WITH_TRIGGER.** `pump`/`promote` CLI paths still have no CLI-level end-to-end tests. | A CLI-behaviour change, or a request for CLI-level regression coverage. |

## Recommended next stage (assessment only)

Ranked by correctness/authority risk first, then operational blocking value:

1. **CF-Y-01** — a promotion advancing the canonical head with work from a task a
   revision already retired. It is the only item on this list that lets a durable
   authority artifact (the canonical head) diverge from the Work state that
   authorized it. It also subsumes the more general `CF-X-01` question, because a
   retired-task promotion is exactly the "authorized at an old base" case reaching
   a commit.
2. **CF-W-06** — retained-task dependency-state reconciliation, which becomes
   load-bearing as soon as (1) lands, since settling and re-deriving state must
   agree.
3. Everything else is product/coverage/scale, in that order.

Explicitly **not** assumed: the External Asset Library Bridge is not privileged by
this ordering.
