# S01 — Result transfer and evidence qualification: root cause and correction

## 1. What the C6-R record actually says

| Fact | Value | Source |
|---|---|---|
| Reported `resultCommit` from the model | `f1536b8` (short) | `research-evidence/c6r/runs/c6r-005/operator-review.json` (`agentProposal.report.resultCommit`) |
| Stored `ATTEMPT_COMPLETED` report `result_commit` | `f1536b861f57e150f6b5609cc52a0f6d5416907e` (full) | Same file, event 37 dump embedded in the tool result |
| `PROMOTION_PREPARED` source | full result commit | C6-R ledger listing |
| Ordarium operation | `op_d0dede47300aeb87dc28b8809441a01a2ff66e85`, state `uncertain`, reason `execution-threw-after-dispatch`, attempts 4 | `recovery-report.json` |
| Overlay head after recovery | `e7eeb903476dc60c598a1824728da567d0944b4d` (unchanged) | `recovery-report.json` |
| Work state | `technical-refresh` VERIFYING | `recovery-report.json` |

## 2. Attribution (tested, not narrated)

The "short resultCommit caused the uncertain promotion" claim is **false as stated**:

1. `controller.report` observes the execution world and overwrites the caller's `resultCommit` with
   the world HEAD (`src/tools/controller.ts`, report path). The stored report is full.
2. The attempt ran in a `--shared` world: `.palimpsest/worlds/<attemptId>` owns the new commit
   object; the canonical repository borrows only the base objects through `alternates`.
3. The **legacy report path never exported** the world's result object into the canonical ODB.
   The delegated settlement path already did (`src/work/attempt_execution.ts`, export before
   report), which is why the same shape did not fail there.
4. `PromotionManager.promote` then invoked `git merge` in the canonical repository. The merge
   could not resolve the source object, failed **after dispatch**, and Ordarium classified the
   operation `uncertain` with `execution-threw-after-dispatch`.
5. Recovery ran Ordarium's reconcile query: the source was not contained, the head still equalled
   the expected head, so `absent/retrySafe` was returned and the merge was retried — with the same
   unreadable object. It stayed uncertain. This is the observed `"promotion stays uncertain after
   reconciliation"`.

So the identity was **full in the ledger and unreadable in the object database**. Those are
different facts; the short caller input was a red herring.

## 3. Correction (forward-only)

### 3.1 Result export on every report path

`ProjectController.report` and `reportLate` now call `#exportAndResolveResultCommit` before the
ledger append when a completed attempt has an observed HEAD:

- object-only `git fetch --no-tags <world> HEAD` into the canonical repository (no refspec
  destination, no ref move, no working-tree change, no project revision);
- `git cat-file -e <commit>^{commit}` readability proof;
- `git rev-parse --verify <commit>^{commit}` to record the **full** object identity (works for
  any repository object format; no hard-coded 40-character assumption);
- in-place attempts skip the export (their object is already canonical) and still resolve;
- failure throws `RESULT_NOT_EXPORTED`, leaving the attempt un-completed and the world intact.

The execution-world port gained a synchronous spelling (`exportResultCommitSync`) for this caller;
the asynchronous method delegates to the same code, so there is one import algorithm.

### 3.2 Uncertain promotion recovery

No ledger edit and no blind retry were performed on the historical C6-R record. The product
correction makes a future recovery possible when the object is readable: `reconcileAll` drives the
same Ordarium operation, whose reconcile query re-checks the head and source and re-executes only
when it is safe. `test/pc1_result_integrity.test.ts` reproduces the exact shape (full OID in the
report, object missing from the canonical ODB, merge failure, uncertain operation), restores the
object through the same object-only export, and observes a terminal `committed` recovery and an
advanced canonical head.

### 3.3 Evidence producers

Measured in the same P1 session: the model ran `node verify.mjs` three times and recorded it as
`tests_pass`, `write_scope_valid`, and `expected_files_exist`. The release gate then passed.

`controller.gate` now treats structural predicates as **product observations**:

- `write_scope_valid` is derived from the attempt's observed changed files versus the envelope's
  `write_paths`; an out-of-scope tree is refused (`STRUCTURAL_OBSERVATION_FAILED`) and **no atom**
  is written;
- `expected_files_exist` is derived from the attempt's tree and the declared artifacts; a missing
  artifact is refused and no atom is written;
- successful atoms have `command: null`, `exit_code: null`, the real changed-file/path values, and
  `producer: "palimpsest-gate"`;
- process predicates keep the existing behaviour: the product executes the authorized command and
  records the exit code it observed.

Historical atoms are not rewritten. A gate that passed on the old atoms remains a historical fact;
new qualification uses the new producer.

## 4. Tests

`test/pc1_result_integrity.test.ts` (6 tests, real Git + real world port):

- full OID recorded from a short caller input; canonical ODB can read it; canonical HEAD unmoved;
- promotion to canonical head in the same session;
- uncertain promotion recovery after object restoration;
- completed result with a missing world is refused, not recorded;
- forged structural predicate via an unrelated command is refused, no evidence;
- genuine structural observation is recorded with the tree values and can PASS a real gate;
- missing artifact structural observation is refused.

Adjacent regression: `gate_tool`, `acceptance`, `promotion`, `h1_recovery`, `lean_finish_integrity`
(38 tests) all pass. The old `gate_tool`/`acceptance` cases that used a caller command to satisfy
`write_scope_valid` were updated to the new, stricter semantics; structural-gate PASS coverage moved
to the real-tree test.

Log: `research-evidence/pc1/s01/regression.log`.

## 5. Residual limits

- The historical `op_d0dede…` operation is not repaired in place; it remains evidence of the old
  path. Recovery of that exact database would need its world object restored first.
- `reconcileAll` still reports `blocked` when Ordarium itself cannot prove the effect. That is
  correct: no fabricated terminal state.
- The export uses the first-party local Git world. A different backend must implement the same
  object-availability contract; the port shape is the contract.
