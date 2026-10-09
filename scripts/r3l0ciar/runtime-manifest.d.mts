/**
 * R3-L0C-I-A §7 — TYPES FOR THE RUNTIME MANIFEST.
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
  readonly digestMovedOnMutation?: boolean;
  readonly targetReachableByStaticWalker?: boolean;
  readonly computedByOverride?: boolean;
  readonly treeMutated?: boolean;
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

export const NL: string;
export function rmSync(path: string, options?: Readonly<Record<string, unknown>>): void;
