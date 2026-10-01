/**
 * R2-U — the type surface for `scripts/r2u/analyse.mjs`.
 *
 * The normalization and isolation helpers are pure functions over trial records, so the deterministic tests
 * can pin them without a matrix existing.
 */

export interface R2UNormalizedTrial {
  readonly trialId: string;
  readonly scenario: string;
  readonly cell: string;
  readonly factorK: number;
  readonly factorA: number;
  readonly block: number;
  readonly repetition: number;
  readonly handlesVisible: number;
  readonly pulledCount: number;
  readonly pulledHandles: readonly string[];
  readonly proofPulled: boolean;
  readonly reasoningPulled: boolean;
  readonly procedurePulled: boolean;
  readonly epistemicPulled: boolean;
  readonly anyPull: boolean;
  readonly firstPullOrdinal: number | string;
  readonly pulledBeforeFirstEdit: boolean | string;
  readonly pulledBeforeFirstVisibleTest: boolean | string;
  readonly pulledBeforeFirstHiddenSubmission: boolean | string;
  readonly timeToFirstPullMs: number | string;
  readonly toolActionsBeforeFirstPull: number | string;
  readonly postHocTiming: Readonly<Record<string, unknown>> | null;
  readonly workerCompleted: boolean;
  readonly workerOutcomeKind: string;
  readonly hostFailure: boolean;
  readonly timedOut: boolean;
  readonly jobPhase: string;
  readonly firstCandidatePassed: number;
  readonly firstCandidateTotal: number;
  readonly firstCandidateSolved: boolean;
  readonly finalAcceptancePassed: number;
  readonly finalAcceptanceTotal: number;
  readonly finalAcceptanceSolved: boolean;
  readonly knownFailureRecurred: boolean | string;
  readonly knownFailureRecurredFirst: boolean | string;
  readonly visibleOracleInvocations: number | string;
  readonly implementationRevisions: number | string;
  readonly elapsedMs: number | string;
  readonly tokens: Readonly<Record<string, unknown>> | string;
  readonly ordinaryTaskDigest: string;
  readonly indexSectionDigest: string;
  readonly affordanceClauseDigest: string;
  readonly capabilitySetDigest: string;
  readonly offeredTools: readonly string[];
  readonly reportedAffordance: string;
  readonly capacity: Readonly<Record<string, unknown>> | null;
  readonly pairedState: Readonly<Record<string, unknown>> | null;
}

export interface R2UIsolationBlock {
  readonly scenario: string;
  readonly block: number;
  readonly cells: readonly string[];
  readonly confounded: boolean;
  readonly differences: readonly string[];
}

export declare function normalizeTrial(record: Readonly<Record<string, unknown>>): R2UNormalizedTrial;
export declare function isolationCheck(trials: readonly Readonly<Record<string, unknown>>[]): readonly R2UIsolationBlock[];
