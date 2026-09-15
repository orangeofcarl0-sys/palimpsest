# G10-AC — Long-horizon Campaign monitor runtime

Campaign specification (executed). Baseline:

```text
orangeofcarl0-sys/palimpsest
main @ eca28ecce8118b21d41debb9af66b472b5ca866a
```

## 1. Mission

Give the durable `MONITOR` Work Mode preference a real, opt-in execution binding:
a host-driven tick that re-evaluates the project's **scoped** dormant Campaign
watches, records canonical triggers through the existing prospective service,
enters the existing single-wake lifecycle, runs the existing deterministic
reconciliation, and emits an at-least-once host wake signal — and then stops
before semantic next-action compilation.

The premise is the AC0 assessment (`docs/engineering/audits/G10-AC-MONITOR-RUNTIME-ASSESSMENT.md`):
before AC, no production loop called `scanWatches`, nothing called `beginWake`
automatically, `attentionActivation` was only a port, no crash-recovery driver
existed for the Campaign wake lifecycle, and an installed project had no
project→campaign scope.

## 2. Firewalls

```text
MonitorTick            ≠ SemanticEvent      ≠ Authority
MonitorPreference      ≠ ActiveMonitoring   ≠ Watch        ≠ Campaign
WatchEvaluation        ≠ WatchTrigger
WATCH_TRIGGERED        ≠ ClaimTrue          ≠ CommitmentSatisfied ≠ ProjectNeeded
Wake                   ≠ Action             ≠ Authority    ≠ Work
                       ≠ Commitment         ≠ EvidenceAdmission
HostActivation         ≠ SemanticAdmission
Notification           ≠ Activation         ≠ WorkMutation
CampaignMonitorDriver  ≠ Scheduler          ≠ Planner      ≠ ManagerAgent
ManagementMode         ≠ WakeAuthority
MONITOR                ≠ ManagementEscalation
DeliveryMark           ≠ Campaign truth     ≠ Activation success ≠ Wake completion
```

## 3. Opt-in rules

* `MONITOR` must be present in the project's stored Work Mode preference
  modifiers before any **new** scan happens (`driver.ts:309`, `:219`).
* An absent, unreadable or malformed preference disables automatic scanning and
  says so (`driver.ts:212-240`) — it never default-enables.
* An in-flight wake is always continued even when `MONITOR` is disabled, so
  disabling the preference cannot strand a canonical wake (`driver.ts:477-482`,
  `:308-309`).
* Disabling `MONITOR` cancels no watch (`AC-N26`).
* A `MONITOR` preference alone creates no Campaign and no Watch (`AC-N01`,
  `AC-N02`).
* A `MONITOR` preference alone starts no timer (`AC-N12`).

## 4. Scope decision

Only explicitly narrowed scopes may be composed
(`src/monitor/scope.ts:5-34`): `empty` (default), `linked` (Campaigns whose own
record links the project), `allowlist` (operator-named ids), `composed` (union).
There is deliberately no "all campaigns" scope. The result is sorted,
deduplicated and never widened; an empty result is honest (`AC-N15`).

## 5. Tick decision

One pipeline for every trigger source (`src/monitor/tick_source.ts:11-16`).
Forced explicit interval — the factory throws without a positive integer
`intervalMs` (`:94-102`). Overlapping ticks share one evaluation
(`AC-N22`). The source never keeps the process alive (`unref`, `:129-131`).

## 6. Driver decision

The driver is a value, not an agent (`driver.ts:148-156`), composed only when an
operator supplies a scope (`src/install.ts:1537-1539`). It carries a Campaign
through trigger → wake → reconciliation → activation with a bounded intra-tick
loop (`driver.ts:484-504`) and stops at activation. It owns no store and reads
history through a narrow read seam (`driver.ts:51-54`).

## 7. Activation decision

A host-neutral port (`driver.ts:139`), defaulting to `nullCampaignWakeActivation`
(pull mode, `activation.ts:134-144`). The signal identity is semantic, never a
clock or an attempt (`activation.ts:47-62`). Delivery is at-least-once; a failure
leaves the canonical wake untouched (`AC-N19`).

## 8. Delivery decision

Deployment-local marks only, for duplicate suppression and backoff
(`delivery_marks.ts`). Non-authoritative, never suppresses forever. With no marks
configured, delivery repeats — an accepted waste (`CF-AC-03`).

## 9. Crash-recovery requirements

Recovery must be derived from canonical history alone, because after a crash the
watch may already be `TRIGGERED` and `scanWatches` cannot report it
(`lifecycle_derivation.ts:1-13`). The requirements:

```text
CR-1  trigger-before-wake       → a pending wake is derivable and started
CR-2  wake-before-reconciliation→ the SAME wake cycle is continued
CR-3  reconciliation-before-host→ the signal identity is replay-derivable
CR-4  host-activation-before-action → the wake stays in flight; redelivery is possible
CR-5  recovery is idempotent    → no second wake, no second trigger set
CR-6  no recovery table          → history plus the marks file only
```

