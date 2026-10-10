/**
 * R3-L0C-I-A-R-L-C §0-§10 — TYPES FOR THE ADMISSION CLOSURE CONTRACT.
 */

export interface CorrectionGate {
  readonly id: string;
  readonly section: string;
  readonly gap: string;
  readonly baselineLocation: string;
  readonly property: string;
  readonly authoritativePath: string;
}

export interface CostBridgeOutcome {
  readonly id: string;
  readonly measured: boolean;
  readonly provenance: string | null;
  readonly detail: string;
}

export interface ContractSummary {
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly gates: number;
  readonly costBridgeOutcomes: number;
  readonly terminalAdmissionConditions: number;
  readonly primaryDerivedInputs: number;
  readonly attestationPoints: number;
  readonly verdicts: number;
  readonly modelCallsMade: number;
  readonly newline: string;
}

export const BASELINE_COMMIT: string;
export const STAGE_BRANCH: string;
export const STAGE_CODE_PATH: string;
export const STAGE_EVIDENCE_PATH: string;
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
export const PRIOR_EVIDENCE_PATHS: readonly string[];
export const CORRECTION_GATES: readonly CorrectionGate[];
export const CONTROL_GATE_IDS: readonly string[];
export const COST_BRIDGE_OUTCOMES: readonly CostBridgeOutcome[];
export const BRIDGE_PROVENANCE: { readonly LIVE_PRIMARY: string; readonly FIXTURE: string; readonly ABSENT: string };
export const LIVE_PRIMARY_EVIDENCE: {
  readonly required: readonly string[];
  readonly modeLabelAloneIsInsufficient: boolean;
  readonly fileExistenceAloneIsInsufficient: boolean;
  readonly law: string;
};
export const COST_INSTRUMENTATION: Readonly<Record<string, unknown>>;
export const TERMINAL_ADMISSION_CONDITIONS: readonly { readonly id: string; readonly detail: string }[];
export const TERMINAL_DECISIONS: { readonly GREEN: string; readonly RED: string };
export const RED_CONSEQUENCES: Readonly<Record<string, unknown>>;
export const TRUST_CONCEPTS: readonly { readonly id: string; readonly detail: string }[];
export const AUTHORITY_TRUST: Readonly<Record<string, unknown>>;
export const AUTHORIZATION_RECORD_FIELDS: readonly string[];
export const AUTHORIZATION_REQUIREMENTS: readonly { readonly id: string; readonly detail: string }[];
export const FROZEN_SESSION_SCOPE: number;
export const TRUSTED_HOST_INPUTS: readonly string[];
export const PRIMARY_DERIVED_INPUTS: readonly string[];
export const ATTESTATION_POINTS: readonly { readonly id: string; readonly when: string; readonly compared: string }[];
export const ATTESTATION_RULES: Readonly<Record<string, unknown>>;
export const CLOSURE_MUTATION_ARMS: readonly string[];
export const FINAL_VERDICTS: Readonly<Record<string, readonly string[]>>;
export const UNEARNED_VERDICTS: Readonly<Record<string, unknown>>;
export const PRESERVED_DESIGN: Readonly<Record<string, unknown>>;
export const COMMIT_STRUCTURE: readonly string[];
export const COMMIT_LAW: Readonly<Record<string, unknown>>;
export const STAGE_STOP: Readonly<Record<string, unknown>>;
export const NL: string;

export function contractSummary(): ContractSummary;
