# Promotion Eligibility and Effect Fencing

Normative statement of when a Work result may cause an **external promotion
effect**, and why an outstanding effect fences the ProjectIR revision that would
retire the Work behind it.

G10-Z made this canonical. Before it, a canonical `AttemptReport.result_commit`
was treated as sufficient authority: an attempt whose task a revision had already
retired could still move the repository.

Scope: `src/domain/promotion_eligibility.ts`,
`src/domain/promotion_eligibility_read.ts`, `PromotionManager`,
`PROMOTION_PREPARED` admission, the revision fence in `planReconciled`, and
recovery's pre-redispatch check.

---

## 1. The distinction

```text
AttemptReport                =  historical result record
CurrentPromotionEligibility  =  current effect authority
```

An attempt report is immutable history. It stays canonical and readable forever.
It is **not**, on its own, permission to move a repository.

```text
CanonicalAttemptResult  ≠  CurrentPromotionAuthority
CompletedAttempt       ≠  PromotableAttempt
GatePass               ≠  PermanentPromotionAuthority
AttemptHistory         ≠  CurrentEffectAuthority
```

## 2. The minimum current eligibility

A NEW promotion may start only when ALL of the following hold, proven from
canonical local state alone (no git, no Ordarium):

| Fact | Blocker when violated |
| --- | --- |
| the attempt exists in this project | `attempt_unknown` |
| the attempt state is `COMPLETED` | `attempt_not_completed` |
| the report exists and has a `result_commit` | `result_commit_missing` |
| the task exists | `task_unknown` |
| the task state is `VERIFYING` | `task_not_verifying` |
| the task is not retired | `task_retired` |
| the attempt is a candidate of the task's CURRENT batch | `not_current_batch` |
| the task envelope matches the current ProjectIR (revision, digest, base) | `input_world_stale` (envelope facet) |
| the report was produced against that same input world | `input_world_stale` (report facet) |
| the canonical expected head is derivable | `head_conflict` |
| the canonical expected head equals the envelope's base commit | `cross_revision_promotion_not_supported` |
| a required gate is `PASS` | `gate_not_pass` |
| no unresolved intent already owns this attempt's effect | `promotion_effect_in_flight` / `promotion_settlement_required` |

`assessPromotionEligibility` is **pure**: no I/O, no writes, no score - only typed
blockers and a stable `assessmentDigest`. `eligible` is true iff there are no
blockers. An ineligible request writes no `PROMOTION_PREPARED` and starts no
effect.

## 3. Gate policy stays orthogonal

Promotion eligibility does **not** imply "every promotion requires a gate". The
product policy is unchanged: a gate is required only when the caller names one.
But when a gate IS named, G10-Y semantics apply unchanged - Evidence that lost its
authority cannot keep a gate `PASS`, so revoked Evidence defeats a required gate
before any effect.

```text
PromotionEligibility  +  Gate policy     (two separate, composable authorities)
PromotionEligibility  ≠  GateVerdict
```

## 4. The current-topology rule

This topology supports only **same-base** promotion:

```text
canonicalExpectedHead == taskEnvelope.baseCommit
```

When they differ, the promotion is refused with
`cross_revision_promotion_not_supported` **before the external effect**. Real
cross-revision compatibility is still unsupported (CF-X-01): Z closes only the
*unsafe effect-first* path, which previously moved Git and then failed Work
admission at `TASK_SATISFIED`.

The supported resolution for a task authorized at an older base is unchanged:
settle the batch, reconcile the head, and let the task be re-authorized onto the
proven head.

## 5. PROMOTION_PREPARED is a durable effect fence

```text
PROMOTION_PREPARED = external-effect intent that fences the Work authority
                     basis admitted at preparation time
```

It does not mean success. It means the project may no longer pretend no external
effect protocol is outstanding.

Admission for the fact itself (§20) proves from canonical local state: attempt
exists/completed, task `VERIFYING`, attempt in the current batch, task envelope
current, report matches the envelope, recorded source == report's result commit,
recorded expected head == the canonical one. No Git or Ordarium access in the
validator.

**Replay-safety.** `verifyFull()` and `rebuildProjections()` re-validate every
event against the projections they have rebuilt *so far*. A validator may
therefore only depend on time-correct state. The promotion-chain facts used here
are read from the `promotions` **projection** (replay-ordered), never from the
event log - the log always contains the future.

## 6. The revision fence

A ProjectIR revision may not **stale, remove, or replace** a task that owns an
outstanding promotion effect. The fence is evaluated on the set of tasks the
revision *would* retire:

```text
PREPARED            → promotion_settlement_required
COMMITTED_UNSETTLED → promotion_semantic_settlement_required
```

**Typed invalidation cannot bypass it.** G10-W deliberately relaxes quiescence for
the tasks a typed invalidation settles; the fence is evaluated on the resulting
retirement set, not on the input, so the settlement bypass does not cross it.

The fence is checked *before* the generic reconciliation blockers so the most
specific reason is reported. The set is computed as a superset of what the
revision could retire, so no blocker reported first can hide a fence.

```text
Revision  ≠  ImplicitPromotionCancellation
```

A revision is never allowed to "cancel" an outstanding effect by retiring its
Work.

## 7. COMMITTED ≠ TASK_SATISFIED

```text
PromotionPrepared   ≠  GitEffectSucceeded
PromotionCommitted  ≠  WorkSatisfied
PromotionCommitted  ≠  ProjectHeadSync
```

The layering is unchanged and load-bearing:

```text
PromotionEligibility   →  may an external effect start?
PROMOTION_COMMITTED    →  did the effect occur?
TASK_SATISFIED         →  may the effect satisfy current Work?
```

`TASK_SATISFIED` remains the final Work admission, with its validator intact.

## 8. Head-drift ordering

A meaning-changing revision is refused with `head_sync_required` while a committed
promotion effect has not been reconciled into the ProjectIR head, because such a
revision would anchor new or retained Work on a base the canonical promotion chain
has already superseded.

```text
effect  →  Work settlement  →  head sync  →  plan meaning change
```

The trusted head reconciliation itself is exempt: it carries `headAdvance` and is
head-only, so it is not meaning-changing.

## 9. Recovery: authority before dispatch

```text
ExternalEffectOccurred  ≠  CurrentWorkAccepted
```

Before ANY new dispatch or redispatch, recovery re-derives the current promotion
authority. Three cases, in this order:

1. **The effect is proven to have occurred** (Ordarium receipt/reconcile) - record
   `PROMOTION_COMMITTED` honestly. Reality is never hidden. The owning task is
   **not** auto-satisfied: effect truth is not Work admission.
2. **The invocation provably never started** and authority is gone - record
   `PROMOTION_FAILED` naming the revocation. No dispatch.
3. **The outcome is unresolved** - do not dispatch, do not fabricate success or
   failure; surface `promotion_effect_resolution_required`.

Palimpsest adds authority fencing; it does **not** reimplement Ordarium's recovery
evaluator. There is no distributed transaction.

## 10. What G10-Z does not do

```text
no second Promotion store          no global lock manager
no ManagerAgent                    no duplicate Ordarium recovery
no duplicate Git-head truth        no cross-revision compatibility engine
no External Asset scope
```

`ManagementMode ≠ EffectAuthority`: the management layer carries no promotion
action class at all, so MANAGE and DELEGATE cannot override a refusal - they
cannot promote.
