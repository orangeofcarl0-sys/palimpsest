# PWRS-R3 real-model retest — 2026-11-05

Authorized: `research-evidence/pwrs/live/authorization-pwrs-r3.json` (A only, 2 sessions, 2.5M each,
125k reserve, 5M aggregate). Product under test: PWRS-D/E at `e3110c8`. Report:
`docs/engineering/PWRS-R3-RESULT.md`.

| Fact | Value |
|---|---|
| Rubric | **7/7** |
| Tokens | 404,956 + 1,424,148 = **1,829,104 / 5,000,000** |
| Session 1 | killed at 400k; the retained world was **empty** |
| Session 2 | **natural exit 0** at 1.42M (no budget stop) |
| Gate | `successor` **refused** with `INPUTS_CHANGED_SINCE_BASIS` (listed `inbox/…/corridor-measurement.md`); after `acknowledgeInputs=true` it succeeded |
| Final artifact | 19,878 bytes, candidate at `ddf8bf3` (`RESULT_COMMIT`) |
| Episode | **`WAIT_FOR_OPERATOR`**, artifact at the result commit |
| Task / attempt | VERIFYING / COMPLETED; no promotion |
| Attribution | old attempt `UNATTRIBUTED`; new attempt `MULTI_EXECUTOR`, `independenceEligible=false` |
| Provider | 74 POSTs: 72×200, 2×502 after both sessions ended; 1 GET 403 health probe |

## What happened

A-1 was killed before its worker wrote anything. A-2 read the injected measured source, found the
empty retained world, tried `takeover` (`NO_WORK`), then tried `successor` and was **refused** until it
acknowledged the unseen input. It acknowledged, started a new attempt, propagated the measured input,
drove it to a committed package, and recorded `WAIT_FOR_OPERATOR`. The session ended naturally with
about 60% of its soft stop unused.

## What this shows, and does not

It is the first pair in the PWRS-R line with all three: the unseen-input gate triggered, a candidate
was settled, and the episode converged naturally. The attribution is honest — the final candidate is
`MULTI_EXECUTOR` (the principal also wrote), not independent worker production. One pair, A only, no
F control: the improvement is descriptive, not a causal or cost claim.

## Files

- `score.json` — rubric, final source, interruption facts, sessions, governance and both relay records.
- `interruption-A.json` — the empty retained world at the kill.
- `final/A-candidate.md`, `final/canonical-log.txt` — the candidate is not on the canonical branch.
- `sessions/A-1`, `sessions/A-2`, `sessions/streams/` — run records, guard ledgers, logs, real DSH streams.
- `usage.json`, `proxy.jsonl` — reconciled usage and request metadata only.
