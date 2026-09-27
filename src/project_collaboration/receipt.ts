/**
 * E3-C §8/§9 — NEED CURRENTNESS and the INDEPENDENT ADMISSION AUTHORITY.
 *
 * ## Why the authority is a separate seam (§8)
 *
 * `NeedCandidate ≠ ContactNeed`, and the step between them is not a formality: a candidate is authored by
 * untrusted cognition (§6), so something independent must decide whether it may become a durable
 * collaboration need. `ContactNeedAdmissionPort` is that seam.
 *
 * There is deliberately NO default that admits. In particular:
 *
 *   · `managementMode == DELEGATE` does NOT imply admission — management mode is non-authoritative;
 *   · `approved: true` (a caller boolean) is NOT a decision;
 *   · the authored proposal's own confidence is NOT authority.
 *
 * The decision must name the EXACT candidate digest, so "something like this" can never be admitted.
 *
 * ## §9 currentness
 *
 * Immediately before admission the candidate is revalidated against the live project: the ProjectIR
 * basis must still be the one the candidate froze, and the grounded Work condition must still hold. A
 * stale candidate produces ZERO `CONTACT_NEED_DECLARED` declarations — the caller prepares another
 * candidate instead of admitting a fact that has moved.
 *
 * Layer: L2 (`src/project_collaboration/`).
 */
import { canonicalDigest } from "../schema/canonical.js";
import type { CollaborationNeedCandidate, CollaborationProjectBasis, NeedGround } from "./need.js";
import { needRefuse } from "./need.js";

/* ------------------------------------------------------------------ *
 * §9 currentness
 * ------------------------------------------------------------------ */

export const NEED_CURRENTNESS_STATUSES = ["CURRENT", "STALE_PROJECT", "STALE_GROUND", "UNRESOLVED"] as const;
export type NeedCurrentnessStatus = (typeof NEED_CURRENTNESS_STATUSES)[number];

export interface NeedCurrentnessAssessment {
  readonly status: NeedCurrentnessStatus;
  /** The specific reasons, so a refusal is inspectable rather than a bare status. */
  readonly details: readonly string[];
  /** The project basis observed at assessment time, for the record. */
  readonly observedBasis: CollaborationProjectBasis;
}

/* ------------------------------------------------------------------ *
 * §8 the independent admission authority
 * ------------------------------------------------------------------ */

/**
 * §8: the decision vocabulary. It reuses the repository's established epistemic admission idiom
 * (`ADMIT`/`REJECT`/`UNRESOLVED`) — the question "may this become durable?" has one vocabulary here.
 *
 * `UNRESOLVED` is a legitimate outcome: an authority that cannot decide says so, and the caller gets
 * zero declarations rather than an accidental approval.
 */
export const NEED_ADMISSION_DECISIONS = ["ADMIT", "REJECT", "UNRESOLVED"] as const;
export type NeedAdmissionDecision = (typeof NEED_ADMISSION_DECISIONS)[number];

/** What the authority is asked. It sees the WHOLE candidate and the currentness assessment. */
export interface NeedAdmissionInput {
  readonly candidate: CollaborationNeedCandidate;
  readonly currentness: NeedCurrentnessAssessment;
}

export interface NeedAdmissionOutcome {
  readonly decision: NeedAdmissionDecision;
  /** §8: the authority must approve the EXACT candidate digest, never "something like this". */
  readonly candidateDigest: string;
  readonly policyRef: { readonly policyId: string; readonly version: string };
  readonly provenanceDigest: string;
  readonly detail?: string | undefined;
}

/**
 * §8: the authority seam. No default implementation admits; a deployment that composes no authority gets
 * `NEED_ADMISSION_UNRESOLVED` with zero writes.
 */
export interface ContactNeedAdmissionPort {
  readonly policyRef: { readonly policyId: string; readonly version: string };
  decide(input: NeedAdmissionInput): Promise<NeedAdmissionOutcome>;
}

