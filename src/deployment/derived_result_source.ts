/**
 * PLMP-LEAN-1 §D3-d3 — the FIRST-PARTY derived-result subject source.
 *
 *     a candidate record  →  a DERIVED_RESULT verification subject
 *
 * It reads the recorded candidate and derives the subject's every identity field from it, exactly as the
 * attempt-result source reads canonical Work. A caller names a `candidateId` and nothing else; the
 * revisions, the derivation identity and the origin manifest all come from what was RECORDED.
 *
 * WHY THE ORIGIN MANIFEST IS IN THE SUBJECT. A candidate is only meaningful together with what it was
 * derived FROM, so the subject carries `originResultManifestDigest`. That is what keeps
 * `Verification(R_0) ⇏ Verification(R_1)` structurally true: a verifier run over the candidate names the
 * candidate and its origin separately, and no code path can read the origin's verdict as the candidate's.
 *
 * Host/deployment packaging (`src/deployment/**`): it reads one record and holds no authority.
 */
import {
  materializeDerivedResultVerificationSubject,
  ProjectVerificationError,
  type DerivedResultVerificationSubject,
} from "../project_verification/index.js";
import type { DerivedResultVerificationSource } from "../project_verification/service.js";
import type { DerivedResultCandidateStore } from "../project_world/index.js";

export function firstPartyDerivedResultVerificationSource(input: {
  readonly store: DerivedResultCandidateStore;
}): DerivedResultVerificationSource {
  return Object.freeze({
    materialize(candidateId: string): DerivedResultVerificationSubject {
      const candidate = input.store.read(candidateId);
      if (candidate === null) {
        throw new ProjectVerificationError(
          "invalid_value",
          `derived result candidate "${candidateId}" is not recorded, so there is no immutable result to verify`,
        );
      }
      /**
       * A candidate without a source facet has no revision to check out, so it is not verifiable by a
       * revision-based protocol. Reported as an error rather than as a subject with an empty revision: a
       * subject that cannot be materialized must fail where it is DERIVED, not silently downstream.
       */
      if (candidate.sourceResult === null) {
        throw new ProjectVerificationError(
          "invalid_value",
          `derived result candidate "${candidateId}" carries no source facet, so no revision exists to verify`,
        );
      }
      return materializeDerivedResultVerificationSubject({
        projectId: candidate.projectId,
        taskId: candidate.taskId,
        candidateId: candidate.candidateId,
        derivationId: candidate.derivation.derivationId,
        originResultManifestDigest: candidate.derivation.originResultManifestDigest,
        baseRevision: candidate.sourceResult.baseRevision,
        resultRevision: candidate.sourceResult.resultRevision,
        resultManifestDigest: candidate.resultManifestDigest,
      });
    },
  });
}
