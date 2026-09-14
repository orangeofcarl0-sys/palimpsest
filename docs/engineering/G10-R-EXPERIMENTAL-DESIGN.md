# G10-R Experimental Design

How Palimpsest defines and runs organization experiments. The question is never "which architecture
is best" but **"under what observable conditions did each architecture help or hurt?"**

## Immutable artifacts

All artifacts are strict-parsed, digest-bound, and immutable (`src/organization_memory/artifacts.ts`):

- `ExperimentDefinition { experimentId, revision, objective, scenarioRefs[], variantRefs[], measurementPlan{metricIds, primaryValidatorRef, objectives[], objectiveNote:"decision_aid_not_truth"}, runPolicy, digest }`
- `ScenarioDefinition { scenarioId, scenarioRevision, kind, classification, task, allowedHumanIntervention[], successCriteria[], validatorRefs[], bounds{maxWallClockMs,maxModelCalls,maxRunsPerVariant}, digest }`
- `ArchitectureVariant { variantId, kind, description, configRefs[], digest }` — a **treatment descriptor only**, referencing existing system config; never a new architecture ontology.
- `RunResult { runRef, experimentRef, scenarioRef, variantRef, provenance, measurements[], outcome, failureClassification, validatorVerdicts[], artifactRefs[], startedAt, endedAt, digest }`
- `OrganizationEvaluation { evaluationRef, experimentRef, experimentDigest, variantStats[], pairwise[], pareto, sampleSize, limitations[], warnings[], digest }`
- `MeasurementCorrection` (additive; never overwrites) and `InterventionRecord` (observational structural history).

`runRef` is **derived from content** (`run-<digest>`), so a duplicate run id with divergent content is
impossible by construction; a tampered `runRef` fails closed on parse.

## Metric schema and classification

`MetricObservation { metricId, version, unit, measurementClass, state: known|unavailable|error, value?|text?, detail?, provenance, digest }`.
`measurementClass ∈ {DIRECTLY_OBSERVED, DERIVED_MECHANICALLY, EXTERNALLY_VALIDATED, LLM_JUDGED, UNAVAILABLE}`.
**`unavailable` is never written as 0.** Numeric values must be safe integers (canonical JSON forbids
non-integers), so derived statistics are integer-rounded and units are integers (ms, counts, 0..100).

## Variants (no new ontology)

`SINGLE_LOCUS` · `ARTIFICIAL_ROLE_SPLIT` · `FEDERATED_PEERS` · `REASONING_CELL` · `RUNTIME_TOPOLOGY` ·
`CUSTOM_EXISTING_CONFIGURATION`. `configRefs` carries opaque references to real profiles/peers/scopes.

## Scenarios

`S1_LOW_COUPLING` · `S2_INTERFACE_NEGOTIATION` · `S3_SHARED_CONTEXT` · `ANTI_AGENTIFICATION` ·
`REASONING_DECOMPOSITION` · `RUNTIME_TOPOLOGY`, each with a `classification` of `OPEN_ENDED`,
`SCAFFOLDED`, or `SCRIPTED_MECHANICAL` that is copied into run provenance. A scaffolded negotiation is
never reported as autonomous invention.

## Fairness / parity

Every experiment records, per variant pair, which controls are `SAME`, `INTENTIONALLY_DIFFERENT`, or
`UNCONTROLLED`: model/provider, context inputs, tool availability, resource limits, validator,
deadline, workspace state, starting semantic state. The single-locus baseline is **not** artificially
restricted; a federated variant receives **no hidden shared context**. Local plans stay private.

## Run identity, repetition, ordering

`ExperimentRunRef` belongs only to the empirical domain and never reuses `AttemptId`, `ActivationRef`
or `CampaignId`. A comparative claim requires `runPolicy.minRunsPerVariantPerScenario` runs per
variant per scenario (default 3, cost-adjusted; target 5). Variant/scenario order is rotated with a
seeded deterministic shuffle recorded in `provenance.{seed,orderIndex}`. Each run uses a fresh temp
root and fresh semantic databases (no state leakage). A failed or timed-out run is **retained** as a
failure observation, never retried to success.

## Validators

`commandValidator` (exit 0 = PASS, non-zero = FAIL, missing executable = **ERROR**), `artifactValidator`,
`llmJudgeValidator` (SCORE; versioned prompt, judge model recorded, blinded where possible), and
`humanImportValidator`. `ERROR ≠ FAIL`. An LLM judge is never semantic Evidence truth.

## Evaluation

`evaluate({experiment, runs, scenarios})` produces distributions (count/known/unavailable/error,
mean/median/min/max/variance/quantiles where the sample permits), failure distributions, paired
comparisons (paired by `orderIndex` within scenario+variant, median deltas), and a **Pareto frontier**
over explicit objectives (`quality, latency, cost, coordinationCost, humanIntervention, recovery`).
Dominance requires not-worse on every shared observed objective and strictly better on at least one;
missing objectives are skipped. There is **no universal organization score** and no hidden weighting.

## Interpretation discipline

Say "under scenario set S and model M, variant A was associated with lower median latency than B",
never "A causes better organizations universally". Every evaluation carries sample size, spread,
missing data, uncontrolled variables, `observed_association_not_causation`, and
`no_universal_score`; distribution-shift / low-transferability warnings are emitted when the current
deployment differs materially from the recorded runs.

## OrganizationMemory

Append-only per-experiment chains (`SqliteOrganizationMemoryStore`), interventions in a reserved
scope, corrections additive. The memory owns empirical history only and imports no Organization,
RuntimeScope, Commitment, Boundary, Evidence or authority mutator — it can inform, never authorize.

## CI vs campaign

Required CI runs deterministic substrate/adversarial tests and small fixture evaluations. The real
repeated real-host campaign is a separately reproducible artifact recorded in the evidence doc.
