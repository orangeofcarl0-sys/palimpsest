# G10-G3 — Work Integration

The Campaign observes Work; it does not own it.

```text
Campaign work port : CampaignWorkObservationPort (read-only)
Work identities    : CampaignProjectRef {projectId, revision, digest}
Belief changes     : only via admitted Evidence observations (G2)
```

- `Project failure ≠ Campaign failure` (§100): a failed Project leaves the
  Campaign alive; a later intervention, another Project, or WAIT remains legal.
- The intervention module imports no Work implementation, no scheduler, and no
  Ordarium concern; the host supplies the observation port.
- Operational observations are durable Campaign history, but they are not
  evidence and cannot create belief revisions.
