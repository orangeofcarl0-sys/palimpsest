# G10-AE-R — Project Workspace scope closure delivery report

Stage: **Project Workspace Scope Isolation & Boundary Closure**.
Baseline: `0ba32639614a8963ba243efe53a6c72b6fcae040` (canonical main after G10-AE).
Spec: `SPEC-PROMPT-G10-AE-R.md`.
Frozen specification: `docs/engineering/G10-AE-R-SCOPE-CLOSURE-SPEC.md`.
Rule document: `docs/engineering/PROJECT-WORKSPACE-SCOPE-ISOLATION.md`.
Audit: `docs/engineering/audits/G10-AE-R-PROJECT-SCOPE-ASSESSMENT.md`.
Anti-waste: `docs/engineering/audits/G10-AE-R-SCOPE-ANTI-WASTE.md`.
Carry-forward: `docs/engineering/audits/G10-AE-R-CARRY-FORWARD.md`,
`docs/engineering/audits/G10-AE-R-AE-CARRY-FORWARD-DISPOSITION.md`.

The fix is deliberately small: three functions in the workspace service, one fence
in the external-asset service, and two review-driven additions (a foreign-id refusal
on the project read routes and the agent tool, and a basis fence on the bridge's
phase-1 receipt writers), plus the tests and dogfood that pin both directions of the
store-vs-façade asymmetry.

## 1. What changed, per file

**`src/project_workspace/service.ts`** — the core of the stage.

- `assets()` (`:466-470`) now replays ONLY `controller.projectId`. It used to
  iterate `associationStore.projects()` and concatenate every scope in the shared
  store.
- `journal(projectId?)` (`:472-485`) now maps `undefined` to `controller.projectId`
  and, for an explicit id, fences before the store check: the current id is allowed
  (API compatibility), any other id throws the existing typed
  `ProjectWorkspaceError` / `invalid_registration`. It used to treat `undefined` as
  "every scope" and to replay any explicit id verbatim.
- `projectScopedAssets(projectId)` (`:487-497`) keeps its name but enforces
  `projectId === controller.projectId` and then replays `controller.projectId`.
  It used to replay the arbitrary argument.
- `view()` (`:425-455`) now names `controller.projectId` as its explicit `scopeId`
  (`:429-435`), added by the gate review's NIT-2 so §4's rule is literal rather than
  implied by the ProjectIR row. No behaviour change.
- The interface documentation (`:172-182`) and the per-read doc comments state the
  frozen rule. `openLoops()` / `history()` (`:499-505`) and all five write fences
  (`assertScopedProject`, `:211-215`) are unchanged.

**`src/external_assets/service.ts`** — three fences, no semantic change.

- `resolve(projectId)` (`:1178-1192`) now requires a held project basis
  (`basisOf`, `:403-409`) and throws `unknown_project` for any project the
  deployment does not hold. This closes the last foreign READ in the stage and is
  what made spec §22's partial condition *"external bridge can resolve foreign
  associations"* true before the fix.
- `beginImport` (`:757-772`, fence at `:765-767`) and `beginPublication`
  (`:939-966`, fence at `:946-948`) now require the same held basis: the gate review
  DEMONSTRATED (MINOR-1) that an installation bound to project-A could append
  project-B's `EXTERNAL_IMPORT_PREPARED` receipt to a shared bridge store. Both
  writers now fail with `unknown_project` before touching the bridge store.
- The fence is the SAME one `prepareReference` / `prepareImport` /
  `preparePublication` / `approveAndPublish` already applied. The bridge's
  reference / import / publication semantics are untouched.

**`src/application/http.ts`** — the project read routes refuse a foreign scope.

- A shared `projectReadSurface` helper (`:674-687`) resolves the installation's
  project and refuses a foreign `projectId` with the same typed error; the four read
  routes use it (`:688-703`). Before the fix they answered 200 with the installed
  project's payload while silently ignoring `?projectId=`. The journal route keeps
  its own service fence (`:704-708`, gate review MINOR-2).

**`src/tools/application_tools.ts`** — the agent tool refuses a foreign scope.

