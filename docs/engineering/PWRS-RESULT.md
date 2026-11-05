# PWRS — Project Work Relay & Synthetic Continuity: result

Status: **PWRS-A/B/C implemented; deterministic real-host relay executed on 2026-11-05. No paid model
call was made.** This stage was authorized as code + deterministic Host + offline analysis only; the
ALHS core/repeat/diagnostic authorizations do not transfer.

Evidence: `research-evidence/pwrs/2026-11-05/`.
Code baseline: `b3690881bb4d195975a0edd35a5f0bb78e992881` (tree
`11e8382e7da0bf053c709a882f1b5282fc3caf4b`), branch
`palimpsest-autonomous-long-horizon-synthesis`.

## 1. The problem this stage had to solve

The ALHS diagnostic's G case ended with a true but misleading record: the worker died before it
committed, the continuation principal wrote the candidate into the worker's retained world, settled
the attempt, and the product reported a COMPLETED candidate. Every canonical fact was true (attempt,
world, result commit, completion contract, VERIFYING) and "the worker produced this" was not
observable at all. The gap was not one missing field:

- `settleMutatingWork` observed the world (HEAD, changed files) but nothing observed **who was
  executing**;
- `completeTask` refused a settlement only when **this host's** job map still held a job, so a
  restarted host happily resumed a RUNNING attempt's world with a new worker even though the old
  writer's liveness was unknown;
- no record distinguished an original worker's bytes from a principal's recovery bytes, and
  independence had no input that could tell them apart;
- the episode's artifact check read only the canonical worktree, so a governed candidate in a result
  commit was reported "not found" (the diagnostic's second finding).

## 2. What was built

### 2.1 Execution observations (PWRS-A)

`src/work/execution_relay.ts` (new, L2) defines:

| Concept | Meaning |
|---|---|
| `ExecutionInvocation` | one worker invocation this HOST ran: start/end time, world HEAD before/after, outcome `OPEN` / `ENDED` / `UNCONFIRMED` |
| `ExecutionInvocationLedger` | the per-process memory of those invocations. **Non-durable by design**; after a restart an empty ledger means *not observed*, never *no worker ran* |
| `attributeSettlement` | derives `ORIGINAL_WORKER_OBSERVED` / `SUBSEQUENT_WORKER_OBSERVED` / `PRINCIPAL_RECOVERY` / `MULTI_EXECUTOR` / `UNATTRIBUTED` from the settled HEAD against the observed invocation windows |
| `relayAvailability` | which routes (`RESUME` / `TAKEOVER` / `SUCCESSOR`) are mechanically safe for an open attempt |
| `ExecutionRelayRecord` | the ONE durable record: an ordinary project-journal note with a marker |

The attribution separates four things the previous code collapsed:

```text
work authorization   the attempt's envelope                  (canonical, unchanged)
execution window     which invocation this host observed      (host-local observation)
settlement act       who closed the attempt                   (canonical report, unchanged)
declaration          what a principal says it did             (recorded as DECLARED)
```

**What an attribution is not.** `ORIGINAL_WORKER_OBSERVED` means the settled tree existed at the end
of a worker invocation this host ran. It is not a byte-level authorship proof, the product never
consults Git author metadata, and a wrapper or sibling process inside the window would be credited
the same way. `UNATTRIBUTED` is the honest answer whenever the window is missing.

### 2.2 The settlement path

`src/work/attempt_execution.ts` now:

1. refuses **any** settlement while this host still observes an `OPEN` invocation for the attempt
   (`WORKER_STILL_RUNNING`);
2. refuses a principal settlement whose last observed invocation ended **without a confirmed exit**
   (`EXECUTOR_LIVENESS_UNCONFIRMED`) unless the caller records a takeover declaration;
3. computes the attribution from the observed windows against the settled HEAD, before the effect
   chain, and returns it on `SETTLED`.

`src/interaction/work_delegation.ts` records the window around every worker run (blocking and async),
ends it `UNCONFIRMED` when the port throws, and passes
`observation: { path: "WORKER", invocationId }` into settlement. It also refuses to start a second
worker into a RESUMED attempt when this host has never observed that attempt's invocation
(`EXECUTOR_LIVENESS_UNKNOWN`) — an empty job map is no longer read as an empty world.

`src/application/surfaces/work.ts` names the principal path (`path: "PRINCIPAL"`) and adds the
`relay` action:

| Route | Precondition | Effect |
|---|---|---|
| `takeover` | an observed `ENDED` invocation **or** an explicit `declareExecutorAbandoned=true` | settles the SAME attempt after observing the world; attribution is worker-observed or `PRINCIPAL_RECOVERY` (DECLARED) |
| `successor` | no active host job and no open invocation | reports the attempt CANCELLED, steps the scheduler, returns the retained world path and path-level reuse facts; the next attempt runs in a NEW world at the same basis |

The relay never accepts, promotes or verifies. `workers` now also exposes each attempt's
`worldPath` (a path, not authority) so a new principal can inspect a retained world it did not create.

### 2.3 Durable record and the pulse

`src/composition/execution_relay.ts` writes ONE `REFERENCE_NOTE` per settlement through the existing
project journal. `ProjectPulse` parses those notes (`executionRelayRecords`) and exposes
`execution.attempts[].relay` with attribution, executor, settled-by, result commit and
`independenceEligible`. The `EXECUTION_UNOBSERVED` decision item now names the relay routes instead of
telling the operator to inspect blindly.

### 2.4 Candidate artifacts and episode currentness (PWRS-C)

`src/composition/continuity.ts`'s artifact observer now reads, in order:

1. the live worktree (tracked / committed / dirty, digest);
2. the latest COMPLETED attempt's **result commit** (`git cat-file blob <commit>:<path>`, source
   `RESULT_COMMIT`, the commit recorded);
