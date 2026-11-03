# Trajectory-V0 — Dual-View Execution & Project Trajectory Vertical Slice

**Stage:** `Trajectory-V0`
**Baseline:** `ba334cede59b92a880467d03e67af849acbe90ed` (branch `trajectory-t0-owner-referenced-projection`)
**Branch:** `trajectory-v0-dual-view-slice`
**Completion state:** `TRAJECTORY_V0_PREVIEW_QUALIFIED_SESSION_UNBOUND`

---

## 1. The law

> **One Trajectory domain, two distinct projections, existing authoritative sources.**

Trajectory does not own Work truth. It does not own the DSH Session event log. It is not a
replacement Agent Loop, a scheduler, a Proof owner, a Result owner or a Context owner. V0 adds no
store, no loop and no automatic execution path.

The two projections:

| Projection | Source | Owner of the truth |
| --- | --- | --- |
| **Project Evolution** | T0's read-only projection over Work/Reasoning/Proof/Journal | the owners T0 references |
| **Execution** | DSH's own Session event log | DSH |

## 2. The first critical gate: is a DSH read actually reachable?

The ruling warned against assuming that a service available inside the DSH host context is callable
from the external Palimpsest parent process. So the first commit is a **measured** audit, not a
design.

**Verdict: `PERSISTED_READ_SUPPORTED`.**

The decisive finding is that `readColdSessionLog` — exported by `@deepseek-ai/dsh-session-query`
(0.2.0-rc.2) — is a **standalone function taking a `SessionPersistence`**. It does not need the full
DSH host. So:

```js
const ctx = new Context();                                   // bare Cordis context
await ctx.plugin(JsonlSessionPersistence, { root, compression: 'zstd' });
const log = await readColdSessionLog(ctx.sessionPersistence, SessionId(id));
```

Measured: a real 75-event v4 session read from the external process, with the artifact's mtime, size
and sha256 unchanged, no `ctx.sessions` store mounted, and no model call.

**The missing edge.** No component writes a durable Work AttemptId → DSH SessionId binding. A scan of
all 1142 persisted session headers found 462 with a `palimpsest` cwd and **zero** whose cwd is a
`.palimpsest/worlds/<attemptId>` execution world. So `BOUND_VERIFIED` is unreachable for a real
product attempt, and V0 never assigns it.

## 3. Identity separation

Four identities, four producers, four fields — never collapsed, and their cardinality is never
assumed:

| Identity | Producer | Durability |
| --- | --- | --- |
| Work AttemptId `attempt-<32hex>` | the Work owner | canonical and durable |
| HostJobId `wdj-<uuid>` | the delegation service | **ephemeral** — lost on restart |
| Port InvocationId `wpi-<uuid>` | the worker port | one port invocation |
| DSH SessionId `session-…` | DSH | durable in the session log |
| Trajectory View ID `tv-<32hex>` | Trajectory, from `(projectId, attemptId)` | derived address, **not** an authority |

The View ID is deliberately **not** T0's `rootId`: T0's identity includes an `asOfSequence`, which
makes it a projection-*snapshot* identity. Reusing it as a permanent project address would silently
change meaning when the cut moved.

### Binding states

```
BOUND_VERIFIED   a real producer established it   ← unreachable in V0 (no producer)
BOUND_LOCAL_ONLY a local observation or a caller declaration, header agreeing
SESSION_UNBOUND  no session, no source            ← the honest default
AMBIGUOUS        more than one candidate          ← never resolved by picking one
CONFLICT         a supplied identity contradicts the source
SOURCE_UNAVAILABLE  claimed but unreadable
```

`BOUND_VERIFIED` must not be assigned merely because a caller supplied `dshSessionId`. It isn't: a
caller's claim plus an agreeing header yields `BOUND_LOCAL_ONLY`, and a header that names a different
session yields `CONFLICT`. A cwd match would support a *scope* check but never establishes exclusive
Attempt ownership, so it too caps at `BOUND_LOCAL_ONLY`.

## 4. The DSH event reader

`scripts/trajectory_v0/dsh-session-reader.mjs` implements the `DshSessionReadPort` contract against
DSH's own first-party reader. It lives in `scripts/` rather than `src/` because Palimpsest's
`node_modules` contains no `@deepseek-ai/*` package — a `src/` module importing an absolute profile
path would make the product source depend on one machine's deployment layout.

It recognizes DSH's own vocabulary (`turn/start`, `turn/end`, `step/start`, `step/end`,
`assistant/message`, `assistant/attempt`, `tool/call`, `tool/result`) and treats everything else as
opaque-but-referenced. It never:

- infers a finished Turn from one `assistant/message`;
- infers success from a `tool/call` with no result;
- flattens a failed `assistant/attempt` into output;
- reads compaction as deletion of the raw log;
- merges DSH seq, Work `project_sequence` and host-observation sequence into one global sequence.

**Sensitive content.** The default view carries `kind`, local `seq`, source reference, observed
status, a bounded sanitized summary, and duration only when real timing exists. A `tool/call` exposes
the tool *name* and never its arguments; an `assistant/message` exposes position and no content.

