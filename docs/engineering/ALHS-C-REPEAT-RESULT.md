# ALHS-C repeat-core — result

Status: **executed under the owner's 2026-11-04 repeat-core authorization** (one additional F/A pair,
8,000,000 aggregate). The diagnostic L/G stage did not run.

Evidence: `research-evidence/alhs/repeat-2026-11-04/`. Protocol:
`docs/programs/alhs/ALHS-C-REPEAT-PROTOCOL.md` (Amendment 1 applied before execution).

## 1. What ran

The core pair used a fixed 240s kill, which gave F-1 165,963 tokens and A-1 1,292,562 — not a balanced
first window. This pair kills session 1 at the same reported **400,000-token milestone** (Amendment 1;
the original 1.2M was unreachable for F inside the wall-clock backstop) with a 900s backstop.

| Session | Window (UTC) | Exit | Tokens | End |
|---|---|---:|---:|---|
| F-1b | 15:15:22–15:17:35 | 1 | 427,070 | token milestone |
| F-2b | 15:17:35–15:21:48 | 1 | 2,370,233 | budget stop at 2,350,000 soft |
| A-1b | 15:21:49–15:25:06 | 1 | 449,012 | token milestone |
| A-2b | 15:25:06–15:27:15 | 0 | 596,311 | natural `conclude DELIVER` |

The first windows differ by 21,942 tokens (4.9%).

## 2. Results

| | F | A |
|---|---|---|
| 7-fact rubric | 7/7 | 7/7 |
| Package | 28,308 bytes, `bcae7d3d…` | 28,251 bytes, `8661b87f…` |
| First 7/7 | 185,926 | 287,738 |
| Tokens after first 7/7 | 2,611,377 | 771,055 |
| Tool calls after first 7/7 | 115 | 45 |
| Artifact changes after first 7/7 | 60 | 3 |
| Artifact versions | 63 | 5 |
| Natural end | **no** | **yes**, `episode-7bfc0aac…`, current |
| Final package committed | no | **yes**, `f38f084` |

A’s post-first-valid activity was a bounded verification pass: 3 package reads, 7 verification
commands, 3 edits, then `conclude`. F performed 51 further package edits, 6 re-reads, 8 verification
commands and 12 state queries before the budget stop.

Aggregate **3,856,096**, 4,143,904 under the 8,000,000 authorization. F-2b stopped at 2,370,233:
20,233 above the soft ceiling, 129,767 below the hard 2,500,000. 91 provider POSTs, 90×200, one 502
`UPSTREAM_TIMEOUT` at 15:25:56 during A-2b, retried.

## 3. Replication of the core pattern

| Pair | F ending | A ending | F tokens | A tokens | A share |
|---|---|---|---:|---:|---:|
| core (wall-clock kill) | budget stop | `DELIVER` | 3,065,535 | 1,543,569 | 50.4% |
| repeat (token milestone) | budget stop | `DELIVER` | 2,797,303 | 1,058,793 | 37.8% |

Both pairs: F and A reach 7/7; A records `DELIVER` and exits; F is stopped by the guard. The repeat
also shows the provenance gap closing: A committed the package (`f38f084`), and the new check records
`tracked=true, committed=true`; F left `deliverables/` untracked.

The A behavior is not a blind stop: in both pairs A-2 reads the package, runs searches/verification,
edits a small number of times, then records the conclusion. The F behavior is the opposite: dozens of
further edits and repeated state queries after the package is already valid.

## 4. What this does and does not show

Shows:

- The core convergence difference **replicated** under a balanced first window (token milestone).
- The product’s `conclude` path is usable after a real kill and a new principal session; it is not a
  test-only API.
- The provenance fact works: A’s committed package is recorded as committed; F’s untracked artifact
  would be warned about if F had recorded a conclusion.

Does not show:

- A repeated-sample or statistical effect. Two pairs per condition is still small.
- A quality advantage: the 7-fact rubric saturated at 7/7 in both conditions.
- Real-model governed cooperation: A again chose direct work plus one native subagent; no formal
  Work, World, Worker or Promotion.
- A clean ablation of the interruption rule: the repeat also used a newer product version with
  provenance and a different session-1 ceiling (1.5M vs 3M). The core and repeat are two observations,
  not a controlled experiment on one variable.
- A cost estimate. A used 37.8% of F’s tokens here and 50.4% in the core, but the work and the model
  path are not matched at that granularity.

## 5. Limitations

- Two pairs total; no confidence interval or significance claim.
- Both conditions were stopped in session 1 by design; session 2 is the comparison window.
- A’s conclusion is a judgement, not acceptance; no operator Promotion exists for A in either run
  because A created no formal Work task. The package is committed and reviewable, nothing more.
- F’s final package remains untracked; its bytes are only in the working tree.
- The 502 is a real provider event; it was retried and did not abort a session.

## 6. Artifacts

- `core-summary.json` — authoritative reconciliation.
- `score.json` — rubric, first-valid replay, natural-end facts.
- `artifacts/F-package.md`, `A-package.md` — exact final packages.
- `sessions/F-1b`, `F-2b`, `A-1b`, `A-2b` — real session streams.
- `runs/` — run records and guard ledgers.
- `proxy-proxy.jsonl` — request metadata only.
- `offline-session-analysis.json`, `offline-analysis.md` — post-first-valid activity.
