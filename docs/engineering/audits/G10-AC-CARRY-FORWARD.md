# G10-AC — Carry-Forward

No `BLOCKER_IN_AC`. AC delivered the long-horizon Campaign monitor runtime as an
opt-in, authority-free plane. The items below are surfaced by AC or carried from
AB/AA/W/X/Y/Z; none blocks the delivered claims. Reasoning for the carried items
is in `docs/engineering/audits/G10-AC-AB-CARRY-FORWARD-DISPOSITION.md`.

## 1. New items surfaced by AC

| ID | Kind | Finding | Concrete trigger |
| --- | --- | --- | --- |
| CF-AC-01 | operability | **NEW.** The CLI has no monitor command; the only force-tick is `installed.monitor.tick()`. The surface comment (`src/application/surface.ts:513-516`) says the force-tick lives on "the installed runtime and the CLI", but the CLI composes no Campaign store and exposes nothing. | An operator who wants to force a monitor tick from the shell, or a request for a CLI-level monitor regression test. |
| CF-AC-02 | scale | **NEW.** Progression is bounded: one phase transition per pass, at most four passes per tick, and per-tick budgets of 10 Campaigns / 5 wake advances / 5 activations (`src/monitor/driver.ts:64-69`, `:484-504`). A scoped set larger than the budget needs several ticks. | A project whose scoped Campaign count exceeds `maxCampaignsPerTick`, or a latency requirement that one tick must finish a progression beyond the budget. |
| CF-AC-03 | waste/operability | **NEW.** `deps.marks` is optional; with no marks store `shouldDeliver` always delivers for an incomplete wake, so the host is re-notified every tick. | An embedding that composes no marks store but has a rate-limited host queue, or a need for delivery metrics. |
| CF-AC-04 | scale | **NEW.** `linkedCampaignMonitorScope` reads every Campaign definition and replays it to filter (`src/monitor/scope.ts:58-68`): O(all campaigns) per tick. Acceptable at the current scale. | A shared Campaign store with a large Campaign count, or a per-project Campaign index. |
| CF-AC-05 | product/integration | **NEW.** No real webhook or push connector. The shipped adapters are DSH and Pi; anything else is an embedder-supplied `CampaignWakeActivationPort`. | A host that can only be woken by an HTTP push, webhook or queue consumer. |
| CF-AC-06 | product/route | **NEW.** The read-only monitor surface is not rendered by `web/**`, mirroring `CF-W-05`. | A UI change that wants to show monitor status or a tick preview. |

## 2. Carried items (AB/AA/W/X/Y/Z)

