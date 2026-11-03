/**
 * R2-M §19/§22/§24 — the type surface for the analysis module.
 *
 * Declared by hand because `scripts/**` is plain JavaScript. The normalized-trial shape is spelled out so a
 * test that reads `pulledAny` or `treatmentApplied` cannot silently read a mistyped key as `undefined`.
 */

export interface NormalizedTrial {
  readonly trialId: string;
  readonly scenario: string;
  readonly condition: string;
  readonly block: number;
  readonly repetition: number;
  readonly pulledCount: number;
  readonly pulledHandles: readonly string[];
  readonly pulledKinds: readonly string[];
  readonly pulledAny: boolean;
  readonly proofPulled: boolean;
  readonly reasoningPulled: boolean;
  readonly procedurePulled: boolean;
  readonly firstPullOrdinal: number | string;
  readonly toolActionsBeforeFirstPull: number | string;
  readonly pulledBeforeFirstEdit: boolean;
  readonly pulledBeforeFirstVisibleTest: boolean;
  readonly finalAcceptancePassed: number;
  readonly finalAcceptanceTotal: number;
  readonly finalAcceptanceSolved: boolean;
  readonly firstCandidatePassed: number;
  readonly firstCandidateTotal: number;
  readonly firstCandidateSolved: boolean;
  readonly knownFailureRecurred: boolean | string;
  readonly visibleOracleInvocations: number | string;
  readonly implementationRevisions: number | string;
  readonly elapsedMs: number | string;
  readonly hostFailure: boolean;
  readonly timedOut: boolean;
  readonly workerOutcomeKind: string;
  readonly jobPhase: string;
  readonly treatmentApplied: boolean;
  readonly indexPrecondition: string;
  readonly indexModeReported: string;
  readonly sessionFound: boolean;
  readonly sessionArtifactDigest: string;
  readonly sessionPromptDigest: string;
  readonly sessionIndexSectionFound: boolean;
  readonly sessionHandleCount: number;
  readonly selectedHandleCount: number;
  readonly treatmentEvidence: Record<string, unknown> | null;
  readonly derivationPullOffset: number;
  readonly pullAccountingConsistent: boolean | string;
  readonly derivedCount: number;
  readonly indexManifest: readonly unknown[];
  readonly ordinaryTaskDigest: string;
  readonly indexPresentationDigest: string;
  readonly productionIndexDigest: string;
  readonly toolCatalogDigest: string;
  readonly pullToolDescriptionDigest: string;
  readonly capabilitySetDigest: string;
  readonly handlesInPayload: readonly string[];
  readonly indexHandleCount: number;
  readonly indexSection: string;
  readonly productionIndexSection: string;
  readonly offeredTools: readonly string[];
  readonly pairedState: Record<string, unknown> | null;
  readonly capacity: unknown;
}

export interface IsolationBlock {
  readonly scenario: string;
  readonly block: number;
  readonly conditions: readonly string[];
  readonly confounded: boolean;
  readonly differences: readonly string[];
  readonly indexHandleCounts: readonly number[];
  readonly indexMovedWithArm: boolean;
}

export declare function normalizeTrial(record: Record<string, unknown>): NormalizedTrial;
export declare function isolationCheck(trials: readonly NormalizedTrial[]): readonly IsolationBlock[];
