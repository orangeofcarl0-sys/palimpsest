/**
 * R3-L0C-I-A-R-L-C §10 — TYPES FOR THE QUALIFICATION ORCHESTRATOR.
 */

export interface QualificationRecord {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly modelCallsMade: number;
  readonly enteredPrimaryExecution: boolean;
  readonly [key: string]: unknown;
}

export const NL: string;

export function deterministicArtifactFixture(input: { readonly artifactRoot: string }): Promise<(input: { readonly session: Readonly<Record<string, unknown>>; readonly outcome: Readonly<Record<string, unknown>> }) => Readonly<Record<string, unknown>>>;
export function runQualification(input?: { readonly base?: string; readonly hangTimeoutMs?: number; readonly authorizationDecision?: Readonly<Record<string, unknown>> }): Promise<QualificationRecord>;
export function writeQualification(input?: { readonly base?: string }): Promise<QualificationRecord>;