| ID | Disposition | Trigger (unchanged) |
| --- | --- | --- |
| CF-AB-01 | STILL_DEFERRED_WITH_TRIGGER | A project whose activity volume makes a full read expensive, or an operator asking for a retention window. |
| CF-AB-02 | STILL_DEFERRED_WITH_TRIGGER | A multi-tenant/tamper-hostile deployment where the activity log must be tamper-evident against the operator's own environment. |
| CF-AB-03 | STILL_DEFERRED_WITH_TRIGGER | A consumer that infers mutation from an empty canonical-ref list, or a verify port that starts exposing canonical refs. |
| CF-AB-04 | STILL_DEFERRED_WITH_TRIGGER | Management-preference portability, or multi-machine operation of one project. |
| CF-AB-05 | STILL_DEFERRED_WITH_TRIGGER | A hosted or UI-only operator topology needing a real operator-authority channel. |
| CF-AA-01 | STILL_DEFERRED_WITH_TRIGGER | An actual host denial, a supported cancel, or an engine emitting a deterministic non-uncertain failure. |
| CF-AA-02 | STILL_DEFERRED_WITH_TRIGGER | An untrusted-plugin or multi-tenant same-process topology. |
| CF-AA-03 | CLOSED_IN_AA, held | — |
| CF-AA-04 | STILL_DEFERRED_WITH_TRIGGER | A requirement to make terminal provenance tamper-evident. |
| CF-AA-05 | STILL_DEFERRED_WITH_TRIGGER | Importing a foreign log, or a writer that appends a terminal without an intent. |
| CF-W-01 | CLOSED_IN_W, held | — |
| CF-W-02 | CLOSED_IN_X, held | — |
| CF-W-03 | CLOSED_IN_Y, held | — |
| CF-W-04 | STILL_DEFERRED_WITH_TRIGGER | A feature that changes a project revision without settling/re-authorizing in-flight work. |
| CF-W-05 | STILL_DEFERRED_WITH_TRIGGER | A UI change that wants preview without the step path. |
| CF-W-06 | REASSESSED_IN_AC, STILL_DEFERRED_WITH_TRIGGER | An operator expecting a revision/head sync to recompute retained-task states. |
| CF-W-07 | STILL_DEFERRED_WITH_TRIGGER | A project with thousands of tasks where promotions/revisions are frequent. |
| CF-X-01 | STILL_DEFERRED_WITH_TRIGGER | A topology/product need for two concurrent tasks to promote independently from the same base. |
| CF-X-02 | PARTIALLY_ADDRESSED_IN_AB, UNCHANGED_BY_AC | A UI change that wants to show project-head state and promotion provenance. |
| CF-X-03 | STILL_DEFERRED_WITH_TRIGGER | A future internal caller that wants to commit a pre-compiled reconciliation without the wrapper. |
| CF-X-04 | STILL_DEFERRED_WITH_TRIGGER | A CLI-behaviour change, or a request for CLI-level regression coverage. |
| CF-Y-01 | CLOSED_IN_Z, held | — |
| CF-Y-02 | CLOSED_IN_Z (superseded), held | — |
| CF-Z-01 | STILL_DEFERRED_WITH_TRIGGER | A project with a large pending-promotion backlog, or a concurrency policy allowing many simultaneous unresolved intents. |
| CF-Z-02 | CLOSED_IN_AA, held | — |
| CF-Z-03 | STILL_DEFERRED_WITH_TRIGGER | A future path that records reports without the aggregate's input-identity check. |
| CF-Z-04 | STILL_DEFERRED_WITH_TRIGGER | A host that calls `reconcileAll()` without a subsequent turn. |

## 3. Recommended next stage (assessment only)

Ranked by real product need, not by novelty. The just-shipped monitor runtime is
currently only reachable by an embedding host, so the first rank is completing it
as a product rather than starting a new plane:

1. **CF-AC-01, CF-AC-03, CF-AC-06** — make the delivered monitor operable and
   visible: an operator tick path, a marks store that avoids needless
   re-notification, and a rendered read-only status. These are small, they are on
   the critical path of the feature that just shipped, and none of them widens
   authority.
2. **CF-AA-02** — the trust boundary. It remains the only item that bounds the
   strength of the admission guarantee, and it becomes real the moment plugins or
   multi-tenancy are in scope.
3. **CF-W-06 + CF-X-01** — the retained-task dependency-state pair: settling and
   re-deriving state must agree, and real concurrency is the precondition for both.
4. **CF-AB-05 / CF-AB-04** — operator authority and posture portability, the two
   product gaps AB knowingly left (CLI-only mutation, deployment-local state).
5. **CF-AC-02 / CF-AC-04 / CF-AC-05** — monitor scale and connectors, once a real
   deployment has the Campaign volume or a host protocol that needs them.
6. Everything else is scale, coverage and product surface, in that order.

Explicitly **not** privileged by this ordering: the External Asset Library
Bridge, and the Personal Asset System, and a universal HistoryStore. AC produced
no evidence that the next real product need is more connected external reusable
knowledge; the strategic question of whether Palimpsest should become more
autonomous, more epistemically independent, or more connected to external
knowledge must be answered from a real need, not preselected here.

## AC scope note recorded at delivery

**CF-AC-06 (new).** The monitor runtime is fully wired for programmatic use: the
driver, the scoped read surface (`application.monitor.status()/preview()`), the
HTTP reads (`GET /api/monitor/status`, `GET /api/monitor/preview`) and the
host-side operator force-tick (`installed.monitor.tick()`). What is NOT delivered
in AC is the **Project Workspace rendering** of Monitor status (the spec's §37
"Show Monitor status in Project Operating Posture" and the §38 operating-history
references to canonical Campaign events). The data a UI needs is available on the
application surface, but `web/**` does not yet render it, so this is recorded as a
carry-forward rather than claimed as delivered.

Trigger: a UI change that wants to show MONITOR runtime state (preferred vs
effective, driver running/stopped, scoped campaigns, active watches, in-flight
wakes, last activation, incomplete-watch reasons) or to reference canonical
Campaign wake events from the operating history.
