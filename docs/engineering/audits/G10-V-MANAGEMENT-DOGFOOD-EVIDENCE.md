# G10-V Management Dogfood — Evidence

Reproduce: `pnpm run build && node scripts/management/dogfood.mjs`.
Evidence: `.dogfood/g10v-management-dogfood.json`. All data is synthetic.

Result: **PASS** — `dshPrincipal: true`, 54/54 assertions, elapsed ~5.4s.
`dshPrincipalReason`: a real DSH host principal booted over a deployment profile wiring the same
project + workspace/journal/management stores; one ready line, one `localPeer`, one
`persistentPoint`, all four modes observed.

```
principal: peer-g10v-project / pp-g10v-project   (count: 1)
```

## One real DSH host principal across all four modes

`PALIMPSEST_HOST_READY` was emitted exactly once, with `localPeer: "peer-g10v-project"`,
`persistentPoint: "pp-g10v-project"`, `application: "full"`, and the tools `palimpsest_project`
and `palimpsest_manage` present. While that ONE host process stayed alive, the harness applied each
involvement through the operator control port only (`SqliteManagementPreferenceStore`, the same port
the CLI `palimpsest manage` uses) and read the host's own `GET /api/manage/status` back:

| Operator involvement | Host reports | projectId | revision | candidates |
| --- | --- | --- | --- | --- |
| `DIRECT` | `DIRECT` | `g10v-management-dogfood` | 7 | 4 |
| `ASSIST` | `ASSIST` | `g10v-management-dogfood` | 7 | 4 |
| `MANAGE` | `MANAGE` | `g10v-management-dogfood` | 7 | 4 |
| `DELEGATE` | `DELEGATE` | `g10v-management-dogfood` | 7 | 4 |

The goal, localPeer and persistentPoint were constant across all four modes — one principal, not
four agents. An unconfirmed `POST /api/manage/step` on the host in `DIRECT` returned
`needs_confirmation` and left the ProjectIR revision unchanged (7 → 7).

## Layer A — deterministic, real services (one project, four involvements)

The four involvements were asserted directly against `ProjectManagementService` over the real
`ProjectController` and real SQLite association/journal/management stores under `.dogfood/g10v/`.

### `DIRECT` — no proactive mutation; an explicit confirmation may apply

```
step()                    → needs_confirmation (DISPATCH_LOCAL_WORK: "requires an explicit confirmation")
                            revision unchanged, task count unchanged
step({confirmed:true})    → executed (DISPATCH_LOCAL_WORK)  revision +1, tasks unchanged, goal/requirements unchanged
```

### `ASSIST` — recommendation only

```
recommend() → 4 candidates [RECOMMEND, PREPARE, APPLY_LOCAL_PLAN_REVISION, DISPATCH_LOCAL_WORK]
revision delta 0 · event delta 0 · attempt delta 0 · requirements byte-identical
```

### `MANAGE` — mechanical advance on the EXISTING plan; authority-shaped requests refused

```
step() → executed  ADVANCE_MECHANICAL_WORK  "controller.runTurn phase=needs_promotion attemptsRun=1"
         revision delta 0 · task-count delta 0    (work state advanced, plan untouched)
requirement change (confirmed) → not_permitted  ("the management layer never changes requirements")
external commitment request    → not_permitted  (outside the operator's allowed action classes)
```

### `DELEGATE` — task-plan-only revision; goal/disclosure/org refused

```
step() → executed  DISPATCH_LOCAL_WORK  revision +1
         goal byte-identical · requirements byte-identical · tasks byte-identical
goal change (confirmed)      → not_permitted
disclosure approval          → not_permitted
organization evolution       → permitted=false (policy evaluation, all involvements)
irreversible effect          → permitted=false (policy evaluation, all involvements)
```

## Mode downgrade (DELEGATE → DIRECT mid-run, via the operator port)

```
startedInvolvement : DELEGATE
profile reads      : 4            (the profile is re-read EVERY step)
steps              : [executed/DISPATCH_LOCAL_WORK, needs_confirmation/DISPATCH_LOCAL_WORK]
stoppedReason      : needs_confirmation
revisionDelta      : 1            (exactly one proactive revision before the downgrade)
persistedInvolvement: DIRECT
```

## Continuity (close → reopen)

```
restart_view_project_identical    : true
restart_preference_identical      : true
restart_associations_identical    : true
restart_decisions_identical       : true
restart_open_loops_identical      : true
```

## Method note

The `MANAGE`/`DIRECT`/`DELEGATE` refusal scenarios isolate a single open loop in the DERIVED view
so the refusal decision is not shadowed by a higher-priority, permitted candidate; the
policy/service/controller path is the real one. The `ADVANCE_MECHANICAL_WORK` candidate is
derivable only for a READY task with a non-terminal attempt, so the deterministic rig injects that
derived-view fact (as the G10-V unit test does) while the execution remains real:
`controller.runTurn` activates and runs a genuine attempt (`attemptsRun=1`) with the ProjectIR
revision unchanged. Mode changes are applied ONLY through the operator control port, never an agent
tool.
