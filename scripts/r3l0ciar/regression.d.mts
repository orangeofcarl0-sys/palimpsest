/**
 * R3-L0C-I-A-R §9 — TYPES FOR THE REGRESSION RECORD AND THE IMMUTABILITY GUARD.
 */

export interface SuiteResult {
  readonly id: string;
  readonly verdict: string;
  readonly passed: boolean;
  readonly detail: string | null;
  readonly tests: number | null;
  readonly files: number | null;
}

export interface RegressionRecord {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string | null;
  readonly deterministic: {
    readonly declared: readonly string[];
    readonly results: readonly SuiteResult[];
    readonly passed: number;
    readonly failed: readonly string[];
    readonly notRun: readonly string[];
    readonly ALL_DETERMINISTIC_GREEN: boolean;
  };
  readonly live: {
    readonly declared: readonly string[];
    readonly results: readonly SuiteResult[];
    readonly requiresModelRoute: boolean;
    readonly status: string;
    readonly note: string;
  };
  readonly sectionsMerged: boolean;
  readonly combinedVerdictComputed: boolean;
  readonly law: string;
}

export interface ImmutabilityRecord {
  readonly id: string;
  readonly verdict: string;
  readonly detail: string;
  readonly protectedNamespaces: readonly string[];
  readonly workingFileCount: number | null;
  readonly changed: readonly string[];
  readonly removed: readonly string[];
  readonly unexpectedAdditions: readonly string[];
  readonly restoreAvailable: boolean;
  readonly baselineRevision: string;
}

export const DETERMINISTIC_SUITES: readonly { readonly id: string; readonly deterministic: boolean }[];
export const LIVE_GATES: readonly { readonly id: string; readonly requiresModelRoute: boolean; readonly thisStageRanIt: boolean }[];
export const NL: string;

export function suiteResult(input: { readonly id: string; readonly verdict?: string; readonly detail?: string; readonly tests?: number; readonly files?: number }): SuiteResult;
export function regressionRecord(input?: Readonly<Record<string, unknown>>): RegressionRecord;
export function immutabilityRecord(): Promise<ImmutabilityRecord>;
