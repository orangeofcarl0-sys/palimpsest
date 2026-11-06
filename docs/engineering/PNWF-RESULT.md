# PNWF — Project-Native Work Flow

Status: deterministic engineering stage plus an authorized two-session real-model continuation cohort.
The engineering stage used **0 paid model sessions**; the continuation cohort used **2,655,709 of its
own 5,000,000-token authorization** (no PSVR-C/ODPE-R balance was used or transferred). The
deterministic host evidence is a labelled Messages stand-in; the continuation streams are real
`deepseek-flash`.

The stage implements the product correction the PSVR-C trajectory exposed: an agent that has already
done the work through native tools must not be pushed into a post-hoc formal Work path that cannot
settle. Direct work becomes a first-class project outcome; formal Work remains available when its
boundaries matter, with its settlement and promotion authority unchanged.

---

## 1. What changed

| area | change |
|---|---|
| PNWF-A | `status.nextAction` is derived from the attempt's WORLD and host invocation facts, not only its lifecycle. A zero-delta RUNNING attempt is no longer advertised as an executable `complete`; the explanation names the legal alternatives and a separate session exit. |
| PNWF-B | A project can be created with no formal task, observe a direct Git commit, record DELIVER with the artifact's REAL commit, and be read by a new session. Worktree-only bytes are reported as uncommitted, never as a persisted result. |
| PNWF-C | The physical repository HEAD and the canonical ProjectIR head are shown separately. A direct commit ahead of the canonical head is `DIRECT_AHEAD`, never auto-promoted; governed work still refuses `HEAD_BASIS_MISMATCH`. |
| PNWF-D | A redundant formal task can be retired through the EXISTING typed plan revision (`changeClass` + `changedIds`), after a `relay successor` when a RUNNING world is unproven, and never by faking a settlement. A live/unproven worker world refuses retirement. |
| PNWF-E | The normal tool now exposes the facts progressively (attempt execution, direct outcome, session exit) and the `complete` refusals name the legal next actions. The tool description carries a short direct-work posture. No hidden instruction. |

The one invariant: **Observation ≠ Permission ≠ Acceptance.** A direct DELIVER is advisory; a
CHECKPOINT does not settle an attempt; a typed revision retires a task without completing it; the
canonical head moves only through the existing Promotion/Operator authority.

---

## 2. PNWF-0 — evidence closure

### 2.1 Git and the local trajectory commit

- `origin/main` at the start: `4597d8193c2bd21ac3dac2f11263d59a9d71a6f3`.
- Local Trajectory analysis: branch `psvr-c-trajectory-analysis`, commit
  `db6c37b53e2f26f9ba0d8374d25e2860a1e5785f`, parent `4597d81`, tree
  `c634d981666981200bf372eb29da599eda91e60f`.
- `db6c37b` contains only the analysis, the evidence timelines and the trajectory JSONs; it was
  verified with `git show --stat` before the PNWF branch was created from it.
- The PNWF branch is `palimpsest-project-native-workflow`; baseline `db6c37b`.

### 2.2 The energy F-2 34,445-token difference

The earlier report listed the phase split as `work 421,149 + tail 68,008 = 489,157`, while the
session ledger recorded `454,712`. The difference is **exactly** the last model step:

```
stream sum                 489,157
last step (step 20)         34,445   at 2026-11-05T18:24:38.870Z
stream minus last          454,712
ledger observedAt          2026-11-05T18:24:33.001Z
run endedAt                2026-11-05T18:24:39.314Z
```

The ledger is a sample taken before the session's final request; the final request arrived after
`observedAt`. The identity is exact: `489,157 − 34,445 = 454,712`. There is no overlap, no
double-counted worker usage and no second accounting system. `research-evidence/pnwf/2026-11-06/
cost-reconciliation.json` records the numbers and the Observed/Derived/Inferred grades:
the per-step usage, timestamps and ledger are Observed; the sums and identity are Derived; the
statement "the ledger would have recorded 489,157 if sampled after the final response" is Inferred.

### 2.3 The grades used below

- **Observed**: the real Git commits, host sessions, tool calls, SQLite state, stream usage.
- **Derived**: arithmetic over observed rows (phase sums, ratios, the 34,445 identity).
- **Inferred**: explanations of why a choice was made. The trajectory analysis marks its causal
  reading as inferred; it does not claim the model's private mental state.

---

## 3. PNWF-A — reality-aware action guidance

### 3.1 The defect

`explainWorkState()` saw only task/attempt lifecycle. A RUNNING attempt therefore mapped to:

```ts
{ kind: "WAIT_ACTIVE_WORK", executable: true,
  action: "palimpsest_work action=complete",
  detail: "completion is the only formal transition available until it settles" }
```

The predicate could not see world HEAD, changed files, uncommitted work, result commit, worker
liveness or a direct commit. The PSVR-C A-2 sessions followed that advice into
`NO_RUNNING_ATTEMPT` / `WORKER_ACTIVE` / `NO_WORK` and kept polling.

### 3.2 The new facts and the owner split

