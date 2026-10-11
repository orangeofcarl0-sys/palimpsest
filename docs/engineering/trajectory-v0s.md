# Trajectory-V0S — Attempt-Scoped Evidence Admission & DSH Session Binding Feasibility

**Stage:** `Trajectory-V0S`
**Baseline:** `526f377eac0343004c17a484a6f9057989f433df` (`trajectory-v0-dual-view-slice`)
**Branch:** `trajectory-v0s-attempt-source-boundary`
**Completion state:** `TRAJECTORY_V0S_CONSUMER_BOUNDARY_QUALIFIED`

## What this stage is

Trajectory-V0 proved three real capabilities — inspecting a Palimpsest Work Attempt independently of the
main Agent Turn, reading real DSH Session logs from an external process without a host or a model call, and
presenting both views in one read-only Handoff Preview. It also proved something it did not intend to: a
**real Work Attempt and an unrelated but readable DSH Session could be combined into one Preview without a
verified execution relationship.**

V0S is not a feature stage. It enforces one rule:

> An execution fact may enter an Attempt-scoped Handoff Preview only when the requested Attempt, the
> evidence source and their association have earned the required level of verification.

## The defects, measured before they were fixed

`scripts/trajectory_v0s/baseline-falsifiers.mjs` runs the ACTUAL V0 code from an isolated worktree pinned at
the baseline and measures what it did. Three defects were **dynamically reproduced** and three were
**source-demonstrated**:

| # | Defect | Class |
|---|---|---|
| F1 | an unrelated readable session entered an Attempt Preview as its own session (`dshSessionId` = the foreign id, 4 events presented, `completeness` = `COMPLETE`) | `DYNAMICALLY_REPRODUCED` |
| F2 | a wrong-attempt HostRecord was accepted and its `wdj-`/`wpi-` ids appeared in another attempt's Preview | `DYNAMICALLY_REPRODUCED` |
| F3 | a session read occurred for an attempt absent from canonical Work history | `DYNAMICALLY_REPRODUCED` |
| F4 | the Work node selector was `node.label.includes(attemptId)` | `SOURCE_DEMONSTRATED` |
| F5 | every returned DSH event was labelled as if persisted, with no synthetic-recovery distinction | `SOURCE_DEMONSTRATED` |
| F6 | the reader coerced an unusable cursor and enforced no hard page maximum | `SOURCE_DEMONSTRATED` |

## The corrections

### S1-A — the Attempt is admitted before any source is read

The admission gate runs in a fixed order and throws before the reader is touched: read the project's
canonical Work events, require exactly one `ATTEMPT_CREATED` with `entity_id === attemptId`, require its
`project_id === projectId`, require the canonical Work record to exist and not contradict that event. Only
then is a claimed session or host record examined.

A counting reader proves the ordering: an unknown attempt invokes **zero** read-port methods. Refusals are
typed and machine-readable — `ATTEMPT_NOT_FOUND`, `FOREIGN_ATTEMPT`, `ATTEMPT_SOURCE_CONFLICT`,
`HOST_RECORD_CONFLICT`.

Measured product note: a Palimpsest controller is scoped to one project and reads only that project's
events, so a foreign attempt is *invisible* through this route rather than distinguishable — the
`FOREIGN_ATTEMPT` branch is a defensive distinction for a multi-project store.

### S1-B — three facts that V0 had collapsed into one

V0 used a single state (`BOUND_LOCAL_ONLY`) for two different situations. The corrected model keeps three
independent dimensions:

| Dimension | Values | Authority |
|---|---|---|
| host observation provenance | `LOCAL_PORT_OBSERVATION`, `CALLER_DECLARATION`, `UNVERIFIED_ORIGIN`, `SOURCE_UNAVAILABLE`, `CONFLICTING_SOURCE`, `NOT_OBSERVED` | a real local observation of the host's own direct child; establishes **no** session |
| session binding | `BOUND_VERIFIED`, `SESSION_CLAIMED_UNVERIFIED`, `SESSION_UNBOUND`, `AMBIGUOUS`, `CONFLICT`, `SOURCE_UNAVAILABLE` | `BOUND_VERIFIED` requires a real producer; none exists in this deployment |
| session read admission | `NOT_REQUESTED`, `ADMITTED_TO_ATTEMPT`, `READ_FAILED`, `NOT_ADMITTED_TO_ATTEMPT` | `ADMITTED_TO_ATTEMPT` requires `BOUND_VERIFIED` |

The separation is structural rather than conventional: `classifySessionBinding` has no host-observation
input at all, so a host observation cannot move a binding. A caller's `SessionId` earns
`SESSION_CLAIMED_UNVERIFIED`, its events are never admitted, and the attempt's execution view stays empty.

