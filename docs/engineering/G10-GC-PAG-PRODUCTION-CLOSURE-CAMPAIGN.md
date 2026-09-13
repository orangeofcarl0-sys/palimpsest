# G10-GC — PAG Production Closure Campaign

Campaign: **PAG Production Closure** — Institution-Grounded Campaign · Grounded
Checkpoint · Current-World Reconciliation · Strict Wake State Machine ·
Reconciled Compiler Context · Crash-Safe Closed Loop

Baseline at campaign start: `main` @ `126c11ed…` (published G10-G PASS).

## 1. Why G was reclassified (§1)

An independent post-campaign audit found that the G10-G **primitives** were
valid, but the production composition still permitted: a Campaign referencing a
non-existent Institution; caller-authored checkpoints; `observeWorld()`
observing only the Institution epoch (empty claim/project/watch lists);
reconciliation that did not refresh Evidence/Belief; more than one possible
WakeCycle; wake completion without reconciliation or actual admission;
repeated unchanged Evidence colliding on `event_id`; compiler WAIT conditions
bypassing strict parsing; unchecked casts at the durable boundary; and installed
compiler context populated with placeholders.

```text
G10-G PAG primitives: PASS
G10-G integrated Campaign/Wake loop: PARTIAL — wake/institution grounding closure required
```

G10-GC closes those gaps WITHOUT replacing the successful G1–G6 semantic model.

## 2. Stage topology (§199) and how it was executed

