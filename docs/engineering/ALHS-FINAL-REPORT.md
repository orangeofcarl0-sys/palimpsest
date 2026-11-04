# ALHS — Autonomous Long-Horizon Synthesis: engineering report

Status: **executed through the product, real-host and deterministic-substitute layers; the real-model
F/L/A/G cohort is PRE-REGISTERED and BLOCKED (no ALHS authorization).**

Branch: `palimpsest-autonomous-long-horizon-synthesis`. Base: LHAPE `3782b01`; `origin/main`
`d16800f`. No push, no PR, no merge; `main` was not moved.

## 1. Git facts

| Item | Value |
|---|---|
| Branch | `palimpsest-autonomous-long-horizon-synthesis` |
| Product commits | `e4d1fb1` (episode + reuse + offline diagnosis), `1227a74` (result commit, real-host run, budget reserve) |
| Core run commit | `6527f22` (authorized F/A core harness, result and evidence) |
| Report/protocol commit | recorded by `research-evidence/alhs/2026-11-04/DELIVERY.json` |
| Diff from LHAPE `3782b01..HEAD` | 117 files, +8,957 / −86 |
| Diff from APS main `d16800f..HEAD` | 289 files, +21,731 / −104 |
| Push / PR / merge | none |
| `origin/main` | `d16800fbe3d1a6172b66b466b227c5fddbb45b98` (unchanged) |

## 2. What the LHAPE-C pilot actually showed

Offline replay of the recorded sessions (`research-evidence/alhs/2026-11-04/offline-convergence-analysis.json`)
reconstructs every package write/edit and applies the pilot's pre-registered 7-fact rubric. It makes
no model call.

| | F | L | G |
|---|---:|---:|---:|
| Total tokens | 2,528,297 | 2,562,093 | 2,332,140 |
| First package passing 7/7 | 104,081 (4.1%) | 188,715 (7.4%) | 1,287,138 (55.2%) |
| Tokens after first valid | 2,424,216 (95.9%) | 2,373,378 (92.6%) | 1,045,002 (44.8%) |
| Tool calls after first valid | 65 | 54 | 20 |
| Artifact changes after first valid | 18 | 27 | 2 |
| Artifact versions | 19 | 29 | 4 |
| Natural closing assistant message | no | no | worker yes; host no |
| Stop | ceiling | ceiling | ceiling |

The dominant post-artifact activity was micro-editing, table/format validation, re-reading the same
package, repeated inbox/state checks and `list_agents` polling. Some of it was genuine polish; none of
it was a convergence decision. The product had no representable state for "this episode's work is
done", so the only stopping rule left was the budget guard. G's worker did emit a closing message,
but the host continued verifying and editing for another minute and was stopped mid-call.

This diagnosis is the design input for ALHS-A. It does not prove that all post-artifact work was
waste, and the report does not claim that.

## 3. ALHS-A — episode-level convergence

### 3.1 What was added

A **derived episode conclusion**, not a planner and not a completion oracle:

- `src/project_continuity/episode.ts` — pure types and functions:
  `evaluateEpisodeReadiness`, `validateEpisodeConclusion`, `makeEpisodeConclusion`,
  `parseEpisodeConclusion`, `buildPulseEpisode`.
- `palimpsest_work action=conclude` — the model states `DELIVER`, `WAIT_FOR_OPERATOR`,
  `WAIT_FOR_EXTERNAL_EVENT`, `REPLAN`, `CONTINUE` or `CHECKPOINT` with a statement, artifacts,
  waiting-on, next step and evidence refs.
- The product checks the statement against **real facts**: open tasks, open attempts (host-observed
  or unobserved), tasks awaiting operator acceptance, blocked effects, artifact existence, and
  whether a negative DELIVER cites a recorded negative finding.
- A refused conclusion names the contradiction and leaves the episode open. A recorded conclusion is
  an ordinary `REFERENCE_NOTE` in the existing journal; it accepts nothing, promotes nothing and
  approves nothing.
- `ProjectPulse.episode` re-derives the conclusion on every read. If the revision, head or journal
  moved after it, the state is **REOPENED** with the exact changes, and the decision queue gains an
  `EPISODE_REOPENED` item.
- The pulse's decision fallback now says: if the goal has been handled, record a conclusion instead
  of continuing optional edits.

