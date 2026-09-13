# G10-GC6 — Reconciled Compiler Context & Next-Action Coherence

The production loop supplies the compiler only CURRENT reconciled facts:
institution epoch, active commitments, active hypotheses, belief state, active
watches, linked Projects, and the reconciliation report digest — never
placeholder `null`/`[]` where data exists, and never historical triggered
watches as active.

Compiler candidates remain candidates: strictly parsed (including WAIT watch
drafts through `parseCampaignWatchDraft`), freshness-checked against the
current Campaign basis, and admitted through the idempotent Work saga (Project)
or the grounded atomic dormancy (WAIT). The compiler never sets belief, changes
an Institution, or completes a wake.
