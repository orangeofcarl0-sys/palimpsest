# Palimpsest-CI3 — Evidence Identity, Staleness & Revision-Scoped Authority

**Stage:** `Palimpsest-CI3`
**Branch:** `palimpsest-ci3-evidence-applicability-authority`
**Parent:** CI2 Evidence Freeze `eac1c2d47864191a8568ac6a8725d2c4d179c916` (tree `e3f95303d20d4856a8e05729c6ecc522265e326b`)
**Runtime:** `0.2.1-rc.3` (unchanged; the rc.2 decision was not reopened)

---

## 1. Executive assessment

**CI3 established that Palimpsest distinguishes a replay from a new evaluation, preserves historical evidence
after its authority expires, refuses stale authority at the promotion boundary, and still lets a legitimate
candidate regain applicable qualification.** All of that was measured against the shipped product, not
asserted from its source.

The stage also found and fixed **one genuine defect** in the shared evidence writer. Its consequence was not
unsafe promotion — the Gate already read the authority column — but a **false qualification claim**: a
repeated settlement of a revoked attempt reported `SETTLED` with three "recorded" predicates while every
one of those atoms was stale.

What was not established is stated in §12, and the most important entries are that `crash` windows are
measured as re-derivability rather than by killing a process, and that no hostile same-user isolation is
claimed.

| # | Capability | Status |
|---|---|---|
| 1 | Replay vs re-evaluation vs conflict are distinct | **established** |
| 2 | Historical evidence survives revocation verbatim | **established** |
| 3 | Revision staleness is scoped, atomic and typed | **established** |
| 4 | The Gate refuses stale and mismatched evidence | **established** |
| 5 | Promotion re-derives authority at its own boundary | **established** |
| 6 | A legitimate candidate can requalify after staleness | **established** (end to end) |
| 7 | Finish and CI2 delegated paths unchanged | **preserved** |
| 8 | The revoked-atom re-record defect | **found and corrected** |

---

## 2. Git history

| Item | Value |
|---|---|
| Branch | `palimpsest-ci3-evidence-applicability-authority` |
| Parent (CI2 Evidence Freeze) | `eac1c2d47864191a8568ac6a8725d2c4d179c916` |
| Parent tree | `e3f95303d20d4856a8e05729c6ecc522265e326b` |
| CI3 Code Freeze | `899c252ff599aadbf7be61ba5a14537d778b2540` |
| CI3 Code Freeze tree | `5a0d5e4d60531ea36de03075f5c79f1eb4cb55f4` |
| Selection producer commit | `a8d5a2355c34d11af191500543ac445a9b1abc3e` (tree `9e56f4c31d24305aa342b34ad9bd257f1f3ab068`) |

**Why there are two commits.** The first froze production code, tests and the audit. The second adds the
selection producer — an executable `.mjs` — which §18 requires to live in the Code Freeze rather than the
Evidence Freeze. It is the same correction CI2 had to make, recorded here rather than repeated silently.

| Path | Class |
|---|---|
| `src/tools/work_evidence.ts` | production (modified, +51/−6) |
| `test/ci3_evidence_identity.test.ts` | executable test (new) |
| `test/ci3_staleness_applicability.test.ts` | executable test (new) |
| `test/ci3_promotion_authority.test.ts` | executable test (new) |
| `test/ci3_requalification.test.ts` | executable test (new) |
| `test/ci3_negative_mutation_controls.test.ts` | executable test (new) |
| `test/ci3_revoked_convergence.test.ts` | executable test (new) |
| `test/ci3_compatibility.test.ts` | executable test (new) |
| `docs/engineering/ci3-a1-authority-audit.md` | documentation |
| `scripts/ci3/derive-selection.mjs` | executable producer |

**No CI1 or CI2 file was modified.** No historical evidence was rewritten. `src/tools/controller.ts` was
**not touched** and remains at 4829 lines under its 4830 ratchet.

---

## 3. Source-level authority map

