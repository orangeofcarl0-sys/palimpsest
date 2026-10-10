/**
 * R3-L0C-I-A-R-L-C-F §6 — TYPES FOR THE TRUST, AUTHORITY AND BUDGET BOUNDARY.
 */

export interface PlanBinding {
  readonly planContentDigest: string | null;
  readonly executionClosureDigest: string | null;
  readonly planId: string | null;
  readonly planContentDigestIsSeparateFromClosure: boolean;
  readonly planBindingIsSelfReferential: boolean;
  readonly coversEveryPlanFieldExceptItsOwn: boolean;
  readonly law: string;
}

export interface BudgetSemantics {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly concepts: Readonly<Record<string, boolean>>;
  readonly declared: boolean;
  readonly maxSessions: number | null;
  readonly requiredSessions: number;
  readonly sessionScopeCoverage: boolean;
  readonly maxAuthorizedMonetaryExpenditure: number | null;
  readonly currency: string | null;
  readonly hostEnforcement: Readonly<Record<string, any>>;
  readonly declaredOnlyImpliesEnforceable: boolean;
  readonly declaredOnlyIsNotEnforceable: boolean;
  readonly SPEND_ENFORCEMENT: string;
  readonly law: string;
}

export interface ExternalAuthorityVerification {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly verdict: string;
  readonly verified: boolean;
  readonly concepts: Readonly<Record<string, boolean>>;
  readonly schema: Readonly<Record<string, any>>;
  readonly budget: BudgetSemantics;
  readonly binding: PlanBinding;
  readonly planContentDigest: string | null;
  readonly planContentDigestIsSeparateFromClosure: boolean;
  readonly planBindingIsSelfReferential: boolean;
  readonly trustedSource: Readonly<Record<string, any>>;
  readonly problems: readonly string[];
  readonly thisStageProvidesAuthorization: boolean;
  readonly syntacticallyValidDecisionIsTrustedAuthority: boolean;
  readonly authorityStringAloneIsNotProof: boolean;
  readonly launchProhibited: boolean;
  readonly detail: string;
}

export interface PrimaryInputBinding {
  readonly refused: boolean;
  readonly mode: string;
  readonly injectionPermitted: boolean;
  readonly supplied: readonly string[];
  readonly reason: string | null;
  readonly law: string;
}

export const FROZEN_SESSION_SCOPE: number;
export const TRUSTED_AUTHORITY_ENV: string;
export const PLAN_BINDING_FIELD: string;
export const TRUSTED_HOST_INPUTS: readonly string[];
export const PRIMARY_DERIVED_INPUTS: readonly string[];
export const PRIMARY_FORBIDDEN_SEAMS: readonly string[];
export const EXPERIMENTAL_INPUTS: readonly string[];
export const PRIMARY_REFUSED_INPUTS: readonly string[];
export const NL: string;
export const REPO_ROOT: string;

export function planBinding(plan: Readonly<Record<string, any>> | null | undefined): PlanBinding;
export function trustedAuthoritySource(): Readonly<Record<string, any>>;
export function schemaValidity(record: Readonly<Record<string, any>> | null | undefined): Readonly<Record<string, any>>;
export function budgetSemantics(record: Readonly<Record<string, any>> | null | undefined): BudgetSemantics;
export function detectHostSpendEnforcement(): Readonly<Record<string, any>>;
export function verifyExternalAuthority(input: Readonly<Record<string, any>>): ExternalAuthorityVerification;
export function enforcePrimaryInputBinding(input: Readonly<Record<string, any>>): PrimaryInputBinding;
export function trustedHostConfiguration(input?: Readonly<Record<string, any>>): Readonly<Record<string, any>>;
