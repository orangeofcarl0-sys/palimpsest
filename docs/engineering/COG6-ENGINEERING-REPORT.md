# COG-6 — Engineering Report

**Branch:** `palimpsest-cog6-agent-native-evolution`
**Incoming baseline:** `60be154f7f776729698f316011670abd0bc4c0eb` / tree
`10d22622a70064b5b9f963b59c1476276dcec273` (COG-5 Evidence Freeze)
**C6-0 checkpoint:** `7834778854019a5d724124636ec9e940ef7ef7ac` / tree
`7c3616cddf503022a9bf2a83d7f113f8dd6264a6`
**C6-1 protocol and rig:** `108d0b39ae0aba45bc60a5011621de40a5002f33` / tree
`d346d0d9a29e9060c3fdcaba0df3149e51428108`
**Code Freeze:** `c10af086896abc139110eea041fdaccd19135590` / tree
`4515f31c3122605d029c7268ff55b0b791940a3a`
**Evidence Freeze / final HEAD:** reported forward in the final answer; a commit cannot contain its own SHA.
**Model:** **BLOCKED by provider quota.** One minimal probe; zero scored sessions; zero reported tokens.

---

## 1. The production change

COG-6 made **one bounded product correction**: the governed reopening now names the current ProjectIR
revision instead of hardcoding revision 0.

### 1.1 The measured defect

`src/composition/continuation.ts` built the governed `TASK_READY` reopening with
`expected_project_revision: 0`. The event store requires every ordinary event to name the current
ProjectIR revision (`src/state/event_store.ts:597-607`). The hardcoded value is only correct while the
project is still at revision 0.

The deterministic C6 scenario revises the plan before the result becomes stale: historical tasks are
seeded, a current `technical-refresh` task is added (revision 3), the operator authorises the exact
intake and adds it in one revision (revision 4), and only then are the two tasks executed. The held
`technical-refresh` result is assessed after the intake moves the source. `startRework` then failed:

```text
StateStoreError: expected revision 0, current revision is 4
  at EventStore.#validatePreconditions (src/state/event_store.ts:603)
  at Object.reopen (src/composition/continuation.ts:531)
  at Object.startRework (src/continuation/service.ts:618)
```

This is a normal product path: any project whose plan is revised before a result is continued hits
it. COG-5 did not, because its run was still at revision 0 when the rework happened.

### 1.2 The correction

**Modified file:** `src/composition/continuation.ts` — the reopening's
`expected_project_revision` is `controller.work.project().revision`.

**Test:** `test/lean_d5d_result_continuation_service.test.ts`, new test 15. It advances the plan once
while the project is quiescent, then runs the normal drift line, inspects the held result and calls
`startRework`.

- **RED:** `StateStoreError: expected revision 0, current revision is 1`, the same failure.
- **GREEN:** the reopening lands (`REOPENED_WAITING_FOR_QUIESCENCE`), exactly one `rework_provenance`
  event exists, the task is `READY`, and the ProjectIR revision remains 1.

### 1.3 What did not change

- No compatibility enum, read policy, admission rule, promotion rule, head authority, scheduler,
  router, store or agent runtime.
- No new authority root.
- No change to `HEAD_BASIS_MISMATCH`.
- No change to the completion contract's documentation-only narrowing.
- No model-facing tool.

---

## 2. Rig defects found and fixed before the Code Freeze

These are test-owned defects. They are disclosed because the exploratory runs are preserved.

1. **`taskStates()` returns an array, not a Map.** The first exploratory pass died in
   `projectSnapshot`. Fixed by building a Map from `{taskId,state}` rows.
2. **Journal calls need the project id.** `recordJournalEntry`/`resolveJournalEntry` refused
   `project "undefined"`. Fixed by passing `projectId`.
3. **The default stage graph latches VERIFYING.** With concurrency 1, a held candidate blocks the next
   READY task, so the intake could not start after the technical refresh. The rig now declares
   `ACTIVE`/`VERIFYING` concurrency 2, as COG-5 did. This is a deployment capacity declaration, not an
   authority change.
