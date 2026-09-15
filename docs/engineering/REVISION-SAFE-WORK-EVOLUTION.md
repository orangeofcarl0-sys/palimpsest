# Revision-Safe Work Evolution

Internal engineering note. Baseline: `main @ ea77783d864ccb660d14c9e13c6008a9241e7715`.
Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

## The problem

A Palimpsest project is a `ProjectIR` (goal, requirements, decisions, task graph) plus a
materialized Work projection: one row per task with its committed `TaskEnvelope`, one row per
attempt, evidence, promotions. A **plan revision** (`PROJECT_REVISED`) changes the task graph, and
every committed task envelope is bound to a specific `{project_revision, project_digest,
base_commit}`. So a revision is not "one event": it is a *structural closure* -

```
stale the tasks the revision retires
raise the head  (PROJECT_REVISED)
re-authorize every retained runnable task against the new head  (TASK_REAUTHORIZED)
register the tasks the revision adds  (TASK_CREATED, dependency-derived initial state)
```

If that closure is written as several independent appends, a crash (or a validation failure)
mid-way leaves a half-migrated graph: some envelopes on the new head, some on the old, added tasks
missing, retired tasks still schedulable. If it is written as one `PROJECT_REVISED` event only, the
retained envelopes keep the OLD revision and the next scheduler activation fails its revision guard.

## The contract (v1)

`ProjectController.planReconciled(input)` commits the closure as **one `EventStore.appendAtomic`
batch**, or throws a typed `PlanReconciliationError` and writes **zero** events. There is no third
outcome and no legacy fallback.

```
planReconciled(input):
  compilePlanRevision(current, next, tasks, openAttempts, policy, settledTaskIds)   # pure
    ├── blocker  → throw PlanReconciliationError (0 events)
    └── proposal → appendAtomic([stales…, PROJECT_REVISED, TASK_REAUTHORIZED…, TASK_CREATED…])
```

### Quiescence

A structural revision changes the meaning of the graph that running work was authorized against, so
by default it requires a **quiescent** world: no `ACTIVE`/`VERIFYING` task and no open
(`CREATED`/`LEASED`/`RUNNING`) attempt. `quiescence_required` names the exact blocking task and
attempt ids.

### Explicit settlement (typed invalidation)

`plan(input, {changeClass, changedIds})` is the explicit settlement act: it computes the forward
invalidation closure (`computeInvalidationSet`) and stales **exactly those tasks inside the same
batch**. Those tasks (and their attempts) no longer block quiescence. Anything else in flight still
does - typed invalidation is a scalpel, never a blanket "settle everything" escape.

Evidence bound to the settled tasks/attempts loses authority (`status='stale'`). That is a
projection repair with no event of its own, so it remains a second step after the batch commits
(documented limitation, §"Honest limitations").

### Identity is semantic, never the id string

Retention compares the canonical `TaskSpec` fields (objective, dependencies, write paths, required
artifacts, role, skills, scope, definition) - never the `task_id`. A task whose spec changed under an
existing id is a `MODIFY_SAME_ID` blocker (`replacement_task_id_required`): v1 has no lineage
protocol to prove the new node supersedes the old one, so it refuses instead of silently inheriting
the old envelope or minting a new one under the old id. A replacement is declared under a **new**
`task_id`; the old node is retired by REMOVE.

### Terminal history is immutable

`SATISFIED`/`FAILED`/`STALE` tasks are never re-authorized and never staled again. Their history
(events, attempts, evidence) is preserved; only current runnable work is rebound.

### Atomicity, idempotency, fail-closed

`appendAtomic` runs the whole batch in one `BEGIN IMMEDIATE … COMMIT`:

| Case | Behaviour |
| --- | --- |
| crash after any insert | whole batch rolls back; state is entirely OLD |
| identical full-batch retry | each request resolves through its idempotency key to the stored event; nothing rewritten |
| same identity, different content | `IdempotencyConflict` |
| partially-present batch | `AtomicAppendError` (`recovery_required: true`) - never a mixed commit |

## Invariants

- INV-R1: a revision never commits a partial closure (all stales+revise+reauthorize+create in one transaction).
- INV-R2: a blocked revision writes zero events (`PlanReconciliationError` before any write).
- INV-R3: every current runnable (`READY`/`BLOCKED`) envelope's `{project_revision, project_digest}` equals the ProjectIR head.
- INV-R4: retained runnable tasks keep their state; only `envelope_json` moves.
- INV-R5: terminal tasks and their history are untouched.
- INV-R6: a same-id meaning change is refused (`replacement_task_id_required`).
- INV-R7: in-flight work not covered by an explicit settlement blocks (`quiescence_required`).
- INV-R8: the projector is the only writer of `tasks.envelope_json`; the reconciliation is pure
  (no clock, no DB handle, no write) and mints envelopes only through the trusted `TaskPolicy`.

## Where the pieces live

| Concern | Owner |
| --- | --- |
| Pure closure compilation, blockers, diffs | `src/domain/plan_reconciliation.ts` (`compilePlanRevision`) |
| Batch commit, typed errors, in-batch settlement | `src/tools/controller.ts` (`planReconciled`, `plan`, `PlanReconciliationError`) |
| One transaction per batch, idempotency, partial-batch refusal | `src/state/event_store.ts` (`appendAtomic`) |
| Envelope/state projection | `src/state/projector.ts` (`TASK_REAUTHORIZED` rewrites only the envelope) |
| Admission + transition validation | `src/domain/aggregate.ts` |

## Honest limitations (v1)

1. **Evidence staleness is a second step.** `#staleEvidenceForScope` repairs the evidence projection
   after the batch commits; it emits no event and cannot join the transaction. A crash between the
   batch and this repair leaves evidence `active` that should be `stale` (fail-open on evidence
   authority, never on task authority).
2. **The ProjectIR `head_commit` is not re-anchorable by a revision.** `PlanInput` carries no
   `headCommit` and `planReconciled` reuses the current head, so after a promotion the ProjectIR
   head diverges from the real git head and a *second* task's promotion cannot satisfy
   `git.promote`'s expected-head precondition. Only `start({headCommit})` sets a head. Recorded in
   `audits/G10-W-CARRY-FORWARD.md` (CF-W-02).
3. **The `resume.action = "blocked"` branch is now unreachable through the public API.** It existed
   for the CF-V-05 stale-input world (an `ACTIVE` task authorized under an older revision). A
   revision can no longer create that state, which is the fix; the branch remains as defensive
   fail-closed observation and is no longer covered by a reproduction test.
4. **No lineage protocol for same-id replacements.** Deliberate: refusing is honest, guessing is not.
