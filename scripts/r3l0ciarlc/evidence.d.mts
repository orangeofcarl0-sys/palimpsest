/**
 * R3-L0C-I-A-R-L-C §10/§12 — TYPES FOR THE STAGE RESULT.
 */

export interface StageResult {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly verdicts: Readonly<Record<string, string>>;
  readonly modelCallsMade: number;
  readonly enteredPrimaryExecution: boolean;
  readonly [key: string]: unknown;
}

export const NL: string;

export function buildStageResult(qualification: Readonly<Record<string, unknown>>): StageResult;
export function writeStageResult(qualification: Readonly<Record<string, unknown>>): StageResult;
