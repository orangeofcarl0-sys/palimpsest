/**
 * UX-C §9/§11/§12/SC-4/SC-5 — the FIRST-PARTY LOCAL COLLABORATION BUNDLE.
 *
 * This is PRODUCT PACKAGING over EXISTING seams, not a new semantic species:
 *
 *   - a stable derived store path for a deployment-owned `SqliteReasoningCellStore`;
 *   - one concrete `ReasoningVerificationPolicyPort` implementation that is
 *     HONESTLY EXPLORATORY (it never invents evidence and never returns
 *     `SUPPORTED`);
 *   - one concrete `ReasoningEpistemicAdmissionPolicyPort` implementation whose
 *     ADMIT means exactly "include this structured hypothesis in the cell-local
 *     frontier" — NOT verified true, NOT Evidence, NOT Proof, NOT Work admission
 *     and NOT authority (§12).
 *
 * Both policies are BOUND to the first-party recipe Explore policy refs
 * (`src/recipes/execution.ts`): a cell opened with any other ref is refused/
 * unresolved instead of silently admitted. That restriction is what stops this
 * from becoming a generic permissive ReasoningCell policy.
 *
 * Nothing here reads a store, opens a cell, spawns a branch or sends anything.
 */

import { dirname, join } from "node:path";

import type {
  ReasoningAdmissionInput,
  ReasoningEpistemicAdmissionPolicyPort,
  ReasoningVerificationInput,
  ReasoningVerificationPolicyPort,
} from "../reasoning_cell/service.js";
import { reasoningAdmissionDigestOf, reasoningVerificationDigestOf } from "../reasoning_cell/artifacts.js";
import type { ReasoningPolicyRef } from "../reasoning_cell/ref.js";
import { RECIPE_ADMISSION_POLICY, RECIPE_VERIFICATION_POLICY } from "../recipes/execution.js";
import { canonicalDigest } from "../schema/canonical.js";

/** The deterministic provenance domains that identify the two first-party policies. */
export const FIRST_PARTY_EXPLORATORY_VERIFICATION_DOMAIN = "palimpsest.deployment.exploratory-verification.v1";
export const FIRST_PARTY_EXPLORATORY_ADMISSION_DOMAIN = "palimpsest.deployment.exploratory-admission.v1";

/** Human-readable policy ids (a deployment may display them; they grant nothing). */
export const FIRST_PARTY_EXPLORATORY_VERIFICATION_POLICY_ID = "first-party.exploratory.verification";
export const FIRST_PARTY_EXPLORATORY_ADMISSION_POLICY_ID = "first-party.exploratory.admission";

/** The EXPLORE cell policy refs this bundle is allowed to serve (the recipe's own). */
export const FIRST_PARTY_EXPLORE_VERIFICATION_POLICY_REF: ReasoningPolicyRef = RECIPE_VERIFICATION_POLICY;
export const FIRST_PARTY_EXPLORE_ADMISSION_POLICY_REF: ReasoningPolicyRef = RECIPE_ADMISSION_POLICY;

function samePolicyRef(left: ReasoningPolicyRef, right: ReasoningPolicyRef): boolean {
  return left.policyId === right.policyId && left.version === right.version;
}

/**
 * UX-C §11/SC-5: the first-party EXPLORATORY verification policy.
 *
 * For an ordinary no-evidence Explore candidate it returns
 * `standing: "INCONCLUSIVE"` with EMPTY supporting/contradicting evidence lists,
 * exactly bound to the cell, the candidate, the current `frontierBasis` (passed
 * through unchanged) and the cell definition's OWN `verificationPolicyRef`. Its
 * `provenanceDigest` deterministically identifies THIS policy, so no evaluation
 * can be mistaken for an evidence-grounded verification.
 *
 * It refuses (throws) when the cell was opened under a different verification
 * policy ref, because this policy has no semantics for that cell. The kernel turns
 * the refusal into an honest `verification_error`; it never fabricates support.
 */
