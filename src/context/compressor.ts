/**
 * Context Compiler C2 structured compressor (PLMP-CTX-1, raw-notes 预算.txt
 * §4/§10/§11). Compiles the project's deterministic evidence, worker
 * self-reports and the R7 claim graph into a source-hierarchy-preserving
 * brief: facts are copied 1:1 with their evidence ids, self-reports stay
 * marked as interpretations, and contradicted claims surface with both
 * sides listed - never averaged, never summarised into generated facts.
 *
 * The brief is a derived advisory artifact: "context is not a source of
 * truth" (§1) - it is never appended to the event log and never enters an
 * envelope ([CTX-INV-5]).
 */

export const CONTEXT_BRIEF_ORGAN = "context-compiler-c2";

export interface ContextEvidenceFactInput {
  readonly evidenceId: string;
  readonly status: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly predicate: string;
  readonly exitCode: number | null;
}

export interface ContextInterpretationInput {
  readonly attemptId: string;
  readonly taskId: string | null;
  readonly workerStatus: string;
  readonly summary: string;
}

export interface ContextClaimInput {
  readonly claimId: string;
  readonly label: string;
  readonly status: string;
  readonly supportedBy: readonly string[];
  readonly contradictedBy: readonly string[];
}

export interface ContextBriefInput {
  readonly projectId: string;
  readonly evidence: readonly ContextEvidenceFactInput[];
  readonly interpretations: readonly ContextInterpretationInput[];
  readonly claims: readonly ContextClaimInput[];
}

/** [CTX-INV-1]: the fact layer is the evidence projection, copied 1:1. */
export interface ContextFact {
  readonly evidenceId: string;
  readonly status: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly predicate: string;
  readonly exitCode: number | null;
}

/** [CTX-INV-2]: the interpretation layer carries no evidence ids. */
export interface ContextInterpretation {
  readonly attemptId: string;
  readonly taskId: string | null;
  readonly workerStatus: string;
  readonly summary: string;
}

/** [CTX-INV-3]: both sides listed, the R7 verdict copied verbatim. */
export interface ContextConflict {
  readonly claimId: string;
  readonly label: string;
  readonly status: string;
  readonly supportedBy: readonly string[];
  readonly contradictedBy: readonly string[];
}

export interface ContextBrief {
  readonly projectId: string;
  readonly facts: readonly ContextFact[];
  readonly interpretations: readonly ContextInterpretation[];
  readonly conflicts: readonly ContextConflict[];
}

export function compileContextBrief(input: ContextBriefInput): ContextBrief {
  return {
    projectId: input.projectId,
    facts: input.evidence.map((fact) => ({ ...fact })),
    interpretations: input.interpretations.map((entry) => ({ ...entry })),
    conflicts: input.claims
      .filter((claim) => claim.contradictedBy.length > 0)
      .map((claim) => ({
        claimId: claim.claimId,
        label: claim.label,
        status: claim.status,
        supportedBy: [...claim.supportedBy],
        contradictedBy: [...claim.contradictedBy],
      })),
  };
}
