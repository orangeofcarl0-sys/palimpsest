/**
 * R3-L0C-I-A-R-L-C-F §4 — TYPES FOR ARTIFACT IDENTITY AND EXECUTION PROVENANCE.
 */

export interface DiscoveryOutcome {
  readonly id: string;
  readonly discovered: boolean;
  readonly ambiguous: boolean;
  readonly detail: string;
}

export interface ArtifactDiscovery {
  readonly id: string;
  readonly discovered: boolean;
  readonly ambiguous: boolean;
  readonly detail: string;
  readonly home: string | null;
  readonly sessionId?: string | null;
  readonly expectedAttemptId?: string | null;
  readonly candidates: readonly string[];
  readonly selected: { readonly path: string; readonly attemptId: string | null; readonly bytes: number; readonly digest: string | null } | null;
  readonly nearMisses?: readonly (string | null)[];
  readonly artifactsSeen?: number;
  readonly identifiableSeen?: number;
  readonly selectedLatestByMtime?: boolean;
  readonly law?: string;
}

export interface WitnessCorroboration {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly corroborated: boolean;
  readonly verdict: string;
  readonly missing: readonly string[];
  readonly required?: readonly string[];
  readonly reason: string;
  readonly declarationsAcceptedAsObservations: boolean;
  readonly routeStringAloneSufficient: boolean;
  readonly sidecarModeAloneSufficient: boolean;
}

export const SESSION_ARTIFACT_NAME: string;
export const NL: string;

export function discoveryOutcome(id: string): DiscoveryOutcome;
export function normalizeAttemptId(value: string | null | undefined): string | null;
export function attemptIdentityEquals(left: string | null | undefined, right: string | null | undefined): boolean;
export function attemptIdFromPath(path: string | null | undefined): string | null;
export function discoverScheduledArtifact(input: {
  readonly dshHomePath: string | null;
  readonly sessionId?: string | null;
  readonly expectedAttemptId?: string | null;
  readonly maxDepth?: number;
}): ArtifactDiscovery;
export function corroborateExecutionWitness(input: {
  readonly witness?: Readonly<Record<string, any>> | null;
  readonly scheduledRunId?: string | null;
  readonly scheduledSessionId?: string | null;
  readonly expectedAttemptId?: string | null;
  readonly discovery?: ArtifactDiscovery | null;
  readonly artifactDigestVerified?: boolean;
}): WitnessCorroboration;
