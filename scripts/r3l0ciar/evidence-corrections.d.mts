/**
 * R3-L0C-I-A-R §1 — TYPES FOR THE PUBLISHED-INTERPRETATION CORRECTION.
 */

export interface InterpretationClass {
  readonly id: string;
  readonly status: string;
  readonly priorStatus: string;
  readonly detail: string;
  readonly priorClaimRetained: boolean;
}

export const PRIOR_VERDICTS: {
  readonly stage: string;
  readonly commit: string;
  readonly path: string;
  readonly PAID_REPLICATION: string;
  readonly RUN_ROOT_ACTIVATION: string;
  readonly POST_MATRIX_VALIDITY: string;
  readonly RECONSTRUCTION_INSTRUMENTATION: string;
  readonly WORKER_UPTAKE_PROVENANCE: string;
};
export const INTERPRETATION_CORRECTION: {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly correctionId: string;
  readonly prior: Readonly<Record<string, unknown>>;
  readonly withdrawnConclusion: { readonly claim: string; readonly status: string; readonly reason: string; readonly replacement: string };
  readonly classes: readonly InterpretationClass[];
  readonly priorEvidenceEdited: boolean;
  readonly oldCommitsRewritten: boolean;
  readonly forcePush: boolean;
  readonly law: string;
};
export const NL: string;
export const STAGE_EVIDENCE_PATH: string;

export function measurePriorResult(): { readonly path: string; readonly present: boolean; readonly publishedVerdicts: Readonly<Record<string, string>> | null; readonly modified: boolean; readonly note?: string };
export function priorEvidenceUntouched(): { readonly paths: readonly string[]; readonly thisStageWritesOnlyTo: string; readonly priorEvidenceEdited: boolean };
export function evidenceCorrections(): {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly interpretationCorrection: typeof INTERPRETATION_CORRECTION;
  readonly priorResult: Readonly<Record<string, unknown>>;
  readonly priorEvidence: { readonly paths: readonly string[]; readonly thisStageWritesOnlyTo: string; readonly priorEvidenceEdited: boolean };
  readonly priorEvidenceEdited: boolean;
  readonly oldCommitsRewritten: boolean;
  readonly forcePush: boolean;
  readonly newline: string;
};
