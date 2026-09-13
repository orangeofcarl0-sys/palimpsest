# G10-G1 — Contract Coverage

| Section | Requirement | Status | Evidence |
| ------- | ----------- | ------ | -------- |
| §42 | Production-realize CampaignDefinition/Commitment/BasisRef/Store | DONE | `src/campaign/**` |
| §43/§45 | Institution-owned; no Organization identity; CampaignId ≠ InstitutionId | DONE | `CampaignDefinition`; G1-M01 |
| §44 | Survives body/member/runtime replacement | DONE | G1-M04 |
| §46 | Genesis needs InstitutionId + CampaignId + initial commitment only | DONE | `createCampaign` |
| §47/§48 | CampaignCommitment ≠ federation Commitment; ids independent | DONE | G1-M01/M05 |
| §49 | Append-only lifecycle events, no mutable canonical status | DONE | `COMMITMENT_*` events |
| §50 | Supersession, never statement mutation | DONE | G1-M06/M07 |
| §51 | Statement ≠ active commitment | DONE | explicit open |
| §52 | ONE CampaignStore with the stated ownership | DONE | `SqliteCampaignStore` |
| §53 | Per-campaign append-only ordering + PK/UNIQUE | DONE | schema |
| §54 | CampaignBasisRef | DONE | `CampaignBasisRef` |
| §55 | Chain digest | DONE | `campaignChainDigest`; G1-M11 |
| §56 | appendAtomic | DONE | store; G1-M09 |
| §57 | Per-campaign conflict | DONE | G1-M12 |
| §58 | Strict per-event parser | DONE | `CAMPAIGN_COMMITMENT_EVENT_PARSERS` |
| §59 | Derived projections | DONE | `commitmentStates` |
| §60 | InstitutionContinuationAuthority ≠ CampaignOperationalAuthority documented | DONE | docs |
| §61 | G1-M01..M12 | DONE | 10 tests |

Campaign support is additive: Work, Institution, Federation, and Runtime are
unchanged (no new imports into those modules).
