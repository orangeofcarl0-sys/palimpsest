/**
 * G10-S advisor empirical evidence — READ-ONLY collection over OrganizationMemory.
 *
 *   Evaluation ≠ Governance     ObservedAssociation ≠ Causation
 *   HistoricalWinner ≠ FutureAuthority   BetterOnMetric ≠ GloballyBetter
 *
 * This module reads experiment/scenario/variant definitions, run observations and
 * derived evaluations, and turns them into disclosed `EmpiricalSupport` records.
 * It owns NO store mutator, writes nothing, and never invents a universal score.
 * A planned metric that was never observed as known is reported as
 * INSUFFICIENT_EMPIRICAL_EVIDENCE, never as 0 and never as a tie.
 */

import type {
  OrganizationEvaluation,
  RunResult,
  VariantKind,
} from "../organization_memory/artifacts.js";
import type { OrganizationMemoryService } from "../organization_memory/service.js";
import {
  advisorEnum,
  advisorKeys,
  advisorNonNegInt,
  advisorObject,
  advisorString,
  advisorStringArray,
} from "./strict.js";

export const EMPIRICAL_BASES = ["LIMITED_EMPIRICAL_BASIS", "SUFFICIENT_EMPIRICAL_BASIS"] as const;
export type EmpiricalBasis = (typeof EMPIRICAL_BASES)[number];

/** Marker token for "a planned metric was never observed as known" (never 0, never a tie). */
export const INSUFFICIENT_EMPIRICAL_EVIDENCE = "INSUFFICIENT_EMPIRICAL_EVIDENCE";

/** Variant kinds whose R evidence documents a trade-off, not a universal win. */
export const MULTI_ACTOR_VARIANT_KINDS: readonly VariantKind[] = Object.freeze([
  "ARTIFICIAL_ROLE_SPLIT",
  "FEDERATED_PEERS",
  "REASONING_CELL",
]);

const MULTI_ACTOR = new Set<string>(MULTI_ACTOR_VARIANT_KINDS);

/** A disclosed empirical observation about one variant kind within one evaluation. */
export interface EmpiricalSupport {
  readonly experimentRef: string;
  readonly evaluationRef: string;
  readonly variantKind: string;
  readonly sampleCount: number;
  readonly scenarioClassification: string;
  readonly provider: string;
  readonly model: string;
  readonly observedMetrics: readonly string[];
  readonly limitations: readonly string[];
  readonly transferabilityNotes: readonly string[];
  readonly basis: EmpiricalBasis;
}

const EMPIRICAL_SUPPORT_KEYS = [
  "experimentRef",
  "evaluationRef",
  "variantKind",
  "sampleCount",
  "scenarioClassification",
  "provider",
  "model",
  "observedMetrics",
  "limitations",
  "transferabilityNotes",
  "basis",
] as const;

export function parseEmpiricalSupport(raw: unknown, what = "EmpiricalSupport"): EmpiricalSupport {
  const object = advisorObject(raw, what);
  advisorKeys(object, EMPIRICAL_SUPPORT_KEYS, EMPIRICAL_SUPPORT_KEYS, what);
  return Object.freeze({
    experimentRef: advisorString(object.experimentRef, `${what}.experimentRef`),
    evaluationRef: advisorString(object.evaluationRef, `${what}.evaluationRef`),
    variantKind: advisorString(object.variantKind, `${what}.variantKind`),
    sampleCount: advisorNonNegInt(object.sampleCount, `${what}.sampleCount`),
    scenarioClassification: advisorString(object.scenarioClassification, `${what}.scenarioClassification`),
    provider: advisorString(object.provider, `${what}.provider`),
    model: advisorString(object.model, `${what}.model`),
    observedMetrics: advisorStringArray(object.observedMetrics, `${what}.observedMetrics`),
    limitations: advisorStringArray(object.limitations, `${what}.limitations`),
    transferabilityNotes: advisorStringArray(object.transferabilityNotes, `${what}.transferabilityNotes`),
    basis: advisorEnum(object.basis, EMPIRICAL_BASES, `${what}.basis`),
  });
}

export interface EmpiricalSupportQuery {
  readonly variantKind?: string | undefined;
}

export interface EmpiricalSupportCollection {
  readonly supports: readonly EmpiricalSupport[];
  readonly counterEvidence: readonly EmpiricalSupport[];
  readonly unavailableEvidence: readonly string[];
}

function singleOrMixed(values: readonly string[]): string {
  if (values.length === 0) return "UNKNOWN";
  const unique = [...new Set(values)].sort();
  return unique.length === 1 ? unique[0]! : "MIXED";
}

function classificationOf(runs: readonly RunResult[]): string {
  return singleOrMixed(runs.map((run) => run.provenance.scenarioClassification));
}

function providerOf(runs: readonly RunResult[]): string {
  return singleOrMixed(runs.map((run) => run.provenance.provider));
}

function modelOf(runs: readonly RunResult[]): string {
  return singleOrMixed(runs.map((run) => run.provenance.model));
}

function knownMetricIds(runs: readonly RunResult[]): readonly string[] {
  const ids = new Set<string>();
  for (const run of runs) {
    for (const measurement of run.measurements) {
      if (measurement.state === "known") ids.add(measurement.metricId);
    }
  }
  return Object.freeze([...ids].sort());
}

