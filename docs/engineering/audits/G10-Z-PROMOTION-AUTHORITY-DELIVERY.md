# G10-Z — Delivery report

Stage: **Promotion Eligibility & Superseded-Work Effect Fencing**.
Baseline: `orangeofcarl0-sys/palimpsest` `main @ d809a9082f7534077f8deb02695b85f14dabac52`.
Closes **CF-Y-01**.

## 1. What changed

**New — `src/domain/promotion_eligibility.ts`** (pure calculus): the blocker kinds,
`PromotionEligibilityAssessment`, the single shared `inputWorldBlockers`
predicate, `assessPromotionEligibility`, `PromotionEligibilityError`,
`explainPromotionIneligibility`, `PromotionFenceRow`, `promotionFenceBlockers`,
`compilePromotionFenceBlocker`. No I/O, frozen output, no score.

**New — `src/domain/promotion_eligibility_read.ts`**: the ONE store-aware reader
that assembles the assessor's input and derives the fence rows. It reads
promotion-chain facts from the `promotions` **projection** so the validators built
on it are replay-safe.

**`src/domain/aggregate.ts`** — `#validatePromotionPrepared`: `PROMOTION_PREPARED`
previously fell through `default: return;` with no validation at all. It now proves
the Work basis from canonical local state, using the same assessor the manager
uses.

**`src/effects/promotion.ts`** — §32 terminal replay first; eligibility on every
promotion entry point; `assessEligibility` exposed; recovery re-checks authority
before any dispatch/redispatch and records effect truth without fabricating Work
admission.

**`src/tools/controller.ts`** — the revision fence (evaluated on the retirement
set, ahead of the generic blockers), the `head_sync_required` ordering rule for
meaning-changing revisions under drift, the read-only `promotionEligibility`
preview, and `ControllerStatusView.promotionFence`.

**`src/domain/plan_reconciliation.ts`** — `head_sync_required`,
`promotion_settlement_required`, `promotion_semantic_settlement_required` blocker
kinds.

**`src/project_workspace/view.ts`** — `PROMOTION_EFFECT_UNRESOLVED` /
`PROMOTION_AWAITING_SETTLEMENT` open loops, read from the allow-listed status view
(the V firewall forbids importing effect-authority modules).

## 2. Delivered behaviour

```text
promoteAttempt(a):
  §32 terminal replay?  → return history (never re-executes the effect)
  assess current eligibility (attempt/task/batch/input-world/head/gate/pending)
  blocked?              → typed PromotionEligibilityError, ZERO PREPARED, ZERO effect
  eligible?             → canonical source + canonical head → PREPARED → effect → COMMITTED

planReconciled(rev):
  promotion fence over the retirement set  → promotion_settlement_required
                                             / promotion_semantic_settlement_required
  meaning-changing while SYNC_REQUIRED     → head_sync_required  (trusted sync exempt)
  reconciliation blockers
  W atomic batch

reconcileAll():
  effect proven by Ordarium → record COMMITTED (reality never hidden; Work not auto-satisfied)
  provably never started + authority gone → PROMOTION_FAILED, no dispatch
  unresolved → promotion_effect_resolution_required, no dispatch, no fabrication
```

## 3. Behaviour comparison with the baseline

| | Baseline `d809a90` | G10-Z |
| --- | --- | --- |
| Retired task's result | promoted; head diverged from the ProjectIR | `task_retired`, zero effect |
| Work precondition | none beyond a report + canonical head | COMPLETED candidate of the current batch of a VERIFYING task |
| Input world | checked only at `TASK_SATISFIED`, after Git | proven before the effect |
| Old-base result | moved Git, then failed Work admission | refused before Git |
| Unresolved PREPARED | revision could retire its task | fenced |
| COMMITTED before settlement | retirement possible | fenced |
| Meaning change under drift | allowed | `head_sync_required` |
| Recovery | dispatched without re-checking authority | authority first; unresolved surfaced |
| `PROMOTION_PREPARED` validation | none | canonical local-state proof |
| New event type / table | — | none |

## 4. Proof

**Real reproductions** (`scripts/audit/z0-promotion-authority-repro.mjs`):

| Scenario | pre-fix | post-fix |
| --- | --- | --- |
| `cfy1` retired-task promotion | `PROMOTION_COMMITTED`, head diverged | `REJECTED: task_retired`, zero effect |
| `race` PREPARED vs revision | revision committed, task STALE, effect landed, recovery stuck `dispatched` | `BLOCKED: promotion_settlement_required`, task VERIFYING, revision 0 |

**Suites**

* `test/z_promotion_authority.test.ts` — 16 tests.
* `test/z_adversarial.test.ts` — 21 tests covering `Z-N01`…`Z-N30`.

**Corrected existing tests** (each with in-file justification)

* `visual_orchestration` (VIS-A05, VIS-A07), `web_channel` (WEB-A02): settle the
  candidate batch into `TASK_VERIFYING` before promoting - the canonical flow.
* `x_multi_promotion` (X-M3): rewritten to assert the old-base promotion is now
  refused **before Git**, with zero effect (`CF-X-01`'s unsafe path closed).
* `x_project_head`, `x_adversarial` (null result commit): assert the stronger,
  earlier `attempt_not_completed` refusal.
* `w_revision_safe` (invariants): reconciles the head before a meaning-changing
  revision, per the new ordering rule.
* `w_adversarial` (envelope firewall): allow-lists the new READ-ONLY envelope
  consumer; the writer set is still pinned to exactly one file.

## 5. Local gates

```text
git diff --check                      clean
pnpm build                            clean
pnpm exec vitest run                  151 files / 1422 tests passed
pnpm run build:web                    ok (203 modules)
pnpm exec playwright test             27 passed
z0-…repro.mjs                         cfy1 CLOSED / race CLOSED
scripts/management/multi-promotion.mjs  G10-X MULTI-PROMOTION PASS
```

Baseline was 149 files / 1385 tests.

## 6. Deviations and honest limitations

* **`VERIFYING` is now required for a new promotion.** Three suites promoted from
  `ACTIVE`; §10 mandates the narrower rule. Those flows now settle first, which is
  what the product path (`runTurn` → `needs_promotion`) already did.
* **`promotion` ineligibility is now the typed error for several previously
  differently-typed refusals** (a FAILED attempt is refused as
  `attempt_not_completed` rather than `caller_source_not_canonical`). The
  guarantee (fail closed, write nothing) is preserved and earlier.
* **`CF-Z-02`**: only `PROMOTION_PREPARED` is validated. `PROMOTION_COMMITTED` is
  deliberately unvalidated so a proven effect can always be recorded honestly
  (§28); a foreign writer could therefore append a `COMMITTED` for an ineligible
  attempt.
* **`CF-Z-01`**: the fence is derived per call with no cache.
* **`CF-X-01` remains feature-deferred**: real cross-revision/parallel old-base
  promotion is still unsupported; only its unsafe effect-first ordering is closed.
* **The `race` pre-fix recovery outcome** (`dispatched` persisting across a 1-hour
  lease advance) is recorded as observed. Z does not diagnose Ordarium's internal
  reclaim behaviour; the fence makes the state unreachable through supported
  paths, and the recovery re-check handles it if a legacy log contains it.

## 7. Canonical checkpoint

Recorded by the docs-only closure PR after merge.
