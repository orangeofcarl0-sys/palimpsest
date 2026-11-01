# COG-5 — Engineering Report

**Branch:** `palimpsest-cog5-trustworthy-continuation`
**Incoming baseline:** `924d30414ffd2a7b5f8f6aa297b8a29c9065c8aa` / tree
`1b451532aa07da1f8035fe9f5855b6e62fd5781c`
**C5-0 checkpoint:** `80ea74e39f1f2e37a9aa4bb8975bd7ffec153e09` / tree
`3fe432276772899945f0935edc621db0594cc240`
**Code Freeze:** `af4cb65736d82419b151b3c4eccc75621ee1aea5` / tree
`f854222a300f32bd24e0753398469ca86fd9545c`
**Evidence Freeze / final HEAD:** reported forward in the final answer; a commit cannot contain its own SHA.
**Model:** none. The provider was not called. The budget monitor was not needed and no token claim is made.

---

## 1. The production change

COG-5 made **one bounded product correction**: the verified post-promotion change anchor.

### 1.1 The defect

`src/composition/continuation.ts` compared a result's **origin** source revision to the current source
revision. For a promoted result, that interval includes the result's own accepted output. The assessor then
saw the result's own writes as a later external change:

- a `read_invalidation` conflict against the whole-repository read;
- a `write_collision` against the result's own write footprint.

The packaged face reported `INCOMPATIBLE` for a change that was the result's own effect. COG-4 measured this as
the post-promotion self-collision.

### 1.2 The correction

**New file:** `src/deployment/promotion_lineage.ts`

- `resolvePromotionBaseline()` reads the committed `PROMOTION_COMMITTED` facts for the attempt.
- It returns `NO_SOURCE_RESULT`, `UNPROMOTED`, `PROMOTED` or `UNPROVEN`.
- `PROMOTED` requires exactly one fact, the fact's `sourceCommit` equal to the canonical result commit, and
  Git proving:
  - `resultCommit ⊆ resultingHeadCommit`;
  - `expectedHeadCommit ⊆ resultingHeadCommit`;
  - `resultingHeadCommit ⊆ currentSourceRevision`.
- It uses the **accepted resulting head**, never the result commit by assumption and never the origin.
- `UNPROVEN` becomes an `UNAVAILABLE` source observation, which the assessor already reports as `UNKNOWN`. It
  never falls back to the origin and never fabricates a conflict or a compatibility.
- `gitAncestryProbe()` runs `git merge-base --is-ancestor`; exit 0 is `PROVEN`, exit 1 is `DISPROVEN`, and
  every other outcome (missing object, bad repository, spawn failure) is `UNKNOWN`. An unavailable probe cannot
  make a lineage look proven.

**Modified file:** `src/composition/continuation.ts` — `issueCertificate()` selects the baseline and uses the
accepted head for the `source` change premise. The write premise remains the observed origin-to-result diff.
No other production file changed.

### 1.3 What did not change

- No canonical compatibility enum, `INCOMPATIBLE`, `UNKNOWN`, `COMPATIBLE` or `EXACT`.
- No whole-repository read policy.
- No treatment of `TaskEnvelope.read_paths` as a proof.
- No substitution of empty sets for `UNAVAILABLE` facets.
- No admission rule, promotion rule, head authority, store, scheduler, router, agent runtime or sandbox.
- No model-facing continuation or intake tool.

---

## 2. The RED/GREEN test

**File:** `test/cog5_promotion_lineage.test.ts` — 15 tests.

RED: the suite could not import the missing module (`Cannot find module '../src/deployment/promotion_lineage.js'`).

GREEN: 15/15 pass, including:

- promoted result with no later change → baseline is the accepted head, not the result commit;
- promoted result with later changes → baseline stays the accepted head;
- unpromoted result → origin interval;
- no source result → no lineage question;
- a fact for another attempt → unpromoted;
- multiple facts → unproven;
- source commit mismatch → unproven;
- result not contained in the accepted head → unproven;
- expected head not contained in the accepted head → unproven;
- accepted head not contained in the current source → unproven;
- `UNKNOWN` ancestry → unproven;
- unobservable current source → unproven;
- a real Git graph with a result, an external commit and a merge: the probe proves containment, disproval and
  unknown from the actual graph.

The integration is exercised by the deterministic runs in §4, not only by the unit test.

---

## 3. Verification at the Code Freeze

All commands were run at `af4cb65`; the logs are in `research-evidence/cog5/verification/`.