- `src/domain/work_state.ts` stays PURE. It now accepts:
  - `WorkAttemptExecution`: `baseCommit`, `worldHead`, `uncommittedChanges`, `liveness`
    (`ACTIVE` / `EXITED` / `UNKNOWN` / `NEVER_STARTED`);
  - `WorkDirectOutcome`: `repositoryHead`, `projectHead`, `relation`
    (`IN_SYNC` / `DIRECT_AHEAD` / `DIVERGED` / `UNOBSERVABLE`), `uncommittedPaths`;
  - `WorkSessionOption`: `mayEnd`, `action`, `detail`, separate from the formal transition.
- `src/work/read_model.ts` gains `observeStatusFacts()`: a read-only observation that gathers
  the attempt world delta and the physical/canonical head relation. It writes nothing and never
  advances the canonical head. It lives in the existing Work read owner, not the controller, so the
  orchestration hotspot did not grow. It does **not** duplicate readiness: it reads the same
  `observeAttemptResult` / `canonicalWorktreeChanges` ports that `outcomeReadiness` uses, and
  `outcomeReadiness` remains the finalization/decision surface (calling it from `status()` would
  recurse through the status projection). The observation must not live in
  `attempt_execution.ts`, whose architecture contract forbids `execFileSync`; the first placement
  was caught by `test/architecture/sr2b3_attempt_execution_owner` and moved.
- `src/tools/controller.ts` calls that observer once in `status()`. The domain still imports no Git.
- `src/adapters/dsh/common.ts` exposes `attempts` (with execution), `promotions`, the `nextAction`
  blockers/session and `directOutcome` to the normal tool.

### 3.3 What the normal status now says

| observed state | previous advice | PNWF advice |
|---|---|---|
| RUNNING + worker `ACTIVE` | `complete` (executable) | `WAIT_ACTIVE_WORK`, not executable; observe with `workers` or request `stop`; a CHECKPOINT records the active worker without claiming it stopped |
| RUNNING + worker liveness `UNKNOWN` | `complete` (executable) | not executable; an unobserved writer may exist; inspect `workers` or relay a successor; a stop request is not an observed exit |
| RUNNING + world unobservable | `complete` (executable) | not executable; inspect the host/world, no settlement claim |
| RUNNING + uncommitted world changes | `complete` (executable) | not executable; commit or discard in the world first |
| RUNNING + `worldHead == baseCommit`, clean | `complete` (executable) | **`NO_SETTLEABLE_DELTA`**: `complete` will refuse NO_WORK; the outcome may already be a direct commit; inspect it, retire a redundant task by typed revision, or CHECKPOINT |
| RUNNING + committed delta | `complete` (executable) | `complete` executable (unchanged) |
| no live task / all terminal | `NO_ACTION` "every task is terminal" | **`NO_FORMAL_WORK`**: direct work is allowed; DELIVER if the repository outcome is the deliverable, else plan or CHECKPOINT |
| repository ahead of canonical head | scheduler/READY advice | **`DIRECT_HEAD_AHEAD`**: both heads shown; no auto-promotion; operator must decide |

Mapping to the prompt's state list:

| state | PNWF observation |
|---|---|
| A. Worker active, no commit yet | `liveness=ACTIVE`; `WAIT_ACTIVE_WORK` false, workers/stop, session option |
| B. Worker exited, no commit | `liveness=EXITED`, `worldHead==base`; `NO_SETTLEABLE_DELTA`, CHECKPOINT/retire |
| C. Worker liveness unknown | `liveness=UNKNOWN`; not executable; relay successor/workers; no claim of exit |
| D. World contains a valid committed delta | `worldHead!=base`, clean; `complete` executable |
| E. World contains uncommitted work | `uncommittedChanges>0`; not executable; commit/discard |
| F. World HEAD equals the attempt basis | `worldHead==base`; `NO_SETTLEABLE_DELTA` |
| G. Direct commit already contains the outcome | `directOutcome` `IN_SYNC`/`DIRECT_AHEAD`; `NO_FORMAL_WORK` or `DIRECT_HEAD_AHEAD` |
| H. Formal candidate already settled | task `VERIFYING`; `WAIT_OPERATOR_ACCEPT` (unchanged) |
| I. Task awaiting operator | task `VERIFYING`; `WAIT_OPERATOR_ACCEPT` (unchanged) |

The zero-delta detail is deliberately explicit:

> "the attempt's world has no commit beyond its basis (world HEAD = base), so `complete` will refuse
> NO_WORK — the work may already exist as a direct commit at the basis. Do not retry the same
> complete. Inspect the repository outcome; if this formal task has no independent goal, retire it
> with a typed plan revision; if the session must end, record a CHECKPOINT"

and the session option is returned separately:

```json
"session": {
  "mayEnd": true,
  "action": "palimpsest_work action=conclude intent=CHECKPOINT",
  "detail": "the session can end with the open attempt recorded as an unresolved fact. A CHECKPOINT does not settle the attempt, accept an artifact or mark the project complete"
}
```

### 3.4 The refusal paths

- `complete taskId=...` on a zero-delta world returns `NOT_READY` with next actions:
  "do not retry complete", "conclude intent=CHECKPOINT", "plan changeClass=behavior_change
  changedIds=[taskId]".
