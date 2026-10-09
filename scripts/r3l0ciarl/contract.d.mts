/**
 * R3-L0C-I-A-R-L §1-§4 — TYPES FOR THE CONTRACT AND THE FAILING CONTROLS.
 */

export interface CorrectionGate {
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
  readonly gates: number;
  readonly primaryDerivedInputs: number;
  readonly authorizationDecisions: number;
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
  readonly disposition: string;
};
export const PRIOR_EVIDENCE_PATHS: readonly string[];
export const CORRECTION_GATES: readonly CorrectionGate[];
export const CONTROL_GATE_IDS: readonly string[];
export const LIVE_EVIDENCE: {
  readonly directory: string;
  readonly bindingField: string;
  readonly bindingKey: string;
  readonly requiredFields: readonly string[];
  readonly law: string;
};
export const PRIMARY_DERIVED_INPUTS: readonly string[];
export const DETERMINISTIC_ONLY_INJECTION: readonly string[];
export const AUTHORIZATION_REQUIREMENTS: readonly { readonly id: string; readonly detail: string }[];
export const AUTHORIZATION_RECORD_FIELDS: readonly string[];
export const PRIMARY_BINDING_LAW: Readonly<Record<string, unknown>>;
export const ATTESTATION: Readonly<Record<string, unknown>>;
export const FINAL_VERDICTS: Readonly<Record<string, readonly string[]>>;
export const COMMIT_STRUCTURE: readonly string[];
export const COMMIT_LAW: Readonly<Record<string, unknown>>;
export const STAGE_STOP: Readonly<Record<string, unknown>>;
export const NL: string;

export function contractSummary(): ContractSummary;
