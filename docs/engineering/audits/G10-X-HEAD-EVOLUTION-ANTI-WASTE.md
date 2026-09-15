# G10-X — Head Evolution Anti-Waste Audit

Baseline: `main @ f639181199da9ccd7acb3fac2c46392e0b82eb04`.

The load-bearing question for this stage: *does canonical head evolution require new state, or can it
be derived from what already exists?* The answer is the latter, and the source scans below pin it.
Every claim here is machine-checked by `test/x_adversarial.test.ts` (describe block C).

## Classification of what was added

| Added | Class | Rationale |
| --- | --- | --- |
| `src/domain/project_head.ts` (pure kernel) | KEEP_SEMANTIC | One pure derivation + one pure compiler + one typed error. No I/O. |
| `PromotionManager.{promotionFacts, projectHeadStatus, canonicalExpectedHead, canonicalAttemptResultCommit, promoteAttempt}` | KEEP_SEMANTIC | Reads the existing promotion ledger and the existing attempt report; derives the two commits the caller used to supply. |
| `ProjectController.{promoteAttempt, reconcileProjectHead, #latestHeadPromotion, #headReconciliationCandidate}` | KEEP_SEMANTIC | Thin composition over the kernel and the existing `planReconciled` batch. |
| `planReconciled(input, { headAdvance })` | KEEP_SEMANTIC | A trusted, re-validated option on the existing revision contract — no new event, no new store. |
| `runTurn` barrier + `pumpSettlement` | KEEP_SEMANTIC | A read of the existing derivation plus one branch in the existing pump. |
| Management action class + candidate + execution case | KEEP_SEMANTIC | Reuses the existing policy matrix and the existing workspace view. |
| `ControllerStatusView.head` / `ProjectWorkspaceView.project.head` / two open-loop kinds | KEEP_SEMANTIC (derived) | Pure additions to derived read models; the view copies no fact. |
| `POST /api/project/reconcile_head`, `reconcile_project_head` action | KEEP_SEMANTIC | Typed routes over the same operation. |

`DELETE_REDUNDANT: 0`, `DEFER: 0`, `BIND_PRODUCTION: 0` — nothing was added that could have been
derived, and nothing derivable was stored.

## Verified absences (machine-checked)

| Property | Check |
| --- | --- |
| The head kernel is pure | `src/domain/project_head.ts` has a single import (`ProjectIr` type) and matches neither `DatabaseSync`/`EventStore`/`sqlite` nor `.head(` nor `Date`. |
| No git-head database/ledger/watcher | `src/domain/project_head_store.ts` does not exist; no `src/**/*.ts` contains `CREATE TABLE … git_head` or `gitHeadWatcher`/`headWatcher`. |
| `git.head()` is never an input to the head advance | The `reconcileProjectHead` region of `controller.ts` contains no `git.head(`; `promotion.ts` calls it exactly once, inside the diagnostic `#gitHeadOrUndefined()`, and never assigns it to `projects.head_commit`. |
| The projector/store files are unchanged | `src/state/event_store.ts`, `src/application/projections.ts`, `src/application/projection_types.ts` contain no `project_head`/`ProjectHead`/`deriveProjectHeadStatus` references. |
| No second head truth | The status is derived from ProjectIR + `PROMOTION_COMMITTED` facts only; `PromotionFact` is a projection of committed events, not a table. |

## Cost

- **Extra revisions**: one per promotion (the head sync). This is the intentional cost of making the
  authorization basis canonical; it is bounded by the promotion count, not by time.
- **Extra events**: none beyond the existing revision batch — the sync *is* a revision.
- **Extra stores/tables/migrations**: none.
- **Extra background work**: none — no reconciler, no timer, no watcher.

## Honest cost regression

The head sync increases revision frequency relative to G10-W, which raises the weight of CF-W-07
(`planReconciled` is O(tasks) per revision). Recorded as a new trigger on CF-W-07 rather than fixed
here, because a retention window is a separate contract change.
