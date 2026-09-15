/**
 * G10-T Proof/Evidence plane — read-only Campaign bridge.
 *
 *   Evidence ≠ Claim        Campaign belief ≠ Evidence-plane truth
 *   Inspect ≠ Publish        Inspect ≠ Attach        Inspect ≠ Change standing
 *
 * `proofCampaignEvidencePort(service)` exposes the proof service as the
 * campaign's `CampaignEvidencePort`. The port is READ-ONLY: the Campaign can
 * INSPECT a published claim's standing snapshot, and can never publish, attach,
 * reassess, or otherwise change a proof claim through it. The single method is
 * the service's own `inspectClaim`.
 *
 * `EvidenceClaimRef` (campaign port shape, `{ claimId }`) is distinct from
 * `ReasoningClaimRef`; this bridge performs no identity translation.
 */

import type { CampaignEvidencePort, EvidenceClaimRef } from "../campaign/epistemic.js";
import type { ProofEvidenceService } from "./service.js";

export function proofCampaignEvidencePort(service: ProofEvidenceService): CampaignEvidencePort {
  return Object.freeze({
    inspectClaim: (claim: EvidenceClaimRef) => service.inspectClaim(claim),
  });
}
