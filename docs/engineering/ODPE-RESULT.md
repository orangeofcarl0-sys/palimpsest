# ODPE — Outcome-Driven Project Execution

Status: **implemented and verified on a deterministic real Windows DSH host**. No paid model session
was started in this stage; the ODPE prompt authorizes none by itself, and none was requested.

Evidence: `research-evidence/odpe/2026-11-05/`.
Baseline: `main` at `d16800f`; branch `palimpsest-autonomous-long-horizon-synthesis`; stage start
`9953954` (tree `411536f`).
Product commit: `80358dbfb65026517e14d5e32a694fa6783a00b7`.
Result commit: this file's commit.

## 1. Why this stage

PWRS established the relay, attribution and input gates, but the real-model runs exposed a product
gap rather than a discipline gap:

| Run | A business | A final Work state | Episode |
|---|---|---|---|
| R1 | 5/7 | stale draft settled | no natural end |
| R2 | 7/7 | correct commit, attempt RUNNING | no natural end |
| R3 | 7/7 | COMPLETED / VERIFYING, operator accepted | WAIT_FOR_OPERATOR, natural |
| R4 | 7/7 | correct work, attempt RUNNING | no natural end |

The same three failures recurred: current reality (a measured input) had no delivery path except a
boolean; a correct candidate had no natural mechanical finalization; and a model could settle before
the current facts were confronted. ODPE addresses exactly those three, using the existing owners.

## 2. Phase 0 — integration closure (the seven #219 failures)

The PR's Linux `unit` job had four failing files and seven tests. All seven are fixed in product or
fixture, never by loosening the boundary:

| Failure | Resolution |
|---|---|
| `lhape_execution_surface`: stop REQUEST expected to settle | The test now uses the **legal declared takeover** (`relay takeover declareExecutorAbandoned`) and asserts `PRINCIPAL_RECOVERY` / `DECLARED_ABANDONED` / not independent. The product kept refusing an unconfirmed exit |
| `trajectory_p2d0_ipc_preservation`: no identities | Fixture now supplies the real `executionInvocations` ledger; the real IPC → correlation → recorder chain is unchanged |
| `install.ts` fan-out 22 | Removed the `ProjectIr` edge (type re-exported through the continuity composition) and moved the relay recorder into `composition/continuity.ts`; fan-out now 20 |
| `surfaces/work.ts` 1,117 lines / extra importer | Split into one contract plus projection / execution / settlement / outcome modules; the cluster is 28 lines and `composition/application.ts` imports the contract, not the cluster |
| `surfaces/project.ts` 419 lines | External-asset face extracted to `application/project_assets.ts`; 363 lines |
| `normal.ts` 531 lines, direct `project_continuity` import | Long actions moved to `application/normal_work.ts` (a recorded, pure vocabulary/helper dependency); the adapter is 253 lines and imports the façade vocabulary only |

Post-closure: `architecture:check` PASS (controller 4,828 LOC / fan-out 39, at its ratchet),
`public-api:check` PASS (0 missing, 0 added).

## 3. ODPE-A — current reality delivery

### 3.1 The observation (`src/work/unseen_inputs.ts`)

`observeProjectInputs({ repository, baseCommit })` returns an **observation**, not a string list:

- `UNTRACKED`, `TRACKED_MODIFIED`, `COMMITTED_SINCE_BASE`, and explicitly `REGISTERED` ignored paths;
- each with `content` (`WORKTREE` / `COMMIT` / `ABSENT`), sha256, byte count, revision, time;
- `unreadable` paths and the `limitations` the observer cannot cross;
- `state: "UNAVAILABLE"` when Git cannot be read — an empty list can no longer mean both “nothing
  changed” and “I do not know”.

`readProjectInput` returns the exact bytes, or `CHANGED` with the new digest, or `UNAVAILABLE`.
`assessCanonicalInputs` answers the start-time question: a dirty **out-of-scope** path the observer
read is a current input; an in-scope dirty path stays unowned work (in-place work stays strict).

### 3.2 The delivery (existing Context owner, no second store)

- `ContextManifest` gains optional `inputs` (identity only) and `input_observation`; old manifests
  parse unchanged.
- `distributeContext` adds pull-only `@ctx/input/<path>` handles; `fetch` resolves the binding and
  returns `DELIVERED`, `CHANGED` or `UNAVAILABLE`.
- The manifest is append-once per attempt: a later `compile` returns the original binding, so a
  changed file after compilation is a NEW fact, not a silent rewrite.
