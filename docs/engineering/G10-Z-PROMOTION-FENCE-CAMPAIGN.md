# G10-Z — Campaign record

Baseline `d809a9082f7534077f8deb02695b85f14dabac52`. One stage, one closure.
Closes `CF-Y-01`.

## Internal topology (all executed)

| Stage | Work | Result |
| --- | --- | --- |
| Z0 | Reproduce `CF-Y-01` and the `PREPARED`/revision race | Both reproduced with the production code |
| Z1 | `PromotionEligibilityAssessment` + one shared read model | Pure calculus + replay-safe reader |
| Z2 | Unify product / expert / selection admission | All entry points pass one assessment |
| Z3 | `PROMOTION_PREPARED` admission validation | Canonical local state only, replay-safe |
| Z4 | Unresolved-promotion revision fence | Typed invalidation cannot bypass it |
| Z5 | COMMITTED-but-unsettled revision fence | `promotion_semantic_settlement_required` |
| Z6 | Recovery authority re-check + effect-truth honesty | No redispatch under revoked authority |
| Z7 | Proven-effect exception | Effect recorded, Work never auto-satisfied |
| Z8 | Cross-revision fail-before-effect + head-drift order | Refused before Git |
| Z9 | Eligibility preview, status fence, workspace loops | Read-only observability |
| Z10 | Adversarial + crash/replay closure | 37 new tests |
| Z11 | Docs, gates, CI, carry-forward | This document set |

## Write scope

```
src/domain/promotion_eligibility.ts        new: pure assessment calculus
src/domain/promotion_eligibility_read.ts   new: the ONE store-aware reader
src/domain/aggregate.ts                    PROMOTION_PREPARED admission
src/domain/plan_reconciliation.ts          fence + head-drift blocker kinds
src/effects/promotion.ts                   eligibility, terminal-replay order, recovery re-check
src/tools/controller.ts                    revision fence, head-drift order, preview, status fence
src/project_workspace/view.ts              promotion-fence open loops
test/z_promotion_authority.test.ts         16 tests
test/z_adversarial.test.ts                 21 tests
scripts/audit/z0-promotion-authority-repro.mjs
docs/**                                    this document set
```

No new event type. No migration. No new table. `fixtures/**` untouched.

## Delivered order

```text
promoteAttempt → §32 terminal replay → eligibility → canonical source/head → PREPARED → effect → COMMITTED
planReconciled → promotion fence → head-drift order → reconciliation blockers → atomic batch
reconcileAll   → authority re-check → (proven effect | never-started | unresolved)
```

## Evidence

| Artifact | What it proves |
| --- | --- |
| `scripts/audit/z0-promotion-authority-repro.mjs` | Real crash + real revision attempt: pre-fix both defects, post-fix both closed |
| `test/z_promotion_authority.test.ts` | Eligibility model, fence, head drift, recovery, replay, preview |
| `test/z_adversarial.test.ts` | `Z-N01`…`Z-N30`, including the plane firewalls and regressions |

## Gates

```text
git diff --check                      clean
pnpm build                            clean
pnpm exec vitest run                  151 files / 1422 tests passed
pnpm run build:web                    ok (203 modules)
pnpm exec playwright test             27 passed
node scripts/audit/z0-…repro.mjs      both scenarios CLOSED
node scripts/management/multi-promotion.mjs   G10-X MULTI-PROMOTION PASS
```

Baseline suite size was 149 files / 1385 tests; Z adds 2 files / 37 tests.

## Baseline comparison

| | Baseline `d809a90` | G10-Z |
| --- | --- | --- |
| Retired task's result | could still promote and advance the head | `task_retired`, zero effect |
| Attempt/Work precondition | none (any attempt with a report) | COMPLETED candidate of the current batch of a VERIFYING task |
| Input world | checked only at `TASK_SATISFIED`, after Git | proven before the effect |
| Old-base result | moved Git, then failed Work admission | refused before Git |
| Unresolved PREPARED | a revision could retire its task | fenced: `promotion_settlement_required` |
| COMMITTED before settlement | retirement possible | fenced: `promotion_semantic_settlement_required` |
| Revision during head drift | allowed | `head_sync_required` for meaning changes |
| Recovery | dispatched/redispatched without re-checking | re-checks authority first |
| Management override | n/a (no promotion action class) | still none - asserted |
| New event type / table | — | none |
