/**
 * R3-L0C-I-A §7 — TYPES FOR THE RUNTIME MANIFEST AND THE STAGE CLOSURE.
 */

export const RUNTIME_MANIFEST: readonly string[];
export function computeRuntimeManifest(input?: { readonly modules?: readonly string[] }): {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly modules: readonly string[];
  readonly moduleDigests: Readonly<Record<string, string>>;
  readonly moduleCount: number;
  readonly missingModules: readonly string[];
  readonly RUNTIME_MANIFEST_COMPLETE: boolean;
  readonly runtimeManifestDigest: string;
  readonly why: string;
  readonly onMissing: string;
};
export function proveRuntimeManifestMutation(input?: { readonly target?: string; readonly staticWalkerReaches?: boolean }): {
  readonly id: string;
  readonly target: string;
  readonly digestBefore?: string;
  readonly digestMutated?: string;
  readonly digestRestored?: string;
  readonly digestMovedOnMutation?: boolean;
  readonly digestRestoredExactly?: boolean;
  readonly targetReachableByStaticWalker?: boolean;
  readonly PROPERTY_PROVEN: boolean;
  readonly reason?: string;
  readonly law?: string;
};
export function measureWalkerBlindSpot(): Promise<{
  readonly kind: string;
  readonly walkerModuleCount: number;
  readonly manifestModuleCount: number;
  readonly manifestModulesNotReachableByWalker: readonly string[];
  readonly blindSpotCount: number;
  readonly manifestCoversModulesTheWalkerMisses: boolean;
  readonly note: string;
}>;
export function runtimeManifestClosurePart(): Promise<{
  readonly partId: string;
  readonly digest: string;
  readonly moduleCount: number;
  readonly missing: readonly string[];
  readonly complete: boolean;
  readonly law: string;
}>;

export const STAGE_HARNESS_MODULES: readonly string[];
export function computeExecutionClosure(input?: Readonly<Record<string, unknown>>): Promise<{
  readonly schemaVersion: number;
  readonly kind: string;
  readonly parts: Readonly<Record<string, string>>;
  readonly partIds: readonly string[];
  readonly fileDigests: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly fileCount: number;
  readonly toolchain: Readonly<Record<string, unknown>>;
  readonly executor: Readonly<Record<string, unknown>>;
  readonly modelIdentity: Readonly<Record<string, unknown>>;
  readonly schedule: Readonly<Record<string, string>>;
  readonly runtimeManifest: { readonly digest: string; readonly moduleCount: number; readonly missing: readonly string[]; readonly complete: boolean; readonly modules: readonly string[] };
  readonly stageHarness: { readonly digest: string; readonly moduleCount: number; readonly missing: readonly string[] };
  readonly aggregateMaterial: Readonly<Record<string, string>>;
  readonly compiledVerification: Readonly<Record<string, unknown>>;
  readonly selfExclusions: readonly string[];
  readonly coversCodeNotResults: boolean;
  readonly executionClosureDigest: string;
  readonly CLOSURE_COMPLETE: boolean;
  readonly onIncomplete: string;
  readonly law: string;
}>;
export function proveClosureMutations(): Promise<{
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly arms: readonly { readonly id: string; readonly PROPERTY_PROVEN: boolean; readonly detail: string; readonly target: string; readonly partMoved?: boolean; readonly targetReachableByStaticWalker?: boolean }[];
  readonly blindSpot: Readonly<Record<string, unknown>>;
  readonly ALL_MUTATIONS_PROVEN: boolean;
  readonly failing: readonly string[];
}>;
export const NL: string;
export function digestOfMap(map: Readonly<Record<string, string>>): string;
export function fileDigest(relative: string): string;