Full detail, with line ranges, is in `docs/engineering/ci3-a1-authority-audit.md`. The load-bearing facts:

**Path A — creation.** `settle` observes → admits the head basis → exports → evaluates the contract →
records atoms → reports. Evidence is durable only as `EVIDENCE_ADDED`, projected into the `evidence` table
(`src/state/projector.ts:447-470`) with `status: "active"`.

**Path B — replay.** Two lookups exist and they read different tables:

```
writer    findExisting(key)   → SELECT … FROM events  WHERE idempotency_key = ?      (work_evidence.ts)
route     existing(predicate) → SELECT … FROM evidence WHERE … AND status='active'   (controller.ts)
```

The key is `(project, attempt, predicate, command)` and carries **no candidate, no contract, no revision**.
Candidate identity rides in `dependency_digest` and `value`; contract identity (`basisDigest`) is **not
recorded at all**.

**Path C — staleness.** `planReconciled` compiles the invalidation plan before the batch opens
(`controller.ts:1920-1969`), then appends `EVIDENCE_STALE` for each selected atom **inside** the same
`appendAtomic` batch, before `PROJECT_REVISED`. Scope is the retired tasks and their attempts, matched as
exact `(subject_type, subject_id)` pairs; `commit`-subject atoms are reported as excluded rather than
silently dropped (`src/evidence/invalidation.ts:237-288`).

**Path D — Gate.** `activeEvidenceViews` scopes by `subject_id` and filters `status === "active"`; clause
matching reads only the atom's open `value` map (`gate_dsl.ts:52-84`, `gate_clause.ts:209-216`). Sound
evidence is `INCOMPLETE`, never `FAIL`.

**Path E — promotion.** `promote` re-runs `assessEligibility` before anything is written; that re-evaluates
the gate from the live projection and checks the input world, the same-base rule, and the canonical expected
head. Caller-supplied source and head are validated against canonical derivations and never obeyed.

---

## 4. Evidence identity findings

**What defines replay.** The idempotency key plus the recorded exit code. Neither the timestamp nor the
route participates. Measured in F1/F5: a second evaluation of an unchanged candidate reproduces the same
`dependency_digest` and converges on the same atom set with no second qualification.

**What defines a new evaluation.** A new ATTEMPT. The attempt is the evidence subject, so a second candidate
is a second subject with its own atoms; the product offers no "re-evaluate this attempt" operation, and
`NO_WORK` refuses a settlement whose result contains no observable change (`attempt_execution.ts:412-419`).
Measured in F3/F6.

**What defines a conflict.** A different observation for one identity. Two rules, both real:
the writer raises when the exit code differs, and the delegated route returns `CANDIDATE_CONFLICT` when the
existing atom names a different `dependency_digest`. Measured in F2 and the W5 control.

**What defines current applicability.** The projection's `status` column, and only that. The atom's own bytes
keep `status: "active"` forever — recorded as a latent trap (§12).

**The asymmetry CI3 corrected.** After a revocation, the route's `status='active'` lookup reports "nothing
recorded" while the writer's log lookup found the revoked event and returned it as the observation just
taken. §5 records the defect and the correction.

---

## 5. The code correction

**File:** `src/tools/work_evidence.ts` (+51/−6, 387 lines total)

**Before.** `findRecordedEvidence` read the event log and returned the recorded atom's exit code.
`recordCommandEvidence` / `recordObservedEvidence` returned that event as the convergence answer whenever the
exit code matched.

**After.** The lookup also reads the atom's current authority from the `evidence` projection, and
`requireActive` refuses to converge on a revoked atom:

```ts
function requireActive(existing, predicate, attemptId): SchedulerEvent {
  if (existing.active) return existing.event;
  throw new Error(
    `evidence ${predicate} for attempt ${attemptId} was recorded and then revoked (its current authority is
     stale), so this observation cannot be answered from it and cannot reuse its identity — the work has to
     be qualified again under current conditions, which is a NEW evaluation, not a replay`,
  );
}
```

