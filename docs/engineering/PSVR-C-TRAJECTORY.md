# PSVR-C trajectory analysis — why the artifact arrives but the project does not close

Status: offline analysis of the recorded PSVR-C sessions. No model call was made for this document,
no budget was spent, and the two recorded project states were not modified. The replay in §7 runs on
copies.

Sources: the eight principal streams and two worker streams under
`research-evidence/psvr/2026-11-05/{c,c-energy}/sessions/`, decoded with
`scripts/psvr/session_attribution.mjs`; per-step usage from the `assistant/message` events; the
recorded `run.json`, `budget.json`, `snapshot.json`, `a-project-state.json`; and a deterministic
replay of `palimpsest_work conclude` / `readiness` / `finalize` against copies of the two recorded
`state-A` directories.

---

## 1. The result being explained

Both A runs delivered the artifact and neither closed the project:

| | software F | software A | energy F | energy A |
|---|---:|---:|---:|---:|
| tokens (cohort ledger) | 2,046,205 | 2,805,771 | 887,331 | 2,858,481 |
| end of session 2 | natural exit 0 | budget stop | natural exit 0 | budget stop |
| commit | `930d9c5` | `453aa7f` | `0e980ec` | `e631160` |
| mechanical rubric | 7/7, suite 16/16 | 7/7, suite 26/26 | 8/8 | 8/8 |
| governed project after the run | — | task ACTIVE, attempt RUNNING, no settlement | — | task ACTIVE, attempt RUNNING, no settlement |
| `conclude` / `finalize` calls | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

The artifact is not the issue. The energy worker opened its own attempt world, read the six
deliverables and ran `node check.mjs --final`: the package was already complete and passed 46
assertions. The software worker opened its world at `453aa7f`, read the implementation and attempted
the suite; the failures it hit were the sandbox's spawn boundary, not the code. Both workers were
asked to do work that was already in their world, and correctly made no change.

The rest of this document explains how the two runs arrived there, and why "no change" is fatal.

---

## 2. Software A-2 — the trajectory

The clock starts at 13:31:06.692Z. A-1 had already written the six untracked files and was killed at
the 400k milestone; A-2 inherited them.

