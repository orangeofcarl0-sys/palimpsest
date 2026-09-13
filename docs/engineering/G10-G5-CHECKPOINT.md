# G10-G5 — CampaignCheckpoint

```text
CampaignCheckpoint = { campaignId, campaignBasisThroughSeq, campaignBasisDigest,
  institutionEpoch, beliefStateDigest, activeCommitmentIds, activeHypothesisIds,
  activeWatchIds, knownProjectRefs }
```

It contains ONLY canonical/derived REFERENCES (§129) and NEVER hidden CoT, a
full model context, a scratchpad, a runtime session, or a temporary prompt
(§130; proof G5-M03). The checkpoint is durable Campaign history, not the
current world — a later wake compares it against freshly observed facts
(§238).
