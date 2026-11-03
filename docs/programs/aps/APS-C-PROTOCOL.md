# APS-C — comparative protocol and budget boundary

Status: **PREPARED / BLOCKED — no APS spend authorization exists.**

The PC1-V1 live authorization covered the PC1-V1 cohort only. It does not transfer to APS. No F/L/G
model session has been started for this stage. The deterministic real-host run under
`research-evidence/aps/2026-11-03-host-run/` is an engineering qualification with a scripted Messages
stand-in; it is **not** a model result and cannot support a comparative claim.

## 1. Conditions

| Condition | What the agent has |
|---|---|
| **F** | Strong native DSH: model, native tools, native `subagent`, Git/Markdown. No Palimpsest tools. |
| **L** | F plus Palimpsest Lightweight: the derived project pulse, the project journal, the contribution chain, and optional async delegation. Ordinary work is not forced into formal Work. |
| **G** | L plus governed execution for the high-impact artifact: Work Worlds, Review, Promotion and operator acceptance where the task actually requires them. |

F is never weakened. L and G prompts do not name a required agent count, a required delegation, a
required plan revision, or an expected answer. The same prompt skeleton and the same visible source
set are used across conditions; only the capability surface and the product-specific paragraph differ.

## 2. Scenario requirements

One new long-horizon scenario, not the PC1/Sablewick/Field Study answers:

- a high-level user goal and several artifact types;
- an initial plan that is not fully correct;
- at least two genuinely parallel sub-works;
- a mid-run reality change that invalidates one assumption;
- a key judgement that needs independent checking;
- one late or stale result;
- a principal session boundary;
- a final synthesis with an independent acceptance standard.

A second cross-domain task (for example, a multi-repository code change plus a data-and-report
synthesis) is required before any pooled claim. The scenario, visible set, prompts, model, provider,
timeouts and scoring rubric are frozen in a cohort file before the first call.

## 3. Measurements

Record, per session and per condition:

| Measure | Definition |
|---|---|
| Final task correctness | independent scorer against the frozen acceptance standard |
| Artifact completeness | required artifacts present and substantive |
| Autonomous cooperation | whether the agent initiated a contribution without a scripted instruction |
| Actual contribution | a finding actually cited in a later decision or artifact |
| Actual plan changes | observed revision/task deltas, not a `changedPlan` declaration |
| Outcome-level influence | a downstream task/artifact that would differ without the contribution |
| Late-result handling | terminal/stale result discovered and not wrongly accepted |
| Cross-session continuation | a new session recovers the goal, assets, open loops and pending work |
| Unnecessary duplicate work | repeated reads or repeated formal Work |
| Unsafe acceptance | an unverified contribution treated as Evidence, truth or authority |
| Recovery | interrupted session/delegation handled without fabricated success |
| Tool calls; tokens by cache class; wall time; monetary cost; human interventions | raw telemetry |

No score is inferred from the number of agents, receipts, proposals or internal protocol events.

## 4. Spend authorization schema

The runner accepts only this exact shape; a missing, expired, mismatched or under-budget file blocks
the cohort before any session starts:

```json
{
  "schema": "aps-spend-authorization/v1",
  "authorized": true,
  "owner": "<owner identity>",
  "cohortId": "<exact cohort id>",
  "authorizedAt": "<ISO timestamp>",
  "expiresAt": "<future ISO timestamp>",
  "provider": { "id": "<provider>", "model": "<model>" },
  "maxTokens": 8000000,
  "conditions": ["F", "L", "G"],
  "note": "<scope and any per-condition limits>"
}
```

The cohort file is `aps-live-cohort/v1` and lists every session with `condition`, `maxTokens`,
`command`, `cwd` and `sessionRoot`. The runner computes the aggregate request and refuses when it is
above the authorized ceiling or above the local hard cap of 8,000,000 tokens. The old PC1-V1
authorization and the old 40M reservation are not accepted.

## 5. Executable stop boundary

`scripts/aps/budget_guard.mjs` is the enforcement point, not the authorization file:

- it reads the **real** DSH session streams (`session.v4.jsonl.zstd`, multi-frame);
- it sums reported `usage.totalTokens` by assistant message;
- it writes a live ledger;
- when the session ceiling is exceeded it writes `STOPPED.json` and terminates the target PID
  (`SIGTERM`, then `SIGKILL` after two seconds);
- the runner starts one guard per session and records whether the session was stopped by budget.

`scripts/aps/run_cohort.mjs` validates the cohort and authorization, and without `--execute` starts
nothing. The gate is tested without a provider in `test/aps_cohort_gate.test.ts`.

## 6. Execution and analysis discipline

- No post hoc prompt repair after an unfavorable result.
- No evaluator-only material, hidden rubric or expected answer in any scored session.
- No reuse of a contaminated session; preserve the raw session stream and a written exclusion reason.
- Do not score deterministic workers or the scripted stand-in as cognitive Agents.
- Do not claim comparative benefit from the deterministic host run. If the paid cohort remains
  unauthorized, the correct verdict is `BLOCKED / NO COMPARATIVE EVIDENCE`.

## 7. Current evidence

- Gate and guard tests: `test/aps_cohort_gate.test.ts`.
- Runner: `scripts/aps/run_cohort.mjs`.
- Guard: `scripts/aps/budget_guard.mjs`.
- Deterministic real-host engineering run: `research-evidence/aps/2026-11-03-host-run/` (labelled
  `MOCK_MODEL_REAL_DSH_HOST`; no provider call, no paid tokens).
