# G10-G4 — Prospective Memory

> Durable conditions under which a dormant Campaign becomes eligible for
> wake/reconsideration.

It is NOT a background RuntimeAgent, a timer process identity, or a context
reminder string (§104). `CampaignWatch = { watchId, campaignId, condition,
reason }`; watch definitions live in the CampaignStore and derive
`ACTIVE | TRIGGERED | CANCELLED` from events (§114).

No always-running daemon is implemented (§119): `scanWatches` is a read-only
operation the embedding host decides when to call.
