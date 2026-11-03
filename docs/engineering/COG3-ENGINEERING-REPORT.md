# COG-3 — Engineering Report

**Branch:** `palimpsest-cog3-native-synthesis`
**Incoming baseline:** `2928adc187ea3598639c5bd1e42828448d6ce56d` (tree `77ba519540ba23dc982579b9eda85feee18bd274`)
**Code Freeze:** `bf21110497e8a15211899f0334795185ebeffff3` (tree `b9143917811108563b7a84ee55d8f4e54e8660d0`)
**Model / runtime:** `deepseek-official/deepseek-flash` / DSH `0.2.1-rc.3`
**Evidence:** `research-evidence/cog3/` (11 session stream files for 12 model sessions — the resumed principal appends to the same stream — 6 run directories, verification logs, scores)

The Evidence Freeze commit is not written into this report: it cannot know its own SHA.

---

## 1. Incoming state and branch

The preflight was read-only and clean:

| check | value |
| --- | --- |
| `git status --short` | empty |
| current branch | `palimpsest-cog2-project-native-continuity` |
| `HEAD` / tree | `2928adc` / `77ba519` |
| `origin/main` | `044330b2e55198542d545edc42ed9c36e7ce896b` |
| `origin/palimpsest-cog2...` | `2928adc187ea3598639c5bd1e42828448d6ce56d` |
| `git rev-list --left-right --count origin/main...HEAD` | `0 359` |
| stashes | none |
| worktree registrations | 95 (unchanged; none pruned) |

The branch `palimpsest-cog3-native-synthesis` was created from `2928adc` after reading the COG-2
reports. No reset, rebase, fetch-prune or reference move was performed.

## 2. Exact changes

### Production (one bounded correction, two halves of one presentation defect)

| file | change |
| --- | --- |
| `host/dsh/lib/branch_prompt.js` | **new**, 84 lines. The branch task text, moved into an import-free module and made profile-aware: `RESULT_ONLY` keeps the single-tool wording; `PROJECT_READ_ONLY` names `read`/`glob`/`grep`, describes the frozen working directory, and tells the branch not to send file paths as `evidenceRefs`. |
| `host/dsh/lib/runner.js` | the local `branchTask` was replaced by an import from the new module and re-exported. No other behaviour changed; every other delivery path is untouched. |
| `test/cog3_branch_read_prompt.test.ts` | **new**, 5 tests: RESULT_ONLY invariants, PROJECT_READ_ONLY read tools, no single-tool claim, one-result/no-write contract, settlement-safe result shape. |

No core TypeScript, tool contract, ProjectIR, store, owner, authority or lifecycle changed. No new
runtime, router, ticket database, scheduler, memory store or verification authority was added.

### Experiment code and fixtures (not production)

`scripts/cog3/rig3.mjs`, `seed3.mjs`, `task_text.mjs`, `run_principal.mjs`, `run_baseline.mjs`,
`collect3.mjs`, and the Wrenfield scenario (`sources/` 8 files, `updates/` 1 file). The rig detects
the DSH and zstd paths at run time, records them, and fails explicitly when absent; session streams
are decoded with Node's own multi-frame zstd support, so no platform binary is required for evidence.

### Documentation

`docs/engineering/COG3-EXPERIMENTAL-PROTOCOL.md` (pre-registered before the scored runs),
`COG3-FORWARD-ERRATA.md` (the `r3-a2` remote correction and the COG-2 unattributed test failures),
and the reports listed in `COG3-FINAL-REPORT.md`.

## 3. Normal Host composition (G0)

COG-2's `CAPABILITY_REQUIRED` was a property of its diagnostic deployment, not the packaged host.
The normal host, with `reasoning: {}` and `attention.activation: "dsh"`, derives the branch port from
its own `--profile` and `argv[1]`, composes the reasoning store, the delegation service and the
terminal delivery seam, and binds the long-lived principal session. The live `PALIMPSEST_HOST_READY`
line reports `localExplore: AVAILABLE`, `branchAdapter: dsh-subprocess-branch:cog3-programme`,
`attention: ACTIVE`, `coldResume: AVAILABLE`, and 26 tools including `palimpsest_delegate`.

Full detail and the capability matrix: [`COG3-BASELINE-AND-COMPOSITION.md`](COG3-BASELINE-AND-COMPOSITION.md)
and `research-evidence/cog3/capability-matrix.json`. **G0 ESTABLISHED.**

## 4. The bounded correction

### Observed failure

The delegated branch was composed with `PROJECT_READ_ONLY` — `read`, `glob` and `grep` in its
restricted tool set — but its task text said:

