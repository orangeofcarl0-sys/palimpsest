# G10-AE-R — AE carry-forward disposition

Every `CF-AE-*` item from `docs/engineering/audits/G10-AE-CARRY-FORWARD.md` is
disposed below against what G10-AE-R actually delivered, plus the new items this
stage raised about its own defect space (including the two the gate review found).
Nothing is silently dropped.

```text
Rule applied here: an item is CLOSED only when a delivered artefact makes its
trigger impossible, and the closure can point at code AND a test.
```

**Result up front:** G10-AE-R closes exactly the items in its own defect space —
`CF-AE-16` (the reported journal enumeration), `CF-AE-R-01` (the assets
enumeration), `CF-AE-R-02` (the bridge `resolve` hole), `CF-AE-R-03` (the agent
tool's silent foreign-id ignore), `CF-AE-R-09` (the unfenced bridge phase-1 receipt
writers) and `CF-AE-R-10` (the silent foreign-id ignore on the project read routes
and the agent tool). Every other AE item is unrelated to scope isolation and stays
trigger-driven and unchanged: the stage touches no import, no publication, no
provider registry, no watcher, no applicability relation and no cross-project asset
relation.

## 1. Closed by G10-AE-R

| ID | Disposition | Evidence |
| --- | --- | --- |
| **CF-AE-16** — `GET /api/project/journal` without `projectId` reads every scope in the journal store | **CLOSED_IN_AE_R** | §2 |
| **CF-AE-R-01** — `assets()` (and every surface delegating to it) enumerated every scope in the association store | **CLOSED_IN_AE_R** | §3 |
| **CF-AE-R-02** — the bridge's `resolve(projectId)` resolved a foreign project's associations from a shared store | **CLOSED_IN_AE_R** | §4 |
| **CF-AE-R-03** — the agent tool's read actions silently dropped a supplied foreign `projectId` and answered with the installed project | **CLOSED_IN_AE_R** | §5 (gate review MINOR-2) |
| **CF-AE-R-09** — the bridge's phase-1 receipt writers (`beginImport`, `beginPublication`) appended a foreign project's durable receipt to a shared bridge store | **CLOSED_IN_AE_R** | §6 (gate review MINOR-1) |
| **CF-AE-R-10** — the project read routes and the agent tool answered 200 / an answer for the installed project while silently ignoring a foreign `projectId` | **CLOSED_IN_AE_R** | §7 (gate review MINOR-2) |

## 2. CF-AE-16 — the journal route

| Element | Value |
| --- | --- |
| Route | `GET /api/project/journal` (`src/application/http.ts:704-708`) — `query.get("projectId")`, `null`/empty mapped to `undefined` |
| Service (baseline) | `workspace.journal(undefined)` took `projectId === undefined ? await store.projects() : [projectId]` and concatenated every scope (`G10-AE-CARRY-FORWARD.md` §1 cites the baseline at `src/project_workspace/service.ts:445-454`) |
| Service (now) | `src/project_workspace/service.ts:472-485`: `undefined` → `controller.projectId`; an explicit different id → `assertScopedProject` throws `invalid_registration` before the store check |
| Reproduction | `scripts/scope/aer0-repro.mjs` case **A** (leaked `B-SECRET-TITLE`/`B-SECRET-BODY`; now A-only) and case **B** (`?projectId=project-B` returned B; now HTTP 400). Baseline printed `7/8 surfaces leak project-B`, now `0/8` |
| Tests | AER-N02 (`:307`), AER-N03 (`:316`), AER-N06 (`:384`), AER-N07 (`:392`); dogfood `service_journal_foreign_fails_closed`, `http_journal_foreign_fails_closed`, `http_journal_foreign_leaks_nothing` |
| Why this is a real closure | the route's only scope input is `projectId`, and the service now makes that input either the current project or a typed failure. There is no remaining path by which an A-bound installation lists B's journal entries. |

## 3. CF-AE-R-01 — the assets path (NEW, found by the AER0 audit)

