# PSVR-0 — tool-level attribution of the ODPE-R sessions, and four multi-task hotspots

This is the offline first step of PSVR: read what the real sessions actually did, separate capability
from adoption from outcome effect, then reproduce or rule out the four correctness risks named before
the project scenarios.

Raw data: `research-evidence/psvr/2026-11-05/attribution/{A-1,A-2,F-1,F-2}.timeline.{md,json}`,
decoded from `research-evidence/odpe/2026-11-05/odpe-r/final/session-streams/` by
`scripts/psvr/session_attribution.mjs`. The script decodes the append-only zstd frames, replays the
transcript and reports every tool call with its arguments, its result and the project facts the
result carried. It does not score or infer intent.

## 1. A-2 — the adaptive session, at tool level

17 steps, 33 tool calls, 11 of them state queries, one write, six reads, two shell commits, two
`complete` calls and one `conclude`. 08:44:03 → 08:46:44 UTC.

| time | call | observed effect | next decision |
|---|---|---|---|
| 08:44:05 | `continuity pulse` | attempt exists, no host job observed | inspect execution state |
| 08:44:07 | `work status`, `workers`, `readiness` | readiness = **CONTINUE_WORK**: "the world has no commit beyond the attempt's basis" | list the repository |
| 08:44:12–18 | shell listing; reads `TASK.md`, `sources/*`, `inbox/README.md` | the world is at its base | read the new inbox item |
| 08:44:20 | `read inbox/2026-11-03/corridor-measurement.md` | **the current fact is read natively from the project workspace** | inspect git + worlds |
| 08:44:29 | `git status`, `git log`, `git worktree list` | the attempt world is intact at basis, nothing in it | decide the recovery route |
| 08:44:58 | `work relay takeover declareExecutorAbandoned=true acknowledgeInputs=true` | **REFUSED** (`NO_WORK`): "the world holds no observable change against its base, so there is nothing to settle"; `inputsState: UNAVAILABLE` | continue in the same world without a recorded takeover |
| 08:45:00–08:46:01 | shell copy of the input into the world; `write deliverables/package.md` | 30,763 B, 431 lines, inside the attempt world | commit |
| 08:46:10 | `git add -A; git commit` | `9ee07e2` — package **and the copied input** | re-read readiness |
| 08:46:13 | `readiness` | **SEMANTIC_JUDGEMENT**: "current inputs arrived after the attempt's basis … finalize with acknowledgeInputs=true" | settle with the acknowledgement |
| 08:46:19 | `complete acknowledgeInputs=true` | **NOT_READY / OUT_OF_SCOPE**: the world changed `inbox/…` outside `write_paths` | remove the copy |
| 08:46:23 | shell `Remove-Item`; `git commit --amend` | `100a2b1` — one file | settle again |
| 08:46:28 | `complete acknowledgeInputs=true` | **SETTLED**, `UNATTRIBUTED`, `independenceEligible=false` | inspect the result |
| 08:46:31–38 | `results`; `readiness`; `status`; `conclude WAIT_FOR_OPERATOR` | the episode names `100a2b13cd6d` | end |

### The ten questions

1. **Did A-2 call `readiness`?** Yes, three times (08:44:07, 08:46:13, 08:46:35).
2. **Did it call `finalize`?** **No.** The ODPE-B bounded finalization was not adopted in this
   session.
3. **Did it use the old `complete`?** Yes — twice. The first was refused `OUT_OF_SCOPE`; the second
   settled. The settlement therefore ran through the same `settleMutatingWork` path, but not through
   `finalize`.
4. **When did it read the new measurement?** 08:44:20, 17 s after the session started and before any
   write. It read it from the project workspace, not through `@ctx/input/…`: the attempt had been
   compiled before the input arrived, so its manifest carried no input.
5. **When did the final commit form?** 08:46:10 (`9ee07e2`), amended at 08:46:23 (`100a2b1`) after
   the out-of-scope refusal.
