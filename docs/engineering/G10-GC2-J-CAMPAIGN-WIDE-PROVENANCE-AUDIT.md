# G10-GC2-J — Campaign-Wide Provenance Audit

## Mandatory red-team targets (§11) and their disposition

| Target | Disposition |
|---|---|
| projectId-only projection | eliminated — `projectLinkedProjects` keys by the complete ref |
| synthetic `revision: 0` | eliminated — source firewall + A-M07 |
| synthetic empty digest | eliminated — `requireCanonicalDigest` at every durable boundary |
| missing Work port silently skipped | eliminated — B-M02 (incomplete, zero writes) |
| historical Project satisfying current wake | eliminated — F-M01, `matchesProjectAdmission` |
| historical WAIT satisfying current wake | eliminated — G-M01, `matchesWaitAdmission` |
| arbitrary WakeCycle reconciliation | eliminated — E-M01/H-M01/M02 |
| compile before current reconciliation | eliminated — H-M03 (`compilation_failed`) |
| compiled action from old reconciliation | eliminated — E-M07/E-M08 (wake-bound key/digest) |
| same compilation reused under another wake | eliminated — admission key + candidate digest include the wake |
| `WAKE_CYCLE_COMPLETED` with no action ref | eliminated — strict nested parser (D-M07/D-M09) |
| placeholder previous belief digest | eliminated — C-M03 (`"previous"` rejected) |
| second belief digest algorithm | eliminated — only `currentBeliefStateOf` |
| raw `String(...)` persistent parser coercion | eliminated in production parsers (remaining uses are error-message formatting only) |
| unknown persistent fields accepted | eliminated — `exactKeys` at every level |
| event payload arrays unchecked | eliminated — `requireStringArray` + per-member stable-id validation |
| fake E2E comments not represented by actual events | eliminated — the E2E asserts the canonical event set and exact payloads |

## Source-level firewall

`test/gc2_provenance_closure.test.ts` asserts that no campaign module (`production.ts`,
`lifecycle.ts`, `compiler.ts`, `project.ts`) contains `revision: 0, digest: ""`,
`previousBeliefStateDigest: "previous"`, `checkpoint: caller…`, or a `projectIds.map`
reconstruction.

## Findings closed during the review

1. **Completion idempotency ordering.** `completeWakeWithAction` originally required the
   wake to be in flight *before* checking for an existing completion, so an identical retry
   after success threw instead of being a no-op. Reordered: an existing identical completion
   returns first; a different action conflicts; only then is in-flight required. (F-M08.)
2. **Evidence-id array coercion (pre-existing).** `parseClaimStandingSnapshot` passed
   `object.supportingEvidenceIds as string[]` straight into the materializer; a stored bare
   string would have spread into characters and been silently accepted. Now every element is
   validated as a stable identifier and non-arrays are rejected. (GC2-D.)
3. **Project admission auto-registers its declared Intervention.** The proposal always
   declares intervention semantics, so admission writes `INTERVENTION_REGISTERED` in the same
   atomic batch (§81). Provenance remains correct: an explicit I1 for the same ProjectRef
   deduplicates by ref while both intervention records remain visible as sources.

## No new ontology / no second store

The audit confirms: no `OrganizationGraph`, no Holon/RuntimeScope realization, no scheduler
change, no effect authority, no second Evidence system, no second provenance store. Campaign
causality lives entirely in Campaign history.