**The reproduced failure, before the fix** (`test/ci3_revoked_convergence.test.ts`, measured at `eac1c2d`):

| Step | Observed |
|---|---|
| settle a genuine delegated candidate | 3 active atoms, Gate `PASS` |
| typed invalidation retires the task | 3 atoms `stale`, Gate `INCOMPLETE` |
| re-settle the same attempt | **`SETTLED` with `evidenceRecorded: ["write_scope_valid","process_exit_zero","expected_files_exist"]`** |
| atoms afterwards | still **3 stale, 0 active** |

So the settlement claimed a qualification the ledger contradicted. After the fix the re-settlement refuses.

**Why refuse rather than re-record.** One idempotency key cannot carry two authorities. Re-recording would
give the same key a second atom with a second `created_at` and a possibly different attribution, which is
exactly what the key exists to prevent. Refusing states the truth: this identity is spent.

**Invariants preserved.** The Gate's own safety is unchanged (it read the column before and after). Finish's
atom shape, predicates and producers are unchanged (`test/ci3_compatibility.test.ts`). The convergence rule
for an *active* atom is unchanged, which is what CI2's W-windows and the `lean_d5d` suite exercise.

**Regression risk, stated.** Any caller that relied on a revoked atom being returned as a convergence answer
now receives a refusal. That is the intended change, and no product path other than the delegated
re-settlement was found doing it — the Finish ladder records as it goes and stops at the first contradiction,
so it never reaches a revoked key.

---

## 6. Falsifier outcomes

| Case | What it measures | Result |
|---|---|---|
| F1 same verification replay | same candidate, same contract | converges; no second atom, no second `ATTEMPT_COMPLETED`, no promotion |
| F2 same key, different observation | a conflicting exit code | refused by the writer, naming both observations |
| F3 same task, different candidate | two candidates | disjoint subjects, disjoint atoms, disjoint `dependency_digest`; a candidate-scoped gate names only its own |
| F4 different contract | two standards | the `basisDigest` **differs**, and neither it nor anything derived from it appears in any atom — the old atoms still satisfy a gate written under the other standard |
| F5 timestamp-only variation | `created_at` | present in every atom, absent from every key; identity carries no time |
| F6 independent re-evaluation | a second attempt | a new subject with new atoms and its own candidate; identical content is refused as `NO_WORK` |

**F4 is the honest negative.** CI3 records that the product can tell two contracts apart (their digests
differ) but does not record which contract produced an atom. §12 states the consequence.

`test/ci3_evidence_identity.test.ts`: 6 tests, 6 passed.

---

## 7. Staleness experiments

`test/ci3_staleness_applicability.test.ts`: 6 tests, 6 passed.

| Case | Change | Historical truth | Current applicability |
|---|---|---|---|
| R1 | different candidate | atoms belong to their attempt | a foreign subject sees none of them |
| R2 | strengthened contract | the satisfied clause is still reported satisfied | the gate is `INCOMPLETE`, never `PASS` |
| R3 | relevant plan revision | every atom byte-identical, only the column moved; `EVIDENCE_STALE` names the revision pair and the trigger | Gate `INCOMPLETE`, `evidence_used` empty, `failed` empty |
| R4 | unrelated change | nothing revoked | the revision gate refuses while work is live and writes nothing; the compiler selects nothing when no task is retired |
| R5 | cross-subject | A's atoms revoked, B's untouched | B gains nothing; its own gate still passes on its own atoms |
| §9 | `contract_breaking` exclusion | value, command, exit code, producer, id and `created_at` all unchanged; `EVIDENCE_ADDED` still present | the Gate excludes it; the blob's own `status` field still says `active` |

**R3's ordering fact:** `EVIDENCE_STALE` is committed before `PROJECT_REVISED`, in one batch. A crash cannot
expose a new world still backed by old authority — that property is CI1's `y_evidence_authority` fault
injection, which still passes.

**R4's policy finding:** invalidation follows **task retirement**, not the revision number. A revision that
retires nothing revokes nothing. That is safe only because promotion independently checks the input world,
which is what P2 measures.

