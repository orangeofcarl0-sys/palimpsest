/**
 * R3-L0C-I-A-R-L-C §2 — TYPES FOR THE BASELINE CONTROLS.
 */

export interface BaselineSource {
  readonly revision: string;
  readonly stage: string;
  readonly pipeline: string;
  readonly liveEvidence: string;
  readonly postflight: string;
  readonly primaryBinding: string;
  readonly attestation: string;
  readonly journal: string;
  readonly journalContract: string;
  readonly instrumentation: string;
}

export interface RealFormatArtifact {
  readonly path: string;
  readonly attemptId: string;
  readonly records: number;
}

export const BASELINE_SOURCE: BaselineSource;

export function writeRealFormatArtifact(input: {
  readonly directory: string;
  readonly attemptId: string;
  readonly corpusBytes?: number;
  readonly capitalBytes?: number;
}): RealFormatArtifact;

export function controlDurableCostDisconnection(input: { readonly directory: string }): Promise<Readonly<Record<string, unknown>>>;
export function controlPostflightOutsideAdmission(input: { readonly source: string }): Readonly<Record<string, unknown>>;
export function controlWeakAuthorizationTrust(): Promise<Readonly<Record<string, unknown>>>;
export function controlAttestationOutsideGate(input: { readonly source: string }): Promise<Readonly<Record<string, unknown>>>;
export function treeDigests(root: string): Readonly<Record<string, string>>;
export const NL: string;
