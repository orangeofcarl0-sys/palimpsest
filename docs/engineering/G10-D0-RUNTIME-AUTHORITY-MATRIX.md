# G10-D0 — Runtime Authority Inventory & Matrix

Inventory performed on canonical `main` `297ffee5ddad67b9d9f64282bac113f2e982ce6c`
by reading source, not docs. D0 produces no runtime code; the matrix below is
the evidence base for D1–D4.

## 1. What the host can actually do today (§15)

| Capability | Classification | Evidence |
| --- | --- | --- |
| create runtime carrier | **CALLBACK/INJECTED PORT ONLY** | No createAgent/createSession contract exists; `DshToolRunContext.agent?: unknown` is explicitly unconsumable (`src/tools/dsh_types.ts` known-limitation note). The existing `palimpsest.worker.dispatch` action is a guarded placeholder |
| resume runtime carrier | **CALLBACK/INJECTED PORT ONLY** | same |
| create session | **NOT AVAILABLE** | no host contract |
| resume session | **NOT AVAILABLE** | no host contract |
| release carrier | **CALLBACK/INJECTED PORT ONLY** | same as create |
| observe ephemeral capabilities | **CALLBACK/INJECTED PORT ONLY** | no host contract; G10-C snapshots are caller-authored artifacts |
| observe persistent-locus availability | **CALLBACK/INJECTED PORT ONLY** | no PersistentPoint exists yet (D3 realizes the store; host observation stays a port) |
| observe persistent-locus capabilities | **CALLBACK/INJECTED PORT ONLY** | same |

Rule honored (§6): no reflection on `agent?: unknown`, no invented DSH ids, no
undocumented internals. Runtime realization is host-neutral through an
injected port; a concrete DSH carrier adapter is therefore DEFERRED (§52/§109
verdict), which does not block the campaign.

## 2. Effect authority — how Palimpsest mutates the world (§7)

`src/effects/runtime.ts` + `src/effects/actions.ts`: Palimpsest is an explicit
**Ordarium Action-calling host** (Ordarium docs/12 §9 topology). Every external
side effect executes as a Safe Action on the shared Ordarium ledger:

```text
createPalimpsestEffects(...) → PalimpsestEffectsRuntime
  .invoke(action, input, OrchestrationIntent{scope, callId, revision, lineage})
  — authorization derived from the plan revision (orchestrationAuthorization)
  — effect profiles: idempotent(durable) / reconcilable / readOnly / guarded
existing actions: palimpsest.worktree.create, palimpsest.git.commit,
  palimpsest.git.promote, palimpsest.gate.command, palimpsest.worker.dispatch
```

Therefore: `RealizeRuntimeCarrier ⇒ OrdariumEffectAdmission` is implementable
exactly like the existing five actions — a new Palimpsest-owned action whose
`execute` calls the injected host-neutral `RuntimeCarrierPort`, admitted
through `effects.invoke` with a stable idempotency basis. No production path
bypasses Ordarium. Observation-only reads may use a read-only port directly
(§7).

## 3. Authority matrix (§12)

| Fact | Identity owner | State owner | Effect authority | Observation source |
| --- | --- | --- | --- | --- |
| ArchitectureDefinition / AgentDefinition | Palimpsest Architecture (G10-C0 artifact) | Palimpsest (in-repo semantic artifact; unpersisted) | n/a (definition, not effect) | the artifact |
| ProjectIr / Work | Palimpsest orchestration ledger | EventStore (`src/state`) | orchestration writes via scheduler/commit | ledger projections |
| BindingDefinition / BindingResolution | Palimpsest Binding (PLMP-BIND-1) | derived semantic artifacts | none (pure derivation) | the artifacts |
| Compiled plan | Palimpsest derived plan artifact | derived (ref-only) | none | the artifact |
| Attempt | Palimpsest Work/runtime execution (WorkUnit execution; `TaskEnvelope`/`AttemptContext`/`AttemptReport`) | orchestration ledger | existing attempt executors (unchanged; §5) | ledger |
| **Activation** (new, D1) | **Palimpsest Runtime semantic artifact** | Palimpsest runtime (derived, in-process this campaign) | none (semantic) | the artifact |
| RuntimeAgent | **host/runtime provider** | host runtime | host (via port, admitted by Ordarium) | `RuntimeCarrierPort` result |
| Session | **host/runtime provider** | host runtime | host (via port) | port result; absent when unexposed |
| RuntimeAttachment (new) | **Palimpsest derived runtime mapping** | Palimpsest runtime (derived) | none | materialized after effect success |
| runtime side-effect operations (create/resume/release carrier) | n/a | n/a | **Ordarium** (action admission) | Ordarium ledger / receipts |
| EffectReceipt | **Ordarium** | Ordarium ledger | Ordarium | Ordarium API (no Palimpsest fake receipt — §46) |
| observation snapshot | Palimpsest observation artifact (G10-C2) | Palimpsest | none (read-only derivation) | ports (D4) / caller artifacts |
| PersistentPoint (new, D3) | **Palimpsest Continuity** (semantic truth) | **Palimpsest-owned continuity store** (see §4) | explicit administrative creation | the store |
| worktree | effect/runtime resource | git | Ordarium (`worktree.create`) | git port — **NOT a PersistentPoint by default** (§12) |

## 4. PersistentPoint storage ownership decision (§13/§14)

Options compared:

- **A. Palimpsest EventStore / orchestration database** — rejected for D3's
  minimal scope: it would add a table + migration to the orchestration ledger
  and entangle continuity identity with Work-event schema evolution.
- **B. dedicated Palimpsest continuity store** — **CHOSEN**: a separate,
  clearly Palimpsest-owned durable store (own SQLite database under
  `$DSH_HOME/palimpsest/`, `node:sqlite` like the existing ledgers), accessed
  through an injectable `PersistentPointStore` port. PersistentPoint is
  Palimpsest continuity semantic truth; the store is Palimpsest-owned, not
  Ordarium-owned.
- **C. Ordarium state store** — rejected: effect authority ≠ continuity
  semantic ownership. Storing continuity truth in Ordarium's management-state
  facade would blur exactly the boundary §13 warns about.
- **D. injected external continuity repository** — retained as the port
  abstraction: the canonical store is the default implementation of the same
  port, so embedders may substitute a repository without changing semantics.

Exactly ONE canonical PersistentPoint identity store exists (§14); caches or
projections must be explicitly derived. No in-memory object is called durable
(§119).

## 5. Attempt / Activation review (§5/§16)

Current attempt execution (`AttemptExecutor`, `ClaimReportExecutor`,
`CommandExecutor`, `MockExecutor` around `TaskEnvelope`/`AttemptContext`/
worktree/`AttemptReport`) is **Work/Attempt execution**, not runtime-agent
semantics. Kept intact and untouched:

```text
Attempt    = execution attempt of a WorkUnit      (existing; may proceed with no Activation)
Activation = runtime activation of an AgentDefinition (new; may exist with no Attempt)
```

The `Activation ↔ Attempt` relation stays OPEN through Invocation/Participation
(§4/§96/§124) — D1 prepared realizations carry no task/attempt identity.

## 6. Verdict (§17)

```text
D0 RUNTIME GROUNDING INVENTORY: COMPLETE
```

No frozen-contract contradiction and no unavailable external host contract
blocks the host-neutral target: the Ordarium action surface covers effect
admission, and the carrier/session reality is handled by an injected
host-neutral port with a concrete DSH adapter honestly deferred.
