/**
 * R3-L0C-I-A-R §6 — TYPES FOR THE RECONSTRUCTION-COST ATTRIBUTION.
 */

export interface ArtifactAttribution {
  readonly attributed: boolean;
  readonly reason: string | null;
  readonly detail?: string;
  readonly artifactPath?: string;
  readonly identity?: Readonly<Record<string, unknown>>;
  readonly identityFields?: readonly string[];
  readonly attemptIdInPath?: string | null;
  readonly hostJobIdInPath?: string | null;
  readonly sessionIdInPath?: boolean;
  readonly corroboratingIdentities?: readonly string[];
  readonly checks?: readonly { readonly field: string; readonly expected: unknown; readonly actual: unknown; readonly matches: boolean }[];
  readonly filenameMatchingAlone?: boolean;
}

export interface SessionCost {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly sessionId: string | null;
  readonly measured: boolean;
  readonly attribution: ArtifactAttribution;
  readonly provenance: string;
  readonly reason: string | null;
  readonly fields: Readonly<Record<string, unknown>> | null;
  readonly fieldsPresent?: readonly string[];
}

export interface MatrixCost {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly plannedSessions: number;
  readonly measuredCount: number;
  readonly rejectedCount: number;
  readonly measured: readonly SessionCost[];
  readonly rejected: readonly { readonly sessionId: string; readonly reason: string; readonly detail: string | null }[];
  readonly livePrimaryCount: number;
  readonly fixtureCount: number;
  readonly provenanceLabels: Readonly<Record<string, string>>;
  readonly allAttributed: boolean;
  readonly allSixteenAttributed: boolean;
  readonly blocksCausalVerdict: boolean;
  readonly selectedLatestArtifactByConvenience: boolean;
  readonly inventedFromScriptedWorkerSource: boolean;
  readonly law: string;
}

export const NL: string;
export const join: (...parts: string[]) => string;
export const ARTIFACT_IDENTITY_FIELDS: readonly string[];
export const INSTRUMENTATION_PROVENANCE: Readonly<Record<string, string>>;

export function attributeArtifact(input: Readonly<Record<string, unknown>>): ArtifactAttribution;
export function measureSessionCost(input: Readonly<Record<string, unknown>>): Promise<SessionCost>;
export function measureMatrixCost(input: Readonly<Record<string, unknown>>): Promise<MatrixCost>;
export function discoverSessionArtifacts(home: string): Promise<Readonly<Record<string, unknown>>>;
export function buildArtifactMap(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
