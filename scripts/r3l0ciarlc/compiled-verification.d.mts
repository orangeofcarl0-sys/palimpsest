/**
 * R3-L0C-I-A-R-L-C §6 Gate D — TYPES FOR THE ISOLATED SOURCE-TO-COMPILED VERIFICATION.
 */

export interface CompiledVerification {
  readonly kind: string;
  readonly pairs: number;
  readonly missing: readonly string[];
  readonly DETERMINISTIC: string;
  readonly method: string;
  readonly probeIsolation?: string;
  readonly normalization: string;
  readonly unsupportedReason?: string;
  readonly diverged: readonly { readonly source: string; readonly compiled: string; readonly firstDifferingLine: number | null }[];
  readonly COMPILED_MATCHES_SOURCE: boolean | null;
}

export const COMPILED_PAIRS: readonly (readonly [string, string])[];
export const NL: string;

export function verifyCompiledSourceIsolated(): CompiledVerification;