export function firstPartyExploratoryVerificationPolicy(): ReasoningVerificationPolicyPort {
  return Object.freeze({
    async verify({ definition, candidate, frontierBasis }: ReasoningVerificationInput): Promise<unknown> {
      if (!samePolicyRef(definition.verificationPolicyRef, FIRST_PARTY_EXPLORE_VERIFICATION_POLICY_REF)) {
        throw new Error(
          `${FIRST_PARTY_EXPLORATORY_VERIFICATION_POLICY_ID}: the cell declares verification policy ` +
            `"${definition.verificationPolicyRef.policyId}@${definition.verificationPolicyRef.version}", which is not the ` +
            `first-party recipe Explore ref — this policy only verifies exploratory EXPLORE cells`,
        );
      }
      const provenanceDigest = canonicalDigest({
        domain: FIRST_PARTY_EXPLORATORY_VERIFICATION_DOMAIN,
        standing: "INCONCLUSIVE",
        evidence: "NONE",
        cell: { cellId: candidate.cell.cellId },
        candidateDigest: candidate.candidateDigest,
      });
      const base = {
        schemaVersion: 1 as const,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        frontierBasis,
        verificationPolicyRef: definition.verificationPolicyRef,
        standing: "INCONCLUSIVE" as const,
        supportingEvidenceIds: Object.freeze([] as string[]),
        contradictingEvidenceIds: Object.freeze([] as string[]),
        provenanceDigest,
      };
      return { ...base, digest: reasoningVerificationDigestOf(base) };
    },
  });
}

/**
 * UX-C §12/SC-5: the first-party EXPLORATORY admission policy.
 *
 * FROZEN MEANING of `ADMIT` here:
 *
 *   include this structured hypothesis in the cell-local frontier for
 *   collaborative composition
 *
 * It is NOT verified-true, NOT Evidence, NOT Proof, NOT Work admission and NOT
 * authority. A user-visible result must say so (§13).
 *
 * It ADMITs ONLY when the cell's `admissionPolicyRef` is exactly the first-party
 * recipe Explore ref. For any other ref it returns `UNRESOLVED` (still bound to
 * the cell's own ref, so the kernel can record the honest decision) rather than
 * acting as a generic permissive policy.
 */
export function firstPartyExploratoryAdmissionPolicy(): ReasoningEpistemicAdmissionPolicyPort {
  return Object.freeze({
    async admit({ definition, candidate, verification, frontierBasis }: ReasoningAdmissionInput): Promise<unknown> {
      const ref = definition.admissionPolicyRef;
      const isFirstPartyExplore = samePolicyRef(ref, FIRST_PARTY_EXPLORE_ADMISSION_POLICY_REF);
      // §12 says this policy may ADMIT an INCONCLUSIVE candidate — so the STANDING is
      // part of the rule, not just the ref. A contradiction must never be admitted as a
      // hypothesis, and a deployment that pairs this admission policy with a stronger
      // verification policy gets UNRESOLVED (an honest "this policy cannot certify that
      // standing") rather than a permissive ADMIT.
      const standing = (verification as { readonly standing?: unknown }).standing;
      const decision =
        isFirstPartyExplore && standing === "INCONCLUSIVE" ? ("ADMIT" as const) : ("UNRESOLVED" as const);
      const provenanceDigest = canonicalDigest({
        domain: FIRST_PARTY_EXPLORATORY_ADMISSION_DOMAIN,
        // This digest names the MEANING of the decision, never a truth value.
        meaning:
          decision === "ADMIT"
            ? "CELL_LOCAL_EXPLORATORY_HYPOTHESIS"
            : isFirstPartyExplore
              ? "STANDING_NOT_INCONCLUSIVE"
              : "NOT_FIRST_PARTY_EXPLORE_REF",
        decision,
        cell: { cellId: candidate.cell.cellId },
        candidateDigest: candidate.candidateDigest,
        verificationResultDigest: verification.digest,
      });
      const base = {
        schemaVersion: 1 as const,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        verificationResultDigest: verification.digest,
        frontierBasis,
        admissionPolicyRef: ref,
        decision,
        provenanceDigest,
      };
      return { ...base, digest: reasoningAdmissionDigestOf(base) };
    },
  });
}

/**
 * UX-C §9/SC-4: the stable derived path of the DEPLOYMENT-OWNED ReasoningCell
 * store — beside this project's orchestration DB, so it is scoped to the
 * installation and stable across restarts without any user configuration.
 */
export function deploymentReasoningStorePath(orchestrationDatabasePath: string): string {
  return join(dirname(orchestrationDatabasePath), "reasoning.sqlite");
}
