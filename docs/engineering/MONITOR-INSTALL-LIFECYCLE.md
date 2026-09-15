# Palimpsest — Monitor install lifecycle

The doctrine an installation must follow to compose a Campaign monitor runtime
that is TRUE about itself: it starts what it wired, stops what it started, fails
visibly, and never keeps calling into a closed store. This is the reference for
`installPalimpsest`'s `campaignMonitor*` options and for any embedder that
composes `makeCampaignMonitorDriver` by hand.

Companion reading: `G10-AC-MONITOR-SPEC.md` (what a tick may do),
`LONG-HORIZON-MONITOR-RUNTIME.md` (why the runtime exists),
`G10-AC-R-INSTALL-LIFECYCLE-EVIDENCE.md` (the transcripts).

```text
Composed        ≠ Running        ≠ Available      ≠ Authorized
Declared        ≠ Configured     ≠ Started
Started         ≠ Ticking        ≠ Waking         ≠ Acting
startError      ≠ Crash          ≠ Lost wake
Preview         ≠ Tick           ≠ a write of any kind
```

## 1. Composed ≠ running

A driver object is a VALUE, not an agent. Constructing one proves only that the
composition happened:

* `driverComposed` is true for every driver the factory returns;
* `started` is true **only** after the tick source's `start()` promise RESOLVES
  (`src/monitor/driver.ts:691-702`);
* `runtimeConfigured` and `driverStarted` are separate fields on `status()`
  (`src/monitor/driver.ts:166-170`) precisely so a caller cannot read one as the
  other.

A composed-but-unstarted source is `MANUAL_ONLY`: ticks are possible, autonomy is
not. A scope-only driver (no tick source at all) is `NOT_CONFIGURED` and is not a
runtime in the availability sense.

## 2. The capability fields and the availability table

The ONE structural capability (`src/monitor/driver.ts:88-105`):

```text
driverComposed             a first-party driver object exists
scopeConfigured            a Campaign scope is bound
tickSourceConfigured       an explicit tick source was supplied
activationConfigured       a REAL host wake adapter is bound (FALSE for the
                           null/pull adapter)
deliveryMarksConfigured    a marks store is bound (suppression / backoff)
started                    TRUE only while the source is RUNNING
startState                 NOT_CONFIGURED | MANUAL_ONLY | STARTING | RUNNING | FAILED
startError                 the failure message when startState === FAILED, else null
provenance                 first_party | declared_external
```

The ONE availability table (`src/project_operating/posture.ts:125-173`, re-exported
by the driver at `src/monitor/driver.ts:136`) maps it:

| Composition | `startState` | Availability | Reason (verbatim shape) |
| --- | --- | --- | --- |
| no capability at all | — | `PREVIEW_ONLY` | "no monitor runtime is composed; the preference is retained and no scheduler is started" |
| start failed | `FAILED` | `UNAVAILABLE` | "the monitor tick source failed to start: <error>; automatic monitoring is not running" |
| tick + activation | `RUNNING` | `AVAILABLE` | "…composed and running: a driver with an explicit tick source and a real host wake activation adapter" |
| tick + activation | `MANUAL_ONLY` / `NOT_CONFIGURED` / `STARTING` | `CONDITIONAL` | "…fully wired but its start state is <state>; it becomes available once the tick source is RUNNING" |
| tick only | any | `CONDITIONAL` | "a monitor tick source is configured but no real host wake activation adapter is bound (the null/pull adapter only records signals); no host can be autonomously woken" |
| activation only | any | `CONDITIONAL` | "a host wake activation adapter is bound but no monitor tick source is configured (start state <state>); only manual/debug ticks can evaluate watches" |
| scope only | `NOT_CONFIGURED` | `UNAVAILABLE` | "scope only: a manual/debug driver at most; no autonomous monitoring" |

Because the table lives in `project_operating` and the driver re-exports it, the
driver's `status().availability` and the posture's MONITOR row cannot disagree.

## 3. Install-owned startup

`installPalimpsest` composes the driver only when an operator supplies a scope,
and it **initiates** startup itself when a tick source is present
(`src/install.ts:1651`):

```ts
const monitorReady = monitor === undefined ? undefined : monitor.ready();
void monitorReady?.catch(() => { /* recorded in the driver; never unhandled */ });
```

Two rules follow.

* The install does not leave the source inert. An operator who wires a real tick
  source gets ticks; the "wire it and nothing happens until you call `start()`"
  behaviour was defect `AC-R-01`.
* The promise is KEPT, so a host can await `installed.monitor.ready()` and
  `installed.dispose()` can settle it.

## 4. `ready()`

`ready()` and `start()` delegate to the SAME orchestration
(`src/monitor/driver.ts:669-718`, `:791-798`):

