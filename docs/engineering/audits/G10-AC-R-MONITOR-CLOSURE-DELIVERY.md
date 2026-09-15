# G10-AC-R — Monitor closure delivery report

Stage: **Monitor closure**.
Baseline: `4f5daec1f6e16cd9c923b562ee4141a05fa0a72c`.
Spec: `docs/engineering/G10-AC-R-MONITOR-CLOSURE-SPEC.md`.
Campaign record: `docs/engineering/G10-AC-R-MONITOR-CLOSURE-CAMPAIGN.md`.

## 1. What changed, per module

**`src/monitor/driver.ts`** — lifecycle truth for the ONE existing driver:
`MONITOR_START_STATES`, the structural `MonitorRuntimeCapability`, the shared
`monitorAvailabilityOf` re-export, the constant `MONITOR_TRIGGER_CAUSE`, the
single `beginStart()` orchestration shared by `start()`/`ready()`, the
stop/dispose ordering, and `capability()` as a live read. The evaluation
pipeline, the budgets and the intra-tick progression are unchanged.

**`src/monitor/activation.ts`** — the wake signal stays semantically identified
(no clock, no attempt counter), which is what makes a redelivery the same signal
rather than a second one.

**`src/project_operating/work_mode_profile.ts`** — the structural capability view
(`MonitorRuntimeCapabilityView`) plus the declared/live/provenance capability
inputs. No import of the monitor module anywhere in `project_operating`.

**`src/project_operating/posture.ts`** — the ONE availability table and
`withMonitorRuntimeCapability`, which replaces only the MONITOR row on a derived
view. `deriveEffectiveModeStatus` keeps the declared fields as fallbacks but no
longer treats a bare `monitorRuntime: true` as availability.

**`src/project_operating/history.ts`** — the `campaign_wake` derived entry kind,
`CampaignWakeEventRef`, `campaignChainPositionOf`, the first-party
`linkedCampaignWakeEventSource` (mirroring `linkedCampaignMonitorScope`), and the
`campaignWakeEvents` count. Nothing is persisted and no payload is copied.

**`src/project_management/service.ts`** — `operatingCapabilitiesOf()` SPREADS the
caller's declaration instead of rebuilding four fields (the AC-R-03 root cause),
and `operatingHistory()` reads Campaign wake references through an injected
read-only seam, marking them resolvable only when the seam returned them.
Nothing else in the file changed behaviour.

**`src/install.ts`** — default delivery marks with an explicit `false` opt-out,
install-initiated startup with the promise kept, and the dispose ordering. (Core
fix pass; frozen by the closure pass.)

**`src/application/surface.ts`** — the DECLARED `MonitorApplicationSurface` is now
actually composed from `deps.monitor`, which had been a dead mapping: the two read
routes answered 501 on every install. The face has `status()` and `preview()` and
no tick.

**`src/application/http.ts`** — the surface-discovery route reports `monitor`.

**`web/src/api.ts`** — typed `monitorStatus()` / `monitorPreview()` helpers and the
honest minimal interfaces for the two server shapes.

**`web/src/project_workspace/ProjectWorkspaceView.tsx`** — a Monitor TAB (not a
Management-tab section: the Management tab is the two-axis surface and must stay
readable) with the Work Mode preference and the runtime as two separate sections,
the tick source, the host-wake answer, delivery marks, the scoped/dormant/watch/
in-flight counts, last tick, last activation, the incomplete reason, a compact
read-only preview that says it never ticks, and the operating history's Campaign
wake references.

**`e2e/project-workspace.spec.ts`** — the workspace install now wires a real
monitor scope over a real linked Campaign (no tick source), and E2E-PROJECT-03
asserts the section, the two separate readings, the availability and its reason,
the tick source/host wake, the counts, the preview's "never ticks" statement, the
absolutely absent force-tick control, and the empty wake-reference state. The
setup also persists a MONITOR preference through the operator path.

**Tests** — `test/ac_r_product.test.ts` (new, 11 cases), `test/ac_r_install_lifecycle.test.ts`
(new, 15 cases), `test/ac_monitor_runtime.test.ts` (updated by the core pass),
`test/ab_operating_posture.test.ts` (+`campaignWakeEvents: 0` on an exact `counts`
assertion, with an in-file justification).

