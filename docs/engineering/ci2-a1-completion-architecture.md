# CI2-A1 — the two completion routes, at source level

**Stage:** `Palimpsest-CI2 — Delegated Completion Evidence & Qualification Continuity`
**Branch:** `palimpsest-ci2-delegated-completion-qualification`
**Parent:** `334d04082a1e6328c018e05ff49a32851df048e4` (CI1 Evidence Freeze)

This document is the mandatory source-level reconstruction (§4). Every claim below cites the file
and line range it was read from. Nothing here is carried over from the CI1 report's summary: CI1
named the gap, and this re-derives it.

---

## 1. The Finish route (`ProjectController.finish`)

`src/tools/controller.ts:3132-3267`. Entry is the `palimpsest_finish` tool; the tool surface carries
`{ action }` and nothing else, so no predicate, exit code, file list or command can be supplied by
the caller (`test/lean_finish.test.ts:160-166` asserts the closed schema).

| # | Step | Source | Input identity | Trusted? | Side effect | Output |
|---|------|--------|----------------|----------|-------------|--------|
| F1 | Select the direct attempt | `controller.ts:3139` `#uniqueRunningAttempt` | the one RUNNING attempt | product | none | attemptId |
| F2 | Placement gate | `controller.ts:3146-3150` | `this.execution` | product | none | refuses unless `in-place` |
| F3 | Read envelope | `controller.ts:3151` `#attemptContext` | `(project, attempt)` | product | none | envelope |
| F4 | Read standard | `controller.ts:3152` | `this.#standard` | operator | none | refuses if unconfirmed |
| F5 | **Observe the tree** | `controller.ts:3161` → `#observeAttemptResultSync` (`controller.ts:2329-2363`) | attempt id + `envelope.base_commit` | **product observation** | none (read-only git) | `changedFiles`, `uncommittedChanges`, `observedHead`, `requiredArtifacts` |
| F6 | Materialization invariant | `controller.ts:3172` `#assertCompletionMaterialized` (`2389-2394`) | observation | product | none | refuses if uncommitted work |
| F7 | Non-empty-work invariant | `controller.ts:3176` `#assertCompletionHasWork` (`2695`) | observation | product | none | refuses if no change |
| F8 | **Derive the contract** | `controller.ts:3181` → `#completionContractFor` (`3633`) → `deriveAttemptCompletionContract` (`src/domain/completion_contract.ts:154-258`) | standard + task + envelope | pure function | none | `mechanical[]`, `verification`, `basisDigest` |
| F9 | `assert_write_scope` | `controller.ts:3185-3201` | `changedFiles` vs `envelope.write_paths` | product | **`EVIDENCE_ADDED(write_scope_valid)`** via `#recordObservedEvidence` (`2632-2679`) | throw on violation |
| F10 | `assert_required_artifacts` | `controller.ts:3203-3214` | `check.paths` vs `existsSync(join(#canonicalRepository(), path))` | product | **`EVIDENCE_ADDED(expected_files_exist)`** | throw on missing |
| F11 | `run_standard_command` | `controller.ts:3216-3245` | `check.command` + envelope authorization | product executes, **product observes exit code** | **`EVIDENCE_ADDED(<predicate>)`** via `#recordCommandEvidence` (`2571-2621`) | throw on non-zero / unobservable |
| F12 | Report + settle | `controller.ts:3251-3258` `report` (`2214-2263`) | product observation overwrites any caller claim (`controller.ts:2253-2259`) | product | `ATTEMPT_COMPLETED` via `scheduler.recordCallback` (`src/scheduler/scheduler.ts:624-689`) | COMPLETED |

**What the route evaluates.** Actual candidate content, observed by the product in the tree the
placement names. Not an agent report: `report` overwrites `changed_files` and `result_commit` with
what `git status` and `rev-parse HEAD` say (`controller.ts:2253-2259`). The agent supplies only
`workerStatus` and an optional summary.

**Every side effect, in order:** at most one `EVIDENCE_ADDED` per mechanical check, then one
`ATTEMPT_COMPLETED`. A refusal at F6/F7/F9/F10/F11 leaves the attempt `RUNNING` and appends nothing
before the refusal point — except that F9/F10/F11 record as they go, so a later failure leaves the
earlier, individually-true observations in the ledger (`test/lean_finish.test.ts:206-219` asserts
exactly that, and calls it idempotent).

**Failure behaviour:** `DomainValidationError` with a message that names the locus and the remedy.
Nothing is settled.

---

