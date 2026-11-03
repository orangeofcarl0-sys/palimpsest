# Trajectory-P2-D0 — Consumer Integrity & Context Readiness

Baseline: `234d040c234f9bfdda0bd210b91b45292588a7b6` (branch `trajectory-p2c-attributed-execution-preview`)
Branch: `trajectory-p2d-consumer-readiness`

P2-C established that real, source-qualified DSH execution evidence could be associated to a canonical Work
Attempt and presented through a normal product composition. P2-D0 closes the consumer-facing gaps that a
code review found in that result and produces the first bounded, read-only information surface an Agent
consumer may receive. It adds no new Agent Runtime, no Scheduler, no second Work authority and no new
storage owner.

## What was wrong at the baseline

Seven defects were reproduced against the shipped code and eleven more established from source (see
`research-evidence/trajectory-p2d0/baseline-falsifiers.json`):

- **F1** the Parent observed Session identities A, B and C for one Invocation, and only A reached durable
  ingestion: the tracker's `dshSessionId` is always the first identity, and the recorder persisted only it.
- **F2** one qualified Invocation beside one `OBSERVATION_INCOMPLETE` Invocation reported `SELECTED_UNIQUE`
  with the detail "no unresolved alternative exists".
- **F3** the qualifier rechecked currentness before returning, but the adapter read the DSH page afterwards
  with no second relevant-basis check.
- **F5/F6** the delegation finalized every Invocation of an Attempt `CLOSED` from a single
  `INVOCATION_RETURNED` reason, so a timeout/abort closed an unclosed window and one Job closed another.
- **F7** two Attempts both qualified the same source-scoped Session identity.
- **F8** an invariant-refused binding still reported `SESSION_READ`, `FULL` coverage and `COMPLETE`.
- **F9** an in-memory association store produced a `VERIFIED` binding with a durable-looking reference.
- **F10** the mounted DSH reader's asynchronous close was voided, so `dispose()` did not await it.
- **F11** an expert Worker Port borrowed a first-party source basis computed from `workWorkerBin`.
- **F13** the attributed Preview replaced real Canonical Work and T0 facts with placeholders.
- **F17/F18** historical source epochs were unreachable from a normal deployment, and `Deployment.installed`
  did not type the capability the runtime actually carried.

## What P2-D0 changed

### Identity preservation (C2)

`WorkWorkerSessionIdentityObservation` now carries `reportedSessionId` — the identity the *current* IPC
message reported — beside the cumulative `dshSessionId`. The recorder persists the raw report, so the
durable candidate set for A/B/C is `{A, B, C}` and a repeated A stays idempotent. A cross-Attempt creator
conflict is now refused: a targeted `replayForSession` probe (SQLite `json_extract`, bounded by a
`(project_id, type, seq)` index) lets the qualifier detect a *different* Attempt claiming the same
SessionId under the same source scope, and it does so both before the DSH header read and again as part of
the currentness basis.

### Temporal integrity (C3)

- `CHILD_EXIT_OBSERVED` is the only close reason that establishes a terminal boundary. The product path
  finalizes **per Invocation** from the Port's own `DIRECT_CHILD_EXIT_OBSERVED` observation; a
  timeout/abort (`DIRECT_CHILD_EXIT_UNCONFIRMED`) leaves the window incomplete.
- `finalizeAttempt` no longer records `CLOSED` for every Invocation; the only honest attempt-wide fact
  (the Parent ending) is recorded as `UNKNOWN`, which the window validator refuses to treat as a closure.
- Invocation selection returns `SELECTED_UNIQUE` only when **no other Invocation exists at all**; otherwise
  the result is `AMBIGUOUS_REQUIRES_SELECTION` and names the unresolved alternatives.
- The attributed adapter performs a bounded **post-Event-Read** relevant-basis recheck scoped to the
  selected Invocation; a relevant change yields `RACED` with no admitted events and no retry loop.

### Canonical and project reality (C4)

The attributed adapter now calls the **existing** V0 helpers — `canonicalFactsOf`, `buildRelationContext`
and `projectEvolutionOf` — instead of supplying placeholders. The product cluster wires
`projectEvolutionOf` over `composeTrajectoryInputs` built from the same cross-owner reads the V0
composition uses, so a real projection root, semantic digest, Work sequence/digest, ProjectIR revision and
the selected/quarantined relations are presented, or the honest structured failure origin. Verification
remains `NOT_OBSERVED_BY_V0`, the same value the ordinary V0 Preview uses; nothing is inferred from a
completed attempt.

