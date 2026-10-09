/**
 * R3-L0C-I-A-R §9 — TYPES FOR THE SUPERSEDING PROSPECTIVE PLAN.
 */

export interface ProspectivePlan {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly planId: string;
  readonly baseline: string;
  readonly frozenBefore: string;
  readonly planSupersession: Readonly<Record<string, unknown>>;
  readonly executionPathDeviations: readonly { readonly defectId: string; readonly section: string; readonly gap: string; readonly property: string; readonly closedIn: string }[];
  readonly pipelineOrder: readonly string[];
  readonly budgets: Readonly<Record<string, unknown>>;
  readonly preTrialConditions: readonly string[];
  readonly postMatrixConditions: readonly string[];
  readonly interpretationClasses: readonly string[];
  readonly preservedDesign: Readonly<Record<string, unknown>>;
  readonly schedule: readonly Readonly<Record<string, unknown>>[];
  readonly executionClosure: Readonly<Record<string, unknown>>;
  readonly executionRoute: Readonly<Record<string, unknown>>;
  readonly authorizationRequired: Readonly<Record<string, unknown>>;
  readonly stageStop: Readonly<Record<string, unknown>>;
  readonly frozenAt: string;
  readonly orderingLaw: string;
}

export const PLAN_ID: string;
export const PLAN_SUPERSESSION: {
  readonly id: string;
  readonly supersedes: {
    readonly planId: string;
    readonly path: string;
    readonly stage: string;
    readonly commit: string;
    readonly pipeline: string;
    readonly disposition: string;
  };
  readonly newPlan: Readonly<Record<string, unknown>>;
  readonly amendedPriorPlan: boolean;
  readonly priorPlanEdited: boolean;
  readonly priorEvidenceAppendOnly: boolean;
  readonly quarantine: { readonly forbiddenClaim: string; readonly priorMatricesRemainPhysicallyExecutable: boolean; readonly quarantineIsAGuardNotAnImpossibility: boolean };
};
export const EXECUTION_PATH_DEVIATIONS: readonly Readonly<Record<string, unknown>>[];
export const NL: string;

export function preservedDesign(): Promise<Readonly<Record<string, unknown>>>;
export function buildProspectivePlan(input?: Readonly<Record<string, unknown>>): Promise<ProspectivePlan>;
export function writeProspectivePlan(input?: Readonly<Record<string, unknown>>): Promise<ProspectivePlan>;
export function checkPlanClosure(input?: Readonly<Record<string, unknown>>): Promise<{ readonly EXECUTION_CLOSURE: string; readonly frozen: string | null; readonly current: string | null }>;
