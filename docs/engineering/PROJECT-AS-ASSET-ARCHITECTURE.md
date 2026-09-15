# G10-V — Project-as-Asset Architecture

Status: implemented product surface. Scope: `src/project_workspace/**`,
`src/project_management/**`, `src/install.ts`, `src/application/{surface,http}.ts`,
`src/tools/application_tools.ts`, `src/cli.ts`, `src/deployment/*`.

```
ProjectWorkspace ≠ CanonicalStore        ProjectAssetAssociation ≠ AssetContent
OpenLoop ≠ WorkTask                      Opportunity ≠ Task
View ≠ Truth                             NegativeResult grants no truth
Association ≠ Truth                      Association ≠ Publication
Associated ≠ Owned                       Recorded ≠ Evaluated
Explicit promotion, never automatic
```

## 1. The claim in one paragraph

A **project** is a first-class owner of *links* to the intellectual assets produced
under it, without ever becoming a second copy of the canonical truth about those
assets. `ProjectWorkspaceView` is a **derived, read-only, deep-frozen read model**
assembled on demand from the existing canonical owner matrix plus exactly two new
narrowly-owned, append-only histories (asset associations and project journal). It
owns no copied fact, keeps no second history of any asset, and never fabricates a
source it was not explicitly given: a plane that is not configured produces a
`knowledgeWarnings` entry, never a guessed value.

## 2. Canonical owner matrix (who owns what)

The workspace is a *re-arrangement* of facts owned elsewhere. Nothing in this layer
becomes the owner of the facts in the right-hand column.

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

Because proof / experiment / reasoning-cell assets are **global**, they are never
rendered as "this project's assets" merely because they exist. They appear only when
an `ASSET_ASSOCIATED` record explicitly links an opaque canonical reference to the
project, and the derived proof/reasoning/memory snapshots are read through injected
**read-only ports**, not stores.

## 3. The two new narrowly-owned stores (and why they copy no truth)

Only two new stores exist. Both own semantics that had **no owner before**; neither
duplicates a fact that another store already owns.

### 3.1 `ProjectAssetAssociation` — `src/project_workspace/association.ts`

- Records *only* that a project is linked to an existing canonical asset by an
  **opaque canonical reference** `{kind, id, digest?}` (`CanonicalAssetRef`) plus an
  `assetKind` (`PROJECT_ASSET_KINDS`: `DECISION`, `PRODUCED_ARTIFACT`, `PROOF_CLAIM`,
  `EXPERIMENT`, `JOURNAL_ENTRY`, `CAMPAIGN`, `REASONING_CELL`), an `associationKind`
  (`ASSOCIATION_KINDS`: `MANUAL`, `DERIVED_FROM_WORK`, `PUBLISHED`) and a provenance
  string.
- It **never** stores the asset content, never copies a second history, and never
  grants the asset any truth or authority: the canonical owner stays the owner.
  `Associated ≠ Owned`, `Recorded ≠ Evaluated`.
- Each project owns ONE chained event stream: the first event of a scope is its
  `PROJECT_WORKSPACE_OPENED` definition, then `ASSET_ASSOCIATED` records. The store
  owns persistence, ordering, idempotency (content-addressed `pwe-…` event ids), the
  chain digest and CAS-bounded `appendAtomic` using `ProjectWorkspaceBasis` — nothing
  else.

### 3.2 `ProjectJournal` — `src/project_workspace/journal.ts`

- The append-only place for project knowledge that has **no other canonical owner**.
  The kind enum STRUCTURALLY excludes `PROOF` / `DECISION` / `TASK` / `EXPERIMENT` /
  `COMMITMENT` / `BOUNDARY` / `SOURCE`: `PROJECT_JOURNAL_KINDS` is exactly `IDEA`,
  `OPEN_QUESTION`, `NEGATIVE_RESULT`, `OPPORTUNITY`, `REFERENCE_NOTE`. Those other
  facts may only be *referenced* (`relatedRefs`, kind/id only) or *associated*.
- A resolution is a **NEW event** (`JOURNAL_ENTRY_RESOLVED`) that references the entry
  id — never an in-place edit (`Resolution ≠ Erasure`). `NEGATIVE_RESULT` records a
  failed direction and grants no truth to its negation.
- Note the structural mismatch between the store scope and truth: the journal is a
  per-project *chain*, but a journal entry is knowledge, not truth (`Journal ≠
  Evidence`, `Opportunity ≠ Task`).

Association and journal are the *only* histories this vertical owns. Everything else
is read.

## 4. The derived view and the service

### 4.1 `buildProjectWorkspaceView` — `src/project_workspace/view.ts`

Pure and total. It takes a `ProjectWorkspaceViewSources` whose operands may be
`undefined`; `undefined` means "this plane is not configured", which is a distinct
fact from "empty". The result is a `ProjectWorkspaceView`:

- `project` — goal, revision, digest, head commit, requirements, decisions (re-arranged
  from `ProjectIr`).
- `work` — scheduler state, tasks, attempts, evidence, promotions, `resume`, blockers
  (re-arranged from `controller.status()` / `graph`).
