# G10-GC1 — Campaign → Institution Grounding

Status COMPLETE. Baseline `main` @ `9e98b0c`.

`CampaignInstitutionPort` (the existing `CampaignInstitutionEpochSource`) is a
read-only canonical boundary:

```ts
inspectEpoch(institutionId) -> known {InstitutionEpochRefLike} | unknown | error
```

`createCampaign()` now requires:

```text
Institution exists
current InstitutionEpoch known
```

`unknown` / `error` / no port at all refuses genesis and appends ZERO Campaign
events. A ghost Campaign is impossible (`institution_unknown`,
`institution_error`, `institution_unavailable`).

Grounding is SERVICE-level: CampaignStore never imports InstitutionStore.
`installPalimpsest` exposes the campaign surface only when a canonical
institution source is supplied (`campaignInstitutionEpochPort`, or an
`institutionStore` adapted automatically). Historical replay of an existing
Campaign never requires the institution to be currently reachable.
