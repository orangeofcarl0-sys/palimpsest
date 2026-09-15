# G10-AC-R — Monitor closure campaign record

Stage: **Monitor closure** (make the AC monitor runtime true, visible and
disposable).
Branch: `experiment/g10-ac-r-closure`.
Baseline: `4f5daec1f6e16cd9c923b562ee4141a05fa0a72c`.
Spec: `docs/engineering/G10-AC-R-MONITOR-CLOSURE-SPEC.md`.

## 1. Work table

| # | Work item | Scope | State |
| --- | --- | --- | --- |
| W1 | ACR0 reproducer (A–D + E) | `scripts/monitor/acr0-repro.mjs` | done |
| W2 | Capability spread fix (AC-R-03) | `src/project_management/service.ts` | done |
| W3 | One availability table over a LIVE capability | `src/project_operating/posture.ts`, `src/monitor/driver.ts` | done |
| W4 | Install-owned startup + dispose ordering (AC-R-01/02) | `src/install.ts` | done |
| W5 | Deterministic trigger cause (AC-R-04) | `src/monitor/driver.ts`, `src/monitor/activation.ts` | done |
| W6 | Default delivery marks + explicit opt-out | `src/install.ts` | done |
| W7 | Install-lifecycle adversarial suite | `test/ac_r_install_lifecycle.test.ts` | done |
| W8 | `campaign_wake` derived history kind + first-party project-linked source | `src/project_operating/history.ts` | done |
| W9 | Management service Campaign wake seam + count | `src/project_management/service.ts` | done |
| W10 | Monitor card: two readings, runtime facts, read-only preview | `web/src/**` | done |
| W11 | Wake references rendered from the operating history | `web/src/**` | done |
| W12 | Product closure suite (ACR-N15…N20, N23, N26) | `test/ac_r_product.test.ts` | done |
| W13 | Browser assertions for the Monitor tab | `e2e/project-workspace.spec.ts` | done |
| W14 | Compose the declared monitor application surface | `src/application/surface.ts`, `src/application/http.ts` | done |
| W15 | Evidence + doctrine + carry-forward docs | `docs/**` | done |

Items W2–W7 were delivered by the core-fix pass on this branch; W8–W15 plus the
documents by the product-closure pass. Both passes were run end to end here (see
§4), so the numbers below describe one tree, not two.

## 2. Write scope (real changed files)

`git status --short` and `git diff --stat` at delivery:

```text
 M e2e/project-workspace.spec.ts
 M src/application/http.ts
 M src/application/surface.ts
 M src/install.ts
 M src/monitor/activation.ts
 M src/monitor/driver.ts
 M src/project_management/service.ts
 M src/project_operating/history.ts
 M src/project_operating/posture.ts
 M src/project_operating/work_mode_profile.ts
 M test/ab_operating_posture.test.ts
 M test/ac_monitor_runtime.test.ts
 M web/src/api.ts
 M web/src/project_workspace/ProjectWorkspaceView.tsx
?? docs/engineering/G10-AC-R-MONITOR-CLOSURE-SPEC.md
?? docs/engineering/MONITOR-INSTALL-LIFECYCLE.md
?? docs/engineering/audits/G10-AC-R-MONITOR-CLOSURE-ANTI-WASTE.md
?? docs/engineering/audits/G10-AC-R-MONITOR-CLOSURE-ASSESSMENT.md
?? docs/engineering/audits/G10-AC-R-MONITOR-PRODUCT-CLAIMS.md
?? scripts/monitor/acr0-repro.mjs
?? test/ac_r_install_lifecycle.test.ts
?? test/ac_r_product.test.ts
```