| check | command | result |
| --- | --- | --- |
| build / TypeScript | `pnpm run build` | **exit 0** |
| architecture ratchets | `pnpm run architecture:check` | **PASS**, 0 violations, 9 accepted baseline exceptions |
| public API | `pnpm run architecture:check-public-api` | **PASS**, 0 missing, 0 changed kind, 0 added |
| targeted batch 1 | `npx vitest run <10 files> --maxWorkers=1` | **10 files, 161 tests, 0 failed, exit 0** |
| targeted batch 2 | `npx vitest run <9 files> --maxWorkers=1` | **9 files, 98 tests, 0 failed, exit 0** |
| targeted total | 19 files | **259 tests, 0 failed** |

The targeted selection is fixed and documented:

- `cog5_promotion_lineage` (new);
- `lean_world_basis_runtime`, `lean_cross_basis_composition`, `lean_cross_basis_admission`,
  `lean_compatibility`;
- `lean_d5a_continuation_assessment`, `lean_d5d_result_continuation_service`,
  `lean_d5b2_governed_rework`, `lean_d5c1_head_sync_composition`, `lean_d5c2_prior_result_context`,
  `lean_d5c3_current_basis_reexecution`, `lean_d3d_composition`;
- `lean_delegation_runtime`;
- `ci1_stale_and_duplicate`, `ci3_staleness_applicability`, `ci3_promotion_authority`,
  `ci3_requalification`;
- `trajectory_p2d1_currentness`, `e2i_intent_reconciliation`.

The broad suite was **not run** in COG-5. No broad pass is claimed. The targeted 259-test run is the
authoritative mechanism verification. The COG-4 broad partial record remains visible and is not reclassified.

Node is `v24.14.1`; pnpm reports an engine warning because the package wants `>=24.15.0`. The warning is
recorded; the build and tests succeeded.

---

## 4. The deterministic experiment

The experiment is test-owned and outside the real repository:

- `scripts/cog5/rig5.mjs` — the test-owned world, the deterministic worker, the install, the packaged
  inspection and the labelled expert diagnostic;
- `scripts/cog5/run_cog5.mjs` — the `main`, `newsletter` and `outofscope` scenarios;
- `scripts/cog5/scenario/**` — the Sablewick sources, the completion check and the two immutable candidates.

The worker is a deterministic `WorkWorkerRunPort`, **not** a model and **not** the DSH subprocess worker. It
runs in-process. The host read fence was characterized from the shipped code but was not exercised by this
worker.

### 4.1 The runs

| run | purpose | status |
| --- | --- | --- |
| `main` | lawful intake → promotion → head reconciliation → governed rework → D2 execution → promotion | **complete, 0 errors** |
| `newsletter` | unrelated-change control: packaged whole-repository overlap vs expert precise read set | **complete, 0 errors** |
| `outofscope` | unapproved-write control judged by the completion contract | **complete; settlement `NOT_READY` / `OUT_OF_SCOPE`** |

The main run's durable events and worktree evidence are preserved. The final control deliberately moved only
the live head to `07ca355`; the project head remains `42a8ab4`. This is an intentional negative control, not a
broken final state.

### 4.2 Rig defects found and fixed before the Code Freeze

These were test-owned bugs, not product defects, and are disclosed for reproduction:

1. `controller.promote()` is asynchronous; the first rig captured it synchronously, so the promotion never
   completed. Fixed with `captureAsync`.
2. After the rework job settled, the rig did not call `controller.step()`, so the task stayed `ACTIVE` and
   promotion was refused with `task_not_verifying`. Fixed; the product's behavior was correct.
3. The first comparison of the accepted vendor file used the checked-out working tree, which Git EOL-normalizes
   on Windows. The evidence now compares the **committed blob** and records both.
4. A fresh run directory was needed when Windows held a lock on a previous run directory. This is a test
   harness fact, not a product failure.

None of these changed a product path. The final runs were executed after the fixes, before the Code Freeze.

---

## 5. Freeze discipline and evidence

- One development branch, created from the exact COG-4 final commit.
- C5-0 committed the preflight, the two rulings and the baseline/architecture report.
- Code Freeze `af4cb65` contains all executable product, test, experiment and scenario code.
- No executable change after the Code Freeze. The results reports and evidence are documentation/evidence only.
- The outcomes extractor (`F:\Codex_Work_Space\Palimpsest\.cog5-rig\make_outcomes.mjs`) is **outside the
  repository**; it read the immutable run artifacts and wrote `research-evidence/cog5/outcomes.json`. It
  changed no product or experiment path and is not part of the frozen tree.
- Evidence Freeze is the commit adding the reports and `research-evidence/cog5/**`; its SHA is reported
  forward.
- No force-push, no `main` move, no PR, no tag, no branch deletion, no worktree prune, no lock removal, no
  `gc --prune=now`, no `clean -fdx`, no historical freeze amendment, no evidence rewrite.