| Element | Value |
| --- | --- |
| Finding | `workspace.assets()` iterated `associationStore.projects()` and concatenated every scope, so every surface delegating to it inherited the leak: `GET /api/project/assets`, `palimpsest_project action=assets`, and the Web view that consumes them |
| Found by | this stage's mandatory AER0 audit (spec §2, §3 case C/D/F); "do not assume CF-AE-16 is the only occurrence" — it was not |
| Baseline code | `assets()` was `for (const projectId of await store.projects())` (baseline line cited in the assessment §3) |
| Service (now) | `src/project_workspace/service.ts:466-470`: `associatedAssetsOf(await store.replay(controller.projectId))`; no `.projects()` call remains in the façade |
| Reproduction | `scripts/scope/aer0-repro.mjs` case **C** (HTTP assets leaked `art-b`), case **D** (the agent tool returned B), case **F** (`workspace.assets()` returned two projects' associations) |
| Tests | AER-N01 (`:281`, including the structural assertion at `:300-304` that `src/project_workspace/service.ts` contains no `.projects()` call), AER-N05 (`:376`), AER-N08 (`:437`); dogfood `service_assets_is_A_only`, `http_assets_is_A_only`, `agent_tool_assets_is_A_only` |
| Adjacent surface | `projectScopedAssets(projectId)` had the same shape; it is now fenced rather than left as an arbitrary-id escape hatch (`service.ts:487-497`; AER-N04; `test/v_project_workspace.test.ts:869-875`) |

## 4. CF-AE-R-02 — the bridge `resolve` hole (NEW, found while fixing the first two)

| Element | Value |
| --- | --- |
| Finding | `ExternalAssetBridgeService.resolve(projectId)` accepted ANY explicit id and read that scope's `EXTERNAL_ASSET` associations from the shared store. This is spec §22's partial condition *"external bridge can resolve foreign associations"* verbatim |
| Route to it | none over HTTP — AER-N12b asserts `/api/external-assets/resolve` is not a route; the reachable path was a direct caller of `installed.externalAssets.resolve(...)`, which the Project Workspace also uses as a read-only port (`src/install.ts:1690-1701`) |
| Found by | this stage, while auditing the one external-asset read that feeds the workspace's external section (assessment §7); AE had fenced the write/prepare paths (the AE gate review's R-03) but not this read |
| Baseline reproduction | standalone probe against the pre-fix build with a shared association store: `resolve("project-B")` while only project-A was held returned `1` B reference — `LEAK: a project-A installation resolved project-B's external association` |
| Service (now) | `src/external_assets/service.ts:1178-1192`: `resolve` requires `basisOf(projectId) !== undefined` and otherwise throws `unknown_project`. The basis port is controller-bound in the installation: `projectBasisOf` returns `undefined` for any id that is not `controller.projectId` (`src/install.ts:1908-1919`), so "held" means "this installation's project", not merely "present in the ProjectIR store" |
| Tests | AER-N12b (`test/aer_scope_isolation.test.ts:567`); boundary dogfood `external_resolve_refuses_a_project_the_deployment_does_not_hold`; the AE dogfood check `no_foreign_project_is_scanned_or_invented` was changed from "empty view with a warning" to the typed refusal, in-file justified (`scripts/external_assets/ae-dogfood.mjs:847-870`) |
| Why the AE dogfood changed | the old assertion encoded the "return an empty list and hide the violation" shape spec §15 forbids. The property it protected (no global scan, no invented library) is still asserted by the per-association inspection count in the same script |
| No AE semantic change | the bridge's reference / import / publication behaviour is untouched; only its derived read gained the basis fence |

## 5. CF-AE-R-03 — the agent tool's silent foreign-id ignore (CLOSED_IN_AE_R)

| Element | Value |
| --- | --- |
| Finding | The `palimpsest_project` tool declares one shared `extraProperties.projectId` (`src/tools/application_tools.ts:644`), but the READ actions (`overview`, `assets`, `open_loops`, `history`) dropped it and answered with the installed project's data, so a caller naming project-B could not tell the scope had been ignored |
| Found by | this stage's own audit (recorded here before the gate review), because it is the "hide the violation" shape spec §15 forbids; the review then DEMONSTRATED it as MINOR-2 |
| Tool (now) | `src/tools/application_tools.ts:656-675`: the tool resolves the installation's project once (`:663-666`) and throws `ProjectWorkspaceError` / `invalid_registration` naming the requested project for ANY action given a foreign id (`:667-675`); the current id is still accepted |
| Tests | AER-N08b (`test/aer_scope_isolation.test.ts:447` — all four read actions reject; the current id still returns A); dogfood `agent_tool_with_foreign_id_is_refused_not_ignored` (renamed from the old "still A-only" check, `scripts/scope/aer-boundary-dogfood.mjs:349-364`) |

