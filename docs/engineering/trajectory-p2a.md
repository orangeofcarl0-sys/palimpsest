# Trajectory-P2-A — First-Party DSH Session Identity Observation

**Stage:** `Trajectory-P2-A`
**Baseline:** `39cdabc0688d2dd08ccf5ab68611a1695dc97bbf` (`trajectory-h1-source-binding-contract`)
**Branch:** `trajectory-p2a-session-identity-observation`
**Completion state:** `TRAJECTORY_P2A_SESSION_IDENTITY_OBSERVATION_QUALIFIED`

---

## 1. What this stage establishes

Trajectory-P2-A produces the **first real runtime observation** that a future binding stage can
consume: a Parent-owned Worker Invocation is associated with the **actual DSH Worker Session** that
Host created — an identity taken from the created Agent handle, transported on the IPC channel the
Parent already owns, and stamped with the Parent's own invocation identity.

The governing rule is the one the ruling states: **P2-A establishes observation, not authority.** An
observed SessionId is not a durable binding, a Session creation is not a model turn, a model turn is
not Work verification, and a Work result is not promotion. Nothing in this stage collapses those
facts into one apparent success.

### What was missing before this stage

The H1 readiness report identified the gap precisely, and C1 measured it against the source: the DSH
Worker Host **minted** a candidate session id and passed it into `agents.create`, but **never read
back the created identity** and had no channel on which to report it. The Parent already owned a
strict structured IPC channel (`stdio[3]`), but its only parser was the context-pull envelope, so an
identity-shaped message would have been silently dropped. The identity existed at runtime and reached
no one.

---

## 2. Source architecture

### 2.1 Where the identity is minted, and where it becomes real

`host/dsh/lib/runner.js` (`runWorker`) calls `agents.create({ sessionId: brandString(\`worker-${randomUUID()}\`), ... })`.
That string is a **candidate**. The identity DSH actually creates is a different fact, and it is
established inside the installed factory:

```
AgentRegistry.create
  → AgentLoop.createAgent(ownerCtx, options)
      → sessions.prepare(options.sessionId, { meta })
      → await this.createStoredSession(preparation.session)   ← the session is STORED here
      → setupAndPublish(...) → initializeAgent → setup?.(...) → publish(source)
```

`AgentRegistry.enter` then asserts `agent.id === agent.session.id`, so the handle's session id and the
agent id are the same identity. The decisive property — **measured in C1 by
`scripts/trajectory_p2a/dsh-non-model-creation-feasibility.mjs`** — is that `createStoredSession`
precedes setup and publication, so a **resolved `agents.create()` yields a real session identity
independently of any later turn**. The probe creates an agent with zero `followup` calls and observes
`session.seq === 0` afterwards, which is what makes the no-model claim structural rather than hopeful.

### 2.2 The emission point

The report is emitted in the one window between creation and the first model turn:

```
const handle = await agents.create({ ... });
  ↓  P2-A: read handle.agent.session.id, report it on IPC
if (capabilityRefusal !== null) { dispose; throw ... }   ← SHIPPED refusal, unchanged
const agent = handle.agent;
await agent.whenIdle();
...
agent.followup(userMessage(...))                          ← the ONLY first turn
```

Three properties follow from that position, and each is asserted in C2:

- the identity **exists** — creation already resolved;
- it **cannot depend on the model** — the first `followup` is a later statement;
- a **refused** worker still reports its real created Session, because `SESSION_CREATED` does not
  imply `WORKER_ADMITTED` or `MODEL_TURN_STARTED`.

### 2.3 Why the IPC channel and not stdout

The worker runs a real engineering agent with shell and file tools, so **stdout is model-writable**:
any line on stdout is worker testimony. The Node IPC channel is a capability of the *Parent* process
(the port spawns with `stdio: ["ignore","pipe","pipe","ipc"]`), and the model cannot reach it. C3
proves the distinction by imitation: a child that writes `PALIMPSEST_SESSION_CREATED ...` to stdout,
and a protocol-shaped object to stderr, produces **no observation at all**.

### 2.4 Where the identity belongs in the layers

