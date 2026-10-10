/** R3-L0C-I-A-R-L-C-F-S-H — TYPES FOR regression.mjs. */

export const NL: string;

export const DETERMINISTIC_SUITES: readonly any[];
export const LIVE_GATES: readonly any[];
export function suiteResult(input: Record<string, any>): Record<string, any>;
export function regressionRecord(input?: Record<string, any>): Record<string, any>;
export function immutabilityRecord(): Promise<Record<string, any>>;
