# CI2-A4 — the implementation decision record

**Decision:** Approach C. Reuse the existing Completion Contract evaluation semantics from the
delegated settlement route, through a **port the controller implements**, while the delegated route
keeps its own lifecycle control.

This record states the source facts that justify it, and what it deliberately does not do.

---

## 1. The three candidates, measured against the actual code

### Approach A — call the whole Finish controller from delegated settlement

**Rejected.** Each rejection below is a source fact, not a preference.

| Would it… | Evidence |
|---|---|
| repeat Attempt completion? | `finish` ends by calling `this.report(...)` (`controller.ts:3251-3258`), which appends `ATTEMPT_COMPLETED` via `scheduler.recordCallback`. `settle` also ends by calling `ports.report(...)` (`attempt_execution.ts:433`). Calling `finish` from `settle` would report twice. The second report is not idempotent in the way that matters: `recordCallback`'s key includes the report digest (`scheduler.ts:644-648`), and `finish`'s report summary differs from the delegated one, so it would append a **second** terminal event — or throw `illegal Attempt transition COMPLETED -> COMPLETED` (`state_machine.ts:57`). |
| introduce synthetic Finish reports? | `finish` builds a report with `workerStatus: "completed"` and a summary it composes (`controller.ts:3251-3257`). A delegated settlement reporting a "finish" it did not perform is exactly the fabricated report §16 forbids. |
| change authorization semantics? | `finish` refuses unless `this.execution === "in-place"` (`controller.ts:3146-3150`). Delegated work is `worktree` **by construction** (`attempt_execution.ts:166-172`). Approach A cannot even run on the delegated route without deleting that guard — which is the guard that says a worker-placed attempt is settled by its own report path. |
| evaluate the wrong candidate? | `finish` resolves its attempt from `#uniqueRunningAttempt()` (`controller.ts:3139`) — the ONE running direct attempt. A delegated settlement names its attempt explicitly. Under concurrency these are different attempts. |
| re-enter incompatible controller states? | `finish` requires the attempt to be the direct one `begin` opened. A worker-placed attempt is not. |

Two further facts make Approach A unavailable even if the lifecycle objections were waived:
`finish` takes **no attempt id** (its input is `{ summary? }`), and it is guarded to a placement that
delegated work never uses.

### Approach B — duplicate the completion checks in the delegated implementation

**Rejected.** `deriveAttemptCompletionContract` is already the single derivation
(`completion_contract.ts:154-258`), and the two evidence builders are already the single writers
(`controller.ts:2571`, `controller.ts:2632`). A second implementation of the same contract is the
semantic drift §7 names: the bar would be derived once and enforced twice, and the two would diverge
the first time either changed. There is also a hard structural barrier: `src/work/` is forbidden by
the module graph from importing `src/tools/controller.ts` (firewall `work-not-host`), so a duplicated
implementation could not even reuse the builders.

### Approach C — reuse the evaluation semantics through a port

**Selected.** The delegated route already consumes a narrow port set (`MutatingExecutionPorts`,
`attempt_execution.ts:80-137`) whose members are exactly "capabilities the controller already had; the
owner composes them into the two ladders" (`attempt_execution.ts:74-78`). Adding one more member of
the same kind is the established pattern in this file, not a new architecture.

---

## 2. The seam, exactly

One new port member:

```ts
/** Evaluate the attempt's completion contract against its exported candidate, recording real evidence. */
evaluateCompletion(input: {
  readonly attemptId: string;
  readonly resultCommit: string;
  readonly changedFiles: readonly string[];
  readonly worldPath: string;
}): Promise<CompletionEvaluation>;
```

and one new `settle` step, **between export and report**:

```
observe → invariants → scope → head basis → EXPORT → EVALUATE → report
```