- `complete` without a taskId catches the known `NOT_READY` / `NO_WORK` / `WORKER_ACTIVE` failures
  and returns the same guidance instead of a bare error.
- `WORKER_ACTIVE` names `workers`, `stop` and the session CHECKPOINT (with the explicit note that it
  does not stop the worker).
- `NO_RUNNING_ATTEMPT` names the direct-conclusion, typed-retirement and delegate routes.

### 3.5 Acceptance

`test/pnwf_product.test.ts` "Case 3 + Case 5" constructs a RUNNING zero-delta attempt with
`prepareMutatingWork`, asserts `NO_SETTLEABLE_DELTA` (not executable, CHECKPOINT session), asserts
`complete` returns `NOT_READY`/`NO_WORK` and the remediation, and asserts a CHECKPOINT leaves the
task ACTIVE. A pure test asserts `liveness: ACTIVE` returns `WAIT_ACTIVE_WORK` (not executable) and
a committed delta returns the ordinary executable `complete`.

---

## 4. PNWF-B — direct outcome continuity

### 4.1 Three realities, one observation

| reality | how the product sees it | what it does NOT claim |
|---|---|---|
| `WORKTREE_ONLY` | the artifact is present; `committed=false`, `commit=null`, `source=WORKTREE`; a provenance warning is recorded; `status.directOutcome.uncommittedPaths` lists the path | it is not persisted in Git |
| `DIRECT_COMMIT` | the artifact is present, tracked, clean and in HEAD; `commit` is the OBSERVED `git rev-parse HEAD`; the conclusion's basis head and the artifact commit are both recorded | it is not a Worker Result, not promoted, not accepted |
| `GOVERNED_RESULT` | the existing result-commit candidate path (`source=RESULT_COMMIT`, `commit=resultCommit`) is unchanged | it is not promoted or accepted automatically |

The only code change in provenance is `src/composition/continuity.ts`: a committed worktree artifact
now records the observed HEAD instead of `null`. The artifact type already carried
`present/tracked/committed/digest/source/commit`; no new store or registry was added.

### 4.2 Empty-task project

`palimpsest_start` with `tasks: []` already worked; the stage verifies it and makes the guidance
useful. The open shape is:

```
project created at HEAD B (declared basis verified against the repository)
    → no tasks, no attempts, no promotions
    → status: NO_FORMAL_WORK, directOutcome IN_SYNC
    → conclude DELIVER with the committed artifact
    → episode DELIVERED; artifact commit = B
    → a NEW product instance on the same state reads DELIVERED from the pulse
```

`palimpsest_start` now validates a supplied `headCommit` against the repository's actual HEAD. A
mismatch is `HEAD_CONFLICT`; an unreadable head is `HEAD_UNOBSERVABLE`. An arbitrary model-supplied
commit is no longer accepted as the project's basis.

### 4.3 Interrupted direct draft

Case 2: the first session leaves `docs/draft.md` uncommitted. The second session's `status` shows it
in `uncommittedPaths`; `conclude DELIVER` records `committed=false`, `commit=null` and a warning
("not tracked" / "tracked but not in HEAD" / "uncommitted"). The product never claims the draft is a
committed result. The real-host P0/P1 sessions exercise the same interruption: P0 writes the draft
and exits; P1 reads it, finishes and commits it; no regeneration and no fake worker attribution.

### 4.4 Currentness and idempotency

- Reading the pulse/status does not append journal events; the Case 1 test reads it twice and asserts
  the journal length is unchanged.
- A recorded artifact whose bytes change is reopened by the existing episode currentness check. The
  Case "recorded artifact that moves" test asserts `REOPENED`/`STALE`, `current=false`, and that the
  conclusion still names the OLD commit (`head`), not the new one.
- A commit SHA recorded once is never silently rewritten to a later commit.

---

## 5. PNWF-C — legitimate governance transition

`status.directOutcome` is a separate fact from `status.headCommit`:

```json
"directOutcome": {
  "repositoryHead": "<physical HEAD>",
  "projectHead": "<canonical ProjectIR head>",
  "relation": "IN_SYNC | DIRECT_AHEAD | DIVERGED | UNOBSERVABLE",
  "uncommittedPaths": ["..."]
}
```

When the repository is ahead of the canonical head, `nextAction` is `DIRECT_HEAD_AHEAD` with both
short SHAs and the refusal text: the direct commit is not a governed result, the canonical head is
not advanced by ordinary Git, governed work must not start at the stale basis, and the operator must
decide (accept the direct outcome outside the project or establish a new basis through the existing
authority path).

The existing `prepareMutatingWork` guard is unchanged and remains the enforcement point:

```
HEAD_BASIS_MISMATCH: the repository is at C, the project head at B, the proven effect head at B
and the task's base at B — a worker's world must start where its envelope says the work starts
```

No code sets `project.headCommit = actualGitHead`. No second head, promotion ledger or acceptance
path was added. The Case 6 test asserts the two heads, `DIRECT_AHEAD`, the refusal and that the
canonical head is still `B` after the observation.

---

## 6. PNWF-D — redundant formal work

### 6.1 The negative control

