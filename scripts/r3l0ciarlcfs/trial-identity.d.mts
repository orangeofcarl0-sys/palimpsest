/**
 * R3-L0C-I-A-R-L-C-F-S §5 — TYPES FOR THE COMPLETE TRIAL-IDENTITY RECONCILIATION.
 */

export interface FieldClassification {
  readonly field: string;
  readonly state: string;
  readonly equal: boolean | null;
  readonly durableValue: unknown;
  readonly inMemoryValue: unknown;
  readonly absentSide?: string;
  readonly independentlyVerified: boolean;
}

export interface TrialIdentityReconciliation {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly comparedFields: readonly string[];
  readonly loadBearingFields: readonly string[];
  readonly evidenceReferenceFields: readonly string[];
  readonly excludedFields: readonly { readonly field: string; readonly rationale: string }[];
  readonly sessions: readonly { readonly sessionId: string; readonly fields: readonly FieldClassification[]; readonly conflicting: readonly string[] }[];
  readonly conflicts: readonly { readonly sessionId: string; readonly field: string; readonly durable: unknown; readonly inMemory: unknown }[];
  readonly oneSidedAbsences: readonly { readonly sessionId: string; readonly field: string; readonly absentSide: string }[];
  readonly bothAbsentFields: readonly { readonly sessionId: string; readonly field: string }[];
  readonly unmatched: readonly { readonly sessionId: string; readonly side: string; readonly detail: string }[];
  readonly counts: {
    readonly SAME_VERIFIED_IDENTITY: number;
    readonly BOTH_EXPLICITLY_ABSENT: number;
    readonly ONE_ABSENT: number;
    readonly CONFLICTING_IDENTITIES: number;
  };
  readonly matchingNullsAreVerifiedIdentity: boolean;
  readonly requiredIdentityAbsent: boolean;
  readonly blocksLivePrimaryPromotion: boolean;
  readonly loadBearingAbsences: readonly unknown[];
  readonly evidenceReferenceAbsences: readonly unknown[];
  readonly reviewSurfaceComplete: boolean;
  readonly green: boolean;
  readonly failing: readonly string[];
  readonly law: string;
}

export interface ExtendedReconciliation {
  readonly schemaVersion: number;
  readonly stage: string;
  readonly kind: string;
  readonly conditions: readonly { readonly id: string; readonly holds: boolean; readonly detail: string | null }[];
  readonly requiredConditions: readonly string[];
  readonly failing: readonly string[];
  readonly green: boolean;
  readonly identity: TrialIdentityReconciliation;
  readonly sidecarBindings: Record<string, unknown>;
  readonly requiredReconciliations: readonly { readonly id: string; readonly detail: string }[];
  readonly priorReconciliationGreen: boolean;
  readonly priorFailing: readonly string[];
  readonly extendedBy: string;
  readonly secondReducerCreated: boolean;
  readonly law: string;
  readonly [key: string]: unknown;
}

export const NL: string;

export function classifyField(input: { field: string; durableValue: unknown; inMemoryValue: unknown }): FieldClassification;
export function reconcileTrialIdentity(input: { durableRecords?: readonly any[]; inMemoryRecords?: readonly any[]; plannedSessions?: readonly string[] }): TrialIdentityReconciliation;
export function reconcileTrialEvidence(input: Record<string, unknown>): Promise<ExtendedReconciliation>;