6. **When did the attempt go RUNNING → COMPLETED?** At the settlement, 08:46:28.
7. **When was `WAIT_FOR_OPERATOR` recorded?** 08:46:38, naming the result commit.
8. **How many repeated state queries?** 11 of 33 calls: pulse ×1, status ×3, workers ×1, readiness
   ×3, results ×1, journal ×1, overview ×1. The three leading reads (`status`, `workers`,
   `readiness`) return overlapping facts; `readiness` alone already reports task, attempt, world,
   job and inputs.
9. **Which steps are mechanical?** The last four (readiness → complete → results → conclude) are a
   fixed chain a single bounded operation could perform; the copy/commit/amend cycle was created by
   the out-of-scope refusal, not by the work.
10. **Which coordination had no new fact?** The status/workers/readiness trio at the start, and the
    results/readiness/status trio after the settlement: both repeat facts already in hand.

### Capability ≠ adoption ≠ outcome effect

- **Capability** existed and ran: the input observation, the readiness read, the settlement gate
  with the acknowledgement, the relay declaration, the episode conclusion.
- **Adoption**: readiness was used as a status query only; `finalize` was not used at all; `relay
  takeover` was attempted and refused; `complete` did the settlement.
- **Outcome effect**: the correct package was settled with an honest `UNATTRIBUTED` attribution and
  an episode naming the result commit. The ODPE-B path was **not** what produced that outcome.

**A product friction worth recording.** A takeover declaration can only be recorded through a
settlement, and a settlement of an empty world is refused. A principal that wants to adopt an
attempt with no committed work has no legal declaration to make, so its later writing is recorded as
`UNATTRIBUTED`. The permitted alternative is the isolated successor — which the model did not
choose.

## 2. F-2 — the finish-guided native session

12 steps, 20 tool calls, zero state queries, zero commits. 08:40:14 → 08:41:58.

`working_directory` → list → `TASK.md` → sources → the measured inbox file → the 206-line draft from
session 1 → SHA-256 verification of every source → `grep` for placeholders → date/timezone → inbox
re-check → a final judgement in prose. It **stopped on the finish instruction** and left the package
uncommitted. No product state was involved at any point.

## 3. PSVR-0.3 — the four hotspots

Each risk was written as a failing test first
(`test/psvr_hotspots.test.ts`), then the product was changed only where the test showed a defect.

| # | Risk | Result | Fix |
|---|---|---|---|
| A | readiness derives from the requested task's attempt contract | **reachable form reproduced**: after a boundary task settled, the project-wide readiness dropped the task layer entirely (`readinessState: null`, no blockers) because no attempt was RUNNING. The two-RUNNING-attempt leak is **not reachable**: the scheduler admits one RUNNING attempt, and a no-verifier deployment refuses a boundary task at start | `completionReadiness(attemptId?)` derives the task layer from the named attempt; `work_outcome` passes the attempt it chose |
| B | an OBSERVED observation with unreadable paths | **reproduced twice**: (1) an unrelated 600 KB untracked file blocked the start gate (`BLOCKED`), (2) readiness called the candidate `MECHANICAL_FINALIZATION` and `finalize` settled without confronting the unreadable path | start gate: a dirty path outside every write scope is external reality whether or not it fits the budget (in-scope still blocks); readiness: unreadable paths are a SEMANTIC item until declared; settlement: `INPUTS_UNREADABLE` refusal; digest covers the unreadable set |
| C | `finalize` concurrent terminal state | **reproduced**: a `NO_RUNNING_ATTEMPT` from `completeTask` was reported as `ALREADY_SETTLED` although no COMPLETED result existed | only a re-observed COMPLETED attempt with a result commit may be called already settled; otherwise the real state is reported |
| D | WORKTREE input read | **reproduced twice**: a 600 KB file was `DELIVERED`, and a junction to a directory outside the repository was read | one bounded, repository-contained read (`realpath` containment + size cap) used by both the observation and the read |

`research-evidence/psvr/2026-11-05/attribution/hotspot-tests.txt` records the seven passing tests;
the full hotspot and architecture runs are in the delivery evidence.

## 4. What this attribution does NOT establish

- It says nothing about whether a model would *choose* `finalize`, the context pull or the successor.
  A-2 did not, in the one session measured.
- The n=2 sessions are one run of two conditions; the timeline is descriptive.
- `UNATTRIBUTED` is an honest record of an unobserved window, not a judgement about who wrote the
  bytes.
