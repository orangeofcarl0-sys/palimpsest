/**
 * R1-R — the type surface for `scripts/r1r/analyse.mjs`.
 *
 * Normalization plus the frozen comparisons. §28 forbids collapsing the per-trial outcomes into one
 * score, so every field here is a raw count or an explicitly-unknown value.
 */

export interface NormalizedTrial {
  readonly trialId: string;
  readonly scenario: string;
  readonly condition: string;
  readonly block: number;
  readonly repetition: number;
  readonly finalAcceptancePassed: number;
  readonly finalAcceptanceTotal: number;
  readonly finalAcceptanceSolved: boolean;
  readonly firstCandidatePassed: number;
  readonly firstCandidateTotal: number;
  readonly firstCandidateSolved: boolean;
  readonly knownFailureRecurred: boolean | "UNKNOWN";
  readonly knownFailureRecurredFirst: boolean | "UNKNOWN";
  readonly hiddenOracleInvocations: number | "UNKNOWN";
  readonly visibleOracleInvocations: number | "UNKNOWN";
  readonly selectedHandles: readonly string[];
  readonly selectedHandleCount: number;
  readonly indexHandleCount: number;
  readonly pulledHandles: readonly string[];
  readonly pulledCount: number;
  readonly procedurePulled: boolean;
  readonly epistemicPulled: boolean;
  readonly pullOrder: readonly string[];
  readonly workerAttempts: number;
  readonly implementationRevisions: number | "UNKNOWN";
  readonly elapsedMs: number | "UNKNOWN";
  readonly tokens: unknown;
  readonly hostFailure: boolean;
  readonly timedOut: boolean;
  readonly manualInterventions: number;
  readonly jobPhase: string;
  readonly workerOutcomeKind: string;
  readonly offeredTools: readonly string[];
  readonly capabilitySetDigest: string;
  readonly ordinaryTaskDigest: string;
  readonly pairedState: Readonly<Record<string, unknown>> | null;
}

export interface PairedStateBlock {
  readonly scenario: string;
  readonly block: number;
  readonly conditions: readonly string[];
  readonly confounded: boolean;
  readonly differences: readonly string[];
}

export interface ConditionCounts {
  readonly n: number;
  readonly finalSolved: string;
  readonly firstCandidateSolved: string;
  readonly knownFailureRecurred: string;
  readonly knownFailureUnknown: number;
  readonly procedurePulled: string;
  readonly epistemicPulled: string;
  readonly medianVisibleOracleInvocations: number | "UNKNOWN";
  readonly medianImplementationRevisions: number | "UNKNOWN";
  readonly medianElapsedMs: number | "UNKNOWN";
  readonly hostFailures: number;
  readonly timeouts: number;
  readonly manualInterventions: number;
}

export interface ScenarioAnalysis {
  readonly conditions: Readonly<Record<string, ConditionCounts>>;
  readonly c2BetterRecurrence: boolean;
  readonly c2OutcomeNotWorse: boolean;
  readonly directionalBenefit: boolean;
  readonly c2BeatsC1OnRecurrence: boolean;
  readonly c2BeatsC1OnFirst: boolean;
  readonly c2OverC1: boolean;
  readonly procedureObserved: boolean;
}

export interface Analysis {
  readonly verdict: "PASS" | "PARTIAL" | "NO_REPLICATION" | "INCOMPLETE";
  readonly scenarios: Readonly<Record<string, ScenarioAnalysis>>;
  readonly allDirectional: boolean;
  readonly someDirectional: boolean;
  readonly someC2OverC1: boolean;
  readonly confoundedBlocks: readonly string[];
  readonly excludedTrialCount: number;
  readonly usableTrialCount: number;
  readonly anyHostFailure: boolean;
  readonly totals: ConditionCounts;
}

export declare function normalizeTrial(record: Record<string, unknown>): NormalizedTrial;
export declare function pairedStateCheck(trials: readonly NormalizedTrial[]): readonly PairedStateBlock[];
export declare function analyse(trials: readonly NormalizedTrial[], blocks: readonly PairedStateBlock[]): Analysis;
