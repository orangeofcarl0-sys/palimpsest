# G10-R — Empirical Organization Evaluation & Organization Memory (Campaign)

## Topology (as executed)

| Step | Deliverable |
| --- | --- |
| R0 | Empirical audit + metric classification → `audits/G10-R-EMPIRICAL-ORGANIZATION-ASSESSMENT.md` |
| R1 | Immutable Experiment/Scenario/Variant/Run/Evaluation/Correction/Intervention artifacts (`src/organization_memory/artifacts.ts`) |
| R2 | Metric schema + statistics + telemetry adapters (`src/experiment/metrics.ts`, `telemetry.ts`) |
| R3 | Validator adapters (`src/experiment/validators.ts`) |
| R4 | Append-only OrganizationMemory store + service + query (`src/organization_memory/{store,service}.ts`) |
| R5 | Run isolation/reproducibility runner (`src/experiment/runner.ts`, `planRuns`/`executeRuns`) |
| R6 | Evaluation/paired/Pareto logic (`src/experiment/evaluation.ts`) |
| R7-R9 | Golden experiments A (anti-agentification), B (federation), C (reasoning cell) — `scripts/experiments/*` |
| R10 | OrganizationMemory query + application surface/tools/HTTP (`src/install.ts`, `src/application/*`) |
| R11 | Adversarial/statistical-discipline closure (`test/r_*.test.ts`) |
| R12 | Docs/evidence/CI |

## Module layout

```text
src/organization_memory/  artifacts.ts · store.ts · service.ts · index.ts
src/experiment/           metrics.ts · telemetry.ts · validators.ts · evaluation.ts · runner.ts · index.ts
scripts/experiments/      run-campaign.mjs · lib/host.mjs
```

## Truth ownership

```text
OrganizationStore       semantic organization truth
RuntimeScopeStore       runtime truth
BoundaryMemoryStore     shared boundary truth
CoordinationStore       collaboration truth
ReasoningCellStore      admitted cell state
OrganizationMemoryStore empirical observation/history ONLY
```

## Red lines held

Telemetry is noncanonical; unavailable ≠ 0; no universal score; Pareto instead of ranking; failures
retained; memory is append-only and read-only toward the system; evaluation never authorizes
evolution; the Q anti-waste reconciliation remains valid (no fake transport, no recording attention
on the production path, no duplicate cursor or mailbox); real DSH host-backed principals are retained
for the federation experiment.
