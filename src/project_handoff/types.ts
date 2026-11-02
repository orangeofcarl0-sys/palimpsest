/**
 * PC1 S05 — structured collaboration handoffs, receipts and independence accounting.
 *
 * This module is the CONTRACT layer between the existing executors and a project:
 *
 *   native DSH subagent | Reasoning Branch | Managed Work Worker | durable project peer
 *
 * It owns no executor, no transport and no truth. It states what a handoff must contain, what a
 * receipt may claim, how shared sources are counted, and how a conflict is preserved. The actual
 * running of a branch/delegation/federation message stays with the existing owners.
 */
export const EXECUTOR_KINDS = ["NATIVE_SUBAGENT", "REASONING_BRANCH", "MANAGED_WORK_WORKER", "DURABLE_PROJECT_PEER"] as const;
export type ExecutorKind = (typeof EXECUTOR_KINDS)[number];

export interface HandoffBudget {
  readonly maxSteps: number;
  readonly maxWallSeconds: number;
  readonly maxTokens: number | null;
}

export interface ProjectBasisRef {
  readonly projectRevision: number;
  readonly projectDigest: string;
  readonly headCommit: string;
}

export interface Handoff {
  readonly schema: "pc1-handoff/v1";
  readonly handoffId: string;
  readonly task: string;
  readonly intent: string;
  readonly constraints: readonly string[];
  readonly projectBasis: ProjectBasisRef;
  readonly sources: readonly {
    readonly ref: string;
    readonly standing: "ACCEPTED_FOR_PURPOSE" | "CANDIDATE" | "NEGATIVE_FINDING" | "OPEN_QUESTION" | "UNKNOWN";
    readonly digest: string | null;
  }[];
  readonly allowedResources: readonly string[];
  readonly expectedArtifact: string;
  readonly knownGaps: readonly string[];
  readonly stopConditions: readonly string[];
  readonly budget: HandoffBudget;
  readonly decisionsNeeded: readonly string[];
  readonly createdAt: string;
}

export interface ReceiptFinding {
  readonly claim: string;
  readonly sources: readonly {
    readonly ref: string;
    readonly rootId: string;
    readonly digest: string | null;
  }[];
  readonly hypothesis: boolean;
  readonly counterEvidence: readonly string[];
  readonly uncertainty: string;
}

export interface CollaborationReceipt {
  readonly schema: "pc1-receipt/v1";
  readonly receiptId: string;
  readonly handoffId: string;
  readonly executor: ExecutorKind;
  readonly executorIdentity: string;
  readonly findings: readonly ReceiptFinding[];
  readonly artifacts: readonly string[];
  readonly readFootprint: readonly string[];
  /** Sources this executor saw that another executor also saw. Filled by the caller or the audit. */
  readonly sharedSources: readonly string[];
  readonly status: "COMPLETE" | "PARTIAL" | "CONFLICT" | "INTERRUPTED" | "REFUSED";
  readonly limitations: readonly string[];
  readonly followUp: readonly string[];
  readonly createdAt: string;
}

export interface IndependenceAssessment {
  readonly receipts: number;
  readonly uniqueRootSources: readonly string[];
  readonly duplicatedSources: readonly string[];
  readonly independentClaims: readonly string[];
  readonly sharedClaimRoots: readonly { readonly claim: string; readonly rootId: string; readonly receipts: readonly string[] }[];
  readonly conflicts: readonly { readonly claim: string; readonly receipts: readonly string[]; readonly detail: string }[];
  /**
   * True only when a claim is supported by at least two receipts that did NOT share a root source.
   * Multiple summaries of the same document never satisfy this.
   */
  readonly independentVerification: boolean;
  readonly detail: string;
}

export interface MechanismSelection {
  readonly executor: ExecutorKind | "PRINCIPAL_ONLY" | "UNAVAILABLE";
  readonly why: string;
  readonly use: string;
  readonly cost: string;
  readonly capability: string;
}

export interface MechanismInput {
  readonly independentInformation: boolean;
  readonly crossCheck: boolean;
  readonly complementaryDomain: boolean;
  readonly realParallelGain: boolean;
  readonly durablePeerNeeded: boolean;
  readonly crossProjectNeeded: boolean;
  readonly capabilities: {
    readonly nativeSubagent: boolean;
    readonly reasoningBranch: boolean;
    readonly managedWorkWorker: boolean;
    readonly durablePeer: boolean;
    readonly crossProject: boolean;
  };
}
