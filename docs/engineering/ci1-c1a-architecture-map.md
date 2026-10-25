# Palimpsest-CI1 — Source-Level Architecture Map (C1-A)

Every claim below was read from source, with a `file:line` reference. Where something does **not** exist, the
grep that establishes the absence is given, because an absent integration is a finding and must not be inferred
from a report label.

---

## 1. The chain, and what actually implements each link

```
Owner → Task → Run/Attempt → Worker → Result → Consumer → Candidate/Evidence → Trajectory → Project decision
```

| Link | Implemented? | Module | Identity | Durable across restart? | Tests |
|---|---|---|---|---|---|
| **Owner** | yes, but **runtime-only** | `src/runtime/identity.ts:80-86` (`Activation`), `src/coordination/participation.ts:105` (`activationRefOf`) | `activationId` | **No** — the `Activation` itself; the `ActivationRef` is durable | `test/runtime_identity.test.ts` (11) |
| Owner → Attempt | **yes, as a seam only** | `src/coordination/participate.ts:68-84` (`ParticipationService`) | `(projectId, attemptId)` + `activationRef` | Yes, as a `coordination_events` row | `test/participation.test.ts` (11) |
| **Task** | yes | `src/domain/`, `src/schema/` (`parseTaskSpec`) | `taskId` | Yes | — |
| **Run** | **No such execution entity** | `src/run/definition.ts:19-21` | digest-only, `RunDefinitionRef` | n/a | — |
| **Attempt** | yes | `src/work/attempt_execution.ts`, `src/state/projector.ts:380-445` | `(projectId, attemptId)` | Yes (`attempts` table) | `test/lean_work_delegation_transport.test.ts` (10) |
| **Worker** | yes | `src/deployment/work_worker.ts:816` (`dshSubprocessWorkWorkerPort`) | `invocationId` = `wpi-<uuid>` (port-local) | No | same |
| Worker → Result | yes | `src/work/attempt_execution.ts:330-442` (`settle`) | `AttemptReport` | Yes (`report_json`) | — |
| **Consumer** | yes | `src/interaction/work_delegation.ts:668` → `src/tools/controller.ts:2214` (`report`) → `src/scheduler/scheduler.ts:624` | event id | Yes | — |
| **Candidate** | yes | `src/result/candidate_store.ts:25-31`, `src/result/derivation.ts:90-109` | `candidateId` = `candidate-<digest32>` | Yes (`derived_result_candidate`) | `test/lean_d3d_composition.test.ts` (20) |
| **Evidence** | yes | `src/evidence/*`, `src/schema/models.ts:863-882` (`EvidenceAtom`) | `(subject_type, subject_id)` + `subject_digest` | Yes | `test/gate_dsl.test.ts` (16) |
| **Trajectory** | yes, read-only | `src/trajectory/projection.ts:414` (`buildProjectTrajectory`) | `semanticDigest` | n/a (derived) | `test/trajectory_t0_contract.test.ts` (23) |
| **Project decision** | yes | `src/trajectory/relation_admission.ts:236` (`selectAttemptWorkRelations`) | attempt-scoped | n/a | `test/trajectory_h0_relations.test.ts` (12) |

---

## 2. Owner identity — the actual mechanism, and its real boundary

### 2.1 What an Owner is

```ts
// src/runtime/identity.ts:80-86
export interface Activation {
  readonly schemaVersion: 1;
  readonly activationId: ActivationId;
  readonly agentDefinitionId: AgentDefinitionId;
  readonly runDefinition: RunDefinitionRef;
  readonly bindingResolution: BindingResolutionRef;
}
```

The header is explicit that this is **not** an attempt owner (`identity.ts:8-11`): *"no task/attempt identity here —
the Activation ↔ Attempt relation stays OPEN through Invocation/Participation"*.

### 2.2 The one production creator

`grep -rn "materializeActivation(" src/` returns exactly two hits: the definition, and `src/runtime/realize.ts:240`.
That call site is inside `makeRuntimeRealizationService(...).realize()` (`realize.ts:142-277`), and it runs **only
after** a successful carrier effect (`realize.ts:236-245`).

