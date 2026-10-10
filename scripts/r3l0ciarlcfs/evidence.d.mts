/**
 * R3-L0C-I-A-R-L-C-F-S §3/§14 — TYPES FOR THE STAGE RESULT AND THE FINAL SEAL.
 */

export const NL: string;

export function buildStageResult(qualification: any): Record<string, unknown>;
export function writeStageResult(qualification: any): Record<string, unknown>;
export function sealCommittedEvidence(input?: { expectedPlanId?: string }): Promise<{
  readonly sealed: boolean;
  readonly CROSS_ARTIFACT_PLAN_BINDING: string;
  readonly checks: Record<string, string>;
  readonly identityChecks: Record<string, string>;
  readonly planVerification: Record<string, unknown>;
  readonly qualificationReadFromDisk: boolean;
  readonly stageResultReadFromDisk: boolean;
  readonly recomputedClosureDigest: string;
  readonly committedPlanId: string | null;
  readonly committedPlanContentDigest: string | null;
  readonly committedClosureDigest: string | null;
  readonly failing: readonly string[];
  readonly [key: string]: unknown;
}>;