```text
no tick source        → { status: "not_configured" }   nothing to start
already starting      → the SAME promise               concurrent callers converge
already started       → the same resolved state
rejection from start()→ { status: "failed", error }    RESOLVED, never rejected
already disposed      → { status: "not_configured" }   refused, no new work
```

`ready()` **never rejects**: a rejected promise would escape as an unhandled
rejection in a host that does not await it, so the failure is recorded in the
driver state (`startState = FAILED`, `startError`) and returned as an outcome.

## 5. Start correctness

```text
S-1  started becomes true ONLY after the source's start() resolves.
S-2  Concurrent ready()/start() calls converge on ONE source.start() call.
S-3  A rejected start() is typed: startState FAILED + non-empty startError, and
     the runtime is NOT AVAILABLE.
S-4  No unhandled rejection can escape: ready() resolves with the failure.
S-5  A start that resolves AFTER stop()/dispose() cannot restart the source,
     because stop()/dispose() settle the in-flight start promise first.
S-6  Nothing about a start is canonical: no Campaign event, no Work event, no
     delivery mark is written by starting or failing to start.
```

## 6. Dispose ordering, and why no callback may run against a closed store

```text
1. settle the startup promise   (await startPromise)
2. stop the tick source         (await tickSource.stop())
3. close the OWNED marks store  (marks.close())
4. only then close stores       (install.ts closes the campaign/work stores)
```

The order is load-bearing. A tick callback runs `driver.tick()`, which reads and
writes the Campaign store and the delivery marks. If a store is closed while a
callback is still in flight — or if a late `start()` resolution re-arms the timer
after we stopped it — the runtime calls into a closed SQLite handle. Settlement
first is what makes steps 2–4 safe:

* `dispose()` awaits the start promise, so a pending `start()` cannot resolve
  after the source was stopped and the marks closed
  (`src/monitor/driver.ts:812-825`);
* `beginStart()` refuses once `disposed` is true, so a callback cannot be
  re-armed after dispose (`:669-677`);
* `stop()` also settles the start promise and returns the driver to
  `MANUAL_ONLY` — a configured, stopped source is not "not configured"
  (`:800-810`);
* `dispose()` is idempotent, so a second call (or a call after the monitor
  already stopped) changes nothing.

The same ordering is applied by the install (`src/install.ts:1776-1785`): the
monitor is settled and disposed BEFORE the canonical stores are released.

## 7. Default delivery marks, and the explicit opt-out

A first-party runtime that the host left unspecified gets a DEFAULT
deployment-local marks store, so a normal runtime does not re-notify the host on
every tick (`src/install.ts:1579-1600`):

```text
campaignMonitorDeliveryMarks === false        → marks disabled, reported "disabled"
campaignMonitorDeliveryMarks !== undefined    → the host store, reported "supplied"
tick source + campaign + scope, unspecified   → a store at the derived operating
                                                 path, reported "default"
anything else (e.g. no tick source)           → none, reported "disabled"
```

`status().deliveryMarks` reports which of the three happened, verbatim. A mark is
deployment-local and **is not truth**: it suppresses duplicates and backs off
re-delivery, it never proves that a wake succeeded, and it is never a canonical
record. Losing the marks file changes how often the host is notified, never
whether the canonical wake exists.

## 8. The partial-wiring honesty table

What a partially wired installation may claim:

```text
scope only                      UNAVAILABLE   manual/debug driver at most
scope + tick                    CONDITIONAL   no host can be autonomously woken
scope + activation              CONDITIONAL   only manual/debug ticks evaluate
scope + tick + activation       AVAILABLE     once the source is RUNNING
scope + tick + activation       CONDITIONAL   before RUNNING (MANUAL_ONLY/STARTING)
scope + tick + activation       UNAVAILABLE   when the start FAILED
same, declared but not composed CONDITIONAL   a declaration is not a runtime
```

Two honesty rules sit under the table:

* A **bare declaration** (`monitorRuntime: true` with no tick/activation detail)
  is `CONDITIONAL`, never `AVAILABLE`: a declaration cannot prove an autonomous
  runtime (`src/project_operating/posture.ts:311-314`).
* The **LIVE** capability, when present, is authoritative
  (`:304-310`), and an install applies it to the derived posture so the seam
  cannot drop it again (`src/install.ts:1557-1564`,
  `src/project_operating/posture.ts:198-219`).

## 9. Honest limitations

* The tick source is the deployment's; the install starts and stops it but does
  not own the host's timer semantics. An `intervalMonitorTickSource` is
  `unref`'d, so a monitor timer never keeps a process alive.
* A source whose `start()` resolves but which never fires is `RUNNING` with zero
  fires; the workspace reports `fires` so that is visible rather than implied.
* `MANUAL_ONLY` is a real state, not a failure: a manual source is started (its
  handler is armed) but only fires when a host fires it.
* Delivery is at-least-once. There is no exactly-once claim anywhere in the
  product text, and there cannot be one without a canonical delivery ledger.
