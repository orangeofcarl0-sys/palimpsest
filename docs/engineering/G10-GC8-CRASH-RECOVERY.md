# G10-GC8 — Crash Recovery

- After a crash following `WAKE_STARTED`, `resumeWake(campaignId)` reconstructs
  the same in-flight cycle; no second `WAKE_STARTED` is appended.
- After a crash following Work admission but before `PROJECT_ADMITTED`, retrying
  the same admission key returns the same Project and the Campaign records the
  link once (GC0 idempotent retry + idempotent Work port).
- No distributed atomicity is claimed; convergence uses stable ids, per-store
  transactions, freshness bases, and reconciliation.