**Docs** — this report, the spec, the campaign record, the assessment, the
carry-forward disposition, the anti-waste audit, the product-claims audit, the
install-lifecycle evidence, the new carry-forward list, and
`MONITOR-INSTALL-LIFECYCLE.md`.

## 2. Delivered behaviour

```text
composed ≠ running          startState and started are separate readings; RUNNING
                            only after the source's start() resolves
install owns startup        a supplied tick source is started by installPalimpsest
                            and `ready()` is awaitable
honest failure              a throwing source yields FAILED + the error text and
                            UNAVAILABLE; ready() never rejects
dispose ordering            settle startup → stop source → close owned marks →
                            close stores; no callback runs against a closed store
delivery marks              default | supplied | disabled, reported verbatim
one availability table      five partial wirings, five honest answers
product surface             the Monitor tab renders preference ≠ runtime, the
                            runtime facts and a read-only "what would Monitor do
                            now?" preview that says it never ticks
absent runtime              an explicit absence statement, never a fabricated
                            number (501 discovered and rendered as absence)
history                     campaign_wake entries reference canonical Campaign
                            wake events; project-scoped; payload-free; counted
read-only routes            GET status/preview only; POST refused 400
```

## 3. Baseline comparison

| | AC baseline `4f5daec` | G10-AC-R |
| --- | --- | --- |
| Install startup | supplied source never fired | install starts it; promise kept |
| Dispose | monitor kept firing after dispose | stopped before stores close |
| False AVAILABLE | scope-only read `AVAILABLE` through the deriver while the live install under-reported | one table; `CONDITIONAL` for a declaration, `UNAVAILABLE` for scope-only |
| Trigger cause | wall clock inside the canonical payload | constant cause; identical identity across clocks |
| Default marks | none | default, with an explicit opt-out |
| Monitor read surface | declared, wired, never composed (always 501) | composed; 200; reported by the discovery route |
| Workspace | no Monitor rendering | a Monitor tab with two readings and a read-only preview |
| Operating history | no Campaign references | `campaign_wake` references, project-scoped |
| Test count | 156 files / 1528 tests (AC tree) | 158 files / 1554 tests |
| Browser E2E | 27 passed | 28 passed |

## 4. Proof

```text
pnpm build                                   clean
pnpm exec vitest run --maxWorkers=2          158 files / 1554 tests passed
pnpm exec vitest run test/ac_r_product.test.ts        11 passed
pnpm exec vitest run test/ac_r_install_lifecycle.test.ts  15 passed
pnpm run build:web                           ok (203 modules)
pnpm exec playwright test                    28 passed
node scripts/monitor/acr0-repro.mjs          anyDefect=false, EXIT=0
node scripts/monitor/cold-resume.mjs         pass=true, EXIT=0
```

The ACR0 reproducer now reads `defect:false` on every item and `true/true` on the
E presence check:

```json
{
  "items": [
    { "id": "AC-R-03", "postureMonitorAvailability": "UNAVAILABLE", "declaredScopeOnlyAvailability": "CONDITIONAL", "defect": false },
    { "id": "AC-R-01", "fires": 6, "driverStarted": true, "defect": false },
    { "id": "AC-R-02", "firesBeforeDispose": 3, "firesAfterDispose": 3, "stillRunning": false, "defect": false },
    { "id": "AC-R-04", "firstEventId": "evt-90c1254679bd2b6ec9445b26", "secondEventId": "evt-90c1254679bd2b6ec9445b26", "defect": false },
    { "id": "AC-R-05/06", "workspaceRendersMonitor": true, "operatingHistoryReferencesCampaignEvents": true, "defect": false }
  ],
  "anyDefect": false
}
```

The cold-resume dogfood is unchanged by the closure and still passes:
`triggeredWatchIds ["w-1"]`, `wakeStarted 1`, `wakeCycleId "wc-1"`, `lifecycle
"RECONCILING"`, `activationPhase "RECONCILIATION_READY"`, `delivered true`,
`coldResumed true`, `workEventsCreated 0`, `pass true`.

## 5. Local gates

```text
pnpm build                                  clean
pnpm exec vitest run --maxWorkers=2         158 files / 1554 tests passed
pnpm run build:web                          ok (203 modules)
pnpm exec playwright test                   28 passed
node scripts/monitor/acr0-repro.mjs         anyDefect=false, EXIT=0
node scripts/monitor/cold-resume.mjs        pass=true, EXIT=0
```

