# G10-G6 — Project Admission Saga

Project admission spans CampaignStore + Work, which are NOT one transaction
(§172). A durable idempotent saga is used:

```text
Campaign: PROJECT_ADMISSION_PREPARED { compilationId, admissionKey, candidateDigest }
   ↓ idempotent Work admission (same admissionKey → same Project)
Campaign: PROJECT_ADMITTED { admissionKey, projectRef }
```

- `CampaignWorkAdmissionPort.admit({admissionKey, proposal})` is the mandatory
  idempotent boundary (§169/§170): same key + same proposal → same Project or
  fail closed. A concrete Work adapter is DEFERRED when the existing Work API
  has no stable admission key (§171); a host-neutral port is sufficient and the
  limitation is external and documented.
- Crash after Work admission but before `PROJECT_ADMITTED` recovers by
  re-calling with the SAME admissionKey; the Campaign link is recorded exactly
  once (§173, proof G6).
- Same admissionKey with a different candidate fails closed and is never
  overwritten (§174).
- A completed admission retried is idempotent and does not require freshness
  (the admission itself advanced the basis).

A Project candidate always flows through the canonical `parseProjectProposal` +
`validateProjectProposal` (§165); the Campaign never duplicates Work's rules,
and `definition_id` remains Work lineage (§166).
