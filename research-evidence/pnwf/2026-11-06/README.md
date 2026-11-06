# PNWF evidence — 2026-11-06

This evidence was produced by the deterministic PNWF stage. The `direct/` and `host-governed/`
directories used **0 paid model sessions**: every model message there is a labelled deterministic
Messages stand-in (`MOCK_MODEL`). The separately authorized real-model continuation cohort is under
[`../live/2026-11-06/`](../live/2026-11-06/README.md): 2 sessions, 2,655,709 / 5,000,000 tokens.

## `live/2026-11-06/`

The real `deepseek-flash` continuation on copies of the recorded PSVR-C A-2 states:

| | software | energy |
|---|---:|---:|
| tokens (stream sum) | 1,579,080 | 1,076,629 |
| exit | natural 0 | natural 0 |
| `complete` calls | 0 | 0 |
| `conclude` calls | 1 (DELIVER) | 1 (DELIVER) |
| typed `plan` / relay | 2 / 2 | 2 / 2 |
| final task / attempt | all STALE / CANCELLED | STALE / CANCELLED |
| promotions | 0 | 0 |
| canonical head | unchanged | unchanged |

H1 supported (0 complete vs 3 historical), H3 supported (legal DELIVER after successor + typed
retirement), H5 mixed (aggregate 2.66M vs 3.23M; energy −43.4%, software +18.6%; the software session read the original harness and is confounded). Detailed behaviour: [`docs/engineering/PNWF-LIVE-TRAJECTORY.md`](../../../docs/engineering/PNWF-LIVE-TRAJECTORY.md). The evidence
includes the raw streams, run/budget/snapshot, score, gate records and post-session state DBs.

## `direct/`

The PNWF direct-host scenario (`scripts/pnwf/run_direct_host.sh`), run on the qualified
`@deepseek-ai/dsh@0.2.1-rc.5` installation. There is **no formal Task and no worker**:

- `P0` writes `docs/draft.md` and exits **without committing**.
- `P1` reads the draft, finishes `docs/result.md` and the draft, commits them with native Git,
  inspects `palimpsest_work status`, and records `DELIVER` with both artifacts.
- `P2` is a new session; it reads the pulse and reports the conclusion.

Result (`result.json`):

| fact | value |
|---|---|
| canonical head | `d52f22c0b9a30d10096be3cddc62c870beb19ab4` |
| subject | `direct outcome from native work` |
| `node --test` in the canonical world | exit 0 |
| tasks | 0 |
| attempts | 0 |
| promotions | 0 |
| DELIVER recorded | true |
| artifact provenance | `docs/result.md` and `docs/draft.md`: committed=true, source=WORKTREE, commit=`d52f22c0b9a3` |

The conclusion's basis head is the project creation head `284cd1d…`; the artifact commit is
`d52f22c…`. The canonical ProjectIR head did not move. This is the honest direct-outcome shape:
the artifact is real and committed, the conclusion is advisory, and no Worker Result, Promotion or
accepted asset was fabricated.

Files: `prompts/`, `sessions/P0..P2/`, `mock.jsonl` (request metadata and the stand-in's turns),
`git-head.txt`, `git-log.txt`, `git-status.txt`, `canonical-tests.log`.

## `host-governed/`

The existing PSVR-A and PSVR-B deterministic host scenarios, re-run against the PNWF build on
`0.2.1-rc.5` to prove the governed path still settles and promotes:

- `a-canonical-tests.json`: PSVR-A, 14/14 tests on the accepted canonical head.
- `b-canonical-check.log`: PSVR-B, `check.mjs --final` PASS, 46 assertions (corridor 1050 mm,
  NR=K-900, HF=K-900, total 536,000 USD).
- `*-canonical-head.txt`, `*-canonical-log.txt`: the accepted heads and their history.

The local `~/.dsh` installation had drifted to `0.2.2-rc.1`, whose worker tool surface no longer
offers `run_code`; the first PSVR-A attempt failed there for that reason, not because of PNWF. The
runners now accept `PSVR_DSH_BIN` / `PSVR_DSH_MODULES` so the qualified `0.2.1-rc.5` installation
can be used explicitly. This is the same drift HR-27 reports; the qualified version is not changed.

## `cost-reconciliation.json`

The energy F-2 stream sum is **489,157** while `budget.json` records **454,712**. The difference is
**34,445**, exactly the final step (step 20, 18:24:38.870Z), which arrived after the ledger's
`observedAt` (18:24:33.001Z). `489,157 − 34,445 = 454,712`; there is no double counting and no worker
usage in this session. See the JSON for the observed/derived/inferred grades.

## Source identities

- Trajectory analysis: `docs/engineering/PSVR-C-TRAJECTORY.md` (local commit `db6c37b`, parent
  `4597d81`).
- PSVR-C raw streams: `research-evidence/psvr/2026-11-05/{c,c-energy}/sessions/`.
- Per-stage phase statistics and the closure replay: `research-evidence/psvr/2026-11-05/*/trajectory.json`.
