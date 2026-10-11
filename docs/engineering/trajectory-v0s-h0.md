# Trajectory-V0S-H0 — Consumer Integrity & Causal Admission Hardening

**Stage:** `Trajectory-V0S-H0`
**Baseline:** `34dec4234a384e537fcd9b774470db4673e9f431` (`trajectory-v0s-attempt-source-boundary`)
**Branch:** `trajectory-v0s-h0-consumer-hardening`
**Completion state:** `TRAJECTORY_V0S_H0_CONSUMER_INTEGRITY_QUALIFIED`

## What this stage is

V0S corrected the consumer boundary, but its new relation selector introduced two defects in opposite
directions, and several remaining claims were still too strong. H0 fixes the consumer semantics before a
real Session identity producer (P2) is ever connected.

The acceptance property, in the ruling's words:

> An Attempt-scoped Trajectory consumer must admit exactly the execution observations and project
> relationships justified by canonical source evidence — neither less, by losing genuine cross-entity
> relations, nor more, by accepting unrelated or caller-declared evidence.

## The defects, measured before they were fixed

`test/trajectory_h0_falsifiers.test.ts` reproduces F1–F12 against the exact baseline. Five are
dynamically reproduced; seven are source-demonstrated.

| # | Defect | Class |
|---|---|---|
| F1 | a shared authorization event admitted the OTHER Attempt's `TASK_AUTHORIZED_ATTEMPT` | dynamic (controlled projection) |
| F2 | a genuine `RESULT_PROMOTED` was EXCLUDED (its carrier is a `PROMOTION_COMMITTED`) | dynamic (real canonical Work) |
| F3 | a genuine `ATTEMPT_REOPENED_FOR_REWORK` was EXCLUDED (its carrier is a `TASK_READY`) | dynamic (real canonical Work) |
| F4 | a caller-claimed Session triggered header and event reads | source |
| F5 | the successful page's `sourceIdentity` contained the local package root | source |
| F6 | caller Host identifiers became `LOCAL_PORT_OBSERVATION` | dynamic |
| F7 | a 50-of-200 attributed page still yielded `COMPLETE` | dynamic |
| F8 | exit chronology was invented from flag presence | source |
| F9 | an unknown attempt triggered an unscoped cross-project scan | source |
| F10 | `traceAttempt()` matched by display-label substring | source |
| F11 | the durability boundary came from a second, non-atomic read | source |
| F12 | a failed T0 projection was indistinguishable from an uncomposed owner | source |

## The corrections

### C2 — role-specific relation admission

The endpoint-membership rule is replaced by per-relation ROLE semantics validated against an explicit
`AttemptRelationContext` resolved from the attempt's own records:

- `TASK_AUTHORIZED_ATTEMPT`: the destination must be THIS attempt's creation event and the source THIS
  attempt's own authorization event — so a shared node cannot satisfy two attempts.
- `ATTEMPT_PRODUCED_RESULT`: source is the creation event, destination one of this attempt's terminals.
- `RESULT_PROMOTED`: source is this attempt's COMPLETED result and the promotion's own `attempt_id`
  names this attempt. The carrier is a `PROMOTION_COMMITTED` — a different entity type, which is
  REQUIRED, not rejected.
- `ATTEMPT_REOPENED_FOR_REWORK`: source is this attempt's terminal and the provenance `originRef` names
  this attempt. The carrier is a `TASK_READY` — again a different entity type.

Quarantine reporting is scoped to the requested Attempt. Twelve tests cover one real-owner positive
across all four kinds, ten negatives, and quarantine scoping.

### C3 — an unverified Session claim is non-reading

The ordinary Attempt Preview performs **zero** reads for a claimed Session: no header, no events, no
enumeration. The claim is a `CALLER_DECLARATION`; `dshSessionId` stays null; the binding stays
`SESSION_CLAIMED_UNVERIFIED`; the admission is `NOT_REQUESTED`.

- `READ_FAILED` is reserved for an attempted-and-failed read; an un-attempted read is not a failure.
- `SOURCE_UNAVAILABLE` now requires `readAttempted === true`.
- `sourceReadability` follows what actually happened (`NOT_REQUESTED` when nothing was read).
- The unscoped `listEvents()` probe is removed; an out-of-scope attempt is refused within project scope.
- The operator diagnostic reader is preserved and still works when used directly.

### C4 — source privacy and host provenance

- The consumer-visible `sourceIdentity` is the logical label `dsh-session-persistence-jsonl`; the
  resolved path is retained only as an internal `diagnosticSourcePath`. Verified on the SUCCESSFUL path
  against a real first-party session, plus Windows and POSIX error shapes.
- A caller-supplied HostRecord is a `CALLER_DECLARATION` regardless of its identifiers;
  `LOCAL_PORT_OBSERVATION` requires a producer-established origin.
- Process coverage is not implied by provenance: a declaration is at most `PARTIAL`.
- Exit chronology is reported as NOT established rather than inventing "LATER observed".

### C5 — completeness and coverage integrity

- A new `eventPageCoverage` dimension (`FULL` / `PARTIAL` / `UNKNOWN` / `NOT_APPLICABLE`) is derived from
  the page's own bounds. `COMPLETE` now requires `FULL`, so a 50-of-200 attributed page yields `PARTIAL`
  and says so; a 50-of-50 page still yields `COMPLETE`.
- A source reporting no total yields `UNKNOWN`, never an assumed `FULL`.
- Synthetic recovery closers are stated not to be evidence of successful execution.
- `staleBasis` reads the STRUCTURED basis completeness instead of scanning caveat text for "stale".
- A `TrajectoryRefusal` names a CANONICAL WORK SOURCE integrity failure, distinct from an uncomposed
  optional owner.

### §10 audits

- **`traceAttempt()`** (T0 label matcher): DEFERRED. `projection.ts` is verified unmodified; the exact
  correction is digest-neutral and is recorded for a separate T0 slice.
- **Cold-read consistency**: DSH documents that concurrent reads carry no ordering promise. The reader
  now fails closed — a prefix read reporting more stored events than the cold read returned means the two
  observed different snapshots, and the boundary is `DURABILITY_UNRESOLVED`.
- **Work integrity**: the owner already enforces Attempt uniqueness via `PRIMARY KEY (project_id,
  attempt_id)` and refuses duplicates in its projector. A cheap defensive duplicate-count check was added
  to admission; no second authority.

## What did NOT change

No new store, scheduler, runtime or canonical owner. No Session identity producer, no worker output
protocol change, no durable binding. No automatic Handoff. No PRIMARY, no paid calls, no model execution.
Historical evidence is byte-identical. `src/trajectory/projection.ts` is unmodified.