- `WorkWorkerAttemptContext.compiled` carries `inputs` only when bindings exist, and
  `inputObservation` when there are inputs or the observation is `UNAVAILABLE`; a deployment with no
  repository is `NOT_CONFIGURED` and keeps the pre-ODPE shape.

Delivered context is **not** acceptance: the input stays untracked, the canonical head does not move,
and the host run proves the input is absent from the canonical commit.

## 4. ODPE-B — outcome readiness and bounded finalization

`src/application/work_outcome.ts` derives, from the owners only:

- task/attempt state, world head, uncommitted set, result commit;
- host job phase, stop request, last invocation outcome (`OBSERVED` / `UNCONFIRMED` / `UNKNOWN`);
- required artifacts present in the world and in the commit;
- current inputs (`OBSERVED` / `UNAVAILABLE` / `NOT_CONFIGURED`) with the semantic relevance left to
  the principal;
- completion contract evaluability and verification satisfiability.

It classifies ONE next action: `CONTINUE_WORK`, `SEMANTIC_JUDGEMENT` or `MECHANICAL_FINALIZATION`,
with reasons and an `observationDigest`.

`finalizeOutcome({ taskId, expectedObservationDigest, acknowledgeInputs? })`:

1. re-observes everything; a moved world/input/project is `STALE_OBSERVATION` (no settlement);
2. a task already VERIFYING with a COMPLETED result is `ALREADY_SETTLED` (no duplicate);
3. anything but `MECHANICAL_FINALIZATION` is `NOT_READY` (the semantic decision is not made for the
   model);
4. otherwise settles through `completeTask` — the SAME `settleMutatingWork` path — which re-observes,
   evaluates the completion contract, refuses an unacknowledged input, exports and reports;
5. advances the existing scheduler and returns the handoff, stopping before operator acceptance.

It never promotes, never verifies, never records an episode conclusion and never creates a Candidate.

## 5. ODPE-C — real host execution (cross-domain)

The scenario is a **software migration** (billing REST → gRPC), not the energy fixture: no `inbox/`,
no `700 mm`, no report template. The model content is a labelled deterministic Messages stand-in; the
host, workers, Git, worlds, context pull, Work, episode and Promotion are real.

| Step | Fact | Evidence |
|---|---|---|
| T0–T1 | A real worker committed a partial plan `c14540f` in its world | `timeline.json`, `retained-partial-plan.md` |
| T2 | The host tree was killed; attempt stayed `RUNNING` | `attempt-state-after-kill.txt` |
| T3 | `updates/2026-11-03/payload-measurement.md` appeared untracked, 337 B, sha256 `9f15b493…` | `measured-input.md`, `input-sha256.txt` |
| T4–T6 | A new principal closed it as a **successor** (`SUCCESSOR_READY`, inputs listed) and started a NEW attempt | `successor-result.json`, `timeline.json` |
| T7 | The new manifest bound the input with `digest=9f15b493…`, `identity=UNTRACKED` | `current-reality.json` manifests[1] |
| T8 | The worker pulled `@ctx/input/updates/…`; telemetry records the handle | `current-reality.json` pulls, `worker-logs/` |
| T9 | The worker wrote the plan FROM the pulled text and committed `c37b04b`; it exited without reporting | `final-plan.md` |
| T10–T12 | `readiness` → `SEMANTIC_JUDGEMENT` (input unacknowledged); `finalize` with `acknowledgeInputs` → `SETTLED`, task VERIFYING | `readiness-before-finalize.json`, `finalize-result.json` |
| T13 | `WAIT_FOR_OPERATOR` named the result commit; the operator promoted `promotion-424f55dd…`, head `be6c0d9`, task SATISFIED | `timeline.json`, `promote-odpe.json` |
| T14 | A later session read the pulse and recorded `DELIVER` | `timeline.json` |

The final plan contains the measured 2.1 MiB fact and the streaming decision; the superseded “unary
is enough” assumption is absent. The input is **not** in the canonical commit.

Attribution: the principal closed an attempt whose worker invocation had ended on the settled head,
so the record is `ORIGINAL_WORKER_OBSERVED` / `OBSERVED_EXIT` / `independenceEligible=true` — an
observed window, not a byte-level authorship proof, and not the principal's own writing.

## 6. Capability verdicts

