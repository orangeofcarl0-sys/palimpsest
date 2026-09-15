# G10-Z — Promotion Eligibility & Superseded-Work Effect Fencing

Campaign specification (executed). Baseline:

```text
orangeofcarl0-sys/palimpsest
main @ d809a9082f7534077f8deb02695b85f14dabac52
```

## 1. Mission

> A Work result may cause a promotion effect only while the exact
> task/batch/input world that authorized that result still has current promotion
> authority.

and:

> Promotion intent and Project revision must be mutually fenced: revision cannot
> retire Work across an unresolved promotion effect, and retired Work cannot start
> a promotion effect.

Closes `CF-Y-01`.

## 2. Why a shallow `if STALE reject` is insufficient

`STALE first → new promote later` is the easy half. The load-bearing half is:

```text
PROMOTION_PREPARED
→ external Ordarium/Git effect in flight
→ revision retires task
→ crash/restart
→ recovery completes/backfills promotion
```

So Z closes **promotion admission**, **revision admission** and **promotion
recovery** together.

## 3. Firewalls

```text
AttemptHistory ≠ CurrentEffectAuthority      PromotionEligibility ≠ GateVerdict
PromotionEligibility ≠ Truth                 PromotionEligibility ≠ ManagementMode
PromotionPrepared ≠ GitEffectSucceeded       PromotionCommitted ≠ WorkSatisfied
PromotionCommitted ≠ ProjectHeadSync         TaskStale ≠ DeleteAttempt
TaskStale ≠ DeletePromotionHistory           Revision ≠ ImplicitPromotionCancellation
AmbientGitState ≠ PromotionAuthority         CrossRevisionAttempt ≠ AutomaticallyCompatibleAttempt
OldBaseResult ≠ AutomaticallyPromotableResult
ExternalEffectOccurred ≠ CurrentWorkAccepted
```

## 4. Scope

```text
IN   Work gate Evidence ≠ Proof standing    (unchanged)
IN   promotion eligibility, revision fence, recovery re-check, head-drift order
OUT  cross-revision parallel-promotion feature (CF-X-01) - only its unsafe
     effect-first path is closed
OUT  Proof / Reasoning / Evidence ontology
OUT  External Asset Library
```

## 5. Decisions taken

**Same-base rule.** `canonicalExpectedHead != envelope.baseCommit` is refused
before Git with `cross_revision_promotion_not_supported`. Sequential
multi-promotion (promote → settle → sync → next) remains fully supported.

**VERIFYING is required for a NEW promotion.** This narrows what the pre-Z code
permitted: three existing suites promoted straight out of `ACTIVE` without
settling the candidate batch. They now drive the canonical flow
(gate → `step()` → `TASK_VERIFYING` → promote), which is what the product path
does. `promoteAttempt` also fails closed earlier for a FAILED attempt
(`attempt_not_completed`) than for a missing source commit.

**Idempotent terminal replay comes first.** An attempt whose promotion already
reached `PROMOTION_COMMITTED` is answered from history before any question of
current authority is asked - otherwise a replay would be refused for the
`SATISFIED` state the promotion itself produced.

**The fence is evaluated on the retirement set.** Typed invalidation's quiescence
relaxation (G10-W) cannot cross it. The fence outranks the generic reconciliation
blockers so the most specific reason is reported.

**Replay-safe validators.** `verifyFull`/`rebuildProjections` re-validate events
against progressively rebuilt projections, so the shared reader takes
promotion-chain facts from the `promotions` projection, not the event log.

**Recovery records effect truth, never fabricates admission.** A proven effect is
recorded as `PROMOTION_COMMITTED` even when the Work was retired; a provably
unstarted invocation under revoked authority records `PROMOTION_FAILED`; an
unresolved outcome surfaces `promotion_effect_resolution_required`.

## 6. The `Evidence`-style observability surface

`promotionEligibility(attemptId, gateId?)` is a read-only preview, and
`ControllerStatusView.promotionFence` exposes the fence so a UI can explain a
refusal without provoking it (the workspace renders it as
`PROMOTION_EFFECT_UNRESOLVED` / `PROMOTION_AWAITING_SETTLEMENT` open loops).

## 7. Machine invariants

`PE-A01`…`PE-A32`, as enumerated in the campaign spec. PE-A01–A22 are asserted
directly by `test/z_promotion_authority.test.ts` and `test/z_adversarial.test.ts`;
PE-A23–A27 and PE-A31 are carried by the existing X/W/Y suites plus the Z
regression assertions; PE-A28 (`CF-Y-01` closed) and PE-A29 (`CF-X-01` unsafe
path closed) are asserted by `Z-N01`/`Z-N02` and `Z-N10`/`Z-N27`; PE-A30 is
`G10-Z-Y-CARRY-FORWARD-DISPOSITION.md`; PE-A32 is the CI gate.

## 8. PASS criterion

> A canonical historical attempt result no longer carries promotion authority
> after the Work world that authorized it has been retired. Every new promotion
> effect is admitted only after a shared eligibility assessment proves that the
> attempt is completed, belongs to the current batch of a current VERIFYING task,
> still matches the current ProjectIR/envelope input world, and is compatible with
> the currently supported promotion-head protocol. An ineligible request writes no
> PREPARED intent and starts no external effect. Once a valid PROMOTION_PREPARED
> intent exists, it becomes a durable fence that a ProjectIR revision cannot cross
> while the external effect is unresolved; typed invalidation cannot use its
> settlement bypass to retire that task. Recovery rechecks authority before any
> redispatch, never hides an effect proven to have occurred, and keeps effect
> truth separate from TASK_SATISFIED semantic admission. The unsupported parallel
> old-base case now fails before the external effect rather than after it, while
> the supported sequential multi-promotion path remains intact.

## 9. PARTIAL / STOP conditions

PARTIAL if: only `task.state === STALE` is checked; PREPARED can still be crossed
by a typed revision; recovery can redispatch revoked work; an old-batch result can
promote; an unsupported old-base result can alter Git before failing Work
admission; COMMITTED-but-unsettled Work can be silently retired; the expert
promote path bypasses eligibility.

STOPPED — SEMANTIC REBASE REQUIRED if: safety requires deleting historical
`AttemptReport`s; PREPARED cannot fence a revision without distributed ACID;
recovery safety requires replacing Ordarium semantics; current Work cannot
identify the current batch; the only solution collapses `PROMOTION_COMMITTED`
into `TASK_SATISFIED`; current main materially invalidates the baseline.

None of the PARTIAL or STOP conditions was hit.

## 10. Series invariant

```text
One major stage at a time; close its invariants; carry real leftovers forward.
```

```text
V  Project as Asset + Management Autonomy
W  Revision-safe Work evolution
X  Canonical repository-head evolution
Y  Canonical atomic Work-Evidence authority
Z  Promotion effect authority follows current Work authority
```
