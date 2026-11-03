/**
 * R3-L0C-I-A-R-L-C-F §2 — TYPES FOR THE BASELINE CONTROL RUNNER.
 */

export interface BaselineControlRun {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly source: Readonly<Record<string, string>>;
  readonly controls: readonly Readonly<Record<string, any>>[];
  readonly declared: number;
  readonly measuredProperties: number;
  readonly PROPERTIES_VIOLATED_BY_BASELINE: number;
  readonly ALL_DEFECTS_VIOLATED_BY_BASELINE: boolean;
  readonly violated: readonly string[];
  readonly notViolated: readonly string[];
  readonly modelCallsMade: number;
  readonly law: string;
}

export const NL: string;

export function runCorrectionControls(input?: Readonly<Record<string, any>>): Promise<BaselineControlRun>;
