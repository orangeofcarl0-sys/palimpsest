/**
 * R3-L0C-I-A-R-L-C-F-S §10 — TYPES FOR THE REGRESSION RECORD.
 */

export const DETERMINISTIC_SUITES: readonly { readonly id: string; readonly deterministic: boolean }[];
export const LIVE_GATES: readonly { readonly id: string; readonly requiresModelRoute: boolean; readonly thisStageRanIt: boolean }[];
export const NL: string;

export function suiteResult(input: { id: string; verdict?: string; detail?: string | null; tests?: number | null; files?: number | null; blockedForSafety?: boolean }): Record<string, unknown>;
export function regressionRecord(input?: Record<string, unknown>): Record<string, unknown>;
export function immutabilityRecord(): Promise<Record<string, unknown>>;
