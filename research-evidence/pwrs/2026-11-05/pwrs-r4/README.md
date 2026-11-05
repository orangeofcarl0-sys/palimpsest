# PWRS-R4 matched F/A — 2026-11-05

Authorized: `research-evidence/pwrs/live/authorization-pwrs-r4.json` (F/A, 4 sessions, 2.5M each,
125k reserve, 10M aggregate). Product under test: PWRS-D/E at `e3110c8`. Report:
`docs/engineering/PWRS-R4-RESULT.md`.

| | F | A |
|---|---|---|
| Rubric | **7/7** | **7/7** |
| Tokens | 418,992 + 2,403,625 = **2,822,617** | 421,015 + 2,420,961 = **2,841,976** |
| Session 2 end | budget stop | budget stop |
| Final artifact | 40,974 B canonical, uncommitted | 25,790 B, unsettled in a RUNNING attempt's world |
| Reuse of interruption draft | 334/350 lines (95.4%) | none existed (empty world) |
| Governance | n/a | successor `UNATTRIBUTED`; new attempt RUNNING; task ACTIVE; no candidate, no episode |

Aggregate **5,664,593 / 10,000,000**; 146 provider POSTs (144x200, 2x502 during A-2, retried).

## What this pair shows

Both conditions reached the 7-fact floor and neither converged. F reused 95.4% of its interrupted
draft and produced an uncommitted package; A produced a correct package but was stopped before
settling, so it has no candidate. R3's natural convergence did **not** replicate. Across the A runs
(R1 stale settled 5/7, R2 unsettled 7/7, R3 settled 7/7 + natural, R4 unsettled 7/7), the gates are
sound but do not by themselves make the model finish; one pair per condition cannot attribute an
effect.

## Files

- `score.json` — both rubrics, final sources, interruption facts, reuse, sessions, A governance.
- `interruption-F.json`, `interruption-A.json` — state at the kill.
- `final/F-package.md`, `final/A-package.md`, `final/A-attempt-world-log.txt`.
- `sessions/<id>/`, `sessions/streams/` — run records, ledgers, logs and real DSH streams.
- `usage.json`, `proxy.jsonl` — reconciled usage and request metadata only.
