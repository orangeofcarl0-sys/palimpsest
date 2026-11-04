# ALHS-C diagnostic L/G — real-model evidence

Authorized diagnostic only: L and G, 2 sessions each, 2,500,000 per session, 125,000 reserve,
10,000,000 aggregate. Session 1 killed at the same 400,000-token milestone. Provider
`deepseek-official/deepseek-flash`.

Authoritative summary: `core-summary.json`. Full score: `score.json`. Write-up:
`docs/engineering/ALHS-C-DIAGNOSTIC-RESULT.md`.

## Sessions

| Session | Window (UTC) | Exit | Tokens | End |
|---|---|---:|---:|---|
| L-1 | 15:49:41–15:52:36 | 1 | 470,926 | token milestone at 400k |
| L-2 | 15:52:36–15:54:54 | 0 | 1,287,008 | natural `conclude DELIVER` |
| G-1 | 15:54:54–15:56:17 | 1 | 402,516 | token milestone at 400k |
| G-2 | 15:56:18–15:58:49 | 0 | 525,665 | natural `conclude WAIT_FOR_OPERATOR` |

The first windows are close: 470,926 vs 402,516. G's session 1 had two session files (host + worker).

## Results

| | L | G |
|---|---|---|
| 7-fact rubric | 7/7 | **7/7 (candidate, not accepted)** |
| Package | 39,222 bytes, `7eaff8be…` | 21,365 bytes, `a68ff2c5…` |
| Canonical artifact | present, committed `a824eda` | absent; candidate in attempt `8b21b46` |
| Task | none | `package` **VERIFYING** |
| Promotion | none | none |
| Natural end | **DELIVERED** | **AWAITING_OPERATOR** |
| After first 7/7 | 1,529,972 tokens, 65 calls, 34 edits | 315,920 tokens, 9 calls, 0 further edits |
| Versions | 36 | 1 |

Aggregate **2,686,115**, 7,313,885 under 10,000,000. No budget stop. 79 provider POSTs, 78×200, one
502 `UPSTREAM_TIMEOUT` at 15:59:31 after both sessions ended (no recorded session usage; client
identity not observed).

## What G did

- G-1 delegated the formal `package` task. The worker session read sources but did not commit before
  the host was killed at the token milestone.
- G-2 read the pulse, status, attempt world and sources; it found no prior deliverable or commit,
  wrote `deliverables/package.md` **inside the attempt world**, committed it (`8b21b46`), and called
  `complete taskId=package` to settle the committed world. It then read `results` and the pulse, did a
  final inbox check, and recorded `WAIT_FOR_OPERATOR`.
- The product settled the attempt as COMPLETED and moved the task to VERIFYING. No promotion exists.
  The candidate is 7/7 on the rubric but is **not** canonical and **not** accepted.
- The canonical artifact is absent, so the conclusion's provenance check reports `present=false,
  tracked=false, committed=false, detail="not found"` for the canonical path. The candidate is in the
  result commit; the provenance check does not inspect result commits yet.

This is a real finding: the principal recovered a dead worker's world by writing in it itself. The
settlement checked the task envelope and the committed world, not that the worker authored the bytes.
The candidate still goes to the operator, so acceptance remains protected, but "worker-produced" is
not authenticated by the product.

## What L did

- L-1 produced a valid package before the kill and continued editing.
- L-2 finished, committed `a824eda`, and recorded `DELIVER`. The provenance check reports
  `tracked=true, committed=true`.
- L used 1.89× G's tokens in this pair and made 34 post-valid edits. G's governed path produced a
  smaller candidate and stopped for operator acceptance. This is **not** a matched cost or quality
  comparison; the packages differ in size and the tasks differ.

## Limits

- One pair per condition; no repeated sample.
- L's package is accepted by the model's DELIVER, not by an operator Promotion; G's is not accepted.
- G's candidate is the continuation principal's write, not the killed worker's. It is still a real
  governed candidate through the task envelope and operator gate.
- The 7-fact rubric saturated for both; no quality advantage is claimed.
- The 502 is a post-run event; it did not affect an ending.
