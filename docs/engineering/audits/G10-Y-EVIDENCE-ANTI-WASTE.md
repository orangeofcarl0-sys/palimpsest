# G10-Y — Anti-waste audit

Every claim below is checkable against the diff and the test suites.

| Claim | Evidence |
| --- | --- |
| **Existing `EVIDENCE_STALE` reused** | No new entry in `EVENT_TYPES`; `test/y_evidence_authority.test.ts` asserts the payload key set is exactly `["evidence_id","reason"]`. `git diff` touches no `EVENT_PAYLOAD_FIELDS` entry. |
| **No second Evidence store** | `Y-N27` asserts the database has exactly one evidence table (`evidence`) and no table matching `/invalidation|authority|gate_authority/`. |
| **No second gate engine** | `GateEngine` in `src/evidence/gate_dsl.ts` is unmodified apart from nothing at all — the file is not in the diff. |
| **No shadow current-authority cache** | `compileEvidenceInvalidation` is pure and frozen; the controller re-reads the `evidence` projection on each revision (`Y-N02` asserts the plan equals what the batch commits). No field on the controller caches authority. |
| **No background repair job** | `#staleEvidenceForScope` deleted (`Y-N01` scans `src/**` for `UPDATE evidence SET status` outside the projector and finds none). `Y-N28` waits after the revision returns and asserts the log length and the status are unchanged, and that the evidence module arms no timer. |
| **No Proof-plane duplication** | `Y-N23` builds a real Proof store (source → evidence → candidate), digests every row of every table, runs a Work revision, and asserts the Proof database digest is byte-identical and that the two schemas are disjoint. |
| **No new event species / migration / table** | `fixtures/**` untouched. `pnpm build` + full suite green with the existing ledger schema version; `Y-N24` shows the revision writes only `events`, `evidence`, `projects`, `tasks`, `projection_cursors`. |
| **Deleted, not layered** | `#staleEvidenceForScope` is removed outright; there is no "canonical path plus legacy repair" fallback and no feature flag. |
| **One builder, two callers** | `#evidenceStaleRequest` is called by `invalidateEvidence` and by the revision path; `Y-N19` proves the manual path is idempotent and `Y-N02` proves the revision path commits the compiled plan. |

## Cost added at runtime

* One read of the `evidence` projection plus one read of `attempts` per retired
  task, executed **before** the batch — no extra transaction, no extra statement
  per unaffected task.
* One `EVIDENCE_STALE` event per revoked Evidence item, replacing an equal number
  of unscoped `UPDATE` statements that previously ran outside the transaction.
  Net statement count is unchanged or lower; the difference is that the writes are
  now log-attributable.

## Deliberately NOT built

```text
EvidenceInvalidationStore        (EventStore + the evidence projection suffice)
EvidenceAuthorityStore
a second stale event species
a background reconciliation job
a cached "current authority" index
a distributed transaction with Ordarium
```

## Honest limitations

* The revocation plan is compiled from a fresh read of the projection, not from a
  snapshot taken at batch-open time. Within one process the batch opens
  immediately after compilation; two processes writing concurrently would be
  caught by the existing `RevisionConflict` / `AtomicAppendError` guards rather
  than by the plan. This matches the single-writer discipline of the Work store
  and is not a new exposure.
* `commit`-subject Evidence is out of the automatic policy by decision, not by
  omission — it is reported in `excludedBySubjectType` so the exclusion is visible
  rather than silent.
