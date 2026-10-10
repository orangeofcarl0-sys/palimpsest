/**
 * R3-L0C-I-A-R-L-C-F-S §6/§8 — TYPES FOR THE GUARD AND MODE RESOLUTION.
 */

export const AUTHORITATIVE_PLAN_ID: string;
export const NL: string;
export const REPO_ROOT: string;

export function assertAuthoritativePath(input: { caller?: string; authorizedBy?: string }): { readonly authorized: boolean; readonly caller: string; readonly authoritativePath: string; readonly priorPipelinesQuarantined: boolean; readonly priorPipelinesStillExecutable: boolean };
export function assertCommittedPlanIdentity(input?: { expectedPlanId?: string; planPath?: string; verifyCompiled?: boolean }): Promise<{ readonly guard: string; readonly passed: boolean; readonly verification: any; readonly refusesBefore: readonly string[]; readonly dominatesExecutionEntry: boolean; readonly regeneratesPlan: boolean; readonly reason: string | null }>;
export function resolveExecutionMode(input: { mode?: string; paidAuthorization?: boolean }): Promise<Record<string, unknown>>;
export function resolveShippedDshBinAsync(): Promise<unknown>;
