# COG-5 — Source-Intake Results (C5-B)

**Question:** can an external source update enter the canonical execution basis through the existing Work and
Promotion owners, without a new authority root and without weakening the head guard?

**Answer:** **yes.** An operator-authored Work task applied an immutable external candidate in an isolated
execution world; the completion contract observed the result; a normal operator Promotion advanced the proven
effect head; head reconciliation advanced the ProjectIR and reauthorized the retained task onto the new base;
a subsequent D2 attempt executed on that base. The direct external-commit control still refuses with
`HEAD_BASIS_MISMATCH`.

**Evidence:** `research-evidence/cog5/runs/main/` (the positive path and controls),
`research-evidence/cog5/runs/outofscope/` (write-scope refusal),
`research-evidence/cog5/outcomes.json`.

---

## 1. The route and the identities

The external candidate is a test-owned immutable snapshot:

| item | value |
| --- | --- |
| candidate path | `scripts/cog5/scenario/candidates/vendor-capabilities-2026-02-10.csv` |
| candidate SHA-256 | `0e997cbcc04ac1ee4c9b8d2985e2dd97443136d0f57b838f01d25de2403f920c` |
| origin | programme-office batch 2026-02-10 (test-owned immutable snapshot) |

The candidate was applied by a **Work task**, not by a direct commit:

| identity | value |
| --- | --- |
| initial canonical / live head | `29a08cd4be9273008892696da1f0dac2731aee46` |
| intake task | `intake-vendor-2026-02-10` |
| intake attempt | `attempt-2f04c9eec40c85e5ccbb3a303507ecee` |
| intake envelope base | `29a08cd4be9273008892696da1f0dac2731aee46` |
| intake result commit | `9e9c89474bf4f8f7c3715b7a730e6b0be5761efd` |
| promotion | `promotion-1a5e8dcf9f43939bff73483f0294768f` (event 24) |
| promotion expected head | `29a08cd4be9273008892696da1f0dac2731aee46` |
| promotion resulting head | `365c830126744bf66fc1528b94a85ead500a7c09` |
| project head immediately after promotion | still `29a08cd` — **SYNC_REQUIRED**, not yet reconciled |
| live head after promotion | `365c830126744bf66fc1528b94a85ead500a7c09` |
| accepted vendor blob | `0e997cbcc04ac1ee4c9b8d2985e2dd97443136d0f57b838f01d25de2403f920c` — equals the candidate |
| accepted head after rework reconciliation | `365c830126744bf66fc1528b94a85ead500a7c09` |

The result commit is **not** the accepted head. The promotion fact records
`sourceCommit = 9e9c894`, `expectedHeadCommit = 29a08cd`, `resultingHeadCommit = 365c830`. The accepted head
contains the result, and the committed vendor blob is byte-identical to the approved candidate. The
working-tree file differs only by Git's Windows line-ending normalization; the committed blob is the
authoritative comparison.

### 1.1 The intake task is a genuine Work identity

The task objective names the exact external revision and the exact write path. The worker reads the
candidate, verifies its digest, writes it to the declared path and commits. The Work identity is the task and
attempt; the external source's own Git identity is provenance, not approval. The operator's plan revision
created the task and the operator's promotion accepted the result.

The completion contract for this data-only write scope (`sources/vendor-capabilities.csv`) narrowed out the
standard's `node verify.mjs` clause by the declared applicability rule. The recorded evidence is
`write_scope_valid` and `expected_files_exist`. The accepted content was independently compared against the
candidate digest at the promotion head and matched exactly.

---

## 2. The authority chain

```text
candidate snapshot (bytes + digest + origin)
  → operator plan revision: TASK_CREATED intake-vendor-2026-02-10 at base 29a08cd
  → D2 prepare: live = project = proven effect = envelope base = 29a08cd
  → isolated execution world at 29a08cd
  → deterministic worker applies the exact candidate bytes and commits (result 9e9c894)
  → completion evaluation: write scope + required artifact
  → ATTEMPT_RESULT
  → operator Promotion: expected head 29a08cd → resulting head 365c830
  → PROMOTION_COMMITTED (event 24); TASK_SATISFIED (event 25)
  → ProjectIR is SYNC_REQUIRED; head reconciliation is blocked until quiescence
  → governed rework reopens technical-fit to READY (event 26)
  → reconcile: PROJECT_REVISED to 365c830 (event 27)
  → TASK_REAUTHORIZED technical-fit at base 365c830 (event 28)
  → TASK_STARTED (event 29)
  → new D2 attempt on 365c830 (engineered continuation, C5-C)
```

