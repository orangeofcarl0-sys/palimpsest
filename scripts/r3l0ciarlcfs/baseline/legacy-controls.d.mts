/**
 * R3-L0C-I-A-R-L-C-F-S §2 — TYPES FOR THE BASELINE FAILING CONTROLS.
 */

export interface BaselineControl {
  readonly id: string;
  readonly authorityBearingFunction: string;
  readonly baselineLocation: string;
  readonly durableEvidence: string;
  readonly observed: Record<string, unknown>;
  readonly defectPresent: boolean;
  readonly detail: string;
  readonly testFixture?: boolean;
}

export interface BaselineControlRun {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly source: Record<string, unknown>;
  readonly controls: readonly BaselineControl[];
  readonly declared: number;
  readonly measured: number;
  readonly ALL_DEFECTS_CONFIRMED: boolean;
  readonly violated: readonly string[];
  readonly notViolated: readonly string[];
  readonly modelCallsMade: number;
  readonly law: string;
}

export const BASELINE_SOURCE: Record<string, string>;
export const NL: string;

export function controlCrossArtifactPlanMismatch(): Promise<BaselineControl>;
export function controlUnsafeCleanupFallback(): BaselineControl;
export function controlPartialTrialIdentity(): Promise<BaselineControl>;
export function controlFalseArtifactInterpretability(): Promise<BaselineControl>;
export function controlAuthorizationVerdictInconsistency(): Promise<BaselineControl>;
export function writeArtifact(input: { directory: string; attemptId: string; records: readonly unknown[] }): { readonly path: string; readonly attemptId: string; readonly records: number };
export function runBaselineControls(): Promise<BaselineControlRun>;