A zero-delta RUNNING attempt is **not settleable**. `complete` returns `NOT_READY` with
`NO_WORK: the world holds no observable change against its base`. `NO_WORK` was not relaxed.

### 6.2 The positive path

The existing typed invalidation is the legal owner-mediated route:

- A `CREATED` attempt that never had a world: `plan` with
  `changeClass=behavior_change`, `changedIds=[task]`, and the task removed from `tasks` stales the
  task in the same revision batch. The attempt becomes orphaned history; no `ATTEMPT_COMPLETED`,
  `WORKER_INVOCATION` or `PROMOTION_COMMITTED` is fabricated.
- A `RUNNING` attempt whose world may still have a writer: the typed revision is refused with
  "a RUNNING attempt has an execution world this host has not observed finish. Relay it as a
  successor … before a structural revision". `relay successor` closes the position and returns the
  retained world's reuse facts; the task returns to READY; then the typed revision stales it.
- A live worker job (QUEUED/RUNNING) is refused before the revision. The model cannot retire a live
  worker's position with a boolean or a generic cancel.

The `plan` tool schema now exposes the existing `changeClass` and `changedIds` arguments (it
previously dropped them at the normal adapter). No new action, runtime or ledger was added.

### 6.3 CHECKPOINT is not completion

The zero-delta test records `conclude CHECKPOINT`; the conclusion's own check contains
`openTasks: ["verify:ACTIVE"]` and `openAttempts: ["verify:RUNNING:unobserved"]`, and the task
remains ACTIVE. The episode ends; the formal Work does not become SATISFIED, accepted or promoted.

---

## 7. PNWF-E — normal product experience

- The normal `status` now carries the attempt execution facts, the direct outcome, the blockers and
  the separate session option; `nextActions` contains a `session:` line when a legal episode exit
  exists.
- The `complete` refusals name the legal alternatives instead of looping back to `workers`/`status`.
- The `palimpsest_work` description begins with the direct-work posture: a formal Task is not
  required for every edit; do not recreate work that is already committed; a zero-delta attempt
  cannot be completed; a redundant task is retired by a typed plan revision; conclude is the
  episode-level exit.
- The behavior is derived from state, not from a hidden instruction. The same status shape is what
  the tests assert.
- Public API/architecture checks pass; the controller hotspot did not grow (the new observation
  lives in `src/work/attempt_execution.ts`).

---

## 8. Tests and host runs

### 8.1 Deterministic product qualification

`test/pnwf_product.test.ts` — 11 tests, all passing:

1. no-task project + direct DELIVER, no ATTEMPT/PROMOTION events, new session reads DELIVERED,
   repeated pulse does not append journal entries;
2. uncommitted draft reported as uncommitted, never as committed;
3. direct DELIVER advisory: no promotion, no attempt, no accepted asset;
4. zero-delta RUNNING attempt: `NO_SETTLEABLE_DELTA`, `complete` NO_WORK, CHECKPOINT recorded, task
   still ACTIVE, typed retirement refused while the world is unproven, `relay successor` then typed
   retirement succeeds;
5. pure `ACTIVE`/`UNKNOWN` liveness is never a settleable completion; a committed delta with a
   confirmed `EXITED` worker is the ordinary executable `complete`;
6. direct commit ahead: both heads, `DIRECT_HEAD_AHEAD`, `HEAD_BASIS_MISMATCH`, canonical head
   unchanged;
7. committed world delta still settles and stops at VERIFYING, no promotion;
8. missing artifact DELIVER refused;
9. recorded artifact change reopens, old commit retained;
10. unobservable repository is `UNOBSERVABLE`, not `IN_SYNC`;
11. a supplied basis must equal the repository HEAD (`HEAD_CONFLICT`).

### 8.2 PNWF direct-host scenario (real DSH host, no worker)

`scripts/pnwf/run_direct_host.sh` on `@deepseek-ai/dsh@0.2.1-rc.5`:

| fact | value |
|---|---|
| sessions | P0 draft (uncommitted), P1 commit + status + DELIVER, P2 pulse |
| canonical head | `d52f22c0b9a30d10096be3cddc62c870beb19ab4` |
| subject | `direct outcome from native work` |
| canonical suite | `node --test` exit 0 |
| tasks / attempts / promotions | 0 / 0 / 0 |
| DELIVER recorded | true |
| artifact provenance | both artifacts: committed=true, source=WORKTREE, commit=`d52f22c0b9a3` |

The project basis is `284cd1d…`; the direct commit is `d52f22c…`; the canonical ProjectIR head did
not move. This is the real-host proof of the direct-outcome shape, including a new session reading
the result.

### 8.3 Governed-path regression on the same build

The existing PSVR-A and PSVR-B host scenarios were re-run on the PNWF build:

- PSVR-A: canonical suite 14/14; all sessions P1, P2, CLOSE, CONTINUE, P4, P5 exit as expected;
  promotion/VERIFYING/relay successor path unchanged.
- PSVR-B: `check.mjs --final` PASS, 46 assertions; the field survey supersession and all downstream
  artifacts unchanged.