- `palimpsest_project` resolves the installation's project once (`:663-666`) and
  throws `ProjectWorkspaceError` / `invalid_registration` naming the requested
  project for ANY action given a foreign id (`:667-675`). Before the fix the read
  actions dropped the parameter and answered with the installed project. Action set
  unchanged (gate review MINOR-2).

**`test/aer_scope_isolation.test.ts`** (new, 24 tests) — AER-N01…N19 plus the three
review regressions AER-N05b / AER-N08b / AER-N13b and a labelled cross-plane smoke,
on the real product stack (real stores, real HTTP dispatcher, real agent tools; only
the TEST-ONLY external library fixture, the clock and a fake git port are injected).
Rig: ONE physical association store and ONE physical journal store, each holding
project-A and project-B; B seeded by its own B-bound installation over the same
files. AER-N20…N24 are the full-suite / gate regressions and are deliberately not
faked as assertions (`test/aer_scope_isolation.test.ts:20-23`).

**`scripts/scope/aer0-repro.mjs`** (new) — the mandatory A–H reproducer. Baseline
printed `7/8 surfaces leak project-B`; the shipped build prints `0/8`.

**`scripts/scope/aer-boundary-dogfood.mjs`** (new) — the spec §20 two-project
shared-store boundary dogfood. Prints `pass=true`, exit 0. The gate review's NIT-3
found its A-only check could be satisfied by an EMPTY payload; `checkAOnly` now takes
a `content` expectation (`{ok, why}`) computed from each payload's real shape
(`rowsAreProjectA`, `viewIsProjectA`, `externalSectionHasReferences`,
`scripts/scope/aer-boundary-dogfood.mjs:81-129`), so a read that answers nothing
FAILS. The agent-tool check now asserts refusal, not "still A-only"
(`:349-364`).

**`test/v_project_workspace.test.ts`** — ONE expectation changed (`:869-875`): a
foreign `projectScopedAssets` used to resolve to `[]`; it now expects the typed
`invalid_registration`, with an in-file justification, because the old expectation
encoded exactly the empty-list-hides-the-violation behaviour spec §15 forbids.

**`scripts/external_assets/ae-dogfood.mjs`** — ONE check changed (`:847-870`) for
the same reason: it asserted `resolve("some-other-project")` returned an EMPTY view
with a warning; it now asserts the typed `unknown_project` refusal, in-file
justified. The property it protected (no global scan, no invented library) is still
asserted by the per-association inspection count in the same script.

## 2. Delivered behaviour

1. **`assets()` means the installed project only.** No façade read calls
   `store.projects()` any more; a structural assertion fails if `.projects()`
   reappears in the service source.
2. **Default `journal()` means the installed project.** `undefined` never means
   "every scope in the store".
3. **An explicit foreign project id fails closed everywhere it can be given**: the
   service (`invalid_registration`), the agent tool for any action
   (`invalid_registration`), the project read routes (HTTP 400 naming the project),
   and the External Asset bridge (`unknown_project`), including its phase-1 receipt
   writers. It is never silently ignored and never degrades to the current project's
   payload.
4. **HTTP and Agent surfaces preserve the fence;** no route or tool action gained a
   scope authority.
5. **The External Asset bridge's derived read and phase-1 writes require a held
   project basis** (controller-bound; `unknown_project` otherwise), matching its own
   write paths.
6. **Direct store ownership is intact:** `associationStore.projects()` and
   `journalStore.projects()` still enumerate and replay every scope (PSI-A09), and
   the suite asserts both the fence and the capability.
7. **No new surface.** The workspace key set, the application surface's project
   members and every tool's action set are unchanged.

## 3. What the stage did NOT change

- `associationStore.projects()` / `journalStore.projects()` — retained (spec §8).
- Every pre-existing write fence: `recordJournalEntry`, `resolveJournalEntry`,
  `associateAsset`, `appendDecision`, `promoteOpportunity` (spec §11). The AER0
  reproducer prints the typed refusal on the baseline, before any read is
  attempted, so they were already correct.
- `openLoops()`, `history()` — already controller-scoped.
- `src/external_assets/**` reference/import/publication SEMANTICS beyond the three
  basis fences; no G10-AE behaviour was redesigned.
- Store schemas, migrations, the Ordarium ledger, the canonical event store, the
  monitor, management, proof, reasoning and web planes.
