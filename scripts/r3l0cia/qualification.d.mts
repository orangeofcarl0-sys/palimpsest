/**
 * R3-L0C-I-A §10 — TYPES FOR THE QUALIFICATION ORCHESTRATOR.
 */
export function runQualification(input?: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
export function writeQualification(input?: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
export const NL: string;
export const GENERATION_CHILD_BUDGET_MS: number;
export const WORKER_EXECUTION_BUDGET_MS: number;
export const regressionRecord: (input?: Readonly<Record<string, unknown>>) => Readonly<Record<string, un
