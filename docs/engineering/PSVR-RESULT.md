# PSVR — Project Synthesis Value Realization

Status: **PSVR-0, -A and -B implemented and executed on the real Windows DSH host; PSVR-C
pre-registered and fail-closed.** No paid model session was started: the PSVR prompt authorizes none
by itself, and none was requested. Every agent in the two project runs is a **labelled deterministic
Messages stand-in**; the host, workers, Git, execution worlds, context delivery, Work, Scheduler,
Promotion and verification are real.

Evidence: `research-evidence/psvr/2026-11-05/`.
Attribution detail: `docs/engineering/PSVR-0-ATTRIBUTION.md`.
Pre-registration: `research-evidence/psvr/live/cohort-psvr-c.json`.

## 1. What this stage changed

| Area | Change |
|---|---|
| Attribution | the ODPE-R streams are decoded frame by frame and replayed at tool level (`scripts/psvr/session_attribution.mjs`); capability, adoption and outcome effect are reported separately |
| Readiness | `completionReadiness(attemptId?)` derives the task layer from the requested attempt; `work_outcome` passes the attempt it chose |
| Unreadable inputs | an `OBSERVED` walk with unreadable paths is a SEMANTIC fact, not an absent one; the start gate no longer blocks on an out-of-scope file it could not read; principal settlement refuses until declared |
| Finalize race | `NO_RUNNING_ATTEMPT` is only `ALREADY_SETTLED` when a re-observed COMPLETED result exists |
| Input read | one bounded, repository-contained read (`realpath` containment + size cap) for the observation and the WORKTREE body |
| Scenarios | a runnable REST→gRPC fixture and a cross-domain deployment-package fixture, each with its own executable checker, plus real-host runners and labelled stand-in scripts |

The four fixes were driven by tests that failed first (`test/psvr_hotspots.test.ts`, 7/7).

## 2. PSVR-A — the REST→gRPC migration, interrupted, redirected, completed

### 2.1 The workload

`fixtures/psvr/grpc-migration` is a real service: REST over `node:http`, three baseline tests, no
third-party packages. The migration target is a **real gRPC wire implementation** over
`node:http2`: protobuf varints and length-delimited fields, 5-byte gRPC framing, `grpc-status`
trailers, a unary `GetReading`, a **server-streaming** `StreamReadings`, a client and integration
tests. Three tasks, each with its own write scope and artifact, chained by `depends_on`:

```
contract  proto/energy.proto, service/wire.js, test/wire.test.js
server    service/grpc_server.js, test/server.test.js (+ the proto/wire it revises)
client    service/grpc_client.js, test/integration.test.js, MIGRATION.md
```

The project standard requires `node --test`; the completion contract therefore runs the suite on
every candidate in its own world before a settlement is recorded.

### 2.2 The timeline (UTC, 2026-11-05)

| T | Fact | Evidence |
|---|---|---|
| T0 12:02 | the project is seeded from the REST baseline; the head is `4121a0b` | `seed.json` |
| T1 | a principal delegates `contract` to a real worker | session `P1` |
| T2 | the worker writes the proto, the codec and its tests, runs the suite and commits `a3ae4fe` **in its world** | world map `f9fa87…` |
| T3 12:02:41 | the principal settles it; the operator verifies (`project.attempt.git-diff-check.v1` PASS) and promotes to `17f112e` | `operator-contract.json` |
| T4 12:03:12 | a second worker commits the **unary batch** server (`19a88f7`) and parks | world `f006b4…` |
| T5 | the host is killed; the attempt stays RUNNING; the world is retained | `attempt-state-after-kill.txt` |
| T6 12:03:18 | the fleet compatibility note arrives as an **untracked** path, sha256 `c0409bfe…` | `input-sha256.txt` |
| T7 12:03:32 | a new principal closes the attempt as a **successor** (attempt CANCELLED, world retained) | `successor-closed-at.txt` |
| T8 | the replacement attempt is created on the promoted basis; its compiled context binds the note as `@ctx/input/…` | session `CONTINUE`, worker stream |
| T9 | the worker **pulls the note through the context handle**, rewrites the proto to `returns (stream Reading)`, rewrites the server, the codec and the tests, runs the suite and commits `e4be283` | worker session, `worlds.txt` |
| T10 12:04:14 | the principal `readiness` → `finalize` (with the acknowledgement); the operator promotes to `08d2c52` | `promoted-server-at.txt` |
| T11 | a third worker writes the client, the integration test and the migration notes and commits `500b1b3` | world `242efa…` |
| T12 12:05:05 | settlement and promotion to `ace55e0`; all three tasks SATISFIED | `operator-client.json` |
| T13 | a later session records `DELIVER` | session `P5` |
| T14 | the accepted head runs `node --test`: **14 tests, 14 pass, 0 fail** | `canonical-tests.json` |

Final canonical history: `4121a0b` → `a3ae4fe` → `17f112e` → `e4be283` → `08d2c52` → `500b1b3` →
`ace55e0`.

