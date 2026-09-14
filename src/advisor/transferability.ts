/**
 * G10-S advisor transferability — DETERMINISTIC metadata comparison only.
 *
 *   SameNumber ≠ Transferable      ScenarioMatch ≠ Validity
 *
 * Assesses whether an observed evaluation transfers to the current task by
 * comparing categorical task features and model/provider metadata. There are NO
 * embeddings and NO learned retrieval here: only declared feature equality and
 * provenance strings. Unknown dimensions and a small sample always downgrade
 * confidence rather than silently passing.
 */

import type { ScenarioFeatureAnnotation } from "../organization_memory/artifacts.js";
import { TASK_FEATURE_NAMES } from "../organization_memory/artifacts.js";
import type { TaskProfile } from "./task_profile.js";

export interface TransferabilityEvaluation {
  readonly provider: string;
  readonly model: string;
  readonly sampleSize: number;
}

export interface AssessTransferabilityInput {
  readonly currentProfile: TaskProfile;
  readonly annotation?: ScenarioFeatureAnnotation | undefined;
  readonly evaluation: TransferabilityEvaluation;
  readonly currentProvider?: string | undefined;
  readonly currentModel?: string | undefined;
}

export interface TransferabilityAssessment {
  readonly featureMatches: readonly string[];
  readonly mismatches: readonly string[];
  readonly unknownDimensions: readonly string[];
  readonly modelProviderMatch: boolean;
  readonly sampleCount: number;
  readonly warnings: readonly string[];
}

/** Canonical warning order (deterministic output). */
export const TRANSFERABILITY_WARNING_ORDER: readonly string[] = Object.freeze([
  "out_of_distribution",
  "low_transferability",
  "LIMITED_EMPIRICAL_BASIS",
]);

function valueOf(profile: TaskProfile, feature: string): string {
  const entry = profile.features.find((candidate) => candidate.feature === feature);
  return entry === undefined ? "UNKNOWN" : entry.value;
}

export function assessTransferability(input: AssessTransferabilityInput): TransferabilityAssessment {
  const featureMatches: string[] = [];
  const mismatches: string[] = [];
  const unknownDimensions: string[] = [];

  if (input.annotation === undefined) {
    // No annotation means no comparison basis: every dimension is unknown, never matched.
    for (const feature of TASK_FEATURE_NAMES) unknownDimensions.push(feature);
  } else {
    for (const feature of TASK_FEATURE_NAMES) {
      const current = valueOf(input.currentProfile, feature);
      const observed = valueOf(input.annotation.taskProfile, feature);
      if (current === "UNKNOWN" || observed === "UNKNOWN") unknownDimensions.push(feature);
      else if (current === observed) featureMatches.push(feature);
      else mismatches.push(feature);
    }
  }

  const modelProviderMatch =
    input.currentProvider !== undefined &&
    input.currentModel !== undefined &&
    input.evaluation.provider === input.currentProvider &&
    input.evaluation.model === input.currentModel;

  const manyUnknown = unknownDimensions.length * 2 >= TASK_FEATURE_NAMES.length;
  const warnings = new Set<string>();
  if (!modelProviderMatch) {
    warnings.add("out_of_distribution");
    warnings.add("low_transferability");
  }
  if (mismatches.length > 0 || manyUnknown) warnings.add("low_transferability");
  if (input.evaluation.sampleSize < 5) warnings.add("LIMITED_EMPIRICAL_BASIS");

  return Object.freeze({
    featureMatches: Object.freeze(featureMatches),
    mismatches: Object.freeze(mismatches),
    unknownDimensions: Object.freeze(unknownDimensions),
    modelProviderMatch,
    sampleCount: input.evaluation.sampleSize,
    warnings: Object.freeze(TRANSFERABILITY_WARNING_ORDER.filter((warning) => warnings.has(warning))),
  });
}
