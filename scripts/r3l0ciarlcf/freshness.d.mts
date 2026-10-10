/**
 * R3-L0C-I-A-R-L-C-F §3 — TYPES FOR THE ADMISSION-TIME MEASUREMENT.
 */

export interface AdmissionTimeMeasurement {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly basis: string;
  readonly refused: boolean;
  readonly reason: string | null;
  readonly preflightClosureDigest: string | null;
  readonly admissionClosureDigest: string | null;
  readonly admissionRouteIdentity: string | null;
  readonly preflightRouteIdentity?: string | null;
  readonly boundClosureDigest: string | null;
  readonly recomputedAt: string | null;
  readonly drifted: boolean | null;
  readonly routeDrifted?: boolean;
  readonly closureMatchesPlan: boolean;
  readonly routeMatchesPlan?: boolean;
  readonly injectionUsed?: boolean;
  readonly compiledVerificationEvaluated?: boolean | null;
  readonly skippedCompiledCheckIsNotPrimaryVerification?: boolean;
  readonly fresh: boolean;
  readonly fieldsPresent?: readonly string[];
  readonly law?: string;
}

export const MEASURED_FIELDS: readonly string[];
export const NL: string;

export function admissionTimeMeasurement(input: {
  readonly mode: string;
  readonly boundClosureDigest?: string | null;
  readonly preflightClosureDigest?: string | null;
  readonly preflightRouteIdentity?: string | null;
  readonly recompute?: (() => Promise<any>) | null;
  readonly injection?: any;
}): Promise<AdmissionTimeMeasurement>;
