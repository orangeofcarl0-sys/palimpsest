/**
 * R3-L0C-I-A-R-L-C-F §12/§14 — TYPES FOR THE STAGE RESULT.
 */

export interface StageResult {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly baseline: string;
  readonly verdicts: Readonly<Record<string, string>>;
  readonly readiness: Readonly<Record<string, any>>;
  readonly modelCallsMade: number;
  readonly enteredPrimaryExecution: boolean;
  readonly correctionGaps: Readonly<Record<string, any>>;
  readonly measurementFidelityPipeline: Readonly<Record<string, any>>;
  readonly costBridge: Readonly<Record<string, any>>;
  readonly causalReduction: Readonly<Record<string, any>>;
  readonly realMutations: Readonly<Record<string, any>>;
  readonly liveEvidence: Readonly<Record<string, any>>;
  readonly attestation: Readonly<Record<string, any>>;
  readonly authority: Readonly<Record<string, any>>;
  readonly faultInjection: Readonly<Record<string, any>>;
  readonly executionClosure: Readonly<Record<string, any>>;
  readonly planClosure: Readonly<Record<string, any>>;
  readonly planContentDigest: Readonly<Record<string, any>>;
  readonly immutability: Readonly<Record<string, any>>;
  readonly plan: Readonly<Record<string, any>>;
  readonly stageStop: Readonly<Record<string, any>>;
  readonly finalAcceptanceQuestion: Readonly<Record<string, any>>;
}

export const NL: string;

export function buildStageResult(qualification: Readonly<Record<string, any>>): StageResult;
export function writeStageResult(qualification: Readonly<Record<string, any>>): StageResult;