`WorkerSessionIdentityObservation` is declared in `src/interaction/work_delegation.ts` (L3), beside
`HostProcessObservation`, and imported by `src/deployment/work_worker.ts` (L5). That direction —
L5 → L3 — is allowed and is the one `HostProcessObservation` already uses. Declaring it in the
deployment module would make the delegation service's use of it a forbidden L3 → L5 edge, and
duplicating the shape in both layers is exactly the drift a previous stage removed.

---

## 3. IPC contract

**Channel:** `palimpsest-worker-session-identity-v1`
**Kind:** `session-created`
**Fields:** exactly `{ channel, kind, sessionId }` — `additionalProperties: false`

A **separate protocol** from the context pull (`palimpsest-worker-context-v1` / `pull`), by channel
and by kind, so an identity message is never processed as a pull request and vice versa. C3 asserts
both parsers are disjoint.

**SessionId validation.** A non-empty, bounded (≤ 200), non-whitespace, non-control string. The rule
is deliberately *moderate*: DSH's own `SessionId` is an unconstrained branded string (its session
schema is `z.string().min(1)`) and the worker host mints `worker-<uuid>`. A `worker-` prefix rule would
break the moment a resumed or forked session is reported; an any-string rule would admit control
characters or path-shaped values into durable evidence. Producer and Parent implement the same rule,
and a test pins the two channel constants equal across the JS host module and the TS parent.

**What the message deliberately omits:** ProjectId, AttemptId, HostLocalJobId, Parent InvocationId, a
durable binding id, `verified: true`, Work outcome, promotion status, model-execution result. None of
those is a Worker Session Creation fact, and C2 asserts their absence on the serialized message.

---

## 4. Producer implementation

`host/dsh/lib/session-identity.js` exports `reportWorkerSessionIdentity({ sessionId, send })`. It:

- reports only a **well-formed** identity; a malformed value returns `IDENTITY_NOT_WELL_FORMED`
  rather than sending something a lenient reader could coerce;
- returns `NO_IPC_CHANNEL` when `process.send` is absent — a normal configuration, not a failure;
- contains a **synchronous** send failure (`IPC_SEND_FAILED`) and an **asynchronous** one delivered
  through the send callback, which only logs;
- returns `REPORT_ATTEMPTED`, never `delivered` or `received` — it reports an *attempt*, and the
  Parent's receipt is a separate fact recorded on the Parent side;
- settles, verifies, promotes and grants nothing.

**A real defect this stage found and fixed.** The runner first passed `send: process.send` unbound.
Node's `process.send` reads `this.connected`, so the report threw
`Cannot read properties of undefined (reading 'connected')`. The Level C gate caught it — the host
telemetry read `{"reported":false,"outcome":"IPC_SEND_FAILED",...}` while a real session had been
created. The fix binds the sender to its receiver, and the containment design meant the worker's
outcome was never affected: the failure was reported, not thrown.

The runner also prints a noncanonical `PALIMPSEST_WORKER_SESSION_IDENTITY` telemetry line reporting
what it **attempted**, defaulting to `NOT_ATTEMPTED`.

---

## 5. Parent and Work correlation

### 5.1 Parent invocation ownership (§7.2)

The Parent port mints `const invocationId = \`wpi-${randomUUID()}\`` **before** the spawn and closes
the per-invocation tracker over it. The message carries no invocation id, so there is nothing in the
payload that could mis-attribute a report: a report is stamped with the Parent's own identity and the
pid of the child the Parent itself launched. C3 proves cross-child non-attribution with two children
in one process.

### 5.2 Repetition and conflict (§7.5)

`makeWorkerSessionIdentityTracker` implements the ruled semantics over the invocation's lifetime with
no persistent store:

| situation | result |
|---|---|
| first valid report | `OBSERVED` |
| repeated identical | idempotent |
| two different identities | `CONFLICT`; neither is chosen; the first is retained **as evidence** |
| invalid message | never displaces a valid observation and never creates one |
| no message | `NOT_OBSERVED` — not evidence that no session was created |

