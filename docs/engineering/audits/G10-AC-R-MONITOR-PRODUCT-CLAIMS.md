# G10-AC-R — Monitor product claims audit

The closure brief's §21 forbids a set of claims a monitor product is tempted to
make. For each one: can the delivered product text or code make that claim, what
prevents it, and what does the UI actually say instead. Sources are the Monitor
card (`web/src/project_workspace/ProjectWorkspaceView.tsx:971-1250`), the read
model (`web/src/api.ts:1122-1215`), the server shapes
(`src/monitor/driver.ts:162-194`) and the routes
(`src/application/http.ts:796-802`).

Verdict summary:

```text
running-when-merely-composed                PREVENTED
host-wake-configured-with-null-adapter      PREVENTED
tick-configured-when-absent                 PREVENTED
duplicate-suppression-enabled-when-absent   PREVENTED (and reported disabled)
exactly-once-wake                           PREVENTED (at-least-once everywhere)
webhook-connector-exists                    NEVER CLAIMED (no connector exists)
monitor-creates-Campaigns-or-watches        PREVENTED (structurally)
```

## 1. "The monitor is running" (merely composed)

**Can the claim be made?** No.

**Preventing code.** `started` is set to true in exactly one place, after the tick
source's `start()` RESOLVES (`src/monitor/driver.ts:691-702`). `status()` exposes
`runtimeConfigured` and `driverStarted` as separate fields (`:166-170`), and the
availability table answers `CONDITIONAL` with the state name for every wired but
unstarted composition (`src/project_operating/posture.ts:151-155`). The workspace
renders `capability.startState` and `capability.started`, never a derived
"running" boolean.

**Honest wording the UI uses.**

> Runtime: `NOT_CONFIGURED` (driver composed: yes · started: no · provenance
> first_party)
> UNAVAILABLE / MANUAL_ONLY / NOT_CONFIGURED / STARTING / RUNNING / FAILED are
> runtime states. A composed driver is not a running one: only a resolved
> tick-source start makes the runtime RUNNING.

## 2. "A host can be woken" (with the null/pull adapter)

**Can the claim be made?** No.

**Preventing code.** `activationConfigured` is computed as
`deps.activation.adapterId !== NULL_CAMPAIGN_WAKE_ACTIVATION_ADAPTER_ID`
(`src/monitor/driver.ts:307`), so the null/pull adapter always reports false, and
a tick-only composition is `CONDITIONAL` with the reason "no real host wake
activation adapter is bound (the null/pull adapter only records signals); no host
can be autonomously woken" (`src/project_operating/posture.ts:156-162`).
`ACR-N09` asserts the null adapter never yields `AVAILABLE`.

**Honest wording the UI uses.**

> Host wake: pull-only: the null/pull adapter records signals and no host can be
> autonomously woken

(vs. the wired case: "configured: a real host wake activation adapter is bound".)

## 3. "A tick source is configured" (when it is absent)

**Can the claim be made?** No.

**Preventing code.** `tickSourceConfigured` is `deps.tickSource !== undefined`
(`src/monitor/driver.ts:306`); `status().tickSource` is `null` when no source
exists (`:764-772`), and the availability table treats "activation only" as
`CONDITIONAL` naming the missing tick source
(`src/project_operating/posture.ts:163-168`). There is no default interval and no
implicit timer (`src/monitor/tick_source.ts:94-102`), and no scope at all means no
driver and a 501 read route (`ACR-N26`).

**Honest wording the UI uses.**

> Tick source: no tick source is configured; ticks are manual only

## 4. "Duplicate suppression is on" (when absent or opted out)

**Can the claim be made?** No.

**Preventing code.** The install resolves the marks source to exactly one of
`default` / `supplied` / `disabled` (`src/install.ts:1579-1600`); the driver
reports that value verbatim (`src/monitor/driver.ts:176`, `:753`); with
`campaignMonitorDeliveryMarks === false` the reported value is `disabled`, and the
driver then re-delivers on the configured cooldown by design. Nothing in the
product text describes marks as a guarantee.

