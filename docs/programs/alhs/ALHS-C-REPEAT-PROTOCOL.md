# ALHS-C repeat-core — balanced-interruption pre-registration

Status: **PRE-REGISTERED ONLY. NOT AUTHORIZED. NOT RUN.**
This is a new stage, not the executed core. The core result is
`docs/engineering/ALHS-C-CORE-RESULT.md`.

Code freeze for the product: `a62fc32a554448f5f8cfb67801a7e0b7094c9100`.

## 1. Why repeat

The core run produced one pair per condition. A recorded `DELIVER` and exited; F was stopped by the
budget guard. Both reached 7/7. That is a concrete signal, but the fixed 240s kill gave the two
conditions very different first-window work (A-1 1,292,562 tokens; F-1 165,963). The later token
totals are therefore not a matched-work comparison.

This stage repeats the pair with one design change: **the interruption is a token milestone, not a
wall clock**. Session 1 is killed when the real-usage guard reports the same threshold (1,200,000
tokens) in both conditions, with a wall-clock backstop. The constraint still arrives at T+60s.

## 2. Design

| Item | Value |
|---|---|
| Conditions | F (strong native DSH), A (adaptive Palimpsest) |
| New pairs | 1 per condition (this is pair #2 overall; the core was pair #1) |
| Session 1 | ceiling 1,500,000; killed at the 1,200,000-token milestone; wall-clock backstop 600s |
| Session 2 | ceiling 2,500,000; new principal session on the same durable state |
| Reserve | 150,000 per session; soft stop = ceiling − reserve |
| Aggregate | 8,000,000 |
| Constraint | measured 700 mm site-B corridor at T+60s; never in the initial sources |
| Prompts | identical to the core stage; no expected replan, no evaluator oracle |

The token milestone is read from the real-usage ledger, which observes usage after a message; the
kill therefore happens at the first observation at or above 1,200,000, not at an exact token count.

## 3. Measurements

Primary: **natural convergence** vs budget stop, and the episode conclusion state for A.

Secondary: 7-fact rubric; tokens to first 7/7; tokens after first 7/7; tool calls after; artifact
versions; actual parallel work; whether a governed Work/World/Worker was used; late-result handling;
cross-session continuation; unsafe acceptance; provider failures; wall time.

The rubric is a floor, not a quality score. Business and governance outcomes are reported separately.

## 4. Fairness

Same goal, sources, model, provider, visible facts, injection content and timing, system prompts and
evaluation rules. No hidden dependency. No condition is weakened. A is not required to use a formal
Worker; choosing direct work remains valid and is recorded.

## 5. Authorization

The fail-closed entry is:

```bash
node scripts/alhs/run_cohort.mjs \
  --cohort=research-evidence/alhs/live/cohort-repeat-pre-registration.json \
  --stage=repeat-core
```

Without `--execute` it writes the plan and starts no model. Without a current
`alhs-spend-authorization/v1` for cohort `alhs-c-repeat-2026-11-04`, stage `repeat-core`, provider
`deepseek-official/deepseek-flash`, conditions F/A, aggregate ≥ 8,000,000, per-session ≥ 2,500,000,
reserve ≥ 150,000 and at least 4 sessions, it writes `BLOCKED.json` and exits 2 with `modelCalls=0`.
With an authorization but no adapter it exits 3 with `ADAPTER_NOT_CONFIGURED`.

The existing core authorization does **not** cover this stage: it names `alhs-c-2026-11-04`, stage
`core`, and its four planned sessions are complete.

## 6. Scope limits

This is one additional pair. Combined with the core it is still two pairs per condition, not a
powered sample. It can show whether the core convergence difference survives a balanced interruption;
it cannot establish a general quality, cost or autonomy advantage. The diagnostic L/G stage is a
separate, unauthorized question.
