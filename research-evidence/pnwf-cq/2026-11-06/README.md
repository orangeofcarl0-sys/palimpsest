# PNWF-CQ evidence — 2026-11-06

This stage is deterministic product work plus one real DSH host scenario. **No paid model session was
started** (0 paid calls / 0 paid tokens). The two live PNWF sessions referenced in `live/` are the
already-authorized 2026-11-06 cohort, re-scored with the corrected accounting; they were not re-run.

## Contents

- `isolation/` — the container isolation gate record, the canary script and the image definition.
  Status: `EVALUATION_ISOLATION_QUALIFIED` (16/16 checks). The principal runs as uid 1001 with
  `/workspace` writable and `/harness` a root-owned 0700 read-only volume; the external scorer reads
  the harness as root outside the principal's namespace.
- `direct-governed/` — the real Windows DSH 0.2.1-rc.5 scenario:
  P0 commits a direct outcome C (no formal Work), P1 sees `DIRECT_HEAD_AHEAD`, is refused
  `HEAD_BASIS_MISMATCH` when delegating the existing task, and records `CHECKPOINT`; P2 reads the
  pulse/status. No attempt, no promotion, canonical head B unchanged.
- `live/rescore.json` — the corrected scorer on the PNWF live cohort: stream totals 1,579,080 /
  1,076,629; natural exits; DELIVER conclusions; tasks STALE; 0 promotions; 0 head movement;
  domain refusals counted separately from protocol errors.
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
- The Direct→Governed transition is a fail-closed capability gap; the report names the minimal
  operator-mediated basis-admission option. No head advance or promotion was fabricated.
