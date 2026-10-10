/**
 * R3-L0C-I-A-R-L-C-F-S §7 — TYPES FOR THE AUTHORIZATION VERDICT.
 */

export interface AuthorizationVerdict {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly verdict: string;
  readonly verified: boolean;
  readonly conditions: Record<string, boolean>;
  readonly mandatoryConditions: readonly string[];
  readonly everyMandatoryConditionRequired: boolean;
  readonly allMandatoryConditionsHold: boolean;
  readonly unsatisfiedConditions: readonly string[];
  readonly concepts: Record<string, boolean>;
  readonly conceptIds: readonly string[];
  readonly problems: readonly string[];
  readonly verdictAgreesWithProblems: boolean;
  readonly hostSpendEnforcement: string;
  readonly hostEnforcement: Record<string, unknown>;
  readonly budget: Record<string, unknown>;
  readonly schema: Record<string, unknown>;
  readonly binding: Record<string, unknown>;
  readonly planContentDigest: string | null;
  readonly trustedSource: { readonly available: boolean; readonly verified: boolean; readonly path: string | null; readonly reason: string | null; readonly testFixture: boolean };
  readonly thisStageProvidesAuthorization: boolean;
  readonly syntacticallyValidDecisionIsTrustedAuthority: boolean;
  readonly authorityStringAloneIsNotProof: boolean;
  readonly testFixtureCannotOpenLaunch: boolean;
  readonly launchProhibited: boolean;
  readonly detail: string;
  readonly law: string;
}

export const NL: string;

export function reduceAuthorizationVerdict(input: { record?: any; plan?: any; trustedSource?: any }): Promise<AuthorizationVerdict>;
