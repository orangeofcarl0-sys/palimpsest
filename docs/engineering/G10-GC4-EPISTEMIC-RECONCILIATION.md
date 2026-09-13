# G10-GC4 — Epistemic Reconciliation

`reconcileCurrentWorld` consumes the EXACT observed snapshot (one observation
basis) and commits ONE atomic batch:

```text
EVIDENCE_OBSERVED (changed only)
BELIEF_REVISED (changed only)
RECONCILIATION_COMMITTED { CampaignReconciliationReport }
WORLD_RECONCILED
COMMITMENTS_REVIEWED
```

Unchanged standing is a successful NO-OP (no duplicate events, so repeated
wakes are safe and never collide on `event_id`). Changed standing — including
same status with different provenance — creates a new observation and revision.
EvidenceHistory stays append-only; belief stays non-monotonic. With zero active
commitments the result is `no_active_commitment` and no Project may be
compiled; the Campaign is not auto-terminated.

`CampaignReconciliationReport.digest` is the canonical compiler freshness
anchor (never `null` after a successful reconciliation).
