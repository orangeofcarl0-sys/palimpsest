# G10-G2 — CurrentBeliefState

CurrentBeliefState is a DERIVED, non-monotonic Campaign projection (§75/§79).
It is never canonical truth.

`BeliefRevision = { beliefRevisionId, campaignId, hypothesisId, previous:
BeliefRevisionRef | null, standing, evidenceObservationId }`.

- `beliefStandingOf(ClaimStatus)` is a PURE deterministic mapping (§78): no LLM
  vote, no probabilities.
- There is NO `setBelief` API (§77): every revision names the evidence
  observation it came from (proof G2-M07).
- Beliefs may move `supported → contradicted → inconclusive → stale` with all
  historical observations/revisions retained (proof G2-M09).
- Digest `palimpsest.campaign-belief-state.v1` over `{campaignId, entries:
  [{hypothesisId, beliefRevisionId, standing}] sorted}` — deterministic across
  replay and across independent worlds (§80).
- `refreshCampaignBeliefs` observes ALL active hypotheses first and appends
  NOTHING unless every claim is known (§81) — no partially refreshed state.
