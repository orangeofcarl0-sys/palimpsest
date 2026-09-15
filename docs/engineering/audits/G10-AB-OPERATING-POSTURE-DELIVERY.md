# G10-AB — Delivery report

Stage: **Durable Project Operating Posture & Management History**.
Baseline: `orangeofcarl0-sys/palimpsest` `main @ 9f29547b0eeccc524b0120ef13e9ce55656429ee`.
Closes **CF-V-02** and **CF-V-03**.

## 1. What changed

**New — `src/project_operating/`** (a seventh plane, non-authoritative):

* `work_mode_profile.ts` — `ProjectWorkModePreference`, strict parser, digest over
  the SEMANTIC mode, `FOCUS`+`[]` safe default, `UserWorkModeControlPort`.
* `work_mode_store.ts` — `SqliteWorkModePreferenceStore` (own tables, append-only
  history, explicit `safe_default` degradation) + `defaultOperatingStorePath()`.
* `posture.ts` — `ProjectOperatingPostureView`, `deriveEffectiveModeStatus`,
  `automaticActionClassesOf`, `confirmationBoundariesOf`.
* `preference.ts` — `orderCandidatesByWorkModePreference` (stable partition, pure)
  with an explanation that names the preference and reports when eligibility
  blocked it.
* `activity.ts` — `ManagementActivityRecord`, the two-phase decisions, the chained
  digest, `classifyUnresolvedActivity`, `explainActivityDecision`.
* `activity_store.ts` — `SqliteManagementActivityStore` (one table, `verifyChain`,
  `terminalizeInterrupted`).
* `history.ts` — `buildProjectOperatingHistory` (references only).

**`src/project_management/`** — two-phase activity recording around `step()`
(SELECTED before the governed action, terminal after), a failure path that records
honestly and rethrows, durable recording of `needs_confirmation` and
`not_permitted`, typed `ManagementStepResult` with `canonicalOutcomeRefs`,
`posture()`/`activity()`/`unresolvedActivity()`/`operatingHistory()`,
`setWorkModePreference()` (operator) and `requestWorkModeChange()` (agent request),
and an optional `history?` read on the user management control port.

**`src/application/`, `src/tools/`, `src/cli.ts`, `src/install.ts`** — additive
surface members, HTTP reads + a Work Mode request, agent tool actions, an operator
CLI `work-mode` command, and deployment-local store construction with an explicit
capability declaration.

**`web/src/`** — the Project Workspace renders the real persisted posture
(preferred vs effective, last change, capability warnings) and the durable activity
history, including unresolved/interrupted records.

## 2. Delivered behaviour

```text
default (nothing stored)  → FOCUS + [] and DIRECT, labelled safe_default
operator CLI `work-mode`  → persists the preference, appends history, records an activity entry
management.step()         → SELECTED → action → terminal (canonical refs), or a durable refusal/pending
management.posture()      → preferred vs effective capability status + warnings + the management axis
restart                   → identical posture, both mode histories, full activity chain
crash between phases      → one unresolved record, no fabricated success
```

## 3. Behaviour comparison with the baseline

| | Baseline `9f29547` | G10-AB |
| --- | --- | --- |
| Work Mode | not persisted; UI apologised | durable non-authoritative preference |
| Effective availability | n/a | derived, honest, warnings kept |
| Lost preference state | n/a | explicit `safe_default` FOCUS + DIRECT |
| Management decision history | UI session state | append-only chained durable log |
| Confirmation / refusal | prose in the result | durable records with typed reasons |
| Canonical correlation | none | `canonicalOutcomeRefs` + typed result fields |
| Crash between phases | n/a | unresolved record; success never fabricated |
| Agent mutation of the default | n/a | impossible on every agent surface |
| Work EventStore / fixtures | — | untouched |

## 4. Proof

* `test/ab_operating_posture.test.ts` (26) — artifact, persistence, history,
  defaults, effective status, orthogonality, ordering, activity chain and
  classification, operating history, service integration.