```text
 e2e/project-workspace.spec.ts                      | 171 ++++++++++
 src/application/http.ts                            |   4 +
 src/application/surface.ts                         |  28 +-
 src/install.ts                                     | 212 +++++++++----
 src/monitor/activation.ts                          |  10 +-
 src/monitor/driver.ts                              | 241 +++++++++++++-
 src/project_management/service.ts                  |  51 ++-
 src/project_operating/history.ts                   | 157 ++++++++-
 src/project_operating/posture.ts                   | 179 +++++++++--
 src/project_operating/work_mode_profile.ts         |  22 ++
 test/ab_operating_posture.test.ts                  |   4 +
 test/ac_monitor_runtime.test.ts                    |  28 +-
 web/src/api.ts                                     | 101 ++++++
 web/src/project_workspace/ProjectWorkspaceView.tsx | 351 ++++++++++++++++++++-
 14 files changed, 1439 insertions(+), 120 deletions(-)
```

Two touched files are worth naming explicitly:

* `test/ab_operating_posture.test.ts` (+4) — the exact `counts` assertion gained
  `campaignWakeEvents: 0`. The assertion is NOT weakened: it stays exact, and the
  in-file comment states why the new field is zero for that fixture.
* `src/install.ts` is a core-fix-pass file, not a closure-pass file.

No file under `src/monitor/**`, `src/install.ts`, `src/campaign/**`,
`test/ac_monitor_runtime.test.ts` or `test/ac_r_install_lifecycle.test.ts` was
modified by the product-closure pass.

## 3. Delivered behaviour

```text
scope wired, no tick source      → driver composed, startState NOT_CONFIGURED,
                                   availability UNAVAILABLE ("scope only"),
                                   Monitor tab renders preference ≠ runtime
tick source wired by the host    → the INSTALL starts it; RUNNING after the start
                                   promise resolves; fires observable
start throws                     → startState FAILED, startError verbatim,
                                   availability UNAVAILABLE, started false
dispose()                        → startup settled, source stopped, owned marks
                                   closed, then stores closed; no late tick
delivery marks                   → default for a first-party runtime, supplied by
                                   the host, or deliberately disabled
preferred MONITOR, no runtime    → the preference is retained; the runtime row is
                                   UNAVAILABLE and the card says both
preview                          → read-only: no canonical event, no Work event,
                                   no mark; visibly states it never ticks
history                          → campaign_wake entries reference canonical
                                   WATCH_TRIGGERED / WAKE_STARTED /
                                   RECONCILIATION_COMMITTED / WAKE_CYCLE_COMPLETED
POST /api/monitor/status|preview → 400 ("requires GET"); no tick route exists
no scope at all                  → 501 on both read routes; the card says
                                   "no monitor runtime is wired for this installation"
```

## 4. Evidence table

| Evidence | Command | Result |
| --- | --- | --- |
| Build | `pnpm build` | clean (`tsc -b`, no diagnostics) |
| Unit suite | `pnpm exec vitest run --maxWorkers=2` | **158 files / 1554 tests passed** |
| Product closure suite | `pnpm exec vitest run --maxWorkers=2 test/ac_r_product.test.ts` | **11 passed** |
| Install-lifecycle suite | `pnpm exec vitest run --maxWorkers=2 test/ac_r_install_lifecycle.test.ts` | 15 passed |
| Web bundle | `pnpm run build:web` | ok, 203 modules |
| Browser E2E | `pnpm exec playwright test` | **28 passed** (baseline 27 + E2E-PROJECT-03) |
| ACR0 reproducer | `node scripts/monitor/acr0-repro.mjs` | EXIT=0, every item `defect:false`, E reads true/true |
| Cold resume dogfood | `node scripts/monitor/cold-resume.mjs` | `pass: true`, `workEventsCreated: 0` |

Verbatim reproducer and dogfood output:
`G10-AC-R-MONITOR-CLOSURE-ASSESSMENT.md` §6 and
`G10-AC-R-INSTALL-LIFECYCLE-EVIDENCE.md` §6.

## 5. Gates block

```text
pnpm build                                  clean
pnpm exec vitest run --maxWorkers=2         158 files / 1554 tests passed
pnpm run build:web                          ok (203 modules)
pnpm exec playwright test                   28 passed
node scripts/monitor/acr0-repro.mjs         anyDefect=false, EXIT=0
node scripts/monitor/cold-resume.mjs        pass=true, EXIT=0
```

