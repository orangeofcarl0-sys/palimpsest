/**
 * R3-L0C-I-A-R-L-C §3 Gate A — TYPES FOR THE DURABLE COST BRIDGE.
 */

export interface BridgeOutcome {
  readonly id: string;
  readonly measured: boolean;
  readonly provenance: string | null;
  readonly detail: string;
}

export interface ProvenanceBasis {
  readonly recordRouteIsPrimary: boolean;
  readonly sidecarModeIsPrimary: boolean;
  readonly artifactDigestVerified: boolean;
  readonly recordRoute: string | null;
  readonly sidecarMode: string | null;
}

export interface IdentityComparison {
  readonly attemptId: string | null;
  readonly hostJobId: string | null;
  readonly attemptIdInPath: string | null;
  readonly hostJobIdInPath: string | null;
  readonly recordAttempt: string | null;
  readonly sidecarAttempt: string | null;
  readonly recordJob: string | null;
  readonly sidecarJob: string | null;
  readonly conflicts: readonly string[];
  readonly exact: boolean;
}

export interface AttributedSession {
  readonly sessionId: string | null;
  readonly outcome: BridgeOutcome;
  readonly measured: boolean;
  readonly provenance: string | null;
  readonly provenanceBasis?: ProvenanceBasis;
  readonly reason: string | null;
  readonly bound: string | null;
  readonly sidecar?: Readonly<Record<string, unknown>> | null;
  readonly identity?: IdentityComparison;
  readonly artifactDigest?: string | null;
  readonly fields: Readonly<Record<string, unknown>> | null;
  readonly measuredZeroIsDistinguishableFromAbsence?: boolean;
  readonly candidates?: readonly string[];
  readonly law?: string;
}

export interface MatrixCostBridge {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly journalPath: string;
  readonly journalIntact: boolean;
  readonly journalRecords: number;
  readonly trialRecords: number;
  readonly plannedSessions: number;
  readonly measuredCount: number;
  readonly absentCount: number;
  readonly measured: readonly AttributedSession[];
  readonly absent: readonly { readonly sessionId: string | null; readonly outcome: string; readonly reason: string | null; readonly detail: string }[];
  readonly perSession: readonly AttributedSession[];
  readonly livePrimaryCount: number;
  readonly fixtureCount: number;
  readonly provenance: string;
  readonly interpretable: boolean;
  readonly allAttributed: boolean;
  readonly allSixteenLivePrimary: boolean;
  readonly blocksCausalVerdict: boolean;
  readonly inventedFromMissingEvidence: boolean;
  readonly selectedLatestArtifactByConvenience: boolean;
  readonly law: string;
}

export const LIVE_EVIDENCE_DIRECTORY: string;
export const SESSION_ARTIFACT_NAME: string;
export const NL: string;

export function digestOfFile(path: string | null | undefined): string | null;
export function bridgeOutcome(id: string): BridgeOutcome;
export function deriveBridgeProvenance(input: {
  readonly record: Readonly<Record<string, unknown>> | null | undefined;
  readonly sidecar: Readonly<Record<string, unknown>> | null | undefined;
  readonly artifactDigestVerified: boolean;
}): { readonly provenance: string; readonly basis: ProvenanceBasis; readonly live: boolean };
export function attributeSessionFromRecord(input: {
  readonly runRoot: string;
  readonly record: Readonly<Record<string, unknown>>;
  readonly plannedSession?: Readonly<Record<string, unknown>> | null;
  readonly artifactRoot?: string | null;
}): Promise<AttributedSession>;
export function compareIdentity(input: {
  readonly record: Readonly<Record<string, unknown>> | null | undefined;
  readonly sidecar: Readonly<Record<string, unknown>> | null | undefined;
  readonly artifactPath: string | null;
  readonly plannedSession?: Readonly<Record<string, unknown>> | null;
}): IdentityComparison;
export function candidateArtifacts(artifactRoot: string, sessionId: string): readonly string[];
export function bridgeMatrixCost(input: {
  readonly journalPath: string;
  readonly runRoot: string;
  readonly plannedSessions?: readonly string[] | null;
  readonly artifactRoot?: string | null;
}): Promise<MatrixCostBridge>;
