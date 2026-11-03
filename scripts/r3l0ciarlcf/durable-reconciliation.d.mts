/**
 * R3-L0C-I-A-R-L-C-F §5 — TYPES FOR DURABLE RECONCILIATION AND CAUSAL EVALUABILITY.
 */

export interface DurableCondition {
  readonly id: string;
  readonly holds: boolean;
  readonly detail: string | null;
}

export interface DurableReconciliation {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly conditions: readonly DurableCondition[];
  readonly requiredConditions: readonly string[];
  readonly failing: readonly string[];
  readonly green: boolean;
  readonly authoritativeSessionSet: readonly string[];
  readonly durableTrialCount: number;
  readonly duplicates: readonly string[];
  readonly identityMismatches: readonly string[];
  readonly durableVsInMemoryMismatches: readonly string[];
  readonly journalIntegrityIsRecordContentDigest: boolean;
  readonly claimsExternallyAnchoredHashChain: boolean;
  readonly law: string;
}

export interface CostCompleteness {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly levels: readonly string[];
  readonly CostAccountingComplete: boolean;
  readonly CostMeasuredComplete: boolean;
  readonly LivePrimaryCostComplete: boolean;
  readonly measuredCount: number;
  readonly absentCount: number;
  readonly livePrimaryCount: number;
  readonly plannedSessions: number;
  readonly absenceSatisfiesMeasuredRequirement: boolean;
  readonly absenceSatisfiesAccountingRequirement: boolean;
  readonly provenance: string;
  readonly law: string;
}

export interface CausalEvaluability {
  readonly schemaVersion: number;
  readonly kind: string;
  readonly required: readonly string[];
  readonly checks: Readonly<Record<string, boolean>>;
  readonly failing: readonly string[];
  readonly evaluable: boolean;
  readonly CAUSAL_RESULT: string;
  readonly fixtureMatrixIsNotLiveCausalAdmission: boolean;
  readonly costCompleteness: CostCompleteness;
  readonly frozenThresholdsChanged: boolean;
  readonly statisticalInterpretationChanged: boolean;
  readonly law: string;
}

export const REQUIRED_DURABLE_CONDITIONS: readonly { readonly id: string; readonly detail: string }[];
export const NL: string;

export function reconcileDurableTrials(input: Readonly<Record<string, any>>): DurableReconciliation;
export function costCompleteness(costAttribution: Readonly<Record<string, any>> | null | undefined): CostCompleteness;
export function causalEvaluability(input: Readonly<Record<string, any>>): CausalEvaluability;
