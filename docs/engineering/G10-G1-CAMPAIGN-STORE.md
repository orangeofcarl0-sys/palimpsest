# G10-G1 — CampaignStore

`$DSH_HOME/palimpsest/campaign.sqlite` (`defaultCampaignPath()`). ONE canonical
Palimpsest-owned Campaign temporal store (§52).

Owns: campaign genesis, commitments (later: hypothesis/evidence/belief/
intervention/watch/lifecycle history, compiler/admission correlation).
Does NOT own: Evidence bodies, Work, Institution, Organization, runtime
carrier, Ordarium effects.

Schema (§53): `campaign_definitions(campaign_id PK, institution_id,
artifact_json)` and `campaign_events(campaign_id, seq, event_id UNIQUE, type,
payload_json, chain_digest, PRIMARY KEY(campaign_id, seq))`.

`CampaignBasisRef = { campaignId, throughSeq, chainDigest }` (§54) is the
freshness basis for belief refresh, wake reconciliation, compiler candidates,
and WAIT decisions.

Chain (§55): `chainDigest[n] = H(domain, previousChainDigest, envelope)` where
the envelope is `{campaignId, seq, eventId, type, payload}`. Integrity/freshness
only — not blockchain semantics.

`appendAtomic(expectedBasis, events)` (§56): one `BEGIN IMMEDIATE` transaction,
validate all events through strict parsers, verify the per-campaign basis,
allocate one contiguous seq range, insert all, commit — or none. Conflict is
PER-CAMPAIGN (§57): unrelated campaigns never produce semantic stale conflicts
merely because one has a new event.

Event parsing is strict and domain-owned (§58): no opaque
`Record<string, unknown>` payloads. Lifecycle/active-commitment state is a
derived projection, not canonical truth (§59).
