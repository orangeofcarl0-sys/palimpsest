/**
 * R3-L0C-I-A §4 — TYPES FOR TREATMENT REALIZATION AND THE THREE PULL LAYERS.
 */

export const WORKER_PULL_PREFIX: string;
export const WORKER_PULL_FIELD: string;

export interface PullLayerHost {
  readonly id: string;
  readonly count: number;
  readonly handles: readonly string[];
  readonly resolved: number;
  readonly bodyDigests: readonly { readonly handle: string; readonly digest: string }[];
  readonly isUptakeEvidence: boolean;
  readonly establishes: string;
  readonly forbiddenReading: string;
}

export interface PullLayerWorker {
  readonly id: string;
  readonly parserAvailable: boolean;
  readonly parserSource: string | null;
  readonly parserFailure: string | null;
  readonly telemetryLinePresent: boolean;
  readonly telemetryFields: readonly string[];
  readonly usesShippedField: boolean;
  readonly usesSupersededField: boolean;
  readonly count: number | null;
  readonly handles: readonly string[] | null;
  readonly pulledAllVisible: boolean | null;
  readonly isUptakeEvidence: boolean;
  readonly establishes: string;
  readonly forbiddenReading: string;
}

export interface PullLayerArtifact {
  readonly id: string;
  readonly available: boolean;
  readonly reason?: string;
  readonly artifactPath?: string;
  readonly isUptakeEvidence: boolean;
  readonly establishes: string;
  readonly forbiddenReading?: string;
  readonly [key: string]: unknown;
}

export interface PullLayers {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly layers: readonly unknown[];
  readonly hostResolveAudit: PullLayerHost;
  readonly workerPullObserved: PullLayerWorker;
  readonly workerHistoryAndCapitalActions: PullLayerArtifact;
  readonly layersAreSeparate: boolean;
  readonly hostAuditIsUptakeEvidence: boolean;
  readonly workerTelemetryIsUptakeEvidence: boolean;
  readonly hostAuditExceedsWorkerUptake: boolean;
}

export interface TreatmentRealization {
  readonly arm: string;
  readonly generationId: string;
  readonly requestedSelectionKind: string;
  readonly requestedSelectionWasEmptyObject: boolean;
  readonly consumerVisibleHandles: readonly string[];
  readonly consumerVisibleKinds: readonly string[];
  readonly expectedConsumerVisibleHandles: readonly string[];
  readonly expectedCounts: Readonly<Record<string, number>> | null;
  readonly compiledCounts: Readonly<Record<string, number>>;
  readonly sameSet: boolean | null;
  readonly countsMatch: boolean | null;
  readonly requestedMatches: boolean | null;
  readonly TREATMENT_REALIZATION: string;
  readonly onMismatch: string | null;
  readonly TRIAL_DISPOSITION: string;
  readonly STOP_MATRIX: boolean;
  readonly retryPermitted: boolean;
  readonly expectationDigest: string | null;
  readonly uptakeRequiredForDelivery: boolean;
  readonly hostAuditUsedAsUptake: boolean;
}

export interface TreatmentAndUptakeObservation {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly sessionId: string | null;
  readonly arm: string;
  readonly generationId: string;
  readonly realization: TreatmentRealization;
  readonly layers: PullLayers;
  readonly TREATMENT_REALIZATION: string;
  readonly WORKER_UPTAKE: string;
  readonly workerUptakeCount: number | null;
  readonly hostResolveCount: number;
  readonly declinedVisibleCapital: boolean;
  readonly observations: readonly string[];
  readonly declinedPullStopsTheMatrix: boolean;
  readonly realizationMismatchStopsTheMatrix: boolean;
  readonly retryPermitted: boolean;
  readonly observationDigest: string;
}

export function shippedPullParser(): Promise<{ readonly available: boolean; readonly parse: ((stdout: string) => readonly string[]) | null; readonly reason: string | null; readonly source?: string }>;
export function telemetryLineShape(transcriptText: string): {
  readonly present: boolean;
  readonly lineCount?: number;
  readonly fields: readonly string[];
  readonly usesShippedField: boolean;
  readonly usesSupersededField: boolean;
  readonly payloads: readonly unknown[];
};
export function buildPullLayers(input: {
  readonly report: unknown;
  readonly transcriptPath?: string | null;
  readonly artifactPath?: string | null;
  readonly expectedHandles?: readonly string[];
}): Promise<PullLayers>;
export function computeTreatmentRealization(input: {
  readonly expectation: unknown;
  readonly report: unknown;
  readonly arm: string;
  readonly generationId: string;
  readonly requestedSelection?: unknown;
}): Promise<TreatmentRealization>;
export function observeTreatmentAndUptake(input: {
  readonly sessionId?: string;
  readonly expectation: unknown;
  readonly report: unknown;
  readonly arm: string;
  readonly generationId: string;
  readonly transcriptPath?: string | null;
  readonly artifactPath?: string | null;
  readonly requestedSelection?: unknown;
}): Promise<TreatmentAndUptakeObservation>;
export const NL: string;
