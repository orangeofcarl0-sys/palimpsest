# COG-4.0 — Baseline and Measurement Audit

**Branch:** `palimpsest-cog4-state-synthesis`, created from the verified COG-3 final HEAD
`ef9d8e3ac1ee4cb21750749e0b526291c527fe65` (tree `d08a2ab53c670941138dc23437c2e073216c51c0`).
**Code Freeze:** `0e04becff68c68118bf99c7c9d6bac3c77dd0f33` (tree `4f6c0677a13c96961c3a1f501372f5f2110f0d72`).
**Audit evidence:** `research-evidence/cog4/measurement/` (`cog3-audit.json`, `cog3-audit.md`,
`budget-selftest.json`).

The audit is forward-only. No file under `research-evidence/cog3/` was modified.

---

## 1. Read-only preflight

| check | value |
| --- | --- |
| `git status --short` | empty |
| current branch | `palimpsest-cog3-native-synthesis` |
| `HEAD` / tree | `ef9d8e3ac1ee4cb21750749e0b526291c527fe65` / `d08a2ab53c670941138dc23437c2e073216c51c0` |
| `origin/main` | `044330b2e55198542d545edc42ed9c36e7ce896b` |
| `origin/palimpsest-cog3-native-synthesis` | `ef9d8e3ac1ee4cb21750749e0b526291c527fe65` |
| `git rev-list --left-right --count origin/main...HEAD` | `0 363` |
| `palimpsest-cog4-state-synthesis` local/remote | absent / absent |
| worktree registrations / locks | 95 / 2 |
| shared gate root entries | 19 (`~/.palimpsest-gates`, all five `p2b-c3-OWNED-*`) |
| evidence trees | 71 at the audit; 72 after `cog4` |
| stashes | 0 |

No reset, rebase, checkout, prune, lock removal or reference move was performed. The branch was created
only after reading the COG-3 final, synthesis, engineering, composition, handoff and protocol reports,
the COG-3 scores/verification/manifest, and the applicable governance (`BRANCH-POLICY.md`,
`CANONICAL-WORK-EVIDENCE-AUTHORITY.md`, the cognitive-interface constitution).

---

## 2. The 6,000-token discrepancy is arithmetic, not a later append

The immutable P session streams sum as follows:

| stream | assistant messages | input | output | cache-read | total |
| --- | --- | --- | --- | --- | --- |
| principal `session-d8ca633c...` | 100 | 94,407 | 170,397 | 15,929,344 | **16,194,148** |
| branch `branch-65fa69d0...` | 6 | 3,247 | 1,686 | 16,640 | **21,573** |
| total | 106 | 97,654 | 172,083 | 15,945,984 | **16,215,721** |

`runs/P1/run-two.json` records exactly **16,215,721**. `scores.json` and three COG-3 documents record
**16,221,721** — exactly **6,000 above** the streams.

The streams end at `turn/end`; there are no duplicate sequence numbers and no later append after
`run-two.json` was written. The difference is therefore a transcription/arithmetic error in the derived
score record, not an observation-timing difference.

The corrected campaign total is **27,125,380** (P 16,215,721 + S 1,828,481 + F 8,544,715 + probes 536,463)
against the 25,000,000 cap: the overrun remains **2,125,380**. It was a real protocol violation; the
correction does not remove it. The COG-3 frozen evidence is not rewritten. A forward finding is recorded
in this document and in `measurement/cog3-audit.json`.

---

## 3. The COG-3 update commit captured more than the update file

COG-3's `applyUpdate()` used `git add -A`, and the test-owned world was removed after evidence collection,
so the update commit object cannot be inspected directly. The recorded evidence is sufficient to establish
the captured set:

- the recorded update head is `2d2aebd737836332e3e264abec774c9eb21eacce`;
- the principal's only observed write path in phase 1 is `deliverables/plan.md`;
- the phase-1 `git status --short` result in the immutable session stream is `?? deliverables/`, followed
  by `deliverables/plan.md` at 57,636 bytes.

