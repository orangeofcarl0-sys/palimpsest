# G10-AE-R — Project Workspace scope closure specification

Stage: **Project Workspace Scope Isolation & Boundary Closure**.
Canonical baseline: `0ba32639614a8963ba243efe53a6c72b6fcae040` (main after G10-AE).
Authority: `SPEC-PROMPT-G10-AE-R.md` at the repository root.
Audit: `docs/engineering/audits/G10-AE-R-PROJECT-SCOPE-ASSESSMENT.md`.
Anti-waste: `docs/engineering/audits/G10-AE-R-SCOPE-ANTI-WASTE.md`.
Delivery: `docs/engineering/audits/G10-AE-R-SCOPE-CLOSURE-DELIVERY.md`.
Rule document: `docs/engineering/PROJECT-WORKSPACE-SCOPE-ISOLATION.md`.

This document is the frozen specification of what the stage changed, written
against the shipped code. It includes the three findings the independent gate
review raised and the stage then fixed (MINOR-1, MINOR-2 and NIT-2 in the delivery
report's gate-review section).

## 1. Defect statement

An installed Project Workspace is a ONE-PROJECT façade built around exactly one
`ProjectController`. Its reads were not.

```text
CF-AE-16 (pre-existing):
  GET /api/project/journal            (no projectId)
  -> workspace.journal(undefined)
  -> journalStore.projects()          -> EVERY project scope in the shared store

adjacent (found by the AER0 audit, recorded as CF-AE-R-01):
  GET /api/project/assets             -> workspace.assets()
  palimpsest_project action=assets    -> workspace.assets()
  -> associationStore.projects()      -> EVERY project scope in the shared store

adjacent (found while fixing the first six, recorded as CF-AE-R-02):
  externalAssets.resolve(foreignId)   -> reads a scope the deployment does not hold

explicit foreign id (found by the gate review, recorded as CF-AE-R-10):
  GET /api/project/{workspace,assets,open_loops,history}?projectId=<foreign>
  palimpsest_project action=<any> projectId=<foreign>
  -> 200 / an answer for the INSTALLED project, silently ignoring the named scope

unfenced durable write (found by the gate review, recorded as CF-AE-R-09):
  externalAssets.beginImport / beginPublication for a foreign scope
  -> appended the foreign project's phase-1 receipt to a shared bridge store
```

Rig: ONE physical association store and ONE physical journal store, each holding
project-A and project-B; project-B seeded by its own B-bound installation over the
same files; an installation bound to project-A then asked every read. Baseline
result: `7/8 surfaces leak project-B` (`scripts/scope/aer0-repro.mjs`).

The underlying cause is one shape, used three times: a project-scoped façade used a
STORE-level enumeration (`store.projects()`) or an unchecked explicit id as if it
were a project-level read. The two review findings are the same shape one layer out:
a surface that ACCEPTED a named scope and then ignored it, and a durable writer that
never checked the scope at all.

## 2. The rule

```text
controller.projectId = the ONLY semantic project scope of ProjectWorkspaceService
```

- Backing stores MAY hold many project scopes.
- That physical multiplicity grants no semantic read permission
  (`SharedPhysicalStore != SharedSemanticScope`).
- `store.projects()` is a store capability; it is not an application read
  (`AssociationStore.projects() != ProjectWorkspace.assets()`).
- An explicit `projectId` argument is not cross-project read authority
  (`ProjectIdParameter != CrossProjectReadAuthority`) — and it is never silently
  ignored (spec §9/§15).

## 3. Per-surface contract

| Surface | Before | Frozen contract |
| --- | --- | --- |
| `assets()` (`src/project_workspace/service.ts:466-470`) | iterated `associationStore.projects()` and concatenated every scope | the associations of `controller.projectId` only |
| `journal(projectId?)` (`service.ts:472-485`) | `undefined -> store.projects()`; any explicit id replayed verbatim | `undefined` or the current id → current project; any other id → typed failure |
| `projectScopedAssets(projectId)` (`service.ts:487-497`) | `store.replay(projectId)` for any id | argument MUST equal `controller.projectId`; the read replays `controller.projectId` |
| `view()` (`service.ts:425-455`) | derived from the ProjectIR row | derives from `controller.projectId` named as `scopeId` (`:429-435`, NIT-2 literalness change; no behaviour change) |
| `openLoops()` / `history()` (`service.ts:499-505`) | already current-project scoped | unchanged |
| `GET /api/project/workspace` / `assets` / `open_loops` / `history` (`src/application/http.ts:688-703`) | answered 200 with the installed project's payload, ignoring `?projectId=` | a foreign id is REFUSED via `projectReadSurface` (`http.ts:674-687`); the current id is allowed |
| `GET /api/project/journal` (`http.ts:704-708`) | inherited both journal leaks | no `projectId` → current project; current id → allowed; foreign id → fail closed (service fence) |
| `palimpsest_project` (any action, foreign id) (`src/tools/application_tools.ts:634-701`) | read actions dropped the id and answered with the installed project | the tool resolves the installation's project once and refuses a foreign id for ANY action (`:663-675`); action set unchanged |
| External Asset bridge `resolve(projectId)` (`src/external_assets/service.ts:1178-1192`) | accepted any explicit id | requires a held project basis (`basisOf`); foreign id → `unknown_project` |
| Bridge phase-1 writers `beginImport` / `beginPublication` (`service.ts:757-772`, `:939-966`) | appended the named project's receipt with no basis check | require a held project basis; foreign scope → `unknown_project` before any receipt is appended (MINOR-1) |

Read routes and the tool delegate; they add no scope authority of their own. The
bridge's reference / import / publication semantics are unchanged: the stage only
makes its derived read and its phase-1 receipt writers apply the basis fence the
other operations already applied.

## 4. Error semantics

| Case | Answer |
| --- | --- |
| Workspace foreign scope (`journal(foreign)`, `projectScopedAssets(foreign)`) | `ProjectWorkspaceError` with `kind = "invalid_registration"` (`src/project_workspace/service.ts:211-215`; kinds at `src/project_workspace/association.ts:61-78`) |
| Agent tool, any action, foreign `projectId` | `ProjectWorkspaceError` / `invalid_registration` naming the requested project (`src/tools/application_tools.ts:667-675`) |
| HTTP project read routes / journal route, foreign `projectId` | HTTP 400 whose error detail names the foreign project — never a 200, never the current project's payload (`http.ts:674-687`, `:704-708`) |
| Bridge `resolve(foreign)` | `ExternalAssetError` with `kind = "unknown_project"` (`src/external_assets/service.ts:1186-1188`; kind declared at `src/external_assets/refs.ts:48`) |
| Bridge `beginImport` / `beginPublication`, foreign scope | `ExternalAssetError` / `unknown_project`, zero receipts written (`service.ts:765-767`, `:946-948`) |
| `prepareReference` / `prepareImport` / `preparePublication` / `approveAndPublish`, foreign scope | `unknown_project` (the pre-existing AE fence) |
| Unconfigured workspace + foreign scope | still fails closed: the fence runs before the "store not configured" check (`service.ts:479-481`) |

A foreign scope is never answered with an empty list (spec §15). The two
expectations that previously asserted the empty-list answer were changed, in-file
justified, because they encoded the exact behaviour the spec forbids:
`test/v_project_workspace.test.ts:869-875` and
`scripts/external_assets/ae-dogfood.mjs:847-870`.

## 5. Store-level carve-out

`associationStore.projects()` and `journalStore.projects()` are NOT removed
(spec §8). The stores legitimately own multi-scope data and may enumerate it
(`src/project_workspace/association.ts:398`, `:625`;
`src/project_workspace/journal.ts:587`). The rule is directional:

```text
a store may enumerate its own data
!= one ProjectWorkspace facade may enumerate all scopes
```

Only the façade's use of the enumeration was removed. The structural assertion in
AER-N01 (`test/aer_scope_isolation.test.ts:300-304`) fails if `.projects()`
reappears in `src/project_workspace/service.ts`.

## 6. Invariants PSI-A01…A17

"Enforcement" names what makes the invariant true; "Pinned by" names the artifact
that fails if it stops being true. Full-suite / gate items point at the gate, not at
a fabricated assertion.

| ID | Invariant (spec §17) | Enforcement | Pinned by |
| --- | --- | --- | --- |
| PSI-A01 | ProjectWorkspaceService has exactly one semantic project scope | one `controller` closed over; interface states the rule (`service.ts:172-182`, `:207-215`); `view()` names `controller.projectId` as its scope (`:429-435`) | AER-N01, AER-N02, AER-N04, AER-N11 |
| PSI-A02 | backing-store multiplicity grants no cross-project read | reads replay `controller.projectId`; no `.projects()` in the façade | AER-N01 (incl. structural), AER-N09 |
| PSI-A03 | `assets()` is current-project scoped | `service.ts:466-470` | AER-N01, AER-N05, AER-N08; dogfood `service_assets_is_A_only` |
| PSI-A04 | `journal()` default is the current project | `service.ts:477-485` | AER-N02; dogfood `service_journal_is_A_only` |
| PSI-A05 | foreign journal read fails closed | `assertScopedProject` before the store check (`service.ts:479-481`); the route delegates (`http.ts:704-708`) | AER-N03, AER-N07; dogfood `service_journal_foreign_fails_closed` |
| PSI-A06 | foreign asset read fails closed | `assertScopedProject` in `projectScopedAssets` (`service.ts:492-497`); the tool guard (`application_tools.ts:667-675`); `projectReadSurface` (`http.ts:674-687`) | AER-N04, AER-N05b, AER-N08b; dogfood `service_projectScopedAssets_foreign_fails_closed`, `agent_tool_with_foreign_id_is_refused_not_ignored` |
| PSI-A07 | HTTP project routes preserve service scope | routes refuse a foreign `projectId`; journal delegates (`http.ts:674-708`) | AER-N05, AER-N05b, AER-N06, AER-N07; dogfood `http_*` checks |
| PSI-A08 | Agent project tools preserve service scope | tool refuses a foreign id for any action; action set unchanged (`application_tools.ts:642`, `:656-675`) | AER-N08, AER-N08b; dogfood `agent_tool_assets_*`, `agent_tool_with_foreign_id_is_refused_not_ignored` |
| PSI-A09 | direct stores remain owners of multi-scope data | `projects()` / `replay()` retained on both stores | AER-N10; dogfood `direct_store_owner_can_enumerate_both_scopes`, `direct_store_owner_can_replay_B` |
| PSI-A10 | ProjectWorkspace remains derived | `view()` composes from the controller and per-project reads; owns no new table | AER-N11, AER-N19 |
| PSI-A11 | Federation != workspace read authority | **NOT PROVEN.** No federation surface is composed in the rig; the test's guard branches away | AER-N17 is vacuous (see §8); carried as `CF-AE-R-05` |
| PSI-A12 | External Asset bridge preserves project basis | `resolve` requires `basisOf` (`external_assets/service.ts:1178-1192`); the phase-1 writers require it too (`:757-772`, `:939-966`); the port is controller-bound (`src/install.ts:1908-1919`: any id that is not `controller.projectId` yields no basis) | AER-N12, AER-N12b, AER-N13, AER-N13b, AER-N14; dogfood `external_resolve_*` |
| PSI-A13 | no new global project surface | key sets unchanged; forbidden tool actions absent | AER-N18, AER-N19 |
| PSI-A14 | CF-AE-16 closed | the journal route no longer enumerates and refuses a foreign id | AER-N02, AER-N03, AER-N06, AER-N07 |
| PSI-A15 | adjacent assets-scope defect closed | `assets()` and `projectScopedAssets()` scoped | AER-N01, AER-N04, AER-N05, AER-N08 |
| PSI-A16 | full regression green | local full suite | gate row `pnpm exec vitest run --maxWorkers=2` — 164 files / 1742 tests passed (`G10-AE-R-SCOPE-CLOSURE-DELIVERY.md`) |
| PSI-A17 | required CI green | remote CI | **NOT YET RUN.** Recorded in the delivery report's canonical checkpoint, which is left as `Recorded after merge.` until the run exists |

Review-hardened rows: PSI-A06 gained the tool + HTTP fences (MINOR-2), PSI-A12
gained the phase-1 writers (MINOR-1), PSI-A01 gained the literal `scopeId` (NIT-2),
and PSI-A11 is now recorded as unproven rather than structural (NIT-1).

## 7. Adversarial map AER-N01…N24

The in-suite ids are assertions in `test/aer_scope_isolation.test.ts` (24 tests).
The gate-level ids are deliberately **not** faked as assertions (e.g. a
file-existence check); they are proven by running the full suite and the dogfood
scripts, and the suite says so in its header
(`test/aer_scope_isolation.test.ts:20-23`).

| ID | Property (spec §16) | Where proven |
| --- | --- | --- |
| AER-N01 | `assets()` never enumerates all store projects | in-suite: `test/aer_scope_isolation.test.ts:281` (structural check `:300-304`) |
| AER-N02 | `journal()` default = current project | in-suite: `:307` |
| AER-N03 | `journal(foreign)` fails closed | in-suite: `:316` |
| AER-N04 | `projectScopedAssets(foreign)` fails closed | in-suite: `:326` |
| AER-N05 | HTTP assets exposes the current project only | in-suite: `:376` |
| AER-N05b | (gate review MINOR-2) the project read routes refuse a foreign `projectId` | in-suite: `:463`; dogfood `http_*` checks |
| AER-N06 | HTTP journal exposes the current project only | in-suite: `:384` |
| AER-N07 | HTTP foreign `projectId` fails closed | in-suite: `:392` |
| AER-N08 | `palimpsest_project action=assets` exposes the current project only | in-suite: `:437` |
| AER-N08b | (gate review MINOR-2) a foreign `projectId` is REFUSED, never silently ignored | in-suite: `:447`; dogfood `agent_tool_with_foreign_id_is_refused_not_ignored` |
| AER-N09 | shared DB != shared semantic scope | in-suite: `:335` |
| AER-N10 | a direct store owner may still enumerate scopes | in-suite: `:347` |
| AER-N11 | Project Workspace view stays current-project scoped | in-suite: `:362` |
| AER-N12 | external-asset view cannot read foreign associations | in-suite: `:514` |
| AER-N12b | (CLOSED IN AE-R) the bridge `resolve` refuses a project the deployment does not hold | in-suite: `:567`; dogfood `external_resolve_refuses_a_project_the_deployment_does_not_hold` |
| AER-N13 | external import cannot write a foreign Journal | in-suite: `:602` |
| AER-N13b | (gate review MINOR-1) the bridge's phase-1 receipt writers refuse a foreign scope | in-suite: `:525` (rejects, ZERO bridge rows written, raw `project_id='project-B'` query returns `[]`) |
| AER-N14 | external publication cannot read a foreign Journal | in-suite: `:629` |
| AER-N15 | management/history does not leak foreign workspace data | in-suite: `:404` |
| AER-N16 | Web cannot render foreign asset/journal data | in-suite: `:421` (the served payloads the web client reads) |
| AER-N17 | federation does not bypass workspace scope | in-suite: `:646` — **VACUOUS**: no federation surface is composed, so nothing is asserted beyond its own absence |
| AER-N18 | no global workspace admin surface added | in-suite: `:482` |
| AER-N19 | no cross-project graph added | in-suite: `:668` |
| AER-N20 | G10-AE dogfood remains green | full-suite gate: `node scripts/external_assets/ae-dogfood.mjs` → `pass=true` (30/30) |
| AER-N21 | AD verification remains green | full-suite gate: `pnpm exec vitest run --maxWorkers=2` |
| AER-N22 | AC-R monitor remains green | full-suite gate: same run |
| AER-N23 | AB posture/history remains green | full-suite gate: same run |
| AER-N24 | W/X/Y/Z/AA correctness remains green | full-suite gate: same run |

Plus the labelled cross-plane smoke in the same file
(`AER-SMOKE`, `test/aer_scope_isolation.test.ts:681`), which asserts the composed A
installation still answers truthfully on the surfaces route, the providers route and
the workspace route.

## 8. Honest qualifications on the invariant set

- **PSI-A11 / AER-N17 are NOT proven. `HONEST:`** The gate review verified that the
  rig composes no federation surface at all (`application.federation === undefined`,
  and no `palimpsest_federation` tool), so `test/aer_scope_isolation.test.ts:646-666`
  cannot assert a bypass property: its `if (federation === undefined)` guard passes
  its own branch and both loops over members/actions are empty. The earlier
  "structural, asserts no federation member names the workspace" description
  overstated it. Carried as `CF-AE-R-05`, trigger "a rig that composes the
  §132–§135 peer wiring".
- **PSI-A17 is not satisfied yet.** Remote CI has not run. The delivery report
  records the local gate figures and leaves the checkpoint placeholder untouched.
- **PSI-A16 is a local gate figure.** It is recorded with the baseline comparison
  (163 files / 1718 tests → 164 files / 1742 tests) in the delivery report.

## 9. PASS / PARTIAL framing

The stage PASS criterion (spec §21) is met only if no A-bound surface exposes
another scope through the service, HTTP routes, Agent tools, Web view, management
read model or External Asset bridge, with an explicit foreign id failing closed and
direct store enumeration remaining available only below the façade. The five PARTIAL
conditions of spec §22 are each addressed explicitly:

| §22 PARTIAL condition | Status |
| --- | --- |
| journal fixed but assets still enumerates all projects | NOT MET — `assets()` scoped (AER-N01/AER-N05/AER-N08) |
| HTTP scoped but service-level foreign reads remain | NOT MET — service reads fenced (AER-N03/AER-N04) |
| Agent tool can still read foreign project assets | NOT MET — AER-N08, AER-N08b |
| foreign `projectId` silently returns the current project | NOT MET — it fails closed on HTTP and the tool (AER-N05b/AER-N07/AER-N08b) |
| external bridge can resolve foreign associations | NOT MET — `resolve` requires a held basis (AER-N12b); the phase-1 writers require it too (AER-N13b) |

## 10. What is out of scope

No project switcher, global dashboard, cross-project search/graph, shared Journal,
Personal Asset System, workspace administrator role, or `all_projects` /
`global_assets` / `workspace_scan` tool action (spec §14). No store schema change,
no migration, no new contract member, no new route, no federation change. The
store-vs-façade asymmetry is retained on purpose. Details:
`docs/engineering/audits/G10-AE-R-SCOPE-ANTI-WASTE.md`.
