# PNWF-CQ — Action Coherence & Evaluation Qualification

**Status:** implementation complete; no paid model session was started.
**Baseline:** `464ae5fc086af5e372295d047c98144dc22a5c77` (PR #226 merge, `origin/main`).
**Branch:** `palimpsest-pnwf-action-coherence`.
**Scope:** bounded product integration, execution-boundary qualification and experiment-infrastructure repair.
No new runtime, second head owner, promotion ledger, scheduler, planner or liveness runtime was added.

## 1. What this stage changed

| Workstream | Product change | Evidence |
|---|---|---|
| CQ-A Action coherence | `readiness` now reuses the `status` attempt/direct-outcome facts, checks uncommitted work before zero-delta, and says “no settleable candidate delta; formal completion is not ready; assess the actual outcome separately” instead of “the actual work is still outstanding”. | `src/application/work_outcome.ts`, `src/domain/work_state.ts`; `test/pnwf_cq_action_coherence.test.ts` |
| CQ-B Host-local liveness | `NEVER_STARTED` is replaced by `UNOBSERVED`. An empty invocation ledger means “this host observed no window”, never “no worker ran” and never “the writer stopped”. Status/readiness expose the fact; a principal settlement is attributed `UNATTRIBUTED` and never claims an observed exit. | `src/work/read_model.ts`, `src/domain/work_state.ts`, `src/application/work_settlement.ts`; cross-host test |
| CQ-C Successor guidance | `status.nextAction.semantic` carries the business question and the legal routes while `nextAction` keeps the Scheduler’s mechanical legality unchanged. | `src/domain/work_state.ts`, `src/adapters/dsh/common.ts`; CQ-C test |
| CQ-D Plan invalidation | The normal plan tool now refuses `changedIds` with `metadata_only`/`backward_compatible` (they never invalidate) and accepts it only for `behavior_change`/`contract_breaking`. Retirement guidance is “remove the task from the graph when quiescent”, not “mislabels it as metadata invalidation”. The final owner (`planReconciled`) also rechecks the invocation ledger for an OPEN worker on any task the revision would stale, closing the adapter-snapshot TOCTOU. | `src/adapters/dsh/normal.ts`, `src/tools/controller.ts`; CQ-D tests |
| CQ-E Journal projection | An unresolved `REFERENCE_NOTE` with a structured commit ref, or a product record provenance (`episode:`, `relay:`), is a recorded observation, not an open question. A note with no such identity stays conservative. | `src/project_continuity/service.ts`; CQ-E test |
| CQ-F Evaluation isolation | A Docker boundary runs the principal as uid 1001 in its own mount namespace; `/workspace` is writable and `/harness` is a root-owned 0700 read-only volume. The external scorer reads the harness as root outside that namespace. The paid gate rejects a run without a `container` isolation record. | `scripts/pnwf/isolation_gate.mjs`, `isolation-gate.json` |
| CQ-G Scoring/accounting | Natural exit, episode conclusion, task retirement and budget stop are separate facts. Token accounting reports stream total, ledger snapshot, delta, cache read, fresh input and output; an unreadable stream is not a trustworthy zero. Domain refusals are counted separately from protocol errors. | `score_continuation.mjs`, `session_attribution.mjs`; `live/rescore.json` |
| CQ-H Direct→Governed | The boundary is proved, not papered over: a direct commit C is shown as `DIRECT_HEAD_AHEAD`; a worker is refused with `HEAD_BASIS_MISMATCH`; the head owner will not advance to an unproven commit; no promotion is fabricated. | deterministic test + real DSH host `direct-governed/` |
| Execution-world export | A caller-supplied Git port’s own world path now wins over the deployment’s default `worldsRoot`, so a world created under `.palimpsest/worktrees/<id>` can be exported instead of returning `WORLD_MISSING`. | `src/deployment/execution_world.ts`, `src/composition/core.ts`; `lean_work_execution_world.test.ts` 7/7 |

## 2. Causal chains

### 2.1 `status` vs `readiness` (CQ-A)

```
PSVR-C / PNWF live state: RUNNING attempt, world HEAD = base, direct commit already in the repository
  ↓
status: NO_SETTLEABLE_DELTA (world HEAD = base; complete would refuse NO_WORK)
readiness: CONTINUE_WORK, "the actual work is still outstanding"
  ↓
source cause: work_outcome.ts checked worldHead === baseCommit BEFORE uncommittedChanges,
and phrased a formal-attempt fact as a judgement about the user's outcome
  ↓
change: reuse the status execution/directOutcome facts; uncommitted first; fact-only wording;
SEMANTIC_JUDGEMENT when a direct commit exists; expose directOutcome/liveness in readiness
  ↓
new behaviour: both entries say "no settleable candidate delta; formal completion is not ready;
assess the actual outcome separately", and the direct commit is named with its SHA
  ↓
negative controls: zero-delta with direct commit; world at base with uncommitted edits;
empty world with no direct outcome (CONTINUE_WORK remains correct)
```

### 2.2 Host-local absence (CQ-B)

```
Host H1 observes an OPEN worker invocation.
Host H2 opens the same project with a fresh (empty) invocation ledger.
  ↓
old status: liveness = NEVER_STARTED ("the executor never started")
old readiness: processExit = UNKNOWN, mechanical finalization still available
  ↓
source cause: an empty HOST-LOCAL ledger was read as a historical fact; the ledger is
non-durable by design (`ExecutionInvocationLedger` documentation)
  ↓
change: liveness = UNOBSERVED; status/readiness say "no invocation record on this host; not proof
a worker never started, not proof a previous writer stopped"; complete attributes UNATTRIBUTED and
says it is a principal settlement
  ↓
negative control: H1's own settlement refuses WORKER_STILL_RUNNING; H2 settles but cannot claim an
exit, and the result names UNATTRIBUTED
  ↓
remaining boundary: the product cannot mechanically prove cross-host writer quiescence. It does not
claim it. A future stage can require an explicit principal-authored declaration for a worktree
completion when liveness is UNOBSERVED (see §7).
```

### 2.3 Successor guidance (CQ-C)

```
relay successor → task READY → status: EXECUTE_SCHEDULER_STEP
```

That return is correct for the Scheduler. CQ-C adds `semantic` to that same action:

- question: does the formal task still carry an independent objective now that a direct outcome exists?
- facts: repository head, canonical head, relation; “mechanically legal” is not “still needed”.
- options: continue genuine work; retire a redundant task through the plan; CHECKPOINT if it remains open.

The Scheduler’s legal decision is unchanged.

### 2.4 Invalidation classes (CQ-D)

```
metadata_only + changedIds → computeInvalidationSet returns ∅ (by design)
  ↓
the old tool description called every class "typed invalidation" and said changedIds "settles
EXACTLY those tasks"
  ↓
the live model used metadata_only to retire three tasks; the tasks were actually removed by the
ordinary graph revision (`tasks: []`), not invalidated by the class
  ↓
change: class-specific description; changedIds with a non-invalidating class is refused with the
two honest routes named
  ↓
TOCTOU: the adapter reads the host job map, then calls plan; a worker can begin in between
  ↓
final-owner recheck: planReconciled reads the invocation ledger for every task it would stale and
refuses with quiescence_required while an invocation is OPEN
  ↓
negative control: metadata_only yields no invalidation set; behavior_change still propagates a → b;
the normal tool retires a redundant task through `tasks: []` after quiescence; an OPEN invocation
still refuses the revision at the owner, and the same revision succeeds after the observed ENDED
```

### 2.5 Journal projection (CQ-E)

```
Verification note (REFERENCE_NOTE, relatedRefs: commit e631160)
  ↓
ProjectContinuityService put every unresolved REFERENCE_NOTE in openQuestions
  ↓
the next session saw a to-do that did not exist (ProjectWorkspace open_loops was empty)
  ↓
change: a REFERENCE_NOTE with a commit ref is a recorded observation; a product record with
provenance episode:/relay: is also a record; a note with no structured identity stays open
  ↓
negative control: a loose REFERENCE_NOTE and a real OPEN_QUESTION remain in openQuestions
```

### 2.6 Isolation (CQ-F)

```
The software continuation discovered %TEMP%\psvr-c-real and read constraint.md, core.json,
prompts/A2.txt, out/score.json, out/STOPPED.json and snapshot.json.
  ↓
prompt secrecy is not a boundary.
  ↓
gate: principal uid 1001, network none, caps dropped, /workspace writable, /harness root 0700
read-only; Node fs, sh, /proc/1/root and /workspace/../harness all denied; task read/write, Git,
build and dsh --version allowed; the scorer reads /harness as root outside the namespace.
  ↓
status: EVALUATION_ISOLATION_QUALIFIED (16/16 checks).
```

### 2.7 Direct→Governed (CQ-H)

```
Project created at B with a formal task.
Direct commit C exists in Git; canonical ProjectIR head remains B.
  ↓
status: DIRECT_HEAD_AHEAD (not a governed result)
prepareMutatingWork: HEAD_BASIS_MISMATCH
reconcileProjectHead: does not advance (no proven promotion effect)
  ↓
no ATTEMPT_STARTED, ATTEMPT_COMPLETED or PROMOTION_COMMITTED is written.
The only current honest conclusion is CHECKPOINT with the basis question open.
```

This is a **capability gap**, not a successful transition. The current product has no
operator-mediated way to admit C as a new governed basis without inventing a promotion.

## 3. Test results

All commands were run on the PNWF-CQ working tree.

| Command | Result |
|---|---|
| `pnpm build` | PASS |
| `pnpm architecture:check` | PASS, 0 violations, 9 accepted baseline exceptions |
| `pnpm architecture:check-public-api` | PASS, 0 missing, 0 changed kind, 0 added |
| `npx vitest run test/pnwf_cq_action_coherence.test.ts` | 9/9 PASS |
| `npx vitest run test/pnwf_cq_direct_governed.test.ts` | 1/1 PASS |
| `npx vitest run` (20 related files: PNWF, PSVR, ODPE, PWRS, ALHS, ProjectPulse/Continuity, PC1, promotion/head) | 133/133 PASS |
| second related batch (15 files: PC1-V1, lean, workspace, continuity, result integrity) | 115/116; the one failure was the custom-Git-port world root, fixed in `execution_world.ts`; `lean_work_execution_world.test.ts` then 7/7 PASS |
| `bash scripts/pnwf/run_direct_governed_host.sh` | PASS (P0/P1/P2 exit 0) |
| `node scripts/pnwf/isolation_gate.mjs` | `EVALUATION_ISOLATION_QUALIFIED` (16/16) |
| `node scripts/pnwf/score_continuation.mjs --run=<live run>` | 2/2 primary; stream totals 1,579,080 / 1,076,629 |
| full `npx vitest run` (started before the final TOCTOU build) | 46 files failed / 412 passed; 109 tests failed / 5,625 passed (5,734) — timeouts under parallel load, dirty-tree historical guards, missing `python`, DSH drift, and the one CQ TOCTOU test that loaded the pre-build dist. Sequential acceptance re-run after the final build: 47/47 PASS. |
| final sequential acceptance (`--fileParallelism=false`) | 6 files / 47 tests PASS (CQ action coherence 9, CQ direct-governed 1, PNWF product 11, PC1 next-action 6, PWRS relay 14, lean execution world 7) |

The existing PNWF product suite was updated in one place: the zero-delta status now reports
`UNOBSERVED` instead of `NEVER_STARTED`. No assertion was weakened.

## 4. Real host qualification

### 4.1 Direct→Governed host (real DSH 0.2.1-rc.5, deterministic Messages stand-in)

`scripts/pnwf/run_direct_governed_host.sh`:

- P0 commits `docs/direct.md` with native Git; no formal task is created.
- P1 reads status (`DIRECT_HEAD_AHEAD`), calls `delegate` for the existing task, receives
  `HEAD_BASIS_MISMATCH`, and records `CHECKPOINT`.
- P2 reads pulse/status in a new session.

Facts (`direct-governed/result.json`):

| fact | value |
|---|---|
| base head | `4c4bb2c74e54b6353ff5140119d8fe9816d08ea4` |
| world head (direct C) | `333b3e487dec4485dc2f96858d08b6a2ac412506` |
| final task | `governed-next: READY` (not staled, not satisfied) |
| attempts | 0 |
| promotions | 0 |
| `ATTEMPT_STARTED` / `PROMOTION_COMMITTED` | false / false |
| refusal observed | `HEAD_BASIS_MISMATCH` (repository C, project head B, proven effect head B, task base B) |
| conclusion | `CHECKPOINT` recorded |
| session exits | P0/P1/P2 = 0 |

This is the **fail-closed** result the current authority model requires. It is not a Direct→Governed
success; see §7 for the design options.

### 4.2 Isolation canary

`scripts/pnwf/isolation_gate.mjs` (Docker 29.7.2, image `palimpsest-pnwf-isolation:local`,
`node:24-bookworm` + `@deepseek-ai/dsh@0.2.1-rc.5`, principal uid 1001):

| check | result |
|---|---|
| read `/workspace/public.txt` (Node fs) | ALLOW |
| read via native shell (`sh -c cat`) | ALLOW |
| write `/workspace` | ALLOW |
| `git -C /workspace status` | ALLOW |
| build check (`node /workspace/check.cjs`) | ALLOW |
| `dsh --version` | ALLOW (`0.2.1-rc.5`) |
| `/harness/private-canary` (Node fs) | DENY (EACCES) |
| `/harness/private-canary` (shell) | DENY (Permission denied) |
| `/proc/1/root/harness/private-canary` | DENY |
| `/workspace/../harness/private-canary` | DENY |
| `/harness/score.json` | DENY |
| `/harness/rubric.md` | DENY |
| `/harness/reference/solution.txt` | DENY |
| `/harness/other-condition/secret.txt` | DENY |
| `/harness/historical/results.json` | DENY |
| `/harness/config/private.yml` | DENY |
| harness exists (root view) | PRESENT |
| external scorer reads `/harness/score.json` (root) | YES |

The canary runs as the principal uid in the same container/mount namespace a future session must
use. The scorer reads the harness as root outside that namespace.

**Important limit:** the current Windows `run_pnwf_live.sh` still launches DSH on the host, not in
this container. `run_pnwf_live.mjs` now refuses an execute run without a `container` isolation
record, but the record is not yet bound to a containerized adapter. The isolation infrastructure is
qualified; the live adapter integration is **NOT_EXERCISED**. No paid cohort was run.

## 5. Scoring and cost accounting

The corrected scorer separates:

- `EpisodeConclusionRecorded` (journal intent)
- `TaskRetired` (a task is STALE)
- `SessionNaturalExit` (`run.natural === true`, exit 0)
- `BudgetStopped` / `HOST_FAILURE` / `KILLED` / `ABNORMAL_EXIT`
- `TokenEvidenceQualified` (the stream is readable; an unreadable stream is not a zero)

Live rescore (`live/rescore.json`):

| | software | energy |
|---|---:|---:|
| stream total | 1,579,080 | 1,076,629 |
| ledger snapshot | 1,579,080 | 1,008,844 |
| delta | 0 | 67,785 |
| cache read | 1,494,528 | 1,018,496 |
| fresh input | 61,272 | 36,525 |
| output | 23,280 | 21,608 |
| natural exit | yes | yes |
| conclusion | DELIVER | DELIVER |
| task retired | STALE | STALE |
| promotions | 0 | 0 |
| canonical head | unchanged | unchanged |
| domain refusals | 1 | 1 |
| repeated refusals | 0 | 0 |
| primary endpoint | true | true |

Software is above its historical closure (1,579,080 vs 1,331,902); energy is well below
(1,076,629 vs 1,901,695). H5 remains **MIXED**. The aggregate is 2,655,709 vs 3,233,597 (−17.9%);
this is descriptive, not a universal cost claim.

## 6. Experiment qualification report

| item | status |
|---|---|
| Harness Isolation | **QUALIFIED** (container canary; live adapter integration NOT_EXERCISED) |
| Principal Native Read | **qualified** (task read allowed; harness EACCES) |
| Principal Native Shell | **qualified** (task shell/Git/build allowed; harness denied through direct, shell and indirect paths) |
| Other Condition Access | **blocked** (`/harness/other-condition` EACCES) |
| Scoring | **qualified for mechanical facts/accounting**; a new cohort has not been scored |
| Paid Cohort | **NOT_EXECUTED** |

## 7. Direct→Governed capability gap and options

Current facts:

- `ProjectHead` advances only to the **canonical proven promotion effect head**; it refuses an
  unproven advance (`the head drift has no backing promotion fact`).
- A direct commit has no `ATTEMPT_COMPLETED` or `PROMOTION_COMMITTED`; the product cannot invent one.
- A worker must start at the canonical head; `prepareMutatingWork` refuses `HEAD_BASIS_MISMATCH`.
- The only current legal outcome is CHECKPOINT with the basis question open.

This is a real product gap for long-lived projects that begin with direct work and later need a
governed worker. The boundary is fail-closed, so no false provenance is produced.

Options for the next stage:

1. **Operator-mediated basis admission (recommended).**
   Keep `ProjectHead` as the sole owner. Add a narrow operator-only action that admits a named Git
   commit as the new canonical basis, records `source=DIRECT` and the operator identity/reason, and
   does **not** emit `ATTEMPT_COMPLETED` or `PROMOTION_COMMITTED`. The next governed worker starts
   at that admitted basis; the original direct provenance stays visible and the result is not
   labelled as a worker result. Requirements: one owner, signed/audited decision, no automatic
   acceptance, fail-closed on an unobserved or non-ancestor commit.
2. **New project at the direct head.**
   Honest but loses the ProjectIR/task/journal history. It is a migration, not a basis transition.
3. **Worker merges the direct commit.**
   The worker starts at B, merges C, and produces a new result. This changes C's provenance and
   still requires a worker; it does not make C a governed basis. Not recommended.

No option was implemented in this stage because the operator authority model for a basis admission
is not yet defined; implementing one silently would be a second head owner.

## 8. Architecture evaluation

**Which complexity helped the model choose the right action?**
The Work/Attempt/Scheduler/Completion-Contract composition, the direct-outcome projection, and the
episode conclusion. The live cohort used `status` → `relay successor` → `plan` → `conclude` without
a repeated `complete`. The new `semantic` field and the `UNOBSERVED` word make the same facts
usable without adding a mechanism.

**Which actions still require a failed tool call to discover?**
- `relay takeover` without an observed exit requires `declareExecutorAbandoned`; the refusal is the
  first place the boundary is visible.
- `changedIds` with `metadata_only` was silently ineffective; it is now a typed refusal.
- A worktree completion with no observed invocation still succeeds as a principal settlement; the
  `UNATTRIBUTED` result is the only warning.

**Which mechanical steps can be composed rather than reasoned?**
The direct/zero-delta decision, the plan-retirement route, and the readiness/finalize chain are
already deterministic. The remaining multi-turn cost is the model choosing among legal routes.

**Which project mechanisms should always be in context?**
`status.nextAction` (including `session` and `semantic`), the direct-outcome relation, the attempt
liveness word, and the ready/verifying task states. These are the facts the live model actually
used.

**Which Governed Work capabilities should be on demand?**
`delegate`, `relay`, `results`/`continue`, and `finalize`. They are powerful and should not be
advertised as the default path for a direct outcome.

**Is Direct Outcome naturally continuable into governed work?**
Not yet. The product can deliver a direct outcome and retire a redundant task, but it cannot admit
the direct commit as a new basis. §7 names the minimal next step.

**Does Project Head Authority have a real applicability gap?**
Yes: it can only absorb proven promotion effects. A direct commit is a legitimate repository fact
that the current authority model cannot promote without fabrication. The gap is fail-closed and
now documented with a concrete option.

**Did this stage make Palimpsest easier to complete user tasks, or only easier to maintain its own
state?**
The CQ-A/B/E fixes remove misleading statements and false to-dos; CQ-C/D make the legal routes
visible without forcing a failure. CQ-H shows the remaining place where the product still cannot
continue a real user project without an operator decision. The stage improved both, but did not
close the basis-admission gap.

## 9. Limits and validity

- No paid model session was started. The live trajectory evidence is the already-authorized PNWF
  cohort; the rescore is mechanical.
- The software live session is contaminated by reading the original harness. The energy session is
  the cleaner signal. This stage does not turn either into a clean causal proof.
- n = 1 per stage; the historical A-2 sessions are a descriptive comparison, not a randomized
  control.
- The isolation canary proves the container boundary, not the current Windows host live runner.
  The live adapter must be containerized before a future paid cohort; the gate now fails closed.
- The cross-host settlement boundary is reproduced and honestly attributed, but not mechanically
  refused. The residual risk is named in §2.2/§7.
- The Direct→Governed gap is a capability boundary, not a regression; no head advance, promotion or
  worker attribution was fabricated.

## 10. Git and delivery

| item | value |
|---|---|
| Baseline commit | `464ae5fc086af5e372295d047c98144dc22a5c77` |
| Branch | `palimpsest-pnwf-action-coherence` |
| Implementation HEAD | `TO_FILL` |
| Changed production files | `src/domain/work_state.ts`, `src/work/read_model.ts`, `src/application/work_outcome.ts`, `src/application/work_contract.ts`, `src/application/work_settlement.ts`, `src/adapters/dsh/common.ts`, `src/adapters/dsh/normal.ts`, `src/project_continuity/service.ts`, `src/deployment/execution_world.ts`, `src/composition/core.ts`, `src/tools/controller.ts` |
| New tests | `test/pnwf_cq_action_coherence.test.ts`, `test/pnwf_cq_direct_governed.test.ts` |
| New scripts | `scripts/pnwf/isolation_gate.mjs`, `scripts/pnwf/prepare_direct_governed.mjs`, `scripts/pnwf/run_direct_governed_host.sh` |
| Evidence | `research-evidence/pnwf-cq/2026-11-06/` |
| Paid model calls | 0 |
| Paid tokens | 0 |
| Push / PR / merge | not performed by this stage |

The PNWF live cohort (2,655,709 tokens) and the historical PSVR-C evidence are **not** new work of
this stage; they are re-scored, not re-run.
