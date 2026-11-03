# Palimpsest-CI2 — Delegated Completion Evidence & Qualification Continuity

**Stage:** `Palimpsest-CI2 — Delegated Completion Evidence & Qualification Continuity`
**Branch:** `palimpsest-ci2-delegated-completion-qualification`
**Parent:** `334d04082a1e6328c018e05ff49a32851df048e4` (CI1 Evidence Freeze)
**Code Freeze:** `bd1ff8d0f9f04befd5f05f5040dee9930f2a118e` (tree `3629a5c3d7be1713901fbce2ff87139d648ef9ca`)
**Evidence Freeze:** the commit that adds only this report and `research-evidence/ci2/ci2-evidence.json` on top of the Code Freeze — i.e. the branch tip, whose SHA is necessarily not written inside it (a commit cannot contain its own hash). The Code-Freeze-to-Evidence-Freeze diff is what identifies it, and that diff is recorded verbatim in §11.
**Runtime:** `0.2.1-rc.3` (unchanged; the rc.2 decision was not reopened)

---

## 1. Executive result

**The trust gap is closed.** A delegated Agent task's actual immutable result is now independently
evaluated by the product, produces durable completion evidence that names the candidate it is about,
and passes the product's own release gate — while invalid, stale, conflicting and insufficiently
evidenced candidates are refused.

Before CI2, a delegated candidate settled `COMPLETED` with **zero evidence atoms**, so no gate could
ever pass over it and delegated work could not be qualified at all. That was measured twice: by CI1's
C4 and independently by CI2's own RED falsifier at the CI2 baseline.

The correction is one shared evaluator, one shared evidence writer, and one new step in the
settlement ladder — placed between candidate export and the completion report. The Finish route's
behaviour is unchanged.

**The broad non-gate regression passed for the first time in this line of stages: 291 files, 3739
tests, exit 0.** E4 and CI1 both carried an unresolved runner-exit defect. It did not reproduce here.

**What remains blocked, stated plainly:** this is not two live model-driven runtime Agents (the
carrier and worker ports are test-owned, as the ruling permits); there is no L2 hostile-isolation
claim; and the crash windows were measured as re-derivability properties rather than by killing a
process mid-write.

---

## 2. Git and freeze identity

| | |
|---|---|
| Parent | `334d04082a1e6328c018e05ff49a32851df048e4` (CI1 Evidence Freeze) |
| Code Freeze | `bd1ff8d0f9f04befd5f05f5040dee9930f2a118e` |
| Code Tree | `3629a5c3d7be1713901fbce2ff87139d648ef9ca` |
| Evidence Freeze | the branch tip above the Code Freeze (§11 identifies it by its diff) |

**Changed files at the Code Freeze** (production marked ★):

```
A  docs/engineering/ci2-a1-completion-architecture.md
A  docs/engineering/ci2-a4-implementation-decision.md
★M src/tools/controller.ts                 (4827 → 4830 LOC; ratchet ceiling 4830)
★A src/tools/work_evidence.ts              (the single evidence writer + attachment step)
★M src/work/attempt_execution.ts           (one new port member, one new settle step)
★A src/work/completion_evaluation.ts       (the shared contract evaluator)
M  test/ci1_bounded_synthesis.test.ts      (asserts the closed gap; keeps the combination finding)
A  test/ci2_delegated_qualification.test.ts
A  test/ci2_finish_reference.test.ts
A  test/ci2_idempotency_recovery.test.ts
A  test/ci2_mutation_controls.test.ts
A  test/ci2_negative_controls.test.ts
A  test/ci2_project_continuity.test.ts
A  test/ci2_red_delegated_evidence.test.ts
M  tools/architecture/layers.ts            (one file-level layer override, with its reason)
```

**Four production files changed, all narrowly.** No new event type, no new predicate, no schema
change, no new store, no public API change (`missing: 0, changed kind: 0, added: 0`).

---

## 3. Completion architecture — the original reason evidence was missing

The full source-level audit is `docs/engineering/ci2-a1-completion-architecture.md`. The finding in
one paragraph:

