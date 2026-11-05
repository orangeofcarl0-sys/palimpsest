# PWRS-R4 — interrupted work: native F vs governed recovery A (matched)

Status: **executed under the owner's 2026-11-05 PWRS-R4 authorization** (F and A, 2 sessions each,
2,500,000 per session, 125,000 reserve, 10,000,000 aggregate). This is the matched comparison
requested after the R3 convergence; it is one pair per condition, not a repeated sample.

Evidence: `research-evidence/pwrs/2026-11-05/pwrs-r4/`.
Pre-registration: `research-evidence/pwrs/live/cohort-pwrs-r4.json`.
Authorization: `research-evidence/pwrs/live/authorization-pwrs-r4.json`.
Product under test: PWRS-D/E at `e3110c8`.

## 1. Design

Both conditions received byte-identical sources; the measured 700 mm source was injected at T+60s as
an **untracked** file under `inbox/` (so the product can see it is not in the base). Session 1 was
killed at the same **400,000 reported-token milestone** in both; session 2 was a new principal on
durable state only. No prompt named the gate, the relay, the successor or the expected answer.

F: native DSH, no Palimpsest. A: governed recovery with the PWRS-D/E unseen-input gates.

## 2. Results

| | F | A |
|---|---|---|
| Rubric | **7/7** | **7/7** |
| Final artifact | 40,974 B, canonical worktree (**uncommitted**) | 25,790 B, **unsettled** in a RUNNING attempt's world |
| Tokens | 418,992 + 2,403,625 = **2,822,617** | 421,015 + 2,420,961 = **2,841,976** |
| Session 2 end | **budget stop** | **budget stop** |
| Natural end | no | no |
| Work at interruption | 39,939 B draft, uncommitted | **none** — empty world |
| Reuse of the draft | 334/350 lines (**95.4%**) | none existed |
| Governance | n/a | old attempt `CANCELLED` (successor, `UNATTRIBUTED`); new attempt **RUNNING**; task **ACTIVE**; no candidate, no promotion, no episode |

Aggregate **5,664,593 / 10,000,000**, 4,335,407 unused. 146 provider POSTs: 144×200, 2×502
`UPSTREAM_TIMEOUT` during A-2 (03:11:47, 03:13:37 UTC; both retried, the session continued); one GET
403 health probe.

## 3. What happened

- **F** left a 39,939-byte draft at the kill. F-2 read it, used a subagent, and produced a 40,974-byte
  package passing all seven facts, carrying 95.4% of the interrupted draft's substantive lines. It
  was still working when the guard stopped it at 2,403,625; the package is an uncommitted
  working-tree file.
- **A** left an empty world at the kill. A-2 read the measured source, passed
  `acknowledgeInputs=true` **preemptively** on `relay successor` (the gate therefore did not refuse
  this time), cancelled the empty attempt, started a new one, and produced a 25,790-byte package that
  also passes all seven facts. It was stopped at 2,420,961 before settling: the new attempt is
  **RUNNING**, the task **ACTIVE**, and there is no candidate or episode.

## 4. Reading

- **Both conditions reached the 7-fact floor; neither converged.** The matched pair does not show a
  product advantage on business content or on natural convergence. F's result is uncommitted; A's is
  an unsettled world file. Neither is an accepted asset.
- **R3's convergence did not replicate.** R3's A pair settled a candidate and recorded
  `WAIT_FOR_OPERATOR` at 1.42M; R4's A pair did not settle by 2.42M. The A runs now span: stale
  settled 5/7 (R1), unsettled 7/7 (R2), settled 7/7 + natural (R3), unsettled 7/7 (R4). With one pair
  each, this is variance, not a stable effect; the honest conclusion is that the gates are sound but
  **do not by themselves make the model finish**.
- **The gate was acknowledged proactively, not refused.** A-2 passed `acknowledgeInputs=true` on its
  first `successor` call. The PWRS-E refusal is proven in unit tests and was exercised in R3; here
  the model acted before the refusal. That is acceptable — the fact was confronted — but it means the
  gate's behavioural effect is not isolated.
- **F reused 95.4% of its draft** while A had nothing to reuse. The interruption timing, not the
  product, decided whether a draft existed.
- **The 502s were retried during A-2** and did not stop the session; the budget stop is the guard's
  soft ceiling, not a provider failure.

## 5. Limitations

- One pair per condition; no repeated sample, quality or cost advantage claim.
- No operator promotion was possible for R4: A has no candidate, and F has no product path. The
  R3 candidate was accepted separately (`promotion-b70b3bc7`).
- The 7-fact rubric saturates; "7/7" says the required facts are present, not that the decision is
  good.
- A's preemptive acknowledgement means the refusal path was not re-exercised here.

## 6. Authorization and usage

- Authorized: PWRS-R4, stage `pwrs-r4`, conditions F/A, 4 sessions, 2,500,000 per session, 125,000
  reserve, 10,000,000 aggregate, expires 2026-11-12.
- Gate: with a deliberately missing adapter it wrote `ADAPTER_NOT_CONFIGURED`, exit 3,
  `modelCalls=0`.
- Used **5,664,593**, leaving 4,335,407.

## 7. Evidence

- `score.json` — both rubrics, final sources, interruption snapshots, reuse, sessions, A governance.
- `interruption-F.json`, `interruption-A.json` — the bytes/Git state at the kill.
- `final/F-package.md`, `final/A-package.md`, `final/A-attempt-world-log.txt`.
- `sessions/<id>/` — run records, guard ledgers, kill/stop timestamps, logs.
- `sessions/streams/` — real DSH session streams (F subagents, A worker).
- `usage.json`, `proxy.jsonl` — reconciled tokens and request metadata.