* `test/ab_adversarial.test.ts` (18) — `AB-N01`…`AB-N30`.
* `scripts/operating/multi-session.mjs` — session 1 (safe default → EXPLORE+VERIFY,
  MANAGE, one executed action) → **separate process** session 2 (same posture, both
  histories, 4 activity records, chain verified) → real `SIGKILL` between the
  activity phases → after-crash read shows `total 1 / unresolved 1 /
  anyFabricatedSuccess false / honest true`.
* `e2e/project-workspace.spec.ts` — the management tab now asserts the real
  Work Mode value, the effective-status block, and the durable activity section.
* `test/v_adversarial.test.ts` / `v_management_autonomy.test.ts` — the agent-facing
  management surface's exact key set and action list were updated deliberately, and
  `setWorkModePreference` was added to the FORBIDDEN escalation list so the operator
  mutation is proven absent.

## 5. Local gates

```text
git diff --check                            clean
pnpm build                                  clean
pnpm exec vitest run                        155 files / 1498 tests passed
pnpm run build:web                          ok (203 modules)
pnpm exec playwright test                   27 passed
node scripts/operating/multi-session.mjs    session1 + session2 + crash honest
```

Baseline was 153 files / 1454 tests.

## 6. Deviations and honest limitations

* **The V firewalls were narrowed deliberately, not loosened.** `project_operating`
  was added to the V allow-list (the management layer now imports it) and the
  application management surface's expected key set was extended - but the
  escalation firewall was *strengthened* (`setWorkModePreference` forbidden on the
  agent surface) and the new plane is independently proven authority-free by
  `AB-N02`.
* **Operator Work Mode mutation is CLI-only.** HTTP authentication is not operator
  semantic authority, so the HTTP surface exposes reads plus a REQUEST, mirroring
  how management involvement already behaves.
* **`CF-AB-01`**: unbounded activity retention in v1.
* **`CF-AB-02`**: the activity chain is local tamper-evidence, not security against
  a hostile database administrator.
* **`CF-AB-03`**: `ADVANCE_MECHANICAL_WORK` and `RUN_LOCAL_VERIFY` record no
  canonical ref (a composite turn names no single event; the verify port exposes
  none) - no ref is invented.
* **`CF-AB-04`**: the preference is not portable between installations.
* **`CF-W-06` is NOT closed** and was not widened into AB: `AB0` proved that no
  supported public protocol can produce a `READY` task with an unsatisfied
  dependency, so `READY` is transition-maintained and the dependency re-check
  stands as defence in depth.
* **`CF-AA-01`/`CF-AA-02`/`CF-X-01` remain deferred** with their triggers
  unchanged, as the spec required.

## 7. Canonical checkpoint

Recorded after merge.

```text
baseline                        9f29547b0eeccc524b0120ef13e9ce55656429ee
implementation commit           2e338a149270751397df79e386e4095689b40282
  "feat(g10-ab): durable project operating posture & management history"
pull request                    #97  experiment/g10-ab-operating-posture -> main
PR checks                       run 35022762982  attempt 1  e2e pass / unit pass
merged commit (canonical main)  23fd1f30009fe510d59c135dfb01408dab3f63a5
  "Merge pull request #97 from orangeofcarl0-sys/experiment/g10-ab-operating-posture"
tree identity                   git diff 2e338a1 23fd1f3  ->  EMPTY (identical trees)
canonical main run              35022966803  attempt 1  conclusion: success
```

All remote runs concluded green on **attempt 1**; no rerun was required.

### Reproducing the local gate

```bash
pnpm install
pnpm build
pnpm exec vitest run                         # 155 files / 1498 tests
pnpm run build:web
pnpm exec playwright test                    # 27 passed
node scripts/operating/multi-session.mjs
#   session1  FOCUS(safe_default)+DIRECT -> EXPLORE+VERIFY, MANAGE, one executed action
#   session2  same posture, both histories, 4 activity records, chain verified
#   crash     real SIGKILL between the activity phases -> 1 unresolved record,
#             anyFabricatedSuccess=false, honest=true
```
