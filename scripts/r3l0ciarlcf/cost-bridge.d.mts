/**
 * R3-L0C-I-A-R-L-C-F §4 — TYPES FOR THE DURABLE EVIDENCE TO COST BRIDGE.
 */

export interface BridgeOutcome {
  readonly id: string;
  readonly measured: boolean;
  readonly provenance: string | null;
  readonly detail: string;
}

export interface AttributedSession {
  readonly sessionId: string | null;
  readonly outcome: BridgeOutcome;
  readonly measured: boolean;
  readonly provenance: string | null;
  readonly provenanceBasis?: Readonly<Record<string, any>>;
  readonly corroboration?: Readonly<Record<string, any>>;
  readonly reason: string | null;
  readonly bound: string | null;
  readonly sidecar?: Readonly<Record<string, any>> | null;
  readonly identity?: Readonly<Record<string, any>>;
  readonly discovery?: Readonly<Record<string, any>> | null;
  readonly interpretability?: Readonly<Record<string, any>> | null;
  readonly artifactDigest?: string | null;
  readonly fields: Readonly<Record<string, any>> | null;
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
  readonly absent: readonly Readonly<Record<string, any>>[];
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
  readonly declarationsAcceptedAsWitness: boolean;
  readonly law: string;
}

export const LIVE_EVIDENCE_DIRECTORY: string;
export const COST_BRIDGE_OUTCOMES: readonly BridgeOutcome[];
export const NL: string;

export function bridgeOutcome(id: string): BridgeOutcome;
export function digestOfFile(path: string | null | undefined): string | null;
export function deriveBridgeProvenance(input: Readonly<Record<string, any>>): Readonly<Record<string, any>>;
export function compareIdentity(input: Readonly<Record<string, any>>): Readonly<Record<string, any>>;
export function interpretArtifact(input: Readonly<Record<string, any>>): Readonly<Record<string, any>>;
export function attributeSessionFromRecord(input: Readonly<Record<string, any>>): Promise<AttributedSession>;
export function bridgeMatrixCost(input: Readonly<Record<string, any>>): Promise<MatrixCostBridge>;
export function candidateArtifacts(artifactRoot: string, sessionId: string): readonly string[];