function transferabilityNotes(kind: string, sampleCount: number, providers: readonly string[], observedMetrics: readonly string[]): readonly string[] {
  const notes: string[] = [];
  if (sampleCount < 5) notes.push("small_sample");
  if (providers.length > 1) notes.push("mixed_providers");
  if (providers.length <= 1) notes.push("single_provider");
  if (kind === "ARTIFICIAL_ROLE_SPLIT") notes.push("avoid_fake_durable_boundaries");
  if (kind === "FEDERATED_PEERS") notes.push("non_dominated_trade_off");
  if (kind === "REASONING_CELL") {
    notes.push("higher_verification_coordination_overhead");
    if (!observedMetrics.includes("qualityScore")) notes.push("quality_transfer_unknown");
  }
  return Object.freeze([...new Set(notes)].sort());
}

function basisFor(sampleCount: number, providers: readonly string[], models: readonly string[]): EmpiricalBasis {
  // Sufficiency is deliberately conservative: enough samples AND more than one
  // provider/model. Current R evidence (small n, single provider) is LIMITED.
  return sampleCount >= 5 && providers.length >= 2 && models.length >= 2 ? "SUFFICIENT_EMPIRICAL_BASIS" : "LIMITED_EMPIRICAL_BASIS";
}

/**
 * Read-only collection of empirical support. Every matching (evaluation, variant)
 * pair becomes one support record; multi-actor variants are additionally surfaced
 * as counter-evidence because R measured them as trade-offs, not universal wins.
 */
export async function collectEmpiricalSupport(
  memory: OrganizationMemoryService,
  query: EmpiricalSupportQuery = {},
): Promise<EmpiricalSupportCollection> {
  const supports: EmpiricalSupport[] = [];
  const counterEvidence: EmpiricalSupport[] = [];
  const unavailableEvidence: string[] = [];

  const experiments = await memory.experiments();
  for (const experiment of experiments) {
    const [runs, evaluations, variants] = await Promise.all([
      memory.runs(experiment.experimentId),
      memory.evaluations(experiment.experimentId),
      memory.variants(experiment.experimentId),
    ]);

    // A planned metric never observed as known is unavailable, never 0 / a tie.
    const known = new Set<string>();
    for (const run of runs) {
      for (const measurement of run.measurements) {
        if (measurement.state === "known") known.add(measurement.metricId);
      }
    }
    for (const metricId of experiment.measurementPlan.metricIds) {
      if (!known.has(metricId)) {
        unavailableEvidence.push(`${INSUFFICIENT_EMPIRICAL_EVIDENCE}:${experiment.experimentId}:${metricId}`);
      }
    }

    const kindByVariant = new Map<string, VariantKind>();
    for (const variant of variants) kindByVariant.set(variant.variantId, variant.kind);
    const runsByVariant = new Map<string, RunResult[]>();
    for (const run of runs) {
      const bucket = runsByVariant.get(run.variantRef.variantId);
      if (bucket === undefined) runsByVariant.set(run.variantRef.variantId, [run]);
      else bucket.push(run);
    }

    for (const evaluation of evaluations as readonly OrganizationEvaluation[]) {
      for (const stat of evaluation.variantStats) {
        const kind = kindByVariant.get(stat.variantId);
        if (kind === undefined) continue;
        if (query.variantKind !== undefined && kind !== query.variantKind) continue;
        const variantRuns = runsByVariant.get(stat.variantId) ?? [];
        const providers = [...new Set(variantRuns.map((run) => run.provenance.provider))].sort();
        const models = [...new Set(variantRuns.map((run) => run.provenance.model))].sort();
        const observed = knownMetricIds(variantRuns);
        const support: EmpiricalSupport = Object.freeze({
          experimentRef: experiment.experimentId,
          evaluationRef: evaluation.evaluationRef,
          variantKind: kind,
          sampleCount: stat.runs,
          scenarioClassification: classificationOf(variantRuns),
          provider: providerOf(variantRuns),
          model: modelOf(variantRuns),
          observedMetrics: observed,
          limitations: Object.freeze([...evaluation.limitations]),
          transferabilityNotes: transferabilityNotes(kind, stat.runs, providers, observed),
          basis: basisFor(stat.runs, providers, models),
        });
        supports.push(support);
        if (MULTI_ACTOR.has(kind)) counterEvidence.push(support);
      }
    }
  }

  return Object.freeze({
    supports: Object.freeze(supports),
    counterEvidence: Object.freeze(counterEvidence),
    unavailableEvidence: Object.freeze([...new Set(unavailableEvidence)].sort()),
  });
}

/**
 * The faithful plain-language reading of one R observation. It encodes the
 * anti-claim: an artificial role split is evidence to AVOID fake durable
 * boundaries (not "multi-agent is bad"); federation is a NON-DOMINATED trade-off
 * (not "federation always wins"); a reasoning cell lowers unresolvedness at a
 * higher verification/coordination cost with UNKNOWN quality transfer (not
 * "reasoning cell is worse").
 */
export function interpretREvidence(support: EmpiricalSupport): readonly string[] {
  switch (support.variantKind) {
    case "ARTIFICIAL_ROLE_SPLIT":
      return Object.freeze([
        "An artificial same-context role split added latency, tokens and coordination at equal measured quality; read this as avoiding fake durable boundaries, not as multi-agent being bad.",
      ]);
    case "FEDERATED_PEERS":
      return Object.freeze([
        "Federation sat on the non-dominated frontier rather than winning outright; read this as a reasonable trade-off, not as federation always winning.",
      ]);
    case "REASONING_CELL":
      return Object.freeze([
        "The reasoning cell lowered unresolvedness but carried higher verification and coordination overhead; quality transfer is unknown, so read this as a trade-off, not as the reasoning cell being worse.",
      ]);
    case "SINGLE_LOCUS":
      return Object.freeze([
        "The single-locus baseline is the comparison point; it is not a universal winner either.",
      ]);
    default:
      return Object.freeze([
        "This observation is a descriptive association over a small sample; it is neither causal nor globally decisive.",
      ]);
  }
}
