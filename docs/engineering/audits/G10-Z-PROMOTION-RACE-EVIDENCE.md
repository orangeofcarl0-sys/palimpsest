# G10-Z — Promotion race evidence

Consolidated evidence for the two races Z closes: a result outliving its Work,
and a revision crossing an unresolved external effect.

## 1. Race A — a retired task's result still promotes (`CF-Y-01`)

Reproducer: `scripts/audit/z0-promotion-authority-repro.mjs`, scenario `cfy1`.

```text
rev0 → task-a VERIFYING, attempt COMPLETED, report.result_commit = …01
     → typed invalidating revision (behavior_change, changedIds ["task-a"])
     → revision 1, task-a STALE, Evidence stale (G10-Y)
     → promoteAttempt(attempt-a)
```

| | pre-fix | post-fix |
| --- | --- | --- |
| promotion outcome | `COMMITTED` | `REJECTED` |
| typed reason | — | `task_retired` |
| `PROMOTION_PREPARED` | 1 | 0 |
| `PROMOTION_COMMITTED` | 1 | 0 |
| git merges | 1 | 0 |
| resulting head vs ProjectIR head | diverges (`…02` vs `cc…cc`) | unchanged |
| `TASK_SATISFIED` events | 0 (never satisfiable) | 0 |

## 2. Race B — the revision crosses an unresolved effect

Reproducer: scenario `race`. The git port merges and then throws
`SimulatedProcessCrash` before the ledger records the outcome - the genuine Crash
B window.

```text
PREPARED committed: 1     COMMITTED: 0     task-a: VERIFYING     merges: 1
→ typed invalidating revision attempted
```

| | pre-fix | post-fix |
| --- | --- | --- |
| revision outcome | `COMMITTED` (revision 1) | `BLOCKED` |
| typed reason | — | `promotion_settlement_required` |
| task-a | `STALE` | `VERIFYING` |
| `TASK_STALE` events | 1 | 0 |
| Evidence | `stale` | `active` |
| recovery pass 1 | `in-flight` (`dispatched`) | n/a (fence held) |
| recovery pass 2 (+1h) | still `in-flight` | n/a |

The pre-fix end state is a durable inconsistency: the merge landed, the Work was
retired, and the intent can never settle honestly - the external effect exists with
no honest Work outcome.

## 3. Fault-injection matrix (unit level)

`test/z_adversarial.test.ts`:

| Scenario | Assertion |
| --- | --- |
| `Z-N11`/`Z-N14`/`Z-N15` | `PREPARED` unresolved → typed revision refused, **zero** revision events, revision stays 0, task stays VERIFYING |
| `Z-N12` | removal refused (`promotion_settlement_required`) |
| `Z-N13` | same-id replacement refused (fence or `replacement_task_id_required`) |
| `Z-N18` | `COMMITTED` before `TASK_SATISFIED` → `promotion_semantic_settlement_required` |
| `Z-N16` (a) | provenance: `PREPARED` with no Ordarium record + retired task → recovery records `PROMOTION_FAILED`, **zero** merges, no `PROMOTION_COMMITTED` |
| `Z-N17` (b) | provenance: effect proven to have landed → recovery records `COMMITTED`, merge count stays 1, and `TASK_SATISFIED` is **not** fabricated |
| `Z-N29` | `quickCheck` + `verifyFull` + two `rebuildProjections` passes agree; recovery over a settled world is a no-op |

## 4. Ordering evidence

```text
promoteAttempt: §32 terminal replay → eligibility → canonical source/head
                → PREPARED → effect → COMMITTED
planReconciled: promotion fence → head-drift order → reconciliation blockers
                → W atomic batch (TASK_STALE → EVIDENCE_STALE → PROJECT_REVISED
                  → TASK_REAUTHORIZED → TASK_CREATED)
recovery:       authority re-check → proven effect | never started | unresolved
```

The fence is checked before the generic reconciliation blockers, and the
retirement set is a pre-compile superset, so no earlier-reported blocker can hide
a fence (see `G10-Z-PROMOTION-AUTHORITY-ASSESSMENT.md` §8).

## 5. Regression evidence

| Regression | Where |
| --- | --- |
| X sequential multi-promotion + head semantics | `Z-N23`/`Z-N26`, `x_multi_promotion.test.ts` (X-M1…X-M7) |
| W revision atomicity | `Z-N24`/`Z-N25`, `w_revision_safe.test.ts` |
| Y Evidence atomicity | `Z-N24`/`Z-N25` batch-order assertion |
| X parallel old-base now fails BEFORE Git | `x_multi_promotion.test.ts` X-M3 (rewritten) |
| X dogfood end-to-end | `node scripts/management/multi-promotion.mjs` → `G10-X MULTI-PROMOTION PASS` |
