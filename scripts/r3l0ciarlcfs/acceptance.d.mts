/**
 * R3-L0C-I-A-R-L-C-F-S §3-§7 — TYPES FOR THE PRODUCTION-PATH CONTROLS.
 */

export interface ProductionControl {
  readonly id: string;
  readonly authorityBearingFunction: string;
  readonly durableEvidence: string;
  readonly positiveControl: Record<string, unknown>;
  readonly mutations: Record<string, boolean>;
  readonly mutant: Record<string, unknown>;
  readonly PASS: boolean;
  readonly testFixture?: boolean;
}

export const NL: string;

export function writeArtifact(input: { directory: string; attemptId: string; records: readonly unknown[] }): { readonly path: string; readonly attemptId: string; readonly records: number };
export function controlArtifactValidity(): Promise<ProductionControl>;
export function controlSafeCleanup(): Promise<ProductionControl>;
export function controlTrialEvidenceIdentity(): Promise<ProductionControl>;
export function controlAuthorizationVerdict(): Promise<ProductionControl>;
export function controlCommittedPlanIdentity(): Promise<ProductionControl>;
