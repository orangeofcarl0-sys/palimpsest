# G10-AE-R — Carry-forward

G10-AE-R closed a defect space; it did not exhaust the subject of cross-project
scope. This document records what the stage leaves open, each with a concrete
trigger, and ends with the strategic freeze (spec §24). Nothing here is a delivered
claim.

The AE-side disposition (which of the 16 `CF-AE-*` ids this stage closed, and each
remaining AE id with its unchanged trigger) is
`docs/engineering/audits/G10-AE-R-AE-CARRY-FORWARD-DISPOSITION.md`. The 48 inherited
ids from AD / AC-R / AC / AB / AA / W / X / Y / Z are untouched by this stage and
remain disposed in `docs/engineering/audits/G10-AE-AD-CARRY-FORWARD-DISPOSITION.md`.

## 1. Items this stage leaves open

| ID | Kind | Finding | Concrete trigger |
| --- | --- | --- | --- |
| **CF-AE-R-04** | API hygiene | The `projectId` parameters of `journal(projectId?)` and `projectScopedAssets(projectId)` can now only ever name the current project; they are retained deliberately for API compatibility (spec §6, frozen in `PROJECT-WORKSPACE-SCOPE-ISOLATION.md` §4). The parameters are a compatibility argument, not an authority. | A decision to narrow the two signatures (a breaking change), or a caller that misreads the retained parameter as a scope authority. |
| **CF-AE-R-05** | evidence/boundary | **AER-N17 and PSI-A11 are NOT proven.** The gate review verified that this rig composes NO federation surface (`application.federation === undefined`, and no `palimpsest_federation` tool), so `test/aer_scope_isolation.test.ts:646-666` cannot assert a bypass property: its `if (federation === undefined)` guard passes its own branch and both loops over members/actions are empty. An earlier description in this document set called it "structural, asserts no federation member names the workspace" — that overstated it; there is nothing to inspect. | A rig that composes the §132–§135 peer wiring together with a shared Project Workspace store, i.e. the first deployment that actually runs a federation path beside an installed workspace. |
| **CF-AE-R-06** | operability/cost | The supported multi-project shape is several installations over the same association and journal files (`PROJECT-WORKSPACE-SCOPE-ISOLATION.md` §6). In that shape the orchestration store, the Ordarium store and the external-asset bridge store are per-installation (`scripts/scope/aer-boundary-dogfood.mjs:228-291`), and `dispose()` closes a SUPPLIED project association/journal store (`src/install.ts:2296-2298`) while closing the bridge store only when it created it (`:2303-2307`), so the rig seeds B and disposes it before A opens the same files (`scripts/scope/aer-boundary-dogfood.mjs:258-259`). A host that wants two live installations in one process must give each its own store handle. | A host that wants one process to serve several projects with one shared handle and one shared bridge/Ordarium store; that is a deployment-design decision, not a read-model change. |
| **CF-AE-R-07** | test robustness | The structural half of AER-N01 and AER-N19 reads the implementation source from `join(process.cwd(), "src/...")` (`test/aer_scope_isolation.test.ts:301`, `:677`). It is accurate under the repository-root cwd that vitest uses, but it would throw rather than assert if the suite were ever run from a different cwd or from a packaged artifact. | A test-runner configuration, a monorepo `cwd`, or a packaged test distribution not rooted at the repository root. |
| **CF-AE-R-08** | portability | `ProjectWorkspaceService` binds to `controller.projectId`, but the persistence layout is unchanged: two installations sharing one journal/association file are two writers on one SQLite file with the store's existing basis/chain discipline (`src/project_workspace/association.ts:621-629`, `src/project_workspace/journal.ts:583-591`). Nothing in this stage adds cross-process coordination, locking policy, or a multi-writer story. | Two installations actively writing the same physical association/journal file at the same time (the dogfood serialises B-then-A rather than running them concurrently). |
| **CF-AE-R-11** | test instrument | **Found by the gate review, and a real gap in this stage's own instrument.** The AER0 audit and the first boundary dogfood exercised the NO-parameter form of the read routes and the agent tool, so they did not reach the *named-foreign-id* variants the review then demonstrated as MINOR-2 (`CF-AE-R-10`); neither did they cover the bridge's phase-1 receipt writers, which the review demonstrated as MINOR-1 (`CF-AE-R-09`). Both are now pinned (AER-N05b/N08b/N13b, plus the renamed dogfood check), but the instrument gap itself is why a stage that claimed "every normal project read is about A and only A" shipped two unfenced named-id paths. | Extending the boundary dogfood (or adding a general "named foreign id on every surface" check) so a future surface cannot be added without the same probe. |
| **CF-AE-R-12** | cost (minor) | The new foreign-id guard costs one derived read when a caller NAMES the current project: the tool guard calls `(await workspace.view()).projectId` before any action (`src/tools/application_tools.ts:668`) and each HTTP read route calls the same through `projectReadSurface` (`src/application/http.ts:678`) — and `view()` composes the proof, reasoning, memory, campaign and external-bridge snapshots (`src/project_workspace/service.ts:425-455`). A request with NO `projectId` pays nothing (the helper only resolves the project when a non-empty id is supplied). | A client that passes `projectId` on every read route for compatibility, or a route added where the derived view is expensive. |

