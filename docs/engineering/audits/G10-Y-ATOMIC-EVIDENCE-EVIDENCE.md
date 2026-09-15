# G10-Y — Atomic Evidence invalidation evidence

Consolidated evidence that the ordered tasks `TASK_STALE` and `EVIDENCE_STALE` and the
revision commit together.

## 1. Delivered batch shape

From `test/y_evidence_authority.test.ts` ("…commit as ONE atomic batch, in order")
and `test/y_adversarial.test.ts` `Y-N12`:

```text
["TASK_STALE", "EVIDENCE_STALE", "PROJECT_REVISED", "TASK_CREATED"]
```

`Y-N12` additionally proves the batch is one durable transition rather than four
adjacent commits:

* `project_sequence` values are contiguous and increasing;
* each event's `previous_event_digest` equals its predecessor's `event_digest`.

## 2. Fault injection at every checkpoint

`Y-N15` (and the behavioural "fault injection at every batch checkpoint" test)
injects a crash inside the transaction at:

```text
after TASK_STALE insert
after the first EVIDENCE_STALE insert
after PROJECT_REVISED insert
after TASK_CREATED insert
before COMMIT
```

For each checkpoint the store is closed and **reopened from the file**, and the
observed `(revision, evidence status, stale-event count)` triple must be exactly one
of:

```text
0 / active / 0     the complete old world
1 / stale  / 1     the complete new world
```

The assertion `expect(revision === 1).toBe(evidence === "stale")` states the
non-divergence directly: the ProjectIR basis and the Evidence authority can never
disagree after a commit.

## 3. Targeted rollback proofs

* `Y-N13` — a fault after the `EVIDENCE_STALE` insert rolls back the earlier
  `TASK_STALE` too: the reopened log has the original length, zero `TASK_STALE`,
  zero `EVIDENCE_STALE`, `task-a` back to `ACTIVE`, Evidence back to `active`.
* `Y-N14` — a fault after the `PROJECT_REVISED` insert rolls back the revocation:
  revision `0` and Evidence `active`.

## 4. Real-process crash proof

`scripts/audit/y0-cf-w-03-repro.mjs` kills a real child process the instant the
batch `COMMIT` returns, using the production `EventStore` unchanged. After the fix
the reopened database shows the complete new world: revision `1`, `task-a` `STALE`,
`task-b` registered, Evidence `stale`, `activeEvidenceViews` empty, gate
`INCOMPLETE`, exactly one `EVIDENCE_STALE` event.

## 5. Retry convergence

`Y-N20` and the behavioural retry test: with the batch rolled back by a
`before_commit` fault, re-issuing the identical `planReconciled` call produces
exactly one closure and exactly one `EVIDENCE_STALE` event. The evidence events
carry deterministic idempotency keys, so a retry converges rather than duplicating.

## 6. Replay and rebuild

`Y-N21`/`Y-N22` and the behavioural replay test: after `close()` → reopen,
`quickCheck()`, `verifyFull()`, `rebuildProjections()` all pass, and the Evidence
status and `activeEvidenceViews` are reconstructed identically from the event chain
alone. No repair pass runs after open, and none is needed.

## 7. Write confinement

`Y-N24` digests every row of every table before and after a revision and asserts the
changed set is exactly:

```text
events, evidence, projection_cursors, projects, tasks
```

`projection_cursors` is EventStore's own projection-tail bookkeeping and moves with
any projection write. No Reasoning-plane or Proof-plane table is touched; `Y-N23`
proves the Proof plane (a separate store with a disjoint schema) is byte-identical
across a Work revision.
