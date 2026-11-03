/** R3-L0C-I-A-R-L-C-F-S-H — TYPES FOR evidence-seal.mjs. */

export const NL: string;

export function preSealStatus(input?: { plan?: any }): Record<string, any>;
export function sealPersistedEvidence(input?: { expectedPlanId?: string }): Promise<Record<string, any>>;
export function writePersistedSeal(input?: { expectedPlanId?: string }): Promise<Record<string, any>>;
export function readPersistedSeal(): Record<string, any> | null;
