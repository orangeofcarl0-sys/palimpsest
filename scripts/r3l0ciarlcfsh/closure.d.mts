/** R3-L0C-I-A-R-L-C-F-S-H — TYPES FOR closure.mjs. */

export const NL: string;

export const STAGE_HARNESS_MODULES: readonly string[];
export const REUSED_MODULES: readonly string[];
export function fileDigest(relative: string): string;
export function digestOfMap(map: Record<string, string>): string;
export function computeExecutionClosure(input?: Record<string, any>): Promise<Record<string, any>>;
export function proveClosureMutations(): Promise<Record<string, any>>;
