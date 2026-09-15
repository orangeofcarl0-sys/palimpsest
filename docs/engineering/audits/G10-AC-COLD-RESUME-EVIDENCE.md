# G10-AC — Cold-resume evidence

Reproduction of `node scripts/monitor/cold-resume.mjs` on the AC worktree
(`pnpm build` already clean). The run exited `0`.

## 1. Console output (verbatim)

```text
before T (2026-09-15T00:00:00Z < 2026-09-16T00:00:00Z): scopedCampaigns=1 triggeredWatchIds=[] -> nothing triggered

canonical event types created: WATCH_TRIGGERED, WAKE_STARTED, RECONCILIATION_COMMITTED, WORLD_RECONCILED, COMMITMENTS_REVIEWED
wake cycle id: wc-1
lifecycle: RECONCILING
delivered signal id: campaign-wake-06dacb492db43604eb2de3389f1c4548

resumed principal message (first 3 lines):
Palimpsest campaign wake — RECONCILIATION_READY

project: cold-resume-project
```

## 2. JSON summary (verbatim)

```json
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
```

## 3. What the script does

It opens a real `SqliteCampaignStore`, a real Work `EventStore`, a real
`SqliteWorkModePreferenceStore` and a real `SqliteMonitorDeliveryMarkStore` in a
temp directory (`scripts/monitor/cold-resume.mjs:57-62`), builds the real
Campaign/Prospective/Production/Intervention services (`:80-102`), creates a
project-linked Campaign, drives it `DORMANT` with a `not_before` watch at
`T0 = 2026-09-16T00:00:00Z` (`:104-125`), sets `FOCUS + MONITOR` (`:128`), and
composes the real driver with a DSH-style adapter and a manual tick source
(`:133-171`). The clock starts at `2026-09-15T00:00:00Z`, strictly before `T0`.

## 4. Field-by-field

| Field | Value | Meaning |
| --- | --- | --- |
| `beforeTrigger` | `false` | The tick taken **before** T produced nothing: the `not_before` condition was still `pending`. |
| `triggeredWatchIds` | `["w-1"]` | The single watch the post-T tick recorded. |
| `wakeStarted` | `1` | Exactly one `WAKE_STARTED` was created — one wake cycle, not one per trigger. |
| `wakeCycleId` | `"wc-1"` | The allocated cycle; the signal and the reconciliation are bound to it. |
| `lifecycle` | `"RECONCILING"` | After `RECONCILIATION_COMMITTED` the Campaign sits at `RECONCILING`; the driver stopped before completion. |
| `activationPhase` | `"RECONCILIATION_READY"` | The world reconciled deterministically (`reconciliationDigest` present), so the signal phase is READY. |
| `delivered` | `true` | The host adapter accepted the wake. |
| `signalId` | `"campaign-wake-06dacb…"` | The semantic identity; recomputable from `{project, campaign, wakeCycle, cause, phase}`, independent of this run's clock. |
| `coldResumed` | `true` | The script's adapter returned `undefined` from `agents.get`, so `agents.resume` was called and the persisted principal was queued one turn. |
| `campaignEventsCreated` | five event types | The complete canonical effect of the pass (see §5). |
| `workEventsCreated` | `0` | A real Work store was opened and its event count did not move. |
| `pass` | `true` | The script's own conjunction (`wakeStarted === 1`, ≥1 trigger, `delivered`, `coldResumed`, zero Work events) held. |

## 5. Before T: nothing happens

The first tick is taken with `now = 2026-09-15T00:00:00Z`. `scanWatches` returns
the watch as `pending` (`src/campaign/prospective.ts:340-342`), so the driver
records no trigger and starts no wake. The printed line is
`triggeredWatchIds=[] -> nothing triggered`. This is the opt-in path working:
MONITOR is present, the Campaign is scoped and DORMANT, and still nothing is
invented.

## 6. After T: one tick, the whole progression

At `now = 2026-09-16T01:00:00Z` the single `driver.tick()` takes the driver
through its bounded intra-tick loop (`src/monitor/driver.ts:484-504`) and creates
exactly:

```text
WATCH_TRIGGERED           the condition is satisfied; cause recorded
WAKE_STARTED              exactly one wake cycle, cause = watch:w-1
RECONCILIATION_COMMITTED  the existing deterministic reconciliation
WORLD_RECONCILED          the world snapshot that reconciliation observed
COMMITMENTS_REVIEWED      the commitment review that reconciliation records
```

No `PROJECT_ADMITTED`, `WAIT_ADMITTED`, `NEXT_ACTION_COMPILED`,
`CAMPAIGN_COMMITMENT_RESOLVED`, `PROOF_PUBLISHED` or `BOUNDARY_DECLARED` appears;
`workEventsCreated` is `0`. The driver stopped at the activation phase.

## 7. Cold resume

The adapter is constructed with `get: () => undefined`, so there is no resident
principal and the DSH adapter takes its cold branch
(`src/monitor/activation.ts:217-219`): `resume({ resumeSessionId })` is called
once, and the returned agent is queued exactly one turn via `followup(text)`. The
delivered message begins:

```text
Palimpsest campaign wake — RECONCILIATION_READY

project: cold-resume-project
```

`resumeCalls > 0` and at least one captured message make `coldResumed` true. The
adapter mints no `PeerRef` and no `PersistentPoint`; the wake is a notification.

## 8. The second tick is a no-op

After the post-T tick the script immediately ticks again. That idle tick creates
no new canonical event, starts no second wake, and delivers nothing new: the
signal identity is already the same wake cycle. The script's assertion
`wakeStarted === 1` and the test `AC-N21` both depend on this.

## 9. Crash recovery as proven by `AC-N16`/`AC-N17`/`AC-N18`

The dogfood exercises the happy path. The crash seams are proven in
`test/ac_monitor_runtime.test.ts` by **writing the exact canonical state a crash
would leave behind and then ticking** — which is precisely the point: recovery
reads history, not a pending table.

| Crash point | Test | How it is simulated | What the tick proves |
| --- | --- | --- | --- |
| after `WATCH_TRIGGERED`, before `WAKE_STARTED` | `AC-N16` | `recordTrigger` is called directly; the wake is never begun (`:630-631` comments the seam). The watch is now `TRIGGERED`, so `scanWatches` cannot report it. | The tick derives `pendingWatchId` from history, calls `beginWake`, and produces exactly one `WATCH_TRIGGERED` and one `WAKE_STARTED`; the detail matches `/pending wake/`. |
| after `WAKE_STARTED`, before reconciliation | `AC-N17` | `recordTrigger` then `beginWake` are called directly, leaving an in-flight `WAKING` cycle. | The tick continues the **same** `wakeCycleId`, reconciles, and writes one `RECONCILIATION_COMMITTED` with still one `WAKE_STARTED`. |
| after reconciliation, before host activation | `AC-N18` | `seedReconciling` performs trigger + wake + reconciliation directly (`:272-294`), leaving a committed reconciliation and no delivery. | Two independent drivers tick and derive an **identical** `signalId`; the activation adapter records two attempts with the same identity and the marks store shows `attemptCount === 2`. Recovery is replay-derivable. |

In all three cases the recovery path is the same code the happy path uses — no
special-case resurrection, no recovery ledger.
