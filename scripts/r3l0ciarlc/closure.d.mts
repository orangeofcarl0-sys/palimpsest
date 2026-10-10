/**
 * R3-L0C-I-A-R-L-C §7 — TYPES FOR THE EXECUTION CLOSURE.
 */

export interface ClosureMutations {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly arms: readonly Readonly<Record<string, unknown>>[];
  readonly blindSpot: Readonly<Record<string, unknown>>;
  readonly ALL_MUTATIONS_PROVEN: boolean;
  readonly failing: readonly string[];
  readonly declaredArms: readonly string[];
  readonly computedByOverride: boolean;
  readonly treeMutated: boolean;
  readonly law: string;
}

export const STAGE_HARNESS_MODULES: readonly string[];
export const REUSED_MODULES: readonly string[];
export const NL: string;

export function fileDigest(relative: string): string;
export function digestOfMap(map: Readonly<Record<string, string>>): string;
export function computeExecutionClosure(input?: { readonly verifyCompiled?: boolean }): Promise<Readonly<Record<string, unknown>>>;
export function proveClosureMutations(): Promise<ClosureMutations>;
