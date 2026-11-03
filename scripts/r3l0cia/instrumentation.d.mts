/**
 * R3-L0C-I-A §6 — TYPES FOR RECONSTRUCTION-COST INSTRUMENTATION.
 */

export const INSTRUMENTATION_PROVENANCE: { readonly LIVE_PRIMARY: string; readonly FIXTURE: string };

export interface ArtifactAttribution {
  readonly attributed: boolean;
  readonly reason: string | null;
  readonly detail?: string;
  readonly artifactPath?: string;
  readonly sessionId?: string | null;
  readonly trajectoryId?: string | null;
  readonly generation?: string | null;
  readonly attemptId?: string | null;
  readonly attemptIdInPath?: string | null;
  readonly attemptIdentityMatches?: boolean | null;
  readonly sessionIdAppearsInPath?: boolean;
  readonly unambiguous?: boolean;
}

export interface SessionCost {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly sessionId: string | null;
  readonly trajectoryId?: string | null;
  readonly generation?: string | null;
  readonly arm?: string | null;
  readonly measured: boolean;
  readonly attribution: ArtifactAttribution;
  readonly provenance: string;
  readonly reason?: string | null;
  readonly fields: Readonly<Record<string, unknown>> | null;
  readonly fieldsPresent?: readonly string[];
  readonly law?: string;
}

export function attributeArtifact(input: { readonly artifactPath: string | null; readonly session: unknown; readonly expectedAttemptId?: string | null }): ArtifactAttribution;
export function measureSessionCost(input: {
  readonly artifactPath: string | null;
  readonly session: unknown;
  readonly expectedAttemptId?: string | null;
  readonly provenance?: string;
  readonly hostJobId?: string | null;
  readonly hiddenQualityVector?: unknown;
  readonly treatmentWitness?: unknown;
  readonly uptakeWitness?: unknown;
}): Promise<SessionCost>;
export function measureMatrixCost(input: {
  readonly schedule: readonly unknown[];
  readonly artifactsBySession: Readonly<Record<string, string>>;
  readonly provenance?: string;
  readonly attemptIds?: Readonly<Record<string, string>>;
  readonly hostJobIds?: Readonly<Record<string, string>>;
  readonly vectors?: Readonly<Record<string, unknown>>;
  readonly witnesses?: Readonly<Record<string, { readonly treatment?: unknown; readonly uptake?: unknown }>>;
}): Promise<{
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly plannedSessions: number;
  readonly measuredCount: number;
  readonly rejectedCount: number;
  readonly measured: readonly SessionCost[];
  readonly rejected: readonly { readonly sessionId: string; readonly reason: string | null; readonly detail: string | null }[];
  readonly livePrimaryCount: number;
  readonly fixtureCount: number;
  readonly provenanceLabels: Readonly<Record<string, string>>;
  readonly allAttributed: boolean;
  readonly selectedLatestArtifactByConvenience: boolean;
  readonly inventedFromScriptedWorkerSource: boolean;
  readonly law: string;
}>;
export function buildArtifactMap(input: { readonly artifacts: readonly (string | { readonly path: string })[]; readonly schedule: readonly { readonly sessionId: string }[] }): {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly bySession: Readonly<Record<string, string>>;
  readonly ambiguousSessions: readonly string[];
  readonly unattributable: readonly string[];
  readonly resolvedByRecency: boolean;
  readonly law: string;
};
export const NL: string;