- The 95 worktree registrations, 2 locks, 19 gate roots and 72 pre-existing evidence trees were untouched;
  `cog5` is the 73rd evidence tree.

---

## 6. Reproduction

```bash
# deterministic lawful intake + executable continuation
node scripts/cog5/run_cog5.mjs --scenario=main --run=../.cog5-rig/main

# unrelated-change control
node scripts/cog5/run_cog5.mjs --scenario=newsletter --run=../.cog5-rig/newsletter

# unapproved-write control
node scripts/cog5/run_cog5.mjs --scenario=outofscope --run=../.cog5-rig/outofscope

# the corrected anchor's unit suite
npx vitest run test/cog5_promotion_lineage.test.ts --maxWorkers=1

# authoritative checks
pnpm run build
pnpm run architecture:check
pnpm run architecture:check-public-api

# the fixed targeted mechanism set
npx vitest run test/cog5_promotion_lineage.test.ts test/lean_world_basis_runtime.test.ts \
  test/lean_cross_basis_composition.test.ts test/lean_cross_basis_admission.test.ts \
  test/lean_compatibility.test.ts test/lean_d5a_continuation_assessment.test.ts \
  test/lean_d5d_result_continuation_service.test.ts test/lean_d5b2_governed_rework.test.ts \
  test/lean_d5c3_current_basis_reexecution.test.ts test/lean_d3d_composition.test.ts \
  test/lean_d5c1_head_sync_composition.test.ts test/lean_d5c2_prior_result_context.test.ts \
  test/lean_delegation_runtime.test.ts test/ci1_stale_and_duplicate.test.ts \
  test/ci3_staleness_applicability.test.ts test/ci3_promotion_authority.test.ts \
  test/ci3_requalification.test.ts test/trajectory_p2d1_currentness.test.ts \
  test/e2i_intent_reconciliation.test.ts --maxWorkers=1
```

All paths are explicit or derived from the run directory. No owner home, credential or real repository is
read or written by the experiment.

---

## 7. Limitations

1. No model was used. The results are mechanism results, not cognitive or comparative results.
2. The deterministic worker is an in-process test port; it is not the DSH subprocess worker, so the host read
   fence was not exercised by this run.
3. The packaged first-party face cannot produce a positive `COMPATIBLE` for a changed source world. The
   expert `COMPATIBLE` uses test-owned precise reads and empty facet observations.
4. `TaskEnvelope.read_paths` is not enforced. In this run it was `["src"]` while the worker read `sources/*`;
   the declaration is not a boundary and was factually wrong.
5. The asset, environment and project-semantic change domains remain `UNAVAILABLE`; no empty-set substitution
   was made. Exempting `NOT_REQUIRED` facets from change coverage would be a semantic refinement requiring
   owner review.
6. The completion contract narrowed out the standard command for the documentation/data write scopes. The
   evidence is write scope + required artifact; no command pass is claimed.
7. No fresh-session model trial was run. The durable state is present; COG-4's P Session remains the
   fresh-session evidence.
8. The broad test suite was not run; no broad pass is claimed.
9. The final control intentionally leaves the live head ahead of the project head. That is the preserved
   negative case, not a reconciled final state.
10. The route is Git-specific at the canonical-source layer.

---

## 8. Identities

| item | value |
| --- | --- |
| Incoming HEAD / tree | `924d30414ffd2a7b5f8f6aa297b8a29c9065c8aa` / `1b451532aa07da1f8035fe9f5855b6e62fd5781c` |
| Development branch | `palimpsest-cog5-trustworthy-continuation` |
| C5-0 checkpoint | `80ea74e39f1f2e37a9aa4bb8975bd7ffec153e09` / `3fe432276772899945f0935edc621db0594cc240` |
| Code Freeze | `af4cb65736d82419b151b3c4eccc75621ee1aea5` / `f854222a300f32bd24e0753398469ca86fd9545c` |
| Evidence Freeze | the commit adding this report and `research-evidence/cog5/**`; SHA reported forward |
| Production files changed | `src/deployment/promotion_lineage.ts` (new), `src/composition/continuation.ts` (modified) |
| Test added | `test/cog5_promotion_lineage.test.ts` |
| Experiment added | `scripts/cog5/**` |
| Historical refs unchanged | `origin/main` `044330b`, local `main` `67b29c9`, COG-4 final `924d304` |
| Protected resources | 95 worktrees, 2 locks, 19 gate roots, 72 pre-existing evidence trees, 0 stashes |
| Model / provider | none used |
| Targeted tests | 19 files / 259 tests, 0 failed |
| Build / architecture / public API | exit 0 / PASS 0 violations, 9 exceptions / PASS 0/0/0 |
