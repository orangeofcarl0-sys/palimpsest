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
import type { ContinuityBasis, ContinuityItem, ContinuityTask, ProjectSummary, PulseEpisode } from "../project_continuity/index.js";
import type { ContributionChainEntry, DelegationPulseEntry } from "../project_contribution/types.js";

export const PULSE_DECISION_KINDS = [
  "OPERATOR_ACCEPTANCE",
  "CONTRIBUTION_ASSESSMENT",
  "STALE_CONTRIBUTION",
  "TERMINAL_DELEGATION",
  "INTERRUPTED_DELEGATION",
  "EXECUTION_UNOBSERVED",
  "ORPHANED_EXECUTION",
  "STOP_REQUESTED",
  "STALE_RESULT",
  "EPISODE_REOPENED",
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

/**
 * LHAPE-A/B: what this host can honestly say about execution right now.
 *
 * `hostObserved` is the load-bearing distinction: a canonical attempt may be RUNNING while no worker
 * exists in THIS process (a restart, a killed host, a different host). That is UNOBSERVED, not alive.
 */
export interface PulseExecutionView {
  readonly placement: "in-place" | "worktree" | "UNKNOWN";
  readonly attempts: readonly {
    readonly taskId: string | null;
    readonly state: string;
    readonly taskState: string | null;
    readonly orphaned: boolean;
    readonly hostObserved: boolean;
    /**
     * PWRS-A: the durable settlement attribution for this task's latest result, when one was
     * recorded. `null` means no settlement record exists — not that a worker wrote it.
     */
    readonly relay?: {
      readonly attribution: string;
      readonly executor: string;
      readonly settledBy: string;
      readonly resultCommit: string;
      readonly independenceEligible: boolean;
      readonly detail: string;
    } | null;
  }[];
  readonly jobs: readonly {
    readonly taskId: string;
    readonly phase: string;
    readonly settlementState: string | null;
    readonly stopRequested: boolean;
  }[];
  readonly detail: string;
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
  readonly execution: PulseExecutionView;
  /**
   * ALHS-A: the episode's own convergence state. It is a judgement recorded by the principal plus the
   * product's factual readiness check — never an acceptance, and never proof that the goal is met.
   */
  readonly episode: PulseEpisode;
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
