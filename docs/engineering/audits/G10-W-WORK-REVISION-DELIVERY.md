# G10-W — Work Revision Delivery

Baseline: `main @ ea77783d864ccb660d14c9e13c6008a9241e7715`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

## Delivered

| Area | Files |
| --- | --- |
| Revision contract | `src/tools/controller.ts` — `plan()` is exactly `planReconciled(input).event` (no fallback); in-batch settlement of the typed-invalidation closure; `#planLegacy`/`#applyTypedInvalidation` deleted; `PlanReconciliationError` is the only refusal surface |
| Pure reconciliation | `src/domain/plan_reconciliation.ts` — `settledTaskIds` input; quiescence computed over UNSettled in-flight work; blocker `refs` list only the blocking tasks/attempts |
| Atomic batch | `src/state/event_store.ts` — `appendAtomic` (pre-existing in this line) is now the only path a revision uses; transactional rollback, idempotent retry, conflict on identity reuse, fail-closed partial batch |
| Integrity fix | `src/domain/aggregate.ts` — the `TASK_SATISFIED` "one promotion satisfies one task" check no longer self-matches on replay (`verifyFull`/`rebuildProjections` were fatal for any promotion-bearing project) |
| CF-V-01 routes | `src/application/http.ts` — `GET /api/manage/recommend`, `GET /api/manage/preview` (read-only, GET-only) |
| Tests (changed) | `test/acceptance.test.ts`, `test/debugger_controls.test.ts`, `test/v_project_workspace.test.ts`, `test/invalidation.test.ts`, `test/e3_resume.test.ts`, `test/architecture_modes.test.ts`, `test/v_management_autonomy.test.ts` — all with in-file justification comments |
| Tests (new) | `test/w_revision_safe.test.ts` (13), `test/w_adversarial.test.ts` (10) |
| Real host | `scripts/management/delegate-continuity.mjs` → `.dogfood/g10w-delegate-continuity.json` |
| Docs | `REVISION-SAFE-WORK-EVOLUTION.md`, `G10-W-WORK-REVISION-SPEC.md`, `G10-W-WORK-REVISION-CAMPAIGN.md`, `audits/G10-W-{WORK-REVISION-ASSESSMENT,V-CARRY-FORWARD-DISPOSITION,REVISION-ANTI-WASTE,WORK-REVISION-DELIVERY,DELEGATE-CONTINUITY-EVIDENCE,CARRY-FORWARD}.md`, updated `docs/engineering/README.md` |

## Tests changed and why (no coverage deleted)

| Test | Change | Justification |
| --- | --- | --- |
| `acceptance.test.ts` "7. revision change …" | no-settlement revision now asserted to throw `PlanReconciliationError` with **zero** events; the STALE outcome is produced via `changeClass: "contract_breaking"` + `changedIds` (in-batch settlement) | a revision now requires quiescence **or** an explicit invalidation that settles the affected work; the old code relied on the deleted legacy fallback |
| `debugger_controls.test.ts` DBG-REV-A01 | same-id meaning swap now asserts `replacement_task_id_required` + zero events + the hold still gating its own task | the hazard the test guarded (a hold rebinding to a different task reusing an id) is now prevented structurally |
| `debugger_controls.test.ts` HOLD-GOV-A01 | the revision retains `task-1` and adds `task-3`; the hold is still asserted stale with `setAtRevision`/`currentRevision` | the same-id swap that produced the divergence is refused; staleness is proven by the revision bump alone |
| `debugger_controls.test.ts` HOLD-GOV-A02 | revision now removes `task-2` by retaining `task-1` verbatim | a same-id objective change is refused; the orphan-hold intent is unchanged |
| `debugger_controls.test.ts` HOLD-ID-A01 / A03 | identity swap is refused (typed blocker, zero events) and the hold's identity/badge behaviour is asserted over a VALID retaining revision | a definition identity cannot change under an existing id, so the historical-vs-current attribution hazard is gone; the projection assertions are preserved on the reachable revision |
| `v_project_workspace.test.ts` golden fixture | one mechanical `step()` (scheduler `TASK_READY`) settles the failed batch **before** the first revision | a revision now requires quiescence; this is the normal settle-then-revise path |
| `invalidation.test.ts` metadata_only | now asserts the typed `quiescence_required` refusal with the chain/evidence unchanged (revision, states, evidence all asserted) | `metadata_only` settles nothing, so a live batch must fail closed; the "does not stale" intent is preserved and strengthened |
| `e3_resume.test.ts` | renamed to "status stays observable when a live world refuses a revision"; asserts the typed refusal, revision unchanged, `resume.action = "awaiting_worker"`, in-flight attempt listed | the "stale world" the test described was CF-V-05 and is now unreachable |
| `architecture_modes.test.ts` ARCH-A05 | the in-flight batch is settled through claim → report → scheduler `TASK_READY` before the architecture revision | same settle-then-revise requirement; the assertion that the pre-revision attempt stays governed is unchanged |
| `v_management_autonomy.test.ts` | **added** the CF-V-01 route test (no existing assertions changed) | new coverage for the new routes |

## Gates

| Gate | Result |
| --- | --- |
| `pnpm run build` (`tsc -b`) | clean |
| `pnpm exec vitest run` | 144 files / 1304 tests, all green (baseline 142 / 1280; +13 revision-safe, +10 adversarial, +1 CF-V-01) |
| `node scripts/management/delegate-continuity.mjs` | PASS — `dshPrincipal: true`, `dshAttempt: false`, 36/36 checks, `revision 0 → 1` |
| `fixtures/**` | untouched |
| Wire contract / migrations | untouched (no new event type, no payload change, no migration) |
| Baseline commit | `ea77783d864ccb660d14c9e13c6008a9241e7715` |

## Required CI (blank by design)

The Required-CI table is intentionally blank for this delivery commit and is filled at closure time.

| Job | Status |
| --- | --- |
| build |  |
| test |  |
| e2e |  |
| host conformance |  |

## Honest deviations

1. **Evidence staleness is a second, non-transactional step.** The typed-invalidation settlement of
   *tasks* rides inside the batch; the evidence-status projection repair (`#staleEvidenceForScope`)
   emits no event and runs after commit. A crash in between leaves evidence `active` that should be
   `stale` — fail-open on evidence authority only.
2. **`ProjectIR.head_commit` is not re-anchorable by a revision.** `PlanInput` carries no
   `headCommit`, so after a promotion the ProjectIR head diverges from the real git head and a
   second task's promotion cannot satisfy `git.promote`. The real-host dogfood demonstrates this
   honestly (`bPromotionApplicable: false`) and stops at the normal `needs_promotion` escalation.
3. **The `resume.action = "blocked"` branch is retired from coverage** together with the state it
   described (a stale-input world). The branch remains as defensive observation.
4. **The real DSH host does not execute the Work attempt.** It exposes the project/manage application
   HTTP routes but no remote claim/report/gate channel, so the attempt runs on the real
   scheduler/controller/effects stack against the same deployment; recorded as
   `dshAttempt: false` with that exact reason.
5. **`test/debugger_controls.test.ts` HOLD-ID-A01/A03** now assert the refusal instead of a
   same-id identity swap; the *projection* assertions (historical `definitionId`, absence not
   synthesized, no badge leakage) are preserved over a valid retaining revision.
