# COG-4 — Engineering Report

**Branch:** `palimpsest-cog4-state-synthesis`
**Incoming baseline:** COG-3 final HEAD `ef9d8e3ac1ee4cb21750749e0b526291c527fe65` (tree
`d08a2ab53c670941138dc23437c2e073216c51c0`)
**Code Freeze:** `0e04becff68c68118bf99c7c9d6bac3c77dd0f33` (tree
`4f6c0677a13c96961c3a1f501372f5f2110f0d72`)
**Model / runtime:** `deepseek-official/deepseek-flash` / DSH `0.2.1-rc.3`, Node `v24.14.1`
**Evidence:** `research-evidence/cog4/` (mechanism run, P Session, contaminated F diagnostic, blocked F,
verification logs, scores, capability matrix, manifest)

The Evidence Freeze commit cannot contain its own SHA. It is the commit that adds this report and the
evidence tree; the actual SHA is reported forward in the final answer and in the Git history.

---

## 1. No production code changed

COG-4 made **no production change**. The source audit found capability gaps (packaged whole-repository
compatibility, no model-facing continuation/Intent tools, the live-head/canonical-head divergence), but
none was a bounded presentation defect of the kind COG-3 fixed. Fixing the packaged read footprint or
adding a model-facing continuation tool would change semantic authority or add a new product surface; the
evidence did not justify either as a minimal correction. The stage therefore ends with **no production
code change**, which the ruling explicitly permits.

The only files added are experiment-owned:

| path | purpose |
| --- | --- |
| `scripts/cog4/budget.mjs` | real-usage budget monitor |
| `scripts/cog4/budget_selftest.mjs` | 11-case simulated proof |
| `scripts/cog4/audit_measurement.mjs` | forward-only COG-3 measurement audit |
| `scripts/cog4/rig4.mjs` | test-owned world, deterministic Work worker, packaged/expert continuation, session decoding |
| `scripts/cog4/run_work_result.mjs` | real Work Results, promotion, four outcomes, rework, negative controls |
| `scripts/cog4/run_fresh.mjs` | fresh DSH P/F session trials with the budget monitor |
| `scripts/cog4/inspect_state.mjs` | read-only discovery probe |
| `scripts/cog4/scenario/**` | Sablewick sources, updates and the test-owned completion check |
| `docs/engineering/COG4-EXPERIMENTAL-PROTOCOL.md` | pre-registered protocol |
| `docs/engineering/COG4-*.md` | baseline/measurement, capability, cross-basis, fresh-agent, comparative, engineering and final reports |

No core TypeScript, tool contract, ProjectIR, store, owner, authority or lifecycle changed. No new runtime,
router, ticket database, scheduler, memory store, LayerFS dependency or verification authority was added.
`pnpm run architecture:check` reports 0 violations and the same 9 accepted baseline exceptions;
`pnpm run architecture:check-public-api` reports 0 missing, 0 changed, 0 added.

---

## 2. The experiment rig, in one paragraph

The rig builds a test-owned Git repository containing a small supplier-selection programme, installs the
real product over it, seeds a project and journal, and drives two tasks through the real D2-d work
delegation with a deterministic worker. The worker writes one deliverable and commits it; the product
observes the change, evaluates the completion contract, exports the result commit and settles
`ATTEMPT_RESULT`. The rig then applies two external source updates with an **explicit staged-path
allowlist**, inspects the results through the packaged continuation service, and separately through the
same D3 kernel with a test-owned instrumented read set. It executes one normal promotion and one governed
rework. The fresh P Session uses a new DSH home and a new project profile pointed at the same durable state
and repository; the fresh F Session uses a Git clone with `.palimpsest/` removed and a Markdown handoff.

The worker is deterministic and labelled as such. It is not a model, and no claim about model cognition is
made from the deterministic Work results.

---

## 3. The F-world contamination and its correction

The first F world was cloned from the live P repository **after** the P Agent committed its continuation
note. The F note was therefore a copy of the P note and is not independent. The run is preserved as
`runs/F1-contaminated/` with `INVALID.json` and excluded from scoring.

