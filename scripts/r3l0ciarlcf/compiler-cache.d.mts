/**
 * R3-L0C-I-A-R-L-C-F §7 — TYPES FOR THE INPUT-BOUND COMPILER VERIFICATION.
 */

export interface CompiledVerificationInputs {
  readonly identity: string;
  readonly sourceDigests: Readonly<Record<string, string>>;
  readonly compiledDigests: Readonly<Record<string, string>>;
  readonly compilerOptionsDigest: string;
  readonly toolchainIdentity: string;
  readonly pairCount: number;
  readonly missingSources: readonly string[];
  readonly missingCompiled: readonly string[];
}

export interface BoundCompiledVerification {
  readonly kind: string;
  readonly pairs: number;
  readonly missing: readonly string[];
  readonly DETERMINISTIC: string;
  readonly method?: string;
  readonly probeIsolation?: string;
  readonly normalization?: string;
  readonly diverged: readonly { readonly source: string; readonly compiled: string; readonly firstDifferingLine: number | null }[];
  readonly COMPILED_MATCHES_SOURCE: boolean | null;
  readonly unsupportedReason?: string;
  readonly cacheHit: boolean;
  readonly inputIdentity: string;
  readonly verifiedInputs: CompiledVerificationInputs;
}

export const COMPILED_PAIRS: readonly (readonly [string, string])[];
export const PROBE_COMPILER_OPTIONS: Readonly<Record<string, boolean>>;
export const NL: string;

export function compiledVerificationInputIdentity(): CompiledVerificationInputs;
export function verifyCompiledSourceBoundToInputs(): BoundCompiledVerification;
export function reverifyCompiledSource(): BoundCompiledVerification;
export function compilerCacheSize(): number;
export function clearCompilerCache(): void;
