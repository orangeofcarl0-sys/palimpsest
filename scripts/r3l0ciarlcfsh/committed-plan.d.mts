/** R3-L0C-I-A-R-L-C-F-S-H — TYPES FOR committed-plan.mjs. */

export const NL: string;

export const PLAN_ID: string;
export function committedPlanPath(): string;
export function readAndVerifyCommittedPlan(input?: Record<string, any>): Promise<Record<string, any>>;
export function constructCandidatePlan(input?: Record<string, any>): Promise<Record<string, any>>;
export function freezeCommittedPlan(input?: Record<string, any>): Promise<Record<string, any>>;
