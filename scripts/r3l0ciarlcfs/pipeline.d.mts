/**
 * R3-L0C-I-A-R-L-C-F-S §8 — TYPES FOR THE EVIDENCE-SEAL INTEGRATION ENTRY.
 */

export const PIPELINE_ORDER: readonly string[];
export const NL: string;
export const REPO_ROOT: string;
export const STAGE_EVIDENCE_PATH: string;
export const existsSync: (path: string) => boolean;

export function runEvidenceSealMatrix(input: Record<string, unknown>): Promise<Record<string, unknown>>;
