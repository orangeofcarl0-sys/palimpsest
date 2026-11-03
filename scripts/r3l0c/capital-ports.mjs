/**
 * R3-L0C §8 — THE DETERMINISTIC CAPITAL POLICY PORTS.
 *
 * The Proof, Reasoning and Procedure owners each require an INDEPENDENT verification and admission seam. These
 * are deterministic fixtures rather than model judgement: the capital is authored from frozen constants and
 * admitted by fixed policies, so no model authors, verifies or admits any part of the bundle.
 *
 * WHY THEY ARE A SEPARATE MODULE. The prehistory and the capital admission both compose an install, and both must
 * supply the SAME ports — a prehistory whose ports differed from the admission's would make the two halves of the
 * capital plane inconsistent, and the inconsistency would be invisible because each install is separate.
 *
 * EACH PORT ECHOES THE DIGEST IT DECIDED ON, so the owner can refuse a decision that does not bind to the
 * artifact it was asked about. That is what makes the seam a real authority rather than a rubber stamp.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
export function capitalPolicyPorts(reasoningModule) {
  const policyRef = (policyId) => ({ policyId, version: '1' });
  return Object.freeze({
    proofVerification: {
      policyRef: policyRef('r3l0c-proof-verification'),
      async verify({ candidate }) {
        const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId);
        const contradicting = candidate.contradictingEvidence.map((entry) => entry.evidenceId);
        return {
          standing: supporting.length > 0 && contradicting.length === 0 ? 'SUPPORTED' : 'INCONCLUSIVE',
          supportingEvidenceIds: supporting,
          contradictingEvidenceIds: contradicting,
        };
      },
    },
    proofAdmission: {
      policyRef: policyRef('r3l0c-proof-publication'),
      async decide({ verification }) {
        return {
          decision: verification.standing === 'SUPPORTED' || verification.standing === 'PARTIALLY_SUPPORTED' ? 'PUBLISH' : 'UNRESOLVED',
          provenanceDigest: verification.provenanceDigest,
        };
      },
    },
    reasoningVerification: {
      async verify({ definition, candidate, frontierBasis }) {
        const base = {
          schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, frontierBasis,
          verificationPolicyRef: definition.verificationPolicyRef, standing: 'SUPPORTED',
          supportingEvidenceIds: ['ev-1'], contradictingEvidenceIds: [], provenanceDigest: 'a'.repeat(64),
        };
        return { ...base, digest: reasoningModule.reasoningVerificationDigestOf(base) };
      },
      async verifyInvalidation({ definition, request, frontierBasis }) {
        const base = {
          schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest,
          frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: 'SUPPORTED',
          evidenceIds: ['ev-9'], provenanceDigest: 'b'.repeat(64),
        };
        return { ...base, digest: reasoningModule.invalidationVerificationDigestOf(base) };
      },
    },
    reasoningAdmission: {
      async admit({ definition, candidate, verification, frontierBasis }) {
        const base = {
          schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest,
          verificationResultDigest: verification.digest, frontierBasis,
          admissionPolicyRef: definition.admissionPolicyRef, decision: 'ADMIT', provenanceDigest: 'c'.repeat(64),
        };
        return { ...base, digest: reasoningModule.reasoningAdmissionDigestOf(base) };
      },
      async admitInvalidation({ definition, request, verification, frontierBasis }) {
        const base = {
          schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest,
          verificationResultDigest: verification.digest, frontierBasis,
          admissionPolicyRef: definition.admissionPolicyRef, decision: 'ADMIT', provenanceDigest: 'd'.repeat(64),
        };
        return { ...base, digest: reasoningModule.invalidationAdmissionDigestOf(base) };
      },
    },
  });
}
