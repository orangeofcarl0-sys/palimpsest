/**
 * R3-L0C-I-A §10 — TYPES FOR THE REGRESSION RECORD.
 */
export const DETERMINISTIC_SUITES: readonly { readonly id: string; readonly command: string; readonly deterministic: boolean }[];
export const LIVE_GATES: readonly { readonly id: string; readonly requiresModelRoute: boolean; readonly thisStageRanIt: boolean }[];
export function suiteResult(input: { readonly id: string; readonly verdict?: string | null; readonly detail?: string | null; readonly tests?: number | null; readonly files?: number | null }): {
  readonly id: string;
  readonly verdict: string;
  readonly passed: boolean;
  readonly detail: string | null;
  readonly tests: number | null;
  readonly files: number | null;
};
export function regressionRecord(input?: {
  readonly baseline?: string | null;
  readonly deterministic?: readonly unknown[];
  readonly live?: readonly unknown[];
}): {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string | null;
  readonly deterministic: {
    readonly declared: readonly string[];
    readonly results: readonly { readonly id: string; readonly verdict: string; readonly passed: boolean; readonly detail: string | null; readonly tests: number | null; readonly files: number | null }[];
    readonly passed: number;
    readonly failed: readonly string[];
    readonly notRun: readonly string[];
    readonly ALL_DETERMINISTIC_GREEN: boolean;
  };
  readonly live: {
    readonly declared: readonly string[];
    readonly results: readonly { readonly id: string; readonly verdict: string; readonly passed: boolean }[];
    readonly requiresModelRoute: boolean;
    readonly status: string;
    readonly note: string;
  };
  readonly sectionsMerged: boolean;
  readonly combinedVerdictComputed: boolean;
  readonly law: string;
};
export function immutabilityRecord(): Promise<{
  readonly id: string;
  readonly verdict: string;
  readonly detail: string;
  readonly protectedNamespaces: readonly string[];
  readonly workingFileCount: number | null;
  readonly restoreAvailable: boolean | null;
  readonly baselineRevision: string | null;
}>;
export const NL: string;
export const REPO_ROOT: string;