## 10. Recipe-readiness and posture-availability requirements

```text
R-1  monitor.v1 readiness must be CONDITIONAL, never PRODUCTION_READY while
     deployment binding remains conditional, and never PREVIEW_ONLY now that a
     real runtime exists (registry.ts:67-87; AC-N28).
R-2  MONITOR availability must derive from REAL runtime wiring: a composed
     first-party driver (or a truthful external equivalence declaration), not a
     bare boolean (posture.ts:181-204; AC-N29).
R-3  An unavailable MONITOR must retain the preference and report a reason
     (no scheduler started).
R-4  EXPLORE + MONITOR must not widen recipe compatibility (AC-N27).
```

## 11. Adversarial items

`AC-N01`…`AC-N30`. The shipped behavioural suite
(`test/ac_monitor_runtime.test.ts`, 30 tests) names `AC-N01`…`AC-N12`,
`AC-N15`…`AC-N24`, `AC-N26`…`AC-N30` (`AC-N08`/`AC-N09`/`AC-N10` share one case).

| ID | Requirement |
| --- | --- |
| AC-N01 | A `MONITOR` preference alone creates no Watch. |
| AC-N02 | A `MONITOR` preference alone creates no Campaign. |
| AC-N03 | A tick grants no authority and creates only watch/wake/reconciliation events. |
| AC-N04 | The driver owns no canonical truth and creates no monitoring table. |
| AC-N05 | `previewTick` is read-only: no canonical write, no delivery mark. |
| AC-N06 | An incomplete watch never triggers and the detail names the missing source. |
| AC-N07 | A `WATCH_TRIGGERED` creates no Work. |
| AC-N08 | A tick compiles no next action and admits nothing. |
| AC-N09 | A tick accepts no commitment. |
| AC-N10 | A tick publishes no Proof and declares no boundary. |
| AC-N11 | MONITOR absent disables new automatic scans. |
| AC-N12 | A preference alone starts no hidden timer. |
| AC-N13 | A tick installs no watch and cancels no watch. *(No dedicated test id; enforced structurally — the driver has no `installWatch`/`cancelWatch` seam, `driver.ts:116`.)* |
| AC-N14 | Trigger recording is one atomic batch and is idempotent per watch. *(No dedicated test id; enforced by `recordTriggers` dedupe `prospective.ts:415-424` and crossed by `AC-N23`.)* |
| AC-N15 | Scope is linked/allowlist only — never a global scan. |
| AC-N16 | Trigger-before-wake recovery starts exactly one wake. |
| AC-N17 | Wake-before-reconciliation continues the SAME wake cycle. |
| AC-N18 | Reconciliation-before-activation yields a deterministic `signalId` across drivers. |
| AC-N19 | Activation failure preserves the wake and retries on a later tick. |
| AC-N20 | Activation success is not wake completion. |
| AC-N21 | Redelivery creates no second wake. |
| AC-N22 | Overlapping ticks create no duplicate semantic wake. |
| AC-N23 | Multiple triggered watches record all triggers but one wake from the smallest watchId. |
| AC-N24 | A `DIRECT` wake causes no automatic management mutation. |
| AC-N25 | A wake does not change the management involvement axis for any mode. *(No dedicated test id; the driver has no management seam and `AC-N24` asserts the default `DIRECT` value is unchanged.)* |
| AC-N26 | Disabling `MONITOR` does not cancel watches. |
| AC-N27 | `EXPLORE` + `MONITOR` does not widen recipe compatibility. |
| AC-N28 | `monitor.v1` readiness is honest about the runtime wiring. |
| AC-N29 | `MONITOR` availability follows the real runtime wiring. |
| AC-N30 | A full pass writes only the delivery marks table. |

## 12. Machine invariants

`MON-A01`…`MON-A35`, grouped.

**Group A — Structural firewalls (`MON-A01`…`MON-A08`)**

```text
MON-A01  MonitorTick ≠ SemanticEvent: a tick only reads and calls existing services.
MON-A02  MonitorPreference ≠ ActiveMonitoring: no MONITOR ⇒ no new scan.
MON-A03  No hidden timer: intervalMonitorTickSource throws without intervalMs.
MON-A04  No second watch state machine: scanWatches/recordTriggers are reused.
MON-A05  No second wake state machine: beginWake/reconcileCurrentWorld are reused.
MON-A06  No new canonical store: the only new table is monitor_delivery_marks.
MON-A07  No Agent identity: no Monitor/Watcher/Scheduler/Manager agent type.
MON-A08  Authority-free source: driver.ts contains no compil/admit/authority/proof.
```

**Group B — Scope (`MON-A09`…`MON-A12`)**

