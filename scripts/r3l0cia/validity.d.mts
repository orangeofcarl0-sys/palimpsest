/**
 * R3-L0C-I-A §6 — TYPES FOR THE PLAN-BOUND VALIDITY GATES.
 */

export interface PreTrialValidity {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly conditions: readonly { readonly id: string; readonly verdict: string; readonly satisfied: boolean; readonly detail: string }[];
  readonly required: readonly string[];
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
  readonly blocks: readonly { readonly block: number; readonly arms: readonly string[]; readonly generations: readonly string[]; readonly sessions: number }[];
  readonly checkedOnlyTheSessionCount: boolean;
  readonly realizationFailures: readonly string[];
}

export function evaluatePreTrialValidity(input: Readonly<Record<string, unknown>>): Promise<PreTrialValidity>;
export function postMatrixValidityGate(input: {
  readonly completed: readonly string[];
  readonly records: readonly Readonly<Record<string, unknown>>[];
  readonly plannedSessions: readonly string[];
  readonly plan?: unknown;
  readonly closure?: unknown;
  readonly containment?: unknown;
  readonly schedule?: readonly unknown[];
}): Promise<PostMatrixValidity>;
export function planConditions(plan: unknown): Readonly<Record<string, unknown>>;
export function readPlan(planPath: string | null): { readonly exists: boolean; readonly plan: unknown; readonly reason: string | null };
export const NL: string;
