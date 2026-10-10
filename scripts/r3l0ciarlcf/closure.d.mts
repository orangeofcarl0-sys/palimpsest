/**
 * R3-L0C-I-A-R-L-C-F §9/§11 — TYPES FOR THE STAGE-OWNED EXECUTION CLOSURE.
 */

export interface ExecutionClosure {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly parts: Readonly<Record<string, string>>;
  readonly partIds: readonly string[];
  readonly fileDigests: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly fileCount: number;
  readonly toolchain: Readonly<Record<string, any>>;
  readonly executor: Readonly<Record<string, any>>;
  readonly modelIdentity: Readonly<Record<string, any>>;
  readonly schedule: Readonly<Record<string, string>>;
  readonly runtimeManifest: Readonly<Record<string, any>>;
  readonly stageHarness: Readonly<Record<string, any>>;
  readonly reusedModules: Readonly<Record<string, any>>;
  readonly aggregateMaterial: Readonly<Record<string, string>>;
  readonly compiledVerification: Readonly<Record<string, any>>;
  readonly selfExclusions: readonly string[];
  readonly coversCodeNotResults: boolean;
  readonly executionClosureDigest: string;
  readonly CLOSURE_COMPLETE: boolean;
  readonly onIncomplete: string;
  readonly law: string;
}

export interface ClosureMutations {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly arms: readonly Readonly<Record<string, any>>[];
  readonly blindSpot: Readonly<Record<string, any>>;
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
export function computeExecutionClosure(input?: Readonly<Record<string, any>>): Promise<ExecutionClosure>;
export function proveClosureMutations(): Promise<ClosureMutations>;
