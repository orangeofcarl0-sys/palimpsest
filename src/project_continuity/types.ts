/**
 * PC1 S03 — project cognition continuity.
 *
 * Three responsibilities, deliberately separated and all DERIVED:
 *
 *   historical material   the existing events, journal entries, attempts and promotions;
 *   current understanding  this module's projection of goals, adopted results, candidates, negative
 *                          findings, open questions and pending work, each with its standing and basis;
 *   context capsule        a bounded rendering of that projection for the next session.
 *
 * It owns no store and copies no canonical truth. Every item names the owner reference it came from.
 * When an owner does not compose, the projection says `unavailable` rather than inventing a fact.
 */
import { canonicalDigest } from "../schema/canonical.js";
import type { ProjectIr } from "../schema/models.js";
import type { ProjectJournalViewEntry } from "../project_workspace/journal.js";
import type { OpenLoop } from "../project_workspace/view.js";

export const FACT_STANDINGS = [
  "OBSERVED_SOURCE",
  "AGENT_INTERPRETATION",
  "CANDIDATE",
  "ACCEPTED_FOR_PURPOSE",
  "NEGATIVE_FINDING",
  "UNCERTAIN",
  "SUPERSEDED",
  "UNKNOWN",
] as const;
export type FactStanding = (typeof FACT_STANDINGS)[number];

export interface ContinuityBasis {
  readonly projectRevision: number;
  readonly projectDigest: string;
  readonly headCommit: string;
  readonly observedAt: string;
}

export interface ContinuityItem {
  readonly id: string;
  readonly standing: FactStanding;
  readonly title: string;
  readonly detail: string;
  readonly sourceRefs: readonly string[];
  readonly basis: ContinuityBasis;
  readonly applicability: string;
  readonly adoptionBasis?: string | undefined;
  readonly reopenConditions: readonly string[];
  /** PC1-V1 R7: history and current usability are separate facts, never one inferred label. */
  readonly historicalAcceptance?: "ACCEPTED" | undefined;
  readonly currentApplicability?: "APPLICABLE" | "CONTRADICTED" | "SUPERSEDED" | "UNKNOWN" | undefined;
  readonly applicabilityBasis?: string | undefined;
}

export interface ContinuityTask {
  readonly taskId: string;
  readonly state: string;
  readonly objective: string;
  /** PC1 S06: the canonical Work acceptance status, separate from execution and business outcome. */
  readonly workAcceptance?: "ACCEPTED" | "CANDIDATE" | "NOT_ACCEPTED" | "UNKNOWN" | undefined;
  /** PC1 S06: the explicit domain-contract outcome; `unknown` when no contract was evaluated. */
  readonly businessOutcome?: "supported" | "infeasible" | "uncertain" | "contested" | "partially_fulfilled" | "unknown" | undefined;
  readonly investigationComplete?: boolean | undefined;
  readonly unmetRequirements?: readonly string[] | undefined;
  readonly outcomeDetail?: string | undefined;
}

export interface ProjectSummary {
  readonly schema: "pc1-project-summary/v1";
  readonly projectId: string;
  readonly goal: string;
  readonly basis: ContinuityBasis;
  readonly coverage: {
    readonly complete: boolean;
    readonly omitted: readonly string[];
    readonly unavailable: readonly string[];
  };
  readonly requirements: readonly ContinuityItem[];
  readonly decisions: readonly ContinuityItem[];
  readonly acceptedResults: readonly ContinuityItem[];
  readonly candidates: readonly ContinuityItem[];
  readonly negativeFindings: readonly ContinuityItem[];
  readonly openQuestions: readonly ContinuityItem[];
  /** PC1-V1 R7: the latest bounded journal changes, for a decision-oriented capsule. */
  readonly recentChanges?: readonly { readonly id: string; readonly kind: string; readonly title: string }[];
  readonly tasks: readonly ContinuityTask[];
  readonly pendingWork: readonly ContinuityTask[];
  readonly blocked: readonly ContinuityItem[];
  readonly authorizationBoundaries: readonly string[];
  readonly nextActions: readonly string[];
  readonly digest: string;
}

export interface ProjectExplanation {
  readonly schema: "pc1-project-explain/v1";
  readonly subject: string;
  readonly found: boolean;
  readonly standing: FactStanding;
  readonly item?: ContinuityItem | undefined;
  readonly basis: ContinuityBasis;
  readonly availableRefs: readonly string[];
  readonly detail: string;
}

export interface ContextCapsule {
  readonly schema: "pc1-context-capsule/v1";
  readonly projectId: string;
  readonly basis: ContinuityBasis;
  readonly budgetBytes: number;
  readonly usedBytes: number;
  readonly complete: boolean;
  readonly omitted: readonly string[];
  readonly sourceIndex: readonly { readonly ref: string; readonly digest: string | null }[];
  readonly text: string;
  readonly digest: string;
}

export interface ContinuityInput {
  readonly work: {
    project(): ProjectIr;
    status(): {
      revision: number;
      headCommit: string;
      schedulerState: string;
      tasks: readonly { task_id: string; state: string }[];
      attempts: readonly { attempt_id: string; task_id: string | null; state: string }[];
      evidence: readonly { evidence_id: string; status: string }[];
      promotions: readonly { promotion_id: string; state: string }[];
      promotionFence: readonly { promotion_id: string; attempt_id: string; task_id: string; state: string }[];
      /** PC1-V1 R2: the Work owner's truthful next-action explanation, when present. */
      nextAction?: {
        readonly kind: string;
        readonly executable: boolean;
        readonly action: string | null;
        readonly detail: string;
        readonly taskId: string | null;
      };
    };
    promotionFacts(): readonly {
      promotionId: string;
      attemptId: string;
      sourceCommit: string;
      expectedHeadCommit: string;
      resultingHeadCommit: string;
    }[];
  };
  readonly workspace?:
    | {
        journal(projectId?: string): Promise<readonly ProjectJournalViewEntry[]>;
        openLoops(): Promise<readonly OpenLoop[]>;
      }
    | undefined;
  readonly authority?: {
    readonly operatorIntentAdmission: boolean;
    readonly sourceIntake: "operator_only" | "unavailable";
    readonly promotion: "operator_only";
  };
  /** PC1 S06: the derived domain outcomes, when a domain-outcome service is composed. */
  readonly outcomes?: (() => Promise<readonly {
    readonly taskId: string;
    readonly businessOutcome: "supported" | "infeasible" | "uncertain" | "contested" | "partially_fulfilled" | "unknown";
    readonly investigationComplete: boolean;
    readonly unmetRequirements: readonly string[];
    readonly detail: string;
  }[]>) | undefined;
  readonly clock?: (() => string) | undefined;
}