### 3.2 Boundaries preserved

- A DELIVER is refused while a task is READY/ACTIVE, while an attempt is open, while a delivered
  candidate awaits operator acceptance, or while a blocked effect exists.
- A negative DELIVER (no artifact) is allowed only when it cites a recorded negative finding.
- The operator's Promotion remains the only acceptance path. The episode conclusion never touches it.
- `CONTINUE` requires a next step and does not pretend the episode ended.
- No new canonical state enum, store or owner: the record is journal content and the view is derived.

### 3.3 Test evidence

`test/alhs_episode_convergence.test.ts` (6 tests) covers: refusal with an open task; refusal for a
missing artifact; DELIVER refused while a delivered task awaits acceptance; WAIT_FOR_OPERATOR
recorded and the task left VERIFYING with zero promotions; lightweight DELIVER recorded, then
REOPENED after a new journal fact; CONTINUE requires a next step; negative DELIVER only with a cited
finding.

## 4. ALHS-B — adaptive cooperation and partial reuse

### 4.1 Reuse facts without a second reuse engine

`ResultContinuationService.inspect` now carries:

- `resultCommit` — the result's own source revision (read from the resolved result, not inferred from
  a promotion);
- `reuse` — a path-level plan from the existing continuation world port: `resultPaths`,
  `unaffectedPaths`, `conflictedPaths`, `alreadyPresentPaths`, `complete`, `detail`.

The implementation is a Git tree diff between the result's base/result and the current head. A path
changed by both sides is a conflict unless the bytes already agree. It reads; it carries nothing. The
existing `rematerialize`/rework authority is unchanged, and the plan explicitly says a path-level
"unaffected" fact can still be invalidated by a semantic change the diff cannot see.

`palimpsest_work action=results` exposes the plan; a principal can write a **new governed task** that
reuses the unaffected content and recomputes the conflict. The old result is never accepted wholesale.

### 4.2 Real-host vertical run

Evidence: `research-evidence/alhs/2026-11-04/host-run/` (38 files). The host, worker subprocesses,
Git worlds, Work/Attempt/Promotion and operator actions are real; the model is a deterministic
Messages stand-in (`MOCK_MODEL`).

Timeline (all facts in `alhs-summary.json`):

| Node | Event | Evidence |
|---|---|---|
| T0 | Seeded goal, two baseline tasks | `seed.json` |
| T1 | A1 reads the pulse | session A1 |
| T2 | A1 delegates the `cost` task | session A1; real worker |
| T3 | Worker writes and commits `cost.md` + `assumptions.md`, parks before reporting | worker session; commit in reuse `resultRevision` |
| T4 | Measured 700 mm constraint written under `.palimpsest/inputs/` | `constraint-arrived-at.txt` |
| T5 | A2 records a contribution and a `REVISE_PLAN` decision | contribution/decision journal |
| T6 | `cost`/`capacity` retired; `capacity-v2` runs and changes the world | revision history; `capacity-v2` attempt |
| T7 | Late cost result settles COMPLETED on the STALE task; A3's `results` reports `cost.md` unaffected and `assumptions.md` conflicted; a new `cost-v2` task reuses the vendor pricing from commit `438c93bc…` and recomputes the assumption | `alhs-summary.json` reuse block; `artifacts/cost-v2.md` |
| T8 | A3 records `WAIT_FOR_OPERATOR`; the operator promotes `cost-v2`; A4 is a new session | episode conclusion; promotion records |
| T9 | `capacity.md` and `cost-v2.md` accepted through Promotion | promotions `afbae706…`, `98acd358…` |
| T10 | A4 records DELIVER; all four host sessions exit 0 naturally | `naturalExit=true`, exits A1–A4 = 0 |

Exact results:

- Project revision **4**, head **`a9bf7cbfd7036864ac33177562ce227328b423f2`**;
- `capacity-v2` and `cost-v2` SATISFIED; `capacity` and `cost` STALE;
- old cost result `438c93bc…` is `INCOMPATIBLE`/`STALE`, never rematerialized and never promoted;
- `cost-v2.md` (318 bytes, sha256 `72d42780…`) names the old commit, carries the old vendor price
  (1200 EUR) and the measured 700 mm assumption, and drops the old 1200 mm assumption;
