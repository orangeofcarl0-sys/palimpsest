# ALHS-C core — real-model F/A evidence

Authorized core stage only: F and A, 2 sessions per condition, 3,000,000 per session, 150,000
reserve, 12,000,000 aggregate. Provider `deepseek-official/deepseek-flash`. Diagnostic L/G did not run.

Authoritative summary: `core-summary.json`. Full scorer output: `score.json`. Write-up:
`docs/engineering/ALHS-C-CORE-RESULT.md`.

## Sessions

| Session | Window (UTC) | Exit | Tokens | End |
|---|---|---:|---:|---|
| F-1 | 14:05:17–14:09:20 | 1 | 165,963 | scenario kill at T+240s |
| F-2 | 14:09:20–14:15:08 | 1 | 2,899,572 | budget stop at the 2,850,000 soft ceiling |
| A-1 | 14:15:08–14:19:10 | 1 | 1,292,562 | scenario kill at T+240s |
| A-2 | 14:19:10–14:20:03 | 0 | 251,007 | natural `conclude DELIVER` |

Both session 1s received the measured 700 mm constraint at T+60s. Session 2 was a new principal
session on the same durable state.

## Results

| | F | A |
|---|---|---|
| 7-fact rubric | 7/7 | 7/7 |
| Package | 32,228 bytes, `f9f6e922…` | 29,848 bytes, `0d77121b…` |
| First 7/7 | 240,070 tokens | 282,186 tokens |
| Tokens after first 7/7 | 2,825,465 | 1,261,383 |
| Tool calls after first 7/7 | 84 | 48 |
| Artifact changes after first 7/7 | 27 | 24 |
| Natural end | **no** | **yes**, episode `episode-4f2b6270922b14e03cecae0e`, `DELIVER`, current |
| Formal Work/Worker | n/a | none; one native subagent |

Aggregate 4,609,104; 7,390,896 under the authorization. F-2’s stop was 49,572 above the soft ceiling
and 100,428 below the hard 3M ceiling; the reserve worked as a one-message buffer. Two provider
requests returned 502 `UPSTREAM_TIMEOUT`: one during F-2 (retried) and one at 14:23:21 after every
session ended (no recorded session usage; client identity not observed). 102 of 104 POSTs returned
200.

## Files

- `core-summary.json` — authoritative reconciliation.
- `score.json` — rubric, replayed first-valid artifact timing, natural-end facts.
- `artifacts/F-package.md`, `A-package.md` — exact final packages.
- `sessions/F-1`, `F-2`, `A-1`, `A-2` — real DSH session streams, including child sessions.
- `runs/` — per-session run records, guard ledgers, stop/kill timestamps.
- `proxy-proxy.jsonl` — provider request metadata only; no bodies and no credentials.
- `core.json`, `prompt-*.txt` — matched-world setup and the exact prompts.

## Limits

- One pair per condition; no repeated samples, no paired analysis, no confidence claim.
- Both packages were left untracked; neither condition committed the final artifact. A’s DELIVER
  evidence ref cites the base commit, not a commit containing the package.
- A chose direct work + one native subagent; no governed Work/World/Worker and no Promotion.
- The 7-fact rubric saturated at 7/7 in both conditions; it is not a quality score.
- The token totals are descriptive: the fixed 240s kill gave the two conditions different amounts of
  work in session 1 (A-1 1.29M vs F-1 166k). The clean difference is the ending.
- No F/A quality or cost advantage is claimed.

## Post-run follow-up

- `offline-session-analysis.json` / `offline-analysis.md` classify what happened after the first 7/7
  package: F-2 made 27 further package edits with 12 re-reads, 13 verification commands and 11 state
  queries; A-2 did a bounded verification pass and then concluded.
- The product now records artifact provenance (tracked/committed) in `conclude` and warns when the
  final bytes are only in the working tree. These core packages were untracked; a rerun would report
  that warning. DELIVER is not refused for it.
- A balanced repeat-core stage is pre-registered in
  `docs/programs/alhs/ALHS-C-REPEAT-PROTOCOL.md` (token-milestone kill at 1,200,000) and is **not
  authorized**; its gate plan and `BLOCKED.json` are in `../live/repeat-plan/`.
