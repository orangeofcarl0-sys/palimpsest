# G10-AC-R — Monitor closure anti-waste

What the closure deliberately did NOT build, and what that choice costs. The
question this document answers is not "is the feature good" but "did the closure
add a second implementation of something that already exists".

## 1. The audit result

```text
second monitor driver                NO
second Campaign truth                NO
monitor semantic store               NO
universal HistoryStore               NO
new Agent identity                   NO
semantic scheduler                   NO
authority plane                      NO
External / Personal Asset scope      NO
```

## 2. No second monitor driver

There is exactly ONE driver (`makeCampaignMonitorDriver`) and ONE evaluation
pipeline: the manual source, the interval source and any signal hint all converge
on the same `driver.tick()` (`src/monitor/tick_source.ts:11-16`). The closure
added no second loop, no second watch scan, and no second wake machine.

What it DID add to the existing driver is lifecycle truth: start orchestration
(`src/monitor/driver.ts:669-718`), stop/dispose ordering (`:800-825`), and a live
capability read (`:644-656`). Those are properties of the one driver, not a new
one.

`ACR-N29` is structural: `src/monitor/` still contains exactly one module that
defines a driver, and the closure's diff adds no file to that directory.

## 3. No second Campaign truth and no monitor semantic store

The Campaign store remains the only owner of watches, triggers, wakes,
reconciliations and wake completions. The closure:

* reads canonical events through the existing narrow history seam and the
  existing `CampaignStore.replay` (`src/project_operating/history.ts:132-163`);
* adds NO table, NO ledger and NO projection store;
* adds NO row to any Campaign table — the derived history entry is computed per
  read and never persisted (`src/project_operating/history.ts:265-284`).

The only non-canonical table the monitor owns remains the deployment-local
delivery-marks table introduced in AC. The closure made a DEFAULT marks store the
install's behaviour (with an explicit `false` opt-out,
`src/install.ts:1579-1600`), which changes how often a host is notified and
nothing else.

## 4. No universal HistoryStore

The operating history is a DERIVED view over owners: it interleaves references
from the Work Mode history, the management mode history, the management activity
store, the ProjectIR revision basis and now the canonical Campaign events. It
owns no record of its own and cannot be written to.

The closure's contribution is one more REFERENCE kind, not a store:

```text
campaign_wake entry             ref = <campaignId>:<campaignEventId>
                                canonicalOutcomeRefs = [campaign_event:<id>]
                                summary = "<EVENT_TYPE> in Campaign <id>"
                                no payload, no content, no copy
```

The Campaign event stays the canonical artefact; the history entry is a pointer
with an ordering key. `ACR-N17` asserts the entry's exact key set, so a future
change that starts copying Campaign content into the history fails a test rather
than passing review.

## 5. No new Agent identity

No Monitor/Watcher/Scheduler/ManagerAgent identity was introduced. The driver
still has no agent id, no session, no peer, no inbox; activation is an
at-least-once signal to an existing principal. The install starts a value, it
does not hire one.

## 6. No semantic scheduler

The runtime starts because an operator wired a tick source, and stops because the
installation is disposed. A `MONITOR` preference alone still starts nothing
(`AC-N12`), and there is still no hidden interval: `intervalMonitorTickSource`
refuses to construct without an explicit positive `intervalMs`
(`src/monitor/tick_source.ts:94-102`).

The closure's "no runtime is wired" state is the honest default
(`ACR-N26`): no scope ⇒ no driver, no timer, and a 501 on the read routes.

## 7. No authority plane

Nothing in the closure can grant, record or widen authority:

* the HTTP surface is READ-ONLY (`src/application/http.ts:796-802`), and a POST
  to either route is refused (`ACR-N20`);
* the workspace card exposes no tick/force/control (`E2E-PROJECT-03` step 8);
* `previewTick`/`preview()` write nothing, including delivery marks
  (`ACR-N19`, `AC-N05`);
* the operating-history kind is a read model with no mutation path;
* the monitor never touches the management involvement axis (`AC-N24`).

## 8. No External / Personal Asset scope

The closure did not widen asset scope, add a bridge, or import foreign assets.
The Monitor card is a project-scoped observation of a project-scoped runtime, and
it renders nothing that is not already on the typed routes.

## 9. Where the closure DID add code, and why that is not waste

| Addition | Why it is not a parallel implementation |
| --- | --- |
| `campaign_wake` derived kind + `linkedCampaignWakeEventSource` | Reuses `projectLinkedProjects` exactly as `linkedCampaignMonitorScope` does; one scoping rule, two readers. |
| `CampaignWakeEventSource` seam on the management service | The service owns no Campaign store; a seam is the only honest alternative to the service reaching into a shared Campaign database itself. |
| Monitor tab in the workspace | Reuse of the existing `Section`/`Field`/`Muted`/`Notice` primitives and the existing read-only fetch pattern; no new UI framework, no new state layer. |
| `monitorStatus()` / `monitorPreview()` helpers | Mirror `operatingPosture()` / `managementActivity()`; two fetches, no cache, no store. |
| Composing the declared monitor surface | It is the missing half of an EXISTING contract (interface + deps were already declared). The closure made the declaration true instead of adding a surface. |

## 10. Honest limitations

* **Two truths can still disagree transiently.** The workspace reads
  `status()` and `preview()` in two round trips; a tick between them can make the
  preview describe a slightly later state than the status. The card labels the
  preview as "what a tick WOULD do", which is the honest reading, but there is no
  snapshot read on the surface.
* **The history's Campaign entries cannot be interleaved by time.** The Campaign
  plane records no wall clock, so the entries carry a chain position and sort
  after every dated entry. This is honest but visibly odd on a mixed list; see
  `G10-AC-R-MONITOR-CLOSURE-DELIVERY.md` §6.
* **The install does not wire the Campaign wake-event seam yet**
  (`CF-AC-R-01`). The derived read, the first-party source and the rendering all
  exist and are proven; a live install references zero Campaign events and says
  so. The alternative — letting the bounded management service read a shared
  Campaign store directly — would have been exactly the second-truth waste this
  document forbids.
* **The availability table is a mapping, not a proof.** `CONDITIONAL` for a
  tick-only composition is a statement about wiring; nothing checks that a
  configured source will ever actually fire, which is why `fires` is reported.
