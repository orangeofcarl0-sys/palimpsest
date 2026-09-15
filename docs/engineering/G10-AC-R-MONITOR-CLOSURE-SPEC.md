# G10-AC-R — Monitor closure specification

Stage: **Monitor closure** — make the AC monitor runtime true, visible and
disposed, without widening it.
Baseline: `4f5daec1f6e16cd9c923b562ee4141a05fa0a72c`.
Entering verdict: **PARTIAL**.
Deliverables: `G10-AC-R-MONITOR-CLOSURE-DELIVERY.md`,
`G10-AC-R-MONITOR-CLOSURE-CAMPAIGN.md`, `G10-AC-R-MONITOR-CLOSURE-ASSESSMENT.md`,
`G10-AC-R-INSTALL-LIFECYCLE-EVIDENCE.md`, `G10-AC-R-MONITOR-PRODUCT-CLAIMS.md`,
`G10-AC-R-MONITOR-CLOSURE-ANTI-WASTE.md`, `MONITOR-INSTALL-LIFECYCLE.md`.

## 1. Why AC entered PARTIAL

**Section numbering note.** This document numbers its own sections 1…9. Where a
requirement is cited from the closure brief it is written as `brief §N`; the two
product requirements the AC carry-forward recorded as the monitor spec's §37 and
§38 are the brief's §11–§12 (the workspace Monitor card) and §13 (the operating
history's Campaign references). The forbidden-claims list is the brief's §21.

AC delivered a real, opt-in, authority-free monitor runtime and then left four
behavioural defects and one product absence in it. The entering verdict was
PARTIAL because the delivered claims were not all true of the delivered code:

```text
AC-R-01  installPalimpsest never STARTED a supplied tick source.
         The documented product path ("wire a source") produced zero ticks.
AC-R-02  dispose() never STOPPED the monitor; a started source kept firing.
AC-R-03  a scope-only composition was reported AVAILABLE by the posture deriver,
         while the live install under-reported the same composition.
AC-R-04  the canonical trigger cause interpolated the wall clock, so logically
         identical triggers minted different canonical event ids.
AC-R-05  (brief §11–§12, AC spec §37) the Project Workspace did not render Monitor
         status.
AC-R-06  (brief §13, AC spec §38) the operating history did not reference
         canonical Campaign wake events.
```

Entering the stage, PARTIAL was the honest verdict, not a failure of the AC
design: the firewalls held, but the shipped artefact did not behave as its own
documentation claimed.

