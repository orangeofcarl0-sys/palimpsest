/**
 * R2-M §21/§26 — the type surface for the frozen design module.
 *
 * Declared by hand because `scripts/**` is plain JavaScript and the TS program must be able to import it
 * without falling back to `any`, which would let a mistyped arm or verdict through the build.
 */

/** §21: the ONE frozen seed. */
export declare const PROTOCOL_SEED: number;
/** §6: the two primary conditions. */
export declare const CONDITIONS: readonly string[];
/** §6: what each arm is. */
export declare const ARMS: Readonly<Record<string, string>>;
/** §21: repetitions per block. */
export declare const REPETITIONS: number;
export declare const SCENARIO_IDS: readonly string[];
export declare const EXPECTED_TRIALS: number;
/** §23: the capital kinds, in the fixed render order. */
export declare const KINDS: readonly string[];

export interface BlockOrderEntry {
  readonly block: number;
  readonly order: readonly string[];
}
export interface PlannedTrial {
  readonly scenarioId: string;
  readonly block: number;
  readonly repetition: number;
  readonly condition: string;
}

export declare function blockOrder(blocks: number, scenarioId?: string): readonly BlockOrderEntry[];
export declare function trialPlan(repetitions?: number, scenarioIds?: readonly string[]): readonly PlannedTrial[];

/** §26: the pre-declared verdicts. */
export declare const DECISION_RELEVANCE_VERDICTS: Readonly<{ REPLICATED: string; PARTIAL: string; NOT_IMPROVED: string }>;

export interface ArmSummary {
  readonly analysed: number;
  readonly pulledTrials: number;
  readonly pullRate: number;
  readonly pulled: string;
  readonly proofPullRate: number;
  readonly reasoningPullRate: number;
  readonly procedurePullRate: number;
  readonly proofPulled: string;
  readonly reasoningPulled: string;
  readonly procedurePulled: string;
  readonly treatmentNotApplied: number;
}

export declare function armSummary(trials: readonly unknown[]): ArmSummary;

export interface DecisionRelevanceScenario {
  readonly m0: ArmSummary;
  readonly m1: ArmSummary;
  readonly m1Higher: boolean;
  readonly m1PulledSomething: boolean;
  readonly improved: boolean;
  readonly m1HigherByCount: boolean;
  readonly treatmentApplied: boolean;
}
export interface DecisionRelevance {
  readonly verdict: string;
  readonly scenarios: Readonly<Record<string, DecisionRelevanceScenario>>;
  readonly improvedScenarios: readonly string[];
  readonly directionalScenarios: readonly string[];
}
export declare function analyseDecisionRelevance(byScenario: Record<string, { m0: ArmSummary; m1: ArmSummary }>): DecisionRelevance;

export declare function previewLeakage(input: { previewText: string; sourceField: string; forbidden: readonly string[] }): { readonly leaked: boolean; readonly problems: readonly string[] };
