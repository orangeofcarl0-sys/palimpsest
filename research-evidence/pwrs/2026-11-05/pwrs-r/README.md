# PWRS-R real-model cohort — 2026-11-05

Authorized: `research-evidence/pwrs/live/authorization-pwrs-r.json` (F/A, 2 sessions each, 2.5M per
session, 125k reserve, 10M aggregate). Result write-up: `docs/engineering/PWRS-R-RESULT.md`.

| | F | A (governed recovery) |
|---|---|---|
| Rubric | 7/7 | 5/7 (no 700 mm; baseline 900 mm not rejected) |
| Tokens | 2,857,944 | 2,798,802 |
| Session 2 end | budget stop | budget stop |
| Artifact | 44,372-byte canonical file | 48,332-byte candidate at `d8dc41f` |
| Reuse of the interrupted draft | 58.4% of lines | 100% (the draft was settled unchanged) |
| Governance | n/a | `PRINCIPAL_RECOVERY`, `DECLARED_ABANDONED`, `independenceEligible=false`, task VERIFYING, no promotion, no episode |

Aggregate 5,656,746 / 10,000,000. 118 provider POSTs (116×200, 2×502 UPSTREAM_TIMEOUT).

## Files

- `score.json` — the mechanical read: rubric, final source, interruption facts, reuse, sessions, A governance.
- `interruption-F.json`, `interruption-A.json` — the exact bytes and Git state at the 400k kill.
- `final/F-package.md`, `final/A-candidate.md` — the final artifacts.
- `sessions/<id>/` — run record, guard ledger, kill/stop timestamps, logs.
- `sessions/streams/` — real DSH session streams (F subagents, A worker).
- `usage.json`, `proxy.jsonl` — reconciled usage and request metadata only.
- `run-state.json`, `run-plan.json`, `cohort-run.json` — the fail-closed gate's records.

## What this pair shows, and does not

The relay path worked with a real model: A-2 found the retained world, read the injected 700 mm
constraint, committed the draft, declared the takeover, and the product recorded principal recovery
rather than worker production. The model then settled **before** revising the draft, so the candidate
kept the superseded 1200 mm assumption; its later edits were made after settlement and are not in the
result commit. F reached 7/7 but was budget-stopped. One pair per condition; no quality or cost
advantage is claimed.
