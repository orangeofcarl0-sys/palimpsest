/**
 * G10-R evaluate — derive an OrganizationEvaluation from observed runs.
 *
 *   ExperimentResult ≠ OrganizationTruth   Evaluation ≠ Governance
 *   BetterOnMetric ≠ GloballyBetter        ObservedAssociation ≠ Causation
 *
 * Evaluation is a read model over immutable empirical history. It applies the
 * comparability firewall before computing anything: runs that do not reference
 * the same experiment, or whose scenario/variant observation digest disagrees
 * with the experiment's frozen refs, are rejected outright (R-N06/R-N07).
 * Warmup runs are excluded from statistics and disclosed in `warnings`.
 *
 * The result carries only associations over the observed sample. It is never a
 * universal score and never a policy.
 */

import {
  OM_EXPERIMENT_DOMAIN,
  materializeEvaluation,
  refDigest,
  unavailableMetric,
} from "../organization_memory/artifacts.js";
import type {
  Dominance,
  ExperimentDefinition,
  FailureClassification,
  MeasurementClass,
  MetricObservation,
  ObjectiveName,
  OrganizationEvaluation,
  PairwiseComparison,
  RunResult,
  ScenarioDefinition,
  VariantStats,
} from "../organization_memory/artifacts.js";
import {
  OBJECTIVE_METRIC,
  distributionFor,
  paretoFrontier,
  summarize,
} from "./metrics.js";

export type EvaluationErrorKind =
  | "experiment_mismatch"
  | "scenario_revision_mismatch"
  | "variant_mismatch";

export class EvaluationError extends Error {
  constructor(
    readonly kind: EvaluationErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "EvaluationError";
  }
}

export interface EvaluateInput {
  readonly experiment: ExperimentDefinition;
  readonly runs: readonly RunResult[];
  readonly limitations?: readonly string[] | undefined;
  readonly scenarios?: readonly ScenarioDefinition[] | undefined;
}

/* ------------------------------------------------------------------ *
 * Deterministic helpers
 * ------------------------------------------------------------------ */

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function medianOf(values: readonly number[]): number | undefined {
  return values.length === 0 ? undefined : summarize(values).median;
}

/** Numeric known values for one metric across a set of runs. */
function numericValuesFor(runs: readonly RunResult[], metricId: string): number[] {
  const values: number[] = [];
  for (const run of runs) {
    for (const measurement of run.measurements) {
      if (measurement.metricId === metricId && measurement.state === "known" && typeof measurement.value === "number") {
        values.push(measurement.value);
      }
    }
  }
  return values;
}

/** The first numeric known value for one metric in one run, if present. */
function runNumeric(run: RunResult, metricId: string): number | undefined {
  for (const measurement of run.measurements) {
    if (measurement.metricId === metricId && measurement.state === "known" && typeof measurement.value === "number") {
      return measurement.value;
    }
  }
  return undefined;
}

function orderIndexMap(runs: readonly RunResult[]): Map<number, RunResult> {
  const byIndex = new Map<number, RunResult>();
  for (const run of runs) {
    if (!byIndex.has(run.provenance.orderIndex)) byIndex.set(run.provenance.orderIndex, run);
  }
  return byIndex;
}

function hasSharedObserved(
  a: Partial<Record<ObjectiveName, number>>,
  b: Partial<Record<ObjectiveName, number>>,
  objectives: readonly ObjectiveName[],
): boolean {
  return objectives.some((objective) => typeof a[objective] === "number" && typeof b[objective] === "number");
}

/* ------------------------------------------------------------------ *
 * evaluate
 * ------------------------------------------------------------------ */