### S1-C — the arbitrary session read surface is closed

`TrajectoryV0Service.readSessionPage({ sessionId })` is removed. The composed Attempt-scoped service surface
is exactly `{ previewAttempt, hasDshReader }`. The first-party reader remains available to a trusted
operator/research adapter, which is where a diagnostic read belongs.

This is not a claim of multi-user authorization — a TypeScript interface is not a security boundary. It
removes the unrestricted operation from the Attempt-oriented service.

### S1-D — exact relation selection

The Work relation selector no longer matches a display label. It builds the attempt's canonical Work
`event_id` identity set and requires: an allowed relation kind, an endpoint in that set,
`ESTABLISHED_BY_OWNER_REFERENCE`, a non-null `TrajectoryEdgeEvidence`, an evidence source that is one of
those canonical events, and an agreeing project id. Anything else is quarantined or unresolved.

T0's 1,682-line projection was **not** modified; only the V0 consumer's local policy changed.

### S1-E — completeness and interruption semantics

`COMPLETE` now requires an **attributed** session read (`SESSION_READ`), not merely a readable one. Four
attribution dimensions are reported side by side. `TIMEOUT_REQUESTED`, `ABORT_REQUESTED` and
`EXIT_UNCONFIRMED` are distinct from `EXITED`, and an exit observed *after* a termination request preserves
both facts in the chronology.

### S1-F — DSH cold-read fidelity

`readColdSessionLog` appends `interruptedTurnClosers`, so its returned array mixes stored events with
closers DSH synthesized in memory. The reader now reads the stored prefix through the persistence handle's
own `read` seam and labels each event `PERSISTED_DSH_EVENT` or `SYNTHETIC_RECOVERY_EVENT`, reporting
`DURABILITY_UNRESOLVED` when the seam cannot prove the boundary. This was verified against a **real**
first-party session created with an open tail: 2 stored events, >0 synthetic closers, stored bytes
unchanged.

The reader also refuses negative, fractional and excessive cursors (`INVALID_REQUEST`), enforces a hard page
maximum of 200, reports `RETURN_PAGE_BOUNDED` separately from `DISK_IO_PAGE_BOUNDED`, sanitizes failure
messages so no absolute personal path reaches a consumer, and disposes its Cordis fiber on `close()`.

## S2 — the DSH session identity producer

Read-only source audit of the installed DSH `0.2.0-rc.2` packages and the installed `palimpsest-dsh-host`
bundle. The identity chain is:

```
Canonical Work AttemptId     has a producer
Host-local JobId             has a producer (ephemeral)
Port InvocationId            has a producer
Direct Child Process         has a producer
Actual DSH SessionId         MISSING — no producer reports it to the parent
```

Findings:

- `runWorker` mints `worker-<uuid>` via `agents.create` and **never reports it** on stdout, stderr or the
  IPC channel. The eight `PALIMPSEST_WORKER_*` telemetry lines carry no session identity.
- The **principal** path has both a `--session-file` flag and a `PALIMPSEST_HOST_READY` line carrying the
  session id — neither belongs to the worker route.
- DSH Headless *does* emit a machine-readable opening `session` event under `--json`. That proves DSH can
  expose a created session's identity to a parent process; it does **not** prove the Palimpsest worker route
  does, or that it uses that implementation.
- The parent already owns a dedicated `stdio[3]` IPC channel that the model cannot reach (the worker can run
  bash, so stdout is model-writable testimony).

Outcome: **`PRODUCER_REQUIRES_RUNTIME_INTEGRATION`**. The smallest supported integration point is P2 — report
the session identity as one structured message on the existing IPC channel before the first model turn.
S2 forbids modifying the Worker Port, so it was not implemented.

## §11 — multi-Agent source map (read-only, no interoperability claim)

- **Agent Team**: durable member provisioning, Inbox acceptance, Task Board updates, member session identity
  and Palimpsest Work settlement are five separate surfaces. A Team Task completion is not a Work completion.
- **Workflow**: `WorkflowRunId`, `workflow/agent-start`, `childId`, `workflow/agent-end`. A Workflow child
  finishing does not imply canonical Work Promotion.
- **Worktree**: a DSH-created worktree is not automatically an approved Palimpsest Attempt World.

## What did NOT change

No new store, no new scheduler, no second Harness, no canonical owner, no automatic Handoff, no context
injection, no merge to main. T0, G1-B and V0 historical evidence are byte-identical. Zero model calls, zero
PRIMARY enablement.
