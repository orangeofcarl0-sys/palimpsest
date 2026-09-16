# G10-AE-R — Project Workspace scope assessment (AER0)

Baseline: `0ba32639614a8963ba243efe53a6c72b6fcae040` (canonical main after G10-AE).
Reproducer: `scripts/scope/aer0-repro.mjs` (run `pnpm build` first).
Method: ONE physical `SqliteProjectJournalStore` and ONE physical
`SqliteProjectAssetAssociationStore`, both holding **project-A** and **project-B**;
project-B is seeded by its OWN B-bound installation over the same two files (that is
what "a shared store already holds another project's data" actually looks like),
then an installation bound to project-A is asked every Project Workspace read.

## 1. The baseline result, in one line

```text
=== AER0 baseline: 7/8 surfaces leak project-B ===
```

Seven of the eight surfaces this stage audits returned, or could be made to return,
another project's data. The eighth was already correct, and one important family was
already fenced — both facts matter for scoping the fix.

## 2. Every reproduction, verbatim

| # | Surface asked | Baseline verdict | Evidence |
| --- | --- | --- | --- |
| A | `GET /api/project/journal` (no `projectId`) | **LEAK** | HTTP 200 whose single array holds the project-A **and** project-B entries (`"projectId":"project-A"…` and `"projectId":"project-B"…`) |
| B | `GET /api/project/journal?projectId=project-B` | **LEAK** | HTTP 200 returning `B-SECRET-TITLE` / `B-SECRET-BODY`: an A-bound installation reads B on request |
| C | `GET /api/project/assets` | **LEAK** | HTTP 200 including B's `PRODUCED_ARTIFACT` association (`canonicalRef.id = art-b`) |
| D | `palimpsest_project action=assets` | **LEAK** | the tool result contains B's association — an **agent** reaches the foreign scope |
| E | `projectScopedAssets("project-B")` | **LEAK** | `1 association(s) returned for a FOREIGN project` |
| F | `workspace.assets()` (service level) | **LEAK** | `2 association(s): project-A, project-B` |
| G | `workspace.journal()` (service level) | **LEAK** | `2 entr(y/ies): project-A, project-B` |
| H | `workspace.view()` (derived workspace) | sealed | `projectId=project-A` — the derived view was already current-project scoped |

## 3. Where the defect actually lives

All four leaking reads are three functions in ONE file,
`src/project_workspace/service.ts`:

| Function | Line (baseline) | Baseline body | Why it leaks |
| --- | --- | --- | --- |
| `assets()` | 436 | `for (const projectId of await store.projects())` | enumerates the STORE's scopes and concatenates them |
| `journal(projectId?)` | 446 | `projectId === undefined ? await store.projects() : [projectId]` | `undefined` means "every scope", and an explicit id is trusted verbatim |
| `projectScopedAssets(projectId)` | 457 | `store.replay(projectId)` | accepts ANY id; the name promises scoping the body never enforces |