- No project switcher, global dashboard, cross-project search/graph, shared
  Journal, Personal Asset System, workspace administrator role, or new
  `all_projects` / `global_assets` / `workspace_scan` action (spec §14). Full
  detail: `G10-AE-R-SCOPE-ANTI-WASTE.md`.

## 4. Gate results

All figures below are LOCAL runs on this worktree, recorded by the stage author after
the review fixes.

| Gate | Result | Baseline comparison |
| --- | --- | --- |
| `git diff --check` | exit 0 | — |
| `pnpm build` | clean (`tsc -b`, no output) | — |
| `pnpm exec vitest run --maxWorkers=2` | **164 files / 1742 tests passed** | baseline 163 / 1718; delta +1 file / +24 tests (`test/aer_scope_isolation.test.ts`, 24 tests) |
| `pnpm run build:web` | exit 0 | — |
| `pnpm exec playwright test` | **36 passed** | unchanged from G10-AE |
| `node scripts/external_assets/ae-dogfood.mjs` | `pass=true` (30/30 checks) | unchanged count; one check's answer moved empty-view → typed refusal |
| `node scripts/scope/aer-boundary-dogfood.mjs` | `pass=true` | new in this stage; content expectations added under NIT-3 |
| `node scripts/scope/aer0-repro.mjs` | **0/8 surfaces leak project-B** | baseline printed 7/8 |

Remote CI is NOT recorded here as green: it has not run. The canonical checkpoint
(§7) is left as a placeholder until the run exists.

## 5. Reproductions A–H — before and after

Rig: ONE physical `SqliteProjectJournalStore` and ONE physical
`SqliteProjectAssetAssociationStore`, each holding project-A and project-B;
project-B seeded by its own B-bound installation over the same files; an
installation bound to project-A then asked every read
(`scripts/scope/aer0-repro.mjs`; audit §2).

| # | Surface asked | Baseline | After |
| --- | --- | --- | --- |
| A | `GET /api/project/journal` (no `projectId`) | LEAK — response held A and B entries | A-only (current project) |
| B | `GET /api/project/journal?projectId=project-B` | LEAK — returned `B-SECRET-TITLE` / `B-SECRET-BODY` | fails closed: HTTP 400 naming project-B |
| C | `GET /api/project/assets` | LEAK — included B's `art-b` association | A-only |
| D | `palimpsest_project action=assets` | LEAK — the tool returned B's association | A-only |
| E | `projectScopedAssets("project-B")` | LEAK — 1 association for a foreign project | typed `invalid_registration` |
| F | `workspace.assets()` (service) | LEAK — 2 associations (A, B) | 2 associations, both project-A |
| G | `workspace.journal()` (service) | LEAK — 2 entries (A, B) | 1 entry, project-A |
| H | `workspace.view()` (derived) | sealed — `projectId=project-A` | sealed (unchanged) |

Machine proof that B is still physically present while every A-bound read is B-free
is AER-N09 and the dogfood checks
`shared_store_physically_holds_B_rows` / `shared_db_is_not_a_shared_semantic_scope`.

## 6. Gate review — findings and disposition

An independent review landed with **0 blocker / 0 major / 2 minor / 3 nit**. Both
minors were DEMONSTRATED against the shipped build and are fixed with regressions;
the nits are addressed or documented.

