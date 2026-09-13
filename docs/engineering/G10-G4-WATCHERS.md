# G10-G4 — Watchers

Typed conditions only (§106) — no arbitrary JavaScript predicates:

```text
not_before(at)                              injected clock (§108)
claim_changed(claim, baselineDigest)        via CampaignEvidencePort
institution_epoch_changed(id, baselineEpoch) via a read-only institution port
project_terminal(project)                   via a read-only Work port
external_signal(signalKey)                  via CampaignExternalSignalPort
```

Knowledge states are `known | unknown | error` (§110): **unknown is NOT
triggered** and **error is NOT false**. A missing source port yields
`incomplete`.

A watch firing means "reconsider the Campaign" — never "claim true", never
"commitment satisfied", never "Project needed" (§107). Evaluation is READ-ONLY
(§120): it creates no Work, modifies no Evidence, advances no Institution, and
changes no belief. Trigger recording is a separate, idempotent Campaign write
(§115): one watch never gains two semantic triggers for the same condition
instance.
