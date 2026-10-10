/**
 * R3-L0C-I-A-R-L-C-F-S §6 — TYPES FOR THE ARTIFACT ENVELOPE VALIDITY.
 */

export interface ArtifactValidity {
  readonly schemaVersion?: number;
  readonly stage?: string;
  readonly kind?: string;
  readonly artifactPath: string | null;
  readonly state: string;
  readonly interpretable: boolean;
  readonly readable: boolean;
  readonly envelopeValid: boolean;
  readonly completionObserved: boolean;
  readonly completionBoundary?: string;
  readonly claimedEndpoint: string | null;
  readonly recordCount: number;
  readonly unparsedLines: number;
  readonly dispatchCount?: number;
  readonly types: readonly string[];
  readonly hasSessionStart: boolean;
  readonly hasResultSubmission: boolean;
  readonly hasTurnEnd: boolean;
  readonly partial: boolean;
  readonly turnEndReason?: string | null;
  readonly zeroIsFromRealObservation: boolean;
  readonly stateDetail?: string;
  readonly reason: string | null;
  readonly law?: string;
}

export interface ValidatedMeasurement {
  readonly validity: ArtifactValidity;
  readonly measured: boolean;
  readonly fields: Record<string, unknown> | null;
  readonly cost: any;
  readonly costFieldsAbsent: boolean;
  readonly measuredZero?: boolean;
  readonly measuredZeroIsGenuine?: boolean;
  readonly satisfiesCostMeasuredComplete: boolean;
  readonly satisfiesLivePrimaryCostComplete: boolean;
  readonly reason: string | null;
}

export const NL: string;

export function validityState(id: string): { readonly id: string; readonly interpretable: boolean; readonly detail: string };
export function validateArtifactEnvelope(input: { artifactPath: string; decompressFrames: (path: string) => string; sessionRecords: (text: string) => readonly any[]; claimedEndpoint?: string }): ArtifactValidity;
export function measureValidatedArtifact(input: { artifactPath: string; attemptId?: string | null; claimedEndpoint?: string }): Promise<ValidatedMeasurement>;
