# G10-AC — Long-horizon Campaign monitor runtime

Campaign record. Baseline: `eca28ecce8118b21d41debb9af66b472b5ca866a`
(`main` after the G10-AB closure; the work branch is
`experiment/g10-ac-monitor-runtime`).

Specification: `docs/engineering/G10-AC-MONITOR-SPEC.md`.
Pre-implementation audit: `docs/engineering/audits/G10-AC-MONITOR-RUNTIME-ASSESSMENT.md`.

## 1. Stages

| Stage | What was done | Result |
| --- | --- | --- |
| AC0 | Read-only pre-implementation assessment of the baseline: evaluable vs incomplete watch conditions, automatic callers of `scanWatches`/`beginWake`, the `attentionActivation` port, the `WATCH_TRIGGERED → WAKE_STARTED` gap, restart recovery, the crash matrix, and Campaign scoping. | Eight answers recorded with `file:line` evidence; the trigger-recording gap (`recordTrigger` writes one event per call) recorded. See `G10-AC-MONITOR-RUNTIME-ASSESSMENT.md`. |
| AC1 | Campaign scope port and the three narrowed scopes plus the empty default, with no all-campaigns implementation. | `src/monitor/scope.ts`. `AC-N15`. |
| AC2 | Host-neutral tick source: manual and interval; forced explicit `intervalMs`; no hidden default. | `src/monitor/tick_source.ts`. `AC-N12`, supporting-primitive tests. |
| AC3 | Pure crash-recovery derivation of the continuation from canonical history, plus the deterministic pending-wake cause. | `src/monitor/lifecycle_derivation.ts`. `AC-N16`, supporting-primitive test. |
| AC4 | The activation signal, its semantic identity, the default wake text, and the DSH/Pi/null/recording adapters. | `src/monitor/activation.ts`. Golden test, `AC-N18`. |
| AC5 | Deployment-local delivery marks (attempt/backoff) with an explicit non-authoritative contract. | `src/monitor/delivery_marks.ts`. `AC-N19`, `AC-N30`. |
| AC6 | The driver: one automatic path from scoped dormant watches to a host wake, stopping before semantic work; bounded intra-tick progression; in-process coalescing. | `src/monitor/driver.ts`. `AC-N03`, `AC-N20`…`AC-N24`. |
| AC7 | Atomic multi-trigger recording on the prospective service (§14), additive to `recordTrigger`. | `src/campaign/prospective.ts`. `AC-N23`. |
| AC8 | Honest MONITOR posture and recipe binding: availability from real runtime wiring; `monitor.v1` `PREVIEW_ONLY → CONDITIONAL`. | `src/project_operating/posture.ts`, `work_mode_profile.ts`, `src/project_management/service.ts`, `src/recipes/registry.ts`. `AC-N27`…`AC-N29`; `test/ab_operating_posture.test.ts` and `test/s_recipes.test.ts` updated deliberately. |
| AC9 | Opt-in composition and read-only surfaces: install options, `MonitorApplicationSurface`, two read-only HTTP routes, no HTTP force-tick. | `src/install.ts`, `src/application/surface.ts`, `src/application/http.ts`. |
| AC10 | Behavioural suite: 30 tests, mostly negative, over the real services. | `test/ac_monitor_runtime.test.ts`. |
| AC11 | Cold-resume dogfood over a real Campaign store, real Work store and DSH-style activation. | `scripts/monitor/cold-resume.mjs`, `pass: true`. |
| AC12 | Closure: spec, doctrine, host-binding doctrine, assessment, anti-waste, disposition, campaign, delivery, evidence, carry-forward. | This document set; gates green (§5). |

## 2. Write scope

**New — `src/monitor/`** (seven modules, re-exported from `index.ts`):

* `scope.ts` — `CampaignMonitorScopePort`, `empty`/`linked`/`allowlist`/`composed`.
* `tick_source.ts` — `manualMonitorTickSource`, `intervalMonitorTickSource`.
* `lifecycle_derivation.ts` — `deriveMonitorContinuation`, `pendingWakeCauseOf`.
* `activation.ts` — the signal, `formatCampaignWakeSignal`, the four adapters.
* `delivery_marks.ts` — `SqliteMonitorDeliveryMarkStore`, `shouldDeliver`.
* `driver.ts` — `makeCampaignMonitorDriver` and its ports/policy.
* `index.ts` — the public barrel.

**New — other**

* `test/ac_monitor_runtime.test.ts` (30 tests).
* `scripts/monitor/cold-resume.mjs` (the dogfood).

**Modified (content)**

* `src/campaign/prospective.ts` — added `recordTriggers` (atomic batch, §14).
* `src/project_operating/posture.ts` — MONITOR availability from real wiring.
* `src/project_operating/work_mode_profile.ts` — `monitorRuntime` /
  `monitorRuntimeProvenance` capability inputs.
* `src/project_management/service.ts` — `operatingCapabilities` may be a
  provider resolved per read.
* `src/recipes/registry.ts` — `monitor.v1` readiness and limitations.
* `src/install.ts` — `campaignMonitor*` options and the `monitor` runtime member.
* `src/application/surface.ts` — `MonitorApplicationSurface`.
* `src/application/http.ts` — `GET /api/monitor/status`, `GET /api/monitor/preview`.
* `test/ab_operating_posture.test.ts`, `test/s_recipes.test.ts` — expectations
  updated for the new availability/readiness.

`src/cli.ts` shows as modified only because of line-ending normalization
(`git diff src/cli.ts` is empty); **no CLI command was added**.

