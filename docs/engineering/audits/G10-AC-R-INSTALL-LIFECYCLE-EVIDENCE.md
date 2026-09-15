# G10-AC-R — Install lifecycle evidence

The transcripts behind `docs/engineering/MONITOR-INSTALL-LIFECYCLE.md`: the two
scripts that exercise the REAL built modules from `dist/`, pasted verbatim, with
each field explained and mapped to the test that guards it.

Run in this tree at the recorded revision:

```bash
node scripts/monitor/acr0-repro.mjs     # EXIT=0
node scripts/monitor/cold-resume.mjs    # EXIT=0
```

Both import the built `dist/` modules through `pathToFileURL` (the Windows-safe
pattern), so a stale or missing build would fail loudly rather than test the
wrong stack. Only host adapters (tick sources, wake activation ports) and clocks
are stubbed; every Campaign/Work Mode/posture artifact is real.

## 1. `acr0-repro.mjs` — verbatim output

```text
$ node scripts/monitor/acr0-repro.mjs
{
  "items": [
    {
      "id": "AC-R-03",
      "monitorComposed": true,
      "postureMonitorAvailability": "UNAVAILABLE",
      "postureMonitorReason": "scope only: a manual/debug driver at most; no autonomous monitoring",
      "declaredScopeOnlyAvailability": "CONDITIONAL",
      "declaredScopeOnlyReason": "a monitor runtime is declared without tick/activation detail; a bare declaration cannot prove an autonomous runtime",
      "capabilityStartState": "NOT_CONFIGURED",
      "defect": false
    },
    {
      "id": "AC-R-01",
      "fires": 6,
      "driverStarted": true,
      "defect": false
    },
    {
      "id": "AC-R-02",
      "firesBeforeDispose": 3,
      "firesAfterDispose": 3,
      "stillRunning": false,
      "defect": false
    },
    {
      "id": "AC-R-04",
      "firstClock": "2026-09-16T00:00:00Z",
      "secondClock": "2027-12-25T12:34:56Z",
      "firstEventId": "evt-90c1254679bd2b6ec9445b26",
      "secondEventId": "evt-90c1254679bd2b6ec9445b26",
      "firstCause": "monitor_condition_satisfied",
      "secondCause": "monitor_condition_satisfied",
      "defect": false
    },
    {
      "id": "AC-R-05/06",
      "workspaceRendersMonitor": true,
      "webFileCount": 16,
      "operatingHistoryReferencesCampaignEvents": true,
      "defect": false
    }
  ],
  "anyDefect": false
}
EXIT=0
```

### Field-by-field

**AC-R-03** — `monitorComposed` true means a first-party driver object exists.
`postureMonitorAvailability` is the LIVE install's MONITOR row: `UNAVAILABLE`
because the composition is scope-only, and the reason says exactly that.
`declaredScopeOnlyAvailability` is the DERIVER fed with what the install declares
for that same composition: now `CONDITIONAL`, because a declaration without
tick/activation detail can never prove a runtime. `capabilityStartState`
`NOT_CONFIGURED` is the live capability's start state. `defect` is true only if
EITHER reading said `AVAILABLE`. Guarded by **ACR-N01** (scope only is not
AVAILABLE, through both the component rig and the real install) and
**ACR-N04b/matrix** (exactly one of five partial wirings is AVAILABLE).

**AC-R-01** — `fires` counts real 30 ms interval ticks observed 200 ms after
`installPalimpsest` returned, with NO explicit `start()` call anywhere in the
script. `driverStarted` is the driver's own reading. `defect` is `fires === 0`.
Guarded by **ACR-N06**.

**AC-R-02** — `firesBeforeDispose` is the count at the moment of `dispose()`,
`firesAfterDispose` the count 200 ms later, and `stillRunning` the source's own
status. `defect` is true if any tick arrived after dispose or the source is still
running. Guarded by **ACR-N07** and, for the "no callback against a closed store"
half, **ACR-N08** (an interval source with an `onError` collector observes zero
errors and zero post-dispose fires).