- `assets` — the association records plus `byKind` counts.
- `openLoops` — a **derived prompt to look**, NEVER a work task. `OpenLoopKind` ∈
  `BLOCKED_WORK`, `READY_WORK`, `CAMPAIGN_WATCH`, `REASONING_UNRESOLVED`,
  `STALE_PROOF`, `PENDING_COMMITMENT`, `PENDING_BOUNDARY_DECISION`,
  `JOURNAL_OPEN_QUESTION`, `JOURNAL_OPPORTUNITY`. An open loop carries no authority
  and creates no task.
- `relations` — campaign-linked project refs (read-only).
- `historySummary` — a merged, time-ordered summary of associations + journal events.
- `knowledgeWarnings` — one entry per plane that is absent or inconsistent (for
  example `"proof plane not configured: proof claims cannot be read or associate"`,
  or `"associated proof claim <id> is not available on the proof plane"`).

### 4.2 `makeProjectWorkspaceService` — `src/project_workspace/service.ts`

Composes the derived view and owns exactly three mutation paths:

1. the association store it was given,
2. the journal store it was given,
3. `controller.plan(...)` for `ProjectIr` changes.

`appendDecision` composes the NEXT full `decisions` array and submits it through the
existing `ProjectIr` validation and revision lineage — there is no new decision store.
A `supersedes` pointer is recorded on the NEW decision (append-only lineage, at most
one successor per decision). `promoteOpportunity` is an **explicit** conversion of a
journal `OPPORTUNITY` into a task: the task graph is validated by `controller.plan`
FIRST, so a failed plan never records a false `PROMOTED` resolution. Nothing is ever
promoted automatically.

The injected ports are read-only by construction: `ProjectWorkspaceProofPort`
(`publishedClaims` + `assetView`), `ProjectWorkspaceMemoryPort` (`evaluations`),
`ProjectWorkspaceCampaignPort` (`projectRefs`). No port exposes a mutation of another
subsystem.

## 5. Product wiring

`installPalimpsest` gains three additive options:

- `projectAssociationStore?: SqliteProjectAssetAssociationStore`
- `projectJournalStore?: SqliteProjectJournalStore`
- `managementPreferenceStore?: SqliteManagementPreferenceStore`

The workspace service is built **whenever it has at least one truthful source** — an
association store, a journal store, or a proof store — and its memory/campaign ports
are attached only when `organizationMemoryStore` / a Campaign store exist. The
in-memory default for the management control degrades to `DIRECT` (see
`MANAGEMENT-AUTONOMY-MODEL.md`).

`InstalledPalimpsest` exposes `projectWorkspace?` and `projectManagement?`; the
association/journal/management stores are closed in `dispose()` **only when this
install was given them**. Both surfaces are passed into
`makePalimpsestApplicationSurface` and included in `hasAdvancedSurface`.

The application surface (`ProjectWorkspaceApplicationSurface`) exposes `view`,
`assets`, `openLoops`, `history`, `journal`, `associateAsset`, `recordJournalEntry`,
`resolveJournalEntry`, `appendDecision`, `promoteOpportunity`. The HTTP routes are
namespaced under `/api/project/**` and `/api/manage/**`; the agent tools are
`palimpsest_project` and `palimpsest_manage` (`src/tools/application_tools.ts`). The
CLI exposes operator control only through `palimpsest manage
<DIRECT|ASSIST|MANAGE|DELEGATE>`.

The deployment profile lists the store paths under `databases`
(`projectAssociations`, `projectJournal`, `management`), so `serve --profile` can
enable the surfaces; the launcher creates the stores and `installed.dispose()` closes
them.

## 6. The external Personal Asset System boundary

Everything above is **one project** (or explicitly collaborating projects). The
workspace deliberately does not attempt cross-project, personal-intellectual-asset
knowledge. That is a *future, separate* system, described in
`PERSONAL-ASSET-SYSTEM-BOUNDARY.md`.

The only seam Palimpsest will ever describe toward that system is an
`ExternalAssetLibraryPort`. It is a boundary contract, **not implemented anywhere in
this codebase** — there is no type, no store, no route and no tool for it. Its only
allowed operations are:

- `search` — query the external personal library for candidate stable references.
- `inspect` — read an external reference's metadata (never to index it).
- `prepareImport` — materialize an import *proposal* for an explicit user/operator act.
- `preparePublication` — materialize a publication *proposal* for an explicit act.

Each operation is proposal-shaped and explicit: Palimpsest must never auto-index
outside the project, must never crawl a personal library, and must never treat an
external reference as owned truth. The personal database stays **outside** Palimpsest;
only opaque, stable references cross the boundary, and only on an explicit act.

## 7. Invariants

1. No copied fact; no second history of any asset.
2. `undefined` source ⇒ a `knowledgeWarnings` entry, never a guessed empty value.
3. Open loops are derived prompts, never tasks.
4. Promotion and decision appends are explicit and go through existing ProjectIR
   validation and revision lineage.
5. The workspace never mutates another subsystem's store.
6. The external personal-asset boundary is described, not implemented; no auto-index.
