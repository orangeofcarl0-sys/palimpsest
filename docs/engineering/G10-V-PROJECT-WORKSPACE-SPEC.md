# G10-V — Project Workspace & Graduated Project Management (Spec)

Baseline: `main @ 2b671d7057ebf7f169d25e980800c873779f6752`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.
Scope: `src/project_workspace/**`, `src/project_management/**`, `src/install.ts`,
`src/deployment/*`, `src/application/{surface,http}.ts`, `src/tools/application_tools.ts`,
`src/cli.ts`, `web/src/project_workspace/**`, `e2e/project-workspace.spec.ts`,
`scripts/management/dogfood.mjs`.

## Firewalls

```
ProjectWorkspace ≠ CanonicalStore      ProjectAssetAssociation ≠ AssetContent
OpenLoop ≠ WorkTask                    Opportunity ≠ Task
View ≠ Truth                           NegativeResult grants no truth
Association ≠ Truth                    Association ≠ Publication
Associated ≠ Owned                     Recorded ≠ Evaluated
Explicit promotion, never automatic
Mode ≠ Authority                       Request ≠ Change
Candidate ≠ Command                    Recommendation ≠ Mutation
EffectivePermission = Authority ∩ Policy ∩ Capability
No self-escalation                     Downgrade is immediate     No autonomy scalar
Host cognition ≠ authority             Adapter ≠ StoreMutator
Management mode ⊥ work mode (two orthogonal axes)
```

## 1. The project-as-asset model

A **project** is a first-class owner of *links* to the intellectual assets produced under
it, without ever becoming a second copy of the canonical truth about those assets.

`ProjectWorkspaceView` (`src/project_workspace/view.ts`) is a **derived, read-only,
deep-frozen read model** assembled on demand from the existing canonical owner matrix
plus exactly two new narrowly-owned, append-only histories:

1. `ProjectAssetAssociation` (`association.ts`) — an opaque `CanonicalAssetRef {kind, id, digest?}`
   plus `assetKind`, `associationKind` and provenance. It never stores asset content.
2. `ProjectJournal` (`journal.ts`) — project knowledge with no other canonical owner. The
   kind enum STRUCTURALLY excludes `PROOF` / `DECISION` / `TASK` / `EXPERIMENT` /
   `COMMITMENT` / `BOUNDARY` / `SOURCE`; those may only be *referenced* (`relatedRefs`) or
   *associated*.

The view owns no copied fact, keeps no second history of any asset, and never fabricates a
source it was not explicitly given: an unconfigured plane produces a `knowledgeWarnings`
entry, never a guessed value (`undefined` ≠ empty).

### Canonical owner matrix (who owns what)

| Fact | Canonical owner | Project-scoped today? |
| --- | --- | --- |
| goal / requirements / decisions / tasks / revision lineage / head commit | `ProjectIr` (`src/schema/models.ts`) in the Work `EventStore` | yes (`project_id`) |
| tasks / attempts / Work evidence / promotions | Work `EventStore` projections (`src/tools/controller.ts`) | yes (`project_id` columns) |
| produced artifacts / changed files / result commit | `AttemptReport` (Work `attempts` projection) | yes |
| proof sources / evidence / published claims | `ProofEvidenceStore` (`src/proof_asset/**`) | no — single global `"proof"` chain |
| experiments / runs / evaluations | `OrganizationMemoryStore` (`src/organization_memory/**`) | no project binding |
| reasoning cell state | `ReasoningCellStore` (`src/reasoning_cell/**`) | no project binding |
| campaign hypotheses / belief / linked projects | `CampaignStore` (`src/campaign/**`) | linked by `CampaignProjectRef {projectId, revision, digest}` |
| commitments / peer relations | Coordination / Federation stores | peer-scoped |
| boundaries | `BoundaryMemoryStore` (`src/boundary_memory/**`) | workspace-scoped |
| organization / runtime structure | Organization / `RuntimeScope` stores | no project binding |

Because proof / experiment / reasoning-cell assets are global, they are never rendered as
"this project's assets" merely because they exist. They appear only after an explicit
`ASSET_ASSOCIATED` record links an opaque canonical reference to the project; the derived
proof/reasoning/memory snapshots are read through injected **read-only ports**, never stores.

### The derived view

