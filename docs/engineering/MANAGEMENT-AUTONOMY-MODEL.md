# G10-V — Management Autonomy Model

Status: implemented (`src/project_management/**`, wired through `src/install.ts`,
`src/application/{surface,http}.ts`, `src/tools/application_tools.ts`, `src/cli.ts`).

```
Mode ≠ Authority                     Candidate ≠ Command        Request ≠ Change
EffectivePermission = Authority ∩ Policy ∩ Capability
No self-escalation                   Downgrade is immediate     No autonomy scalar
Untrusted cognition proposes; governed services enact
```

## 1. What a management mode is

`ManagementInvolvement` is a **user/project preference**: a deployment-local operator
setting that can only *restrict or permit the proactive behaviour* of the management
cognition. It is stored next to the attention/transport deployment state
(`SqliteManagementPreferenceStore`) and is explicitly **non-authoritative**. Losing or
corrupting that database degrades to `DIRECT` (observe/recommend only, everything else
explicitly confirmed) — never to a wider mode.

There are exactly four involvements (`MANAGEMENT_INVOLVEMENTS`):

| Involvement | Meaning |
| --- | --- |
| `DIRECT` | The operator drives. The layer observes/recommends; every other class needs explicit confirmation. |
| `ASSIST` | The layer may observe/recommend/prepare proactively; no local execution by default. |
| `MANAGE` | The layer may proactively advance bounded local work; plan-shaped changes sit on a confirmation boundary. |
| `DELEGATE` | The layer may proactively advance local work within the existing plan/envelope; authority-shaped classes remain forbidden. |

## 2. The orthogonal work-mode axis

The management involvement is **orthogonal** to the work mode: recipes/plans select a
base mode (`FOCUS` / `EXPLORE` / `COORDINATE`) plus an optional modifier (`VERIFY` /
`MONITOR`). Changing the involvement does not change the work mode, and vice versa.
The management layer never synthesizes a work mode from an involvement: it reads a
derived workspace view and the operator profile, and nothing else.

## 3. The action-policy matrix

`MANAGEMENT_ACTION_CLASSES` and the deterministic table `DEFAULT_ACTION_POLICY` live in
`src/project_management/policy.ts`. Cells mean: `explicit` (operator confirmation),
`yes` (permitted proactively), `suggest` (suggestion only — never executed),
`no` (never permitted by mode), `confirmation` (permitted after explicit confirmation),
`within_envelope` / `existing_plan` (permitted only when the candidate is inside the
existing plan/envelope), `semantic_authority` / `governed` (requires pre-existing
authority / a governance act that lives OUTSIDE this layer).

| Action class | DIRECT | ASSIST | MANAGE | DELEGATE |
| --- | --- | --- | --- | --- |
| `OBSERVE` | explicit | yes | yes | yes |
| `RECOMMEND` | explicit | yes | yes | yes |
| `PREPARE` | explicit | yes | yes | yes |
| `ADVANCE_MECHANICAL_WORK` | explicit | no | yes | yes |
| `START_LOCAL_RECIPE` | explicit | no | yes | yes |
| `RUN_LOCAL_VERIFY` | explicit | no | yes | yes |
| `APPLY_LOCAL_PLAN_REVISION` | explicit | no | confirmation | within_envelope |
| `DISPATCH_LOCAL_WORK` | explicit | no | existing_plan | yes |
| `SEND_PEER_REQUEST` | explicit | suggest | confirmation | confirmation |
| `CREATE_EXTERNAL_COMMITMENT` | semantic_authority | no | no | no |
| `APPROVE_DISCLOSURE` | explicit | no | no | no |
| `EVOLVE_ORGANIZATION` | governed | governed | governed | governed |
| `IRREVERSIBLE_EFFECT` | semantic_authority | semantic_authority | semantic_authority | semantic_authority |

The four **authority-shaped classes** (`AUTHORITY_REQUIRED_ACTIONS`):
`CREATE_EXTERNAL_COMMITMENT`, `APPROVE_DISCLOSURE`, `EVOLVE_ORGANIZATION`,
`IRREVERSIBLE_EFFECT`. A management mode can never permit them on its own.

`defaultAllowedActionClasses(involvement)` and `defaultConfirmationBoundaries(involvement)`
derive the operator's default allowed set and confirmation boundaries from this table;
the authority-shaped classes are always in the confirmation set.

## 4. The intersection rule

`evaluateManagementAction` (`src/project_management/policy.ts`) is pure and total. The
gates are hard intersection terms, in this order:

1. **Operator allowed set** — the action class is in
   `profile.allowedActionClasses` for `profile.projectId`.