The local `~/.dsh` had drifted to `0.2.2-rc.1`, whose worker tool surface no longer offers
`run_code`; the first PSVR-A attempt failed there for that reason. The runners now accept
`PSVR_DSH_BIN` / `PSVR_DSH_MODULES` and were run against the qualified `0.2.1-rc.5`. This is
environment drift, not a PNWF regression; the pinned CI version is unchanged.

### 8.4 Full suite and failure attribution

`pnpm test` on this machine (local DSH `0.2.2-rc.1`, default 120s timeout) reported **456 files /
5,724 tests, 5,628 passed / 96 failed (39 files)**. The failures were re-run and attributed:

- **One real PNWF regression, fixed.** `test/architecture/sr2b3_attempt_execution_owner` correctly
  refused `execFileSync` in `src/work/attempt_execution.ts`. `observeStatusFacts` was moved to
  `src/work/read_model.ts` (the existing Work read owner, already imported by the controller); the
  boundary test now passes 13/13 and the controller hotspot did not grow.
- **Nine DSH-host tests fail on the local DSH drift.** `trajectory_p2e0_source_to_dsh`,
  `trajectory_p2e1rg_precreate_admission` and `trajectory_v0s_cold_read` fail with
  `invalid plugin, expect function or object with an "apply" method, received undefined` from the
  local `@deepseek-ai/dsh@0.2.2-rc.1` cordis path. The real host runners use the qualified
  `0.2.1-rc.5`; PSVR-A and PSVR-B pass there. This is the same HR-27 drift, independent of PNWF.
- **The slow Windows cleanup suites hit the default timeout.** `r3l0c_g0_cleanup` passes **10/10**
  with `--testTimeout=300000`; under the full parallel load its 8 heavy cases exceed 120s. The other
  cleanup-family files were not each re-run individually; their full-run failures have the same
  timeout shape and no PNWF code is on that path.
- **The remaining promotion/authority/continuity suites pass when re-run as a group.** The 20-file
  group containing the non-DSH failures returned **205/214**; the 9 failures are exactly the three
  DSH files above. The full-run failures in those files were parallel-load/timeout, not product
  assertions.

Targeted results on the final build: PNWF **11/11**, architecture boundary **13/13**, `pnpm
architecture:check` **PASS**, `pnpm architecture:check-public-api` **PASS**, PSVR-A **14/14**,
PSVR-B **46 assertions PASS**, PNWF direct host **PASS** (tasks/attempts/promotions 0, DELIVER
recorded). After the VERIFYING/direct-head priority fix, the PR `unit` job passed (4,958 tests at
that point) and the full required check set was green; the 5,628/5,724 run above is retained as the
failure-attribution record, not as the final PR state.

---

### 8.5 Real-model continuation cohort (authorized)

After the engineering stage, the owner authorized a two-session continuation cohort
(`research-evidence/pnwf/live/`). Each session resumed a **copy** of the recorded PSVR-C A-2 post-kill
state with the exact A2 prompt; the prompt never mentions CHECKPOINT, conclude, plan or an expected
exit. Budget 2,500,000 per session, 5,000,000 aggregate; the gate is
`scripts/pnwf/run_pnwf_live.mjs` (plan-only `modelCalls: 0`, missing auth exit 2, missing adapter
exit 3, aggregate guard before each session).

| | software | energy | historical software A-2 | historical energy A-2 |
|---|---:|---:|---:|---:|
| tokens (stream sum) | 1,579,080 | 1,076,629 | 1,331,902 | 1,901,695 |
| exit | natural 0 | natural 0 | budget stop | budget stop |
| `complete` calls | **0** | **0** | 1 | 2 |
| `conclude` calls | **1** (DELIVER) | **1** (DELIVER) | 0 | 0 |
| typed `plan` calls | 2 | 2 | 0 | 0 |
| relay calls | 2 | 2 | 0 | 0 |
| final task(s) | all STALE | STALE | ACTIVE | ACTIVE |
| final attempt | CANCELLED | CANCELLED | RUNNING | RUNNING |
| promotions | 0 | 0 | 0 | 0 |
| canonical head | unchanged `453aa7f` | unchanged `e631160` | unchanged | unchanged |

Aggregate **2,655,709 / 5,000,000**; historical closures **3,233,597**; delta **−577,888 (−17.87%)**. The energy ledger sampled 1,008,844 before the final step; the stream sum includes the final 67,785-token step (the same correction as PSVR-C F-2).

Both sessions independently re-read the committed artifacts and verified them (software:
`node --test --test-isolation=none` → 26/26; energy: re-derived the package and recorded a
verification note), then closed the empty attempt as a successor, retired the redundant task graph by
typed plan revision, and recorded an advisory `DELIVER`. Neither accepted an artifact, promoted a
result or moved the canonical head.

**H1 — supported.** Zero `complete` calls in both sessions; the historical sessions made one and two.
No repeated failing complete.

**H3 — supported.** Both sessions used the legal path (relay successor → typed plan retirement →
DELIVER). The conclusion states it is not acceptance; the tasks are STALE and the attempt CANCELLED.