Working artifacts: `scripts/ac_patch_install.py` and
`scripts/ac_patch_install2.py` are untracked development patch helpers used to
edit `src/install.ts`. They are not product surface and are expected to be removed
before closure.

## 3. Delivered behaviour

```text
default (no scope wired)        → no driver, no timer, nothing runs; MONITOR UNAVAILABLE
MONITOR present + a scope       → a tick scans only DORMANT scoped Campaigns
incomplete condition            → never triggers; the missing port is named
past not_before watch           → WATCH_TRIGGERED + WAKE_STARTED + RECONCILIATION_COMMITTED in one tick
crash after WATCH_TRIGGERED     → next tick recovers the pending wake from history
crash after WAKE_STARTED        → next tick continues the same wake cycle
crash after RECONCILIATION      → next tick re-derives the same signal identity
activation failure              → activated:false; canonical wake untouched; retried after cooldown
activation success              → notification only; the wake is still RECONCILING
overlapping ticks               → one evaluation, one wake
MONITOR disabled mid-flight     → the in-flight wake is still continued, no new scan
```

## 4. Evidence

| Artifact | What it proves |
| --- | --- |
| `test/ac_monitor_runtime.test.ts` (30 tests) | The adversarial set `AC-N01`…`AC-N12`, `AC-N15`…`AC-N24`, `AC-N26`…`AC-N30`, the golden wake path and the activation-failure path, over a real Campaign store, real prospective/production/intervention services and a real `SqliteMonitorDeliveryMarkStore`. |
| `scripts/monitor/cold-resume.mjs` | End-to-end dogfood: before-T tick produces nothing; one tick after T produces `WATCH_TRIGGERED`, `WAKE_STARTED`, `RECONCILIATION_COMMITTED`, `WORLD_RECONCILED`, `COMMITMENTS_REVIEWED`; the persisted principal is cold-resumed exactly once; zero Work events; `pass: true`. |
| `docs/engineering/audits/G10-AC-MONITOR-RUNTIME-ASSESSMENT.md` | What the baseline did not have. |
| `docs/engineering/audits/G10-AC-MONITOR-ANTI-WASTE.md` | No new store, state machine, identity or truth. |
| `docs/engineering/audits/G10-AC-COLD-RESUME-EVIDENCE.md` | The dogfood output, field by field. |
| `docs/engineering/audits/G10-AC-AB-CARRY-FORWARD-DISPOSITION.md` | The incoming carry-forward set, disposed. |

## 5. Gates

```text
pnpm build                                  clean
pnpm exec vitest run                        156 files / 1528 tests passed
pnpm run build:web                          ok (203 modules)
pnpm exec playwright test                   27 passed
node scripts/monitor/cold-resume.mjs        pass=true
```

Baseline `eca28ec` was 153 files / 1454 tests; AC adds `ac_monitor_runtime.test.ts`
and does not touch any other suite except the two expectation updates in §2.

## 6. Baseline comparison

| | Baseline `eca28ec` | G10-AC |
| --- | --- | --- |
| `MONITOR` preference | durable, no execution binding | durable with an opt-in runtime binding |
| Automatic Campaign scan | none | scoped, DORMANT-only, opt-in |
| `WATCH_TRIGGERED` | only via a manual `recordTrigger` (one event) | atomic multi-trigger batch used by the driver |
| `beginWake` after a trigger | nothing called it | the driver starts exactly one wake per trigger set |
| Crash after trigger | the trigger stayed inert | recovered from history on the next tick |
| Crash after wake | the wake stayed open | the same cycle is continued |
| Host notification | none | at-least-once wake signal, DSH/Pi adapters |
| `monitor.v1` readiness | `PREVIEW_ONLY` | `CONDITIONAL` |
| MONITOR effective availability | a bare declaration | derived from composed runtime wiring |
| Canonical store footprint | — | unchanged; one deployment-local marks table |

## 7. Defect found during development

**One phase per tick.** The first driver implementation performed only one phase
transition per `tick()` call, so the spec's golden path — trigger, wake,
reconcile and activate in a single tick after T — did not hold: it needed four
ticks, and the cold-resume dogfood failed on `RECONCILIATION_COMMITTED` and
`delivered`.

*Fix:* a bounded intra-tick loop (`for (let pass = 0; pass < 4; pass += 1)`,
`src/monitor/driver.ts:484`) that re-derives the continuation after each
successful write and continues while it makes progress.

**Follow-on defect: re-delivery per internal pass.** The loop then delivered the
host signal on *every* pass, so one tick could enqueue several identical wake
messages. *Fix:* end the tick at the activation phase — `reachedActivation` breaks
the loop (`src/monitor/driver.ts:500-503`) — so activation is considered once per
tick. Both fixes are exercised by the golden test and the dogfood.

## 8. Honest notes from the implementing subagent

1. **The two-tick shape.** Before the intra-tick loop, the mechanical
   progression genuinely spanned several ticks (one phase each), which is what
   the test/dogfood vocabulary of a "first tick" and a "second tick" originally
   described. With the loop, a single tick completes the progression and the
   second tick is a no-op; the two-tick framing survives in the tests and the
   dogfood as the assertion that the resting state is stable, not as a
   synchronous requirement.
2. **`DIRECT` has no management port to mutate through.** The default posture is
   `DIRECT`, and the driver is given no management seam at all, so "a wake does
   not escalate management" is true by construction rather than by a guard that
   could be weakened. The cost is that a future product need for a wake to
   *request* management escalation would require a new, explicit port.