**`grep -rn "createActivation" src/` → 0 hits.** There is no other way to make one.

### 2.3 The blocking precondition

`realize()` requires a `RuntimeCarrierPort`:

```ts
// src/runtime/realize.ts:143
readonly port: import("./carrier_port.js").RuntimeCarrierPort;
```

**No production implementation of that port exists.**

| Grep | Result |
|---|---|
| `grep -rn "callbackRuntimeCarrierPort" src/ host/` | only the barrel export at `src/runtime/index.ts:8` |
| `grep -rn "onRealize\|carrierPort\|runtimeCarrierPort" host/` | **0 hits** |
| `grep -rn "realize(" src/adapters/ src/application/ src/tools/ src/serve.ts src/cli.ts` | **0 hits** |
| `callbackRuntimeCarrierPort` in `test/` | 4 files, all test doubles |

And `InstalledRuntime` exists only when the caller supplies one (`src/composition/collaboration.ts:140-172`,
contract at `src/composition/install_contract.ts:423-433`).

**Conclusion.** A genuine `Activation` can be created **only** by supplying a carrier port. In this repository that
is done by tests. The shipped product does not wire one, so **no production path creates an Owner at all.**

### 2.4 Durability

`grep -rn "activation" src/state/migrations.ts src/state/migration_files/0001_unified_baseline.sql` → **no match**.
There is no activation table or column. The design says so directly:

- `src/coordination/participation.ts:20-22` — *"ActivationRef carries enough immutable provenance to keep historical
  meaning **even though Activation is runtime semantic state**"*;
- `src/continuity/point.ts:12-16` — carrier/session attachment *"is runtime state (`RuntimeAttachment`), never point
  content"*.

So the durable owner-provenance artifact is `ActivationRef`, written into the coordination store. The live
`Activation` does not survive a restart, by design.

### 2.5 The seam that exists, and its one gap

```ts
// src/coordination/participate.ts:68-84
export interface ParticipationService {
  recordInvocation(input: { readonly activation: Activation; readonly attempt: AttemptRef }): Promise<Invocation>;
  beginParticipation(input: { readonly activation: Activation; readonly attempt: AttemptRef; readonly invocation?: InvocationRef }): Promise<Participation>;
  endParticipation(input: { readonly participationId: ParticipationId; readonly endReason: ParticipationEndReason }): Promise<CoordinationEvent<"PARTICIPATION_ENDED">>;
  participationsFor(attempt: AttemptRef): Promise<readonly CoordinationEvent[]>;
}
```

**The gap, stated precisely.** Every service method takes a **live `Activation` object**. The artifact-level
functions accept a ref:

```ts
// src/coordination/participation.ts:128, 146
materializeInvocation(input: { invocationId; activation: ActivationRef; attempt: AttemptRef }): Invocation
materializeParticipation(input: { participationId; activation: ActivationRef; attempt: AttemptRef; invocation? }): Participation
```

but `grep -rn "materializeParticipation\|materializeInvocation" src/` shows **no caller outside `participate.ts`**.

So a second process holding only an `ActivationRef` **cannot** record participation through the shipped service —
it would have to either reconstruct a full `Activation` (needing `runDefinition` and `bindingResolution` refs it may
not hold) or append raw events, bypassing the service.

**Production callers of `beginParticipation`:** `src/federation/federation_service.ts:300-306` and tests. **No
composition, HTTP, DSH or CLI surface calls it** (`grep` over `src/application/**`, `src/adapters/**`,
`src/tools/**` → 0 hits).

### 2.6 The missing seam, named

> **The product can record that an Activation participated in an Attempt. It has no production path that creates an
> Activation, and no path that binds a Worker execution to one.**

The minimum missing seam is therefore **not** a new registry. It is: a production carrier port (or an equivalent
host-side realizer) that turns a real Worker session into a real `Activation`, plus a ref-accepting participation
entry point so a process holding only durable provenance can record its participation.