## 2. What the stage does NOT leave open

For completeness, the six items this stage closes are not carried here:

```text
CF-AE-16     CLOSED_IN_AE_R   journal enumeration + explicit foreign id
CF-AE-R-01   CLOSED_IN_AE_R   assets() enumeration (and every delegating surface)
CF-AE-R-02   CLOSED_IN_AE_R   bridge resolve(foreignId)
CF-AE-R-03   CLOSED_IN_AE_R   agent tool read actions silently dropped a foreign projectId
CF-AE-R-09   CLOSED_IN_AE_R   bridge phase-1 receipt writers unfenced (gate review MINOR-1)
CF-AE-R-10   CLOSED_IN_AE_R   project read routes / tool silently ignored a foreign projectId (gate review MINOR-2)
```

Evidence for each is in
`docs/engineering/audits/G10-AE-R-AE-CARRY-FORWARD-DISPOSITION.md` §§2-7.

## 3. Inherited carriers

No inherited id is closed by this stage. The stage is scope fences in the Project
Workspace, HTTP, agent-tool and External Asset planes; it touches no monitor,
management, concurrency, proof, reasoning or web-coverage path. Every inherited
trigger is unchanged and the held dispositions are not restated here to avoid a
drifting second copy.

## 4. Honest limitations

1. **Every open item above is deliberate or newly observed, not hidden.** The stage
   was scoped to isolation; each entry names why it is not closed here.
2. **AER-N17/PSI-A11 are not evidence of anything.** They are vacuous because the rig
   has no federation composition at all. `CF-AE-R-05` says so plainly; no document in
   this set may describe them as a proven bypass refusal.
3. **`CF-AE-R-11` is the uncomfortable one.** The stage's own audit instrument missed
   the two paths the independent review found. The fixes are pinned now, but the
   lesson — probe every surface with a NAMED foreign id, not only the parameterless
   form — is carried rather than assumed.
4. **`CF-AE-R-12` is a cost, not a defect.** It exists so the derived-read price of
   the guard is on record if a hot route is ever added.

## 5. Strategic freeze (spec §24)

```text
Palimpsest major-feature roadmap
-> stabilization / triggered carry-forward only
```

After G10-AE-R, Palimpsest does **not** automatically proceed to another major
feature. The series works on one major stage at a time, closes its invariants, and
carries real leftovers forward (spec §25). From here the roadmap accepts only
stabilization and triggered carry-forward work: an item moves only when its
concrete trigger fires, not because it appears on a list.

The next major build belongs in a NEW, SEPARATE repository and must NOT be
implemented inside Palimpsest:

```text
Personal Intellectual Asset System (PIAS)
first stage: PIAS-A0
  Stable Asset Kernel
+ Revisioned Typed Assets
+ Search / Exact Inspect
+ Palimpsest AE provider compatibility
```

That system remains the external asset OWNER. Palimpsest keeps the bridge built in
G10-AE (`src/external_assets/**`), whose reference/import/publication semantics
G10-AE-R deliberately did not change; it must not grow the asset library inside
this repository. Implementing PIAS inside Palimpsest is outside this stage's
authority and is explicitly not proposed by any item above.