export function evaluate(input: EvaluateInput): OrganizationEvaluation {
  const { experiment, runs } = input;
  const objectives = experiment.measurementPlan.objectives;
  const metricIds = experiment.measurementPlan.metricIds;

  /* --- comparability firewall ------------------------------------- */

  for (const run of runs) {
    if (run.experimentRef !== experiment.experimentId) {
      throw new EvaluationError(
        "experiment_mismatch",
        `run ${run.runRef} references experiment ${run.experimentRef}, expected ${experiment.experimentId}`,
      );
    }
  }

  const scenarioDigestByKey = new Map<string, string>();
  for (const ref of experiment.scenarioRefs) {
    scenarioDigestByKey.set(`${ref.scenarioId}\u0000${ref.scenarioRevision}`, ref.digest);
  }
  const variantDigestById = new Map<string, string>();
  for (const ref of experiment.variantRefs) {
    variantDigestById.set(ref.variantId, ref.digest);
  }

  for (const run of runs) {
    const scenarioKey = `${run.scenarioRef.scenarioId}\u0000${run.scenarioRef.scenarioRevision}`;
    const expectedScenarioDigest = scenarioDigestByKey.get(scenarioKey);
    if (expectedScenarioDigest === undefined || run.provenance.scenarioDigest !== expectedScenarioDigest) {
      throw new EvaluationError(
        "scenario_revision_mismatch",
        `run ${run.runRef} scenario ${run.scenarioRef.scenarioId}@${run.scenarioRef.scenarioRevision} is not comparable with experiment ${experiment.experimentId}`,
      );
    }
    const expectedVariantDigest = variantDigestById.get(run.variantRef.variantId);
    if (expectedVariantDigest === undefined || run.provenance.variantDigest !== expectedVariantDigest) {
      throw new EvaluationError(
        "variant_mismatch",
        `run ${run.runRef} variant ${run.variantRef.variantId} is not comparable with experiment ${experiment.experimentId}`,
      );
    }
  }

  /* --- warmup partition ------------------------------------------- */

  const scoredRuns = runs.filter((run) => run.provenance.warmup !== true);
  const warmupDropped = runs.length - scoredRuns.length;

  const variantIds = [...new Set(experiment.variantRefs.map((ref) => ref.variantId))].sort(compareStrings);
  const scenarioRefs = [...experiment.scenarioRefs].sort(
    (a, b) => compareStrings(a.scenarioId, b.scenarioId) || a.scenarioRevision - b.scenarioRevision,
  );

  /* --- metric metadata -------------------------------------------- */

  const metricUnit = new Map<string, string>();
  const metricClass = new Map<string, MeasurementClass>();
  for (const run of scoredRuns) {
    for (const measurement of run.measurements) {
      if (!metricUnit.has(measurement.metricId)) {
        metricUnit.set(measurement.metricId, measurement.unit);
        metricClass.set(measurement.metricId, measurement.measurementClass);
      }
    }
  }
  const unitFor = (metricId: string): string => metricUnit.get(metricId) ?? "unknown";
  const classFor = (metricId: string): MeasurementClass => metricClass.get(metricId) ?? "UNAVAILABLE";

  /* --- per-variant statistics ------------------------------------- */

  const runsByVariant = new Map<string, RunResult[]>();
  for (const variantId of variantIds) runsByVariant.set(variantId, []);
  for (const run of scoredRuns) {
    const bucket = runsByVariant.get(run.variantRef.variantId);
    if (bucket !== undefined) bucket.push(run);
  }

  const variantStats: VariantStats[] = variantIds.map((variantId) => {
    const variantRuns = runsByVariant.get(variantId) ?? [];
    const outcomes = { pass: 0, fail: 0, unresolved: 0, error: 0 };
    const failureCounts = new Map<FailureClassification, number>();
    for (const run of variantRuns) {
      if (run.outcome === "PASS") outcomes.pass += 1;
      else if (run.outcome === "FAIL") outcomes.fail += 1;
      else if (run.outcome === "UNRESOLVED") outcomes.unresolved += 1;
      else outcomes.error += 1;
      if (run.failureClassification !== "NONE") {
        failureCounts.set(run.failureClassification, (failureCounts.get(run.failureClassification) ?? 0) + 1);
      }
    }
    const failureClassifications = [...failureCounts.entries()]
      .map(([classification, count]) => ({ classification, count }))
      .sort((a, b) => b.count - a.count || compareStrings(a.classification, b.classification));

    const distributions = metricIds.map((metricId) => {
      const observations: MetricObservation[] = [];
      for (const run of variantRuns) {
        const found = run.measurements.find((measurement) => measurement.metricId === metricId);
        if (found !== undefined) {
          observations.push(found);
        } else {
          observations.push(
            unavailableMetric({
              metricId,
              unit: unitFor(metricId),
              detail: "not measured",
              provenance: run.runRef,
            }),
          );
        }
      }
      return distributionFor({
        metricId,
        unit: unitFor(metricId),
        measurementClass: classFor(metricId),
        observations,
      });
    });

    return Object.freeze({
      variantId,
      runs: variantRuns.length,
      outcomes: Object.freeze({ ...outcomes }),
      failureClassifications: Object.freeze(failureClassifications),
      distributions: Object.freeze(distributions),
    });
  });

  /* --- per-variant objective medians ------------------------------ */

  const objectiveMedians = new Map<string, Partial<Record<ObjectiveName, number>>>();
  for (const variantId of variantIds) {
    const variantRuns = runsByVariant.get(variantId) ?? [];
    const medians: Partial<Record<ObjectiveName, number>> = {};
    for (const objective of objectives) {
      const median = medianOf(numericValuesFor(variantRuns, OBJECTIVE_METRIC[objective]));
      if (median !== undefined) medians[objective] = median;
    }
    objectiveMedians.set(variantId, medians);
  }

  /* --- pairwise comparisons --------------------------------------- */

  const pairwise: PairwiseComparison[] = [];
  for (let aIndex = 0; aIndex < variantIds.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < variantIds.length; bIndex += 1) {
      const variantA = variantIds[aIndex]!;
      const variantB = variantIds[bIndex]!;
      const aObjectives = objectiveMedians.get(variantA) ?? {};
      const bObjectives = objectiveMedians.get(variantB) ?? {};
      for (const scenario of scenarioRefs) {
        const aRuns = (runsByVariant.get(variantA) ?? []).filter(
          (run) => run.scenarioRef.scenarioId === scenario.scenarioId && run.scenarioRef.scenarioRevision === scenario.scenarioRevision,
        );
        const bRuns = (runsByVariant.get(variantB) ?? []).filter(
          (run) => run.scenarioRef.scenarioId === scenario.scenarioId && run.scenarioRef.scenarioRevision === scenario.scenarioRevision,
        );
        const aByIndex = orderIndexMap(aRuns);
        const bByIndex = orderIndexMap(bRuns);
        const pairedIndices = [...aByIndex.keys()].filter((index) => bByIndex.has(index)).sort((a, b) => a - b);

        const metricDeltas: {
          metricId: string;
          aMedian?: number | undefined;
          bMedian?: number | undefined;
          delta?: number | undefined;
          note: string;
        }[] = [];
        for (const metricId of metricIds) {
          const aValues: number[] = [];
          const bValues: number[] = [];
          for (const index of pairedIndices) {
            const aValue = runNumeric(aByIndex.get(index)!, metricId);
            const bValue = runNumeric(bByIndex.get(index)!, metricId);
            if (aValue !== undefined && bValue !== undefined) {
              aValues.push(aValue);
              bValues.push(bValue);
            }
          }
          const aMedian = medianOf(aValues);
          const bMedian = medianOf(bValues);
          if (aMedian === undefined || bMedian === undefined) continue;
          metricDeltas.push({ metricId, aMedian, bMedian, delta: aMedian - bMedian, note: "paired_median_delta" });
        }

        let dominated: Dominance;
        if (!hasSharedObserved(aObjectives, bObjectives, objectives)) {
          dominated = "unknown";
        } else {
          const frontier = paretoFrontier({
            variants: [
              { variantId: variantA, objectives: aObjectives },
              { variantId: variantB, objectives: bObjectives },
            ],
            objectives,
          });
          const aSurvives = frontier.includes(variantA);
          const bSurvives = frontier.includes(variantB);
          dominated = aSurvives && bSurvives ? "neither" : aSurvives ? "A" : bSurvives ? "B" : "neither";
        }

        pairwise.push(
          Object.freeze({
            variantA,
            variantB,
            scenarioId: scenario.scenarioId,
            scenarioRevision: scenario.scenarioRevision,
            pairedRuns: pairedIndices.length,
            metricDeltas: Object.freeze(metricDeltas),
            dominated,
          }),
        );
      }
    }
  }

  /* --- pareto frontier over the explicit objective set ------------ */

  const pareto = Object.freeze({
    objectives: Object.freeze([...objectives]),
    frontier: paretoFrontier({
      variants: variantIds.map((variantId) => ({ variantId, objectives: objectiveMedians.get(variantId) ?? {} })),
      objectives,
    }),
  });

  /* --- sample size ------------------------------------------------ */

  const runCounts = variantIds.map((variantId) => (runsByVariant.get(variantId) ?? []).length);
  const sampleSize = Object.freeze({
    min: runCounts.length === 0 ? 0 : Math.min(...runCounts),
    max: runCounts.length === 0 ? 0 : Math.max(...runCounts),
  });

  /* --- warnings --------------------------------------------------- */

  const warnings: string[] = [];
  if (variantIds.some((variantId) => (runsByVariant.get(variantId) ?? []).length < experiment.runPolicy.minRunsPerVariantPerScenario)) {
    warnings.push("fewer_than_min_runs");
  }

  const knownMetricIds = new Set<string>();
  for (const run of scoredRuns) {
    for (const measurement of run.measurements) {
      if (measurement.state === "known") knownMetricIds.add(measurement.metricId);
    }
  }
  for (const metricId of metricIds) {
    if (!knownMetricIds.has(metricId)) warnings.push(`unavailable_metric:${metricId}`);
  }

  if (input.scenarios !== undefined) {
    const scenarioByDigest = new Map(input.scenarios.map((scenario) => [scenario.digest, scenario]));
    const scaffolded = experiment.scenarioRefs.some((ref) => {
      const scenario = scenarioByDigest.get(ref.digest);
      return scenario !== undefined && (scenario.classification === "SCAFFOLDED" || scenario.classification === "SCRIPTED_MECHANICAL");
    });
    if (scaffolded) warnings.push("scaffolded_scenario");
  }

  if (warmupDropped > 0) warnings.push("warmup_runs_excluded");

  /* --- limitations ------------------------------------------------ */

  const limitations = [
    ...new Set([...(input.limitations ?? []), "observed_association_not_causation", "no_universal_score"]),
  ];

  /* --- derived artifact ------------------------------------------- */

  // The empirical reference is the stable experiment id; the exact content is bound separately by
  // `experimentDigest`, so a mutable ref can never stand in for content identity.
  const experimentRef = experiment.experimentId;

  return materializeEvaluation({
    experimentRef,
    experimentDigest: experiment.digest,
    variantStats: Object.freeze(variantStats),
    pairwise: Object.freeze(pairwise),
    pareto,
    sampleSize,
    limitations: Object.freeze(limitations),
    warnings: Object.freeze(warnings),
  });
}
