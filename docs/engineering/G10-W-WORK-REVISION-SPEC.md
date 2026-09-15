# G10-W — Revision-Safe Work Evolution (Spec)

Baseline: `main @ ea77783d864ccb660d14c9e13c6008a9241e7715`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.
Scope: `src/domain/plan_reconciliation.ts`, `src/tools/controller.ts`, `src/state/event_store.ts`,
`src/domain/aggregate.ts`, `src/application/http.ts`, tests, `scripts/management/delegate-continuity.mjs`.
Parent finding: CF-V-05 (G10-V carry-forward, Work-layer defect).

## Firewalls

```
Revision ≠ Event burst              Closure ≠ Partial closure
Blocked revision ≠ Failed revision  (0 events, graph byte-identical)
Retained ≠ Recreated                Removed ≠ Forgotten
Terminal ≠ Re-authorizable          Identity = semantic TaskSpec, not task_id
Explicit settlement ≠ Blanket quiescence waiver
Pure compilation ≠ Commit           Policy is the only envelope minter
Projector = the only envelope writer
Mode ≠ Authority                    DELEGATE revision ≠ goal/requirement change
```

## 1. Contract

`planReconciled(input: PlanInput): PlanReconciliationOutcome` and its user-facing verb
`plan(input): SchedulerEvent` (which is exactly `planReconciled(input).event`, with **no fallback**).

Outcome — exactly one of:

- **Commit**: one `appendAtomic` batch in this deterministic order
  1. `TASK_STALE` per removed runnable task, and per explicitly-settled (typed-invalidation) task
  2. `PROJECT_REVISED`
  3. `TASK_REAUTHORIZED` per retained `READY`/`BLOCKED` task (fresh envelope on the new head)
  4. `TASK_CREATED` per added task (`initial_state` derived from dependencies)
- **Refusal**: `PlanReconciliationError { kind, refs }` with **zero** events written. Kinds:
  - `quiescence_required` — refs = blocking `ACTIVE`/`VERIFYING` task ids + open
    `CREATED`/`LEASED`/`RUNNING` attempt ids.
  - `replacement_task_id_required` — refs = task ids whose `TaskSpec` changed under the same id.
  - `missing_registration` — refs = the added task id + unregistered dependency ids.

## 2. Quiescence and settlement

| Input | Requirement |
| --- | --- |
| no `changeClass` | the project must be quiescent; otherwise `quiescence_required` |
| `changeClass` + `changedIds` | the forward invalidation closure of the delta is staled INSIDE the batch and is removed from the blocking set; any UNAffected `ACTIVE`/`VERIFYING` task or open attempt still blocks |

`settledTaskIds` is passed to the pure compiler; the compiler only removes those exact tasks from
the blocking set (it never waives quiescence wholesale).

## 3. Diff classes

| Class | Condition | Effect |
| --- | --- | --- |
| `RETAIN_UNCHANGED` | same semantic spec, `READY`/`BLOCKED` | `TASK_REAUTHORIZED`; state preserved |
| `RETAIN_UNCHANGED` | same semantic spec, `ACTIVE`/`VERIFYING` | none (only reachable when settled by a typed invalidation, which stales it) |
| `TERMINAL_HISTORICAL` | state `SATISFIED`/`FAILED`/`STALE` | untouched, never re-authorized or staled |
| `ADD` | id absent from the projection | `TASK_CREATED` with dependency-derived `initial_state` |
| `REMOVE` | id absent from the new ProjectIR | `TASK_STALE` (history retained) |
| `MODIFY_SAME_ID` | semantic spec changed under an existing id | **blocker** `replacement_task_id_required` |

Semantic equality = canonical digest of `{objective, depends_on, write_paths, required_artifacts,
role?, suggested_skills?, scope_id?, definition_id?}`.

## 4. Transaction guarantees

`EventStore.appendAtomic(requests, {faultHook?, committedAt?})`:

- every request parsed up front (a malformed batch never opens a transaction);
- events appended sequentially so later events observe earlier effects (a `TASK_CREATED` after
  `PROJECT_REVISED` sees the new head);
- identical full-batch retry → idempotent, no new events;
- same identity + different content → `IdempotencyConflict`;
- partial presence → `AtomicAppendError` (`recovery_required: true`), fail closed;
- any error → whole batch rolled back, original typed error rethrown.

## 5. Acceptance (W-A)

| ID | Statement |
| --- | --- |
| W-A01 | `start(rev0, A READY) → plan(rev1) → step()` activates A; A's envelope `{revision, digest}` equals the rev1 head; a `TASK_REAUTHORIZED` exists (CF-V-05 fixed) |
| W-A02 | rev1 retains `A READY` + `B BLOCKED`: states preserved, both envelopes rebound, scheduler continues |
| W-A03 | rev1 adds `B(depends_on A)`: real `tasks` row, `BLOCKED` while A unsatisfied, `READY` once A is `SATISFIED` |
| W-A04 | rev1 removes a `READY`/`BLOCKED` task: `TASK_STALE`, history retained, never scheduled again |
| W-A05 | same-id objective change: `replacement_task_id_required`, zero events, no state/evidence inheritance |
| W-A06 | `ACTIVE` task / open attempt without settlement: `quiescence_required`, zero revision events, live worker stays valid |
| W-A07 | typed invalidation settles affected tasks in-batch; an UNAffected in-flight task still blocks |
| W-A08 | crash after the `PROJECT_REVISED` insert and after one re-authorization: state entirely OLD after reopen |
| W-A09 | identical full-batch retry no-op; same identity different content conflict; partial batch fail-closed |
| W-A10 | every current runnable envelope equals the ProjectIR head; terminal history/evidence untouched; revision-anchored holds read correctly; `verifyFull`/`rebuildProjections`/`quickCheck` green |
| W-A11 | typed invalidation still stales affected evidence |
| W-A12 | source firewall: projector imports no policy, is the only `envelope_json` writer; one scheduler, one `CoreProjector`; `project_workspace/service.ts` tokens intact |

## 6. Non-goals

- No lineage protocol for same-id replacement (v1 refuses).
- No automatic settlement: quiescence or an explicit typed invalidation only.
- No second task store, no shadow envelope cache, no hidden projection repair beyond the documented
  evidence-staleness second step.
- No change to the `ProjectIR`/`TaskEnvelope`/event wire contracts.
