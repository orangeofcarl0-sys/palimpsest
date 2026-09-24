/**
 * PLMP-LEAN-1 §D3-c3 — CURRENT-STATE CROSS-BASIS ADMISSION.
 *
 * The last gate before the basis question stops being an obstacle. It does NOT decide whether the
 * result should be promoted, transplanted or applied:
 *
 *     Assessment  ≠  Admission  ≠  Effect
 *
 * It answers exactly one question:
 *
 *     Does the basis divergence still constitute a semantic obstacle to admitting this result
 *     against the CURRENT world?
 *
 * and it answers it by VALIDATING a certificate, never by re-deriving one:
 *
 *     D3-b:  discover/prove compatibility  →  produce a certificate
 *     D3-c:  establish that certificate's authority, freshness and exact binding  →  admit or not
 *
 * RE-RUNNING THE PROOF HERE WOULD BE THE MISTAKE. Two compatibility engines would drift, and the drift
 * would be invisible until a result was admitted under rules the assessor does not share. So this module
 * contains no selector algebra, no coverage reasoning and no git.
 *
 * TWO ORTHOGONAL CHECKS, BOTH REQUIRED:
 *
 *     StillApplies            the certificate is about THIS result, THIS origin basis and THIS target
 *     AuthoritativelyIssued   the certificate exists in the issuer's record, issued from accepted premises
 *
 * Neither implies the other. A forged observation can bind a perfectly correct target, and a genuine
 * certificate for `B_1` says nothing about `B_2`.
 *
 * EVERY OUTCOME KEEPS ITS OWN REASON, because the next step differs:
 *
 *     missing / UNKNOWN      insufficient proof      → MORE EVIDENCE may help
 *     INCOMPATIBLE           positive conflict proof  → more evidence does NOT remove a witness
 *     COMPATIBLE but stale   proved for another target→ RE-ASSESS against the current world
 *     COMPATIBLE but untrusted  provenance invalid    → the premises, not the world, are the problem
 *     COMPATIBLE + trusted + current → the basis no longer blocks
 *
 * Layer: L2 (`src/project_world/`). Not re-exported from the domain barrel.
 */
import { assessmentStillAppliesTo } from "./compatibility.js";
import type { CompatibilityIssuer, IssuedCompatibilityAssessment } from "./issuance.js";

export const CROSS_BASIS_ADMISSION_STATES = [
  /** The certificate is authoritative, current and about this exact result: the basis does not block. */
  "ADMITTED",
  /** A positive conflict proof. Not repairable by observing more. */
  "CONFLICT",
  /** No proof was completed. More evidence could change this. */
  "INSUFFICIENT_PROOF",
  /** A proof exists, but for another target observation. The world moved. */
  "STALE_PROOF",
  /** A conclusion was supplied that this authority never issued. */
  "UNTRUSTED_PROOF",
  /** The attempt has no basis recorded at all, so there is nothing to admit against. */
  "NO_BASIS",
] as const;
export type CrossBasisAdmissionState = (typeof CROSS_BASIS_ADMISSION_STATES)[number];

export interface CrossBasisAdmissionResult {
  readonly schemaVersion: 1;
  readonly state: CrossBasisAdmissionState;
  /** `true` ONLY for `ADMITTED`. Every other state is a refusal, each for its own reason. */
  readonly admitted: boolean;
  /**
   * Whether MORE EVIDENCE could plausibly change the outcome.
   *
   * `true` for `INSUFFICIENT_PROOF` (a better observer may complete the proof) and `false` for
   * `CONFLICT` (a witness is a fact; no amount of further observation removes it) — which is why the two
   * are not collapsed into one "blocked".
   */
  readonly moreEvidenceCouldHelp: boolean;
  /** The certificate this decision validated, when one was presented and recognised. */
  readonly issuanceDigest: string | null;
  readonly detail: string;
}

function refuse(input: {
  readonly state: CrossBasisAdmissionState;
  readonly moreEvidenceCouldHelp: boolean;
  readonly issuanceDigest?: string | null | undefined;
  readonly detail: string;
}): CrossBasisAdmissionResult {
  return Object.freeze({
    schemaVersion: 1 as const,
    state: input.state,
    admitted: false,
    moreEvidenceCouldHelp: input.moreEvidenceCouldHelp,
    issuanceDigest: input.issuanceDigest ?? null,
    detail: input.detail,
  });
}

