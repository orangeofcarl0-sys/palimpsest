/** R3-L0C-I-A-R-L-C-F-S-H — TYPES FOR evidence.mjs. */

export const NL: string;

export function buildStageResult(qualification: Record<string, any>): Record<string, any>;
export function writeStageResult(qualification: Record<string, any>): Record<string, any>;
export function buildFinalVerdicts(input: { seal: Record<string, any> | null; qualification: Record<string, any> }): Record<string, any>;
export function writeFinalVerdicts(input: { seal: Record<string, any> | null; qualification: Record<string, any> }): Record<string, any>;
export function readRepoJson(relative: string): any;
