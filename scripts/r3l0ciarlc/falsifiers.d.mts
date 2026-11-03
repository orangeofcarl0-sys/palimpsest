/**
 * R3-L0C-I-A-R-L-C §2 — TYPES FOR THE BASELINE CONTROL RUNNER.
 */

export interface CorrectionControlRecord {
  readonly id: string;
  readonly defectPresent: boolean;
  readonly PROPERTY_VIOLATED_BY_BASELINE: boolean;
  readonly detail: string;
  readonly [key: string]: unknown;
}

export interface CorrectionControlRun {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly source: Readonly<Record<string, string>>;
  readonly controls: readonly CorrectionControlRecord[];
  readonly declared: number;
  readonly measuredProperties: number;
  readonly PROPERTIES_VIOLATED_BY_BASELINE: number;
  readonly ALL_DEFECTS_VIOLATED_BY_BASELINE: boolean;
  readonly violated: readonly string[];
  readonly notViolated: readonly string[];
  readonly modelCallsMade: number;
  readonly law: string;
}

export function runCorrectionControls(): Promise<CorrectionControlRun>;
export const NL: string;