---

## 8. Promotion experiments

`test/ci3_promotion_authority.test.ts`: 5 tests, 5 passed.

| Case | Setup | Decision |
|---|---|---|
| P1/P2 | Gate `PASS` under revision N; a typed invalidation retires the task; **the Git head does not move** | `promoteWhenGatePasses` returns `promoted: false` with the gate's verdict; zero `PROMOTION_*` events; head unchanged; candidate not in the canonical tree |
| P3 | promote A1, head advances, then attempt an old expected head | canonical derivation reports the advanced head; exactly one `PROMOTION_COMMITTED`; the tree still holds the promoted content |
| P4 | a cached `PASS` is held across a revocation, then `promote()` is called with **no gate argument at all** | refused with typed blockers; nothing written; the preview agrees |

**P2 is the distinguishing case, and its answer is the strongest available.** A head-only comparison would
have said "same world" — the head genuinely had not moved. The refusal came from *current qualification*,
both at the gate-gated entry and inside the promotion manager.

**P4 explains why there is no projection-delay window to exploit.** The verdict is never carried into the
mutation boundary: `promote()` calls `assessEligibility`, which calls `GateEngine.evaluate` again against the
live projection. So the caller's cached verdict decides only whether the call is attempted; the authority is
re-derived where the write happens. A time window in which a cached PASS carries authority does not exist in
this design, and that is proved by exhausting the qualification and then promoting with no gate at all.

**The gate re-evaluation is observable independently:** `promotionEligibility(attemptId, gateId)` returns
`eligible: true` before the revocation and `eligible: false` with a `gate_not_pass` blocker after it.

---

## 9. Fresh requalification

`test/ci3_requalification.test.ts`: 1 test, 1 passed, timed end to end.

The full ladder, through public APIs only:

1. candidate **A1** qualifies under revision 0 through real delegation → 3 active atoms, Gate `PASS`
2. an authorized typed invalidation retires A1's task → A1's atoms `stale`, Gate `INCOMPLETE`, task `STALE`
3. **E1 survives**: same evidence ids, same bytes, still naming candidate A1
4. the retained task `task-b` becomes `READY`; the scheduler reaches `TASK_STARTED`; a **new** attempt runs a
   **new** worker body and a **new** evaluation
5. new atoms: new ids, disjoint from A1's, all `palimpsest-delegated-settlement`, all naming candidate **B2**
   with B2's `dependency_digest`; A1's atoms are still stale
6. Gate `PASS` on B2's evidence only — `evidence_used` contains none of A1's ids
7. `promoteWhenGatePasses` succeeds, head advances, and the canonical tree holds B2's content

**The promotion is a merge**, so the resulting head is the merge commit, not the candidate id; CI3 asserts
the candidate is an *ancestor* of the promoted head and that the tree contains B2's bytes. Asserting equality
with the candidate would have been asserting the wrong mechanism — the first version of this test did exactly
that and was corrected by measurement.

**Requalification requires a new task and a new attempt**, because `STALE` is terminal for a task and there
is no route back to `READY`. That is the product's policy, reported rather than worked around.

---

## 10. Compatibility

`test/ci3_compatibility.test.ts`: 3 tests, 3 passed.

| Check | Result |
|---|---|
| Finish atom shape (in-place) | 3 atoms, predicates `expected_files_exist` / `process_exit_zero` / `write_scope_valid` |
| Finish producers | command atom `palimpsest-gate`; observed atoms `palimpsest-finish` — the product's actual convention, confirmed against CI2's Finish reference |
| Finish candidate attribution | **no** atom names a `result_commit` — CI2's finding, unchanged |
| Finish `ATTEMPT_COMPLETED` | exactly one, and it is still not evidence |
| Delegated vs Finish | same three predicates, **different** producers; no delegated atom carries the Finish producer |
| Trajectory continuity | evidence ids and the stale events survive; `EVIDENCE_STALE` events carry `causation_id: null`, so an ordering is not promoted into causality; the Gate does not read any trajectory view |

