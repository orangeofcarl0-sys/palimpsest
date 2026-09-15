# G10-Y — Canonical Work-Evidence Invalidation & Atomic Gate Authority

Campaign specification (executed). Baseline:

```text
orangeofcarl0-sys/palimpsest
main @ 189fcd005885d1d7fdd40174aa6935783be92da6
```

## 1. Mission

> Make Work Evidence invalidation a canonical, append-only, atomic part of the
> same revision closure that invalidates the Work it supported.

Before G10-Y, a typed invalidating revision committed the new Work world and then
revoked the superseded world's Evidence in a **separate, non-transactional** step
(a raw `UPDATE evidence SET status='stale'` after the batch). A process death in
that window left a durable fail-open state in which `GateEngine` could still
consume authority the revision had decided to revoke. That is `CF-W-03`.

## 2. Scope

In scope — the Work gate Evidence plane:

```text
src/evidence/**
EvidenceAtom
EVIDENCE_ADDED
EVIDENCE_STALE
GateEngine
```

Out of scope — and unchanged:

```text
src/proof_asset/**
ProofEvidenceStore
EvidenceItem
PublishedProofClaim
```

```text
Work EvidenceAtom   ≠  Proof EvidenceItem
Work EVIDENCE_STALE ≠  ProofClaim reassessment
Gate authority      ≠  Proof standing
```

Also out of scope: cross-revision / parallel old-base promotion (`CF-X-01`).
Authority correctness precedes higher concurrency.

## 3. Reuse the existing canonical event

The wire contract and projector already carried
`EVIDENCE_STALE { evidence_id, reason }` with deterministic projector handling.
G10-Y therefore **reuses it unchanged** and adds no second stale event species.

## 4. Firewalls

```text
EvidenceAtom ≠ Truth                       EVIDENCE_STALE ≠ DeleteEvidence
EvidenceAdded ≠ PermanentAuthority         EVIDENCE_STALE ≠ EvidenceWasFalse
EvidenceHistory ≠ CurrentEvidenceAuthority EVIDENCE_STALE ≠ ProofClaimContradicted
TaskStale ≠ EvidenceStale automatically    ProjectRevision ≠ GlobalEvidenceInvalidation
ProjectionStatus ≠ HiddenCanonicalTruth     RawSQLRepair ≠ CanonicalMutation
WorkerReport ≠ Evidence                     GateResult ≠ Evidence
                                            GatePass ≠ PermanentAuthority
```

## 5. Required outcomes

1. Independently reproduce `CF-W-03` with a real crash, proving the fail-open state.
2. Prove gate-authority severity: `status` is authority, not metadata.
3. Audit the exact Work Evidence invalidation scope per subject kind.
4. Derive a pure typed `EvidenceInvalidationPlan` **before** any mutation.
5. Build canonical `EVIDENCE_STALE` requests through one shared builder.
6. Include the stale events in the same `appendAtomic` revision batch.
7. Delete the hidden post-commit SQL repair.
8. Prove gate behaviour before/after the revision.
9. Prove crash/fault-injection closure: old world or new world, never mixed.
10. Prove replay/rebuild reconstructs the exact authority with no repair pass.
11. Prove Proof/Reasoning/W/X semantics unchanged.

## 6. Event ordering

```text
1. TASK_STALE
2. EVIDENCE_STALE
3. PROJECT_REVISED
4. TASK_REAUTHORIZED
5. TASK_CREATED
```

The stale events are **pre-revision** because they belong to old-world authority
revocation, and they carry the old/current `expected_project_revision`. The
load-bearing invariant is not the order itself but:

> Evidence stale events commit in the SAME transaction as the revision closure.

## 7. Decisions taken in Y0

**Removed-task Evidence.** The revoked set is exactly the set of tasks the batch
marks `TASK_STALE`, whether they fall out by typed invalidation or by removal from
the new ProjectIR. There is one rule, not two: a task this revision declares dead
cannot keep evidence granting gate authority to its old work. This is an explicit,
documented, tested widening relative to the old repair (which ran only when a
change class was present). Y0 also established that the widening is currently
behaviourally vacuous for removal-only revisions, because `gate()` is the only
`EVIDENCE_ADDED` producer and always binds `subject_type: "attempt"`, and an
`ACTIVE`/`VERIFYING` task cannot be removed without a change class.

**Commit-subject Evidence.** Outside the automatic policy; reported in
`excludedBySubjectType`. No production producer exists (`gate()` always emits
`attempt` subjects).

**Idempotency.** Strengthened to bind `project_id, evidence_id, from_revision,
to_revision, change_class, reason`, so a different trigger cannot be mistaken for
a retry of the same revocation.

## 8. Adversarial items

`Y-N01`…`Y-N30` — see `test/y_adversarial.test.ts`.

## 9. Machine invariants

`EI-A01`…`EI-A33` as listed in the campaign spec; all are asserted by
`test/y_evidence_authority.test.ts` and `test/y_adversarial.test.ts`, or are
regression guards carried by the existing W/X/Proof/Reasoning suites run in the
gate.

## 10. PASS criterion

> Typed ProjectIR invalidation no longer commits a new Work world before revoking
> the authority of Evidence from the superseded world. Every Work Evidence item
> selected by the declared typed invalidation policy is converted into an existing
> canonical `EVIDENCE_STALE` event inside the same `appendAtomic` transaction as
> task staleness, ProjectIR revision, task reauthorization and new-task
> registration. A crash therefore exposes either the complete old world with
> active old evidence or the complete new world with stale invalidated evidence,
> never a mixed fail-open state. Gate evaluation after the revision cannot consume
> invalidated evidence, full replay reconstructs the same authority state without a
> repair pass, and Proof/Reasoning evidence semantics remain untouched.

## 11. PARTIAL / STOP conditions

PARTIAL if: a raw `UPDATE evidence` repair remains after the revision commit; the
stale event is emitted in a second transaction; a crash still leaves new revision
plus active invalidated Evidence; the gate can consume invalidated Evidence;
subject matching remains untyped; replay requires repair; ProofEvidenceStore is
conflated with Work Evidence; `CF-X-01` is mixed into this stage.

STOPPED — SEMANTIC REBASE REQUIRED if: canonical stale authority cannot be
represented by the existing EventStore semantics; the fix requires mutating
`EvidenceAtom` in place as truth; stale Evidence must be deleted; Work and Proof
Evidence must collapse; atomic invalidation requires distributed ACID with
Ordarium; current main materially invalidates the baseline.

None of the PARTIAL or STOP conditions was hit.

## 12. Series invariant

```text
One major stage at a time;
close its invariants;
carry real leftovers forward.
```

Project OS reliability closure so far:

```text
V  Project as Asset + Management Autonomy
W  Revision-safe Work evolution
X  Canonical repository-head evolution
Y  Canonical atomic Work-Evidence authority
```
