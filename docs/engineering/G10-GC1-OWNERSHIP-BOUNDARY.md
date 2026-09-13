# G10-GC1 — Ownership Boundary

- `CampaignDefinition.institutionId` is IMMUTABLE: there is no
  `setInstitutionId`. Institution migration/fork is future semantics.
- `InstitutionId ≠ CampaignId`; matching strings carry no relation.
- The Campaign's owner institution is validated once at genesis; later epoch
  advancement (including Organization body replacement) does not change
  `CampaignId` or ownership.
- The store owns history only; the service owns grounding validation.
