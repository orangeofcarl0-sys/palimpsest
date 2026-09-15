# G10-Z — Y/X carry-forward disposition

Every item from `G10-Y-CARRY-FORWARD.md` is disposed below. `CF-Y-01` is
**CLOSED_IN_Z**. `CF-X-01` remains **STILL_DEFERRED_WITH_TRIGGER**, with its
unsafe path closed.

| ID | Disposition | Reasoning and evidence |
| --- | --- | --- |
| **CF-Y-01** | **CLOSED_IN_Z** | A canonical historical attempt result no longer carries promotion authority once the Work that authorized it is retired. The shared `assessPromotionEligibility` proves the attempt is a COMPLETED candidate of the current batch of a current VERIFYING task whose envelope and report match the current ProjectIR; `promote()`, `promoteAttempt()`, the expert path and recovery all pass it. Independently reproduced and closed (`scripts/audit/z0-promotion-authority-repro.mjs`, scenario `cfy1`: pre-fix `PROMOTION_COMMITTED` + head divergence, post-fix `task_retired` with zero PREPARED, zero effect). Guarded by `Z-N01`/`Z-N02`. |
| **CF-Y-02** | **CLOSED_IN_Z** | The revocation plan's read-vs-batch atomicity concern is superseded by a stronger guarantee in the same area: `PROMOTION_PREPARED` admission and the revision fence now read the `promotions` **projection** (replay-ordered), and `verifyFull`/`rebuildProjections` re-validate every event in order. The plan-and-batch read window is still single-process, but the new validators are proven replay-safe (`Z-N29`, and the Z0 assessment §7). Residual trigger (unchanged): a second writer or a compile-then-commit split. |
| **CF-W-04** | **STILL_DEFERRED_WITH_TRIGGER** | `resume.action = "blocked"` remains defensive with no dedicated reproduction test; Z adds a `head_sync_required` blocker instead of touching resume. **Trigger:** a feature that changes a project revision without settling/re-authorizing in-flight work. |
| **CF-W-05** | **STILL_DEFERRED_WITH_TRIGGER** | `GET /api/manage/preview` still unconsumed by `web/**`; Z exposes the promotion preview at the controller/status level and renders the fence as workspace open loops, but adds no HTTP manage route. **Trigger:** a UI change that wants preview without the step path. |
| **CF-W-06** | **REASSESSED_IN_Z, still separate** | Retained-task dependency-state reconciliation is unchanged and Z does not depend on it: the fence and eligibility are computed from task states and the batch anchor, not from retained-task dependency state. **Trigger (unchanged):** an operator expecting a revision/head sync to recompute retained-task states. |
| **CF-W-07** | **STILL_DEFERRED_WITH_TRIGGER, weight unchanged** | O(tasks)-per-revision is unchanged. The fence adds one projection scan per revision (zero queries when there is no pending intent). **Trigger:** a project with thousands of tasks where promotions/revisions are frequent. |
| **CF-X-01** | **STILL_DEFERRED_WITH_TRIGGER — unsafe effect-first path CLOSED, real parallel compatibility still unsupported** | Real cross-revision/parallel old-base compatibility is still not implemented (`Z-N27` proves no compatibility engine exists and no parallel-promotion surface is exposed). What Z closes is the unsafe ordering: an old-base result is now refused **before Git** with `cross_revision_promotion_not_supported`, instead of moving the branch and failing Work admission at `TASK_SATISFIED`. The X-M3 test was rewritten to assert the refusal with zero effect. **Trigger:** a topology/product need for two concurrent tasks to promote independently from the same base. |
| **CF-X-02** | **STILL_DEFERRED_WITH_TRIGGER** | `ProjectWorkspaceView.project.head` is still not rendered by `web/**`. Z adds fence open loops to the view but no rendering. **Trigger:** a UI change that wants to show project-head state and promotion provenance. |
| **CF-X-03** | **STILL_DEFERRED_WITH_TRIGGER** | Trusted `headAdvance` still has no production caller beyond `reconcileProjectHead`. Z now additionally exempts it from the head-drift blocker, which is its documented purpose. **Trigger:** a future internal caller that wants to commit a pre-compiled reconciliation without the wrapper. |
| **CF-X-04** | **STILL_DEFERRED_WITH_TRIGGER** | The `pump`/`promote` CLI paths still lack CLI-level end-to-end tests. Z changes `promote`'s admission but not the CLI surface. **Trigger:** a CLI-behaviour change, or a request for CLI-level regression coverage. |

## New items surfaced by Z

Recorded in `G10-Z-CARRY-FORWARD.md`:

* **CF-Z-01** — the promotion fence is derived per call with no cache
  (O(pending intents) per revision).
* **CF-Z-02** — a `PROMOTION_COMMITTED`/`PROMOTION_FAILED` pair is not validated
  against the Work basis; only `PROMOTION_PREPARED` is. `COMMITTED` is
  deliberately unvalidated so a proven effect can always be recorded honestly
  (§28), but that means a foreign writer could append a `COMMITTED` for an
  ineligible attempt.
* **CF-Z-03** — the `input_world_stale` report facet is unreachable through the
  event store and is only defensively asserted.
