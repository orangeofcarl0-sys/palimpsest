# COG-2 — Engineering Report

**Branch:** `palimpsest-cog2-project-native-continuity`
**Baseline:** `c8fe50590d1862840043aff4449f91ec95524c3a` (tree `13623581df2e7b2a19e336e6ef94d55f9dcf9d07`)
**Code Freeze:** `e23a29a9d8331da86dad46f3c3ea6070d6319e5c` (tree `2e006507758f67d587f522f31bdf54741020ffa2`)
**Model / runtime:** `deepseek-official/deepseek-flash` / DSH `0.2.1-rc.3`
**Evidence:** `research-evidence/cog2/` (13 raw session streams, 14 run records, 7 plan artifacts, scores, verification logs)

The Evidence Freeze commit is not written into this report: it cannot know its own SHA.

---

## 1. BGC-0 outcome

The read-only census was completed before the COG-2 branch existed. It is documented in
[`COG2-BRANCH-GOVERNANCE.md`](COG2-BRANCH-GOVERNANCE.md); the machine record is
`research-evidence/cog2/branch-inventory.json`, produced by `scripts/bgc0/branch_census.mjs`.

Key results:

- 250 local and 79 remote refs; 95 worktree registrations (3 exist, 92 missing); 19 gate roots;
  69 evidence trees at the baseline.
- 285 refs are ancestors of the development head; 18 local branches are patch-equivalent;
  24 distinct branches are graph-divergent.
- 16 of the 24 are content-integrated through merged PRs. The remaining 8 are the seven
  `experiment/pal-fed-0*` branches (closed PRs, already classified by RS-1) and
  `r3-a2-sentinel-portfolio` (no PR).
