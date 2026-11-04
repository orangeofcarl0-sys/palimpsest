# ALHS-C repeat-core — balanced-interruption pre-registration

Status: **EXECUTED 2026-11-04 under the owner's repeat-core authorization (8,000,000 aggregate).**
Result: `docs/engineering/ALHS-C-REPEAT-RESULT.md`;
evidence: `research-evidence/alhs/repeat-2026-11-04/`. The diagnostic L/G stage did not run.

Code freeze for the product: `a62fc32a554448f5f8cfb67801a7e0b7094c9100`.

## Amendment 1 (before any repeat model session)

The first repeat launch failed at the provider-proxy bind (`EADDRINUSE` on 18087): **0 model calls,
0 tokens**. While validating the relaunch, the 1,200,000-token milestone was found unreachable for F
within the 600s wall-clock backstop, using the core's measured rates (F-1: 165,963 tokens in 240s;
A-1: 1,292,562 in 240s). F would have hit the backstop first, so the interruption would not be the
same token milestone.

The milestone is therefore lowered to **400,000 reported tokens** for both conditions. It is still
above both core first-valid thresholds (F 240,070; A 282,186), so each condition has produced a
package before the interruption. The wall-clock backstop is extended from 600s to **900s** so F can
reach the milestone at its measured rate; the milestone remains the primary rule. Ceilings, reserve,
session count and the 8,000,000 aggregate are unchanged. No repeat session data existed when this was
applied.

## 1. Why repeat

The core run produced one pair per condition. A recorded `DELIVER` and exited; F was stopped by the
budget guard. Both reached 7/7. That is a concrete signal, but the fixed 240s kill gave the two
conditions very different first-window work (A-1 1,292,562 tokens; F-1 165,963). The later token
totals are therefore not a matched-work comparison.

This stage repeats the pair with one design change: **the interruption is a token milestone, not a
wall clock**. Session 1 is killed when the real-usage guard reports the same threshold (400,000
tokens) in both conditions, with a wall-clock backstop. The constraint still arrives at T+60s.

## 2. Design

| Item | Value |
|---|---|
| Conditions | F (strong native DSH), A (adaptive Palimpsest) |
| New pairs | 1 per condition (this is pair #2 overall; the core was pair #1) |
| Session 1 | ceiling 1,500,000; killed at the 400,000-token milestone (Amendment 1); wall-clock backstop 900s |
| Session 2 | ceiling 2,500,000; new principal session on the same durable state |
| Reserve | 150,000 per session; soft stop = ceiling − reserve |
| Aggregate | 8,000,000 |
| Constraint | measured 700 mm site-B corridor at T+60s; never in the initial sources |
| Prompts | identical to the core stage; no expected replan, no evaluator oracle |

The token milestone is read from the real-usage ledger, which observes usage after a message; the
kill therefore happens at the first observation at or above 400,000, not at an exact token count.

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