/**
 * Validate a presented certificate against the current state.
 *
 * `presented` is whatever a caller has. It is trusted for NOTHING: its digest is looked up in the
 * issuer's record, and the record's copy is what gets validated, so a caller cannot present a mutated
 * assessment alongside a genuine digest.
 */
export function admitCrossBasis(input: {
  readonly issuer: CompatibilityIssuer;
  readonly presented: IssuedCompatibilityAssessment | null;
  /** The result this admission is about. */
  readonly resultManifestDigest: string;
  readonly originBasisDigest: string;
  /** The OBSERVED target, as the caller currently sees it. */
  readonly targetObservationDigest: string;
  /** False when the attempt has no recorded basis at all. */
  readonly hasBasis: boolean;
}): CrossBasisAdmissionResult {
  if (!input.hasBasis) {
    return refuse({
      state: "NO_BASIS",
      moreEvidenceCouldHelp: false,
      detail:
        "this attempt has no recorded world basis, so there is nothing to admit a result against — a result whose provenance was never captured cannot be assessed",
    });
  }
  if (input.presented === null) {
    return refuse({
      state: "INSUFFICIENT_PROOF",
      moreEvidenceCouldHelp: true,
      detail:
        "no compatibility certificate was presented, so the basis divergence is unproven — more evidence (a complete change observation, an enforced read boundary) could complete the proof",
    });
  }

  /**
   * AUTHORITY FIRST, and the RECORDED copy is what gets checked.
   *
   * Looking the digest up rather than trusting the object means a caller cannot hand in a genuine digest
   * attached to an edited assessment: the recorded issuance is the system's own memory of what it
   * concluded from what.
   */
  const recorded = input.issuer.recall(input.presented.issuanceDigest);
  if (recorded === null) {
    return refuse({
      state: "UNTRUSTED_PROOF",
      moreEvidenceCouldHelp: false,
      detail:
        "this compatibility assessment was not issued by an accepted authority, so its premises have no provenance — a logically valid conclusion from untrusted premises carries no admission authority",
    });
  }

  // FRESHNESS: a witness for one target observation does not authorize another.
  const applies = assessmentStillAppliesTo({
    assessment: recorded.assessment,
    resultManifestDigest: input.resultManifestDigest,
    originBasisDigest: input.originBasisDigest,
    targetObservationDigest: input.targetObservationDigest,
  });
  if (!applies.applies) {
    return refuse({
      state: "STALE_PROOF",
      issuanceDigest: recorded.issuanceDigest,
      moreEvidenceCouldHelp: true,
      detail: `${applies.detail} — the basis question must be assessed against the current world, not inherited from an earlier one`,
    });
  }

  /**
   * The certificate is authoritative and current. Its OUTCOME decides, and the four outcomes stay
   * distinct — `INCOMPATIBLE` is reported as `CONFLICT` (a fact), `UNKNOWN` as `INSUFFICIENT_PROOF`
   * (a gap), and only `EXACT`/`COMPATIBLE` admit.
   */
  switch (recorded.assessment.outcome) {
    case "EXACT":
      return Object.freeze({
        schemaVersion: 1 as const,
        state: "ADMITTED" as const,
        admitted: true,
        moreEvidenceCouldHelp: false,
        issuanceDigest: recorded.issuanceDigest,
        detail: "the basis is exactly current, so no divergence exists to admit against",
      });
    case "COMPATIBLE":
      return Object.freeze({
        schemaVersion: 1 as const,
        state: "ADMITTED" as const,
        admitted: true,
        moreEvidenceCouldHelp: false,
        issuanceDigest: recorded.issuanceDigest,
        detail: `an authoritative, current certificate proves non-interference: ${recorded.assessment.detail}`,
      });
    case "INCOMPATIBLE":
      return refuse({
        state: "CONFLICT",
        issuanceDigest: recorded.issuanceDigest,
        moreEvidenceCouldHelp: false,
        detail: `a proven interference exists, and further observation cannot remove it: ${recorded.assessment.detail}`,
      });
    case "UNKNOWN":
      return refuse({
        state: "INSUFFICIENT_PROOF",
        issuanceDigest: recorded.issuanceDigest,
        moreEvidenceCouldHelp: true,
        detail: `the certificate records an incomplete proof: ${recorded.assessment.detail}`,
      });
  }
}
