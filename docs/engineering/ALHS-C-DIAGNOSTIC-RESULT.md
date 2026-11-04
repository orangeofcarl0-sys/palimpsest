# ALHS-C diagnostic L/G — result

Status: **executed under the owner's 2026-11-04 diagnostic authorization** (L/G, 2 sessions each,
10,000,000 aggregate). No further stage is authorized.

Evidence: `research-evidence/alhs/diagnostic-2026-11-04/`.

## 1. What ran

L (lightweight Palimpsest: goal-only, in-place, no standard, no governed World) and G (governed:
one formal `package` task, confirmed standard, isolated worktree, operator acceptance) received
byte-identical sources and the same measured 700 mm update at T+60s. Session 1 was killed at the same
**400,000-token milestone**; session 2 was a new principal session on the same durable state.

| Session | Window (UTC) | Exit | Tokens | End |
|---|---|---:|---:|---|
| L-1 | 15:49:41–15:52:36 | 1 | 470,926 | token milestone |
| L-2 | 15:52:36–15:54:54 | 0 | 1,287,008 | natural `DELIVER` |
| G-1 | 15:54:54–15:56:17 | 1 | 402,516 | token milestone |
| G-2 | 15:56:18–15:58:49 | 0 | 525,665 | natural `WAIT_FOR_OPERATOR` |

First windows: 470,926 (L) vs 402,516 (G). G-1 had two session files: the host and its Work Worker.
The worker did **not** commit before the host was killed.

## 2. Results

| | L | G |
|---|---|---|
| 7-fact rubric | 7/7 | **7/7 (candidate, not accepted)** |
| Package | 39,222 bytes, `7eaff8be…` | 21,365 bytes, `a68ff2c5…` |
| Canonical artifact | present, committed `a824eda` | absent |
| Candidate result commit | n/a | `8b21b462cd40eca9c44263f020836008e2479f9c` |
| Task state | none | `package` **VERIFYING** |
| Promotion | none | none |
| Natural end | **DELIVERED** | **AWAITING_OPERATOR** |
| After first 7/7 | 1,529,972 tokens, 65 calls, 34 edits | 315,920 tokens, 9 calls, 0 further edits |
| Versions | 36 | 1 |

Aggregate **2,686,115**, 7,313,885 under 10,000,000. No budget stop. 79 provider POSTs, 78×200, one
502 `UPSTREAM_TIMEOUT` at 15:59:31 after both sessions had ended (no recorded session usage; client
identity not observed).

## 3. What G did, and the gap it exposed

- G-1 delegated the formal `package` task. The worker session read sources, but the host was killed at
  the token milestone before the worker committed.
- G-2 read the pulse, status, the attempt world and the sources. It found no prior deliverable or
  commit, wrote `deliverables/package.md` **inside the attempt world**, committed it (`8b21b46`), and
  called `complete taskId=package`. The product settled the attempt as COMPLETED and moved the task to
  VERIFYING. G-2 then read `results` and the pulse, re-checked the inbox, and recorded
  `WAIT_FOR_OPERATOR`.
- No promotion exists. The candidate is 7/7 on the rubric, but it is not canonical and not accepted.
- The canonical artifact is absent, so the conclusion’s provenance check reports
  `present=false, tracked=false, committed=false, detail="not found"` for the canonical path. The
  candidate bytes are in the result commit; the provenance check does not inspect result commits yet.

**The finding:** the principal recovered a dead worker’s world by writing in it itself. The product
checked the task envelope and the committed world, not that the worker authored the bytes. Acceptance
is still protected by the operator gate, but “worker-produced” is not authenticated. This is a real
governance gap, not a scoring artifact.

## 4. What L did

L produced a valid package in L-1 and kept editing; L-2 finished, committed `a824eda`, and recorded
`DELIVER`. The provenance check reports `tracked=true, committed=true`. L used **1.89×** G’s tokens in
this pair and made 34 post-valid edits, while G’s governed path produced a smaller candidate and
stopped for operator acceptance. The packages differ in size and the tasks differ; this is not a
matched cost or quality comparison.

## 5. What the diagnostic says

- **The ending differs:** L ends with `DELIVER`; G ends with `AWAITING_OPERATOR`. That is the expected
  governance behavior, and G did not promote or accept its own result.
- **Governance was not more expensive in tokens here:** L used more, not less. This contradicts a
  simple “governance costs more” prior but does not establish a reverse advantage: L’s package is
  larger and the work differs.
- **The governed path’s recovery worked:** a killed worker’s world was settled by the continuation
  through the existing task/attempt/settlement path, and the candidate went to operator acceptance.
- **The governed path’s authorship is not authenticated:** the principal can write in the attempt
  world and settle it. That should be treated as a product limitation, not as evidence that a Worker
  produced the result.

## 6. Limitations

- One pair per condition; no repeated sample.
- G’s candidate was written by the continuation principal, not the killed worker.
- G’s candidate is unaccepted; no operator Promotion was performed. The canonical package is absent.
- The 7-fact rubric saturated 7/7 for both; no quality advantage is claimed.
- The token comparison is descriptive: different package sizes, different task shape.
- The post-run 502 is recorded; it did not affect an ending.

## 7. Artifacts

- `core-summary.json` — authoritative reconciliation, including the G candidate block.
- `score.json` — rubric, first-valid replay, natural-end facts.
- `artifacts/L-package.md`, `G-package-candidate.md` — exact package bytes.
- `sessions/L-1`, `L-2`, `G-1`, `G-2` — session streams (G-1 contains host + worker).
- `runs/` — run records and guard ledgers.
- `proxy-proxy.jsonl` — request metadata only.
- `offline-session-analysis.json`, `offline-analysis.md` — post-first-valid activity.
