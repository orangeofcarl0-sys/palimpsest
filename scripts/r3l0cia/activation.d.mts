/**
 * R3-L0C-I-A §2/§5 — TYPES FOR THE EXCLUSIVE ACTIVATION ENTRY.
 */

export const PREPARATION_FILE: string;
export const PRESERVE_FILE: string;
export const CLAIM_NONCE_FIELD: string;

export interface RunRootInspection {
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
  readonly inspection: RunRootInspection;
  readonly raceDetail?: string;
}

export interface TrustedClaimVerification {
  readonly trusted: boolean;
  readonly verdict: string;
  readonly reason: string;
  readonly claim?: Readonly<Record<string, unknown>>;
}

export function inspectActivationRoot(input: { readonly runRoot: string; readonly runId: string; readonly trajectoryIds?: readonly string[] }): RunRootInspection;
export function claimActivationRoot(input: { readonly runRoot: string; readonly runId: string; readonly claimNonce?: string }): ClaimResult;
export function verifyTrustedClaim(input: { readonly runRoot: string; readonly runId: string; readonly claimNonce: string | null }): TrustedClaimVerification;
export function prepareLayoutSafely(runRoot: string, trajectoryIds: readonly string[]): {
  readonly runRoot: string;
  readonly trajectoryIds: readonly string[];
  readonly createdDirectories: readonly string[];
  readonly removedAnything: boolean;
  readonly law: string;
};
export function verifyCommittedPlan(plan: unknown, expected?: { readonly planId?: string; readonly scheduleIds?: readonly string[] }): {
  readonly PLAN_VALID: boolean;
  readonly problems: readonly string[];
  readonly planId: string | null;
  readonly scheduleLength: number;
  readonly closureDigest: string | null;
  readonly onFailure: string;
};
export function readCommittedPlan(planPath?: string): { readonly planPath: string; readonly exists: boolean; readonly plan: unknown; readonly error: string | null };
export function resolveExecutionMode(input: { readonly mode?: string; readonly paidAuthorization?: boolean }): Promise<{
  readonly resolved: boolean;
  readonly reason: string | null;
  readonly mode: string | null;
  readonly workerExecutable: string | null;
  readonly workerIsScripted?: boolean;
  readonly externalModelCallPermitted: boolean | null;
  readonly paidAuthorizationRequired?: boolean;
  readonly callerSuppliedAuthorizedByAccepted: boolean;
  readonly paidAuthorizationPresent: boolean;
  readonly silentFallbackTaken: boolean;
  readonly thisStageEntersPrimary: boolean;
}>;
export function resolveShippedDshBinAsync(): Promise<{ readonly bin: string | null; readonly resolved: boolean; readonly source?: string; readonly error?: string }>;
export function activatePrimaryRun(input: {
  readonly plan?: unknown;
  readonly planPath?: string;
  readonly expectedPlanId?: string;
  readonly runId?: string;
  readonly runRoot?: string;
  readonly expectedSchedule?: readonly { readonly sessionId: string }[];
  readonly expectedScheduleIds?: readonly string[];
  readonly trajectoryIds?: readonly string[];
  readonly closure?: unknown;
  readonly mode?: string;
  readonly paidAuthorization?: boolean;
  readonly verifyCompiled?: boolean;
  readonly enforceRunClaim?: boolean;
  readonly prepare?: (input: unknown) => Promise<unknown>;
  readonly preExposureChecks?: (input: unknown) => Promise<unknown>;
}): Promise<Record<string, unknown> & { readonly ACTIVATION: string; readonly refusedAt?: string; readonly reason?: string; readonly steps: readonly unknown[] }>;
export const NL: string;
