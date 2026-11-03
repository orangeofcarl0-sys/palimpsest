/**
 * R1-R — the type surface for `scripts/r1r/teacher-exploration.mjs`.
 *
 * The generation ladder that grounds the capital. Each generation is a plausible next move for an
 * engineer who has just seen the previous generation's failure classes, and every recorded observation
 * is the REAL oracle's output for that candidate.
 */

export interface ExplorationObservation {
  readonly generation: string;
  readonly note: string;
  readonly passed: number;
  readonly total: number;
  readonly failedCaseIds: readonly string[];
  readonly failureClasses: readonly string[];
  readonly failedInvariants: readonly string[];
  readonly details: readonly string[];
}

export interface ExplorationDiscovery {
  readonly generation: string;
  readonly discovery: string;
  readonly forcedBy: readonly string[];
  readonly detail: string;
}

export interface ScenarioExploration {
  readonly scenario: string;
  readonly generations: readonly string[];
  readonly observations: readonly ExplorationObservation[];
  readonly discoveries: readonly ExplorationDiscovery[];
}

export declare const SCENARIO_B_GENERATIONS: readonly [
  Readonly<{ id: string; note: string; migrate: (input: Record<string, unknown>) => unknown }>,
  Readonly<{ id: string; note: string; migrate: (input: Record<string, unknown>) => unknown }>,
  Readonly<{ id: string; note: string; migrate: (input: Record<string, unknown>) => unknown }>,
  Readonly<{ id: string; note: string; migrate: (input: Record<string, unknown>) => unknown }>,
];
export declare const SCENARIO_C_GENERATIONS: readonly [
  Readonly<{ id: string; note: string; reduce: (state: Record<string, unknown>, events: readonly unknown[]) => unknown }>,
  Readonly<{ id: string; note: string; reduce: (state: Record<string, unknown>, events: readonly unknown[]) => unknown }>,
  Readonly<{ id: string; note: string; reduce: (state: Record<string, unknown>, events: readonly unknown[]) => unknown }>,
  Readonly<{ id: string; note: string; reduce: (state: Record<string, unknown>, events: readonly unknown[]) => unknown }>,
];

export declare function explore(input: Record<string, unknown>): ScenarioExploration;
/** The exploration for both primary scenarios, run against the hidden acceptance. */
export declare function exploreAll(): Readonly<{ B: ScenarioExploration; C: ScenarioExploration }>;