/** §8: refuse a caller-supplied boolean/string standing in for a decision. */
export function assertNeedAdmissionOutcomeShape(raw: unknown): NeedAdmissionOutcome {
  if (typeof raw !== "object" || raw === null) {
    needRefuse("NEED_CANDIDATE_INVALID", "a need admission outcome object is required");
  }
  const value = raw as Record<string, unknown>;
  if (value.decision !== "ADMIT" && value.decision !== "REJECT" && value.decision !== "UNRESOLVED") {
    needRefuse("NEED_CANDIDATE_INVALID", "need admission decision must be ADMIT, REJECT or UNRESOLVED");
  }
  if (typeof value.candidateDigest !== "string" || value.candidateDigest === "") {
    needRefuse("NEED_CANDIDATE_INVALID", "a need admission outcome must name the exact candidate digest it decided");
  }
  const policyRef = value.policyRef;
  if (typeof policyRef !== "object" || policyRef === null) {
    needRefuse("NEED_CANDIDATE_INVALID", "a need admission outcome must carry its policy reference");
  }
  const ref = policyRef as Record<string, unknown>;
  if (typeof ref.policyId !== "string" || typeof ref.version !== "string") {
    needRefuse("NEED_CANDIDATE_INVALID", "need admission policyRef needs policyId and version");
  }
  if (typeof value.provenanceDigest !== "string" || value.provenanceDigest === "") {
    needRefuse("NEED_CANDIDATE_INVALID", "a need admission outcome must carry a provenance digest");
  }
  return Object.freeze({
    decision: value.decision,
    candidateDigest: value.candidateDigest,
    policyRef: Object.freeze({ policyId: ref.policyId, version: ref.version }),
    provenanceDigest: value.provenanceDigest,
    ...(typeof value.detail === "string" ? { detail: value.detail } : {}),
  });
}

/* ------------------------------------------------------------------ *
 * §11 the accepted declaration record
 * ------------------------------------------------------------------ */

export const ACCEPTED_NEED_DECLARATION_DOMAIN = "palimpsest.project-collaboration.accepted-need.v1";

/**
 * §11/§13: the durable provenance of an ACCEPTED, candidate-derived need declaration. It names the exact
 * candidate, the basis it was frozen against, the ground, and the authority that admitted it — which is
 * exactly what the resulting `ContactNeed` alone cannot say.
 *
 * It is NOT a store: it is carried inside the `CONTACT_NEED_DECLARED` payload, so the existing
 * coordination history remains the persistence owner.
 */
export interface AcceptedNeedDeclaration {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly candidateDigest: string;
  readonly projectBasis: CollaborationProjectBasis;
  readonly ground: NeedGround;
  readonly competenceTags: readonly string[];
  readonly reason: string;
  readonly admission: {
    readonly decision: "ADMIT";
    readonly policyRef: { readonly policyId: string; readonly version: string };
    readonly provenanceDigest: string;
  };
  readonly declaredAt: string;
  readonly digest: string;
}

export function acceptedNeedDeclarationDigestOf(input: Omit<AcceptedNeedDeclaration, "digest">): string {
  return canonicalDigest({ domain: ACCEPTED_NEED_DECLARATION_DOMAIN, ...input });
}

export function materializeAcceptedNeedDeclaration(input: {
  readonly candidate: CollaborationNeedCandidate;
  readonly admission: NeedAdmissionOutcome;
  readonly declaredAt: string;
}): AcceptedNeedDeclaration {
  const base = {
    schemaVersion: 1 as const,
    candidateId: input.candidate.candidateId,
    candidateDigest: input.candidate.digest,
    projectBasis: input.candidate.projectBasis,
    ground: input.candidate.ground,
    competenceTags: input.candidate.competenceTags,
    reason: input.candidate.reason,
    admission: Object.freeze({
      decision: "ADMIT" as const,
      policyRef: input.admission.policyRef,
      provenanceDigest: input.admission.provenanceDigest,
    }),
    declaredAt: input.declaredAt,
  };
  return Object.freeze({ ...base, digest: acceptedNeedDeclarationDigestOf(base) });
}
