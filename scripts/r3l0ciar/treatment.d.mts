/**
 * R3-L0C-I-A-R §5 — TYPES FOR TREATMENT REALIZATION AND UPTAKE PROVENANCE.
 */

export interface UptakeProvenanceResult {
  readonly provenance: string;
  readonly count: number | null;
  readonly observed: boolean;
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
  readonly provenance: string;
  readonly observed: boolean;
  readonly count: number | null;
  readonly handles: readonly string[] | null;
  readonly pulledAllVisible: boolean | null;
  readonly isUptakeEvidence: boolean;
}

export interface PullLayers {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly layers: readonly unknown[];
  readonly hostResolveAudit: Readonly<Record<string, unknown>>;
  readonly workerPullObserved: PullLayerWorker;
  readonly workerHistoryAndCapitalActions: Readonly<Record<string, unknown>>;
  readonly layersAreSeparate: boolean;
  readonly hostAuditIsUptakeEvidence: boolean;
  readonly workerTelemetryIsUptakeEvidence: boolean;
  readonly observedUptakeStates: readonly string[];
  readonly missingTelemetryReadAsZero: boolean;
  readonly hostAuditExceedsWorkerUptake: boolean;
}

export interface TreatmentObservation {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly sessionId: string | null;
  readonly arm: string;
  readonly generationId: string;
  readonly realization: Readonly<Record<string, unknown>>;
  readonly layers: PullLayers;
  readonly TREATMENT_REALIZATION: string;
  readonly WORKER_UPTAKE: string;
  readonly workerUptakeProvenance: string;
  readonly workerUptakeObserved: boolean;
  readonly workerUptakeCount: number | null;
  readonly hostResolveCount: number;
  readonly declinedVisibleCapital: boolean;
  readonly observations: readonly string[];
  readonly declinedPullStopsTheMatrix: boolean;
  readonly realizationMismatchStopsTheMatrix: boolean;
  readonly retryPermitted: boolean;
  readonly uptakeTelemetryInterpretable: boolean;
  readonly observationDigest: string;
}

export const WORKER_PULL_PREFIX: string;
export const WORKER_PULL_FIELD: string;
export const SUPERSEDED_PULL_FIELD: string;
export const NL: string;
export const UPTAKE_PROVENANCE: Readonly<Record<string, string>>;

export function shippedPullParser(): Promise<{ readonly available: boolean; readonly parse: ((text: string) => readonly string[]) | null; readonly reason: string | null; readonly source?: string }>;
export function telemetryLineShape(transcriptText: string): Readonly<Record<string, unknown>>;
export function uptakeProvenance(input: { readonly parserAvailable: boolean; readonly shape: Readonly<Record<string, unknown>>; readonly shippedCount: number | null }): UptakeProvenanceResult;
export function buildPullLayers(input: { readonly report: unknown; readonly transcriptPath: string | null; readonly artifactPath: string | null; readonly expectedHandles?: readonly string[] }): Promise<PullLayers>;
export function computeTreatmentRealization(input: { readonly expectation: unknown; readonly report: unknown; readonly arm: string; readonly generationId: string; readonly requestedSelection?: unknown }): Promise<Readonly<Record<string, unknown>>>;
export function observeTreatmentAndUptake(input: { readonly sessionId?: string; readonly expectation: unknown; readonly report: unknown; readonly arm: string; readonly generationId: string; readonly transcriptPath?: string | null; readonly artifactPath?: string | null; readonly requestedSelection?: unknown }): Promise<TreatmentObservation>;