**Correction to an earlier claim in this document set.** A prior draft of the
carry-forward said the HTTP assets route "has no `projectId` parameter to ignore".
That is no longer true and was already incomplete: the route is reachable with a
`projectId` query parameter, and it now REFUSES a foreign one
(`src/application/http.ts:674-687`; AER-N05b). The correction is recorded here
rather than silently edited because the false statement was used to argue the item
was only a tool-side asymmetry.

## 6. CF-AE-R-09 — the unfenced bridge phase-1 receipt writers (CLOSED_IN_AE_R)

| Element | Value |
| --- | --- |
| Finding | `beginImport` and `beginPublication` wrote a durable phase-1 receipt (`EXTERNAL_IMPORT_PREPARED`, `EXTERNAL_PUBLICATION_PREPARED`) into the NAMED project's scope with no project-basis check. The review DEMONSTRATED that an installation bound to project-A could append project-B's `EXTERNAL_IMPORT_PREPARED` receipt to a shared bridge store |
| Severity framing | inert for READS (`commitImport` re-fences before materializing anything), but a real cross-scope durable WRITE on an unfenced writer, and spec §11 requires the fences kept on external import/publication |
| Found by | the independent gate review (MINOR-1) |
| Writers (now) | `src/external_assets/service.ts:757-772` (`beginImport`, fence at `:765-767`) and `:939-966` (`beginPublication`, fence at `:946-948`): both call `basisOf(parsed.projectId)` and fail with `unknown_project` before touching the bridge store. `approveAndPublish` already had the fence (`:976-978`) |
| Tests | AER-N13b (`test/aer_scope_isolation.test.ts:525`): rejects with `unknown_project`, the bridge row count is unchanged, and a raw `SELECT project_id FROM external_asset_bridge WHERE project_id = 'project-B'` returns `[]` |

## 7. CF-AE-R-10 — the silent foreign-`projectId` ignore (CLOSED_IN_AE_R)

| Element | Value |
| --- | --- |
| Finding | The project READ routes `/api/project/workspace`, `/assets`, `/open_loops`, `/history` answered HTTP 200 with the installed project's payload while silently ignoring `?projectId=<foreign>`. Together with `CF-AE-R-03` this was the same "named scope, ignored" shape on two surfaces |
| Found by | the independent gate review (MINOR-2), reported together with the tool half |
| HTTP (now) | `src/application/http.ts:666-687`: a shared `projectReadSurface` helper (`:674-687`) resolves the installed project and refuses a foreign `projectId` with `ProjectWorkspaceError` / `invalid_registration`; the four read routes use it (`:688-703`); the journal route keeps its own service fence (`:704-708`) |
| Tool half | see §5 (`application_tools.ts:656-675`) |
| Tests | AER-N05b (`test/aer_scope_isolation.test.ts:463` — non-200, body names the refused project, no foreign marker, current id returns 200) and AER-N08b (`:447`) |

## 8. Every remaining CF-AE-* item — trigger-driven, unchanged

All 11 remaining items are unrelated to Project Workspace scope isolation. G10-AE-R
adds no import, no publication, no provider registry, no watcher, no applicability
relation and no cross-project asset relation, so none of their triggers became
impossible. Disposition is `STILL_OPEN — DEFERRED` for each, with the trigger
reproduced verbatim from `G10-AE-CARRY-FORWARD.md` §1.

