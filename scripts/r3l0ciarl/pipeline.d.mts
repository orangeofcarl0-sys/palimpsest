/**
 * R3-L0C-I-A-R-L §1-§4 — TYPES FOR THE AUTHORITATIVE PIPELINE.
 */

export interface PipelineStep {
  readonly step: number;
  readonly id: string;
  readonly mutated: boolean;
  readonly observation: Readonly<Record<string, unknown>>;
}

export interface LiveMeasurementRun {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly PIPELINE: string;
  readonly stoppedAt?: string;
  readonly modelCallsMade?: number;
  readonly containment?: Readonly<Record<string, unknown>>;
  readonly refusedAt?: string;
  readonly reason?: string;
  readonly detail?: string | null;
  readonly runId?: string;
  readonly runRoot: string;
  readonly claim?: Readonly<Record<string, unknown>>;
  readonly mode?: Readonly<Record<string, unknown>>;
  readonly primaryBinding?: Readonly<Record<string, unknown>>;
  readonly authorizationVerification?: Readonly<Record<string, unknown>> | null;
  readonly preExposureChecks?: Readonly<Record<string, unknown>>;
  readonly modelRouteIdentity?: string;
  readonly scheduleLength?: number;
  readonly trajectoryCount?: number;
  readonly launches: readonly Readonly<Record<string, unknown>>[];
  readonly faultsInjected?: readonly Readonly<Record<string, unknown>>[];
  readonly outcomes?: Readonly<Record<string, unknown>>;
  readonly liveEvidence?: Readonly<Record<string, unknown>>;
  readonly liveEvidenceContinuity?: Readonly<Record<string, unknown>>;
  readonly postflight?: Readonly<Record<string, unknown>>;
  readonly journalCounts?: Readonly<Record<string, unknown>>;
  readonly sessionIdentities?: Readonly<Record<string, unknown>>;
  readonly installationBefore?: string;
  readonly run: Readonly<Record<string, unknown>> | null;
  readonly maxLaunchesPerSession?: number;
  readonly terminalState?: string;
  readonly completedSessions?: readonly string[];
  readonly steps: readonly PipelineStep[];
  readonly budgets?: Readonly<Record<string, unknown>>;
  readonly sessionsAfterFault?: readonly string[];
}

export const ARTIFACT_DIRECTORY: string;
export const NL: string;
export const REPO_ROOT: string;
export const STAGE_CODE_PATH: string;
export const STAGE_EVIDENCE_PATH: string;

export function preparePrimaryCase(input: { readonly runRoot: string; readonly prehistory: { readonly world: string; readonly state: string }; readonly trajectoryIds: readonly string[] }): Readonly<Record<string, unknown>>;
export function runLiveMeasurementMatrix(input: Readonly<Record<string, unknown>>): Promise<LiveMeasurementRun>;
export function deriveProvenance(input: { readonly mode: string; readonly artifactPath: string | null; readonly artifactExists: boolean }): string;
export const readFileSync: typeof import("node:fs").readFileSync;
