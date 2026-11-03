/**
 * R3-L0C-I-A-R-L §1 — TYPES FOR THE LIVE-EVIDENCE SIDECAR.
 */

export interface LiveEvidenceSidecar {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly sessionId: string | null;
  readonly sessionArtifactPath: string | null;
  readonly sessionArtifactDigest: string | null;
  readonly hiddenInvariantVector: Readonly<Record<string, unknown>> | null;
  readonly attemptId: string | null;
  readonly hostJobId: string | null;
  readonly costProvenance: string | null;
  readonly mode: string | null;
  readonly [key: string]: unknown;
}

export interface LiveEvidenceRead {
  readonly found: boolean;
  readonly sessionId: string;
  readonly path: string;
  readonly sidecar: LiveEvidenceSidecar | null;
  readonly digest: string | null;
  readonly boundDigest?: string;
  readonly matchesBinding: boolean;
  readonly reason: string | null;
}

export interface LiveEvidenceContinuity {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly sessions: number;
  readonly perSession: readonly {
    readonly sessionId: string;
    readonly bound: boolean;
    readonly sidecarFound: boolean;
    readonly matchesBinding: boolean;
    readonly carriedFields: readonly string[];
    readonly nullFields: readonly string[];
    readonly artifactPath: string | null;
    readonly hiddenVectorPresent: boolean;
    readonly attemptId: string | null;
    readonly hostJobId: string | null;
    readonly costProvenance: string | null;
    readonly reason: string | null;
  }[];
  readonly allBound: boolean;
  readonly allMatched: boolean;
  readonly allComplete: boolean;
  readonly LIVE_ARTIFACT_PROPAGATION: string;
  readonly law: string;
}

export const LIVE_EVIDENCE_SCHEMA: number;
export const NL: string;

export function writeLiveEvidence(input: {
  readonly runRoot: string;
  readonly sessionId: string;
  readonly sessionArtifactPath?: string | null;
  readonly hiddenInvariantVector?: unknown;
  readonly attemptId?: string | null;
  readonly hostJobId?: string | null;
  readonly costProvenance?: string | null;
  readonly mode?: string | null;
  readonly extra?: Readonly<Record<string, unknown>>;
}): { readonly path: string; readonly sidecar: LiveEvidenceSidecar; readonly digest: string; readonly missingFields: readonly string[] };
export function readLiveEvidence(input: { readonly runRoot: string; readonly sessionId: string; readonly binding: string | null }): LiveEvidenceRead;
export function liveEvidenceBinding(digest: string): Readonly<Record<string, string>>;
export function bindingOf(record: Readonly<Record<string, unknown>>): string | null;
export function verifyLiveEvidenceContinuity(input: { readonly runRoot: string; readonly records: readonly Readonly<Record<string, unknown>>[] }): LiveEvidenceContinuity;
export function listLiveEvidence(runRoot: string): readonly string[];
