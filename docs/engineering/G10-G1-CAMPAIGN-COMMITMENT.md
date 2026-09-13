# G10-G1 — CampaignCommitment

PAG long-horizon intention. Explicitly NOT the G10-E peer/federation
`Commitment` (§47).

```text
CampaignCommitment = { schemaVersion: 1, commitmentId, campaignId, statement }
```

- `CampaignCommitmentId` is independent from federation `CommitmentId`,
  `CampaignId`, `ProjectId`, and `InstitutionId` (§48).
- Lifecycle is append-only events (§49): `CAMPAIGN_COMMITMENT_OPENED`,
  `_RESOLVED`, `_ABANDONED`, `_SUPERSEDED`. There is no mutable status row as
  canonical truth.
- Statements are never mutated (§50): a materially changed intention becomes a
  NEW commitment plus `_SUPERSEDED` for the old one, committed as ONE atomic
  transition.
- A statement/objective alone is not an active commitment (§51): the commitment
  exists because it was explicitly opened and remains active.

Derived `CampaignCommitmentState = OPEN | RESOLVED | ABANDONED | SUPERSEDED`
is replayed from events (proofs G1-M06/M07).
