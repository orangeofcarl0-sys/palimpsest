/**
 * R3-L0C-I-A §5 — TYPES FOR THE REPAIRED PRIMARY ADAPTER.
 */

export const CHILD_PROGRAM: string;
export const TEE_PATH: string;
export const SCRIPTED_WORKER: string;
export const LEGACY_MATRIX_PATH: string;
export const WORKER_RESULT_PREFIX: string;
export const PRIMARY_FAULTS: {
  readonly NONE: string;
  readonly REPORT_MISSING: string;
  readonly NO_COMMIT: string;
  readonly DECLINE_PULL: string;
  readonly NEEDS_ESCALATION: string;
  readonly SLOW: string;
};

export interface PrimaryGenerationOutcome {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly sessionId: string;
  readonly executionMode: string | null;
  readonly jobPhase: string | null;
  readonly reportPresent: boolean;
  readonly reportMissing: boolean;
  readonly childReportPresent: boolean;
  readonly childOk: boolean | null;
  readonly childError: string | null;
  readonly attemptState: string | null;
  readonly workerResultKind: string | null;
  readonly workerResultSummaryPresent: boolean;
  readonly workerResultEscalationReasonPresent: boolean;
  readonly workerResultParseFailure: string | null;
  readonly timedOut: boolean;
  readonly directChildExited: boolean;
  readonly descendantExitEstablished: boolean;
  readonly outcomeUnknown: boolean;
  readonly uncertainReason: string | null;
  readonly threw: boolean;
  readonly threwDetail: string | null;
  readonly hostFailure: boolean;
  readonly gitObjectResolutionFailed: boolean;
  readonly worldUnavailable: boolean;
  readonly commitFailedEnvironmentally: boolean;
  readonly treatmentMismatch: boolean;
  readonly treatmentRealization: string;
  readonly consumerVisibleHandleCount: number;
  readonly consumerVisibleHandles: readonly string[];
  readonly governedPullCount: number;
  readonly governedPulls: readonly unknown[];
  readonly hostResolveAuditCount: number;
  readonly resolvedBodyDigests: readonly string[];
  readonly pullLayers: unknown;
  readonly hiddenInvariantVector: Readonly<Record<string, unknown>> | null;
  readonly completionCause: string;
  readonly correctnessOk: boolean | null;
  readonly workCannotAdvance: boolean;
  readonly hostJobId: string | null;
  readonly attemptId: string | null;
  readonly startingHead: string | null;
  readonly finalHead: string | null;
  readonly resultState: string | null;
  readonly verificationState: string | null;
  readonly promotionState: string;
  readonly reportPath: string;
  readonly transcriptPath: string;
  readonly payloadPath: string;
  readonly specPath: string;
  readonly elapsedMs: number;
  readonly childStdoutTail: string;
  readonly childExit: number | null;
  readonly sessionArtifactPath: string | null;
  readonly observationDigest: string | null;
}

export function assertAuthoritativePath(input: { readonly caller?: string; readonly authorizedBy?: string }): {
  readonly authorized: boolean;
  readonly caller: string;
  readonly authoritativePath: string;
  readonly legacyMatrixQuarantined: boolean;
  readonly legacyMatrixStillExecutable: boolean;
};
export function buildChildSpec(input: Readonly<Record<string, unknown>>): { readonly spec: Readonly<Record<string, unknown>>; readonly specPath: string; readonly reportPath: string; readonly payloadSink: string; readonly transcript: string };
export function timeoutHierarchy(): {
  readonly outerChildMs: number;
  readonly innerWorkerMs: number;
  readonly settlementMs: number;
  readonly outerExceedsInnerPlusSettlement: boolean;
  readonly marginMs: number;
  readonly law: string;
};
export function runPrimaryGeneration(input: Readonly<Record<string, unknown>>): Promise<PrimaryGenerationOutcome>;
export function parseWorkerResult(transcriptText: string): {
  readonly present: boolean;
  readonly kind: string | null;
  readonly summaryPresent: boolean;
  readonly escalationReasonPresent: boolean;
  readonly admissible?: boolean;
  readonly parseFailure: string | null;
};
export function faultPositionFault(sessionIndex: number, scheduleLength: number): {
  readonly FIRST: boolean;
  readonly MIDDLE: boolean;
  readonly LAST: boolean;
  readonly index: number;
  readonly middleIndex: number;
  readonly lastIndex: number;
};
export function frozenPrimarySchedule(): Promise<readonly {
  readonly sessionId: string;
  readonly block: number;
  readonly arm: string;
  readonly generation: string;
  readonly trajectoryId: string;
  readonly scheduleIndex: number;
  readonly requiresResolved: string | null;
}[]>;
export const NL: string;