### Product correctness (C5)

- A `:memory:` store yields `durability: "EPHEMERAL"`; a file-backed store yields `DURABLE`. The value
  travels on the qualification and the Capsule.
- `OwnedResource.close` may return a promise and the lifecycle **awaits** it, so `await installed.dispose()`
  waits for the mounted reader's Cordis fiber. Synchronous resources are unchanged.
- An explicit Worker Port with no explicit source kind is classified `UNKNOWN`, never `FIRST_PARTY_DSH_HOST`.
- `historicalEpochs` is exposed through the install options and forwarded by `install.ts`.
- `Deployment.installed` is typed `InstalledPalimpsestWithTrajectory`.
- A contradicted binding can no longer report `SESSION_READ` + `FULL` + `COMPLETE`; the ordinary "read but
  unattributed" case still reads `SESSION_READ_NOT_ATTRIBUTED`.
- A Caller Claim that disagrees with the verified SessionId is explicitly reported; the verified SessionId
  remains the only read target.

### The Trajectory Context Capsule (C6)

`src/trajectory/context_capsule.ts` builds a bounded, read-only presentation of one historical Attempt's
already-qualified evidence: at most 24 events, 240 characters per summary and 8192 characters total, with
truncation reported. It is framed `HISTORICAL_DATA_NOT_INSTRUCTIONS`, its `authority` is
`READ_ONLY_INSPECTION`, and it states seven things it does not authorize.

The consumer's permission is its own **canonical governed-rework lineage**, resolved by a port the product
composition wires to the same durable lineage the Context owner uses. A caller-supplied origin Attempt is a
selector that must agree with the lineage. There is no unrestricted `readAnyTrajectory(sessionId)` tool and
no global Session lookup.

## Evidence

| Artifact | Class | Result |
|---|---|---|
| `ipc-candidate-preservation.json` | REAL_PARENT_IPC | A/B/C preserved; duplicate A idempotent; qualification CONFLICT |
| `invocation-finalization.json` | REAL_PARENT_IPC | one CHILD_EXIT_OBSERVED finalization, per Invocation |
| `trajectory-context-capsule.json` | CONTROLLED_FIXTURE + REAL_FIRST_PARTY_DSH_NO_MODEL | bounded Capsule; arbitrary attempt refused |
| `real-cold-capsule.json` | REAL_FIRST_PARTY_DSH_NO_MODEL | PASS: 3 real DSH events, BOUND_VERIFIED, no model call |

The real gate (`scripts/trajectory_p2d0/cold-capsule-gate.mjs`) runs two independent processes: Process A
creates a real canonical Attempt and a real first-party DSH Session with no model turn, and Process B
recomposes the product fresh, recovers the association and derives a bounded Capsule from the recovered
Preview.

## Honest limits

- **Runtime.** The repository documents `node >= 24.15.0`; the only runtime on this host is `v24.14.1`. The
  caveat from P2-C persists and is disclosed in the verdict.
- **Source basis.** The trusted basis hashes executable *paths*, so it is a local trusted-composition
  boundary, not content attestation.
- **Source scope.** The cross-Attempt conflict scope is the adapter id and worker-bin digest, not the
  sessions root on disk.
- **Default DSH home.** The reader is composed only when the host supplies `DSH_HOME`; the supported
  default-home behavior is recorded as a limitation rather than guessed.
- **Capsule authorization.** The AUTHORIZED lineage path is proven at the controlled level with a real
  canonical Attempt; the real-DSH gate proves the bounded projection over real evidence and the refusal of
  an arbitrary attempt. A real governed-rework reopening was not constructed in the gate because it
  requires the full D5 admission stack.
- **Currentness.** The post-read recheck is a bounded optimistic read-check, not a distributed transaction.

## Not in scope

Automatic Handoff, the P2-D1 stochastic utility trial, live model testing and PRIMARY remain unimplemented.
The D1 protocol is prepared in `research-evidence/trajectory-p2d0/d1-benchmark-readiness.json` and no
stochastic trial was run.