**H5 — mixed.** Energy is below its historical closure (1.08M vs 1.90M) and the aggregate is 17.9%
lower, but software is above its historical closure (1.58M vs 1.33M). The software session also
performed a full re-verification and wrote a journal record, which the historical loop did not; the
comparison is descriptive. **H2/H4 were not tested here** (H2 is covered deterministically; H4 by the
deterministic tests and PSVR-A/B).

**Validity.** The software session discovered and read the original PSVR-C harness under `%TEMP%`
(`constraint.md`, `core.json`, `prompts/A2.txt`, `out/score.json`, `out/A-2/STOPPED.json`,
`out/A-2/snapshot.json`) before closing. It explicitly debated the ethics, did not open the
reference-solution world, but the score and the historical budget-stop facts may have influenced its
closure. The energy session stayed in-world. **The software result is exploratory/contaminated; the
energy result is the cleaner signal.** Future sessions must isolate the harness root from the
principal's readable tree.

Detailed trajectory and behaviour: [`PNWF-LIVE-TRAJECTORY.md`](PNWF-LIVE-TRAJECTORY.md).

Limits: n=1 per stage; recorded-state continuation rather than a fresh start; the historical sessions
are the comparison, not a randomized control; no second sample was authorized.

## 9. Code-level answers

**Where is Action Guidance derived?**
`src/domain/work_state.ts` `explainWorkState()` (pure). The controller feeds it observed attempt
facts and the direct-outcome relation; the DSH adapter passes the result through `safeStatus`.

**Why is `complete` no longer wrongly recommended?**
The RUNNING branch reads `WorkAttemptExecution`. `worldHead === baseCommit` and a clean world is
`NO_SETTLEABLE_DELTA`, not executable; an active worker, an unobservable world or uncommitted work
are also non-executable with their own explanations.

**How does it distinguish an active worker from an empty attempt?**
`liveness` is `ACTIVE` when an invocation is OPEN, `EXITED` when the last invocation ENDED,
`NEVER_STARTED` when no invocation exists, `UNKNOWN` otherwise. A zero-delta `ACTIVE` worker is
never called settled; a zero-delta `EXITED`/`NEVER_STARTED` attempt still cannot `complete`.

**How does a Direct Outcome get a Git identity?**
`observeStatusFacts()` reads `git rev-parse HEAD` and the canonical worktree changes; the episode
artifact observer records the blob digest and the observed HEAD as `commit` for a committed worktree
artifact. A result-commit candidate keeps its `resultCommit`.

**Where is a Direct Result stored?**
In the existing project journal/episode conclusion and the existing ProjectWorkspace artifact
reference. No DirectResultStore, registry or second ledger exists.

**Does it use the existing ProjectWorkspace?**
Yes: the conclusion is an ordinary `REFERENCE_NOTE` journal entry written by
`ProjectWorkspaceService.recordJournalEntry`; the artifact provenance is the existing
`EpisodeArtifactState`; the pulse already projects the journal.

**Was a new canonical state added?**
No. The ProjectIR, task, attempt, evidence, promotion and episode schemas are unchanged. The new
status fields are derived reads (`execution`, `directOutcome`, `session`).

**Does ProjectIR Head change on a direct commit?**
No. `status.headCommit` and the ProjectIR stay at the project basis. `directOutcome` reports the
physical head separately, and `prepareMutatingWork` refuses `HEAD_BASIS_MISMATCH`.

**How does later governed work get a new basis?**
It does not get one automatically. The operator must use the existing acceptance/authority path to
establish a new basis; until then governed work is refused. No trusted head advance was added.

**How is redundant formal work handled?**
By the existing typed plan revision (`changeClass` + `changedIds`), after a `relay successor` if a
RUNNING world cannot be proven quiescent. A live worker job or an unproven world refuses the
revision. No `forceCancel` or `redundant=true` exists.

**Does CHECKPOINT preserve open Work facts?**
Yes. The conclusion's check lists open tasks and open attempts; the task stays ACTIVE; the attempt
stays RUNNING. CHECKPOINT is not SATISFIED, not acceptance and not promotion.

**Why is Worker Attribution not fabricated?**
The direct path creates no attempt and no worker invocation; the artifact source is WORKTREE with a
Git commit. The governed path still uses `AttributionSettlement`; a principal action is never
reported as worker production.

**Is Operator Promotion unchanged?**
Yes. No promotion path was added or altered; direct DELIVER explicitly records that it accepts no
artifact and promotes no result. The PSVR-A/B promotions still pass the same gate.

---

## 10. Timeline

### 10.1 Direct-host scenario (real DSH host)

```
T0  prepare: project created at 284cd1d… with tasks: [] (declared basis verified)
T1  P0 starts; native work begins
T2  P0 writes docs/draft.md (uncommitted), the first real artifact
T3  P0 exits; the draft remains uncommitted (interruption)
T4  P1 starts; reads the existing draft
T5  P1 finishes docs/result.md and docs/draft.md; git commit -> d52f22c…
T6  P1 `palimpsest_work status`: directOutcome DIRECT_AHEAD, projectHead 284cd1d…, repositoryHead d52f22c…
T7  guidance: DIRECT_HEAD_AHEAD (not auto-promoted); no task/attempt was created
T8  P1 `conclude DELIVER` with both artifacts
T9  episode conclusion RECORDED; artifact commit d52f22c…; no promotion
T10 P2 starts; pulse reads DELIVERED and the same artifact commit
```