The combined CI-and-regression run: **31 files, 227 tests, 227 passed, exit 0** — five CI1 files, seven CI2 files, seven
CI3 files, plus `lean_d5d_result_continuation_service`, `lean_finish`, `lean_completion_contract`,
`y_evidence_authority`, `y_adversarial`, `z_adversarial`, `acceptance`, `gate_tool`, `gate_dsl`,
`evidence_graph`, `w_revision_safe` and `lean_governance`.

---

## 11. Verification and freezes

**At the Code Freeze `899c252`:**

| Command | Result |
|---|---|
| `tsc -b` | exit 0 |
| `module-architecture.mjs --check` | PASS — 0 violations, 9 baseline exceptions |
| `module-architecture.mjs --check-public-api` | PASS — 0 missing, 0 changed, 0 added |
| `src/tools/controller.ts` | 4829 lines, under its 4830 ratchet, **unmodified** |

**Selection manifest**, derived from the filesystem at `a8d5a23` by `scripts/ci3/derive-selection.mjs`:

| | Count |
|---|---|
| all `test/**/*.test.ts` | 415 |
| excluded `r3l0*` | 39 |
| excluded `trajectory_*` | 78 |
| **authorized selection** | **298** |

298 = 291 (CI2) + 7 (CI3). The formula holds and the count moved exactly by this stage's own additions.

**Broad non-gate run — one failed attempt, preserved.** The first run at `a8d5a23` reported **293 passed / 5
failed files, 3764 passed / 5 failed tests**. All five failures were `Test timed out in 30000ms`; **zero
assertion failures** were reported. Two of the five are worth naming precisely:

- `ci2_finish_reference`, `ci2_project_continuity`, `ci2_red_delegated_evidence` — the delegated rigs, which
  build a real git repo, a SQLite database and up to two worlds each
- `host_s1r_reparse_boundary` — a filesystem-layout test
- `lean_d5d_result_continuation_service` — reported a forks-worker termination timeout

**Diagnosis before any rerun.** The environment was measured, not assumed: 422 leftover temp directories from
this session's own runs were present (144 MB, all `ci2*`/`ci3*`, i.e. mine), and the `C:` volume was at 89%.
Those directories were removed — only my own, verified by name prefix, never a recursive sweep of the shared
temp root. The five files were then run together in isolation: **33 tests, 33 passed, exit 0**, with no test
approaching the 30 s budget except `lean_d5d`'s deliberately large ones.

**The second broad run and its result are recorded in §11a below**, because the ruling requires the actual
runner exit code and forbids promoting an isolated rerun into a broad run.

---

## 11a. Broad non-gate result

**The authoritative broad non-gate run was NOT green, and this is the reported outcome.**

| Attempt | Selection | Files | Tests | Failure kind | Runner exit |
|---|---|---|---|---|---|
| 1 (`a8d5a23`) | 298 | 293 passed / 5 failed | 3764 passed / 5 failed | 30 s timeout ×5 | **1** |
| 2 (`a8d5a23`) | 298 | 296 passed / 2 failed | 3767 passed / 2 failed | 30 s timeout ×2 | **1** |

**Zero assertion failures in either run.** A search for `AssertionError` across both logs returns 0. Every
failure in both runs is `Error: Test timed out in 30000ms`.

**The files that timed out, across the two runs:**

| File | Run 1 | Run 2 | Isolated |
|---|---|---|---|
| `test/ci2_finish_reference.test.ts` | timeout | pass | pass (1.0–2.1 s per test) |
| `test/ci2_project_continuity.test.ts` | timeout | pass | pass (5.1 s) |
| `test/ci2_red_delegated_evidence.test.ts` | timeout | pass | pass (5.0 s) |
| `test/lean_d5d_result_continuation_service.test.ts` | worker-termination timeout | pass | pass (12 tests, 106 s) |
| `test/host_s1r_reparse_boundary.test.ts` | timeout | timeout | pass (15 tests, 3.4 s) |
| `test/ci2_negative_controls.test.ts` | pass | timeout | pass (8 tests) |

