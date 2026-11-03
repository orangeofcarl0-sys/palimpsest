/**
 * R3-L0C-I-A-R-C-F §6 — TYPES FOR FULL PLAN IDENTITY.
 */

export interface PlanDigestCoverage {
  readonly available: boolean;
  readonly coveredFields: readonly string[];
  readonly coveredCount?: number;
  readonly namedMaterialFields?: readonly string[];
  readonly missingMaterialFields: readonly string[];
  readonly selfFieldExcluded?: string;
  readonly exclusionIsByNameNotByProjection?: boolean;
  readonly coversEveryPlanField?: boolean;
  readonly reason?: string;
}

export interface PlanDigestMutations {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly baseDigest: string | null;
  readonly mutations: readonly { readonly id: string; readonly description: string; readonly moved: boolean; readonly digest?: string | null }[];
  readonly allMutationsMove: boolean;
  readonly unmoved: readonly string[];
  readonly computedByOverride: boolean;
  readonly planWritten: boolean;
  readonly PROVEN: boolean;
  readonly law?: string;
  readonly reason?: string;
}

export const NL: string;

export function canonical(value: unknown): string;
export function fullPlanDigest(plan: any): string | null;
export function planDigestCoverage(plan: any): PlanDigestCoverage;
export function proveFullPlanDigestMoves(plan: any): PlanDigestMutations;
