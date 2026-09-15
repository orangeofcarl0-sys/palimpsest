# G10-Z — Promotion-fence anti-waste audit

Every claim is checkable against the diff and the suites.

| Claim | Evidence |
| --- | --- |
| **No second Promotion store** | `Z-N28` asserts the only promotion-named table is `promotions`, and no table matches `/lock\|fence\|eligib/`. The fence is DERIVED from the promotion events on every read. |
| **No global lock manager** | No lock/ticket object exists in `src/**`; the fence is a pure read (`promotionFenceRows`) plus a comparison against the retirement set. `Z-N28` asserts the derived fence is empty on a quiescent project. |
| **No ManagerAgent** | The management layer carries no promotion action class (`Z-N22` asserts no `MANAGEMENT_ACTION_CLASSES` entry matches `/promot/`), and `project_management/service.ts` names no `promote`/`promoteAttempt`. |
| **No duplicate Ordarium recovery** | `reconcileAll()` still delegates every outcome to the engine; Z adds only a pre-dispatch authority check. No retry/reconcile policy was reimplemented - unresolved outcomes are surfaced, not decided. |
| **No duplicate Git-head truth** | `canonicalExpectedHead` is unchanged (X's derivation). The shared reader reads the `promotions` projection, which is the projector's view of the SAME `PROMOTION_COMMITTED` facts - no new head source. `Z-N23` asserts the ProjectIR head equals the promotion's resulting head after each sync. |
| **No cross-revision compatibility engine** | `Z-N27` scans the source for `crossRevisionCompat`/`oldBaseCompat` and finds none, and asserts the controller prototype exposes no parallel/old-base surface. The unsupported case fails closed. |
| **No new event type / migration / table** | `fixtures/**` untouched; the full suite passes with the existing ledger schema version. |
| **One assessor, not four** | `assessPromotionEligibility` is called from `promote()`, `promoteAttempt()`, `promotionEligibility()`, the revision-adjacent recovery path, and the `PROMOTION_PREPARED` validator. `readPromotionEligibilityInput` is the only place that assembles its input. |
| **One fence definition** | `promotionFenceBlockers` / `compilePromotionFenceBlocker` are the only producers of fence blockers; the revision path and the status view both consume them. |
| **Deleted, not layered** | No legacy promotion path survives: `promote()` and `promoteAttempt()` both pass the assessment, so the "expert" path is not a fallback. |

## Cost added at runtime

* One eligibility read per promotion attempt: a handful of indexed single-row
  lookups (project, attempt, task, batch) plus one `promotions` projection scan.
  No writes, no extra transaction.
* One fence read per `planReconciled`: the same projection scan plus one
  attempt-row lookup per pending intent (usually zero → no query at all, since
  `#preparedPromotions()` returns nothing).
* Recovery: one eligibility read per pending intent, before dispatch.

Net: the admission checks replaced nothing and added no external calls; recovery
now performs *fewer* effect invocations in the revoked-authority case (it refuses
them).

## Deliberately NOT built

```text
a promotion lock/ticket store          a global revision lock
a ManagerAgent                          a second Ordarium reconcile loop
a second Git-head derivation            a cross-revision compatibility engine
a cached eligibility index              a background fence monitor
an External Asset Library bridge
```

## Honest limitations

* The fence is derived per call rather than cached. For a project with a very
  large pending-promotion backlog this is O(pending intents) per revision; today
  the supported topology allows at most one unresolved intent per VERIFYING task,
  and concurrency is bounded by the declared stage graph.
* `promotionFenceRows()` reads `PROMOTION_PREPARED` rows from the **events** table
  (the fence is a read model, not a validator), while
  `readPromotionEligibilityInput` reads committed facts from the `promotions`
  projection for replay-safety. The two are deliberately different sources for
  deliberately different purposes; both derive from the same canonical events.
* The `input_world_stale` report facet is unreachable through the event store
  (the aggregate refuses such a report at `ATTEMPT_COMPLETED`); it is asserted as
  defence in depth by `Z-N06`, not as a live hole.