### 10.2 Governed path (PSVR-A, unchanged)

```
P1  delegate contract; worker commits; principal readiness/finalize; operator promotes
P2  delegate server; worker commits a unary batch; host killed; attempt RUNNING
CLOSE   relay successor; the retained world and reuse facts are recorded
CONTINUE delegate the successor; the worker pulls the new input and commits; principal settles
P4  delegate client; worker commits; principal concludes WAIT_FOR_OPERATOR
P5  operator accepts; canonical suite 14/14
```

---

## 11. Cost

The deterministic engineering stage ran **0 paid model sessions and 0 tokens**. The separately
authorized continuation cohort ran **2 sessions / 2,655,709 tokens of its own 5,000,000-token
authorization** (software 1,579,080; energy 1,076,629). No PSVR-C or ODPE-R balance was used,
transferred or extended. The historical comparison is the PSVR-C A-2 closures at **3,233,597**
tokens, both ending in a budget stop; the continuation ended naturally in both stages. The energy
ledger sampled 1,008,844 before the final step; the stream sum is 1,076,629.

The cohort supports **H1** (0 `complete` calls vs 3 historical, no repeats), **H3** (2 legal
`DELIVER` conclusions after successor + typed retirement), and **H5 only in aggregate and energy**
(2.66M vs 3.23M overall; energy 1.08M vs 1.90M; software 1.58M vs 1.33M, not below). It is n=1 per
stage and resumes recorded states, so the result is descriptive, not a randomized control.

Separate the two claims:

- **Product-supported legal path**: proven by the deterministic tests and the direct host run.
- **Real model naturally choosing it**: observed in the post-artifact continuation (2/2) but not in a
  fresh-start H2 or a governed-promotion H4 run; those remain deterministic/host evidence, not a new
  paid cohort.

---

## 12. Negative controls

| # | control | where |
|---:|---|---|
| 1 | a wrong user outcome cannot auto-DELIVER | missing-artifact test; DELIVER refused |
| 2 | an active worker cannot be replaced by a direct result | `ACTIVE` guidance test; typed plan live/unproven guard |
| 3 | a zero-delta attempt cannot fake completion | zero-delta test: `complete` NOT_READY/NO_WORK |
| 4 | CHECKPOINT cannot make a task SATISFIED | zero-delta test: task still ACTIVE, conclusion check lists it |
| 5 | a direct commit is not an accepted asset | direct DELIVER tests: promotions 0 |
| 6 | unobservable Git/host facts are not "fine" | `UNOBSERVABLE` test; world-unobservable guidance |
| 7 | repeated reads do not duplicate journal records | Case 1 pulse idempotence |
| 8 | a recorded commit change does not rewrite history | reopen test: old commit retained |
| 9 | a model declaration cannot replace Promotion/independence | no promotion path added; direct DELIVER advisory |
| 10 | no repeated invalid mechanical action | zero-delta status remains `NO_SETTLEABLE_DELTA`; `complete` refusal says "do not retry" |

---

## 13. Limits

- **The deterministic host scenarios use a labelled stand-in**, not a model; the real-model evidence
  is the separate continuation cohort (2 sessions, n=1 per stage, recorded-state resumption). The
  autonomous fresh-start H2 and governed H4 behavior remain unmeasured.
- **DSH drift.** The local install was `0.2.2-rc.1`; the qualified `0.2.1-rc.5` was used explicitly
  for the host runs. Three DSH trajectory test files fail on the local drift
  (`invalid plugin ... received undefined`); this is the HR-27 environment, not a PNWF path. The
  runner env override is a testability change; the CI pin is unchanged.
- **Full-suite result is not a green 5,724-test run.** The 96 failures are attributed in §8.4: one
  fixed architecture regression, nine DSH-drift tests, and slow Windows cleanup/promotion tests
  that pass with a longer timeout or in a smaller group. The PR `unit` job passed after the fix
  (4,958 tests at that point); the 5,724-test run is retained as the failure-attribution record.
- **Direct host is one domain.** The direct-host scenario uses the software fixture. PSVR-B and the
  live continuation cover the cross-domain governed path; the PNWF rules themselves are
  domain-agnostic.
- **A RUNNING attempt plus a concurrently moved canonical head** is not given a dedicated new
  guidance branch: the RUNNING facts win, and settlement against a moved base still refuses
  `BASE_DRIFT`. The operator path remains the honest recovery.
- **`complete` without a taskId** catches the known NOT_READY/NO_WORK/WORKER_ACTIVE errors and turns
  them into guidance; other errors still propagate.
- **No new PSVR-C/ODPE-R cohort or balance transfer.** The continuation cohort has its own
  5,000,000-token authorization and used 2,655,709; the PSVR-C/ODPE-R balances are untouched.
- **The recorded PSVR-C states were not modified.** The replay, the live continuation and all new
  tests operate on disposable copies/temp trees.

---

## 14. Architecture judgment

