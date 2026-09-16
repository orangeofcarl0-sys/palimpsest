# Project Workspace scope isolation

Status: **frozen rule**, delivered by G10-AE-R (Project Workspace Scope Isolation &
Boundary Closure), then hardened by its gate review. The stage spec is
`docs/engineering/G10-AE-R-SCOPE-CLOSURE-SPEC.md`; the factual audit that found the
defect is `docs/engineering/audits/G10-AE-R-PROJECT-SCOPE-ASSESSMENT.md`; what the
stage deliberately did not build is
`docs/engineering/audits/G10-AE-R-SCOPE-ANTI-WASTE.md`; the review findings and their
dispositions are in the delivery report
(`docs/engineering/audits/G10-AE-R-SCOPE-CLOSURE-DELIVERY.md`).

Core question this document answers (spec §25):

> If two projects share the same physical Project Workspace database, can the
> installed Project OS for project A prove that every normal project read is about
> A and only A?

## 1. The rule

```text
controller.projectId
=
the ONLY semantic project scope of ProjectWorkspaceService
```

A `ProjectWorkspaceService` is constructed around exactly one
`ProjectController` and therefore exactly one `projectId`
(`src/project_workspace/service.ts:207-215`). The backing stores it is handed
(`SqliteProjectAssetAssociationStore`, `SqliteProjectJournalStore`) MAY physically
hold many project scopes. That physical fact grants no semantic read permission:
`SharedPhysicalStore != SharedSemanticScope`.

