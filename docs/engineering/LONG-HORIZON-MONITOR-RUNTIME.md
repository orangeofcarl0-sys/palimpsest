# Long-horizon Campaign monitor runtime

Normative statement of what the `MONITOR` Work Mode preference actually does now
that G10-AC composes a real runtime, and of the line it must never cross.

Before G10-AC, `MONITOR` was a durable preference with no execution binding: the
prospective-memory primitives existed (`scanWatches`, `beginWake`,
`reconcileCurrentWorld`) but no component combined them, and nothing resumed a
dormant Campaign after a crash. G10-AC adds exactly one component — a driver —
and stops it before semantic work.

The companion documents are `G10-AC-MONITOR-SPEC.md` (the campaign spec),
`CAMPAIGN-WAKE-HOST-BINDING.md` (signal and adapters) and
`docs/engineering/audits/G10-AC-MONITOR-DELIVERY.md` (what shipped).

---

## 1. Firewalls

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
```

* A tick is *"re-evaluate monitored dormant state"* and nothing else
  (`src/monitor/tick_source.ts:4-6`).
* A watch firing means *"reconsider the Campaign"*, never *"the claim is true"*,
  *"the commitment is satisfied"* or *"the project is needed"*
  (`src/campaign/prospective.ts:8-10`).
* A wake is a notification whose only content is the exact project, Campaign,
  wake cycle, cause, phase and reconciliation digest. It grants the resumed
  principal nothing (`src/monitor/activation.ts:8-17`).
* Delivery marks (`monitor_delivery_marks`) are duplicate suppression and
  backoff, not Campaign truth and not activation success
  (`src/monitor/delivery_marks.ts:3-5`).

## 2. The core path

```text
                MONITOR preference (operator opt-in, read per tick)
                                   │
        scope: the Campaign ids THIS project may evaluate (never all)
                                   │
              DORMANT only: scanWatches (READ-ONLY)
                                   │
        recordTriggers: WATCH_TRIGGERED × N in ONE atomic batch
                                   │
        beginWake: exactly one wake cycle, cause = smallest watchId
                                   │
        reconcileCurrentWorld: existing deterministic reconciliation
                                   │
        buildCampaignWakeActivationSignal (signalId = semantic identity)
                                   │
        activation port: at-least-once host wake (DSH / Pi / null)
                                   │
                                   ▼
                    STOP — before next-action compilation
