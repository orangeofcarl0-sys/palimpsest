/**
 * R2-U — the type surface for `scripts/r2u/known-failure.mjs`.
 *
 * The detectors are behavioural: they run a candidate against narrow diagnostic probes that are in neither
 * case list, so a candidate cannot satisfy them by memorising the oracle.
 */

export interface R2UKnownFailureViolation {
  readonly probe: string;
  readonly why: string;
  readonly detail?: string;
  readonly returned?: string;
}

export interface R2UKnownFailureResult {
  readonly detector: string;
  readonly recurred: boolean | string;
  readonly violations: readonly R2UKnownFailureViolation[];
  readonly probesRun: number;
  readonly note?: string;
}

/** Scenario D's probes: the closure, its direction, unresolvable deps, refusal integrity and cycles. */
export declare const D_PROBES: readonly Readonly<{ id: string; why: string; cache: Record<string, unknown>; changed: readonly unknown[]; expect: string; survivors?: readonly string[]; absent?: readonly string[]; untouched?: boolean }>[];

export { detectB, detectC } from "../../scripts/r1r/known-failure.mjs";
export declare function detectD(invalidate: (cache: Record<string, unknown>, changed: readonly unknown[]) => unknown): R2UKnownFailureResult;
export declare function detectKnownFailure(scenarioId: string, fn: (...args: never[]) => unknown): R2UKnownFailureResult;
