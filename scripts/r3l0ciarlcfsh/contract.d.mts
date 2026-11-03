/**
 * R3-L0C-I-A-R-L-C-F-S-H §0 — TYPES FOR THE FROZEN STAGE CONTRACT.
 */

export const NL: string;
export const BASELINE_COMMIT: string;
export const STAGE_BRANCH: string;
export const STAGE_CODE_PATH: string;
export const STAGE_EVIDENCE_PATH: string;
export const PLAN_ID: string;
export const REPO_ROOT: string;

export const SUPERSEDED_STAGE: Record<string, string>;
export const PROTECTED_NAMESPACES: readonly string[];

export const BASELINE_DEFECTS: readonly any[];
export const BASELINE_DEFECT_IDS: readonly string[];

export const VALIDATED_COST_CHAIN: readonly string[];
export const COST_COMPLETENESS_LEVELS: readonly any[];
export const INVALID_MEASUREMENT_STATES: readonly string[];

export const CLEANUP_OUTCOMES: Record<string, string>;
export const CLEANUP_SAFETY_STEPS: readonly string[];
export const OWNERSHIP_WITNESSES: readonly any[];
export const CLEANUP_THREAT_MODEL: Record<string, unknown>;

export const SEAL_PHASES: Record<string, any>;
export const SEAL_REQUIRED_FIELDS: readonly string[];
export const SEAL_SELF_FIELD: string;

export const RUNNER_MUTATION_FIELDS: readonly string[];
export const RUNNER_FALSIFIER_ASSERTIONS: readonly string[];

export const QUALIFICATION_CONDITIONS: readonly any[];
export const QUALIFICATION_VERDICTS: readonly string[];

export const PRESERVED_DESIGN: Record<string, unknown>;

export const FINAL_VERDICTS: Record<string, readonly string[]>;
export const UNEARNED_VERDICTS: Record<string, unknown>;
export const COMPLETION_CLASSIFICATIONS: readonly any[];
export const LEGACY_HELPER_QUARANTINE: Record<string, unknown>;

export const COMMIT_STRUCTURE: readonly string[];
export const COMMIT_LAW: Record<string, boolean>;
export const STAGE_STOP: Record<string, unknown>;

export function contractSummary(): Record<string, unknown>;