- episode `DELIVER`, `episode-167b9682…`, basis revision 4, `current=true`;
- all six mechanical checks true.

What this proves: the product can expose reuse facts, a new governed attempt can consume them, an old
result can be retired without loss, an episode can be concluded for operator acceptance, and a later
session can conclude DELIVER and end naturally. What it does **not** prove: that a model discovers
this path unaided, or that reuse is cheaper or better in general.

## 5. Evidence layers

| Layer | What exists | What it can support |
|---|---|---|
| Offline replay of recorded sessions | `offline-convergence-analysis.json` | convergence diagnosis, token distribution |
| Deterministic model substitute + real host | `2026-11-04/host-run/` | product/host/worker/Git mechanics |
| Real DSH host + real workers | LHAPE `2026-11-03` + ALHS host run | execution and recovery mechanics |
| Real model behavior | LHAPE-C pilot + ALHS core (one pair per F/A condition) | one observed convergence difference; no repeated-sample claim |
| Canonical project state | SQLite/ProjectIR/journal | the facts above |
| Inference | this report | labelled as such |

## 6. Tests and checks

All of the following passed on the final tree:

- `test/alhs_episode_convergence.test.ts` — 6;
- `test/alhs_partial_reuse.test.ts` — 1;
- broad hotspot run (30 files): 230 tests, including `promotion`, `promotion_gate`, `h1_recovery`,
  `r3wr4_*`, `trajectory_t0_*`, `ci1_*`, `ci2_*`, `ci3_promotion_authority`, `scheduler.replay`,
  `lean_work_delegation_transport`, `lean_speculative_authority`;
- pulse + continuation/D5 run (8 files): 101 tests;
- ALHS/LHAPE/placed/normal run (7 files): 28 tests;
- Windows host boundary run: 32 tests (`host_s1_spine_coverage` 14, `host_s1r_reparse_boundary` +
  `host_conformance` 18) with `PALIMPSEST_DSH_ROOT` at the rc.5 seam and the **default** Windows temp.
  A custom temp root inside the repository (`.aps-tmp`) makes the integrity-label verification fail
  on this host; that is an environment constraint, not a product regression.

Build and gates:

- `npx tsc -b` — pass;
- `node scripts/audit/module-architecture.mjs --check` — PASS, 0 violations, 9 accepted exceptions;
- `--check-public-api` — PASS, 0 missing/changed/added.

The application-factory fan-out ratchet moved 36 → 37 for the episode face; the reason is recorded in
`tools/architecture/baseline-reasons.ts` and the baseline was regenerated.

## 7. ALHS-C core — executed; diagnostic — blocked

`docs/programs/alhs/ALHS-C-PROTOCOL.md` pre-registers F (strong native DSH), L (lightweight), A
(adaptive Palimpsest) and G (forced governed) on a T0–T10 scenario.

The owner authorized **only the core stage** (F and A, 2 sessions each, 12,000,000 aggregate) on
2026-11-04. It ran under `research-evidence/alhs/live/authorization.json`; evidence is
`research-evidence/alhs/core-2026-11-04/`, write-up `docs/engineering/ALHS-C-CORE-RESULT.md`.

| | F | A |
|---|---:|---:|
| 7-fact rubric | 7/7 | 7/7 |
| Tokens | 3,065,535 | 1,543,569 |
| Natural end | no (budget stop) | **yes** (`conclude DELIVER`) |
| Package | 32,228 bytes | 29,848 bytes |

- F-1 was killed by the scenario at T+240s (165,963 tokens); F-2 continued and was stopped at
  **2,899,572**, which is 49,572 above the 2,850,000 soft ceiling and 100,428 below the 3,000,000 hard
  session ceiling. The 150,000 reserve absorbed the message-boundary overshoot.
- A-1 was killed at T+240s (1,292,562); A-2 read the pulse and files, recorded `DELIVER`
  (`episode-4f2b627…`, current), and exited 0 after 251,007 tokens. A did **not** create a formal Work
  task, a governed World or a Worker; it chose direct work plus one native subagent.
- Aggregate **4,609,104**, 7,390,896 under the 12,000,000 authorization. One provider request returned
  `502 UPSTREAM_TIMEOUT` during F-2 and was retried; 102 of 103 POSTs returned 200.