The rule is stated in the service's own interface documentation
(`src/project_workspace/service.ts:172-182`) and on each affected read
(`:457-470`, `:472-485`, `:487-497`). `view()` now names `controller.projectId`
explicitly as its `scopeId` (`:429-435`, added by the gate review's NIT-2) so the
rule is literal rather than implied by the ProjectIR row.

The stage removed an **accidental** global enumerator. It deliberately did NOT add
a deliberate one (spec §14; anti-waste audit §1).

## 2. The firewalls, and how each is enforced

From spec §1. "Enforced by" names the code that makes the statement true today, not
the intent behind it.

| Firewall | Meaning | Enforced by |
| --- | --- | --- |
| `ProjectWorkspaceService = one project-scoped facade` | the service answers for the installation's project | constructed with one `controller` (`service.ts:207-209`); every read derives from `controller.projectId`, including `view()` (`:434`) |
| `ProjectWorkspaceService != global workspace admin service` | no façade read enumerates store scopes | `assets()` / `journal()` replay `controller.projectId` (`service.ts:466-470`, `:477-485`); no `.projects()` call remains in the façade (`test/aer_scope_isolation.test.ts:300-304`, structural) |
| `CurrentProjectRead != StoreEnumeration` | a project read is not a store listing | the reads above; pinned by AER-N01/AER-N09 |
| `ProjectIdParameter != CrossProjectReadAuthority` | holding or naming a `projectId` is not authority over it | `journal(projectId?)` and `projectScopedAssets(projectId)` fence through `assertScopedProject` (`service.ts:477-497`, `:211-215`); the agent tool refuses any foreign id on every action (`src/tools/application_tools.ts:656-675`); the HTTP read routes refuse it (`src/application/http.ts:666-687`); pinned by AER-N03/N04/N05b/N08b |
| `HTTPAuth != CrossProjectAuthority` | authenticated HTTP is not cross-project authority | the read routes refuse a foreign `projectId` and the journal route delegates to the service fence (`http.ts:666-687`, `:704-708`); pinned by AER-N05b/N06/N07 |
| `AgentToolAccess != CrossProjectAuthority` | reaching the tool is not reaching another project | the tool refuses a foreign id before any action runs (`application_tools.ts:656-675`); action set unchanged; pinned by AER-N08/N08b/N18 |
| `SharedPhysicalStore != SharedSemanticScope` | one file, many scopes, one semantic scope per installation | AER-N09 (raw rows hold project-B while every A-bound read is B-free) |
| `AssociationStore.projects() != ProjectWorkspace.assets()` | a store listing is not an application read | the store keeps `projects()` (`src/project_workspace/association.ts:398`, `:625`); the façade no longer calls it |
| `JournalStore.projects() != ProjectWorkspace.journal()` | same asymmetry for the Journal | the store keeps `projects()` (`src/project_workspace/journal.ts:587`); the façade no longer calls it |
| `CrossProjectCollaboration != CrossProjectRead` | collaborating across projects is not reading them | no cross-project read surface exists; none was added (anti-waste audit §1) |
| `Federation != ProjectWorkspaceScopeBypass` | federation is not a workspace read authority | **NOT PROVEN** — see §8, honest limitation 1. No federation surface is composed in the test rig, so AER-N17 is vacuous. |

## 3. The store-vs-façade asymmetry

This is the deliberate, documented asymmetry the stage restores:

```text
a STORE may enumerate its own scopes       (store ownership is real)
a project-scoped FAÇADE may not            (it has exactly one semantic scope)
```

- `SqliteProjectAssetAssociationStore.projects()` and
  `SqliteProjectJournalStore.projects()` remain part of the store contracts
  (`src/project_workspace/association.ts:398`, `:625`;
  `src/project_workspace/journal.ts:587`). A direct store owner — a migration, a
  maintenance tool, a test — may still enumerate and replay every scope.
- `ProjectWorkspaceService` may not use that enumeration as an application read.
  Before G10-AE-R it did, in three functions (assessment §3); it no longer does.

Both directions are asserted, so neither the capability nor the fence can be
removed silently:

- the façade is forbidden from enumerating — AER-N01, including a structural
  assertion that `src/project_workspace/service.ts` contains no `.projects()` call
  (`test/aer_scope_isolation.test.ts:300-304`);
- the store is still allowed to enumerate — AER-N10
  (`test/aer_scope_isolation.test.ts:347-360`) and the boundary dogfood checks
  `direct_store_owner_can_enumerate_both_scopes` /
  `direct_store_owner_can_replay_B` (`scripts/scope/aer-boundary-dogfood.mjs:380-401`).

Spec §8 forbids removing the store methods to hide the façade bug: the fix belongs
at the caller, not in the store's ownership model.

## 4. Exact semantics

### 4.1 `assets()`

```text
workspace.assets() == the associations of controller.projectId ONLY
```

`src/project_workspace/service.ts:466-470` replays `controller.projectId`. With no
association store configured it returns a frozen empty array; it never reaches for
`associationStore.projects()`. Pinned by AER-N01 (`assets().length === 2` for A,
all `projectId === "project-A"`, store still holds both scopes) and by the HTTP /
tool / dogfood surfaces that delegate to it (AER-N05, AER-N08;
`scripts/scope/aer-boundary-dogfood.mjs:302`, `:347`).

### 4.2 `journal(projectId?)`

Kept for API compatibility (spec §6) and redefined safely
(`src/project_workspace/service.ts:472-485`):

```text
undefined          -> controller.projectId
controller.projectId -> controller.projectId   (explicit current id allowed)
any other id       -> typed failure (invalid_registration)
```

`undefined` never means "every scope in the store". The scope fence runs BEFORE
the "journal store not configured" check, so an unconfigured workspace still
refuses a foreign scope instead of silently answering `[]`
(`src/project_workspace/service.ts:479-481`). Pinned by AER-N02, AER-N03.

### 4.3 `projectScopedAssets(projectId)`

Kept under its existing name (its key set is pinned by
`test/v_adversarial.test.ts` PW-A01, and AER-N18 re-pins it) but fenced: the
argument must equal `controller.projectId`, and the read then replays
`controller.projectId` (`src/project_workspace/service.ts:487-497`). There is no
arbitrary-id escape hatch. Pinned by AER-N04.

### 4.4 `view()` / `openLoops()` / `history()`

Already current-project scoped (`service.ts:425-455`, `:499-505`). `view()` was
changed only to name `controller.projectId` as its explicit `scopeId` (`:429-435`);
that is a literalness change, not a behaviour change (the gate review confirmed the
forged-row attack fails on the content-addressed ProjectIR). Pinned by AER-N11.

### 4.5 A named project is never silently ignored

Two surfaces accept a caller-supplied `projectId` in addition to the service:

- **Agent tool** `palimpsest_project` (`src/tools/application_tools.ts:634-701`): the
  shared `extraProperties.projectId` (`:644`) is honored on mutation and previously
  dropped on the read actions. It now resolves the installation's project once
  (`:663-666`) and throws `ProjectWorkspaceError` / `invalid_registration` naming the
  requested project for ANY action given a foreign id (`:667-675`); the current id is
  still accepted. Pinned by AER-N08b.
- **HTTP read routes** (`src/application/http.ts:666-687`): `/api/project/workspace`,
  `/assets`, `/open_loops`, `/history` previously answered 200 with the installed
  project's payload while ignoring `?projectId=`. A shared `projectReadSurface`
  helper (`:674-687`) now refuses a foreign id with the same typed error; the
  journal route keeps its own fence in the service (`:704-708`). Pinned by AER-N05b.

Both are gate-review MINOR-2 fixes.

## 5. Failure vocabulary

The stage reuses existing typed errors rather than inventing a parallel scope
taxonomy (anti-waste audit §2). The Project Workspace error kinds and class are
`src/project_workspace/association.ts:61-78`; the scope fence is
`assertScopedProject` at `src/project_workspace/service.ts:211-215`.

| Surface | Foreign-scope answer | Kind |
| --- | --- | --- |
| `ProjectWorkspaceService.journal(foreign)` | throws | `ProjectWorkspaceError` / `invalid_registration` |
| `ProjectWorkspaceService.projectScopedAssets(foreign)` | throws | `ProjectWorkspaceError` / `invalid_registration` |
| `palimpsest_project` (any action, foreign id) | throws before the action runs | `ProjectWorkspaceError` / `invalid_registration` (`application_tools.ts:667-675`) |
| `GET /api/project/workspace` / `assets` / `open_loops` / `history` with `?projectId=<foreign>` | HTTP 400 with the foreign id in the error detail | the same error, through `projectReadSurface` (`http.ts:674-687`) |
| `GET /api/project/journal?projectId=<foreign>` | HTTP 400 with the foreign id in the error detail | the service error, through the route |
| `ExternalAssetBridgeService.resolve(foreign)` | throws | `ExternalAssetError` / `unknown_project` (`src/external_assets/refs.ts:48`; fence `service.ts:1186-1188`) |
| Bridge phase-1 writers `beginImport` / `beginPublication` with a foreign scope | throws before any receipt is appended | `ExternalAssetError` / `unknown_project` (`service.ts:765-767`, `:946-948`) |
| `prepareReference` / `prepareImport` / `preparePublication` / `approveAndPublish` with a foreign scope | denied or throws | `unknown_project` (the pre-existing AE fence) |

A foreign scope FAILS; it never returns an empty list. Spec §15 forbids the
empty-list answer because an A-bound façade silently saying "no data" for B looks
exactly like a correct empty scope — it hides the violation. The two pre-existing
expectations that encoded the empty-list answer (one in
`test/v_project_workspace.test.ts`, one in `scripts/external_assets/ae-dogfood.mjs`)
were moved to the typed rejection with an in-file justification
(`test/v_project_workspace.test.ts:869-875`,
`scripts/external_assets/ae-dogfood.mjs:847-870`).

The bridge uses `unknown_project` because that plane already owns that vocabulary; a
foreign project is "not held by this deployment"
(`src/external_assets/service.ts:1186-1188`), the same fence the write paths
already apply. The phase-1 receipt writers gained that fence in the gate review
(MINOR-1), because a receipt is a durable write into a project scope
(`service.ts:757-772`, `:939-966`).

## 6. How a host serves several projects

The supported shape is one installation per project, over shared files:

```text
installation(projectId = project-A)  ──┐
installation(projectId = project-B)  ──┼──> projectAssociationStore : associations.sqlite
                                       │    projectJournalStore     : journal.sqlite
                                       └──  (each installation also has its OWN
                                            databasePath, ordariumDatabasePath and
                                            externalAssetBridgeStore)
```

This is exactly what the required two-project shared-store boundary dogfood does:
project-B is seeded by its own B-bound installation over the same association and
journal files, that installation is disposed, and the A-bound installation then
shares both files and is driven through every read surface
(`scripts/scope/aer-boundary-dogfood.mjs:228-291`; the same rig underlies
`test/aer_scope_isolation.test.ts:155-266`).

Consequences a host must accept:

- Other per-installation state is NOT shared in this shape: the orchestration
  `databasePath`, the `ordariumDatabasePath` and the `externalAssetBridgeStore`
  are per-installation in the dogfood, and the bridge provider registry is
  process-local deployment config. Only the association and journal stores are
  the shared physical files.
- `dispose()` closes the SUPPLIED project association and journal stores
  (`src/install.ts:2296-2298`), while the deployment-local bridge store is closed
  only when the install CREATED it (`src/install.ts:2303-2307`). The rigs therefore
  dispose the B-bound installation before the A-bound one opens the same files
  (`scripts/scope/aer-boundary-dogfood.mjs:258-259`). A host that wants two live
  installations in one process must give each its own store HANDLE over the shared
  file (each rig does: a fresh `SqliteProjectAssetAssociationStore(associationPath)`
  per installation), because disposing one installation closes the handle it was
  given.

## 7. What this deliberately does not provide

Spec §14 forbids implementing any of the following here, and none was added
(anti-waste audit §1):

```text
project switcher
global dashboard / cross-project overview
cross-project search
cross-project graph
shared Journal
Personal Asset System
workspace administrator role
all_projects / global_assets / workspace_scan tool actions
```

The reason is uniform: a switcher, a dashboard or a privileged cross-project reader
would convert an accidental leak into a designed feature with its own authority
questions. Isolation must come from the façade's scope, not from a role or a
surface that may bypass it. A global enumerator, if one is ever needed, belongs to
a separate administrative/library surface (spec §5), not to this façade.

## 8. Honest limitations of this document

1. **AER-N17 / PSI-A11 are NOT proven.** The gate review verified that this test
   rig composes NO federation surface (`application.federation === undefined`, no
   `palimpsest_federation` tool), so the test cannot assert a bypass property: its
   guard branches away and both loops are empty. The honest statement is "no
   federation surface is composed here, so nothing was tested", not "a federation
   read was refused". Carried as `CF-AE-R-05` with the trigger "a rig that composes
   the §132–§135 peer wiring".
2. **The retained `projectId` parameters are now inert.** `journal(projectId?)`
   and `projectScopedAssets(projectId)` accept an argument that can only ever name
   the current project. That redundancy is a deliberate API-compatibility
   retention (spec §6), documented as a compatibility argument and not an
   authority — and it is recorded as a live carry-forward item, not as a feature.
3. **One installation is one process-level project.** A single-process deployment
   that wants several projects must run several installations over the same files
   (§6). This stage does not give one process a convenient multi-project view, by
   design.
4. **The rule is enforced by tests, not by the type system.** `controller.projectId`
   is a string; nothing prevents a future caller from re-adding a
   `store.projects()` enumeration. The structural assertion in AER-N01 is the
   guard (it fails if `.projects()` reappears in the façade source), which is why
   it is written as a source read rather than a comment.
