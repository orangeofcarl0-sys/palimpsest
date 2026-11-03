/**
 * R2-E — the type surface for `scripts/r2e/analyse.mjs`.
 *
 * The normalization and pairing helpers are pure functions over trial records, so the deterministic tests
 * can pin them without a matrix existing.
 */

export interface R2ENormalizedTrial {
  readonly trialId: string;
  readonly scenario: string;
  readonly condition: string;
  readonly block: number;
  readonly repetition: number;
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
  readonly hostFailure: boolean;
  readonly timedOut: boolean;
  readonly workerOutcomeKind: string;
  readonly workerCompleted: boolean;
  readonly jobPhase: string;
  /** §16: the capital-consumption proof. */
  readonly preconditionMet: boolean;
  readonly efficacyPrecondition: string;
  readonly consumedBeforeFirstEdit: boolean;
  readonly preworkMechanism: string;
  readonly selectedCount: number;
  readonly resolvedCount: number;
  readonly consumedHandles: readonly string[];
  readonly consumedDigests: readonly string[];
  readonly consumptionFailures: readonly Readonly<Record<string, unknown>>[];
  /** §17: the behavioural Procedure marker. */
  readonly procedureMarkerReflected: boolean;
  /** §13: the pairing components, recorded separately. */
  readonly ordinaryTaskDigest: string;
  readonly indexSectionDigest: string;
  readonly efficacySectionDigest: string;
  readonly capabilitySetDigest: string;
  readonly indexHandleCount: number;
  readonly handlesInPayload: readonly string[];
  readonly offeredTools: readonly string[];
  readonly pairedState: Readonly<Record<string, unknown>> | null;
  readonly capacity: Readonly<Record<string, unknown>> | null;
}

export interface R2EPairingBlock {
  readonly scenario: string;
  readonly block: number;
  readonly conditions: readonly string[];
  readonly confounded: boolean;
  readonly differences: readonly string[];
  readonly indexHandleCounts: readonly number[];
  readonly indexMovedWithArm: boolean;
}

export declare function normalizeTrial(record: Readonly<Record<string, unknown>>): R2ENormalizedTrial;
export declare function pairingCheck(trials: readonly Readonly<Record<string, unknown>>[]): readonly R2EPairingBlock[];