3. absent.

A committed artifact is digested from its **Git blob**, not the checked-out bytes: on Windows the
worktree may be CRLF while the blob is LF, and hashing raw bytes made the same committed content look
changed after promotion (measured in the first host run, fixed before the final one).

`buildPulseEpisode` now reopens a conclusion when:

- the project revision or the repository head moved (unchanged);
- a **basis-bearing** journal record arrived after it (plain notes still count; the product's own
  undecided contribution bookkeeping no longer reopens every delivery);
- a named artifact's **digest changed** even though revision and HEAD did not;
- a task the conclusion was waiting on became `SATISFIED` (the operator accepted it).

The composition overlays the digest check on every pulse read, so a real file edit without a commit
reopens the episode while an unrelated bookkeeping note does not.

### 2.5 Reuse facts (PWRS-B)

`src/work/path_reuse.ts` is now the ONE path-level diff. Both the continuation face (completed
results) and the relay (retained attempt worlds) call it, so `unaffected` / `conflicted` /
`already-present` cannot drift between an abandoned attempt and a settled result. The facts remain
advisory: an unchanged path is not a true claim, and no path is accepted content.

## 3. Real-host timeline

Run: `scripts/pwrs/run_pwrs_host.sh` → `research-evidence/pwrs/2026-11-05/`.
The Host, worker processes, worktrees, SQLite state, Git, Work settlement, journal, relay and
Promotion are real; the model content is the labelled deterministic Messages stand-in.