**AC-R-04** — two independent rigs, each with its own clock, run the same
semantic trigger. `firstEventId` and `secondEventId` are the CANONICAL event ids
recorded by the Campaign store; `firstCause`/`secondCause` are the canonical
payload's cause. `defect` is true if the ids or the causes differ. Guarded by
**ACR-N12** (the cause contains no date-like text) and **ACR-N13** (identical
identity across clocks).

**AC-R-05/06** — a text-presence reading over `web/src/**` and
`src/project_operating/history.ts`. `webFileCount` is 16 in both phases, so the
flip is content, not new files. Never a defect; its AFTER value is `true/true`.
The rendering itself is guarded by **E2E-PROJECT-03**.

## 2. Standard-install start proof

The standard path is `installPalimpsest(..., { campaignMonitorScope,
campaignMonitorTickSource, campaignMonitorActivation })`. The script never calls
`start()`; ticks appear anyway (`fires: 6`), and `driverStarted` is true. The
install initiates startup at `src/install.ts:1651` and keeps the promise so a host
can `await installed.monitor.ready()`. Guarded by **ACR-N06**, which additionally
asserts `startState === "RUNNING"`, `capability.started`, `driverStarted`, a
non-zero `tickSource.fires`, `tickSource.running`, and that the install's own
posture row reads `AVAILABLE` with the "explicit tick source and a real host wake
activation adapter" reason.

## 3. Dispose / no-late-tick proof

`firesAfterDispose === firesBeforeDispose` and `stillRunning === false`: the tick
source was stopped before the stores were released. The stronger form is
**ACR-N08**: an interval source whose `onError` collects failures runs for 60 ms,
is disposed, and then observes zero further fires and zero errors over the next
140 ms — so no tick callback threw against a closed store — and a second
`dispose()` resolves as a no-op.

## 4. Partial-wiring matrix

**ACR-N04b/matrix** drives five drivers over the same real Campaign and asserts
exactly one `AVAILABLE`:

```text
scope only              UNAVAILABLE
scope + tick            CONDITIONAL
scope + activation      CONDITIONAL
scope + tick + activation (started)  AVAILABLE
scope + tick + activation (failed)   UNAVAILABLE
```

AC-R-03 in the reproducer covers the sixth row — a DECLARED but not composed
runtime — which reads `CONDITIONAL`, because a declaration is not a runtime.

## 5. Startup-failure proof

**ACR-N05** uses a tick source whose `start()` throws
`"the interval timer could not be created"`:

```text
ready().status            "failed"
ready().error             the message (exact)
capability.startState     "FAILED"
capability.started        false
availability              UNAVAILABLE, reason contains the message
derived MONITOR row       UNAVAILABLE, reason contains the message
```

The same behaviour through the product reads is **ACR-N16**, which also asserts
that `withMonitorRuntimeCapability` moves ONLY the MONITOR row (every other row is
byte-identical) and that the capability warning names the error.

## 6. Default-mark proof

**ACR-N10** installs with a tick source, a scope, a Campaign and NO
`campaignMonitorDeliveryMarks` option, then asserts `status().deliveryMarks ===
"default"` and that two consecutive ticks produce exactly ONE recorded activation
inside a one-hour cooldown. **ACR-N11** proves marks LOSS stays semantically safe:
a second driver over the same Campaign with a fresh marks file re-delivers, but
with the SAME `signalId`, and the Campaign still contains exactly one
`WAKE_STARTED`.

The three-way reporting is at `src/install.ts:1579-1600` and is surfaced verbatim
in the workspace (`monitor-delivery-marks`).

## 7. Deterministic trigger-identity proof

**ACR-N12** asserts the canonical cause is exactly `monitor_condition_satisfied`
and contains no `YYYY-MM-DD` text. **ACR-N13** runs two semantically identical
rigs at `2026-09-16T00:00:00Z` and `2027-12-25T12:34:56Z` and asserts the SAME
canonical `eventId` and the same cause — the event id is the digest of the
payload, so an identical payload must yield an identical identity. **ACR-N14**
asserts the canonical payload's key set is exactly `["cause", "watchId"]` and that
the clock appears ONLY in the driver's non-canonical outcome `detail`.

