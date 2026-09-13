# G10-GC3 — Current-World Observation

`observeCurrentWorld({campaignId, wakeCycle, wakeCause})` observes every
load-bearing fact:

- current owner Institution epoch (ALWAYS load-bearing);
- current standing of every ACTIVE hypothesis claim (via Evidence port);
- current state of every Campaign-linked Project (via Work port);
- actual triggered WatchIds.

Conditional dependencies: zero active hypotheses needs no Evidence port; zero
linked Projects needs no Work port. If such facts exist and the source is
unavailable, or any fact is unknown/error, the result is
`reconciliation_incomplete` and NOTHING is written.

Typed `CampaignWakeCause = watch{watchId} | manual{signalId, reason}`; a
watch-caused wake REQUIRES a canonical `WATCH_TRIGGERED` for that watch — a
caller can never assert an arbitrary watch. Observation is read-only.
