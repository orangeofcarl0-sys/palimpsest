# G10-AC-R — AC carry-forward disposition

Every AC item is disposed below against what the closure actually delivered. Two
are **CLOSED_IN_AC_R**; the four defects AC left behind
(`AC-R-01`…`AC-R-04`) are **CLOSED**; the rest keep their triggers unchanged.
Nothing is closed by assertion: each closure names the code and the test that
guards it.

## 1. Closed in AC-R

| ID | Disposition | Evidence |
| --- | --- | --- |
| **CF-AC-03** | **CLOSED_IN_AC_R** | `deps.marks` was optional, so with no marks store the host was re-notified on every tick. A first-party runtime now gets a DEFAULT deployment-local marks store at the derived operating path when the host supplied neither a store nor `false` (`src/install.ts:1579-1600`), and `status().deliveryMarks` reports `default` / `supplied` / `disabled` verbatim. The opt-out is explicit (`campaignMonitorDeliveryMarks: false`). Guarded by `ACR-N10` (one delivery inside the cooldown), `ACR-N11` (marks loss is semantically safe: same `signalId`, one `WAKE_STARTED`) and the workspace's `monitor-delivery-marks` field. |
| **CF-AC-06** | **CLOSED_IN_AC_R** | Split into its two halves. **Workspace:** a Monitor TAB in the Project Workspace renders the Work Mode preference and the live runtime as two separate readings, the tick source, the host-wake answer, delivery marks, scoped/dormant/watch/in-flight counts, last tick, last activation, the incomplete reason, and a read-only preview that states it never ticks — with an explicit "no monitor runtime is wired for this installation" state instead of any fabricated number (`web/src/project_workspace/ProjectWorkspaceView.tsx:971-1250`, `web/src/api.ts:1122-1215`). **History:** the derived operating history gained a `campaign_wake` entry kind that references canonical `WATCH_TRIGGERED` / `WAKE_STARTED` / `RECONCILIATION_COMMITTED` / `WAKE_CYCLE_COMPLETED` events, project-scoped, payload-free, with a `campaignWakeEvents` count (`src/project_operating/history.ts`), and the workspace renders the references. Guarded by `ACR-N15`…`ACR-N20`, `ACR-N26`, `ACR-N17`/`N18` and E2E-PROJECT-03. **Residual, recorded not hidden:** see §2. |
| **AC-R-01** | **CLOSED** | The install now starts an explicitly supplied tick source and keeps the promise (`src/install.ts:1651`), so `await installed.monitor.ready()` is meaningful and a host never has to know the undocumented workaround. Guarded by `ACR-N06` and `ACR0-B` (`fires: 6` with no explicit start). |
| **AC-R-02** | **CLOSED** | `dispose()` now stops the monitor, and the install's dispose settles startup → stops the source → closes owned marks → only then closes stores. Guarded by `ACR-N07`, `ACR-N08` (no callback runs against a closed store; second dispose is a no-op) and `ACR0-C`. |
| **AC-R-03** | **CLOSED** | The root cause was `operatingCapabilitiesOf()` rebuilding a four-field capability object and silently dropping the monitor wiring; it now SPREADS the caller's declaration (`src/project_management/service.ts:788-797`). Availability is derived from a LIVE capability through the ONE shared table, and the install applies the live value to the derived posture so the seam cannot drop it again. Guarded by `ACR0-A`, `ACR-N01`, `ACR-N02`, `ACR-N03`, `ACR-N04`, `ACR-N04b/matrix`, `ACR-N05`, `ACR-N09`, `ACR-N16`. |
| **AC-R-04** | **CLOSED** | The canonical trigger cause is the constant `monitor_condition_satisfied`; the clock survives only in the non-canonical outcome detail. Guarded by `ACR-N12`, `ACR-N13`, `ACR-N14` and `ACR0-D` (identical canonical event ids at two clocks). |

## 2. The residual inside CF-AC-06

`CF-AC-06` is closed for what the closure can honestly close: the derived read,
the first-party project-linked source, the count, the rendering, and the honest
empty state. It is NOT closed for install-level plumbing:

