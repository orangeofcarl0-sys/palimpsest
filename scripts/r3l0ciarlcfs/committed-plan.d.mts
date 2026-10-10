/**
 * R3-L0C-I-A-R-L-C-F-S §3 — TYPES FOR THE COMMITTED-PLAN IDENTITY.
 */

export interface CommittedPlanChecks {
  readonly COMMITTED_PLAN_SELF_DIGEST: string;
  readonly COMMITTED_PLAN_GIT_IDENTITY: string;
  readonly PLAN_SCHEMA_AND_ID: string;
  readonly PLAN_CLOSURE_BINDING: string;
}

export interface CommittedPlanVerification {
  readonly schemaVersion?: number;
  readonly stage?: string;
  readonly kind?: string;
  readonly PLAN_SOURCE: string;
  readonly planPath: string;
  readonly relative?: string;
  readonly exists: boolean;
  readonly plan: any;
  readonly planId?: string | null;
  readonly planContentDigest?: string | null;
  readonly recomputedPlanContentDigest?: string | null;
  readonly committedBlob?: string | null;
  readonly worktreeBlob?: string | null;
  readonly boundClosureDigest?: string | null;
  readonly currentClosureDigest?: string | null;
  readonly closureRecomputedHere?: boolean;
  readonly scheduleLength?: number;
  readonly checks: CommittedPlanChecks;
  readonly problems: readonly string[];
  readonly verified: boolean;
  readonly regenerated: boolean;
  readonly constructedHere?: boolean;
  readonly selfCheckIsNotCrossArtifactSeal?: boolean;
  readonly gitLevelReproducibilityOnly?: boolean;
  readonly claimsCryptographicSignature?: boolean;
  readonly claimsTrustedExternalAuthority?: boolean;
  readonly onFailure?: string;
  readonly reason?: string | null;
  readonly law?: string;
}

export interface CrossArtifactSeal {
  readonly schemaVersion?: number;
  readonly stage?: string;
  readonly kind?: string;
  readonly committedPlanId: string | null;
  readonly committedPlanContentDigest: string | null;
  readonly committedClosureDigest: string | null;
  readonly qualificationPlanReference: string | null;
  readonly qualificationFrozenReference: string | null;
  readonly stageResultPlanReference: string | null;
  readonly stageResultFrozenReference: string | null;
  readonly checks: Record<string, string>;
  readonly failing: readonly string[];
  readonly sealed: boolean;
  readonly CROSS_ARTIFACT_PLAN_BINDING: string;
  readonly selfConsistentPlanIsInsufficient?: boolean;
  readonly law?: string;
}

export const NL: string;

export function committedPlanPath(): string;
export function committedBlobHash(relative: string): string | null;
export function worktreeBlobHash(relative: string): string | null;
export function readAndVerifyCommittedPlan(input?: { relative?: string; planPath?: string; expectedPlanId?: string; expectedClosureDigest?: string | null; verifyCompiled?: boolean }): Promise<CommittedPlanVerification>;
export function constructCandidatePlan(input?: Record<string, unknown>): Promise<{ readonly plan: any; readonly CANDIDATE_ONLY: boolean; readonly isAuthoritativeEvidence: boolean; readonly regeneratesFrozenAt: boolean; readonly forbiddenAsFinalEvidence: string }>;
export function freezeCommittedPlan(input?: Record<string, unknown>): Promise<{ readonly path: string; readonly plan: any; readonly planId: string; readonly planContentDigest: string; readonly frozenAt: string; readonly executionClosureDigest: string | null; readonly fileSha256: string; readonly writtenOnce: boolean; readonly law: string }>;
export function sealCrossArtifactPlanIdentity(input: { plan: any; qualification?: any; stageResult?: any; recomputedDigest?: string | null; currentClosureDigest?: string | null }): CrossArtifactSeal;
