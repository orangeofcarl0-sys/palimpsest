/**
 * APS-A — ProjectPulse: the decision-oriented, derived continuation view.
 *
 * It is NOT a second project database. Every field is either a reference to an existing owner's
 * projection (the continuity summary, Work status, the project journal, the delegation runtime) or a
 * clearly-labelled ADVISORY judgement. The two next-action lists are deliberately separate:
 *
 *   mechanical      what the scheduler/product can legally execute next
 *   decisionRelevant what a principal may judge worth doing, given the current reality
 *
 * Only the first is an executable fact. The second is not authority.
 */
import type { ContinuityBasis, ContinuityItem, ContinuityTask, ProjectSummary } from "../project_continuity/index.js";
import type { ContributionChainEntry, DelegationPulseEntry } from "../project_contribution/types.js";

export const PULSE_DECISION_KINDS = [
  "OPERATOR_ACCEPTANCE",
  "CONTRIBUTION_ASSESSMENT",
  "STALE_CONTRIBUTION",
  "TERMINAL_DELEGATION",
  "INTERRUPTED_DELEGATION",
  "BLOCKED_EFFECT",
  "OPEN_QUESTION",
] as const;
export type PulseDecisionKind = (typeof PULSE_DECISION_KINDS)[number];

export interface PulseDecisionItem {
  readonly kind: PulseDecisionKind;
  readonly ref: string;
  readonly detail: string;
  readonly who: "OPERATOR" | "AGENT";
  /** Always true: this is a judgement prompt, never a permission or an acceptance. */
  readonly advisory: true;
}

export interface ProjectPulse {
  readonly schema: "pc1-project-pulse/v1";
  readonly projectId: string;
  readonly goal: string;
  readonly basis: ContinuityBasis;
  readonly requirements: readonly ContinuityItem[];
  readonly acceptedAssets: readonly ContinuityItem[];
  readonly candidates: readonly ContinuityItem[];
  readonly negativeFindings: readonly ContinuityItem[];
  readonly openQuestions: readonly ContinuityItem[];
  readonly recentChanges: readonly { readonly id: string; readonly kind: string; readonly title: string }[];
  readonly pendingWork: readonly ContinuityTask[];
  readonly blocked: readonly ContinuityItem[];
  readonly contributions: readonly ContributionChainEntry[];
  readonly delegations: readonly DelegationPulseEntry[];
  readonly decisionQueue: readonly PulseDecisionItem[];
  readonly nextActions: {
    /** What the scheduler/product can mechanically execute next. */
    readonly mechanical: readonly string[];
    /** Advisory judgement prompts. Never authority and never a promise of value. */
    readonly decisionRelevant: readonly string[];
    readonly distinction: string;
  };
  readonly authorityBoundaries: readonly string[];
  readonly sources: readonly { readonly ref: string; readonly digest: string | null }[];
  readonly coverage: {
    readonly complete: boolean;
    readonly unavailable: readonly string[];
    readonly omitted: readonly string[];
  };
  readonly digest: string;
}
