/**
 * PLMP-LEAN-1 §D5-0 — the FIRST-PARTY authoritative result resolver.
 *
 *     (ATTEMPT_RESULT | DERIVED_RESULT) + identity  →  ResolvedResult
 *
 * It composes the readers that ALREADY own each fact and adds no storage of its own:
 *
 *   ATTEMPT_RESULT
 *     · the verification plane's subject source, which the verification plane already owns and which
 *       cross-checks the attempt row, its AttemptReport and its TaskEnvelope against each other
 *     · the attempt's captured world basis, which is the origin basis the admission recorded
 *
 *   DERIVED_RESULT
 *     · the candidate store, which holds the derivation and the candidate's source facet
 *
 * WHY THE SUBJECT SOURCE IS REUSED RATHER THAN A PARSER REWRITTEN. The verification plane's source is the
 * ONE place that turns canonical Work into "which result did this attempt produce", and it already refuses
 * an attempt whose report disagrees with its envelope. A second parser here would be a second reading of
 * the same question, and the two would drift — silently, and in the direction of whichever one a given
 * caller happened to reach.
 *
 * WHY THE BASIS IS REQUIRED. `resultManifestDigest` and `originBasisDigest` are what the effect
 * cross-checks against the admission's record, so a resolver that cannot establish the basis cannot
 * support the binding. It reports `null` (unresolvable) rather than a result with an unknown basis: an
 * unknown basis makes the binding unfalsifiable, and an unfalsifiable binding is not a binding.
 *
 * Host/deployment packaging (`src/deployment/**`): it reads records and holds no authority.
 */
import {
  resultSubjectRefDigest,
  type AuthoritativeResultResolver,
  type ResolvedResult,
  type ResultSubjectRef,
} from "../result/subject.js";
import type { DerivedResultCandidateStore } from "../project_world/index.js";
import type { AttemptResultVerificationSource } from "../project_verification/index.js";
import { attemptResultFacetsFromD2Attempt, type ProjectWorldBasis } from "../domain/world_basis.js";

export const FIRST_PARTY_RESULT_RESOLVER_ID = "first-party-authoritative-result-resolver";

/** What this resolver needs from the Work owner: the attempt's captured basis. */
export interface ResultResolverWorkReader {
  /**
   * The attempt's captured world basis AND its task, or null when no basis was ever recorded.
   *
   * Both come from ONE read because they are one record: the basis store keys on `(projectId, attemptId)`
   * and stores the task alongside, so a caller cannot be handed a basis from one attempt and a task from
   * another.
   */
  attemptBasis(attemptId: string): { readonly basis: ProjectWorldBasis; readonly taskId: string } | null;
  readonly projectId: string;
}

export function firstPartyResultResolver(input: {
  readonly owner: ResultResolverWorkReader;
  /** The verification plane's own ATTEMPT_RESULT source. Not reimplemented here. */
  readonly attemptResultSource: AttemptResultVerificationSource;
  readonly candidates: DerivedResultCandidateStore;
}): AuthoritativeResultResolver {
  return Object.freeze({
    adapterId: FIRST_PARTY_RESULT_RESOLVER_ID,

    resolve(resultSubjectRef: ResultSubjectRef): ResolvedResult | null {
      if (resultSubjectRef.kind === "DERIVED_RESULT") {
        const candidate = input.candidates.read(resultSubjectRef.ref);
        if (candidate === null) return null;
        return Object.freeze({
          resultSubjectRef: Object.freeze({ kind: "DERIVED_RESULT" as const, ref: candidate.candidateId }),
          resultManifestDigest: candidate.resultManifestDigest,
          projectId: candidate.projectId,
          taskId: candidate.taskId,
          originBasisDigest: candidate.derivation.originBasisDigest,
          sourceResult:
            candidate.sourceResult === null
              ? null
              : Object.freeze({
                  backend: candidate.sourceResult.backend,
                  baseRevision: candidate.sourceResult.baseRevision,
                  resultRevision: candidate.sourceResult.resultRevision,
                }),
          producedAssetRefs: candidate.producedAssetRefs,
        });
      }

      /**
       * ATTEMPT_RESULT. The subject source is consulted FIRST, because it is the owner of "which result did
       * this attempt produce" and it fails closed on an inconsistent record — so a corrupted attempt is
       * reported as unresolvable rather than resolved to a manifest this module computed from the same
       * corrupted fields.
       */
      let subject;
      try {
        subject = input.attemptResultSource.materialize(resultSubjectRef.ref);
      } catch {
        return null;
      }

      const recorded = input.owner.attemptBasis(resultSubjectRef.ref);
      /**
       * No captured basis ⇒ no origin basis. Every D2 attempt is in this position, and the honest answer is
       * "this deployment cannot resolve it" rather than a basis reconstructed from the current world.
       *
       * The task check is here rather than as its own branch because both owners must agree on ONE fact —
       * which task this attempt is — before either can be trusted to name a result. A disagreement means the
       * attempt row and the basis record describe different work, and nothing downstream may pick a winner.
       */
      if (recorded === null || recorded.taskId !== subject.taskId) return null;

      /**
       * The manifest is computed from the SAME facet model the rest of D3 uses, so an ATTEMPT_RESULT's
       * manifest digest here is the one a D3-a capture would produce — not a second digest scheme.
       */
      const facets = attemptResultFacetsFromD2Attempt({
        attemptId: resultSubjectRef.ref,
        taskId: recorded.taskId,
        basis: recorded.basis,
        resultCommit: subject.resultCommit,
      });
      return Object.freeze({
        resultSubjectRef: Object.freeze({ kind: "ATTEMPT_RESULT" as const, ref: resultSubjectRef.ref }),
        resultManifestDigest: facets.resultManifestDigest,
        projectId: input.owner.projectId,
        taskId: recorded.taskId,
        originBasisDigest: recorded.basis.basisDigest,
        sourceResult:
          facets.sourceResult === null
            ? null
            : Object.freeze({
                backend: facets.sourceResult.backend,
                baseRevision: facets.sourceResult.baseRevision,
                resultRevision: facets.sourceResult.resultRevision,
              }),
        producedAssetRefs: facets.producedAssets.map((asset) => asset.assetRef),
      });
    },
  });
}

/** Re-exported so a caller of this module can name a result reference without a second import. */
export { resultSubjectRefDigest };
