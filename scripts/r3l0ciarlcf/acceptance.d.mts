/**
 * R3-L0C-I-A-R-L-C-F §3-§7 — TYPES FOR THE PRODUCTION-PATH CONTROLS.
 */

export interface ProductionControl {
  readonly id: string;
  readonly authorityBearingFunction: string;
  readonly durableEvidence: string;
  readonly positiveControl: Readonly<Record<string, any>>;
  readonly mutations: Readonly<Record<string, any>>;
  readonly mutant: Readonly<Record<string, any>>;
  readonly livePrimaryProvenance?: Readonly<Record<string, any>>;
  readonly PASS: boolean;
}

export const NL: string;
export const createHash: typeof import('node:crypto').createHash;
export const existsSync: typeof import('node:fs').existsSync;
export const mkdirSync: typeof import('node:fs').mkdirSync;
export const mkdtempSync: typeof import('node:fs').mkdtempSync;
export const readFileSync: typeof import('node:fs').readFileSync;
export const rmSync: typeof import('node:fs').rmSync;
export const writeFileSync: typeof import('node:fs').writeFileSync;

export function controlArtifactIdentity(input?: Readonly<Record<string, any>>): Promise<ProductionControl>;
export function controlDurableReconciliation(input?: Readonly<Record<string, any>>): Promise<ProductionControl>;
export function controlPlanIdentityAndBudget(input?: Readonly<Record<string, any>>): Promise<ProductionControl>;
