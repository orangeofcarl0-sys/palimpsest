# G10-G1 — Campaign Identity

Status: COMPLETE. Baseline `main` @ `5557484`. Branch `experiment/g10-g1-campaign-identity-store`.

```text
CampaignDefinition = { schemaVersion: 1, campaignId, institutionId }
```

- `Campaign ≠ DurableInstitution` (§3): the institution OWNS; a campaign is one
  long-horizon activity within it. One institution may have many campaigns.
- `CampaignId ≠ InstitutionId` (§45); no Organization identity is embedded (§43).
- `Campaign ≠ RuntimeAgent` (§4): a campaign exists and replays with zero
  RuntimeAgent / Session / Activation (proof G1-M03).
- `Campaign ≠ Project` (§2): no project id; a campaign may produce many
  projects and survives their completion/failure/abandonment.
- Ownership anchors to `InstitutionId`, so a campaign survives Organization
  body replacement, member replacement, and runtime replacement (proof G1-M04).

Genesis requires an existing InstitutionId, an explicit CampaignId, and an
initial `CampaignCommitment`. It requires no runtime, no Organization member,
no Project, and no Task.
