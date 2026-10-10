/**
 * R3-L0C-I-A-R-L-C-F-S §3 — TYPES FOR THE PREVIOUS-STAGE ERRATUM.
 */

export const PRIOR_EVIDENCE: { readonly plan: string; readonly qualification: string; readonly stageResult: string };
export const NL: string;

export function buildErratum(): Record<string, unknown>;
export function writeErratum(): Record<string, unknown>;
