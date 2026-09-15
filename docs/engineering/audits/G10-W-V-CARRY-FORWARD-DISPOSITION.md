# G10-W — V Carry-Forward Disposition

Parent: `audits/G10-V-CARRY-FORWARD.md` (CF-V-01…CF-V-12). Baseline for G10-W:
`main @ ea77783d864ccb660d14c9e13c6008a9241e7715`.

No `BLOCKER_IN_W`.

| ID | Kind | G10-W disposition |
| --- | --- | --- |
| CF-V-05 | defect (Work layer) | **CLOSED_IN_W**. The revision contract now commits the complete structural closure as one atomic batch or refuses with zero events; retained runnable tasks are re-authorized against the new head (`TASK_REAUTHORIZED`), so `start() → plan() → step()` activates the task on the new revision instead of failing `expected revision N, current revision M`. The legacy single-event fallback that caused the defect is deleted. Evidence: `test/w_revision_safe.test.ts` (CF-V-05 repro), `audits/G10-W-WORK-REVISION-ASSESSMENT.md` §1, `scripts/management/delegate-continuity.mjs`. |
| CF-V-06 | semantics | **REASSESSED, still open (deferred, unchanged priority)**. `ADVANCE_MECHANICAL_WORK` is derivable only for a `READY` task with a non-terminal attempt. G10-W did not create or remove that state: a typed invalidation now *stales* an `ACTIVE` task (it does not return it to `READY`), and quiescence keeps `READY`+live-attempt worlds out of revisions rather than producing them. The derived-view fact is still needed for the MANAGE scenario, and the dogfood still injects it. No new evidence changed the assessment. |
| CF-V-01 | product/route | **CLOSED_IN_W**. `GET /api/manage/recommend` and `GET /api/manage/preview` are now canonical, read-only HTTP routes distinct from an unconfirmed `step` (`src/application/http.ts`). Test: `test/v_management_autonomy.test.ts` ("CF-V-01 …"). The real host dogfood reads both routes over its own HTTP surface. |
| CF-V-02 | product | Unchanged. No canonical management-action history (UI session state only). Not in W's scope. |
| CF-V-03 | product/semantics | Unchanged. Work-Mode axis still not persisted. |
| CF-V-04 | product | Unchanged. `historySummary` still merges only association/journal records. |
| CF-V-07 | harness/product | Unchanged. Candidate shadowing in refusal tests still requires isolating the open-loop kind. |
| CF-V-08 | semantics | Unchanged. No cross-project asset link. |
| CF-V-09 | scale | Unchanged. `ProjectWorkspaceService.assets()` still unpaginated. |
| CF-V-10 | boundary | Unchanged. External Personal Asset System still unimplemented. |
| CF-V-11 | deployment | Unchanged. Management preference store still deployment-local. |
| CF-V-12 | relations | Unchanged. Campaign linked-project identity conflict still skipped honestly. |

## Notes on the G10-W descendants

- G10-W closed one **new** Work-layer defect found by its own invariant suite (the replay-fatal
  `TASK_SATISFIED` causation check that broke `verifyFull`/`rebuildProjections` for any
  promotion-bearing project). See `audits/G10-W-CARRY-FORWARD.md` CF-W-01.
- G10-W also recorded a real limitation of the revision contract (`PlanInput` cannot re-anchor
  `head_commit`, so a second promotion in one project cannot satisfy `git.promote`). See CF-W-02.
