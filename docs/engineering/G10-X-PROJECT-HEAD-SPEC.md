# G10-X — Canonical Project-Head Evolution Spec

Status: **DELIVERED**. Baseline `main @ f639181199da9ccd7acb3fac2c46392e0b82eb04`. Ordarium v1.3.1.
Host: DSH 0.1.5-rc.2.

This spec is the acceptance contract for G10-X. It closes CF-W-02 (a plan revision could not
re-anchor the canonical head). Read `PROJECT-HEAD-EVOLUTION.md` for the narrative.

## 1. Identity

```
ProjectIrHead   = projects.head_commit            (the authorization basis)
ProvenEffectHead= last CHAINED PROMOTION_COMMITTED.resulting_head_commit
AmbientGitHead  = git.head()                      (diagnostic; never an input)
```

`ProjectIrHead`, `ProvenEffectHead` and `AmbientGitHead` are three distinct notions. A promotion
records an effect; the ProjectIR records the basis work is authorized against. They are reconciled
explicitly, never conflated.

## 2. Derivation (`src/domain/project_head.ts`, pure)

- `deriveProjectHeadStatus({project, promotions}) → ProjectHeadStatus`
  - `schemaVersion: 1`, `projectRevision`, `projectHeadCommit`, `provenEffectHeadCommit`,
    `latestPromotionEventRef | null`, `state`.
  - `state ∈ IN_SYNC | SYNC_REQUIRED | CONFLICT`.
- `compileProjectHeadReconciliation({project, status, tasks, openAttempts, promotions?}) →
  ProjectHeadReconciliationCandidate` with `compilable: boolean` and typed blockers
  (`no_drift`, `head_conflict`, `head_not_proven`, `quiescence_required`). Performs **zero writes**.
- `ProjectHeadError { kind, refs }` is the single typed refusal surface.

Invariants:

| ID | Invariant |
| --- | --- |
| X-INV-01 | The chain is CONTIGUOUS from `projectHeadCommit`; a mismatch after the chain starts is `CONFLICT`, never skipped. |
| X-INV-02 | A promotion whose expected head neither equals the project head nor is the last absorbed tip proves nothing (`CONFLICT`). |
| X-INV-03 | The kernel is pure: no I/O, no store handle, no clock, no `git.head()`. |
| X-INV-04 | Only `PROMOTION_COMMITTED` advances the head; `PREPARED`/`FAILED` never do. |

## 3. Promotion contract

### 3.1 Product-safe entry point

```
ProjectController.promoteAttempt({ attemptId, gateId?, reason? }) : Promise<PromoteResult>
PromotionManager.promoteAttempt({ attemptId, gateId?, reason? }) : Promise<PromoteResult>
```

- `sourceCommit` = `AttemptReport.result_commit` for the attempt (null/absent ⇒
  `caller_source_not_canonical`).
- `expectedHeadCommit` = `canonicalExpectedHead()` = the proven effect head of the contiguous chain
  (`head_conflict` when the chain is broken).
- `gateId` (optional) must evaluate `PASS` for the attempt, else the promotion is refused.
- X-INV-05: **no caller supplies a source commit or an expected head on this path.**

### 3.2 Expert/internal path (unchanged shape, strictly validated)

```
ProjectController.promote(attemptId, sourceCommit, expectedHeadCommit)   # expert/internal
PromotionManager.promote({ attemptId, sourceCommit, expectedHeadCommit }) # expert/internal
```

Both arguments are re-validated against the canonical derivations before anything is appended:
`caller_source_not_canonical` / `caller_head_not_canonical` on mismatch, zero writes.

### 3.3 Divergence

If `git.promote` fails and the live head differs from the canonical expected head and the source did
not land, the promotion fails closed with `external_head_divergence`: no `PROMOTION_COMMITTED`, no
`PROMOTION_FAILED`, no head adoption. A `SimulatedProcessCrash` remains a recovery signal, not a
divergence verdict.

## 4. Reconciliation contract

```
ProjectController.reconcileProjectHead({ operator?, candidate? }?) : Promise<ProjectHeadReconciliationResult>
```