### 2.3 What is actually proven

- **The input reached the worker through the product.** The successor worker's turn fails unless the
  pulled body contains `returns (stream Reading)`; the committed server implements exactly that and
  the integration test observes each frame as it arrives. The fixture never copied the note into a
  world.
- **The interruption left real work, and it was partly reused.** The contract's proto and codec were
  the basis the successor revised; the partial server's unary `GetReading` survived; the batch path
  was replaced. The killed attempt's world is still on disk at `19a88f7`.
- **The final result is runnable and independently checked**: `node --test` on the accepted head.
- **Attribution is honest**: the settlement recorded that no worker invocation of the partial attempt
  was observed by the new host; the successor's work is its own attempt.

## 3. PSVR-B — the cross-domain deployment package

### 3.1 The workload

`fixtures/psvr/energy-deployment` is not software: sources (site constraints, vendor certificates,
capacity, quotes, lead times) and a **real consistency checker** (`check.mjs`) that re-derives the
selection from the sources and the current corridor, then verifies the cost arithmetic, the schedule
arithmetic, the certificate standing and the cross-artifact agreement. Three tasks: `technical`,
`commercial`, `recommendation`.

### 3.2 The timeline

| T | Fact | Evidence |
|---|---|---|
| T1 12:24:40 | the technical worker commits `bee1d06` (North Ridge K-900, **Harbor Flats S-1080** on the 1,250 mm drawing) | world `343e51…` |
| T2 12:24:42 | the operator promotes to `3baf0c2` | `operator-technical.json` |
| T3 12:24:42 | the **field survey** arrives untracked: the measured corridor is **1,050 mm** | `survey-arrived-at.txt` |
| T4 | the commercial worker pulls the survey, writes that exact text into the package as its basis copy, **revises Harbor Flats to K-900**, rebuilds the cost model (536,000 USD) and the schedule (14-week lead, commission 2027-03-02), runs the checker, commits `7d20538` | worker session `worker-…`, world `d03796…` |
| T5 12:25:23 | settlement and promotion to `cff5086` | `operator-commercial.json` |
| T6 | the recommendation worker writes the risk review and the integrated recommendation over the revised package and commits `e0fe9a9` | world `f931bc…` |
| T7 12:26:11 | settlement and promotion to `45250eb`; all tasks SATISFIED | `operator-recommendation.json` |
| T8 | `DELIVER`; `node check.mjs --final` on the accepted head: **PASS, 46 assertions**, corridor 1,050 mm, both sites K-900, 536,000 USD | `canonical-check.log` |

### 3.3 The cross-agent causal chain

1. Agent A's technical artifact selects S-1080 for Harbor Flats on the *drawing* width.
2. The field survey changes the site fact; the product delivers it to Agent B's attempt.
3. Agent B **revises A's artifact** (Harbor Flats → K-900) and every downstream number: cost
   485,000 → 536,000 USD, commissioning 2027-01-26 → 2027-03-02.
4. Agent C's recommendation cites the revised selection, the new total and the measured corridor.
5. The checker fails the package if any of those disagree with the sources — including if the survey
   is not in force (`technical-capacity: HF selects K-900, the sources require S-1080`).

This is the "A observes → project evaluates → B changes downstream work → C updates a dependent
artifact" chain, recorded in real files and real commits.

## 4. Capability verdicts

