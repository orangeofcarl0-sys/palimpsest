/**
 * Context Requirement compiler (PLMP-CTX-2 §1, raw-notes 预算.txt §3). Answers
 * "what kinds of information should an attempt know" BEFORE any retrieval:
 * exact references, the code surface (own + upstream write paths), evidence
 * subjects from prior failures, historical placeholders, and the forbidden
 * set - the R2 invalidation output verbatim, which later becomes the
 * manifest's excluded_stale (§9).
 *
 * Pure function: deterministic derivation from existing projections, no I/O,
 * no model calls (concept extraction stays host/model-side).
 */

export interface ContextRequirementInput {
  readonly projectId: string;
  readonly taskId: string;
  /** TaskSpec.required_artifacts: exact references the task must honour. */
  readonly requiredArtifacts: readonly string[];
  /** This task's write surface. */
  readonly writePaths: readonly string[];
  /** Write surfaces of the tasks this one depends on (upstream contracts). */
  readonly upstreamWritePaths: readonly string[];
  /** Evidence ids recorded against failed attempts of this task. */
  readonly priorFailureEvidence: readonly string[];
  /** R2 invalidation output: stale entity references, passed through verbatim. */
  readonly staleRefs: readonly string[];
}

export interface ContextRequirement {
  readonly projectId: string;
  readonly taskId: string;
  /** Exact references (artifacts), deduplicated and sorted. */
  readonly exact: readonly string[];
  /** Code surface: own write paths followed by upstream write paths. */
  readonly codePaths: readonly string[];
  /** Evidence subjects from prior failures of this task. */
  readonly evidenceSubjects: readonly string[];
  /** V0 placeholder: superseded IR revisions (empty until IR history lands). */
  readonly historical: readonly string[];
  /** Forbidden context: the stale set, verbatim ([CTX2-A02]). */
  readonly forbiddenStale: readonly string[];
}

function dedupeSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function compileContextRequirement(input: ContextRequirementInput): ContextRequirement {
  return {
    projectId: input.projectId,
    taskId: input.taskId,
    exact: dedupeSorted(input.requiredArtifacts),
    codePaths: dedupeSorted([...input.writePaths, ...input.upstreamWritePaths]),
    evidenceSubjects: dedupeSorted(input.priorFailureEvidence),
    historical: [],
    forbiddenStale: dedupeSorted(input.staleRefs),
  };
}
