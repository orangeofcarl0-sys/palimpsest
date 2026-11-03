/**
 * APS-A/B — project contribution records.
 *
 * A CONTRIBUTION is a finding that ARRIVED from another executor (a native DSH Subagent, an async
 * Palimpsest delegation, or an explicit exploration) and may bear on the project. It is NOT Evidence,
 * not acceptance and not authority. The record lives in the EXISTING Project Journal as a
 * non-canonical note; this module owns no store and no second ledger.
 *
 * The chain this vocabulary makes observable is:
 *
 *     contribution recorded  ->  principal decision  ->  ACTUAL plan revision  ->  downstream Work
 *
 * `declaredChangedPlan` is only a declaration. `planChange` is the observed revision delta the
 * product itself produced when the decision was applied.
 */
import { canonicalDigest } from "../schema/canonical.js";

export const CONTRIBUTION_SOURCE_KINDS = ["NATIVE_SUBAGENT", "DELEGATION", "EXPLORATION"] as const;
export type ContributionSourceKind = (typeof CONTRIBUTION_SOURCE_KINDS)[number];

export const CONTRIBUTION_OBSERVATIONS = ["PRODUCT_OBSERVED_TERMINAL", "PRINCIPAL_DECLARED"] as const;
export type ContributionObservation = (typeof CONTRIBUTION_OBSERVATIONS)[number];

export const READ_FOOTPRINT_OBSERVATIONS = ["DECLARED", "NOT_OBSERVED"] as const;
export type ReadFootprintObservation = (typeof READ_FOOTPRINT_OBSERVATIONS)[number];

export const CONTRIBUTION_DECISIONS = [
  "ACKNOWLEDGE",
  "ACCEPT_AS_CANDIDATE",
  "REJECT",
  "NEEDS_MORE_EVIDENCE",
  "REVISE_PLAN",
] as const;
export type ContributionDecisionKind = (typeof CONTRIBUTION_DECISIONS)[number];

export const CONTRIBUTION_STATUSES = [
  "UNASSESSED",
  "ACKNOWLEDGED",
  "CANDIDATE",
  "REJECTED",
  "NEEDS_MORE_EVIDENCE",
  "PLAN_CHANGED",
] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

export interface ContributionBasis {
  readonly projectRevision: number;
  readonly projectDigest: string;
  readonly headCommit: string;
}

export interface ContributionRecord {
  readonly schema: "pc1-contribution/v1";
  readonly contributionId: string;
  readonly projectId: string;
  readonly sourceKind: ContributionSourceKind;
  readonly sourceRef: string;
  readonly task: string;
  readonly finding: string;
  readonly basis: ContributionBasis;
  readonly observation: ContributionObservation;
  /**
   * What the executor says it read. For a delegation this is the receipt's DECLARED footprint; for a
   * native subagent it is the principal's declaration. It is never an observation of the child process.
   */
  readonly declaredReadFootprint: readonly string[];
  readonly readFootprintObservation: ReadFootprintObservation;
  readonly artifacts: readonly string[];
  /** A single contribution is never independent verification of its own claim. */
  readonly independentVerification: false;
  readonly createdAt: string;
}

export interface ContributionPlanChange {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly addedTaskIds: readonly string[];
  readonly removedTaskIds: readonly string[];
  readonly changedTaskIds: readonly string[];
  readonly changeClass: string | null;
  readonly changedIds: readonly string[];
  readonly reason: string;
}

export interface ContributionDecisionRecord {
  readonly schema: "pc1-contribution-decision/v1";
  readonly decisionId: string;
  readonly projectId: string;
  readonly contributionId: string;
  readonly decision: ContributionDecisionKind;
  readonly decisionNote: string;
  /** The project basis at the moment of the decision, BEFORE any plan revision it applies. */
  readonly basisAtDecision: ContributionBasis;
  /** Whether the contribution's own basis still matches that moment. */
  readonly basisState: "CURRENT" | "STALE";
  /** The principal's declaration; never proof that the project changed. */
  readonly declaredChangedPlan: boolean;
  /** The ACTUAL plan delta, or null when no plan revision was applied. */
  readonly planChange: ContributionPlanChange | null;
  readonly createdAt: string;
}

export interface DelegationStartRecord {
  readonly schema: "pc1-delegation-start/v1";
  readonly projectId: string;
  readonly delegationRef: string;
  readonly task: string;
  readonly basisCommit: string;
  readonly basis: ContributionBasis | null;
  readonly createdAt: string;
}

export interface ContributionDecisionEntry {
  readonly record: ContributionDecisionRecord;
  readonly journalEntryId: string;
}

export interface ContributionDownstream {
  readonly planRevision: number | null;
  readonly addedTaskIds: readonly string[];
  readonly taskStates: readonly { readonly taskId: string; readonly state: string }[];
  readonly acceptedTaskIds: readonly string[];
  /** TRUE only when a task introduced by the actual plan change reached an accepted Work state. */
  readonly observableOutcome: boolean;
}

export interface ContributionChainEntry {
  readonly record: ContributionRecord;
  readonly journalEntryId: string;
  readonly decisions: readonly ContributionDecisionEntry[];
  readonly latestDecision: ContributionDecisionEntry | null;
  readonly status: ContributionStatus;
  readonly basisState: "CURRENT" | "STALE";
  readonly downstream: ContributionDownstream;
}

export interface DelegationPulseEntry {
  readonly delegationRef: string;
  readonly task: string;
  readonly state: string;
  readonly basisCommit: string | null;
  readonly basisState: "CURRENT" | "STALE" | "UNKNOWN";
  /** TRUE once a contribution record for this ref exists. It does not imply a decision was made. */
  readonly consumed: boolean;
  readonly assessed: boolean;
  readonly contributionId: string | null;
  readonly detail: string;
}

export function contributionIdOf(input: {
  readonly projectId: string;
  readonly sourceKind: ContributionSourceKind;
  readonly sourceRef: string;
  readonly task: string;
  readonly finding: string;
  readonly basis: ContributionBasis;
}): string {
  return `ctb-${canonicalDigest({
    domain: "palimpsest.project-contribution.v1",
    projectId: input.projectId,
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
    task: input.task,
    finding: input.finding,
    basis: input.basis,
  }).slice(0, 32)}`;
}

export function contributionDecisionIdOf(input: {
  readonly projectId: string;
  readonly contributionId: string;
  readonly decision: ContributionDecisionKind;
  readonly decisionNote: string;
  readonly declaredChangedPlan: boolean;
  readonly planFingerprint: string;
}): string {
  return `ctd-${canonicalDigest({
    domain: "palimpsest.project-contribution-decision.v1",
    projectId: input.projectId,
    contributionId: input.contributionId,
    decision: input.decision,
    decisionNote: input.decisionNote,
    declaredChangedPlan: input.declaredChangedPlan,
    planFingerprint: input.planFingerprint,
  }).slice(0, 32)}`;
}
