/**
 * R3-L0C-I-A-R-L-C-F-S §9 — TYPES FOR THE STAGE-OWNED EXECUTION CLOSURE.
 */

export interface ClosureMutationArm {
  readonly id: string;
  readonly target: string;
  readonly partId?: string;
  readonly digestBefore?: string;
  readonly digestMutated?: string;
  readonly partMoved?: boolean;
  readonly targetReachableByStaticWalker?: boolean;
  readonly PROPERTY_PROVEN: boolean;
  readonly detail?: string;
  readonly reason?: string;
  readonly computedByOverride?: boolean;
}

export interface ExecutionClosure {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly parts: Record<string, string>;
  readonly partIds: readonly string[];
  readonly fileDigests: Record<string, Record<string, string>>;
  readonly fileCount: number;
  readonly toolchain: Record<string, unknown>;
  readonly executor: Record<string, unknown>;
  readonly modelIdentity: Record<string, unknown>;
  readonly schedule: Record<string, string>;
  readonly runtimeManifest: Record<string, unknown>;
  readonly stageHarness: { readonly digest: string; readonly moduleCount: number; readonly missing: readonly string[] };
  readonly reusedModules: { readonly digest: string; readonly moduleCount: number; readonly missing: readonly string[] };
  readonly aggregateMaterial: Record<string, string>;
  readonly compiledVerification: unknown;
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
  readonly arms: readonly ClosureMutationArm[];
  readonly blindSpot: Record<string, unknown>;
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
export function digestOfMap(map: Record<string, string>): string;
export function computeExecutionClosure(input?: { verifyCompiled?: boolean }): Promise<ExecutionClosure>;
export function proveClosureMutations(): Promise<ClosureMutations>;
