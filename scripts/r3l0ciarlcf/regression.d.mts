/**
 * R3-L0C-I-A-R-L-C-F §8 — TYPES FOR THE REGRESSION RECORD.
 */

export interface RegressionRecord {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string | null;
  readonly deterministic: Readonly<Record<string, any>>;
  readonly live: Readonly<Record<string, any>>;
  readonly sectionsMerged: boolean;
  readonly combinedVerdictComputed: boolean;
  readonly law: string;
}

export const DETERMINISTIC_SUITES: readonly { readonly id: string; readonly deterministic: boolean }[];
export const LIVE_GATES: readonly { readonly id: string; readonly requiresModelRoute: boolean; readonly thisStageRanIt: boolean }[];
export const NL: string;

export function suiteResult(input: Readonly<Record<string, any>>): Readonly<Record<string, any>>;
export function regressionRecord(input?: Readonly<Record<string, any>>): RegressionRecord;
export function immutabilityRecord(): Promise<Readonly<Record<string, any>>>;
