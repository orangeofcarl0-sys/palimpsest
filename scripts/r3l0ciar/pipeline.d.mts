/**
 * R3-L0C-I-A-R §2 — TYPES FOR THE AUTHORITATIVE PIPELINE.
 */

export interface PipelineSteps {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly PIPELINE: string;
  readonly refusedAt?: string;
  readonly reason?: string;
  readonly detail?: string | null;
  readonly runId?: string;
  readonly runRoot: string;
  readonly claim?: Readonly<Record<string, unknown>>;
  readonly mode?: Readonly<Record<string, unknown>>;
  readonly preExposureChecks?: Readonly<Record<string, unknown>>;
  readonly modelRouteIdentity?: string;
  readonly scheduleLength?: number;
  readonly trajectoryCount?: number;
  readonly launches: readonly Readonly<Record<string, unknown>>[];
  readonly faultsInjected?: readonly Readonly<Record<string, unknown>>[];
  readonly outcomes?: Readonly<Record<string, unknown>>;
  readonly run: Readonly<Record<string, unknown>> | null;
  readonly maxLaunchesPerSession?: number;
  readonly terminalState?: string;
  readonly completedSessions?: readonly string[];
  readonly steps: readonly Readonly<Record<string, unknown>>[];
  readonly budgets?: Readonly<Record<string, unknown>>;
  readonly sessionsAfterFault?: readonly string[];
}

export const NL: string;
export const REPO_ROOT: string;
export const STAGE_CODE_PATH: string;
export const STAGE_EVIDENCE_PATH: string;

export function preparePrimaryCase(input: { readonly runRoot: string; readonly prehistory: { readonly world: string; readonly state: string }; readonly trajectoryIds: readonly string[] }): Readonly<Record<string, unknown>>;
export function runPrimaryMatrix(input: Readonly<Record<string, unknown>>): Promise<PipelineSteps>;
export function inspectActivationRoot(input: { readonly runRoot: string; readonly runId: string }): Readonly<Record<string, unknown>>;
export const readFileSync: typeof import("node:fs").readFileSync;
