# Canonical Project-Head Evolution

Internal engineering note. Baseline: `main @ f639181199da9ccd7acb3fac2c46392e0b82eb04`
(G10-W closure). Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

## The problem

A Palimpsest project has exactly one canonical head commit — `projects.head_commit` inside the
ProjectIR — and a promotion ledger (`PROMOTION_COMMITTED` events) that records which effect
actually moved the git branch. Before G10-X the two never met:

- `planReconciled` reused `current.head_commit`, so a revision could not re-anchor the head;
- the CLI promote path passed `effects.git.head()` (an *ambient* value) as the "expected" head;
- nothing advanced `projects.head_commit` after a promotion.

The consequence was CF-W-02: after the first promotion the ProjectIR head stayed at the genesis
commit while the real branch moved on, so a second `git.promote` could not satisfy its expected-head
precondition and every multi-task project stalled at `needs_promotion`. Worse, the authorization
basis on the log and the live branch could diverge silently.

## The model

There is one canonical head per project, derived — never stored twice:

```
projects.head_commit                     the authorization basis (ProjectIR)
PROMOTION_COMMITTED.resulting_head_commit the proven effect head (promotion ledger)
git.head()                               a DIAGNOSTIC only, never an input
```

`deriveProjectHeadStatus({project, promotions})` reconstructs the **contiguous** promotion chain
starting at the project head and returns one of three states:

| State | Meaning |
| --- | --- |
| `IN_SYNC` | the head equals the proven effect head (including "no promotion chained") |
| `SYNC_REQUIRED` | the head is behind the proven effect head: a mechanical reconciliation is due |
| `CONFLICT` | a `PROMOTION_COMMITTED` expected a head that is not the running chain head |

The chain rule is strict. A fact that is not anchored on the running chain head is a `CONFLICT`; the
scan stops there and later facts are **never** adopted. "Take the last `resulting_head_commit`" is
exactly the bug this replaces.

## The two moving parts

### 1. Product-safe promotion (`promoteAttempt`)

The caller names the **attempt** (and optionally a registered gate). Nothing else.

```
controller.promoteAttempt({ attemptId, gateId? })
  source   = AttemptReport.result_commit        (canonical; caller cannot name it)
  expected = canonical proven effect head        (canonical; caller cannot name it)
  → PromotionManager.promote({ attemptId, source, expected })   # strictly re-validated
```

The legacy `promote(attemptId, sourceCommit, expectedHeadCommit)` remains reachable only as an
expert/internal path: its arguments are strictly validated against the same canonical derivations,
so a caller cannot smuggle a head through it either. Divergence (the live branch is neither the
canonical expected head nor contains the source) fails closed with `external_head_divergence`, with
no `PROMOTION_COMMITTED`, no `PROMOTION_FAILED`, and no adoption of the ambient head.

### 2. Mechanical head reconciliation (`reconcileProjectHead`)

The head advance is a revision like any other, so it rides the **same atomic batch**:

```
reconcileProjectHead():
  status = projectHeadStatus()
  candidate = compileProjectHeadReconciliation(...)   # pure, 0 writes
  if state == IN_SYNC        → { in_sync, 0 writes }
  if !candidate.compilable   → { blocked, 0 writes }
  re-check freshness (basis + backing PROMOTION_COMMITTED unchanged, else stale_head_reconciliation)
  planReconciled({ tasks }, { headAdvance: { fromPromotionEventId, toHead } })
```

`compileProjectHeadReconciliation` refuses to compile unless the world is **quiescent** (no
`ACTIVE`/`VERIFYING` task, no open attempt). A promoted task must reach `SATISFIED` before its
effect head can become the authorization basis of the next revision. `planReconciled` re-validates
the advance against the canonical derivation and the backing event, then re-authorizes every
retained `READY`/`BLOCKED` task onto the new base inside the same transaction.

`ProjectHeadError` is the single typed, fail-closed surface:
`head_not_proven`, `head_conflict`, `quiescence_required`, `no_drift`, `external_head_divergence`,
`stale_head_reconciliation`, `caller_head_not_canonical`, `caller_source_not_canonical`.

## The drift barrier

`runTurn` observes the head state before it activates anything:

- `SYNC_REQUIRED` → **new task activation is blocked** (`pumpSettlement` refuses to commit a new
  `TASK_STARTED`) but settlement of already-started work still proceeds, so the project can reach
  quiescence. Once quiescent the head sync runs automatically and activation resumes in the same
  turn.
- If the world is not yet quiescent the turn returns `phase: "head_sync_required"` with the exact
  `blockers` (`quiescence_required`, …). No deadlock: promotion → drift → settlement → quiescence →
  sync → activation.

`CONFLICT` is never auto-advanced; it surfaces as a `phase: "head_sync_required"` blocker and a
derived `PROJECT_HEAD_CONFLICT` workspace loop for an operator to investigate.

## Non-goals

- No second ProjectIR, no git-head database/ledger/watcher, no second promotion ledger.
- No background reconciler and no timer: reconciliation is an explicit, quiescence-gated step.
- No promotion authority is granted by any management mode; `RECONCILE_PROJECT_HEAD` is a
  *mechanical consistency* action, distinct from `APPLY_LOCAL_PLAN_REVISION`, and it never promotes.
- The agent-facing `PlanInput` has no head field; the trusted advance is a separate, non-agent type.
