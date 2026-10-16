/**
 * Trajectory-P2-E1R §9 — TYPE SURFACE for the `.mjs` unified assay evaluation seam.
 */
import type { FrozenAssayTruth } from "./experimental-truth.d.mts";
import type { ExecutionObservation, OracleResult } from "./source-aware-oracle.d.mts";

export declare const LEGACY_ORACLE_STATUS: {
  readonly module: string;
  readonly classification: string;
  readonly usedByActiveAssay: boolean;
  readonly why: string;
};

export declare const OFFICIAL_ORACLE: { readonly module: string; readonly version: string; readonly entry: string };

export interface AssayEvaluationInput {
  readonly frozenTruth: FrozenAssayTruth;
  readonly structuredAnswer: unknown;
  readonly observedActions?: ExecutionObservation | null;
  readonly arm?: string;
}

export type AssayEvaluationResult = (OracleResult & { readonly officialOracle: string; readonly truthDigest: string }) | { readonly ok: false; readonly detail: string; readonly oracleVersion: string };

export declare function evaluateAssayResult(input: AssayEvaluationInput): AssayEvaluationResult;
