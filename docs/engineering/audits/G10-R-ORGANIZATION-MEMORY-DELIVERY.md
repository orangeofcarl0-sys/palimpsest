# G10-R Organization Memory & Empirical Evaluation — Delivery

Baseline: `main @ bdb935be127e6d10124fb00f805659d6b2aefa58`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

## Delivered

| Area | Files |
| --- | --- |
| Empirical artifacts | `src/organization_memory/artifacts.ts` (experiment/scenario/variant/run/evaluation/correction/intervention; strict parsers + domain digests; `unavailable` state; digest-derived `runRef`) |
| Append-only store | `src/organization_memory/store.ts` (per-experiment chained events, definition-first, idempotent replay, `event_conflict`/`recovery_required`/`basis_mismatch`, `INTERVENTIONS` scope) |
| Query service | `src/organization_memory/service.ts` (`record*`, `experiments/runs/run/evaluations/corrections/interventions/similarRuns/structuralHistory`) |
| Metrics/telemetry | `src/experiment/metrics.ts` (integer-rounded statistics, `distributionFor`, `paretoFrontier`, proxy byte helper), `telemetry.ts` (DSH session usage extraction; unavailable ≠ 0) |
| Validators | `src/experiment/validators.ts` (command/artifact/LLM-judge/human-import; `ERROR ≠ FAIL`) |
| Evaluation | `src/experiment/evaluation.ts` (comparability firewall, warmup exclusion, paired median deltas, Pareto, warnings/limitations) |
| Runner | `src/experiment/runner.ts` (`planRuns` seeded ordering, `executeRuns` retained failures + timeouts) |
| Product surface | `src/install.ts` (`organizationMemoryStore` option; `installed.organizationMemory`/`installed.evaluation`), `src/application/{surface,http}.ts` (read-only empirical routes), `src/tools/application_tools.ts` (`palimpsest_experiments`), `src/advanced.ts` |
| Campaign | `scripts/experiments/run-campaign.mjs`, `scripts/experiments/lib/host.mjs` |
| Tests | `test/r_organization_memory.test.ts` (17), `test/r_experiment_evaluation.test.ts` (23), `test/r_adversarial.test.ts` (5) |
| Docs | assessment, CF-Q disposition, experimental design, spec, campaign, empirical evidence, carry-forward, this delivery |

## Golden proofs

- **OrganizationMemory golden proof**: experiment definitions + 3 architecture variants + repeated runs
  + evaluations + one structural `InterventionRecord` persisted; close/reopen reconstructs history and
  evaluations identically (deterministic test using a temp file).
- **Authority firewall**: source tests prove `src/organization_memory/**` imports no Organization /
  RuntimeScope / Commitment / Boundary / Evidence authority mutator; the memory is observational.
- **No universal score**: no `score`/`health`/`synergy` scalar exists anywhere in the empirical subsystem;
  evaluation exposes only distributions, paired deltas and a Pareto set over explicit objectives.
- **Real repeated trials**: 11 real DSH runs + 1 retained real timeout across 2 experiments with a
  single-locus baseline; 6 scripted runs for the reasoning scenario; token telemetry directly observed
  for LLM runs.

## Local gates

| Gate | Result |
| --- | --- |
| `pnpm run build` | PASS |
| `pnpm exec vitest run` | PASS — **133 files / 1167 tests** (baseline 130 / 1122) |
| `pnpm run build:web` | PASS |
| `pnpm exec playwright test` | **24 / 24 PASS** (the G10-Q node-visibility stabilization holds) |
| `node scripts/experiments/run-campaign.mjs` | PASS — 18 runs (11 real, 6 scripted, 1 retained real timeout); 3 evaluations + 1 intervention recorded |

## Defects found and fixed during R

1. `evaluate` comparability firewall only compared runs to each other, never to the supplied
   `experiment.experimentId` (an all-foreign run set slipped through). Fixed; test converted from an
   expected-fail marker to a real assertion.
2. `runRef` was an unbound caller-supplied label. Now **derived from the run digest** and re-validated
   on parse, so a duplicate run id with divergent content fails closed (R-N13).

## Deviations (honest)

1. Cost-adjusted `minRunsPerVariantPerScenario = 3` (spec target 5); with n=3 variance/quantiles are
   limited and omitted where the sample does not permit.
2. Single provider/model in this environment; multi-model is recorded as `unavailable`, not faked.
3. The federation single-locus variant produced one retained TIMEOUT; it is part of the outcome
   distribution, not discarded.
4. `estimatedCost` is `unavailable` (DSH exposes tokens, not currency); `cacheWriteTokens` was
   unavailable in this host. `qualityScore` came from deterministic artifact validators (no LLM judge
   was required for v1).
5. The reasoning-cell experiment is `SCRIPTED_MECHANICAL` (no LLM), as permitted for a decomposable
   scripted scenario; it measures branch/duplicate/unresolved/verification counts deterministically.
6. No MultiGraph empirical overlay (explicitly not a PASS blocker); the read surface is exposed via
   tools/HTTP.

## Required CI

See the canonical gate recorded after the implementation PR run (filled in the closure commit).