4. **The `attempts` table has no `base_commit` column.** `attemptsOf` selected it. Fixed; the basis is
   read through `attemptBasisForResolution`.
5. **`driveTask` stepped after a HOST_ERROR.** That activated a task with no candidate. Fixed: it only
   steps on `FINISHED` + `COMPLETED`.
6. **The production rework defect.** Fixed in C6-2, not in the rig.

Exploratory run directories (`explore1`…`explore6`, `outofscope1`, `irrelevant1`) are retained outside
the repository under `F:\Codex_Work_Space\Palimpsest\.cog6-rig\`. They are not evidence for the final
claims; the final runs are separate and immutable.

---

## 3. Verification at the Code Freeze

All commands were run at `c10af08`; logs are in `research-evidence/cog6/verification/`.

| check | command | result |
| --- | --- | --- |
| build / TypeScript | `pnpm run build` | **exit 0** (one engine warning: Node v24.14.1 vs required ≥24.15.0) |
| architecture ratchets | `pnpm run architecture:check` | **PASS**, 0 violations, 9 accepted baseline exceptions |
| public API | `pnpm run architecture:check-public-api` | **PASS**, 0 missing, 0 changed kind, 0 added |
| targeted batch 1 | `npx vitest run <8 files> --maxWorkers=1` | **8 files, 107 tests, 0 failed, exit 0** |
| targeted batch 2 | `npx vitest run <9 files> --maxWorkers=1` | **9 files, 107 tests, 0 failed, exit 0** |
| targeted batch 3 | `npx vitest run <9 files> --maxWorkers=1` | **9 files, 121 tests, 0 failed, exit 0** |
| targeted total | 26 files | **335 tests, 0 failed** |

The fixed set includes the modified `lean_d5d_result_continuation_service` and the continuation,
compatibility, admission, promotion, head, workspace, management, completion-contract, delegation,
continuity and intent suites named in the protocol. The broad suite was **not run**; no broad pass is
claimed. The targeted 335-test run is the authoritative mechanism verification. The COG-4 broad
partial record and the COG-5 targeted record remain visible and are not reclassified.

---

## 4. The model gate and budget control

| item | result |
| --- | --- |
| probe | one isolated headless session, `2026-11-01T14:04:51Z`, exit 1, 32.5 s |
| error | `QUOTA: Insufficient Balance` (request_id `5bbca676-fad3-423a-b78f-d2b5e53586f1`) |
| configured provider/model | `deepseek-official` / `deepseek-flash` |
| model listing | loaded 2 models |
| session record | one session header; **zero** request/response events; **zero** tokens |
| campaign | `BLOCKED`, `startedSessions: 0` |
| budget self-test | a local dummy child; killed by `token_stop_threshold`, `SIGKILL`, 4000 tokens seen in 455 ms |

The self-test proves the controller can actually terminate a running child with the same stdio/exit
interface. It does **not** test a model process, because no model session was started. The monitor is a
local budget control, not a server-side hard cap; that distinction is part of the evidence.

The provider gate is not re-probed automatically: a repeated quota request spends requests without
producing new information.

---

## 5. Freeze discipline and evidence

- One development branch, created once from `60be154`.
- C6-0 committed the preflight, baseline/authority map and the outcome/authority ruling.
- C6-1 committed the protocol, scenario, deterministic rig, model gate and the probe evidence.
- C6-2 committed the one product correction and its test; that commit is the **Code Freeze**.
- No executable change after `c10af08`. The results, evidence and manifest are documentation/evidence.
- Final deterministic runs were executed at the Code Freeze against the frozen `dist`.
- The evidence extractor (`F:\Codex_Work_Space\Palimpsest\.cog6-rig\make_cog6_evidence.mjs`) and the
  manifest builder are **outside the repository**; they read immutable artifacts and write evidence.
- No force-push, no `main` move, no PR, no tag, no branch deletion, no worktree prune, no lock removal,
  no `gc --prune=now`, no `clean -fdx`, no historical freeze amendment, no evidence rewrite.
- Protected resources are unchanged: 95 worktree registrations, 2 locks, 19 gate roots, 73 pre-existing
  evidence trees (with `cog6` as the 74th), 0 stashes.

---

## 6. Reproduction

```bash
# the frozen deterministic mechanism
node scripts/cog6/run_cog6.mjs --scenario=mechanism --run=<fresh dir>

