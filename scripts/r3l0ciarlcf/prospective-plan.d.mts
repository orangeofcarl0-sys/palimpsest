/**
 * R3-L0C-I-A-R-L-C-F §11 — TYPES FOR THE SUPERSEDING PROSPECTIVE PLAN.
 */

export interface ProspectivePlan {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly planId: string;
  readonly baseline: string;
  readonly frozenBefore: string;
  readonly planSupersession: Readonly<Record<string, any>>;
  readonly measurementPathDeviations: readonly Readonly<Record<string, any>>[];
  readonly pipelineOrder: readonly string[];
  readonly primaryDerivedInputs: readonly string[];
  readonly primaryRefusedInputs: readonly string[];
  readonly authorizationRecordFields: readonly string[];
  readonly authorizationDecisions: readonly Readonly<Record<string, any>>[];
  readonly terminalAdmissionConditions: readonly Readonly<Record<string, any>>[];
  readonly durableReconciliationConditions: readonly Readonly<Record<string, any>>[];
  readonly costCompletenessLevels: readonly Readonly<Record<string, any>>[];
  readonly causalPrerequisites: readonly string[];
  readonly budgetConcepts: readonly Readonly<Record<string, any>>[];
  readonly reusedModules: readonly string[];
  readonly stageHarnessModules: readonly string[];
  readonly preservedDesign: Readonly<Record<string, any>>;
  readonly schedule: readonly Readonly<Record<string, any>>[];
  readonly executionClosure: Readonly<Record<string, any>>;
  readonly executionRoute: Readonly<Record<string, any>>;
  readonly authorizationRequired: Readonly<Record<string, any>>;
  readonly stageStop: Readonly<Record<string, any>>;
  readonly frozenAt: string;
  readonly orderingLaw: string;
  readonly planContentDigest: string;
}

export interface PlanClosureCheck {
  readonly EXECUTION_CLOSURE: string;
  readonly frozen: string | null;
  readonly current: string | null;
  readonly onMismatch?: string;
}

export interface PlanContentDigestCheck {
  readonly FULL_PLAN_DIGEST: string;
  readonly frozen: string | null;
  readonly current: string | null;
}

export const PLAN_ID: string;
export const PLAN_SUPERSESSION: Readonly<Record<string, any>>;
export const MEASUREMENT_PATH_DEVIATIONS: readonly Readonly<Record<string, any>>[];
export const NL: string;

export function preservedDesign(): Promise<Readonly<Record<string, any>>>;
export function buildProspectivePlan(input?: Readonly<Record<string, any>>): Promise<ProspectivePlan>;
export function writeProspectivePlan(input?: Readonly<Record<string, any>>): Promise<ProspectivePlan>;
export function checkPlanClosure(input?: Readonly<Record<string, any>>): Promise<PlanClosureCheck>;
export function checkPlanContentDigest(input?: Readonly<Record<string, any>>): PlanContentDigestCheck;