Both are **adapter-shaped additions**, not new architectures. C1 does not implement either; it measures what exists
and reports the deficiency, as §4 of the ruling requires.

---

## 3. Run and Attempt identity

**There is no `Run` execution entity.**

- `src/run/definition.ts:19-21`: *"Identity: digest-only (RunDefinitionRef) — **no RunDefinitionId is invented**"*.
- `grep -rn "CREATE TABLE runs" src/` → **0**.
- `RunConfiguration` is digest-only too (`src/run/configuration.ts:31-34`).

**The canonical Work identity pair** is `(projectId, attemptId)`:

```ts
// src/coordination/participation.ts:60-64
export interface AttemptRef { readonly projectId: string; readonly attemptId: string; }
```

`attemptRefOf` (`participation.ts:115-125`) validates both with `isStableIdentifier`.

**The `attempts` table** (`src/state/migrations.ts:139-149`):

```sql
CREATE TABLE attempts (
    project_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    task_id TEXT,
    state TEXT NOT NULL,
    report_json BLOB,
    state_json BLOB NOT NULL,
    last_event_id INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, attempt_id)
);
```

**There is no activation or owner column.** That is the schema-level statement of the same gap.

---

## 4. The Worker port

```ts
// src/deployment/work_worker.ts:816
export function dshSubprocessWorkWorkerPort(input: DshSubprocessWorkWorkerPortInput): WorkWorkerExecutionPort
```

Inputs: `dshBin`, `profile`, `timeoutMs?`, `pullTimeoutMs?`, `nodeExecPath?` (`work_worker.ts:583-594`).

**`run()` input** (`work_worker.ts:293-334`):

```ts
export interface WorkWorkerExecutionInput {
  readonly workDir: string;
  readonly context: import("../context/service.js").WorkWorkerAttemptContext;
  readonly contextPull?: ((handle: string) => Promise<unknown>) | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly observe?: WorkObservationSink | undefined;
  readonly observeSessionIdentity?: WorkSessionIdentitySink | undefined;
  readonly sessionSourceQualification?: WorkerSessionSourceQualification | undefined;
}
```

**No `attemptId`, no `projectId`, no `activationId`.** This is deliberate (`work_worker.ts:283-285`, `305-308`):
*"The port deliberately does not receive an attempt id: it receives a closure that already knows it."* The caller
closes over the identity, which is why the model can never choose one.

**Outcome kinds** (`work_worker.ts:254-269`): `READY_FOR_SETTLEMENT | NEEDS_ESCALATION`, or
`{ kind: "HOST_FAILURE" }`. **Never `COMPLETED`** — a worker cannot settle its own attempt.

**Session identity** travels on a separate IPC channel (`work_worker.ts:103-104`), parsed strictly
(`116-127`), and the port's own contract says it is **noncanonical and cannot settle an attempt**
(`work_delegation.ts:456-467`).

**One production implementation only.** `grep` for other `WorkWorkerExecutionPort` implementations → none. The
adapter id is `dsh-subprocess-work-worker:<profile>` (`work_worker.ts:822`).

---

## 5. The normal consumer

Nothing in the worker writes canonical state. The chain:

1. `executeMutatingWorkBlocking` (`work_delegation.ts:668-711`) → `worker.run(...)` → then
   `deps.controller.settleMutatingWork({ attemptId, workerOutcome })` (`:706`).
2. `makeMutatingAttemptService(...).settle(...)` — **the normal consumer** — `src/work/attempt_execution.ts:330-442`:
   refuses non-`READY_FOR_SETTLEMENT` (`:341-348`), observes the world (`:352`), enforces uncommitted / no-work /
   write-scope (`:365-391`), re-checks the base (`:395-410`), exports the commit (`:417-429`), then
   `ports.report(attemptId)` (`:433`).
3. `ProjectController.report` (`src/tools/controller.ts:2214-2263`) builds an `AttemptReport` and calls
   `scheduler.recordCallback(attemptId, terminal, report)` (`:2262`).
