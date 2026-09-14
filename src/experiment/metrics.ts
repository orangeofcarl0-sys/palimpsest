/**
 * G10-R experiment metrics — descriptive empirical statistics and PROXY helpers.
 *
 *   Telemetry ≠ SemanticTruth        BetterOnMetric ≠ GloballyBetter
 *   ObservedAssociation ≠ Causation  Proxy ≠ Truth
 *
 * This module is pure and dependency-free: it turns raw MetricObservation
 * samples into descriptive summaries and computes a Pareto frontier over an
 * explicit, user-selected objective set. It never invents a universal score
 * and never writes an unavailable observation as 0.
 *
 * PROXY helpers are labelled as such — they measure an observable correlate
 * (canonical JSON byte length), never the semantic quantity itself.
 */

import { canonicalJsonBytes } from "../schema/canonical.js";
import type {
  MeasurementClass,
  MetricDistribution,
  MetricObservation,
  ObjectiveName,
} from "../organization_memory/artifacts.js";

/* ------------------------------------------------------------------ *
 * summarize — descriptive summary of a numeric sample
 * ------------------------------------------------------------------ */

export interface NumericSummary {
  readonly count: number;
  readonly mean: number;
  readonly median: number;
  readonly min: number;
  readonly max: number;
  /**
   * Unbiased sample variance (n-1 denominator). Present only when
   * count >= 2; absent for a single observation.
   */
  readonly variance?: number | undefined;
  /**
   * p50 (equals median) and p90 (linear interpolation, R-7). Present only
   * when count >= 3.
   */
  readonly quantiles?: { readonly p50: number; readonly p90: number } | undefined;
}

