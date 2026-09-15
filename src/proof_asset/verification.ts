/**
 * G10-T Proof/Evidence plane — Verification & publication-admission PORTS.
 *
 *   Verification ≠ PublicationAdmission
 *   Verified ≠ Published        Candidate ≠ PublishedClaim
 *
 * A verification policy is the ONLY source of a `ProofClaimStanding`. A
 * publication-admission policy separately turns a verification result into
 * PUBLISH/REJECT/UNRESOLVED. Neither port can be handed a caller-chosen standing
 * or publish flag: `verify` receives the candidate + evidence + dependency
 * standings, and `decide` receives the candidate + the policy-produced
 * verification result.
 *
 * `evaluateVerification` is the strict funnel: a raw policy return value is
 * either parsed as a complete `ProofVerificationResult` (already materialized by
 * the policy) or materialized from a policy verdict plus service context.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { EvidenceItem } from "./evidence.js";
import type {
  ProofClaimCandidate,
  ProofClaimStanding,
  ProofPolicyRef,
  ProofPublicationDecision,
  ProofVerificationResult,
} from "./claims.js";
import {
  materializeProofVerificationResult,
  parseProofVerificationResult,
} from "./claims.js";
import {
  proofDigestHex,
  proofEnum,
  proofEvidenceIdArray,
  proofFail,
  proofKeys,
  proofObject,
} from "./refs.js";

export const PROOF_VERIFICATION_VERDICT_DOMAIN = "palimpsest.proof.verification-verdict.v1";

export interface ProofDependencyStanding {
  readonly claimId: string;
  readonly effectiveStanding: ProofClaimStanding;
}

export interface ProofVerificationInput {
  readonly candidate: ProofClaimCandidate;
  readonly evidence: readonly EvidenceItem[];
  readonly dependencies: readonly ProofDependencyStanding[];
  readonly content: unknown;
}

export interface ProofPublicationAdmissionInput {
  readonly candidate: ProofClaimCandidate;
  readonly verification: ProofVerificationResult;
  readonly dependencies: readonly ProofDependencyStanding[];
}

export interface ProofVerificationPolicyPort {
  readonly policyRef: ProofPolicyRef;
  verify(input: ProofVerificationInput): Promise<unknown>;
}

export interface ProofPublicationAdmissionPort {
  readonly policyRef: ProofPolicyRef;
  decide(input: ProofPublicationAdmissionInput): Promise<unknown>;
}

export interface ProofPublicationAdmissionOutcome {
  readonly decision: ProofPublicationDecision;
  readonly provenanceDigest?: string | undefined;
}

export function parseProofPublicationAdmissionOutcome(
  raw: unknown,
  what = "ProofPublicationAdmissionOutcome",
): ProofPublicationAdmissionOutcome {
  const object = proofObject(raw, what);
  proofKeys(object, ["decision", "provenanceDigest"], ["decision"], what);
  const decision = proofEnum(object.decision, ["PUBLISH", "REJECT", "UNRESOLVED"] as const, `${what}.decision`);
  const provenanceDigest = object.provenanceDigest === undefined ? undefined : proofDigestHex(object.provenanceDigest, `${what}.provenanceDigest`);
  return Object.freeze({
    decision,
    ...(provenanceDigest === undefined ? {} : { provenanceDigest }),
  });
}

export interface ProofVerificationContext {
  readonly candidateId: string;
  readonly policyRef: ProofPolicyRef;
}

/**
 * Strictly funnel a policy output into a `ProofVerificationResult`.
 *
 * - A complete result (carrying `schemaVersion`) is parsed with its own digest.
 * - A bare policy verdict (`{ standing, supportingEvidenceIds?, contradictingEvidenceIds?, provenanceDigest? }`)
 *   is materialized using the service-supplied context (candidateId + policyRef).
 *
 * A caller can never smuggle a standing in through the service API; only a
 * `ProofVerificationPolicyPort` return value reaches this function.
 */
export function evaluateVerification(raw: unknown, context?: ProofVerificationContext): ProofVerificationResult {
  const object = proofObject(raw, "ProofVerificationResult");
  if (Object.hasOwn(object, "schemaVersion") || Object.hasOwn(object, "digest") || Object.hasOwn(object, "candidateId")) {
    const result = parseProofVerificationResult(object);
    if (context !== undefined && result.candidateId !== context.candidateId) {
      proofFail("invalid_value", "verification result candidateId does not match the candidate being verified");
    }
    return result;
  }
  if (context === undefined) {
    proofFail("invalid_value", "a bare verification verdict requires service context (candidateId + policyRef)");
  }
  proofKeys(
    object,
    ["standing", "supportingEvidenceIds", "contradictingEvidenceIds", "provenanceDigest"],
    ["standing"],
    "ProofVerificationResult",
  );
  const standing = object.standing;
  if (typeof standing !== "string") proofFail("invalid_value", "verification verdict.standing must be a string");
  const supportingEvidenceIds = object.supportingEvidenceIds === undefined ? [] : proofEvidenceIdArray(object.supportingEvidenceIds, "verification verdict.supportingEvidenceIds");
  const contradictingEvidenceIds = object.contradictingEvidenceIds === undefined ? [] : proofEvidenceIdArray(object.contradictingEvidenceIds, "verification verdict.contradictingEvidenceIds");
  const provenanceDigest =
    object.provenanceDigest === undefined
      ? canonicalDigest({
          domain: PROOF_VERIFICATION_VERDICT_DOMAIN,
          candidateId: context.candidateId,
          standing,
          policyRef: context.policyRef,
        })
      : proofDigestHex(object.provenanceDigest, "verification verdict.provenanceDigest");
  return materializeProofVerificationResult({
    candidateId: context.candidateId,
    standing: proofEnum(standing, ["SUPPORTED", "PARTIALLY_SUPPORTED", "CONTRADICTED", "INCONCLUSIVE", "STALE"] as const, "verification verdict.standing"),
    supportingEvidenceIds,
    contradictingEvidenceIds,
    policyRef: context.policyRef,
    provenanceDigest,
  });
}
