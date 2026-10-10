/**
 * R3-L0C-I-A-R-L-C §5 Gate C — TYPES FOR THE TRUST BOUNDARY.
 */

export interface SchemaValidity {
  readonly valid: boolean;
  readonly problems: readonly string[];
  readonly shapeIsNotAuthority: boolean;
  readonly decisionPrefixIsNotVerification?: boolean;
}

export interface EnforceableBudget {
  readonly present: boolean;
  readonly maxSessions: number | null;
  readonly requiredSessions: number;
  readonly coversFrozenScope: boolean;
  readonly enforceable: string;
  readonly declaredOnly: boolean;
  readonly currency?: string | null;
}

export interface TrustedSource {
  readonly available: boolean;
  readonly path: string | null;
  readonly source?: Readonly<Record<string, unknown>>;
  readonly reason: string | null;
}

export interface AuthorityVerification {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly verdict: string;
  readonly verified: boolean;
  readonly concepts: {
    readonly SCHEMA_VALIDITY: boolean;
    readonly EXTERNALLY_VERIFIED_AUTHORITY: boolean;
    readonly AUTHORIZED_PROSPECTIVE_PLAN: boolean;
    readonly ENFORCEABLE_BUDGET: boolean;
    readonly CURRENT_LAUNCH_PERMISSION: boolean;
  };
  readonly schema: SchemaValidity;
  readonly budget: EnforceableBudget;
  readonly planContentDigest: string | null;
  readonly planContentDigestIsSeparateFromClosure: boolean;
  readonly planBindingIsSelfReferential: boolean;
  readonly trustedSource: { readonly available: boolean; readonly path: string | null; readonly reason: string | null };
  readonly problems: readonly string[];
  readonly thisStageProvidesAuthorization: boolean;
  readonly syntacticallyValidDecisionIsTrustedAuthority: boolean;
  readonly authorityStringAloneIsNotProof: boolean;
  readonly launchProhibited: boolean;
  readonly detail: string;
}

export const TRUSTED_AUTHORITY_ENV: string;
export const NL: string;

export function planContentDigest(plan: Readonly<Record<string, unknown>> | null | undefined): string | null;
export function trustedAuthoritySource(): TrustedSource;
export function schemaValidity(record: Readonly<Record<string, unknown>> | null | undefined): SchemaValidity;
export function enforceableBudget(record: Readonly<Record<string, unknown>> | null | undefined): EnforceableBudget;
export function verifyExternalAuthority(input: {
  readonly record: Readonly<Record<string, unknown>> | null | undefined;
  readonly plan: Readonly<Record<string, unknown>> | null | undefined;
  readonly trustedSource?: TrustedSource;
}): AuthorityVerification;
export function trustedHostConfiguration(input?: { readonly dshHome?: string | null; readonly installHostBundle?: unknown }): Readonly<Record<string, unknown>>;
export function enforcePrimaryInputBinding(input: {
  readonly mode: string;
  readonly provided?: Readonly<Record<string, unknown>>;
}): { readonly refused: boolean; readonly mode: string; readonly injectionPermitted: boolean; readonly supplied: readonly string[]; readonly reason: string | null; readonly law: string };
export const PRIMARY_DERIVED_INPUTS: readonly string[];
export const PRIMARY_REFUSED_INPUTS: readonly string[];
export const TRUSTED_HOST_INPUTS: readonly string[];
export const EXPERIMENTAL_INPUTS: readonly string[];
export const PRIMARY_FORBIDDEN_SEAMS: readonly string[];