```text
MON-A09  Scope results are sorted and deduplicated.
MON-A10  The empty scope returns [] and is never widened.
MON-A11  The linked scope excludes a Campaign that names no project.
MON-A12  maxCampaignsPerTick bounds how many Campaigns one tick evaluates.
```

**Group C — Evaluation truth (`MON-A13`…`MON-A17`)**

```text
MON-A13  Watch statuses are exactly pending | triggered | incomplete.
MON-A14  An absent port ⇒ incomplete, never triggered and never unknown/error.
MON-A15  An incomplete watch never triggers and never starts a wake.
MON-A16  New scanning happens only while the Campaign is DORMANT.
MON-A17  Multi-trigger: all triggers land atomically; cause = smallest watchId; one wake.
```

**Group D — Wake lifecycle and crash recovery (`MON-A18`…`MON-A24`)**

```text
MON-A18  Trigger-before-wake is recovered from history, not from a scan.
MON-A19  Wake-before-reconciliation continues the same in-flight cycle.
MON-A20  At most one in-flight wake per Campaign.
MON-A21  The driver stops before next-action compilation/admission.
MON-A22  Reconciliation is the existing deterministic reconcileCurrentWorld.
MON-A23  Activation is offered when reconciliation committed or lifecycle is RECONCILING.
MON-A24  An in-flight wake is continued even when MONITOR is disabled.
```

**Group E — Activation and delivery (`MON-A25`…`MON-A29`)**

```text
MON-A25  signalId is derived only from {project, campaign, wakeCycle, cause, phase}.
MON-A26  At-least-once: activation failure leaves every canonical event untouched.
MON-A27  A delivery mark is not evidence of semantic success.
MON-A28  No adapter mints a PeerRef or a PersistentPoint.
MON-A29  Management mode is not consulted and not mutated by a wake.
```

**Group F — Opt-in, posture, recipe (`MON-A30`…`MON-A33`)**

```text
MON-A30  MONITOR availability derives from real runtime wiring.
MON-A31  monitor.v1 readiness is CONDITIONAL with honest limitations.
MON-A32  Disabling MONITOR cancels no watch.
MON-A33  EXPLORE + MONITOR does not widen supportedModifiers.
```

**Group G — Footprint and coalescing (`MON-A34`…`MON-A35`)**

```text
MON-A34  The Campaign store's table set is unchanged by a tick.
MON-A35  Overlapping ticks coalesce and redelivery creates no second wake.
```

## 13. PASS criterion

> A Palimpsest project whose Work Mode preference includes `MONITOR` durably
> re-evaluates its own scoped dormant Campaign watches on a host tick, records
> canonical triggers through the existing prospective service, enters the existing
> single-wake lifecycle, runs the existing deterministic reconciliation, and
> notifies the project principal through a host wake adapter — at least once,
> across process restarts and crash seams — and then stops before any semantic
> next-action compilation, Work creation, commitment, boundary or authority.
> A `MONITOR` preference alone creates no Campaign, Watch, Work, timer or
> authority. Recovery is derived from canonical history alone: a pending trigger
> becomes one wake, an in-flight wake continues the same cycle, and a committed
> reconciliation yields the same signal identity after a restart. The monitor
> owns no canonical store beyond the deployment-local delivery marks, mints no
> Agent identity, and never scans a Campaign outside its configured scope.

## 14. PARTIAL / STOP conditions

PARTIAL if: a `MONITOR` preference starts a scheduler, a timer or a background
scan on its own; a tick creates Work, a compiled/admitted next action, a
commitment, a boundary or Proof; an incomplete watch is treated as triggered; the
monitor scans every Campaign by default; a host activation is treated as wake
completion or as semantic admission; a crash after `WATCH_TRIGGERED`,
`WAKE_STARTED` or `RECONCILIATION_COMMITTED` loses the wake; delivery is
described as exactly-once; a delivery mark becomes semantic truth; the runtime
duplicates Campaign watch/wake state in its own store.

STOPPED — SEMANTIC REBASE REQUIRED if: the monitor requires a second canonical
store, a new Agent identity, or a second watch/wake state machine; it requires
chain-of-thought or a context dump in the wake text; it requires widening the
management involvement axis or an External/Personal asset scope; canonical main
invalidates the baseline.

None of the PARTIAL or STOP conditions was hit.

## 15. Series invariant and the AB/AC sequence

```text
One major stage at a time; close its invariants; carry real leftovers forward.
```

AB closed the durable operating posture and management history (product closure),
leaving the AB/AA/W/X/Y/Z items carried. AC resumes long-horizon autonomy as an
**opt-in runtime** that grants nothing: AB decided *how a project is allowed to
work*; AC lets the project *be reconsidered* under that decision. The next stage
is chosen from real product need in `G10-AC-CARRY-FORWARD.md`.
