/**
 * R3-L0C-I-A-R-L-C-F §12 — TYPES FOR THE QUALIFICATION ORCHESTRATOR.
 */

export interface QualificationRecord {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly modelCallsMade: number;
  readonly enteredPrimaryExecution: boolean;
  readonly prehistory: Readonly<Record<string, any>>;
  readonly correctionGates: Readonly<Record<string, any>>;
  readonly executionClosure: Readonly<Record<string, any>>;
  readonly attestation: Readonly<Record<string, any>>;
  readonly containment: Readonly<Record<string, any>>;
  readonly primaryMatrix: Readonly<Record<string, any>>;
  readonly faultInjection: Readonly<Record<string, any>>;
  readonly realMutations: Readonly<Record<string, any>>;
  readonly productionControls: Readonly<Record<string, any>>;
  readonly timeouts: Readonly<Record<string, any>>;
  readonly quarantine: Readonly<Record<string, any>>;
  readonly authority: Readonly<Record<string, any>>;
  readonly immutability: Readonly<Record<string, any>>;
  readonly planClosure: Readonly<Record<string, any>>;
  readonly planContentDigest: Readonly<Record<string, any>>;
  readonly plan: Readonly<Record<string, any>>;
  readonly verdicts: Readonly<Record<string, string>>;
  readonly readiness: Readonly<Record<string, any>>;
}

export const NL: string;

export function deterministicArtifactFixture(input: { readonly artifactRoot: string }): Promise<(input: Readonly<Record<string, any>>) => Readonly<Record<string, any>>>;
export function runQualification(input?: Readonly<Record<string, any>>): Promise<QualificationRecord>;
export function writeQualification(input?: Readonly<Record<string, any>>): Promise<QualificationRecord>;