## 2. Firewalls (unchanged, re-asserted)

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
OperatingHistoryEntry  ≠ HistoryStore       ≠ canonical event (a REFERENCE)
MonitorCard            ≠ runtime control    ≠ tick authority
Preview                ≠ Tick               ≠ dry-run that writes
```

No firewall was relaxed. Nothing in this stage grants a new authority, mints an
identity, or adds a canonical store.

## 3. ACR0 items

| ID | Requirement |
| --- | --- |
| ACR0-A | AC-R-03: a scope-only runtime must NOT be reported `AVAILABLE`, and the deriver and the live install must agree. |
| ACR0-B | AC-R-01: `installPalimpsest` must start an explicitly supplied tick source. |
| ACR0-C | AC-R-02: `dispose()` must stop the monitor, and no tick may run afterwards. |
| ACR0-D | AC-R-04: equivalent triggers at different clocks must have identical canonical identity. |
| ACR0-E | AC-R-05/06 baseline absence: the workspace renders no Monitor and the operating history references no Campaign event (never a defect; a presence reading). |

Reproducer: `scripts/monitor/acr0-repro.mjs` (exit 0 when every item is
`defect:false` and E is consistent). Readings in
`G10-AC-R-MONITOR-CLOSURE-ASSESSMENT.md`.

## 4. The fixes

| # | Fix | Where |
| --- | --- | --- |
| F1 | The capability resolver SPREADS the caller's declaration instead of rebuilding a four-field object, so the install's monitor wiring reaches the deriver. | `src/project_management/service.ts:788-797` |
| F2 | One availability table over a LIVE `MonitorRuntimeCapability`; `FAILED ⇒ UNAVAILABLE`, scope-only ⇒ `UNAVAILABLE`, exactly one of tick/activation ⇒ `CONDITIONAL`, tick+activation+RUNNING ⇒ `AVAILABLE`. | `src/project_operating/posture.ts:125-173` (re-exported by `src/monitor/driver.ts:136`) |
| F3 | The install INITIATES startup and keeps the promise (`monitor.ready()`), so a host can await it. | `src/install.ts:1651` |
| F4 | Dispose ordering: settle the startup promise → stop the tick source → close owned marks → only then close stores. | `src/install.ts:1776-1785`, `src/monitor/driver.ts:812-825` |
| F5 | The canonical trigger cause is a constant; the clock survives only in the non-canonical detail. | `src/monitor/driver.ts:124`, `:437` |
| F6 | The install applies the live capability to the derived posture (the seam could not carry it). | `src/install.ts:1557-1564`, `src/project_operating/posture.ts:198-219` |
| F7 | Default delivery marks for a first-party runtime, with an explicit `false` opt-out and a verbatim `default`/`supplied`/`disabled` report. | `src/install.ts:1579-1600` |
| F8 | A DERIVED `campaign_wake` history entry kind plus the project-linked first-party source. | `src/project_operating/history.ts:29`, `:65-163`, `:265-294` |
| F9 | The bounded management service reads Campaign wake references through an injected read-only seam, marks them resolvable only when the seam returned them, and reports zero when no seam is wired. | `src/project_management/service.ts:123`, `:881-887`, `:913-916` |
| F10 | The Monitor card: a separate Project Workspace tab with two separate readings, the runtime facts, the read-only preview and the wake-reference list. | `web/src/project_workspace/ProjectWorkspaceView.tsx:89`, `:971-1250`, `web/src/api.ts:1129-1215` |
| F11 | The declared monitor application surface is actually composed, and the discovery route reports it. | `src/application/surface.ts:1105-1112`, `:1180`; `src/application/http.ts:151` |

## 5. Adversarial list

`ACR-N01`…`ACR-N30`. Coverage is stated per row: a dedicated test id, or
`structural` when no test can observe it directly (matching the AC spec's own
convention for `AC-N13`/`AC-N14`/`AC-N25`).

`test/ac_r_install_lifecycle.test.ts` (15 cases) covers `ACR-N01`…`ACR-N14` plus
the partial-wiring matrix.
`test/ac_r_product.test.ts` (11 cases) covers `ACR-N15`…`ACR-N20`, `ACR-N23`,
`ACR-N26` and `ACR-N18b`.
`e2e/project-workspace.spec.ts` E2E-PROJECT-03 covers the rendering half of
`ACR-N15`, `ACR-N22` and `ACR-N25`.

| ID | Requirement | Coverage |
| --- | --- | --- |
| ACR-N01 | A scope-only composition is not AVAILABLE; the posture row and `startState` are honest. | ACR-N01 |
| ACR-N02 | Tick-only is CONDITIONAL and names the missing host wake adapter. | ACR-N02 |
| ACR-N03 | Activation-only is CONDITIONAL and names the missing tick source. | ACR-N03 |
| ACR-N04 | A fully wired, started runtime IS AVAILABLE and the reason names the wiring. | ACR-N04 |
| ACR-N05 | A failed start is UNAVAILABLE and the reason carries the error text. | ACR-N05 |
| ACR-N06 | The standard install starts an explicitly supplied tick source. | ACR-N06 |
| ACR-N07 | `await installed.dispose()` stops the monitor. | ACR-N07 |
| ACR-N08 | No callback runs after stores close; a second dispose is a no-op. | ACR-N08 |
| ACR-N09 | The null activation adapter never claims an autonomous wake. | ACR-N09 |
| ACR-N10 | Default delivery marks suppress inside the cooldown. | ACR-N10 |
| ACR-N11 | Marks loss stays semantically safe (same signal id, one wake). | ACR-N11 |
| ACR-N12 | The trigger cause has no wall-clock text. | ACR-N12 |
| ACR-N13 | Equivalent triggers at different clocks have identical canonical identity. | ACR-N13 |
| ACR-N14 | Dynamic evaluation detail stays non-canonical. | ACR-N14 |
| ACR-N15 | The preferred posture and the runtime state are two INDEPENDENT readings; a preferred MONITOR with no runtime is UNAVAILABLE. | ACR-N15 (data) + E2E-PROJECT-03 (rendering) |
| ACR-N16 | A throwing tick source yields `startState === "FAILED"` with a non-empty `startError`, and the posture is not AVAILABLE. | ACR-N16 |
| ACR-N17 | A woken Campaign appears in the operating history as `campaign_wake` entries naming `WATCH_TRIGGERED`/`WAKE_STARTED`, each with a `campaignEventId` ref and no copied payload. | ACR-N17 |
| ACR-N18 | Only the LINKED Campaign's events appear, even when another Campaign has its own canonical trigger. | ACR-N18, ACR-N18b |
| ACR-N19 | The preview is read-only: no Campaign event and no Work event changes. | ACR-N19 |
| ACR-N20 | No HTTP force-tick: both monitor routes are POST-refused and no tick-like route exists. | ACR-N20 |
| ACR-N21 | The AB history planes are unchanged by the new kind (same work-mode / management activity entries, exact counts). | `test/ab_operating_posture.test.ts` (exact `counts` assertion) |
| ACR-N22 | The Monitor card shows the preference and the runtime separately and offers no runtime control. | E2E-PROJECT-03 |
| ACR-N23 | `monitor.v1` readiness remains `CONDITIONAL`. | ACR-N23, ACR-N23b |
| ACR-N24 | The `campaign_wake` entry copies no Campaign payload (only id, type, ordering key). | ACR-N17 (key-shape assertion) |
| ACR-N25 | The workspace reaches no store: it reads only the typed routes. | structural (`web/src` imports no `src/**` module; `web/src/api.ts` is fetch-only) + E2E-PROJECT-03 |
| ACR-N26 | An unwired installation reports the ABSENCE (501) and never a fabricated number. | ACR-N26 |
| ACR-N27 | A monitor PREFERENCE alone creates no Campaign, Watch, Work or timer. | `test/ac_monitor_runtime.test.ts` AC-N01/N02/N12 |
| ACR-N28 | The delivered runtime stays opt-in: no scope ⇒ no driver, no timer, no HTTP face. | ACR-N26 + AC-N12 |
| ACR-N29 | No second monitor driver and no second Campaign truth exist. | structural (`G10-AC-R-MONITOR-CLOSURE-ANTI-WASTE.md` §2) |
| ACR-N30 | No monitor semantic store and no authority plane were added. | structural (`G10-AC-R-MONITOR-CLOSURE-ANTI-WASTE.md` §3) |

## 6. Machine invariants

`MCL-A01`…`MCL-A30`, grouped.

**Group A — Composition honesty (`MCL-A01`…`MCL-A05`)**

```text
MCL-A01  The install STARTS a supplied tick source and keeps the promise.
MCL-A02  dispose() settles the startup, stops the source, closes owned marks,
         and only then releases stores.
MCL-A03  No callback can run after dispose: beginStart refuses once disposed.
MCL-A04  deliveryMarks is reported verbatim as default | supplied | disabled.
MCL-A05  The installed posture's MONITOR row is recomputed from the LIVE driver
         capability on every read; it can never be a construction-time snapshot.
```

**Group B — Availability truth (`MCL-A06`…`MCL-A11`)**

```text
MCL-A06  Exactly ONE availability table exists, shared by the driver and the
         posture (posture.ts:125-173, re-exported by driver.ts:136).
MCL-A07  startState FAILED ⇒ UNAVAILABLE, and the reason carries startError.
MCL-A08  Scope only (no tick, no activation) ⇒ UNAVAILABLE ("scope only").
MCL-A09  Exactly one of tick/activation ⇒ CONDITIONAL, naming what is missing.
MCL-A10  Tick + activation + RUNNING ⇒ AVAILABLE.
MCL-A11  `started` becomes true ONLY after the source's start() RESOLVES.
```

**Group C — Product surface (`MCL-A12`…`MCL-A18`)**

```text
MCL-A12  The workspace shows the PREFERENCE and the RUNTIME as two separate
         sections; neither is derived from the other.
MCL-A13  An absent monitor surface renders an explicit absence statement, never
         a fabricated number (monitor-unavailable).
MCL-A14  No HTTP force-tick route exists; POST to either read route is refused.
MCL-A15  The workspace card offers no tick/force/runtime control.
MCL-A16  preview() performs no write of any kind (no canonical event, no mark).
MCL-A17  The tick source and the host-wake answer are reported from the wiring
         that exists, with the availability reason verbatim.
MCL-A18  `GET /api/application/surfaces` reports `monitor` truthfully.
```

**Group D — History references (`MCL-A19`…`MCL-A23`)**

```text
MCL-A19  `campaign_wake` is a DERIVED entry kind; it is never persisted.
MCL-A20  Only WATCH_TRIGGERED, WAKE_STARTED, RECONCILIATION_COMMITTED and
         WAKE_CYCLE_COMPLETED are admitted.
MCL-A21  One entry per admitted event: ref = "<campaignId>:<campaignEventId>",
         actor = "campaign:<campaignId>", canonicalOutcomeRefs =
         ["campaign_event:<campaignEventId>"].
MCL-A22  incompleteCanonicalRef follows the SAME resolvable-ref rule as every
         other entry kind.
MCL-A23  counts.campaignWakeEvents equals the number of referenced events, and
         the entries join the existing chronological sort.
```

**Group E — Scope (`MCL-A24`…`MCL-A26`)**

```text
MCL-A24  Only Campaigns whose own record LINKS this project are referenced.
MCL-A25  A Campaign that links no project is excluded, even with a canonical
         trigger of its own.
MCL-A26  With no Campaign seam wired the history references ZERO events; it
         never scans a shared store and never invents an event.
```

**Group F — Anti-waste (`MCL-A27`…`MCL-A30`)**

```text
MCL-A27  No second monitor driver: one driver, one evaluation pipeline.
MCL-A28  No second Campaign truth: the Campaign store owns every wake event.
MCL-A29  No monitor semantic store: the only table is the deployment-local
         delivery marks.
MCL-A30  No semantic scheduler and no authority plane: the runtime is started by
         the install, stopped by dispose, and never grants or records authority.
```

## 7. PASS criterion (quoted)

The AC PASS criterion is unchanged and is re-established by this closure:

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

The closure's own PASS condition adds the product half, and is met:

```text
delivered runtime          install owns startup and dispose; no late tick
availability               derived from LIVE wiring, never from a declaration
product surface            workspace renders preference ≠ runtime, tick source,
                           host wake, scan counts, last tick/activation, the
                           incomplete reason, and a read-only preview that says
                           it never ticks
history                    operating history references canonical Campaign wake
                           events as references only, project-scoped
read-only routes           GET status/preview only; POST is refused
```

## 8. PARTIAL conditions

PARTIAL if any of the following holds. None does.

```text
a MONITOR preference starts a scheduler, a timer or a background scan on its own;
a composed-but-unstarted driver is presented as running;
a scope-only composition is presented as AVAILABLE;
a bare WIRING DECLARATION is presented as a proven runtime;
a failed start is presented as anything other than UNAVAILABLE with its error;
a tick creates Work, a compiled/admitted next action, a commitment, a boundary
  or Proof;
preview writes anything, including a delivery mark;
an HTTP route force-ticks, or a UI control ticks;
an unavailable monitor surface is rendered as a number;
the workspace derives the runtime reading from the preference (or the reverse);
a history entry copies Campaign payload instead of referencing it;
a history entry references a Campaign that does not link this project;
a Campaign event without a canonical timestamp is given an invented instant;
delivery is described as exactly-once, or a delivery mark as semantic truth.
```

## 9. Series invariant

```text
One major stage at a time; close its invariants; carry real leftovers forward.
```

AC delivered the runtime; AC-R makes it true, visible and disposable and carries
the leftovers it cannot honestly close:
`CF-AC-R-01` (the install does not yet wire the Campaign wake-event seam into the
management service), plus the still-deferred AC items. The next stage is chosen
from real product need in `G10-AC-R-CARRY-FORWARD.md`; nothing here preselects it.