> You have exactly ONE tool, `palimpsest_branch_result` ... Think briefly about the frozen question
> using ONLY the material above.

The live branch made exactly one tool call and answered "Undetermined on the supplied basis" while
`sources/sites.md` and `sources/vendors.md` were tracked at its own basis. The finding was delivered
and consumed, but it carried no independent information; the principal then did the work itself.
Probe record: `runs/MECH1/` (branch 1 call, 4,161 tokens).

### Second half of the same defect

After the read wording was fixed, the branch read seven sources and produced a substantive
statement — but passed file paths in `evidenceRefs`, and settlement refused the candidate:
`externalEvidenceRefs[].evidenceId must be a stable identifier`. The refusal was honest and the
candidate was not admitted. Probe record: `runs/MECH2/`. A read-enabled branch must be told what the
result shape accepts.

### Minimal implementation

One module, no new semantics:

- `RESULT_ONLY` text is unchanged.
- `PROJECT_READ_ONLY` text says it may inspect the frozen working directory with the three read-only
  tools and must not write, edit or run commands; it names the frozen basis and the exploratory
  standing; it says not to send `evidenceRefs` without an allowlist.
- The tool allowlist remains the structural boundary (`composeBranchHostEnvironment` publishes it;
  the runner restricts to it). The prompt grants nothing.

### RED / GREEN

- RED: the prompt tests failed **3 of 4** against the pre-correction module (the RESULT_ONLY
  invariant passed). A fifth assertion for the settlement-safe shape was then added and failed
  before the wording was added.
- GREEN: **5/5** after the correction.
- Live re-exercise (`runs/MECH3/`): the branch read seven files (9 calls), settled as ADMITTED,
  delivered a grounded conclusion naming the inspection room and the 40-reel/30-minute rule, and the
  principal wrote it into its deliverable with the exploratory label. This is the positive control.
- Negative controls preserved: the pre-correction `undetermined` result; the settlement refusal;
  `palimpsest_begin`'s honest refusal in the scored run; and the existing delegation tests for
  duplicate, interrupted and new-basis behaviour.

### Secondary cost

One extra sentence in the branch prompt and one module split. No extra model call, store, owner,
authority or schema. `RESULT_ONLY` blocking collaboration keeps its exact prior wording.

## 5. Experiment, budget and the overrun

The pre-registered protocol is [`COG3-EXPERIMENTAL-PROTOCOL.md`](COG3-EXPERIMENTAL-PROTOCOL.md).
Conditions: S (single-agent files), F (native DSH subagent/workflow), P (shipped Palimpsest host with
journal, delegation, update and cold resume), P-minus (planned matched no-delegation control).

| item | value |
| --- | --- |
| model sessions | 12 (cap 18) |
| reported tokens | **27,131,380** (cap 25,000,000) |
| overrun | **2,131,380** |
| probe sessions/tokens | 6 / 536,463 (labelled diagnostics) |
| P | 3 sessions / 16,221,721 |
| S | 1 / 1,828,481 |
| F | 2 / 8,544,715, **truncated at the cap** |
| P-minus | **not run** |

The cap was crossed because the F baseline was far more verbose than estimated. F was stopped
mid-turn when the overrun was detected; its plan (71,437 B) is preserved and labelled
`TRUNCATED_BY_BUDGET`. **No counter was reset and no cap was extended.** P-minus could not start.
This is a protocol violation and is reported as one in the results and the final report.

All runs used isolated `DSH_HOME`/`runtime_HOME`, test-owned repositories and state databases under
`.cog3-rig/`; the real runtime home was read only for the owner's credential and was not written.
Credentials never appear in evidence.

## 6. Verification at the Code Freeze

All commands ran at `bf21110` with the documentation/evidence tree untracked.

| check | command | result |
| --- | --- | --- |
| build / TypeScript | `pnpm run build` | **exit 0** |
| architecture ratchets | `pnpm run architecture:check` | **PASS**, 0 violations, 9 accepted exceptions |
| public API | `pnpm run architecture:check-public-api` | **PASS**, 0 missing, 0 changed, 0 added |
| targeted serial | `npx vitest run <15 files> --maxWorkers=1` | **15 files, 164 tests, 0 failed, exit 0** |
| broad non-gate | `npx vitest run --exclude '**/r3l0*.test.ts' --exclude '**/trajectory_*.test.ts' --maxWorkers=2` | **301 files, 3,782 tests, 3,779 passed, 3 failed, `success:false`** |

### The broad failure is recorded, not hidden