| # | Question | Verdict |
|---|---|---|
| 1 | Can a successor receive current reality through the product, without the principal copying files? | **Yes, on the real host.** The manifest bound the exact digest and the worker pulled it. The fixture never copied the file into a world |
| 2 | Can a correct candidate be finalized naturally instead of polled until the budget ends? | **Yes.** `readiness` classified the clean committed world as `MECHANICAL_FINALIZATION`; `finalize` settled it through the Work owner. This is a product path, exercised deterministically |
| 3 | Can a premature settlement be refused when current inputs are unprocessed? | **Yes mechanically** (`INPUTS_CHANGED_SINCE_BASIS`, and the readiness class). Whether the model *chooses* to re-read is not established here; `acknowledgeInputs` is a declaration, not a semantic proof |
| 4 | Are provenance, isolation and the asset boundary preserved across interruption/relay? | **Yes.** Successor → new attempt/world; observation attribution; the input stayed untracked and unaccepted |
| 5 | Does the result reach Candidate / acceptance / Episode and remain usable in a new session? | **Yes.** Promotion COMMITTED, task SATISFIED, WAIT_FOR_OPERATOR then DELIVER in a later session |
| 6 | Does this improve reliability/efficiency in complex long-horizon work? | **Not established.** No real-model comparison was authorized or run in ODPE; the deterministic host proves engineering, not model behaviour |

## 7. Negative controls

| § | Control | Where |
|---|---|---|
| 7.1 | premature settlement with an unread input | `odpe_outcome`: readiness = SEMANTIC, finalize = NOT_READY, then settles only with the declaration |
| 7.2 | correct commit, no settlement | `odpe_outcome`: MECHANICAL_FINALIZATION → SETTLED; idempotent second call = ALREADY_SETTLED |
| 7.3 | worker may still write | `odpe_outcome`: UNCONFIRMED exit = SEMANTIC and names `relay`; PWRS open-invocation refusal remains |
| 7.4 | input read failure | `odpe_current_inputs`: UNAVAILABLE, never an empty list |
| 7.5 | input changes after compilation | `odpe_current_inputs`: manifest digest unchanged; pull returns CHANGED |
| 7.6 | world modified after settlement | `pwrs_relay`: settled world `HISTORICAL`, `worldMovedAfterResult=true` |
| 7.7 | lightweight direct work | `lean_begin` / `pc1_placed_completion`: the direct path is unchanged; readiness is not required |
| 7.8 | episode after operator acceptance | `alhs_episode_convergence` refuses DELIVER before acceptance; the host run records DELIVER after promotion |
| 7.9 | cross-domain | this host run (software migration), plus the unit scenarios |

## 8. Tests

- `pnpm run build` — clean.
- `architecture:check` — PASS (0 violations; controller 4,828 LOC / fan-out 39).
- `architecture:check-public-api` — PASS (0 missing / 0 changed / 0 added).
- Hotspot suites (16 files, 143 tests): see `research-evidence/odpe/2026-11-05/tests.txt`.
- Full unit suite locally: **422 passed / 32 failed** before the last three fixes; the re-run of those
  32 files is **3 passed / 29 failed**, with the 29 being the pre-existing local Windows/DSH groups
  (`r3l0*` historical plan closures, `trajectory_*` host-boundary/installed-DSH tests,
  `lean_work_execution_world`). Baseline evidence: the same tests fail on a stashed clean HEAD
  (`r3l0ciarlcfs_gates`: 5 failures; `trajectory_h1_durability` + `lean_work_execution_world`: 8).
  They are not counted as ODPE regressions; they are *not* hidden either — the attribution is here.
- Real host E2E: PASS (the table in §5).

## 9. Limitations

- **No real-model comparison.** ODPE's authorization covers no paid session. The claim is *real host
  engineering verified*, not *autonomous model behaviour verified*.
- The deterministic worker's content is scripted; it reads the pulled bytes, but “the model would
  choose to pull” is not observed.
- One main cross-domain scenario. Tracked-modified input delivery is unit-tested, not host-tested.
  Registered ignored inputs have an API but no project registration surface yet.
- `finalize` intentionally handles the **observed-exit** case. An `UNCONFIRMED` worker goes through
  `relay` with an explicit declaration; that is a deliberate distinction, not a missing route.
- The P3 stand-in ran its plan in two DSH sessions and recorded `DELIVER` twice (same intent); the
  conclusion is advisory and no canonical Work state moved. Recorded in the evidence README.
- The local full suite's pre-existing failures are OS/installation-specific; CI is the authoritative
  Linux signal.

## 10. Git

- Baseline `main`: `d16800f` (unchanged).
- Branch: `palimpsest-autonomous-long-horizon-synthesis`.
- Stage start: `9953954`.
- Product commit: `__PRODUCT__`.
- Result commit: this commit.
- PR #219 remains open; **no merge**, no force-push, no history rewrite.
- The PR's cumulative diff includes LHAPE/ALHS/PWRS; the ODPE net change is the files listed in
  `research-evidence/odpe/2026-11-05/DELIVERY.json`.