**Why between export and report, and not earlier.** The existing code states the reason the ordering
is what it is: *"EXPORT before REPORT: the report is about to name `result_commit = R`, and R must be
resolvable in the canonical object database — otherwise a released world would leave a name nobody
can resolve"* (`attempt_execution.ts:412-414`). Evaluation is about the candidate, so the candidate
must exist first. Evaluating a commit that cannot be resolved would produce evidence about nothing.

**Why it can run standard commands at all.** `runGateCommand` takes a `cwd`
(`gate_runner.ts:19-29`), and `finish` already passes one for in-place attempts
(`controller.ts:3227`). The delegated route passes the attempt's **world path**, so a command runs in
the tree the worker actually worked in — which is also the tree the exported commit came from.

**Why the artifact check reads the world, not the canonical repository.** `finish` uses
`#canonicalRepository()` (`controller.ts:3204`) because an in-place attempt's tree *is* the canonical
repository. For a delegated attempt that is false: the canonical repository is at the base commit and
the candidate's file does not reach it until promotion. Using the canonical root would report a
present artifact as missing — the `INCOMPLETE`-forever defect the `where`-clause comment already
records for a related mistake (`standard.ts:62-67`). The delegated evaluation therefore reads
`worldPath`, and the evidence atom records which tree was read so the reading is attributable.

---

## 3. What the evidence will say that the Finish route's evidence does not

Two additions, both inside structures that already permit them:

1. **`value` gains the candidate.** `value` is an explicitly open map (`models.ts:907-909`), and the
   gate clause grammar already matches on it (`gate_clause.ts:209-216`). Adding
   `result_commit` / `candidate_tree` / `evaluated_at` to each atom's `value` therefore needs **no
   schema change and no new predicate**, and it makes §8's "different exported Commit" case
   expressible as `where: { result_commit: ... }`.
2. **`dependency_digest` names the base→result edge.** The field exists and is `null` today
   (`models.ts:877`). Setting it to a digest over `(base_commit, result_commit)` gives the atom a
   content-addressed link to the exact candidate pair it was produced about, which is what
   `subject_digest` cannot say because it is a digest of `(attempt_id, predicate)`.

**`subject_digest` is left alone.** Changing it would alter every existing atom's meaning for no
gain — the Gate never reads it (`§5` of the A1 audit), and the candidate belongs in `value` where the
clause grammar can actually use it.

**No new predicate is introduced.** The vocabulary is closed at six (`models.ts:852-859`), and the
three check kinds map onto three existing predicates.

---

## 4. What the correction must NOT do

- It must not make `settle` call `finish`, `report` twice, or fabricate a Finish report.
- It must not move evidence-writing into `src/work/` (the firewall forbids it, and ownership is right
  as it stands).
- It must not change `deriveAttemptCompletionContract` — the bar is the same bar.
- It must not change what `finish` records, so the Finish compatibility regression (§16) is a
  comparison of unchanged behaviour.
- It must not emit PASS because the worker said it was done, the export succeeded, or the diff is
  non-empty. Every atom comes from an observation the product made.
- It must not settle an attempt whose contract evaluation **failed** — that is a refusal, and the
  attempt stays RUNNING so the work can be corrected, exactly as `finish` behaves.

## 5. Failure and incomplete-input handling

The evaluation returns a typed outcome rather than a boolean:

| Outcome | Meaning | Settlement |
|---|---|---|
| `PASSED` | every mechanical check ran and held | proceed to report |
| `FAILED` | a check ran and the observation contradicted it | refuse; attempt stays RUNNING |
| `NOT_EVALUABLE` | a required input was unavailable (world unobservable, command unobservable) | refuse; **no** evidence recorded for that check |
| `ERRORED` | the evaluator threw | refuse; the error is not converted into a passing check |

`NOT_EVALUABLE` and `ERRORED` are deliberately distinct from `FAILED`: "could not be evaluated" is not
"evaluated and found wrong", and neither is "passed" (§9). The repository's verdict vocabulary is
preserved — evidence atoms carry predicates, and the Gate's three-valued `PASS | FAIL | INCOMPLETE`
is untouched.
