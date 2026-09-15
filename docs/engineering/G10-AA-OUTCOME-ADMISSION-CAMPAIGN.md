# G10-AA — Campaign record

Baseline `0164aab755a1372e4f1c81e391c2fd2f73a661f3`. One stage, one closure.
Closes `CF-Z-02`.

## Internal topology (all executed)

| Stage | Work | Result |
| --- | --- | --- |
| AA0 | Reproduce COMMITTED + FAILED direct-ingestion holes, and the PREPARED fabrication hole | All three reproduced |
| AA1 | Structural terminal transition validator | Plane A, replay-safe, projection-based |
| AA2 | Opaque one-shot effect-outcome witness / live admission seam | Two capabilities + two narrow append methods |
| AA3 | Normal success integration | `invoke_result` basis |
| AA4 | Recovery receipt / reconcile integration | `ledger_receipt` / `reconciled_result` bases |
| AA5 | Failure and revoked-authority integration | Bases wired; both branches unreachable today (see below) |
| AA6 | PREPARED intent-admission hardening | Intent permit required |
| AA7 | Durable provenance + legacy replay compatibility | Optional payload fields; digests unmoved |
| AA8 | Head/fence/projector regressions | Plus a Z-fence gap closed (`invalidateTask`) |
| AA9 | Adversarial / direct-writer closure | 16 adversarial tests |
| AA10 | Docs, gates, CI, carry-forward | This document set |

## Write scope

```
src/domain/promotion_terminal.ts             new: pure lifecycle rules
src/domain/promotion_terminal_admission.ts   new: opaque capabilities + registry
src/domain/aggregate.ts                      Plane A terminal validation + Plane B admission
src/state/event_store.ts                     appendPromotionIntent / appendPromotionTerminal
src/effects/promotion.ts                     mint capabilities from real outcome bases
src/schema/models.ts                         optional terminal provenance fields
src/tools/controller.ts                      close the invalidateTask fence bypass
test/aa_terminal_admission.test.ts           16 tests
test/aa_adversarial.test.ts                  16 tests
test/z_promotion_authority.test.ts           updated (fabricated PREPARED now blocked)
test/z_adversarial.test.ts                   updated (idem)
scripts/audit/aa0-terminal-ingestion-repro.mjs
docs/**                                      this document set
```

No new event type. No migration. No new table. `fixtures/**` untouched.

## Delivered admission

```text
promoteAttempt / recoverAll
  → the outcome basis is observed (invoke result | receipt | reconcile | none)
  → PromotionOutcomeWitness.issue({ operationId, inputDigest, outcomeKind, basis, heads })
  → store.appendPromotionTerminal(event, witness)
      → validatePreconditions
      → Plane A: structural lifecycle (projection-based, replay-safe)
      → Plane B: consume the witness (one-shot, fully bound)
      → insert + project
```

## Evidence

| Artifact | What it proves |
| --- | --- |
| `scripts/audit/aa0-terminal-ingestion-repro.mjs` | Three scenarios: forged COMMITTED moving the head, forged FAILED releasing a real fence with the merge already landed, fabricated PREPARED creating a fake fence. All `ACCEPTED` before, all `REJECTED` after |
| `test/aa_terminal_admission.test.ts` | Generic-append denial, structural lifecycle, capability encapsulation, golden paths, offline replay, legacy payload shape |
| `test/aa_adversarial.test.ts` | `AA-N01`…`AA-N30` |

## Gates

```text
git diff --check                      clean
pnpm build                            clean
pnpm exec vitest run                  153 files / 1454 tests passed
pnpm run build:web                    ok (203 modules)
pnpm exec playwright test             27 passed
node scripts/audit/aa0-…repro.mjs     all three scenarios CLOSED
```

Baseline was 151 files / 1422 tests; AA adds 2 files / 32 tests.

## Findings recorded

**A Z-fence gap, closed.** Z's promotion fence lived only in `planReconciled`.
The direct `invalidateTask` path could therefore retire Work across an unresolved
external effect, manufacturing exactly the state recovery's authority re-check
exists to survive. `invalidateTask` now applies the same fence (it had no
production callers). This is what makes "Z fences remain intact" (OT-A27) true
rather than assumed.

**Two terminal branches are unreachable through the engine contract.** A provider
error is surfaced by the engine as `UncertainOperationError`, which AA correctly
refuses to terminalize; and `orchestrationAuthorization` always allows, so no
denial path reaches `promote()`. The `deterministic_failure`, `denied`,
`cancelled` and `authority_revoked_before_dispatch` bases are therefore
implemented and admission-correct but **not reachable** through the supported
surface today. They are defence in depth, and the failure terminal's admission is
proven positively (a FAILED over a PREPARED with a FAILED witness is admitted and
must record no head). Recorded as `CF-AA-01`.

## Baseline comparison

| | Baseline `0164aab` | G10-AA |
| --- | --- | --- |
| `append(PROMOTION_COMMITTED)` | accepted; moves the canonical head | denied live admission |
| `append(PROMOTION_FAILED)` | accepted; releases the Z fence | denied live admission |
| `append(PROMOTION_PREPARED)` | accepted; creates a fake fence | denied live admission |
| Terminal validation | none | structural lifecycle, replay-safe |
| Effect-outcome provenance | none | optional `operation_id` / `outcome_basis` / `outcome_digest` |
| Capability forgery | n/a | plain object and structural copy both refused |
| Replay | unchanged | unchanged, and proven offline |
| New event type / table | — | none |