- Result: `{ status: "reconciled" | "in_sync" | "blocked", revision?, fromHead, toHead, blockers }`.
- `in_sync` and `blocked` write nothing.
- `reconciled` advances the head through **one** `planReconciled` batch; the retained
  `READY`/`BLOCKED` tasks are re-authorized onto the new base in the same transaction.
- Freshness is re-checked immediately before the commit: if the ProjectIR basis or the backing
  `PROMOTION_COMMITTED` moved, it throws `stale_head_reconciliation` with **zero writes**.
- A supplied `candidate` is a derived, content-addressed proposal only. It is re-validated here and
  again by `planReconciled`, so it can never name a head of its own choosing.
- X-INV-06: the head advance is quiescence-gated (`quiescence_required`).
- X-INV-07: the head advance is committed by the same atomic revision batch; there is no second
  head-writing path.

### 4.1 Trusted revision option

```
planReconciled(input: PlanInput, trusted?: { headAdvance?: { fromPromotionEventId, toHead } })
```

`headAdvance` is **trust only**: it must name the canonical chain tip and the canonically proven
effect head, and the backing event must really produce `from → to`, or the revision is refused with
`caller_head_not_canonical` and zero writes. `PlanInput` (agent-facing) has **no** head field.

## 5. runTurn drift barrier

| Head state | New activation | Settlement | Result |
| --- | --- | --- | --- |
| `IN_SYNC` | allowed | allowed | normal phases |
| `SYNC_REQUIRED`, world quiescent | blocked, then sync | allowed | sync runs, `progress`/normal |
| `SYNC_REQUIRED`, world live | blocked | allowed | `phase: "head_sync_required"`, `blockers: ["quiescence_required", …]` |
| `CONFLICT` | blocked | allowed | `phase: "head_sync_required"`, blocker `head_conflict` |

X-INV-08: the loop terminates — promotion → drift → settlement → quiescence → sync → activation.

## 6. Derived surfaces

`ControllerStatusView.head` (additive): `{ projectHeadCommit, provenEffectHeadCommit, state,
latestPromotion: { promotionId, attemptId, sourceCommit, fromHead, toHead, eventId } | null }`.

`ProjectWorkspaceView.project.head` (additive): the same picture rendered with
`stateLabel ∈ "in sync" | "sync required" | "conflict"`.

Open loops (derived, prompts — never tasks): `PROJECT_HEAD_DRIFT` when `SYNC_REQUIRED`,
`PROJECT_HEAD_CONFLICT` when `CONFLICT`.

## 7. Management contract

`RECONCILE_PROJECT_HEAD` is a `MANAGEMENT_ACTION_CLASS` — a MECHANICAL CONSISTENCY action, distinct
from `APPLY_LOCAL_PLAN_REVISION`.

| Action class | DIRECT | ASSIST | MANAGE | DELEGATE |
| --- | --- | --- | --- | --- |
| `RECONCILE_PROJECT_HEAD` | explicit | suggest | yes | yes |

- It is **not** authority-shaped (`AUTHORITY_REQUIRED_ACTIONS` unchanged).
- X-INV-09: a management mode never grants promotion authority. The management service has no
  promotion method and never calls one; its execution case calls `controller.reconcileProjectHead()`
  (never a raw plan, never a caller head).
- `ProjectManagementService.reconcileProjectHead()` is exposed on the application surface, the
  `palimpsest_manage` tool (`reconcile_project_head`), and `POST /api/project/reconcile_head`. None
  of them accept a head, source commit, or plan on the wire.

## 8. Non-goals / honest limitations

- No git-head database, ledger, watcher or background reconciler.
- `src/state/**` and the projector files are untouched by this stage.
- Source scan tests (see `audits/G10-X-HEAD-EVOLUTION-ANTI-WASTE.md`) pin these absences.
- Two tasks whose envelopes both predate a promotion cannot both be satisfied by promotions alone:
  `#validateTaskSatisfied` requires `promotion.expected_head_commit === envelope.base_commit`, so the
  parallel old-base path must settle through the head sync (settle the batch, reconcile, re-READY),
  not by weakening the invariant. Recorded as `NOT_APPLICABLE_CURRENT_TOPOLOGY` (CF-X-01).
