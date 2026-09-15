# G10-AC — Monitor-runtime pre-implementation assessment (AC0)

Read-only audit of the baseline `eca28ecce8118b21d41debb9af66b472b5ca866a`
(`experiment/g10-ac-monitor-runtime` forked from the G10-AB closure merge).
It answers, with `file:line` evidence, what existed before AC and therefore what
AC had to add.

No code was changed to produce this audit. The vocabulary in this document is the
vocabulary of the code: a `WatchEvaluation` is `pending | triggered | incomplete`
(`src/campaign/prospective.ts:114-117`); there is no `unknown` and no `error`
watch status.

## 1. The twelve questions

### (a) Which watch conditions are fully evaluable, and which return `incomplete`?

`evaluate()` (`src/campaign/prospective.ts:335-379`) is the only evaluator.

* **Always evaluable — `not_before`** (`:338-343`). It reads the injected clock
  (`const now = deps.clock();`, `:339`) and returns `triggered` or `pending`. No
  optional port is involved.
* **Evaluable in a real install — `institution_epoch_changed`** (`:352-359`). It
  needs `deps.institutions`; the installed campaign surface cannot exist without
  an institution source (`src/install.ts:1007` gates campaign construction on
  `campaignInstitutionSource`), so this port is present whenever campaigns exist
  in production (`src/install.ts:1022`).
* **`incomplete` when a port is absent:**
  * `claim_changed` — `src/campaign/prospective.ts:345`:
    `if (deps.evidence === undefined) return { watchId: watch.watchId, status: "incomplete", detail: "no evidence port" };`
    The evidence port is wired only when a Proof plane exists
    (`src/install.ts:850-851`: `options.campaignEvidencePort ?? (proof === undefined ? undefined : proofCampaignEvidencePort(proof))`).
  * `institution_epoch_changed` — `:353`, `detail: "no institution port"`.
  * `project_terminal` — `:361`, `detail: "no project port"`. Needs
    `options.campaignWorkPort` (`src/install.ts:1028`).
  * `external_signal` — `:369`, `detail: "no signal port"`. Needs
    `options.campaignSignalPort` (`src/install.ts:1020`).

An absent port is therefore an honest `incomplete`, never a fabricated
`triggered` and never an `unknown`/`error` status. The driver surfaces this
verbatim in its tick detail (`src/monitor/driver.ts:349-357` collapses
`incomplete` evaluations into the text `watch(es) are incomplete and never
trigger`), which `AC-N06` asserts.

### (b) Does any production loop call `scanWatches` automatically?

**No.** The only non-test caller is the monitor driver itself
(`src/monitor/driver.ts:310`), and the driver is composed only when an operator
supplies `campaignMonitorScope` (`src/install.ts:1537-1539`). Nothing calls
`driver.tick()` outside the driver's own tick-source handler
(`src/monitor/driver.ts:593-595`). A repository-wide search for `scanWatches`
finds the interface (`src/campaign/prospective.ts:260`), its implementation
(`:381`), the install forwarder (`src/install.ts:1556`), driver comments, the
test file and the cold-resume script. No host, no scheduler, no timer.

### (c) Does any host integration call `beginWake` automatically?

**No.** `beginWake` is invoked only from `src/monitor/driver.ts:291` and `:333`;
`src/install.ts:1562` is a forwarder into the driver. A search over `host/`
finds no reference to `beginWake` (or to `monitor` at all). The host runner
(`host/dsh/lib/runner.js`) never touches the campaign wake lifecycle.

### (d) Is `attentionActivation` driven automatically or only a port?

**Only a port.** `attentionActivation?: AttentionActivationPort` is an install
option (`src/install.ts:336`) returned unchanged on the installed object
(`src/install.ts:1680`). The only automatic loop in the tree is host-side and
drives the **Attention** plane, not campaign wake:
`host/dsh/lib/runner.js:342` `const timer = setInterval(async () => { ... })`
followed by `const attention = host.deployment.installed.attention;` (`:347`) and
`const signals = await attention.drain();` (`:349`). ATTENTION ≠ campaign wake.
Nothing starts or ticks the campaign monitor.

### (e) How does `WATCH_TRIGGERED` become `WAKE_STARTED`?

