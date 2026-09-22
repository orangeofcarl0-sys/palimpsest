/**
 * PLMP-LEAN-1 §C.13: ONE place turns an opened branch's OUTPUT into a settled candidate.
 *
 *     branch output  →  structured statement  →  submitCandidate  →  evaluateCandidate
 *
 * The reason this is shared rather than duplicated: `palimpsest_collaborate` (the blocking recipe path)
 * and `palimpsest_delegate` (the async D1 path) must not drift into two slightly different ideas of
 * what settling a branch means. Two implementations would produce exactly that — `collaborate`'s
 * candidate semantics quietly diverging from `delegate`'s — and the divergence would be invisible
 * until a candidate was admitted by one path and not the other.
 *
 * Deliberately takes the branch's OUTPUT, not the execution port: the caller owns HOW the output is
 * produced (a blocking `run` or an async `start().completion`), and this owns what happens to it.
 * ReasoningCell remains the candidate/admission owner; nothing here decides standing.
 *
 * INTERNAL: not re-exported by the reasoning-cell barrel, so it stays out of the package public API.
 */
import { REASONING_STATEMENT_TYPE, type ReasoningClaimTypeRef } from "./claims.js";
import type { ReasoningCellService } from "./service.js";

/** Extract a structured statement from an opaque branch result; unknown shapes stay unresolved. */
export function statementFromOutput(output: unknown): string | undefined {
  if (typeof output === "string") {
    return output.trim() === "" ? undefined : output;
  }
  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    const statement = (output as { readonly statement?: unknown }).statement;
    if (typeof statement === "string" && statement.trim() !== "") return statement;
  }
  return undefined;
}

/**
 * UX-C §15/SC-3: the evidence refs the BRANCH actually cited. They must reach `submitCandidate` as
 * `externalEvidenceRefs`; before UX-C they were dropped, so a branch that cited evidence produced a
 * different `candidateDigest` whose candidate was never evaluated and whose citation was lost. The
 * branch HOST has already enforced the frozen allowlist structurally; this only normalizes.
 */
export function evidenceRefsFromOutput(output: unknown): readonly string[] {
  if (typeof output !== "object" || output === null || Array.isArray(output)) return Object.freeze([] as string[]);
  const raw = (output as { readonly evidenceRefs?: unknown }).evidenceRefs;
  if (!Array.isArray(raw)) return Object.freeze([] as string[]);
  const out = new Set<string>();
  for (const entry of raw) {
    if (typeof entry === "string" && entry.length > 0) out.add(entry);
    else if (typeof entry === "object" && entry !== null && typeof (entry as { readonly evidenceId?: unknown }).evidenceId === "string") {
      const evidenceId = (entry as { readonly evidenceId: string }).evidenceId;
      if (evidenceId.length > 0) out.add(evidenceId);
    }
  }
  return Object.freeze([...out].sort());
}

/**
 * The ReasoningCell face settlement needs: the SAME service the recipe path uses, narrowed to the two
 * methods that own candidate submission and evaluation. Taking the real type (rather than a structural
 * re-declaration) is what makes drift impossible — a signature change in the owner breaks this module
 * instead of being silently tolerated.
 */
export type BranchSettlementOwner = Pick<ReasoningCellService, "submitCandidate" | "evaluateCandidate">;

export interface BranchSettlement {
  readonly admittedClaimId: string | null;
  /**
   * The candidate converged on an existing claim (DEDUPLICATED): neither admitted here nor
   * unresolved. Kept distinct so the caller's counters stay honest.
   */
  readonly converged: boolean;
  readonly unresolved: boolean;
}

/**
 * Settle one branch from its output. A missing statement, a host failure surfaced as a non-statement,
 * a rejected evaluation and a verification error are all `unresolved` — never a fabricated claim.
 */
export async function settleBranchFromOutput(input: {
  readonly reasoning: BranchSettlementOwner;
  readonly cellId: string;
  readonly branchId: string;
  readonly output: unknown;
}): Promise<BranchSettlement> {
  const statement = statementFromOutput(input.output);
  if (statement === undefined) {
    return Object.freeze({ admittedClaimId: null, converged: false, unresolved: true });
  }
  const citedEvidenceRefs = evidenceRefsFromOutput(input.output);
  const submitted = await input.reasoning.submitCandidate({
    cellId: input.cellId,
    branchId: input.branchId,
    type: REASONING_STATEMENT_TYPE,
    content: { statement },
    ...(citedEvidenceRefs.length === 0
      ? {}
      : { externalEvidenceRefs: citedEvidenceRefs.map((evidenceId) => Object.freeze({ evidenceId })) }),
  });
  if (submitted.status !== "PENDING") {
    return Object.freeze({ admittedClaimId: null, converged: true, unresolved: false });
  }
  const evaluation = await input.reasoning.evaluateCandidate({
    cellId: input.cellId,
    candidateDigest: submitted.candidate.candidateDigest,
  });
  if (evaluation.status === "admitted" && evaluation.claimId !== undefined) {
    return Object.freeze({ admittedClaimId: evaluation.claimId, converged: false, unresolved: false });
  }
  // rejected / unresolved / blocked / stale / verification error all stay honest.
  return Object.freeze({ admittedClaimId: null, converged: false, unresolved: true });
}
