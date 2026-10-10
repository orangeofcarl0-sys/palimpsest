/** R3-L0C-I-A-R-L-C-F-S-H — TYPES FOR pipeline.mjs. */

export const NL: string;

export const REPO_ROOT: string;
export const STAGE_EVIDENCE_PATH: string;
export const PIPELINE_ORDER: readonly string[];
export function applyIdentityMutation(input: { records: readonly any[]; mutation?: Record<string, any> | null }): Record<string, any>;
export function runTerminalEnforcementMatrix(input: Record<string, any>): Promise<Record<string, any>>;
export function existsSync(path: string): boolean;
