/**
 * R2-U — the type surface for `scripts/r2u/teacher-exploration.mjs`.
 *
 * §12 forbids authoring the Procedure from the scenario specification, so the exploration is a recorded
 * ladder of real candidates against the real hidden acceptance, and the capital is derived from its
 * observations.
 */

export interface R2UGeneration {
  readonly id: string;
  readonly note: string;
  readonly invalidate: (cache: Record<string, unknown>, changed: readonly unknown[]) => unknown;
}

export interface R2UObservation {
  readonly generation: string;
  readonly note: string;
  readonly passed: number;
  readonly total: number;
  readonly failedCaseIds: readonly string[];
  readonly failureClasses: readonly string[];
  readonly failedInvariants: readonly string[];
  readonly details: readonly string[];
}

export interface R2UExploration {
  readonly scenario: string;
  readonly generations: readonly string[];
  readonly observations: readonly R2UObservation[];
  readonly discoveries: readonly Readonly<{ generation: string; discovery: string; forcedBy: readonly string[]; detail: string }>[];
}

export declare const SCENARIO_D_GENERATIONS: readonly R2UGeneration[];

export declare function explore(input: Readonly<Record<string, unknown>>): R2UExploration;
export declare function exploreScenarioD(): R2UExploration;
export declare function exploreAll(): Readonly<{ D: R2UExploration }>;