4. `Scheduler.recordCallback` (`src/scheduler/scheduler.ts:624-692`) appends **`ATTEMPT_COMPLETED`**
   (`grep -rn "ATTEMPT_SUCCEEDED" src/ test/` → **0 hits**).
5. `CoreProjector.#applyAttemptTransition` writes `attempts.state` + `attempts.report_json`
   (`src/state/projector.ts:412-445`, UPDATE at `:431`).

**There is no separate delivery step for canonical Work state.** The product writes it. The only `onTerminal` on
this path is optional and unwired (`src/composition/continuation.ts:231`, comment only).

---

## 6. Candidate and Evidence

### 6.1 Candidate

```ts
// src/result/derivation.ts:90-109
export interface DerivedResultCandidate {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly derivation: ResultDerivation;
  readonly sourceResult: { backend: string; baseRevision: string; resultRevision: string } | null;
  readonly producedAssetRefs: readonly string[];
  readonly resultManifestDigest: string;
  readonly derivedAt: string;
}
```

`candidateId` is content-derived: `candidate-${resultManifestDigest.slice(0,32)}` (`derivation.ts:141`).

**The originating ATTEMPT is not named.** Provenance runs through `originResultManifestDigest`. This matters for
C1: a candidate cannot, by itself, say which Run produced it.

**Append-once** (`src/result/candidate_store.ts:25-31`) — a bare INSERT with the candidate id as primary key, and a
losing race re-reads rather than failing (`:75-96`). That is a storage-level guarantee that one derivation cannot
accumulate two candidate identities.

### 6.2 Evidence

The persisted atom is `EvidenceAtom` (`src/schema/models.ts:863-882`): `subject_type: "attempt"|"commit"|"task"`,
`subject_id`, `subject_digest`, `predicate`, `value`, `project_revision`, `input_fingerprint`,
`status: "active"|"stale"`.

Queries are exact `(subject_type, subject_id)` pairs (`src/evidence/gate_dsl.ts:58-64`), and invalidation matches the
**typed pair**, never a bare id (`src/evidence/invalidation.ts:229-236`). Version binding is
`EvidenceInvalidationPlan.basis = {revision, digest}` plus `targetRevision` (`invalidation.ts:174-177`).

`grep -rn "activation" src/evidence/` → **0 hits.** No evidence binds to an Owner.

---

## 7. Trajectory

**Entry point:** `buildProjectTrajectory(inputs, options)` (`src/trajectory/projection.ts:414`).

**Input** (`src/trajectory/ports.ts:262-269`):

```ts
export interface TrajectoryProjectionInputs {
  readonly projectId: string;
  readonly work: TrajectoryWorkPort;
  readonly reasoning?: TrajectoryReasoningPort | undefined;
  readonly proof?: TrajectoryProofPort | undefined;
  readonly workspace?: TrajectoryWorkspacePort | undefined;
  readonly hostObservation?: TrajectoryHostObservationPort | undefined;
}
```

`TrajectoryWorkPort` (`ports.ts:23-46`) = `listProjectEvents`, `readWorldBasis`, `assessCurrentness`,
`readPromotions`.

**It reads the Work event store, not the coordination store.** `grep -rn "coordination" src/trajectory/` → **0
hits.** The projection re-validates history through `validateWorkHistory` (`projection.ts:174`) which calls the owner
parser `parseSchedulerEvent`.

**Production adapter:** `composeTrajectoryInputs` (`src/composition/trajectory.ts:76`) — the one module allowed to
see both the concrete owners and Trajectory. It is read-only by construction: no `append`, `settle`, `publish`,
`admit`, `revise` or `promote` appears in it.

**Relation kinds** — 16, at `src/trajectory/refs.ts:81-102`:

```
SAME_OWNER_SEQUENCE_SUCCESSOR, EXPLICIT_PREDECESSOR,
TASK_AUTHORIZED_ATTEMPT, ATTEMPT_PRODUCED_RESULT, RESULT_VERIFIED, RESULT_PROMOTED,
ATTEMPT_REOPENED_FOR_REWORK,
BRANCH_SUBMITTED_CANDIDATE, CANDIDATE_EVALUATED, CLAIM_ADMITTED, CLAIM_INVALIDATED,
PROOF_SOURCE_SUPPORTED_EVIDENCE, RECEIPT_REFERENCED_GROUND,
REVISION_SUCCEEDED_REVISION, GOVERNED_INTENT_CHANGED_PROJECT, PROMOTION_APPLIED_TO_PROJECT
```

