/**
 * R3-L0C-I-A-R-L §3 — TYPES FOR THE AUTHORITATIVE PATH GUARD AND MODE RESOLUTION.
 */

export interface ResolvedMode {
  readonly resolved: boolean;
  readonly reason: string | null;
  readonly mode: string | null;
  readonly workerExecutable: string | null;
  readonly workerIsScripted?: boolean;
  readonly externalModelCallPermitted: boolean | null;
  readonly paidAuthorizationRequired?: boolean;
  readonly paidAuthorizationSignalPresent?: boolean;
  readonly paidAuthorizationDecisionPresent?: boolean;
  readonly paidAuthorizationDecisionClaimedHere?: boolean;
  readonly requiredDecisions?: readonly string[];
  readonly silentFallbackTaken: boolean;
  readonly thisStageEntersPrimary?: boolean;
  readonly decisionVerifiedBy?: string;
}

export const AUTHORITATIVE_PLAN_ID: string;
export const NL: string;
export const REPO_ROOT: string;

export function assertAuthoritativePath(input: { readonly caller?: string; readonly authorizedBy?: string }): Readonly<Record<string, unknown>>;
export function resolveExecutionMode(input: { readonly mode: string; readonly paidAuthorization?: boolean }): Promise<ResolvedMode>;
export function resolveShippedDshBinAsync(): Promise<{ readonly bin: string | null; readonly resolved: boolean; readonly source?: string; readonly error?: string }>;