All three failures are in `test/inplace_execution.test.ts` and all report the same cause: the gate
command `python -c ...` produced no observable exit code (`expected null to be 5`). The shell PATH
used for the broad run contains no `python` (only `py`). One bounded diagnostic re-ran that single
file with a python executable on PATH:

`PATH=/d/ProgramData/anaconda3:$PATH npx vitest run test/inplace_execution.test.ts --maxWorkers=1`
→ **9/9 passed, exit 0** (`verification/inplace-python-path.log`).

The hypothesis is supported: an environment/tooling absence, not an application assertion and not a
consequence of the host change (the change touches only the branch prompt and the principal launch
path, neither of which runs in this file). The broad suite was **not** rerun to green.

COG-2's concurrent targeted failures remain **unattributed**; COG-3 does not classify them as
harmless contention (see `COG3-FORWARD-ERRATA.md` §2).

## 7. Freeze discipline

- All executable production code, tests, experiment scripts, scenario fixtures and telemetry were
  committed at the Code Freeze.
- After the Code Freeze, only documentation and evidence were added. The final check confirms no
  executable file changed after `bf21110`.
- The Evidence Freeze contains no executable change and does not contain its own SHA.
- No historical Code/Evidence Freeze or evidence tree was amended, rewritten or deleted.
- No force-push, no branch deletion, no worktree prune, no lock removal, no `gc --prune=now`, no
  `clean -fdx`.

## 8. Governance non-actions

**Performed:** read-only preflight and the `r3-a2` ref recheck; one development branch; the
mechanism probes; the scored conditions; the bounded correction; verification; evidence collection;
the forward erratum.

**Not performed:** updating or moving `main`; opening a PR; creating integration tags; deleting or
retiring any branch; pruning the 92 missing worktree registrations or removing the 2 locks; deleting
the `pal-fed` or `r3-a2` refs; modifying gate roots or historical evidence; touching the real runtime
home; force-pushing; rewriting any freeze; starting P-minus after the budget cap.

## 9. Limitations

1. **Token cap overrun** by 2,131,380 and the F truncation; P-minus is missing.
2. **One run per condition**, one evaluator, one model family, no blinding.
3. **The principal used web tools**, so the delegated finding's causal contribution is not
   exclusive.
4. **S and F are one-shot** and did not receive the phase-2 update; currentness is within-P only.
5. **Managed Work is not usable in this profile**: no completion standard, and the principal
   bootstrap path is in-place while the profile defaults to worktree. Not corrected here.
6. **The branch does not see the journal**; the journal lives in SQLite, not the Git snapshot.
7. **The host job is in-memory**; a crash leaves an honest INTERRUPTED branch, and v1 does not
   auto-rerun it.
8. **The broad run failed 3 environment-dependent tests**; the cause is diagnosed but the suite was
   not rerun to green.

## 10. Reproduction

```bash
# one mechanism probe (test-owned world)
node scripts/cog3/seed3.mjs --dir=<dir> --carrier=journal
node scripts/cog3/run_principal.mjs --run=<dir> --mode=mechanism

# one scored principal run (journal carrier, delegation, update, cold resume)
node scripts/cog3/seed3.mjs --dir=<dir> --carrier=journal
node scripts/cog3/run_principal.mjs --run=<dir> --mode=scored --variant=delegation

# the baselines
node scripts/cog3/seed3.mjs --dir=<dir> --carrier=file
node scripts/cog3/run_baseline.mjs --run=<dir> --condition=S
node scripts/cog3/run_baseline.mjs --run=<dir> --condition=F

# the prompt tests
npx vitest run test/cog3_branch_read_prompt.test.ts --maxWorkers=1

# evidence
node scripts/cog3/collect3.mjs
```

The DSH and zstd paths are detected and recorded in each run record; when absent, the rig fails
explicitly instead of assuming a machine layout.

## 11. Exact identities

**Development branch:** `palimpsest-cog3-native-synthesis`

| commit | purpose |
| --- | --- |
| `04d972c` | shipped-host rig, pre-registered protocol, forward erratum, and the branch-read prompt correction |
| `bf21110` | Code Freeze: portable evidence decoder, session tool results, final prompt tests |

**Unchanged historical references:** `origin/main` `044330b`, local `main` `67b29c9`,
`origin/palimpsest-cog2-project-native-continuity` `2928adc`, COG-2 Code Freeze `e23a29a`, COG-2
Evidence Freeze `dec8bf3`, 95 worktree registrations, 19 gate roots, 0 stashes.

**Working tree:** clean at the Evidence Freeze except for the documentation and evidence committed
by it.