**Attempt-scoped admission** (`src/trajectory/relation_admission.ts`):
`SELECTED_T0_RELATIONS` = `TASK_AUTHORIZED_ATTEMPT`, `ATTEMPT_PRODUCED_RESULT`, `RESULT_PROMOTED`,
`ATTEMPT_REOPENED_FOR_REWORK` (`:48-53`); `QUARANTINED_T0_RELATIONS` = `RECEIPT_REFERENCED_GROUND`,
`GOVERNED_INTENT_CHANGED_PROJECT`, `REVISION_SUCCEEDED_REVISION` (`:38-45`); everything else has no Attempt-scoped
admission role (`:196`).

**There is no `SAME_BASIS` or cross-Owner relation kind.** This is the central C2 finding: the existing vocabulary
has **no edge type that can express "two attempts shared an immutable baseline"** or "B1 consumed A1". The
closest existing relations are within one owner's lineage (`SAME_OWNER_SEQUENCE_SUCCESSOR`,
`EXPLICIT_PREDECESSOR`) or between an attempt and its own result.

**Session binding** is a separate, strict path: `AttemptSessionAssociation` (`src/trajectory/binding.ts:74-91`) and
`resolveVerifiedSessionBinding` (`:191`), which refuses to bind a session claimed by a different attempt or a
different invocation (`:210-230`).

---

## 8. What CI1 therefore has to build, and what it must not

### Exists and is reusable

| Capability | Where |
|---|---|
| Real Work/Attempt/Event/SQLite stack, one call | `installPalimpsest` (`src/install.ts:46`) |
| Real Worker port | `dshSubprocessWorkWorkerPort` |
| Real settlement / consumer | `settleMutatingWork` → `report` → `recordCallback` |
| Append-once candidate store | `SqliteDerivedResultCandidateStore` |
| Evidence with typed subject + digest | `EvidenceAtom`, `GateEngine` |
| Real Trajectory projection | `buildProjectTrajectory` + `composeTrajectoryInputs` |
| Attempt-scoped relation selection | `selectAttemptWorkRelations` |
| Participation seam (needs a live Activation) | `ParticipationService` |
| Real Activation creation (needs a carrier port) | `makeRuntimeRealizationService().realize()` |

### Does not exist

| Missing | Consequence for CI1 |
|---|---|
| Any production carrier port | A real Activation is test-only. C1 must supply a **bounded, declared** carrier port and say so. |
| A ref-accepting participation entry point | A process holding only `ActivationRef` cannot record participation. |
| An Owner column or table | Ownership is provenance-only. |
| A cross-Owner or shared-basis relation kind | C2 cannot express "A1 and B1 share S0" or "B1 consumed A1" without either a producer-side extension or a declared limitation. |
| Attempt identity on a candidate | Candidate→Attempt must be carried by the caller's own record. |

### The design constraint this imposes

The ruling forbids inventing an owner registry, a workflow engine, an event platform, or a Trajectory database. It
**permits** a minimum missing integration seam. C1 will therefore:

1. supply a **declared, test-owned `RuntimeCarrierPort`** to create two genuine `Activation`s — reusing the shipped
   realization service, not reimplementing it;
2. record participation through the **shipped** `ParticipationService` with those real Activations;
3. drive the **real** Worker port for each Owner, through the **real** settlement path;
4. produce candidates through the **real** append-once store;
5. project through the **real** `buildProjectTrajectory`, and compare against an **independently constructed
   oracle**;
6. report the absent cross-Owner relation vocabulary as a **named limitation**, not paper over it by inventing a
   relation kind inside Trajectory core.

Whether each of those steps succeeds is an empirical question this stage answers by running them.
