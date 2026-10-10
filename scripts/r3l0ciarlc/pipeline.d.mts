/**
 * R3-L0C-I-A-R-L-C §3-§6 — TYPES FOR THE AUTHORITATIVE ADMISSION-CLOSURE PIPELINE.
 */

export const ARTIFACT_DIRECTORY: string;
export const NL: string;
export const REPO_ROOT: string;
export const STAGE_CODE_PATH: string;
export const STAGE_EVIDENCE_PATH: string;

export interface PipelineRun {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly PIPELINE: string;
  readonly refusedAt?: string;
  readonly reason?: string;
  readonly detail?: string | null;
  readonly runId?: string;
  readonly runRoot: string | null;
  readonly terminalState?: string;
  readonly matrixCompleted?: boolean;
  readonly completedSessions?: readonly string[];
  readonly maxLaunchesPerSession?: number;
  readonly steps: readonly Readonly<Record<string, unknown>>[];
  readonly launches: readonly Readonly<Record<string, unknown>>[];
  readonly [key: string]: unknown;
}

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
