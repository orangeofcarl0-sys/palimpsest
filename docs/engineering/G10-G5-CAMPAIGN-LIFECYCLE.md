# G10-G5 — Campaign Lifecycle

States: `ACTIVE | QUIESCING | DORMANT | WAKING | RECONCILING | TERMINATED`
(§125). `MIGRATING | QUARANTINED | FORKED | SUSPENDED` are deferred.

State is a DERIVED projection replayed from Campaign events (§126) — there is
no mutable `campaign.status` as sole truth. Genesis enters ACTIVE with the
initial commitment and no Project required (§127).

- **QUIESCING** = preparing a durable checkpoint and prospective wake
  conditions; it does NOT mean the Institution terminated, a runtime was
  killed, or a Project was cancelled (§128).
- **DORMANT** requires no active wake execution, a canonical checkpoint, and at
  least one prospective wake route (§132) — and requires NO running process.
- **TERMINATED** is explicit and terminal (§150): never entered because a
  runtime stopped, a Project failed, a watch was unavailable, or the Campaign
  was dormant for a long time.
