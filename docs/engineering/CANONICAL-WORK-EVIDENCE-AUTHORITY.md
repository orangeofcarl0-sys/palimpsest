# Canonical Work-Evidence Authority

Normative statement of how **Work Evidence** acquires and loses the authority to
satisfy a **gate** in Palimpsest's Work layer. G10-Y made this canonical; before
it, revocation was a projection repair with no event of its own.

Scope: `src/evidence/**`, `EVIDENCE_ADDED`, `EVIDENCE_STALE`, `GateEngine`, and the
revision path of `ProjectController.planReconciled`.

**Not in scope:** `src/proof_asset/**`, `EvidenceItem`, `PublishedProofClaim`,
`ProofEvidenceStore`. Work Evidence and Proof Evidence are different planes.

---

## 1. What "authority" means here

`GateEngine.evaluate()` reads **only** evidence whose current projection status is
`active`:

```ts
// src/evidence/gate_dsl.ts
export function activeEvidenceViews(store, projectId, subjectType, subjectId) {
  // ... WHERE json_extract(evidence_json,'$.subject_type') = ? AND ... id = ?
  return views.filter((view) => view.status === "active");
}
```

Therefore `evidence.status` is **not** cosmetic metadata. It *is* the current
authority to satisfy a gate. Any path that leaves stale evidence marked `active`
is a path on which a gate can consume authority the system has already decided to
revoke.

## 2. Firewalls

```text
EvidenceAtom           ≠  Truth
EVIDENCE_ADDED         ≠  PermanentAuthority
EvidenceHistory        ≠  CurrentEvidenceAuthority

EVIDENCE_STALE         ≠  DeleteEvidence
EVIDENCE_STALE         ≠  EvidenceWasFalse
EVIDENCE_STALE         ≠  ProofClaimContradicted

TaskStale              ≠  EvidenceStale automatically, except by the declared policy
ProjectRevision        ≠  GlobalEvidenceInvalidation

ProjectionStatus       ≠  HiddenCanonicalTruth
RawSQLRepair           ≠  CanonicalMutation

WorkerReport           ≠  Evidence
GateResult             ≠  Evidence
GatePass               ≠  PermanentAuthority
```

## 3. Current authority is derived by replay

Current authority is a **pure function of the log**:

```text
EVIDENCE_ADDED            ->  evidence.status := atom.status ("active")
EVIDENCE_STALE (later)    ->  evidence.status := "stale"
```

`rebuildProjections()` clears every projection and replays the event chain. It
must reconstruct the exact authority state with **no repair pass**. If a raw write
were ever required to restore a correct status, the status would not be canonical.

The immutable `EvidenceAtom` payload is never rewritten. `status` moves only in the
projection column. `EVIDENCE_STALE` records *revocation*, never *falsity*.

## 4. The declared typed invalidation policy

Scope is declared, not global. Two change classes invalidate
(`src/evidence/invalidation.ts`):

| change class | propagates? | Evidence revoked |
| --- | --- | --- |
| `metadata_only` | no | none |
| `backward_compatible` | no | none |
| `behavior_change` | along sensitive edges | typed closure |
| `contract_breaking` | along sensitive edges | typed closure |

The propagation closure is `computeInvalidationSet` (unchanged by G10-Y).

The revoked Evidence set is compiled by `compileEvidenceInvalidation`, which is
**pure** (no I/O, frozen output) and selects exactly the `active` items whose
**typed** `(subject_type, subject_id)` pair falls inside the closure:

```text
(task,    taskId)      in the retired task set          -> revoke
(attempt, attemptId)   in the retired tasks' attempts   -> revoke
(commit,  anything)                                     -> out of policy
```

Matching is by **exact typed pair**. A bare `subject_id` string match is refused,
because two subject kinds can share an id space (a commit id can equal a task id).

`commit`-subject Evidence is deliberately outside the automatic policy: a commit is
a repository artifact, not a Work node in the ProjectIR task graph, so the declared
typed policy carries no rule that retires it. Such items are reported in
`excludedBySubjectType` rather than silently dropped.

## 5. Retiring Work and revoking its authority are ONE transition

`planReconciled` commits one `appendAtomic` batch in a deterministic order:

```text
1. TASK_STALE          for each removed runnable task / typed-invalidation task
2. EVIDENCE_STALE      for each Work Evidence item those retirements revoke
3. PROJECT_REVISED     the new ProjectIR
4. TASK_REAUTHORIZED   each retained task, on the new head
5. TASK_CREATED        each added task
```

The revocation events deliberately precede `PROJECT_REVISED`: revoking authority
over the OLD world *is part of retiring it*, so it carries the old/current
`expected_project_revision` and commits in the same transaction. No second
transaction, no post-commit repair.

Consequence: a crash can expose

```text
complete OLD world (old revision, old task states, Evidence still active)
        or
complete NEW world (new revision, retired tasks stale, revoked Evidence stale)
```

and never a mixed `new ProjectIR + old authority` state.

## 6. The stale event

`EVIDENCE_STALE { evidence_id, reason }` is an existing canonical event and was
**reused unchanged** — G10-Y adds no second stale event species.

* `payload.evidence_id === entity_id` (admission-checked).
* `reason` is deterministic: `typed invalidation (<class>) on revision <n>`, or
  `work retirement on revision <n>` for a removal-only revision.
* Identity binds the semantics, not just the target:

  ```text
  idempotency_key = actionKey("evidence-stale-v1", {
    project_id, evidence_id, from_revision, to_revision, change_class, reason })
  ```

  The same Evidence across the same `from → to` transition under the same trigger
  is a retry and converges on one event. Different semantics reusing the identity
  fail closed as an idempotency conflict instead of overwriting history.

* Idempotent resolution happens **before** validation in `#appendInTransaction`, so
  a retry is answered from the log and never re-runs admission.

## 7. Admission

`AggregateValidator#validateEvidenceStale` pins identity and current authority:

```text
payload.evidence_id == entity_id
Evidence exists in this project
current projection status == "active"
```

Revoking an already-revoked item is not a state transition and fails closed.

## 8. One builder for both paths

The manual path (`invalidateEvidence(evidenceId, reason)`) and the revision path
share one builder (`#evidenceStaleRequest`). A manually revoked item and a
revision-revoked item are indistinguishable on the log: same event shape, same
idempotency semantics. The manual path uses `from = to = current revision` and
`change_class = null`, because a manual act revokes authority without moving the
ProjectIR.

## 9. What G10-Y does not do

```text
no new event type
no migration
no new table
no second Evidence store
no second gate engine
no shadow current-authority cache
no background repair job
no change to Proof-plane or Reasoning-plane standing
no cross-revision / parallel old-base promotion
```