2. **Existing semantic authority** — for `AUTHORITY_REQUIRED_ACTIONS` the caller must
   attest `hasSemanticAuthority`, and **the management service always attests
   `false`** (it has no authority port). A mode can never grant it and confirmation
   cannot substitute.
3. **Capability availability** — the capability must be wired in this deployment.
4. **Matrix cell** — `DEFAULT_ACTION_POLICY[actionClass][involvement]`, with the
   confirmation boundary applied on top (`explicit`/`confirmation`/`governed`, or any
   class listed in `profile.confirmationBoundaries`, requires `confirmed === true`).

`EffectivePermission = existing semantic authority ∩ management policy ∩ capability`.
No term can be skipped; an absent capability or a missing authority yields
`not_permitted`, never a fallback.

## 5. No self-escalation, immediate downgrade

- **No self-escalation.** The agent-facing surfaces expose only a *request*:
  `ProjectManagementApplicationSurface.requestModeChange({to})` calls
  `service.requestModeChange({to, requestedBy: "agent"})`, which returns
  `{status: "requested", ...}` and applies nothing. The only writer is the operator
  control port (`UserManagementControlPort`, implemented by
  `SqliteManagementPreferenceStore`) reached through `applyOperatorModeChange`, which
  is wired to the CLI (`palimpsest manage …`) / host — **never** to an LLM tool. The
  installed `projectManagement` service does expose `applyOperatorModeChange`, but the
  application surface, HTTP routes and tools do not.
- **Immediate downgrade.** `runBounded` re-reads the operator profile **every step**:
  a downgrade stops the next proactive action with no grace budget. There is no cached
  autonomy, no lease, no decay timer.

## 6. No autonomy scalar, no ManagerAgent

- There is **no single autonomy score**. Permission is per action class; the matrix is
  the only interpretation of an involvement, and the four authority-shaped classes are
  always gated on external authority regardless of involvement.
- There is **no `ManagerAgent`**. The persistent project principal is the same for
  every involvement. The management layer is a *composer* over the operator profile,
  the derived workspace view, and the existing governed services
  (`controller.runTurn`, `controller.plan`, the recipe execution service, an injected
  local verification port). It owns no store and no authority of its own; every
  non-observational action executes through an EXISTING governed service.
- Non-executable classes fail closed with a stated reason (`refusalReason`): peer
  requests go through the federation/coordination services directly; commitments,
  disclosures, organization evolution and irreversible effects require authority that
  a mode can never grant.

## 7. The untrusted-cognition rule

Management cognition is **untrusted**. `makeHostBoundedManagementCognition`
(`src/project_management/host_adapter.ts`) turns a host proposal into a digest-bound
`HostManagementProposal` and holds no store mutator and no authority port — it can
propose only. A proposal must still pass `evaluateManagementAction`, and a
plan-shaped proposal must additionally pass the existing `controller.plan` ProjectIR
validation before any effect. The adapter deliberately cannot enact what it proposes.

Cognition proposes (`OBSERVE`/`RECOMMEND`/`PREPARE` and candidate derivation in
`src/project_management/actions.ts`); the bounded management service and the existing
governed services enact. `Candidate ≠ Command`, `Recommendation ≠ Mutation`.

## 8. Surfaces and operator control

- Application surface (`ProjectManagementApplicationSurface`): `status()`,
  `recommend()`, `preview()`, `step({confirmed?})`, `run({maxSteps?})`,
  `requestModeChange({to})`. It has **no** `setModeUpward`, `grantAuthority`,
  `approveDisclosure`, or `forceCommitment`.
- HTTP: `GET /api/manage/status`; `POST /api/manage/step`,
  `POST /api/manage/run`, `POST /api/manage/request_mode_change`.
- Tool: `palimpsest_manage` (actions `status`, `recommend`, `preview`, `step`, `run`,
  `request_mode_change`). No tool sets the mode upward or grants authority/disclosure/
  commitment.
- CLI operator control: `palimpsest manage <DIRECT|ASSIST|MANAGE|DELEGATE>
  [--project <id>] [--management <path>]`, implemented with
  `SqliteManagementPreferenceStore` + `applyOperatorModeChange`. This is **operator
  control and never grants semantic authority**.

## 9. Invariants (also surfaced to operators as `MANAGEMENT_POLICY_NOTES`)

1. A management mode is not authority; an involvement never grants semantic authority.
2. Effective permission is the intersection of existing authority, policy, capability.
3. An agent can never escalate its own involvement; only the operator port applies a change.
4. A downgrade is immediate: proactive behaviour stops on the next evaluation.
5. The work mode is orthogonal to the management involvement.
6. No single autonomy score exists; permission is per action class and the
   authority-shaped classes always need an existing authority.
