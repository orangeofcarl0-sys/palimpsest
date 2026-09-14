# G10-R Carry-Forward Register

Mandatory input for the next stage. CF-Q dispositions: `G10-R-Q-CARRY-FORWARD-DISPOSITION.md`.

## CF-R-01 — Run-ledger-to-campaign binding is manual
- **Observed at:** `scripts/experiments/run-campaign.mjs`
- **Evidence:** the campaign records runs into OrganizationMemory after each real trial; there is no
  host-side streaming telemetry tap, so a process crash between trial and record loses that observation.
- **Category:** RUNNER · **Trigger:** a streaming telemetry tap. · **Blocking:** NON_BLOCKING

## CF-R-02 — Token telemetry depends on reading DSH session logs
- **Observed at:** `src/experiment/telemetry.ts`
- **Evidence:** DSH exposes exact token usage on `assistant/message` events, but the campaign runner
  must read the persisted session JSONL to obtain it for a separate process; if unreadable the token
  metrics are `unavailable`. DSH exposes no dollar cost at all.
- **Trigger:** a plugin-side usage callback. · **Blocking:** NON_BLOCKING

## CF-R-03 — Single provider in this environment
- **Evidence:** multi-model comparison is a SHOULD; only one provider is configured here, recorded as
  `unavailable` in provenance rather than faked. · **Trigger:** a second provider. · **Blocking:** NON_BLOCKING

## CF-R-04 — Quality is validator-limited
- **Evidence:** `qualityScore` comes from deterministic artifact validators; richer quality rubrics
  (LLM judge / human rubric) are supported by the ports but a versioned, blinded judge was not required
  for v1. · **Trigger:** tasks needing nuanced quality. · **Blocking:** NON_BLOCKING

## CF-R-05 — Empirical overlay in MultiGraph not implemented
- **Evidence:** the empirical read surface exists (tools/HTTP); a presentation overlay is explicitly not
  a PASS blocker and was left out. · **Trigger:** an operations console. · **Blocking:** NON_BLOCKING

## CF-R-06 — Long-horizon outcomes not modelled
- **Evidence:** outcome horizon supports immediate + end-of-run; N-tasks/N-minutes/campaign-boundary
  horizons are carried forward. · **Trigger:** long-horizon questions. · **Blocking:** NON_BLOCKING

## CF-R-07 — Statistical power is modest by design
- **Evidence:** cost-adjusted `minRunsPerVariantPerScenario = 3` (spec target 5). With n=3, per-variant
  variance/quantiles are limited and are omitted rather than faked; conclusions are distributional and
  explicitly uncertainty-aware. · **Trigger:** a higher-budget campaign. · **Blocking:** NON_BLOCKING

## CF-R-08 — Q residuals retained
- CF-Q-01/02/03/05/06/08/10 unchanged (activation locality, headless resume, bundle distribution, Pi,
  live duplicate-wake injection, G10-P residuals, remote synchronous boundary reads). · **Blocking:** NON_BLOCKING

## CF-R-09 — Corrections API is storage-level
- **Evidence:** `MeasurementCorrection` and `recordCorrection` exist and are additive, but no operator
  tool/UI surfaces corrections yet. · **Trigger:** an operator correction workflow. · **Blocking:** NON_BLOCKING

```text
No BLOCKER_IN_R. Next stage (spec §105): choose from evidence — Empirical Architecture Advisor,
Federated Boundary Operational Resilience, Multi-Institution Governance, ReasoningCell→Campaign/Evidence,
Host bundle distribution; or Organization Refactoring Policy if the evidence shows a structural waste.
Any such change must still go Dynamics → Proposal → Governance — never benchmark → mutate.
```