| # | Event | Evidence |
|---|---|---|
| T0 | project seeded from `468aa42` with one `package` task | `out/seed.json`, `artifacts/canonical-git-log.txt` |
| T1 | P1 host delegates the task; a real worker starts in its own world | `sessions/P1/run.log` |
| T2 | worker writes and commits `deliverables/partial.md` (`a056722`) | `out/partial-committed-at.txt`, `artifacts/partial.md` |
| T3 | **the host tree is killed**; the attempt is still RUNNING | `out/attempt-state-after-kill.txt`, `sessions/P1/killed-at.txt` |
| T4 | the retained world is observed: head `a056722`, subject `write worker pricing partial` | `out/retained-world-*.txt` |
| T5 | a measured 700 mm corridor arrives in `sources/measured-corridor.md` | `out/constraint-arrived-at.txt` |
| T6 | P2 (new host) reads the pulse and the retained world by path | `sessions/` P2 session stream |
| T7 | P2 reuses the pricing text, recomputes the corridor basis, writes `deliverables/package.md` **in the retained world**, commits `167e5a0` | `artifacts/package.md`, canonical log |
| T8 | `relay relayRoute=takeover declareExecutorAbandoned=true` settles the SAME attempt at `167e5a0` | `journal-records.json` relay record |
| T9 | attribution: `PRINCIPAL_RECOVERY`, `DECLARED_ABANDONED`, `workerInvocations=0`, `independenceEligible=false` | `pwrs-summary.json.relay` |
| T10 | `conclude WAIT_FOR_OPERATOR` records the artifact as `RESULT_COMMIT` at `167e5a0` | `journal-records.json` |
| T11 | the operator promotes `promotion-5a789d…`; task `SATISFIED`, head `7eb3593` | `out/promoted-at.txt`, `out/promote-package.json` |
| T12 | P3 records `DELIVER`; the artifact is now `WORKTREE` at the same blob digest `46ba8227…` | `journal-records.json`, `pwrs-summary.json` |

Measured reuse (from the actual bytes, not a copied file):

- the retained partial is `f5a12bca…`; the accepted package is `68cbef57…`;
- `pricingInherited=true` — the worker's vendor pricing text appears verbatim in the final package;
- `measuredBasisPresent=true` — the 700 mm measurement is stated;
- `supersededAssumptionAbsent=true` — the baseline "assumed 1200 mm" sentence is gone;
- the canonical tree is clean and the promotion commit contains both the partial and the package.

The WAIT and DELIVER conclusions record the **same artifact digest** (`46ba8227…`) from different
sources, which is what makes the post-promotion read current rather than spuriously reopened.

## 4. Capability verdict

| Capability | Verdict |
|---|---|
| Work Relay | **Implemented**: `takeover`, `successor`, observed/declared liveness, retained world read |
| Original-worker exit observation | **Verified** in unit/integration tests (`ENDED` vs `UNCONFIRMED`); the host kill itself is observed by the harness, not by the product |
| Cross-host write exclusivity | **Partial**: the product refuses a second worker into an unobserved world and isolates successors; it cannot prevent a principal with shell access from writing in a path it can reach |
| Real artifact after takeover | **Verified**: `167e5a0`, committed in the retained world and promoted to `7eb3593` |
| Execution-source attribution | **Observed** when a window matches, **Declared** for a takeover, **Unknown** after a restart (`UNATTRIBUTED`) |
| Multi-agent synthesis | **Verified deterministically**: worker pricing + principal recomputation in one package |
| Partial reuse | **Measured**: pricing inherited, superseded assumption absent, both facts read from the bytes |
| Independent verification | **Not manufactured**: a principal takeover sets `independenceEligible=false`; no verifier was run or claimed |
| Episode currentness | **Verified**: candidate read from the result commit; digest-stable after promotion; digest change reopens (unit test) |
| Cross-session continuation | **Verified**: P1 killed, P2 and P3 are new sessions on durable state only |
| Final acceptance | **Verified**: existing operator Promotion, no bypass |
| Autonomous model behaviour | **Not observed** — the content is a deterministic stand-in; no model claim is made |

## 5. Negative controls

| Control | Result |
|---|---|
| Original worker still alive | `relay` refuses takeover and successor while this host observes an `OPEN` invocation; `settle` refuses `WORKER_STILL_RUNNING` (`test/pwrs_relay.test.ts`) |
| Original worker exited | takeover settles the same attempt with `OBSERVED_EXIT` and credits the worker's window; the principal only settles it |
| Liveness unknown | same-world takeover requires an explicit declaration (`DECLARED_ABANDONED`); without it, the surface refuses and offers `successor` |
| Mixed authorship | the principal-authored candidate is `PRINCIPAL_RECOVERY`, never `ORIGINAL_WORKER_OBSERVED`; `independenceEligible=false` |
| Independent verification | no verifier ran; the record explicitly excludes the takeover from independent production |
| Partial old result | the retained pricing is reused; the superseded assumption is not carried |
| No-value old result | not exercised by a dedicated scenario; reuse facts are advisory and the successor may ignore them |
| Lightweight direct work | unchanged: `alhs_episode_convergence` and `aps_project_pulse` pass |
| Episode artifact changed | digest comparison reopens on a byte change with the same revision/HEAD (unit test) |

