/** R3-L0C-I-A-R-L-C-F-S-H — TYPES FOR prospective-plan.mjs. */

export const NL: string;

export const PLAN_SUPERSESSION: Record<string, unknown>;
export const MEASUREMENT_PATH_DEVIATIONS: readonly any[];
export const STAGE_STOP: Record<string, unknown>;
export function preservedDesign(): Promise<Record<string, any>>;
export function buildProspectivePlan(input?: Record<string, any>): Promise<Record<string, any>>;
export function checkPlanClosure(input?: Record<string, any>): Promise<Record<string, any>>;
