# ODPE-R cohort — 2026-11-05

Authorized: `research-evidence/odpe/live/authorization-odpe-r.json` (F/A, 4 sessions, 2.5M each,
125k reserve, 10M aggregate). Product under test: ODPE at `105903f` (merged as `abc9d96`).
Report: `docs/engineering/ODPE-R-RESULT.md`.

| | F (F+Finish) | A (adaptive product) |
|---|---|---|
| Rubric | **7/7** | **7/7** |
| Tokens | 431,393 + 184,436 = **615,829** | 418,106 + 614,275 = **1,032,381** |
| Session 1 end | killed at 400k | killed at 400k |
| Session 2 end | natural | natural |
| Final | 27,472 B, uncommitted worktree | 30,610 B at `100a2b13` |
| Draft reuse | 206/206 lines (100%) | no committed draft |
| Work state | n/a | VERIFYING / COMPLETED; `UNATTRIBUTED` |
| Episode | n/a | `WAIT_FOR_OPERATOR`, `RESULT_COMMIT` |

Aggregate **1,648,210 / 10,000,000**; 67 provider POSTs (66×200, 1×403 preflight).

## What this pair shows

Both conditions reached the 7-fact floor and both ended naturally. F wrote a correct package but left
it uncommitted; A settled a canonical candidate and pointed the episode at its result commit. A used
more tokens. One pair per condition; no quality or cost advantage is claimed.

A's attempt was compiled before the measured input arrived, so the manifest correctly carried no
input; session 2 read the untracked file natively and acknowledged it at settlement. The
“new attempt receives `@ctx/input/...`” path is proven by the deterministic ODPE-C run, not by this
cohort.

## Files

- `score.json` — rubrics, final sources, interruption snapshots, sessions, A governance.
- `interruption-F.json`, `interruption-A.json` — state at the kill.
- `final/F-package.md`, `final/A-package.md`.
- `sessions/` — run records, budget ledgers, logs and stamps.
- `final/session-streams/` — the real DSH session streams (zstd).
- `proxy.jsonl` — request metadata only.
