# G10-W — Revision-Safe Work Evolution: Assessment

Baseline: `main @ ea77783d864ccb660d14c9e13c6008a9241e7715`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.
Parent finding: **CF-V-05** (G10-V carry-forward).

Verdict: **PASS**. The revision contract is enforced (commit-or-refuse, zero partial writes), the
CF-V-05 reproduction is fixed, and the wider revision cases A–H below all behave honestly.

## 1. CF-V-05 — exact reproduction and failure

Minimal repro (pre-W):

```js
controller.start({ projectId, goal: "g", tasks: [taskSpec("task-a")] });   // rev0, task-a READY
await controller.claim(...)                                                // (or simply READY)
controller.plan({ tasks: [taskSpec("task-a")] });                          // rev1
controller.step();                                                         // TASK_STARTED for task-a
```

Before this campaign, `plan()` caught the `PlanReconciliationError` produced by a non-quiescent or
same-id world and committed a **legacy single `PROJECT_REVISED` event** instead. That event raised
the project revision but did not touch `tasks.envelope_json`. The stored envelope therefore stayed
`project_revision = 0`, while the scheduler's `TASK_STARTED` request carried
`expected_project_revision = 0` against a project at revision 1:

```
StateStoreError: expected revision 0, current revision is 1
  at EventStore.#validatePreconditions (src/state/event_store.ts)
  at Scheduler.commit → TASK_STARTED
```

(`RevisionConflict extends StateStoreError` and does not rename itself, which is why the G10-V record
shows the base-class name.) The scheduler then fail-closed every subsequent decision as
`SchedulerInvariantError: active Task input world is stale`, and `status().resume.action` read
`"blocked"`.

After W, the same sequence commits an atomic closure
`[PROJECT_REVISED(rev1), TASK_REAUTHORIZED(task-a)]`; `task-a`'s envelope is bound to
`{revision: 1, digest: head.digest, base_commit: head.head_commit}` and `step()` activates it with
`expected_project_revision = 1`. Asserted behaviourally in
`test/w_revision_safe.test.ts` ("CF-V-05 repro …") and end-to-end in
`scripts/management/delegate-continuity.mjs`.

## 2. Wider revision-case audit (A–H)

| # | Case | Behaviour before W | Behaviour after W |
| --- | --- | --- | --- |
| A | **Retain unchanged** (`READY`/`BLOCKED`) | envelope left on the old head; next activation fails the revision guard (CF-V-05) | `TASK_REAUTHORIZED`, state preserved, envelope on the new head |
| B | **Add** (new id) | worked only while quiescent **and** no blocker existed; a non-quiescent add silently became a single-event revision with no `TASK_CREATED` for the new task → the ProjectIR declared a task with no projection row | atomic `TASK_CREATED` with dependency-derived `initial_state`, always next to its `PROJECT_REVISED` |
| C | **Remove** (dropped id) | quiescent removal staled the task; a non-quiescent removal fell back to legacy and left the retired task schedulable while the ProjectIR no longer declared it | `TASK_STALE` inside the batch, or a typed refusal; history retained |
| D | **Modify same id** | `replacement_task_id_required` was computed, then **discarded** by the fallback: the revision committed and the task at the old id silently changed meaning with its old envelope (or worse, became runnable under a stale authorization) | typed blocker, zero events, no state/evidence inheritance |
| E | **Non-quiescent, no settlement** | legacy single event; envelopes stale; scheduler blocked (CF-V-05) | `quiescence_required` naming the blocking task and attempt ids; zero events |
| F | **Typed invalidation with in-flight work** | the revision was appended first, then the invalidation stales were appended separately (non-atomic, and the envelope problem of A applied to any retained task) | the affected tasks are staled **inside** the same batch and removed from the blocking set; any UNAffected in-flight work still blocks |
| G | **Terminal historical** (`SATISFIED`/`FAILED`/`STALE`) | already preserved by the pure compiler, but the legacy path could not re-anchor anything, so a terminal task coexisted with stale runnable ones | preserved untouched; never re-authorized or staled again |
| H | **Crash / retry / tampering** | the closure was a sequence of independent appends: a crash mid-way left a half-migrated graph (some envelopes old, some new, added tasks missing) | one `appendAtomic` transaction: crash → entirely OLD; identical retry → idempotent; same identity different content → `IdempotencyConflict`; partially-present batch → `AtomicAppendError` (`recovery_required`) |

## 3. Contract enforcement evidence

- Legacy fallback removed. `plan()` is now exactly
  `return this.planReconciled(input).event;`; `#planLegacy` and `#applyTypedInvalidation` are deleted
  (source-firewall assertion in `test/w_adversarial.test.ts`).
- Blocked revisions write **zero** events and leave the canonical snapshot digest unchanged
  (`test/w_adversarial.test.ts` "a refused revision leaves the canonical store fully intact…").
- Forged batches cannot bypass the closure: an envelope bound to the OLD revision is rejected
  (`RevisionConflict`), a `TASK_CREATED` whose `initial_state` contradicts its dependencies is
  rejected, and a `TASK_REAUTHORIZED` for an `ACTIVE` task is rejected by the aggregate.

## 4. Defect found by the W-A10 invariant (pre-existing, fixed in W)

Asserting "`verifyFull()`/`rebuildProjections()` green after a revision" exposed a replay-fatal
validator bug unrelated to revisions:

```
verifyFull FAIL: promotion already satisfied another Task
```

`AggregateValidator.#validateTaskSatisfied` checked
`SELECT entity_id FROM events WHERE event_type='TASK_SATISFIED' AND causation_id=?`, which on a clean
replay matches **the very event being validated** (it is already in the log). Every project that had
ever promoted a task therefore failed its own integrity check and `rebuildProjections()` was
unusable for it. Live appends were unaffected because validation runs before the insert. Fixed by
excluding the event under validation (`event_id != ?`, `-1` on the live path). Verified by
`test/w_revision_safe.test.ts` and the full suite (no regression in 1304 tests).

## 5. Honest limitations

1. Evidence staleness is a post-commit projection repair (no event), so it is not atomic with the
   batch. Fail-open on evidence authority only, never on task authority.
2. The `ProjectIR.head_commit` cannot be re-anchored by a revision (`PlanInput` has no `headCommit`),
   so a second task promotion in the same project cannot satisfy `git.promote`'s expected head.
   Demonstrated and recorded honestly in the dogfood (`bPromotionApplicable: false`). See CF-W-02.
3. `resume.action = "blocked"` is no longer reachable through the public API (it existed for the
   CF-V-05 stale world). The branch remains as defensive observation; its reproduction test
   (`test/e3_resume.test.ts`) was rewritten to assert the new contract. Coverage of the *blocked
   branch itself* is retired with the state it described.
4. No lineage protocol for same-id replacement: refused, by design.