## 2. The Delegated route (`makeMutatingAttemptService.settle`)

`src/work/attempt_execution.ts:330-442`, reached from `ProjectController.settleMutatingWork`
(`controller.ts:2960-2965`), which is called by the consumer at
`src/interaction/work_delegation.ts:706` and again at `:806` (the drain path).

| # | Step | Source | Input identity | Trusted? | Side effect | Output |
|---|------|--------|----------------|----------|-------------|--------|
| D1 | Worker outcome gate | `attempt_execution.ts:341-348` | `workerOutcome.kind` | **worker-reported** | none | NOT_READY for escalation/failure |
| D2 | Read envelope | `attempt_execution.ts:352` | `(project, attempt)` | product | none | envelope |
| D3 | **Observe the world** | `attempt_execution.ts:353` → `ports.observeAttemptResult` → the same `#observeAttemptResultSync` | attempt + `envelope.base_commit` | **product observation** | none | same shape as F5 |
| D4 | Materialization invariant | `attempt_execution.ts:365-372` | observation | product | none | NOT_READY `UNCOMMITTED_WORK` |
| D5 | Non-empty-work invariant | `attempt_execution.ts:373-380` | observation | product | none | NOT_READY `NO_WORK` |
| D6 | **Scope check** | `attempt_execution.ts:381-391` | `observed.changedFiles` vs `envelope.write_paths` | product | **none** | NOT_READY `OUT_OF_SCOPE` |
| D7 | Head-basis admission | `attempt_execution.ts:395-410` | `headStatus()` + live head + `envelope.base_commit` | product | none | `BASE_DRIFT`, world retained |
| D8 | **Export the candidate** | `attempt_execution.ts:417-429` → `ports.exportResultCommit` (`controller.ts:1049-1053`) | `observed.observedHead` | product | imports the commit into the canonical object DB | NOT_READY `RESULT_NOT_EXPORTED` |
| D9 | Report | `attempt_execution.ts:433` → `ports.report` (`controller.ts:1055-1057`) → `controller.report(attemptId, {workerStatus:"completed"})` | **product re-observes** (`controller.ts:2228-2231`); the port passes no claim | product | `ATTEMPT_COMPLETED` | SETTLED |

**What the route evaluates.** The world, by the same observation F5 uses. It runs **no** completion
contract, executes **no** standard command, checks **no** required artifact, and records **no**
evidence atom.

---

## 3. The first point where the two routes stop sharing validation semantics

**F8.** `finish` derives the completion contract and executes its `mechanical[]` list; `settle`
never derives one. The contract is derived in `prepare` for *readiness* purposes
(`attempt_execution.ts:286-295`) and then dropped — `PreparedMutatingWork.completion`
(`attempt_execution.ts:53-56`) carries only a summary of it, and `settle` does not read it back.

The consequence is not that the delegated route validates *differently*; it is that the delegated
route validates **less**. Specifically, of the contract's three mechanical check kinds
(`completion_contract.ts:33-40`):

- `assert_write_scope` — **evaluated** at D6, but as a refusal only, and **recorded as nothing**;
- `assert_required_artifacts` — **never evaluated**;
- `run_standard_command` — **never evaluated**.

So the answer to §4's five-way question is **1 and 3 for two of the three checks**: for artifacts and
commands the checks never execute; for scope the check executes but produces no authoritative event.

---

## 4. Why the evidence is absent — the mechanism, not the symptom

Evidence becomes durable by exactly one path: an `EVIDENCE_ADDED` event, projected into the
`evidence` table (`src/state/projector.ts:44`). There are exactly two builders of that event in the
whole source tree, and both are private methods of `ProjectController`:

```
#recordCommandEvidence   src/tools/controller.ts:2571
#recordObservedEvidence  src/tools/controller.ts:2632
```