| t+ | event |
|---:|---|
| 2.9 s | `palimpsest_continuity pulse` → `Error: project does not exist`. The model notes the project is absent and continues natively. |
| 151.8 s | `git commit` → `453aa7f`. The migration is complete; the suite passes; the README is updated. |
| 165.7 s | The model decides the work is done and that it must "record the durable project state". `palimpsest_start` with `headCommit: "453aa7f"` (short) → `Error: head_commit: must be a full lowercase Git object id`. |
| 171.5 s | Retry with the full SHA → project created at `453aa7f` with three tasks (`grpc-contract`, `grpc-service`, `verify-migration`). Every `required_artifacts` path already exists at the basis. |
| 173.7 s | `status` → next decision `TASK_STARTED` on `grpc-contract`. |
| 178.1 s | `next` → `TASK_STARTED`; task ACTIVE. |
| 179.3 s | `next` → `ATTEMPT_CREATED`; attempt created, no worker, `attemptsRunning: 0`; `nextAction: WAIT_DEPENDENCIES` because `grpc-service` is BLOCKED. |
| 182.2 s | `complete taskId=grpc-contract` → `NO_RUNNING_ATTEMPT`: "this task has no canonically RUNNING attempt; nothing was observed or settled". Next actions: `workers`, `status`. |
| 185.6 s | `workers` → attempt `CREATED`, `worldHead: null`; `results` → no result. |
| 194.5 s | `relay takeover declareExecutorAbandoned=true` → `REFUSED`: "this task has no canonically RUNNING attempt; a relay continues an attempt that exists". |
| 201.7 s | `plan` to collapse the three retrospective tasks into one verification task → `Error: plan revision blocked (quiescence_required): the project is not quiescent: every ACTIVE/VERIFYING task and every open (CREATED/LEASED/RUNNING) attempt must settle before a structural revision can be committed [refs: grpc-contract, attempt-94bcc7…]`. |
| 203.4 s | `delegate taskId=grpc-contract` → `STARTED`; the worker is RUNNING in `attempt-94bcc7…`, world head `453aa7f`. |
| 203–238 s | `workers` ×3, `status` ×1, a final `node test/integration.test.js`, a read of the client and server. No transition changes. |
| 238.8 s | Soft budget ceiling reached (`2,384,653 / 2,500,000` incl. the worker's `119,926`). The session is stopped. |

The worker opened its world, saw `453aa7f Migrate site readings service to gRPC` at HEAD, read the
implementation and ran the suite. `node --test` failed with `spawn EPERM` (the known DSH sandbox
boundary); `--test-isolation=none` OOM'd inside the worker; it was running each test file
individually when the principal was stopped. It made no commit, so `worldMovedAfterResult` stayed
false and `resultCommit` stayed null.

The model's own reasoning at 165.7 s already names the problem:

> "Committed. Now 'record the state that lets it end.' We should use palimpsest. Project doesn't
> exist. … starting after completion with tasks open might cause conclude refusal."

At 185.5 s it goes further:

> "This palimpsest ceremony is getting complicated. We might have created an unnecessary project
> state that's now stuck ACTIVE. We need resolve it to end cleanly."

It then tries `relay`, `plan` and `delegate` — every settlement route the product's state offered —
but not `conclude`.

---

## 3. Energy A-2 — the same shape, one step earlier

Clock start 18:27:17.178Z; A-1 had written all six deliverables and was killed at 400k.

| t+ | event |
|---:|---|
| 2.2 s | `pulse` → `Error: project does not exist`. |
| 63.9 s | `git commit` → `e631160`. The package is complete; `check.mjs --final` passes. |
| 74.4 s | `palimpsest_start projectId="ALHS_CORE_A"` → `Error: project id does not match the controller` (the model reused the prompt marker as the project id). |
| 77.4 s | `palimpsest_start` with the real id and the short SHA → `Error: head_commit: must be a full lowercase Git object id`. |
| 81.2 s | Retry with the full SHA → project created at `e631160`, one task `decision-package`, whose six required artifacts already exist at the basis. |
| 82.0 s | `status` → `TASK_STARTED` available. `readiness` **before** the task exists → `CONTINUE_WORK`: "no task is currently addressable; plan or begin work before a finalization can be considered". |
| 84.8 s | `next` → `TASK_STARTED`; `next` → `ATTEMPT_CREATED`. `nextAction: WAIT_ACTIVE_WORK`: "task(s) decision-package are ACTIVE but no RUNNING attempt was observed; start or inspect that Work position". |
| 87.3 s | `start` → `PLACED_WORK`: "start a real worker with `palimpsest_work action=delegate`". |
| 94.3 s | `delegate decision-package` → worker RUNNING in `attempt-60deb0…`, world head `e631160`. |
| 94–163 s | `status` ×3, `workers` ×5, `results` ×1, plus archive-and-check verification by the principal. No transition changes. |
| 166.7 s | `complete` → `WORKER_ACTIVE`: "this host still has an active worker job … stop it or wait for the host observation instead of racing it". |
| 168.3 s | `stop` → `STOP_REQUESTED` (a request, not an observation). |
| 169.5 s | `workers` → job `FINISHED`, `settlementState: NOT_READY`, `hostObserved: false`; attempt still `RUNNING`. |
| 172.2 s | `complete` again → `NOT_READY`: "the world holds no observable change against its base, so there is nothing to settle". |
| 172.4 s | Soft budget ceiling reached (`2,377,775 / 2,500,000` incl. the worker's `111,275`). Stopped. |

The energy worker's own trace is the clearest evidence that the artifact was fine. At step 3 it
noted "the base commit already is 'Add two-site deployment decision package'"; at step 6 it ran
`node check.mjs --final` → `PASS (final) (46 assertions; corridor 1050 mm; selection NR=K-900
HF=K-900; total 536000 USD)`; at step 7 it confirmed `git status` clean. It then read the prose
looking for defects, made no change, and the attempt could not settle.

The model reasoned about the state it was in — and still did not reach for `conclude`:

> "Let's think about whether to abandon Palimpsest project and just final answer with commit. …
> But we've now created a running attempt. If we leave it running, that's bad state. We should
> either finish it or stop it."

---

## 4. What F did differently

F had no state substrate to close. Its second session was linear:

- read the repository, derive the design, write the files, run the suite, commit, print the final
  message, end the turn. Software F-2: 39 steps, commit at 270.8 s, **2 steps and 124,574 tokens
  after the commit**. Energy F-2: 20 steps, commit at 115.8 s, **2 steps and 68,008 tokens after
  the commit**.
- F's first sessions were killed at 400k before writing anything in either stage
  (`snapshot.status` contains only the injected `updates/`; no implementation or deliverable file
  was written). F-1 software spent much of that budget exploring outside its world: it listed
  `%TEMP%` siblings and read the earlier PSVR-A implementation (`psvr-a-stage`, `psvr2\a\world`,
  `psvr-a-scratch`) between 83 s and 105 s. That is a contamination vector and an inflation of F's
  cost; it wrote nothing from those files, and F-2 did not repeat the deep reads. A-1/A-2 never left
  their world.

So the second-session work is not matched: A-2 inherited six written files, F-2 wrote from scratch.
The end-to-end artifact is the fair comparison, and it is where the closure tax appears.

### 4.1 Behavioral profile

| dimension | F | A |
|---|---|---|
| planning | reads the repository, then writes; no formal plan object | reads; writes a task graph only after the work is committed |
| tool surface | 22–23 native tools, 19.8–20.2 KB | 28–29 tools, 42.3–42.8 KB, including the 19-action `palimpsest_work` |
| verification | suite/checker, then commit | suite/checker, commit, then attempts a *project* settlement |
| closure | commit, one last check, final message; 2 steps | create project at the committed head, step scheduler, delegate, poll; 19–35 steps |
| stopping | stops when the deliverable is committed | cannot stop because the project it just created is unsettled |
| error handling | sandbox workarounds (`NODE_OPTIONS=--test-isolation=none`) | API probing (short SHA, wrong project id) and refusal recovery |
| cost after the artifact | 68,008–124,574 tokens | 1,331,902–1,901,695 tokens |

The behavioral difference is not "A plans more" or "A writes worse code". A does the same
engineering, then voluntarily takes on a second obligation — closing a governed project — that F
never has. The obligation is not discharged because the only tools it reaches for are settlement
tools, and the project was born after the work was already in the basis.

---

## 5. The quantitative anatomy

### 5.1 Work phase versus closure phase

For each A-2, the commit call is the boundary: everything the session did up to and including the
commit is "work"; everything after it is "closure". For F-2 the same boundary applies.

| session | work tokens | work steps | closure tokens (principal) | worker tokens | closure total | closure steps | closure share of the run |
|---|---:|---:|---:|---:|---:|---:|---:|
| software A-2 | 1,052,751 | 27 | 1,211,976 | 119,926 | **1,331,902** | 19 | 56% of A-2, 47% of A total |
| energy A-2 | 476,080 | 18 | 1,790,420 | 111,275 | **1,901,695** | 35 | 80% of A-2, 67% of A total |
| software F-2 | 1,424,089 | 37 | 124,574 | — | 124,574 | 2 | 8% of F-2 |
| energy F-2 | 421,149 | 18 | 68,008 | — | 68,008 | 2 | 14% of F-2 |

The phase table uses the stream's per-step usage sums. For energy F-2 that sum is 489,157; the
`budget.json` ledger recorded 454,712 because its last request arrived after the ledger's sample.
The cohort table in §1 uses the ledger, which is the pre-registered metric; the phase shares here
use the stream sum so the two phases add up exactly.

Two things follow.

1. **A's engineering phase is not the expensive part.** In software it is 1,473,869 tokens end to
   end (A-1 + A-2 work) against F's 2,046,205 — cheaper, although A-2 had a head start. In energy it
   is 956,786 against F's ~900k — roughly equal. The artifact cost is comparable.
2. **The closure phase is the entire premium.** It is 1.33M tokens in software and 1.90M in energy,
   and it ends with the project still ACTIVE. A used 47% / 67% of its total on a phase that produced
   no accepted state.

### 5.2 Why each closure call costs 50–65k tokens

Per-step usage shows the closure phase is almost pure context re-read:

| session | closure input | closure output | closure cacheRead | cacheRead share |
|---|---:|---:|---:|---:|
| software A-2 | 7,063 | 10,161 | 1,194,752 | 98.6% |
| energy A-2 | 14,543 | 12,549 | 1,763,328 | 98.5% |
| software F-2 | 994 | 700 | 122,880 | 98.6% |
| energy F-2 | 403 | 917 | 66,688 | 98.0% |

Every model call re-sends the whole conversation. By the closure phase the context is 55–65k
tokens, so a status poll that changes nothing still costs ~60k. Software A-2 made 6 observation
calls after the commit (`status` ×2, `workers` ×3, `results` ×1) and 15 product calls; energy A-2
made 9 observation calls after the commit (`status` ×3, `workers` ×5, `results` ×1) and 22 product
calls in the session (21 of them after the commit; the extra `status` at 35.6 s is the pre-commit
probe). The product's observe-and-wait interface turns waiting into a full-context round trip.

The tool schema is a smaller, constant tax: F exposes 22–23 tools and 19.8–20.2 KB of schema; A
exposes 28–29 tools and 42.3–42.8 KB. At step 1 the cached prefix is 5,504 tokens for F and 11,264
for A — the ~5.7k difference is the extra schema. Over 46/53 steps that is roughly 260–300k tokens,
real but secondary to the 1.2–1.8M closure burn.

### 5.3 The product calls, by kind

| | software A-2, after commit | energy A-2, after commit |
|---|---:|---:|
| `palimpsest_start` | 2 (1 rejected) | 3 (2 rejected) |
| `palimpsest_project overview` | 1 (error) | 1 (error) |
| `status` | 2 | 3 |
| `readiness` | 0 | 1 (before the task existed) |
| `next` | 2 | 2 |
| `start` | 0 | 1 |
| `delegate` | 1 | 1 |
| `workers` | 3 | 5 |
| `results` | 1 | 1 |
| `complete` | 1 (`NO_RUNNING_ATTEMPT`) | 2 (`WORKER_ACTIVE`, `NOT_READY NO_WORK`) |
| `stop` | 0 | 1 |
| `relay` | 1 (`REFUSED`) | 0 |
| `plan` | 1 (`quiescence_required`) | 0 |
| **`conclude`** | **0** | **0** |
| **`finalize`** | **0** | **0** |

The pattern is consistent: every action that tries to *settle an attempt* was used; the one action
that records an *episode conclusion* was never used.

---

## 6. Why it happened — five mechanisms, in order

### 6.1 The prompt maps "record the state" to the work path, not the conclusion path

The A-2 prompt ends: "Continue the work, bring it to a state you can defend, and record the state
that lets it end." The product has two candidate verbs: `complete` (settle the running work) and
`conclude` (record the episode's stopping state). The model chose `complete`. Its reasoning at
software step 28 says so explicitly: it considers a project with tasks and tries to "close tasks to
conclude"; it does not consider that a conclusion can be recorded without closing them.

### 6.2 The work was done before the project existed, and the product defines work as a delta

`palimpsest_start` compiles the task graph at `headCommit`. In both A-2 runs that head already
contains every `required_artifact`. The attempt world is seeded from the same head, so:

- `complete` refuses with `NO_WORK`: "the world holds no observable change against its base";
- `readiness` returns `CONTINUE_WORK`: "the world has no commit beyond the attempt's basis; the
  actual work is still outstanding";
- `finalize` returns the same `NOT_READY`.

The product is right by its own definition: it has no attempt that observed the work, so it cannot
settle one. But that definition makes the post-hoc project permanently unsettleable. There is no
"adopt the existing commit" route, by design — a second acceptance path would be a second Promotion
path, which this architecture forbids.

### 6.3 The product's own next-action projection walked the model into the dead end

After `ATTEMPT_CREATED`, `status.nextAction` says `WAIT_DEPENDENCIES` (software) or
`WAIT_ACTIVE_WORK` (energy) — in neither case an executable transition, and in neither case
`conclude`. After `delegate`, it says: "an attempt is RUNNING; completion is the only formal
transition available until it settles" and names `complete`. `complete` then refuses — first
`NO_RUNNING_ATTEMPT` (software), then `WORKER_ACTIVE`, then `NO_WORK` (energy). The refusals offer
`workers` and `status`, not `conclude`. The product never projects the state "the basis already
contains the task's required artifacts; there is no delta to settle; record a checkpoint or let the
operator accept the committed result".

### 6.4 Delegation cannot manufacture a delta for already-finished work

`delegate` executes an existing canonical task. In both runs the worker opened a world whose HEAD
already satisfied the task. The worker's honest options were: report that the work is done (no
commit, so no settlement) or invent a change (fabrication). It chose the honest one. The product's
instruction — "the worker may only report; the product observes the world and settles" — makes the
delegation a guaranteed no-op in this state. The model used `delegate` as its last resort because
`complete`, `relay` and `plan` were all closed.

### 6.5 The model kept trying because leaving a RUNNING attempt is not defensible

The model recognized the trap ("We might have created an unnecessary project state that's now stuck
ACTIVE"), and it kept working to repair it rather than stop. That is the correct instinct under the
prompt ("bring it to a state you can defend"), but every repair route it knew was a settlement
route. The only legal repair was an episode conclusion, and it did not know that was legal.

---

## 7. The counterfactual: the legal ending existed

The recorded `state-A` directories were copied to a temporary location and opened with the same
product, the same project ids and the same worlds. The originals were not touched.

On both copies:

```
palimpsest_work conclude {
  intent: "CHECKPOINT",
  statement: "The committed deliverable is complete and verified, but the governed attempt
              created after the commit holds no world delta and cannot settle; the episode
              ends with that state preserved.",
  nextStep: "Operator accepts the committed result, or the next session relays the open
             attempt with an explicit executor-abandoned declaration before settling."
}
→ state: RECORDED, intent: CHECKPOINT, mayEnd: true, blockers: []
   check.deliveryBlockers:
     - "task grpc-contract is ACTIVE"                    (energy: decision-package)
     - "attempt for grpc-contract is RUNNING but no host job is observed — inspect the world
        rather than assuming it is alive"
   check.openAttempts: ["grpc-contract:RUNNING:unobserved"]
```

`readiness` on the same states returned `CONTINUE_WORK` with the reason "the world has no commit
beyond the attempt's basis; the actual work is still outstanding", and `finalize` returned
`NOT_READY` with the same reason. So the mechanical finalization path could not close this shape,
but the episode conclusion could — with the open task and the RUNNING attempt recorded as facts, not
hidden.

This is the sharpest distinction in the whole analysis:

- the **capability** to end honestly existed and was exercised offline;
- the **adoption** failed: the model never called `conclude` (or `finalize`);
- the **effect** is the recorded state: a correct artifact, an open attempt, no accepted asset, and
  1.3–1.9M tokens spent after the work was already committed.

The replay does not prove the model would have taken `conclude` if it had been surfaced. It proves
the state was not a dead end, and that the product's own next-action guidance did not name the exit.

---

## 8. Capability, adoption, effect

| | question | answer |
|---|---|---|
| Capability | can the product record an honest ending for work it did not perform? | yes — `conclude CHECKPOINT` is RECORDED with open tasks/attempts, `mayEnd: true`; code path `validateEpisodeConclusion` only requires `nextStep` for CHECKPOINT, and `composition/continuity.ts` sets `mayEnd = intent !== "CONTINUE"`. |
| Capability | can the product settle the post-hoc attempt mechanically? | no — `finalize` and `complete` both require a commit beyond the basis; `NO_WORK` is a hard refusal. By design. |
| Adoption | did the model use the ending that existed? | no — 0 `conclude`, 0 `finalize` across all eight principal sessions; 1 `readiness`, before the task existed. |
| Adoption | did the model follow the product's guidance? | yes — it used `next`, `complete`, `delegate`, `workers`, `relay` exactly as the state's `nextAction` suggested; the guidance led to the dead end. |
| Effect | artifact quality | equal or better: A's suite 26/26 vs F 16/16 in software; 8/8 vs 8/8 in energy. |
| Effect | project state | both A projects left ACTIVE with a RUNNING attempt, `resultCommit: null`, no promotion, no conclusion. |
| Effect | cost | A 1.37× / 3.22× F on the cohort ledger; the entire premium is the closure phase. |

---

## 9. Why this repeats the PWRS-R2/R4 pattern

The pattern is not "the model cannot finish a project". It is a stable interaction between three
facts:

1. **Native work is the economical path.** The model can read, write, test and commit directly. The
   governed path adds planning, isolation, delegation, verification and promotion; for a one-shot
   deliverable it is slower and riskier. The A prompt explicitly makes the product optional.
2. **The product is then asked to close work it did not see.** The model treats Palimpsest as a
   durable recorder at the end. But the product's closing vocabulary is settlement-centric: every
   route except `conclude` requires an attempt delta. The work is in the basis, so there is no
   delta.
3. **The episode conclusion is the one exception, and it is buried.** It sits in a 19-action tool
   whose description is a 4,000-character paragraph; the state's per-turn `nextActions` never name
   it for this shape; the `complete` refusals point back to `workers`/`status`. The model does not
   find it under pressure.

That is why the same end state appears across stages and scenarios: the model's policy is stable
("work natively, record at the end"), the product's settlement rule is stable ("no delta, no
settlement"), and the escape hatch is stable but not surfaced.

---

## 10. Bounded remedies (no new engine, no second promotion path)

These are ordered by expected value. None of them accepts an artifact or weakens authority; the
operator remains the only acceptor.

1. **Project the honest next action in `status`.** When an attempt is open and its world has no
   commit beyond the basis, and the task's `required_artifacts` already exist at that basis, do not
   advertise `complete` as "the only formal transition". Name `conclude CHECKPOINT` (and `relay` /
   `stop` / operator acceptance) as the legal actions. This one change would have addressed both
   recorded runs at the point where they started polling.
2. **Add the same exit to `complete`'s refusals.** `NO_RUNNING_ATTEMPT`, `NO_WORK` and
   `WORKER_ACTIVE` currently return `workers`/`status`. Add "record an episode conclusion
   (`conclude`) if the committed result is already in the basis" — a sentence, not a new path.
3. **Make `readiness` truthful about the basis.** When the required artifacts exist at the basis
   and there is no delta, "the actual work is still outstanding" is false from the caller's point
   of view. Return `SEMANTIC_JUDGEMENT` (checkpoint / operator acceptance), not `CONTINUE_WORK`.
4. **Report "already present at the basis" at `palimpsest_start`.** For each task whose
   `required_artifacts` exist at `headCommit`, say so in the reply. Do not refuse — a verification
   task may legitimately start there — but make the retroactive-plan situation visible before the
   model steps the scheduler.
5. **Remove the two probe errors.** Accept a short HEAD (or default to HEAD) in `palimpsest_start`;
   default `projectId` to the installation's project (or return it from the failed read). The
   recorded runs spent five `palimpsest_start` calls (three rejected: two short SHA, one wrong
   project id) and two failed `overview` reads discovering facts the product already knew.
6. **Split the `palimpsest_work` description.** The conclude clause is one sentence inside a
   4,000-character paragraph, and the schema costs ~5.7k tokens on every request. An
   action-scoped help surface, or a short "if the work was done outside the product" paragraph,
   would reduce both discovery failure and the per-call tax.
7. **Do not add an adoption path.** The pre-existing commit stays outside the project; the operator
   accepts it. The fix is to make the honest conclusion and the operator hand-off visible, not to
   let a principal declare its own commit a project result.

---

## 11. Limits

- **One pair per stage.** Two sessions per condition, one model (`deepseek-flash`), two scenarios.
  The numbers are descriptive, not a distribution.
- **The second-session work is not matched.** A-1 wrote six files before the kill; F-1 wrote none.
  A-2 finished A-1's work; F-2 wrote from scratch. Only the end-to-end artifact is comparable.
- **The F baseline had filesystem leakage.** F-1 software listed `%TEMP%` siblings and read the
  earlier PSVR-A implementation between 83 s and 105 s; it wrote nothing from them. F-2 did not
  repeat the deep reads. This is a cohort-isolation defect and it inflates F-1's cost; it does not
  make A look better.
- **The token metric includes cache reads.** `totalTokens = input + output + cacheRead`. A-2's
  closure phase used only 17k fresh input+output in software and 27k in energy; the 1.2M/1.8M is
  cumulative context re-read across many calls. This is the provider's accounting, and it is the
  pre-registered metric, but it measures call count × context, not reasoning effort.
- **The replay is deterministic, not behavioral.** It ran on copies of the recorded states and
  proves the legal ending exists; it does not prove the model would have chosen it. No new model
  session was run — the PSVR-C authorization was exhausted by the two pre-registered stages, and a
  new paid run would need a new explicit authorization.
- **The original states were not modified.** The replay wrote to copies under `/tmp`; the recorded
  `state-A` directories and worlds are untouched, and the two RUNNING attempts remain in the record
  exactly as the sessions left them.

---

## 12. Appendix — the exact closure sequences

### 12.1 Software A-2 — product calls and the commit (offsets from 13:31:06.692Z)

```
151.8 s  git commit -> 453aa7f
165.7 s  palimpsest_start headCommit=453aa7f          -> ERROR short object id
171.4 s  palimpsest_start headCommit=453aa7f005e…     -> revision 0
173.7 s  work:status                                  -> TASK_STARTED available
178.1 s  work:next                                    -> TASK_STARTED
179.2 s  work:next                                    -> ATTEMPT_CREATED
182.2 s  work:complete taskId=grpc-contract           -> NO_RUNNING_ATTEMPT
185.5 s  work:workers                                 -> attempt CREATED, worldHead null
185.6 s  work:results                                 -> no result
194.5 s  work:relay takeover                          -> REFUSED
201.7 s  work:plan (one verification task)            -> ERROR quiescence_required
203.4 s  work:delegate taskId=grpc-contract           -> STARTED
218.1 s  work:workers                                 -> RUNNING
226.8 s  work:workers                                 -> RUNNING
235.7 s  work:status                                  -> WAIT_ACTIVE_WORK, action=complete
238.8 s  (budget stop)
```

### 12.2 Energy A-2 — product calls and the commit (offsets from 18:27:17.178Z)

```
 35.6 s  work:status                                  -> ERROR project does not exist
 63.9 s  git commit -> e631160
 74.4 s  palimpsest_start projectId=ALHS_CORE_A       -> ERROR project id does not match
 77.4 s  palimpsest_start headCommit=e631160          -> ERROR short object id
 81.2 s  palimpsest_start headCommit=e631160f03d4…    -> revision 0
 82.0 s  work:status                                  -> TASK_STARTED available
 82.0 s  work:readiness                               -> CONTINUE_WORK (no task addressable)
 84.8 s  work:next                                    -> TASK_STARTED
 86.0 s  work:next                                    -> ATTEMPT_CREATED
 87.2 s  work:start                                   -> PLACED_WORK
 89.4 s  work:workers                                 -> attempt CREATED
 94.3 s  work:delegate taskId=decision-package        -> STARTED
106.8 s  work:status                                  -> WAIT_ACTIVE_WORK, action=complete
107.6 s  work:workers                                 -> RUNNING
116.1 s  work:results                                 -> no result
120.1 s  work:workers                                 -> RUNNING
136.6 s  work:status                                  -> WAIT_ACTIVE_WORK
163.2 s  work:workers                                 -> RUNNING
166.7 s  work:complete                                -> WORKER_ACTIVE
168.3 s  work:stop                                    -> STOP_REQUESTED
169.3 s  work:workers                                 -> FINISHED, NOT_READY, attempt RUNNING
172.2 s  work:complete                                -> NOT_READY: no observable change
172.4 s  (budget stop)
```

The observe/wait loop is visible in both lists: 6 observation calls after the commit in software
(`status` ×2, `workers` ×3, `results` ×1) and 9 after the commit in energy (`status` ×3, `workers`
×5, `results` ×1); the 35.6 s probe makes 10 in the energy session. Each one paid the full context.
