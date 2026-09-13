# G10-G2 — Evidence Integration

Decision (from G0): Campaign persists claim REFERENCES and historical
observations; Evidence bodies remain owned by the existing Evidence plane.

Firewalls proved in G2:

```text
CampaignHypothesis   ≠ Evidence claim
CampaignEvidenceObservation ≠ evidence body
CurrentBeliefState   ≠ authoritative ClaimStatus (a derived mapping of it)
WorkerReport/AttemptReport/PeerMessage ≠ Evidence  (§83/§212/§213)
```

The Campaign module imports no Evidence implementation, no Work, and no
federation; the only bridge is the read-only `CampaignEvidencePort`. A worker
report cannot create an `EVIDENCE_OBSERVED` or `BELIEF_REVISED` event — those
require an authoritative observation supplied through the port.
