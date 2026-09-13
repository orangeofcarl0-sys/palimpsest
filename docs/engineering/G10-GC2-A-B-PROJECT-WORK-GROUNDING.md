# G10-GC2-A/B — Exact Project Grounding & Work Knowledge Completeness

## GC2-A Exact `CampaignProjectRef` grounding

Frozen identity:

```text
CampaignProjectRef = (projectId, revision, digest)
```

Never reduced to `projectId`, and never reconstructed as `revision: 0`, `digest: ""`.

- `src/campaign/project.ts` adds `projectLinkedProjects(events)` returning
  `CampaignLinkedProject { project, sources }`, keyed by the complete ref and ordered by
  `(projectId, revision, digest)`.
- Sources are `{kind:"admission", admissionKey}` and/or
  `{kind:"intervention", interventionId}`; identical refs through both deduplicate while
  keeping both sources.
- Same `projectId` with a different ref ⇒ `{status:"project_identity_conflict"}` (fail
  closed — never silently pick one).
- `src/campaign/intervention.ts` now exposes the single strict parser
  `parseCampaignProjectRef`, reused by the checkpoint, world snapshot, intervention,
  watch condition, compiler admission, and projection. `materializeCampaignProjectRef`
  requires a canonical digest.
- `buildCurrentCampaignCheckpoint` uses the projected refs directly and returns
  `state: "error"` when the projection conflicts.

Proofs (`test/gc2_provenance_closure.test.ts`): A-M01 admission ref preserved · A-M02
intervention ref preserved · A-M03 exact ref dedup with both sources · A-M04 conflicting
refs fail closed · A-M05/M06 checkpoint carries exact revision + digest · A-M07 no
synthetic `revision:0/digest:""` (behavioural + source firewall) · A-M08 restart replays
the exact ref.

## GC2-B Work knowledge completeness

```text
linkedProjects.length === 0  → Work port not required
linkedProjects.length  > 0   → Work port MUST exist
```

- A missing Work source with ≥1 linked Project ⇒ `reconciliation_incomplete`
  ("linked Projects exist but no Work observation source is configured"), zero writes.
- Any `WorkKnowledge.unknown` or `WorkKnowledge.error` blocks the complete observation.
  `unknown ≠ failed`; neither triggers nor fails an action.
- Every linked Project is inspected at its exact ref; the returned standing is stored
  against that exact ref; observations are ordered canonically by ref.
- No "one is known so that is enough" shortcut.

Proofs: B-M01 zero linked ⇒ no Work source · B-M02 linked + no source ⇒ incomplete, zero
writes · B-M03/M04 unknown and error both block · B-M05 every linked Project observed ·
B-M06 exact revision/digest reaches the Work port · B-M07 standing stored against the exact
ref · B-M08 no semantic write on an incomplete world.