`run_fresh.mjs` was changed before the Code Freeze to rebuild the F world from the mechanism head through a
scratch clone reset to that head, so the P note commit is not in the reachable history. The clean F attempt
then reached the provider and was refused with `QUOTA: Insufficient Balance` before any model turn. The
condition is `BLOCKED`; no F note exists.

**Freeze disclosure:** the P Session ran before the Code Freeze commit, using the same P branch of
`run_fresh.mjs`; the only later change to that file is the F-world clean rebuild, which does not execute in
the P path. The P result is therefore from the same product code and the same P condition. The F condition
was rerun once after the fix, and the blocked clean attempt is the reported F result. The contamination
and the rerun are disclosed rather than hidden.

---

## 4. Verification at the Code Freeze

All commands were run at or after `0e04bec`; the only post-freeze executable was a one-off evidence-copy
utility (`collect4.mjs`) that copied and hashed immutable artifacts and changed no product or experiment
path. It was removed before the Evidence Freeze. The frozen tree contains no collector script.

| check | command | result |
| --- | --- | --- |
| build / TypeScript | `pnpm run build` | **exit 0** |
| architecture ratchets | `pnpm run architecture:check` | **PASS**, 0 violations, 9 accepted exceptions |
| public API | `pnpm run architecture:check-public-api` | **PASS**, 0 missing, 0 changed, 0 added |
| targeted batch 1 | `npx vitest run <12 files> --maxWorkers=1` | **12 files, 155 tests, 0 failed, exit 0** |
| targeted batch 2 | `npx vitest run <6 files> --maxWorkers=1` | **6 files, 89 tests, 0 failed, exit 0** |
| targeted total | 18 files | **244 tests, 0 failed** |
| broad non-gate | `PATH=/d/ProgramData/anaconda3:$PATH npx vitest run --exclude '**/r3l0*.test.ts' --exclude '**/trajectory_*.test.ts' --maxWorkers=2` | **started with Python on PATH; still running at the verification cutoff; partial log preserved; no broad pass claimed** |

The targeted 244-test run is the authoritative mechanism verification. The broad suite was started with
Python on the test PATH to check the COG-3 environment cause, but it was still running when the campaign
reached its verification cutoff and was stopped; its partial log is preserved and no complete-repository
pass is claimed. The COG-3 historical broad failure remains visible and is not retroactively reclassified.

The targeted selection was fixed before execution and covers the exact mechanisms exercised:
`lean_world_basis_runtime`, `lean_cross_basis_composition`, `lean_cross_basis_admission`, `lean_compatibility`,
`lean_d5a_continuation_assessment`, `lean_d5d_result_continuation_service`, `lean_d5b2_governed_rework`,
`lean_d5c3_current_basis_reexecution`, `lean_d5c1_head_sync_composition`, `lean_d5c2_prior_result_context`,
`lean_d3d_composition`, `lean_delegation_runtime`, `ci1_stale_and_duplicate`,
`ci3_staleness_applicability`, `ci3_promotion_authority`, `ci3_requalification`,
`trajectory_p2d1_currentness`, `e2i_intent_reconciliation`.

The broad run was performed with Python 3.13.9 on the test PATH, because the COG-3 failure was caused by a
missing `python` executable. The historical COG-3 failure remains visible and unchanged. A nonzero broad
exit is preserved; the suite is not rerun until it happens to pass.

---

## 5. Freeze discipline and Git

- One development branch, created from the verified COG-3 HEAD.
- Code Freeze `0e04bec`; no production/executable change after it except the removed one-off collector.
- Evidence Freeze after all evidence and reports; no executable change in it.
- No force-push, no `main` move, no PR, no tag, no branch deletion, no worktree prune, no lock removal, no
  `gc --prune=now`, no `clean -fdx`, no historical freeze amendment.
- The 95 worktree registrations, 19 gate roots, 2 locks and 71 pre-existing evidence trees are untouched;
  `cog4` is the 72nd evidence tree.
