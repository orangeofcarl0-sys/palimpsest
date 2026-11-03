/**
 * R1-R — the type surface for `scripts/r1r/known-failure.mjs`.
 *
 * The detectors are behavioural: they run a candidate against narrow diagnostic probes that are in
 * neither case list, so a candidate cannot satisfy them by memorising the oracle.
 */

export interface KnownFailureViolation {
  readonly probe: string;
  readonly why: string;
  readonly returned: string;
}

export interface KnownFailureResult {
  readonly detector: string;
  readonly recurred: boolean;
  readonly violations: readonly KnownFailureViolation[];
  readonly probesRun: number;
}

/** Scenario B's probes: an explicitly present but unusable optional setting must be refused. */
export declare const B_PROBES: readonly Readonly<{ id: string; why: string; input: Record<string, unknown>; expect: string }>[];
/** Scenario C's probes: order-dependence, unreplayable logs, and mutation-before-rejection. */
export declare const C_PROBES: readonly Readonly<{ id: string; why: string; state: Record<string, unknown>; input: readonly unknown[]; expect: string; canonical?: readonly unknown[] }>[];

export declare function detectB(migrate: (input: Record<string, unknown>) => unknown): KnownFailureResult;
export declare function detectC(apply: (state: Record<string, unknown>, events: readonly unknown[]) => unknown): KnownFailureResult;
export declare function detectKnownFailure(scenarioId: string, fn: (...args: never[]) => unknown): KnownFailureResult;
