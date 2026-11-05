# PWRS-R2 real-model retest — 2026-11-05

Authorized: `research-evidence/pwrs/live/authorization-pwrs-r2.json` (A only, 2 sessions, 2.5M each,
125k reserve, 5M aggregate). Product under test: PWRS-D at `adbcd42`. Report:
`docs/engineering/PWRS-R2-RESULT.md`.

| Fact | Value |
|---|---|
| Rubric | **7/7** |
| Tokens | 410,744 + 2,397,123 = **2,807,867 / 5,000,000** |
| Session 1 | killed at the 400,000-token milestone; the worker had written **nothing** |
| Session 2 | budget stop; `takeover` refused (`NO_WORK`), chose `successor`, new attempt, `delegate` |
| Final artifact | 45,385 bytes, commit `09bf7ab`, **unsettled** in a RUNNING attempt's world |
| Governance | old attempt CANCELLED; new attempt RUNNING; task ACTIVE; no candidate, no promotion, no episode |
| Provider | 79 POSTs, all 200 |

## What happened

A-1 was killed before its worker produced a file. A-2 read the injected 700 mm source, found the
empty retained world, tried `takeover` (correctly refused with `NO_WORK`), then closed it as a
`successor`, started a new attempt, copied the untracked measured source into the new world, and
delegated. The new worker committed a 7/7 package. A-2 was stopped by the guard before it settled
that attempt, so the result is a committed world artifact, not a candidate.

## What this does and does not show

It shows the model can propagate a newly arrived input into a fresh world and produce a correct
package after an interruption. It does **not** exercise the PWRS-D input acknowledgement (successor
bypasses settlement) and it does not show convergence: the attempt remained RUNNING with the task
ACTIVE. One pair; no quality or cost advantage is claimed.

## Files

- `score.json` — rubric, final source, interruption facts, sessions, governance.
- `interruption-A.json` — the empty retained world at the kill.
- `final/A-package.md`, `final/attempt-world-log.txt`, `final/attempt-world-status.txt`.
- `sessions/A-1`, `sessions/A-2`, `sessions/streams/` — run records, guard ledgers, logs and real DSH streams.
- `usage.json`, `proxy.jsonl` — reconciled usage and request metadata only.
