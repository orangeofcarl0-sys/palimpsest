# G10-GC0 — Parser Audit

| Persisted artifact | Parser owner | Strictness |
| --- | --- | --- |
| CampaignDefinition | artifacts.ts | exact keys, stable id |
| CampaignCommitment | artifacts.ts | exact keys, non-empty statement |
| Commitment lifecycle payloads | artifacts.ts | exact keys, stable ids |
| Hypothesis | epistemic.ts | exact keys, optional parent |
| ClaimStandingSnapshot | epistemic.ts | status enum, id lists, digest verified |
| Observation / BeliefRevision | epistemic.ts | exact keys, stable ids |
| Intervention | intervention.ts | exact keys, purpose enum, project ref |
| ProjectOperationalStanding | intervention.ts | `parseProjectOperationalStanding` enum |
| WatchCondition / WatchDraft | prospective.ts | kind-discriminated exact keys |
| Lifecycle/checkpoint/world payloads | lifecycle.ts | enum + id-list validation, digest verified |
| Compiler candidate / admission payloads | compiler.ts | strict union, canonical ProjectProposal validation |

No parser relies on an unchecked semantic cast (`as CampaignWatchCondition`,
`as ProjectOperationalStanding`, `as ClaimStatus`, `as string[]`) without prior
complete validation on the persistent path.
