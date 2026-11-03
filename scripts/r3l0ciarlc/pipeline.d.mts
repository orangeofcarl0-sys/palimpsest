/**
 * R3-L0C-I-A-R-L-C §3-§6 — TYPES FOR THE AUTHORITATIVE ADMISSION-CLOSURE PIPELINE.
 */

export interface JournalCounts {
  readonly kind: string;
  readonly launchesBySession: Readonly<Record<string, number>>;
  readonly totalLaunches: number;
  readonly retries: number;
  readonly replacements: number;
  readonly unplannedLaunches: readonly string[];
  readonly sessionsNeverLaunched: readonly string[];
  readonly noRetries: boolean;
  readonly noReplacements: boolean;
  readonly derivedFromCallerSuppliedNumbers: boolean;
  readonly law: string;
}

export interface SessionIdentities {
  readonly kind: string;
  readonly recorded: number;
  readonly uniqueRecorded: number;
  readonly planned: number;
  readonly identityMismatches: readonly Readonly<Record<string, unknown>>[];
  readonly unplannedSessions: readonly string[];
  readonly missingSessions: readonly string[];
  readonly distinctTrajectories: number;
  readonly distinctBlocks: number;
  readonly allIdentitiesExact: boolean;
  readonly allSixteenUnique: boolean;
  readonly eightTrajectories: boolean;
  readonly fourBlocks: boolean;
  readonly law: string;
}

export interface LiveEvidenceContinuity {
  readonly sessions: number;
  readonly allBound: boolean;
  readonly allMatched: boolean;
  readonly allComplete: boolean;
  readonly LIVE_ARTIFACT_PROPAGATION: string;
  readonly perSession: readonly Readonly<Record<string, unknown>>[];
}

export interface MatrixCostBridge {
  readonly schemaVersion: number;
  readonly journalIntact: boolean;
  readonly journalRecords: number;
  readonly trialRecords: number;
  readonly plannedSessions: number;
  readonly measuredCount: number;
  readonly absentCount: number;
  readonly measured: readonly Readonly<Record<string, unknown>>[];
  readonly absent: readonly Readonly<Record<string, unknown>>[];
  readonly perSession: readonly Readonly<Record<string, unknown>>[];
  readonly livePrimaryCount: number;
  readonly fixtureCount: number;
  readonly provenance: string;
  readonly interpretable: boolean;
  readonly allAttributed: boolean;
  readonly allSixteenLivePrimary: boolean;
  readonly blocksCausalVerdict: boolean;
  readonly law: string;
}

export interface InRunAttestationResult {
  readonly IN_RUN_ATTESTATION: string;
  readonly s1MatchesExpectedBundle: boolean;
  readonly s2MatchesS1: boolean;
  readonly competingWriterDetected: boolean;
  readonly installedDuringRunSuppressesDetection: boolean;
  readonly compiledVerificationSkipped: boolean;
  readonly coverageLimitations: readonly string[];
  readonly installerIsMitigationNotProof: boolean;
  readonly expectedBundle: { readonly allIdentical: boolean; readonly comparedFileByFile: boolean };
}

export interface TerminalAdmissionResult {
  readonly green: boolean;
  readonly decision: string;
  readonly conditions: readonly Readonly<Record<string, unknown>>[];
  readonly failing: readonly string[];
  readonly journalReadAtAdmission: boolean;
  readonly journalIntact: boolean;
  readonly freshClosureDigest: string | null;
  readonly routeIdentity: string | null;
  readonly detail: string;
  readonly [key: string]: unknown;
}

export interface FailStopRun {
  readonly terminalState: string;
  readonly matrixCompleted: boolean;
  readonly causalVerdictIssued: boolean;
  readonly completedSessions: readonly string[];
  readonly plannedSessions: readonly string[];
  readonly records: readonly Readonly<Record<string, unknown>>[];
  readonly launches: readonly Readonly<Record<string, unknown>>[];
  readonly maxLaunchesPerSession: number;
  readonly [key: string]: unknown;
}

export interface PipelineRun {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly PIPELINE: string;
  readonly refusedAt?: string;
  readonly reason?: string;
  readonly detail?: string | null;
  readonly runId?: string;
  readonly runRoot: string;
  readonly mode?: Readonly<Record<string, unknown>>;
  readonly primaryBinding?: Readonly<Record<string, unknown>>;
  readonly authorityVerification?: Readonly<Record<string, unknown>> | null;
  readonly trustedHost?: Readonly<Record<string, unknown>>;
  readonly preExposureChecks?: Readonly<Record<string, unknown>>;
  readonly modelRouteIdentity?: string;
  readonly containment?: Readonly<Record<string, unknown>> | null;
  readonly s0Digest?: string;
  readonly s1Digest?: string;
  readonly s2Digest?: string;
  readonly scheduleLength?: number;
  readonly trajectoryCount?: number;
  readonly launches: readonly Readonly<Record<string, unknown>>[];
  readonly faultsInjected?: readonly Readonly<Record<string, unknown>>[];
  readonly outcomes?: Readonly<Record<string, unknown>>;
  readonly liveEvidence?: Readonly<Record<string, unknown>>;
  readonly liveEvidenceContinuity?: LiveEvidenceContinuity;
  readonly journalPath?: string;
  readonly journalCounts?: JournalCounts;
  readonly sessionIdentities?: SessionIdentities;
  readonly costBridge?: MatrixCostBridge;
  readonly finalAttestation?: InRunAttestationResult;
  readonly run?: FailStopRun;
  readonly terminalState?: string;
  readonly matrixCompleted?: boolean;
  readonly completedSessions?: readonly string[];
  readonly maxLaunchesPerSession?: number;
  readonly validityGate?: TerminalAdmissionResult;
  readonly steps: readonly Readonly<Record<string, unknown>>[];
  readonly budgets?: Readonly<Record<string, unknown>>;
  readonly sessionsAfterFault?: readonly string[];
  readonly modelCallsMade?: number;
  readonly [key: string]: unknown;
}

export const ARTIFACT_DIRECTORY: string;
export const NL: string;
export const REPO_ROOT: string;
export const STAGE_CODE_PATH: string;
export const STAGE_EVIDENCE_PATH: string;

export function preparePrimaryCase(input: {
  readonly runRoot: string;
  readonly prehistory: { readonly world: string; readonly state: string };
  readonly trajectoryIds: readonly string[];
}): Readonly<Record<string, unknown>>;

export function runAdmissionClosureMatrix(input: Readonly<Record<string, unknown>>): Promise<PipelineRun>;

export function deriveProvenance(input: {
  readonly mode: string;
  readonly artifactPath: string | null | undefined;
  readonly artifactExists: boolean;
}): string;
