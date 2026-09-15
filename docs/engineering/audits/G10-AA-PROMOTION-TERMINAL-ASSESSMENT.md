# G10-AA — Promotion terminal assessment (AA0)

Baseline `0164aab755a1372e4f1c81e391c2fd2f73a661f3`. Read:
`G10-Z-CARRY-FORWARD.md`, `G10-Z-PROMOTION-AUTHORITY-DELIVERY.md`,
`G10-Z-PROMOTION-RACE-EVIDENCE.md`, `src/effects/promotion.ts`,
`src/effects/runtime.ts`, `src/effects/actions.ts`, `src/domain/aggregate.ts`,
`src/domain/promotion_eligibility*.ts`, `src/domain/project_head.ts`,
`src/state/event_store.ts`, `src/state/projector.ts`, `src/schema/**`,
`src/recovery/**`, `test/**`.

## 1. The defect as found in the code

`AggregateValidator.validate` routed `PROMOTION_COMMITTED`/`PROMOTION_FAILED` into
`default: return;`, and `validateAdmission` handled only `TASK_CREATED` /
`TASK_REAUTHORIZED`. So both terminal types were ordinary events: any in-process
writer could append one through the generic `EventStore.append` with no
validation whatsoever, and the projector would then update the `promotions`
projection - which is the ONLY source of `promotionFactsSync()`, and therefore of
`ProjectHeadStatus` and the proven effect head.

Z had hardened `PROMOTION_PREPARED` structurally, but only for the Work basis:
nothing proved that the governed effect protocol was ever *entered*.

## 2. Independent reproduction (§6)

`scripts/audit/aa0-terminal-ingestion-repro.mjs` runs the production code with a
deterministic in-memory git port.

**Scenario A — forged COMMITTED.** A genuine unresolved PREPARED (a post-merge
crash), then a direct `append(PROMOTION_COMMITTED)` matching the intent with an
**invented** resulting head:

```text
genericAppend:            ACCEPTED
provenEffectHeadCommit:   cc…cc  →  …09      (the canonical head MOVED)
committedFacts:           []     →  [<forged>]
classification: HOLE_FORGED_COMMITTED_MOVES_CANONICAL_HEAD
```

**Scenario B — forged FAILED (the load-bearing one).** The same unresolved PREPARED,
with the merge **already landed** at head `…04`, then a direct
`append(PROMOTION_FAILED)`:

```text
genericAppend:   ACCEPTED
fenceBefore:     [promotion-…:PREPARED]     fenceAfter:  []
revisionOutcome: COMMITTED
taskStateAfter:  STALE
classification:  HOLE_FORGED_FAILED_REMOVES_FENCE_AND_RETIRES_WORK
```

A forged failure therefore removed Z's fence and let a revision retire Work whose
external effect had really happened - with no Ordarium outcome behind it at all.

**Scenario C — fabricated PREPARED (§28).** With a promotion-eligible VERIFYING
attempt, a generic writer appended a structurally perfect PREPARED:

```text
genericAppend:   ACCEPTED
fence:           [promotion-aaa…:PREPARED]
classification:  HOLE_FABRICATED_PREPARED_BLOCKS_REVISION
```

So a generic writer could also manufacture a fake revision fence.

## 3. Audit of the validation planes

`EventStore.#appendInTransaction` already ran, in order: idempotency lookup →
`validatePreconditions` → `validate` → `validateAdmission` → insert → project;
and `verifyFull()` / `rebuildProjections()` run `validate` → project with
`clearProjections()` first. So the two-plane split AA needs **already existed**;
the work was to put real rules in both planes without breaking replay.

Consequence: anything added to `validate` must be replay-safe, and anything
requiring a live capability must go in `validateAdmission` (which replay never
runs).

## 4. Outcome-basis audit

`promote()`'s catch already distinguished transient from deterministic errors via
`isTransientOperationError`, and recovery already had branches for
`succeeded`/`reconciled`, `failed`/`denied`, `cancelled`, a missing record, and
the Z authority-revocation case. Those branches are the real outcome bases the
witness vocabulary needed; no new classification was invented.

## 5. Findings that shaped the implementation

**Replay-safety of the structural plane.** The first check must read the admitted
intent from the `promotions` **projection** (rebuilt in order), never from the
`events` table, which always contains the future. Reading from the projection also
gives the precise "already COMMITTED" message for a second terminal, because the
projector overwrites the row's `state_json` with the terminal payload whose
anchoring fields are identical.

**The `invalidateTask` fence gap.** Z's fence lived only in `planReconciled`. The
direct `invalidateTask` path (no production callers) could retire Work across an
unresolved effect, manufacturing the very state recovery's authority re-check
guards. Closed in AA: the same fence now applies there. Without this, OT-A27
("Z fences remain intact") would have been asserted rather than true.

**Deterministic failure is not reachable through the engine contract.** A
provider error is surfaced as `UncertainOperationError` - the engine genuinely
cannot tell whether the effect happened - and `orchestrationAuthorization` always
returns `allow`, so no denial reaches `promote()`. No existing test had ever
produced a `PROMOTION_FAILED` through the manager. AA wires the bases and proves
the *admission* of a failure terminal positively, and records the branches as
defence in depth (`CF-AA-01`) rather than pretending to exercise them.

**Legacy compatibility is structural, not lenient.** No fixture and no canonical
log contains a terminal without a PREPARED, so requiring one is compatible with
all existing history. The optional provenance fields are additive: absent keys are
dropped by canonical JSON, so the request/event digests of existing events do not
move - asserted directly by `AA-N20`.

**Idempotency precedes validation.** An identical terminal retry resolves through
its idempotency key to the stored event before either plane runs, which is exactly
§47's "replay causes no new effect and needs no witness". It also means a
consumed capability is not re-tested on a retry.

## 6. What the audit changed about the plan

* Two narrow append methods instead of an `append(event, { admissionWitness })`
  option (§16).
* A one-shot registry plus a module-private brand, so a structural copy of a real
  instance is refused too (§14) - not just a plain object.
* Intent permits for PREPARED as well as witnesses for terminals (§29), closing
  the fabricated-fence hole in the same framework.
* Optional provenance fields on terminals only (§57), with PREPARED left without a
  provenance surface.
* The `invalidateTask` fence check (§51's "reassess Z without merging unrelated
  scope" - this is the same fence, not new scope).
