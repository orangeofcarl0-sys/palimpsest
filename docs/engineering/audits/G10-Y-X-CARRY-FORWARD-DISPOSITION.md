# G10-Y — X/W carry-forward disposition

Every carry-forward item from `G10-X-CARRY-FORWARD.md` is disposed below.
`CF-W-03` is **CLOSED_IN_Y**. `CF-X-01` remains **STILL_DEFERRED_WITH_TRIGGER**.

| ID | Disposition | Reasoning and evidence |
| --- | --- | --- |
| **CF-W-03** | **CLOSED_IN_Y** | The typed evidence staleness is no longer a post-commit projection repair. `compileEvidenceInvalidation` derives a pure typed plan before mutation; the controller converts it into canonical `EVIDENCE_STALE` events appended **inside** the same `appendAtomic` batch, before `PROJECT_REVISED`; `#staleEvidenceForScope` (the raw `UPDATE evidence SET status='stale'`) is deleted. `Y-N01` proves no such write survives in `src/**` outside the projector; `Y-N13`/`Y-N14`/`Y-N15` prove every fault checkpoint leaves the complete old or complete new world; `Y-N21`/`Y-N22` prove replay/rebuild need no repair. Independently reproduced before and after with a real process kill (`scripts/audit/y0-cf-w-03-repro.mjs`). |
| **CF-W-04** | **STILL_DEFERRED_WITH_TRIGGER** | `resume.action = "blocked"` is still defensive with no dedicated reproduction test. Y does not change resume semantics and the head-sync barrier remains a distinct `head_sync_required` phase. **Trigger:** a future feature that changes a project revision without settling/re-authorizing in-flight work. |
| **CF-W-05** | **STILL_DEFERRED_WITH_TRIGGER** | `GET /api/manage/preview` is still unconsumed by `web/**`. Y is a Work-layer correctness stage with no web scope. **Trigger:** a UI change that wants preview without the step path. |
| **CF-W-06** | **REASSESSED_IN_Y, NOT_MERGED** | Per §34, Y reassessed the severity but did not merge scope: a revision still re-authorizes retained tasks without recomputing dependency-derived state. Y's Evidence atomicity does **not** depend on it — the revoked set is derived from the task set the batch retires, not from retained tasks' dependency states, so no Evidence authority can be left stale by this gap. **Trigger (unchanged):** an operator expecting a revision/head sync to recompute retained-task states. |
| **CF-W-07** | **STILL_DEFERRED_WITH_TRIGGER, weight unchanged** | O(tasks)-per-revision remains. Y adds no per-revision pass over tasks beyond one attempts read per **retired** task, and the evidence read is a single scoped query, so the weight did not rise. **Trigger:** a project with thousands of tasks where promotions/revisions are frequent. |
| **CF-X-01** | **STILL_DEFERRED_WITH_TRIGGER** | Explicitly out of scope (§4). Verified unchanged: `Y-N29` asserts the controller prototype exposes no `parallel` / `oldBase` / `crossRevision` surface, and `Y-N25` asserts the promotion path still re-validates both the source commit and the expected head. Parallel old-base promotion must still settle through the head sync. **Trigger:** a topology/product need for two concurrent tasks to promote independently from the same base. |
| **CF-X-02** | **STILL_DEFERRED_WITH_TRIGGER** | `ProjectWorkspaceView.project.head` is still not rendered by `web/**`. No Y web scope. **Trigger:** a UI change that wants to show project-head state and promotion provenance. |
| **CF-X-03** | **STILL_DEFERRED_WITH_TRIGGER** | The trusted `headAdvance` option still has no production caller beyond `reconcileProjectHead`. Y does not add one. **Trigger:** a future internal caller that wants to commit a pre-compiled reconciliation without the wrapper. |
| **CF-X-04** | **STILL_DEFERRED_WITH_TRIGGER** | The `pump`/`promote` CLI paths still lack CLI-level end-to-end tests. Y adds no CLI surface — the evidence closure is driven by `planReconciled`, which stays callable from the tool/HTTP/CLI layers identically. **Trigger:** a CLI-behaviour change, or a request for CLI-level regression coverage. |

## New items surfaced by Y

Recorded in `G10-Y-CARRY-FORWARD.md`:

* **CF-Y-01** — a promotion can still commit for work a revision has already
  retired. Independently reproduced on the untouched canonical baseline, so it is
  **pre-existing** and belongs to promotion-authority scope (adjacent to
  `CF-X-01`), not to Evidence authority.
* **CF-Y-02** — the revision's revoked set is derived from a pre-batch read rather
  than a snapshot taken at batch-open time.