Evidence becomes durable through exactly one path — an `EVIDENCE_ADDED` event projected into the
`evidence` table. There were exactly two builders of that event in the whole tree, both private
methods of `ProjectController`. `makeMutatingAttemptService.settle` lives in `src/work/`, and the
module graph forbids `src/work/` from importing `src/tools/controller.ts` (firewall `work-not-host`:
*"a Work owner answers Work questions; the controller is one of its CONSUMERS … An upward edge from
the owner to either inverts the ownership SR-2b established"*). **So the owner that settled delegated
work could not name the evidence writer, and settled without evidence. The gap was an ownership
boundary working as designed, not a forgotten call.**

Of the contract's three mechanical check kinds, the delegated route **never executed** two
(`assert_required_artifacts`, `run_standard_command`) and **executed but recorded nothing** for the
third (`assert_write_scope`, which was refusal-only).

---

## 4. Implementation

**Approach C**, chosen against the actual code and recorded in `ci2-a4-implementation-decision.md`:

- **A — call the whole Finish controller from settlement: rejected.** `finish` takes no attempt id,
  resolves the *one* running direct attempt, and refuses unless `execution === "in-place"` — while
  delegated work is `worktree` by construction. It would also report twice.
- **B — duplicate the checks: rejected.** Two implementations of one contract is the semantic drift
  the ruling names, and the firewall makes it impossible anyway.
- **C — reuse the evaluation semantics through a port: selected.** The delegated route already
  consumes a narrow port set described as *"capabilities the controller already had; the owner
  composes them into the two ladders"*.

Three files, each with one job:

| File | What it is | Why it is separate |
|---|---|---|
| `src/work/completion_evaluation.ts` | `evaluateCompletionContract` — the three checks, returning a typed outcome | The evaluator is pure with respect to the ledger: it appends nothing and decides nothing about settlement |
| `src/tools/work_evidence.ts` | The single `EVIDENCE_ADDED` writer (moved, not duplicated) + `attachCompletionEvidence` | Evidence-writing belongs to the controller's side of the firewall; moving the builders here makes "one writer, two routes" structural |
| `src/work/attempt_execution.ts` | One new port member `evaluateCompletion`, one new `settle` step | The owner that knows the ORDER still owns it |

**Where the new step sits, and why:**

```
observe → invariants → scope → head basis → EXPORT → EVALUATE → report
```

Export before evaluation because the existing code already states the reason: *"EXPORT before REPORT:
the report is about to name `result_commit = R`, and R must be resolvable in the canonical object
database — otherwise a released world would leave a name nobody can resolve."* Evaluation is about the
candidate, so the candidate must exist first. Evaluation is after the head-basis admission because a
`BASE_DRIFT` result is already refused, and running commands for it would spend real work on a
candidate that cannot become canonical.

**The candidate identity.** Each atom additionally records `result_commit`, `candidate_tree` and
`base_commit` in its `value` map — which is explicitly open and is what a gate clause's `where`
matches — plus a content-addressed `dependency_digest` over `(base, result, tree)`. **No schema change
and no new predicate** were needed: `subject_digest` is a digest of `(attempt_id, predicate)` and
therefore cannot distinguish two results for one attempt, so the candidate goes where the grammar can
actually use it.

**The artifact check reads the attempt's world, not the canonical repository.** `finish` uses the
canonical repository because an in-place attempt's tree *is* that repository. A delegated attempt's is
not: the candidate's file does not reach the canonical tree until promotion, so reading it there would
report a present artifact as missing — the `INCOMPLETE`-forever defect this repository already recorded
once for a related mistake. The atom records `evaluated_in: "attempt-world"` so the reading is
attributable.

**New invariants:**

1. A delegated settlement cannot report `COMPLETED` without having evaluated its contract.
2. A check that failed or could not be evaluated records **nothing** — a refusal leaves no half-evidence.
3. `NOT_EVALUABLE` outranks `FAILED`: if any check could not be evaluated the contract is not satisfied,
   and reporting that as "failed" would suggest a fixable defect where the truth is an absent observation.
4. A repeated observation converges on its recorded atom; a *different* exit code for one identity
   raises rather than silently winning.
5. A different candidate for an attempt already holding atoms is a named `CANDIDATE_CONFLICT`, never a
   convergence.

---

## 5. Original RED and corrected GREEN

Same fixture, same assertions' subject, two trees.

**RED at `334d040`** (`test/ci2_red_delegated_evidence.test.ts`, preserved verbatim in the file's own
history and in `research-evidence/ci2/`):

| Fact | Value |
|---|---|
| Attempt state | `COMPLETED` |
| Candidate exported and resolvable | yes (`git cat-file -t` → `commit`) |
| Evidence atoms for the attempt | **0** |
| Events of type `EVIDENCE_ADDED` | **0** |
| Release gate verdict | `INCOMPLETE` |

**GREEN at `0335e35`**, same file, same fixture:

| Fact | Value |
|---|---|
| Attempt state | `COMPLETED` |
| Evidence atoms | **3** — `write_scope_valid`, `process_exit_zero`, `expected_files_exist` |
| Producer on every atom | `palimpsest-delegated-settlement` |
| Every atom names the candidate | yes (`result_commit`, `candidate_tree`, `base_commit`) |
| `EVIDENCE_ADDED` recorded **before** `ATTEMPT_COMPLETED` | yes (asserted by index) |
| Release gate verdict | **PASS**, `evidence_used` = exactly those 3 |

The RED assertions were not deleted. They are replaced by their exact negation, and the file's own
doc block quotes the two original lines so the measurement stays reproducible by checking out
`334d040`.

---

## 6. Qualification

**The acceptance case** (`ci2_delegated_qualification.test.ts`) records §12's seven facts separately,
each with a non-vacuity precondition:

| Fact | How it is asserted | What would falsify it |
|---|---|---|
| Execution completed | `attempts` table says `COMPLETED` | the row would not say it |
| Candidate exported | commit resolves from the canonical object DB; blob content read via plumbing | `cat-file -t` would fail |
| Contract evaluated | three check kinds asserted **before** the work runs | a vacuous contract would show fewer |
| Evidence persisted | read from the `evidence` table through the Gate's own projection | zero rows |
| Evidence projected | `gate.evidence_used` equals the atom ids | any mismatch |
| Gate passed | the **product's own** release gate, declared at genesis from the operator's standard | a fabricated gate |
| Promotion | **not** promoted; `PROMOTION%` event count is 0; canonical HEAD still at base | a promotion event |

**Negative controls N1–N8** (`ci2_negative_controls.test.ts`, 8/8) — each paired with a positive that
differs in exactly the invalidating dimension, because universal rejection is not a safety solution:

| | Control | Result |
|---|---|---|
| N1 | out-of-scope candidate | refused; paired in-scope candidate PASSES |
| N2 | missing declared artifact | refused; paired present artifact PASSES |
| N3 | another attempt's evidence | `INCOMPLETE`, `evidence_used: []` |
| N4 | same task, different attempt / newer candidate | `INCOMPLETE`; the same clause with the real candidate PASSES |
| N5 | different contract | `basisDigest` differs; evidence records the contract that actually ran |
| N6 | completed attempt, no evidence of its own | `INCOMPLETE`, never PASS |
| N7 | failing standard command | refused, attempt stays RUNNING, no passing atom |
| N8 | foreign commit that resolves | no atom names it; gate over it is `INCOMPLETE` |

**Subject precision.** A gate clause scoped to a *different* candidate is `INCOMPLETE`; the same clause
scoped to *this* candidate is `PASS`. That is §8's "different exported Commit" case, expressed with the
existing grammar and no new vocabulary.

---

## 7. Idempotency and recovery

`ci2_idempotency_recovery.test.ts`, 7/7. The six operations §15 asks to keep distinct were kept distinct:

| Operation | Measured behaviour |
|---|---|
| Repeated request | converges: no second atoms, no second `ATTEMPT_COMPLETED`, same candidate |
| Repeated delivery observation | a read; no new evidence appended, ids stable |
| Re-evaluation of the same candidate | identical observations and values — which is *why* the key converges |
| New attempt for the same task | its own subject; the previous attempt's atoms do not cover it |
| Changed candidate | different `dependency_digest`; `CANDIDATE_CONFLICT`; gate scoped to it is `INCOMPLETE` |
| Changed contract | different `basisDigest`; cannot silently satisfy the old bar |

**A real defect was found and fixed while measuring this.** The first repeated settlement threw
`IdempotencyConflict`, because the atom's bytes change on every call (`created_at`) while the key does
not. The store was right to refuse — it cannot tell "the same qualification recorded twice" from "a
different qualification smuggled under one key". The fix makes the *writer* converge on its own key
when the observation is the same, and raise when the exit code differs. Recorded as a production fix
in `0335e35`.

**The crash windows** (W1–W5), measured as properties rather than by killing processes:

- **W1/W2 — candidate exported, evidence missing.** The candidate is an immutable git object and the
  contract is a pure function, so evaluation is re-derivable **without re-running the worker**. Measured
  by materializing the exported commit into a disposable worktree and re-evaluating: identical answer.
  *The first attempt at this test used the canonical repository as the work directory and got `FAILED`
  — a true finding, not a test bug: the canonical tree is still at base until promotion. That is
  recorded in the test's own comment.*
- **W3 — evidence recorded, ack missing.** Re-observation is a read; ids are stable.
- **W4 — attempt complete, evidence unavailable.** Stays `INCOMPLETE`, never assumed qualified.
- **W5 — same attempt, conflicting candidate.** Distinguished by `dependency_digest`; refused as a
  conflict, never converged.

**No Transactional Outbox was built.** §11 says not to build one without a concrete measured failure,
and re-derivation from the immutable candidate is sufficient for every window measured.

---

## 8. Existing Finish compatibility

The Finish route's behaviour is **unchanged**, and this is not merely asserted: `ci2_finish_reference.test.ts`
pins the authorized behaviour field by field before the change could be compared against it —
3 atoms, `tests_pass` with `exit_code: 0` and its command, `write_scope_valid` and
`expected_files_exist` with `command: null` / `exit_code: null`, producers `palimpsest-gate` /
`palimpsest-finish`, and the refusal behaviour for a failing command, an out-of-scope change and a
missing artifact.

The 155-test targeted regression includes `lean_finish`, `lean_completion_contract`, `gate_tool`,
`gate_dsl`, `lean_governance`, `evidence_graph`, `acceptance`, `y_evidence_authority`,
`w_revision_safe`, `lean_settlement_closure`, `lean_work_delegation_transport`, `lean_d2_live_composition`,
`lean_promotion_readiness`, `lean_speculative_authority` and `lean_d5d_result_continuation_service` —
**all 155 pass.**

**One genuine regression was found by that regression and fixed** (`0335e35`). The extracted writer
had collapsed `observedArtifacts` and `value` into one positional parameter, so `gate()`'s artifact
list was being reinterpreted as an evidence payload. The signature was restored and the reason is now
stated in the function's own doc block. This is exactly the class of quiet shape change the extraction
had to avoid, and it was caught because the regression was run rather than assumed.

---

## 9. Project Head continuity

`ci2_project_continuity.test.ts` — **established.**

The scenario uses the strongest available path: **`promoteWhenGatePasses`**, the product's own
gate-gated promotion entry, which refuses unless the registered gate returns PASS. Before CI2 that path
was unreachable for delegated work. Using it means the promotion was authorized by the evidence the
delegated route recorded, not by a gate the test invented and not by calling `promote` directly.

| Step | Result |
|---|---|
| Task A settles through the consumer | `COMPLETED`, 2 atoms |
| Release gate on A1 | `PASS` |
| Scheduler reaches `VERIFYING` | reached by `step()` only — no state fabricated |
| `promoteWhenGatePasses` | **promoted**; head advanced to the candidate |
| One `step()`, then `reconcileProjectHead()` | head `IN_SYNC`, canonical repo at the promoted commit |
| Candidate's file in the canonical tree | present only after promotion (asserted both ways) |
| Task B admission | **admitted** |
| B's frozen base | equals the promoted head — the dependency was honoured by version premises, not merely declared |
| B's own worker ran | yes; `observedScopes == ["src/a.ts", "src/b.ts"]` |
| B's candidate and qualification | distinct commit, gate `PASS` on its own evidence |

**A misbinding was caught here too.** The first version of this rig matched the worker by world path,
which names the *attempt* and carries no scope — so every job would have run A's worker. The assertion
`observedScopes == ["src/a.ts", "src/b.ts"]` is what makes the dispatch claim checkable, and it exists
because CI1 measured the same failure.

---

## 10. Runtime and asset integrity

| Asset | Before | After | Verdict |
|---|---|---|---|
| Protected evidence trees | 66 | 67 (+`ci2`) | pre-existing trees unchanged |
| Pre-existing tree diff vs `95ce9b8` | — | only `ci1/` additions | unchanged |
| Registered worktrees | 95 | 95 | unchanged |
| Gate root entries | 19 | 19 | unchanged; all five `p2b-c3-OWNED-*` present |
| Runtime modules | 125 | 125 | unchanged |
| Runtime version | `0.2.1-rc.3` | `0.2.1-rc.3` | unchanged; rc.2 not investigated |

**One disposable worktree was created and removed** (`ci2-baseline-probe`, used to prove a regression
was mine rather than pre-existing). Its `node_modules` junction was **unlinked with `unlinkSync`
before** the tree was removed — never by descending through it — and the worktree count was verified
back at 95. No `git worktree prune` was run on the global set. No historical path was touched.

---

## 11. Evidence Freeze and final verification

**Authoritative verification at the Code Freeze `0335e35`:**

| Check | Result |
|---|---|
| `tsc -b` | exit 0 |
| `module-architecture.mjs --check` | PASS — 0 violations, 9 baseline exceptions |
| `--check-public-api` | PASS — 0 missing / 0 changed / 0 added |
| CI1 + CI2 together | 12 files, **38 tests, 38 passed, exit 0** |
| Finish/Gate/promotion targeted | 15 files, **155 tests, 155 passed, exit 0** |
| Broad non-gate selection | **291 files, 3739 tests, 3739 passed, exit 0**, `--maxConcurrency=2` |

**The broad run's own honesty note.** All 291 files and 3739 tests passed and the runner exited 0, but
vitest then reported `Timeout terminating forks worker for ... lean_d5d_result_continuation_service`
**after** the run had completed. It is recorded rather than omitted. The 155-test targeted run
includes that suite and passes it cleanly on its own, so this is a teardown-after-success artifact of
the forks pool under load, not a test result.

**The selection grew from 279 to 291 files** because CI1 added five and CI2 added seven. The formula
`408 − 39 r3l0 − 78 trajectory_ = 291` holds, and is asserted by `scripts/ci2/derive-selection.mjs`.

**Evidence Freeze:** the branch tip on top of the Code Freeze, adding exactly two non-executable files —
`docs/engineering/ci2-delegated-completion-qualification.md` and `research-evidence/ci2/ci2-evidence.json`.
**No executable file is added or modified in it**, verified by classifying every path in the
Code-Freeze-to-Evidence-Freeze diff:

```
A  docs/engineering/ci2-delegated-completion-qualification.md
A  research-evidence/ci2/ci2-evidence.json
```

The executable producer `scripts/ci2/derive-selection.mjs` was **moved into the Code Freeze** rather
than left in the evidence commit, which is why the freeze identities above are the second pair: the
first attempt put an executable in the Evidence Freeze, and that was corrected rather than reported as
if it had not happened.

**§15 — what was verified at the FINAL Code Freeze `bd1ff8d`, not an earlier tree:**

| Check | Result |
|---|---|
| `tsc -b` | exit 0 |
| `module-architecture.mjs --check` | PASS — 0 violations, 9 baseline exceptions |
| `--check-public-api` | PASS — 0 missing / 0 changed / 0 added |
| CI1 + CI2 together | 12 files, **38 tests, 38 passed, exit 0** |

The broad 291-file / 3739-test / exit-0 run was performed at `0335e35`. The only executable difference
between `0335e35` and `bd1ff8d` is `scripts/ci2/derive-selection.mjs` — a standalone producer that no
test imports and no product module references. That is stated rather than glossed: the broad run is
attributed to `0335e35`, and the CI/architecture/API checks were re-run at `bd1ff8d`.

---

## 12. Verdicts

| | Verdict | Basis |
|---|---|---|
| **V0 — Baseline Integrity** | **ESTABLISHED** | Clean tree at `334d040`; 66 trees, 95 worktrees, gate root 19, rc.3 all verified before mutation |
| **V1 — Completion Semantics** | **QUALIFIED** | `ATTEMPT_COMPLETED` still means "execution finished"; a failed contract is a refusal with the attempt still RUNNING, and the gate verdict is a separate fact |
| **V2 — Candidate Evidence Binding** | **QUALIFIED** | Every delegated atom names `result_commit` / `candidate_tree` / `base_commit` and carries a content-addressed `dependency_digest`; wrong-candidate clauses are `INCOMPLETE` |
| **V3 — Delegated Evidence Production** | **ESTABLISHED** | The production delegated route records real atoms for every check that held, proven by the RED→GREEN pair |
| **V4 — Gate Qualification** | **ESTABLISHED** | A legitimate delegated candidate PASSES the product's own release gate; N1–N8 refuse for their named reasons, each with a passing pair |
| **V5 — Idempotency and Recovery** | **QUALIFIED** | Repeat converges, conflict is named, W1–W5 measured; recovery is re-derivation from the immutable candidate, not an outbox |
| **V6 — Finish Compatibility** | **PRESERVED** | 155 targeted tests pass; the Finish reference pins the behaviour field by field; one real regression found and fixed |
| **V7 — Project Continuity** | **ESTABLISHED** | A qualified delegated candidate promotes through `promoteWhenGatePasses`, the head reconciles, and a dependent task is admitted on the promoted base |
| **V8 — Historical and Runtime Integrity** | **PRESERVED** | 67 trees (66 unchanged), 95 worktrees, gate root 19, runtime 125 modules, rc.3 unchanged |
| **V9 — Overall CI2 Qualification** | **`CI2_QUALIFIED_FOR_THE_DELEGATED_COMPLETION_AND_QUALIFICATION_PATH`** | Bounded by §11's list below |

**Why V9 is bounded, in the ruling's own terms.** No positive PASS case was ever unreached, no evidence
was fabricated or written directly by test code, every evidence subject matches its candidate, the
negative controls fail correctly, Finish does not regress, the authoritative tests met their exit
contracts, and no protected resource was modified. What V9 does **not** claim is §11's list below.

---

## 13. Remaining limitations

Distinguished exactly as §11 asks:

- **Delegated completion qualification — ESTABLISHED** for the work/consumer path, with a test-owned
  carrier and worker port.
- **Project Revision continuity — ESTABLISHED NARROWLY** for one dependent task on one promoted head.
  It is not a claim about arbitrary replanning, revision migration, or long chains.
- **Cross-Owner dependency projection — NOT ESTABLISHED.** CI1 found no relation kind exists for it and
  CI2 did not add one. CI2's completion evidence does not turn CI1's `TEMPORAL_ONLY` edges into
  established causality; nothing in this stage touches that projection.
- **Real model-driven Agent cooperation — NOT ESTABLISHED.** The `RuntimeCarrierPort` and
  `WorkWorkerRunPort` remain test-owned. A real `Activation` requires a carrier port and this
  repository has no production implementation.
- **Full multi-writer synthesis — NOT ESTABLISHED.** CI2 qualifies independent candidates; it does not
  qualify concurrent writes to a shared asset.
- **Strong L2 resource isolation — NOT CLAIMED.** All execution is L1 cooperative same-user. The E3
  quarantine residual TOCTOU is unchanged.
- **Crash recovery across a real process kill — NOT MEASURED.** The windows were measured as
  re-derivability properties. A kill between export and evaluation was not performed, and no
  cross-system atomicity is claimed: Git and SQLite remain two systems.
- **The real runtime Home content boundary — UNESTABLISHED**, carried unchanged from CI1.

---

## 14. Next-stage recommendation

The normal delegated qualification path is now established, so the recommendation is the minimum
justified next experiment toward **Project Revision Continuity**, not a broader rebuild:

**A bounded continuity stage over revision change, using the evidence this stage now produces.** The
one thing V7 did *not* test is what happens when the plan revises *between* qualification and
promotion — whether the completion evidence produced under revision *N* is correctly treated as
inapplicable under revision *N+1*, and whether the `EVIDENCE_STALE` path revokes exactly the right
atoms. That machinery already exists (`src/evidence/invalidation.ts`, `EVIDENCE_STALE`); what does not
exist is a measurement that a **delegated** atom carrying a candidate identity is revoked correctly
when the revision moves.

That is the smallest experiment that tests a real guarantee rather than extending scope, and it
requires no new architecture.

The secondary items, each of which needs its own authorization:

1. A cross-Owner dependency relation kind in Trajectory core — CI1 and CI2 both measured that none
   exists, and adding one is a vocabulary change, not an adapter fix.
2. The stale deployment copy in the real runtime home — latent, not on the executed path, and
   modifying it is explicitly out of scope here.
3. The E4 runner lifecycle defect — **the broad run did not reproduce it**, which is itself evidence;
   it should be re-measured before being "fixed".
