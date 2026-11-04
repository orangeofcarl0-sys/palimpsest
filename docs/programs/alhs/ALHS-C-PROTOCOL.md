# ALHS-C — Adaptive Long-Horizon Synthesis comparison (pre-registration)

Status: **CORE, REPEAT-CORE AND DIAGNOSTIC EXECUTED (2026-11-04); NO STAGE REMAINS UNAUTHORIZED-AND-PLANNED.**
Core result: `docs/engineering/ALHS-C-CORE-RESULT.md`; repeat:
`docs/engineering/ALHS-C-REPEAT-RESULT.md`; diagnostic:
`docs/engineering/ALHS-C-DIAGNOSTIC-RESULT.md`.

Code freeze: `1227a7478d20954e0366d8e9ccec8c62763171b9`.

## 1. Question

Can a real agent, in a persistent and evolving project, **organise and converge** a long-horizon
project — choose when to work directly, delegate, or use governed Worlds; absorb a measured fact that
invalidates an assumption; change the actual execution, not only the plan text; reuse the still-valid
part of a late result; continue in a new principal session; and **end the episode on evidence rather
than on a budget ceiling** — and at what token cost compared with a strong native DSH baseline?

## 2. Conditions

| Condition | Definition |
|---|---|
| **F** | Strong native DSH: native subagents, tools, Git/Markdown. No Palimpsest project/governance path. |
| **L** | Native DSH + Palimpsest lightweight project context, pulse, contributions. No governed Work Worlds or Promotion. |
| **A** | **Adaptive Palimpsest**: the full product is available; the agent chooses lightweight work, native subagents, research delegation, real Work Workers, isolated Worlds, or none of them. It is NOT told which to use and is NOT required to use governed execution. |
| **G** | Forced Governed diagnostic: the task is a formal Work task with a confirmed standard and a governed execution world. This isolates the cost of governance; it is not the product default. |

The primary comparison is **F vs A**. L and G are staged diagnostics: L isolates the lightweight
project-context effect; G isolates forced-governance cost.

## 3. Scenario (T0–T10)

A multi-site energy deployment package (capacity, vendor compliance, cost, schedule, risk, integrated
decision). The same world seeds all conditions byte-for-byte; the initial goal discloses none of the
hidden dependencies.

| Node | Event |
|---|---|
| T0 | User intent. |
| T1 | Principal reads the project reality (pulse for Palimpsest; files/Git for F). |
| T2 | Principal decides the next work and collaboration topology. |
| T3 | Real asset production. In the **engineering** arm, two real Workers run in isolated worlds; in the **autonomous** arm no topology is prescribed. |
| T4 | A measured site-B corridor (700 mm) arrives mid-flight. It invalidates a baseline width assumption. This is never in the prompt. |
| T5 | Principal assesses the new fact and decides whether to replan. |
| T6 | The decision changes **actual execution** (a task is retired, a worker stops receiving work, a new worker starts on the new basis, or a late candidate is not accepted). |
| T7 | A late result arrives with one still-valid component (vendor pricing) and one invalid component (the corridor assumption). The system must reuse the valid part in a **new governed attempt** and refuse the invalid part as current. |
| T8 | A controlled host kill after a worker commit; a new principal session resumes from durable project state only. No transcript or hidden reasoning is injected. |
| T9 | Final deliverable, or a recorded waiting/checkpoint state. |
| T10 | Natural episode termination: `DELIVER`, `WAIT_FOR_OPERATOR`, `WAIT_FOR_EXTERNAL_EVENT`, `REPLAN`, `CONTINUE`, or `CHECKPOINT`. A token-ceiling stop is **not** natural termination. |

## 4. Measurements

Business outcome (artifact correctness, cross-artifact consistency, both sites, current measurement,
vendor compliance, cost/schedule, risk/decision) is scored **separately** from governance outcome
(accepted result, unsafe acceptance, stale-result refusal, recovery, operator intervention).

Per session/condition:

- goal completion and the 7-fact rubric (as a floor, not the score);
- **natural convergence** vs budget stop (recorded stop reason; a ceiling stop is `false`);
- time and tokens to the first valid artifact, and to the final valid artifact;
- tokens after the first valid artifact and tool calls after it;
- actual parallel work (overlapping worker process/session windows, not sequential calls);
- autonomous collaboration (which topology the model chose, with evidence; no topology is scored as
  "correct" in advance);
- reality-driven replan and whether a real execution changed;
- late-result handling and partial reuse (see §5);
- cross-session continuation and host/worker recovery;
- unsafe acceptance attempts (must be zero);
- human/operator interventions;
- tool calls, tokens by cache class, wall time, actual monetary cost.