The diagnostic L/G stage was **not authorized and did not run**. The gate remains fail-closed:
without an `alhs-spend-authorization/v1` it writes `BLOCKED.json` and exits 2 with `modelCalls=0`;
with an authorization but no adapter it refuses with `ADAPTER_NOT_CONFIGURED` (exit 3). The recorded
pre-authorization block is `research-evidence/alhs/live/BLOCKED.json`.

Budget-guard change: `scripts/aps/budget_guard.mjs` takes `--reserve-tokens` and stops at
`maxTokens - reserve`. This addresses the LHAPE-C one-message overshoot (F +28,297, L +62,093, G
+32,140). The guard still observes usage only after a message, so a reserve is a buffer, not an exact
no-overspend proof.

## 8. Architecture convergence

Reused, not rebuilt:

- `ProjectContinuity` for basis/summary; the existing `ProjectJournal` for the record; `ProjectPulse`
  for the derived view; `ProjectWorkspace` for the surface.
- Work/Attempt/Evidence/Promotion, `WorkDelegationService`, `ExecutionWorld`, `ResultContinuationService`
  and its world/result ports, the Scheduler, and the operator Promotion path.
- The composition layers (`composition/continuity.ts`, `composition/continuation.ts`,
  `composition/application.ts`, `install.ts`) gained wiring, not a second owner.

Added and justified:

- one pure episode module and one pulse field;
- one `conclude` action on the existing normal Work tool;
- one optional `reusePlan` port on the existing continuation world port and one `resultCommit` field
  on the existing inspection;
- one reserve option on the existing budget guard;
- one test-owned host scenario under `scripts/alhs/`.

Not added: a planner, a scheduler, an agent registry, a memory store, a result ledger, a second
promotion path, a filesystem sandbox, a LayerFS integration, or a durable agent runtime.

## 9. Limitations and negative results

- **One real-model pair shows a convergence difference, not a general effect.** A recorded `DELIVER`
  and exited; F was budget-stopped. With one session pair per condition, no repeated-sample or paired
  claim is possible, and the token totals are not matched work (the fixed 240s kill gave A-1 1.29M
  and F-1 166k in the first window).
- **A chose direct work, not governed cooperation.** A used files plus one native subagent, with no
  formal Work, World, Worker or Promotion. The real-model run therefore does not demonstrate governed
  multi-agent production; the deterministic host run covers that mechanic separately.
- **No F/A quality or cost advantage.** Both packages reached the same 7/7 floor; the rubric
  saturated. A used 50.4% of F's tokens in this pair, but that is descriptive, not a matched cost
  result.
- **Both packages were left untracked.** Neither condition committed the final artifact; A's DELIVER
  evidence ref cites the base commit, not a commit containing the package. DELIVER checks the project
  facts and artifact existence, not the provenance a model asserts.
- **The host run's reuse was scenario-directed.** The scripted principal in the deterministic run was
  given the old result and the product supplied the path facts; that run does not show the agent
  discovering the reuse.
- **Path-level reuse is not semantic reuse.** An "unaffected" path can still carry a stale claim. The
  product says so; the principal must judge.
- **The old result is still a real artifact.** It was retired and not accepted; its content was read
  by the new worker, which is the intended partial reuse, not a promotion.
- **LHAPE-C remains n=1 per condition and ceiling-stopped.** The ALHS diagnosis reuses those sessions;
  it does not turn them into convergence evidence.
- **The ALHS core run had one provider 502.** An `UPSTREAM_TIMEOUT` during F-2 was retried; the
  session continued. It is recorded in `core-summary.json`, not hidden.
- **The episode conclusion is a judgement, not truth.** DELIVER means the principal judged the
  episode sufficient and no mechanical fact contradicted it. It does not mean the business goal is
  true, and the operator may still refuse acceptance.

## 10. Next decision

The core stage is complete. The next real-model step is either a **repeated-sample core** (the same
F/A pair, more than once, under a new authorization) or the **diagnostic L/G stage**; neither is
authorized. The pre-registration and the fail-closed runner are in place, the reserve guard is
validated, and the core result gives one concrete question for a repeated run: does A still conclude
on evidence when the kill timing and the first-window work are balanced?