Baseline for comparison: `153 files / 1454 tests` at the AC baseline
(`G10-AC-MONITOR-DELIVERY.md`); the AC tree itself was `156 files / 1528 tests`.

## 6. Baseline comparison

| | AC baseline `4f5daec` | G10-AC-R |
| --- | --- | --- |
| Install startup | none — a supplied tick source never fired | the install starts it; `ready()` is awaitable |
| Dispose | never stopped the monitor; ticks kept arriving | settle → stop → close owned marks → close stores |
| AVAILABLE on a declaration | false AVAILABLE for a scope-only composition | never: a bare declaration is `CONDITIONAL`, a scope-only runtime `UNAVAILABLE` |
| Trigger cause | interpolated the wall clock, so each clock minted a new canonical event | the constant `monitor_condition_satisfied`; identical identity across clocks |
| Default delivery marks | none — the host was re-notified every tick | `default` for a first-party runtime, `supplied` by a host, or explicitly `disabled` |
| Monitor read surface | declared and wired, but never composed: `GET /api/monitor/*` always 501 | `GET /api/monitor/status` and `/preview` answer 200; the discovery route reports it |
| Workspace | no Monitor text anywhere in `web/src` | a Monitor tab with two separate readings, runtime facts and a read-only preview |
| Operating history | no reference to any Campaign event | `campaign_wake` references, project-scoped, payload-free, counted |
| Partial wiring | a declaration could read as AVAILABLE | one availability table; five wirings get five honest answers |
| Trigger evaluation | same pipeline | unchanged |

## 7. Two HONEST notes (as reported by the core-fix pass)

**H1 — AC-R-03's false claim was reachable through the deriver only because the
narrowing bug dropped the declaration.** The live install under-reported
(`UNAVAILABLE` for a really composed runtime) while the deriver, fed with exactly
what the install declares, over-claimed (`AVAILABLE` for a scope-only runtime).
Neither reader saw the other's error, and a test written only against the live
install would have shown the SAFE (under-reporting) direction. The reproducer
therefore reports both readings
(`declaredScopeOnlyAvailability`, `postureMonitorAvailability`) and marks a defect
when EITHER is `AVAILABLE`.

**H2 — AC-R-02 needed a manual `start()` to be observable at baseline.** The
install did not start the tick source, so at baseline there was nothing running
to leak past `dispose()`. The reproducer calls `installed.monitor.start()`
explicitly before disposing, which is precisely the undocumented workaround
AC-R-01 describes. After the fix that call is an idempotent no-op, so the same
script remains valid in both phases.

## 8. Honest limitations

* The BEFORE readings in the assessment are the reproducer's contract, not a
  transcript produced in this tree (§0 of the assessment explains why).
* `ACR0-E` is a text-presence check, not a rendering check. The rendering is
  covered by E2E-PROJECT-03.
* **`CF-AC-R-01`:** `installPalimpsest` does not yet wire the Campaign wake-event
  seam into the management service, so a LIVE install's operating history
  references zero Campaign events (and says so). The derived read, the first-party
  source and the rendering are complete; the install-level wiring is carried.
* **The Campaign plane records no wall clock**, so a `campaign_wake` entry's
  ordering key is its chain position and such entries sort after every dated
  entry. Labelled as a chain position in the UI and documented in code.
* `web/tsconfig.json` is not part of `pnpm build`, and it does not typecheck
  clean today: `web/src/MultiGraphView.tsx:68` (`JSX` namespace) and
  `web/src/project_workspace/ProjectWorkspaceView.tsx:903`
  (`<Muted testId=…>` on a primitive that has no `testId` prop) fail. Both are
  PRE-EXISTING and none was introduced by this closure; `pnpm run build:web`
  transpiles successfully (203 modules) and the E2E suite is green. The closure
  deliberately did not "fix" them so the diff stays scoped.
