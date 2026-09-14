# G10-R — Empirical Organization Evaluation & Organization Memory (Spec)

Repeated Real Runs → Comparative Evidence → Pareto Evaluation → Empirical Architecture History.

Baseline: `main @ bdb935be127e6d10124fb00f805659d6b2aefa58`. First empirical/experimental campaign.

## Mission

Learn which organizational structures work under which conditions, **without turning noisy empirical
outcomes into semantic truth or authority**. Build: ExperimentDefinition → ArchitectureVariant →
repeated real runs → measurements → comparable run sets → Pareto/counterfactual evidence →
OrganizationMemory; then let Dynamics/Advisor read the memory but never gain mutation, commitment,
effect or epistemic authority from it.

## Firewalls

```
Telemetry ≠ SemanticTruth            ExperimentResult ≠ OrganizationTruth
ObservedAssociation ≠ Causation      BetterOnMetric ≠ GloballyBetter
HistoricalWinner ≠ FutureAuthority   OrganizationMemory ≠ PolicyAuthority
OrganizationMemory ≠ DynamicsProposal Evaluation ≠ Governance      Evaluation ≠ Activation
OneRun ≠ EvidenceOfGeneralBenefit    OneModel ≠ GeneralModelClass   OneScenario ≠ TaskDistribution
ScenarioPrompt ≠ GroundTruth         LLMJudge ≠ ObjectiveTruth
QualityMetric ≠ Authority            PerformanceMetric ≠ CompetenceGrant
No universal organization score · no global synergy score · no hidden weighted objective
```

## Required capability

- Immutable, versioned Experiment/Scenario/Variant artifacts; scenario classification disclosed.
- A metric schema with explicit availability (`known|unavailable|error`), never a `Record<string,number>`.
- Telemetry and validator PORTS (host-independent), so the evaluation core never depends on DSH internals.
- A single-locus baseline; federated and reasoning-cell variants referencing real system config.
- Repeated runs (`minRunsPerVariantPerScenario` in the RunPolicy, no hidden constant), seeded ordering,
  fresh run isolation, failures retained.
- OrganizationMemory: append-only empirical history; corrections additive; query surface
  (`experiments/runs/evaluations/similarRuns/structuralHistory`) with a deterministic metadata filter.
- Evaluation with distributions, paired comparisons and a Pareto set — never a forced winner.
- Read-only Dynamics/advisor integration; evolution governance still requires a fresh proposal,
  obligations, authority and activation even when memory shows a 10/10 winner.

## Prohibitions

No RL/auto architecture search/Bayesian optimizer/neural topology recommender. No universal score. No
embedding retrieval required. No fakes reintroduced (fake transport, recording attention, duplicate
cursor, second mailbox). No autonomous merge requirement.

## Exit criterion

Palimpsest can define reproducible organization experiments, run multiple isolated real-host trials
across explicit architecture variants, collect only observable or clearly classified measurements,
evaluate variants through distributions and Pareto comparisons rather than a universal score, retain
failures and uncertainty, and persist an append-only Organization Memory of structural choices and
observed outcomes that can inform—but never authorize—future organization changes.

PARTIAL if only one run per variant, no single-locus baseline, metrics silently missing as zero, one
LLM judge treated as truth, scenarios unversioned, run state leaks, a federated variant gets hidden
context, memory can mutate the organization, evaluation auto-generates/activates changes, a universal
score exists, or real cognitive experiments are replaced entirely with mocks.
STOP — SEMANTIC REBASE REQUIRED if empirical data must become canonical organization truth, evaluation
must grant evolution authority, variants cannot be compared without collapsing species, or run
isolation needs rewriting identity semantics.
