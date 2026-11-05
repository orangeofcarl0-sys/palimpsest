# PSVR evidence — 2026-11-05

Two real-host project runs, the offline attribution of the ODPE-R sessions, and the PSVR-C
pre-registration. All model content is a labelled deterministic Messages stand-in; the host, workers,
Git, worlds, context delivery, Work, Scheduler, Promotion, verification and the scenario checkers
are real.

## Layout

- `attribution/` — A-1/A-2/F-1/F-2 tool-level timelines (decoded from the ODPE-R streams) and the
  hotspot test result.
- `a/` — the REST→gRPC migration run: seed, deployment, mock script, operator records, canonical
  head/log/tests, world map, session streams, worker logs, timestamps.
- `b/` — the deployment-package run: the same set, plus the field-survey hash and the final checker
  log.
- `/live/cohort-psvr-c.json` — the PSVR-C pre-registration (BLOCKED, no authorization).

## The two accepted heads

| | A | B |
|---|---|---|
| canonical head | `ace55e0` | `45250eb` |
| tasks | contract, server, client — all SATISFIED | technical, commercial, recommendation — all SATISFIED |
| promotions | 3, verifier PASS each | 3, verifier PASS each |
| interruption | the server attempt was killed after a partial commit; closed as a successor | none |
| new fact | untracked fleet note, sha256 `c0409bfe…` | untracked field survey, corridor 1,050 mm |
| independent check | `node --test`: 14/14 | `node check.mjs --final`: 46 assertions PASS |
| final artifact | runnable gRPC server/client + streaming integration test | six consistent artifacts; 536,000 USD; K-900 both sites |

## Honest limits

- No real model: every "agent" is a scripted stand-in, so this is engineering capability, not
  autonomous model behaviour.
- PSVR-A's successor commit cites an empty digest in its basis comment (the stand-in's substitution
  did not reach the nested pull result); the pull is proven by the worker's guard and the committed
  behaviour.
- The formal Work path is sequential (one RUNNING attempt, VERIFYING latch); cooperation was three
  sequential tasks with operator acceptance.
- PSVR-B's cost and schedule are checked for consistency with the sources, not for engineering
  quality.

## PSVR-C — the authorized real-model cohort

`c/` holds the real deepseek-flash run of the software scenario (F+Finish+Commit vs adaptive A).

| | F | A |
|---|---|---|
| tokens | 2,046,205 (497,542 + 1,548,663) | 2,805,771 (421,118 + 2,384,653) |
| session 2 end | natural exit 0 | budget stop |
| commit | `930d9c5` | `453aa7f` |
| suite | 16/16 | 26/26 |
| rubric | 7/7 | 7/7 |
| governed project | n/a | 3 tasks, 1 RUNNING attempt, no settlement, no acceptance |

Aggregate **4,851,976 / 12,000,000**; four sessions. `c/score.json` is the mechanical pass; `c/out/*`
holds each session's run record, budget ledger and post-session snapshot; `c/sessions/` the real
streams; `c/proxy.jsonl` request metadata only.

A's session 2 called `palimpsest_start` twice, `plan`, `delegate`, `relay`, `results`, `status`,
`workers` and `complete` once — and **never `readiness` or `finalize`**. The one mechanism built for
"correct work, no settlement" was not used by the real model.

## PSVR-C cross-domain stage (`c-energy/`)

| | F | A |
|---|---|---|
| tokens | 887,331 (432,619 + 454,712) | 2,858,481 (480,706 + 2,377,775) |
| session 2 end | natural exit 0 | budget stop |
| commit | `0e980ec` | `e631160` |
| checker | PASS 8/8 facts | PASS 8/8 facts |
| governed project | n/a | task ACTIVE, 1 RUNNING attempt, settlement refused (`NO_WORK`), no promotion |

Aggregate **3,745,812 / 12,000,000**; four sessions. A used `readiness` once and `complete` twice, but
its worker's world was empty and the package it committed was written outside the governed attempt.