Every identity is separate. No identity was inferred from another.

---

## 3. The negative and boundary controls

### 3.1 Wrong source commit

Before the real promotion, promoting the intake attempt with the initial head as the source commit was
refused:

```text
source commit 29a08cd4be9273008892696da1f0dac2731aee46 does not match the canonical
AttemptReport.result_commit 9e9c89474bf4f8f7c3715b7a730e6b0be5761efd
```

No event was appended. The caller cannot redirect the promotion to different content.

### 3.2 Wrong expected head

Promoting with a fabricated expected head was refused:

```text
expected head 0000000000000000000000000000000000000000 does not match the canonical
proven effect head 29a08cd4be9273008892696da1f0dac2731aee46
```

No event was appended. The caller cannot name the head.

### 3.3 Duplicate delivery

Repeating the promotion after it committed returned the **same** `PROMOTION_COMMITTED` event 24 and the same
promotion ID `promotion-1a5e8d...`. The head did not move twice.

### 3.4 Unauthorized live head

After the positive path reached quiescence at project head `42a8ab4`, a `post-control` READY task was created
at that head (event 42, envelope base `42a8ab4`). A direct external commit then moved the live head to
`07ca355`. Starting the task produced:

```text
HEAD_BASIS_MISMATCH: the repository is at 07ca3558946d, the project head at 42a8ab40ce33,
the proven effect head at 42a8ab40ce33 and the task's base at 42a8ab40ce33 — a worker's
world must start where its envelope says the work starts
```

The job is `HOST_ERROR`; no attempt was created; the task remains `READY`; the project head did not move. The
direct commit granted no authority.

### 3.5 Unapproved path

A separate test-owned world used a worker that wrote the declared deliverable **and**
`sources/newsletter.md`. The product's settlement refused:

```text
state: NOT_READY
reason: OUT_OF_SCOPE
detail: the world changed paths outside the task envelope's write_paths
        [deliverables/technical-fit.md]: sources/newsletter.md
```

There is no `ATTEMPT_COMPLETED`, no result, no promotion; the attempt remains `RUNNING` and the task `ACTIVE`.

### 3.6 Stale and rejected

- A canonical head that moves before promotion is refused by the canonical head check (the wrong-head control
  exercises the same validation).
- The same-base topology rule (`cross_revision_promotion_not_supported`) is unchanged; it is the reason the
  second promotion must wait for a head reconciliation and a reauthorized envelope.
- A failed or rejected result is not promoted; the out-of-scope control is the concrete failure-before-acceptance
  case.
- `reconcileProjectHead` before the rework was **blocked by quiescence** (the technical task was `VERIFYING`);
  it did not adopt the live head.

### 3.7 Approval boundaries

The worker cannot promote, mint a permit or revise the plan. The test driver supplied only the canonical
task identity and the promotion arguments; the promotion manager validated both against the canonical
derivation. No model was used, so no model could grant itself authority.

---

## 4. Is the route Git-specific?

The **authority pattern** — immutable external artifact, operator-authored Work task, isolated world, observed
completion, normal promotion, head reconciliation — is general. The **canonical source facet is Git-specific**:
the basis binds a Git revision, the observer runs a Git diff, the promotion merges a Git commit, and the head
is a Git commit. A non-Git asset would need an asset/source-backend decision; the current envelope has no
canonical asset-dependency field.

No new source-admission authority (B3) was required or created.

---

## 5. C5-B verdict

**ESTABLISHED.**

An external source update entered the canonical execution basis through an operator-authored Work task and
normal Promotion. The source candidate's exact bytes and origin are recorded; the result commit and the
accepted head are separate identities; the ProjectIR advanced only through the proven promotion chain; the
retained task was reauthorized onto the new base; and a subsequent D2 attempt executed there.

The direct external-commit divergence remains refused. The positive path succeeded because the project
authority was legitimately updated, not because the guard became permissive.

**Limits:**

- the worker is deterministic and test-owned, not a model;
- the candidate ingestion is test-owned; the product has no model-facing intake tool;
- the route is Git-specific at the canonical-source layer;
- the completion contract narrowed out the standard command for the data-only write scope; the accepted blob
  was independently compared to the candidate, and the result carried scope + artifact evidence.