function compareNumbers(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Linear-interpolation quantile (R-7 / numpy default) over a sorted array. */
function quantile(sorted: readonly number[], q: number): number {
  const length = sorted.length;
  if (length === 0) throw new RangeError("quantile requires at least one value");
  if (length === 1) return sorted[0]!;
  const position = (length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower]!;
  if (lower === upper) return lowerValue;
  const upperValue = sorted[upper]!;
  return lowerValue + (position - lower) * (upperValue - lowerValue);
}

/**
 * Summarize a numeric sample. Requires at least one value (a descriptive
 * summary of nothing is unavailable, never 0). All returned statistics are
 * descriptive of the observed sample only.
 */
export function summarize(values: readonly number[]): NumericSummary {
  const count = values.length;
  if (count === 0) throw new RangeError("summarize requires at least one value");
  const sorted = [...values].sort(compareNumbers);
  // Canonical JSON forbids non-integers, so every derived statistic is reported as a rounded
  // integer (units are chosen to be integers: ms, counts, 0..100 scores). `meanRaw` is kept for
  // the variance computation only.
  const meanRaw = values.reduce((acc, value) => acc + value, 0) / count;
  const mean = Math.round(meanRaw);
  const base = {
    count,
    mean,
    median: Math.round(quantile(sorted, 0.5)),
    min: sorted[0]!,
    max: sorted[count - 1]!,
  };
  const summary: {
    count: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    variance?: number | undefined;
    quantiles?: { readonly p50: number; readonly p90: number } | undefined;
  } = { ...base };
  if (count >= 2) {
    const squared = values.reduce((acc, value) => acc + (value - meanRaw) ** 2, 0);
    summary.variance = Math.round(squared / (count - 1));
  }
  if (count >= 3) {
    summary.quantiles = Object.freeze({ p50: Math.round(quantile(sorted, 0.5)), p90: Math.round(quantile(sorted, 0.9)) });
  }
  return Object.freeze(summary);
}

/* ------------------------------------------------------------------ *
 * distributionFor — one metric across a variant's observations
 * ------------------------------------------------------------------ */

/**
 * Build the distribution for one metric over a set of observations.
 *
 * `known` counts every known observation (numeric OR text); only known
 * observations that carry a numeric `value` contribute to the numeric
 * summary. Text-only known metrics are counted as known but never coerced
 * into a number. `unavailable` and `error` are counted, never inferred.
 */
export function distributionFor(input: {
  readonly metricId: string;
  readonly unit: string;
  readonly measurementClass: MeasurementClass;
  readonly observations: readonly MetricObservation[];
}): MetricDistribution {
  let known = 0;
  let unavailable = 0;
  let error = 0;
  const numeric: number[] = [];
  for (const observation of input.observations) {
    if (observation.state === "known") {
      known += 1;
      if (typeof observation.value === "number") numeric.push(observation.value);
    } else if (observation.state === "unavailable") {
      unavailable += 1;
    } else {
      error += 1;
    }
  }
  const base = {
    metricId: input.metricId,
    unit: input.unit,
    measurementClass: input.measurementClass,
    count: input.observations.length,
    known,
    unavailable,
    error,
  };
  if (numeric.length === 0) {
    // No numeric sample: mean/median/min/max/variance/quantiles are absent.
    return Object.freeze({ ...base });
  }
  const summary = summarize(numeric);
  const distribution: {
    metricId: string;
    unit: string;
    measurementClass: MeasurementClass;
    count: number;
    known: number;
    unavailable: number;
    error: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    variance?: number | undefined;
    quantiles?: { readonly p50: number; readonly p90: number } | undefined;
  } = {
    ...base,
    mean: summary.mean,
    median: summary.median,
    min: summary.min,
    max: summary.max,
    ...(summary.variance === undefined ? {} : { variance: summary.variance }),
    ...(summary.quantiles === undefined ? {} : { quantiles: summary.quantiles }),
  };
  return Object.freeze(distribution);
}

/* ------------------------------------------------------------------ *
 * Objective mapping — an explicit decision aid, not a universal score
 * ------------------------------------------------------------------ */

/** The canonical metric id used to observe each objective. */
export const OBJECTIVE_METRIC: Record<ObjectiveName, string> = Object.freeze({
  quality: "qualityScore",
  latency: "wallClockLatencyMs",
  cost: "modelCalls",
  coordinationCost: "coordinationProxyCalls",
  humanIntervention: "userInterventions",
  recovery: "recoveryMs",
});

/** Only quality is higher-is-better; every other objective is a cost. */
export const OBJECTIVE_HIGHER_IS_BETTER: Record<ObjectiveName, boolean> = Object.freeze({
  quality: true,
  latency: false,
  cost: false,
  coordinationCost: false,
  humanIntervention: false,
  recovery: false,
});

/* ------------------------------------------------------------------ *
 * paretoFrontier — non-dominated variants over a chosen objective set
 * ------------------------------------------------------------------ */

export interface FrontierVariant {
  readonly variantId: string;
  readonly objectives: Partial<Record<ObjectiveName, number>>;
}

function dominates(a: FrontierVariant, b: FrontierVariant, objectives: readonly ObjectiveName[]): boolean {
  let strictlyBetter = false;
  for (const objective of objectives) {
    const aValue = a.objectives[objective];
    const bValue = b.objectives[objective];
    // An objective missing on either side is skipped, never treated as better/worse.
    if (typeof aValue !== "number" || typeof bValue !== "number") continue;
    if (!Number.isFinite(aValue) || !Number.isFinite(bValue)) continue;
    const higherIsBetter = OBJECTIVE_HIGHER_IS_BETTER[objective];
    const aWorse = higherIsBetter ? aValue < bValue : aValue > bValue;
    if (aWorse) return false;
    const aStrictlyBetter = higherIsBetter ? aValue > bValue : aValue < bValue;
    if (aStrictlyBetter) strictlyBetter = true;
  }
  return strictlyBetter;
}

/**
 * Return the sorted variantIds that no other variant dominates. A variant is
 * on the frontier iff no other variant dominates it. With no comparable
 * objectives every variant is non-dominated (nothing can dominate it).
 */
export function paretoFrontier(input: {
  readonly variants: readonly FrontierVariant[];
  readonly objectives: readonly ObjectiveName[];
}): readonly string[] {
  const frontier: string[] = [];
  for (const candidate of input.variants) {
    const isDominated = input.variants.some(
      (other) => other.variantId !== candidate.variantId && dominates(other, candidate, input.objectives),
    );
    if (!isDominated) frontier.push(candidate.variantId);
  }
  return Object.freeze([...new Set(frontier)].sort());
}

/* ------------------------------------------------------------------ *
 * proxyBytes — PROXY byte length (not a semantic measure)
 * ------------------------------------------------------------------ */

/**
 * PROXY: the canonical-JSON UTF-8 byte length of *value*. This is an
 * observable correlate of traffic/artifact size, NOT a claim about meaning,
 * effort, or information content. `value` must be canonical-JSON encodable
 * (integers only; floats are rejected by the canonical contract).
 */
export function proxyBytes(value: unknown): number {
  return Buffer.byteLength(canonicalJsonBytes(value));
}
