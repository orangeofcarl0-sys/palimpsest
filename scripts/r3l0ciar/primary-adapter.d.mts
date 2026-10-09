/**
 * R3-L0C-I-A-R §2/§4/§8 — TYPES FOR THE PRIMARY GENERATION ADAPTER.
 */

export interface WorkerResult {
  readonly present: boolean;
  readonly kind: string | null;
  readonly summaryPresent: boolean;
  readonly escalationReasonPresent: boolean;
  readonly admissible: boolean;
  readonly parseFailure: string | null;
}

export interface GenerationOutcome {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly sessionId: string;
  readonly executionMode: string;
  readonly jobPhase: string | null;
  readonly reportPresent: boolean;
  readonly reportMissing: boolean;
  readonly childReportPresent: boolean;
  readonly childOk: boolean | null;
  readonly childError: string | null;
  readonly attemptState: string | null;
  readonly workerResultPresent: boolean;
  readonly workerResultKind: string | null;
  readonly workerResultAdmissible: boolean;
  readonly workerResultParseFailure: string | null;
  readonly timedOut: boolean;
  readonly workerResultSeen: boolean;
  readonly directChildExited: boolean;
  readonly descendantExitEstablished: boolean;
  readonly outcomeUnknown: boolean;
  readonly uncertainReason: string | null;
  readonly threw: boolean;
  readonly threwDetail: string | null;
  readonly hostFailure: boolean;
  readonly treatmentMismatch: boolean;
  readonly treatmentRealization: string;
  readonly consumerVisibleHandleCount: number;
  readonly consumerVisibleHandles: readonly string[];
  readonly workerUptakeProvenance: string;
  readonly workerUptakeObserved: boolean;
  readonly governedPullCount: number | null;
  readonly hostResolveAuditCount: number;
  readonly pullLayers: unknown;
  readonly attemptId: string | null;
  readonly hostJobId: string | null;
  readonly completionCause: string | null;
  readonly correctnessOk: boolean | null;
  readonly workCannotAdvance: boolean;
  readonly reportPath: string;
  readonly transcriptPath: string;
  readonly elapsedMs: number;
  readonly sessionArtifactPath: string | null;
  readonly observationDigest: string | null;
}

export const CHILD_PROGRAM: string;
export const TEE_PATH: string;
export const SCRIPTED_WORKER: string;
export const WORKER_RESULT_PREFIX: string;
export const PRIMARY_FAULTS: Readonly<Record<string, string>>;
export const NL: string;

export function timeoutHierarchy(): Readonly<Record<string, unknown>>;
export function buildChildSpec(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
export function runPrimaryGeneration(input: Readonly<Record<string, unknown>>): Promise<GenerationOutcome>;
export function parseWorkerResult(transcriptText: string): WorkerResult;
export function faultPositionFault(sessionIndex: number, scheduleLength: number): Readonly<Record<string, unknown>>;
export function frozenPrimarySchedule(): Promise<readonly Readonly<Record<string, unknown>>[]>;
export function shippedPullParser(): Promise<Readonly<Record<string, unknown>>>;
export function telemetryLineShape(transcriptText: string): Readonly<Record<string, unknown>>;
