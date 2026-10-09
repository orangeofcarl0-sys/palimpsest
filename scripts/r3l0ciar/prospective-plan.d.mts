/**
 * R3-L0C-I-A-R §9 — TYPES FOR THE SUPERSEDING PROSPECTIVE PLAN.
 */

export const PLAN_ID: string;
export const PLAN_SUPERSESSION: Readonly<Record<string, unknown>>;
export const EXECUTION_PATH_DEVIATIONS: readonly Readonly<Record<string, unknown>>[];
export const NL: string;

export function preservedDesign(): Promise<Readonly<Record<string, unknown>>>;
export function buildProspectivePlan(input?: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
export function writeProspectivePlan(input?: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
export function checkPlanClosure(input?: Readonly<Record<string, unknown>>): Promise<{ readonly EXECUTION_CLOSURE: string; readonly frozen: string | null; readonly current: string | null }>;
