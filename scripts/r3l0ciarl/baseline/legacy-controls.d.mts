/**
 * R3-L0C-I-A-R-L §1-§4 — TYPES FOR THE BASELINE CONTROLS.
 */

export interface ControlEntry {
  readonly id: string;
  readonly defectPresent: boolean;
  readonly detail: string;
  readonly [key: string]: unknown;
}

export const BASELINE_SOURCE: Readonly<Record<string, string>>;
export const NL: string;

export function writeRealFormatArtifact(input: {
  readonly directory: string;
  readonly attemptId: string;
  readonly corpusBytes?: number;
  readonly capitalBytes?: number;
}): { readonly path: string; readonly attemptId: string; readonly records: number };

export function controlLiveEvidenceContinuity(input: { readonly directory: string }): Promise<ControlEntry>;
export function controlPostflightFreshness(input: {
  readonly preflightClosureDigest: string;
  readonly postflightClosureDigest: string;
  readonly callerReplacements: number;
  readonly callerRetries: number;
  readonly journalLaunches: number;
}): ControlEntry;
export function controlPrimaryInputBinding(input: {
  readonly source: string;
  readonly PRIMARY_DERIVED_INPUTS: readonly string[];
}): ControlEntry;
export function controlAuthorityVerification(): Promise<ControlEntry>;
export function controlRuntimeAttestation(input: { readonly dshHomePath: string }): ControlEntry;
export function treeDigests(root: string): Readonly<Record<string, string>>;
