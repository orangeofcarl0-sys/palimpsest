# COG-4.0 — forward-only audit of the COG-3 measurement debt

Generated 2026-11-01T09:19:56.225Z from the immutable COG-3 evidence. No COG-3 file was modified.

## Token reconciliation

- Principal stream: 16,194,148 tokens in 100 assistant messages.
- Branch stream: 21,573 tokens in 6 assistant messages.
- Stream total: 16,215,721. run-two.json records 16,215,721 (exact match).
- scores.json records 16,221,721: **6,000 above the immutable stream**.
- The streams end at `turn/end` with no duplicate seqs, so the difference is arithmetic/transcription, not a later append.
- Corrected campaign total: 27,125,380 against the 25,000,000 cap; overrun 2,125,380 (still a real overrun).

## Project-update commit scope

- Recorded update head: `2d2aebd737836332e3e264abec774c9eb21eacce`; the test-owned world is preserved: **no**.
- `applyUpdate()` used `git add -A (scripts/cog3/rig3.mjs applyUpdate)` and verified no staged-path list.
- Observed phase-one write path(s): `deliverables/plan.md`.
- Phase-one `git status --short`: `?? deliverables/\n---\n  610  9587 57636 deliverables/plan.md\n---\n`.
- Therefore the update commit captured the intended update file **and** the generated phase-one deliverable. The exact set is not recoverable because the commit object was not preserved.
- COG-4 disposition: COG-3 is not rewritten. COG-4 stages only explicitly named update paths and verifies `git diff --cached --name-only` before committing.

## Turn telemetry

- Principal unique turns: 3 (turn 1: 56 steps, turn 2: 8 steps, turn 3: 36 steps).
- Branch unique turns: 1. Model execution turns across both Sessions: 4.
- Run-one Host summary records: 2, emitted [2026-10-31T23:37:28.262Z] and [2026-10-31T23:37:28.265Z].
- Both records end with turn 2's text; the first covers 128 calls (turn 1 + turn 2), the second 110 calls (part of turn 1 + turn 2).
- Finding: The session stream has exactly three principal turns (56 + 8 + 36 steps) and one branch turn. The two run-one `PALIMPSEST_TURN` records were emitted 3 ms apart and both end with turn 2's text; the first covers turn 1 + turn 2 (256 tool entries / 128 calls) and the second covers part of turn 1 + turn 2 (220 entries / 110 calls). No fourth model turn occurred. This is an observation/record overlap caused by `printTurn()` running after `whenIdle()` had also waited for the delegation follow-up turn, not a model-execution duplicate. The launch turn's own final text is not present in any summary record.

## Python / broad-test environment

- `python` on PATH: **no**.
- `py` available: **yes** (Python 3.14.7).
- COG-3 broad failure: test/inplace_execution.test.ts: 3 tests; the gate command `python -c ...` produced no observable exit code.
- COG-3 diagnostic: PATH=/d/ProgramData/anaconda3:$PATH npx vitest run test/inplace_execution.test.ts --maxWorkers=1 -> 9/9 passed.
- COG-4 rule: before broad testing, verify a `python` executable is on the test PATH (or record the missing prerequisite); do not rerun the COG-3 suite to obtain a greener historical record.

## Protected resources at this audit

- Worktrees: 95; locks: 2; gate roots: 19; evidence trees: 72; stashes: 0.

## Budget monitor proof

- Simulated self-test: **11 passed, 0 failed**.
- Cases: duplicate observation is charged once; delayed event is charged once and flagged; a resumed Session is one Session and its events sum once; a child Session is counted separately; cache-read is reported separately from input/output; launch is refused when observed + live reserve + estimate crosses the launch-stop threshold; launch is allowed again after the live reserve is released and enough headroom remains; the hard stop is raised at the ceiling; unavailable usage is recorded without inventing tokens; a completed Session is accounted exactly once; a Session past its wall-clock bound is reported.
- Evidence: `budget-selftest.json` (simulated usage; no model was called).

## Unresolved

- The exact path list of the COG-3 update commit cannot be recovered because the test-owned world is not preserved.
- The COG-3 P score record remains 6,000 tokens above its immutable stream until a forward erratum is written; no historical file is rewritten.
- The COG-2 concurrent targeted failures remain unattributed (COG-3 forward erratum §2).