This is also the mechanism that keeps a redelivery the same signal: the activation
digest is derived from `{project, campaign, wakeCycle, cause, phase}` and carries
no clock or attempt counter (`src/monitor/activation.ts:46-62`).

## 8. `cold-resume.mjs` — verbatim output

```text
before T (2026-09-15T00:00:00Z < 2026-09-16T00:00:00Z): scopedCampaigns=1 triggeredWatchIds=[] -> nothing triggered

canonical event types created: WATCH_TRIGGERED, WAKE_STARTED, RECONCILIATION_COMMITTED, WORLD_RECONCILED, COMMITMENTS_REVIEWED
wake cycle id: wc-1
lifecycle: RECONCILING
delivered signal id: campaign-wake-06dacb492db43604eb2de3389f1c4548

resumed principal message (first 3 lines):
Palimpsest campaign wake — RECONCILIATION_READY

project: cold-resume-project

{
  "beforeTrigger": false,
  "triggeredWatchIds": [
    "w-1"
  ],
  "wakeStarted": 1,
  "wakeCycleId": "wc-1",
  "lifecycle": "RECONCILING",
  "activationPhase": "RECONCILIATION_READY",
  "delivered": true,
  "signalId": "campaign-wake-06dacb492db43604eb2de3389f1c4548",
  "coldResumed": true,
  "campaignEventsCreated": [
    "WATCH_TRIGGERED",
    "WAKE_STARTED",
    "RECONCILIATION_COMMITTED",
    "WORLD_RECONCILED",
    "COMMITMENTS_REVIEWED"
  ],
  "workEventsCreated": 0,
  "pass": true
}
EXIT=0
```

### Field-by-field

| Field | Reading |
| --- | --- |
| `beforeTrigger` | false — before the `not_before` instant the watch is genuinely dormant and a tick does nothing. |
| `triggeredWatchIds` | `["w-1"]` — the canonical `WATCH_TRIGGERED` payload names the watch, recorded through the existing prospective service. |
| `wakeStarted` | 1 — exactly one `WAKE_STARTED`; the second, idle tick starts no second wake. |
| `wakeCycleId` | `wc-1` — the single in-flight wake cycle. |
| `lifecycle` | `RECONCILING` — the mechanical progression stopped where it should: a wake exists and the world was reconciled, and no next action was compiled or admitted. |
| `activationPhase` | `RECONCILIATION_READY` — the deterministic reconciliation committed, so the host may reconsider the Campaign. |
| `delivered` | true — the DSH-style adapter cold-resumed the principal (no resident agent, so `resume` was required). |
| `signalId` | a semantic digest identity; a redelivery of the same wake yields this same id. |
| `coldResumed` | true — the resumed principal's first turn was captured (first three lines: "Palimpsest campaign wake — RECONCILIATION_READY", a blank line, "project: cold-resume-project"). |
| `campaignEventsCreated` | the five event types the wake wrote, all Campaign-plane. |
| `workEventsCreated` | 0 — the monitor wrote NOTHING to the Work ledger, which is the firewall this dogfood exists to prove. |
| `pass` | the conjunction of the above, including `workEventsCreated === 0`. |

## 9. What this evidence does NOT prove

* The scripts run the driver directly (cold-resume) or the install (acr0-repro);
  neither drives the HTTP surface. The read routes are covered by `ACR-N19`,
  `ACR-N20`, `ACR-N26` and E2E-PROJECT-03.
* The Campaign plane records no wall clock, so nothing here pins a wake to a time.
  The `at`-free payload is asserted by `ACR-N14`; the derived history's chain-position
  key is asserted by `ACR-N17`.
* `acr0-repro`'s E item is a text-presence check; the rendering claim rests on the
  Playwright spec, not on this script.
* Neither script exercises a multi-process crash seam; that recovery surface is
  covered by the AC cold-resume dogfood and the AC suite's crash cases.