| ID | Kind | Disposition in AE-R | Trigger (unchanged) |
| --- | --- | --- | --- |
| CF-AE-01 | scope | STILL_OPEN — DEFERRED | A project that must bring a binary or large source INTO the project, with a storage/ownership design for the copy. |
| CF-AE-02 | scope | STILL_OPEN — DEFERRED | A legitimate need to cite an external source as PROOF evidence, WITH the proof plane's own admission design. |
| CF-AE-03 | scope | STILL_OPEN — DEFERRED | A justified need to disclose one of Work Evidence / Proof claims / Decisions / Attempts / Commitments / Boundary artifacts / verification runs, with a separate admission design per kind. |
| CF-AE-04 | ecosystem | STILL_OPEN — DEFERRED | A deployment with a REAL external library to connect, and a credential/host story for it. |
| CF-AE-05 | operability | STILL_OPEN — DEFERRED | An operator who wants to add or swap a provider without a code deployment, or a CLI/UI provider inventory. |
| CF-AE-06 | portability | STILL_OPEN — DEFERRED | External-provider-profile portability, or multi-machine operation of one project. |
| CF-AE-07 | correctness/boundary | CLOSED_IN_AE, held | — (the digest requirement is structural for `EXTERNAL_ASSET` on both write and read path; pinned by `AE-N04 (artifact)`). AE-R does not reopen it. |
| CF-AE-08 | scope | STILL_OPEN — DEFERRED | A product need for a project to be NOTIFIED of a library change, which first needs a decision about what a notification may do. |
| CF-AE-09 | semantics | STILL_OPEN — DEFERRED | A product requirement for applicability-aware retrieval WITH a design that does not make a model's judgement a canonical relation. |
| CF-AE-10 | boundary | STILL_OPEN — DEFERRED (now adjacent to AE-R) | A concrete cross-project workflow, which is a boundary decision, not a read-model change. **Note:** AE-R closed the accidentally reachable cross-project reads/writes in the workspace and bridge planes; it did not add or remove any cross-project asset relation, and `EXT-A21` remains structural with no adversary that ATTEMPTS a read. |
| CF-AE-11 | evidence | CLOSED_IN_AE, held | — (the §38 dogfood runs against a separate process fixture). AE-R does not reopen it. |
| CF-AE-12 | surface/evidence | CLOSED_IN_AE, held | — (surface/HTTP/tool/web/e2e all exist and are pinned). AE-R's boundary dogfood is an additional surface proof, not a reopening. |
| CF-AE-13 | hygiene | STILL_OPEN — DEFERRED | A decision to prune the reserved `ExternalAssetErrorKind` union or to start throwing the reserved kinds. |
| CF-AE-14 | hygiene | CLOSED_IN_AE, held | — (one unused exported search-hit domain constant, removed in AE). |
| CF-AE-15 | operability | STILL_OPEN — DEFERRED | A project with many external references, or a consumer that calls `resolve` frequently. (AE-R adds one `basisOf` lookup to `resolve`; it changes no caching behaviour, so the trigger is unchanged.) |

No row above claims a closure that cannot be pointed at code or a test. Held-closed
items from an earlier sub-stage are reproduced, not re-litigated (matching the
discipline of `G10-AE-AD-CARRY-FORWARD-DISPOSITION.md` §3).

## 9. Inherited items from AD / AC-R / AC / AB / AA / W / X / Y / Z

G10-AE-R closes none of the 48 inherited ids. The stage is scope fences in the
Project Workspace, HTTP, agent-tool and External Asset planes; it touches no
monitor, management, concurrency, proof, reasoning or web-coverage path, so no
inherited trigger became impossible. The full table and each held disposition remain
in `docs/engineering/audits/G10-AE-AD-CARRY-FORWARD-DISPOSITION.md` and are not
restated here — restating them would invite a second, drifting copy.

```text
closed in AE-R            0 inherited ids
reassessed (unchanged)    none
still open — deferred     all 48 inherited ids, triggers unchanged
```

## 10. Honest limitations

1. The baseline reproductions for `CF-AE-16` and `CF-AE-R-01` live in one script
   (`scripts/scope/aer0-repro.mjs`) whose purpose is to print the baseline and then
   the fixed answer. Its exit code is 0 either way by design; the machine proof is
   the `0/8` line and the invariant suite, not the exit code.
2. `CF-AE-R-02`'s baseline reproduction was a standalone probe run against the
   pre-fix build with a shared store; it is recorded verbatim in the assessment §7
   rather than re-created as a permanent script, because the post-fix assertion
   (AER-N12b) is the durable artifact.
3. `CF-AE-R-09` and `CF-AE-R-10` were DEMONSTRATED by the independent gate review,
   not by this stage's own AER0 audit. The audit's instrument did not reach them:
   the route/tool checks in `scripts/scope/aer-boundary-dogfood.mjs` exercised the
   no-parameter form, and the phase-1 writers were not a read surface. That gap is
   itself recorded in `G10-AE-R-CARRY-FORWARD.md`.
4. The one live scope observation that AE-R does NOT close — `AER-N17`/`PSI-A11`
   being unproven because no federation surface is composed — is carried as
   `CF-AE-R-05`, not claimed here.
