# G10-G2 — Hypothesis Branching

`CampaignHypothesis = { hypothesisId, campaignId, statement, claim:
EvidenceClaimRef, parentHypothesisId? }`.

- `Hypothesis ≠ Evidence claim` (§65): the hypothesis REFERENCES a claim via
  `EvidenceClaimRef` — association, not identity. No graph node content is
  copied to create identity (§71).
- A parent must exist and belong to the SAME campaign (§67). Cycles are
  structurally impossible: a hypothesis can only cite an already-created one,
  so the branch graph is acyclic by construction.
- Registration verifies the referenced claim is known through
  `CampaignEvidencePort`; an unknown claim returns `unknown` and creates NO
  Campaign evidence truth (§66).
- A contradicted hypothesis is HISTORICAL, never deleted or mutated (§68).
  Retirement is an explicit `HYPOTHESIS_RETIRED` event, independent of
  contradiction (§69).