# the unapproved-write refusal
node scripts/cog6/run_cog6.mjs --scenario=outofscope --run=<fresh dir>

# the unrelated-change control
node scripts/cog6/run_cog6.mjs --scenario=irrelevant --run=<fresh dir>

# the budget kill path (no model)
node scripts/cog6/run_model_gate.mjs --selftest=<fresh dir>

# the recorded provider gate (starts nothing while blocked)
node scripts/cog6/run_model_gate.mjs --gate=research-evidence/cog6/probe/probe-result.json --run=<fresh dir>

# the focused correction test
npx vitest run test/lean_d5d_result_continuation_service.test.ts -t "REWORK AFTER A REVISION" --maxWorkers=1

# the authoritative checks
pnpm run build
pnpm run architecture:check
pnpm run architecture:check-public-api
```

The final run directories are `research-evidence/cog6/runs/{main,outofscope,irrelevant}`. The model
gate evidence is `research-evidence/cog6/model/`; the probe is `research-evidence/cog6/probe/`.

---

## 7. Limitations

1. No Agent, Principal Session, model Worker or native DSH baseline. The provider is blocked.
2. The deterministic worker is an in-process test port, not a model and not the DSH subprocess worker.
3. The mechanism arm is operator-authored. It cannot establish discovery, proposal quality, authority
   discipline or fresh-session inheritance.
4. The packaged continuation still cannot prove positive compatibility for a changed source world.
5. The completion contract narrows out the standard command for documentation/data write scopes; the
   evidence is write scope plus required artifact. The independent domain rubric checks the content.
6. The final direct-commit control intentionally leaves the live head ahead of the project head; that
   is the preserved negative case, not a reconciled final state.
7. The route is Git-specific at the canonical-source layer.
8. Node is v24.14.1 while the package declares `>=24.15.0`. The warning is recorded; no global runtime
   change was made.
9. The operator policy is deterministic and pre-registered, but an Agent proposal was never assessed by
   it. Its rules were exercised on frozen inputs, not on model output.

---

## 8. Identities

| item | value |
| --- | --- |
| Incoming HEAD / tree | `60be154f7f776729698f316011670abd0bc4c0eb` / `10d22622a70064b5b9f963b59c1476276dcec273` |
| C6-0 | `7834778854019a5d724124636ec9e940ef7ef7ac` / `7c3616cddf503022a9bf2a83d7f113f8dd6264a6` |
| C6-1 | `108d0b39ae0aba45bc60a5011621de40a5002f33` / `d346d0d9a29e9060c3fdcaba0df3149e51428108` |
| Code Freeze | `c10af086896abc139110eea041fdaccd19135590` / `4515f31c3122605d029c7268ff55b0b791940a3a` |
| Evidence Freeze | the commit adding these reports and `research-evidence/cog6/**`; SHA reported forward |
| Production files changed | `src/composition/continuation.ts` (one field) |
| Test changed | `test/lean_d5d_result_continuation_service.test.ts` (new test 15) |
| Experiment added | `scripts/cog6/**` |
| Model / provider | probe only; blocked by quota; 0 scored sessions; 0 reported tokens |
| Targeted tests | 26 files / 335 tests, 0 failed |
| Build / architecture / public API | exit 0 / PASS 0 violations, 9 exceptions / PASS 0/0/0 |
| Historical refs unchanged | `origin/main` `044330b`, COG-5 final `60be154` |
| Protected resources | 95 worktrees, 2 locks, 19 gate roots, 73 pre-existing evidence trees, 0 stashes |
