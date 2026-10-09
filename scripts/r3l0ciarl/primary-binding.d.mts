/**
 * R3-L0C-I-A-R-L §3 — TYPES FOR PRIMARY-ONLY INPUT BINDING AND VERIFIED AUTHORIZATION.
 */

export interface BindingResult {
  readonly refused: boolean;
  readonly mode: string;
  readonly injectionPermitted: boolean;
  readonly supplied: readonly string[];
  readonly reason: string | null;
  readonly law: string;
}

export interface AuthorizationVerification {
  readonly verified: boolean;
  readonly problems: readonly string[];
  readonly authority: string | null;
  readonly approvedPlanId?: string | null;
  readonly approvedPlanDigest?: string | null;
  readonly paidRunBudget?: Readonly<Record<string, unknown>> | null;
  readonly decisionsVerified?: readonly string[];
  readonly verifiedAtLaunchBoundary?: boolean;
  readonly authorityStringAloneIsNotProof?: boolean;
  readonly detail: string;
}

export interface BoundMode {
  readonly resolved: boolean;
  readonly mode: string;
  readonly refusedAt?: string;
  readonly binding: BindingResult;
  readonly authorization: AuthorizationVerification | null;
  readonly authorizationVerified?: boolean;
  readonly paidAuthorizationSignal?: boolean;
  readonly reason: string | null;
}

export const NL: string;

export function enforcePrimaryInputBinding(input: { readonly mode: string; readonly provided: Readonly<Record<string, unknown>> }): BindingResult;
export function verifyAuthorizationRecord(input: {
  readonly record: unknown;
  readonly executingPlanId?: string;
  readonly executingPlanDigest?: string;
}): AuthorizationVerification;
export function resolveBoundMode(input: Readonly<Record<string, unknown>>): Promise<BoundMode>;
