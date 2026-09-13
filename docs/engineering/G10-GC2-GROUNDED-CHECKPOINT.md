# G10-GC2 — Grounded Checkpoint & Atomic Dormancy

`buildCurrentCampaignCheckpoint(campaignId)` DERIVES the checkpoint from
canonical current state — no caller-authored checkpoint on the golden path:

- active commitments / hypotheses / watches / known Projects from Campaign history
  (triggered+cancelled watches excluded);
- current belief-state digest derived from the latest revision per hypothesis;
- current Institution epoch via `CampaignInstitutionPort` (unknown -> `checkpoint_incomplete`);
- campaign basis (the basis the projection was built from).

`admitWait({campaignId, reason, watches})` commits ONE atomic batch:
`WATCH_INSTALLED* -> WAIT_DECIDED -> CHECKPOINT_RECORDED -> CAMPAIGN_QUIESCING ->
CAMPAIGN_DORMANT`. An empty wake plan is refused; a caller cannot inject a
checkpoint; no hidden CoT/context/session appears in the checkpoint.
