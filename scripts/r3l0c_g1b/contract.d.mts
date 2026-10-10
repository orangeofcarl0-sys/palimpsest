/** R3-L0C-G1-B — TYPES FOR scripts/r3l0c_g1b/contract.mjs. */

export const BASELINE_COMMIT: string;
export const REPO_ROOT: string;
export const NL: string;
export const STAGE: string;
export const STAGE_BRANCH: string;

export const G1_COMMITS: readonly string[];
export const CORRECTIONS: readonly Readonly<{ id: string; requirement: string; baselineDefect: string; correction: string; invariant: string }>[];
export const INVOCATION_IDENTITY_OWNER: Readonly<Record<string, unknown>>;
export const INVOCATION_INVARIANTS: readonly string[];
export const LIFECYCLE_ORDER: readonly string[];
export const COMPLETE_LIFECYCLE_REQUIREMENTS: readonly string[];
export const JOURNAL_RECORD_SHAPE: Readonly<Record<string, unknown>>;
export const JOURNAL_VERIFICATION_REQUIREMENTS: readonly string[];
export const ORIGIN_LAYERS: readonly Readonly<{ layer: string; accepts: string; mayPromote: boolean }>[];
export const EVIDENCE_STATES: readonly string[];
export const EVIDENCE_STATE: Readonly<Record<string, string>>;
export const LOCATOR_OUTCOMES: Readonly<Record<string, string>>;
export const CANONICAL_ATTEMPT: Readonly<Record<string, unknown>>;
export const LOCAL_TRUST_MODEL: Readonly<Record<string, unknown>>;
export const FINAL_VERDICTS: readonly string[];
export const VERDICT_STATES: readonly string[];
export const UNEARNED_VERDICTS: readonly string[];
export const PROHIBITIONS: readonly string[];
export const ARCHIVED_PLAN_COMPATIBILITY: string;

export function contractSummary(): Readonly<Record<string, unknown>>;