`buildProjectWorkspaceView(sources)` is pure and total. Operands may be `undefined`;
`undefined` means "this plane is not configured". The result carries `project`, `work`
(scheduler/tasks/attempts/evidence/promotions/resume/blockers), `assets` (records + `byKind`),
`openLoops` (`OpenLoopKind` ∈ `BLOCKED_WORK`, `READY_WORK`, `CAMPAIGN_WATCH`,
`REASONING_UNRESOLVED`, `STALE_PROOF`, `PENDING_COMMITMENT`, `PENDING_BOUNDARY_DECISION`,
`JOURNAL_OPEN_QUESTION`, `JOURNAL_OPPORTUNITY`), `relations`, `historySummary` and
`knowledgeWarnings`. An open loop is a **derived prompt to look**, never a task.

`makeProjectWorkspaceService` owns exactly three mutation paths: the association store it was
given, the journal store it was given, and `controller.plan(...)` for `ProjectIr` changes.
`appendDecision` composes the NEXT full `decisions` array through the existing `ProjectIr`
validation and revision lineage (no new decision store); `promoteOpportunity` is an explicit,
never-automatic conversion of a journal `OPPORTUNITY` into a task, validated by `controller.plan`
FIRST so a failed plan records no false `PROMOTED` resolution.

## 2. The two orthogonal axes

| Axis | Values | What it selects | Where it lives |
| --- | --- | --- | --- |
| **Work mode** | `FOCUS` / `EXPLORE` / `COORDINATE` (± `VERIFY` / `MONITOR`) | how *work* is executed (recipe/plan shape) | recipe/plan selection; **not** persisted as a project setting by this vertical |
| **Management involvement** | `DIRECT` / `ASSIST` / `MANAGE` / `DELEGATE` | how *proactively the management cognition* may act | deployment-local operator preference (`SqliteManagementPreferenceStore`) |

Changing one axis never changes the other. The management layer reads a derived workspace view
and the operator profile and nothing else; it never synthesizes a work mode from an involvement.
The management profile artifact has no `workMode`/`baseMode`/`recipeRefs` field at all (asserted
by `test/v_management_autonomy.test.ts` and by the browser E2E).

## 3. The four involvements

`ManagementInvolvement` is a **user/project preference**, explicitly NON-authoritative. It can only
restrict or permit the *proactive* behaviour of the management cognition. Losing or corrupting the
preference database degrades to `DIRECT`, never to a wider mode.

| Involvement | Meaning |
| --- | --- |
| `DIRECT` | The operator drives. The layer observes/recommends; every other class needs explicit confirmation. |
| `ASSIST` | The layer may observe/recommend/prepare proactively; no local execution by default. |
| `MANAGE` | The layer may proactively advance bounded local work; plan-shaped changes sit on a confirmation boundary. |
| `DELEGATE` | The layer may proactively advance local work within the existing plan/envelope; authority-shaped classes remain forbidden. |

## 4. The policy matrix

`ManagementActionClass` and the deterministic table `DEFAULT_ACTION_POLICY`
(`src/project_management/policy.ts`) are the ONLY interpretation of an involvement.
Cells: `explicit` (operator confirmation), `yes` (permitted proactively), `suggest`
(suggestion only — never executed), `no` (never permitted by mode), `confirmation` (permitted
after explicit confirmation), `within_envelope` / `existing_plan` (permitted only inside the
existing plan/envelope), `semantic_authority` / `governed` (requires pre-existing authority / a
governance act that lives OUTSIDE this layer).

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
`CREATE_EXTERNAL_COMMITMENT`, `APPROVE_DISCLOSURE`, `EVOLVE_ORGANIZATION`, `IRREVERSIBLE_EFFECT`.
A management mode can never permit them on its own.

## 5. Effective permission and the evaluator

`evaluateManagementAction` is pure and total. The gates are hard intersection terms, in order:

1. **Operator allowed set** — the class is in `profile.allowedActionClasses`.
2. **Existing semantic authority** — for `AUTHORITY_REQUIRED_ACTIONS` the caller must attest
   `hasSemanticAuthority`; **the management service always attests `false`** (it has no authority
   port). A mode can never grant it and confirmation cannot substitute.
3. **Capability availability** — the capability must be wired in this deployment (fail closed for
   unmapped authority-shaped capabilities).
4. **Matrix cell** for `(actionClass, involvement)`, with the confirmation boundary on top.

```
EffectivePermission = existing semantic authority ∩ management policy ∩ capability availability
```

There is **no autonomy scalar** and **no `ManagerAgent`**: permission is per action class, and the
persistent project principal is the same for every involvement.

## 6. Internal topology actually executed