## 6. Tests and CI

- `test/pwrs_relay.test.ts` — 12 tests: attribution rules, route availability, candidate-in-result-commit,
  liveness refusal + successor in a new world, observed-exit takeover, declared principal recovery,
  open-invocation refusal.
- Existing hot spots re-run: `alhs_episode_convergence` (7), `alhs_partial_reuse` (1),
  `lean_work_delegation_transport`, `lean_delegation_runtime`, `lean_execution_world`,
  `lean_d5d_result_continuation_service` (13), `aps_project_pulse` (7), `trajectory_t0_work_rework`
  — **90 tests pass** in the final run.
- `tsc -b` clean; `module-architecture --check` PASS (0 violations); `--check-public-api` PASS.
- `test/lean_work_execution_world.test.ts` has one **pre-existing** failure (`RESULT_NOT_EXPORTED`
  because that fixture's `GitCliPort` root and the composed world root differ). It fails identically
  on the baseline `b369088` and is not caused by this stage.

## 7. Limitations

1. The run is deterministic: it proves the product mechanics and a real relay through a real Host; it
   says nothing about how a model chooses to relay.
2. The invocation ledger is process-local. After a restart the product cannot attribute a committed
   but unsettled result to the worker, and records `UNATTRIBUTED`. A durable per-invocation record
   could close this; it was not added because the settlement record is the fact the next session needs
   and a second durable ledger is explicitly out of scope.
3. The product can refuse to *run a second writer* into an unobserved world, but it cannot prevent a
   principal with shell access from editing any path it can reach. The boundary is honest
   classification plus the operator gate, not a filesystem sandbox.
4. `successor` inherits nothing automatically. It returns the retained world and its path facts; the
   new executor must read and carry what it judges still valid. That is deliberate (path facts are not
   semantic truth) but it means a model that ignores them redoes the work.
5. One scenario, one pair of executors. No repeated sample and no real-model comparison; a governed
   recovery cohort would need a new authorized budget.

## 8. Git facts

- Development start: `b3690881bb4d195975a0edd35a5f0bb78e992881` (tree `11e8382e…`), clean.
- Branch: `palimpsest-autonomous-long-horizon-synthesis`; `origin/main` untouched at
  `d16800fbe3d1a6172b66b466b227c5fddbb45b98`; no push, PR or merge.
- Code changes (14 modified, 5 added; see `git show --stat <commit>`):
  - new `src/work/execution_relay.ts`, `src/work/path_reuse.ts`, `src/composition/execution_relay.ts`,
    `test/pwrs_relay.test.ts`, `scripts/pwrs/*`, `research-evidence/pwrs/*`;
  - modified `src/work/attempt_execution.ts`, `src/interaction/work_delegation.ts`,
    `src/tools/controller.ts`, `src/application/surfaces/work.ts`, `src/application/factory.ts`,
    `src/composition/{application,continuation,continuity}.ts`, `src/install.ts`,
    `src/project_continuity/{episode,index}.ts`, `src/project_pulse/{service,types}.ts`,
    `src/adapters/dsh/normal.ts`.
- No historical Code/Evidence Freeze, Ordarium ledger, lock or gate root was modified; no branch or
  worktree was deleted.
- Relation to LHAPE/ALHS: this stage builds on the ALHS HEAD and does not rewrite its evidence; the
  ALHS branch is the development line, and PWRS adds product capability plus a new deterministic
  scenario. The LHAPE final commit and all ALHS commits remain ancestors.