With `git add -A`, the update commit therefore captured the generated `deliverables/plan.md` **as well as**
the intended `updates/2026-01-20-northgate-booking.md`. The exact full path set is not recoverable because
the commit object was not preserved. No staged-path allowlist was verified.

**COG-4 disposition:** every update uses `git add -- <exact path>` and verifies `git diff --cached
--name-only` equals the registered path set before committing. The Sablewick vendor and newsletter updates
each staged exactly one path; the mechanism run records the staged paths and digests.

---

## 4. The duplicate Turn Summary records are an observation overlap

The immutable P principal stream contains exactly **three turns** (56, 8 and 36 steps) and the branch
stream contains **one turn**. `principal-one.log` contains two `PALIMPSEST_TURN` records, emitted 3 ms
apart at `23:37:28.262Z` and `23:37:28.265Z`:

| record | text length | tool entries | coverage |
| --- | --- | --- | --- |
| first | 932 | 256 (128 calls) | turn 1 + turn 2 |
| second | 932 | 220 (110 calls) | part of turn 1 + turn 2 |

Both end with turn 2's final text; the launch turn's own final text is absent from both. No fourth model
turn occurred. The overlap comes from `printTurn()` running after `whenIdle()` had also waited for the
delegation follow-up turn, so the launch turn's `printTurn(0)` covered both turns while the delegation
delivery's `printTurn(fromSeq)` covered an overlapping interval.

This is an **observation/record overlap**, not a model-execution duplicate. COG-4 uses stable Session
sequence numbers (`(home, sessionId, seq)`) when deriving unique usage and tool counts; the budget monitor
dedupes on exactly that identity.

---

## 5. Python and the broad-test environment are now checked before the run

`python` is **not** on the default shell PATH (only `py`, Python 3.14.7). The COG-3 broad run failed three
tests in `test/inplace_execution.test.ts` because the gate command `python -c ...` observed no exit code.
An Anaconda Python 3.13.9 exists at `/d/ProgramData/anaconda3/python.exe`.

COG-4 broad testing was run with `PATH=/d/ProgramData/anaconda3:$PATH`, after verifying the executable and
its version. The historical COG-3 failure remains visible and is not retroactively reclassified.

---

## 6. The budget monitor was proven before any model call

`scripts/cog4/budget.mjs` observes real `assistant/message` usage events keyed by `(home, sessionId, seq)`.
It distinguishes input, output, cache-read and cache-write; it records an unreadable stream as UNAVAILABLE
rather than estimating it; it counts a resumed Session once; it records an event observed after completion
as DELAYED but charges it exactly once; it refuses a launch when observed + live reserve + estimate crosses
the launch-stop threshold; and it raises the hard stop at the ceiling.

`budget-selftest.json` **11 passed, 0 failed** against simulated records:

1. duplicate observation charged once;
2. delayed post-completion event charged once and flagged;
3. resumed Session counted once with later events appended;
4. child Session counted separately;
5. cache-read separated from input/output;
6. launch refused when observed + reserve + estimate crosses the threshold;
7. launch allowed again after the live reserve is released;
8. hard stop at the ceiling;
9. unavailable usage recorded without inventing tokens;
10. completed Session accounted exactly once;
11. Session past the wall-clock bound reported.

The monitor was used for the P and F trials. The campaign ended at **3 sessions / 1,865,339 reported tokens**
(P 1,277,909; contaminated F diagnostic 587,430; blocked F 0), well inside 12 sessions / 12M tokens / 8M
launch-stop. The campaign did not overrun; the clean F trial was stopped by the provider's own
`QUOTA: Insufficient Balance`, not by the monitor.

---

## 7. C4-G0 verdict

**C4-G0 — Baseline and measurement integrity: ESTABLISHED.**

- the incoming Git state matches every expected identity;
- protected resources are unchanged;
- the COG-3 measurement discrepancies are investigated and recorded forward-only;
- the new rig is isolated (separate homes, repositories, state, logs) and budget-controlled;
- the budget monitor is proven against simulated usage before the first model call;
- the Python prerequisite for the broad environment is verified.

The one limitation is that the exact COG-3 update-commit path set cannot be recovered from the preserved
evidence; the inferred set and the reason are recorded rather than asserted as exact.