Baseline for comparison: 153 files / 1454 tests at the AC baseline, 156 files /
1528 tests at the AC tree. No remote CI run is claimed here.

## 6. Deviations and honest limitations

* **The Campaign plane records no wall clock.** `CampaignEvent` carries
  `(campaignId, seq, eventId, type, payload, chainDigest)` and the producers never
  read a clock for a write. A derived history entry therefore cannot carry an
  instant: `at` is the canonical chain position (`campaign-seq:<n>`), documented
  in code and labelled "Campaign chain position N (the Campaign plane records no
  wall clock)" in the UI. Consequence: campaign-wake entries sort after every
  dated entry in the shared chronological sort. The alternative — a clock read —
  was refused deliberately.
* **`CF-AC-R-01` (new):** the install does not wire the Campaign wake-event seam
  into the management service, so a live install's operating history references
  ZERO Campaign events (and says so, with a count of 0 and an explicit empty
  state). The derived read, the first-party source and the rendering are complete
  and proven by ACR-N17/N18. Closing it requires one line in
  `installPalimpsest`, which the closure's write scope excluded.
* **`web/tsconfig.json` does not typecheck clean, and did not before this
  change.** `web/src/MultiGraphView.tsx:68` (`JSX` namespace) and
  `web/src/project_workspace/ProjectWorkspaceView.tsx:903` (`<Muted testId=…>`,
  a primitive without a `testId` prop) fail. `pnpm build` does not cover `web/**`
  and neither error affects `pnpm run build:web` (which transpiles, 203 modules)
  or the browser suite. The closure added no new web type error and left these two
  alone to keep the diff scoped — recorded here rather than silently ignored.
* **The workspace reads status and preview in two round trips.** A tick between
  them can make the preview describe a slightly later state; the card labels it
  "what a tick WOULD do".
* **`monitor.v1` stays `CONDITIONAL`** even for a running runtime: a conditional
  deployment binding is not a production-ready claim.
* **The whole monitor card is observation-only.** It can start nothing, stop
  nothing and tick nothing; that is the design, and it means the UI cannot be used
  to demonstrate a runtime to an operator who has not wired one.
* The AC carry-forward items this stage does not touch (`CF-AC-01` CLI,
  `CF-AC-02` budgets/scale, `CF-AC-04` O(all Campaigns) linked scope, `CF-AC-05`
  connectors, `CF-AA-02`, `CF-W-06`, `CF-X-01`) keep their triggers; see
  `G10-AC-R-AC-CARRY-FORWARD-DISPOSITION.md`.

### Post-closure correction

`CF-AC-R-01` (a live install passing no wake-event seam, so the operating history
referenced zero Campaign events) is **CLOSED**, not carried: the install now wires
the seam through the same project-linked derivation the monitor scope uses. See the
correction recorded in `G10-AC-R-CARRY-FORWARD.md` for the verified gates.

## 7. Canonical checkpoint

Recorded after merge.

```text
baseline                        4f5daec1f6e16cd9c923b562ee4141a05fa0a72c
implementation commit           0341db5913127d3895718f67914a0c370c2dc1f0
  "fix(g10-ac-r): monitor install lifecycle, truthful availability & product closure"
pull request                    #101  experiment/g10-ac-r-closure -> main
PR checks                       run 35036345424  attempt 1  e2e pass / unit pass
merged commit (canonical main)  d83f3098c6101538cff891b65150be1e94137f43
  "Merge pull request #101 from orangeofcarl0-sys/experiment/g10-ac-r-closure"
tree identity                   git diff 0341db5 d83f309  ->  EMPTY (identical trees)
canonical main run              35036456329  attempt 1  conclusion: success
```

All remote runs concluded green on **attempt 1**; no rerun was required.

### Reproducing the local gate

```bash
pnpm install
pnpm build
pnpm exec vitest run                    # 158 files / 1554 tests
pnpm run build:web
pnpm exec playwright test               # 28 passed
node scripts/monitor/acr0-repro.mjs     # anyDefect=false (AC-R-01..04 all defect:false)
node scripts/monitor/cold-resume.mjs    # pass=true, workEventsCreated=0
```


Recorded by the docs-only closure PR after merge.