- `lean-d5d-result-continuation-service` is fully integrated: all four exclusive commits map to
  squash merges `3e267c5` (PR #199) and `a3915d7` (PR #201), and every added file blob or added line
  is present. No functionality is missing.
- `main` is the protected canonical integration branch (policy + active ruleset: PR required,
  `unit`/`e2e`, no deletion, no non-fast-forward, no bypass actors). It is 352 commits behind the
  development head with 0 on the main-only side. A fast-forward is technically possible and
  **not authorized**; no PR was opened and `main` was not moved.
- Local `main` is a clean but stale checkout, 296 commits behind `origin/main`; it was not updated.

No branch, worktree, gate root, evidence tree or ref was deleted, pruned, reset, rebased or
force-pushed.

---

## 2. Exact changes

### Production (one bounded correction)

| file | change |
| --- | --- |
| `host/dsh/lib/project_hint.js` | **new**, 45 lines. `projectContextHint` reads the existing project workspace's journal list and returns one sentence with a count; `composeLaunchMessage` prepends it. No imports, no store, no authority. |
| `host/dsh/lib/runner.js` | 11 lines changed (one static import and the launch-message call site). The principal launch message is composed through the hint; every other delivery path (attention, delegation, worker, branch) is untouched. |
| `test/cog2_project_context_hint.test.ts` | **new**, 5 tests. RED before the module existed (5/5 failed), GREEN after. Count-only, singular, empty, absent, throwing workspace, no content leakage. |

The hint is presentation, not semantics:

- It carries no title, body, kind, entry id, asset or instruction to call a tool.
- It says earlier work "may be inspected if it bears on this task".
- An empty journal, an absent workspace or a read failure composes the original launch message
  **byte-identically**.
- It runs once at launch, not on attention turns.
- It adds one read of an existing store at launch; no schema, owner, authority or service.

### Trials and evaluation (not production)

- `scripts/cog2/rig.mjs`, `seed.mjs`, `run_condition.mjs`, `run_inheritance.mjs`,
  `oracle.mjs`, `task_text.mjs`, `collaboration_probe.mjs`, `collect_evidence.mjs`
  (1,328 lines) and the scenario (342 lines).
- `scripts/cog2/scenario/sources/*` (9 files) and `scenario/updates/*` (4 files).
- `scripts/bgc0/branch_census.mjs` (the read-only BGC-0 producer).

No core domain, ProjectIR, project workspace, controller or tool contract was changed. The COG-1
journal correction (`e7ddec0`) remains as it was.

---

## 3. The correction and its controls

**Observed failure.** With a valid ProjectIR and a populated journal, the neutral task made zero
product calls (C: 0 calls, 686 s, 4.04M tokens). A cold second round of the same project with eight
entries also made zero (P round 2). The journal was readable, but the principal never looked.

**Root cause.** The product surface is not visible at the principal's first move. The model reads
files by default; the project workspace is not a file and was never mentioned.

**Minimal implementation.** One conditional sentence at the launch boundary; no new semantics.

**Positive controls.**

| control | result |
| --- | --- |
| mechanism check (explicit) | 1 `palimpsest_project` call, all 5 entries read, 49.6 s |
| D (human-authored invitation) | 0 → 7 product calls |
| CSEAM (neutral task + seam) | 0 → 3 product calls, 686 s → 304 s, 4.04M → 1.06M tokens |
| P round 2 + seam | 0 → 1 product call (`journal_entries`); the plan uses the 2023 findings |

**Negative control.** The self-contained rewrite made 0 calls and answered in 14 s, both with and
without the seam. The hint did not create unnecessary work.

**What improved.** Selection, discovery and re-derivation cost. The seam run used 35 tool calls instead of 50 and a quarter of the tokens (1.06M vs 4.04M) of the same task without it.

**What did not improve.** Decision quality relative to the strong file baseline. Every condition
passed the same rubric, and the file baseline was cheaper in the cold continuation.

---

## 4. Verification at the Code Freeze

All commands were run at `e23a29a` with a clean evidence-only working tree.

| check | command | result |
| --- | --- | --- |
| build / TypeScript | `pnpm run build` | **exit 0** |
| architecture ratchets | `pnpm run architecture:check` | **PASS**, 0 violations, 9 accepted baseline exceptions |
| public API | `pnpm run architecture:check-public-api` | **PASS**, 0 missing, 0 changed, 0 added |
| targeted CI1–CI3 + COG-1 + COG-2 | `npx vitest run <21 files> --maxWorkers=1` | **21 files, 76 tests passed, exit 0** |
| authorized broad non-gate | `npx vitest run --exclude '**/r3l0*.test.ts' --exclude '**/trajectory_*.test.ts' --maxWorkers=2` | **300 files, 3,777 tests passed, 0 failed, exit 0** |
| protected assets | census | evidence trees 70 (69 at baseline + `cog2`), worktrees 95, gate roots 19, stashes 0 |

### The failed diagnostic that must not be hidden

The first targeted run of the same 21 files used vitest's default parallelism and reported
**8 failed files / 9 failed tests** in its terminal summary (`HOST_ERROR: The external outcome is
uncertain; Ordarium refused a blind retry` and `no attempt id` in the Work/qualification suites).
Its full console was not preserved. One diagnostic re-run with the JSON reporter preserved
**5 failed files / 5 failed tests** (the record below). The first failed file,
`test/ci3_promotion_authority.test.ts`, passed **in isolation** (5/5, exit 0), and the authoritative
serial run passed all 76.

The failure is resource contention in the Work tests under a loaded machine, not an application
assertion and not a consequence of the launch hint (the hint executes only in the principal branch,
after the worker/branch early returns).

Preserved records:

- `research-evidence/cog2/verification/targeted-parallel-failed.{log,json}` — the 5/5 diagnostic run
- `research-evidence/cog2/verification/targeted-serial.log` — 21 files / 76 tests, exit 0
- `research-evidence/cog2/verification/isolated-failed-file.log` — 5/5, exit 0

The broad run is green in this stage. That does **not** retroactively change COG-1's recorded
first broad run (3766/3772 with six timeouts) or CI3's limitations.

---

## 5. Freeze discipline

- All executable production code, tests, scenario fixtures, trial runners, telemetry and evaluation
  programs were committed at the Code Freeze.
- After the Code Freeze, only documentation and evidence were added.
- The Evidence Freeze contains no executable change and does not contain its own SHA.
- No historical Code/Evidence Freeze commit was amended or rewritten.
- No force-push; no branch deletion; no worktree prune; no `gc --prune=now`; no `clean -fdx`.
- The real runtime home was read for the owner's credential and otherwise not written; every trial
  used an isolated `DSH_HOME`/`runtime_HOME` under `.cog2-rig/`.
- No credentials appear in any evidence file.

---

## 6. Governance actions and non-actions

**Performed:** read-only census; ancestry/patch/PR analysis; one development branch from the verified
head; governance report and inventory; the trials; the bounded correction; verification; evidence
collection.

**Not performed:** updating `origin/main` or local `main`; opening a draft PR; deleting or retiring
any branch; pruning the 90 prunable worktree registrations or removing the 2 locks; deleting the
`pal-fed` or `r3-a2` refs; creating tags; modifying gate roots or evidence trees; touching the real
runtime home; force-pushing; rewriting any freeze.

The retirement proposal and the main-integration proposal in
[`COG2-BRANCH-GOVERNANCE.md`](COG2-BRANCH-GOVERNANCE.md) require owner authorization and were not
executed.

---

## 7. Unresolved limitations

1. **CI4 Contract Basis** is unchanged. This stage did not use old Completion Evidence to approve a
   new standard, and did not run formal Work qualification.
2. **Managed Work is not composed** in this deployment: no confirmed completion standard. The
   cognitive project context was established; Work readiness is not claimed.
3. **PARALLEL collaboration is unavailable**: the advisor refused honestly with
   `CAPABILITY_REQUIRED` (`reasoning.cell` unavailable). No cross-agent influence was exercised.
4. **Attention and delegation delivery are not composed** (`activation: "none"`, pull mode). The
   update pack was a later turn, not continuous interaction.
5. **No statistical claim**: one run per condition, one evaluator, non-blinded, same model family.
6. **The P round-2 plan artifact was overwritten** by the seam re-test before collection; the raw
   session stream is preserved and the reconstructed record is labelled. No finding depends on the
   lost file.
7. **Token counts are model usage**, not price; the runtime exposes no billing figure.
8. **The file baseline was at least as effective and cheaper in the cold continuation**. That result
   is preserved, not reframed.

---

## 8. Reproduction

```bash
# BGC-0 (read-only)
node scripts/bgc0/branch_census.mjs > research-evidence/cog2/branch-inventory.json

# one trial (test-owned world)
node scripts/cog2/seed.mjs --dir=<run> --mode=matrix
node scripts/cog2/run_condition.mjs --condition=C --dir=<run>

# the seam tests
npx vitest run test/cog2_project_context_hint.test.ts --maxWorkers=1
```

The isolated runtime homes, worlds and state databases live under `.cog2-rig/` and are not part of
the repository; the session streams they produced are copied into `research-evidence/cog2/sessions/`.
