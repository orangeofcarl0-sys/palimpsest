/**
 * R3-L0C-I-A-R §2 — TYPES FOR THE EXCLUSIVE CLAIM AND THE COMMITTED PLAN.
 */

export interface RootInspection {
  readonly verdict: string;
  readonly mayProceed: boolean;
  readonly condition: string | null;
  readonly reason: string;
  readonly present: Readonly<Record<string, boolean>>;
  readonly claim: Readonly<Record<string, unknown>> | null;
  readonly claimMalformed: boolean;
  readonly preparationState: string | null;
  readonly existingUnits: readonly string[];
  readonly journal: Readonly<Record<string, unknown>>;
}

export interface ClaimResult {
  readonly claimed: boolean;
  readonly claim: Readonly<Record<string, unknown>> | null;
  readonly claimNonce?: string;
  readonly claimPath?: string;
  readonly inspection: RootInspection;
  readonly raceDetail?: string;
}

export interface TrustedClaimVerdict {
  readonly trusted: boolean;
  readonly verdict: string;
  readonly reason: string;
  readonly claim?: Readonly<Record<string, unknown>>;
}

export const CLAIM_FILE: string;
export const CLAIM_NONCE_FIELD: string;
export const PRESERVE_FILE: string;
export const PREPARATION_FILE: string;
export const JOURNAL_FILE: string;
export const ABORT_MANIFEST_FILE: string;
export const NL: string;

export function inspectActivationRoot(input: { readonly runRoot: string; readonly runId: string }): RootInspection;
export function claimActivationRoot(input: { readonly runRoot: string; readonly runId: string }): ClaimResult;
export function verifyTrustedClaim(input: { readonly runRoot: string; readonly runId: string; readonly claimNonce: string | null }): TrustedClaimVerdict;
export function prepareLayoutSafely(runRoot: string, trajectoryIds: readonly string[]): Readonly<Record<string, unknown>>;
export function verifyCommittedPlan(plan: unknown, expected?: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>;
export function readCommittedPlan(planPath?: string): { readonly planPath: string; readonly exists: boolean; readonly plan: unknown; readonly error: string | null };
