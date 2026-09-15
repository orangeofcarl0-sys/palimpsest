# G10-AC — Monitor-runtime anti-waste audit

| Claim | Evidence |
| --- | --- |
| **No new canonical monitor store** | The only table the new plane creates is the deployment-local `monitor_delivery_marks` (`CREATE TABLE IF NOT EXISTS monitor_delivery_marks`, `src/monitor/delivery_marks.ts:51-59`). The Campaign store's table set is unchanged across a full tick: `AC-N04` asserts `["campaign_definitions", "campaign_events"]` before and after two ticks, and `AC-N30` asserts the marks file contains exactly `monitor_delivery_marks`. |
| **No second watch state machine** | The driver calls the existing prospective service — `deps.prospective.scanWatches` (`src/monitor/driver.ts:310`) and `deps.prospective.recordTriggers` (`:325`) — and holds only `Pick<ProspectiveService, "scanWatches" | "recordTriggers" | "watchStates">` (`:116`). Watch status still comes from `activeWatches`/`watchStates` in `src/campaign/prospective.ts`. |
| **No second wake state machine** | The driver calls the existing production service — `deps.production.lifecycleState`, `beginWake`, `reconcileCurrentWorld` — declared as a narrow port at `src/monitor/driver.ts:117-137` and wired to the real service at `src/install.ts:1560-1564`. Lifecycle is derived by `lifecycleStateFromEvents` (`src/campaign/production.ts:322-349`); the driver never re-implements it. |
| **No new Agent identity** | No `MonitorAgent`, `WatcherAgent`, `SchedulerAgent` or `ManagerAgent` type is introduced. The driver is a value with six methods (`dispose`, `previewTick`, `start`, `status`, `stop`, `tick`, `src/monitor/driver.ts:148-156`) and `AC-N04` asserts that exact key set; the driver object exposes no store/db/table/close member. |
| **No duplicate Campaign truth** | The driver owns no store. It reads history through a narrow seam — `MonitorCampaignHistoryPort.readEvents` (`src/monitor/driver.ts:51-54`), wired to `campaign.store.replay` (`src/install.ts:1565-1567`). Reconciliation writes reuse the canonical batch builder in `reconcileCurrentWorld` (`src/campaign/production.ts:672-790`); no belief digest or event body is copied. |
| **No CoT** | The default wake text (`formatCampaignWakeSignal`, `src/monitor/activation.ts:97-117`) carries exact refs and one sentence of detail. It contains no reasoning, prompt or scratchpad field, and the signal interface (`:28-44`) has no such member. |
| **No External/Personal asset scope** | No `PersonalAsset`, `ExternalAssetLibrary`, `globalAsset` or `autoIndex` symbol exists under `src/monitor/`. The scope port returns only canonical Campaign ids (`src/monitor/scope.ts:26-34`). |
| **No hidden default timer** | An interval source is impossible without an explicit interval: `intervalMonitorTickSource` throws `TypeError` unless `intervalMs` is a positive safe integer (`src/monitor/tick_source.ts:94-102`); `AC-N12` asserts that a preference plus `driver.start()` with no tick source starts nothing (`status.tickSource === null`, no `WATCH_TRIGGERED`, no `WAKE_STARTED`). |
| **Delivery marks are non-authoritative** | `MonitorDeliveryMark` records only attempt/success timestamps (`src/monitor/delivery_marks.ts:23-30`); `recordSuccess` is documented as "NOT wake completion" (`:115`). The driver stops delivery on the semantic fact that the wake cycle is complete, not on a mark (`:429-449`). `AC-N20` proves activation success leaves `WAKE_CYCLE_COMPLETED = 0` and lifecycle `RECONCILING`. |

## Cost added at runtime

* One deployment-local SQLite file with one table, created once
  (`src/monitor/delivery_marks.ts:48-59`).
* Per tick: one Work Mode preference read, one scope resolution, one
  `lifecycleState` + one history replay per scoped Campaign, then only the writes
  the existing services perform.
* Per delivered signal: one `recordAttempt`, optionally one `recordSuccess`.
* No new network surface. The HTTP additions are two read-only GET routes
  (`src/application/http.ts:789-799`). No background job is registered by the
  library; a timer exists only if an operator constructs an interval tick source
  and calls `start()`.

## Deliberately NOT built

```text
a MonitorStore / monitor event log      a second watch or wake state machine
a MonitorAgent / WatcherAgent           a SchedulerAgent / ManagerAgent
a global "scan every Campaign" scope    a hidden default interval
a Campaign→Project reverse index        a webhook / push connector
a mark-based semantic correctness rule  a CoT or context-dump in the wake text
```

## Honest limitations

* **One phase per pass, with a bounded intra-tick loop.** `advanceCampaign`
  performs at most one phase transition, so the tick loops up to four passes
  (`src/monitor/driver.ts:484-504`) re-deriving the continuation after each
  successful write. The loop stops at the activation phase (`reachedActivation`,
  `:500-503`) precisely so a single tick does not re-deliver to the same host.
* **A larger scoped set than the budget needs more ticks.** `maxCampaignsPerTick`
  defaults to 10 and `maxWakeAdvancesPerTick`/`maxActivationsPerTick` to 5
  (`src/monitor/driver.ts:64-69`); beyond that a tick reports what it did and
  leaves the rest for the next tick. This is deliberate, not a bug.
* **With no marks store there is no duplicate suppression.** `deps.marks` is
  optional (`src/monitor/driver.ts:140`); when absent, `shouldDeliver` always
  returns `deliver: true` for an incomplete wake and the host is re-notified every
  tick. The canonical wake is idempotent, so this is waste, not corruption.
* **`inFlightWakeCount` counts `WAKING + RECONCILING`.** `status()` increments for
  either lifecycle state (`src/monitor/driver.ts:543-544`). It is "wakes not
  finished", not "activations in flight".
* **The driver has no CLI command.** This CLI composes no Campaign store, so
  there is nothing to tick from the command line; the operator force-tick is
  `installed.monitor.tick()`. The surface comment at
  `src/application/surface.ts:513-516` says the tick "lives on the installed
  runtime and the CLI" — the installed-runtime half is true, the CLI half is not
  yet (recorded as `CF-AC-01`).
