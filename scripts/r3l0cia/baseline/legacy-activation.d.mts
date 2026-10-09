/**
 * R3-L0C-I-A §1 — TYPES FOR THE BASELINE EXTRACTION.
 */

export const BASELINE_SOURCE: {
  readonly revision: string;
  readonly primaryMatrix: string;
  readonly primaryDriver: string;
  readonly generationChild: string;
};
export function legacyActivate(input: {
  readonly runRoot: string;
  readonly prehistory: { readonly world: string; readonly state: string };
  readonly trajectoryIds: readonly string[];
  readonly runId: string;
  readonly schedule: readonly unknown[];
  readonly launch: (input: unknown) => Promise<unknown>;
  readonly validityGate: (input: unknown) => Promise<unknown>;
}): Promise<{
  readonly prepared: unknown;
  readonly claimOutcome: { readonly refused: boolean; readonly verdict: string; readonly message?: string };
  readonly run: unknown;
}>;
export function legacyProtectedRoots(runRoot: string, trajectoryIds: readonly string[]): Promise<{
  readonly callerArguments: readonly unknown[];
  readonly currentTrajectoryIdArgument: null;
  readonly rootCount: number;
  readonly roots: readonly string[];
  readonly perTrajectory: Record<string, { readonly ownWorld: string; readonly ownWorldIsProtected: boolean; readonly siblingWorldsProtected: number }>;
  readonly anyOwnWorldProtected: boolean;
  readonly trajectoriesWithOwnWorldProtected: readonly string[];
}>;
export function legacyTreatmentMismatch(report: unknown, expectation: unknown): Promise<{
  readonly baselineFieldName: string;
  readonly baselineFieldPresentOnTheRealReport: boolean;
  readonly baselineTreatmentMismatch: boolean;
  readonly baselineDetectsMismatch: boolean;
  readonly observedConsumerVisibleHandles: readonly string[];
  readonly expectedConsumerVisibleHandles: readonly string[];
  readonly frozenRealization: string | null;
  readonly mismatchEscaped: boolean;
}>;
export function legacyPullConflation(input: { readonly report: unknown; readonly transcriptPath: string | null; readonly expectation: unknown }): Promise<{
  readonly hostResolveAuditCount: number;
  readonly hostResolveAuditHandles: readonly string[];
  readonly workerPullObservedHandles: readonly string[] | null;
  readonly workerPullObservedCount: number | null;
  readonly shippedParserUsed: boolean;
  readonly baselineTreatsHostAuditAsGovernedPulls: boolean;
  readonly baselineWouldReportUptake: boolean;
  readonly actualWorkerUptakeIsZero: boolean;
  readonly declinedObservationReachableUnderBaseline: boolean;
  readonly conflationEscaped: boolean;
}>;
export function legacyWorkerSelection(): Promise<{
  readonly baselineWorkerForAnyInput: string;
  readonly baselineIsAScriptedWorker: boolean;
  readonly inputCanSelectShippedWorker: boolean;
  readonly deterministicWorker: string;
  readonly primaryWorker: string;
  readonly primaryWorkerResolved: boolean;
  readonly noGenuinePaidMode: boolean;
}>;
export function legacyDefaultValidityGate(input: { readonly schedule: readonly { readonly sessionId: string }[] }): {
  readonly baselineGateSource: string;
  readonly baselineGateGreen: boolean;
  readonly baselineGateDetail: string;
  readonly requiredBeyondCount: readonly string[];
  readonly baselineChecksAnyOfThem: boolean;
  readonly defaultPostMatrixGreen: boolean;
};
export function legacyClosureAcceptance(input: {
  readonly runId: string;
  readonly schedule: readonly unknown[];
  readonly launch: (input: unknown) => Promise<unknown>;
  readonly validityGate: (input: unknown) => Promise<unknown>;
}): Promise<{
  readonly results: readonly { readonly label: string; readonly accepted: boolean; readonly refused?: boolean; readonly terminalState?: string; readonly recordedClosureDigest?: string | null; readonly message?: string }[];
  readonly allAccepted: boolean;
  readonly closureNotEnforcedAtLaunch: boolean;
}>;
export function legacyTimeoutBudgets(): Promise<{
  readonly outerChildMs: number | null;
  readonly innerWorkerMs: number | null;
  readonly outerExpiresFirst: boolean;
  readonly conflictMs: number | null;
  readonly requiredOuterMinimum: number | null;
  readonly baselineClassificationForOuterTermination: string;
  readonly baselineDistinguishesUnresolvedExposure: boolean;
}>;
export const NL: string;