| Q | Question | Verdict |
|---|---|---|
| Q1 | Can agents organise real cooperation without a preset governance topology? | **Not with a model.** The stand-in principals delegated a fixed three-task plan. The product's formal path admits **one RUNNING attempt per project**, so the three tasks ran sequentially with operator acceptance between them; parallelism existed only inside a worker's own session. |
| Q2 | Do contributions change each other and improve consistency? | **Yes on the deterministic host.** B's commercial task rewrote A's selection and every downstream number; the checker proves the agreement. Whether a model would do it is untested. |
| Q3 | Do persistent assets reduce rework across sessions/workers? | **Partly.** The contract's proto/codec survived and were revised rather than rewritten; the partial server's unary handler survived. In PSVR-A the *successor* rewrote the server file as a whole (the stand-in's script), so the measured reuse is at the file-selection level, not line level. |
| Q4 | Does current reality change execution naturally? | **Yes.** The untracked note/survey arrived after the basis, reached the next attempt through the compiled context, and changed the artifacts; settlement required the acknowledgement. |
| Q5 | Do results reach delivery/acceptance/resumability at reasonable cost? | **Yes, mechanically.** Three promotions per scenario, each verified and head-reconciled; episodes ended with DELIVER. Cost is not measurable without a model. |
| Q6 | Net value vs F+Finish+Commit? | **Not established.** No paid comparison was authorized or run. |
| Q7 | Which mechanisms should stay core, be on-demand, or be simplified? | See §6. |

## 5. Tests

- `pnpm run build` — clean.
- `architecture:check` — PASS (controller 4,829 LOC / fan-out 39, at its ratchet).
- `architecture:check-public-api` — PASS (0 missing / 0 changed / 0 added).
- `test/psvr_hotspots.test.ts` — 7/7.
- Hotspot suites (`odpe_*`, `pwrs_relay`, `context_distribution`, `lean_d5c3`, `pc1_placed_completion`,
  `lean_begin`) — 50/50.
- Delegation/promotion/attempt suites — 239/240; the single failure is the pre-existing local
  Windows `lean_work_execution_world` (`WORLD_MISSING` at export), unrelated to these changes.
- Architecture tests — 315/315.
- PSVR-A accepted head — 14/14; PSVR-B accepted head — `check.mjs --final` 46 assertions PASS.

## 6. Architecture reading

What earned its place in these runs:

- **Execution world + settlement contract**: every task produced a commit in an isolated world, the
  suite ran on the candidate, and the canonical head moved only through promotion.
- **Current-input observation + context delivery**: the only path by which the note/survey reached
  the workers. The untracked input never became an accepted source in A; in B it became part of the
  candidate and then of the accepted package, explicitly.
- **Readiness/finalize**: the stand-in principals used `finalize` and it settled only when the world
  was clean, the suite green and the inputs declared. (Adoption by a real model is still unproven.)
- **Promotion with verification**: the verifier and the head reconciliation made each acceptance an
  event with a commit, not a flag.

What the runs exposed as friction:

- **One RUNNING attempt per project** and the VERIFYING latch make formal multi-agent work
  *sequential*. A project that needs three interdependent tasks needs three acceptances. This is the
  biggest structural limit on "multi-agent synthesis" and the first candidate for an on-demand
  parallel mode.
- **Delegation state discipline is brittle**: `delegate` only bootstraps a task whose pending
  decision is exactly `TASK_STARTED`; a scheduler step too many creates the attempt and the
  delegation refuses. This cost several runs.
- **Promotion of a candidate that adds an untracked canonical path is `OPERATION_UNCERTAIN`.** The
  survey had to be removed from the canonical tree before the operator could accept the package that
  contained it. A product that encourages "the input becomes the basis copy" must handle this
  collision.
- **A takeover declaration cannot be recorded without a settlement.** An empty world cannot be taken
  over, so a principal that continues in it is recorded `UNATTRIBUTED` (observed in A-2).
- **The product's verifier is a git-diff check**, which is a shallow independence proof for a
  behaviour task; the scenario's own checker is the real gate.

## 7. Negative results and honest limits

- **No model was involved.** Every agent action is a labelled deterministic stand-in; the prompt was
  written by the experimenter, and the artifacts are the scripted actor's output. This proves the
  host/product path, not model judgement.
- **The 7-fact/quality question is untouched.** There is no comparison with F+Finish+Commit.
- **PSVR-A's successor commit cites an empty digest.** The stand-in wrote
  `// Compatibility basis: … (sha256 )`: the mock's digest substitution did not reach the nested
  pull result. The pull itself is proven by the worker's guard (`returns (stream Reading)` must be
  present or the turn throws) and by the committed streaming implementation, but the citation is
  incomplete.
- **Duplicate principal sessions were observed**: two DSH sessions carried the same principal prompt
  in several runs. The harness tolerated it (one delegation wins, the other is refused); it is a
  real observation about the host, not a scenario feature.
- **PSVR-B's recommendation is only as good as its arithmetic.** The checker validates consistency
  and sourcing; it cannot tell whether the selection is a good engineering decision.
- **The scenario fixtures are small.** They are runnable and their checks are real, but they are not
  production systems.

## 8. PSVR-C — pre-registration and the fail-closed gate

`research-evidence/psvr/live/cohort-psvr-c.json` pre-registers four hypotheses with null results and
observables, the F/A/G conditions, two interruption controls (matched token, matched work state), the
15 metrics and the statement separation. `scripts/psvr/run_psvr_c.mjs`:

- without `--execute`: validates the cohort and writes a plan with **`modelCalls: 0`**, exit 0;
- `--execute` without a `psvr-spend-authorization/v1`: `BLOCKED.json`, exit **2**, modelCalls 0;
- an ALHS/ODPE-R authorization is rejected by schema;
- a valid authorization without an adapter: `ADAPTER_NOT_CONFIGURED`, exit **3**, modelCalls 0;
- only a valid authorization plus a named adapter spawns one session.

The gate was exercised in all four states. The ALHS/ODPE-R authorizations do not transfer.

## 9. Git

- Baseline `origin/main`: `abc9d96` (PR #219 merge), tree `fade0b5`.
- Branch: `palimpsest-project-synthesis-value`.
- Commits: `b3cec8b` (PSVR-0 + fixtures + scenarios), and the delivery commit that adds this report,
  the evidence and the last acceptance fixes (its hash is this file's commit, see `git log`).
- PR #220 remains OPEN and unmerged; no merge, no force-push, no history rewrite.
- Working tree: clean after the delivery commit.