Each item that cannot be reconstructed is `NOT_OBSERVED`, never guessed.

## 5. Partial-reuse measurement

The product exposes path-level facts (`unaffected`, `conflicted`, `already-present`) for a stale
result. The measured question is whether those facts **reduce work without importing a stale claim**:

- how much of the old result is actually reused (content comparison, not a copied file);
- whether the new attempt avoids re-reading/re-deriving the unaffected sources;
- whether the invalid field is recomputed and the final artifact states the current measurement;
- whether the old result is ever promoted or treated as accepted (must be zero);
- extra tokens/tool calls attributable to the reuse path.

"Copied a file" and "referenced a commit" are not reuse. If reuse does not pay, the condition may
rework from scratch; that is a valid negative result.

## 6. Fairness

- Same goal, sources, model, provider, visible facts and injected events across conditions.
- Same evaluation rules, fixed before the run.
- No hidden dependency, expected replan, acceptance rule or evaluator oracle in any prompt.
- No condition is weakened; F keeps its native subagents and tools.
- A/G are not required to create a fixed number of Agents; not using a Worker is a valid A decision.
- Governance execution is not scored as quality. Business outcome and governance outcome are reported
  separately, never merged into one total.
- No post-hoc prompt repair and no contaminated replay.

## 7. Budget and stop rules

- Per-session ceiling and aggregate ceiling are mandatory.
- **Reserve**: every session runs with `--reserve-tokens` (default 150,000). The guard stops at
  `ceiling - reserve`, not at the ceiling, because usage is observed after a message. This reduces the
  one-message overshoot measured in the LHAPE-C pilot (28k–62k per session).
- Child/subagent sessions are counted by reading the whole session root recursively.
- Concurrent sessions have an explicit allocation; the sum of their soft ceilings plus reserve must
  fit the aggregate ceiling.
- Stop on ceiling, provider failure, signal or an unsafe acceptance attempt; preserve the ledger,
  `STOPPED.json`, session streams and artifacts.
- Final reconciliation: compare the guard ledger with the final session usage; report the difference.
  A stop is not described as an exact no-overspend guarantee.
- No sample-size increase without a new authorization.

## 8. Authorization

The fail-closed entry is:

```bash
node scripts/alhs/run_cohort.mjs --cohort=research-evidence/alhs/live/cohort-pre-registration.json --stage=core
```

Without `--execute` it validates the cohort and writes a session/budget plan; it starts no model.
Without a current `alhs-spend-authorization/v1` covering this exact cohort, provider, stage,
conditions, session ceilings, reserve and aggregate, it writes `BLOCKED.json` and exits 2, with
`modelCalls=0`. With `--execute` but no configured execution adapter it refuses with
`ADAPTER_NOT_CONFIGURED` and still starts no model.

## 9. Staged scope

- **core** — F and A, 2 sessions per condition, 3,000,000 per session, 150,000 reserve,
  aggregate 12,000,000. **Authorized and executed on 2026-11-04.** Result:
  `docs/engineering/ALHS-C-CORE-RESULT.md`; 4,609,104 tokens used.
- **diagnostic** — L and G, 2 sessions per condition, 2,500,000 per session, 125,000 reserve,
  aggregate 10,000,000. **Authorized and executed on 2026-11-04.** Result:
  `docs/engineering/ALHS-C-DIAGNOSTIC-RESULT.md`; 2,686,115 tokens used.

The total proposed ceiling for both stages is 22,000,000 tokens. The local hard cap in the runner is
25,000,000. Core, repeat-core and diagnostic have all run; no authorized model stage remains.

## 10. Scope limits

This document registers a comparison; it does not claim one. The current evidence is:

- the authorized **core** run: `research-evidence/alhs/core-2026-11-04/` and
  `docs/engineering/ALHS-C-CORE-RESULT.md` (F and A, one session pair each, 4,609,104 tokens);
- deterministic real-host engineering: `research-evidence/alhs/2026-11-04/host-run/` (scripted
  Messages stand-in; real host, workers, Git, Work/Promotion and operator actions);
- offline diagnosis of the LHAPE-C pilot: `research-evidence/alhs/2026-11-04/offline-convergence-analysis.json`.

The core run is one pair per condition: it reports that A recorded `DELIVER` and ended while F was
budget-stopped, and that both reached the same 7-fact floor. It does **not** establish a repeated-sample
effect, a quality advantage, a matched cost advantage, or real-model governed cooperation (A chose
direct work plus one native subagent). The diagnostic L/G stage did not run.