Order never decides authority: the first identity is not "the winner", it is the first observation,
and a disagreement is reported rather than resolved by arrival time. C3/C4 assert all five rows.

### 5.3 Work correlation (§8)

`correlateSessionIdentity` is the identity counterpart of the existing `correlateObservations`, built
on the same host-private boundary that already holds `prepared.attemptId` and its own job id:

- **AttemptId** — canonical Work, from `prepared.attemptId`, never a payload or a caller claim;
- **HostJobId** — this service's own `wdj-<uuid>`, or `""` on the blocking kernel that has none (the
  honest absent value, never an invented id);
- **InvocationId / SessionId** — adopted verbatim from the port's own observation, never re-derived.

The sink is **optional**: with no consumer attached the wrapper returns `undefined` and the run input
is byte-identical to the baseline. A throwing consumer is swallowed and changes nothing about the
worker's outcome or Work settlement.

---

## 6. No-model proof

The strongest evidence in this stage is the Level C gate
(`scripts/trajectory_p2a/level-c-first-party-gate.mjs`), which boots the **current branch's host
bundle** in a **test-owned DSH home** and drives the **shipped** worker port.

**The no-model strategy is the ruling's preferred one.** A test-owned profile mounts one extra plugin
registering ONE tool (`p2a_refusal_probe`) that is absent from the host's capability classification
table, so the runner's **shipped** fail-closed gate refuses the worker immediately after
`agents.create()` and before the first `agent.followup()`. Nothing is bypassed: the shipped refusal is
what fires. The probe is unreachable in production — no shipped profile mounts it.

| level | what it establishes | evidence class |
|---|---|---|
| A — controlled ChildProcess | the Parent parser and invocation correlation | `CONTROLLED_IPC_FIXTURE` |
| B — first-party session creation | `agents.create()` succeeds with zero turns | `REAL_FIRST_PARTY_DSH_NO_MODEL` |
| C — real Host Bundle → Parent | the whole route, no model | `REAL_HOST_PARENT_INTEGRATION_NO_MODEL` |

Measured result of Level C:

```
outcome:                       HOST_FAILURE (the shipped refusal)
observedSessionId:             worker-<uuid>   ← a session the Host actually wrote
observedInvocationId:          wpi-<uuid>      ← the Parent's own
observedSource:                DIRECT_CHILD_IPC_REPORT
observedSourceQualification:   FIRST_PARTY_DSH_QUALIFIED
hostSessionIdsMatchObservation: true
turnEventCountInWrittenSessions: 0
```

The no-model claim rests on **structure** (the refusal precedes the only `followup` call) and on
**measurement** (zero `turn/start` and `request/header` events in the written session), and it
**explicitly does not** rest on an absent provider or a failed request — a failed network call would
still be an attempted request, and none was made because no turn exists.

---

## 7. Failure windows

| window | behaviour |
|---|---|
| before spawn | abort returns `HOST_FAILURE`; no child, no identity |
| spawn failure | `HOST_FAILURE`; no pid, no identity fabricated |
| child exists, session not created | no report; `NOT_OBSERVED` |
| session created, IPC not delivered | host reports `IPC_SEND_FAILED`/attempt; Parent stays `NOT_OBSERVED` |
| IPC received before exit | observation recorded normally |
| IPC received, then host failure | the identity is a real observation; the failure is a separate host fact |
| timeout / abort | the identity observed before the timeout is real; the outcome is `HOST_FAILURE`, never a fabricated Work success |
| repeated reports | idempotent |
| conflicting reports | `CONFLICT`; neither chosen |
| restart | host jobs and observations are not durable — nothing here survives a restart, and nothing claims to |

A missing identity observation is **never** equated with proof that no Session was created.

---

## 8. Architecture and complexity

| | |
|---|---|
| New modules | `host/dsh/lib/session-identity.js`; `scripts/trajectory_p2a/{dsh-identity-source-map,dsh-non-model-creation-feasibility,level-c-first-party-gate,refusal-probe-plugin}.mjs` |
| Modified modules | `host/dsh/lib/runner.js` (report + telemetry), `src/interaction/work_delegation.ts` (observation contract, tracker, correlated sink), `src/deployment/work_worker.ts` (strict parser, identity branch, port input) |
| Public API | **unchanged** — 0 missing, 0 changed kind, 0 added |
| Architecture | **PASS** — 0 violations, 9 accepted baseline exceptions |
| New persistent store | **none** |
| New canonical owner / runtime / scheduler | **none** |
| New durable binding | **none** |
| Work authority changed | **none** — settlement, verification and promotion untouched |

