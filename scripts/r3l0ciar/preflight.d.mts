/**
 * R3-L0C-I-A-R §3 — TYPES FOR THE PRE-EXPOSURE MEASUREMENTS.
 */

export interface RealizationPreflight {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly cases: readonly { readonly arm: string; readonly generation: string; readonly expectedHandles: number; readonly emptyForH: boolean | null; readonly nonEmptyForC: boolean | null }[];
  readonly TREATMENT_BOUNDARY: string;
  readonly PASS: boolean;
  readonly hIsEmpty: boolean;
  readonly cIsNonEmpty: boolean;
  readonly modelCallsMade: number;
  readonly law: string;
}

export interface RouteConfiguration {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly effective: Readonly<Record<string, unknown>>;
  readonly configured: Readonly<Record<string, unknown>>;
  readonly hashesOrExposesSecretValues: boolean;
  readonly source: string;
  readonly law: string;
}

export const NL: string;

export function realizationPreflight(input: { readonly admittedRefs: readonly unknown[]; readonly generationExposures: Readonly<Record<string, readonly string[]>> }): Promise<RealizationPreflight>;
export function effectiveRouteConfiguration(): Promise<RouteConfiguration>;
export function plannedRouteConfiguration(): Promise<Readonly<Record<string, unknown>>>;