`grep -rn "EVIDENCE_ADDED" src/` returns the schema, the projector, the graph labels and those two
builders — no third writer. Both are reachable only from `gate()`, `finish()`, `runAttemptWithCommandExecutor()`
and the automatic pump. `settle` is in `src/work/`, and `src/work/` is forbidden by the module graph
from importing `src/tools/controller.ts` (`architecture/module-architecture.json`, firewall
`work-not-host`: *"a Work owner answers Work questions; the controller is one of its CONSUMERS … An
upward edge from the owner to either inverts the ownership SR-2b established"*).

**That is the structural reason.** The owner that settles delegated work cannot name the evidence
writer, so it settles without evidence. The gap is an ownership boundary working as designed, not a
forgotten call.

---

## 5. Evidence subject matching — what the Gate can and cannot enforce

`GateEngine.evaluate` (`src/evidence/gate_dsl.ts:116-175`) reads active evidence for one subject
through `activeEvidenceViews` (`gate_dsl.ts:52-84`), whose query is:

```sql
WHERE project_id=? AND json_extract(evidence_json,'$.subject_type')=? AND json_extract(evidence_json,'$.subject_id')=?
```

**Scoped by `subject_id` only.** `subject_digest` exists on the atom (`src/schema/models.ts:869`) and
is written by both builders (`controller.ts:2592`, `controller.ts:2650`), but **no consumer reads
it** — `grep -rn "subject_digest" src/` returns the schema, the manual-approval payload and those two
writes, and nothing else.

Two consequences, both load-bearing for CI2:

1. **Attempt-scoping already prevents the cheap borrows.** Two Attempts have different
   `subject_id`s, so evidence from A1 cannot satisfy a gate over A2, and a second task reusing a
   Task ID still gets a different attempt id. §8's "another Attempt", "same Task ID", "another Owner"
   cases are closed by the existing model.
2. **Attempt-scoping does NOT distinguish candidate versions of one attempt.** A second settlement
   of the same attempt that observed a different result commit would be scoped to the same subject,
   and the evidence idempotency key (`evidence-observed-v1`, `controller.ts:2638-2642`) contains no
   candidate — so the second settlement would converge onto the *first* candidate's atom. That is
   the W5 window (§11) and it is a real hole, not a hypothetical one.

The clause grammar can already express a candidate match: `exists`/`count` accept `where`, and
`matchClause` (`src/domain/gate_clause.ts:209-216`) compares `view.value[key] === expected` against
the atom's **open** `value` map (`models.ts:907-909`, "`value` is an explicitly OPEN map"). So a
gate can be written as `{ exists: { predicate: "write_scope_valid", where: { result_commit: "<sha>" } } }`
with **no schema change and no new predicate vocabulary** — provided the candidate is actually
present in `value`.

It is not today: `#recordObservedEvidence` writes `{changed_files, write_paths, out_of_scope}` for
scope (`controller.ts:3195-3199`) and `{paths, missing}` for artifacts (`controller.ts:3211`), and
`#recordCommandEvidence` writes `{exit_code}` (`controller.ts:2594`). No atom names the candidate it
was produced about.

---

## 6. Invariants the correction must preserve

| Invariant | Where it is enforced today |
|-----------|---------------------------|
| `ATTEMPT_COMPLETED` ≠ contract PASS | `evaluateAttemptGate` (`controller.ts:3366-3371`) records telemetry only on PASS/FAIL, never settles |
| Missing evidence ≠ PASS | `gate_dsl.ts:150-154`: `unresolved` ⇒ `INCOMPLETE` |
| Evidence records observation, never a claim | `#recordCommandEvidence` takes an observed exit code; `gate()` refuses a null exit (`controller.ts:2550-2553`) |
| A completed attempt's work is commit-materialized | `#assertCompletionMaterialized`, held by both routes (F6, D4) |
| Scope violations never settle | D6 today; F9 today |
| A refusal leaves nothing behind | F5-F7 run before any evidence; D4-D7 run before any export |
| Empty work never settles | `#assertCompletionHasWork`, both routes (F7, D5) |

---

## 7. What this audit establishes for the rest of CI2

1. The gap is an **ownership boundary**, so the correction must not move evidence-writing into
   `src/work/` — it must let the controller evaluate on the owner's behalf, through a port. This is
   Approach C, and §7's preferred option.
2. The **shared semantics already exist as one function each** (`deriveAttemptCompletionContract`,
   `#recordObservedEvidence`, `#recordCommandEvidence`). Nothing needs to be re-implemented; the
   delegated route needs to reach them.
3. The **subject model is sufficient for everything except candidate identity within one attempt**,
   which needs the candidate in the atom's `value` (already an open map) plus a conflict refusal at
   settlement. No new identity service, no schema change.
4. **Ordering is already decided by the existing code.** D8 exports before D9 reports because "the
   report is about to name a commit, and a name nobody can resolve is worse than a refusal"
   (`attempt_execution.ts:412-414`). Evaluation must therefore run **after** export — the exported
   candidate is the thing that gets evaluated, and a crash between export and evaluation leaves an
   intact immutable candidate with incomplete qualification (W1) rather than evidence about a commit
   the project cannot materialize.