| ID | Finding | Disposition |
| --- | --- | --- |
| MINOR-1 | the bridge's phase-1 receipt writers `beginImport` and `beginPublication` had no project-basis check, so an installation bound to project-A could append project-B's `EXTERNAL_IMPORT_PREPARED` receipt to a shared bridge store (inert for reads, but a real cross-scope durable write) | FIXED: both writers now require the held basis and fail `unknown_project` before any receipt; `test` AER-N13b (rejects, ZERO bridge rows written, raw `project_id='project-B'` query returns `[]`); recorded as `CF-AE-R-09` |
| MINOR-2 | a foreign `projectId` was silently IGNORED, never refused: `/api/project/{workspace,assets,open_loops,history}?projectId=` answered 200 with the installed project's payload, and the `palimpsest_project` read actions dropped the parameter | FIXED: `projectReadSurface` refuses a foreign id on the four read routes; the tool refuses any foreign id for any action; `test` AER-N05b and AER-N08b; dogfood `agent_tool_with_foreign_id_is_refused_not_ignored`; recorded as `CF-AE-R-10` and `CF-AE-R-03` |
| NIT-1 | AER-N17 (`federation does not bypass workspace scope`) was described as "structural" although the rig composes no federation surface at all | DOCUMENTED HONESTLY: AER-N17 is vacuous, PSI-A11 is NOT proven, and both are carried as `CF-AE-R-05` with the trigger "a rig that composes the §132–§135 peer wiring". Every document in this set now says so plainly. |
| NIT-2 | `view()` sourced its scope from the ProjectIR row rather than literally from `controller.projectId` | ADDRESSED: `view()` names `controller.projectId` as its `scopeId` (`service.ts:429-435`). No behaviour change; the review confirmed the forged-row attack fails on the content-addressed ProjectIR. |
| NIT-3 | the boundary dogfood's A-only check was satisfiable by an EMPTY payload (absence of foreign markers is not presence of own data) | ADDRESSED: `checkAOnly` takes a `content` expectation computed from each payload's real shape, so a read answering nothing FAILS; the agent-tool check asserts refusal. `honestNotes` is empty because its one note (the plane-level foreign resolve) is closed and asserted. |

Attacks the review tried and could **not** break — recorded because a firewall that
survived an adversary is evidence:

```text
every hostile-argument variant of journal / projectScopedAssets failing closed
assets() returning 0 while the shared store physically held project-B's association
the HTTP journal 400 naming the refused project
the bridge fence NOT breaking a legitimate zero-reference own-project read
the store-level enumeration asymmetry intact (a direct owner can still list both scopes)
```

## 7. Honest limitations

1. **Remote CI has not run.** Only local gate figures appear in §4. No commit SHA,
   PR number or CI run id is invented anywhere in this report; the checkpoint is
   left as a placeholder.
2. **AER-N17 / PSI-A11 are NOT proven.** No federation surface is composed by the
   rig (`application.federation === undefined`, no `palimpsest_federation` tool), so
   the test cannot assert a bypass property; its guard branches away and both loops
   are empty. The honest statement is "nothing was tested", not "a federation read
   was refused". Carried as `CF-AE-R-05`.
3. **The `journal(projectId?)` / `projectScopedAssets(projectId)` parameters are
   retained and now inert.** They can only ever name the current project. This is a
   deliberate API-compatibility retention (spec §6), documented as a compatibility
   argument and not an authority. Carried as `CF-AE-R-04`.
4. **A real multi-project host must run several installations** over the same
   association and journal files; the orchestration, Ordarium and bridge stores are
   per-installation in that shape, and `dispose()` closes a supplied
   association/journal store. This stage does not give one process a convenient
   multi-project view, by design. Carried as `CF-AE-R-06`.
5. **Two pre-existing expectations moved to the fail-closed answer**
   (`test/v_project_workspace.test.ts:869-875`,
   `scripts/external_assets/ae-dogfood.mjs:847-870`). Both are behaviour changes to
   existing tests, both in-file justified: they encoded the empty-list answer that
   spec §15 forbids. No other existing assertion was relaxed.
6. **This stage's own AER0 instrument missed the two paths the gate review then
   found.** The boundary dogfood exercised the parameterless form of the read routes
   and the tool, so it did not reach the named-foreign-id variants (MINOR-2), and it
   never covered the bridge's phase-1 writers (MINOR-1). Both are pinned now, but the
   instrument gap is recorded as `CF-AE-R-11` rather than hidden.
7. **The `resolve` fence is a read-authority fence, not a data fence.** A direct
   store owner can still replay a foreign scope (PSI-A09); the stage removed the
   façade's, the tool's, the HTTP routes' and the bridge's use of that ability, not
   the stores' ownership model.
8. **The foreign-id guard has a small derived-read cost when a caller names the
   current project** (`workspace.view()` is composed to compare the id). A request
   with no `projectId` pays nothing. Carried as `CF-AE-R-12`.

## 8. Canonical checkpoint

Baseline for this stage: `0ba32639614a8963ba243efe53a6c72b6fcae040`. The
implementation commit, pull request, PR-check run, merged commit and canonical-main
run are recorded after the merge; none of them is invented here.

Recorded after merge.
