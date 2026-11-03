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

export interface ExecutionClosure {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly parts: Readonly<Record<string, string>>;
  readonly partIds: readonly string[];
  readonly fileDigests: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly fileCount: number;
  readonly stageHarness: { readonly digest: string; readonly moduleCount: number; readonly missing: readonly string[] };
  readonly reusedModules: { readonly digest: string; readonly moduleCount: number; readonly missing: readonly string[] };
  readonly executionClosureDigest: string;
  readonly CLOSURE_COMPLETE: boolean;
  readonly aggregateMaterial: Readonly<Record<string, string>>;
  readonly [key: string]: unknown;
}

export const STAGE_HARNESS_MODULES: readonly string[];
export const REUSED_MODULES: readonly string[];
export const NL: string;

export function fileDigest(relative: string): string;
export function digestOfMap(map: Readonly<Record<string, string>>): string;
export function computeExecutionClosure(input?: { readonly verifyCompiled?: boolean }): Promise<ExecutionClosure>;
export function proveClosureMutations(): Promise<ClosureMutations>;
