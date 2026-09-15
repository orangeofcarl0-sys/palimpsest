# G10-Y — Work-Evidence invalidation assessment (Y0)

Baseline `189fcd005885d1d7fdd40174aa6935783be92da6`. Read:
`G10-X-CARRY-FORWARD.md`, `G10-X-W-CARRY-FORWARD-DISPOSITION.md`,
`G10-W-WORK-REVISION-DELIVERY.md`, `src/evidence/**`, `src/tools/controller.ts`,
`src/state/event_store.ts`, `src/state/projector.ts`, `src/domain/aggregate.ts`,
`src/schema/**`, `src/scheduler/**`, `test/**`.

## 1. The defect as found in the code

`planReconciled` committed the revision batch and only then revoked Evidence:

```ts
const events = this.store.appendAtomic(requests, { ... });
if (input.changeClass !== undefined && affected.length > 0) {
  this.#staleEvidenceForScope(affected);          // raw SQL, AFTER the commit
}
```

and `#staleEvidenceForScope` was literally:

```ts
this.store.connection
  .prepare("UPDATE evidence SET status='stale' WHERE project_id=? AND evidence_id=?")
  .run(this.projectId, holder.evidence_id);
```

The method's own docstring admitted the limitation:

> This is a projection repair without an event of its own: it cannot join the
> appendAtomic batch, so it runs as an explicit second step after commit.

So the durable state `new ProjectIR + staled task + old Evidence still active` was
reachable whenever the process died between the two steps.

## 2. Independent reproduction (§6)

`scripts/audit/y0-cf-w-03-repro.mjs` — a REAL crash, not a mock. The revision runs
in a **child process** whose `appendAtomic` is wrapped by a thin proxy that
delegates to the genuine `EventStore` and then `process.kill(pid, "SIGKILL")` the
instant the batch's SQLite `COMMIT` has returned durably. The parent reopens the
same database file.

Scenario: `rev0` → task-a ACTIVE → attempt RUNNING → ACTIVE Evidence E on that
attempt → gate `g1` (all: `exists(tests_pass)`) → PASS on E. Then a typed
invalidating revision `rev0→rev1` (`behavior_change`, `changedIds: ["task-a"]`),
runnable because the typed act settles task-a inside the batch.

Pre-fix result (`classification: FAIL_OPEN_MIXED_STATE`):

```json
{
  "projectRevision": 1,
  "taskAState": "STALE",
  "taskBRegistered": true,
  "evidenceStatus": "active",
  "activeEvidenceViews": ["evidence-e911…"],
  "gateVerdictAfterRevision": "PASS",
  "gateEvidenceUsed": ["evidence-e911…"],
  "staleEvidenceEvents": 0
}
```

The revision committed, the old world was retired, and the gate still returned
**PASS** from Evidence the revision was supposed to revoke.

Post-fix result on the identical crash (`classification: CLOSED_COMPLETE_NEW_WORLD`):

```json
{
  "projectRevision": 1,
  "taskAState": "STALE",
  "taskBRegistered": true,
  "evidenceStatus": "stale",
  "activeEvidenceViews": [],
  "gateVerdictAfterRevision": "INCOMPLETE",
  "gateEvidenceUsed": [],
  "staleEvidenceEvents": 1
}
```

## 3. Gate-authority severity proof (§7)

`GateEngine.evaluate` → `activeEvidenceViews` ends with

```ts
return views.filter((view) => view.status === "active");
```

The engine has no other source of authority. `status` is therefore the current
Work gate authority — the fail-open state above is not a bookkeeping inaccuracy
but a live authority leak, and it was demonstrated end to end (gate `PASS` on
revoked Evidence).

## 4. Exact invalidation scope (§11–§14)

The old repair built its scope as

```text
affected task IDs ∪ all attempt IDs of those tasks  (only when changeClass present)
→ stale active Evidence whose subject_id matches, by STRING comparison
```

Audit by subject kind:

| `subject_type` | production producer | old repair behaviour | Y decision |
| --- | --- | --- | --- |
| `attempt` | `controller.gate()` (the only `EVIDENCE_ADDED` producer) | matched when the attempt belonged to an affected task | typed match on `(attempt, attemptId)` |
| `task` | none today | matched only if a task id string collided with an attempt/task id | typed match on `(task, taskId)` |
| `commit` | none | matched only by string collision | **excluded** from the automatic policy, reported in `excludedBySubjectType` |

Two facts that shaped the decisions:

1. **The old match was untyped.** It compared `subject_id` alone, so a
   `commit`-subject item whose id happened to equal an attempt id would have been
   revoked accidentally. Typed pair matching *narrows* that accidental behaviour
   and is the correct declared semantics.
2. **Removal-only revisions are currently vacuous for Evidence.** An
   `ACTIVE`/`VERIFYING` task cannot be removed without a change class (quiescence
   blocks it), and a `READY`/`BLOCKED` task has no attempts, hence no gate
   Evidence. Y nevertheless adopts the uniform rule — the revoked set is exactly
   the set of tasks the batch marks `TASK_STALE` — because it is the coherent
   invariant and it guards future producers.

## 5. Admission as found

`AggregateValidator.validate` routed `EVIDENCE_ADDED`/`EVIDENCE_STALE` into
`default: return;` — **no admission validation at all**, so a caller could append
`EVIDENCE_STALE` whose `payload.evidence_id` disagreed with `entity_id`, or that
targeted unknown or already-revoked Evidence (the projector would then throw
"stale Event refers to unknown Evidence" for the unknown case only).

`#appendInTransaction` resolves idempotency **before** validation
(`event_store.ts:379-393`), so strengthening admission is safe for retries: an
idempotent replay returns the recorded event without re-running the validator.

## 6. Projection and replay

`#applyEvidenceStale` is the only writer of `evidence.status`, and
`rebuildProjections()` clears projections and replays the chain without
re-validating. Once the stale events are canonical, current authority becomes a
pure function of `EVIDENCE_ADDED` + `EVIDENCE_STALE` in order, and §28 holds with
no repair pass.

## 7. What the audit changed about the plan

* Confirmed §2's preference — reuse the existing event, add no new species.
* Confirmed §17/§18 ordering is admissible: `TASK_REAUTHORIZED` carries the NEW
  revision as its `expected_project_revision` and must therefore follow
  `PROJECT_REVISED`, while `EVIDENCE_STALE` carrying the OLD revision must precede
  it. The delivered order satisfies both.
* Established that `taskId`/`attemptId` string matching had to become a typed pair
  match (§12).
* Established that `commit`-subject Evidence has no production producer and no
  declared rule, so it stays out (§13).
* Found a NEW pre-existing defect outside Y's scope — see
  `G10-Y-CARRY-FORWARD.md`, `CF-Y-01`.
