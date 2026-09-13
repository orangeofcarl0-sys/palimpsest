# G10-G2 — EvidenceHistory

`CampaignEvidenceObservation = { observationId, campaignId, hypothesisId,
standing: ClaimStandingSnapshot }` — a HISTORICAL observation of the
authoritative Evidence plane's standing (§70/§73).

`ClaimStandingSnapshot = { claim, status, supportingEvidenceIds,
contradictingEvidenceIds, provenanceDigest, digest }` reuses the canonical
standing vocabulary verbatim: `SUPPORTED | PARTIALLY_SUPPORTED | CONTRADICTED |
INCONCLUSIVE | STALE` (§13/§72).

- No evidence body is copied into the Campaign store (§70/§196): only refs,
  status, ids, and digests.
- New standing creates a NEW observation; existing observations are never
  updated (§74). History is append-only (proof G2-M05).
- If the Evidence plane is unavailable, the observation is `unknown` and the
  refresh is incomplete — the last historical observation is never used as
  current truth (§40).
- `CampaignEvidencePort.inspectClaim(ref) → EvidenceKnowledge<…>` is READ-ONLY
  (§38/§39); the Campaign module imports no Evidence implementation and no
  Work concern.
