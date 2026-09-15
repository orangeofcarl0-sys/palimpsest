# G10-AB — Campaign record

Baseline `9f29547b0eeccc524b0120ef13e9ce55656429ee`. One stage, one closure.
Closes `CF-V-02` and `CF-V-03`.

## Internal topology (all executed)

| Stage | Work | Result |
| --- | --- | --- |
| AB0 | Product operating audit + `CF-W-06` reachability | 8 questions answered; `CF-W-06` proven unreachable |
| AB1 | `ProjectWorkModePreference` + `UserWorkModeControlPort` | Strict artifact + operator port |
| AB2 | Preference persistence + append-only history | Own tables, safe fallback |
| AB3 | `ProjectOperatingPostureView` | Preferred vs effective, warnings, history summaries |
| AB4 | Work-mode-aware recipe preference | Stable partition on top of execution priority |
| AB5 | `ManagementActivityRecord` | Two-phase, crash-honest, chained |
| AB6 | `SqliteManagementActivityStore` | One table, chain verify, interrupted terminalization |
| AB7 | `step`/`run` integration + canonical refs | Typed results + refs |
| AB8 | Operating history | Derived view, references only |
| AB9 | Web Project Workspace | Real persistent state replaces the "not recorded" apology |
| AB10 | Multi-session / crash / orthogonality E2E | Separate-process proof + real SIGKILL |
| AB11 | Anti-waste, docs, gates, CI, carry-forward | This document set |

## Write scope

```
src/project_operating/work_mode_profile.ts   new: artifact, defaults, port types
src/project_operating/work_mode_store.ts     new: preference store + history
src/project_operating/posture.ts             new: derived posture + effective status
src/project_operating/preference.ts           new: preference ordering (pure)
src/project_operating/activity.ts            new: record + classification
src/project_operating/activity_store.ts      new: append-only store, chain verify
src/project_operating/history.ts             new: derived operating history
src/project_operating/index.ts               new: barrel
src/project_management/{service,profile}.ts  activity recording, typed results, posture reads, optional history read
src/application/surface.ts                   additive management-surface members
src/application/http.ts                      posture/activity/history routes + Work Mode request
src/tools/application_tools.ts               posture / activity / request_work_mode_change actions
src/cli.ts                                   operator `work-mode` command
src/install.ts                               deployment-local stores, capability declaration
web/src/api.ts, web/src/project_workspace/   real state rendering
test/ab_operating_posture.test.ts            26 tests
test/ab_adversarial.test.ts                  18 tests
test/v_adversarial.test.ts, v_management_autonomy.test.ts   surface assertions updated
scripts/operating/multi-session.mjs          multi-session + crash dogfood
e2e/project-workspace.spec.ts                posture/activity assertions
docs/**                                      this document set
```

No new event type in the Work EventStore. No migration of the Work ledger. The
operating plane is a separate deployment-local database. `fixtures/**` untouched.

## Delivered behaviour

```text
operator CLI `work-mode`   → persists the preference + appends a history row + records an activity entry
management.step()          → SELECTED record → governed action → terminal record (with canonical refs)
management.posture()       → preferred vs effective status, warnings, history summaries, management axis
management.operatingHistory() → references into Work Mode / involvement history + activity + revision refs
```

## Evidence

| Artifact | What it proves |
| --- | --- |
| `scripts/operating/multi-session.mjs` | Session 1 sets EXPLORE+VERIFY and MANAGE and executes an action; a SEPARATE process reads the same posture, histories and activity; a real SIGKILL between the two activity phases leaves one unresolved record and NO fabricated success |
| `test/ab_operating_posture.test.ts` | Preference artifact/persistence/history, effective status, orthogonality, ordering, activity chain, classification, history refs, service integration |
| `test/ab_adversarial.test.ts` | `AB-N01`…`AB-N30` |

## Gates

```text
git diff --check                      clean
pnpm build                            clean
pnpm exec vitest run                  155 files / 1498 tests passed
pnpm run build:web                    ok (203 modules)
pnpm exec playwright test             27 passed
node scripts/operating/multi-session.mjs   session1 + session2 + crash honest
```

Baseline was 153 files / 1454 tests; AB adds 2 files / 44 tests.

## Baseline comparison

| | Baseline `9f29547` | G10-AB |
| --- | --- | --- |
| Work Mode | not persisted anywhere; UI said so | durable, non-authoritative preference |
| Effective availability | n/a | derived, honest, warnings retained |
| Lost preference state | n/a | explicit `safe_default` FOCUS + DIRECT |
| Management decision history | UI session state only | append-only, chained, durable |
| Confirmation/refusal | returned in prose | durably recorded with typed reasons |
| Canonical correlation | none (`{status, action, detail}`) | `canonicalOutcomeRefs` + typed result fields |
| Crash between phases | n/a | unresolved record, never a fabricated success |
| Agent mutation of the user default | n/a | impossible on every agent surface |
| Work EventStore / fixtures | — | untouched |
