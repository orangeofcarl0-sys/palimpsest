# G10-Z — Promotion-authority assessment (Z0)

Baseline `d809a9082f7534077f8deb02695b85f14dabac52`. Read:
`G10-Y-CARRY-FORWARD.md`, `G10-Y-EVIDENCE-INVALIDATION-DELIVERY.md`,
`G10-X-PROJECT-HEAD-DELIVERY.md`, `G10-W-WORK-REVISION-DELIVERY.md`,
`src/effects/promotion.ts`, `src/recovery/**`, `src/tools/controller.ts`,
`src/domain/aggregate.ts`, `src/domain/project_head.ts`,
`src/domain/plan_reconciliation.ts`, `src/scheduler/**`, `src/state/**`,
`src/evidence/**`, `src/project_management/**`, `test/**`.

## 1. CF-Y-01 as found in the code

`PromotionManager.promote` validated the canonical **source** and **expected
head** and then wrote the intent and ran the effect:

```ts
const canonicalSource = this.canonicalAttemptResultCommit(options.attemptId);
if (options.sourceCommit !== canonicalSource) throw …caller_source_not_canonical…
const canonicalHead = this.canonicalExpectedHeadSync();
if (options.expectedHeadCommit !== canonicalHead) throw …caller_head_not_canonical…
this.#appendPrepared(promotionId, options);
const outcome = await this.#effects.invoke(this.#effects.actions.gitPromote, …);
```

Nothing consulted the **task**. A task retired by a revision still had a
`COMPLETED` attempt with a canonical `result_commit`, and the canonical expected
head remained derivable, so the promotion committed and moved the branch for work
the project had already declared dead.

## 2. Independent reproduction

`scripts/audit/z0-promotion-authority-repro.mjs`, scenario `cfy1`. The full field
record required by §5:

| Fact | Before revision | After revision |
| --- | --- | --- |
| ProjectIR revision / head | 0 / `cc…cc` | 1 / `cc…cc` |
| task-a state | VERIFYING | **STALE** |
| task-a envelope (rev / base) | 0 / `cc…cc` | 0 / `cc…cc` (retired, not re-authorized) |
| attempt state | COMPLETED | COMPLETED (history retained) |
| report `result_commit` / `base_commit` | `…01` / `cc…cc` | unchanged |
| Evidence status | active | **stale** (the G10-Y closure) |

Then `promoteAttempt(attemptId)`:

```text
pre-fix   → PROMOTION_COMMITTED (event 16), resulting head …02,
            which DIVERGES from the ProjectIR head cc…cc
            TASK_SATISFIED events: 0  (task-a can never satisfy)
post-fix  → REJECTED: task_retired
```

`classification: CLOSED_RETIRED_WORK_HAS_NO_PROMOTION_AUTHORITY`.

## 3. The PREPARED / revision race reproduction

Scenario `race`. A promotion-eligible task, then a git port that performs the
merge and dies before the ledger records it (the genuine Crash B window):

```text
PREPARED committed: 1     COMMITTED: 0     task-a: VERIFYING
merges performed:   1     (the branch really moved)
```

A typed invalidating revision was then attempted:

```text
pre-fix   → revision COMMITTED (revision 1), task-a STALE, Evidence stale
            recovery pass 1: in-flight (ordarium state "dispatched")
            recovery pass 2 (after a 1-hour lease advance): STILL in-flight
            → the external effect had occurred, the Work was retired,
              and the intent can never settle honestly
post-fix  → BLOCKED: promotion_settlement_required
            revision 0, task-a VERIFYING, zero TASK_STALE, Evidence still active
```

`classification: CLOSED_PREPARED_FENCES_REVISION`.

The pre-fix outcome is worse than a simple "stale task promoted": the effect had
already landed, the Work was retired, and recovery neither terminalized nor
redispatched - a durable inconsistency with a landed external effect and no honest
Work outcome.

## 4. Recovery audit

`reconcileAll()` iterated `#preparedPromotions()` and reconciled or redispatched
**without re-checking any authority**. `#redispatch` existed precisely for
"PREPARED written but the invocation never started" and would run the effect
whatever the task's state had become. That is §27's defect.

## 5. Revision-admission audit

`planReconciled` inspected only the quiescence picture (ACTIVE/VERIFYING tasks and
open attempts). A `PREPARED` promotion implies a VERIFYING task, so:

* **removal / replacement** were already blocked by `quiescence_required` - but
  with a generic reason, and only incidentally;
* **typed invalidation** deliberately relaxes quiescence for the tasks it settles
  (the G10-W contract), so it could retire a task whose external effect was
  outstanding. This is the load-bearing hole §24 names.

There was also no `PROMOTION_PREPARED` validation at all: `PROMOTION_*` fell
through `default: return;` in `AggregateValidator.validate`.

## 6. Ordering audit (§26)

`planReconciled` had no head-drift check; only `runTurn` carried a
`head_sync_required` barrier. A direct `planReconciled` while `SYNC_REQUIRED`
therefore anchored new tasks on a base the canonical promotion chain had already
superseded - and, under Z's same-base rule, produced work that could not be
promoted until a sync happened.

## 7. Replay audit (load-bearing finding)

`EventStore.verifyFull()` and `rebuildProjections()` re-validate every event
against the projections they rebuild *in order*:

```ts
clearProjections(this.connection);
for (const event of events) {
  this.#aggregateValidator.validate(this.connection, event);
  this.projector.apply(this.connection, event);
}
```

Any new validator must therefore be **replay-safe**. The first implementation of
the `PROMOTION_PREPARED` validator derived the promotion chain from the **events**
table, which always contains the future: replaying a historical `PREPARED` saw a
later `PROMOTION_COMMITTED` and refused it with
`cross_revision_promotion_not_supported`. Fixed by deriving chain facts from the
`promotions` **projection**, which holds exactly what has been applied. This also
confirmed G10-Y's evidence validator is replay-safe by construction (its
`EVIDENCE_ADDED` row is replayed before its `EVIDENCE_STALE`).

## 8. What the audit changed about the plan

* Confirmed §13's same-base rule is the right v1: the reachable cross-revision
  case is exactly the effect-first/TASK_SATISFIED-later-fail path.
* Discovered that **report-vs-envelope staleness cannot be recorded at all** -
  `#validateAttemptTransition` refuses a completed report whose input identity
  does not match the task envelope. So Z-N06 became a two-part proof: the state
  is unconstructible, and the assessor still refuses it if a legacy log carried
  it.
* Discovered three existing suites promoted from `ACTIVE` without settling the
  candidate batch; §10 mandates `VERIFYING`, so those flows were corrected to the
  canonical order rather than weakening the rule.
* Discovered that §32's terminal replay must precede the assessment, otherwise a
  replay is refused for the SATISFIED state the promotion itself produced.
* Established that the fence must be evaluated on the **retirement set** (a
  pre-compile superset) and before the generic blockers, so the settlement bypass
  cannot cross it and the most specific reason is reported.
