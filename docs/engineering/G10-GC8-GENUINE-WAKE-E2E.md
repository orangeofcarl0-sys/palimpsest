# G10-GC8 — Genuine Dormant-World-Change E2E

`test/gc8_wake_e2e.test.ts` builds an Institution-owned Campaign, establishes
H1/Q1=SUPPORTED, records a refuting intervention, adds child H2, enters WAIT
with a grounded checkpoint (atomic), then CHANGES THE EXTERNAL WORLD WHILE
DORMANT: institution epoch 1→2, linked Project standing → completed, H2 claim
standing change. A real watch is triggered; `beginWake` starts W1 (a forged
watch id is refused); a forced unknown claim blocks reconciliation with zero
writes; the restored world reconciles atomically; unchanged refresh is a no-op
(zero events); the compiler sees the current reconciled context; a NEW Project
is admitted idempotently and `WAKE_CYCLE_COMPLETED(project)` returns the
Campaign to ACTIVE — the old plan is never replayed and CampaignId is unchanged.
