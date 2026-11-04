# ALHS-C core — real-model F/A result

Status: **core stage executed under the owner's 2026-11-04 authorization; diagnostic L/G was not authorized and did not run.**

Authorization: core only, F and A, 2 sessions per condition, 3,000,000 per session, 150,000 reserve,
12,000,000 aggregate. Gate: `research-evidence/alhs/live/authorization.json`.

## 1. What ran

Two byte-identical worlds (`F`, `A`). The measured 700 mm site-B constraint was injected at T+60s in
session 1 and was not in the initial sources. Session 1 was killed at T+240s in both conditions;
session 2 was a new principal session on the same durable project state. A had the full Palimpsest
product available but no formal task and no instruction to use any particular topology.

| Session | Condition | Window | Exit | Tokens | End |
|---|---|---|---:|---:|---|
| F-1 | strong native DSH | 14:05:17–14:09:20 | 1 | 165,963 | scenario kill at T+240s |
| F-2 | strong native DSH | 14:09:20–14:15:08 | 1 | 2,899,572 | **budget stop** at the 2,850,000 soft ceiling |
| A-1 | adaptive Palimpsest | 14:15:08–14:19:10 | 1 | 1,292,562 | scenario kill at T+240s |
| A-2 | adaptive Palimpsest | 14:19:10–14:20:03 | 0 | 251,007 | **natural**: `conclude DELIVER`, final message |

Aggregate: **4,609,104 tokens**, 7,390,896 under the 12,000,000 authorization.

## 2. Artifact and rubric

| | F | A |
|---|---|---|
| Final package | 32,228 bytes | 29,848 bytes |
| sha256 | `f9f6e922…` | `0d77121b…` |
| 7-fact rubric | **7/7** | **7/7** |
| First 7/7 | 240,070 tokens | 282,186 tokens |
| Tokens after first 7/7 | 2,825,465 | 1,261,383 |
| Tool calls after first 7/7 | 84 | 48 |
| Artifact changes after first 7/7 | 27 | 24 |
| Artifact versions | 28 | 26 |

Both final packages use the measured 700 mm corridor and reject the 900 mm unit at site B. Both name
the −12 °C site-A constraint and refuse to treat the 2024 / “expected” coastal claim as current.
Examples:

- F: “the measured 700 mm corridor is narrower than all three units… no expenditure can be approved
  from this package.”
- A: “0 of 3 units fit the measured corridor… Halcyon’s ‘expected 2026’ certificate is not a
  certificate on file.”

The 7-fact rubric is a floor, not a quality score. It saturated in both conditions, as it did in the
LHAPE pilot.

## 3. Natural convergence

- **A recorded `DELIVER` and exited on its own.** The conclusion is
  `episode-4f2b6270922b14e03cecae0e`, basis revision 0 / head `84f4adc`, `current=true`. The session’s
  last assistant message has no tool call.
- **F did not converge.** F-2 was still editing at the first observation above the soft ceiling and
  was stopped by the guard. Its last assistant message contains a tool call.

This is the first real-model evidence in this programme of an agent stopping on a recorded,
product-checked episode judgement after a host interruption. It is one pair, not a general result.

## 4. What A actually chose

A used direct file work plus **one native subagent**; it did **not** create a formal Work task, a
governed execution world, a Work Worker or a Promotion. `tasks` is empty and `promotions` is empty in
the A project. That is a valid adaptive decision under the protocol (“autonomous judgement not to
cooperate can be correct”), but it means this run provides **no real-model evidence of governed
multi-agent production**. The deterministic host run covers that mechanic separately.

A’s session 2 read the pulse, read files, made two edits, called `palimpsest_work action=conclude`,
and ended. It did not rely on the previous session’s transcript; only the durable project state and
the files were available.

## 5. Budget behaviour

- F-2 stopped at **2,899,572**, which is 49,572 above the 2,850,000 soft ceiling and 100,428 below the
  3,000,000 hard per-session ceiling. The 150,000 reserve absorbed the message-boundary overshoot;
  this is the intended behaviour, not an exact no-overspend proof.
- A had no budget stop.
- Total 4,609,104; the aggregate stayed 7,390,896 below the authorization.
- One provider request returned `502 UPSTREAM_TIMEOUT` at 14:12:33 during F-2. The proxy retried and
  the session continued; 102 of 103 POSTs returned 200.

## 6. Limitations

- **n=1 per condition.** No repeated samples, no paired analysis, no confidence claim.
- **The token comparison is not matched work.** Session 1 was killed at a fixed wall clock; A used
  1.29M before the kill while F used 166k, so the later totals reflect different amounts of work in
  the first window. The clean difference is the ending: A concluded, F was budget-stopped.
- **Both packages were left untracked.** Neither condition committed the final artifact. A’s DELIVER
  evidenceRef cites the base commit `84f4adc`, not a commit containing the package. The product’s
  DELIVER checks artifact existence and project facts; it does not turn a model’s evidence ref into
  verified provenance. The operator’s acceptance remains separate.
- **No governed cooperation by the real model.** A chose direct work + one native subagent.
- **The 7-fact rubric saturated.** Equal 7/7 does not show a Palimpsest quality advantage.
- **No F/A cost advantage is claimed.** A used 50.4% of F’s tokens in this pair, but the kill timing
  and the different first-window progress make that a descriptive number, not a matched cost result.
- **The diagnostic L/G stage did not run** and is not authorized.

## 7. Artifacts

Evidence: `research-evidence/alhs/core-2026-11-04/`.

- `core-summary.json` — authoritative reconciliation (tokens by session, rubric, natural end, proxy).
- `score.json` — full scorer output.
- `artifacts/F-package.md`, `A-package.md` — exact final packages.
- `sessions/F-1`, `F-2`, `A-1`, `A-2` — real DSH session streams (children included).
- `runs/` — per-session run records and guard ledgers.
- `proxy-proxy.jsonl` — provider request metadata only; no bodies, no credentials.
- `prompt-*.txt`, `core.json` — prompts and matched-world setup.
