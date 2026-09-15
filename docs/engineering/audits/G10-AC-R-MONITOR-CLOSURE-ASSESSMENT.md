# G10-AC-R — Monitor closure assessment (ACR0)

Stage: **Monitor closure** — the runtime the AC stage delivered, made true and visible.
Baseline: `4f5daec1f6e16cd9c923b562ee4141a05fa0a72c`.
Reproducer: `scripts/monitor/acr0-repro.mjs`.
Entering verdict: **PARTIAL** (see `G10-AC-R-MONITOR-CLOSURE-SPEC.md`).

The assessment has two halves. `ACR0-A`…`ACR0-D` are behavioural defects the
reproducer still had to be able to show; `ACR0-E` is the baseline absence check
for the product surface. The reproducer's header states the contract: **before the
fixes every item reads `defect:true`; after the fixes every item reads
`defect:false`.**

## 0. Provenance of the two readings

```text
BEFORE  = the pre-fix reading described by the reproducer's own header contract
          (AC-R-01/02/03/04 all reproduced; the fix author ran it before landing).
AFTER   = the VERBATIM output of `node scripts/monitor/acr0-repro.mjs` in this
          tree (see §6). Every item reads defect:false and the process exits 0.
```

**HONEST:** this closure did not re-run the pre-fix tree. Doing so would require
building the baseline commit `4f5daec1` in a separate worktree with its own
dependency install; the fixes are already in this tree and `git stash`/`checkout`
of product code is outside the closure's write scope. The BEFORE column below is
therefore the reproducer's documented contract, not a transcript produced here.
The AFTER column is a transcript produced here.

## 1. ACR0-A — AC-R-03: a scope-only runtime must not be reported AVAILABLE

A real defect with two halves, and the halves disagreed.

```text
BEFORE
  declaredScopeOnlyAvailability   AVAILABLE
  postureMonitorAvailability      UNAVAILABLE      (under-report)
  defect                          true
AFTER
  monitorComposed                 true
  postureMonitorAvailability      UNAVAILABLE
  postureMonitorReason            scope only: a manual/debug driver at most;
                                  no autonomous monitoring
  declaredScopeOnlyAvailability   CONDITIONAL
  declaredScopeOnlyReason         a monitor runtime is declared without
                                  tick/activation detail; a bare declaration
                                  cannot prove an autonomous runtime
  capabilityStartState            NOT_CONFIGURED
  defect                          false
```

### The root cause the fix found

`src/project_management/service.ts`'s `operatingCapabilitiesOf()` rebuilt the
capability input object from **four fixed fields** instead of forwarding the
caller's declaration. The install DID declare the monitor wiring
(`install.ts` declares `monitorRuntime`, `monitorRuntimeProvenance` and
`monitorRuntimeCapability` on every read), but the rebuild silently dropped
those fields, so the declaration never reached the posture deriver.

The consequence was a genuine two-sided lie, and the honest note reported by the
fix author is that **only one side was reachable at a time**:

* through the **deriver** fed with exactly what the install declares, the
  scope-only composition was presented as `AVAILABLE` (over-claim);
* through the **live install**, the narrowed capability dropped the monitor
  fields entirely, so the posture reported `UNAVAILABLE` for a runtime that
  really was composed (under-report).

The fix is the spread at `src/project_management/service.ts:788-797`: the
caller's declaration is forwarded verbatim and this layer only DEFAULTS the
fields it can infer (`reasoningBranches`, `independentVerifier`,
`monitorConditionSource`, `independentPeer`). Nothing else was rewritten, so no
other capability changed its reading.

After the fix the two halves agree, and `ACR0-A` reports the live install as
`UNAVAILABLE` with the "scope only" reason while the bare *declaration* path is
`CONDITIONAL` ("a bare declaration cannot prove an autonomous runtime"). That is
the intended distinction: a declaration is not a runtime, and a scope-only
composition is not autonomy.

## 2. ACR0-B — AC-R-01: the install must START an explicitly supplied tick source

```text
BEFORE
  fires                 0
  driverStarted         false
  defect                true
AFTER
  fires                 6         (30 ms interval, observed after 200 ms)
  driverStarted         true
  defect                false
```

The composed runtime was inert: `installPalimpsest` built the driver and never
started it, so an operator who supplied a real tick source got no ticks at all
until they found `installed.monitor.start()` themselves. The fix keeps the start
promise at `src/install.ts:1651` (`monitor.ready()`), so a host can await it and a
failure is settled rather than escaping.

## 3. ACR0-C — AC-R-02: dispose must STOP the monitor

```text
BEFORE
  firesBeforeDispose    3
  firesAfterDispose     6          (ticks kept arriving after dispose)
  stillRunning          true
  defect                true
AFTER
  firesBeforeDispose    3
  firesAfterDispose     3          (nothing fired after dispose)
  stillRunning          false
  defect                false
```

**HONEST (reported by the fix author):** at baseline the install never started
the source, so the leak was observable only once something had started it. The
reproducer therefore calls `installed.monitor.start()` explicitly before
`dispose()` — which is exactly the undocumented workaround AC-R-01 describes.
After the fix that call is an idempotent no-op and the same script observes the
stopped source.

The fix is the dispose ordering at `src/install.ts:1776-1785`: settle the startup
promise, `monitor.dispose()` (which stops the tick source and closes the OWNED
marks store), and only then close the stores. A tick callback can therefore never
run against a closed store. See `docs/engineering/MONITOR-INSTALL-LIFECYCLE.md`
§6.

## 4. ACR0-D — AC-R-04: equivalent triggers at different clocks must be canonically identical

