# PNWF-CQ evidence — 2026-11-06

This stage is deterministic product work, one real DSH host scenario, and one later owner-authorized
container cohort. **The container cohort is INVALID and OVER BUDGET** (5,190,778 actual tokens vs
5,000,000 authorized; 0/2 primary; both sessions budget-stopped). It is under
[`../live/2026-11-07/`](../live/2026-11-07/README.md); no further paid session was started. The
deterministic evidence here is unaffected.

## Contents

- `isolation/` — the container isolation gate record, the canary script and the image definition.
  Status: `EVALUATION_ISOLATION_QUALIFIED` (16/16 checks). The principal runs as uid 1001 with
  `/workspace` writable and `/harness` a root-owned 0700 read-only volume; the external scorer reads
  the harness as root outside the principal's namespace.
- `direct-governed/` — the real Windows DSH 0.2.1-rc.5 scenario:
  P0 commits a direct outcome C (no formal Work); P1 sees `DIRECT_HEAD_AHEAD`, is refused
  `HEAD_BASIS_MISMATCH` when delegating the existing task, and records `CHECKPOINT`; the independent
  operator CLI verifies a signed Ed25519 credential and admits C as the canonical basis; P2 reads
  `IN_SYNC`, task `READY`, Scheduler decision `TASK_STARTED`, and the semantic decision. No attempt,
  no promotion, no `ATTEMPT_COMPLETED`/`PROMOTION_COMMITTED`.
- `live/rescore.json` — the corrected scorer on the PNWF live cohort: stream totals 1,579,080 /
  1,076,629; natural exits; DELIVER conclusions; tasks STALE; 0 promotions; 0 head movement;
  domain refusals counted separately from protocol errors. **The later 2026-11-07 container cohort
  is separate and invalid; see `../live/2026-11-07/`.**
- `tests/` — build, architecture, public API and test logs.

## Source identities

- Baseline: `464ae5fc086af5e372295d047c98144dc22a5c77` (PR #226 merge, `origin/main`).
- Branch: `palimpsest-pnwf-action-coherence`.
- Report: [`docs/engineering/PNWF-CQ-RESULT.md`](../../../docs/engineering/PNWF-CQ-RESULT.md).
- Previous live trajectory analysis: `docs/engineering/PNWF-LIVE-TRAJECTORY.md`.

## Limits

- The container canary qualifies the boundary; the current Windows live runner still launches DSH on
  the host, so `run_pnwf_live.mjs` now refuses an execute run without a `container` isolation record.
  The live adapter integration is not exercised.
- The cross-host settlement boundary is reproduced and attributed `UNATTRIBUTED`; it is not
  mechanically refused without breaking the supported principal-authored completion path.
- The Direct→Governed transition is now implemented as an operator-only, head-only basis admission.
  It records `MANUAL_APPROVAL_RECORDED` + `PROJECT_REVISED`, reauthorizes the retained task at the
  admitted commit, and writes no promotion or worker result. The local signed credential is not an
  IdP/SSO integration.