`view()` is already correct because it derives from `project.project_id` (the
controller's project) rather than from the store's scope list. That is the shape the
other three should have had, and it is the shape the fix gives them.

`store.projects()` itself is **not** the defect: `SqliteProjectAssetAssociationStore`
and `SqliteProjectJournalStore` legitimately hold many scopes and may enumerate their
own data (`association.ts:625`, `journal.ts:587`). The defect is that a
**project-scoped façade** used a store-level enumeration as if it were a
project-level read — `SharedPhysicalStore != SharedSemanticScope`, and
`AssociationStore.projects() != ProjectWorkspace.assets()`.

## 4. What is ALREADY fenced (so this stage must not "fix" it)

The reproducer prints this before any read is attempted:

```text
(the A-bound WRITE path already refuses B:
 ProjectWorkspaceError/invalid_registration:
 project "project-B" is not this workspace's project "project-A")
```

Every Project Workspace **mutation** already goes through `assertScopedProject`
(`service.ts:196-200`): `recordJournalEntry`, `resolveJournalEntry`,
`associateAsset`, `appendDecision`, `promoteOpportunity`. The G10-AE bridge's own
reference/import/publication paths likewise require a held project basis (the AE gate
review's R-03 fix). So the asymmetry this stage closes is precisely:

```text
writes were project-scoped
reads were store-scoped
```

That asymmetry is also why the two defects went unnoticed: every existing test
exercised a SINGLE-scope store, where `store.projects()` returns exactly the one
project and enumeration is indistinguishable from scoping. The bug is invisible
until two scopes share a physical store — which is the situation the mission asks
about.

## 5. Surface inventory (spec §2)

| Surface | Backing read | Optional project id? | Baseline |
| --- | --- | --- | --- |
| `ProjectWorkspaceService.assets()` | `associationStore.projects()` | no | LEAK |
| `ProjectWorkspaceService.journal(projectId?)` | `journalStore.projects()` / arbitrary `replay(projectId)` | **yes** | LEAK (both forms) |
| `ProjectWorkspaceService.projectScopedAssets(projectId)` | arbitrary `replay(projectId)` | **yes** | LEAK |
| `ProjectWorkspaceService.view()` / `openLoops()` / `history()` | `controller.projectId` + per-project reads | no | sealed |
| `GET /api/project/assets` (`http.ts` ≈672) | `service.assets()` | no | LEAK (inherited) |
| `GET /api/project/journal` (`http.ts` ≈682-686) | `service.journal(id?)` | **yes** | LEAK (inherited, both forms) |
| `GET /api/project/journal/resolve` (≈701) | resolve path | yes | already fenced by the write fence |
| `palimpsest_project action=assets` (`application_tools.ts` ≈657) | `service.assets()` | no | LEAK (inherited) |
| `application.externalAssets.*` (AE plane) | `resolve(projectId)` — **fenced by THIS stage** | yes | was **LEAK**; sealed in AE-R (see §7) |
| Project Management / Operating History | via `service.view()` / activity store scoped by project | no | sealed |
| Project Workspace Web | the HTTP routes above | no | LEAK (inherited from A/B/C) |

**Do not assume CF-AE-16 was the only occurrence** — it was not. The audit found the
same shape in `assets()`, in `projectScopedAssets()`, and therefore in every surface
that delegates to them: one HTTP route, one agent tool action, and the Web view that
consumes them. The journal route leaks in TWO ways (default enumeration *and* an
explicitly named foreign project), which the single reported symptom did not capture.

## 6. The scope of the fix

Frozen rule (spec §4):

```text
controller.projectId = the ONLY semantic project scope of ProjectWorkspaceService
```

- `assets()` → the current project's associations only.
- `journal(undefined | current)` → the current project; `journal(foreign)` → typed failure.
- `projectScopedAssets(projectId)` → fence `projectId === controller.projectId`.
- Foreign scope FAILS; it never returns an empty list (spec §15 forbids hiding the
  violation). `test/v_project_workspace.test.ts` currently asserts the empty-list
  answer while its own comment says "Another project is never addressable through this
  workspace" — the expectation, not the intent, encoded the defect, and it moves to
  the typed rejection.
- Unchanged: `store.projects()` on both stores (a direct store owner may still
  enumerate), every existing write fence, and the whole `src/external_assets/**`
  behaviour.

Not in scope (spec §14): a project switcher, a global dashboard or workspace-admin
surface, cross-project search/graph, a shared Journal, a Personal Asset System, or any
new cross-project authority. This stage removes an accidental global enumerator; it
does not add a deliberate one.

## 7. The last hole: the bridge's own derived read (found while fixing the first six)

The AER0 pass above lists the Project Workspace surfaces. While closing them, the
same question was asked of the ONE external-asset read that feeds the workspace's
external section — the bridge plane's own `resolve(projectId)`
(`src/external_assets/service.ts`). AE had fenced the bridge's **write/prepare**
paths with a held-project basis (the G10-AE gate review's R-03), but `resolve`
still accepted **any** explicit id:

```ts
// baseline (src/external_assets/service.ts)
async function resolve(projectId: string): Promise<ExternalAssetDerivedView> {
  const listed = associations === undefined ? [] : await associations.list(projectId);
  return resolveExternalAssetView({ projectId, associations: listed, registry: deps.registry });
}
```

Reproduced against the pre-fix build with a shared association store (probe:
`resolve("project-B")` while only project-A is held):

```text
held projects now: project-A
resolve('project-B') references: 1
LEAK: a project-A installation resolved project-B's external association
```

That is the spec's §22 partial condition *"external bridge can resolve foreign
associations"* verbatim, so it is closed rather than argued: `resolve` now requires
a held project basis — the SAME fence `prepareReference`, `prepareImport`,
`preparePublication` and `approveAndPublish` already apply — and the answer for a
foreign scope becomes a typed `unknown_project` refusal:

```text
sealed: resolve REFUSED a project the deployment does not hold -> unknown_project |
        project "project-B" is not held by this deployment
resolve('project-A') (the held project) references: 0 -> ok (no references yet)
```

Consequence, recorded because it is a behaviour change to an AE surface: AE's own
dogfood had asserted the OLD answer (`resolve("unknown-project")` → an EMPTY view with
a warning). That assertion encoded exactly the "return an empty list and hide the
violation" shape spec §15 forbids, so it now asserts the refusal, in-file justified,
and the property it was protecting (no global scan, no invented library) is still
covered by the per-association inspection count in the same script. The bridge's
reference/import/publication semantics are untouched.

### 7.1 Two consequences of the fence, both measured

**The fence matches the bridge's own established vocabulary rather than inventing
one.** `prepareReference` already answered exactly this way in the same situation:

```ts
const basis = await basisOf(input.projectId);
if (basis === undefined) {
  return denied("unknown_project", `project "${input.projectId}" is not held by this deployment`);
}
```

So `resolve` did not get a new rule; it stopped being the one project-scoped bridge
operation that skipped the rule the others already applied.

**A read before the install declares its project is refused, not emptied.** Probed on a
fresh installation that had not yet started its project (`projects` has no row, so the
basis is undefined):

```text
resolve(own project) before init THREW -> unknown_project: project "project-A" is not held by this deployment
```

Under the baseline that call returned an empty view. This is the deliberate direction
of the change (a deployment that does not hold the project does not get to read its
external view), and it is indistinguishable from what the prepare/commit paths already
did. The workspace's own external section does NOT break on it: `externalSource`
already catches a bridge that will not answer and degrades to zero references plus a
warning naming the reason (`service.ts:383-395`).

`view()` on an uninitialised project throws `project "project-A" has no ProjectIR` —
**pre-existing and unrelated to this stage**: `view()` reads the project row before it
ever consults the bridge, and this stage's diff does not touch `view()`,
`readProject()` or the project read path.