**Read failures** map onto honest states — `SESSION_MISSING`, `CORRUPT_SESSION`, `FORMAT_UNSUPPORTED`,
`BACKEND_UNAVAILABLE`, `IDENTITY_CONFLICT`, `EVENT_GAP`, `TRUNCATED_OBSERVATION`,
`READ_CAPABILITY_ABSENT` — classified from `SessionQueryError.code` and the persistence error
classes. An unsupported format is never an empty event stream.

## 5. Reusing T0, without concealing its limits

`src/trajectory/projection.ts` (1682 lines) is **not modified**. V0 calls it and selects a safe
subset. Two §5 rules are enforced in the adapter, because only the composition layer knows the
difference:

1. **Exact identity, not labels.** The Attempt is selected by the canonical Work event's
   `entity_id` plus its event type and project id — never `node.label.includes(attemptId)`.
2. **Conservative quarantine.** `RECEIPT_REFERENCED_GROUND`, `GOVERNED_INTENT_CHANGED_PROJECT` and
   `REVISION_SUCCEEDED_REVISION` depend on verifiers the T0 review found incomplete, so they appear
   only in `quarantinedRelations` as `UNVERIFIED_RELATION` and never among the selected, actionable
   relations.

Every Preview states, unconditionally:

> `WORK_HISTORICAL_CUT_WITH_CURRENT_CROSS_OWNER_READS: the Work sequence/digest is a historical cut,
> while cross-owner (Reasoning/Proof/Journal) reads are present-day. They are not one atomic snapshot.`

V0 omits a questionable Reasoning/Proof edge rather than adding another reconstruction framework.

## 6. The Handoff Preview

One bounded, serializable read model. It answers the ruling's ten questions and does nothing else.

**Six separate statuses — there is no `COMPLETED` boolean:**

| dimension | question |
| --- | --- |
| `execution.processLifecycle` | what did the host observe? |
| `execution.sessionLifecycle` | what is the DSH session's state? |
| `canonical.attemptState` | what does the Work owner say? |
| `canonical.verificationState` | was it verified? |
| `canonical.promotionState` | was it promoted? |
| `completeness` | how much of this Preview is populated? |

A direct child exiting zero does not prove settlement. A DSH `turn/end` does not prove promotion. An
Attempt completing does not prove every DSH event was recovered. Each is stated as a caveat.

**No automatic continuation.** The Preview cannot resume a session, schedule a worker, settle an
attempt, approve a promotion, select capital or inject context — the module holds no owner and every
input is a value. `doesNotAuthorize` states this on the object.

## 7. What was measured

**Real async Work (`PASS_REAL_OWNER_NONMODEL`).** Through `installPalimpsest` → `ProjectController` →
`makeWorkDelegationService` → `dshSubprocessWorkWorkerPort` with a local non-model Node stub:
`start()` returns `STARTED` before completion; a separate caller then addresses the attempt by its
canonical id with no host handle and no active Turn; the host observation matches the correct
`wpi-` invocation; `EXITED` coexists with `NOT_PROMOTED`; no SessionId is fabricated
(`SESSION_UNBOUND`); after a restart the handle is `UNKNOWN` and the lifecycle is
`UNKNOWN_AFTER_RESTART` while canonical settlement is untouched.

**Two-attempt isolation (`PASS_REAL_OWNER_NONMODEL`).** Two independent projects, both started before
either was awaited: distinct attempt ids, host jobs, port invocation ids, view ids and projection
roots; neither Preview contains the other's events; both complete independently.

**Real DSH read (`PASS_REAL_DSH_QUERY_NO_MODEL`).** A real session with all seven ruled event kinds;
a bounded page of 5 while `knownEventCount` stayed 37; a real cursor window; `SESSION_MISSING` for an
absent id; the artifact byte-identical after two reads.

**Fixture-only cases (`PASS_DSH_QUERY_PORT_FIXTURE`).** A corrupt frame, an unsupported format, an
identity conflict, a fork-inherited cut, a tool call with no result, a failed assistant attempt, an
unfinished step, an unknown-but-valid kind, and cursors before/after the observed range. Labelled as
fixtures, never as DSH compatibility.

## 8. Read-only safety

Two Preview builds left the work event count, chain digest, ProjectIR revision/digest, proof basis
and reasoning bases unchanged; the owner's `verifyFull()` still passes; the DSH artifact is
byte-identical. A structural field scan finds no permission, grant, token, budget, spend, capability
or entitlement field anywhere in the model — it is inspection data, not an authorization object.

## 9. The one named gap

**There is no durable Attempt→DSH Session binding producer.** The execution half is therefore
caller-addressed rather than authoritative for a real product attempt, and the honest completion
state is `TRAJECTORY_V0_PREVIEW_QUALIFIED_SESSION_UNBOUND`.

The smallest necessary future integration: the host/deployment boundary — which already knows the
child it spawned and the attempt it was prepared for — records the SessionId into an Attempt-keyed
record. That is host-local lifecycle metadata, not a canonical Work fact and not a new owner. Its
failure semantics are that a missing binding degrades to `SESSION_UNBOUND`, never to a guess. **V0
does not create that store**, per §11.

## 10. What V0 does not claim

No real PRIMARY execution (`NOT_RUN`), no independent host-origin authentication
(`NOT_ESTABLISHED`), no external authority (`NOT_ESTABLISHED`), no host spend enforcement
(`NOT_ESTABLISHED`), no causal result (`NOT_EVALUABLE`). A local Work stub is not a genuine DSH model
session, and nothing here pretends otherwise.
