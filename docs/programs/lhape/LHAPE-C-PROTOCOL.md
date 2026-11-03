# LHAPE-C — Long-Horizon F/L/G Protocol (pre-registration)

Status: **BLOCKED — no LHAPE spend authorization exists.** This document registers the comparison
that would be run after a new, explicit owner authorization. It is not a result.

## 1. Question

Can real agents in a persistent, evolving project (a) produce actual assets concurrently in isolated
worlds, (b) change the plan when measured reality invalidates an assumption, (c) handle late and stale
results and a killed host, (d) continue in a new principal session, and (e) finish a consistent
package — at what cost and with what recovery behaviour, compared with a strong native DSH baseline?

## 2. Conditions

| Condition | Definition |
|---|---|
| **F** | Strong native DSH + Git/Markdown + native subagents. No Palimpsest project/governance path. |
| **L** | Native DSH + Palimpsest Lightweight project context / contribution / pulse. No governed Work Worlds or Promotion. |
| **G** | L + governed Work Worlds, async Work Workers, Promotion and long-horizon recovery on demand. |

All conditions receive the same goal, the same visible source facts and the same model qualification
and comparable budget. No condition receives the hidden dependency, the expected replan, the
acceptance rule, or an evaluator oracle in its prompt. The model chooses its own collaboration
topology; the harness does not prescribe a fixed agent count or the replan.

## 3. Scenario (proposed)

A multi-site energy deployment package with:

- a baseline capacity assessment and a cost model;
- a measured site-B corridor constraint that arrives **after** work has started and invalidates the
  baseline width assumption;
- an integration artifact that must name the accepted sources;
- one controlled host kill after a worker commit, followed by a new principal session;
- an operator acceptance step that only accepts results on the current basis.

The hidden dependency is the measured constraint and its effect on the baseline tasks. It is never
stated in the initial goal or in any condition prompt; it is delivered as an external measured input
while the baseline work is in flight.

## 4. Required measurements

Final artifact correctness; cross-artifact consistency; autonomous delegation; real parallel work
(overlapping worker process/session windows, not sequential calls); contribution-to-decision influence;
decision-to-execution influence; reality-driven replanning; stale-result handling; worker interruption
handling; cross-session continuation; accepted-result completeness; repeated/wasted work; unsafe
promotion or source acceptance; tool calls; token usage by cache class; wall time; actual cost; human
intervention.

## 5. Budget and stop rules

- Per-session ceiling and aggregate ceiling are mandatory; the local hard cap is 8,000,000 tokens.
- The existing real-usage guard (`scripts/aps/budget_guard.mjs`) reads the DSH session usage stream
  and terminates the target tree above its ceiling; a post-run reconciliation reads the final usage.
- Child/subagent usage is included in the session accounting.
- Stop on ceiling, provider failure, signal, or an unsafe acceptance attempt; preserve evidence.
- No sample-size increase without a new authorization.

## 6. Authorization

No LHAPE authorization is present. The APS pilot authorization does **not** transfer. The fail-closed
entry is:

```bash
node scripts/lhape/run_cohort.mjs --cohort=research-evidence/lhape/live/cohort-pre-registration.json
```

Without `--execute` it validates and writes a plan; it starts no model. Without a current
`lhape-spend-authorization/v1` covering this exact cohort, provider, conditions and ceiling, it writes
`BLOCKED.json` and exits 2. The current recorded state is
`research-evidence/lhape/live/lhape-c-long-horizon-2026-11-03/BLOCKED.json`.

## 7. Scope limits

This pre-registration does not claim a completed long-horizon cohort, a comparative benefit, a cost
advantage, or model cognition. The deterministic Windows-host scenarios in
`research-evidence/lhape/2026-11-03/` are engineering qualifications driven by a deterministic
Messages stand-in; they are the basis for the runner's mechanics, not for a model-quality result.
