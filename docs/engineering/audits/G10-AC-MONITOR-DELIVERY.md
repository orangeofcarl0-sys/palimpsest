# G10-AC — Delivery report

Stage: **Long-horizon Campaign monitor runtime**.
Baseline: `eca28ecce8118b21d41debb9af66b472b5ca866a`.
Spec: `docs/engineering/G10-AC-MONITOR-SPEC.md`.

## 1. What changed

**New — `src/monitor/`** (its own plane, authority-free):

* `scope.ts` — `CampaignMonitorScopePort` plus `empty`, `linked`, `allowlist` and
  `composed` scopes. No all-campaigns scope exists.
* `tick_source.ts` — `manualMonitorTickSource` and `intervalMonitorTickSource`;
  the interval source refuses to construct without an explicit positive
  `intervalMs`.
* `lifecycle_derivation.ts` — `deriveMonitorContinuation` reads canonical events
  alone and yields the pending/in-flight wake; `pendingWakeCauseOf` returns the
  deterministic cause.
* `activation.ts` — `CampaignWakeActivationSignal`, the semantic
  `campaignWakeActivationDigestOf`, `formatCampaignWakeSignal`, and the
  `null`/`recording`/DSH/Pi adapters.
* `delivery_marks.ts` — `SqliteMonitorDeliveryMarkStore` (one table) and
  `shouldDeliver` (attempt-based backoff).
* `driver.ts` — `makeCampaignMonitorDriver`, its narrow deps, the explicit policy
  defaults and the bounded intra-tick progression.
* `index.ts` — the public barrel.

**`src/campaign/prospective.ts`** — added `recordTriggers`, an atomic
multi-trigger batch. `recordTrigger` is unchanged and remains the one-element
case.

**`src/project_operating/`** — `work_mode_profile.ts` gains `monitorRuntime` and
`monitorRuntimeProvenance` capability inputs; `posture.ts` derives MONITOR
availability from the real runtime wiring and reports the provenance reason.

**`src/project_management/service.ts`** — `operatingCapabilities` may be a
provider resolved per read, so availability reflects the wiring that exists now
rather than at construction.

**`src/recipes/registry.ts`** — `monitor.v1` moves `PREVIEW_ONLY → CONDITIONAL`
with an honest limitations list (runtime wiring, host adapter, at-least-once).

**`src/install.ts`** — additive `campaignMonitorScope`, `campaignMonitorTickSource`,
`campaignMonitorActivation`, `campaignMonitorDeliveryMarks`,
`campaignMonitorPolicy` options and the `monitor` runtime member, composed only
when a scope is supplied.

**`src/application/surface.ts`, `src/application/http.ts`** — additive read-only
`MonitorApplicationSurface` and `GET /api/monitor/status`,
`GET /api/monitor/preview`. No HTTP force-tick.

**`test/ac_monitor_runtime.test.ts`** — 30 behavioural tests (mostly negative).
**`scripts/monitor/cold-resume.mjs`** — the cold-resume dogfood.

No change was made to any promotion, Work, Evidence, institution, federation or
management semantic module.

## 2. Delivered behaviour

```text
no scope wired             → no driver, no timer; MONITOR reports UNAVAILABLE
MONITOR + scope, before T  → a tick evaluates and nothing triggers
MONITOR + scope, after T   → ONE tick: WATCH_TRIGGERED → WAKE_STARTED →
                             RECONCILIATION_COMMITTED → host wake delivered
second tick                → no-op; one wake cycle, one signal identity
crash seams                → recovered from canonical history on the next tick
activation failure         → activated:false; canonical wake untouched; cooldown retry
overlapping ticks          → one evaluation, one wake
MONITOR disabled           → no new scan; an in-flight wake still continues
```

## 3. Behaviour comparison with the baseline

