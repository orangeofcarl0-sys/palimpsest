/**
 * PC1 S06 — domain outcomes.
 *
 * Three completion statuses that must never collapse into one:
 *
 *   execution/delivery   the Work state and the delivered artifact;
 *   work acceptance      whether the canonical Promotion accepted the result;
 *   business outcome     whether the declared domain question is supported, infeasible, uncertain,
 *                        contested or partially fulfilled.
 *
 * The business outcome is a projection over an EXPLICIT domain contract. A contract is deterministic
 * over the facts it is given, names its own evidence, and can return `uncertain`. There is no
 * universal truth engine and no model-filled high-authority label.
 */
export const OUTCOME_STATUSES = ["supported", "infeasible", "uncertain", "contested", "partially_fulfilled", "unknown"] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export interface DomainContractContext {
  readonly repository: string | undefined;
  readonly readBytes: (path: string) => Buffer;
  readonly journalEntry: (entryId: string) => Promise<{ readonly kind: string; readonly title: string; readonly body: string; readonly digest: string } | undefined>;
}

export interface DomainContractResult {
  readonly status: OutcomeStatus;
  readonly detail: string;
  readonly evidenceRefs: readonly string[];
  readonly unmetRequirements: readonly string[];
  readonly investigationComplete: boolean;
}

export interface DomainContract {
  readonly contractId: string;
  readonly version: string;
  readonly question: string;
  readonly requiredInputs: readonly string[];
  evaluate(input: { readonly taskId: string; readonly artifactPath: string | null; readonly parameters: Readonly<Record<string, unknown>> }, context: DomainContractContext): Promise<DomainContractResult>;
}

export interface DomainEvaluation {
  readonly schema: "pc1-domain-outcome/v1";
  readonly evaluationId: string;
  readonly taskId: string;
  readonly contractId: string;
  readonly contractVersion: string;
  readonly status: OutcomeStatus;
  readonly question: string;
  readonly detail: string;
  readonly evidenceRefs: readonly string[];
  readonly unmetRequirements: readonly string[];
  readonly investigationComplete: boolean;
  readonly artifactPath: string | null;
  readonly artifactDigest: string | null;
  readonly evaluatedAt: string;
}

export interface EvaluatedTaskOutcome {
  readonly taskId: string;
  readonly execution: string;
  readonly workAcceptance: "ACCEPTED" | "CANDIDATE" | "NOT_ACCEPTED" | "UNKNOWN";
  readonly businessOutcome: OutcomeStatus;
  readonly investigationComplete: boolean;
  readonly unmetRequirements: readonly string[];
  readonly evaluation: DomainEvaluation | null;
  readonly detail: string;
}
