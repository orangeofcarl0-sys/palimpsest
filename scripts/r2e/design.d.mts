/**
 * R2-E — the type surface for `scripts/r2e/design.mjs`.
 *
 * §14 fixes the randomized blocks and §18 fixes the verdict criteria BEFORE any trial runs, so both live
 * here as data rather than being re-derived per caller.
 */

export interface R2EArmSummary {
  readonly analysed: number;
  readonly fullSolveRate: number;
  readonly firstCandidateSolveRate: number;
  readonly mistakeRecurrenceRate: number;
  readonly procedureMarkerRate: number;
  readonly fullSolved: string;
  readonly firstCandidateSolved: string;
  readonly mistakeRecurred: string;
  readonly procedureMarkerReflected: string;
  /** §9: E1 trials whose prework did not materialize every selected handle. */
  readonly preconditionNotMet: number;
}

export interface R2EBlock {
  readonly block: number;
  readonly order: readonly string[];
}

export interface R2ETrialPlanEntry {
  readonly scenarioId: string;
  readonly block: number;
  readonly repetition: number;
  readonly condition: string;
}

export interface R2EMarkerResult {
  readonly marker: string;
  readonly reflected: boolean | string;
  readonly violations: readonly Readonly<{ probe: string; why: string; detail: string }>[];
  readonly probesRun: number;
}

export declare const PROTOCOL_SEED: number;
export declare const CONDITIONS: readonly string[];
export declare const ARMS: Readonly<Record<string, string>>;
export declare const REPETITIONS: number;
export declare const SCENARIO_IDS: readonly string[];
export declare const EXPECTED_TRIALS: number;
export declare const EFFICACY_VERDICTS: Readonly<{ REPLICATED: string; PARTIAL: string; NOT_OBSERVED: string }>;

export declare function blockOrder(blocks: number, scenarioId?: string): readonly R2EBlock[];
export declare function trialPlan(repetitions?: number, scenarioIds?: readonly string[]): readonly R2ETrialPlanEntry[];
/** §17: the behavioural Procedure marker, measured by running the candidate rather than by inspection. */
export declare function procedureMarkerFor(scenarioId: string, fn: (...args: never[]) => unknown): R2EMarkerResult;
export declare function armSummary(trials: readonly Readonly<Record<string, unknown>>[]): R2EArmSummary;
export declare function analyseEfficacy(byScenario: Readonly<Record<string, Readonly<{ e0: R2EArmSummary; e1: R2EArmSummary }>>>): {
  readonly verdict: string;
  readonly scenarios: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly benefittingScenarios: readonly string[];
  readonly directionalScenarios: readonly string[];
};
