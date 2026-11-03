# COG-5 — Continuation Results (C5-C)

**Question:** after the project reality changed through a lawful intake, can one existing result be handled
correctly and can a subsequent governed action actually finish?

**Answer:** **yes, through the governed rework path.** The packaged continuation assessed the stale technical
result as `INCOMPATIBLE`, offered rework and minted the `ReworkAdmissionPermit` itself. The governed reopening
landed as a `TASK_READY` with `rework_provenance`; head reconciliation advanced the ProjectIR to the accepted
intake head and reauthorized the task onto it; the D2 job prepared on that base, ran the worker to completion,
settled a new `ATTEMPT_RESULT`, and the operator promoted it. The task reached `TASK_SATISFIED`. The direct
external-commit control still refuses with `HEAD_BASIS_MISMATCH`.

**Evidence:** `research-evidence/cog5/runs/main/run.json`, `events.json`, `worktree.json`,
`research-evidence/cog5/outcomes.json`.

---

## 1. The stale result

| identity | value |
| --- | --- |
| task | `technical-fit` |
| origin attempt | `attempt-f27ca3f61c4c8281a1bb8f434b47b3f4` |
| origin result commit | `6584c6bdf843f1266edeaca3f6213850663dcf09` |
| origin basis source | `29a08cd4be9273008892696da1f0dac2731aee46` |
| task state before rework | `VERIFYING` |
| task batch anchor | 7 |

The result was produced before the vendor change. It reads `sources/vendor-capabilities.csv`. The vendor
revision changed V3's minimum operating temperature from -10 °C to 0 °C, which invalidates the Site B
selection. The result is genuinely affected; a refusal is correct, not a false alarm.

The technical result was **not** promoted before the intake. Its result commit exists in the canonical object
database, but it is not on the canonical branch.

---

## 2. The change and the assessment

The lawful intake result was promoted to `365c830` (see the source-intake results). The technical result is
still unpromoted at basis `29a08cd`.

### 2.1 Packaged inspection

```text
outcome:              INCOMPATIBLE
compatibility:        INCOMPATIBLE
currentness:          STALE
rework available:     true
rematerialize:        false
assessment digest:    8004f3d13ac1a72032bc6961cfaa7d66a8d77d52aca4bf30bdc3769993333b5f
```

The packaged face uses its whole-repository read. The technical result really did read the changed file, so
the conservative verdict happens to be the correct one for this result. The expert diagnostic confirms a
`read_invalidation` conflict on `sources/vendor-capabilities.csv`; admission is `CONFLICT`.

The unrelated newsletter control is the counterexample: the packaged face also reports `INCOMPATIBLE`, while
the expert with a precise read set reports `COMPATIBLE` (or `UNKNOWN` when the semantic facet is unavailable).
The packaged face cannot distinguish the two; the expert can. That is the A2 limitation, not a continuation
failure.

### 2.2 Head reconciliation before rework

`reconcileProjectHead()` returned `blocked`:

```text
quiescence_required: the project must be quiescent before the head advances: every
ACTIVE/VERIFYING task and open attempt must settle (a promoted task must reach
SATISFIED first)
```

The technical task was still `VERIFYING`, so the promoted intake effect could not become the ProjectIR head
yet. This is the correct safety property. It is why a governed reopening is the route that makes the project
quiescent enough to reconcile.

---

## 3. The governed reopening

`startRework()` was called with only:

- the result identity `{ kind: "ATTEMPT_RESULT", ref: "attempt-f27ca3f..." }`;
- the fresh packaged assessment digest.

The service re-observed the target, re-ran the authoritative assessment synchronously, minted the permit
itself, and appended the governed reopening. The durable event is:

```text
event 26 — TASK_READY — technical-fit
reason: rework-admitted
previous_state: VERIFYING
new_state: READY
batch_activation_event_id: 7
rework_provenance:
  reason: INCOMPATIBLE
  origin_result_subject: { kind: ATTEMPT_RESULT, ref: attempt-f27ca3f... }
  origin_basis_digest: 0f81e70e05b3ee8bf81a3ea1ffa59f1626105ee7a42ab5fda1341e58fae4739e
  target_observation_digest: b3231762790d1da28343219662b5bda110830cd5a4947dba050120841501febf
  continuation_assessment_digest: 8004f3d13ac1a72032bc6961cfaa7d66a8d77d52aca4bf30bdc3769993333b5f
  current_envelope_id: envelope-ada658a79e2db809ed92ee0b1377a7b2
```

The driver supplied no target digest, envelope id, batch anchor, reason, origin basis or fence. The permit is
born from the fresh assessment; the durable provenance is the replay record.

---

## 4. Head synchronization and execution-base correctness

The service's post-reopen half ran the existing owners:

```text
event 27 — PROJECT_REVISED — revision 1 — head 365c830
event 28 — TASK_REAUTHORIZED — technical-fit — base 365c830 — project revision 1
event 29 — TASK_STARTED — technical-fit — attempt 2
```

The reauthorized envelope's `base_commit` is the accepted intake head `365c830`. The D2 prepare guard saw:

```text
live head = project head = proven effect head = envelope base = 365c830
```

It did **not** raise `HEAD_BASIS_MISMATCH`. This is the exact transition COG-4 could not complete: the
canonical authority was legitimately updated by a Work result and a normal Promotion, so the worker's world
starts where its envelope says it starts.

The service returned:

```text
state: DELEGATED
headSynced: true
jobId: wdj-61e2ca2b-4a89-4c6d-acd5-7bd1e9f79e10
```

`DELEGATED` is not "completed"; the job was followed to its terminal state.

---

## 5. Worker execution, completion and settlement

| item | value |
| --- | --- |
| job terminal | `FINISHED` |
| new attempt | `attempt-8f395d58e1e39b5abb84829476ac2d3e` |
| new attempt state | `COMPLETED` |
| new result commit | `bb821f038a48de1bdd26e021993d578eb0be176e` |
| result base | `365c830126744bf66fc1528b94a85ead500a7c09` |
| changed files | `["deliverables/technical-fit.md"]` |
| evidence recorded | `write_scope_valid`, `expected_files_exist` |
| settlement | `SETTLED`; exported into the canonical object database; no ref, working tree or project revision changed before promotion |

The worker's output on the accepted basis is:

```text
# Technical fit

## Summary

No compliant vendor exists for every site on the current capability data.
```

That is the correct deterministic result for the changed vendor data: V3's minimum is now 0 °C, and Site B
requires -4 °C plus a coastal warranty. The worker did not reuse the stale selection; it produced a new,
current-basis result.

### 5.1 Verification

The task's write scope is documentation/data (`deliverables/technical-fit.md`). The completion contract
narrowed out the standard's `node verify.mjs` command by the declared applicability rule. The recorded
evidence is write scope and required artifact, not a command exit. The result is a real output and was
promoted through the normal route. No claim of a passing command is made for this data-only task.

---

## 6. Promotion and project-head advancement

The new result was promoted normally:

| identity | value |
| --- | --- |
| promotion | `promotion-d7e2ebee47af2f6dac4e4d6e8efa5659` (event 38) |
| attempt | `attempt-8f395d58e1e39b5abb84829476ac2d3e` |
| source commit | `bb821f038a48de1bdd26e021993d578eb0be176e` |
| expected head | `365c830126744bf66fc1528b94a85ead500a7c09` |
| resulting head | `42a8ab40ce33b24fa888413207efb95878b8bd5d` |
| step | `TASK_SATISFIED` (event 39) |
| final task state | `SATISFIED` |

`reconcileProjectHead()` then advanced the ProjectIR to `42a8ab4` (event 40). Both the intake and the
technical task are `SATISFIED`. The project head and the live head were equal at that point; the later direct
control commit deliberately moved only the live head to demonstrate the guard.

The highest reachable lifecycle in this run is therefore `TASK_SATISFIED` for both tasks, reached through a
real D2 execution and a normal Promotion.

---

## 7. Fresh-session recoverability

**NOT EXERCISED with a model in COG-5.**

The durable state required for a fresh Session is present:

- the ProjectIR revisions and head (events 27, 40);
- the Work attempts, results, evidence and promotions;
- the execution worlds of the intake and rework attempts;
- the journal was not seeded in this run (the COG-4 P Session already established the durable-state
  inheritance path with a journal, Work state and head divergence);
- the accepted vendor blob and the final technical deliverable are readable from the repository.

No model was called, so no claim is made that a model naturally consumed this state. The COG-4 P result
remains the fresh-session evidence; COG-5 adds a complete executable state for a future session to recover.

---

## 8. C5-C detailed verdict

| item | verdict | detail |
| --- | --- | --- |
| **Assessment correctness** | **PARTIAL** | the packaged face correctly refuses the genuinely affected technical result, but it cannot distinguish a conservative whole-repository overlap from a demonstrated dependency (the newsletter control). The expert kernel distinguishes all four outcomes. |
| **Route authorization** | **ESTABLISHED** | the service minted the permit from a fresh assessment; the driver supplied no authority-bearing field. |
| **Task reopening** | **ESTABLISHED** | event 26 is a governed `TASK_READY` with `rework_provenance` naming the origin result, origin basis, target observation, envelope and reason. |
| **Execution-base correctness** | **ESTABLISHED** | the ProjectIR advanced to `365c830`; event 28 reauthorized the task at that base; the D2 guard saw all four identities equal. |
| **Worker execution** | **ESTABLISHED (deterministic)** | the job reached `FINISHED`; a new attempt completed; the work is not a model. |
| **Completion and settlement** | **ESTABLISHED** | the result commit was exported, the completion evidence was recorded, and the attempt settled `COMPLETED`. |
| **Verification** | **PARTIAL** | the data-only write scope narrowed out the standard command; the result carries scope + artifact evidence. Independent verification was not required by the contract for this task. |
| **Promotion** | **ESTABLISHED** | normal operator promotion; resulting head `42a8ab4`; task `SATISFIED`. |
| **Project-head advancement** | **ESTABLISHED** | event 40 reconciled the ProjectIR to the promotion effect. |
| **Fresh-session recoverability** | **NOT EXERCISED** | no model; the durable state is present. |

### Gate C5-G4

**ESTABLISHED.** A stale result was handled through the existing governed Rework and D2 execution path on a
legal current basis. The final verdict is a terminal execution outcome and a promotion, not merely a job ID.

### Gate C5-G5

**ESTABLISHED for the rework path.** One lawful path reached a meaningful project outcome after a real
change, while the negative cases remained safe. The positive **reuse/rematerialization** branch is **NOT
ESTABLISHED**: the packaged face cannot produce `COMPATIBLE`, and the expert's positive proof used test-owned
observations. This distinction is preserved rather than collapsed.
