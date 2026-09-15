# G10-AB — Project operating posture assessment (AB0)

Baseline `9f29547b0eeccc524b0120ef13e9ce55656429ee`. Read:
`G10-AA-CARRY-FORWARD.md`, `G10-V-CARRY-FORWARD.md`,
`PROJECT-AS-ASSET-ARCHITECTURE.md`, `MANAGEMENT-AUTONOMY-MODEL.md`,
`src/recipes/**`, `src/advisor/**`, `src/project_management/**`,
`src/project_workspace/**`, `src/application/**`, `src/tools/**`, `src/serve.ts`,
`src/install.ts`, `web/src/**`.

## 1. Where is the selected Focus/Explore/Coordinate stored?

**Nowhere durable.** Before AB the mode existed in three derived places only:

* `src/recipes/registry.ts` — each recipe DECLARES the `baseMode`/`modifier` it
  expresses (`focus.v1`, `explore.v1`, `coordinate.v1`, `verify.v1`, `monitor.v1`).
  That is what a recipe *is*, not what the project *prefers*.
* `src/advisor/advisor.ts` — derives a recommended mode **per call** from evidence
  (`shouldExplore`, `shouldCoordinate`, `prefersExplore`). Nothing is written.
* `src/project_management/service.ts` — one hardcoded `definition.baseMode ===
  "EXPLORE"` branch when starting a local recipe.

There is no store, no port and no event for a project-level Work Mode.

## 2. Does any project-scoped RecipePlan survive restart?

**No.** `src/recipes/index.ts` states the layer "owns no store and no mutator";
`compiler.ts` is pure; `execution.ts` "owns no store and no mutator beyond the
injected services". Plans are materialized and compiled per execution. There is no
`recipe_store.ts` and no table for one (verified by scanning `src/recipes/**` for
`CREATE TABLE`/`DatabaseSync`).

## 3. What does the UI currently render as Work Mode?

A literal apology
(`web/src/project_workspace/ProjectWorkspaceView.tsx`):

> "not recorded by this installation (FOCUS / EXPLORE / COORDINATE + VERIFY /
> MONITOR are per-task advisor recommendations, not a persisted project setting)"

with `advisorConfigured` gating whether even that is shown.

## 4. Can management inspect a project-level preferred Work Mode?

**No.** `ProjectManagementService` exposed `assess`, `recommend`, `previewStep`,
`step`, `runBounded`, `requestModeChange`, `applyOperatorModeChange`,
`reconcileProjectHead` — no posture read, and `ManagementAssessment` carried only
`{profile, view, candidates}`.

## 5. Which management actions currently leave canonical events?

| Action class | Canonical effect |
| --- | --- |
| `ADVANCE_MECHANICAL_WORK` | `controller.runTurn` → scheduler events (TASK_STARTED/ATTEMPT_CREATED/…) |
| `DISPATCH_LOCAL_WORK`, `APPLY_LOCAL_PLAN_REVISION` | `controller.plan` → `PROJECT_REVISED` |
| `START_LOCAL_RECIPE` | recipe execution → ReasoningCell / branch artifacts |
| `RECONCILE_PROJECT_HEAD` | `controller.reconcileProjectHead` → `PROJECT_REVISED` (head sync) |
| `RUN_LOCAL_VERIFY` | the injected verify port (unknown to this layer) |

## 6. Which actions are recommendation-only / no-op?

`OBSERVE`, `RECOMMEND` and `PREPARE` — each returns "…without mutation" and calls
no governed service.

## 7. Which outputs expose stable canonical refs?

**None.** `ManagementStepResult` was `{ status, action?, detail }`: prose only.
`canonicalOutcomeRefs` did not exist, so no caller could correlate a management
decision with the canonical mutation it caused.

## 8. What is currently shown as recent management actions?

A UI-session-only list with the note "No canonical management action history is
exposed over the typed routes; this list is UI session state." Reloading the page
lost it.

## 9. CF-W-06 reachability reassessment (§50)

**No supported public protocol produces a `READY` task with a dependency that is
not `SATISFIED`.** The argument is mechanical:

* `TASK_READY` is only reachable from `BLOCKED | ACTIVE | VERIFYING`
  (`state_machine.ts`), and the `BLOCKED → READY` transition **re-checks** that
  every `depends_on` is `SATISFIED` (`AggregateValidator#validateTaskReady`),
  failing with "Task dependencies are not satisfied" otherwise.
* A newly ADDed task's initial state is computed from live dependency states
  (`compilePlanRevision`), and `missing_registration` blocks an unregistered
  dependency outright.
* A retained task's `depends_on` cannot change: a `TaskSpec` that differs under the
  same id is `MODIFY_SAME_ID` → `replacement_task_id_required`.
* `TASK_STALE` is unreachable from `SATISFIED` (`TASK_STALE: BLOCKED | READY |
  ACTIVE | VERIFYING`), so a `SATISFIED` dependency can never become
  non-`SATISFIED` afterwards.

Conclusion: `READY` is currently **transition-maintained**, and CF-W-06 stays
deferred with its trigger unchanged. The dependency re-check is carried as
defence in depth for future concurrency / cross-revision work rather than widened
into AB. AB therefore does **not** redesign task state.

## 10. Findings that shaped the implementation

* `SqliteManagementPreferenceStore` already owns the involvement profile AND an
  append-only `management_mode_history` (seq, from/to, updated_by, at), so AB
  **reuses** it and adds only an optional `history?` read on the port rather than
  creating a second management-mode truth.
* The `UserManagementControlPort` had no `history()`, so the operating-posture view
  needed the additive optional method.
* The management layer's firewalls (V-N01) allow-list its imports and forbid
  effect/federation authority; the new `project_operating` plane therefore had to
  be allow-listed explicitly **and** independently proven authority-free
  (`AB-N02`), rather than the firewall being loosened.
* The V surface tests assert the application management surface's **exact** key
  set, so the new reads had to be added there deliberately, with the
  operator-only `setWorkModePreference` asserted ABSENT.
* `project_operating/posture.ts` must import the management **leaf** modules, not
  the `project_management` barrel, to avoid a barrel cycle with
  `makeProjectManagementService`.