Only when someone calls `beginWake`. The driver path is
`scanWatches` → `deps.prospective.recordTriggers(...)` (`src/monitor/driver.ts:325`)
→ `const causeWatchId = [...recorded].sort()[0] ?? triggered[0]!;` (`:332`) →
`deps.production.beginWake({ campaignId, cause: { kind: "watch", watchId: causeWatchId } })`
(`:333`). `beginWake` itself refuses a watch cause with no canonical trigger
(`src/campaign/production.ts:817-819`) and writes `WAKE_STARTED`
(`src/campaign/production.ts:822-825`). **Before AC nothing called `beginWake`
automatically**, so a `WATCH_TRIGGERED` could sit forever with no wake.

### (f) How does an in-flight wake resume after restart?

Only through an explicit re-derivation and an explicit call. The pure derivation
exists (`deriveMonitorContinuation`, `src/monitor/lifecycle_derivation.ts:40-92`),
and its header states why it must not depend on a live scan (`:5-7`): after a
crash the watch may already be `TRIGGERED`, so `scanWatches()` no longer reports
it. The driver's `start()` (`src/monitor/driver.ts:590-596`) only attaches the
tick source; an absent source means nothing runs (`AC-N12`). **Nothing in the
baseline performed this re-derivation or resumed the wake automatically.** No
startup hook, no `reconcileAll`-style Campaign recovery existed.

### (g) What happened after a crash, before AC?

There was **no recovery driver for the Campaign wake lifecycle**. The same-process
`recovery.reconcileAll()` (`src/recovery/recovery.ts:38`) recovers the Effects
promotion plane only; it does not read Campaign history.

| Crash point | State left behind | Pre-AC consequence |
| --- | --- | --- |
| after `WATCH_TRIGGERED`, before `WAKE_STARTED` | The watch is no longer ACTIVE — `activeWatches` excludes any watch with a trigger or cancel (`src/campaign/prospective.ts:326-332`) — so `scanWatches` can never re-report it. | The trigger stayed canonical but inert. No component turned it into a wake. |
| after `WAKE_STARTED`, before reconciliation | Lifecycle `WAKING` (`src/campaign/production.ts:335-336`); `reconcileCurrentWorld` requires the exact in-flight cycle (`src/campaign/production.ts:683-690`). | No automatic caller; the wake stayed open indefinitely. |
| after reconciliation (`RECONCILIATION_COMMITTED`), before host activation | Lifecycle `RECONCILING` (`src/campaign/production.ts:338-339`). | No component emitted a host signal. The project principal was never told. |
| after host activation, before any host action | The signal is a notification only; delivery never writes `WAKE_CYCLE_COMPLETED` (`AC-N20`). | No redelivery/cooldown machinery existed (the marks store did not exist), and no component re-offered the signal. |

### (h) What Campaign scope belonged to an installed project?

**Nothing existed.** There was no project→campaign enumeration. The only read
directions were:

* campaign → project: `projectLinkedProjects(events)` (`src/campaign/project.ts:56`),
  which derives the projects a single Campaign links to; and
* the store-global `campaigns()` (`src/campaign/store.ts:102`).

So an installed project could only discover its campaigns by reading **every**
campaign definition and filtering — precisely the global scan that must not be a
default. AC adds `linkedCampaignMonitorScope` (`src/monitor/scope.ts:52-71`),
which still reads every definition but returns only Campaigns whose own record
names the project, and `emptyCampaignMonitorScope` (`:37-44`) as the honest
zero-scope default.

## 2. The trigger-recording gap that forced `recordTriggers`

Before AC, `recordTrigger` was the **only** writer of `WATCH_TRIGGERED`
(`src/campaign/prospective.ts:388-401`) and it appended **exactly one event per
call** (`:397-400`). A condition epoch in which several watches fire at once could
therefore only be recorded by N sequential calls, and a crash between calls would
leave a partially recorded trigger set that the following reconciliation would
read as incomplete. AC's §14 required a single atomic write, so
`recordTriggers` was added (`:408-433`): it replays once, filters out
already-triggered watches, and appends the whole fresh set in **one**
`appendAtomic` batch against the same basis (`:426-431`). `recordTrigger` stays
as the one-element compatibility case.

## 3. Honest limitations of this assessment

* `institution_epoch_changed` "fully evaluable in production" is inferred from
  the install-time gate (`src/install.ts:1007`) plus the wiring at `:1022`; the
  assessment did not run a production install end-to-end.
* This audit is a static + call-graph reading of the baseline worktree; it does
  not claim that no *external* deployer calls `beginWake` from outside this
  repository.
* The crash-point table describes the pre-AC **absence** of a recovery driver. It
  is a statement about this tree, verified by search (`reconcileAll` exists only
  for Effects and `host/` contains no monitor reference).