**Ordinary default path:** direct Git work; project creation with or without tasks; status/guidance;
project observation (physical head, uncommitted paths, artifact provenance); episode conclusion
(DELIVER / CHECKPOINT / WAIT_FOR_OPERATOR); the existing ProjectWorkspace/journal.

**Opt-in trusted enhancement:** formal Work, Attempt, Execution World, delegation, relay/successor,
Result Continuation, completion contract, verification, Promotion and Operator acceptance. These
are used when their boundaries matter — isolation, independent verification, acceptance, long
governed projects — not for every edit.

**Not merged:** the canonical ProjectIR head and the physical Git head stay distinct; Promotion
remains the only authority that advances the canonical head; a direct commit is never silently
adopted. The default complexity follows the actual work, not the formal lifecycle.

---

## 15. Git report

- Baseline: `db6c37b` (parent `origin/main` `4597d81`), tree `c634d98`.
- Product PR: #224 (`palimpsest-project-native-workflow`) merged at
  `f6bfe6abda48753abdc83cde472dbc7bad3e01b5` (2026-11-06T11:56:03Z); all required checks passed
  (`unit`, `e2e`, `host-boundary`, the gates, `package-smoke`).
- Follow-up cohort branch: `pnwf-live-cohort`; delivery commit is the commit that adds this report;
  final HEAD/tree are reported by `git log -1 --format=%H -- docs/engineering/PNWF-RESULT.md` and
  `git rev-parse HEAD^{tree}`.
- Source changes: `src/domain/work_state.ts`, `src/domain/completion_contract.ts`,
  `src/work/read_model.ts`, `src/work/attempt_execution.ts` (import cleanup),
  `src/tools/controller.ts`, `src/tools/tools.ts`,
  `src/adapters/dsh/common.ts`, `src/adapters/dsh/normal.ts`,
  `src/composition/continuity.ts`, `src/project_continuity/service.ts`,
  `src/project_continuity/types.ts`; test `test/pnwf_product.test.ts`; host scripts
  `scripts/pnwf/*` (direct host + live continuation); `scripts/psvr/session_attribution.mjs`
  (result `isError`/row-kind correction); runner env overrides in
  `scripts/psvr/run_psvr_a.sh` / `run_psvr_b.sh`; analysis `docs/engineering/PNWF-LIVE-TRAJECTORY.md`.
- Evidence: `research-evidence/pnwf/2026-11-06/` and `research-evidence/pnwf/live/2026-11-06/`; the
  local trajectory evidence remains at `research-evidence/psvr/2026-11-05/`.
- Working tree: clean after the delivery commit. PR #224 is merged; the cohort follow-up is a
  separate PR. No force-push and no history rewrite.
- PR #220 and the earlier PSVR merges are untouched.

---

## 16. Q1–Q10

**Q1.** Yes. A no-task project observes a direct commit, records DELIVER with the real commit, and a
new session reads it; the direct host run, Case 1/2 and both real continuation sessions prove it. No
re-production is required.

**Q2.** No. A zero-delta RUNNING attempt is `NO_SETTLEABLE_DELTA`, not executable; `complete`
returns `NO_WORK` and names the legal alternatives. Tested; both real sessions made zero `complete`
calls.

**Q3.** Yes. The same status carries `session.mayEnd=true` with
`palimpsest_work action=conclude intent=CHECKPOINT`, and the refusals name the typed-retirement and
checkpoint routes. Both real continuation sessions used the legal ending (DELIVER after successor +
typed retirement); neither claimed project completion.

**Q4.** Yes. `palimpsest_start` accepts `tasks: []`; status says `NO_FORMAL_WORK`; DELIVER records
the Git artifact; the journal/pulse carries the episode to the next session. Tested and host-run.

**Q5.** Yes. `directOutcome` shows physical vs canonical; `DIRECT_HEAD_AHEAD` explains the conflict;
`HEAD_BASIS_MISMATCH` refuses governed work; the canonical head does not move. Tested.

**Q6.** Yes. A CREATED redundant task is retired by the existing typed plan revision; a RUNNING
unproven world is closed by `relay successor` and then retired; a live worker job refuses. Tested,
and both real continuation sessions did exactly this (2 relay + 2 typed plan each).

**Q7.** Yes. The PSVR-A host path still settles, verifies and promotes (14/14); PSVR-B still passes
46 assertions. Case 4 settles and stops at VERIFYING; Promotion remains operator-only.

**Q8.** Yes. The real continuation sessions are the next-session case: they resumed the recorded
project, re-verified the outcome, retired the redundant work and ended, instead of entering the empty
attempt loop.

**Q9.** In the real continuation the repeated failed `complete` disappeared (0 vs 3 historical calls)
and both sessions ended naturally (vs two budget stops); aggregate tokens fell 17.9% (2.66M vs 3.23M),
but software rose 18.6% while energy fell 43.4%. The software evidence is confounded by harness reads. The coordination-protocol savings are real but not
uniform; no new protocol or runtime was added.

**Q10.** Yes. CHECKPOINT is an episode record; direct DELIVER is advisory; formal Work completion is
`complete`/settlement; acceptance is Operator/Promotion. The tests assert each boundary separately.