```

The driver composes existing services; it does not replace any of them. Its own
implementation surface is the file `src/monitor/driver.ts` plus five support
modules (scope, tick source, derivation, activation, marks),
re-exported from `src/monitor/index.ts`.

## 3. Project scoping, and why "scan every Campaign" is forbidden

One installed project shares a Campaign store with other projects. Silently
scanning every Campaign would let one project observe and wake another project's
Campaigns, which is a cross-project authority leak even though each individual
write is canonical. The runtime therefore provides only explicitly narrowed
scopes (`src/monitor/scope.ts:5-21`):

| Scope | Returns |
| --- | --- |
| `emptyCampaignMonitorScope` | nothing — the honest default when none is configured |
| `linkedCampaignMonitorScope` | only Campaigns whose own record links this project |
| `allowlistCampaignMonitorScope` | exactly the operator-named ids |
| `composedCampaignMonitorScope` | the deterministic union of the named scopes |

There is deliberately **no "all campaigns" scope**. A deployment that wants one
must compose an allowlist — an explicit product decision, not a default
(`src/monitor/scope.ts:15-17`). The scope result is sorted and deduplicated, and
an empty result is a legitimate answer that is never widened
(`scope.ts:29-33`).

## 4. The tick model, and why there is no default interval

Every timer, manual command or push hint converges on the same
`driver.tick(trigger)` path, so there is exactly one evaluation pipeline
(`src/monitor/tick_source.ts:11-16`). There are three trigger labels — `manual`,
`interval`, `signal_hint` (`:19`) — but a label grants nothing.

An interval source **requires** an explicit `intervalMs`; without it the factory
throws (`src/monitor/tick_source.ts:94-102`). The reason is stated in the option
doc (`:70-78`): an implicit timer would be exactly the hidden background
scheduler the firewalls forbid. A preference change, a composed driver and a
`start()` call with no source all run nothing (`AC-N12`).

Overlapping ticks are the driver's problem to coalesce, not the source's: a
running tick is shared and a concurrent `tick()` returns the same in-flight
promise (`src/monitor/driver.ts:581-588`, proved by `AC-N22`).

## 5. DORMANT-only scanning

New watch scanning happens **only** while the Campaign lifecycle is `DORMANT`
(`src/monitor/driver.ts:309`). An `ACTIVE`, `QUIESCING`, `WAKING`, `RECONCILING`
or `TERMINATED` Campaign is never scanned for new triggers. Watches are evaluated
read-only; evaluating one never writes (`src/campaign/prospective.ts:13-15`).

There is one deliberate exception, and it is not a scan: a Campaign that is
`DORMANT` with a **pending triggered watch** is still woken from that history
(`src/monitor/driver.ts:284-306`), because the trigger already happened and
`scanWatches` can no longer report it (`src/monitor/lifecycle_derivation.ts:5-7`).

## 6. `incomplete ≠ triggered`

The only watch statuses are `pending | triggered | incomplete`
(`src/campaign/prospective.ts:114-117`). A condition whose port is absent, whose
knowledge is unknown, or whose required source errors is `incomplete`; it is
**never** treated as satisfied and never becomes a trigger. An `incomplete`
evaluation is surfaced honestly in the tick detail and left alone
(`driver.ts:349-357`). The driver does not invent a port, a default or a
fallback to make a watch evaluable.

## 7. The deterministic multi-trigger policy

When one condition epoch makes several watches fire:

1. all currently-triggered active watches are recorded in **one atomic write**
   (`recordTriggers`, `src/campaign/prospective.ts:408-433`), so a crash cannot
   leave a partial trigger set;
2. the wake cause is the **smallest watchId** of the recorded set
   (`driver.ts:332`), which is stable and independent of event timing; and
3. exactly **one** wake cycle is started for that set (`driver.ts:333-345`).

`AC-N23` proves two triggered watches produce two `WATCH_TRIGGERED` events, one
`WAKE_STARTED`, and a `cause` of `watch:<smallest id>`.

## 8. The progression, and where the driver stops

Campaign lifecycle is the existing machine
(`src/campaign/production.ts:322-349`):

```text
DORMANT ──beginWake──▶ WAKING ──reconcileCurrentWorld──▶ RECONCILING
                                                              │
                                  (the driver STOPS here) ────┘
```

The driver may carry a Campaign through trigger → wake → deterministic
reconciliation → activation, and then it stops (`driver.ts:22-25`). It never:

* creates or admits a next action, a compiled candidate, a Project admission or a
  WAIT admission;
* accepts a commitment or a boundary;
* creates Work, a task, an attempt or a management activity;
* publishes Proof or grants any authority;
* writes `WAKE_CYCLE_COMPLETED` — completing the wake is the resumed principal's
  job, through the existing admission and completion services.

Two recovery continuations keep the progression crash-honest without a new state
machine (`src/monitor/driver.ts:280-388`): trigger-before-wake is recovered from
history (a pending wake is derivable even though the watch is no longer ACTIVE),
and wake-before-reconciliation continues the **same** in-flight cycle. An
in-flight wake is always continued even when `MONITOR` is disabled, so disabling
the preference can never strand a canonical wake (`driver.ts:477-482`).

## 9. At-least-once delivery

Host delivery is explicitly **at-least-once** (`src/monitor/delivery_marks.ts:6-16`;
`monitor.v1` limitations, `src/recipes/registry.ts:79-86`). The signal identity is
derived from the wake cycle, not the attempt, so a duplicate delivery cannot mint
a second wake (`AC-N18`, `AC-N21`). An activation failure returns
`activated: false`, leaves every canonical event untouched, and may be retried
after the cooldown (`AC-N19`). Redelivery while the wake cycle is incomplete is by
design; once the cycle is complete the driver stops delivering at all.

## 10. What the driver must never do

```text
never scan outside the configured scope
never scan a non-DORMANT Campaign for new triggers
never treat incomplete as triggered
never scan at all without the MONITOR preference (except continuing an in-flight wake)
never start a timer without an explicit intervalMs
never create a Campaign, a Watch, a commitment or a boundary
never create Work, a task, an attempt or a management activity
never compile or admit a next action
never publish Proof or grant authority
never complete a wake on delivery
never own a canonical store or mint an Agent identity
never become a scheduler, a planner or a manager
```

`MONITOR` is a way for a project to be *reconsidered*; it is not a management
escalation, not a second autonomy axis, and not a background worker. The resumed
principal decides what to do, using the existing Campaign next-action admission
and Project Management services.
