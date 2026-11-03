/**
 * R3-L0C-I-A-R-L-C-F-S §9 — TYPES FOR THE SUPERSEDING PROSPECTIVE PLAN.
 */

export const PLAN_SUPERSESSION: Record<string, unknown>;
export const MEASUREMENT_PATH_DEVIATIONS: readonly Record<string, unknown>[];
export const NL: string;

export function preservedDesign(): Promise<Record<string, unknown>>;
export function buildProspectivePlan(input?: Record<string, unknown>): Promise<any>;
export function checkPlanClosure(input?: { planPath?: string; verifyCompiled?: boolean }): Promise<{ readonly EXECUTION_CLOSURE: string; readonly frozen: string | null; readonly current: string | null; readonly onMismatch?: string }>;
export function checkPlanContentDigest(input?: { planPath?: string }): Promise<{ readonly FULL_PLAN_DIGEST: string; readonly frozen: string | null; readonly current: string | null }>;