| | Baseline `eca28ec` | G10-AC |
| --- | --- | --- |
| MONITOR preference | stored, inert | stored, opt-in runtime binding |
| Scoped Campaign scan | none | linked/allowlist only, DORMANT-only |
| Trigger recording | `recordTrigger`, one event per call | `recordTriggers`, one atomic batch |
| Wake start | only a manual `beginWake` | driver starts one wake from the trigger set |
| Crash after trigger | trigger inert | pending wake recovered from history |
| Crash after wake | wake open forever | same cycle continued |
| Crash after reconciliation | no notification | same signal identity re-derived |
| Host wake | none | at-least-once signal; DSH cold `resume`, Pi `triggerTurn` |
| `monitor.v1` readiness | `PREVIEW_ONLY` | `CONDITIONAL` |
| MONITOR availability | declared | derived from composed runtime wiring |
| Canonical store | — | unchanged; one deployment-local marks table |

## 4. Proof

* `pnpm exec vitest run test/ac_monitor_runtime.test.ts` — **30 passed**.
* Full suite — **156 files / 1528 tests passed**.
* `node scripts/monitor/cold-resume.mjs` — `EXIT=0`, JSON summary:

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

The script also prints the before-T line (`nothing triggered`), the event-type
line, the wake cycle, the lifecycle, the delivered signal id, and the first three
lines of the resumed principal's message. The verbatim output and a field-by-field
reading are in `docs/engineering/audits/G10-AC-COLD-RESUME-EVIDENCE.md`.

## 5. Local gates

```text
pnpm build                                  clean
pnpm exec vitest run                        156 files / 1528 tests passed
pnpm run build:web                          ok (203 modules)
pnpm exec playwright test                   27 passed
node scripts/monitor/cold-resume.mjs        pass=true
```

Baseline was 153 files / 1454 tests. No remote CI run is claimed here; the
canonical checkpoint below records the merge.

## 6. Deviations and honest limitations

* **CF-AC-01 — the CLI has no monitor command.** This CLI composes no Campaign
  store, so there is nothing to tick from the command line; the operator
  force-tick is `installed.monitor.tick()`. The comment at
  `src/application/surface.ts:513-516` says the force-tick "lives on the
  installed runtime and the CLI": the installed-runtime half is true, the CLI
  half is not yet.
* **CF-AC-02 — progression is bounded.** `advanceCampaign` performs one phase
  transition per pass, and the tick loops at most four passes
  (`src/monitor/driver.ts:484-504`). Beyond the per-tick budgets
  (`maxCampaignsPerTick` 10, `maxWakeAdvancesPerTick` 5, `maxActivationsPerTick`
  5, `src/monitor/driver.ts:64-69`) a large scoped set legitimately needs several
  ticks; the tick reports what it did and leaves the rest.
* **CF-AC-03 — no marks store ⇒ always re-deliver.** `deps.marks` is optional;
  without it `shouldDeliver` always returns `deliver: true` for an incomplete
  wake, so the host is re-notified every tick. Idempotent admission makes this
  waste, not corruption.
* **CF-AC-04 — `linkedCampaignMonitorScope` reads every Campaign definition to
  filter.** Acceptable at the current scale, but O(all campaigns) per tick.
* **CF-AC-05 — no real webhook or push connector.** The shipped adapters are
  DSH (`followup` / cold `resume`) and Pi (`triggerTurn`); anything else is an
  embedder-supplied port.
* **`CF-W-06`, `CF-AA-01`, `CF-AA-02` and `CF-X-01` remain deferred** with their
  triggers unchanged; AC found no reachable repro for `CF-W-06` and did not widen
  any trust boundary (`docs/engineering/audits/G10-AC-AB-CARRY-FORWARD-DISPOSITION.md`).

### Scope not delivered in AC

The Project Workspace does **not** render Monitor status, and the operating
history does not yet reference canonical Campaign wake events (§37/§38). The
application surface and the HTTP reads expose everything a UI would need. This is
recorded as `CF-AC-06`, not claimed as delivered.

## 7. Canonical checkpoint

Recorded by the docs-only closure PR after merge.