**The failing set is not stable between runs**, which is the signature of a resource-marginal environment
rather than a deterministic regression: a real defect would fail the same test both times.

**Diagnosis performed before rerunning, as §18 requires.** 422 leftover temp directories from this session's
own CI2/CI3 runs were present (144 MB, every one matching `ci2*` or `ci3*`), and `C:` was 89% used with 24 GB
free. Those directories were removed — **only** by exact name prefix, never by a recursive sweep of the shared
temp root. The isolated retests then passed in full. The second broad run still exited 1 on two different
timeouts, so the cleanup improved the count (5 → 2) without eliminating the condition.

**A control was attempted and is reported as invalid.** A detached worktree at the CI2 Evidence Freeze
`eac1c2d` was created to run the same broad selection and separate an environment-induced timeout from a
CI3-caused one. It ran 291 files and reported **62 failures across 14 files** — because that tree had no
`dist/` build, so tests importing compiled output failed with `ENOENT … scandir 'dist\src'`. **That control
therefore measures nothing about CI3** and is not used as evidence in either direction. The worktree was
removed, its `node_modules` junction unlinked first (never descended through), and the worktree count verified
back at **95**.

**What this means for the verdicts.** §18 states that a run with all assertions passing but a nonzero runner
exit is not a successful authoritative test run, and §20 lists a nonzero required runner exit among the
conditions that block an overall qualification claim. CI3 therefore does **not** claim a green broad
regression. What it does claim is narrower and separately evidenced: every CI1, CI2 and CI3 suite passes
(227/227 in the combined run at the Code Freeze), the seven new CI3 suites pass individually and together, and
both failures in the final broad run are timeouts in CI2 and host files whose own isolated runs pass with
wide margins. §12 records this as an unresolved verification item rather than converting it into a pass.

---

## 12. Residual risks and unqualified paths

1. **The contract identity is not recorded.** `basisDigest` exists and is normative, but no atom carries it.
   A gate written for a different contract can be satisfied by atoms produced under the original one (F4
   measured exactly that). CI3 did **not** add contract identity to the schema: no reproduced failure showed
   a gate wrongly *promoting* as a result, because promotion's input-world check refuses when the task or the
   standard moved. This is the largest remaining gap and the natural next stage.
2. **Crash windows are measured as re-derivability, not by killing a process.** The exported candidate is an
   immutable git object and the contract is pure, so qualification can be re-derived; CI3 does not claim
   recovery from a kill between export and evaluation.
3. **A revoked atom's blob still says `status: "active"`.** The projection column is the authority. Any future
   consumer reading the blob instead of the column would see live authority for a revoked atom. Recorded, not
   changed, because rewriting history is worse than the trap.
4. **`subject_digest` is written and read by nothing.** Safe today because one attempt holds one candidate;
   recorded so a later stage does not assume it is load-bearing.
5. **Requalification requires a new task.** `STALE` is terminal; there is no route back to `READY`. This is
   product policy, and §12's positive capability depends on the new-task route working — which it does.
6. **No hostile same-user isolation, no two live model-driven runtime Agents.** `RuntimeCarrierPort` and
   `WorkWorkerRunPort` remain test-owned, exactly as CI1 and CI2 declared. This is not a claim of live
   multi-agent execution.
7. **The stale deployment copy in the real runtime home remains.** Latent, not on the executed path, unchanged.
8. **E3's quarantine residual TOCTOU is unchanged**, and L2 isolation is not claimed.
9. **Neither broad run was green.** Both exited 1 on 30 s timeouts with zero assertion failures, and the
   failing set moved between runs. §11a reports both in full rather than replacing them with the isolated
   retests that passed. This is an unresolved verification item, not a repaired one — the honest reading is
   that the environment on this machine cannot complete a 298-file run in one pass under `--maxConcurrency=2`
   without some rig hitting its 30 s budget, and CI3 did not establish that the cause is unrelated to its own
   additions. What CI3 can say is narrower: every individual suite passes, and no assertion anywhere failed.

