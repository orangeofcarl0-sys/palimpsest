/** R3-L0C-I-A-R-L-C-F-S-H — TYPES FOR modes.mjs. */

export const NL: string;

export const REPO_ROOT: string;
export const AUTHORITATIVE_PLAN_ID: string;
export function assertAuthoritativePath(input: { caller?: string; authorizedBy?: string }): Record<string, any>;
export function assertCommittedPlanIdentity(input?: Record<string, any>): Promise<Record<string, any>>;
export function resolveExecutionMode(input: Record<string, any>): Promise<Record<string, any>>;
export function resolveShippedDshBinAsync(): Promise<unknown>;
