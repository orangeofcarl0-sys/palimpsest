/**
 * R3-L0C-I-A-R §1 — TYPES FOR THE CONTRACT AND THE FALSIFIERS.
 */

export interface CorrectionDefect {
  readonly id: string;
  readonly section: string;
  readonly gap: string;
  readonly baselineLocation: string;
  readonly property: string;
  readonly measuredBy: string;
}

export interface ContractSummary {
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly correctionDefects: number;
  readonly preTrialRequirements: number;
  readonly postMatrixConditions: number;
  readonly admissionControls: number;
  readonly authorizationDecisions: number;
  readonly outerBudgetMs: number;
  readonly innerBudgetMs: number;
  readonly modelCallsMade: number;
  readonly newline: string;
}

export const BASELINE_COMMIT: string;
export const STAGE_BRANCH: string;
export const STAGE_CODE_PATH: string;
export const STAGE_EVIDENCE_PATH: string;
export const REPO_ROOT: string;
export const PRIOR_EVIDENCE_PATHS: readonly string[];
export const SUPERSEDED_STAGE: Readonly<Record<string, unknown>>;
export const CORRECTION_DEFECTS: readonly CorrectionDefect[];
export const CONDITION_SUCCESS: Readonly<Record<string, { readonly pass: readonly string[]; readonly fail: readonly string[] }>>;
export const CONDITION_VOCABULARY: readonly string[];
export const PRE_TRIAL_REQUIREMENTS: readonly string[];
export const PRE_EXPOSURE_LAW: Readonly<Record<string, unknown>>;
export const ADMISSION_NEGATIVE_CONTROLS: readonly { readonly id: string; readonly detail: string; readonly requiredCause: string }[];
export const EXPECTED_TERMINAL_STATES: readonly string[];
export const ADMISSION_LAW: Readonly<Record<string, unknown>>;
export const UPTAKE_PROVENANCE: Readonly<Record<string, string>>;
export const OBSERVED_UPTAKE_STATES: readonly string[];
export const UPTAKE_LAW: Readonly<Record<string, unknown>>;
export const ARTIFACT_IDENTITY_FIELDS: readonly string[];
export const ARTIFACT_ATTRIBUTION_LAW: Readonly<Record<string, unknown>>;
export const INSTRUMENTATION_PROVENANCE: Readonly<Record<string, string>>;
export const RECONSTRUCTION_COST_FIELDS: readonly string[];
export const POST_MATRIX_CONDITIONS: readonly { readonly id: string; readonly detail: string }[];
export const INTERRUPTED_MATRIX_VERDICTS: Readonly<Record<string, unknown>>;
export const FROZEN_SCHEDULE_SHAPE: Readonly<Record<string, number>>;
export const VERDICT_COMPUTATION_LAW: Readonly<Record<string, unknown>>;
export const WORKER_EXECUTION_BUDGET_MS: number;
export const SETTLEMENT_INTERVAL_MS: number;
export const OUTER_BUDGET_MARGIN_MS: number;
export const GENERATION_CHILD_BUDGET_MS: number;
export const DESCENDANT_TERMINATION_LAW: Readonly<Record<string, unknown>>;
export const AUTHORIZATION_REQUIREMENTS: readonly { readonly id: string; readonly detail: string }[];
export const PAID_AUTHORIZATION_LAW: Readonly<Record<string, unknown>>;
export const COMMIT_STRUCTURE: readonly string[];
export const COMMIT_LAW: Readonly<Record<string, unknown>>;
export const FINAL_VERDICTS: Readonly<Record<string, readonly string[]>>;
export const INTERPRETATION_CLASSES: readonly string[];
export const STAGE_STOP: Readonly<Record<string, unknown>>;
export const NL: string;
export function contractSummary(): ContractSummary;
