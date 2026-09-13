# G10-G3 — Epistemic Intervention

`CampaignIntervention = { interventionId, campaignId, project:
CampaignProjectRef, purpose: test|measure|explore, targetHypothesisIds,
preBeliefStateDigest, preBeliefStandings }`.

- `Intervention ≠ Attempt` (§89): an intervention may encompass one Project,
  many Tasks, and many Attempts. It does not map one-to-one to an Attempt.
- `CampaignProjectRef = {projectId, revision, digest}` is derived from canonical
  Work identity (§87); no second Project identity is invented.
- History is append-only: INTERVENTION_REGISTERED,
  INTERVENTION_OPERATIONAL_OBSERVED, INTERVENTION_EPISTEMIC_ASSESSED (§99).
- The pre-belief basis (digest + per-target standings) is recorded so the
  epistemic delta is computed against what was actually believed then (§95/§94).