| Spec stage | Focus | Delivered as |
| --- | --- | --- |
| GC0 | CampaignStore retry idempotency + durable-parser closure | `experiment/g10-gc0-campaign-history-hardening` (PR #48) |
| GC1 | Campaign → DurableInstitution grounding | `experiment/g10-gc1-campaign-institution-grounding` (PR #49) |
| GC2–GC6 | grounded checkpoint, current-world observation, epistemic reconciliation, wake state machine, reconciled compiler context | `experiment/g10-gc2-gc6-production-loop-closure` (PR #50) |
| GC7–GC8 | installed golden path + genuine dormant-world-change E2E + closure | `experiment/g10-gc7-gc8-installed-pag-closure` (PR #51) |

**Honest deviation:** GC2–GC6 were delivered as ONE merged stage rather than
five separate branches, because those stages share a single atomic-batching and
freshness model (checkpoint → dormancy → observation → reconciliation → wake)
and splitting them would have produced intermediate states that are not
independently truthful. Per-stage semantics are documented individually
(`G10-GC2-GROUNDED-CHECKPOINT.md` … `G10-GC6-RECONCILED-COMPILER-CONTEXT.md`).
GC0 and GC1 were each their own stage; GC7–GC8 are the closing stage.

## 3. GC0 — store/parser closure

`appendAtomic` classifies requested ids BEFORE rejecting a stale basis:
all-present byte-semantically-identical → idempotent success (the basis may be
historical); partial → `recovery_required`; conflicting → `event_conflict`;
chain verified on every read, so a corrupt row can never be returned as a
successful retry. Distinct taxonomy: `basis_mismatch`, `event_conflict`,
`recovery_required`, `malformed_record`, `database_busy`, `unknown_campaign`.
Strict `parseProjectOperationalStanding` / `parseCampaignWatchDraft`; the
compiler WAIT path routes every draft through the strict parser.

## 4. GC1 — Institution grounding

`CampaignInstitutionPort` (the same read-only source used for epoch reads) is
required by `createCampaign`. `unknown` / `error` / missing port refuses genesis
and writes ZERO events — a ghost Campaign is impossible. Ownership
(`CampaignDefinition.institutionId`) is immutable; ground validation is
service-level (the store never imports InstitutionStore). Install exposes the
campaign surface only when a canonical institution source is supplied.

## 5. GC2 — grounded checkpoint & atomic dormancy

`buildCurrentCampaignCheckpoint` DERIVES the checkpoint (basis, institution
epoch, belief digest, active commitments/hypotheses/watches, linked Projects);
no caller-authored checkpoint on the golden path; no hidden CoT/context/session.
`admitWait` commits ONE atomic batch: `WATCH_INSTALLED* → WAIT_DECIDED →
CHECKPOINT_RECORDED → CAMPAIGN_QUIESCING → CAMPAIGN_DORMANT`. Empty wake plans
and ungrounded checkpoints are refused.

## 6. GC3 — current-world observation

`observeCurrentWorld` covers every load-bearing fact: current owner institution
epoch (always), every ACTIVE hypothesis claim, every Campaign-linked Project,
and actual triggered WatchIds. Conditional dependencies (zero hypotheses ⇒ no
Evidence port needed; zero linked Projects ⇒ no Work port). ANY unknown/error
fact ⇒ `reconciliation_incomplete` with zero writes. Typed
`CampaignWakeCause = watch{watchId} | manual{signalId, reason}`; a watch-caused
wake requires a canonical `WATCH_TRIGGERED`, so a caller cannot forge one.
Observation is read-only.

## 7. GC4 — epistemic reconciliation

One atomic batch: `EVIDENCE_OBSERVED` (changed only) → `BELIEF_REVISED`
(changed only) → `RECONCILIATION_COMMITTED { CampaignReconciliationReport }` →
`WORLD_RECONCILED` → `COMMITMENTS_REVIEWED`. Unchanged standing is a successful
NO-OP (no duplicate events; repeated wakes safe). Same status with changed
provenance still creates a new observation/revision. Zero active commitments ⇒
`no_active_commitment` (no Project, no auto-termination). The report digest is
the compiler freshness anchor (never null after success).

## 8. GC5 — wake state machine

`beginWake` only from `DORMANT`; from `WAKING`/`RECONCILING` returns
`wake_already_in_progress` with the existing cycle (never a second cycle); at
most one incomplete WakeCycle per Campaign. `resumeWake` recovers it after a
crash without a second `WAKE_STARTED`. `completeWakeWithAction` requires
reconciliation AND real admission (project → `PROJECT_ADMITTED`; wait →
`WAIT_DECIDED` + grounded checkpoint). No arbitrary public completion escape.

## 9. GC6 — reconciled compiler context

The installed compiler context is built from current reconciled facts
(institution epoch, active commitments/hypotheses, belief state, latest
observation refs, intervention summaries, truly-active watches, reconciliation
digest) — never placeholder `null`/`[]` where data exists. Candidates remain
strictly parsed, freshness-checked candidates.

## 10. GC7/GC8 — installed golden path & genuine E2E

`installed.campaign.production` exposes the grounded loop
(`buildCurrentCampaignCheckpoint`, `admitWait`, `observeCurrentWorld`,
`reconcileCurrentWorld`, `beginWake`, `resumeWake`, `completeWakeWithAction`).
The GC8 E2E changes the external world WHILE the Campaign is DORMANT
(institution epoch 1→2, Project standing change, claim standing change),
triggers a real watch, wakes, blocks on an unknown fact with zero writes,
reconciles atomically, proves unchanged refresh is a no-op, and admits a NEW
Project (never replaying the old plan) before `WAKE_CYCLE_COMPLETED(project)`
returns the Campaign to ACTIVE.

## 11. Identity matrix (§207)

```text
InstitutionId ≠ CampaignId          CampaignId ≠ ProjectId
CampaignCommitmentId ≠ federation CommitmentId
HypothesisId ≠ EvidenceClaimId      WakeCycleId ≠ CampaignId
CampaignProjectRef ≠ Campaign identity
CampaignCheckpoint ≠ current world  WorldSnapshot ≠ current Evidence truth
ReconciliationReport ≠ BeliefState  CompiledCampaignAction ≠ admitted Work
```

## 12. Knowledge-state matrix (§204)

| Domain | Known | Unknown/error behaviour |
| --- | --- | --- |
| Institution | current epoch | block checkpoint / wake reconciliation |
| Evidence | current claim standing | block relevant reconciliation |
| Work | linked project standing | block relevant reconciliation |
| Watch external source | condition truth | incomplete; never triggered by guess |
| Campaign history | replay valid | malformed history fails closed |

## 13. Lifecycle matrix (§205)

```text
ACTIVE --WAIT admission--> DORMANT
DORMANT --beginWake--> WAKING --reconcileCurrentWorld--> RECONCILING
RECONCILING --admitted Project--> ACTIVE
RECONCILING --admitted WAIT--> DORMANT
ANY non-terminated --explicit termination--> TERMINATED   (TERMINATED: no wake)
```

No implicit transitions outside this graph.

## 14. Store ownership (§206)

Work EventStore → Work truth · Evidence plane → Evidence truth/standing ·
CampaignStore → Campaign temporal history · InstitutionStore → institution
lineage · OrganizationStore → Organization · CoordinationStore → collaboration ·
ContinuityStore → PersistentPoint · Ordarium → effect operations.

## 15. Crash safety (§209)

No cross-store distributed transaction is claimed. Safety comes from stable
semantic ids, per-store atomic transactions, Campaign freshness bases,
idempotent Work admission, durable prepared/admitted correlation, and
reconciliation after crash.

## 16. Red-team findings

All §10/§179–§183 attacks were closed in-stage: ghost Institution Campaign
refused; caller checkpoint removed; checkpoint basis/epoch/belief coherence
enforced; unknown/error facts never become belief or failure; watch triggers
idempotent and never forged as wake causes; duplicate WakeCycle impossible;
completion cannot skip reconciliation/admission; stale candidates refused;
cross-store crash converges without duplicate Project; malformed nested
persisted values fail closed.

## 17. Canonical checkpoints

| Stage | PR | merge commit |
| --- | --- | --- |
| GC0 | #48 | `9e98b0c` |
| GC1 | #49 | `d19d127` |
| GC2–GC6 | #50 | `b417baf` |
| GC7–GC8 | #51 | recorded on branch |

## 18. Final verdict

```text
G10-GC PAG PRODUCTION CLOSURE: PASS
```

## 19. Corrected G10-G verdict (§196)

```text
G10-G CAMPAIGN, EPISTEMIC CONTINUITY & WAKE:
PASS — PRODUCTION CLOSURE VERIFIED BY G10-GC
```

The original campaign record is preserved (not overwritten); an additive note
records the audit reclassification and the GC closure.

## 20. Recommended next major campaign (§211 — NOT started)

`G10-H — RuntimeScope & Holon Grounding` (execution ownership, budget/retry/
cancellation ownership, scope nesting, organization ↔ RuntimeScope, internal
multiplicity → external unity, Holon interface/activation, composite
participation, substitution). Alternatively Persistent Agent migration/fork/
quarantine, if GC evidence shows PAG remains the higher-value frontier. Follow
evidence.
