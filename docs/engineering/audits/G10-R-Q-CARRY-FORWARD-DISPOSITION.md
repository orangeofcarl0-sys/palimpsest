# G10-R — CF-Q Carry-Forward Disposition

Input: `docs/engineering/audits/G10-Q-CARRY-FORWARD.md` (CF-Q-01 … CF-Q-10).
Verdicts: `CLOSED_IN_R` · `RESCOPED_IN_R` · `REQUIRED_FOR_R_WITH_PROOF` · `STILL_DEFERRED_WITH_TRIGGER`.

| ID | Disposition | Reasoning |
| --- | --- | --- |
| CF-Q-01 — steady-state activation in-process | STILL_DEFERRED_WITH_TRIGGER | R reuses the Q in-process activation loop for federation experiments and the out-of-process `--resume` path for restart trials. Trigger unchanged (per-activation process isolation). |
| CF-Q-02 — shipped headless cannot resume | STILL_DEFERRED_WITH_TRIGGER | Upstream gap; the `palimpsest-dsh-host` bundle remains the resumable surface. |
| CF-Q-03 — host bundle installed by copy | STILL_DEFERRED_WITH_TRIGGER | R's runner reuses the same copy-into-profile install; publishing a bundle is not required for empirical claims. |
| CF-Q-04 — counter-proposal content scenario-provided | **CLOSED_IN_R** | Every scenario now carries an explicit `classification` (`OPEN_ENDED` / `SCAFFOLDED` / `SCRIPTED_MECHANICAL`) that enters run provenance and evaluation limitations, so scaffolded content can never be reported as autonomous invention. |
| CF-Q-05 — Pi conformance only | STILL_DEFERRED_WITH_TRIGGER | DSH remains the primary host; Pi is not used for empirical claims. |
| CF-Q-06 — live duplicate-wake injection absent | STILL_DEFERRED_WITH_TRIGGER | Duplicate/replay convergence stays proven deterministically; a live fault-injection runner is future work. |
| CF-Q-07 — single model / single run | **CLOSED_IN_R** | The `RunPolicy` requires an explicit `minRunsPerVariantPerScenario` (default 3, cost-adjusted; target 5) and every comparative claim is gated on repeated runs. Multi-model is a SHOULD; if no second provider is configured it is recorded as `unavailable`, never faked. |
| CF-Q-08 — G10-P residuals | STILL_DEFERRED_WITH_TRIGGER | CF-P-01/03/04/06/09/10 unchanged. |
| CF-Q-09 — telemetry minimal / noncanonical | **CLOSED_IN_R** | An `ExperimentTelemetryPort` with a DSH session adapter reads exact provider usage (`inputTokens`/`outputTokens`/cache/reasoning) plus turns/steps/tool calls, all classified and stored as noncanonical `MetricObservation`s; unobservable cost is `unavailable`. |
| CF-Q-10 — no remote synchronous boundary reads | STILL_DEFERRED_WITH_TRIGGER | The federation experiment observes canonical state after mutation (submit-then-observe). |

```text
No BLOCKER_IN_R. CF-Q-04, CF-Q-07 and CF-Q-09 closed by the empirical substrate.
```
