# G10-V — Personal Asset System Boundary

Status: boundary definition. No part of the future Personal Asset System is implemented
in Palimpsest. This document fixes the ownership line so that neither side can absorb
the other later without an explicit, visible decision.

```
Palimpsest owns PROJECT truth           Personal Asset System owns PERSONAL assets
One project (or explicitly              Intellectual assets across projects,
collaborating projects)                 reuse, opportunity discovery
Crossing the line is an EXPLICIT act    Never an automatic index
```

## 1. What Palimpsest owns

Palimpsest owns everything about **one project** (plus the projects that explicitly
collaborate with it through federation/boundary/campaign mechanisms):

- the canonical owner matrix: `ProjectIr` / Work `EventStore` / `ProofEvidenceStore` /
  `OrganizationMemoryStore` / `CampaignStore` / `ReasoningCellStore` / Coordination /
  `BoundaryMemoryStore` / Organization + `RuntimeScope`;
- the **derived** project workspace read model over that matrix;
- the two narrowly-owned project histories: `ProjectAssetAssociation` (opaque
  canonical asset references) and `ProjectJournal` (ideas, open questions, negative
  results, opportunities, reference notes) — see
  `PROJECT-AS-ASSET-ARCHITECTURE.md`;
- the operator management preference and the bounded management autonomy layered over
  the project's governed services — see `MANAGEMENT-AUTONOMY-MODEL.md`.

Palimpsest is deliberately **project-bounded**. It has no cross-project asset
knowledge, no personal library, and no notion of "an asset that belongs to a person
rather than a project".

## 2. What the future Personal Asset System owns

A **separate** system (not in this repository, not imported by this repository) is
envisioned to own:

- a personal **intellectual asset database** spanning many projects and contexts;
- **cross-project reuse**: finding an asset produced under one project and reusing it
  under another;
- **opportunity discovery**: surfacing connections and possibilities across a person's
  work that no single project asked for.

This system is personal-scoped. It is **not** a canonical Palimpsest store, it is
**not** a Palimpsest subsystem, and it must never be reachable as one. Its data stays
outside Palimpsest.

## 3. The only allowed bridges

Exactly three kinds of explicit acts may cross the boundary. Each is initiated by the
operator/user, each is proposal- or reference-shaped, and none is automatic:

1. **Explicit import.** An external asset is brought into a project only through an
   explicit import act that materializes a proposal first. Palimpsest never pulls.
2. **Explicit reference.** A project may hold an opaque, stable reference to an
   external asset (the `CanonicalAssetRef` idiom: `kind` + `id` + optional digest).
   The reference is not the content and carries no truth or authority.
3. **Explicit publication.** An asset leaves Palimpsest only through an explicit
   publication act that materializes a proposal first. Publication is never implicit
   and never a sync.

Both directions carry **only stable refs**, never a copy of canonical truth and never
a hidden crawl.

The single seam Palimpsest will ever *describe* toward the Personal Asset System is
`ExternalAssetLibraryPort`, with only these operations:

- `search` — find candidate stable references in the personal library.
- `inspect` — read a reference's metadata (to decide, never to index).
- `prepareImport` — materialize an import proposal for an explicit act.
- `preparePublication` — materialize a publication proposal for an explicit act.

`ExternalAssetLibraryPort` is **described only**: it is not declared as a TypeScript
interface, not stored, not routed, and not exposed as a tool anywhere in
`src/**`. Any future implementation must remain proposal-shaped and explicit, exactly
like the existing publication/disclosure pattern
(`src/proof_asset/**`, `DisclosureApplicationSurface`).

## 4. Absolute prohibition: no auto-index outside the project

Palimpsest **must not** auto-index outside the project. Concretely:

- no filesystem crawl, no personal-library scan, no background import;
- no "discover related assets" that reads a store the operator did not point the
  workspace at;
- no treating a globally-existing asset (a proof claim, an experiment, a reasoning
  cell) as a project asset merely because it exists — those are linked only by an
  explicit `ASSET_ASSOCIATED` record;
- an absent/never-configured plane yields a `knowledgeWarnings` entry, never a
  guessed value.

The project workspace is honest precisely because it can only ever show what an
explicit association or an explicitly-configured read-only port provides.

## 5. Migration / handoff rule

If an asset moves from project scope to personal scope (or back), it does so through an
explicit import/publication proposal. The canonical owner on each side stays the owner
of its own record; the other side holds only an opaque stable reference. No store is
ever copied, mirrored, or double-written, and no automatic background reconciliation
is permitted.
