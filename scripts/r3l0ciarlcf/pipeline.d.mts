/**
 * R3-L0C-I-A-R-L-C-F §3/§4 — TYPES FOR THE MEASUREMENT-FIDELITY PIPELINE.
 */

export interface PipelineRun {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly PIPELINE: string;
  readonly refusedAt?: string;
  readonly stoppedAt?: string;
  readonly reason?: string | null;
  readonly detail?: string | null;
  readonly runId?: string;
  readonly runRoot?: string | null;
  readonly claim?: Readonly<Record<string, any>>;
  readonly mode?: Readonly<Record<string, any>>;
  readonly primaryBinding?: Readonly<Record<string, any>>;
  readonly authorityVerification?: Readonly<Record<string, any>> | null;
  readonly trustedHost?: Readonly<Record<string, any>>;
  readonly preExposureChecks?: Readonly<Record<string, any>>;
  readonly modelRouteIdentity?: string;
  readonly containment?: Readonly<Record<string, any>> | null;
  readonly s0Digest?: string;
  readonly s1Digest?: string;
  readonly s2Digest?: string;
  readonly scheduleLength?: number;
  readonly trajectoryCount?: number;
  readonly launches: readonly Readonly<Record<string, any>>[];
  readonly faultsInjected?: readonly Readonly<Record<string, any>>[];
  readonly outcomes?: Readonly<Record<string, any>>;
  readonly liveEvidence?: Readonly<Record<string, any>>;
  readonly liveEvidenceContinuity?: Readonly<Record<string, any>>;
  readonly journalPath?: string;
  readonly journalCounts?: Readonly<Record<string, any>>;
  readonly costBridge?: Readonly<Record<string, any>>;
  readonly costCompleteness?: Readonly<Record<string, any>>;
  readonly finalAttestation?: Readonly<Record<string, any>>;
  readonly finalReconciliation?: Readonly<Record<string, any>>;
  readonly run?: Readonly<Record<string, any>> | null;
  readonly terminalState?: string;
  readonly matrixCompleted?: boolean;
  readonly completedSessions?: readonly string[];
  readonly maxLaunchesPerSession?: number;
  readonly validityGate?: Readonly<Record<string, any>>;
  readonly steps: readonly Readonly<Record<string, any>>[];
  readonly budgets?: Readonly<Record<string, any>>;
  readonly sessionsAfterFault?: readonly string[];
  readonly modelCallsMade?: number;
}

export const ARTIFACT_DIRECTORY: string;
export const NL: string;
export const REPO_ROOT: string;
export const STAGE_CODE_PATH: string;
export const STAGE_EVIDENCE_PATH: string;
export const readFileSync: typeof import('node:fs').readFileSync;

export function preparePrimaryCase(input: Readonly<Record<string, any>>): Readonly<Record<string, any>>;
export function runMeasurementFidelityMatrix(input: Readonly<Record<string, any>>): Promise<PipelineRun>;
export function deriveProvenance(input: Readonly<Record<string, any>>): string;
