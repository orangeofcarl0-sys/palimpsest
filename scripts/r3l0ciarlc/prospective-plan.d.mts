/**
 * R3-L0C-I-A-R-L-C §7 — TYPES FOR THE SUPERSEDING PROSPECTIVE PLAN.
 */

export interface PlanSupersession {
  readonly id: string;
  readonly supersedes: {
    readonly planId: string;
    readonly path: string;
    readonly stage: string;
    readonly commit: string;
    readonly pipeline: string;
    readonly disposition: string;
  };
  readonly newPlan: Readonly<Record<string, string>>;
  readonly amendedPriorPlan: boolean;
  readonly priorPlanEdited: boolean;
  readonly priorEvidenceAppendOnly: boolean;
  readonly quarantine: Readonly<Record<string, unknown>>;
}

export interface ProspectivePlan {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly planId: string;
  readonly baseline: string;
  readonly planSupersession: PlanSupersession;
  readonly executionPathDeviations: readonly Readonly<Record<string, string>>[];
  readonly pipelineOrder: readonly string[];
  readonly preservedDesign: Readonly<Record<string, unknown>>;
  readonly schedule: readonly Readonly<Record<string, unknown>>[];
  readonly executionClosure: Readonly<Record<string, unknown>>;
  readonly executionRoute: Readonly<Record<string, unknown>>;
  readonly authorizationRequired: Readonly<Record<string, unknown>>;
  readonly planContentDigest: string | null;
  readonly [key: string]: unknown;
}

export const PLAN_ID: string;
export const PLAN_SUPERSESSION: PlanSupersession;
export const EXECUTION_PATH_DEVIATIONS: readonly Readonly<Record<string, string>>[];
export const NL: string;

export function preservedDesign(): Promise<Readonly<Record<string, unknown>>>;
export function buildProspectivePlan(input?: { readonly closure?: Readonly<Record<string, unknown>>; readonly verifyCompiled?: boolean }): Promise<ProspectivePlan>;
export function writeProspectivePlan(input?: { readonly verifyCompiled?: boolean }): Promise<ProspectivePlan>;
export function checkPlanClosure(input?: { readonly planPath?: string; readonly verifyCompiled?: boolean }): Promise<{
  readonly EXECUTION_CLOSURE: string;
  readonly frozen: string | null;
  readonly current: string | null;
  readonly onMismatch?: string;
}>;
