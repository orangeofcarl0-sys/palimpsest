/**
 * R3-L0C-I-A-R-L-C-F §0-§12 — TYPES FOR THE MEASUREMENT-FIDELITY CONTRACT.
 */

export interface MeasurementGap {
  readonly id: string;
  readonly section: string;
  readonly gap: string;
  readonly baselineLocation: string;
  readonly measured: string;
  readonly property: string;
  readonly authoritativePath: string;
}

export interface ContractSummary {
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly gaps: number;
  readonly durableConditions: number;
  readonly costCompletenessLevels: number;
  readonly causalPrerequisites: number;
  readonly budgetConcepts: number;
  readonly verdicts: number;
  readonly readinessStatements: number;
  readonly modelCallsMade: number;
  readonly newline: string;
}

export const BASELINE_COMMIT: string;
export const STAGE_BRANCH: string;
export const STAGE_CODE_PATH: string;
export const STAGE_EVIDENCE_PATH: string;
export const REPO_ROOT: string;
export const SUPERSEDED_STAGE: Readonly<Record<string, string>>;
export const PRIOR_EVIDENCE_PATHS: readonly string[];
export const MEASUREMENT_GAPS: readonly MeasurementGap[];
export const MEASUREMENT_GAP_IDS: readonly string[];
export const FRESHNESS_BASIS: Readonly<Record<string, string>>;
export const FRESHNESS_FIELDS: readonly string[];
export const ATTEMPT_ID: Readonly<Record<string, unknown>>;
export const ARTIFACT_DISCOVERY_OUTCOMES: readonly { readonly id: string; readonly discovered: boolean; readonly ambiguous: boolean; readonly detail: string }[];
export const EXECUTION_WITNESS: Readonly<Record<string, unknown>>;
export const ARTIFACT_PROVENANCE_UNPROVEN: Readonly<Record<string, string>>;
export const DURABLE_RECONCILIATION_CONDITIONS: readonly { readonly id: string; readonly detail: string }[];
export const COST_COMPLETENESS_LEVELS: readonly { readonly id: string; readonly detail: string }[];
export const CAUSAL_PREREQUISITES: readonly string[];
export const BUDGET_CONCEPTS: readonly { readonly id: string; readonly detail: string }[];
export const PLAN_DIGEST_COVERAGE: readonly string[];
export const PLAN_DIGEST_SELF_FIELD: string;
export const COMPILER_CACHE_INPUTS: readonly string[];
export const PRESERVED_DESIGN: Readonly<Record<string, unknown>>;
export const FINAL_VERDICTS: Readonly<Record<string, readonly string[]>>;
export const UNEARNED_VERDICTS: Readonly<Record<string, unknown>>;
export const READINESS_STATEMENTS: readonly { readonly id: string; readonly detail: string }[];
export const COMMIT_STRUCTURE: readonly string[];
export const COMMIT_LAW: Readonly<Record<string, unknown>>;
export const STAGE_STOP: Readonly<Record<string, unknown>>;
export const NL: string;

export function contractSummary(): ContractSummary;
