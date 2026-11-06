# PNWF live continuation cohort — 2026-11-06

Detailed trajectory and model-behaviour analysis: [`docs/engineering/PNWF-LIVE-TRAJECTORY.md`](../../../../docs/engineering/PNWF-LIVE-TRAJECTORY.md).

Two real `deepseek-flash` sessions, one per stage, resuming **copies** of the recorded PSVR-C A-2
post-kill states. The prompt is the exact PSVR-C A2 continuation text; no CHECKPOINT, conclude, plan
or expected exit is named. The original recorded worlds/states were not modified.

## Design

| | software | energy |
|---|---|---|
| starting state | copied `psvr-c` state at `453aa7f`; `grpc-contract` ACTIVE, attempt RUNNING, world at base | copied `psvr-c-energy` state at `e631160`; `decision-package` ACTIVE, attempt RUNNING, world at base |
| session ceiling | 2,500,000 | 2,500,000 |
| reserve | 125,000 | 125,000 |
| injection | none | none |
| prompt | PSVR-C A2 continuation | PSVR-C energy A2 continuation |

Authorization: `authorization.json` (`pnwf-spend-authorization/v1`), 5,000,000 aggregate, 2 sessions,
issued by the owner on 2026-11-06. Gate: `scripts/pnwf/run_pnwf_live.mjs`; plan-only is
`modelCalls: 0`; missing auth exits 2; missing adapter exits 3; the aggregate guard runs before each
session.

## Result

| | software | energy | historical software A-2 | historical energy A-2 |
|---|---:|---:|---:|---:|
| tokens (stream sum) | 1,579,080 | 1,076,629 | 1,331,902 | 1,901,695 |
| exit | natural 0 | natural 0 | budget stop | budget stop |
| `complete` calls | **0** | **0** | 1 | 2 |
| `conclude` calls | **1** (DELIVER) | **1** (DELIVER) | 0 | 0 |
| typed `plan` calls | 2 | 2 | 0 | 0 |
| relay calls | 2 | 2 | 0 | 0 |
| final task(s) | all STALE | STALE | ACTIVE | ACTIVE |
| final attempt | CANCELLED | CANCELLED | RUNNING | RUNNING |
| promotions | 0 | 0 | 0 | 0 |
| canonical head | unchanged `453aa7f` | unchanged `e631160` | unchanged | unchanged |
| episode intent | DELIVER | DELIVER | none | none |

Aggregate **2,655,709 / 5,000,000**; historical closures **3,233,597**; delta **−577,888 (−17.87%)**.

Both sessions independently re-read the committed artifacts and verified them before concluding:
software ran `node --test --test-isolation=none` → 26/26; energy re-derived the package and recorded a
verification note. Both closed the empty attempt as a successor, retired the redundant task graph by
typed plan revision, and recorded an advisory DELIVER. Neither accepted an artifact, promoted a
result or moved the canonical head.

## Token accounting

The energy ledger sampled **1,008,844** before the final step; the stream sum is **1,076,629**
(the final 67,785-token step arrived after the ledger's `observedAt`). The software ledger and stream
agree at 1,579,080. This report uses the stream sum, the same correction applied to PSVR-C F-2.

## Validity: the software session read the harness

The software session discovered and read the original run directory under `%TEMP%`:
`constraint.md`, `core.json`, `prompts/A2.txt`, `out/score.json`, `out/A-2/STOPPED.json` and
`out/A-2/snapshot.json`. It explicitly debated whether this was evaluator leakage, did not open the
reference-solution world (`worlds/F`), but the score/historical budget-stop facts may have influenced
its closure. The energy session stayed in-world. **The software result is exploratory/contaminated;
the energy result is the cleaner signal.** Future sessions must isolate the harness root from the
principal's readable tree.

## Hypotheses

- **H1 — SUPPORTED.** Zero `complete` calls in both sessions; the historical sessions made one and
  two. No repeated failing complete.
- **H3 — SUPPORTED.** Both sessions used the legal path (relay successor → typed plan retirement →
  DELIVER). The conclusion states it is not acceptance; the tasks are STALE and the attempt CANCELLED.
  The software evidence is confounded by the harness reads; the energy evidence is clean.
- **H5 — MIXED.** Energy is below its historical closure (1.08M vs 1.90M) and the aggregate is 17.9%
  lower, but software is above its historical closure (1.58M vs 1.33M). The software session also
  performed a full re-verification (26/26) and wrote a journal record, which the historical loop did
  not; the comparison is descriptive.
- **H2 / H4 — not tested here.** H2 (fresh-start Direct Outcome) is covered deterministically; H4
  (governed Settlement/Promotion) is covered by the deterministic tests and PSVR-A/B host runs.

## Files

- `score.json` — mechanical facts (stream calls, ledger, state DB, Git).
- `result.json` — aggregate result and hypothesis outcomes.
- `software/`, `energy/` — run/budget/snapshot/deployment, prompt copy.
- `streams/` — the real DSH session streams.
- `state/` — the copied post-session `palimpsest.sqlite` / `journal.sqlite` per stage.
- `gate/` — plan, start/end records; each start has `modelCalls: 1`.
- `proxy.jsonl` — provider metadata only (no prompt or response bodies).

## Limits

- n = 1 per stage; the historical sessions are the comparison, not a randomized control.
- Recorded-state continuation, not a fresh-start run; the model sees the open attempt and the direct
  commit from the beginning.
- The hardware/model nondeterminism is not measured; no second sample was authorized.
- The model content is real `deepseek-flash`; the PNWF product, Git, SQLite and host are real.
