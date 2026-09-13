# G10-GC2-C/D — Canonical Belief Provenance & Production Parser Closure

## GC2-C Canonical BeliefState provenance

Removed: `previousBeliefStateDigest = "previous"` and every independent reimplementation of
the BeliefState digest inside production reconciliation.

One projection function — `currentBeliefStateOf` — is the canonical calculation:

```ts
const previousBelief  = currentBeliefStateOf(campaignId, existingRevisions);
// …materialize changed observations/revisions in memory…
const resultingBelief = currentBeliefStateOf(campaignId, [...existingRevisions, ...newRevisions]);
report.previousBeliefStateDigest  = previousBelief.digest;
report.resultingBeliefStateDigest = resultingBelief.digest;
```

- Zero new revisions ⇒ `previous == resulting` (unchanged Evidence is a no-op).
- Changed provenance with the same standing may still create a revision; the resulting
  digest changes because revision identity changed — legitimate.
- A concurrent already-canonical belief event changes the basis, so `appendAtomic` fails
  the freshness check and the caller retries.

Proofs: C-M01 previous equals `currentBeliefStateOf(before).digest` · C-M02 resulting
equals `currentBeliefStateOf(after).digest` · C-M03 no placeholder string · C-M04 unchanged
Evidence gives equal digests · C-M05 changed Evidence updates the resulting digest · C-M06
replay reconstructs the same `CurrentBeliefState` · C-M07 report digest stable · C-M08 a
corrupt belief digest fails the parser.

## GC2-D Strict production parser closure

`src/campaign/digest.ts` defines `CANONICAL_DIGEST_RE` / `requireCanonicalDigest`: a digest
that crosses a durable boundary must be 64-character lowercase SHA-256 hex. `""`,
`"previous"`, or an arbitrary non-empty string fails closed.

- `RECONCILIATION_COMMITTED` payload is exactly `{ report }`.
- `parseReconciliationReport` requires exactly
  `wakeCycleId · worldSnapshotDigest · previousBeliefStateDigest · resultingBeliefStateDigest ·
  activeCommitmentIds · changedHypothesisIds · digest`; every digest is canonical; the
  semantic-set arrays are canonicalized (sorted) and duplicates rejected; the digest is
  recomputed and must match.
- `WAKE_CYCLE_COMPLETED` is exactly `{ wakeCycleId, action }`, where the action is a strictly
  parsed nested union (`project` or `wait`).
- Evidence id arrays in `parseClaimStandingSnapshot` validate every member (no blind
  `as string[]` that would spread a bare string into characters).
- World-snapshot and checkpoint parsers retain GC0 strictness for
  `ProjectOperationalStanding`, `ClaimStandingSnapshot`, `InstitutionEpochRefLike`, and
  `WatchId`; all nested output is deep-frozen and input is detached.

The Evidence-id validator is the repository's shared stable-identifier grammar
(`src/schema/identifier.ts`), documented as the Evidence plane's id form.

Proofs: D-M01 unknown reconciliation field rejected · D-M02/M03 null/typed `wakeCycleId`
rejected · D-M04 invalid digest rejected · D-M05/M06 non-array and invalid-id arrays
rejected · D-M07 unknown completion action kind rejected · D-M08 malformed ProjectRef
rejected · D-M09 unknown completion field rejected · D-M10 replay of a corrupted durable
event fails closed.
