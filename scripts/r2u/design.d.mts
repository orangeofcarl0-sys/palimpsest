/**
 * R2-U — the type surface for `scripts/r2u/design.mjs`.
 *
 * §15 fixes the randomized blocks and §20 fixes the verdict criteria BEFORE any trial runs, so both live
 * here as data rather than being re-derived per caller.
 */

export interface R2UPullRate {
  readonly n: number;
  readonly pulled: number;
  readonly rate: number;
}

export interface R2UBlock {
  readonly block: number;
  readonly order: readonly string[];
}

export interface R2UTrialPlanEntry {
  readonly scenarioId: string;
  readonly block: number;
  readonly repetition: number;
  readonly cell: string;
}

export interface R2UUptakeVerdicts {
  readonly REPLICATED: string;
  readonly PARTIAL: string;
  readonly NOT_IMPROVED: string;
}

export declare const PROTOCOL_SEED: number;
export declare const CELLS: readonly string[];
export declare const FACTORS: Readonly<{ K: Readonly<Record<string, string>>; A: Readonly<Record<string, string>> }>;
export declare const REPETITIONS: number;
export declare const SCENARIO_IDS: readonly string[];
export declare const EXPECTED_TRIALS: number;
export declare const UPTAKE_VERDICTS: R2UUptakeVerdicts;

export declare function blockOrder(blocks: number, scenarioId?: string): readonly R2UBlock[];
export declare function trialPlan(repetitions?: number, scenarioIds?: readonly string[]): readonly R2UTrialPlanEntry[];
export declare function pullRates(trials: readonly Readonly<{ cell: string; pulledCount: number }>[]): Readonly<Record<string, R2UPullRate>>;
export declare function analyseUptake(byScenario: Readonly<Record<string, Readonly<Record<string, R2UPullRate>>>>): {
  readonly verdict: string;
  readonly scenarios: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly clearCount: number;
  readonly directionalCount: number;
};