- The final working tree is clean at the Evidence Freeze except the evidence/docs it commits.

---

## 6. Limitations

1. One scored P run; the matched F run is blocked by provider quota; no comparative claim.
2. The deterministic Work result is not a model result; it tests the Work/continuation mechanism.
3. The expert `COMPATIBLE`/`UNKNOWN` outcomes use a test-owned instrumented read set, not the packaged
   first-party whole-repository footprint.
4. The packaged continuation cannot produce `COMPATIBLE` for a source change and has no model-facing tool.
5. The governed rework reopened the task but could not execute after the external updates: the live head
   was ahead of the canonical head, and `HEAD_BASIS_MISMATCH` was the honest refusal.
6. Project Intent was not exercised by the model; the normal host has no admission authority and no model
   tool.
7. The provider quota failure is external; the budget monitor was not the stopping cause.
8. The P note used ordinary filesystem access to the execution world; the product did not expose the result
   content or the continuation assessment as model fields.

---

## 7. Reproduction

```bash
# deterministic Work/continuation mechanism
node scripts/cog4/run_work_result.mjs --run=../.cog4-rig/cross-basis

# discovery probe over the final state
node scripts/cog4/inspect_state.mjs --run=../.cog4-rig/cross-basis

# budget-monitor proof
node scripts/cog4/budget_selftest.mjs

# forward-only COG-3 measurement audit
node scripts/cog4/audit_measurement.mjs

# scored fresh P Session (requires the owner's provider)
node scripts/cog4/run_fresh.mjs --run=../.cog4-rig/cross-basis --condition=P

# matched fresh F Session (the clean route; blocked by provider quota in this campaign)
node scripts/cog4/run_fresh.mjs --run=../.cog4-rig/cross-basis --condition=F

# targeted verification
npx vitest run test/lean_world_basis_runtime.test.ts test/lean_cross_basis_composition.test.ts \
  test/lean_cross_basis_admission.test.ts test/lean_compatibility.test.ts \
  test/lean_d5a_continuation_assessment.test.ts test/lean_d5d_result_continuation_service.test.ts \
  test/lean_d5b2_governed_rework.test.ts test/lean_d5c3_current_basis_reexecution.test.ts \
  test/lean_d5c1_head_sync_composition.test.ts test/lean_d5c2_prior_result_context.test.ts \
  test/lean_d3d_composition.test.ts test/lean_delegation_runtime.test.ts \
  test/ci1_stale_and_duplicate.test.ts test/ci3_staleness_applicability.test.ts \
  test/ci3_promotion_authority.test.ts test/ci3_requalification.test.ts \
  test/trajectory_p2d1_currentness.test.ts test/e2i_intent_reconciliation.test.ts --maxWorkers=1
```

All rig paths are explicit or detected; no owner home, drive letter or DSH binary is hardcoded in the
general-purpose scripts. Credentials are read from the owner's store and never printed or copied into
evidence.

---

## 8. Identities

| item | value |
| --- | --- |
| Incoming HEAD / tree | `ef9d8e3ac1ee4cb21750749e0b526291c527fe65` / `d08a2ab53c670941138dc23437c2e073216c51c0` |
| Development branch | `palimpsest-cog4-state-synthesis` |
| Code Freeze / tree | `0e04becff68c68118bf99c7c9d6bac3c77dd0f33` / `4f6c0677a13c96961c3a1f501372f5f2110f0d72` |
| Evidence Freeze | the commit that adds this report and `research-evidence/cog4`; its SHA is reported forward |
| Historical refs unchanged | `origin/main` `044330b`, local `main` `67b29c9`, COG-3 branch/freezes `ef9d8e3`/`bf21110`/`a38d0b2` |
| Protected resources | 95 worktrees, 2 locks, 19 gate roots, 72 evidence trees (71 + `cog4`), 0 stashes |
| Model / provider | `deepseek-official/deepseek-flash` |
| Campaign | 3 sessions, 1,865,339 reported tokens, 0 overrun; F blocked by provider quota |