```text
BEFORE
  firstClock            2026-09-16T00:00:00Z
  secondClock           2027-12-25T12:34:56Z
  firstEventId          evt-…   (a DIFFERENT id per run)
  secondEventId         evt-…   (different)
  firstCause            monitor_condition_satisfied@<wall clock>
  secondCause           monitor_condition_satisfied@<wall clock>
  defect                true
AFTER
  firstClock            2026-09-16T00:00:00Z
  secondClock           2027-12-25T12:34:56Z
  firstEventId          evt-90c1254679bd2b6ec9445b26
  secondEventId         evt-90c1254679bd2b6ec9445b26   (SAME)
  firstCause            monitor_condition_satisfied
  secondCause           monitor_condition_satisfied
  defect                false
```

The old cause interpolated the wall clock, so two logically identical triggers
minted **two different canonical events** — the same condition would accumulate a
new `WATCH_TRIGGERED` per clock tick. The cause is now the constant
`MONITOR_TRIGGER_CAUSE` (`src/monitor/driver.ts:124`); the canonical payload
carries only `{ watchId, cause }`, and the clock survives only in the
non-canonical outcome `detail`.

## 5. ACR0-E — the baseline absence check (AC-R-05/AC-R-06)

This item is never a defect; it reports whether the product surface exists.

```text
BEFORE                                  AFTER
  workspaceRendersMonitor   false         true
  webFileCount              16            16
  operatingHistoryReferencesCampaignEvents
                            false         true
```

Before the closure, `web/src/**` contained no monitor text at all and
`src/project_operating/history.ts` contained no reference to
`WATCH_TRIGGERED`/`WAKE_STARTED`. Both are now true.

### AC-R-05 — the workspace Monitor card

Delivered as its OWN Project Workspace tab (`Monitor`), not as a section inside
the Management tab: the Management tab is the two-axis surface (Work Mode ⊥
management involvement, `TWO_AXIS_SENTENCE`) and folding a third, non-management
concern into it would break the reading it exists for. The card renders the Work
Mode PREFERENCE and the LIVE RUNTIME state as two separate sections
(`monitor-preference-section`, `monitor-runtime-section`), the tick source, the
host-wake answer, the scoped/dormant/watch/in-flight counts, last tick, last
activation, the incomplete reason, and a read-only preview block that states
visibly that it never ticks. When the status route is unavailable it renders
`monitor-unavailable` ("No monitor runtime is wired for this installation … No
runtime state, campaign count, tick source or activation is fabricated here")
instead of any number.

### AC-R-06 — the operating history references canonical Campaign wake events

Delivered at the data layer: a new DERIVED entry kind `campaign_wake`
(`src/project_operating/history.ts:29`, `:265-284`), a first-party, project-linked
source (`linkedCampaignWakeEventSource`, `:132-163`) that mirrors
`linkedCampaignMonitorScope`, and a `campaignWakeEvents` count in `counts` (`:185`).
An entry carries the campaign id, the canonical event id, the event type and an
ordering key — **no Campaign payload** (no watch condition, no cause, no
commitment, no hypothesis, no reconciliation report). The Project Workspace
renders the references (`monitor-wake-history-section`).

**Residual (recorded, not hidden):** the bounded management service owns no
Campaign store, so it receives the references through an injected read-only seam
(`src/project_management/service.ts:123`, `:881-887`). `installPalimpsest` does
NOT yet pass that seam (it is outside this closure's write scope), so a live
install's operating history references ZERO Campaign events and says so. The
derived read, the first-party source and the rendering are complete and proven;
the install-level wiring is carried forward as `CF-AC-R-01` in
`G10-AC-R-CARRY-FORWARD.md`.

## 6. Verbatim reproducer output (AFTER, this tree)

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

`webFileCount` is 16 in both phases, so the `workspaceRendersMonitor` flip is
about content, not about files being added.

## 7. One further defect found by this closure

`ACR0-A`…`ACR0-E` did not cover the app surface's own composition. While proving
ACR-N19, this closure found that `makePalimpsestApplicationSurface` declared
`MonitorApplicationSurface` and accepted `deps.monitor`, but **never mapped it
onto the returned surface** — so `installed.application.monitor` was always
`undefined` and `GET /api/monitor/status` / `GET /api/monitor/preview` always
answered **501** ("the monitor surface is not configured for this installation"),
even for an install that really composed a running monitor.

```text
before    installed.application.monitor   undefined
          GET /api/monitor/status         501
after     installed.application.monitor   present (status + preview)
          GET /api/monitor/status         200
          GET /api/monitor/preview        200
```

This is why the product half of the closure was impossible before it was fixed:
the Monitor tab could not have shown anything but the honest-absence state on any
install. The mapping is at `src/application/surface.ts:1105-1112`, `:1180`, and the
surface discovery route now reports the face (`src/application/http.ts:151`).
Guarded by `ACR-N19`, `ACR-N26` and `E2E-PROJECT-03`.

## 8. Honest limitations of this assessment

* The BEFORE column is a contract, not a transcript (§0).
* `ACR0-E` is a **text-presence** check. It proves the words exist in the named
  files; it does not prove the rendering. The rendering is proven by
  `e2e/project-workspace.spec.ts` (E2E-PROJECT-03), which asserts the section, the
  two separate readings and the "never ticks" statement in a real browser.
* The Campaign plane records no wall clock. A derived history entry for a
  Campaign wake event therefore cannot carry an instant; `at` is the canonical
  chain position (`campaign-seq:<n>`), documented at
  `src/project_operating/history.ts:84-113` and labelled as such in the UI. The
  consequence — campaign-wake entries sort after every dated entry — is stated
  in `G10-AC-R-MONITOR-CLOSURE-DELIVERY.md` §6 rather than hidden.
* `monitor.v1` stays `CONDITIONAL`, so the runtime is still a conditional
  capability even when it is running (`ACR-N23`).
