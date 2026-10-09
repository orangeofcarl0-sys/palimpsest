/**
 * R3-L0C-I-A-R-L §Final — TYPES FOR THE QUALIFICATION AND THE REGRESSION.
 */

export function runQualification(input?: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
export function writeQualification(input?: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;

export interface SuiteResult {
  readonly id: string;
  readonly verdict: string;
  readonly passed: boolean;
  readonly detail: string | null;
  readonly tests: number | null;
  readonly files: number | null;
}

export const DETERMINISTIC_SUITES: readonly { readonly id: string; readonly deterministic: boolean }[];
export const LIVE_GATES: readonly { readonly id: string; readonly requiresModelRoute: boolean; readonly thisStageRanIt: boolean }[];
export function suiteResult(input: { readonly id: string; readonly verdict?: string; readonly detail?: string; readonly tests?: number; readonly files?: number }): SuiteResult;
export function regressionRecord(input?: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
export function immutabilityRecord(): Promise<Readonly<Record<string, unknown>>>;

export function runCorrectionControls(input: { readonly schedule: readonly unknown[]; readonly dshHomePath: string }): Promise<Readonly<Record<string, unknown>>>;
