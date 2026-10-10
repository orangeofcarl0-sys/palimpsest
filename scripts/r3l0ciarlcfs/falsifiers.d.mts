/**
 * R3-L0C-I-A-R-L-C-F-S §2 — TYPES FOR THE BASELINE CONTROL RUNNER.
 */

export const NL: string;

export function runCorrectionControls(input?: { base?: string }): Promise<{
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly source: Record<string, unknown>;
  readonly controls: readonly any[];
  readonly declared: number;
  readonly measuredProperties: number;
  readonly PROPERTIES_VIOLATED_BY_BASELINE: number;
  readonly ALL_DEFECTS_VIOLATED_BY_BASELINE: boolean;
  readonly violated: readonly string[];
  readonly notViolated: readonly string[];
  readonly modelCallsMade: number;
  readonly law: string;
}>;