```
  operator port (CLI `palimpsest manage` / host)                 [ONLY mode writer]
        │  SqliteManagementPreferenceStore  (deployment-local, NON-authoritative)
        ▼
  ProjectController  ──►  ProjectWorkspaceService  ──►  deriveManagementActionCandidates(view)
   (Work ledger)          (derived view + 2 owned           │  content-addressed, authority-free
                           append-only histories)           ▼
                                                     evaluateManagementAction(profile, …)
                                                     (mode ∩ authority ∩ capability ∩ cell)
                                                            │ permitted only
                                                            ▼
                                              ProjectManagementService.step()/runBounded()
                                                            │ executes through EXISTING services
                                                            ▼
                              controller.runTurn │ controller.plan │ recipe execution │ verify port
```

- **Actions (`actions.ts`)**: candidates are derived, content-addressed prompts. They carry no
  authority and no score; builders only re-arrange the workspace view and never fabricate a task,
  requirement, commitment or peer.
- **Policy (`policy.ts`)**: pure table lookup + evaluator; mints no authority, opens no store,
  performs no effect.
- **Service (`service.ts`)**: owns NO store and NO authority. It composes the operator profile,
  the derived view, the deterministic policy and the existing governed services. The four
  non-executable classes fail closed with a stated `refusalReason`.
- **Host adapter (`host_adapter.ts`)**: an (untrusted) host proposal becomes a digest-bound
  `HostManagementProposal`; the adapter holds no store mutator and no authority port, so it must
  still pass `evaluateManagementAction` AND `controller.plan` validation before any effect.
- **Operator control**: `UserManagementControlPort` implemented by
  `SqliteManagementPreferenceStore`; only `applyOperatorModeChange` persists a change (CLI/host).
  The agent-facing surface exposes `requestModeChange({to})` only, which returns
  `{status:"requested"}` and applies nothing. `runBounded` re-reads the profile EVERY step, so a
  downgrade stops the next proactive action with no grace budget.

### Executed in the G10-V management dogfood

One persistent project principal (`peer-g10v-project` / `pp-g10v-project`) is driven through all
four involvements, and exactly one real DSH host principal boots over a deployment profile wiring
the same project + workspace/journal/management stores. See
`audits/G10-V-MANAGEMENT-DOGFOOD-EVIDENCE.md`.

## 7. Exit criterion

The vertical is DONE when, on the real installed product stack:

1. the derived workspace composes from canonical owners with honest `knowledgeWarnings` and no
   copied fact;
2. the two owned histories are append-only, CAS-guarded, idempotent on replay and reconstruct
   identically after close/reopen;
3. the four involvements are enforced by the deterministic policy matrix, with the authority-shaped
   classes unreachable by mode alone;
4. mode changes are operator-only, a downgrade is immediate, and no agent tool can escalate;
5. ONE principal (one PeerRef, one PersistentPoint) serves every mode, verified against a real DSH
   host, not four agents;
6. `pnpm run build` and the full unit suite are green, and the dogfood emits
   `.dogfood/g10v-management-dogfood.json` with per-mode assertions, principal count,
   revision/task-count deltas and the downgrade/restart results.

## 8. Product surfaces

- `installPalimpsest` additive options: `projectAssociationStore?`, `projectJournalStore?`,
  `managementPreferenceStore?` (absent ⇒ no workspace/management surface, never a stub).
- `InstalledPalimpsest`: `projectWorkspace?`, `projectManagement?`. Stores are closed by
  `dispose()` only when this install was given them.
- Application surface: `ProjectWorkspaceApplicationSurface` (`view`, `assets`, `openLoops`,
  `history`, `journal`, `associateAsset`, `recordJournalEntry`, `resolveJournalEntry`,
  `appendDecision`, `promoteOpportunity`) and `ProjectManagementApplicationSurface` (`status`,
  `recommend`, `preview`, `step`, `run`, `requestModeChange`) — note it has NO
  `setModeUpward`/`grantAuthority`/`approveDisclosure`/`forceCommitment`.
- HTTP: `/api/project/**`, `/api/manage/{status,step,run,request_mode_change}`.
- Tools: `palimpsest_project`, `palimpsest_manage`.
- CLI operator control: `palimpsest manage <DIRECT|ASSIST|MANAGE|DELEGATE> [--project <id>] [--management <path>]`.
- Deployment profile: `databases.{projectAssociations,projectJournal,management}`.
- Web: the Project Workspace surface (`web/src/project_workspace/**`) with Overview / Work /
  Assets / Open Loops / History / Management tabs.