**Honest wording the UI uses.**

> Delivery marks: `disabled` (duplicate suppression is deployment-local and is
> never evidence that a wake succeeded)

## 5. "The wake is delivered exactly once"

**Can the claim be made?** No — and no product string makes it.

**Preventing code.** Delivery is explicitly at-least-once:
`redeliveryAfterMs` backoff, attempt marks, and a failure that leaves the
canonical wake untouched so a later tick retries
(`src/monitor/driver.ts:533-560`). The semantic signal identity carries no clock
and no attempt counter (`src/monitor/activation.ts:46-62`), so a redelivery is the
SAME signal, not a second one. `ACR-N11` proves marks loss yields the same signal
id and one wake. `monitor.v1`'s limitations list includes "delivery is
at-least-once" (`src/recipes/registry.ts:79-86`).

**Honest wording the UI uses.** The card never says "delivered once"; it reports
the last signal with its phase and states the preview block "delivers nothing".

## 6. "A webhook/push connector exists"

**Can the claim be made?** It is not made anywhere.

**Preventing code.** There is no connector in the tree. The shipped adapters are
DSH (`followup` / cold `resume`), Pi (`triggerTurn`), `recording` and `null`
(`src/monitor/activation.ts`); anything else is an embedder-supplied
`CampaignWakeActivationPort`. This stays carried forward as `CF-AC-05`, and the
new carry-forward list repeats it with its trigger.

**Honest wording.** The product text says only "a real host wake activation
adapter is bound" or "pull-only". It never names a protocol.

## 7. "The monitor creates Campaigns and watches"

**Can the claim be made?** No.

**Preventing code.** The driver has no `createCampaign`, `installWatch`,
`cancelWatch`, compile, admit, commit or publish seam at all
(`src/monitor/driver.ts:196-237`). A tick may only read scoped Campaigns, record a
trigger through the existing prospective service, start the existing single wake,
run the existing deterministic reconciliation and emit a signal
(`src/monitor/driver.ts:13-29`). The AC suite's `AC-N01`/`AC-N02`/`AC-N13`/`AC-N29`
enforce it, and the Monitor card states the boundary.

**Honest wording the UI uses.**

> MONITOR is a Work Mode modifier: the preference says how this project is
> willing to be organised. It creates no Campaign, no watch and no timer.
>
> Only Campaigns in this scope are ever evaluated, and an empty scope is an honest
> answer: the runtime never scans a shared store.
>
> The preview derives what the next tick WOULD do from canonical Campaign history
> alone. A trigger that fires is a prompt to reconsider the Campaign — it proves
> no claim, satisfies no commitment and requires no project action.

## 8. Two further claims this closure had to police

### 8a. "The workspace shows the monitor runtime" (when the surface is absent)

Before the closure the read routes always answered 501, and the honest response
is an explicit absence state, never zeroes:

> No monitor runtime is wired for this installation (`<error>`). No runtime
> state, campaign count, tick source or activation is fabricated here.

Guarded by `ACR-N26` (501 when unwired) and the `monitor-unavailable` branch.

### 8b. "The operating history proves a wake happened"

It does not prove anything; it references the canonical owner.

> Campaign wake references: N (references only: the Campaign store remains the
> canonical owner of every wake event)
>
> This list is a DERIVED audit view, not a history store: it re-reads the owning
> planes on every load and copies nothing but references.

And the `incomplete audit records` field states whether every referenced owner was
actually readable, so a missing owner is an incomplete record rather than a fact.

## 9. Honest limitations of this audit

* The audit covers text and code in this repository. It cannot bind an embedder
  that labels the runtime itself.
* "PREVENTED" means the repository makes the claim unsupportable by the shipped
  code paths; it does not mean the words cannot be typed into a doc. The rows cite
  the mechanism, not a spell-check.
* The UI wording is quoted from the current revision; it is asserted by
  `E2E-PROJECT-03` for the three load-bearing strings ("never ticks", the separate
  preference/runtime readings, the no-force-tick absence) and by the vitest
  product suite at the DATA level for the rest.
