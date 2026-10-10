/**
 * R3-L0C-I-A-R-L-C-F-S §0-§12 — TYPES FOR THE EVIDENCE-SEAL CONTRACT.
 */

export interface EvidenceGap {
  readonly id: string;
  readonly section: string;
  readonly gap: string;
  readonly baselineLocation: string;
  readonly measured: string;
  readonly property: string;
  readonly authoritativePath: string;
}

export interface NamedEntry {
  readonly id: string;
  readonly detail: string;
}

export interface TrialIdentityField {
  readonly field: string;
  readonly included: boolean;
  readonly loadBearing: boolean;
  readonly rationale: string;
}

export interface AuthorizationCondition {
  readonly id: string;
  readonly mandatory: boolean;
  readonly detail: string;
}

export const BASELINE_COMMIT: string;
export const STAGE_BRANCH: string;
export const STAGE_CODE_PATH: string;
export const STAGE_EVIDENCE_PATH: string;
export const PLAN_ID: string;
export const REPO_ROOT: string;

export const SUPERSEDED_STAGE: {
  readonly stage: string;
  readonly commit: string;
  readonly planId: string;
  readonly planPath: string;
  readonly codePath: string;
  readonly pipeline: string;
  readonly disposition: string;
};

export const PROTECTED_NAMESPACES: readonly string[];
export const EVIDENCE_GAPS: readonly EvidenceGap[];
export const EVIDENCE_GAP_IDS: readonly string[];
export const PLAN_IDENTITY_CHECKS: readonly NamedEntry[];
export const PLAN_OPERATIONS: readonly { readonly id: string; readonly writesEvidence: boolean; readonly detail: string }[];

export const CLEANUP_OUTCOMES: { readonly CLEANED: string; readonly CLEANUP_BLOCKED: string; readonly REFUSED_NOT_OWNED: string };
export const LINK_KINDS: readonly string[];
export const CLEANUP_SAFETY_STEPS: readonly string[];

export const TRIAL_IDENTITY_FIELDS: readonly TrialIdentityField[];
export const IDENTITY_STATES: {
  readonly SAME_VERIFIED_IDENTITY: string;
  readonly BOTH_EXPLICITLY_ABSENT: string;
  readonly ONE_ABSENT: string;
  readonly CONFLICTING_IDENTITIES: string;
};
export const REQUIRED_RECONCILIATIONS: readonly NamedEntry[];

export const ARTIFACT_ENVELOPE: {
  readonly requiredRecordTypes: readonly string[];
  readonly completionRecordTypes: readonly string[];
  readonly resultDispatchTool: string;
  readonly dispatchRecordType: string;
  readonly minRecords: number;
  readonly law: string;
};
export const ARTIFACT_VALIDITY_STATES: readonly { readonly id: string; readonly interpretable: boolean; readonly detail: string }[];
export const COST_COMPLETENESS_LEVELS: readonly NamedEntry[];

export const AUTHORIZATION_CONDITIONS: readonly AuthorizationCondition[];
export const AUTHORIZATION_VERDICTS: { readonly VERIFIED: string; readonly REFUSED: string; readonly NOT_ESTABLISHED: string };
export const AUTHORITY_CONCEPTS: readonly string[];

export const LEGACY_HELPER_QUARANTINE: {
  readonly helper: string;
  readonly function: string;
  readonly disposition: string;
  readonly replacedBy: string;
  readonly physicallyUnexecutable: boolean;
  readonly quarantineIsAGuardNotAnImpossibility: boolean;
  readonly forbiddenClaim: string;
  readonly stillCallableBy: string;
};

export const PRESERVED_DESIGN: Record<string, unknown>;
export const FINAL_VERDICTS: Record<string, readonly string[]>;
export const UNEARNED_VERDICTS: Record<string, unknown>;
export const READINESS_STATEMENTS: readonly NamedEntry[];
export const COMMIT_STRUCTURE: readonly string[];
export const COMMIT_LAW: Record<string, unknown>;
export const STAGE_STOP: Record<string, unknown>;

export const NL: string;

export function contractSummary(): Record<string, unknown>;
