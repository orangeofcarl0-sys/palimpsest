/**
 * R3-L0C-I-A-R-L §Final — TYPES FOR THE SUPERSEDING PLAN, THE QUALIFICATION AND THE REGRESSION.
 */

export interface ProspectivePlan {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly planId: string;
  readonly baseline: string;
  readonly frozenBefore: string;
  readonly planSupersession: { readonly supersedes: Readonly<Record<string, unknown>>; readonly amendedPriorPlan: boolean; readonly priorPlanEdited: boolean; readonly quarantine: Readonly<Record<string, unknown>> };
  readonly executionPathDeviations: readonly { readonly gateId: string; readonly section: string; readonly gap: string; readonly property: string; readonly closedIn: string }[];
  readonly pipelineOrder: readonly string[];
  readonly liveEvidence: Readonly<Record<string, unknown>>;
  readonly primaryDerivedInputs: readonly string[];
  readonly authorizationRecordFields: readonly string[];
  readonly authorizationDecisions: readonly Readonly<Record<string, unknown>>[];
  readonly reusedModules: readonly string[];
  readonly stageHarnessModules: readonly string[];
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
export const PLAN_SUPERSESSION: Readonly<Record<string, unknown>>;
export const EXECUTION_PATH_DEVIATIONS: readonly Readonly<Record<string, unknown>>[];
export const NL: string;

export function preservedDesign(): Promise<Readonly<Record<string, unknown>>>;
export function buildProspectivePlan(input?: Readonly<Record<string, unknown>>): Promise<ProspectivePlan>;
export function writeProspectivePlan(input?: Readonly<Record<string, unknown>>): Promise<ProspectivePlan>;
export function checkPlanClosure(input?: Readonly<Record<string, unknown>>): Promise<{ readonly EXECUTION_CLOSURE: string; readonly frozen: string | null; readonly current: string | null }>;
