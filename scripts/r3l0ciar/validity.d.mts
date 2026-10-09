/**
 * R3-L0C-I-A-R §3/§7 — TYPES FOR THE VALIDITY REDUCER AND THE POST-MATRIX GATE.
 */

export interface PreTrialCondition {
  readonly id: string;
  readonly observed: string | null;
  readonly verdict: string;
  readonly satisfied: boolean;
  readonly detail: string;
}

export interface PreTrialValidity {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly vocabulary: readonly string[];
  readonly conditions: readonly PreTrialCondition[];
  readonly required: readonly string[];
  readonly routeIdentityComparison: readonly { readonly field: string; readonly planned: unknown; readonly actual: unknown; readonly matches: boolean }[];
  readonly satisfiedCount: number;
  readonly unsatisfied: readonly string[];
  readonly ALL_SATISFIED: boolean;
  readonly forbiddenShortcutsPresent: readonly string[];
  readonly onFailure: string;
}

export interface PostMatrixValidity {
  readonly green: boolean;
  readonly detail: string;
  readonly checks: Readonly<Record<string, boolean>>;
  readonly failing: readonly string[];
  readonly requiredConditions: readonly string[];
  readonly blocks: readonly { readonly block: number; readonly arms: readonly string[]; readonly generations: readonly string[]; readonly sessions: number }[];
  readonly checkedOnlyTheSessionCount: boolean;
  readonly realizationFailures: readonly string[];
  readonly uninterpretableUptake: readonly string[];
  readonly causalAdmission: Readonly<Record<string, string>>;
}

export const NL: string;

export function conditionOutcome(conditionId: string, observed: unknown): { readonly verdict: string; readonly detail: string };
export function evaluatePreTrialValidity(input: Readonly<Record<string, unknown>>): Promise<PreTrialValidity>;
export function modelRouteIdentity(evaluation: PreTrialValidity): string;
export function postMatrixValidityGate(input: Readonly<Record<string, unknown>>): Promise<PostMatrixValidity>;
export function causalAdmissionFrom(gate: PostMatrixValidity): Readonly<Record<string, string>>;
export function readPlan(planPath: string | null): { readonly exists: boolean; readonly plan: unknown; readonly reason: string | null };
export function planConditions(plan: unknown): Readonly<Record<string, unknown>>;
