# G10-X — Carry-Forward

No `BLOCKER_IN_X`. CF-W-02 is **CLOSED_IN_X** and CF-W-03 is **STILL_DEFERRED_WITH_TRIGGER** (see
`audits/G10-X-W-CARRY-FORWARD-DISPOSITION.md`). The items below are surfaced (or re-confirmed) by
the G10-X head-evolution work itself and do not block the delivered claims.

| ID | Kind | Finding | Concrete trigger |
| --- | --- | --- | --- |
| CF-W-02 | semantics/contract | **CLOSED_IN_X.** The canonical head is now derived and re-anchored (`promoteAttempt` + `reconcileProjectHead` + trusted `planReconciled`); a multi-task project promotes twice with the ProjectIR head equal to the git head. | Closed; keep the X-M1 golden test and the multi-promotion dogfood as the regression guard. |
| CF-W-03 | semantics | **STILL_DEFERRED_WITH_TRIGGER.** Typed evidence staleness remains a post-commit projection repair with no event of its own; G10-X reuses it unchanged for the head-advance revision. | A crash between the batch and the repair, or a wire-contract change that can add a canonical `EVIDENCE_STALE` event. |
| CF-W-04 | coverage | **STILL_DEFERRED_WITH_TRIGGER.** `resume.action = "blocked"` remains defensive with no reproduction test; G10-X's barrier uses a distinct `head_sync_required` phase. | A future feature that changes a project revision without settling/re-authorizing in-flight work. |
| CF-W-05 | product/route | **STILL_DEFERRED_WITH_TRIGGER.** `GET /api/manage/preview` still unconsumed by `web/**`. | A UI change that wants preview without the step path. |
| CF-W-06 | semantics | **STILL_DEFERRED_WITH_TRIGGER.** A revision (and now a head sync) re-authorizes retained tasks but does not recompute dependency-derived state. | An operator expecting a revision/head sync to recompute retained-task states. |
| CF-W-07 | scale | **STILL_DEFERRED_WITH_TRIGGER, weight raised.** G10-X adds one revision per promotion (the head sync), so the O(tasks)-per-revision cost fires more often. | A project with thousands of tasks where promotions/revisions are frequent. |
| CF-X-01 | semantics/invariant | A task authorized at an older base cannot be satisfied by a promotion whose expected head advanced (`#validateTaskSatisfied` requires `expected_head_commit === envelope.base_commit`). The parallel old-base path is `NOT_APPLICABLE_CURRENT_TOPOLOGY`; it must settle through the head sync (settle → reconcile → re-READY). | A topology/product need for two concurrent tasks to promote independently from the same base. |
| CF-X-02 | product/route | `ProjectWorkspaceView.project.head` (state, label, promotion provenance) is in the derived overview payload, but `web/**` does not yet render it (outside this stage's write scope). | A UI change that wants to show project-head state and promotion provenance. |
| CF-X-03 | coverage | The trusted `headAdvance` option is exercised through `reconcileProjectHead` and the forgery-negative tests; no production caller passes it directly. | A future internal caller that wants to commit a pre-compiled reconciliation without the wrapper. |
| CF-X-04 | coverage | The `pump` CLI path reconciles drift after pumping, but the CLI `pump`/`promote` paths have no end-to-end CLI test (they are covered at the controller/control-surface level). | A CLI-behaviour change, or a request for CLI-level regression coverage. |
