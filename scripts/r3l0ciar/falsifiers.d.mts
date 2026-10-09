/**
 * R3-L0C-I-A-R §1 — TYPES FOR THE ESCAPED-BOUNDARY FALSIFIERS.
 */

export interface FalsifierEntry {
  readonly id: string;
  readonly PROPERTY_VIOLATED_BY_BASELINE: boolean;
  readonly detail: string;
  readonly [key: string]: unknown;
}

export interface CorrectionFalsifiers {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly source: Readonly<Record<string, string>>;
  readonly falsifiers: readonly FalsifierEntry[];
  readonly declaredDefects: number;
  readonly measuredProperties: number;
  readonly PROPERTIES_VIOLATED_BY_BASELINE: number;
  readonly ALL_PROPERTIES_VIOLATED_BY_BASELINE: boolean;
  readonly violated: readonly string[];
  readonly notViolated: readonly string[];
  readonly modelCallsMade: number;
  readonly law: string;
}

export function healthyPreTrialInputs(input: {
  readonly schedule: readonly unknown[];
  readonly closure: unknown;
  readonly containment: unknown;
}): Readonly<Record<string, unknown>>;
export function uptakeFixtures(): { readonly dir: string; readonly paths: Readonly<Record<string, string>> };
export function runCorrectionFalsifiers(input: {
  readonly schedule: readonly unknown[];
  readonly closure: unknown;
  readonly containment: unknown;
  readonly trajectoryIds: readonly string[];
}): Promise<CorrectionFalsifiers>;
export const NL: string;