```text
the bounded management service owns no Campaign store, so the references arrive
through an injected read-only seam (src/project_management/service.ts:123);
installPalimpsest does not yet pass that seam, so a LIVE install's operating
history references ZERO Campaign events and reports count 0 with an explicit
empty state.
```

Recorded as **`CF-AC-R-01`** in `G10-AC-R-CARRY-FORWARD.md`. The alternative —
letting the bounded management service open a shared Campaign store itself — would
have been exactly the second-truth coupling the architecture forbids.

## 3. Kept deferred, with their triggers

These are explicitly NOT closed, and none of them blocks a delivered claim.

| ID | Kind | Why it stays open | Trigger (unchanged unless noted) |
| --- | --- | --- | --- |
| **CF-AC-01** | operability | The CLI still composes no Campaign store, so there is nothing for a `palimpsest monitor …` command to drive. The operator force-tick remains `installed.monitor.tick()`. The closure did NOT add a CLI path; the Monitor tab is read-only by design and offers no tick. | An operator who wants to force a monitor tick from the shell, or a request for a CLI-level monitor regression test. |
| **CF-AC-02** | scale | Progression is still bounded: one phase transition per pass, at most four passes per tick, and per-tick budgets of 10 Campaigns / 5 wake advances / 5 activations. A scoped set larger than the budget needs several ticks. | A project whose scoped Campaign count exceeds `maxCampaignsPerTick`, or a latency requirement that one tick must finish a progression beyond the budget. |
| **CF-AC-04** | scale | `linkedCampaignMonitorScope` still reads every Campaign definition and replays it to filter; the new `linkedCampaignWakeEventSource` does the same on the history read, so the operating history contributes a second O(all Campaigns) pass per read. Acceptable at the current scale; recorded as a real cost of the closure. | A shared Campaign store with a large Campaign count, or a per-project Campaign index. |
| **CF-AC-05** | product/integration | No real webhook or push connector was added. The shipped adapters are DSH and Pi (plus `recording`/`null`); anything else is an embedder-supplied `CampaignWakeActivationPort`. The workspace says "pull-only" or "configured" and names no protocol. | A host that can only be woken by an HTTP push, webhook or queue consumer. |
| **CF-AA-02** | trust boundary | Unchanged by this stage: no out-of-process admission service, no capability tokens, no hostile-code sandbox. Nothing in the closure touches the admission path. | An untrusted-plugin or multi-tenant same-process topology. |
| **CF-W-06** | correctness | Unchanged: no supported public protocol produces a `READY` task with an unsatisfied dependency, and the dependency re-check stands as defence in depth. The closure adds no task-state path. | An operator expecting a revision/head sync to recompute retained-task states. |
| **CF-X-01** | concurrency | Unchanged: no parallel old-base compatibility. The unsafe effect-first path stays closed, and the closure adds no promotion path. | A topology/product need for two concurrent tasks to promote independently from the same base. |

## 4. Nearby items whose status this stage leaves alone

| ID | Status |
| --- | --- |
| CF-W-05 (`GET /api/manage/preview` unconsumed by `web/**`) | STILL_DEFERRED — untouched. The closure consumed two NEW read routes, not this one. |
| CF-AC-06's sibling `CF-W-05` mirror | resolved for the monitor face only (the monitor read route is now consumed and rendered). |
| CF-X-02 (`ProjectWorkspaceView.project.head` not rendered) | PARTIALLY_ADDRESSED_IN_AB, unchanged. |
| CF-AB-01 … CF-AB-05, CF-AA-01/03/04/05, CF-W-01…04/07, CF-X-03/04, CF-Y-*, CF-Z-* | Unchanged; the full table with unchanged triggers is in `G10-AC-R-CARRY-FORWARD.md` §2. |

## 5. What the closure did not widen

```text
no new authority, no new identity, no new canonical store
no management-involvement change path
no HTTP or UI force-tick
no asset-scope widening
no Campaign semantic change
```

See `G10-AC-R-MONITOR-CLOSURE-ANTI-WASTE.md` for the full audit and
`G10-AC-R-MONITOR-PRODUCT-CLAIMS.md` for the claim-by-claim check.
