/**
 * R3-L0C-I-A-R §8 — TYPES FOR THE EXECUTION MODES AND THE AUTHORIZATION BOUNDARY.
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
  readonly paidAuthorizationDecision?: string;
  readonly callerSuppliedAuthorizedByAccepted?: boolean;
  readonly callerSuppliedBooleanIsNotADecision?: boolean;
  readonly silentFallbackTaken: boolean;
  readonly thisStageEntersPrimary?: boolean;
  readonly requiredDecisions?: readonly string[];
}

export const EXECUTION_MODES: readonly { readonly id: string; readonly worker: string; readonly externalModelCallPermitted: boolean; readonly paidAuthorizationRequired: boolean }[];
export const NL: string;
export const REPO_ROOT: string;

export function resolveExecutionMode(input: { readonly mode: string; readonly paidAuthorization?: boolean; readonly authorizationDecision?: unknown }): Promise<ResolvedMode>;
export function resolveShippedDshBinAsync(): Promise<{ readonly bin: string | null; readonly resolved: boolean; readonly source?: string; readonly error?: string }>;
export function assertAuthoritativePath(input: { readonly caller?: string; readonly authorizedBy?: string }): Readonly<Record<string, unknown>>;
