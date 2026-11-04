# ALHS-C repeat-core — real-model F/A evidence

Authorized repeat-core only: one additional F/A pair, session 1 killed at the same 400,000-token
milestone, session 2 ceiling 2,500,000, reserve 150,000, aggregate 8,000,000. Provider
`deepseek-official/deepseek-flash`.

Authoritative summary: `core-summary.json`. Full score: `score.json`. Write-up:
`docs/engineering/ALHS-C-REPEAT-RESULT.md`.

## Sessions

| Session | Window (UTC) | Exit | Tokens | End |
|---|---|---:|---:|---|
| F-1b | 15:15:22–15:17:35 | 1 | 427,070 | token milestone at 400k |
| F-2b | 15:17:35–15:21:48 | 1 | 2,370,233 | budget stop at the 2,350,000 soft ceiling |
| A-1b | 15:21:49–15:25:06 | 1 | 449,012 | token milestone at 400k |
| A-2b | 15:25:06–15:27:15 | 0 | 596,311 | natural `conclude DELIVER` |

The first windows are balanced: 427,070 vs 449,012 reported tokens (difference 21,942, 4.9%).

## Results

| | F | A |
|---|---|---|
| 7-fact rubric | 7/7 | 7/7 |
| Package | 28,308 bytes, `bcae7d3d…` | 28,251 bytes, `8661b87f…` |
| First 7/7 | 185,926 tokens | 287,738 tokens |
| Tokens after first 7/7 | 2,611,377 | 771,055 |
| Tool calls after first 7/7 | 115 | 45 |
| Artifact changes after first 7/7 | 60 | 3 |
| Artifact versions | 63 | 5 |
| Natural end | **no** | **yes**, `episode-7bfc0aac…`, `DELIVER`, current |
| Formal Work/Worker | n/a | none |
| Final package committed | no (untracked `deliverables/`) | **yes**, `f38f084` |

A committed the package and the new provenance check reports `tracked=true, committed=true,
detail="committed at HEAD"`. F left `deliverables/` untracked.

## Post-first-valid activity

| Session | Tokens | Calls | Composition |
|---|---:|---:|---|
| F-2b | 2,370,233 | 106 | 51 edit_package, 6 read_package, 8 verify, 12 state_query, 8 search, 15 read_other, 4 shell, 2 coordination |
| A-2b | 596,311 | 33 | 3 read_package, 7 verify, 3 edit_package, 5 shell, 3 search, 7 read_other, 1 pulse, 1 conclude |

A ran a bounded verification pass and then stopped. F kept editing and querying state until the
guard stopped it. This repeats the core pattern under a balanced first window.

## Aggregate

Total **3,856,096**, 4,143,904 under the 8,000,000 authorization. F-2b stopped at 2,370,233: 20,233
above the 2,350,000 soft ceiling and 129,767 below the 2,500,000 hard ceiling. 91 provider POSTs,
90×200, 1×502 `UPSTREAM_TIMEOUT` at 15:25:56 during A-2b, retried.

## Limits

- This is pair #2; with the core, two pairs per condition. Still not a powered sample.
- A again chose direct work plus one native subagent; no governed Work/World/Worker.
- The repeat used the product version with artifact provenance and the token-milestone kill; the core
  used the earlier product and a fixed wall clock. This is not a clean ablation of the interruption
  rule.
- The 7-fact rubric saturated again; no quality advantage is claimed.
- A used 37.8% of F's tokens in this pair; the first windows are balanced by the milestone, but this is
  still one pair and not a cost estimate.
