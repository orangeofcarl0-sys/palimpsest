/**
 * R3-L0C-I-A-R-L-C-F §2 — TYPES FOR THE BASELINE CONTROLS.
 */

export interface BaselineControl {
  readonly id: string;
  readonly authorityBearingFunction: string;
  readonly baselineLocation: string;
  readonly observed: Readonly<Record<string, any>>;
  readonly defectPresent: boolean;
  readonly detail: string;
}

export interface BaselineControlRun {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly source: Readonly<Record<string, string>>;
  readonly controls: readonly BaselineControl[];
  readonly declared: number;
  readonly measuredProperties: number;
  readonly PROPERTIES_VIOLATED_BY_BASELINE: number;
  readonly ALL_DEFECTS_VIOLATED_BY_BASELINE: boolean;
  readonly violated: readonly string[];
  readonly notViolated: readonly string[];
  readonly modelCallsMade: number;
  readonly law: string;
}

export const BASELINE_SOURCE: Readonly<Record<string, string>>;
export const NL: string;
export const REPO_ROOT: string;

export function writeRealFormatArtifact(input: {
  readonly directory: string;
  readonly attemptId: string;
  readonly corpusBytes?: number;
  readonly capitalBytes?: number;
}): { readonly path: string; readonly attemptId: string; readonly records: number };
export function controlCapturedNotFresh(input: { readonly base: string; readonly common: Readonly<Record<string, unknown>> }): Promise<BaselineControl>;
export function controlUnverifiedLivePrimary(input: Record<string, unknown>): Promise<BaselineControl>;
export function controlDividedIdentities(input?: Record<string, unknown>): Promise<BaselineControl>;
export function controlPartialPlanAndBudget(input?: Record<string, unknown>): Promise<BaselineControl>;
export function controlUnboundCompilerCache(input?: Record<string, unknown>): Promise<BaselineControl>;
export function runBaselineControls(input: { readonly base: string; readonly common: Readonly<Record<string, unknown>> }): Promise<BaselineControlRun>;
