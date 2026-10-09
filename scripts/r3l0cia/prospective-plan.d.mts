/**
 * R3-L0C-I-A §9 — TYPES FOR THE CORRECTED PROSPECTIVE PLAN.
 */
export const PLAN_ID: string;
export const PLAN_SUPERSESSION: {
  readonly id: string;
  readonly supersedes: { readonly planId: string; readonly path: string; readonly adapter: string; readonly driver: string; readonly disposition: string };
  readonly newPlan: Readonly<Record<string, string>>;
  readonly amendedPriorPlan: boolean;
  readonly priorPlanEdited: boolean;
  readonly quarantine: Readonly<Record<string, unknown>>;
};
export const EXECUTION_PATH_DEVIATIONS: readonly {
  readonly defectId: string;
  readonly gap: string;
  readonly property: string;
  readonly closedIn: string;
}[];
export function preservedDesign(): Promise<Readonly<Record<string, unknown>>>;
export function buildProspectivePlan(input?: Readonly<Record<string, unknown>>): Promise<{
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly planId: string;
  readonly baseline: string;
  readonly frozenBefore: string;
  readonly planSupersession: typeof PLAN_SUPERSESSION;
  readonly executionPathDeviations: typeof EXECUTION_PATH_DEVIATIONS;
  readonly activationOrder: readonly unknown[];
  readonly executionModes: readonly unknown[];
  readonly budgets: Readonly<Record<string, unknown>>;
  readonly pullLayers: readonly unknown[];
  readonly preTrialConditions: readonly string[];
  readonly postMatrixConditions: readonly string[];
  readonly preservedDesign: Readonly<Record<string, unknown>>;
  readonly schedule: readonly { readonly sessionId: string }[];
  readonly executionClosure: { readonly executionClosureDigest: string; readonly partIds: readonly string[]; readonly fileCount: number; readonly closureComplete: boolean; readonly [key: string]: unknown };
  readonly executionRoute: Readonly<Record<string, unknown>>;
  readonly authorizationRequired: { readonly required: boolean; readonly what: string; readonly thisStageProvidesIt: boolean; readonly callerSuppliedStringIsNotProof: boolean };
  readonly stageStop: { readonly ranPaidMatrix: boolean; readonly beganR3L1: boolean; readonly beganFusion: boolean; readonly modelCallsMade: number };
  readonly frozenAt: string;
  readonly orderingLaw: string;
}>;
export function writeProspectivePlan(input?: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
export function checkPlanClosure(input?: Readonly<Record<string, unknown>>): Promise<{
  readonly EXECUTION_CLOSURE: string;
  readonly frozen: string | null;
  readonly current: string | null;
  readonly onMismatch?: string;
}>;
export const NL: string;