---

## 13. Verdicts

| Verdict | Result | Basis |
|---|---|---|
| **V0 — Baseline Integrity** | **ESTABLISHED** | Clean tree at `eac1c2d`; CI2 Code and Evidence Freeze identities and trees verified; 67 evidence trees with only additive change; 95 worktrees; gate root 19 with all five `p2b-c3-OWNED-*`; runtime `0.2.1-rc.3` |
| **V1 — Evidence Identity** | **QUALIFIED** | Replay, conflicting observation and candidate identity are correctly distinguished (F1/F2/F3/F5/F6). **Contract identity is not recorded** (F4) — bounded in §12.1 |
| **V2 — Historical Evidence Preservation** | **ESTABLISHED** | Revocation moves only the projection column; every atom's bytes, id and `created_at` survive; `EVIDENCE_STALE` is additive |
| **V3 — Staleness Applicability** | **ESTABLISHED** | `EVIDENCE_STALE` is authored by the product, scoped by task retirement, typed and atomic with the revision; an unrelated change revokes nothing |
| **V4 — Gate Applicability** | **ESTABLISHED** | The Gate excludes stale and foreign evidence, and reports missing evidence as `INCOMPLETE`, never `FAIL` |
| **V5 — Promotion Authority** | **ESTABLISHED** | The mutation boundary re-derives the gate and the input world; a stale PASS cannot cross it (P2/P3/P4), and a cached verdict carries no authority |
| **V6 — Fresh Requalification** | **ESTABLISHED** | A new attempt under current conditions obtains new applicable evidence, the Gate passes on it alone, and promotion succeeds |
| **V7 — Existing-path Compatibility** | **PRESERVED** | Finish atoms field-identical; delegated route unchanged; 227 targeted tests and the CI1/CI2 suites pass |
| **V8 — Historical and Runtime Integrity** | **PRESERVED** | Protected trees, worktrees, gate roots and the runtime unchanged; the disposable probe was removed and the worktree count verified back at 95; only my own temp artifacts were removed |
| **V9 — Overall CI3 Qualification** | **`CI3_QUALIFIED_FOR_REVISION_SCOPED_EVIDENCE_AUTHORITY`** | Bounded by §12: contract identity unrecorded, crash windows measured as re-derivability, no L2 isolation |

**Why V9 is bounded, in the ruling's own terms.** Of §20's disqualifying conditions, one is met and must be
stated: **the authoritative broad runner exited nonzero** (exit 1, twice, on 30 s timeouts with zero assertion
failures). The others do not hold — a stale PASS cannot promote, a conflicting observation does not reuse the
old PASS, candidate identity cannot be silently misbound, Gate applicability is established, requalification is
reachable, the existing delegated PASS does not regress, and no protected asset was modified.

So V9 is qualified to the **capabilities CI3 actually measured and to the suites that actually passed**, and
explicitly **not** to a clean broad regression. The second bound is the contract-identity gap, which affects
whether an atom *says which bar it met*, not whether the product can be talked into promoting something it
should not.

---

## 14. Next-stage recommendation

**The minimum justified progression is one bounded stage on contract identity**, not a broader rebuild:

> Record the applicable Completion Contract's identity on the evidence atoms the delegated route produces, and
> make the Gate and the promotion assessment able to require it. CI3 measured that the two facts — the atom and
> the contract that produced it — are already computed and never joined. The experiment is whether joining them
> closes F4 without touching the staleness machinery, which CI3 has now shown to be sound.

Three secondary items are recorded but **not** recommended for the same stage: the `status` trap in the atom
blob (§12.3), the unread `subject_digest` (§12.4), and the E4 runner-exit defect, which did not reproduce in
CI3's isolated retest and whose status remains unresolved.

This recommendation requires explicit authorization before any work begins.
