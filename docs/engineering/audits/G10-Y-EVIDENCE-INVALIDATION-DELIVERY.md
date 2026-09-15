# G10-Y — Delivery report

Stage: **Canonical Work-Evidence Invalidation & Atomic Gate Authority**.
Baseline: `orangeofcarl0-sys/palimpsest` `main @ 189fcd005885d1d7fdd40174aa6935783be92da6`.

## 1. What changed

Three source files, additively and narrowly:

**`src/evidence/invalidation.ts`** — added the pure canonical invalidation kernel:
`ActiveWorkEvidence`, `EvidenceSubjectPair`, `EvidenceInvalidationPlan`,
`evidenceInvalidationReason`, and `compileEvidenceInvalidation`. The existing
`computeInvalidationSet` semantics and its change-class table are untouched (§10).

**`src/domain/aggregate.ts`** — added `#validateEvidenceStale` and routed
`EVIDENCE_STALE` to it. Previously `EVIDENCE_STALE` fell through `default: return;`
with **no** admission validation. The validator pins
`payload.evidence_id === entity_id`, existence, project membership, and current
status `active`.

**`src/tools/controller.ts`** — deleted `#staleEvidenceForScope` (the raw
post-commit `UPDATE evidence SET status='stale'`); added the shared
`#evidenceStaleRequest` builder and `#compileEvidenceInvalidation`; compiled the
plan before the batch opens and appended the `EVIDENCE_STALE` events inside the
`appendAtomic` batch, ahead of `PROJECT_REVISED`; routed `invalidateEvidence`
through the same builder.

## 2. Delivered behaviour

```text
planReconciled (typed invalidating revision)
  1. compile the typed EvidenceInvalidationPlan from the pre-mutation projection
  2. appendAtomic:
       TASK_STALE … → EVIDENCE_STALE … → PROJECT_REVISED
                    → TASK_REAUTHORIZED … → TASK_CREATED …
  3. COMMIT  — the new world and the revoked authority land together
```

A crash can now expose only:

```text
complete OLD world: revision r, retired tasks live, revoked Evidence active
        or
complete NEW world: revision r+1, retired tasks STALE, revoked Evidence stale
```

## 3. Behaviour comparison with the baseline

| | Baseline `189fcd0` | G10-Y |
| --- | --- | --- |
| Revocation mechanism | raw SQL after the batch | canonical `EVIDENCE_STALE` inside the batch |
| Crash window | `new ProjectIR + active old Evidence` | none |
| Gate after revision | could still `PASS` on revoked Evidence | cannot consume revoked authority |
| Subject matching | `subject_id` string | exact `(subject_type, subject_id)` pair |
| Admission validation | none | identity + existence + `active` |
| Idempotency binding | `{project_id, evidence_id, reason}` | `+ from_revision, to_revision, change_class` |
| Replay fidelity | status restored by a repair | status is a pure function of the log |
| Event species / migration / table | — | none |

## 4. Proofs

**Real-crash reproduction** — `scripts/audit/y0-cf-w-03-repro.mjs`. The revision
runs in a child process that is `SIGKILL`ed the instant the batch `COMMIT` returns;
the parent reopens the file.

| | pre-fix | post-fix |
| --- | --- | --- |
| classification | `FAIL_OPEN_MIXED_STATE` | `CLOSED_COMPLETE_NEW_WORLD` |
| revision / task-a | `1` / `STALE` | `1` / `STALE` |
| evidence status | `active` | `stale` |
| `activeEvidenceViews` | `[E]` | `[]` |
| gate verdict after revision | `PASS` | `INCOMPLETE` |
| `EVIDENCE_STALE` events | `0` | `1` |

**Test suites**

* `test/y_evidence_authority.test.ts` — 15 tests: atomic ordered closure, gate
  before/after, fault injection at all five checkpoints, retry convergence,
  replay/rebuild/`verifyFull`, unaffected-evidence scope, non-invalidating classes,
  shared manual semantics, identity-conflict fail-closed, immutable history,
  head-only revision, compiler purity, removal-only reason.
* `test/y_adversarial.test.ts` — 28 tests: `Y-N01`…`Y-N30`.

## 5. Local gates

```text
git diff --check                      clean
pnpm build                            clean
pnpm exec vitest run                  149 files / 1385 tests passed
pnpm run build:web                    ok (203 modules)
pnpm exec playwright test             27 passed
scripts/audit/y0-cf-w-03-repro.mjs    CLOSED_COMPLETE_NEW_WORLD (exit 0)
```

Baseline suite size was 147 files / 1342 tests; Y adds 2 files / 43 tests with no
existing test modified.

## 6. Deviations and honest limitations

* **Removal-only revisions** now revoke Evidence for removed runnable tasks, an
  explicit widening of the declared policy (§7 of the spec). It is documented and
  tested, and `G10-Y-EVIDENCE-INVALIDATION-ASSESSMENT.md` §4 records that it is
  currently behaviourally vacuous because only attempt-subject Evidence has a
  production producer and an `ACTIVE`/`VERIFYING` task cannot be removed without a
  change class.
* **Idempotency keys for `EVIDENCE_STALE` changed** (strengthened binding). No
  fixtures encode them; the manual path's key likewise changed. Recorded as an
  intentional semantic strengthening.
* **`commit`-subject Evidence is excluded** from the automatic policy by decision
  (§13), surfaced in `excludedBySubjectType`.
* **CF-Y-01 is not fixed here** — a promotion can still commit for work a revision
  has already retired. Independently reproduced on the untouched canonical
  baseline, so it is pre-existing and out of Y's declared scope.
* **CF-X-01 remains out of scope** by explicit instruction.

## 7. Canonical checkpoint

Recorded after merge.

```text
baseline                        189fcd005885d1d7fdd40174aa6935783be92da6
implementation commit           dbf6fb87f409674791d4461b1b660a5f1c8b5fe7
  "feat(g10-y): canonical work-evidence invalidation & atomic gate authority"
pull request                    #90  experiment/g10-y-evidence-authority -> main
PR checks                       run 35002006422  attempt 1  e2e pass / unit pass
merged commit (canonical main)  9c372b06bda5bc0202d225f8920f3ac5a13bbc58
  "Merge pull request #90 from orangeofcarl0-sys/experiment/g10-y-evidence-authority"
tree identity                   git diff dbf6fb8 9c372b0  ->  EMPTY (identical trees)
canonical main run              35002173071  attempt 1  conclusion: success
```

All remote runs concluded green on **attempt 1**; no rerun was required.

### Reproducing the local gate

```bash
pnpm install
pnpm build
pnpm exec vitest run                # 149 files / 1385 tests
pnpm run build:web
pnpm exec playwright test           # 27 passed
node scripts/audit/y0-cf-w-03-repro.mjs   # classification: CLOSED_COMPLETE_NEW_WORLD
```
