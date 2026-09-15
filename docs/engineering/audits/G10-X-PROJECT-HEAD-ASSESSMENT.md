# G10-X — Project-Head Assessment

Baseline: `main @ f639181199da9ccd7acb3fac2c46392e0b82eb04`. Ordarium v1.3.1. DSH 0.1.5-rc.2.

This is the stage-0 assessment that motivated G10-X and the promotion-caller audit. It records the
CF-W-02 reproduction with exact fields and failure, and classifies every promotion call site.

## 1. The defect (CF-W-02)

### Reproduction (as recorded by G10-W, `delegate-continuity.mjs`)

A project over `<repo>` with `rev0`, tasks `task-a → task-b`, one real promotion and one hostile
long-lived state:

| Field | Value |
| --- | --- |
| `revision` | `1` |
| `task-a` | `SATISFIED` (promoted once) |
| `task-b` | `VERIFYING` (attempt complete, gate PASS) |
| `gitHead` | `0000000000000000000000000000000000000002` (A's promotion landed) |
| `projectIrHeadCommit` | `cccccccccccccccccccccccccccccccccccc` (genesis, never advanced) |
| `bPromotionApplicable` | `false` |
| `phase` | `needs_promotion` |

**Exact failure.** B's committed `TaskEnvelope.base_commit` is `cccc…` (the old head) because the
revision reused `current.head_commit` (`PlanInput` had no head field). Any promotion of B must pass
`git.promote({ sourceCommit, expectedHeadCommit })`, and whichever expected head is supplied cannot
satisfy both sides:

- `expectedHeadCommit = cccc…` (B's base) → `git.promote` fails: the live head is `0000…0002`;
- `expectedHeadCommit = 0000…0002` (the live head) → the envelope basis no longer matches, and the
  aggregate refuses `TASK_SATISFIED`.

So the project can never promote B. The provider is the split between the ProjectIR head (the
authorization basis) and the promotion ledger (the effect record), with an ambient `git.head()`
bridging them at the call site.

### Why it mattered

Every project with more than one promotable task, and every re-promotion after a plan revision,
stalls. The authorization basis on the log and the live branch can diverge silently.

### G10-X resolution

1. `PROMOTION_COMMITTED` facts become the canonical effect record; `deriveProjectHeadStatus`
   reconstructs the contiguous chain; the ProjectIR head is advanced by an explicit, quiescence-
   gated `reconcileProjectHead()` through the same atomic revision batch.
2. `promoteAttempt` derives both the source commit (the attempt report) and the expected head (the
   proven effect head); a caller can no longer supply either.
3. The `runTurn` barrier blocks new activation under drift while allowing settlement, so the world
   reaches quiescence and the sync runs.

### Residual invariant (recorded, not weakened)

`AggregateValidator.#validateTaskSatisfied` requires
`promotion.expected_head_commit === envelope.base_commit`. A task authorized at an older base
therefore cannot be satisfied by a promotion whose expected head has advanced. The parallel
old-base scenario is consequently `NOT_APPLICABLE_CURRENT_TOPOLOGY` (CF-X-01): two tasks that both
started at H0 cannot both be satisfied by promotions alone — the second must go through the head
sync (settle the batch, reconcile, re-READY). G10-X asserts this explicitly rather than faking the
scenario.

## 2. Promotion-caller audit

Every call site of promotion or head advancement, classified. "Production-safe" = derives both
commits, accepts no caller head; "legacy low-level" = still accepts explicit commits but is
strictly validated; "test-embedding" = test-only invocation of either.

| # | Call site | Class | Notes |
| --- | --- | --- | --- |
| 1 | `src/cli.ts` `promote` | production-safe | `controller.evaluateAttemptGate` then `controller.promoteAttempt({attemptId, gateId})`; gate failure reported as `{promoted:false, verdict}` |
| 2 | `src/cli.ts` `pump` | production-safe | calls `pumpCommandAttempts` (supplies no commit) then reconciles drift when `SYNC_REQUIRED` |
| 3 | `src/tools/control_surface.ts` `promote` | production-safe | finds the COMPLETED candidate, pre-evaluates the gate, calls `promoteAttempt` |
| 4 | `src/serve.ts` `promote` op | production-safe | delegates to the control surface |
| 5 | `src/tools/controller.ts` `promoteAttempt` | production-safe | the canonical entry point |
| 6 | `src/effects/promotion.ts` `promoteAttempt` | production-safe | derives source + expected head; optional gate |
| 7 | `src/effects/promotion.ts` `canonicalExpectedHead` | production-safe | the only sanctioned expected head |
| 8 | `src/tools/controller.ts` `promote` | legacy low-level | expert/internal; both args strictly validated (`caller_*_not_canonical`) |
| 9 | `src/tools/controller.ts` `promoteWhenGatePasses` | legacy low-level | expert; gate check + `promote`; kept for existing internal callers |
| 10 | `src/tools/controller.ts` `selectAndPromoteWhenGatePasses` | legacy low-level | tournament arm; reads the report commit itself but still passes it explicitly |
| 11 | `src/tools/controller.ts` `reconcileProjectHead` | production-safe | never promotes; advances the head only |
| 12 | `src/tools/controller.ts` `planReconciled(..., {headAdvance})` | legacy low-level (trusted) | re-validated against the canonical chain + backing event |
| 13 | `src/effects/actions.ts` `gitPromote` action | mechanism | the Ordarium action; receives already-derived commits |
| 14 | `test/acceptance.test.ts`, `test/h1_recovery.test.ts`, `test/h1_stagegraph.test.ts`, `test/promotion.test.ts`, `test/promotion_gate.test.ts`, `test/debugger_controls.test.ts`, `test/w_revision_safe.test.ts`, `test/visual_orchestration.test.ts`, `test/effects.crash.test.ts` | test-embedding | exercise the legacy low-level path with explicit commits (the pre-G10-X shape) |
| 15 | `test/x_project_head.test.ts`, `test/x_multi_promotion.test.ts`, `test/x_adversarial.test.ts` | test-embedding | exercise both the product-safe path and the forgery negatives of the legacy path |

No production caller outside `cli.ts`/`control_surface.ts`/`serve.ts` supplies an explicit head.
`git.head()` appears in production code only as:

- `src/effects/promotion.ts` `#gitHeadOrUndefined()` — the divergence diagnostic (never assigned to
  `projects.head_commit`), and
- `src/effects/actions.ts` `gitPromote`'s recovery `reconcile` — the pre-existing Ordarium
  uncertain-outcome probe that reports the *effect* outcome, after which the canonical fact is
  appended by the recovery service.

## 3. Absences verified

- No git-head database, ledger, watcher or second promotion ledger was added.
- `src/domain/project_head.ts` imports only `ProjectIr` (type) and uses no store/git/clock.
- `src/state/**`, `src/application/projections.ts`, `src/application/projection_types.ts` contain no
  G10-X coupling.
- The projector/store files are unchanged in this stage.

See `audits/G10-X-HEAD-EVOLUTION-ANTI-WASTE.md` for the machine-checked source scans.