---

## 9. Non-regression invariants

Preserved and asserted: Work Delegation with no observation sink; the result-tool contract; the
context-pull allowlist; the worker payload bytes; Work settlement authority; verification and
promotion authority; timeout and abort semantics; Host failure semantics; DSH Agent setup and
capability gates; worker tool restrictions; the read boundary; PRIMARY defaults; H1 Session Claim
non-reading; H1 binding resolver semantics; H1 page integrity; T0 projection; public API and
architecture constraints.

One incidental discovery: the G1 contract test `GAP-2` measures the *absence* of an observation seam
by searching the delegation source for the substring `onObservation`. A first draft named a new type
`WorkerSessionObservationState`, whose name contains that substring and therefore made a
still-present G1 gap read as closed. The honest fix was to rename the new symbol
(`WorkerSessionIdentityState`), not to weaken the G1 control — and GAP-2 is confirmed still present.

---

## 10. P2-B readiness

**What real observation now exists.** A Parent-owned invocation can carry the *actual* DSH SessionId
of the worker session that invocation created, with an explicit observation state and an independent
source qualification.

**Which owner may durably record it.** Not this stage. A durable Attempt → Invocation → Session
association belongs to a designated persistence owner; P2-A produces the observation, not the record.

**Required identity-conflict rules for P2-B.** Two different valid identities for one invocation must
remain an explicit conflict; order must not decide authority; a `NOT_OBSERVED` must not be read as
"no session existed"; and a durable record must preserve the conflicting pair rather than the first
value.

**Crash and recovery windows.** The observation is per-invocation and non-durable. A crash before any
record loses it entirely; a crash after a record must be distinguishable from a record that was never
written; and a session that exists on disk after a process exit is not, by itself, cold recovery.

**Evidence required to reach `BOUND_VERIFIED`.** A durable association verified against an actual
owner — not a boolean, and not a caller claim. P2-A deliberately leaves
`resolveVerifiedSessionBinding` untouched and does **not** populate
`composeTrajectoryV0().sessionAssociations`.

**What H1's resolver currently does and does not prove.** `resolveVerifiedSessionBinding` takes its
verified id from producer evidence and cannot be satisfied by a caller claim — but it operates over
*logical evidence inputs*, and a plain association object's `VERIFIED` and `durableBindingRef` fields
do not prove their own authority. The real production path must verify evidence against an owner.

**Recommended next minimal P2-B experiment.** Persist ONE observed association through a designated
owner and re-read it after a restart, asserting: the record's AttemptId equals the canonical one; a
conflicting second identity is preserved as a conflict rather than overwritten; and an association
that was never written is distinguishable from one that was lost. Do **not** wire it into the ordinary
Attempt Preview.

---

## 11. Final verdict

`TRAJECTORY_P2A_SESSION_IDENTITY_OBSERVATION_QUALIFIED`

| property | status |
|---|---|
| a real DSH Session was created | **yes** — measured (a session artifact the Host wrote) |
| the actual Parent received its identity | **yes** — Level C, on the real IPC channel |
| canonical Attempt correlation was demonstrated | **no** — the seam is wired and tested with a controlled port, but no real Attempt was run |
| a model request occurred | **no** — zero turns, zero provider requests |
| a durable binding exists | **no** |
| cold recovery was proven | **no** |
| any Session events were admitted to the ordinary Attempt Preview | **no** |
| automatic Handoff was implemented | **no** |

The runtime is Node `v24.14.1`, below the repository's declared minimum of `>=24.15.0`. Source and
controlled tests proceeded; the first-party runtime verdict is awarded with that limitation
disclosed, and no global system configuration was changed to work around it.

**P2-A establishes observation, not authority.**
